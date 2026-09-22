"""SOC 2 internal-readiness semantics, scope retention and authorization."""
import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from framework_catalog import SOC
from routes.onboarding import BASELINE_CATALOG


class SocTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    async def configure(self, programs=('soc-2',), cid='a'):
        self.sign_in('admin')
        state={'version':3,'step':3,'policies':{p['key']:'unsure' for p in BASELINE_CATALOG['policies']},
               'requirements':{p['key']:'applies' if p['key'] in programs else 'does_not_apply' for p in BASELINE_CATALOG['requirements']},
               'reviews':[],'framework_reviews':{}}
        r=await self.client.post('/api/onboarding/baseline',json={'client_id':cid,'state':state,'finalize':True})
        self.assertEqual(r.status_code,200,r.text)
        return (await self.client.get('/api/frameworks/soc-2',params={'client_id':cid})).json()

    async def scope(self, categories, cid='a', **extra):
        response=await self.client.patch('/api/frameworks/soc-2/configuration',json={'client_id':cid,'categories':categories,**extra})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    def test_all_61_criterion_references_and_recommended_reviews(self):
        expected={f'CC{g}.{n}' for g,count in [(1,5),(2,3),(3,4),(4,2),(5,3),(6,8),(7,5),(8,1),(9,2)] for n in range(1,count+1)}
        expected |= {f'{g}.{n}' for g,count in [('A1',3),('C1',2),('PI1',5),('P1',1),('P2',1),('P3',2),('P4',3),('P5',2),('P6',7),('P7',1),('P8',1)] for n in range(1,count+1)}
        self.assertEqual(len(SOC['requirements']),61)
        self.assertEqual({d['id'] for d in SOC['requirements']},expected)
        self.assertEqual(sum(d['category']=='security' for d in SOC['requirements']),33)
        for p in SOC['review_plans']:
            self.assertTrue(set(p['safeguards'])<=expected)
            self.assertEqual(p['classification'],'recommended')
            self.assertIn('does not prescribe',p['source_cadence'])

    async def test_scope_is_opt_in_and_summary_excludes_retained_categories(self):
        self.sign_in('admin')
        self.assertFalse((await self.client.get('/api/frameworks/soc-2',params={'client_id':'a'})).json()['configured'])
        w=await self.configure()
        self.assertEqual(len(w['assessments']),33)
        self.assertEqual(w['configuration']['categories'],['security'])
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),8)
        for _ in range(2):await self.scope(['security','availability'])
        w=(await self.client.get('/api/frameworks/soc-2',params={'client_id':'a'})).json()
        self.assertEqual(len(w['assessments']),36)
        a=next(a for a in w['assessments'] if a['definition_id']=='A1.1')
        base='/api/framework_assessments/'+a['framework_assessment_id']
        self.assertEqual((await self.client.patch(base,json={'status':'in_progress','implementation':'Capacity control being evaluated'})).status_code,200)
        await self.scope(['security'])
        summary=(await self.client.get('/api/frameworks/summary',params={'client_id':'a'})).json()['items'][0]
        self.assertEqual(summary['total'],33)
        self.assertEqual(summary['status_counts']['in_progress'],0)
        self.assertEqual((await self.client.get(base)).json()['implementation'],'Capacity control being evaluated')
        await self.scope(list(SOC['categories']))
        w=(await self.client.get('/api/frameworks/soc-2',params={'client_id':'a'})).json()
        self.assertEqual(len(w['assessments']),61)
        self.assertEqual(len(w['active_definition_ids']),61)
        self.assertEqual((await self.client.get(base)).json()['status'],'in_progress')
        for applicability in ['does_not_apply','unsure','applies']:
            self.assertEqual((await self.client.patch('/api/onboarding/programs/soc-2',json={'client_id':'a','applicability':applicability})).status_code,200)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),61)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),8)

    async def test_configuration_rejects_invalid_scope_dates_and_untrusted_fields(self):
        await self.configure()
        for changes in [{'categories':['privacy']},{'categories':['security','security']},{'categories':['security','invented']},
                        {'period_start':'2026-01-01'},{'period_start':'2026-02-30','period_end':'2026-03-01'},
                        {'period_start':'2026-12-31','period_end':'2026-01-01'},{'system_description':'x'*4001},
                        {'role':'super_admin'}]:
            r=await self.client.patch('/api/frameworks/soc-2/configuration',json={'client_id':'a','categories':['security'],**changes})
            self.assertEqual(r.status_code,422,r.text)
        await self.scope(['security'],period_start='2026-01-01',period_end='2026-12-31')
        for field in ['categories','system_description','period_start','period_end']:
            self.assertEqual((await self.client.patch('/api/frameworks/soc-2/configuration',json={'client_id':'a',field:None})).status_code,422)

    async def test_management_control_observations_are_bounded_and_historical(self):
        w=await self.configure()
        base='/api/framework_assessments/'+w['assessments'][0]['framework_assessment_id']
        control={'control_id':'control-a','name':'Management conduct review','description':'Management-designed process',
                 'design':'adequate','operating':'gap','frequency':'Quarterly management decision',
                 'period_start':'2026-01-01','period_end':'2026-12-31','expected_instances':4,'collected_instances':2,
                 'population_notes':'Four planned meetings, not an auditor sample requirement','testing_notes':'Two meeting records outstanding'}
        for change in [{'name':' '},{'design':'certified'},{'expected_instances':True},{'expected_instances':-1},
                       {'collected_instances':1.5},{'period_start':'2026-02-30'},{'period_start':'','period_end':''},
                       {'client_id':'b'}]:
            r=await self.client.patch(base,json={'management_controls':[{**control,**change}]})
            self.assertEqual(r.status_code,422,r.text)
        self.assertEqual((await self.client.patch(base,json={'management_controls':[control,control]})).status_code,422)
        self.assertEqual((await self.client.patch(base,json={'management_controls':None})).status_code,422)
        for field in ['name','description','design','operating','period_start','period_end']:
            self.assertEqual((await self.client.patch(base,json={'management_controls':[{**control,field:None}]})).status_code,422)
        r=await self.client.patch(base,json={'management_controls':[control]})
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.json()['status'],'not_assessed')
        await self.scope(['security'],period_start='2027-01-01',period_end='2027-12-31')
        saved=(await self.client.get(base)).json()
        self.assertEqual(saved['management_controls'][0]['period_start'],'2026-01-01')
        self.assertEqual(saved['assessment_history'][0]['management_controls'][0]['collected_instances'],2)
        self.assertEqual((await self.client.patch(base,json={'management_controls':[]})).status_code,200)
        self.assertEqual(len((await self.client.get(base)).json()['assessment_history']),2)

    async def test_four_frameworks_share_existing_work_and_metadata(self):
        await self.configure(('cis-ig1','hipaa','iso-27001'))
        before=await server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        w=await self.configure(('cis-ig1','hipaa','iso-27001','soc-2'))
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),288)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),23)
        for row in before:self.assertEqual(await server.db.reviews.find_one({'review_id':row['review_id']},{'_id':0}),row)
        aid=next(a['framework_assessment_id'] for a in w['assessments'] if a['definition_id']=='CC6.2')
        related=(await self.client.get('/api/framework_assessments/'+aid+'/related')).json()
        self.assertTrue(any(r['framework_key']=='cis-ig1' for r in related['reviews']))
        self.assertTrue(related['policies'])

    async def test_scope_and_criterion_authorization(self):
        a=(await self.configure())['assessments'][0]['framework_assessment_id']
        b=(await self.configure(cid='b'))['assessments'][0]['framework_assessment_id']
        self.sign_in('member')
        for suffix in ['','/related','/activity']:
            self.assertEqual((await self.client.get('/api/framework_assessments/'+b+suffix)).status_code,403)
        self.assertEqual((await self.client.patch('/api/frameworks/soc-2/configuration',json={'client_id':'b','categories':['security']})).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.patch('/api/frameworks/soc-2/configuration',json={'client_id':'a','categories':['security']})).status_code,403)
        self.assertEqual((await self.client.patch('/api/framework_assessments/'+a,json={'management_controls':[]})).status_code,403)
        self.assertEqual((await self.client.get('/api/framework_assessments/'+a)).status_code,200)
        self.client.headers.pop('Authorization')
        self.assertEqual((await self.client.get('/api/frameworks/soc-2',params={'client_id':'a'})).status_code,401)

    async def test_evidence_links_and_remediation_keep_source_and_assessment_independent(self):
        w=await self.configure(('soc-2','hipaa'))
        a=w['assessments'][0]['framework_assessment_id']
        base='/api/framework_assessments/'+a
        evidence=await self.client.post('/api/evidence',json={'client_id':'a','filename':'synthetic-soc.txt','mime_type':'text/plain',
            'content_base64':'c3ludGhldGlj','linked_type':'framework_assessments','linked_id':a})
        self.assertEqual(evidence.status_code,200,evidence.text)
        eid=evidence.json()['evidence_id']
        hipaa=await server.db.framework_assessments.find_one({'client_id':'a','framework_key':'hipaa'})
        hp='/api/framework_assessments/'+hipaa['framework_assessment_id']
        self.assertEqual((await self.client.post(hp+'/links',json={'kind':'evidence','id':eid})).status_code,200)
        self.assertEqual((await self.client.request('DELETE',hp+'/links',json={'kind':'evidence','id':eid})).status_code,200)
        self.assertEqual((await self.client.get('/api/evidence/'+eid+'/download')).status_code,200)
        self.assertEqual((await self.client.get(base+'/related')).json()['evidence'][0]['evidence_id'],eid)
        self.assertEqual((await server.db.evidence.find_one({'evidence_id':eid}))['linked_id'],a)
        for kind,field in [('evidence','evidence_id'),('reviews','review_id'),('policies','policy_id'),('risks','risk_id'),('findings','finding_id'),('tasks','task_id'),('vendors','vendor_id')]:
            await server.db[kind].insert_one({field:'soc-foreign-'+kind,'client_id':'b','title':'Other client'})
        self.sign_in('member')
        for kind in ['evidence','reviews','policies','risks','findings','tasks','vendors']:
            self.assertEqual((await self.client.post(base+'/links',json={'kind':kind,'id':'soc-foreign-'+kind})).status_code,403)
        self.sign_in('admin')
        body={'title':'Operating evidence incomplete','remediation_title':'Collect and validate operating evidence','request_id':'soc-gap','severity':'high'}
        f=await self.client.post(base+'/findings',json=body)
        self.assertEqual(f.status_code,200,f.text)
        self.assertIn('SOC 2 CC1.1',f.json()['source'])
        related=(await self.client.get(base+'/related')).json()
        self.assertEqual(len(related['tasks']),1)
        self.assertEqual((await self.client.patch('/api/tasks/'+related['tasks'][0]['task_id'],json={'status':'done'})).status_code,200)
        self.assertEqual((await self.client.post('/api/findings/'+f.json()['finding_id']+'/validate',json={'rationale':'Fixture evidence validated'})).status_code,200)
        self.assertEqual((await self.client.get(base)).json()['status'],'not_assessed')
