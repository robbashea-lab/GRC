"""ISO semantics and tenant boundaries using real routes and isolated Mongo."""
import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from framework_catalog import ISO
from routes.onboarding import BASELINE_CATALOG


class IsoTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    async def configure(self, programs=('iso-27001',), cid='a'):
        self.sign_in('admin')
        state = {'version': 3, 'step': 3, 'policies': {p['key']: 'unsure' for p in BASELINE_CATALOG['policies']},
                 'requirements': {p['key']: 'applies' if p['key'] in programs else 'does_not_apply' for p in BASELINE_CATALOG['requirements']},
                 'reviews': [], 'framework_reviews': {}}
        response = await self.client.post('/api/onboarding/baseline', json={'client_id': cid, 'state': state, 'finalize': True})
        self.assertEqual(response.status_code, 200, response.text)
        return (await self.client.get('/api/frameworks/iso-27001', params={'client_id': cid})).json()

    def test_catalog_complete_identifiers_and_native_groups(self):
        clauses = {'4.1','4.2','4.3','4.4','5.1','5.2','5.3','6.1.1','6.1.2','6.1.3','6.2','6.3',
                   '7.1','7.2','7.3','7.4','7.5.1','7.5.2','7.5.3','8.1','8.2','8.3','9.1',
                   '9.2.1','9.2.2','9.3.1','9.3.2','9.3.3','10.1','10.2'}
        annex = {f'A.{group}.{n}' for group, count in [(5,37),(6,8),(7,14),(8,34)] for n in range(1,count+1)}
        definitions = {d['id']: d for d in ISO['requirements']}
        self.assertEqual(set(definitions), clauses | annex)
        self.assertEqual(len(ISO['requirements']), 123)
        self.assertTrue(all(definitions[k]['specification']=='isms_clause' for k in clauses))
        self.assertTrue(all(definitions[k]['specification']=='annex_control' for k in annex))
        self.assertIn('climate', definitions['4.1']['guidance'])
        for p in ISO['review_plans']:
            self.assertTrue(set(p['safeguards']) <= set(definitions))
            self.assertEqual(p['classification'], 'recommended')
            self.assertIn('does not prescribe', p['source_cadence'])
        for p in ISO['policy_mappings']:
            self.assertTrue(set(p['safeguards']) <= set(definitions))
            self.assertIn(p['policy_key'], [x['key'] for x in BASELINE_CATALOG['policies']])

    async def test_activation_history_and_settings_toggles(self):
        self.sign_in('admin')
        self.assertFalse((await self.client.get('/api/frameworks/iso-27001',params={'client_id':'a'})).json()['configured'])
        self.assertEqual(await server.db.framework_assessments.count_documents({}), 0)
        workspace = await self.configure()
        aid = next(a['framework_assessment_id'] for a in workspace['assessments'] if a['definition_id']=='4.3')
        response = await self.client.patch('/api/framework_assessments/'+aid,json={'implementation':'Documented scope boundary','status':'in_progress'})
        self.assertEqual(response.status_code,200,response.text)
        for applicability in ['does_not_apply','unsure','applies','applies']:
            response=await self.client.patch('/api/onboarding/programs/iso-27001',json={'client_id':'a','applicability':applicability})
            self.assertEqual(response.status_code,200,response.text)
        saved=(await self.client.get('/api/framework_assessments/'+aid)).json()
        self.assertEqual(saved['implementation'],'Documented scope boundary')
        self.assertEqual(len(saved['assessment_history']),1)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),123)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),10)

    async def test_soa_semantics_and_clause_exclusion(self):
        workspace=await self.configure()
        path=lambda did:'/api/framework_assessments/'+next(a['framework_assessment_id'] for a in workspace['assessments'] if a['definition_id']==did)
        self.assertEqual((await self.client.patch(path('4.3'),json={'status':'not_applicable','na_rationale':'No'})).status_code,422)
        self.assertEqual((await self.client.patch(path('4.3'),json={'soa_applicability':'included','soa_justification':'No'})).status_code,422)
        for body in [
            {'soa_applicability':'excluded','status':'not_applicable'},
            {'soa_applicability':'excluded','soa_justification':'No need'},
            {'soa_applicability':'included','status':'not_applicable','soa_justification':'Needed'},
            {'status':'addressed','implementation':'Configured'},
            {'soa_applicability':'invalid'},
            {'soa_justification':'x'*4001}]:
            self.assertEqual((await self.client.patch(path('A.8.30'),json=body)).status_code,422,body)
        good={'soa_applicability':'excluded','soa_justification':'No outsourced development within the documented scope','status':'not_applicable'}
        response=await self.client.patch(path('A.8.30'),json=good)
        self.assertEqual(response.status_code,200,response.text)
        included={'soa_applicability':'included','soa_justification':'New outsourcing risk treatment approved','status':'in_progress','implementation':'Supplier controls under implementation'}
        self.assertEqual((await self.client.patch(path('A.8.30'),json=included)).status_code,200)
        saved=(await self.client.get(path('A.8.30'))).json()
        self.assertEqual(saved['assessment_history'][0]['soa_justification'],good['soa_justification'])
        self.assertEqual(len(saved['assessment_history']),2)

    async def test_three_frameworks_share_work_without_overwriting_it(self):
        await self.configure(('cis-ig1','hipaa'))
        before=await server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        workspace=await self.configure(('cis-ig1','hipaa','iso-27001'))
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),255)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),22)
        for row in before:
            after=await server.db.reviews.find_one({'review_id':row['review_id']},{'_id':0})
            self.assertEqual(after,row)
        a=next(a for a in workspace['assessments'] if a['definition_id']=='A.5.18')
        related=(await self.client.get('/api/framework_assessments/'+a['framework_assessment_id']+'/related')).json()
        self.assertEqual(len(related['reviews']),2)  # Access and SoA are different obligations.
        self.assertTrue(any(r['framework_key']=='cis-ig1' for r in related['reviews']))
        self.assertTrue(related['policies'])

    async def test_iso_readonly_and_cross_client_boundaries(self):
        a=(await self.configure())['assessments'][0]['framework_assessment_id']
        b=(await self.configure(cid='b'))['assessments'][0]['framework_assessment_id']
        self.sign_in('member')
        for suffix in ['', '/related', '/activity']:
            self.assertEqual((await self.client.get('/api/framework_assessments/'+b+suffix)).status_code,403)
        self.assertEqual((await self.client.get('/api/frameworks/iso-27001',params={'client_id':'b'})).status_code,403)
        self.assertEqual((await self.client.patch('/api/onboarding/programs/iso-27001',json={'client_id':'b','applicability':'applies'})).status_code,403)
        for kind,id_field in [('reviews','review_id'),('policies','policy_id'),('risks','risk_id'),('vendors','vendor_id'),('evidence','evidence_id'),('findings','finding_id'),('tasks','task_id')]:
            foreign=await server.db[kind].find_one({'client_id':'b'})
            if not foreign:
                foreign={id_field:'foreign-'+kind,'client_id':'b','title':'Other tenant','status':'open'}
                await server.db[kind].insert_one(foreign)
            response=await self.client.post('/api/framework_assessments/'+a+'/links',json={'kind':kind,'id':foreign[id_field]})
            self.assertIn(response.status_code,(403,422),response.text)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        base='/api/framework_assessments/'+a
        self.assertEqual((await self.client.get(base)).status_code,200)
        for method,suffix,body in [('PATCH','',{'notes':'Denied'}),('POST','/links',{'kind':'risks','id':'any'}),('DELETE','/links',{'kind':'evidence','id':'any'}),('POST','/findings',{'title':'Gap','remediation_title':'Fix','request_id':'blocked'})]:
            self.assertEqual((await self.client.request(method,base+suffix,json=body)).status_code,403)
        self.client.headers.pop('Authorization')
        self.assertEqual((await self.client.get(base)).status_code,401)

    async def test_corrective_action_preserves_independent_assessment(self):
        workspace=await self.configure()
        a=next(a for a in workspace['assessments'] if a['definition_id']=='10.2')
        base='/api/framework_assessments/'+a['framework_assessment_id']
        body={'title':'Corrective effectiveness has not been validated','remediation_title':'Validate corrective effectiveness','severity':'high','request_id':'iso-correction'}
        first=await self.client.post(base+'/findings',json=body)
        self.assertEqual(first.status_code,200,first.text)
        self.assertIn('ISO 27001 10.2',first.json()['source'])
        repeat=await self.client.post(base+'/findings',json=body)
        self.assertEqual(first.json()['finding_id'],repeat.json()['finding_id'])
        related=(await self.client.get(base+'/related')).json()
        self.assertEqual(len(related['tasks']),1)
        self.assertEqual((await self.client.patch('/api/tasks/'+related['tasks'][0]['task_id'],json={'status':'done'})).status_code,200)
        self.assertEqual((await self.client.get(base)).json()['status'],'not_assessed')
        self.assertEqual((await self.client.post('/api/findings/'+first.json()['finding_id']+'/validate',json={'rationale':'Effectiveness independently checked within fixture'})).status_code,200)
        self.assertEqual((await self.client.get(base)).json()['status'],'not_assessed')
