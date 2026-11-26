"""Exercise native authentication and linked CIS inventory work against a fresh local MongoDB.

Run with the backend dependencies installed: python scripts/qa_native_inventory.py /path/to/mongod
The application runs through its complete ASGI router, using cookies and its own startup and shutdown.
"""
import argparse
import asyncio
import base64
import hashlib
import logging
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from datetime import date, timedelta
from urllib.parse import urlsplit

import httpx
from pymongo import MongoClient
from pymongo.errors import AutoReconnect, ServerSelectionTimeoutError


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://qa-inventory.localhost'
sys.path.insert(0, str(ROOT / 'backend'))


SCOPES = (
    ('CIS IG1', 'cis-ig1', {'implementation_group': 1}, 56),
    ('CIS IG2', 'cis-ig1', {'implementation_group': 2}, 130),
    ('CIS IG3', 'cis-ig1', {'implementation_group': 3}, 153),
    ('ISO 27001', 'iso-27001', {}, 123),
    ('SOC 2', 'soc-2', {}, 33),
    ('HIPAA', 'hipaa', {}, 81),
    ('NIST CSF 2.0', 'nist-csf-2', {}, 106),
    ('CMMC Level 1', 'cmmc', {'level': 1}, 17),
    ('CMMC Level 2', 'cmmc', {'level': 2}, 110),
)


async def enroll(get, post, client_id, settings, *, review_choices=None):
    baseline = await get('/onboarding/baseline', client_id=client_id)
    catalog = baseline['catalog']
    await post('/onboarding/baseline', {
        'client_id': client_id, 'finalize': True,
        'expected_updated_at': baseline['state'].get('updated_at'),
        'expected_records': baseline['record_versions'],
        'state': {
            'version': 3, 'step': 3, 'framework_settings': {k: v for k, v in settings.items() if v},
            'policies': {p['key']: 'unsure' for p in catalog['policies']},
            'requirements': {p['key']: ('applies' if p['key'] in settings else 'does_not_apply') for p in catalog['requirements']},
            'reviews': [], 'framework_reviews': review_choices or {},
        },
    })


