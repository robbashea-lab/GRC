"""Opt-in loopback-only real Mongo/TLS API checks; never a browser gate substitute.

Requires pre-existing user-owned Mongo binaries and encrypted localhost key.
No mocks, auth overrides, external provisioning or ambient database settings.
Credentials stay in memory; output contains only sanitized results and IDs.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import subprocess
import sys
import time
from urllib.parse import quote
import uuid

import bcrypt
import httpx
from pymongo import MongoClient


def run(args):
    root = Path(__file__).resolve().parents[2]
    for port in (27026, 8446):
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', port)) == 0:
                raise RuntimeError(f'Refusing to reuse existing loopback listener on {port}')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    data = output / 'data'
    data.mkdir()
    run_id = uuid.uuid4().hex[:12]
    db_name = 'staging_cis_pr24_' + run_id
    origin = 'https://localhost:8446'
    context = ssl.create_default_context(cafile=str(args.certificate.resolve()))
    password = secrets.token_urlsafe(32)
    mongo_password = secrets.token_urlsafe(32)
    mongo_admin_password = secrets.token_urlsafe(32)
    results = []
    children = {}
    logs = []
    env = {k: os.environ[k] for k in ('PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE') if k in os.environ}
    uri = 'mongodb://pr24runtime:' + quote(mongo_password) + '@127.0.0.1:27026/' + db_name + '?authSource=admin'
    env.update(APP_ENV='staging', MONGO_URL=uri, DB_NAME=db_name,
               JWT_SECRET=secrets.token_urlsafe(48), APP_BASE_URL=origin,
               CORS_ORIGINS=origin, REACT_APP_PREVIEW='false',
               ADMIN_EMAIL='pr24-owner@example.com', ADMIN_NAME='Synthetic PR24 Owner',
               ADMIN_PASSWORD_HASH=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
               PR24_CERT=str(args.certificate.resolve()), PR24_KEY=str(args.key.resolve()),
               PR24_KEY_PASSWORD=os.environ['PR24_KEY_PASSWORD'])

    def start_mongo():
        log = open(output / 'mongo-console.log', 'ab')
        logs.append(log)
        children['mongo'] = subprocess.Popen([str(args.mongod.resolve()), '--bind_ip', '127.0.0.1',
            '--port', '27026', '--auth', '--dbpath', str(data)], stdout=log, stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                with MongoClient('mongodb://127.0.0.1:27026', serverSelectionTimeoutMS=500) as c:
                    c.admin.command('ping')
                return
            except Exception:
                if children['mongo'].poll() is not None:
                    raise RuntimeError('Mongo process exited; inspect run-owned log locally')
                time.sleep(.2)
        raise RuntimeError('Mongo readiness timed out')

    def start_api():
        log = open(output / 'api.log', 'ab')
        logs.append(log)
        code = ("import os,uvicorn; uvicorn.run('server:app',host='127.0.0.1',port=8446,"
                "ssl_certfile=os.environ['PR24_CERT'],ssl_keyfile=os.environ['PR24_KEY'],"
                "ssl_keyfile_password=os.environ['PR24_KEY_PASSWORD'],log_level='warning')")
        children['api'] = subprocess.Popen([sys.executable, '-c', code], cwd=root / 'backend', env=env,
            stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                with httpx.Client(verify=context, trust_env=False) as client:
                    if client.get(origin + '/api/', timeout=1).status_code == 200:
                        return
            except httpx.TransportError:
                pass
            if children['api'].poll() is not None:
                raise RuntimeError('API exited; inspect run-owned log locally')
            time.sleep(.2)
        raise RuntimeError('Verified TLS API readiness timed out')

    def stop_api():
        child = children.pop('api', None)
        if child and child.poll() is None:
            child.terminate()
            child.wait(timeout=15)

    def stop_mongo():
        child = children.pop('mongo', None)
        if child and child.poll() is None:
            try:
                with MongoClient('mongodb://127.0.0.1:27026', username='pr24bootstrap',
                                 password=mongo_admin_password, authSource='admin') as admin:
                    admin.admin.command('shutdown', force=False)
            except Exception:
                pass  # Successful Mongo shutdown closes the initiating connection.
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.terminate()
                child.wait(timeout=15)

    def client_for(email):
        client = httpx.Client(base_url=origin + '/api', verify=context, trust_env=False, timeout=20,
                              headers={'Origin': origin})
        response = client.post('/auth/login', json={'email': email, 'password': password})
        assert response.status_code == 200, 'Normal login rejected: HTTP ' + str(response.status_code)
        cookie = response.headers.get('set-cookie', '').lower()
        assert all(flag in cookie for flag in ('secure', 'httponly', 'samesite=lax'))
        client.headers['Authorization'] = 'Bearer ' + response.json()['access_token']
        client.cookies.clear()  # Explicit bearer checks, not browser-cookie lifecycle evidence.
        return client, response.json()['user']

    def request(client, method, path, body=None, expected=200):
        if method == 'PATCH' and path.startswith('/framework_assessments/') and 'expected_last_assessed' not in body:
            snapshot = client.get(path)
            if snapshot.status_code == 200:
                body = {**body, 'expected_last_assessed': snapshot.json().get('last_saved') or snapshot.json().get('last_assessed')}
        headers = {'Idempotency-Key': str(uuid.uuid4())} if method == 'POST' else {}
        response = client.request(method, path, json=body, headers=headers) if body is not None else client.request(method, path, headers=headers)
        assert response.status_code == expected, f'{method} {path}: HTTP {response.status_code}, expected {expected}'
        return response.json()

    def check(name, fn):
        try:
            fn()
            results.append({'case': name, 'result': 'PASS'})
        except Exception as error:
            # Do not serialize credentials, response bodies or transport exceptions with URIs.
            results.append({'case': name, 'result': 'FAIL', 'error_type': type(error).__name__,
                            'detail': str(error) if isinstance(error, AssertionError) else 'Inspect locally; raw diagnostic omitted'})

    try:
        with MongoClient('mongodb://127.0.0.1:27026', serverSelectionTimeoutMS=300) as existing:
            try:
                existing.admin.command('ping')
            except Exception:
                pass
            else:
                raise RuntimeError('Refusing to use an existing Mongo listener')
        start_mongo()
        with MongoClient('mongodb://127.0.0.1:27026') as bootstrap:
            bootstrap.admin.command('createUser', 'pr24bootstrap', pwd=mongo_admin_password,
                                    roles=[{'role': 'root', 'db': 'admin'}])
        with MongoClient('mongodb://127.0.0.1:27026', username='pr24bootstrap', password=mongo_admin_password,
                         authSource='admin') as bootstrap:
            mongo_version = bootstrap.admin.command('buildInfo')['version']
            bootstrap.admin.command('createUser', 'pr24runtime', pwd=mongo_password,
                                    roles=[{'role': 'readWrite', 'db': db_name}])
        start_api()
        owner, owner_user = client_for('pr24-owner@example.com')
        results.append({'case': 'Normal TLS network API login / JWT authentication (not browser)', 'result': 'PASS'})
        clients = [request(owner, 'POST', '/clients', {'name': 'Synthetic PR24 ' + label + ' ' + run_id,
                    'environment': 'Test'}) for label in ('A', 'B')]
        a, b = [row['client_id'] for row in clients]
        people = {}
        for label, role, scope in [('writer', 'platform_admin', a), ('reader', 'client_readonly', a),
                                   ('foreign', 'platform_admin', b)]:
            people[label] = request(owner, 'POST', '/users', {'email': 'pr24-' + label + '@example.com',
                'name': 'Synthetic PR24 ' + label, 'role': role, 'client_ids': [scope], 'password': password})['user']
        catalog = json.loads((root / 'shared/catalogs/onboardingCatalog.json').read_text(encoding='utf-8'))
        def baseline(cid):
            current = request(owner, 'GET', '/onboarding/baseline?client_id=' + cid)
            return {'client_id': cid, 'finalize': True, 'expected_records': current['record_versions'],
                'expected_updated_at': current['state'].get('updated_at'), 'state': {'version': 3, 'step': 3,
                'policies': {p['key']: 'unsure' for p in catalog['policies']},
                'requirements': {r['key']: 'applies' if r['key'] == 'cis-ig1' else 'does_not_apply' for r in catalog['requirements']},
                'reviews': [], 'framework_reviews': {
                    'account-authorization': {'recurrence': 'annual', 'due_date': '2026-12-01'}}}}
        for cid in (a, b):
            request(owner, 'POST', '/onboarding/baseline', baseline(cid))
        workspace = request(owner, 'GET', '/frameworks/cis-ig1?client_id=' + a)
        rows = {r['definition_id']: r for r in workspace['assessments']}
        base = '/framework_assessments/' + rows['1.1']['framework_assessment_id']
        foreign_row = request(owner, 'GET', '/frameworks/cis-ig1?client_id=' + b)['assessments'][0]
        foreign_base = '/framework_assessments/' + foreign_row['framework_assessment_id']
        foreign_evidence = request(owner, 'POST', '/evidence', {'client_id': b,
            'linked_type': 'framework_assessment', 'linked_id': foreign_row['framework_assessment_id'],
            'filename': 'synthetic-foreign.txt', 'mime_type': 'text/plain', 'content_base64': 'eA=='})
        writer, _ = client_for('pr24-writer@example.com')
        reader, _ = client_for('pr24-reader@example.com')
        def cookie_origin():
            with httpx.Client(base_url=origin + '/api', verify=context, trust_env=False) as cookie_client:
                request(cookie_client, 'POST', '/auth/login', {'email': 'pr24-writer@example.com', 'password': password})
                before = request(cookie_client, 'GET', base)
                request(cookie_client, 'PATCH', base, {'notes': 'Must not be written'}, expected=403)
                cookie_client.headers['Origin'] = 'https://unauthorized.example.com'
                request(cookie_client, 'PATCH', base, {'notes': 'Must not be written'}, expected=403)
                assert request(cookie_client, 'GET', base) == before
                cookie_client.headers['Origin'] = origin
                saved = request(cookie_client, 'PATCH', base, {'notes': 'Synthetic trusted Origin write'})
                assert saved['notes'] == 'Synthetic trusted Origin write'
        check('API secure cookie / missing and foreign Origin denial / trusted Origin allow (not browser)', cookie_origin)
        def legacy():
            original = request(writer, 'GET', base)
            assert 'cis_operation' not in original
            saved = request(writer, 'PATCH', base, {'notes': 'Synthetic retained legacy note'})
            assert saved['status'] == original['status'] and saved['notes'] == 'Synthetic retained legacy note'
        check('Legacy field absent: read and unrelated save', legacy)
        implementation = 'Synthetic provider reconciliation with internal accountable owner'
        def arrangements():
            saved = request(writer, 'PATCH', base, {'owner_id': people['writer']['user_id'],
                'implementation': implementation, 'cis_operation': {'provider': 'Synthetic provider', 'confirmed': True}})
            assert saved['status'] == 'not_assessed' and saved.get('verification') is None
            before = saved['assessment_history']
            saved = request(writer, 'PATCH', base, {'status': 'in_progress', 'verification': 'needs_validation'})
            assert saved['cis_operation']['confirmed'] and saved['assessment_history'][:len(before)] == before
            assert request(writer, 'GET', base)['implementation'] == implementation
        check('CIS arrangement / independent implementation and verification / history', arrangements)
        payload = ('Synthetic PR24 file ' + run_id).encode()
        digest = hashlib.sha256(payload).hexdigest()
        evidence = request(writer, 'POST', '/evidence', {'client_id': a, 'linked_type': 'framework_assessment',
            'linked_id': rows['1.1']['framework_assessment_id'], 'filename': 'synthetic-pr24.txt',
            'mime_type': 'text/plain', 'content_base64': base64.b64encode(payload).decode()})
        download = '/evidence/' + evidence['evidence_id'] + '/download'
        request(writer, 'POST', base + '/links', {'kind': 'evidence', 'id': evidence['evidence_id']})
        def file_check(client):
            retrieved = base64.b64decode(request(client, 'GET', download)['content_base64'], validate=True)
            assert retrieved == payload and hashlib.sha256(retrieved).hexdigest() == digest
            assert evidence['sha256'] == digest and evidence['size'] == len(payload)
        check('Actual uploaded content retrieval and metadata hashes', lambda: file_check(writer))
        rid = rows['1.1']['related_links'][0]['id']
        def related():
            links = request(writer, 'GET', base + '/related')
            assert evidence['evidence_id'] in [e['evidence_id'] for e in links['evidence']]
            assert rid in [r['review_id'] for r in links['reviews']]
        check('Review / Evidence relationships', related)
        review = request(owner, 'GET', '/reviews/' + rid)
        request(owner, 'PATCH', '/reviews/' + rid, {'expected_updated_at': review.get('updated_at'),
            'scope': 'Synthetic client-written scope retained', 'due_date': '2026-12-01'})
        review = request(owner, 'GET', '/reviews/' + rid)
        request(owner, 'POST', '/reviews/' + rid + '/complete', {'occurrence_id': review['current_occurrence_id'],
            'conclusion': 'Synthetic completed conclusion retained', 'completion_notes': 'Synthetic historical description',
            'no_evidence_reason': 'Synthetic lifecycle probe; not a client compliance assertion', 'checklist_confirmed': True})
        history = request(owner, 'GET', '/reviews/' + rid + '/history')
        baseline_review = request(owner, 'GET', '/reviews/' + rid)
        def preservation():
            request(owner, 'POST', '/onboarding/baseline', baseline(a))
            after = request(owner, 'GET', '/reviews/' + rid)
            for field in ('scope', 'due_date', 'recurrence', 'current_occurrence_id'):
                assert after.get(field) == baseline_review.get(field), field
            assert request(owner, 'GET', '/reviews/' + rid + '/history') == history
            assert history[0]['conclusion'] == 'Synthetic completed conclusion retained'
            related()
        check('Historical Review conclusion / custom scope / recurrence / reconfiguration', preservation)
        def boundaries():
            for role in (writer, reader):
                request(role, 'GET', foreign_base, expected=403)
                request(role, 'PATCH', foreign_base, {'cis_operation': {'confirmed': False}}, expected=403)
                request(role, 'GET', '/frameworks/cis-ig1?client_id=' + b, expected=403)
                request(role, 'GET', '/evidence/' + foreign_evidence['evidence_id'] + '/download', expected=403)
                foreign_review = foreign_row['related_links'][0]['id']
                request(role, 'GET', '/reviews/' + foreign_review, expected=403)
            foreign, _ = client_for('pr24-foreign@example.com')
            request(foreign, 'GET', download, expected=403)
            request(foreign, 'GET', '/reviews/' + rid, expected=403)
            foreign.close()
        check('Cross-client assessment / workspace / Review / file denial', boundaries)
        def readonly():
            before = request(reader, 'GET', base)
            request(reader, 'PATCH', base, {'cis_operation': {'confirmed': False}}, expected=403)
            request(reader, 'PATCH', base, {'status': 'needs_attention', 'verification': 'gap_identified',
                'implementation': 'Unauthorized overwrite'}, expected=403)
            request(reader, 'POST', base + '/links', {'kind': 'evidence', 'id': evidence['evidence_id']}, expected=403)
            request(reader, 'DELETE', base + '/links', {'kind': 'evidence', 'id': evidence['evidence_id']}, expected=403)
            request(reader, 'POST', '/evidence', {'client_id': a, 'filename': 'denied.txt', 'content_base64': 'eA=='}, expected=403)
            file_check(reader)
            assert request(reader, 'GET', base) == before
        check('Read-only mutations denied; authorized file read allowed', readonly)
        with httpx.Client(base_url=origin + '/api', verify=context, trust_env=False) as anonymous:
            check('Unauthenticated file retrieval denied', lambda: request(anonymous, 'GET', download, expected=401))
            check('Demo backend entry rejected', lambda: request(anonymous, 'POST', '/demo/enter', {}, expected=404))
        def restarting(database=False):
            before = request(writer, 'GET', base)
            stop_api()
            if database:
                stop_mongo()
                start_mongo()
            start_api()
            fresh, _ = client_for('pr24-writer@example.com')
            assert request(fresh, 'GET', base) == before
            file_check(fresh)
            assert request(fresh, 'GET', '/reviews/' + rid + '/history') == history
            after_review = request(fresh, 'GET', '/reviews/' + rid)
            for field in ('scope', 'due_date', 'recurrence', 'current_occurrence_id'):
                assert after_review.get(field) == baseline_review.get(field), field
            fresh.close()
        check('Backend restart: fresh normal login / actual file bytes / state / history', restarting)
        check('Mongo process restart, same directory: fresh login / actual bytes / state / history', lambda: restarting(True))
        def outage_retry():
            before = request(writer, 'GET', base)
            draft = {'notes': 'Synthetic API retry retained payload', 'expected_last_assessed': before.get('last_saved') or before.get('last_assessed')}
            stop_api()
            try:
                writer.patch(base, json=draft)
            except httpx.TransportError:
                pass
            else:
                raise AssertionError('Offline API unexpectedly accepted mutation')
            start_api()
            assert request(writer, 'GET', base) == before
            saved = request(writer, 'PATCH', base, draft)
            assert saved['notes'] == draft['notes']
            assert len(saved['assessment_history']) == len(before['assessment_history']) + 1
        check('Backend-only outage: unchanged record and coherent retry (not UI draft retention)', outage_retry)
        check('Stale assessment snapshot rejected', lambda: request(writer, 'PATCH', base,
            {'notes': 'Must not overwrite', 'expected_last_assessed': '2000-01-01T00:00:00+00:00'}, expected=409))
        for c in (owner, writer, reader):
            c.close()
        summary = {'scope': 'backend/database-only; no browser gate closed', 'database': db_name,
            'origin': origin, 'mongo_version': mongo_version, 'client_ids': [a, b],
            'uploaded_sha256': digest, 'results': results}
    finally:
        stop_api()
        stop_mongo()
        for log in logs:
            log.close()
        if 'summary' not in locals():
            summary = {'scope': 'backend/database-only', 'database': db_name,
                'results': results, 'prerequisite_failure': True}
        (output / 'results.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
        print(json.dumps(summary, indent=2))
    return 1 if summary.get('prerequisite_failure') or any(r['result'] == 'FAIL' for r in results) else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongod', type=Path, required=True)
    parser.add_argument('--certificate', type=Path, required=True)
    parser.add_argument('--key', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    raise SystemExit(run(parser.parse_args()))
