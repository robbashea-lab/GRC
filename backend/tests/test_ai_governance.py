import asyncio
from test_client_dashboard_sources import ClientDashboardSourcesTests, server
from ai_governance import CATALOG

class AIGovernanceTests(ClientDashboardSourcesTests):
    async def create(self, **overrides):
        self.sign_in('admin')
        body={'client_id':'a','name':'Microsoft Copilot','status':'active','owner_id':'member','screening':{q['key']:False for q in CATALOG['questions']},**overrides}
        response=await self.client.post('/api/ai_systems',json=body)
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    async def test_sequential_immutable_concurrent_tenant_ids(self):
        first=await self.create()
        self.assertEqual(first['display_id'],'AI-001')
        second=await self.create(client_id='b',owner_id=None)
        self.assertEqual(second['display_id'],'AI-001')
        results=await asyncio.gather(*[self.client.post('/api/ai_systems',json={'client_id':'a','name':'Parallel'}) for _ in range(8)])
        self.assertTrue(all(r.status_code==200 for r in results))
        self.assertEqual(len({r.json()['display_id'] for r in results}),8)
        url='/api/ai_systems/'+first['ai_system_id']
        self.assertEqual((await self.client.patch(url,json={'display_id':'AI-999'})).status_code,422)
        self.assertEqual((await self.client.patch(url,json={'client_id':'b'})).status_code,422)
        self.assertNotEqual((await self.client.delete(url)).status_code,200)

    async def test_scope_permissions_links_and_intake(self):
        row=await self.create()
        self.sign_in('member')
        self.assertEqual((await self.client.get('/api/ai_systems?client_id=b')).status_code,403)
        self.assertEqual((await self.client.post('/api/ai-intake',json={'client_id':'b','usage':'yes','indicators':[]})).status_code,403)
        self.assertEqual((await self.client.post('/api/ai_systems/'+row['ai_system_id']+'/reviews',json={'due_date':'2026-12-01','recurrence':'annual'})).status_code,403)
        await server.db.vendors.insert_one({'vendor_id':'foreign','client_id':'b','name':'Private'})
        self.assertEqual((await self.client.patch('/api/ai_systems/'+row['ai_system_id'],json={'vendor_id':'foreign'})).status_code,422)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.post('/api/ai_systems',json={'client_id':'a','name':'Denied'})).status_code,403)
        self.assertEqual((await self.client.get('/api/ai_systems?client_id=a')).status_code,200)

    async def test_review_occurrence_findings_actions_evidence_and_retirement(self):
        row=await self.create();aid=row['ai_system_id'];base='/api/ai_systems/'+aid
        schedule={'due_date':'2026-09-30','recurrence':'annual'}
        response=await self.client.post(base+'/reviews',json=schedule)
        self.assertEqual(response.status_code,200,response.text)
        review=response.json();rid=review['review_id'];occ={'occurrence_id':review['current_occurrence_id']}
        self.assertEqual((await self.client.post(base+'/reviews',json=schedule)).json()['review_id'],rid)
        self.assertEqual((await self.client.post('/api/reviews/'+rid+'/start',json=occ)).status_code,200)
        raised=await self.client.post('/api/reviews/'+rid+'/create-finding',json={**occ,'title':'Human review is not consistently documented','remediation_title':'Implement human-review approval','severity':'high'})
        self.assertEqual(raised.status_code,200,raised.text)
        ev=await self.client.post('/api/evidence',json={**occ,'client_id':'a','linked_type':'review','linked_id':rid,'filename':'assessment.txt','content_base64':'eA=='})
        self.assertEqual(ev.status_code,200,ev.text)
        done=await self.client.post('/api/reviews/'+rid+'/complete',json=occ)
        self.assertEqual(done.status_code,200,done.text)
        current=(await self.client.get('/api/ai_systems?client_id=a')).json()[0]
        self.assertTrue(current['last_review']);self.assertEqual(current['next_review'][:10],'2027-09-30')
        related=(await self.client.get('/api/related',params={'entity_type':'ai_systems','entity_id':aid})).json()
        self.assertEqual(len(related['findings']),1);self.assertEqual(len(related['tasks']),1);self.assertEqual(len(related['evidence']),1)
        task=related['tasks'][0]
        await self.client.patch('/api/tasks/'+task['task_id'],json={'status':'done'})
        finding=await server.db.findings.find_one({'finding_id':raised.json()['finding_id']})
        self.assertEqual(finding['status'],'remediated')
        self.assertEqual((await self.client.patch(base,json={'status':'retired'})).status_code,200)
        kept=await server.db.reviews.find_one({'review_id':rid})
        self.assertEqual(kept['recurrence'],'none');self.assertEqual(kept['status'],'cancelled');self.assertEqual(len(kept['occurrences']),1)
        self.assertEqual(await server.db.findings.count_documents({}),1)
        self.assertEqual((await self.client.post(base+'/reviews',json=schedule)).status_code,409)

    async def test_health_screening_and_material_change_are_not_findings(self):
        row=await self.create(owner_id=None,provider='AI Provider',purposes=['HR / Employment'],data_types=['Employee Data'],screening={})
        self.assertEqual(row['risk_tier'],'high')
        self.assertTrue({'owner','schedule','risk','screening','oversight','vendor','sensitive'}.issubset({a['key'] for a in row['alerts']}))
        base='/api/ai_systems/'+row['ai_system_id']
        changed=await self.client.post(base+'/material-change',json={'note':'Customer-facing recommendations introduced'})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertIn('change',[a['key'] for a in changed.json()['alerts']])
        self.assertEqual(await server.db.findings.count_documents({}),0)
        updated=await self.client.patch(base,json={'owner_id':'member','oversight_notes':'Documented human approval before employment decisions'})
        self.assertNotIn('owner',[a['key'] for a in updated.json()['alerts']]);self.assertNotIn('oversight',[a['key'] for a in updated.json()['alerts']])
        risk=(await self.client.post('/api/risks',json={'client_id':'a','title':'Employment bias','likelihood_score':3,'impact_score':4})).json()
        linked=await self.client.post(base+'/links',json={'kind':'risks','id':risk['risk_id']})
        self.assertEqual(linked.status_code,200,linked.text)
        current=(await self.client.get('/api/ai_systems?client_id=a')).json()[0]
        self.assertNotIn('risk',[a['key'] for a in current['alerts']])
        reverse=(await self.client.get('/api/related',params={'entity_type':'risks','entity_id':risk['risk_id']})).json()
        self.assertEqual(reverse['ai_systems'][0]['ai_system_id'],row['ai_system_id'])

    async def test_required_mapping_requires_support_and_no_auto_seed(self):
        row=await self.create();aid=row['ai_system_id']
        req=(await self.client.post('/api/requirements',json={'client_id':'a','title':'Internal AI procedure'})).json()
        response=await self.client.post('/api/ai_systems/'+aid+'/links',json={'kind':'requirements','id':req['requirement_id'],'classification':'Explicit requirement'})
        self.assertEqual(response.status_code,422)
        response=await self.client.post('/api/ai-intake',json={'client_id':'a','usage':'yes','indicators':['HR / Employment']})
        self.assertEqual(response.status_code,200)
        self.assertEqual(await server.db.ai_systems.count_documents({}),1)
        self.assertEqual(await server.db.reviews.count_documents({}),0)

    async def test_retirement_preserves_started_closure_and_ids(self):
        row=await self.create();base='/api/ai_systems/'+row['ai_system_id']
        review=(await self.client.post(base+'/reviews',json={'due_date':'2026-09-30','recurrence':'annual'})).json()
        url='/api/reviews/'+review['review_id'];occ={'occurrence_id':review['current_occurrence_id']}
        self.assertEqual((await self.client.post(url+'/start',json=occ)).status_code,200)
        self.assertEqual((await self.client.patch(base,json={'status':'retired'})).status_code,200)
        self.assertEqual((await self.client.patch(url,json={'recurrence':'annual'})).status_code,409)
        response=await self.client.post(url+'/complete',json=occ)
        self.assertEqual(response.status_code,200,response.text)
        kept=await server.db.reviews.find_one({'review_id':review['review_id']})
        self.assertEqual(kept['status'],'completed');self.assertEqual(kept['recurrence'],'none')
        self.assertEqual(len(kept['occurrences']),1)
        self.assertEqual((await self.create())['display_id'],'AI-002')

    async def test_foreign_ai_evidence_and_links_rejected(self):
        own=await self.create();foreign=await self.create(client_id='b',owner_id=None)
        await server.db.risks.insert_one({'risk_id':'foreign-risk','client_id':'b','title':'Private'})
        self.sign_in('member')
        response=await self.client.post('/api/evidence',json={'client_id':'a','linked_type':'ai_system','linked_id':foreign['ai_system_id'],'filename':'assessment.txt','content_base64':'eA=='})
        self.assertIn(response.status_code,(403,422))
        response=await self.client.post('/api/ai_systems/'+own['ai_system_id']+'/links',json={'kind':'risks','id':'foreign-risk'})
        self.assertEqual(response.status_code,403)
        self.assertEqual((await self.client.get('/api/related',params={'entity_type':'ai_systems','entity_id':foreign['ai_system_id']})).status_code,403)
