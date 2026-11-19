"""Mounted Tool usage reads; the real-R4 inventory reruns this class on Motor."""
import copy
import unittest
from unittest.mock import patch

import test_client_dashboard_sources as fixture
import r4_services

server = fixture.server
PENDING = 'e' * 64
PATH = '/api/tool-catalog/ninjaone/usage'


class R4ToolUsageTests(unittest.IsolatedAsyncioTestCase):
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await fixture.ClientDashboardSourcesTests.asyncSetUp(self)
        await server.db.users.insert_one({'user_id': 'provider', 'name': 'Synthetic scoped provider',
            'email': 'provider@example.test', 'role': 'platform_admin', 'status': 'active', 'client_ids': ['a']})
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'name': 'Accessible client', 'updated_at': 'a1',
            'profile.services': {'areas': {'endpoint': {'tool_ids': ['ninjaone']},
                'patching': {'tool_ids': ['ninjaone', 'ninjaone']}, 'retained_area': {'tool_ids': ['ninjaone']}}}}})
        await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'name': 'Private foreign client', 'updated_at': 'b1',
            'profile.services': {'areas': {'endpoint': {'tool_ids': ['ninjaone']}}}}})
        await server.db.clients.insert_many([
            {'client_id': 'archived', 'name': 'Retained archived client', 'status': 'archived', 'updated_at': 'arch1',
             'profile': {'services': {'areas': {'endpoint': {'tool_ids': ['ninjaone']}}}}},
            {'client_id': 'no-selections', 'name': 'Partial retained services', 'profile': {'services': {}}},
        ])
        self.sign_in('provider')

    async def snapshot(self):
        return {kind: await server.db[kind].find({}, {'_id': 0}).to_list(None) for kind in (
            'clients', 'users', 'tool_catalog', 'reviews', 'framework_assessments', 'audit_logs', 'create_requests')}

    async def assert_read_unchanged(self, status, path=PATH):
        before = await self.snapshot()
        response = await self.client.get(path)
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(await self.snapshot(), before)
        return response

    async def test_authorized_current_selections_are_distinct_complete_and_read_only(self):
        response = await self.assert_read_unchanged(200)
        data = response.json()
        self.assertEqual({key: data[key] for key in ('tool_id', 'scope', 'client_count', 'selection_count', 'expected_updated_at')},
            {'tool_id': 'ninjaone', 'scope': 'authorized_clients', 'client_count': 1,
             'selection_count': 3, 'expected_updated_at': None})
        self.assertEqual(data['clients'], [{'client_id': 'a', 'name': 'Accessible client', 'status': 'active',
            'expected_updated_at': 'a1', 'areas': [{'area_id': 'endpoint', 'name': 'Endpoint management & inventory'},
                {'area_id': 'patching', 'name': 'Patch management'}, {'area_id': 'retained_area', 'name': 'retained_area'}]}])
        self.assertNotIn('Private foreign', response.text)
        self.assertNotIn('Retained archived', response.text)
        self.assertNotIn('_r4_', response.text)
        self.sign_in('admin')
        data = (await self.assert_read_unchanged(200)).json()
        self.assertEqual((data['client_count'], data['selection_count']), (3, 5))
        self.assertEqual({row['client_id'] for row in data['clients']}, {'a', 'b', 'archived'})
        self.assertEqual(next(row for row in data['clients'] if row['client_id'] == 'archived')['status'], 'archived')

    async def test_zero_unknown_and_catalog_version_have_explicit_meaning(self):
        data = (await self.assert_read_unchanged(200, '/api/tool-catalog/connectsecure/usage')).json()
        self.assertEqual((data['client_count'], data['selection_count'], data['clients']), (0, 0, []))
        await self.assert_read_unchanged(404, '/api/tool-catalog/unknown-tool/usage')
        tool = next(row for row in r4_services.CATALOG['tools'] if row['tool_id'] == 'ninjaone')
        await server.db.tool_catalog.insert_one({**copy.deepcopy(tool), 'updated_at': 'catalog-v1', 'retired': True})
        data = (await self.assert_read_unchanged(200)).json()
        self.assertEqual(data['expected_updated_at'], 'catalog-v1')
        self.assertEqual(data['client_count'], 1)
        await server.db.users.update_one({'user_id': 'provider'}, {'$set': {'client_ids': []}})
        data = (await self.assert_read_unchanged(200)).json()
        self.assertEqual((data['scope'], data['client_count'], data['clients']), ('authorized_clients', 0, []))

    async def test_pending_authorized_population_or_catalog_refuses_counts_without_writes(self):
        for target in ('selected', 'unselected', 'catalog'):
            with self.subTest(target=target):
                if target == 'catalog':
                    tool = next(row for row in r4_services.CATALOG['tools'] if row['tool_id'] == 'intune')
                    await server.db.tool_catalog.insert_one({**copy.deepcopy(tool), '_r4_context_pending': PENDING})
                else:
                    if target == 'unselected':
                        await server.db.users.update_one({'user_id': 'provider'}, {'$set': {'client_ids': ['a', 'no-selections']}})
                    await server.db.clients.update_one({'client_id': 'a' if target == 'selected' else 'no-selections'},
                        {'$set': {'_r4_context_pending': PENDING}})
                response = await self.assert_read_unchanged(409)
                self.assertNotIn(PENDING, response.text)
                self.assertNotIn('Accessible client', response.text)
                await server.db.clients.update_many({}, {'$unset': {'_r4_context_pending': ''}})
                await server.db.tool_catalog.delete_many({})

    async def test_foreign_pending_usage_never_blocks_or_discloses_the_accessible_population(self):
        await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'_r4_context_pending': PENDING}})
        response = await self.assert_read_unchanged(200)
        self.assertEqual(response.json()['client_count'], 1)
        self.assertNotIn('Private foreign', response.text)
        self.assertNotIn(PENDING, response.text)

    async def change_at_source_read(self, change, *, before=False):
        collection = server.db.clients
        collection_type, original = type(collection), type(collection).find
        injected = False

        class Cursor:
            def __init__(self, cursor):
                self.cursor = cursor

            def sort(self, *args, **kwargs):
                self.cursor = self.cursor.sort(*args, **kwargs)
                return self

            async def to_list(self, length):
                nonlocal injected
                if before and not injected:
                    injected = True
                    await change()
                rows = await self.cursor.to_list(length)
                if not injected:
                    injected = True
                    await change()
                return rows

        def find(target, *args, **kwargs):
            cursor = original(target, *args, **kwargs)
            fields = args[1] if len(args) > 1 else kwargs.get('projection', {})
            if not injected and target.full_name == collection.full_name and fields.get('profile') == 1:
                return Cursor(cursor)
            return cursor

        with patch.object(collection_type, 'find', find):
            response = await self.client.get(PATH)
        self.assertTrue(injected, 'Inject at the actual projected Client read, including lazy Motor cursors')
        return response

    async def test_claim_and_source_change_after_preflight_fail_closed(self):
        async def claim():
            await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'_r4_context_pending': PENDING}})
        response = await self.change_at_source_read(claim, before=True)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual((await server.db.clients.find_one({'client_id': 'a'}))['_r4_context_pending'], PENDING)
        await server.db.clients.update_one({'client_id': 'a'}, {'$unset': {'_r4_context_pending': ''}})
        expected = await self.snapshot()
        async def selection_change():
            await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'updated_at': 'a2',
                'profile.services.areas.endpoint.tool_ids': ['intune']}})
        response = await self.change_at_source_read(selection_change)
        self.assertEqual(response.status_code, 409, response.text)
        after = await self.snapshot()
        changed = next(row for row in expected['clients'] if row['client_id'] == 'a')
        changed['updated_at'] = 'a2'
        changed['profile']['services']['areas']['endpoint']['tool_ids'] = ['intune']
        self.assertEqual(after, expected)

    async def test_current_membership_and_role_are_rechecked_before_delivery(self):
        async def withdraw():
            await server.db.users.update_one({'user_id': 'provider'}, {'$set': {'client_ids': []}})
        response = await self.change_at_source_read(withdraw)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn('Accessible client', response.text)
        await server.db.users.update_one({'user_id': 'provider'}, {'$set': {'client_ids': ['a']}})
        async def downgrade():
            await server.db.users.update_one({'user_id': 'provider'}, {'$set': {'role': 'client_readonly'}})
        response = await self.change_at_source_read(downgrade)
        self.assertEqual(response.status_code, 403, response.text)
        self.assertNotIn('Accessible client', response.text)
        audits = await server.db.audit_logs.find({'action': 'access-denied'}, {'_id': 0}).to_list(None)
        self.assertEqual(len(audits), 1)
        self.assertEqual(audits[0]['user_id'], 'provider')
        self.assertEqual(audits[0]['meta'], {'outcome': 'denied', 'method': 'GET', 'route': '/api/tool-catalog/{tool_id}/usage', 'status': 403})

    async def test_read_roles_and_replace_permissions_are_not_broadened(self):
        self.sign_in('member')
        self.assertEqual((await self.client.get(PATH)).status_code, 403)
        self.sign_in('provider')
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'updated_at': '2026-11-01T12:00:00+00:00'}})
        data = (await self.client.get(PATH)).json()
        self.assertEqual(data['client_count'], 1)
        before = await self.snapshot()
        response = await self.client.post('/api/tool-catalog/ninjaone/replace', json={
            'replacement_id': 'intune', 'expected_updated_at': None, 'retire': True},
            headers={'Idempotency-Key': 'synthetic-tool-usage-replace-01'})
        self.assertEqual(response.status_code, 403, response.text)
        after = await self.snapshot()
        for kind in ('clients', 'tool_catalog', 'reviews', 'framework_assessments'):
            self.assertEqual(after[kind], before[kind])
        self.assertNotIn('Private foreign client', response.text)

    async def test_complete_limit_and_off_page_pending_do_not_publish_partial_usage(self):
        self.sign_in('admin')
        count = await server.db.clients.count_documents({})
        await server.db.clients.insert_many([{'client_id': 'extra-%03d' % index, 'name': 'Synthetic empty client'}
            for index in range(500 - count)])
        await server.db.clients.insert_one({'client_id': 'zz-pending-outside-cap', 'name': 'Synthetic last client'})
        await self.assert_read_unchanged(413)
        await server.db.clients.update_one({'client_id': 'zz-pending-outside-cap'}, {'$set': {'_r4_context_pending': PENDING}})
        await self.assert_read_unchanged(409)

    async def test_malformed_selection_data_is_explicitly_unavailable(self):
        for areas in ({'endpoint': {'tool_ids': 'ninjaone'}}, [], '', False, {'endpoint': []}):
            with self.subTest(areas=areas):
                await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'profile.services.areas': areas}})
                response = await self.assert_read_unchanged(409)
                self.assertIn('could not be verified', response.text)

    async def test_malformed_profile_envelopes_cannot_be_projected_into_zero_usage(self):
        for profile in ([], '', False, {'services': []}, {'services': ''}, {'services': False}):
            with self.subTest(profile=profile):
                await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'profile': profile}})
                response = await self.assert_read_unchanged(409)
                self.assertIn('could not be verified', response.text)
