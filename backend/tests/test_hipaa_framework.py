"""HIPAA semantics and real authorized routes against isolated Mongo fixtures."""
import asyncio
import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from framework_catalog import HIPAA, CIS
from framework_governance import reconcile
from routes.onboarding import BASELINE_CATALOG


class HipaaTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    async def configure(self, programs=('hipaa',), cid='a'):
        self.sign_in('admin')
        state={'version':3,'step':3,'policies':{p['key']:'unsure' for p in BASELINE_CATALOG['policies']},
               'requirements':{p['key']:'applies' if p['key'] in programs else 'does_not_apply' for p in BASELINE_CATALOG['requirements']},
               'reviews':[],'framework_reviews':{}}
        r=await self.client.post('/api/onboarding/baseline',json={'client_id':cid,'state':state,'finalize':True})
        self.assertEqual(r.status_code,200,r.text)
        return (await self.client.get('/api/frameworks/hipaa',params={'client_id':cid})).json()

    def test_catalog_reference_and_addressability_integrity(self):
        definitions={d['id']:d for d in HIPAA['requirements']}
        self.assertEqual(len(definitions),76)
        expected={
            *('164.308(a)(3)(ii)('+n+')' for n in 'ABC'),
            *('164.308(a)(4)(ii)('+n+')' for n in 'BC'),
            *('164.308(a)(5)(ii)('+n+')' for n in 'ABCD'),
            *('164.308(a)(7)(ii)('+n+')' for n in 'DE'),
            *('164.310(a)(2)('+n+')' for n in ['i','ii','iii','iv']),
            *('164.310(d)(2)('+n+')' for n in ['iii','iv']),
            *('164.312(a)(2)('+n+')' for n in ['iii','iv']),
            '164.312(c)(2)','164.312(e)(2)(i)','164.312(e)(2)(ii)'}
        self.assertEqual({d['id'] for d in definitions.values() if d['specification']=='addressable'},expected)
        for d in definitions.values():
            self.assertIn(d['classification'],('required','conditional'))
            self.assertTrue(d['source'].startswith('https://www.ecfr.gov/on/2026-09-18/title-45/section-'))
            self.assertTrue(d['guidance']);self.assertTrue(d['evidence_guidance'])
        self.assertIn('six years',definitions['164.316(b)(2)(i)']['source_cadence'])
        for plan in HIPAA['review_plans']:
            self.assertEqual(plan['classification'],'recommended')
            self.assertTrue(set(plan['safeguards'])<=set(definitions))
            self.assertIn('does not prescribe',plan['source_cadence'])

    async def test_get_never_initializes_and_settings_activation_is_idempotent(self):
        self.sign_in('admin')
        self.assertFalse((await self.client.get('/api/frameworks/hipaa',params={'client_id':'a'})).json()['configured'])
        self.assertEqual(await server.db.framework_assessments.count_documents({}),0)
        await self.configure(())
        before=await server.db.clients.find_one({'client_id':'a'})
        for _ in range(2):
            r=await self.client.patch('/api/onboarding/programs/hipaa',json={'client_id':'a','applicability':'applies'})
            self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a','framework_key':'hipaa'}),76)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),8)
        self.assertEqual((await server.db.clients.find_one({'client_id':'a'}))['onboarding_baseline'],before['onboarding_baseline'])
        for state in ['does_not_apply','unsure','applies']:
            await self.client.patch('/api/onboarding/programs/hipaa',json={'client_id':'a','applicability':state})
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),76)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),8)

    async def test_addressable_decisions_history_and_no_automatic_status(self):
        workspace=await self.configure()
        a=next(a for a in workspace['assessments'] if a['definition_id']=='164.312(a)(2)(iv)')
        path='/api/framework_assessments/'+a['framework_assessment_id']
        for body in [{'status':'not_applicable','na_rationale':'Not optional'},
                     {'status':'addressed','implementation':'Configured'},
                     {'addressable_decision':'optional'}]:
            self.assertEqual((await self.client.patch(path,json=body)).status_code,422)
        good={'status':'addressed','implementation':'Scoped protection implemented','addressable_decision':'equivalent_alternative','addressable_rationale':'Documented risk-based alternative and effectiveness assessment'}
        r=await self.client.patch(path,json=good);self.assertEqual(r.status_code,200,r.text)
        await self.configure()
        saved=await server.db.framework_assessments.find_one({'framework_assessment_id':a['framework_assessment_id']})
        self.assertEqual(saved['addressable_rationale'],good['addressable_rationale'])
        self.assertEqual(len(saved['assessment_history']),1)

    async def test_shared_reviews_preserve_cis_dates_owner_and_history(self):
        await self.configure(('cis-ig1',))
        review=await server.db.reviews.find_one({'client_id':'a','framework_plan_key':'account-authorization'})
        await server.db.reviews.update_one({'review_id':review['review_id']},{'$set':{'owner_id':'admin','due_date':'2027-01-15','recurrence':'monthly','title':'Client-specific access review'}})
        before=await server.db.reviews.find_one({'review_id':review['review_id']})
        workspace=await self.configure(('cis-ig1','hipaa'))
        after=await server.db.reviews.find_one({'review_id':review['review_id']})
        for field in ['owner_id','due_date','recurrence','title','framework_key','framework_safeguards','current_occurrence_id']:
            self.assertEqual(after.get(field),before.get(field),field)
        a=next(a for a in workspace['assessments'] if a['definition_id']=='164.312(a)(2)(iv)')
        related=(await self.client.get('/api/framework_assessments/'+a['framework_assessment_id']+'/related')).json()
        self.assertIn(review['review_id'],[r['review_id'] for r in related['reviews']])
        policy=next(p for p in related['policies'] if p['baseline_key']=='policy-cryptography-key-management-policy')
        reverse=(await self.client.get('/api/related',params={'entity_type':'policies','entity_id':policy['policy_id']})).json()
        self.assertIn(a['framework_assessment_id'],[r['framework_assessment_id'] for r in reverse['framework_assessments']])
        expected=len({p['baseline_key'] or p['key'] for c in [CIS,HIPAA] for p in c['review_plans']})
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),expected)
        await self.client.patch('/api/onboarding/programs/hipaa',json={'client_id':'a','applicability':'does_not_apply'})
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a','framework_key':'cis-ig1','framework_driver_active':True}),12)

    async def test_concurrent_activation_uses_one_shared_obligation(self):
        self.sign_in('admin')
        await asyncio.gather(*(reconcile(server,'a',{'requirements':{key:'applies'}},{'user_id':'admin'}) for key in ['hipaa','cis-ig1','hipaa']))
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),132)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),len({p['baseline_key'] or p['key'] for c in [CIS,HIPAA] for p in c['review_plans']}))

    async def test_evidence_unlink_preserves_shared_artifact_and_provenance(self):
        workspace=await self.configure(('cis-ig1','hipaa'))
        aid=workspace['assessments'][0]['framework_assessment_id'];base='/api/framework_assessments/'+aid
        cis=await server.db.framework_assessments.find_one({'client_id':'a','framework_key':'cis-ig1'})
        other='/api/framework_assessments/'+cis['framework_assessment_id']
        e=await self.client.post('/api/evidence',json={'client_id':'a','linked_type':'framework_assessment','linked_id':aid,'filename':'scoped-proof.txt','content_base64':'eA=='})
        self.assertEqual(e.status_code,200,e.text);eid=e.json()['evidence_id']
        body={'kind':'evidence','id':eid}
        self.assertEqual((await self.client.post(other+'/links',json=body)).status_code,200)
        reverse=await self.client.get('/api/related',params={'entity_type':'evidence','entity_id':eid})
        self.assertEqual(reverse.status_code,200,reverse.text)
        self.assertEqual(len(reverse.json()['framework_assessments']),2)
        r=await self.client.request('DELETE',base+'/links',json=body);self.assertEqual(r.status_code,200,r.text)
        self.assertEqual((await self.client.get(base+'/related')).json()['evidence'],[])
        self.assertEqual(len((await self.client.get(other+'/related')).json()['evidence']),1)
        self.assertEqual(len((await self.client.get('/api/related',params={'entity_type':'evidence','entity_id':eid})).json()['framework_assessments']),1)
        self.assertEqual((await self.client.get(base)).status_code,200)
        self.assertEqual((await self.client.get('/api/evidence/'+eid+'/download')).status_code,200)
        artifact=await server.db.evidence.find_one({'evidence_id':eid});self.assertEqual(artifact['linked_id'],aid)
        await self.client.post(base+'/links',json=body)
        self.assertEqual(len((await self.client.get(base+'/related')).json()['evidence']),1)
        self.assertEqual(await server.db.evidence.count_documents({'client_id':'a'}),1)

    async def test_tenant_readonly_and_vendor_links(self):
        a=(await self.configure())['assessments'][0]['framework_assessment_id']
        b=(await self.configure(cid='b'))['assessments'][0]['framework_assessment_id']
        await server.db.vendors.insert_many([{'vendor_id':'va','client_id':'a','name':'Scoped BA'}, {'vendor_id':'vb','client_id':'b','name':'Other BA'}])
        self.sign_in('member');base='/api/framework_assessments/'+a
        self.assertEqual((await self.client.post(base+'/links',json={'kind':'vendors','id':'va'})).status_code,200)
        self.assertEqual((await self.client.post(base+'/links',json={'kind':'vendors','id':'vb'})).status_code,403)
        for suffix in ['', '/related','/activity']:
            method=self.client.patch if not suffix else self.client.get
            response=await method('/api/framework_assessments/'+b+suffix,**({'json':{'notes':'denied'}} if not suffix else {}))
            self.assertEqual(response.status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.get(base+'/related')).status_code,200)
        self.assertEqual((await self.client.patch(base,json={'notes':'denied'})).status_code,403)
        self.assertEqual((await self.client.request('DELETE',base+'/links',json={'kind':'evidence','id':'anything'})).status_code,403)
        self.assertEqual((await self.client.get('/api/framework_assessments/'+b)).status_code,403)
        self.client.headers.pop('Authorization')
        self.assertEqual((await self.client.get(base)).status_code,401)

    async def test_gap_remediation_validation_and_summary_are_authoritative(self):
        workspace=await self.configure()
        row=next(a for a in workspace['assessments'] if a['definition_id']=='164.308(a)(1)(ii)(A)')
        base='/api/framework_assessments/'+row['framework_assessment_id']
        await self.client.patch(base,json={'status':'in_progress','implementation':'Scoped risk analysis in progress'})
        body={'title':'Risk analysis scope requires validation','remediation_title':'Validate risk analysis coverage','severity':'high','request_id':'hipaa-gap'}
        first=await self.client.post(base+'/findings',json=body)
        self.assertEqual(first.status_code,200,first.text)
        repeat=await self.client.post(base+'/findings',json=body)
        self.assertEqual(first.json()['finding_id'],repeat.json()['finding_id'])
        self.assertNotIn('CIS',first.json()['source'])
        related=(await self.client.get(base+'/related')).json()
        self.assertEqual(len(related['tasks']),1)
        task=related['tasks'][0]
        self.assertEqual((await self.client.patch('/api/tasks/'+task['task_id'],json={'status':'done'})).status_code,200)
        related=(await self.client.get(base+'/related')).json()
        self.assertEqual(related['findings'][0]['status'],'remediated')
        self.assertEqual((await self.client.get(base)).json()['status'],'in_progress')
        summary=(await self.client.get('/api/frameworks/summary',params={'client_id':'a'})).json()['items'][0]
        self.assertEqual(summary['open_findings'],1);self.assertEqual(summary['open_actions'],0)
        self.assertEqual(summary['total'],76)
        self.assertEqual((await self.client.post('/api/findings/'+first.json()['finding_id']+'/validate',json={'rationale':'Scoped evidence and remediation verified'})).status_code,200)
        self.assertEqual((await self.client.get(base)).json()['status'],'in_progress')
        self.assertEqual((await self.client.get('/api/frameworks/summary',params={'client_id':'a'})).json()['items'][0]['open_findings'],0)
