"""Normal authorized work-queue routes; isolated database, no route overrides."""
import unittest
from unittest.mock import patch
import test_client_dashboard_sources as harness

server = harness.server


class DashboardWorkQueueTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def get_queue(self, **params):
        with patch.object(server, '_now', lambda: '2026-10-05T12:00:00Z'):
            return await self.client.get('/api/dashboard', params={'client_id': 'a', 'work_queue': 'true', **params})

    async def test_counts_preview_pages_and_date_boundaries_share_exact_ids(self):
        self.sign_in('admin')
        rows = [{'client_id': 'a', 'task_id': f'past{i:02}', 'title': f'Past {i}', 'status': 'open',
                 'priority': 'medium', 'due_date': '2026-10-04', 'created_at': '2026-01-01', 'assignee_id': 'member'}
                for i in range(12)]
        rows += [{'client_id': 'a', 'task_id': identity, 'title': identity, 'status': 'open',
                  'priority': 'medium', 'due_date': due, 'assignee_id': 'member'}
                 for identity, due in [('today', '2026-10-05'), ('day30', '2026-11-04'), ('day31', '2026-11-05'), ('undated', None)]]
        await server.db.tasks.insert_many(rows)
        before = await server.db.tasks.find({}, {'_id': 0}).to_list(None)
        preview = (await self.get_queue()).json()['groups']
        expected = {'pastDue': [f'past{i:02}' for i in range(12)], 'due30': ['today', 'day30'],
                    'unassigned': [], 'all': [f'past{i:02}' for i in range(12)] + ['today', 'day30', 'day31', 'undated']}
        for group, identities in expected.items():
            self.assertEqual(preview[group]['total'], len(identities))
            self.assertEqual([r['id'] for r in preview[group]['items']], identities[:9])
            collected = []
            for offset in range(0, len(identities) + 3, 3):
                response = await self.get_queue(detail=group, offset=offset, limit=3)
                self.assertEqual(response.status_code, 200, response.text)
                page = response.json()
                self.assertEqual(page['total'], len(identities))
                self.assertEqual(page['has_more'], offset + 3 < len(identities))
                self.assertEqual([r['id'] for r in page['items']], identities[offset:offset+3])
                collected.extend(r['id'] for r in page['items'])
                self.assertTrue(all(r['record']['client_id'] == 'a' for r in page['items']))
            self.assertEqual(collected, identities)
        self.assertEqual(await server.db.tasks.find({}, {'_id': 0}).to_list(None), before)

    async def test_only_active_client_members_or_super_admins_are_eligible_owners(self):
        self.sign_in('admin')
        await server.db.users.insert_many([
            {'user_id': 'foreign', 'email': 'foreign@example.test', 'name': 'Foreign', 'status': 'active', 'client_ids': ['b'], 'role': 'client_contributor'},
            {'user_id': 'inactive', 'email': 'inactive@example.test', 'name': 'Inactive', 'status': 'disabled', 'client_ids': ['a'], 'role': 'client_contributor'}])
        await server.db.tasks.insert_many([{'client_id': 'a', 'task_id': uid or 'missing', 'title': uid or 'Missing',
            'status': 'open', 'priority': 'medium', 'assignee_id': uid} for uid in ['admin', 'member', 'foreign', 'inactive', None]])
        result = (await self.get_queue(detail='all')).json()['items']
        by_id = {r['id']: r for r in result}
        for uid in ['admin', 'member']:
            self.assertFalse(by_id[uid]['unassigned']); self.assertEqual(by_id[uid]['owner'], uid)
        for uid in ['foreign', 'inactive', 'missing']:
            self.assertTrue(by_id[uid]['unassigned']); self.assertEqual(by_id[uid]['owner'], 'Unassigned')
        self.assertEqual({r['id'] for r in (await self.get_queue(detail='unassigned')).json()['items']}, {'foreign', 'inactive', 'missing'})

    async def test_unified_remediation_is_once_but_remediated_validation_remains(self):
        self.sign_in('admin')
        await server.db.findings.insert_many([{'client_id': 'a', 'finding_id': fid, 'title': fid,
            'status': status, 'severity': 'high', 'due_date': '2026-10-04', 'owner_id': 'member'}
            for fid, status in [('gap', 'open'), ('validation', 'remediated')]])
        await server.db.tasks.insert_many([{'client_id': 'a', 'task_id': fid+'-action', 'finding_id': fid,
            'title': 'Remediate: '+fid, 'title_generated': True, 'status': 'open', 'priority': 'high',
            'due_date': '2026-10-03', 'assignee_id': 'admin'} for fid in ['gap', 'validation']])
        rows = (await self.get_queue(detail='all')).json()['items']
        self.assertEqual({r['id'] for r in rows}, {'gap-action', 'validation-action', 'validation'})
        self.assertEqual(next(r for r in rows if r['id'] == 'gap-action')['title'], 'gap')
        self.assertEqual(next(r for r in rows if r['id'] == 'validation')['type'], 'Validation')

    async def test_auth_tenant_bounds_and_unknown_filters(self):
        self.assertEqual((await self.get_queue()).status_code, 401)
        self.sign_in('member')
        self.assertEqual((await self.get_queue(client_id='b')).status_code, 403)
        for params in [{'detail': 'unknown'}, {'detail': 'all', 'limit': 0}, {'detail': 'all', 'limit': 101},
                       {'detail': 'all', 'offset': -1}, {'client_id': ''}]:
            self.assertEqual((await self.get_queue(**params)).status_code, 422)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        self.assertEqual((await self.get_queue(detail='all')).status_code, 200)