async def check_enrollment_matrix(get, post, call, owner, reauthenticate):
    cases = [(label, [(label, key, settings, count)]) for label, key, settings, count in SCOPES]
    cases.append(('Multi-framework', [SCOPES[i] for i in (2, 3, 4, 5, 6, 8)]))
    retained = []
    for label, programs in cases:
        cid = (await post('/clients', {'name': 'Synthetic ' + label}))['client_id']
        await enroll(get, post, cid, {key: settings for _, key, settings, _ in programs})

        async def counts():
            overview = await get('/portfolio/reporting/overview', client_ids=cid)
            assert [c['client_id'] for c in overview['clients']] == [cid]
            positions = {p['framework_key']: p for p in overview['programs']}
            assert set(positions) == {p[1] for p in programs}
            return {key: {r['key']: r['count'] for r in p['current']['counts']} for key, p in positions.items()}

        before = await counts()
        assert all(c['addressed'] == 0 for c in before.values())
        for program_label, key, settings, count in programs:
            workspace = await get('/frameworks/' + key, client_id=cid)
            rows = workspace['assessments']
            assert len(rows) == count, (label, key, len(rows), count)
            assert len({r['framework_assessment_id'] for r in rows}) == count
            assert {r['client_id'] for r in rows} == {cid}
            assert all(workspace['configuration'].get(k) == v for k, v in settings.items())
            row = next(r for r in rows if key != 'iso-27001' or r['definition_id'] == '4.1')
            record = '/framework_assessments/' + row['framework_assessment_id']
            narrative = f'Synthetic assessment recorded for {label}, {program_label}.'
            body = {'status': 'addressed', 'implementation': narrative,
                    'expected_last_assessed': row.get('last_saved') or row.get('last_assessed')}
            saved = await call('PATCH', record, json=body)
            history = saved['assessment_history']
            assert saved['assessed_by'] == owner and history[:-1] == row['assessment_history'], (label, key)
            assert len(history) == len(row['assessment_history']) + 1
            assert (history[-1]['status'], history[-1]['implementation'], history[-1]['by']) == ('addressed', narrative, owner)
            saved_again = await get(record)
            assert saved_again['implementation'] == narrative and saved_again['status'] == 'addressed'
            sample = f'Synthetic evidence for {label}, {program_label}.'.encode()
            evidence = await post('/evidence', {
                'client_id': cid, 'filename': 'assessment-scope.txt', 'mime_type': 'text/plain',
                'content_base64': base64.b64encode(sample).decode('ascii'),
                'linked_type': 'framework_assessment', 'linked_id': row['framework_assessment_id'],
            })
            assert evidence['sha256'] == hashlib.sha256(sample).hexdigest()
            after = await counts()
            assert after[key]['addressed'] == before[key]['addressed'] + 1
            assert after[key]['not_assessed'] == before[key]['not_assessed'] - 1
            assert all(before[other] == after[other] for other in before if other != key)
            before = after
            retained.append((cid, key, record, narrative, history, evidence['evidence_id'], sample))
        print(f'PASS fresh enrollment, native save and portfolio scope: {label}', flush=True)
    await reauthenticate()
    assert len({r[2] for r in retained}) == len(retained)
    audit_by_client = {}
    for cid, key, path, narrative, history, evidence_id, sample in retained:
        row = await get(path)
        assert (row['client_id'], row['framework_key'], row['implementation'], row['status']) == (cid, key, narrative, 'addressed')
        assert row['assessment_history'] == history and row['assessed_by'] == owner
        linked = (await get(path + '/related'))['evidence']
        assert [(file['client_id'], file['evidence_id']) for file in linked] == [(cid, evidence_id)]
        downloaded = await get('/evidence/' + evidence_id + '/download')
        if isinstance(downloaded, dict):
            downloaded = base64.b64decode(downloaded['content_base64'])
        assert downloaded == sample, (cid, key)
        if cid not in audit_by_client:
            audit_by_client[cid] = (await get('/audit-logs', client_id=cid, page_size=200))['items']
        expected = {
            (row['framework_assessment_id'], 'Framework assessment updated', owner),
            (evidence_id, 'upload', owner),
        }
        events = [(event['entity_id'], event['action'], event['user_id']) for event in audit_by_client[cid]]
        assert all(events.count(event) == 1 for event in expected), (cid, key)
        position = next(p['current'] for p in (await get('/portfolio/reporting/overview', client_ids=cid))['programs'] if p['framework_key'] == key)
        assert position['implemented'] == 1
    print('PASS fresh-login assessment history, linked evidence bytes and audit across 10 clients and 15 enrollments', flush=True)
    return retained[-1][0], retained[-1][2]


