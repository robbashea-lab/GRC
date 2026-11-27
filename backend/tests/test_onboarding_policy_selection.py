"""Explicit generation selection is distinct from a missing policy response."""
import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests, server
from routes.onboarding import BASELINE_CATALOG as catalog
from framework_catalog import CATALOGS, active_definitions, active_plans


class PolicySelectionTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = ClientDashboardSourcesTests.asyncSetUp
    sign_in = ClientDashboardSourcesTests.sign_in

    async def body(self, keys):
        current = (await self.client.get('/api/onboarding/baseline?client_id=a')).json()
        return {'client_id': 'a', 'finalize': True,
                'expected_updated_at': current['state'].get('updated_at'),
                'expected_records': current['record_versions'], 'state': {
                    'version': 3, 'selected_policy_keys': keys,
                    'policies': {key: 'no' for key in keys},
                    'requirements': {r['key']: 'does_not_apply' for r in catalog['requirements']},
                    'reviews': []}}

    async def test_selected_missing_policy_is_created_excluded_existing_policy_untouched(self):
        self.sign_in('admin')
        original = {'client_id': 'a', 'policy_id': 'preserve', 'title': 'Acceptable Use Policy',
                    'notes': 'User-authored history', 'status': 'approved', 'version': '3'}
        await server.db.policies.insert_one(original.copy())
        key = 'policy-information-security-policy'
        response = await self.client.post('/api/onboarding/baseline', json=await self.body([key]))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await server.db.policies.count_documents({'client_id': 'a'}), 2)
        selected = await server.db.policies.find_one({'client_id': 'a', 'baseline_key': key})
        self.assertEqual(selected['presence'], 'reported_missing')
        self.assertEqual(selected['status'], 'needs_creation')
        preserved = await server.db.policies.find_one({'policy_id': 'preserve'}, {'_id': 0})
        self.assertEqual(preserved, original)
        state = (await self.client.get('/api/onboarding/baseline?client_id=a')).json()['state']
        self.assertEqual(state['selected_policy_keys'], [key])
        legacy = await self.body([key])
        del legacy['state']['selected_policy_keys']
        legacy['state']['policies'] = {item['key']: 'yes' for item in catalog['policies']}
        response = await self.client.post('/api/onboarding/baseline', json=legacy)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await server.db.policies.count_documents({'client_id': 'a'}), 2)
        state = (await self.client.get('/api/onboarding/baseline?client_id=a')).json()['state']
        self.assertEqual(state['selected_policy_keys'], [key])

    async def test_unknown_and_duplicate_selections_fail_before_writes(self):
        self.sign_in('admin')
        for keys in [['unknown'], ['policy-information-security-policy'] * 2]:
            response = await self.client.post('/api/onboarding/baseline', json=await self.body(keys))
            self.assertEqual(response.status_code, 400, response.text)
            self.assertEqual(await server.db.policies.count_documents({'client_id': 'a'}), 0)

    async def test_empty_selection_is_valid_and_does_not_create_generic_policies(self):
        self.sign_in('admin')
        response = await self.client.post('/api/onboarding/baseline', json=await self.body([]))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await server.db.policies.count_documents({'client_id': 'a'}), 0)

    async def assert_cis_generation(self, group):
        self.sign_in('admin')
        definitions = active_definitions('cis-ig1', {'implementation_group': group})
        ids = {row['id'] for row in definitions}
        keys = sorted({mapping['policy_key'] for mapping in CATALOGS['cis-ig1']['policy_mappings']
                       if ids.intersection(mapping['safeguards'])})
        body = await self.body(keys)
        body['state']['requirements']['cis-ig1'] = 'applies'
        body['state']['framework_settings'] = {'cis-ig1': {'implementation_group': group}}
        response = await self.client.post('/api/onboarding/baseline', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        assessments = await server.db.framework_assessments.find({'client_id': 'a'}).to_list(1000)
        self.assertEqual({row['definition_id'] for row in assessments}, ids)
        self.assertEqual(len(assessments), {1: 56, 2: 130, 3: 153}[group])
        policies = await server.db.policies.find({'client_id': 'a'}).to_list(1000)
        self.assertEqual({row['baseline_key'] for row in policies}, set(keys))
        self.assertEqual(len(policies), 10)
        self.assertTrue(all(row['presence'] == 'reported_missing' for row in policies))
        plans = {row['key'] for row in active_plans('cis-ig1', {'implementation_group': group})
                 if row.get('default_enabled', True)}
        reviews = await server.db.reviews.find({'client_id': 'a'}).to_list(1000)
        self.assertEqual({row['framework_plan_key'] for row in reviews}, plans)
        self.assertNotIn('policy-review', {row.get('baseline_key') for row in reviews})
        self.assertEqual(await server.db.tasks.count_documents({'client_id': 'a'}), 0)
        self.assertEqual(await server.db.policies.count_documents({'client_id': 'b'}), 0)

    async def test_ig1_only_generation(self):
        await self.assert_cis_generation(1)

    async def test_ig2_only_generation(self):
        await self.assert_cis_generation(2)

    async def test_ig3_only_generation(self):
        await self.assert_cis_generation(3)
