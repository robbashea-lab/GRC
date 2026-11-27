"""Opt-in real-Mongo ISO application-path acceptance, not normative/hosted proof.

Run only in the coordinator's CPU slot via direct unittest with
PLATFORM_ACCEPTANCE_MONGO_URL=mongodb://127.0.0.1:58749. The root registers this
module as environment-only; no fake HTTP environment URL or default offline run.
Modelled JWT actors exercise normal backend auth/authorization, not browser
password/MFA/TLS. Bootstrap identities are synthetic; no completed history is
seeded. Only a newly owned UUID database in the approved namespace is touched.
"""
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
import uuid

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
sys.path.insert(0, str(ROOT / 'backend' / 'tests'))
# The existing harness guards initial import against dotenv/real default Mongo.
# Its fake bootstrap is replaced BEFORE any acceptance operation below.
import test_client_dashboard_sources as harness
import routes.onboarding as onboarding
from initialization import ensure_indexes

server = harness.server
MONGO_URL = 'mongodb://127.0.0.1:58749'
DB_PREFIX = 'platform_acceptance_20261011_inventory_iso_'
VERSION = 'iso27001-omni-1'
CATALOG = json.loads((ROOT / 'shared/catalogs/iso27001.json').read_text(encoding='utf-8'))
DEFINITIONS = {}
for filename in ('guidedIsoIsms.json', 'guidedIsoOrganizationalPeople.json',
                 'guidedIsoPhysicalTechnology.json'):
    part = json.loads((ROOT / 'shared/catalogs' / filename).read_text(encoding='utf-8'))
    if part['version'] != VERSION or DEFINITIONS.keys() & part['definitions'].keys():
        raise ValueError('Incompatible frozen ISO interview catalog')
    DEFINITIONS.update(part['definitions'])


def questions(definition_id):
    """Serialization vectors use frozen authored metadata, not evaluator output."""
    return [(q, [c for c in (g.get('condition'), q.get('condition')) if c])
            for g in DEFINITIONS[definition_id]['groups'] for q in g['questions']]


def active_questions(definition_id, answers):
    by_id = {q['id']: (q, conditions) for q, conditions in questions(definition_id)}

    def active(ident, visited=frozenset()):
        if ident in visited:
            raise AssertionError('Cyclic frozen question conditions')
        _, conditions = by_id[ident]
        return all(c['id'] in by_id and answers.get(c['id']) == c['equals']
                   and active(c['id'], visited | {ident}) for c in conditions)

    return [q for q, _ in by_id.values() if active(q['id'])]


def active_substantive(definition_id, answers):
    return [q for q in active_questions(definition_id, answers) if q.get('type', 'select') == 'select']


def positive_vector(definition_id):
    # This covers serialization/conditional wiring, not whether these answers
    # substantively satisfy a licensed ISO clause/control in a real organization.
    return {q['id']: 'Relevant' if q.get('type') == 'context' else
            'Synthetic optional context' if q.get('type') == 'text' else 'Yes'
            for q, _ in questions(definition_id)}


def status_vectors(definition_id):
    affirmative = positive_vector(definition_id)
    first = active_substantive(definition_id, affirmative)[0]['id']
    unknown = {q['id']: 'Synthetic optional uncertainty' if q.get('type') == 'text'
               else 'Not sure' for q, _ in questions(definition_id)}
    # Fixed expected outcomes from the approved reported-implementation contract:
    # affirmative substantive answers -> addressed; substantive Partial -> partial;
    # confirmed No -> needs_attention; no meaningful substantive information ->
    # not_assessed. Do not obtain expected statuses from the production evaluator.
    return [('affirmative', affirmative, 'addressed'),
            ('partial', {**affirmative, first: 'Partially'}, 'in_progress'),
            ('confirmed_gap', {**affirmative, first: 'No'}, 'needs_attention'),
            ('unknown', unknown, 'not_assessed')]


def reviewed_result(status, narrative):
    # Fully valid save envelope. Negative tests vary only the targeted defect,
    # rather than passing because unrelated required result fields are absent.
    return {'version': VERSION, 'status': status, 'narrative': narrative,
            'basis': [], 'gaps': [], 'unknowns': [], 'nextSteps': [],
            'evidence': [], 'answers': [], 'signals': []}


class PlatformIsoInventoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        target = os.environ.get('PLATFORM_ACCEPTANCE_MONGO_URL')
        if not target:
            raise unittest.SkipTest('UNEXECUTED: explicitly approved real-Mongo opt-in missing')
        parsed = urlsplit(target)
        if (target != MONGO_URL or parsed.hostname != '127.0.0.1'
                or parsed.port != 58749 or parsed.username or parsed.password):
            raise RuntimeError('Only the coordinator-approved loopback Mongo target is permitted')
        self.run_id = uuid.uuid4().hex
        self.database_name = DB_PREFIX + self.run_id[:16]
        if len(self.database_name.encode('utf-8')) > 63:
            raise RuntimeError('Generated database name exceeds the Mongo limit')
        self.evidence = {'case': self.id(), 'product_baseline': '28b806716024ec149af2ec5da621a5a618c669d5',
                         'database': self.database_name, 'layer': 'ASGI + real Motor/Mongo; modelled JWT actors',
                         'rows': [], 'hosted': False, 'normative_validation': False}
        # Existing bootstrap: isolated .env/default-store boundary and ordinary
        # request/CAS/idempotency fixture hook, not an auth dependency override.
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        bootstrap = server.db
        self.mongo = AsyncIOMotorClient(target, serverSelectionTimeoutMS=3000,
                                       connectTimeoutMS=3000, appname='platform-iso-acceptance')
        self.addCleanup(self.mongo.close)
        self.real_db = self.mongo[self.database_name]
        await self.real_db.command('ping')  # database-scoped, never admin/global
        if await self.real_db.list_collection_names():
            raise RuntimeError('Generated test database is not empty; do not overwrite')
        await self.real_db.qa_run_owner.insert_one({'_id': self.run_id, 'suite': 'ISO acceptance'})
        self.addAsyncCleanup(self.cleanup_owned_database)
        # Only fresh trusted fixture identities/empty clients, not Demo records
        # or previously completed assessments/evidence/history, are copied.
        for kind in ('users', 'clients'):
            rows = await bootstrap[kind].find({}).to_list(None)
            if rows:
                await self.real_db[kind].insert_many(rows)
        await ensure_indexes(self.real_db)
        for module in (server, onboarding):
            binding = patch.object(module, 'db', self.real_db)
            binding.start()
            self.addCleanup(binding.stop)
        self.sign_in('admin')
        self.primary = await self.request('POST', '/clients', {'name': 'ISO acceptance ' + self.run_id[:8]})
        self.foreign = await self.request('POST', '/clients', {'name': 'Foreign ISO fixture ' + self.run_id[:8]})
        self.cid, self.other_cid = self.primary['client_id'], self.foreign['client_id']
        await self.real_db.users.update_one({'user_id': 'member'}, {'$set': {'client_ids': [self.cid]}})
        await self.real_db.users.insert_one({'user_id': 'reader', 'name': 'Synthetic reader',
            'email': 'reader@example.test', 'role': 'client_readonly', 'status': 'active', 'client_ids': [self.cid]})
        self.workspace = await self.configure(self.cid)
        self.other = await self.configure(self.other_cid)
        self.by_id = {r['definition_id']: r for r in self.workspace['assessments']}

    def sign_in(self, uid):
        harness.ClientDashboardSourcesTests.sign_in(self, uid)

    async def request(self, method, path, body=None, *, status=200):
        response = await self.client.request(method, '/api' + path, **({'json': body} if body is not None else {}))
        self.assertEqual(response.status_code, status, (method, path, response.text))
        return response.json()

    async def configure(self, cid):
        state = {'version': 3, 'step': 3,
                 'policies': {p['key']: 'unsure' for p in onboarding.BASELINE_CATALOG['policies']},
                 'requirements': {p['key']: 'applies' if p['key'] == 'iso-27001' else 'does_not_apply'
                                  for p in onboarding.BASELINE_CATALOG['requirements']},
                 'reviews': [], 'framework_reviews': {}}
        await self.request('POST', '/onboarding/baseline', {'client_id': cid, 'state': state, 'finalize': True})
        return await self.request('GET', '/frameworks/iso-27001?client_id=' + cid)

    @staticmethod
    def route(row):
        return '/framework_assessments/' + row['framework_assessment_id']

    @staticmethod
    def token(row):
        return row.get('last_saved') or row.get('last_assessed')

    async def read(self, row):
        return await self.request('GET', self.route(row))

    async def decision(self, row, value):
        return await self.request('PATCH', self.route(row), {'soa_applicability': value,
            'soa_justification': 'Synthetic documented scope/risk treatment decision',
            'expected_last_assessed': self.token(row)})

    async def save_interview(self, row, answers, *, expected_status=None, narrative='', restart=False, step=0):
        path = self.route(row) + '/guided-assessment'
        old = await self.request('GET', path)
        payload = {'version': VERSION, 'answers': answers, 'step': step, 'completed': expected_status is not None,
                   'narrative': narrative, 'expected_revision': old['revision'], 'restart': restart,
                   'base_assessment_token': old['current_assessment_token'],
                   'base_scope_fingerprint': old['current_scope_fingerprint']}
        if expected_status is not None:
            payload.update(summary_review={'version': VERSION, 'answers': answers},
                           result=reviewed_result(expected_status, narrative))
        return await self.request('PUT', path, payload)

    async def apply(self, row, interview, *, status=200, extra=None):
        body = {'implementation': interview['narrative'], 'status': interview['result']['status'],
                'expected_last_assessed': self.token(row), 'guided_assessment_source':
                    {k: interview[k] for k in ('version', 'revision', 'generated_at')}}
        return await self.request('PATCH', self.route(row), {**body, **(extra or {})}, status=status)

    async def cleanup_owned_database(self):
        # Preserve sanitized execution evidence before narrowly owned cleanup.
        print('ISO_ACCEPTANCE_EVIDENCE ' + json.dumps(self.evidence, ensure_ascii=False), flush=True)
        if (len(self.database_name.encode('utf-8')) > 63
                or not re.fullmatch(re.escape(DB_PREFIX) + r'[0-9a-f]{16}', self.database_name)):
            raise RuntimeError('Refuse cleanup outside the exact approved UUID namespace')
        marker = await self.real_db.qa_run_owner.find_one({'_id': self.run_id, 'suite': 'ISO acceptance'})
        if not marker or self.real_db.name != self.database_name:
            raise RuntimeError('Test ownership marker missing; retain database for investigation')
        await self.real_db.command('dropDatabase')

    async def test_all_enabled_ids_activation_and_noninitializing_reads(self):
        native = {r['id'] for r in CATALOG['requirements']}
        self.assertEqual(len(native), 123)
        self.assertEqual(set(self.by_id), native)
        self.assertEqual(sum(r['specification'] == 'isms_clause' for r in CATALOG['requirements']), 30)
        self.assertEqual(sum(r['specification'] == 'annex_control' for r in CATALOG['requirements']), 93)
        self.assertEqual(set(DEFINITIONS), native)
        before = {r['definition_id']: r['framework_assessment_id'] for r in self.workspace['assessments']}
        reviews_before = await self.real_db.reviews.count_documents({'client_id': self.cid})
        for definition_id, row in self.by_id.items():
            with self.subTest(definition=definition_id):
                draft = await self.request('GET', self.route(row) + '/guided-assessment')
                self.assertEqual(draft['version'], VERSION)
                self.assertEqual(draft['answers'], {})
                self.assertEqual(draft['revision'], 0)
                self.assertEqual(row['status'], 'not_assessed')
                self.assertEqual(row['implementation'], '')
        repeated = await self.configure(self.cid)
        self.assertEqual({r['definition_id']: r['framework_assessment_id'] for r in repeated['assessments']}, before)
        self.assertEqual(await self.real_db.reviews.count_documents({'client_id': self.cid}), reviews_before)
        self.assertEqual(await self.real_db.guided_assessment_pilot.count_documents({'client_id': self.cid}), 0)
        self.evidence['rows'].append({'native_ids': sorted(native), 'count': 123, 'repeat_ids_unchanged': True})

    async def test_all_123_progress_exact_reviewed_native_status_history_and_reconnect(self):
        for definition_id, initial in self.by_id.items():
            with self.subTest(definition=definition_id):
                row = await self.decision(initial, 'included') if definition_id.startswith('A.') else await self.read(initial)
                before = copy.deepcopy(row)
                first = active_substantive(definition_id, positive_vector(definition_id))[0]['id']
                step = 1 if len(DEFINITIONS[definition_id]['groups']) > 1 else 0
                partial = await self.save_interview(row, {first: 'Yes'}, narrative='Synthetic interview draft only', step=step)
                reread = await self.request('GET', self.route(row) + '/guided-assessment')
                self.assertEqual(reread['answers'], partial['answers'])
                self.assertEqual(reread['step'], step)
                self.assertEqual(await self.read(row), before)
                history_prefix = copy.deepcopy(row.get('assessment_history', []))
                for label, answers, expected in status_vectors(definition_id):
                    # Explicit existing restart resets current interview, never
                    # native text/SoA or previously recorded assessment history.
                    await self.save_interview(row, {}, restart=True)
                    self.assertEqual((await self.read(row)).get('assessment_history', []), history_prefix)
                    text = ('OVERVIEW\nSynthetic reviewed ' + definition_id + ' ' + label + ' — café\n\n'
                            'IMPLEMENTATION BREAKDOWN\n- Manual wording stays exact.\n\n'
                            'ITEMS TO ADDRESS\n- Synthetic confirmation only.\n')
                    interview = await self.save_interview(row, answers, expected_status=expected, narrative=text)
                    self.assertEqual(await self.read(row), row)
                    saved = await self.apply(row, interview)
                    self.assertEqual((saved['implementation'], saved['status']), (text, expected))
                    self.assertEqual(saved.get('soa_applicability'), row.get('soa_applicability'))
                    for field in ('technology', 'notes', 'verification', 'related_links', 'owner_id', 'process_owner_id'):
                        self.assertEqual(saved.get(field), row.get(field), field)
                    self.assertEqual(saved['assessment_history'][:-1], history_prefix)
                    history_prefix = copy.deepcopy(saved['assessment_history'])
                    row = await self.read(saved)
                    self.assertEqual((row['implementation'], row['status']), (text, expected))
                    await self.apply(before, interview, status=409)  # stale native token cannot replay a different write
                fresh = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
                try:
                    persisted = await fresh[self.database_name].framework_assessments.find_one(
                        {'framework_assessment_id': row['framework_assessment_id']}, {'_id': 0})
                    retained = await fresh[self.database_name].guided_assessment_pilot.find_one(
                        {'client_id': self.cid, '_id': row['framework_assessment_id'] + ':admin'})
                    self.assertEqual(persisted['assessment_history'], history_prefix)
                    self.assertEqual((persisted['implementation'], persisted['status']), (text, 'not_assessed'))
                    self.assertIsNotNone(retained)
                finally:
                    fresh.close()
                self.evidence['rows'].append({'id': definition_id, 'status_vectors': 4,
                    'native_history': len(history_prefix), 'implementation_sha256': hashlib.sha256(text.encode()).hexdigest(),
                    'new_motor_connection_read': True})

    async def test_all_clause_and_annex_prerequisites_and_soa_history_independence(self):
        for definition_id, initial in self.by_id.items():
            with self.subTest(definition=definition_id):
                path = self.route(initial)
                if not definition_id.startswith('A.'):
                    await self.request('PATCH', path, {'status': 'not_applicable', 'na_rationale': 'Synthetic scope reason',
                        'expected_last_assessed': self.token(initial)}, status=422)
                    await self.request('PATCH', path, {'soa_applicability': 'excluded', 'soa_justification': 'Synthetic reason',
                        'expected_last_assessed': self.token(initial)}, status=422)
                    self.assertEqual(await self.read(initial), initial)
                    continue
                answers = positive_vector(definition_id)
                text = 'OVERVIEW\nSynthetic reviewed Annex implementation\n\nIMPLEMENTATION BREAKDOWN\n- Exact wording\n\nITEMS TO ADDRESS\n- Confirm\n'
                draft = await self.save_interview(initial, answers, expected_status='addressed', narrative=text)
                await self.apply(initial, draft, status=422)  # undecided SoA cannot apply an implementation proposal
                await self.request('PATCH', path, {'soa_applicability': 'included', 'soa_justification': '',
                    'expected_last_assessed': self.token(initial)}, status=422)
                included = await self.decision(initial, 'included')
                self.assertEqual(included['implementation'], '')
                self.assertEqual(included['status'], 'not_assessed')
                await self.save_interview(included, {}, restart=True)
                draft = await self.save_interview(included, answers, expected_status='addressed', narrative=text)
                saved = await self.apply(included, draft)
                excluded = await self.decision(saved, 'excluded')
                self.assertEqual((excluded['implementation'], excluded['status']), (text, 'addressed'))
                self.assertEqual(excluded['assessment_history'][:-1], saved['assessment_history'])
                await self.apply(excluded, draft, status=409)  # changed applicability makes the old basis stale
                restored = await self.decision(excluded, 'included')
                self.assertEqual(restored['framework_assessment_id'], initial['framework_assessment_id'])
                self.assertEqual((restored['implementation'], restored['status']), (text, 'addressed'))
                self.evidence['rows'].append({'id': definition_id, 'undecided_apply_denied': True,
                    'excluded_preserves_implementation': True, 'shared_assessment_id': restored['framework_assessment_id']})

    async def test_all_123_related_records_are_tenant_scoped_and_file_content_is_durable(self):
        primary_row, foreign_row = self.by_id['4.1'], self.other['assessments'][0]
        content = b'SYNTHETIC ISO LINKAGE FIXTURE ONLY\nNot client implementation evidence.\n'
        evidence = await self.request('POST', '/evidence', {'client_id': self.cid, 'filename': 'synthetic-iso.txt',
            'mime_type': 'text/plain', 'content_base64': base64.b64encode(content).decode(),
            'linked_type': 'framework_assessment', 'linked_id': primary_row['framework_assessment_id']})
        foreign = await self.request('POST', '/evidence', {'client_id': self.other_cid, 'filename': 'synthetic-foreign.txt',
            'mime_type': 'text/plain', 'content_base64': base64.b64encode(b'FOREIGN SYNTHETIC').decode(),
            'linked_type': 'framework_assessment', 'linked_id': foreign_row['framework_assessment_id']})
        foreign_reviews = await self.real_db.reviews.find({'client_id': self.other_cid}).to_list(None)
        for definition_id, row in self.by_id.items():
            with self.subTest(definition=definition_id):
                path = self.route(row)
                await self.request('POST', path + '/links', {'kind': 'evidence', 'id': evidence['evidence_id']})
                await self.request('POST', path + '/links', {'kind': 'evidence', 'id': foreign['evidence_id']}, status=422)
                await self.request('POST', path + '/links', {'kind': 'reviews', 'id': foreign_reviews[0]['review_id']}, status=422)
                related = await self.request('GET', path + '/related')
                self.assertIn(evidence['evidence_id'], {e['evidence_id'] for e in related['evidence']})
                for rows in related.values():
                    self.assertTrue(all(r['client_id'] == self.cid for r in rows))
        download = await self.request('GET', '/evidence/' + evidence['evidence_id'] + '/download')
        self.assertEqual(hashlib.sha256(base64.b64decode(download['content_base64'])).hexdigest(), hashlib.sha256(content).hexdigest())
        path = self.route(self.by_id['A.5.1'])
        await self.request('DELETE', path + '/links', {'kind': 'evidence', 'id': evidence['evidence_id']})
        self.assertNotIn(evidence['evidence_id'], {e['evidence_id'] for e in
            (await self.request('GET', path + '/related'))['evidence']})
        self.assertIsNotNone(await self.real_db.evidence.find_one({'evidence_id': evidence['evidence_id']}))
        self.evidence['rows'].append({'linked_records': 123, 'foreign_links_rejected': 246,
            'file_content_sha256': hashlib.sha256(content).hexdigest(), 'unlink_not_delete': True})

    async def test_all_123_modelled_readonly_wrong_client_and_unauthenticated_denials(self):
        self.sign_in('reader')
        foreign_by_id = {r['definition_id']: r for r in self.other['assessments']}
        for definition_id, row in self.by_id.items():
            with self.subTest(definition=definition_id):
                await self.request('PATCH', self.route(row), {'implementation': 'Prohibited synthetic write',
                    'expected_last_assessed': self.token(row)}, status=403)
                await self.request('PUT', self.route(row) + '/guided-assessment', {'version': VERSION,
                    'answers': {}, 'expected_revision': 0}, status=403)
                await self.request('GET', self.route(foreign_by_id[definition_id]), status=403)
        self.client.headers.pop('Authorization', None)
        self.client.cookies.clear()
        native_path = self.route(self.by_id['4.1'])
        guide_path = self.route(self.by_id['A.5.1']) + '/guided-assessment'
        for path in (native_path, guide_path):
            await self.request('GET', path, status=401)
        await self.request('PATCH', native_path, {'implementation': 'Unauthorized synthetic change',
            'expected_last_assessed': None}, status=401)
        await self.request('PUT', guide_path, {'version': VERSION, 'answers': {}}, status=401)
        self.sign_in('admin')
        for row in self.by_id.values():
            self.assertEqual((await self.read(row))['implementation'], '')
        self.evidence['rows'].append({'readonly_native_denied': 123, 'readonly_progress_denied': 123,
            'unauthenticated_routes': 2, 'layer': 'modelled database actors, not hosted persona acceptance'})

    async def test_conditional_reasons_hide_inactive_no_without_changing_soa(self):
        for definition_id, initial in self.by_id.items():
            affirmative = positive_vector(definition_id)
            contexts = [q for q in active_questions(definition_id, affirmative) if q.get('type') == 'context']
            if not contexts:
                continue
            row = await self.decision(initial, 'included') if definition_id.startswith('A.') else await self.read(initial)
            for gate in contexts:
                with self.subTest(definition=definition_id, gate=gate['id']):
                    await self.save_interview(row, {}, restart=True)
                    scoped = {**affirmative, gate['id']: 'Not relevant here'}
                    before = await self.request('GET', self.route(row) + '/guided-assessment')
                    # Completion must reject an unexplained exclusion of context.
                    payload = {'version': VERSION, 'answers': scoped, 'completed': True,
                        'expected_revision': before['revision'], 'narrative': 'Synthetic incomplete context',
                        'base_assessment_token': before['current_assessment_token'],
                        'base_scope_fingerprint': before['current_scope_fingerprint'],
                        'summary_review': {'version': VERSION, 'answers': scoped},
                        'result': reviewed_result('addressed', 'Synthetic incomplete context')}
                    denied = await self.request('PUT', self.route(row) + '/guided-assessment', payload, status=422)
                    self.assertIn('Explain why this conditional context', denied['detail'])
                    unchanged = await self.request('GET', self.route(row) + '/guided-assessment')
                    self.assertEqual((unchanged['revision'], unchanged['answers']),
                                     (before['revision'], before['answers']))
                    scoped[gate['id'] + '_detail'] = 'Synthetic qualified context reason, not whole-clause exclusion'
                    active = {q['id'] for q in active_questions(definition_id, scoped)}
                    inactive = [q['id'] for q, _ in questions(definition_id)
                                if q.get('type', 'select') == 'select' and q['id'] not in active]
                    for ident in inactive:
                        scoped[ident] = 'No'  # retained historical data cannot score when inactive
                    text = 'OVERVIEW\nSynthetic conditional path\n\nIMPLEMENTATION BREAKDOWN\n- Active practices\n\nITEMS TO ADDRESS\n- Confirm context\n'
                    saved = await self.save_interview(row, scoped, expected_status='addressed', narrative=text)
                    self.assertEqual(saved['answers'], scoped)
                    self.assertEqual(saved['result']['status'], 'addressed')
                    self.assertEqual(await self.read(row), row)  # interview-only write
                    self.evidence['rows'].append({'id': definition_id, 'gate': gate['id'],
                        'reason_required': True, 'inactive_no_retained': inactive, 'native_unchanged': True})

    async def test_legacy_native_missing_new_save_field_and_rejected_apply_preserve_history(self):
        initial = self.by_id['4.1']
        text = 'Synthetic client-written legacy implementation\nKeep blank lines.\n\nKeep provenance.'
        saved = await self.request('PATCH', self.route(initial), {'implementation': text, 'status': 'in_progress',
            'notes': 'Synthetic retained legacy notes', 'expected_last_assessed': self.token(initial)})
        # Remove only a new token field on this owned fixture. Successful history
        # was created by the real native writer, never inserted as a passing seed.
        await self.real_db.framework_assessments.update_one({'framework_assessment_id': saved['framework_assessment_id']},
            {'$unset': {'last_saved': ''}})
        legacy = await self.read(saved)
        self.assertEqual(legacy['implementation'], text)
        self.assertEqual(legacy['assessment_history'], saved['assessment_history'])
        history = copy.deepcopy(legacy['assessment_history'])
        interview = await self.save_interview(legacy, positive_vector('4.1'), expected_status='addressed',
            narrative='OVERVIEW\nReviewed synthetic update\n\nIMPLEMENTATION BREAKDOWN\n- Manual text\n\nITEMS TO ADDRESS\n- Confirm\n')
        await self.apply(legacy, interview, status=422, extra={'verification': 'verified'})
        self.assertEqual(await self.read(legacy), legacy)
        updated = await self.apply(legacy, interview)
        self.assertEqual(updated['assessment_history'][:-1], history)
        self.assertEqual(updated['notes'], legacy['notes'])
        self.assertEqual(updated['guided_assessment_source']['origin'], 'guided-assessment-pilot')
        self.evidence['rows'].append({'id': '4.1', 'legacy_token_fallback': True,
            'rejected_extra_field_preserves_native': True, 'prior_native_history_preserved': True})


if __name__ == '__main__':
    unittest.main()
