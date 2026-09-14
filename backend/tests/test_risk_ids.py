import asyncio
from test_client_dashboard_sources import ClientDashboardSourcesTests, server
import risk_ids


class RiskIdentifiersTests(ClientDashboardSourcesTests):
    async def test_concurrent_allocations_are_unique_and_tenant_scoped(self):
        values = await asyncio.gather(*(risk_ids.allocate(server.db, 'a') for _ in range(40)))
        self.assertEqual(len(set(values)), 40)
        self.assertEqual(sorted(values), [f'RISK-{n:03d}' for n in range(1,41)])
        self.assertEqual(await risk_ids.allocate(server.db, 'b'), 'RISK-001')
        self.assertEqual(await risk_ids.allocate(server.db, 'a'), 'RISK-041')

    async def test_deterministic_backfill_preserves_relationships_and_retries(self):
        await server.db.risks.insert_many([
            {'risk_id':'second','client_id':'a','created_at':'2026-02-01','likelihood':'high'},
            {'risk_id':'first','client_id':'a','created_at':'2026-01-01','display_id':'legacy'},
            {'risk_id':'known','client_id':'a','display_id':'RISK-010'}])
        await server.db.tasks.insert_one({'task_id':'t','risk_id':'first','client_id':'a'})
        await risk_ids.initialize(server.db,'a')
        await risk_ids.initialize(server.db,'a')
        first = await server.db.risks.find_one({'risk_id':'first'})
        self.assertEqual(first['display_id'],'RISK-011')
        self.assertEqual(first['legacy_display_id'],'legacy')
        second = await server.db.risks.find_one({'risk_id':'second'})
        self.assertEqual(second['display_id'],'RISK-012')
        self.assertEqual(second['likelihood'],'high')
        self.assertNotIn('likelihood_score',second)
        self.assertEqual((await server.db.tasks.find_one({'task_id':'t'}))['risk_id'],'first')
        await server.db.risks.delete_many({'client_id':'a'})
        self.assertEqual(await risk_ids.allocate(server.db,'a'),'RISK-013')

    async def test_api_id_immutable_and_assessment_edits_are_not_reviews(self):
        self.sign_in('admin')
        result = await self.client.post('/api/risks',json={'client_id':'a','title':'Exposure','likelihood_score':3,'impact_score':4})
        self.assertEqual(result.status_code,200,result.text)
        row = result.json()
        self.assertEqual(row['display_id'],'RISK-001')
        route = '/api/risks/' + row['risk_id']
        self.assertEqual((await self.client.patch(route,json={'display_id':'RISK-999'})).status_code,422)
        updated = await self.client.patch(route,json={'likelihood_score':4})
        self.assertEqual(updated.json()['risk_score'],16)
        self.assertIsNone(updated.json().get('last_reviewed'))
        accepted = await self.client.post(route+'/accept',json={'rationale':'Recorded decision','expiry_date':'2099-01-01'})
        self.assertEqual(accepted.status_code,200,accepted.text)
        self.assertIsNone(accepted.json().get('last_reviewed'))
