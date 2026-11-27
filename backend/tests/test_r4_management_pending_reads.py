"""Mounted management reads must refuse unfinished native shared-context plans."""
import copy
import unittest
import uuid
from unittest.mock import patch

import test_client_dashboard_sources as fixture
import create_requests
import r4_services
from routes import portfolio

server = fixture.server
VERSION = '2026-11-19T00:00:00+00:00'
NEXT_VERSION = '2026-11-19T00:01:00+00:00'
WINDOW = {'start': '2099-01-01', 'end': '2099-01-31', 'scope': 'all'}


class R4ManagementPendingReadTests(unittest.IsolatedAsyncioTestCase):
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await fixture.ClientDashboardSourcesTests.asyncSetUp(self)
        projection_db = patch.object(portfolio, 'db', server.db)
        projection_db.start()
        self.addCleanup(projection_db.stop)
        self.sign_in('admin')

    async def snapshot(self):
        return {name: await server.db[name].find({}, {'_id': 0}).to_list(None)
                for name in ('clients', 'reviews', 'vendors', 'tasks', 'risks', 'policies',
                             'requirements', 'exceptions', 'create_requests', 'audit_logs')}

    def reads(self, client_id='a'):
        return [
            ('/api/dashboard', {'client_id': client_id}),
            ('/api/dashboard', {'client_id': client_id, 'detail': 'pastDue', 'limit': 100}),
            ('/api/dashboard', {'client_id': client_id, 'work_queue': True, 'detail': 'all'}),
            ('/api/calendar', {'client_id': client_id, **WINDOW}),
            ('/api/reports/board', {'client_id': client_id}),
            ('/api/clients/directory', {}),
        ]

    async def assert_pending_reads(self):
        before = await self.snapshot()
        for path, params in self.reads():
            with self.subTest(path=path, params=params):
                response = await self.client.get(path, params=params)
                self.assertEqual(response.status_code, 409, response.text)
                self.assertIn('shared activity save needs recovery', response.json()['detail'])
                self.assertNotIn('_r4_context_', response.text)
        self.assertEqual(await self.snapshot(), before, 'Refused reads must not alter business data or pending recovery')

    async def assert_settled_reads(self):
        for path, params in self.reads():
            with self.subTest(path=path, params=params):
                response = await self.client.get(path, params=params)
                self.assertEqual(response.status_code, 200, response.text[:400])
                if path == '/api/reports/board':
                    self.assertTrue(response.content.startswith(b'%PDF'))
                else:
                    self.assertNotIn('_r4_context_', response.text)

    async def interrupt_plan(self, collection, field, row, updates):
        """Use the real claim/apply/audit writer, with a failure after business writes."""
        await server.db[collection].insert_one(copy.deepcopy(row))
        identity = create_requests.digest(uuid.uuid4().hex)
        await server.db.create_requests.insert_one({'_id': identity})
        writes = [r4_services.write_row(collection, field, row, {**updates, 'updated_at': NEXT_VERSION})]
        user = await server.db.users.find_one({'user_id': 'admin'}, {'_id': 0})
        with patch.object(server, 'audit', side_effect=RuntimeError('Synthetic interrupted shared-context audit')):
            with self.assertRaisesRegex(RuntimeError, 'Synthetic interrupted'):
                await r4_services.apply_plan(server, writes, identity, user, 'Synthetic shared-context test')
        pending = await server.db[collection].find_one({field: row[field]}, {'_id': 0})
        self.assertEqual(pending['_r4_context_pending'], identity)
        for key, value in updates.items():
            self.assertEqual(pending[key], value)
        client = await server.db.clients.find_one({'client_id': row['client_id']})
        self.assertFalse(client.get('_r4_context_pending'), 'This real plan deliberately has no Client write')
        return writes, identity, user

    async def recover_plan(self, plan):
        writes, identity, user = plan
        await r4_services.apply_plan(server, writes, identity, user, 'Synthetic shared-context test')
        item = writes[0]
        row = await server.db[item['collection']].find_one({item['id_field']: item['id']})
        self.assertNotIn('_r4_context_pending', row)

    async def test_review_only_interrupted_plan_refuses_mounted_management_reads_then_recovers(self):
        review = {'review_id': 'review-only', 'client_id': 'a', 'title': 'Synthetic shared Review',
                  'review_type': 'custom', 'status': 'upcoming', 'recurrence': 'annual',
                  'due_date': '2099-01-10', 'updated_at': VERSION}
        plan = await self.interrupt_plan('reviews', 'review_id', review, {'due_date': '2099-01-20'})
        await self.assert_pending_reads()
        await self.recover_plan(plan)
        await self.assert_settled_reads()
        calendar = await self.client.get('/api/calendar', params={'client_id': 'a', **WINDOW})
        self.assertEqual([entry['id'] for entry in calendar.json()['reviews']['2099-01-20']], ['review-only'])

    async def test_vendor_only_interrupted_plan_is_checked_before_vendor_view_removes_its_marker(self):
        vendor = {'vendor_id': 'vendor-only', 'client_id': 'a', 'name': 'Synthetic shared Vendor',
                  'service': 'Synthetic original service', 'status': 'active', 'criticality': 'low',
                  'assurance_records': [], 'contract_renewal': '2099-01-10', 'updated_at': VERSION}
        plan = await self.interrupt_plan('vendors', 'vendor_id', vendor,
            {'service': 'Synthetic applied service', 'contract_renewal': '2099-01-20'})
        await self.assert_pending_reads()
        await self.recover_plan(plan)
        await self.assert_settled_reads()
        calendar = await self.client.get('/api/calendar', params={'client_id': 'a', **WINDOW})
        self.assertEqual(calendar.json()['vendor_dates']['2099-01-20'][0]['vendor_id'], 'vendor-only')

    async def test_pending_linked_review_outside_window_cannot_silently_change_vendor_calendar_representation(self):
        await server.db.vendors.insert_one({'vendor_id': 'linked-vendor', 'client_id': 'a',
            'name': 'Synthetic linked Vendor', 'status': 'active', 'contract_renewal': '2099-01-15'})
        review = {'review_id': 'linked-contract', 'client_id': 'a', 'vendor_id': 'linked-vendor',
                  'vendor_purpose': 'contract', 'title': 'Synthetic contract Review', 'review_type': 'vendor',
                  'status': 'upcoming', 'recurrence': 'annual', 'due_date': '2099-01-15', 'updated_at': VERSION}
        plan = await self.interrupt_plan('reviews', 'review_id', review, {'due_date': '2099-02-15'})
        before = await self.snapshot()
        for scope in ('active', 'history', 'all'):
            response = await self.client.get('/api/calendar', params={'client_id': 'a', **WINDOW, 'scope': scope})
            self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(await self.snapshot(), before)
        await self.recover_plan(plan)
        response = await self.client.get('/api/calendar', params={'client_id': 'a', **WINDOW})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['reviews'], {})
        self.assertEqual(response.json()['vendor_dates'], {}, 'The settled linked contract still represents renewal')

    async def test_real_services_write_with_pending_client_blocks_even_empty_management_populations(self):
        payload = {'expected_updated_at': None, 'areas': {'endpoint': {'responsibility': 'iv', 'tool_ids': []}},
                   'custom_tools': [], 'preset': None}
        headers = {'Idempotency-Key': uuid.uuid4().hex}
        with patch.object(server, 'audit', side_effect=RuntimeError('Synthetic interrupted Services audit')):
            failed = await self.client.post('/api/clients/a/services', json=payload, headers=headers)
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertTrue((await server.db.clients.find_one({'client_id': 'a'})).get('_r4_context_pending'))
        await self.assert_pending_reads()
        repaired = await self.client.post('/api/clients/a/services', json=payload, headers=headers)
        self.assertEqual(repaired.status_code, 200, repaired.text)
        await self.assert_settled_reads()

    async def test_foreign_pending_plan_does_not_block_authorized_settled_tenant_or_expand_access(self):
        review = {'review_id': 'foreign-pending', 'client_id': 'b', 'title': 'Foreign pending Review',
                  'review_type': 'custom', 'status': 'upcoming', 'recurrence': 'annual',
                  'due_date': '2099-01-10', 'updated_at': VERSION}
        await self.interrupt_plan('reviews', 'review_id', review, {'due_date': '2099-01-20'})
        await server.db.users.insert_one({'user_id': 'scoped-manager', 'email': 'scoped@example.test',
            'role': 'platform_admin', 'status': 'active', 'client_ids': ['a']})
        self.sign_in('scoped-manager')
        before = {kind: await server.db[kind].find({}).to_list(None) for kind in ('clients', 'reviews', 'vendors')}
        await self.assert_settled_reads()
        directory = await self.client.get('/api/clients/directory')
        self.assertEqual([client['client_id'] for client in directory.json()['clients']], ['a'])
        for path, params in self.reads('b'):
            if path == '/api/clients/directory':
                continue
            denied = await self.client.get(path, params=params)
            self.assertEqual(denied.status_code, 403, denied.text)
            self.assertNotIn('foreign-pending', denied.text)
        self.assertEqual({kind: await server.db[kind].find({}).to_list(None) for kind in before}, before)

    async def test_calendar_pending_preflight_is_not_limited_to_first_hundred_or_visible_dates(self):
        await server.db.reviews.insert_many([{'review_id': 'settled-' + str(index), 'client_id': 'a',
            'title': 'Synthetic settled Review', 'review_type': 'custom', 'status': 'upcoming',
            'recurrence': 'annual', 'due_date': '2099-05-10', 'updated_at': VERSION} for index in range(100)])
        review = {'review_id': 'pending-after-hundred', 'client_id': 'a', 'title': 'Synthetic pending Review',
                  'review_type': 'custom', 'status': 'upcoming', 'recurrence': 'annual',
                  'due_date': '2099-05-10', 'updated_at': VERSION}
        plan = await self.interrupt_plan('reviews', 'review_id', review, {'due_date': '2099-06-10'})
        before = await self.snapshot()
        denied = await self.client.get('/api/calendar', params={'client_id': 'a', **WINDOW})
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertEqual(await self.snapshot(), before)
        await self.recover_plan(plan)
        result = await self.client.get('/api/calendar', params={'client_id': 'a', **WINDOW})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['reviews'], {})
        self.assertEqual(await server.db.reviews.count_documents({'client_id': 'a'}), 101)
