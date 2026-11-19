"""Native routes must not publish or delete an interrupted shared write set."""
import copy
import unittest
import uuid
from unittest.mock import patch

import test_framework_governance as framework_fixture
import test_client_dashboard_sources as fixture

server = fixture.server
PENDING = 'a' * 64


class R4PendingReadTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def review(self, ident, client_id='a', **extra):
        row = {'review_id': ident, 'client_id': client_id, 'title': 'Synthetic pending-state check',
               'review_type': 'custom', 'status': 'upcoming', 'recurrence': 'annual',
               'due_date': '2099-01-01', 'updated_at': 'synthetic-saved-revision', **extra}
        await server.db.reviews.insert_one(copy.deepcopy(row))
        return row

    async def test_scoped_lists_and_exports_refuse_pending_rows_without_exposing_foreign_records(self):
        await self.review('visible')
        await self.review('foreign-pending', 'b', _r4_context_pending=PENDING)
        self.sign_in('member')
        for route in ('/api/reviews', '/api/export/reviews'):
            response = await self.client.get(route)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn('foreign-pending', response.text)
            self.assertEqual((await self.client.get(route, params={'client_id': 'b'})).status_code, 403)
        self.sign_in('admin')
        for route in ('/api/reviews', '/api/export/reviews'):
            self.assertEqual((await self.client.get(route)).status_code, 409)
            response = await self.client.get(route, params={'client_id': 'a'})
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await server.db.reviews.count_documents({}), 2)

    async def test_pending_client_blocks_even_an_empty_population_without_read_side_effects(self):
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'_r4_context_pending': PENDING}})
        self.sign_in('member')
        before = await server.db.clients.find_one({'client_id': 'a'})
        for kind in ('reviews', 'vendors', 'risks', 'tasks'):
            for prefix in ('/api/', '/api/export/'):
                response = await self.client.get(prefix + kind, params={'client_id': 'a'})
                self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(await server.db[kind].count_documents({}), 0)
        self.assertEqual(await server.db.clients.find_one({'client_id': 'a'}), before)
        self.assertEqual(await server.db.audit_logs.count_documents({}), 0)

    async def test_client_list_refuses_an_interrupted_services_write_until_its_exact_recovery(self):
        self.sign_in('admin')
        payload = {'expected_updated_at': None, 'areas': {'endpoint': {'responsibility': 'iv', 'tool_ids': []}},
                   'custom_tools': [], 'preset': None}
        headers = {'Idempotency-Key': uuid.uuid4().hex}
        with patch.object(server, 'audit', side_effect=RuntimeError('Synthetic response failure after actual Services writes')):
            failed = await self.client.post('/api/clients/a/services', json=payload, headers=headers)
        self.assertEqual(failed.status_code, 503, failed.text)
        accepted = await server.db.clients.find_one({'client_id': 'a'})
        self.assertTrue(accepted.get('_r4_context_pending'))
        self.assertEqual(accepted['profile']['services']['areas']['endpoint']['responsibility'], 'iv')
        before = copy.deepcopy(accepted)
        response = await self.client.get('/api/clients')
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn('profile', response.json())
        self.assertEqual(response.json()['detail']['code'], 'SHARED_CONTEXT_RECOVERY_REQUIRED')
        self.assertEqual(set(response.json()['detail']['client_ids']), {'a', 'b'})
        self.assertNotIn('iv', response.json()['detail']['client_ids'])
        self.assertEqual(await server.db.clients.find_one({'client_id': 'a'}), before)
        repaired = await self.client.post('/api/clients/a/services', json=payload, headers=headers)
        self.assertEqual(repaired.status_code, 200, repaired.text)
        response = await self.client.get('/api/clients')
        self.assertEqual(response.status_code, 200, response.text)
        row = next(row for row in response.json() if row['client_id'] == 'a')
        self.assertEqual(row['profile']['services']['areas']['endpoint']['responsibility'], 'iv')
        self.assertNotIn('_r4_context_', response.text)
        self.assertEqual(await server.db.vendors.count_documents({'client_id': 'a', 'catalog_key': 'iventure-solutions'}), 1)

    async def test_foreign_pending_client_does_not_block_a_scoped_client_list(self):
        await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'_r4_context_pending': PENDING}})
        self.sign_in('member')
        response = await self.client.get('/api/clients')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([row['client_id'] for row in response.json()], ['a'])
        self.assertNotIn('_r4_context_', response.text)
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'_r4_context_pending': PENDING}})
        response = await self.client.get('/api/clients')
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()['detail']['client_ids'], ['a'])
        self.assertNotIn('Minimal', response.text)

    async def test_dashboard_framework_work_membership_refuses_a_pending_assessment(self):
        await self.review('membership-review')
        await server.db.framework_assessments.insert_one({
            'framework_assessment_id': 'pending-membership', 'client_id': 'a',
            'framework_key': 'cis-ig1', 'definition_id': '1.1',
            'related_links': [{'kind': 'reviews', 'id': 'membership-review'}],
            '_r4_context_pending': PENDING})
        self.sign_in('member')
        response = await self.client.get('/api/dashboard', params={
            'client_id': 'a', 'work_queue': True, 'work_metadata': True})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn('pending-membership', response.text)
        self.assertEqual(await server.db.framework_assessments.count_documents({}), 1)
        await server.db.framework_assessments.update_one(
            {'framework_assessment_id': 'pending-membership'}, {'$unset': {'_r4_context_pending': ''}})
        response = await self.client.get('/api/dashboard', params={
            'client_id': 'a', 'work_queue': True, 'work_metadata': True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn('_r4_context_', response.text)

    async def test_vendor_projection_checks_linked_reviews_but_not_an_unrelated_client(self):
        vendor = {'vendor_id': 'vendor-a', 'client_id': 'a', 'name': 'Synthetic vendor',
                  'service': 'Synthetic service', 'status': 'active', 'criticality': 'low'}
        await server.db.vendors.insert_one(copy.deepcopy(vendor))
        await self.review('foreign-review', 'b', vendor_id='vendor-a', _r4_context_pending=PENDING)
        self.sign_in('member')
        for path in ('/api/vendors', '/api/vendors/vendor-a'):
            self.assertEqual((await self.client.get(path, params={'client_id': 'a'})).status_code, 200)
        await self.review('linked-pending', vendor_id='vendor-a', _r4_context_pending=PENDING)
        for path in ('/api/vendors', '/api/vendors/vendor-a'):
            response = await self.client.get(path, params={'client_id': 'a'})
            self.assertEqual(response.status_code, 409, response.text)
        response = await self.client.get('/api/related', params={'entity_type': 'vendors', 'entity_id': 'vendor-a'})
        self.assertEqual(response.status_code, 409, response.text)

    async def test_pending_source_and_basis_are_not_published_as_settled_related_information(self):
        await self.review('visible')
        await server.db.framework_assessments.insert_one({
            'framework_assessment_id': 'pending-basis', 'client_id': 'a', 'framework_key': 'cis-ig1',
            'definition_id': '1.1', 'related_links': [{'kind': 'reviews', 'id': 'visible'}],
            '_r4_context_pending': PENDING})
        self.sign_in('member')
        response = await self.client.get('/api/reviews', params={'client_id': 'a', 'include_basis': True})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual((await self.client.get('/api/reviews', params={'client_id': 'a'})).status_code, 200)
        response = await self.client.get('/api/related', params={'entity_type': 'reviews', 'entity_id': 'visible'})
        self.assertEqual(response.status_code, 409, response.text)
        await server.db.reviews.update_one({'review_id': 'visible'}, {'$set': {'_r4_context_pending': PENDING}})
        response = await self.client.get('/api/related', params={'entity_type': 'reviews', 'entity_id': 'visible'})
        self.assertEqual(response.status_code, 409, response.text)

    async def test_single_and_bulk_delete_refuse_pending_records_before_any_selected_record_is_deleted(self):
        clean = await self.review('clean')
        pending = await self.review('pending', _r4_context_pending=PENDING)
        self.sign_in('admin')
        response = await self.client.request('DELETE', '/api/reviews/pending',
                                            json={'expected_updated_at': pending['updated_at']})
        self.assertEqual(response.status_code, 409, response.text)
        response = await self.client.post('/api/bulk', json={
            'kind': 'reviews', 'action': 'delete', 'ids': ['clean', 'pending'],
            'expected_versions': {row['review_id']: row['updated_at'] for row in (clean, pending)}})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(await server.db.reviews.count_documents({}), 2)
        self.assertEqual(await server.db.audit_logs.count_documents({}), 0)
        self.assertEqual(await server.db.portfolio_deletions.count_documents({}), 0)
        self.assertEqual(await server.db.create_requests.count_documents({}), 0)

    async def test_framework_related_records_keep_native_identity_without_private_command_markers(self):
        await self.review('settled-linked', _r4_context_applied=PENDING)
        await server.db.framework_assessments.insert_one({
            'framework_assessment_id': 'settled-assessment', 'client_id': 'a',
            'framework_key': 'cis-ig1', 'definition_id': '1.1', '_r4_context_applied': PENDING,
            'related_links': [{'kind': 'reviews', 'id': 'settled-linked'}]})
        self.sign_in('member')
        response = await self.client.get('/api/related', params={
            'entity_type': 'framework_assessments', 'entity_id': 'settled-assessment'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([row['review_id'] for row in response.json()['reviews']], ['settled-linked'])
        self.assertNotIn('_r4_context_', response.text)
        retained = await server.db.reviews.find_one({'review_id': 'settled-linked'})
        self.assertEqual(retained['_r4_context_applied'], PENDING)

    async def test_delete_compare_and_swap_retains_a_claim_acquired_after_the_route_read(self):
        row = await self.review('claim-after-read')
        self.sign_in('admin')
        original = server.portfolio_deletions.delete
        injected = False

        async def claim_before_delete(database, kind, key, source, predicate, user, now):
            nonlocal injected
            self.assertIn('_r4_context_pending', predicate)
            self.assertIsNone(predicate['_r4_context_pending'])
            await database.reviews.update_one({'review_id': row['review_id']},
                                             {'$set': {'_r4_context_pending': PENDING}})
            injected = True
            return await original(database, kind, key, source, predicate, user, now)

        with patch.object(server.portfolio_deletions, 'delete', claim_before_delete):
            response = await self.client.request('DELETE', '/api/reviews/' + row['review_id'],
                                                json={'expected_updated_at': row['updated_at']})
        self.assertTrue(injected)
        self.assertEqual(response.status_code, 409, response.text)
        retained = await server.db.reviews.find_one({'review_id': row['review_id']})
        self.assertEqual(retained['_r4_context_pending'], PENDING)
        self.assertEqual(retained['updated_at'], row['updated_at'])
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'delete'}), 0)


class R4CoordinatedAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = framework_fixture.FrameworkTests.asyncSetUp
    sign_in = framework_fixture.FrameworkTests.sign_in
    body = framework_fixture.FrameworkTests.body
    configure = framework_fixture.FrameworkTests.configure

    async def command(self, owner='admin', shared=True):
        workspace = await self.configure()
        row = workspace['assessments'][0]
        path = '/api/framework_assessments/' + row['framework_assessment_id']
        assigned = await self.client.patch(path, json={'owner_id': owner})
        self.assertEqual(assigned.status_code, 200, assigned.text)
        row = assigned.json()
        context = (await self.client.get(path + '/service-context')).json()
        coordination = {'expected_client_updated_at': context['expected_client_updated_at']}
        if shared:
            activity = context['candidates'][0]
            coordination.update(activity_id=activity['activity_id'], review_id=activity['review_id'],
                                expected_updated_at=activity['expected_updated_at'], notes='Synthetic reviewed setup change')
        body = {'implementation': 'Synthetic actual implementation', 'status': 'in_progress',
                'expected_last_assessed': row.get('last_saved') or row.get('last_assessed'),
                'coordination': coordination}
        return row, path, body, {'Idempotency-Key': uuid.uuid4().hex}

    async def business_snapshot(self):
        return {kind: await server.db[kind].find({}).to_list(None) for kind in
                ('clients', 'framework_assessments', 'reviews', 'vendors', 'tool_catalog', 'create_requests')}

    async def fail_actual_assessment_write(self, row, path, body, headers):
        collection = server.db.framework_assessments
        native_update = type(collection).update_one
        injected = False

        async def interrupt(target, query, update, **kwargs):
            nonlocal injected
            if (not injected and target.full_name == collection.full_name and
                    query.get('framework_assessment_id') == row['framework_assessment_id'] and
                    update.get('$set', {}).get('implementation') == body['implementation']):
                injected = True
                raise RuntimeError('Synthetic interruption at the actual accepted assessment write')
            return await native_update(target, query, update, **kwargs)

        with patch.object(type(collection), 'update_one', interrupt):
            response = await self.client.patch(path, json=body, headers=headers)
        self.assertTrue(injected, 'The actual accepted write must be reached')
        self.assertEqual(response.status_code, 503, response.text)
        receipt = await server.db.create_requests.find_one({'r4_write_plan': {'$exists': True}})
        self.assertIsNotNone(receipt)
        self.assertTrue(receipt['primary_started'])
        self.assertEqual(receipt['state'], 'pending')

    async def test_completed_shared_command_rechecks_current_role_before_cached_acknowledgment(self):
        _row, path, body, headers = await self.command()
        saved = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(saved.status_code, 200, saved.text)
        before = await self.business_snapshot()
        for role in ('client_contributor', 'client_readonly'):
            with self.subTest(role=role):
                await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': role}})
                denied = await self.client.patch(path, json=body, headers=headers)
                self.assertEqual(denied.status_code, 403, denied.text)
                self.assertEqual(await self.business_snapshot(), before)
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'super_admin'}})
        retry = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), saved.json())
        self.assertEqual(await self.business_snapshot(), before)

    async def test_interrupted_shared_command_retains_exact_plan_until_current_admin_is_restored(self):
        row, path, body, headers = await self.command()
        await self.fail_actual_assessment_write(row, path, body, headers)
        before = await self.business_snapshot()
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'client_contributor'}})
        denied = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(await self.business_snapshot(), before)
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'super_admin'}})
        retry = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()['implementation'], body['implementation'])
        self.assertEqual(len(retry.json()['assessment_history']), 1)
        self.assertFalse((await server.db.framework_assessments.find_one({
            'framework_assessment_id': row['framework_assessment_id']})).get('_r4_context_pending'))

    async def test_assigned_contributor_keeps_native_assessment_only_save_and_cached_read_only_denial(self):
        _row, path, body, headers = await self.command(owner='member', shared=False)
        self.sign_in('member')
        saved = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()['assessed_by'], 'member')
        before = await self.business_snapshot()
        retry = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), saved.json())
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        denied = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(await self.business_snapshot(), before)

    async def test_assessment_only_retry_can_recover_its_own_claim_without_a_program_admin_grant(self):
        row, path, body, headers = await self.command(owner='member', shared=False)
        self.sign_in('member')
        await self.fail_actual_assessment_write(row, path, body, headers)
        retry = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()['assessed_by'], 'member')
        self.assertEqual(len(retry.json()['assessment_history']), 1)
        self.assertEqual((await server.db.users.find_one({'user_id': 'member'}))['role'], 'client_contributor')
