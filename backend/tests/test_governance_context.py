from test_client_dashboard_sources import ClientDashboardSourcesTests, server
from governance_context import GovernanceContext
from action_items import view
from pydantic import ValidationError
from review_occurrences import snapshot


class GovernanceContextTests(ClientDashboardSourcesTests):
    def test_strict_context_and_safe_links(self):
        for value in ({'category':'required'}, {'cadence_source':'regulatory'}, {'framework':'fake'}, {'rationale':'x'*4001}, {'reference_url':'javascript:alert(1)'}, {'reference_url':'https://user:secret@example.test'}):
            with self.subTest(value=list(value)):
                with self.assertRaises(ValidationError): GovernanceContext(**value)
        self.assertEqual(GovernanceContext(cadence_source='risk_based').cadence_source,'risk_based')

    def test_legacy_titles_and_history(self):
        self.assertEqual(view({'title':'Remediate: gap','title_generated':True})['title'],'gap')
        self.assertEqual(view({'title':'Remediate: intended'})['title'],'Remediate: intended')
        context={'category':'management','cadence_rationale':'Decision'}
        review={'review_id':'r','recurrence':'quarterly','due_date':'2026-09-30','governance_context':context}
        history=snapshot(review,[],0,{'user_id':'a'},'2026-09-30')
        self.assertEqual(history['governance_context'],context)

    async def test_context_persistence_audit_and_authorization(self):
        self.sign_in('admin')
        response=await self.client.post('/api/reviews',json={'client_id':'a','title':'Review','review_type':'access','governance_context':{'rationale':'Initial basis'}})
        self.assertEqual(response.status_code,200,response.text)
        rid=response.json()['review_id']
        response=await self.client.patch('/api/reviews/'+rid,json={'governance_context':{'rationale':'Management changed the basis','cadence_source':'organization_defined'}})
        self.assertEqual(response.status_code,200,response.text)
        saved=(await self.client.get('/api/reviews/'+rid)).json()
        self.assertEqual(saved['governance_context']['rationale'],'Management changed the basis')
        log=await server.db.audit_logs.find_one({'entity_id':rid,'meta.governance_context_after':{'$exists':True}})
        self.assertIsNotNone(log)
        self.sign_in('member')
        self.assertEqual((await self.client.patch('/api/reviews/'+rid,json={'governance_context':{'rationale':'Not permitted'}})).status_code,403)
        await server.db.users.insert_one({'user_id':'other','role':'client_contributor','client_ids':['b'],'status':'active'})
        self.sign_in('other')
        self.assertEqual((await self.client.get('/api/related',params={'entity_type':'reviews','entity_id':rid})).status_code,403)

    async def test_manual_policy_task_and_source_integrity(self):
        self.sign_in('admin')
        for kind,extra in [('policies',{}),('tasks',{'source_type':'incident'})]:
            response=await self.client.post('/api/'+kind,json={'client_id':'a','title':'Organizational work','governance_context':{'category':'management','rationale':'Leadership request'},**extra})
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['governance_context']['category'],'management')
        response=await self.client.post('/api/tasks',json={'client_id':'a','title':'Bad','governance_context':{'category':'mandatory'}})
        self.assertEqual(response.status_code,422)

    async def test_inherited_framework_links_and_table_summary_are_tenant_scoped(self):
        await server.db.reviews.insert_one({'client_id':'a','review_id':'r','title':'Review','review_type':'access'})
        await server.db.tasks.insert_one({'client_id':'a','task_id':'t','review_id':'r','title':'Action'})
        for aid,cid,key,did in [('i','a','iso-27001','5.2'),('c','a','cis-ig1','1.1'),('private','b','hipaa','164.302')]:
            await server.db.framework_assessments.insert_one({'client_id':cid,'framework_assessment_id':aid,'framework_key':key,'definition_id':did,'related_links':[{'kind':'reviews','id':'r'}]})
        self.sign_in('member')
        related=(await self.client.get('/api/related',params={'entity_type':'tasks','entity_id':'t'})).json()
        self.assertEqual({a['framework_assessment_id'] for a in related['framework_assessments']},{'i','c'})
        rows=(await self.client.get('/api/reviews?client_id=a&include_basis=true')).json()
        self.assertEqual(set(rows[0]['basis_framework_keys']),{'iso-27001','cis-ig1'})
        self.assertNotIn('basis_framework_keys',await server.db.reviews.find_one({'review_id':'r'}))

    async def test_unavailable_sources_and_readonly_context(self):
        await server.db.policies.insert_one({'policy_id':'old','client_id':'a','title':'Retired source','status':'retired'})
        await server.db.tasks.insert_one({'task_id':'t','client_id':'a','title':'Follow up','policy_id':'old','source_type':'policy','source_id':'old','status':'open','priority':'medium'})
        self.sign_in('member')
        query={'entity_type':'tasks','entity_id':'t'}
        self.assertEqual((await self.client.get('/api/related',params=query)).json()['policies'][0]['status'],'retired')
        await server.db.policies.delete_one({'policy_id':'old'})
        await server.db.policies.insert_one({'policy_id':'old','client_id':'b','title':'Private'})
        self.assertEqual((await self.client.get('/api/related',params=query)).json()['policies'],[])
        self.assertEqual((await self.client.get('/api/tasks/t')).json()['policy_id'],'old')
        await server.db.users.insert_one({'user_id':'reader','role':'client_readonly','client_ids':['a'],'status':'active'})
        self.sign_in('reader')
        self.assertEqual((await self.client.patch('/api/tasks/t',json={'governance_context':{'rationale':'Forbidden'}})).status_code,403)

    async def test_generated_title_does_not_rewrite_manual_titles(self):
        await server.db.findings.insert_one({'finding_id':'f','client_id':'a','title':'Backup testing gap','status':'open'})
        self.sign_in('admin')
        response=await self.client.post('/api/findings/f/create-task',json={})
        self.assertEqual(response.status_code,200,response.text)
        row=response.json()
        self.assertEqual(row['title'],'Backup testing gap')
        self.assertTrue(row['title_generated'])
        edited=await self.client.patch('/api/tasks/'+row['task_id'],json={'title':'Remediate: intentional wording'})
        self.assertEqual(edited.status_code,200,edited.text)
        self.assertFalse(edited.json()['title_generated'])
        self.assertEqual((await self.client.get('/api/tasks/'+row['task_id'])).json()['title'],'Remediate: intentional wording')
