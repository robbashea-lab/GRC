"""CSF outcome profiles, immutable history and real API authorization."""
import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from test_soc_framework import SocTests
from framework_catalog import NIST


class CsfTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    async def configure(self, programs=('nist-csf-2',), cid='a'):
        await SocTests.configure(self, programs, cid)
        return (await self.client.get('/api/frameworks/nist-csf-2',params={'client_id':cid})).json()

    def test_exact_core_identifiers_and_classification(self):
        ranges={'GV.OC':range(1,6),'GV.RM':range(1,8),'GV.RR':range(1,5),'GV.PO':range(1,3),'GV.OV':range(1,4),'GV.SC':range(1,11),
            'ID.AM':[1,2,3,4,5,7,8],'ID.RA':range(1,11),'ID.IM':range(1,5),'PR.AA':range(1,7),'PR.AT':[1,2],
            'PR.DS':[1,2,10,11],'PR.PS':range(1,7),'PR.IR':range(1,5),'DE.CM':[1,2,3,6,9],'DE.AE':[2,3,4,6,7,8],
            'RS.MA':range(1,6),'RS.AN':[3,6,7,8],'RS.CO':[2,3],'RS.MI':[1,2],'RC.RP':range(1,7),'RC.CO':[3,4]}
        expected={f'{c}-{n:02}' for c,ns in ranges.items() for n in ns}
        self.assertEqual(len(NIST['requirements']),106)
        self.assertEqual({d['id'] for d in NIST['requirements']},expected)
        self.assertEqual(len(NIST['categories']),22);self.assertEqual(len(NIST['functions']),6)
        for d in NIST['requirements']:
            self.assertEqual(d['classification'],'framework_outcome');self.assertIn('nist.gov',d['source'])
            self.assertTrue(d['guidance']);self.assertTrue(d['evidence_guidance'])
        for p in NIST['review_plans']:
            self.assertEqual(p['classification'],'recommended');self.assertTrue(set(p['safeguards'])<=expected)

    async def test_profiles_save_history_no_automatic_status_or_destructive_toggle(self):
        w=await self.configure();self.assertEqual(len(w['assessments']),106)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),9)
        aid=w['assessments'][0]['framework_assessment_id'];path='/api/framework_assessments/'+aid
        p={'target_selected':True,'target_outcome':'Risk objectives aligned with mission','priority':'high','gap_state':'gap','gap_notes':'Mission dependencies need validation'}
        r=await self.client.patch(path,json={'implementation':'Partial scope recorded','status':'in_progress','csf_profile':p})
        self.assertEqual(r.status_code,200,r.text)
        for decision in ['does_not_apply','unsure','applies','applies']:
            self.assertEqual((await self.client.patch('/api/onboarding/programs/nist-csf-2',json={'client_id':'a','applicability':decision})).status_code,200)
        saved=(await self.client.get(path)).json();self.assertEqual(saved['csf_profile'],p)
        self.assertEqual(saved['assessment_history'][0]['csf_profile'],p)
        self.assertEqual((await self.client.patch(path,json={'csf_profile':{**p,'gap_state':'aligned'}})).json()['status'],'in_progress')
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),106)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),9)

    async def test_profile_validation_and_non_csf_rejection(self):
        w=await self.configure(('nist-csf-2','cis-ig1'));path='/api/framework_assessments/'+w['assessments'][0]['framework_assessment_id']
        invalid=[None,[],{'target_selected':'true'},{'target_selected':True},{'priority':'urgent'},{'gap_state':'certified'},
            {'gap_state':'gap','gap_notes':'Gap'},{'target_outcome':'x'*4001},{'client_id':'b'},{'gap_notes':None}]
        for profile in invalid:self.assertEqual((await self.client.patch(path,json={'csf_profile':profile})).status_code,422)
        cis=await server.db.framework_assessments.find_one({'client_id':'a','framework_key':'cis-ig1'})
        self.assertEqual((await self.client.patch('/api/framework_assessments/'+cis['framework_assessment_id'],json={'csf_profile':{}})).status_code,422)
        self.assertEqual((await self.client.patch(path,json={'status':'not_applicable'})).status_code,422)

    async def test_five_framework_activation_reuses_prior_work(self):
        await self.configure(('cis-ig1','hipaa','iso-27001','soc-2'))
        reviews=await server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        policies=await server.db.policies.find({'client_id':'a'},{'_id':0}).to_list(None)
        self.assertEqual((await self.client.patch('/api/onboarding/programs/nist-csf-2',json={'client_id':'a','applicability':'applies'})).status_code,200)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),394)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),23)
        for r in reviews:self.assertEqual(await server.db.reviews.find_one({'review_id':r['review_id']},{'_id':0}),r)
        self.assertEqual(await server.db.policies.find({'client_id':'a'},{'_id':0}).to_list(None),policies)

    async def test_client_authorization_and_link_boundaries(self):
        a=(await self.configure())['assessments'][0]['framework_assessment_id']
        b=(await self.configure(cid='b'))['assessments'][0]['framework_assessment_id']
        self.sign_in('member')
        for suffix in ['','/related','/activity']:
            self.assertEqual((await self.client.get('/api/framework_assessments/'+b+suffix)).status_code,403)
        self.assertEqual((await self.client.patch('/api/framework_assessments/'+b,json={'csf_profile':{}})).status_code,403)
        for kind,field in [('evidence','evidence_id'),('reviews','review_id'),('policies','policy_id'),('risks','risk_id'),('findings','finding_id'),('tasks','task_id'),('vendors','vendor_id')]:
            await server.db[kind].insert_one({field:'csf-foreign-'+kind,'client_id':'b'})
            self.assertEqual((await self.client.post('/api/framework_assessments/'+a+'/links',json={'kind':kind,'id':'csf-foreign-'+kind})).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.patch('/api/framework_assessments/'+a,json={'csf_profile':{}})).status_code,403)
        self.client.headers.pop('Authorization')
        self.assertEqual((await self.client.get('/api/frameworks/nist-csf-2?client_id=a')).status_code,401)

    async def test_evidence_remediation_and_profile_independence(self):
        w=await self.configure(('nist-csf-2','hipaa'))
        aid=w['assessments'][0]['framework_assessment_id'];path='/api/framework_assessments/'+aid
        e=await self.client.post('/api/evidence',json={'client_id':'a','filename':'synthetic-profile.txt','content_base64':'c3ludGhldGlj','linked_type':'framework_assessment','linked_id':aid})
        self.assertEqual(e.status_code,200,e.text);eid=e.json()['evidence_id']
        hipaa=await server.db.framework_assessments.find_one({'client_id':'a','framework_key':'hipaa'})
        hp='/api/framework_assessments/'+hipaa['framework_assessment_id']
        self.assertEqual((await self.client.post(hp+'/links',json={'kind':'evidence','id':eid})).status_code,200)
        self.assertEqual((await self.client.request('DELETE',hp+'/links',json={'kind':'evidence','id':eid})).status_code,200)
        self.assertEqual((await self.client.get('/api/evidence/'+eid+'/download')).status_code,200)
        f=await self.client.post(path+'/findings',json={'title':'Mission dependencies incomplete','remediation_title':'Validate dependencies','request_id':'csf-gap'})
        self.assertEqual(f.status_code,200,f.text)
        t=await server.db.tasks.find_one({'finding_id':f.json()['finding_id']})
        self.assertEqual((await self.client.patch('/api/tasks/'+t['task_id'],json={'status':'done'})).status_code,200)
        self.assertEqual((await self.client.post('/api/findings/'+f.json()['finding_id']+'/validate',json={'rationale':'Dependency evidence reviewed'})).status_code,200)
        self.assertEqual((await self.client.get(path)).json()['status'],'not_assessed')