async def check_pilot(app, owner_password, sample_report, *, matrix_only=False):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN,
                                 headers={'Origin': ORIGIN}, timeout=60) as client:
        async def call(method, path, *, expected=200, **kwargs):
            response = await client.request(method, '/api' + path, **kwargs)
            if response.status_code != expected:
                detail = response.text[:350] if path not in ('/auth/login', '/users', '/me/password') else response.reason_phrase
                raise AssertionError(f'{method} {path}: {response.status_code}, expected {expected}; {detail}')
            if response.headers.get('content-type', '').startswith('application/json'):
                return response.json()
            return response.content

        async def login(email, password):
            record = await call('POST', '/auth/login', json={'email': email, 'password': password})
            current = await call('GET', '/auth/me')
            assert record['user']['user_id'] == current['user_id']
            return current['user_id']

        async def logout():
            await call('POST', '/auth/logout')
            await call('GET', '/auth/me', expected=401)

        async def get(path, **params):
            return await call('GET', path, params=params)

        async def post(path, body):
            return await call('POST', path, json=body, headers={'Idempotency-Key': secrets.token_hex(16)})

        owner_email, reviewer_email = 'owner@example.org', 'reviewer@example.org'
        owner = await login(owner_email, owner_password)
        cid = (await post('/clients', {'name': 'Synthetic Inventory Pilot'}))['client_id']
        reviewer_password = secrets.token_urlsafe(32)
        reviewer = (await post('/users', {'name': 'Independent reviewer', 'email': reviewer_email,
                                 'role': 'platform_admin', 'client_ids': [cid], 'password': reviewer_password}))['user']['user_id']
        assert owner != reviewer

        async def first_reviewer_login():
            nonlocal reviewer_password
            await login(reviewer_email, reviewer_password)
            permanent_password = secrets.token_urlsafe(32)
            await call('PATCH', '/me/password', json={'current_password': reviewer_password, 'new_password': permanent_password})
            reviewer_password = permanent_password
            await login(reviewer_email, reviewer_password)

        async def check_programs_and_scope(path):
            async def fresh_owner_session():
                await logout()
                await login(owner_email, owner_password)
            foreign_client, foreign_record = await check_enrollment_matrix(get, post, call, owner, fresh_owner_session)
            await logout()
            if matrix_only:
                await first_reviewer_login()
            else:
                await login(reviewer_email, reviewer_password)
            await call('GET', foreign_record, expected=403)
            await call('GET', '/portfolio/reporting/overview', expected=403, params={'client_ids': foreign_client})
            assert (await get(path))['client_id'] == cid
            print('PASS assigned reviewer retains access to own client and is denied the other client and portfolio', flush=True)

        await enroll(get, post, cid, {'cis-ig1': {'implementation_group': 1}},
                     review_choices={'asset-inventory': {'enabled': False}})
        workspace = await get('/frameworks/cis-ig1', client_id=cid)
        assert len(workspace['assessments']) == 56
        source = next(row for row in workspace['assessments'] if row['definition_id'] == '1.1')
        aid = source['framework_assessment_id']
        path = '/framework_assessments/' + aid
        if matrix_only:
            await check_programs_and_scope(path)
            return
        services_path = '/clients/' + cid + '/services'
        setup_path = '/clients/' + cid + '/iv-setup'
        services = await get(services_path)
        await post(services_path, {'expected_updated_at': services['updated_at'],
                                   'areas': {'endpoint': {'responsibility': 'iv', 'tool_ids': ['ninjaone']}}})
        setup = await get(setup_path)
        activity = next(entry for entry in setup['activities'] if entry['plan_key'] == 'asset-inventory')
        assert activity['review_id'] is None, 'Inventory Review must be scheduled from iVenture after onboarding'
        due = (date.today() + timedelta(days=10)).isoformat()
        await post(setup_path, {'activity_id': activity['activity_id'], 'review_id': activity['review_id'],
              'area_id': 'endpoint', 'tool_ids': ['ninjaone'], 'responsibility': 'iv', 'first_next_due': due,
              'cadence': 'semiannual', 'recurring_ticket_number': '123456', 'recurring_ticket_url': 'https://tickets.example.org/123456',
              'expected_updated_at': activity['expected_updated_at'], 'expected_client_updated_at': setup['expected_client_updated_at']})
        context = await get(path + '/service-context')
        assert 'ninjaone' in context['services']['areas']['endpoint']['tool_ids']
        inventory = next(entry for entry in context['candidates'] if entry['plan_key'] == 'asset-inventory')
        assert (inventory['setup']['recurring_ticket_number'], inventory['first_next_due'], inventory['cadence']) == ('123456', due, 'semiannual')
        review_id = inventory['review_id']
        review = next(r for r in await get('/reviews', client_id=cid) if r['review_id'] == review_id)
        review_evidence = await post('/evidence', {
            'client_id': cid, 'filename': 'inventory-schedule-note.txt', 'mime_type': 'text/plain',
            'content_base64': base64.b64encode(b'Synthetic inventory schedule.').decode('ascii'),
            'linked_type': 'review', 'linked_id': review_id, 'occurrence_id': review['current_occurrence_id'],
        })
        review_finding = await post('/reviews/' + review_id + '/create-finding', {
            'request_id': secrets.token_hex(16), 'occurrence_id': review['current_occurrence_id'],
            'title': 'Review inventory discrepancy', 'remediation_title': 'Reconcile reviewed equipment', 'owner_id': owner,
        })
        report_view = await get('/reports/preview', client_id=cid, framework_key='cis-ig1', type='scope')
        linked_work = next(row[4] for row in report_view['sections'][0]['rows'] if row[0] == '1.1')
        assert review_finding['finding_id'] in linked_work and review_finding['primary_task_id'] in linked_work
        exported = await post('/reports/exports', {'client_id':cid, 'framework_key':'cis-ig1', 'type':'scope', 'format':'xlsx'})
        contents = await get(exported['download_url'].removeprefix('/api'))
        import io
        import zipfile
        with zipfile.ZipFile(io.BytesIO(contents)) as archive:
            worksheet = archive.read('xl/worksheets/sheet1.xml').decode()
            assert review_finding['finding_id'] in worksheet and review_finding['primary_task_id'] in worksheet
        print('PASS native Review-origin Finding and its Action in gap report preview and downloaded XLSX', flush=True)
        print('PASS onboarding, tool, recurring ticket, control context and Review', flush=True)
        draft = await get(path + '/guided-assessment')
        interview = {'version': draft['version'], 'expected_revision': draft['revision'], 'step': 1, 'completed': False,
                     'answers': {'inventory': 'No'}, **{k: draft[k] for k in ('base_assessment_token', 'base_scope_fingerprint') if k in draft}}
        await call('PUT', path + '/guided-assessment', json=interview)
        assert (await get(path + '/guided-assessment'))['answers'] == interview['answers']
        assert (await get(path))['status'] == 'not_assessed'
        saved = await call('PATCH', path, json={'status': 'needs_attention', 'implementation': 'Synthetic missing inventory.',
                                 'expected_last_assessed': source.get('last_saved') or source.get('last_assessed')})
        assert saved['assessment_history'] and saved['assessed_by'] == owner
        async def portfolio():
            overview = await get('/portfolio/reporting/overview', client_ids=cid)
            return next(p['current'] for p in overview['programs'] if p['framework_key'] == 'cis-ig1')
        position = await portfolio()
        assert position['denominator'] == 56 and position['implemented'] == 0
        assert {r['key']: r['count'] for r in position['counts']}['needs_attention'] == 1
        print('PASS guided draft and native assessment save', flush=True)
        finding = await post(path + '/findings', {'request_id': secrets.token_hex(16), 'title': 'Missing asset inventory',
                'description': 'No complete inventory was available.', 'remediation_title': 'Create a complete inventory',
                'owner_id': owner, 'due_date': due})
        fid, tid = finding['finding_id'], finding['primary_task_id']
        finding_path = '/findings/' + fid
        async def decision(action, rationale, expected=200):
            current = await get(finding_path)
            return await call('POST', finding_path + '/' + action, expected=expected, json={
                'request_id': secrets.token_hex(16), 'rationale': rationale, 'expected_updated_at': current['updated_at']})
        related = await get(path + '/related')
        assert review_id in [r['review_id'] for r in related['reviews']], 'Scheduled inventory Review missing from Safeguard 1.1 linked work'
        assert review_evidence['evidence_id'] in [file['evidence_id'] for file in related['evidence']]
        reverse = await get('/related', entity_type='reviews', entity_id=review_id)
        assert aid in [a['framework_assessment_id'] for a in reverse['framework_assessments']]
        refreshed_workspace = await get('/frameworks/cis-ig1', client_id=cid)
        assert review_id in refreshed_workspace['work'][aid]['review_ids'], 'Inventory Review missing from framework status'
        assert tid in [t['task_id'] for t in related['tasks']]
        assert fid in [f['finding_id'] for f in related['findings']]
        assert tid in [t['task_id'] for t in await get('/tasks', client_id=cid)]
        active_queue = await get('/dashboard', client_id=cid, work_queue='true', detail='all', limit=100)
        assert tid in [r['id'] for r in active_queue['items']]
        due_params = {'client_id': cid, 'start': due, 'end': due}
        calendar = await get('/calendar', **due_params)
        assert tid in [t['id'] for t in calendar['tasks'][due]] and review_id in [r['id'] for r in calendar['reviews'][due]]
        sample = b'Synthetic inventory evidence.'
        file = await post('/evidence', {'filename': 'inventory-sample.txt', 'mime_type': 'text/plain', 'client_id': cid,
                         'linked_type': 'task', 'linked_id': tid, 'content_base64': base64.b64encode(sample).decode('ascii')})
        eid = file['evidence_id']
        assert file['sha256'] == hashlib.sha256(sample).hexdigest() and file['uploaded_by'] == owner
        task = await get('/tasks/' + tid)
        original = await call('PATCH', '/tasks/' + tid, json={'status': 'done', 'resolution': 'Inventory supplied.', 'expected_updated_at': task.get('updated_at')})
        assert original['completed_by'] == owner and (await get(finding_path))['status'] == 'remediated'
        await decision('validate', 'Worker cannot validate own submission.', 403)
        await logout()
        await first_reviewer_login()
        rejected = await decision('reject', 'Independent sample still lacks an asset class.')
        replacement = rejected['primary_task_id']
        assert rejected['status'] == 'in_remediation' and replacement != tid and (await get('/tasks/' + tid))['status'] == 'done'
        await logout()
        await login(owner_email, owner_password)
        task = await get('/tasks/' + replacement)
        await call('PATCH', '/tasks/' + replacement, json={'status': 'done', 'resolution': 'Missing asset class added.', 'expected_updated_at': task.get('updated_at')})
        await logout()
        await login(reviewer_email, reviewer_password)
        final = await decision('validate', 'Independently reconciled the corrected inventory.')
        assert final['status'] == 'closed' and [row['action'] for row in final['decision_history']] == ['rejected', 'validated']
        print('PASS independent validation, rejected work retained, separate replacement, final closure', flush=True)
        await logout()
        await login(owner_email, owner_password)
        assert (await get(path))['status'] == 'needs_attention'
        assert (await get(path + '/guided-assessment'))['answers'] == interview['answers']
        assert (await portfolio())['counts'] == position['counts']
        related = await get(path + '/related')
        assert next(row for row in related['findings'] if row['finding_id'] == fid)['status'] == 'closed'
        task_status = {r['task_id']: r['status'] for r in related['tasks']}
        assert task_status[tid] == task_status[replacement] == 'done'
        historical = await get('/calendar', scope='all', **due_params)
        active = await get('/calendar', **due_params)
        assert tid in [t['id'] for t in historical['tasks'][due]] and tid not in [t['id'] for t in active['tasks'].get(due, [])]
        assert eid in [e['evidence_id'] for e in await get('/evidence', client_id=cid)]
        blob = await get('/evidence/' + eid + '/download')
        assert blob == sample or isinstance(blob, dict) and base64.b64decode(blob['content_base64']) == sample
        dashboard = await get('/dashboard', client_id=cid, work_queue='true', detail='all', limit=100)
        assert not {tid, fid, replacement}.intersection(r['id'] for r in dashboard['items'])
        report = await get('/reports/framework', client_id=cid, framework_key='cis-ig1', detail='full')
        assert report.startswith(b'%PDF-') and len(report) > 1500
        if sample_report:
            sample_report.write_bytes(report)
        audit = (await get('/audit-logs', client_id=cid, page_size=200))['items']
        events = {(r['entity_id'], r['action'], r['user_id']) for r in audit}
        assert {(fid, 'validate', reviewer), (fid, 'reject', reviewer), (eid, 'upload', owner), (cid, 'generate', owner)} <= events
        print('PASS fresh login, preserved assessment, linked history, calendar, evidence bytes, framework PDF, audit actors', flush=True)
        await check_programs_and_scope(path)


