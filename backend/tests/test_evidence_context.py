import json
from test_client_dashboard_sources import ClientDashboardSourcesTests, server


class EvidenceContextTests(ClientDashboardSourcesTests):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        if self._testMethodName in ('test_existing_sources_reject_other_tenants','test_new_client_has_zero_metrics_and_records_appear_without_setup'):
            return
        self.sign_in('admin')
        self.review = (await self.client.post('/api/reviews', json={'client_id':'a','title':'Policy Review and Approval','review_type':'policy','recurrence':'quarterly','due_date':'2026-09-30'})).json()
        self.finding = (await self.client.post('/api/reviews/'+self.review['review_id']+'/create-finding', json={'title':'NO ISP','occurrence_id':self.review['current_occurrence_id'],'remediation_title':'MAKE AN ISP'})).json()
        self.task = (await self.client.get('/api/tasks?client_id=a')).json()[0]

    async def upload(self, kind, ident, filename, **extra):
        response = await self.client.post('/api/evidence', json={'client_id':'a','linked_type':kind,'linked_id':ident,'filename':filename,'mime_type':'application/pdf','content_base64':'VEVTVA==',**extra})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    async def catalog(self, **extra):
        response = await self.client.get('/api/evidence/catalog', params={'client_id':'a',**extra})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    async def test_direct_action_review_groups_are_not_copies_and_validation_preserves_ownership(self):
        action = await self.upload('task',self.task['task_id'],'ISP-v1.0.pdf')
        review = await self.upload('review',self.review['review_id'],'policy-review-checklist.pdf',occurrence_id=self.review['current_occurrence_id'])
        no_direct = await self.catalog(entity_type='findings',entity_id=self.finding['finding_id'])
        self.assertEqual(no_direct['counts'],{'actions':1,'review':1})
        direct = await self.upload('finding',self.finding['finding_id'],'missing-policy-confirmation.pdf')
        result = await self.catalog(entity_type='findings',entity_id=self.finding['finding_id'])
        self.assertEqual(result['counts'],{'actions':1,'review':1,'direct':1})
        item=next(r for r in result['items'] if r['evidence_id']==action['evidence_id'])
        self.assertEqual(item['context']['source']['title'],'MAKE AN ISP')
        self.assertEqual(item['context']['finding']['title'],'NO ISP')
        self.assertEqual(item['context']['review']['period'],'Q3 2026')
        self.assertNotIn('content_base64',item)
        await self.client.patch('/api/tasks/'+self.task['task_id'],json={'status':'done'})
        validated=await self.client.post('/api/findings/'+self.finding['finding_id']+'/validate',json={'rationale':'Synthetic evidence inspected for test'})
        self.assertEqual(validated.status_code,200,validated.text)
        self.assertEqual(await server.db.evidence.count_documents({}),3)
        self.assertEqual((await server.db.evidence.find_one({'evidence_id':action['evidence_id']}))['linked_id'],self.task['task_id'])
        self.assertEqual((await self.client.get('/api/evidence/'+review['evidence_id']+'/download')).status_code,200)
        self.assertEqual((await self.client.delete('/api/evidence/'+action['evidence_id'])).status_code,409)

    async def test_occurrence_resolution_search_and_current_vs_historical_context(self):
        await self.upload('review',self.review['review_id'],'q3-access-export.csv',occurrence_id=self.review['current_occurrence_id'])
        completion=await self.client.post('/api/reviews/'+self.review['review_id']+'/complete',json={'occurrence_id':self.review['current_occurrence_id']})
        self.assertEqual(completion.status_code,200,completion.text)
        q4=completion.json()['review']['current_occurrence_id']
        await self.upload('review',self.review['review_id'],'q4-access-export.csv',occurrence_id=q4)
        library=await self.catalog(q='Q3 2026')
        self.assertEqual(library['total'],1)
        self.assertEqual(library['items'][0]['context']['source']['occurrence_id'],self.review['current_occurrence_id'])
        context=await self.catalog(entity_type='findings',entity_id=self.finding['finding_id'])
        self.assertEqual([e['filename'] for e in context['items']],['q3-access-export.csv'])
        current=await self.catalog(entity_type='reviews',entity_id=self.review['review_id'],occurrence_id=q4)
        self.assertEqual([e['filename'] for e in current['items']],['q4-access-export.csv'])
        self.assertEqual((await self.catalog(q='Policy Review',state=json.dumps({'filters':{'mime_type':['application/pdf']}})))['total'],2)

    async def test_multiple_actions_pagination_beyond_old_caps_and_live_titles(self):
        for n in range(3):
            action=(await self.client.post('/api/tasks',json={'client_id':'a','title':'MFA action '+str(n),'source_type':'finding','source_id':self.finding['finding_id']})).json()
            await self.upload('task',action['task_id'],'proof-'+str(n)+'.pdf')
        first=await self.catalog(entity_type='findings',entity_id=self.finding['finding_id'],page_size=2)
        second=await self.catalog(entity_type='findings',entity_id=self.finding['finding_id'],page_size=2,page=2)
        self.assertEqual(first['total'],3)
        self.assertEqual(len({e['evidence_id'] for e in first['items']+second['items']}),3)
        await server.db.evidence.insert_many([{'evidence_id':'many-'+str(n),'client_id':'a','linked_type':'task','linked_id':self.task['task_id'],'filename':'bulk-'+str(n),'created_at':'2026-09-01'} for n in range(1005)])
        last=await self.catalog(q='bulk-',page_size=100,page=11)
        self.assertEqual(last['total'],1005)
        self.assertEqual(len(last['items']),5)
        await server.db.tasks.update_one({'task_id':self.task['task_id']},{'$set':{'title':'Renamed source'}})
        self.assertEqual((await self.catalog(q='Renamed source'))['total'],1005)

    async def test_authorization_orphan_fallback_unknown_uploader_and_delete_restrictions(self):
        evidence=await self.upload('task',self.task['task_id'],'private-proof.pdf')
        await server.db.evidence.insert_one({'evidence_id':'foreign','client_id':'b','filename':'foreign','content_base64':'VEVTVA=='})
        await server.db.tasks.insert_one({'task_id':'foreign-source','client_id':'b','title':'Foreign secret'})
        await server.db.evidence.insert_one({'evidence_id':'orphan','client_id':'a','linked_type':'task','linked_id':'foreign-source','filename':'legacy-proof','content_base64':'VEVTVA=='})
        self.sign_in('member')
        orphan=(await self.catalog(q='legacy-proof'))['items'][0]
        self.assertFalse(orphan['context']['source']['available'])
        self.assertEqual(orphan['uploader'],'Unknown uploader')
        self.assertEqual((await self.catalog(q='Foreign secret'))['total'],0)
        for path in ['/api/evidence/catalog?client_id=b','/api/evidence/foreign/download']:
            self.assertEqual((await self.client.get(path)).status_code,403)
        self.assertEqual((await self.client.delete('/api/evidence/'+evidence['evidence_id'])).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.get('/api/evidence/'+evidence['evidence_id']+'/download')).status_code,200)
        denied=await self.client.post('/api/evidence',json={'client_id':'a','filename':'no-write','content_base64':'VEVTVA=='})
        self.assertEqual(denied.status_code,403)
        self.assertEqual((await self.catalog())['total'],2)

    async def test_risk_vendor_policy_sources_and_treatment_context(self):
        for kind,key in [('risks','risk_id'),('vendors','vendor_id'),('policies','policy_id')]:
            await server.db[kind].insert_one({key:kind,'client_id':'a','title':'Source '+kind,'name':'Source '+kind,'status':'open'})
            await self.upload(kind,kind,kind+'.pdf')
        await server.db.tasks.update_one({'task_id':self.task['task_id']},{'$set':{'risk_id':'risks'}})
        await self.upload('task',self.task['task_id'],'treatment-proof.pdf')
        result=await self.catalog(entity_type='risks',entity_id='risks')
        self.assertEqual(result['counts'],{'direct':1,'treatment':1})
        self.assertEqual({e['context']['source']['kind'] for e in (await self.catalog())['items']},{'risks','vendors','policies','tasks'})

    async def test_archiving_does_not_remove_bytes_or_expose_other_sources(self):
        evidence=await self.upload('finding',self.finding['finding_id'],'unneeded.pdf')
        self.assertEqual((await self.client.delete('/api/evidence/'+evidence['evidence_id'])).status_code,200)
        self.assertEqual((await self.catalog())['total'],0)
        self.assertEqual(await server.db.evidence.count_documents({}),1)
        self.assertEqual((await self.client.get('/api/evidence/'+evidence['evidence_id']+'/download')).status_code,200)
