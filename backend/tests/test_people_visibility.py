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

    async def test_client_roles_get_names_and_status_only_including_former_owners(self):
        await server.db.users.insert_many([
            {'user_id': 'alex', 'name': 'Alex Morgan', 'email': 'alex@example.test', 'client_ids': ['a'], 'role': 'client_contributor', 'status': 'active', 'last_login_at': '2026-09-01T00:00:00Z'},
            {'user_id': 'gone', 'name': 'Departed Lead', 'email': 'gone@example.test', 'client_ids': [], 'role': 'client_contributor', 'status': 'disabled'},
            {'user_id': 'owner2', 'name': 'Provider Owner', 'email': 'po@example.test', 'client_ids': [], 'role': 'super_admin', 'status': 'active'},
            {'user_id': 'unrelated', 'name': 'Unrelated', 'email': 'u@example.test', 'client_ids': ['b'], 'role': 'client_contributor', 'status': 'active'},
        ])
        await server.db.findings.insert_one({'finding_id': 'f1', 'client_id': 'a', 'owner_id': 'gone', 'title': 'Old'})
        await server.db.risks.insert_one({'risk_id': 'r1', 'client_id': 'a', 'owner_id': 'alex', 'accepted_by': 'owner2', 'title': 'Accepted'})
        await server.db.findings.insert_one({'finding_id': 'f2', 'client_id': 'b', 'owner_id': 'unrelated', 'title': 'Other client'})
        self.sign_in('member')
        rows = (await self.client.get('/api/clients/a/members')).json()
        people = {u['user_id']: u for u in rows}
        self.assertEqual(set(people), {'admin', 'alex', 'member', 'gone', 'owner2'})
        for row in rows:
            self.assertLessEqual(set(row), {'user_id', 'name', 'status', 'orphaned'}, row)
        self.assertEqual(people['gone'], {'user_id': 'gone', 'name': 'Departed Lead', 'status': 'disabled', 'orphaned': True})
        self.assertTrue(people['owner2']['orphaned'])
        self.sign_in('admin')
        admin_rows = {u['user_id']: u for u in (await self.client.get('/api/clients/a/members')).json()}
        self.assertEqual(admin_rows['alex']['email'], 'alex@example.test')
        self.assertIn('last_login_at', admin_rows['alex'])

    async def test_assignee_candidates_follow_what_each_role_may_assign(self):
        await server.db.users.insert_many([
            {'user_id': 'mgr', 'name': 'Manager', 'client_ids': ['a'], 'role': 'client_grc_manager', 'status': 'active'},
            {'user_id': 'ro', 'name': 'Reader', 'client_ids': ['a'], 'role': 'client_readonly', 'status': 'active'},
            {'user_id': 'prov', 'name': 'Provider', 'client_ids': ['a'], 'role': 'platform_admin', 'status': 'active'},
        ])
        ids = lambda r: {u['user_id'] for u in r.json()['items']}
        self.sign_in('ro')
        self.assertEqual(ids(await self.client.get('/api/clients/a/assignees')), set())
        self.sign_in('member')
        self.assertEqual(ids(await self.client.get('/api/clients/a/assignees')), {'member'})
        self.sign_in('mgr')
        self.assertEqual(ids(await self.client.get('/api/clients/a/assignees')), {'member', 'mgr', 'ro'})
        self.sign_in('admin')
        self.assertEqual(ids(await self.client.get('/api/clients/a/assignees')), {'member', 'mgr', 'ro', 'prov', 'admin'})

    async def test_lists_above_their_bound_refuse_instead_of_truncating(self):
        self.sign_in('admin')
        await server.db.evidence.insert_many([{'evidence_id': f'e{i}', 'client_id': 'a', 'filename': f'f{i}.txt', 'archived_at': None, 'created_at': f'2026-01-01T00:00:{i % 60:02d}Z'} for i in range(1001)])
        response = await self.client.get('/api/evidence', params={'client_id': 'a'})
        self.assertEqual(response.status_code, 413, response.text)
        self.assertIn('No partial results', response.json()['detail'])
        await server.db.evidence.delete_one({'evidence_id': 'e0'})
        self.assertEqual(len((await self.client.get('/api/evidence', params={'client_id': 'a'})).json()), 1000)

    async def test_record_activity_is_scoped_and_readable_by_client_roles(self):
        await server.db.findings.insert_many([{'finding_id': 'fa', 'client_id': 'a', 'title': 'A'}, {'finding_id': 'fb', 'client_id': 'b', 'title': 'B'}])
        await server.db.audit_logs.insert_many([
            {'audit_id': 'l1', 'client_id': 'a', 'entity_type': 'finding', 'entity_id': 'fa', 'action': 'create', 'at': '2026-09-01T00:00:00Z'},
            {'audit_id': 'l2', 'client_id': 'a', 'entity_type': 'findings', 'entity_id': 'fa', 'action': 'validate', 'at': '2026-09-02T00:00:00Z'},
            {'audit_id': 'l3', 'client_id': 'a', 'entity_type': 'policy', 'entity_id': 'fa', 'action': 'unrelated', 'at': '2026-09-03T00:00:00Z'},
        ])
        self.sign_in('member')
        rows = (await self.client.get('/api/findings/fa/activity')).json()
        self.assertEqual([r['audit_id'] for r in rows], ['l2', 'l1'])
        self.assertEqual((await self.client.get('/api/findings/fb/activity')).status_code, 403)
