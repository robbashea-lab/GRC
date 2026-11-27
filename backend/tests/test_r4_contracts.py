"""New R4 contracts against disposable Mongo mocks; no server or network startup."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
import httpx
from fastapi import FastAPI
import create_requests
import r4_review_completion as completion
import r4_services as services
import test_client_dashboard_sources as native_fixture


class R4Contracts(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()['r4_isolated']
        self.user = {'user_id': 'owner', 'role': 'super_admin', 'status': 'active'}
        self.audits = []
        async def audit(*args, **kwargs):
            self.audits.append((args, kwargs))
        def snapshot(data, row):
            if 'expected_updated_at' in data and data['expected_updated_at'] != row.get('updated_at'):
                raise HTTPException(409, 'stale snapshot')
        self.s = SimpleNamespace(db=self.db, audit=audit, _require_snapshot=snapshot)
        counter = 0
        def next_time(_old):
            nonlocal counter
            counter += 1
            return '2026-11-19T00:00:' + str(counter).zfill(2) + '+00:00'
        self.s._next_write_time = next_time
        self.s._now = lambda: '2026-11-19T00:00:00+00:00'
        async def current_user():
            return self.user
        self.s.get_current_user = current_user
        self.review = {'review_id': 'r', 'client_id': 'c', 'framework_key': 'cis-ig1', 'framework_plan_key': 'asset-inventory',
                       'current_occurrence_id': 'o1', 'updated_at': 'v1', 'recurrence': 'semiannual', 'due_date': '2026-12-01'}
        await self.db.clients.insert_one({'client_id': 'c', 'status': 'active', 'updated_at': 'c1'})
        await self.db.reviews.insert_one(copy.deepcopy(self.review))

    async def body(self, review=None):
        review = review or self.review
        guide = await completion.get_contract(self.s, review, self.user)
        return {'occurrence_id': guide['occurrence_id'], 'expected_updated_at': review.get('updated_at'),
                'checklist': {'contract_token': guide['contract_token'], 'results': [
                    {'step_id': step['step_id'], 'result': 'Pass', 'reason': ''} for step in guide['steps']]},
                'outcome': 'No exceptions noted', 'supporting_reference': 'Completed cycle result record ABC'}

    async def test_exact_catalog_and_emitted_support(self):
        self.assertEqual(len(services.CATALOG['areas']), 23)
        self.assertEqual(len(services.CATALOG['tools']), 29)
        contract = completion.contract_for(self.review)
        self.assertEqual(contract['required_support'], ['Results for this review period'])
        self.assertEqual(len(contract['steps']), 6)
        self.assertNotIn('Dated inventory export', contract['required_support'])
        self.assertNotIn('Reconciliation notes', contract['required_support'])
        self.assertEqual(len({s['step_id'] for s in contract['steps']}), 6)
        renamed = {**self.review, 'title': 'Unfamiliar renamed work'}
        self.assertEqual(completion.contract_for(renamed), contract)

    async def test_every_current_framework_plan_has_explicit_semantic_mapping(self):
        from framework_catalog import CATALOGS, active_plans
        self.assertEqual(set(CATALOGS), {'cis-ig1', 'iso-27001', 'soc-2', 'hipaa', 'nist-csf-2', 'cmmc'})
        allowed = {*completion.TOPICS, *completion.RECORDS, 'native_only'}
        for key in CATALOGS:
            configuration = {'implementation_group': 3} if key == 'cis-ig1' else {'level': 2} if key == 'cmmc' else {}
            for plan in active_plans(key, configuration):
                review = {'review_id': 'mapped', 'client_id': 'c', 'framework_key': key, 'framework_plan_key': plan['key']}
                self.assertIn(completion.template_id(review), allowed, key + ':' + plan['key'])

    async def test_missing_unknown_nonpass_and_support_fail_before_any_mutation(self):
        original = await self.db.reviews.find_one({'review_id': 'r'})
        body = await self.body()
        failures = []
        missing = copy.deepcopy(body); missing['checklist']['results'].pop(); failures.append(missing)
        unknown = copy.deepcopy(body); unknown['checklist']['results'][0]['step_id'] = 'forged'; failures.append(unknown)
        nonpass = copy.deepcopy(body); nonpass['checklist']['results'][0].update(result='NMI', reason='  '); failures.append(nonpass)
        empty = copy.deepcopy(body); empty['supporting_reference'] = ''; failures.append(empty)
        for invalid in failures:
            with self.assertRaises(HTTPException):
                await completion.validate_completion(self.s, self.review, invalid, [], self.user)
            self.assertEqual(await self.db.reviews.find_one({'review_id': 'r'}), original)
            self.assertEqual(await self.db.findings.count_documents({}), 0)
        valid = await completion.validate_completion(self.s, self.review, body, [], self.user)
        self.assertEqual(len(valid['checklist_results']), 6)
        self.assertEqual(valid['checklist']['required_support'], ['Results for this review period'])

    async def test_ticket_only_invalid_and_combined_evidence_or_reference_valid(self):
        review = {**self.review, 'activity_setup': {'recurring_ticket_number': '12', 'recurring_ticket_url': 'https://tickets.example.test/12'}}
        body = await self.body(review)
        for value in ('12', '#12', 'https://tickets.example.test/12'):
            with self.assertRaises(HTTPException):
                await completion.validate_completion(self.s, review, {**body, 'supporting_reference': value}, [], self.user)
        content = b'Synthetic combined operating result'
        evidence = [{'evidence_id': 'e', 'filename': 'combined.pdf', 'client_id': 'c', 'occurrence_id': 'o1',
                     'linked_type': 'review', 'linked_id': 'r', 'version': 1,
                     'size': len(content), 'sha256': hashlib.sha256(content).hexdigest()}]
        await self.db.evidence.insert_one({**evidence[0], 'content_base64': base64.b64encode(content).decode('ascii')})
        result = await completion.validate_completion(self.s, review, {**body, 'supporting_reference': ''}, evidence, self.user)
        self.assertEqual(result['supporting_reference'], '')
        with self.assertRaises(HTTPException):
            await completion.validate_completion(self.s, review, body, [{**evidence[0], 'client_id': 'other'}], self.user)

    async def test_attachment_support_requires_available_exact_current_bytes(self):
        content = bytes(range(256)) + 'Synthetic r\u00e9sultat \u65e5\u672c\u8a9e \U0001f512'.encode('utf-8')
        metadata = {'evidence_id': 'native-support', 'client_id': 'c', 'filename': 'r\u00e9sultat.bin',
                    'linked_type': 'review', 'linked_id': 'r', 'occurrence_id': 'o1',
                    'version': 1, 'size': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
        stored = {**metadata, 'content_base64': base64.b64encode(content).decode('ascii')}
        body = {**await self.body(), 'supporting_reference': ''}
        cases = [
            ('metadata-only', {}),
            ('missing-content', {**stored, 'content_base64': None}),
            ('invalid-base64', {**stored, 'content_base64': '%%%'}),
            ('changed-content', {**stored, 'content_base64': base64.b64encode(b'changed').decode('ascii')}),
            ('changed-version', {**stored, 'version': 2}),
            ('changed-size', {**stored, 'size': len(content) + 1}),
            ('changed-sha', {**stored, 'sha256': '0' * 64}),
            ('wrong-tenant', {**stored, 'client_id': 'foreign'}),
            ('wrong-review', {**stored, 'linked_id': 'foreign'}),
            ('wrong-occurrence', {**stored, 'occurrence_id': 'o2'}),
            ('archived', {**stored, 'archived_at': '2026-11-01'}),
        ]
        for name, candidate in cases:
            with self.subTest(name=name):
                await self.db.evidence.delete_many({})
                await self.db.evidence.insert_one(copy.deepcopy(candidate or metadata))
                before = await self.db.evidence.find({}).to_list(None)
                with self.assertRaises(HTTPException) as denied:
                    await completion.validate_completion(self.s, self.review, body, [metadata], self.user)
                self.assertEqual(denied.exception.status_code, 422)
                self.assertEqual(await self.db.evidence.find({}).to_list(None), before)
                self.assertEqual(await self.db.reviews.find_one({'review_id': 'r'}, {'_id': 0}), self.review)
                fallback = {**body, 'supporting_reference': 'Completed result retained in synthetic case ' + name}
                if name in ('wrong-tenant', 'wrong-review', 'wrong-occurrence'):
                    with self.assertRaises(HTTPException) as scoped_denial:
                        await completion.validate_completion(self.s, self.review, fallback, [metadata], self.user)
                    self.assertEqual(scoped_denial.exception.status_code, 422)
                else:
                    # A reference may support validly linked metadata whose bytes are unavailable.
                    result = await completion.validate_completion(self.s, self.review, fallback, [metadata], self.user)
                    self.assertIn(name, result['supporting_reference'])
        await self.db.evidence.delete_many({})
        await self.db.evidence.insert_one(copy.deepcopy(stored))
        for field, value in [('version', True), ('version', 0), ('size', True), ('size', -1), ('sha256', 'not-a-sha')]:
            with self.subTest(invalid_metadata=field, value=value):
                with self.assertRaises(HTTPException):
                    await completion.validate_completion(self.s, self.review, body, [{**metadata, field: value}], self.user)
        for payload in (bytes(range(256)), 'Synthetic r\u00e9sultat \u65e5\u672c\u8a9e \U0001f512'.encode('utf-8'), b''):
            with self.subTest(valid_size=len(payload)):
                valid = {**metadata, 'size': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
                await self.db.evidence.replace_one({'evidence_id': metadata['evidence_id']},
                    {**valid, 'content_base64': base64.b64encode(payload).decode('ascii')})
                result = await completion.validate_completion(self.s, self.review, body, [valid], self.user)
                self.assertEqual(result['supporting_reference'], '')
                self.assertNotIn('content_base64', json.dumps(result))
        for relationship in (
                {'linked_type': 'reviews', 'linked_id': 'r', 'occurrence_id': 'o1'},
                {'linked_type': 'finding', 'linked_id': 'f', 'occurrence_id': None,
                 'relationships': [{'kind': 'reviews', 'id': 'r', 'occurrence_id': 'o1'}]},
                {'linked_type': 'review', 'linked_id': 'original-review', 'occurrence_id': 'original-occurrence',
                 'relationships': [{'kind': 'reviews', 'id': 'r', 'occurrence_id': 'o1'}]}):
            with self.subTest(native_relationship=relationship):
                await self.db.evidence.replace_one({'evidence_id': metadata['evidence_id']}, {**stored, **relationship})
                result = await completion.validate_completion(self.s, self.review, body, [{**metadata, **relationship}], self.user)
                self.assertEqual(result['supporting_reference'], '')
        initial_review = {**self.review, 'current_occurrence_id': 'occ_r'}
        initial_body = {**await self.body(initial_review), 'supporting_reference': ''}
        legacy = {**metadata, 'occurrence_id': None}
        await self.db.evidence.replace_one({'evidence_id': metadata['evidence_id']}, {**stored, 'occurrence_id': None})
        self.assertEqual((await completion.validate_completion(self.s, initial_review, initial_body, [legacy], self.user))['supporting_reference'], '')
        with self.assertRaises(HTTPException):
            await completion.validate_completion(self.s, self.review, body, [legacy], self.user)

    async def test_stale_revision_exception_rating_and_checkpoint_local_edits(self):
        body = await self.body()
        with self.assertRaises(HTTPException):
            await completion.validate_completion(self.s, self.review, {**body, 'expected_updated_at': 'stale'}, [], self.user)
        body['checklist']['results'][0].update(result='Exception', reason='Unexpected device found')
        body['outcome'] = 'Exceptions noted'
        for risk in ({'risk_assessment': {}}, {'risk_outcome': 'Reviewed — No Change'}):
            with self.assertRaises(HTTPException):
                await completion.validate_completion(self.s, self.review, {**body, **risk}, [], self.user)
        checkpoint = {'occurrence_id': 'o1', 'contract': completion.contract_for(self.review), 'results': []}
        with self.assertRaises(HTTPException):
            await completion.validate_completion(self.s, self.review, body, [], self.user)
        self.assertEqual(await self.db.findings.count_documents({}), 0)
        await self.db.findings.insert_one({'finding_id': 'f', 'client_id': 'c', 'review_id': 'r', 'occurrence_id': 'o1', 'status': 'open'})
        result = await completion.validate_completion(self.s, {**self.review, 'r4_current_checklist': checkpoint}, body, [], self.user)
        self.assertEqual(result['checklist_results'][0]['result'], 'Exception')

    async def test_custom_and_native_mapping_remain_distinct(self):
        self.assertTrue(completion.contract_for({'review_id': 'custom', 'client_id': 'c'})['custom'])
        self.assertTrue(completion.contract_for({**self.review, 'framework_plan_key': 'iso-internal-audit'})['native_gate'])
        with self.assertRaises(HTTPException):
            completion.contract_for({**self.review, 'framework_plan_key': 'unknown-native-plan'})
        frozen = completion.contract_for(self.review)
        self.assertEqual(completion.contract_for({**self.review, 'r4_current_checklist': {'occurrence_id': 'o1', 'contract': frozen}}, {'areas': {'endpoint': {'responsibility': 'cl'}}}), frozen)
        next_cycle = completion.contract_for({**self.review, 'current_occurrence_id': 'o2', 'r4_current_checklist': {'occurrence_id': 'o1', 'contract': frozen}}, {'areas': {'endpoint': {'responsibility': 'cl'}}})
        self.assertNotEqual(next_cycle['contract_token'], frozen['contract_token'])

    async def test_write_claim_conflict_changes_no_business_values(self):
        await self.db.clients.insert_one({'client_id': 'other', 'updated_at': 'new', 'name': 'Retained'})
        writes = [services.write_row('clients', 'client_id', {'client_id': 'c', 'updated_at': 'c1'}, {'name': 'Changed'}),
                  services.write_row('clients', 'client_id', {'client_id': 'other', 'updated_at': 'old'}, {'name': 'Wrong'})]
        async def execute(identity):
            await services.apply_plan(self.s, writes, identity, self.user, 'Test configuration')
        with self.assertRaises(HTTPException):
            await create_requests.run(self.db, 'conflict_intent_0001', 'owner', 'c', 'r4/test', {}, execute)
        current = await self.db.clients.find_one({'client_id': 'c'})
        self.assertNotIn('name', current)
        self.assertNotIn('_r4_context_pending', current)
        self.assertEqual((await self.db.clients.find_one({'client_id': 'other'}))['name'], 'Retained')

    async def test_native_review_execution_and_accepted_annual_plan_block_context_claim_before_business_writes(self):
        for key, value in (('_execution_lock', {'token': 'native-action', 'until': '2099-01-01T00:00:00+00:00'}),
                           ('_policy_coverage_pending', {'identity_validation_version': 1, 'occurrence_id': 'o1'})):
            with self.subTest(key=key):
                await self.db.reviews.update_one({'review_id': 'r'}, {'$set': {key: value}})
                before_client = await self.db.clients.find_one({'client_id': 'c'})
                before_review = await self.db.reviews.find_one({'review_id': 'r'})
                writes = [services.write_row('clients', 'client_id', before_client, {'name': 'Must not save'}),
                          services.write_row('reviews', 'review_id', before_review, {'title': 'Must not save'})]
                async def execute(identity):
                    await services.apply_plan(self.s, writes, identity, self.user, 'Blocked context')
                with self.assertRaises(HTTPException) as caught:
                    await create_requests.run(self.db, 'native_guard_' + key, 'owner', 'c', 'r4/context', {}, execute)
                self.assertEqual(caught.exception.status_code, 409)
                self.assertEqual(await self.db.clients.find_one({'client_id': 'c'}), before_client)
                self.assertEqual(await self.db.reviews.find_one({'review_id': 'r'}), before_review)
                self.assertEqual(self.audits, [])
                await self.db.reviews.update_one({'review_id': 'r'}, {'$unset': {key: ''}})
        await self.db.reviews.update_one({'review_id': 'r'}, {'$set': {
            '_execution_lock': {'token': 'abandoned-action', 'until': '2000-01-01T00:00:00+00:00'}}})
        current = await self.db.reviews.find_one({'review_id': 'r'})
        writes = [services.write_row('reviews', 'review_id', current, {'title': 'Saved after expired lease'})]
        async def execute_expired(identity):
            await services.apply_plan(self.s, writes, identity, self.user, 'Expired lease context')
            return {'ok': True}
        self.assertEqual(await create_requests.run(self.db, 'expired_native_guard_0001', 'owner', 'c', 'r4/context', {}, execute_expired), {'ok': True})
        self.assertEqual((await self.db.reviews.find_one({'review_id': 'r'}))['title'], 'Saved after expired lease')

    async def test_retained_intent_recovers_partial_write_without_repeating_applied_record(self):
        client = await self.db.clients.find_one({'client_id': 'c'}, {'_id': 0})
        writes = [services.write_row('clients', 'client_id', client, {'name': 'Saved', 'updated_at': 'c2'}),
                  services.write_row('reviews', 'review_id', self.review, {'title': 'Saved activity', 'updated_at': 'v2'})]
        real_update = self.db.reviews.update_one
        review_collection = self.db.reviews
        database = self.db
        class DatabaseProxy:
            def __getattr__(self, name):
                return getattr(database, name)
            def __getitem__(self, name):
                return review_collection if name == 'reviews' else database[name]
        self.s.db = DatabaseProxy()
        failed = False
        async def fail_once(query, update, **kwargs):
            nonlocal failed
            if '_r4_context_applied' in update.get('$set', {}) and not failed:
                failed = True
                raise RuntimeError('injected storage interruption')
            return await real_update(query, update, **kwargs)
        async def execute(identity):
            await services.apply_plan(self.s, writes, identity, self.user, 'Test configuration')
            return {'ok': True}
        with patch.object(review_collection, 'update_one', fail_once):
            with self.assertRaises(HTTPException) as raised:
                await create_requests.run(self.db, 'recovery_intent_0001', 'owner', 'c', 'r4/test', {}, execute)
            self.assertEqual(raised.exception.status_code, 503)
            with self.assertRaises(HTTPException):
                services.assert_settled(await self.db.clients.find_one({'client_id': 'c'}))
            self.assertEqual(await create_requests.run(self.db, 'recovery_intent_0001', 'owner', 'c', 'r4/test', {}, execute), {'ok': True})
        self.assertEqual((await self.db.reviews.find_one({'review_id': 'r'}))['title'], 'Saved activity')
        self.assertEqual((await self.db.clients.find_one({'client_id': 'c'}))['updated_at'], 'c2')
        self.assertNotIn('_r4_context_pending', await self.db.clients.find_one({'client_id': 'c'}))
        audit_count = len(self.audits)
        await create_requests.run(self.db, 'recovery_intent_0001', 'owner', 'c', 'r4/test', {}, execute)
        self.assertEqual(len(self.audits), audit_count)

    async def test_services_router_read_is_inert_and_actual_save_retains_intent(self):
        app = FastAPI(); app.include_router(services.router_for(self.s))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://isolated.test') as client:
            original = await self.db.clients.find_one({'client_id': 'c'})
            self.assertEqual((await client.get('/api/clients/c/services')).status_code, 200)
            self.assertEqual(await self.db.clients.find_one({'client_id': 'c'}), original)
            self.assertEqual(await self.db.tool_catalog.count_documents({}), 0)
            body = {'expected_updated_at': 'c1', 'areas': {'endpoint': {'responsibility': 'iv', 'tool_ids': ['ninjaone']}}}
            headers = {'Idempotency-Key': 'services_intent_0001'}
            response = await client.post('/api/clients/c/services', json=body, headers=headers)
            self.assertEqual(response.status_code, 200, response.text)
            saved = await self.db.clients.find_one({'client_id': 'c'})
            self.assertEqual(saved['profile']['services']['areas']['endpoint']['tool_ids'], ['ninjaone'])
            provider = await self.db.vendors.find_one({'vendor_id': saved['profile']['services']['provider_vendor_id']})
            self.assertTrue(provider['criticality_provisional'])
            self.assertEqual(provider['data_relationship'], [])
            self.assertIsNone(provider['business_owner_id'])
            self.assertFalse(provider['assurance_required'])
            self.assertEqual(provider['status'], 'onboarding')
            self.assertEqual((await client.post('/api/clients/c/services', json=body, headers=headers)).status_code, 200)
            self.assertEqual(await self.db.clients.find_one({'client_id': 'c'}), saved)
            invalid = {**body, 'expected_updated_at': saved['updated_at'], 'areas': {'endpoint': {'responsibility': 'invented', 'tool_ids': []}}}
            self.assertEqual((await client.post('/api/clients/c/services', json=invalid, headers={'Idempotency-Key': 'services_invalid_0001'})).status_code, 422)
            self.assertEqual(await self.db.clients.find_one({'client_id': 'c'}), saved)

    async def test_setup_done_requires_a_valid_native_recurring_schedule_without_get_writes(self):
        await self.db.clients.update_one({'client_id': 'c'}, {'$set': {
            'framework_settings': {'cis-ig1': {'implementation_group': 1}},
            'profile.services': {'areas': {'endpoint': {'responsibility': 'iv', 'tool_ids': []}}}}})
        await self.db.requirements.insert_one({'client_id': 'c', 'baseline_key': 'cis-ig1', 'baseline_response': 'applies'})
        await self.db.reviews.update_one({'review_id': 'r'}, {'$set': {'activity_setup': {'recurring_ticket_number': '123'}}})
        client = await self.db.clients.find_one({'client_id': 'c'})
        for change in ({'due_date': 'invalid'}, {'recurrence': 'unknown'},
                       {'recurrence': 'custom', 'custom_recurrence_days': 0},
                       {'recurrence': 'custom', 'custom_recurrence_days': 3661}):
            with self.subTest(change=change):
                await self.db.reviews.update_one({'review_id': 'r'}, {'$set': {
                    'due_date': '2026-12-01', 'recurrence': 'annual', **change}})
                before = await self.db.reviews.find({}, {'_id': 0}).to_list(None)
                rows = await services.activities(self.s, client)
                self.assertEqual(next(row for row in rows if row['review_id'] == 'r')['state'], 'todo')
                self.assertEqual(await self.db.reviews.find({}, {'_id': 0}).to_list(None), before)
        await self.db.reviews.update_one({'review_id': 'r'}, {'$set': {'due_date': '2026-12-01', 'recurrence': 'annual'}})
        self.assertEqual(next(row for row in await services.activities(self.s, client) if row['review_id'] == 'r')['state'], 'done')

    async def test_catalog_replace_checks_every_tenant_before_any_write_and_preserves_history(self):
        for cid in ('c', 'other'):
            await self.db.clients.update_one({'client_id': cid}, {'$set': {'status': 'active', 'updated_at': 'v1',
                'profile.services': {'areas': {'endpoint': {'responsibility': 'iv', 'tool_ids': ['ninjaone']}}}}}, upsert=True)
        history = {'tool_id': 'ninjaone', 'name': 'Original historical tool'}
        await self.db.reviews.update_one({'review_id': 'r'}, {'$set': {'occurrences': [{'occurrence_id': 'old', 'service_context': [history]}]}})
        self.user = {'user_id': 'provider', 'role': 'platform_admin', 'client_ids': ['c'], 'status': 'active'}
        app = FastAPI(); app.include_router(services.router_for(self.s))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://isolated.test') as client:
            payload = {'replacement_id': 'intune', 'expected_updated_at': None, 'retire': True}
            denied = await client.post('/api/tool-catalog/ninjaone/replace', json=payload, headers={'Idempotency-Key': 'replace_denied_0001'})
            self.assertEqual(denied.status_code, 403, denied.text)
            for cid in ('c', 'other'):
                self.assertEqual((await self.db.clients.find_one({'client_id': cid}))['profile']['services']['areas']['endpoint']['tool_ids'], ['ninjaone'])
            self.user['all_clients'] = True
            accepted = await client.post('/api/tool-catalog/ninjaone/replace', json=payload, headers={'Idempotency-Key': 'replace_allowed_0001'})
            self.assertEqual(accepted.status_code, 200, accepted.text)
            for cid in ('c', 'other'):
                self.assertEqual((await self.db.clients.find_one({'client_id': cid}))['profile']['services']['areas']['endpoint']['tool_ids'], ['intune'])
            self.assertTrue((await self.db.tool_catalog.find_one({'tool_id': 'ninjaone'}))['retired'])
            self.assertEqual((await self.db.reviews.find_one({'review_id': 'r'}))['occurrences'][0]['service_context'], [history])


class R4EvidenceSupportRouteTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = native_fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = native_fixture.ClientDashboardSourcesTests.sign_in

    async def test_native_upload_bytes_required_without_rewriting_saved_history(self):
        self.sign_in('admin')
        server = native_fixture.server
        for content in (bytes(range(256)), 'Synthetic r\u00e9sultat \u65e5\u672c\u8a9e \U0001f512'.encode('utf-8')):
            created = await self.client.post('/api/risks', json={'client_id': 'a',
                'title': 'Synthetic byte-qualified Review', 'owner_id': 'admin',
                'next_review': '2099-12-31', 'review_cadence': 'annual'})
            self.assertEqual(created.status_code, 200, created.text)
            review = await server.db.reviews.find_one({'risk_id': created.json()['risk_id']}, {'_id': 0})
            path = '/api/reviews/' + review['review_id']
            guide = (await self.client.get(path + '/completion-guide')).json()
            body = {'occurrence_id': guide['occurrence_id'], 'expected_updated_at': guide['expected_updated_at'],
                'checklist': {'contract_token': guide['contract_token'], 'results': [
                    {'step_id': step['step_id'], 'result': 'Pass', 'reason': ''} for step in guide['steps']]},
                'outcome': 'No exceptions noted', 'supporting_reference': ''}
            original = await self.client.post('/api/reviews', json={'client_id': 'a', 'title': 'Synthetic original upload provenance',
                'review_type': 'governance', 'owner_id': 'admin', 'due_date': '2099-01-01', 'recurrence': 'annual'})
            self.assertEqual(original.status_code, 200, original.text)
            old = original.json()
            upload = await self.client.post('/api/evidence', json={'client_id': 'a', 'filename': 'r\u00e9sultat.bin',
                'linked_type': 'review', 'linked_id': old['review_id'], 'occurrence_id': old['current_occurrence_id'],
                'content_base64': base64.b64encode(content).decode('ascii')})
            self.assertEqual(upload.status_code, 200, upload.text)
            eid = upload.json()['evidence_id']
            linked = await self.client.post('/api/evidence-library/items/' + eid + '/relationships', json={
                'linked_type': 'review', 'linked_id': review['review_id'], 'occurrence_id': guide['occurrence_id'],
                'expected_updated_at': upload.json().get('updated_at')})
            self.assertEqual(linked.status_code, 200, linked.text)
            retained = await server.db.evidence.find_one({'evidence_id': eid}, {'_id': 0})
            # Simulate unavailable storage after a genuine native upload; metadata alone must fail.
            await server.db.evidence.update_one({'evidence_id': eid}, {'$unset': {'content_base64': ''}})
            collections = ('reviews', 'risks', 'evidence', 'findings', 'tasks', 'audit_logs')
            before = {name: await server.db[name].find({}, {'_id': 0}).to_list(None) for name in collections}
            denied = await self.client.post(path + '/complete', json=body)
            self.assertEqual(denied.status_code, 422, denied.text)
            self.assertEqual({name: await server.db[name].find({}, {'_id': 0}).to_list(None) for name in collections}, before)
            await server.db.evidence.update_one({'evidence_id': eid},
                {'$set': {'content_base64': base64.b64encode(content).decode('ascii')}})
            accepted = await self.client.post(path + '/complete', json=body)
            self.assertEqual(accepted.status_code, 200, accepted.text)
            occurrence = accepted.json()['occurrence']
            self.assertEqual(occurrence['supporting_reference'], '')
            self.assertEqual(occurrence['evidence'], [{'evidence_id': eid, 'filename': 'r\u00e9sultat.bin',
                'version': 1, 'sha256': hashlib.sha256(content).hexdigest()}])
            self.assertNotIn('content_base64', json.dumps(accepted.json()))
            download = await self.client.get('/api/evidence/' + eid + '/download')
            self.assertEqual(download.status_code, 200, download.text)
            self.assertEqual(base64.b64decode(download.json()['content_base64']), content)
            self.assertEqual(await server.db.evidence.find_one({'evidence_id': eid}, {'_id': 0}), retained)
            original_after = await server.db.reviews.find_one({'review_id': old['review_id']}, {'_id': 0})
            self.assertEqual(original_after['current_occurrence_id'], old['current_occurrence_id'])
            self.assertEqual(original_after.get('occurrences', []), old.get('occurrences', []))


if __name__ == '__main__':
    unittest.main()
