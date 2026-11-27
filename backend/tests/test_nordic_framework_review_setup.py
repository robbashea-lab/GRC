"""Framework Review setup receipts through real ASGI routes and isolated storage."""
import asyncio
from copy import deepcopy
import unittest
import uuid
from unittest.mock import AsyncMock, patch

import test_client_dashboard_sources as fixture
import test_framework_governance as native_fixture
from framework_catalog import active_plans
import framework_governance

server = fixture.server


class NordicFrameworkReviewSetupTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in
    body = native_fixture.FrameworkTests.body
    configure = native_fixture.FrameworkTests.configure

    async def prepare(self):
        workspace = await self.configure()
        self.client.event_hooks['request'] = []
        self.assessment = workspace['assessments'][0]
        self.aid = self.assessment['framework_assessment_id']
        self.path = '/api/framework_assessments/' + self.aid + '/reviews'
        self.payload = {'title': 'Synthetic retained Review', 'recurrence': 'quarterly',
                        'due_date': '2028-02-29', 'owner_id': 'member'}
        self.key = uuid.uuid4().hex
        return workspace

    def identity(self, key=None):
        return server.create_requests.digest(['admin', 'a', self.path.removeprefix('/api'),
                                              key or self.key])

    async def receipt(self, key=None):
        return await server.db.create_requests.find_one({'_id': self.identity(key)})

    async def post(self, body=None, key=None):
        return await self.client.post(self.path, json=self.payload if body is None else body,
                                      headers={'Idempotency-Key': key or self.key})

    async def test_first_invalid_fields_prove_no_primary_and_allow_a_fresh_edit(self):
        await self.prepare()
        before = await server.db.reviews.count_documents({})
        for change in ({'title': ''}, {'title': 'x' * 501}, {'due_date': '2027-02-29'},
                       {'recurrence': 'custom', 'custom_recurrence_days': 0},
                       {'owner_id': 'missing-user'}):
            with self.subTest(change=change):
                key = uuid.uuid4().hex
                payload = {**self.payload, **change}
                response = await self.post(payload, key)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.headers.get('x-create-rejected'), 'true')
                receipt = await self.receipt(key)
                self.assertFalse(receipt.get('primary_started'))
                self.assertEqual(receipt['fingerprint'], server.create_requests.digest(payload))
                self.assertEqual(await server.db.reviews.count_documents({}), before)
        corrected = await self.post()
        self.assertEqual(corrected.status_code, 200, corrected.text)
        self.assertEqual(await server.db.reviews.count_documents({}), before + 1)

    async def test_headerless_model_errors_and_schema_remain_native(self):
        await self.prepare()
        before = await server.db.create_requests.count_documents({})
        response = await self.client.post(self.path, json={**self.payload, 'custom_recurrence_days': 0})
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()['detail'][0]['loc'], ['body', 'custom_recurrence_days'])
        self.assertNotIn('x-create-rejected', response.headers)
        self.assertEqual(await server.db.create_requests.count_documents({}), before)
        schema = server.app.openapi()['paths']['/api/framework_assessments/{aid}/reviews']['post']['requestBody']['content']['application/json']['schema']
        expected_schema = framework_governance.jsonable_encoder(
            framework_governance.ReviewSetup.model_json_schema(), by_alias=True, exclude_none=True)
        self.assertEqual(schema['properties'], expected_schema['properties'])
        self.assertFalse(schema['additionalProperties'])
        first = await self.client.post(self.path, json=self.payload)
        self.assertEqual(first.status_code, 200, first.text)
        again = await self.client.post(self.path, json={'title': 'Ignore later schedule', 'due_date': '2031-01-01'})
        self.assertEqual(again.json()['review_id'], first.json()['review_id'])
        self.assertEqual(again.json()['due_date'], self.payload['due_date'])

    async def test_changed_invalid_or_malformed_body_cannot_discard_an_original_receipt(self):
        await self.prepare()
        first = await self.post()
        self.assertEqual(first.status_code, 200, first.text)
        original = await self.receipt()
        for changed in ({**self.payload, 'custom_recurrence_days': 0},
                        {**self.payload, 'title': {'invalid': 'type'}}):
            response = await self.post(changed)
            self.assertEqual(response.status_code, 409, response.text)
            self.assertNotIn('x-create-rejected', response.headers)
        malformed = await self.client.post(self.path, content='{"title":',
            headers={'Idempotency-Key': self.key, 'Content-Type': 'application/json'})
        self.assertEqual(malformed.status_code, 422, malformed.text)
        self.assertNotIn('x-create-rejected', malformed.headers)
        self.assertEqual(await self.receipt(), original)
        self.assertEqual((await self.post()).json(), first.json())

    async def test_current_scope_and_role_are_checked_before_completed_replay(self):
        await self.prepare()
        self.assertEqual((await self.post()).status_code, 200)
        original = await self.receipt()
        await server.db.requirements.update_one({'client_id': 'a', 'baseline_key': 'cis-ig1'},
                                                {'$set': {'baseline_response': 'does_not_apply'}})
        denied = await self.post()
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertNotIn('x-create-rejected', denied.headers)
        await server.db.requirements.update_one({'client_id': 'a', 'baseline_key': 'cis-ig1'},
                                                {'$set': {'baseline_response': 'applies'}})
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'client_readonly'}})
        denied = await self.post()
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertNotIn('x-create-rejected', denied.headers)
        self.assertEqual(await self.receipt(), original)

    async def test_lost_upsert_ack_scope_withdrawal_and_audit_recovery_preserve_original(self):
        await self.prepare()
        kind = type(server.db.reviews)
        update = kind.update_one
        tripped = False
        async def lost_ack(collection, *args, **kwargs):
            nonlocal tripped
            result = await update(collection, *args, **kwargs)
            if collection.name == 'reviews' and kwargs.get('upsert') and not tripped:
                tripped = True
                self.assertTrue((await self.receipt())['primary_started'])
                raise RuntimeError('lost canonical Review acknowledgement before audit')
            return result
        with patch.object(kind, 'update_one', lost_ack):
            failed = await self.post()
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertNotIn('x-create-rejected', failed.headers)
        original = await self.receipt()
        rid = original['framework_review_id']
        saved = await server.db.reviews.find_one({'review_id': rid})
        await server.db.reviews.update_one({'review_id': rid}, {'$set': {
            'occurrences': [{'occurrence_id': 'retained-old', 'status': 'completed', 'evidence_ids': ['retained-byte-link']}],
            'notes': 'Later independent native note'}})
        await server.db.requirements.update_one({'client_id': 'a', 'baseline_key': 'cis-ig1'},
                                                {'$set': {'baseline_response': 'does_not_apply'}})
        denied = await self.post()
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertNotIn('x-create-rejected', denied.headers)
        self.assertEqual(await self.receipt(), original)
        await server.db.requirements.update_one({'client_id': 'a', 'baseline_key': 'cis-ig1'},
                                                {'$set': {'baseline_response': 'applies'}})
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('audit unavailable'))):
            failed = await self.post()
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertNotIn('x-create-rejected', failed.headers)
        recovered = await self.post()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual((await self.post()).json(), recovered.json())
        current = await server.db.reviews.find_one({'review_id': rid})
        for field in ('review_id', 'due_date', 'recurrence', 'current_occurrence_id', 'schedule_id'):
            self.assertEqual(current.get(field), saved.get(field))
        self.assertEqual(current['notes'], 'Later independent native note')
        self.assertEqual(current['occurrences'][0]['evidence_ids'], ['retained-byte-link'])
        self.assertEqual(await server.db.reviews.count_documents({'review_id': rid}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'create', 'entity_id': rid}), 1)
        assessment = await server.db.framework_assessments.find_one({'framework_assessment_id': self.aid})
        self.assertEqual(assessment.get('assessment_history'), self.assessment.get('assessment_history'))
        self.assertIn({'kind': 'reviews', 'id': rid}, assessment['related_links'])

    async def test_pre_upsert_fault_then_current_owner_failure_keeps_primary_unknown(self):
        await self.prepare()
        kind = type(server.db.reviews)
        update = kind.update_one
        async def unavailable(collection, *args, **kwargs):
            if collection.name == 'reviews' and kwargs.get('upsert'):
                self.assertTrue((await self.receipt())['primary_started'])
                raise RuntimeError('Review write acknowledgement unavailable')
            return await update(collection, *args, **kwargs)
        with patch.object(kind, 'update_one', unavailable):
            failed = await self.post()
        self.assertEqual(failed.status_code, 503, failed.text)
        original = await self.receipt()
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'inactive'}})
        denied = await self.post()
        self.assertEqual(denied.status_code, 422, denied.text)
        self.assertNotIn('x-create-rejected', denied.headers)
        retained = await self.receipt()
        self.assertEqual(retained['fingerprint'], original['fingerprint'])
        self.assertTrue(retained['primary_started'])
        self.assertEqual(retained['framework_review_document'], original['framework_review_document'])
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'active'}})
        self.assertEqual((await self.post()).status_code, 200)

    async def test_native_pending_audit_receipt_repairs_after_write_failure(self):
        await self.prepare()
        kind = type(server.db.audit_logs)
        update = kind.update_one
        tripped = False
        async def lost_audit_ack(collection, *args, **kwargs):
            nonlocal tripped
            result = await update(collection, *args, **kwargs)
            if collection.name == 'audit_logs' and not tripped:
                tripped = True
                raise RuntimeError('lost durable audit acknowledgement')
            return result
        with patch.object(kind, 'update_one', lost_audit_ack):
            failed = await self.post()
        self.assertEqual(failed.status_code, 503, failed.text)
        receipt = await self.receipt()
        self.assertTrue(receipt['pending_audits'])
        self.assertTrue(receipt['primary_started'])
        recovered = await self.post()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual(await server.db.audit_logs.count_documents({
            'action': 'create', 'entity_id': recovered.json()['review_id']}), 1)

    async def prepare_existing(self):
        workspace = await self.prepare()
        self.plan = active_plans('cis-ig1')[0]
        self.assessment = next(row for row in workspace['assessments'] if row['definition_id'] in self.plan['safeguards'])
        self.aid = self.assessment['framework_assessment_id']
        self.path = '/api/framework_assessments/' + self.aid + '/reviews'
        self.payload = {'plan_key': self.plan['key'], 'title': 'Keep original definition',
                        'due_date': '2031-01-01'}
        old = await server.db.reviews.find_one({'client_id': 'a', 'framework_plan_key': self.plan['key']})
        await server.db.reviews.update_one({'review_id': old['review_id']}, {'$set': {
            'framework_drivers': [], 'occurrences': [{'occurrence_id': 'old-completed', 'status': 'completed'}]}})
        await server.db.framework_assessments.update_one({'framework_assessment_id': self.aid},
            {'$pull': {'related_links': {'kind': 'reviews', 'id': old['review_id']}}})
        self.original_create_audits = await server.db.audit_logs.count_documents({'action': 'create', 'entity_id': old['review_id']})
        return await server.db.reviews.find_one({'review_id': old['review_id']})

    async def test_existing_review_driver_first_write_is_marked_and_history_survives(self):
        old = await self.prepare_existing()
        kind = type(server.db.reviews)
        update = kind.update_one
        tripped = False
        async def lost_driver_ack(collection, *args, **kwargs):
            nonlocal tripped
            if collection.name == 'reviews' and 'framework_drivers' in args[1].get('$set', {}) and not tripped:
                self.assertTrue((await self.receipt())['primary_started'])
                result = await update(collection, *args, **kwargs)
                tripped = True
                raise RuntimeError('lost driver acknowledgement')
            return await update(collection, *args, **kwargs)
        with patch.object(kind, 'update_one', lost_driver_ack):
            failed = await self.post()
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertNotIn('x-create-rejected', failed.headers)
        recovered = await self.post()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        current = await server.db.reviews.find_one({'review_id': old['review_id']})
        for field in ('review_id', 'due_date', 'recurrence', 'title', 'current_occurrence_id', 'schedule_id', 'occurrences'):
            self.assertEqual(current.get(field), old.get(field))
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'create', 'entity_id': old['review_id']}), self.original_create_audits)
        self.assertEqual(len(current['framework_drivers']), 1)

    async def test_keyed_reuse_preserves_legacy_creation_and_pending_event_identities(self):
        old = await self.prepare_existing()
        _, event = server._portfolio_event_patch('review', old['review_id'], 'a',
            {'user_id': 'admin', 'name': 'Original actor'}, None, old, '2026-10-01T10:00:00+00:00', 'create')
        retained = {'_portfolio_activity_pending': {event['event_id']: event},
                    '_portfolio_activity_creation_event_id': event['event_id'],
                    '_portfolio_activity_last_event_id': event['event_id']}
        await server.db.reviews.update_one({'review_id': old['review_id']}, {'$set': retained})
        result = await self.post()
        self.assertEqual(result.status_code, 200, result.text)
        current = await server.db.reviews.find_one({'review_id': old['review_id']})
        for field, value in retained.items():
            self.assertEqual(current[field], value)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'create', 'entity_id': old['review_id']}), self.original_create_audits)

    async def test_lost_link_ack_repairs_exact_audit_after_native_collector_drain(self):
        old = await self.prepare_existing()
        kind = type(server.db.framework_assessments)
        update = kind.update_one
        tripped = False
        async def lost_link_ack(collection, *args, **kwargs):
            nonlocal tripped
            result = await update(collection, *args, **kwargs)
            if collection.name == 'framework_assessments' and args[0].get('framework_assessment_id') == self.aid and '$addToSet' in args[1] and not tripped:
                tripped = True
                raise RuntimeError('lost relationship acknowledgement before linked audit')
            return result
        with patch.object(kind, 'update_one', lost_link_ack):
            failed = await self.post()
        self.assertEqual(failed.status_code, 503, failed.text)
        intent = (await self.receipt())['framework_review_links'][self.aid]
        await server.portfolio_activity.reconcile_pending(server.db)
        recovered = await self.post()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        audit = await server.db.audit_logs.find_one({'action': 'Framework Review linked', 'entity_id': self.aid})
        self.assertEqual(audit['meta']['_portfolio_activity_event_id'], intent['event']['event_id'])
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'Framework Review linked', 'entity_id': self.aid}), 1)
        self.assertEqual(recovered.json()['occurrences'], old['occurrences'])

    async def test_frozen_link_cas_does_not_overwrite_later_relationship_edits(self):
        await self.prepare()
        kind = type(server.db.framework_assessments)
        update = kind.update_one
        async def fail_before_link(collection, *args, **kwargs):
            if collection.name == 'framework_assessments' and '$addToSet' in args[1]:
                raise RuntimeError('relationship save interrupted')
            return await update(collection, *args, **kwargs)
        with patch.object(kind, 'update_one', fail_before_link):
            failed = await self.post()
        self.assertEqual(failed.status_code, 503, failed.text)
        await server.db.framework_assessments.update_one({'framework_assessment_id': self.aid},
            {'$addToSet': {'related_links': {'kind': 'tasks', 'id': 'later-independent-task'}}})
        before = deepcopy(await server.db.framework_assessments.find_one({'framework_assessment_id': self.aid}))
        conflicted = await self.post()
        self.assertEqual(conflicted.status_code, 409, conflicted.text)
        self.assertNotIn('x-create-rejected', conflicted.headers)
        self.assertEqual(await server.db.framework_assessments.find_one({'framework_assessment_id': self.aid}), before)

    async def test_later_relationship_removal_is_preserved_while_original_setup_finishes(self):
        await self.prepare()
        kind = type(server.db.framework_assessments)
        update = kind.update_one
        tripped = False
        async def lost_link_ack(collection, *args, **kwargs):
            nonlocal tripped
            result = await update(collection, *args, **kwargs)
            if collection.name == 'framework_assessments' and args[0].get('framework_assessment_id') == self.aid and '$addToSet' in args[1] and not tripped:
                tripped = True
                raise RuntimeError('original relationship committed before acknowledgement')
            return result
        with patch.object(kind, 'update_one', lost_link_ack):
            failed = await self.post()
        self.assertEqual(failed.status_code, 503, failed.text)
        receipt = await self.receipt()
        rid = receipt['framework_review_id']
        # Model another authorized native writer removing the relationship without
        # advancing assessment tokens; the original before-values now match again.
        await server.portfolio_activity.reconcile_pending(server.db)
        await server.db.framework_assessments.update_one({'framework_assessment_id': self.aid},
            {'$pull': {'related_links': {'kind': 'reviews', 'id': rid}}})
        before = deepcopy(await server.db.framework_assessments.find_one({'framework_assessment_id': self.aid}))
        response = await self.post()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn('x-create-rejected', response.headers)
        self.assertEqual(await server.db.framework_assessments.find_one({'framework_assessment_id': self.aid}), before)
        retained = await self.receipt()
        self.assertTrue(retained['primary_started'])
        self.assertEqual(retained['fingerprint'], receipt['fingerprint'])
        self.assertEqual(retained['state'], 'complete')
        audit = await server.db.audit_logs.find_one({'action': 'Framework Review linked', 'entity_id': self.aid})
        self.assertEqual(audit['meta']['_portfolio_activity_event_id'], receipt['framework_review_links'][self.aid]['event']['event_id'])
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'Framework Review linked', 'entity_id': self.aid}), 1)
        source_writes = []
        async def observe_source_writes(collection, *args, **kwargs):
            if collection.name in ('reviews', 'framework_assessments'):
                source_writes.append(collection.name)
            return await update(collection, *args, **kwargs)
        with patch.object(kind, 'update_one', observe_source_writes):
            replay = await self.post()
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json(), response.json())
        self.assertEqual(source_writes, [])
        self.assertEqual(await server.db.framework_assessments.find_one({'framework_assessment_id': self.aid}), before)
        deliberate = await self.post(key=uuid.uuid4().hex)
        self.assertEqual(deliberate.status_code, 200, deliberate.text)
        current = await server.db.framework_assessments.find_one({'framework_assessment_id': self.aid})
        self.assertIn({'kind': 'reviews', 'id': rid}, current['related_links'])
        for field in ('assessment_history', 'last_assessed', 'last_saved'):
            self.assertEqual(current.get(field), before.get(field))

    async def test_corrupt_cross_client_retained_link_plan_fails_closed(self):
        await self.prepare()
        kind = type(server.db.framework_assessments)
        update = kind.update_one
        async def fail_before_link(collection, *args, **kwargs):
            if collection.name == 'framework_assessments' and '$addToSet' in args[1]:
                raise RuntimeError('relationship save interrupted')
            return await update(collection, *args, **kwargs)
        with patch.object(kind, 'update_one', fail_before_link):
            self.assertEqual((await self.post()).status_code, 503)
        await server.db.create_requests.update_one({'_id': self.identity()}, {'$set': {
            'framework_review_links.' + self.aid + '.event.client_id': 'b'}})
        rows = await server.db.framework_assessments.find({}).to_list(None)
        response = await self.post()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn('x-create-rejected', response.headers)
        self.assertEqual(await server.db.framework_assessments.find({}).to_list(None), rows)

    async def test_same_intent_lease_blocks_parallel_and_changed_invalid_requests(self):
        await self.prepare()
        entered, release = asyncio.Event(), asyncio.Event()
        validate = framework_governance.assignment_eligibility.validate
        async def delayed(*args, **kwargs):
            entered.set()
            await release.wait()
            return await validate(*args, **kwargs)
        with patch.object(framework_governance.assignment_eligibility, 'validate', delayed):
            task = asyncio.create_task(self.post())
            await asyncio.wait_for(entered.wait(), 2)
            try:
                parallel = await self.post()
                changed = await self.post({**self.payload, 'custom_recurrence_days': 0})
                self.assertEqual(parallel.status_code, 409, parallel.text)
                self.assertEqual(changed.status_code, 409, changed.text)
                self.assertNotIn('x-create-rejected', parallel.headers)
                self.assertNotIn('x-create-rejected', changed.headers)
            finally:
                release.set()
                first = await task
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual((await self.post()).json(), first.json())

    async def test_fixed_clock_distinct_intents_canonical_race_has_one_create_audit(self):
        await self.prepare()
        kind = type(server.db.reviews)
        update = kind.update_one
        entered, release = asyncio.Event(), asyncio.Event()
        count = 0
        async def synchronize_inserts(collection, *args, **kwargs):
            nonlocal count
            if collection.name == 'reviews' and kwargs.get('upsert'):
                count += 1
                if count == 2:
                    entered.set()
                await release.wait()
            return await update(collection, *args, **kwargs)
        with patch.object(server, '_now', return_value='2026-11-22T10:00:00+00:00'), patch.object(kind, 'update_one', synchronize_inserts):
            tasks = [asyncio.create_task(self.post(key=uuid.uuid4().hex)) for _ in range(2)]
            try:
                await asyncio.wait_for(entered.wait(), 2)
            finally:
                release.set()
                responses = await asyncio.gather(*tasks)
        self.assertTrue(all(response.status_code in (200, 409) for response in responses), [response.text for response in responses])
        records = await server.db.reviews.find({'title': self.payload['title']}).to_list(None)
        self.assertEqual(len(records), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'create', 'entity_id': records[0]['review_id']}), 1)
