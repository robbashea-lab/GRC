"""Bounded response shape and authoritative drill-through, isolated database."""
import unittest
from unittest.mock import patch
import test_client_dashboard_sources as harness
import test_management_obligations as scenarios
import dashboard_contract

server = harness.server


class DashboardContractTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in
    seed_scenario = scenarios.ManagementObligationTests.seed_scenario

    async def test_counts_and_detail_use_same_authoritative_populations(self):
        await self.seed_scenario()
        self.sign_in('admin')
        with patch.object(server,'_now',lambda:'2026-09-15T12:00:00Z'):
            data=(await self.client.get('/api/dashboard?client_id=a')).json()
            for group,metric in [('pastDue','past_due'),('due30','due_30d'),('due3190','due_31_90d')]:
                page=(await self.client.get('/api/dashboard',params={'client_id':'a','detail':group,'limit':100})).json()
                self.assertEqual(page['total'],data['kpis'][metric])
                self.assertEqual(sorted(r['key'] for r in page['items']),sorted(scenarios.FIXTURE['expected'][metric]))
                for row in page['items']:
                    self.assertEqual(set(row['record']),{'client_id',dashboard_contract.KINDS[row['kind']]})
                    response=await self.client.get('/api/'+row['kind']+'/'+row['id'])
                    self.assertEqual(response.status_code,200,response.text)
                    self.assertEqual(response.json()['client_id'],'a')

    async def test_no_history_or_large_record_data_in_summary(self):
        self.sign_in('admin')
        await server.db.tasks.insert_many([{'task_id':str(i),'client_id':'a','title':'Synthetic',
            'status':'open','due_date':'2000-01-01','description':'private source detail '*10000,
            'decision_history':[{'note':'historical source detail'}]} for i in range(150)])
        response=await self.client.get('/api/dashboard?client_id=a')
        self.assertEqual(response.status_code,200,response.text[:200])
        self.assertLess(len(response.content),256000)
        self.assertNotIn('private source detail',response.text)
        self.assertNotIn('historical source detail',response.text)
        result=response.json()
        self.assertEqual(result['posture']['totals']['pastDue'],150)
        self.assertEqual(len(result['posture']['pastDue']),25)
        self.assertNotIn('records',result['management'])
        self.assertEqual((await server.db.tasks.find_one({'task_id':'0'}))['description'],'private source detail '*10000)

    async def test_readonly_allowed_and_cross_client_pagination_denied(self):
        self.sign_in('member')
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.get('/api/dashboard?client_id=a&detail=pastDue')).status_code,200)
        self.assertEqual((await self.client.get('/api/dashboard?client_id=b&detail=pastDue')).status_code,403)
        for query in ('detail=unknown','detail=pastDue&limit=101','detail=pastDue&offset=-1'):
            self.assertEqual((await self.client.get('/api/dashboard?client_id=a&'+query)).status_code,422)

    async def test_applicable_programs_only_and_closed_excluded(self):
        self.sign_in('admin')
        await server.db.requirements.insert_many([
            {'requirement_id':'a-cis','client_id':'a','title':'CIS','baseline_key':'cis-ig1','baseline_response':'applies'},
            {'requirement_id':'a-soc','client_id':'a','title':'SOC','baseline_key':'soc-2','baseline_response':'applies'},
            {'requirement_id':'b-iso','client_id':'b','title':'ISO','baseline_key':'iso-27001','baseline_response':'applies'}])
        await server.db.risks.insert_many([{'risk_id':status,'client_id':'a','title':status,'status':status,
            'likelihood_score':5,'impact_score':5} for status in ['accepted','closed']])
        result=(await self.client.get('/api/dashboard?client_id=a')).json()
        self.assertEqual([r['baseline_key'] for r in result['applicable_requirements']],['cis-ig1','soc-2'])
        self.assertEqual(result['posture']['totals']['significantRisks'],1)
        self.assertEqual(result['posture']['significantRisks'][0]['id'],'accepted')
        self.assertEqual(result['posture']['totals']['acceptedRisks'],1)
        self.assertEqual(result['posture']['totals']['risk-critical'],1)
        await server.db.requirements.update_one({'requirement_id':'a-soc'},{'$set':{'baseline_response':'does_not_apply'}})
        result=(await self.client.get('/api/dashboard?client_id=a')).json()
        self.assertEqual([r['baseline_key'] for r in result['applicable_requirements']],['cis-ig1'])

    async def test_vendor_conditions_drill_to_exact_sources_and_use_defined_windows(self):
        self.sign_in('admin')
        await server.db.vendors.insert_many([
            {'client_id':'a','vendor_id':'v','name':'Provider','status':'active','criticality':'critical',
             'contract_renewal':'2026-10-30','assurance_required':True,'assurance_records':[]},
            {'client_id':'a','vendor_id':'inactive','name':'Inactive','status':'inactive','criticality':'critical'}])
        await server.db.reviews.insert_many([
            {'client_id':'a','review_id':rid,'title':rid,'status':'upcoming','recurrence':'annual','vendor_id':'v',
             'vendor_purpose':'vendor','due_date':due} for rid,due in [('past','2026-09-22'),('soon','2026-10-23'),('later','2026-10-24')]])
        with patch.object(server,'_now',lambda:'2026-09-23T12:00:00Z'):
            data=(await self.client.get('/api/dashboard?client_id=a')).json()['posture']
            for group,ids in [('vendorReviewsPast',['past']),('vendorReviewsSoon',['soon']),('criticalVendors',['v']),('missingAssurance',['v']),('contracts',['v'])]:
                self.assertEqual(data['totals'][group],len(ids))
                detail=(await self.client.get('/api/dashboard',params={'client_id':'a','detail':group})).json()
                self.assertEqual([r['id'] for r in detail['items']],ids)
