from datetime import date
from test_client_dashboard_sources import ClientDashboardSourcesTests, server
import vendor_governance


class VendorGovernanceTests(ClientDashboardSourcesTests):
    async def create_vendor(self, **extra):
        self.sign_in('admin')
        response = await self.client.post('/api/vendors', json={'name':'CloudCore SaaS','service':'Primary CRM & data storage',
            'client_id':'a','criticality':'high','business_owner_id':'member','next_review':'2026-10-15',
            'review_frequency':'annual','contract_renewal':'2027-03-25',**extra})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    async def test_occurrences_contract_and_inactive_retention(self):
        vendor = await self.create_vendor(contract_review_enabled=True,contract_lead_days=90)
        route = '/api/vendors/'+vendor['vendor_id']
        self.assertEqual(vendor['status'],'onboarding')
        reviews = await server.db.reviews.find({'vendor_id':vendor['vendor_id']}).to_list(None)
        self.assertEqual(len(reviews),2)
        primary = next(r for r in reviews if r['vendor_purpose']=='vendor')
        contract = next(r for r in reviews if r['vendor_purpose']=='contract')
        self.assertEqual(contract['due_date'][:10],'2026-12-25')
        scheduled = await self.client.post(route+'/schedule-review',json={})
        self.assertEqual(scheduled.status_code,200,scheduled.text)
        self.assertEqual(scheduled.json()['review']['review_id'],primary['review_id'])
        for review in (primary,contract):
            completed = await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={'occurrence_id':review['current_occurrence_id']})
            self.assertEqual(completed.status_code,200,completed.text)
        saved = await server.db.vendors.find_one({'vendor_id':vendor['vendor_id']})
        self.assertEqual(saved['next_review'][:10],'2027-10-15')
        self.assertTrue(saved['last_review'])
        self.assertEqual(saved['contract_renewal'],'2027-03-25')
        for status in ('under_review','active','offboarding','inactive'):
            response = await self.client.patch(route,json={'status':status})
            self.assertEqual(response.status_code,200,response.text)
        retained = await server.db.reviews.find_one({'review_id':primary['review_id']})
        self.assertEqual(retained['status'],'cancelled')
        self.assertEqual(len(retained['occurrences']),1)
        self.assertEqual((await self.client.delete(route)).status_code,409)

    async def test_proportionate_assurance_and_client_scope(self):
        vendor = await self.create_vendor()
        route = '/api/vendors/'+vendor['vendor_id']
        self.assertEqual(vendor_governance.assurance_status(vendor,{'type':'SOC 2'}),'not_required')
        self.assertEqual((await self.client.patch(route,json={'assurance_required':True})).status_code,422)
        self.assertEqual((await self.client.patch(route,json={'assurance_required':True,'assurance_records':[{'type':'SOC 2','evidence_ids':['private']}]})).status_code,422)
        v = {'assurance_required':True,'assurance_window_days':90}
        a = {'type':'SOC 2','evidence_ids':['e'],'received_at':'2026-03-12','refresh_due':'2027-03-12'}
        self.assertEqual(vendor_governance.assurance_status(v,a,date(2026,9,14)),'current')
        self.assertEqual(vendor_governance.assurance_status(v,a,date(2027,1,1)),'due_soon')
        self.assertEqual(vendor_governance.assurance_status(v,a,date(2027,4,1)),'expired')
        self.sign_in('member')
        self.assertEqual((await self.client.post('/api/vendors',json={'client_id':'b','name':'Private','service':'Secret'})).status_code,403)

    async def test_service_required_and_legacy_preserved(self):
        self.sign_in('admin')
        self.assertEqual((await self.client.post('/api/vendors',json={'name':'Incomplete','client_id':'a'})).status_code,422)
        vendor = await self.create_vendor(services='Legacy detail retained')
        self.assertEqual(vendor['services'],'Legacy detail retained')
        self.assertEqual(vendor['service'],'Primary CRM & data storage')

    async def test_one_time_review_does_not_restart_on_vendor_edit(self):
        vendor = await self.create_vendor(review_frequency='as_needed')
        review = await server.db.reviews.find_one({'vendor_id':vendor['vendor_id']})
        done = await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={'occurrence_id':review['current_occurrence_id']})
        self.assertEqual(done.status_code,200,done.text)
        response = await self.client.patch('/api/vendors/'+vendor['vendor_id'],json={'notes':'Relationship retained'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual((await server.db.reviews.find_one({'review_id':review['review_id']}))['status'],'completed')

    async def test_finding_task_and_review_configuration_permissions(self):
        vendor = await self.create_vendor()
        review = await server.db.reviews.find_one({'vendor_id':vendor['vendor_id']})
        route = '/api/vendors/'+vendor['vendor_id']
        self.sign_in('member')
        self.assertEqual((await self.client.patch(route,json={'next_review':'2026-12-01'})).status_code,403)
        finding = await self.client.post('/api/reviews/'+review['review_id']+'/create-finding',json={
            'title':'Current SOC 2 could not be demonstrated','remediation_title':'Obtain updated SOC 2',
            'occurrence_id':review['current_occurrence_id'],'request_id':'vendor-finding-test'})
        self.assertEqual(finding.status_code,200,finding.text)
        self.assertEqual(finding.json()['vendor_id'],vendor['vendor_id'])
        task = await server.db.tasks.find_one({'finding_id':finding.json()['finding_id']})
        self.assertEqual(task['vendor_id'],vendor['vendor_id'])
        self.assertEqual(task['review_id'],review['review_id'])
        self.assertEqual(task['occurrence_id'],review['current_occurrence_id'])
        completed = await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={'occurrence_id':review['current_occurrence_id']})
        self.assertEqual(completed.status_code,200,completed.text)
        self.assertEqual((await server.db.tasks.find_one({'task_id':task['task_id']}))['status'],'open')
        related = await self.client.get('/api/related',params={'entity_type':'vendors','entity_id':vendor['vendor_id']})
        self.assertIn(task['task_id'],[t['task_id'] for t in related.json()['tasks']])
        self.assertEqual((await self.client.get(route+'/activity')).status_code,200)

    async def test_assurance_review_metadata_and_overlapping_work(self):
        vendor = await self.create_vendor(assurance_required=True,assurance_records=[{'type':'SOC 2','required':True,'evidence_ids':[]}],
            separate_assurance_review=True,assurance_review_date='2026-12-01')
        review = await server.db.reviews.find_one({'vendor_id':vendor['vendor_id'],'vendor_purpose':'assurance'})
        completed = await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={'occurrence_id':review['current_occurrence_id']})
        self.assertEqual(completed.status_code,200,completed.text)
        saved = await server.db.vendors.find_one({'vendor_id':vendor['vendor_id']})
        self.assertTrue(saved['assurance_records'][0]['last_reviewed'])
        self.assertEqual(vendor_governance.assurance_status(saved,saved['assurance_records'][0]),'missing')
        updated = await self.client.patch('/api/vendors/'+vendor['vendor_id'],json={'assurance_review_date':'2026-10-15'})
        self.assertEqual(updated.status_code,200,updated.text)
        self.assertEqual((await server.db.reviews.find_one({'review_id':review['review_id']}))['status'],'cancelled')