def run_check(check, uri, database_name, sample_report, matrix_only):
    from password_policy import hash_password
    password = secrets.token_urlsafe(32)
    os.environ.update(APP_ENV='test', MONGO_URL=uri, DB_NAME=database_name, JWT_SECRET=secrets.token_urlsafe(48),
                      ADMIN_EMAIL='owner@example.org', ADMIN_PASSWORD_HASH=hash_password(password),
                      APP_BASE_URL=ORIGIN, CORS_ORIGINS=ORIGIN, RUN_LEGACY_MIGRATIONS='false')
    import server
    logging.getLogger('httpx').setLevel(logging.WARNING)

    async def run():
        async with server.app.router.lifespan_context(server.app):
            if matrix_only:
                await check_pilot(server.app, password, None, matrix_only=True)
            else:
                await check(server.app, password, sample_report)
    asyncio.run(run())


def main(check=check_pilot):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mongod', nargs='?', type=Path)
    parser.add_argument('--mongo-url', help='Explicit mongodb://127.0.0.1:PORT origin for the disposable CI replica set')
    parser.add_argument('--matrix-only', action='store_true', help='Run the nine workflow scopes and the six-program client')
    parser.add_argument('--sample-report', type=Path, help='Write the synthetic CIS PDF for independent inspection')
    args = parser.parse_args()
    if not __debug__:
        parser.error('Run with assertions enabled')
    if (ROOT / 'backend' / '.env').exists():
        parser.error('Use an isolated checkout without backend/.env')
    if (args.mongod is None) == (args.mongo_url is None):
        parser.error('Provide either the mongod executable or --mongo-url')
    if args.matrix_only and (check is not check_pilot or args.sample_report):
        parser.error('--matrix-only selects the native inventory matrix alone')
    if args.mongo_url and not args.matrix_only:
        parser.error('--mongo-url is for the matrix on an isolated CI replica set')
    if args.mongo_url:
        parsed = urlsplit(args.mongo_url)
        if (parsed.scheme != 'mongodb' or parsed.hostname != '127.0.0.1' or not parsed.port
                or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
            parser.error('Use an explicit loopback MongoDB origin without credentials, database or query options')
        uri = args.mongo_url.rstrip('/') + '/?directConnection=true&serverSelectionTimeoutMS=4000'
        name = 'test_grc_quality_v3_' + secrets.token_hex(16)
        with MongoClient(uri) as mongo:
            primary = mongo.admin.command('hello')
            if not primary.get('setName') or not primary.get('isWritablePrimary'):
                parser.error('Use an already-elected disposable loopback replica set')
            if name in mongo.list_database_names():
                raise RuntimeError('Generated verification database already exists')
            try:
                run_check(check, uri, name, args.sample_report, args.matrix_only)
            finally:
                mongo.drop_database(name)
        return
    with tempfile.TemporaryDirectory(prefix='governara-inventory-') as temp:
        with socket.socket() as candidate:
            candidate.bind(('127.0.0.1', 0))
            port = candidate.getsockname()[1]
        uri = f'mongodb://127.0.0.1:{port}/?directConnection=true&serverSelectionTimeoutMS=4000'
        directory = Path(temp)
        proc = subprocess.Popen([str(args.mongod.resolve()), '--bind_ip', '127.0.0.1', '--port', str(port),
            '--dbpath', str(directory), '--logpath', str(directory/'mongodb.log'), '--wiredTigerCacheSizeGB', '0.25',
            '--replSet', 'inventoryQA'],
            stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        dbclient = MongoClient(uri, serverSelectionTimeoutMS=700)
        try:
            for attempt in range(30):
                if proc.poll() is not None:
                    raise RuntimeError(f'Owned MongoDB failed to start (exit {proc.returncode})')
                try:
                    options = dbclient.admin.command('getCmdLineOpts')['parsed']
                    if Path(options['storage']['dbPath']).resolve() != directory.resolve():
                        raise RuntimeError('This process does not own the database at the selected port')
                    break
                except ServerSelectionTimeoutError:
                    if attempt == 29:
                        raise
                    time.sleep(.2)
            dbclient.admin.command({'replSetInitiate': {'_id': 'inventoryQA', 'members': [{'_id': 0, 'host': f'localhost:{port}'}]}})
            for attempt in range(100):
                if dbclient.admin.command('hello').get('isWritablePrimary'):
                    break
                if attempt == 99:
                    raise TimeoutError('The disposable replica set did not elect its primary')
                time.sleep(.25)
            run_check(check, uri, 'test_inventory_pilot', args.sample_report, args.matrix_only)
        finally:
            if proc.poll() is None:
                try:
                    if Path(dbclient.admin.command('getCmdLineOpts')['parsed']['storage']['dbPath']).resolve() == directory.resolve():
                        dbclient.admin.command({'shutdown': 1, 'force': True})
                except (AutoReconnect, ServerSelectionTimeoutError):
                    pass
                try:
                    proc.wait(timeout=12)
                except subprocess.TimeoutExpired:
                    proc.terminate()
                    proc.wait(timeout=10)
            dbclient.close()


if __name__ == '__main__':
    main()
