"""R4 AI decisions use native identity, saved boundaries and stale-write checks.

All requests run against the existing isolated ASGI/Mongo fixture. No hosted
database, provider or authentication integration is used.
"""
import asyncio
import copy
import unittest
import uuid
from unittest.mock import AsyncMock, patch

import test_client_dashboard_sources as fixture
import test_ai_onboarding as onboarding_fixture
import create_requests
from pymongo.errors import DuplicateKeyError

server = fixture.server


class R4AIApprovalTests(unittest.IsolatedAsyncioTestCase):
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await fixture.ClientDashboardSourcesTests.asyncSetUp(self)
        # These tests supply the version actually opened. In particular, missing
        # version tests must never be repaired by the shared fresh-editor hook.
        self.client.event_hooks['request'] = []
        self.sign_in('admin')

    async def create_ai(self, **changes):
        body = {
            'client_id': 'a', 'name': 'Synthetic R4 AI ' + uuid.uuid4().hex,
            'status': 'active', 'environment': 'Synthetic managed workspace',
            'description': 'Draft synthetic public text with human review',
            'restrictions': 'Human review before use; public information only',
            'permitted_data_types': ['Public'], **changes,
        }
        response = await self.client.post('/api/ai_systems', json=body,
            headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def decide(self, row, status='approved', **changes):
        return await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/approval',
            json={'status': status, 'note': 'Synthetic saved-scope decision',
                'expected_updated_at': row.get('updated_at'), **changes})

    async def stored(self, row):
        return await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']}, {'_id': 0})

    async def test_new_records_start_pending_and_reads_do_not_backfill_legacy_decisions(self):
        row = await self.create_ai()
        self.assertEqual(row['approval_status'], 'pending_assessment')
        self.assertNotIn('approval_history', row)
        legacy = {**row, 'ai_system_id': 'synthetic-legacy-ai', 'display_id': 'AI-LEGACY',
                  'name': 'Synthetic legacy AI'}
        legacy.pop('approval_status')
        legacy.pop('ai_name_key')
        await server.db.ai_systems.insert_one(copy.deepcopy(legacy))
        before = await self.stored(legacy)
        loaded = (await self.client.get('/api/ai_systems?client_id=a')).json()
        old = next(item for item in loaded if item['ai_system_id'] == legacy['ai_system_id'])
        self.assertNotIn('approval_status', old)
        self.assertNotIn('approval_history', old)
        self.assertEqual(await self.stored(legacy), before)
        for kind in ('reviews', 'risks', 'vendors', 'findings', 'tasks'):
            self.assertEqual(await server.db[kind].count_documents({}), 0, kind)

    async def test_decisions_append_actual_actor_and_saved_scope_without_completing_work(self):
        row = await self.create_ai()
        created_at = row['created_at']
        scheduled = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/reviews',
            json={'due_date': '2027-01-31', 'recurrence': 'annual'})
        self.assertEqual(scheduled.status_code, 200, scheduled.text)
        review_before = await server.db.reviews.find_one({'review_id': scheduled.json()['review_id']})
        for index, status in enumerate(('approved', 'approved_with_conditions', 'not_approved'), 1):
            response = await self.decide(row, status, note='  Synthetic decision ' + str(index) + '  ')
            self.assertEqual(response.status_code, 200, response.text)
            row = response.json()
            self.assertEqual((row['status'], row['approval_status']), ('active', status))
            self.assertEqual(len(row['approval_history']), index)
            decision = row['approval_history'][-1]
            self.assertEqual((decision['by'], decision['by_name']), ('admin', 'admin'))
            self.assertEqual(decision['note'], 'Synthetic decision ' + str(index))
            self.assertEqual(decision['scope']['description'], row['description'])
            self.assertEqual(decision['scope']['permitted_data_types'], ['Public'])
            self.assertEqual(decision['scope']['restrictions'], row['restrictions'])
            self.assertEqual(decision['at'], row['updated_at'])
            self.assertEqual(row['created_at'], created_at)
        loaded = (await self.client.get('/api/ai_systems?client_id=a')).json()[0]
        self.assertEqual(loaded['approval_history'], row['approval_history'])
        self.assertEqual(await server.db.reviews.find_one({'review_id': scheduled.json()['review_id']}), review_before)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI approval decision recorded'}), 3)

    async def test_approval_denies_invalid_or_missing_basis_without_changing_record(self):
        for changes in ({'environment': ''}, {'description': ''}, {'permitted_data_types': []}, {'restrictions': ''}):
            with self.subTest(changes=changes):
                row = await self.create_ai(**changes)
                before = await self.stored(row)
                response = await self.decide(row, 'approved_with_conditions')
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(await self.stored(row), before)
                denied = await self.decide(row, 'not_approved')
                self.assertEqual(denied.status_code, 200, denied.text)
                self.assertEqual(denied.json()['approval_status'], 'not_approved')

    async def test_completed_native_ai_review_does_not_authorize_use(self):
        row = await self.create_ai()
        scheduled = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/reviews',
            json={'due_date': '2027-01-31', 'recurrence': 'annual'})
        self.assertEqual(scheduled.status_code, 200, scheduled.text)
        review = scheduled.json()
        path = '/api/reviews/' + review['review_id']
        started = await self.client.post(path + '/start', json={'occurrence_id': review['current_occurrence_id']})
        self.assertEqual(started.status_code, 200, started.text)
        guide = await self.client.get(path + '/completion-guide')
        self.assertEqual(guide.status_code, 200, guide.text)
        contract = guide.json()
        completed = await self.client.post(path + '/complete', json={
            'occurrence_id': contract['occurrence_id'],
            'expected_updated_at': contract['expected_updated_at'],
            'checklist': {'contract_token': contract['contract_token'],
                'results': [{'step_id': step['step_id'], 'result': 'Pass'} for step in contract['steps']]},
            'outcome': 'No exceptions noted',
            'supporting_reference': 'Synthetic completed governance result R4-AI-REVIEW-001',
        })
        self.assertEqual(completed.status_code, 200, completed.text)
        current = (await self.client.get('/api/ai_systems?client_id=a')).json()[0]
        self.assertEqual(current['approval_status'], 'pending_assessment')
        self.assertNotIn('approval_history', current)
        self.assertTrue(current['last_review'])
        self.assertTrue(current['next_review'])
        saved_review = await server.db.reviews.find_one({'review_id': review['review_id']})
        self.assertEqual(len(saved_review['occurrences']), 1)
        self.assertNotEqual(saved_review['current_occurrence_id'], contract['occurrence_id'])

    async def test_decision_input_and_stale_versions_are_rejected_before_mutation(self):
        row = await self.create_ai()
        before = await self.stored(row)
        base = {'status': 'approved', 'note': 'Synthetic decision', 'expected_updated_at': row['updated_at']}
        invalid = [
            {**base, 'status': 'active'}, {**base, 'note': ''}, {**base, 'note': ' \t '},
            {**base, 'note': 'n' * 10001}, {**base, 'note': {'forged': 'object'}},
            {**base, 'expected_updated_at': True}, {**base, 'by': 'another-account'},
            {**base, 'scope': {'description': 'Caller-selected scope'}}, {**base, 'client_id': 'b'},
        ]
        for body in invalid:
            with self.subTest(body=body):
                response = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/approval', json=body)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(await self.stored(row), before)
        missing = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/approval',
            json={'status': 'approved', 'note': 'Synthetic decision'})
        self.assertEqual(missing.status_code, 428, missing.text)
        approved = await self.decide(row)
        self.assertEqual(approved.status_code, 200, approved.text)
        current = await self.stored(row)
        stale = await self.decide(row, 'not_approved')
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(await self.stored(row), current)
        self.assertEqual(len(current['approval_history']), 1)

    async def test_legacy_null_snapshot_and_monotonic_decision_version(self):
        row = await self.create_ai()
        await server.db.ai_systems.update_one({'ai_system_id': row['ai_system_id']}, {'$unset': {'updated_at': ''}})
        row.pop('updated_at')
        response = await self.decide(row)
        self.assertEqual(response.status_code, 200, response.text)
        row = response.json()
        with patch.object(server, '_now', return_value=row['updated_at']):
            second = await self.decide(row, 'not_approved')
        self.assertEqual(second.status_code, 200, second.text)
        self.assertGreater(second.json()['updated_at'], row['updated_at'])
        self.assertEqual(len(second.json()['approval_history']), 2)

    async def test_governance_roles_and_client_scope_come_from_current_account(self):
        own = await self.create_ai()
        foreign = await self.create_ai(client_id='b')
        self.sign_in('member')
        for role in ('client_contributor', 'client_grc_manager', 'client_readonly', 'client_viewer'):
            await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': role}})
            before = await self.stored(own)
            denied = await self.decide(own)
            self.assertEqual(denied.status_code, 403, denied.text)
            self.assertEqual(await self.stored(own), before)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'platform_admin'}})
        before = await self.stored(foreign)
        denied = await self.decide(foreign)
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(await self.stored(foreign), before)
        allowed = await self.decide(own)
        self.assertEqual(allowed.status_code, 200, allowed.text)
        self.assertEqual(allowed.json()['approval_history'][-1]['by'], 'member')
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'client_ids': []}})
        denied = await self.decide(allowed.json())
        self.assertEqual(denied.status_code, 403, denied.text)

    async def test_client_lifecycle_and_retired_record_keep_history_read_only(self):
        row = await self.create_ai()
        for changes, status in (({'status': 'archived'}, 403), ({'status': 'inactive'}, 422),
                                ({'archived': True}, 422), ({'archived_at': '2026-01-01'}, 422)):
            with self.subTest(changes=changes):
                await server.db.clients.update_one({'client_id': 'a'},
                    {'$set': {'status': 'active'}, '$unset': {'archived': '', 'archived_at': ''}})
                await server.db.clients.update_one({'client_id': 'a'}, {'$set': changes})
                before = await self.stored(row)
                denied = await self.decide(row)
                self.assertEqual(denied.status_code, status, denied.text)
                self.assertEqual(await self.stored(row), before)
        await server.db.clients.update_one({'client_id': 'a'},
            {'$set': {'status': 'active'}, '$unset': {'archived': '', 'archived_at': ''}})
        approved = (await self.decide(row)).json()
        retired = await self.client.patch('/api/ai_systems/' + row['ai_system_id'],
            json={'status': 'retired', 'expected_updated_at': approved['updated_at']})
        self.assertEqual(retired.status_code, 200, retired.text)
        before = await self.stored(row)
        denied = await self.decide(retired.json(), 'not_approved')
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertEqual(await self.stored(row), before)
        self.assertEqual(before['approval_history'], approved['approval_history'])

    async def test_material_scope_save_requires_reassessment_and_keeps_original_decision(self):
        row = (await self.decide(await self.create_ai())).json()
        original = copy.deepcopy(row['approval_history'])
        path = '/api/ai_systems/' + row['ai_system_id']
        unchanged = await self.client.patch(path, json={
            'description': row['description'], 'expected_updated_at': row['updated_at']})
        self.assertEqual(unchanged.status_code, 200, unchanged.text)
        self.assertEqual(unchanged.json()['approval_status'], 'approved')
        changed = await self.client.patch(path, json={
            'description': 'New synthetic customer-facing use',
            'expected_updated_at': unchanged.json()['updated_at']})
        self.assertEqual(changed.status_code, 200, changed.text)
        current = changed.json()
        self.assertEqual(current['approval_status'], 'pending_assessment')
        self.assertEqual(current['approval_history'], original)
        self.assertEqual(original[-1]['scope']['description'], row['description'])
        self.assertEqual(current['material_change_at'], current['updated_at'])
        forged = await self.client.patch(path, json={
            'approval_status': 'approved', 'expected_updated_at': current['updated_at']})
        self.assertEqual(forged.status_code, 422, forged.text)
        again = await self.decide(current)
        self.assertEqual(again.status_code, 200, again.text)
        self.assertEqual(again.json()['approval_history'][:-1], original)
        self.assertEqual(again.json()['approval_history'][-1]['scope']['description'], current['description'])

    async def test_versioned_screening_reassessment_preserves_native_onboarding_links_and_history(self):
        body = onboarding_fixture.AIOnboardingTests.payload(self)
        response = await self.client.post('/api/ai_systems/onboard', json=body,
            headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        row = (await self.decide(result['ai_system'])).json()
        original = copy.deepcopy(row['onboarding_screening'])
        history = copy.deepcopy(row['approval_history'])
        related = {kind: await server.db[kind].find({}).to_list(None) for kind in ('reviews', 'risks', 'vendors')}
        path = '/api/ai_systems/' + row['ai_system_id']
        reconfirmed = await self.client.patch(path, json={'onboarding_screening': {**body['screening'], 'reviewed': True},
            'expected_updated_at': row['updated_at']})
        self.assertEqual(reconfirmed.status_code, 200, reconfirmed.text)
        self.assertEqual(reconfirmed.json()['approval_status'], 'approved')
        answers = {**body['screening']['answers'], 'managed': not body['screening']['answers']['managed']}
        changed = await self.client.patch(path, json={'onboarding_screening': {
            **body['screening'], 'answers': answers, 'reviewed': True},
            'expected_updated_at': reconfirmed.json()['updated_at']})
        self.assertEqual(changed.status_code, 200, changed.text)
        current = changed.json()
        self.assertEqual(current['approval_status'], 'pending_assessment')
        self.assertEqual(current['approval_history'], history)
        self.assertEqual(current['onboarding_screening']['answers'], answers)
        self.assertEqual(current['onboarding_screening']['recorded_at'], original['recorded_at'])
        self.assertEqual(current['onboarding_screening']['recorded_by'], original['recorded_by'])
        self.assertEqual(current['onboarding_screening']['history'][0], original)
        self.assertEqual(current['related_links'], row['related_links'])
        self.assertEqual(current['vendor_id'], result['vendor_id'])
        self.assertEqual(history[-1]['scope']['onboarding_screening']['answers'], original['answers'])
        for kind, before in related.items():
            self.assertEqual(await server.db[kind].find({}).to_list(None), before, kind)
        stale = await self.client.patch(path, json={'onboarding_screening': {
            **body['screening'], 'reviewed': True}, 'expected_updated_at': row['updated_at']})
        self.assertEqual(stale.status_code, 409, stale.text)

    async def test_explicit_material_change_is_versioned_and_does_not_duplicate_reviews(self):
        row = (await self.decide(await self.create_ai())).json()
        path = '/api/ai_systems/' + row['ai_system_id'] + '/material-change'
        before = await self.stored(row)
        missing = await self.client.post(path, json={'note': 'Synthetic material change'})
        self.assertEqual(missing.status_code, 428, missing.text)
        forged = await self.client.post(path, json={'note': 'Synthetic material change',
            'expected_updated_at': row['updated_at'], 'approval_status': 'approved'})
        self.assertEqual(forged.status_code, 422, forged.text)
        self.assertEqual(await self.stored(row), before)
        changed = await self.client.post(path, json={'note': '  Synthetic material change  ',
            'expected_updated_at': row['updated_at']})
        self.assertEqual(changed.status_code, 200, changed.text)
        current = changed.json()
        self.assertEqual(current['approval_status'], 'pending_assessment')
        self.assertEqual(current['approval_history'], row['approval_history'])
        self.assertEqual(current['material_change_note'], 'Synthetic material change')
        self.assertEqual(await server.db.reviews.count_documents({}), 0)
        self.assertEqual(await server.db.findings.count_documents({}), 0)
        saved = await self.stored(row)
        stale = await self.client.post(path, json={'note': 'Stale intent', 'expected_updated_at': row['updated_at']})
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(await self.stored(row), saved)

    async def test_parallel_decisions_do_not_replace_history_or_decide_twice(self):
        row = await self.create_ai()
        responses = await asyncio.gather(self.decide(row), self.decide(row, 'not_approved'))
        self.assertEqual(sorted(response.status_code for response in responses), [200, 409])
        current = await self.stored(row)
        self.assertEqual(len(current['approval_history']), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI approval decision recorded'}), 1)

    async def test_compare_and_swap_does_not_approve_over_concurrent_saved_edit(self):
        row = await self.create_ai()
        collection_type = type(server.db.ai_systems)
        update = collection_type.update_one

        async def concurrent_edit(collection, query, changes, *args, **kwargs):
            if collection.name == 'ai_systems' and 'approval_history' in changes.get('$push', {}):
                await update(collection, {'ai_system_id': row['ai_system_id']}, {'$set': {
                    'updated_at': '2099-01-01T00:00:00+00:00', 'restrictions': 'Parallel saved boundary'}})
            return await update(collection, query, changes, *args, **kwargs)

        with patch.object(collection_type, 'update_one', new=concurrent_edit):
            response = await self.decide(row)
        self.assertEqual(response.status_code, 409, response.text)
        current = await self.stored(row)
        self.assertEqual(current['restrictions'], 'Parallel saved boundary')
        self.assertEqual(current['updated_at'], '2099-01-01T00:00:00+00:00')
        self.assertEqual(current['approval_status'], 'pending_assessment')
        self.assertNotIn('approval_history', current)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI approval decision recorded'}), 0)

    async def test_same_client_duplicate_names_are_denied_without_merging_record_identity(self):
        row = await self.create_ai(name='Synthetic [AI] (2)')
        other = await self.create_ai()
        foreign = await self.create_ai(client_id='b', name=row['name'])
        self.assertNotEqual(foreign['ai_system_id'], row['ai_system_id'])
        created = await self.client.post('/api/ai_systems', json={
            'client_id': 'a', 'name': '  SYNTHETIC [ai] (2)  '},
            headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(created.status_code, 409, created.text)
        before = await self.stored(other)
        renamed = await self.client.patch('/api/ai_systems/' + other['ai_system_id'], json={
            'name': row['name'], 'expected_updated_at': other['updated_at']})
        self.assertEqual(renamed.status_code, 409, renamed.text)
        self.assertEqual(await self.stored(other), before)
        self.assertEqual(await server.db.ai_systems.count_documents({'client_id': 'a'}), 2)

    async def test_legacy_duplicate_names_remain_editable_without_backfilling_name_keys(self):
        row = await self.create_ai()
        for identity in ('synthetic-legacy-one', 'synthetic-legacy-two'):
            legacy = {**row, 'ai_system_id': identity, 'display_id': identity, 'name': 'Synthetic retained duplicate'}
            legacy.pop('ai_name_key')
            legacy.pop('approval_status')
            await server.db.ai_systems.insert_one(legacy)
            response = await self.client.patch('/api/ai_systems/' + identity, json={
                'environment': 'Deliberate synthetic environment edit',
                'expected_updated_at': legacy['updated_at']})
            self.assertEqual(response.status_code, 200, response.text)
            saved = await self.stored(legacy)
            self.assertEqual(saved['ai_system_id'], identity)
            self.assertNotIn('ai_name_key', saved)
            self.assertNotIn('approval_status', saved)
        duplicate = await self.client.post('/api/ai_systems', json={
            'client_id': 'a', 'name': 'synthetic retained duplicate'},
            headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(duplicate.status_code, 409, duplicate.text)
        self.assertEqual(await server.db.ai_systems.count_documents({'name': 'Synthetic retained duplicate'}), 2)

    async def test_new_name_index_rejects_concurrent_duplicates_in_isolated_mock_storage(self):
        # This checks native error handling with the same index definition.
        # Actual Mongo index/race qualification is a separate required gate.
        await server.db.ai_systems.create_index([('client_id', 1), ('ai_name_key', 1)],
            unique=True, partialFilterExpression={'ai_name_key': {'$type': 'string'}},
            name='ai_client_name_key_unique')
        body = {'client_id': 'a', 'name': 'Synthetic concurrent identity'}
        collection_type = type(server.db.ai_systems)
        find = collection_type.find_one
        ready = asyncio.Event()
        name_reads = 0

        async def simultaneous_absence(collection, query, *args, **kwargs):
            nonlocal name_reads
            result = await find(collection, query, *args, **kwargs)
            if collection.name == 'ai_systems' and any('ai_name_key' in choice for choice in query.get('$or', [])):
                name_reads += 1
                if name_reads == 2:
                    ready.set()
                await asyncio.wait_for(ready.wait(), timeout=5)
            return result

        with patch.object(collection_type, 'find_one', new=simultaneous_absence):
            keys = [uuid.uuid4().hex for _ in range(2)]
            responses = await asyncio.gather(*(
                self.client.post('/api/ai_systems', json=body, headers={'Idempotency-Key': key})
                for key in keys))
        self.assertEqual(name_reads, 2)
        self.assertEqual(sorted(response.status_code for response in responses), [200, 409])
        self.assertEqual(await server.db.ai_systems.count_documents({'client_id': 'a'}), 1)
        kept = await server.db.ai_systems.find_one({'client_id': 'a'})
        self.assertEqual(kept['ai_name_key'], body['name'].lower())
        rejected = next(response for response in responses if response.status_code == 409)
        self.assertEqual(rejected.headers.get('x-create-rejected'), 'true')
        failed_key = next(key for key, response in zip(keys, responses) if response.status_code == 409)
        failed_identity = create_requests.digest(['admin', 'a', 'ai_systems', failed_key])
        receipt = await server.db.create_requests.find_one({'_id': failed_identity})
        self.assertIsNotNone(receipt)
        self.assertEqual(receipt['state'], 'pending')
        self.assertFalse(receipt['primary_started'])
        self.assertIsNone(await server.db.ai_systems.find_one({'_id': 'create:' + receipt['_id']}))
        corrected = await self.client.post('/api/ai_systems', json={**body, 'name': 'Synthetic corrected identity'},
            headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(corrected.status_code, 200, corrected.text)
        self.assertNotEqual(corrected.json()['ai_system_id'], kept['ai_system_id'])
        self.assertEqual(await server.db.ai_systems.count_documents({'client_id': 'a'}), 2)

    async def test_interrupted_onboarding_resumes_owned_ai_despite_duplicate_name_protection(self):
        body = onboarding_fixture.AIOnboardingTests.payload(self)
        key = uuid.uuid4().hex
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('Synthetic audit interruption'))):
            failed = await self.client.post('/api/ai_systems/onboard', json=body,
                headers={'Idempotency-Key': key})
        self.assertEqual(failed.status_code, 503, failed.text)
        initial = await server.db.ai_systems.find_one({'client_id': 'a'})
        self.assertIsNotNone(initial)
        restored = await self.client.post('/api/ai_systems/onboard', json=body,
            headers={'Idempotency-Key': key})
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()['ai_system_id'], initial['ai_system_id'])
        self.assertEqual(await server.db.ai_systems.count_documents({'client_id': 'a'}), 1)
        self.assertEqual(await server.db.risks.count_documents({'client_id': 'a'}), 1)
        self.assertEqual(await server.db.reviews.count_documents({'ai_system_id': initial['ai_system_id']}), 1)

    async def test_rejected_retirement_save_never_cancels_linked_review(self):
        for conflict in ('stale', 'duplicate'):
            with self.subTest(conflict=conflict):
                row = await self.create_ai()
                scheduled = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/reviews',
                    json={'due_date': '2027-01-31', 'recurrence': 'annual'})
                self.assertEqual(scheduled.status_code, 200, scheduled.text)
                review_id = scheduled.json()['review_id']
                before = await server.db.reviews.find_one({'review_id': review_id})
                audit_count = await server.db.audit_logs.count_documents({})
                collection_type = type(server.db.ai_systems)
                update = collection_type.update_one

                async def conflict_at_ai_save(collection, query, changes, *args, **kwargs):
                    if collection.name == 'ai_systems' and changes.get('$set', {}).get('status') == 'retired':
                        if conflict == 'duplicate':
                            raise DuplicateKeyError('Synthetic concurrent ai_name_key collision')
                        await update(collection, {'ai_system_id': row['ai_system_id']}, {
                            '$set': {'updated_at': '2099-01-01T00:00:00+00:00'}})
                    return await update(collection, query, changes, *args, **kwargs)

                with patch.object(collection_type, 'update_one', new=conflict_at_ai_save):
                    denied = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                        'status': 'retired', 'name': 'Synthetic renamed retirement ' + uuid.uuid4().hex,
                        'expected_updated_at': row['updated_at']})
                self.assertEqual(denied.status_code, 409, denied.text)
                self.assertEqual(await server.db.reviews.find_one({'review_id': review_id}), before)
                self.assertEqual((await self.stored(row))['status'], 'active')
                self.assertEqual(await server.db.audit_logs.count_documents({}), audit_count)

    async def test_duplicate_error_preserves_applied_primary_and_parent_onboarding_receipts(self):
        insert = create_requests.insert_primary

        async def interrupted_after_insert(db, collection, document, identity):
            result = await insert(db, collection, document, identity)
            if collection == 'ai_systems':
                raise DuplicateKeyError('Synthetic indeterminate response after applied insert')
            return result

        for onboarding in (False, True):
            with self.subTest(onboarding=onboarding):
                key = uuid.uuid4().hex
                if onboarding:
                    body = onboarding_fixture.AIOnboardingTests.payload(self)
                    path = '/api/ai_systems/onboard'
                else:
                    body = {'client_id': 'a', 'name': 'Synthetic applied primary'}
                    path = '/api/ai_systems'
                with patch.object(create_requests, 'insert_primary', new=interrupted_after_insert):
                    failed = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
                self.assertEqual(failed.status_code, 409, failed.text)
                self.assertNotEqual(failed.headers.get('x-create-rejected'), 'true')
                identity = create_requests.digest(['admin', 'a', path.removeprefix('/api/'), key])
                receipt = await server.db.create_requests.find_one({'_id': identity})
                self.assertTrue(receipt['primary_started'])
                primary = await server.db.ai_systems.find_one({'name': body['ai']['name'] if onboarding else body['name']})
                self.assertIsNotNone(primary)
                child_receipt = await server.db.create_requests.find_one({'_id': primary['_id'].removeprefix('create:')})
                self.assertTrue(child_receipt['primary_started'])
                restored = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
                self.assertEqual(restored.status_code, 200, restored.text)
                self.assertEqual(restored.json()['ai_system_id'], primary['ai_system_id'])
                self.assertEqual(await server.db.ai_systems.count_documents({'name': primary['name']}), 1)

    async def test_ai_custom_review_interval_keeps_approved_whole_day_bounds(self):
        for days, status in ((0, 422), (1, 200), (3660, 200), (3661, 422), (True, 422)):
            with self.subTest(days=days):
                row = await self.create_ai()
                response = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/reviews', json={
                    'due_date': '2027-01-31', 'recurrence': 'custom', 'custom_recurrence_days': days})
                self.assertEqual(response.status_code, status, response.text)
                count = await server.db.reviews.count_documents({'ai_system_id': row['ai_system_id']})
                self.assertEqual(count, 1 if status == 200 else 0)
                if status == 200:
                    self.assertEqual(response.json()['custom_recurrence_days'], days)

    async def test_approval_audit_retry_preserves_newer_scope_and_checks_current_authority(self):
        row = await self.create_ai()
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('Synthetic decision audit outage'))):
            failed = await self.decide(row)
        self.assertEqual(failed.status_code, 503, failed.text)
        applied = await self.stored(row)
        self.assertEqual(applied['approval_status'], 'approved')
        self.assertEqual(len(applied['approval_history']), 1)
        self.assertTrue(applied['approval_history'][0]['request_id'])
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'client_readonly'}})
        denied = await self.decide(row)
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(await self.stored(row), applied)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI approval decision recorded'}), 0)
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'super_admin'}})
        edited = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
            'description': 'A newer saved synthetic use', 'expected_updated_at': applied['updated_at']})
        self.assertEqual(edited.status_code, 200, edited.text)
        newer = await self.stored(row)
        self.assertEqual(newer['approval_status'], 'pending_assessment')
        repaired = await self.decide(row)
        self.assertEqual(repaired.status_code, 200, repaired.text)
        self.assertEqual(repaired.json()['description'], newer['description'])
        self.assertEqual(repaired.json()['approval_status'], 'pending_assessment')
        self.assertEqual(await self.stored(row), newer)
        repeated = await self.decide(row)
        self.assertEqual(repeated.status_code, 200, repeated.text)
        self.assertEqual(await self.stored(row), newer)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI approval decision recorded'}), 1)

    async def test_partial_retirement_retries_its_own_followups_and_audit_once(self):
        for phase, started in (('review_write', False), ('review_audit', True), ('ai_audit', False)):
            with self.subTest(phase=phase):
                row = await self.create_ai()
                scheduled = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/reviews',
                    json={'due_date': '2027-01-31', 'recurrence': 'annual'})
                self.assertEqual(scheduled.status_code, 200, scheduled.text)
                review = scheduled.json()
                path = '/api/reviews/' + review['review_id']
                if started:
                    response = await self.client.post(path + '/start', json={'occurrence_id': review['current_occurrence_id']})
                    self.assertEqual(response.status_code, 200, response.text)
                before = await server.db.reviews.find_one({'review_id': review['review_id']})
                collection_type = type(server.db.ai_systems)
                update = collection_type.update_one
                audit = server.audit

                async def fail_review_write(collection, query, changes, *args, **kwargs):
                    if phase == 'review_write' and collection.name == 'reviews' and '_ai_retirement_command' in changes.get('$set', {}):
                        raise RuntimeError('Synthetic cancellation outage')
                    return await update(collection, query, changes, *args, **kwargs)

                async def fail_audit(user, action, *args, **kwargs):
                    if phase == 'review_audit' and action == 'AI retired; recurring review stopped' or phase == 'ai_audit' and action == 'AI retired':
                        raise RuntimeError('Synthetic retirement audit outage')
                    return await audit(user, action, *args, **kwargs)

                body = {'status': 'retired', 'expected_updated_at': row['updated_at']}
                with patch.object(collection_type, 'update_one', new=fail_review_write), patch.object(server, 'audit', new=fail_audit):
                    failed = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json=body)
                self.assertEqual(failed.status_code, 503, failed.text)
                pending = await self.stored(row)
                self.assertEqual(pending['status'], 'retired')
                self.assertTrue(pending['_ai_retirement_pending'])
                self.assertTrue(pending['_ai_retirement_command'])
                listed = (await self.client.get('/api/ai_systems?client_id=a')).json()
                visible = next(item for item in listed if item['ai_system_id'] == row['ai_system_id'])
                self.assertFalse(any(key.startswith('_ai_') for key in visible))
                blocked = await self.client.post(path + '/start', json={'occurrence_id': review['current_occurrence_id']})
                self.assertEqual(blocked.status_code, 409, blocked.text)
                unrelated = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                    'status': 'retired', 'expected_updated_at': pending['updated_at'], 'governance_notes': 'Unrelated edit'})
                self.assertEqual(unrelated.status_code, 409, unrelated.text)
                await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'platform_admin', 'client_ids': []}})
                denied = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json=body)
                self.assertEqual(denied.status_code, 403, denied.text)
                self.assertEqual(await self.stored(row), pending)
                await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'super_admin', 'client_ids': ['a', 'b']}})
                restored = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json=body)
                self.assertEqual(restored.status_code, 200, restored.text)
                self.assertFalse(any(key.startswith('_ai_') for key in restored.json()))
                final = await self.stored(row)
                self.assertNotIn('_ai_retirement_pending', final)
                self.assertEqual(final['created_at'], row['created_at'])
                kept = await server.db.reviews.find_one({'review_id': review['review_id']})
                self.assertEqual(kept['status'], 'in_progress' if started else 'cancelled')
                self.assertEqual(kept['recurrence'], 'none')
                self.assertIsNone(kept['next_review_date'])
                self.assertEqual(kept.get('occurrences'), before.get('occurrences'))
                self.assertTrue(kept['_ai_retirement_command'])
                visible_review = await self.client.get(path)
                self.assertEqual(visible_review.status_code, 200, visible_review.text)
                self.assertFalse(any(key.startswith('_ai_') for key in visible_review.json()))
                repeated = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json=body)
                self.assertEqual(repeated.status_code, 200, repeated.text)
                self.assertEqual(await self.stored(row), final)
                self.assertEqual(await server.db.reviews.find_one({'review_id': review['review_id']}), kept)
                self.assertEqual(await server.db.audit_logs.count_documents({
                    'action': 'AI retired; recurring review stopped', 'entity_id': review['review_id']}), 1)
                self.assertEqual(await server.db.audit_logs.count_documents({
                    'action': 'AI retired', 'entity_id': row['ai_system_id']}), 1)

    async def test_retirement_review_conflict_retains_unrelated_saved_values(self):
        row = await self.create_ai()
        scheduled = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/reviews',
            json={'due_date': '2027-01-31', 'recurrence': 'annual'})
        self.assertEqual(scheduled.status_code, 200, scheduled.text)
        review_id = scheduled.json()['review_id']
        collection_type = type(server.db.ai_systems)
        update = collection_type.update_one

        async def concurrent_review_change(collection, query, changes, *args, **kwargs):
            if collection.name == 'reviews' and '_ai_retirement_command' in changes.get('$set', {}):
                await update(collection, {'review_id': review_id}, {'$set': {
                    'updated_at': '2099-01-01T00:00:00+00:00', 'notes': 'Unrelated saved work'}})
            return await update(collection, query, changes, *args, **kwargs)

        with patch.object(collection_type, 'update_one', new=concurrent_review_change):
            denied = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                'status': 'retired', 'expected_updated_at': row['updated_at']})
        self.assertEqual(denied.status_code, 409, denied.text)
        current = await server.db.reviews.find_one({'review_id': review_id})
        self.assertEqual(current['notes'], 'Unrelated saved work')
        self.assertEqual(current['recurrence'], 'annual')
        self.assertEqual(current['status'], 'upcoming')
        self.assertNotIn('_ai_retirement_command', current)
        self.assertTrue((await self.stored(row))['_ai_retirement_pending'])

    async def test_rejected_ai_child_keeps_prior_vendor_and_parent_onboarding_recoverable(self):
        body = onboarding_fixture.AIOnboardingTests.payload(self)
        body['vendor'].update(mode='create', name='Synthetic retained Vendor', service='Synthetic AI service')
        key = uuid.uuid4().hex
        collection_type = type(server.db.ai_systems)
        update = collection_type.update_one

        async def reject_ai_insert(collection, query, changes, *args, **kwargs):
            if collection.name == 'ai_systems' and '$setOnInsert' in changes:
                raise DuplicateKeyError('Synthetic AI name conflict before insert')
            return await update(collection, query, changes, *args, **kwargs)

        with patch.object(collection_type, 'update_one', new=reject_ai_insert):
            failed = await self.client.post('/api/ai_systems/onboard', json=body,
                headers={'Idempotency-Key': key})
        self.assertEqual(failed.status_code, 409, failed.text)
        self.assertNotEqual(failed.headers.get('x-create-rejected'), 'true')
        vendor = await server.db.vendors.find_one({'client_id': 'a'})
        self.assertIsNotNone(vendor)
        self.assertEqual(await server.db.ai_systems.count_documents({}), 0)
        parent_id = create_requests.digest(['admin', 'a', 'ai_systems/onboard', key])
        parent = await server.db.create_requests.find_one({'_id': parent_id})
        self.assertTrue(parent['primary_started'])
        self.assertEqual(parent['state'], 'pending')
        restored = await self.client.post('/api/ai_systems/onboard', json=body,
            headers={'Idempotency-Key': key})
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()['vendor_id'], vendor['vendor_id'])
        self.assertEqual(await server.db.vendors.count_documents({'client_id': 'a'}), 1)
        self.assertEqual(await server.db.ai_systems.count_documents({'client_id': 'a'}), 1)

    async def test_material_change_audit_recovery_keeps_newer_scope_and_serializes_only_pending_changes(self):
        row = (await self.decide(await self.create_ai())).json()
        path = '/api/ai_systems/' + row['ai_system_id'] + '/material-change'
        body = {'note': 'Synthetic confirmed material change', 'expected_updated_at': row['updated_at']}
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('Synthetic material-change audit outage'))):
            failed = await self.client.post(path, json=body)
        self.assertEqual(failed.status_code, 503, failed.text)
        applied = await self.stored(row)
        self.assertEqual(applied['approval_status'], 'pending_assessment')
        self.assertEqual(applied['approval_history'], row['approval_history'])
        self.assertEqual(applied['material_change_note'], body['note'])
        self.assertTrue(applied['_ai_material_change_command'])
        listed = (await self.client.get('/api/ai_systems?client_id=a')).json()
        visible = next(item for item in listed if item['ai_system_id'] == row['ai_system_id'])
        self.assertFalse(any(key.startswith('_ai_') for key in visible))
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'platform_admin', 'client_ids': []}})
        denied = await self.client.post(path, json=body)
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(await self.stored(row), applied)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI material change recorded'}), 0)
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'super_admin', 'client_ids': ['a', 'b']}})
        edited = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
            'description': 'Newer saved synthetic deployment', 'expected_updated_at': applied['updated_at']})
        self.assertEqual(edited.status_code, 200, edited.text)
        newer = await self.stored(row)
        competing = await self.client.post(path, json={
            'note': 'A competing material change', 'expected_updated_at': newer['updated_at']})
        self.assertEqual(competing.status_code, 409, competing.text)
        self.assertEqual(await self.stored(row), newer)
        repaired = await self.client.post(path, json=body)
        self.assertEqual(repaired.status_code, 200, repaired.text)
        self.assertFalse(any(key.startswith('_ai_') for key in repaired.json()))
        self.assertEqual(repaired.json()['description'], newer['description'])
        self.assertEqual(repaired.json()['material_change_at'], applied['material_change_at'])
        self.assertEqual(await self.stored(row), newer)
        repeated = await self.client.post(path, json=body)
        self.assertEqual(repeated.status_code, 200, repeated.text)
        self.assertEqual(await self.stored(row), newer)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI material change recorded'}), 1)
        subsequent = await self.client.post(path, json={
            'note': 'Subsequent confirmed synthetic change', 'expected_updated_at': newer['updated_at']})
        self.assertEqual(subsequent.status_code, 200, subsequent.text)
        self.assertFalse(any(key.startswith('_ai_') for key in subsequent.json()))
        final = await self.stored(row)
        self.assertEqual(final['material_change_note'], 'Subsequent confirmed synthetic change')
        self.assertEqual(final['approval_history'], row['approval_history'])
        self.assertGreater(final['updated_at'], newer['updated_at'])
        old_retry = await self.client.post(path, json=body)
        self.assertEqual(old_retry.status_code, 200, old_retry.text)
        self.assertEqual(old_retry.json()['material_change_note'], final['material_change_note'])
        self.assertEqual(await self.stored(row), final)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI material change recorded'}), 2)
        for kind in ('reviews', 'risks', 'vendors', 'findings', 'tasks'):
            self.assertEqual(await server.db[kind].count_documents({}), 0, kind)

    async def test_unapplied_material_change_never_overwrites_a_concurrent_ai_save(self):
        row = (await self.decide(await self.create_ai())).json()
        collection_type = type(server.db.ai_systems)
        update = collection_type.update_one

        async def concurrent_edit(collection, query, changes, *args, **kwargs):
            if collection.name == 'ai_systems' and '_ai_material_change_command' in changes.get('$set', {}):
                await update(collection, {'ai_system_id': row['ai_system_id']}, {'$set': {
                    'updated_at': '2099-01-01T00:00:00+00:00', 'governance_notes': 'Unrelated saved native text'}})
            return await update(collection, query, changes, *args, **kwargs)

        body = {'note': 'Stale synthetic change', 'expected_updated_at': row['updated_at']}
        path = '/api/ai_systems/' + row['ai_system_id'] + '/material-change'
        with patch.object(collection_type, 'update_one', new=concurrent_edit):
            denied = await self.client.post(path, json=body)
        self.assertEqual(denied.status_code, 409, denied.text)
        current = await self.stored(row)
        self.assertEqual(current['governance_notes'], 'Unrelated saved native text')
        self.assertEqual(current['approval_status'], 'approved')
        self.assertEqual(current['approval_history'], row['approval_history'])
        self.assertNotIn('_ai_material_change_command', current)
        retry = await self.client.post(path, json=body)
        self.assertEqual(retry.status_code, 409, retry.text)
        self.assertEqual(await self.stored(row), current)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI material change recorded'}), 0)
