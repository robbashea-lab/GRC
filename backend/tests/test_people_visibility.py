"""Phase 4A read-only people context; real routes against an isolated Mongo mock."""
import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server


class PeopleVisibilityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    async def test_contact_crud_does_not_create_accounts_or_change_members(self):
        self.sign_in('admin')
        users_before = await server.db.users.find({}).to_list(None)
        members_before = (await self.client.get('/api/clients/a/members')).json()
        response = await self.client.post('/api/contacts', json={
            'client_id': 'a', 'name': 'Maya Chen', 'title': 'IT Director',
            'role': 'IT Lead', 'email': 'maya@example.test', 'status': 'active',
        })
        self.assertEqual(response.status_code, 200, response.text)
        contact = response.json()
        self.assertFalse(contact.get('linked_user_id'))
        updated = await self.client.patch('/api/contacts/' + contact['contact_id'], json={
            'title': 'Director of IT', 'grc_roles': ['IT Lead', 'Policy Approver'],
        })
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()['grc_roles'], ['IT Lead', 'Policy Approver'])
        deleted = await self.client.delete('/api/contacts/' + contact['contact_id'])
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(await server.db.users.find({}).to_list(None), users_before)
        self.assertEqual((await self.client.get('/api/clients/a/members')).json(), members_before)

    async def test_members_context_is_authorized_and_has_existing_account_status(self):
        await server.db.users.insert_many([
            {'user_id': 'alex', 'name': 'Alex Morgan', 'client_ids': ['a'], 'role': 'client_contributor', 'status': 'active'},
            {'user_id': 'former', 'name': 'Former IT Manager', 'client_ids': ['a'], 'role': 'client_contributor', 'status': 'disabled'},
            {'user_id': 'private', 'name': 'Other client', 'client_ids': ['b'], 'role': 'client_contributor', 'status': 'active'},
        ])
        self.sign_in('member')
        response = await self.client.get('/api/clients/a/members')
        self.assertEqual(response.status_code, 200, response.text)
        members = {u['user_id']: u for u in response.json()}
        self.assertEqual(members['alex']['status'], 'active')
        self.assertEqual(members['former']['status'], 'disabled')
        self.assertNotIn('private', members)
        self.assertEqual((await self.client.get('/api/clients/b/members')).status_code, 403)

    async def test_business_responsibility_does_not_create_a_platform_account(self):
        self.sign_in('admin')
        before = await server.db.users.find({}).to_list(None)
        created = await self.client.post('/api/contacts', json={
            'client_id': 'a', 'name': 'Jordan Lee', 'title': 'CFO',
            'role': 'Executive Sponsor', 'grc_roles': ['Executive Sponsor', 'Policy Approver'],
        })
        self.assertEqual(created.status_code, 200, created.text)
        self.assertFalse(created.json().get('linked_user_id'))
        self.assertEqual(await server.db.users.find({}).to_list(None), before)
