"""One client, shared operations, independent judgments; isolated real API routes."""
from copy import deepcopy
import unittest
import test_framework_governance as framework_tests
from framework_catalog import CATALOGS
from shared_review_plans import shared_config
server=framework_tests.server


class MultiFrameworkTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = framework_tests.FrameworkTests.asyncSetUp
    sign_in = framework_tests.FrameworkTests.sign_in
    body = framework_tests.FrameworkTests.body
    configure = framework_tests.FrameworkTests.configure

    async def setup_program(self):
        body=self.body(('cis-ig1','iso-27001','soc-2'))
        body['state']['framework_reviews']={p['key']:{'due_date':'2027-03-31'}
            for key in ('cis-ig1','iso-27001','soc-2') for p in CATALOGS[key]['review_plans']}
        await self.configure(body)
        return body

    async def test_shared_schedule_drivers_history_remove_readd_and_independent_judgments(self):
        body=await self.setup_program()
        rows=await server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        self.assertEqual(len(rows),22)
        access=next(r for r in rows if r.get('framework_plan_key')=='account-authorization')
        vulnerability=next(r for r in rows if r.get('framework_plan_key')=='vulnerability-remediation')
        self.assertEqual(access['recurrence'],'quarterly');self.assertEqual(vulnerability['recurrence'],'monthly')
        self.assertEqual({d['framework_key'] for d in access['framework_drivers']},{'cis-ig1','iso-27001','soc-2'})
        self.assertTrue(all(r['due_date']=='2027-03-31' for r in rows))
        before=await server.db.framework_assessments.find({'client_id':'a'},{'_id':0}).to_list(None)
        path='/api/reviews/'+access['review_id']
        started=await self.client.post(path+'/start',json={'occurrence_id':access['current_occurrence_id']})
        self.assertEqual(started.status_code,200,started.text)
        completed=await self.client.post(path+'/complete',json={'occurrence_id':access['current_occurrence_id']})
        self.assertEqual(completed.status_code,200,completed.text)
        snapshot=deepcopy(completed.json()['occurrence'])
        self.assertEqual(snapshot['framework_drivers'],access['framework_drivers'])
        self.assertEqual(await server.db.framework_assessments.find({'client_id':'a'},{'_id':0}).to_list(None),before)
        body['state']['requirements']['soc-2']='does_not_apply'
        await self.configure(body)
        removed=await server.db.reviews.find_one({'review_id':access['review_id']},{'_id':0})
        self.assertTrue(removed['framework_driver_active'])
        self.assertFalse(next(d for d in removed['framework_drivers'] if d['framework_key']=='soc-2')['framework_driver_active'])
        self.assertEqual(removed['occurrences'][0],snapshot)
        body['state']['requirements']['soc-2']='applies'
        await self.configure(body);await self.configure(body)
        final=await server.db.reviews.find_one({'review_id':access['review_id']},{'_id':0})
        self.assertEqual(final['due_date'],completed.json()['review']['due_date'])
        self.assertEqual(final['occurrences'][0],snapshot)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),22)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),212)

    async def test_conflicting_saved_schedules_fail_before_finalization(self):
        body=self.body(('cis-ig1','iso-27001','soc-2'))
        # Resolve exact plan key from the authoritative catalog, not UI labels.
        iso=next(p for p in CATALOGS['iso-27001']['review_plans'] if p.get('baseline_key')=='user-access')
        body['state']['framework_reviews']={'account-authorization':{'recurrence':'quarterly'},iso['key']:{'recurrence':'annual'}}
        self.sign_in('admin')
        response=await self.client.post('/api/onboarding/baseline',json=body)
        self.assertEqual(response.status_code,422,response.text)
        self.assertIn('one cadence',response.text)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),0)

    async def test_one_control_maps_three_frameworks_without_cross_tenant_or_conclusion_changes(self):
        await self.setup_program()
        mapped=[]
        for key,did in [('cis-ig1','5.1'),('iso-27001','A.5.18'),('soc-2','CC6.2')]:
            row=await server.db.framework_assessments.find_one({'client_id':'a','framework_key':key,'definition_id':did})
            mapped.append(row['framework_assessment_id'])
        body={'client_id':'a','request_id':'shared-access','name':'Access authorization review','description':'Reconcile active accounts and approved rights','assessment_ids':mapped}
        created=await self.client.post('/api/organizational-controls',json=body)
        self.assertEqual(created.status_code,200,created.text)
        self.assertEqual(created.json()['assessment_ids'],mapped)
        candidates=await self.client.get('/api/organizational-controls/assessments',params={'client_id':'a'})
        self.assertEqual(candidates.status_code,200,candidates.text);self.assertEqual(len(candidates.json()),212)
        self.assertTrue(all('implementation' not in r for r in candidates.json()))
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a','status':'not_assessed'}),212)
        await server.db.framework_assessments.insert_one({'framework_assessment_id':'foreign-assessment','client_id':'b','framework_key':'soc-2','definition_id':'CC6.2','status':'not_assessed'})
        foreign=await self.client.post('/api/organizational-controls',json={**body,'request_id':'foreign-link','assessment_ids':mapped+['foreign-assessment']})
        self.assertEqual(foreign.status_code,422,foreign.text)
        self.sign_in('member')
        self.assertEqual((await self.client.get('/api/organizational-controls/assessments',params={'client_id':'b'})).status_code,403)
        self.assertEqual((await self.client.post('/api/organizational-controls',json=body)).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.get('/api/organizational-controls/assessments',params={'client_id':'a'})).status_code,200)
        self.assertEqual((await self.client.get('/api/organizational-controls/assessments',params={'client_id':'b'})).status_code,403)
        self.assertEqual((await self.client.post('/api/organizational-controls',json=body)).status_code,403)

    async def test_explicit_framework_gap_does_not_spread_through_shared_review(self):
        await self.setup_program()
        review=await server.db.reviews.find_one({'client_id':'a','framework_plan_key':'account-authorization'})
        rows=await server.db.framework_assessments.find({'client_id':'a','related_links':{'$elemMatch':{'kind':'reviews','id':review['review_id']}}}).to_list(None)
        iso=next(r for r in rows if r['framework_key']=='iso-27001')
        response=await self.client.post('/api/reviews/'+review['review_id']+'/create-finding',json={
            'occurrence_id':review['current_occurrence_id'],'title':'ISO evidence treatment justification missing',
            'description':'The shared access review operated; only ISO treatment documentation requires correction.',
            'remediation_title':'Record the ISO treatment justification','severity':'medium'})
        self.assertEqual(response.status_code,200,response.text);finding=response.json()
        linked=await self.client.post('/api/framework_assessments/'+iso['framework_assessment_id']+'/links',json={'kind':'findings','id':finding['finding_id']})
        self.assertEqual(linked.status_code,200,linked.text)
        for key in ('cis-ig1','iso-27001','soc-2'):
            workspace=(await self.client.get('/api/frameworks/'+key,params={'client_id':'a'})).json()
            for a in workspace['assessments']:
                work=workspace['work'][a['framework_assessment_id']]
                self.assertEqual(work['open_findings'],int(a['framework_assessment_id']==iso['framework_assessment_id']))
                self.assertEqual(work['open_actions'],int(a['framework_assessment_id']==iso['framework_assessment_id']))
        for a in (iso,next(r for r in rows if r['framework_key']=='cis-ig1')):
            related=(await self.client.get('/api/framework_assessments/'+a['framework_assessment_id']+'/related')).json()
            self.assertEqual(len(related['findings']),int(a==iso))
        task=await server.db.tasks.find_one({'client_id':'a','finding_id':finding['finding_id']})
        response=await self.client.get('/api/related',params={'entity_type':'tasks','entity_id':task['task_id']})
        self.assertEqual(response.status_code,200,response.text)
        reverse=response.json()
        self.assertEqual([a['framework_assessment_id'] for a in reverse['framework_assessments']],[iso['framework_assessment_id']])

    def test_explicit_sources_take_precedence_without_inventing_iso_soc_cadence(self):
        state={'requirements':dict.fromkeys(('cis-ig1','iso-27001','soc-2'),'applies')}
        plan=next(p for p in CATALOGS['soc-2']['review_plans'] if p.get('baseline_key')=='vulnerability')
        self.assertEqual(shared_config(state,plan)['recurrence'],'monthly')
        for key in ('iso-27001','soc-2'):
            self.assertTrue(all(not p.get('source_minimum') for p in CATALOGS[key]['review_plans']))
