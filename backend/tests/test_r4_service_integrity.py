"""Current authority and pending-state integrity through owned native fixtures."""
from copy import deepcopy
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

import create_requests
from framework_catalog import active_plans
import r4_services as services
import test_client_dashboard_sources as fixture

server = fixture.server


class R4ServiceIntegrityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def replacement_fixture(self, key):
        await server.db.users.insert_one({
            'user_id': 'service-admin', 'email': 'service-admin@example.test',
            'role': 'platform_admin', 'client_ids': ['a', 'b'], 'status': 'active'})
        self.sign_in('service-admin')
        area = next(tool for tool in services.CATALOG['tools'] if tool['tool_id'] == 'ninjaone')['area_ids'][0]
        for cid in ('a', 'b'):
            await server.db.clients.update_one({'client_id': cid}, {'$set': {
                'updated_at': '2026-11-19T00:00:00+00:00',
                'profile.services': {'areas': {area: {'responsibility': 'iv', 'tool_ids': ['ninjaone']}}},
                'saved_history': ['Retained ' + cid]}})
        path = '/api/tool-catalog/ninjaone/replace'
        body = {'replacement_id': 'intune', 'expected_updated_at': None, 'retire': True}
        identity = create_requests.digest(['service-admin', None, 'tool-catalog/ninjaone/replace', key])
        return path, body, identity, area

    async def saved_state(self):
        result = {name: await server.db[name].find({}).to_list(None)
                  for name in ('clients', 'tool_catalog', 'create_requests')}
        # HTTP permission refusals may record their own access-denied event.
        result['business_audits'] = await server.db.audit_logs.find({'action': {'$ne': 'access-denied'}}).to_list(None)
        return result

    async def interrupted_replacement(self, key):
        path, body, identity, area = await self.replacement_fixture(key)
        collection_type = type(server.db.clients)
        original = collection_type.update_one
        injected = False

        async def fail_second_client(collection, query, update, *args, **kwargs):
            nonlocal injected
            fields = update.get('$set', {})
            if (not injected and collection.name == 'clients' and query.get('client_id') == 'b'
                    and 'profile.services' in fields and fields.get('_r4_context_applied') == identity):
                injected = True
                raise RuntimeError('Synthetic interruption before the second client business write')
            return await original(collection, query, update, *args, **kwargs)

        with patch.object(collection_type, 'update_one', fail_second_client):
            first = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
        self.assertTrue(injected, 'The fault must land after the first client update and before the second')
        self.assertEqual(first.status_code, 503, first.text)
        a = await server.db.clients.find_one({'client_id': 'a'})
        b = await server.db.clients.find_one({'client_id': 'b'})
        self.assertEqual(a['profile']['services']['areas'][area]['tool_ids'], ['intune'])
        self.assertEqual(b['profile']['services']['areas'][area]['tool_ids'], ['ninjaone'])
        self.assertEqual(a['_r4_context_pending'], identity)
        self.assertEqual(b['_r4_context_pending'], identity)
        receipt = await server.db.create_requests.find_one({'_id': identity})
        self.assertTrue(receipt['primary_started'])
        self.assertEqual(receipt['state'], 'pending')
        return path, body, identity, area, deepcopy(receipt['r4_write_plan']), a['updated_at']

    async def pending_replacement_denial(self, change):
        key = 'r4-service-pending-' + change
        path, body, identity, area, frozen, first_updated_at = await self.interrupted_replacement(key)
        if change == 'membership':
            await server.db.users.update_one({'user_id': 'service-admin'}, {'$set': {'client_ids': ['a']}})
            expected = 403
        else:
            await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'status': 'archived'}})
            expected = 409
        before = await self.saved_state()
        blocked = AsyncMock(side_effect=AssertionError('Withdrawn authority must be checked before receipt or audit replay'))
        with patch.object(create_requests, 'run', blocked):
            denied = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(denied.status_code, expected, denied.text)
        blocked.assert_not_awaited()
        self.assertEqual(await self.saved_state(), before)
        await server.db.users.update_one({'user_id': 'service-admin'}, {'$set': {'client_ids': ['a', 'b']}})
        await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'status': 'active'}})
        recovered = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(recovered.status_code, 200, recovered.text)
        receipt = await server.db.create_requests.find_one({'_id': identity})
        self.assertEqual(receipt['r4_write_plan'], frozen)
        self.assertEqual(receipt['state'], 'complete')
        a = await server.db.clients.find_one({'client_id': 'a'})
        self.assertEqual(a['updated_at'], first_updated_at)
        for cid in ('a', 'b'):
            current = await server.db.clients.find_one({'client_id': cid})
            self.assertNotIn('_r4_context_pending', current)
            self.assertEqual(current['profile']['services']['areas'][area]['tool_ids'], ['intune'])
            self.assertEqual(current['saved_history'], ['Retained ' + cid])

    async def test_partial_replacement_rechecks_revoked_client_membership_before_repair(self):
        await self.pending_replacement_denial('membership')

    async def test_partial_replacement_rechecks_archived_client_before_repair(self):
        await self.pending_replacement_denial('archived')

    async def test_retained_shared_plan_refuses_downgraded_actor_before_replay_or_apply(self):
        key = 'r4-service-role-withdrawal'
        _, body, identity, _, frozen, _ = await self.interrupted_replacement(key)
        await server.db.users.update_one({'user_id': 'service-admin'}, {'$set': {'role': 'client_contributor'}})
        user = await server.db.users.find_one({'user_id': 'service-admin'})
        before = await self.saved_state()
        with self.assertRaises(HTTPException) as preflight:
            await services.authorize_retained_command(server, key, user, None,
                'tool-catalog/ninjaone/replace', body)
        self.assertEqual(preflight.exception.status_code, 403)
        self.assertEqual(await self.saved_state(), before)
        with self.assertRaises(HTTPException) as apply:
            await services.apply_plan(server, frozen, identity, user, 'Forbidden shared recovery')
        self.assertEqual(apply.exception.status_code, 403)
        self.assertEqual(await self.saved_state(), before)
        self.assertEqual((await server.db.create_requests.find_one({'_id': identity}))['r4_write_plan'], frozen)

    async def test_missing_retained_plan_refuses_pending_and_completed_replay_before_repair(self):
        key = 'r4-service-missing-frozen-plan'
        path, body, identity, _, frozen, _ = await self.interrupted_replacement(key)
        user = await server.db.users.find_one({'user_id': 'service-admin'})
        before = await self.saved_state()
        self.assertIsNone(await services.authorize_retained_command(server, 'r4-service-no-retained-intent',
            user, None, 'tool-catalog/ninjaone/replace', body))
        self.assertIsNone(await services.authorize_retained_command(server, key,
            user, None, 'tool-catalog/ninjaone/replace', {**body, 'retire': False}))
        self.assertEqual(await self.saved_state(), before)
        for state in ('pending', 'complete'):
            with self.subTest(state=state):
                actual = await server.db.create_requests.find_one({'_id': identity})
                self.assertEqual(actual['state'], state)
                self.assertTrue(actual['primary_started'])
                self.assertEqual(await services.authorize_retained_command(server, key, user,
                    None, 'tool-catalog/ninjaone/replace', body), identity)
                # Damage only this owned synthetic receipt, retaining all actual
                # business after-images and the original plan for safe restoration.
                await server.db.create_requests.update_one({'_id': identity}, {'$unset': {'r4_write_plan': ''}})
                before = await self.saved_state()
                blocked = AsyncMock(side_effect=AssertionError('Unknown retained plan must precede receipt replay'))
                with patch.object(create_requests, 'run', blocked):
                    denied = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
                self.assertEqual(denied.status_code, 409, denied.text)
                blocked.assert_not_awaited()
                self.assertEqual(await self.saved_state(), before)
                await server.db.create_requests.update_one({'_id': identity}, {'$set': {'r4_write_plan': frozen}})
                recovered = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
                self.assertEqual(recovered.status_code, 200, recovered.text)
                self.assertEqual((await server.db.create_requests.find_one({'_id': identity}))['r4_write_plan'], frozen)

    async def test_completed_replay_rechecks_every_affected_client_before_cached_success(self):
        key = 'r4-service-complete-replay'
        path, body, identity, _ = await self.replacement_fixture(key)
        first = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(first.status_code, 200, first.text)
        frozen = deepcopy((await server.db.create_requests.find_one({'_id': identity}))['r4_write_plan'])
        for change in ('membership', 'archived'):
            with self.subTest(change=change):
                if change == 'membership':
                    await server.db.users.update_one({'user_id': 'service-admin'}, {'$set': {'client_ids': ['a']}})
                    expected = 403
                else:
                    await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'status': 'archived'}})
                    expected = 409
                before = await self.saved_state()
                blocked = AsyncMock(side_effect=AssertionError('Current authority must precede cached success'))
                with patch.object(create_requests, 'run', blocked):
                    denied = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
                self.assertEqual(denied.status_code, expected, denied.text)
                blocked.assert_not_awaited()
                self.assertEqual(await self.saved_state(), before)
                await server.db.users.update_one({'user_id': 'service-admin'}, {'$set': {'client_ids': ['a', 'b']}})
                await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'status': 'active'}})
        before = await self.saved_state()
        replay = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json(), first.json())
        self.assertEqual(await self.saved_state(), before)
        self.assertEqual((await server.db.create_requests.find_one({'_id': identity}))['r4_write_plan'], frozen)

    async def test_review_only_pending_setup_and_context_reads_refuse_until_exact_recovery(self):
        self.sign_in('admin')
        plan = active_plans('cis-ig1')[0]
        rid, aid = 'r4-owned-setup-review', 'r4-owned-assessment'
        review_updated_at = '2026-11-19T00:00:01+00:00'
        activity = 'review:' + rid
        area = services.TOPICS[services.template_id({'framework_key': 'cis-ig1', 'framework_plan_key': plan['key']})]['areas'][0]
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {
            'updated_at': '2026-11-19T00:00:00+00:00',
            'profile.services': {'areas': {area: {'responsibility': 'iv', 'tool_ids': []}},
                'provider_vendor_id': 'r4-owned-provider',
                'assessment_activities': {'setup:' + activity: activity, aid: activity}}}})
        await server.db.vendors.insert_one({'vendor_id': 'r4-owned-provider', 'client_id': 'a', 'name': 'Synthetic provider'})
        await server.db.requirements.insert_one({'requirement_id': 'r4-cis-enrollment', 'client_id': 'a',
            'baseline_key': 'cis-ig1', 'baseline_response': 'applies'})
        await server.db.framework_assessments.insert_one({'framework_assessment_id': aid, 'client_id': 'a',
            'framework_key': 'cis-ig1', 'definition_id': plan['safeguards'][0], 'updated_at': 'assessment-v1'})
        await server.db.reviews.insert_one({'review_id': rid, 'client_id': 'a', 'title': 'Synthetic owned activity',
            'review_type': plan['review_type'], 'framework_key': 'cis-ig1', 'framework_plan_key': plan['key'],
            'status': 'upcoming', 'recurrence': plan['default_cadence'], 'due_date': '2099-12-01',
            'current_occurrence_id': 'r4-owned-occurrence', 'updated_at': review_updated_at,
            'activity_setup': {'recurring_ticket_number': '100'}})
        client_before = await server.db.clients.find_one({'client_id': 'a'})
        body = {'activity_id': activity, 'review_id': rid, 'expected_updated_at': review_updated_at,
            'expected_client_updated_at': client_before['updated_at'], 'recurring_ticket_number': '200'}
        key = 'r4-review-only-context-save'
        path = '/api/clients/a/iv-setup'
        original = server.audit
        audit_fault_seen = False

        async def fail_audit(user, event, *args, **kwargs):
            nonlocal audit_fault_seen
            if event == 'Services and tools updated':
                audit_fault_seen = True
                raise RuntimeError('Synthetic interruption after the owned Review patch')
            return await original(user, event, *args, **kwargs)

        with patch.object(server, 'audit', fail_audit):
            interrupted = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
        self.assertTrue(audit_fault_seen, 'The intended audit fault must land after the Review patch')
        self.assertEqual(interrupted.status_code, 503, interrupted.text)
        pending = await server.db.reviews.find_one({'review_id': rid})
        identity = pending['_r4_context_pending']
        receipt = await server.db.create_requests.find_one({'_id': identity})
        frozen = deepcopy(receipt['r4_write_plan'])
        self.assertEqual([(row['collection'], row['id']) for row in frozen], [('reviews', rid)])
        self.assertEqual(pending['activity_setup']['recurring_ticket_number'], '200')
        self.assertEqual(await server.db.clients.find_one({'client_id': 'a'}), client_before)
        context_path = '/api/framework_assessments/' + aid + '/service-context'
        for read_path in (path, context_path):
            response = await self.client.get(read_path)
            self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(await server.db.reviews.find_one({'review_id': rid}), pending)
        recovered = await self.client.post(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(recovered.status_code, 200, recovered.text)
        saved = await server.db.reviews.find_one({'review_id': rid})
        self.assertNotIn('_r4_context_pending', saved)
        self.assertEqual(saved['updated_at'], pending['updated_at'])
        self.assertEqual((await server.db.create_requests.find_one({'_id': identity}))['r4_write_plan'], frozen)
        setup = await self.client.get(path)
        self.assertEqual(setup.status_code, 200, setup.text)
        row = next(item for item in setup.json()['activities'] if item['activity_id'] == activity)
        self.assertEqual(row['setup']['recurring_ticket_number'], '200')
        self.assertEqual((await self.client.get(context_path)).status_code, 200)

    async def test_assessment_only_plan_preserves_existing_contributor_write_scope(self):
        user = await server.db.users.find_one({'user_id': 'member'})
        assessment = {'framework_assessment_id': 'r4-owned-contributor-assessment', 'client_id': 'a',
            'owner_id': user['user_id'], 'updated_at': 'saved-v1', 'notes': 'Retained native note'}
        await server.db.framework_assessments.insert_one(deepcopy(assessment))
        identity = 'a' * 64
        await server.db.create_requests.insert_one({'_id': identity, 'state': 'pending'})
        writes = [services.write_row('framework_assessments', 'framework_assessment_id', assessment,
                                     {'notes': 'Explicit owned assessment change', 'updated_at': 'saved-v2'})]
        await services.apply_plan(server, writes, identity, user, 'Synthetic assessment-only context save')
        saved = await server.db.framework_assessments.find_one({'framework_assessment_id': assessment['framework_assessment_id']})
        self.assertEqual(saved['notes'], 'Explicit owned assessment change')
        self.assertEqual(saved['owner_id'], user['user_id'])
        self.assertNotIn('_r4_context_pending', saved)
