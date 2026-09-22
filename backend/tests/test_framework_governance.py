"""Real FastAPI routes; isolated Mongo mock. No persistent staging dependency."""
import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from routes.onboarding import BASELINE_CATALOG
from framework_governance import CIS, FRAMEWORKS


class FrameworkTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    def body(self, programs=('cis-ig1',), cid='a'):
        return {'client_id': cid, 'finalize': True, 'state': {
            'version': 3, 'step': 3, 'policies': {p['key']: 'unsure' for p in BASELINE_CATALOG['policies']},
            'requirements': {f['key']: 'applies' if f['key'] in programs else 'does_not_apply' for f in FRAMEWORKS},
            'reviews': [], 'framework_reviews': {}}}

    async def configure(self, body=None):
        self.sign_in('admin')
        response = await self.client.post('/api/onboarding/baseline', json=body or self.body())
        self.assertEqual(response.status_code, 200, response.text)
        return (await self.client.get('/api/frameworks/cis-ig1', params={'client_id': (body or self.body())['client_id']})).json()

    def test_verified_membership_and_mapping_integrity(self):
        counts = {1:2,2:3,3:6,4:7,5:4,6:5,7:4,8:3,9:2,10:3,11:4,12:1,14:8,15:1,17:3}
        expected = {f'{control}.{n}' for control, count in counts.items() for n in range(1, count+1)}
        self.assertEqual({d['id'] for d in CIS['requirements']}, expected)
        self.assertEqual(len(CIS['requirements']), 56)
        self.assertEqual([f['key'] for f in FRAMEWORKS if f['implemented']], ['hipaa','cis-ig1'])
        for plan in CIS['review_plans']:
            self.assertTrue(set(plan['safeguards']) <= expected)
            for field in ('basis','reason','source_cadence','default_cadence'): self.assertTrue(plan[field])
        self.assertEqual(len(CIS['review_plans']),12)
        self.assertEqual(next(p for p in CIS['review_plans'] if p['key']=='data-recovery')['default_cadence'],'annual')

    async def test_selection_combinations_and_no_implicit_retrofit(self):
        self.sign_in('admin')
        for programs in ([],['hipaa'],['iso-27001','soc-2'],['cis-ig1'],['cis-ig1','hipaa','nist-csf-2']):
            cid = (await self.client.post('/api/clients',json={'name':'Framework test '+str(programs)})).json()['client_id']
            initial = (await self.client.get('/api/frameworks/cis-ig1',params={'client_id':cid})).json()
            self.assertEqual(initial['assessments'], [])
            workspace = await self.configure(self.body(programs,cid))
            expected = 56 if 'cis-ig1' in programs else 0
            self.assertEqual(len(workspace['assessments']), expected)
            review_count=18 if expected and 'hipaa' in programs else 12 if expected else 8 if 'hipaa' in programs else 0
            self.assertEqual(await server.db.reviews.count_documents({'client_id':cid}),review_count)
            for key in ['hipaa','nist-csf-2','iso-27001','cmmc','soc-2']:
                shell = (await self.client.get('/api/frameworks/'+key,params={'client_id':cid})).json()
                self.assertEqual(shell['selected'],key in programs)
                count=76 if key=='hipaa' and key in programs else 0
                self.assertEqual(len(shell['definitions']),count); self.assertEqual(len(shell['assessments']),count)

    async def test_authoritative_workflow_and_reconfiguration_preserves_history(self):
        body=self.body();body['state']['framework_reviews']['account-authorization']={'recurrence':'annual','due_date':'2026-12-01'}
        workspace=await self.configure(body);row=workspace['assessments'][0];aid=row['framework_assessment_id'];base='/api/framework_assessments/'+aid
        saved=await self.client.patch(base,json={'implementation':'Inventories reconciled with endpoint platform','technology':'Asset inventory platform','owner_id':'admin','status':'in_progress'})
        self.assertEqual(saved.status_code,200,saved.text)
        ev=await self.client.post('/api/evidence',json={'client_id':'a','linked_type':'framework_assessment','linked_id':aid,'filename':'inventory.txt','mime_type':'text/plain','content_base64':'eA=='})
        self.assertEqual(ev.status_code,200,ev.text)
        self.assertEqual((await self.client.post('/api/comments',json={'entity_type':'framework_assessments','entity_id':aid,'body':'Reconciliation reviewed'})).status_code,200)
        payload={'title':'Inventory reconciliation gap','remediation_title':'Reconcile uncovered assets','severity':'high','request_id':'qa-request'}
        f=await self.client.post(base+'/findings',json=payload);self.assertEqual(f.status_code,200,f.text)
        again=await self.client.post(base+'/findings',json=payload);self.assertEqual(again.json()['finding_id'],f.json()['finding_id'])
        related=(await self.client.get(base+'/related')).json();self.assertEqual(len(related['tasks']),1);self.assertEqual(len(related['evidence']),1)
        task=related['tasks'][0]
        response=await self.client.patch('/api/tasks/'+task['task_id'],json={'status':'done'});self.assertEqual(response.status_code,200,response.text)
        related=(await self.client.get(base+'/related')).json()
        self.assertEqual(related['tasks'][0]['status'],'done');self.assertEqual(related['findings'][0]['status'],'remediated')
        self.assertEqual((await server.db.framework_assessments.find_one({'framework_assessment_id':aid}))['status'],'in_progress')
        validated=await self.client.post('/api/findings/'+f.json()['finding_id']+'/validate',json={'rationale':'Remediation verified against inventory evidence'})
        self.assertEqual(validated.status_code,200,validated.text)
        self.assertEqual((await self.client.patch(base,json={'status':'addressed'})).status_code,200)
        reviews=await server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        for r in reviews:
            if r['framework_plan_key']=='account-authorization':self.assertEqual(r['recurrence'],'annual')
        await self.configure(body)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),12)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),56)
        after=await server.db.framework_assessments.find_one({'framework_assessment_id':aid})
        self.assertEqual(after['status'],'addressed');self.assertEqual(after['owner_id'],'admin');self.assertEqual(len(after['assessment_history']),2)
        await self.configure(self.body([]))
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a','framework_driver_active':True}),0)
        self.assertEqual(len((await self.client.get(base+'/related')).json()['tasks']),1)
        self.assertEqual(await server.db.evidence.count_documents({'client_id':'a'}),1)
        await self.configure(body)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),12)
        actions=[a['action'] for a in (await self.client.get(base+'/activity')).json()]
        self.assertIn('Evidence linked',actions);self.assertIn('Finding raised',actions)

    async def test_client_boundaries_readonly_and_validation(self):
        a=(await self.configure())['assessments'][0]['framework_assessment_id']
        b=(await self.configure(self.body(cid='b')))['assessments'][0]['framework_assessment_id']
        await server.db.contacts.insert_one({'client_id':'b','contact_id':'foreign-contact','name':'Foreign'})
        await server.db.users.insert_one({'user_id':'foreign-owner','client_ids':['b'],'role':'client_contributor','status':'active'})
        base='/api/framework_assessments/'+a
        for patch in [{'status':'not_applicable'},{'status':'addressed'},{'owner_id':'foreign-owner'},{'process_owner_id':'foreign-contact'},{'client_id':'b'},{'assessment_history':[]}]:
            self.assertEqual((await self.client.patch(base,json=patch)).status_code,422)
        self.assertEqual((await self.client.patch(base,json={'status':'not_applicable','na_rationale':'No relevant scope; reviewed by owner'})).status_code,200)
        self.sign_in('member')
        for path in ['/api/frameworks/cis-ig1?client_id=b','/api/framework_assessments/'+b+'/related','/api/framework_assessments/'+b+'/activity','/api/comments?entity_type=framework_assessments&entity_id='+b]:
            self.assertEqual((await self.client.get(path)).status_code,403,path)
        self.assertEqual((await self.client.post('/api/evidence',json={'client_id':'a','linked_type':'framework_assessment','linked_id':b,'filename':'foreign.txt','content_base64':'eA=='})).status_code,403)
        self.assertEqual((await self.client.patch(base,json={'notes':'Contributor update'})).status_code,200)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.patch(base,json={'notes':'Forbidden'})).status_code,403)
        self.assertEqual((await self.client.post(base+'/findings',json={'title':'Gap','remediation_title':'Fix','request_id':'readonly'})).status_code,403)
        self.assertEqual((await self.client.get(base+'/related')).status_code,200)

    async def test_existing_review_reuse_and_occurrence_provenance(self):
        await server.db.reviews.insert_one({'client_id':'a','review_id':'existing','baseline_key':'user-access','title':'Client access review','review_type':'access','recurrence':'quarterly','due_date':'2026-12-01','status':'upcoming','owner_id':'admin'})
        await self.configure()
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),12)
        review=(await self.client.get('/api/reviews',params={'client_id':'a'})).json()
        current=next(r for r in review if r['review_id']=='existing')
        self.assertEqual(current['title'],'Client access review')
        done=await self.client.post('/api/reviews/existing/complete',json={'occurrence_id':current['current_occurrence_id']})
        self.assertEqual(done.status_code,200,done.text)
        self.assertEqual(done.json()['occurrence']['framework_key'],'cis-ig1')
        await self.configure()
        history=(await self.client.get('/api/reviews/existing/history')).json()
        self.assertEqual(len(history),1);self.assertEqual(history[0]['framework_safeguards'],current['framework_safeguards'])
        reverse=(await self.client.get('/api/related',params={'entity_type':'reviews','entity_id':'existing'})).json()
        self.assertEqual(len(reverse['framework_assessments']),9)
