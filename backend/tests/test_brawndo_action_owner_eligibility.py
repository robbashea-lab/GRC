"""Owner health is independent of the viewer's right to reassign; isolated API storage."""
import unittest
import test_client_dashboard_sources as harness

server = harness.server


class BrawndoActionOwnerEligibilityTests(unittest.IsolatedAsyncioTestCase):
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        await server.db.users.insert_many([
            {'user_id': uid, 'name': uid, 'role': role, 'client_ids': clients,
             'status': status, 'email': uid+'@example.test', 'password_hash': 'private',
             'private_field': 'never exposed'}
            for uid, role, clients, status in [
                ('eligible', 'client_contributor', ['a'], 'active'),
                ('global_owner', 'super_admin', [], 'active'),
                ('removed_owner', 'client_contributor', ['b'], 'active'),
                ('disabled_owner', 'client_contributor', ['a'], 'disabled'),
                ('foreign_private', 'client_contributor', ['b'], 'active'),
            ]
        ])
        await server.db.tasks.insert_many([
            {'task_id': uid+'-task', 'client_id': 'a', 'assignee_id': uid,
             'status': 'done', 'completed_by': uid}
            for uid in ['global_owner', 'removed_owner', 'disabled_owner']
        ])
        self.sign_in('member')

    async def test_internal_owner_health_preserves_minimal_client_projection_and_assignment_rights(self):
        candidates = await self.client.get('/api/clients/a/assignees')
        self.assertEqual(candidates.status_code, 200, candidates.text)
        self.assertEqual(candidates.json()['items'], [])
        response = await self.client.get('/api/clients/a/members')
        self.assertEqual(response.status_code, 200, response.text)
        rows = {row['user_id']: row for row in response.json()}
        for role in ['client_grc_manager', 'client_contributor', 'client_readonly', 'client_viewer']:
            await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': role}})
            self.sign_in('member')
            client_response = await self.client.get('/api/clients/a/members')
            self.assertEqual(client_response.status_code, 200, client_response.text)
            for row in client_response.json():
                self.assertLessEqual(set(row), {'user_id', 'name', 'status', 'orphaned'})
                self.assertNotIn('assignment_eligible', row)
        self.assertEqual(rows['removed_owner'], {'user_id': 'removed_owner', 'name': 'removed_owner', 'status': 'active', 'orphaned': True})
        self.assertEqual((await self.client.get('/api/clients/b/members')).status_code, 403)
        self.sign_in('admin')
        response = await self.client.get('/api/clients/a/members')
        self.assertEqual(response.status_code, 200, response.text)
        rows = {row['user_id']: row for row in response.json()}
        self.assertTrue(rows['eligible']['assignment_eligible'])
        self.assertTrue(rows['global_owner']['assignment_eligible'])
        self.assertTrue(rows['global_owner']['orphaned'])
        self.assertFalse(rows['removed_owner']['assignment_eligible'])
        self.assertTrue(rows['removed_owner']['orphaned'])
        self.assertFalse(rows['disabled_owner']['assignment_eligible'])
        self.assertNotIn('foreign_private', rows)
        for row in rows.values():
            self.assertNotIn('password_hash', row)
            self.assertNotIn('private_field', row)
        for uid in ['global_owner', 'removed_owner', 'disabled_owner']:
            task = await server.db.tasks.find_one({'task_id': uid+'-task'})
            self.assertEqual(task['assignee_id'], uid)
            self.assertEqual(task['completed_by'], uid)
