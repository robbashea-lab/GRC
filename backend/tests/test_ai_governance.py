import asyncio
from unittest.mock import AsyncMock, patch
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
        self.assertEqual((await self.client.patch('/api/ai_systems/'+row['ai_system_id'],json={'vendor_id':'foreign'})).status_code,403)
        self.sign_in('admin')
        self.assertEqual((await self.client.patch('/api/ai_systems/'+row['ai_system_id'],json={'vendor_id':'foreign'})).status_code,422)
        self.sign_in('member')
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

    async def test_links_reject_invalid_identifiers_before_target_lookup(self):
        row=await self.create();aid=row['ai_system_id']
        await server.db.risks.insert_one({'risk_id':'own-risk','client_id':'a','title':'Synthetic risk'})
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'platform_admin'}})
        self.sign_in('member')
        before=await server.db.ai_systems.find_one({'ai_system_id':aid})
        audit_count=await server.db.audit_logs.count_documents({})
        bodies=[{'kind':'risks','id':value} for value in (
            {'$eq':'own-risk'}, ['own-risk'], None, True, False, 1, 1.0, '', ' \t ', 'r'*161)]
        bodies.append({'kind':'risks'})
        collection_type=type(server.db.risks);read=collection_type.find_one;lookup=AsyncMock()
        async def observe_target(collection,*args,**kwargs):
            if collection.name=='risks': await lookup(*args,**kwargs)
            return await read(collection,*args,**kwargs)
        for body in bodies:
            with self.subTest(body=body), patch.object(collection_type,'find_one',new=observe_target):
                response=await self.client.post('/api/ai_systems/'+aid+'/links',json=body)
                self.assertEqual(response.status_code,422,response.text)
                lookup.assert_not_awaited()
                self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id':aid}),before)
                self.assertEqual(await server.db.audit_logs.count_documents({}),audit_count)
                self.assertEqual((await self.client.get('/api/ai_systems?client_id=a')).status_code,200)
        with patch.object(collection_type,'find_one',new=observe_target):
            response=await self.client.post('/api/ai_systems/'+aid+'/links',json={'kind':'risks','id':'own-risk'})
        self.assertEqual(response.status_code,200,response.text)
        lookup.assert_awaited_once_with({'risk_id':'own-risk'},{'_id':0})

    async def test_links_reject_unpermitted_fields_and_invalid_metadata_before_lookup(self):
        row=await self.create();aid=row['ai_system_id']
        await server.db.risks.insert_one({'risk_id':'own-risk','client_id':'a','title':'Synthetic risk'})
        before=await server.db.ai_systems.find_one({'ai_system_id':aid})
        audit_count=await server.db.audit_logs.count_documents({})
        patches=[{'client_id':'b'}, {'kind':['risks']}, {'kind':'evidence'},
            {'classification':'Not a classification'}, {'classification':True},
            {'source':{}}, {'rationale':[]}, {'source':None}, {'rationale':2},
            {'classification':'Explicit requirement','source':'  ','rationale':'Applies'},
            {'classification':'Required activity — cadence not prescribed','source':'Source','rationale':'\n'}]
        collection_type=type(server.db.risks);read=collection_type.find_one;lookup=AsyncMock()
        async def observe_target(collection,*args,**kwargs):
            if collection.name=='risks': await lookup(*args,**kwargs)
            return await read(collection,*args,**kwargs)
        for changes in patches:
            with self.subTest(changes=changes), patch.object(collection_type,'find_one',new=observe_target):
                response=await self.client.post('/api/ai_systems/'+aid+'/links',
                    json={'kind':'risks','id':'own-risk',**changes})
                self.assertEqual(response.status_code,422,response.text)
                lookup.assert_not_awaited()
                self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id':aid}),before)
                self.assertEqual(await server.db.audit_logs.count_documents({}),audit_count)

    async def test_links_preserve_supported_kinds_exact_values_and_duplicate_behavior(self):
        row=await self.create();aid=row['ai_system_id']
        for kind in ('risks','findings','tasks','policies','requirements','vendors'):
            identity='r'*160 if kind=='risks' else 'legacy '+kind+'.001'
            await server.db[kind].insert_one({server.ID_FIELD_MAP[kind]:identity,'client_id':'a','title':'Synthetic target'})
            body={'kind':kind,'id':identity}
            if kind=='requirements':
                body.update(classification='Explicit requirement',source='Synthetic authoritative source\nSection 1',
                    rationale='Applies to this synthetic use case\nReviewed by test actor')
            responses=await asyncio.gather(*[self.client.post('/api/ai_systems/'+aid+'/links',json=body) for _ in range(2)])
            self.assertTrue(all(response.status_code==200 for response in responses),[r.text for r in responses])
            stored=await server.db.ai_systems.find_one({'ai_system_id':aid})
            self.assertEqual([link for link in stored['related_links'] if link['kind']==kind],
                [{'classification':'Context','source':'','rationale':'',**body}])
            events=await server.db.audit_logs.find({'action':'AI record linked','entity_id':aid}).to_list(None)
            self.assertTrue(any(event.get('user_id')=='admin' and event['client_id']=='a' for event in events))
            self.assertEqual((await self.client.get('/api/ai_systems?client_id=a')).status_code,200)

    async def test_links_preserve_parent_tenant_and_lifecycle_denials(self):
        row=await self.create();aid=row['ai_system_id'];base='/api/ai_systems/'+aid+'/links'
        await server.db.risks.insert_many([
            {'risk_id':'own-risk','client_id':'a','title':'Synthetic own risk'},
            {'risk_id':'foreign-risk','client_id':'b','title':'Synthetic foreign risk'}])
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'platform_admin'}})
        self.sign_in('member')
        before=await server.db.ai_systems.find_one({'ai_system_id':aid})
        for identity,status in [('foreign-risk',403),('missing-risk',404)]:
            response=await self.client.post(base,json={'kind':'risks','id':identity})
            self.assertEqual(response.status_code,status,response.text)
            self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id':aid}),before)
        self.sign_in('admin')
        self.assertEqual((await self.client.post(base,json={'kind':'risks','id':'foreign-risk'})).status_code,422)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.sign_in('member')
        self.assertEqual((await self.client.post(base,json={'kind':'risks','id':'own-risk'})).status_code,403)
        self.sign_in('admin')
        self.assertEqual((await self.client.post('/api/ai_systems/missing-ai/links',json={'kind':'risks','id':'own-risk'})).status_code,404)
        await server.db.ai_systems.update_one({'ai_system_id':aid},{'$set':{'status':'retired'}})
        retired=await server.db.ai_systems.find_one({'ai_system_id':aid})
        self.assertEqual((await self.client.post(base,json={'kind':'risks','id':'own-risk'})).status_code,409)
        self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id':aid}),retired)

    async def test_links_do_not_write_after_ai_retirement_or_parent_deletion(self):
        await server.db.risks.insert_one({'risk_id':'own-risk','client_id':'a','title':'Synthetic risk'})
        for remove in (False,True):
            with self.subTest(parent_deleted=remove):
                row=await self.create();aid=row['ai_system_id']
                collection_type=type(server.db.ai_systems);update=collection_type.update_one
                async def change_parent(collection,query,changes):
                    if collection.name=='ai_systems' and '$addToSet' in changes:
                        if remove:
                            await collection.delete_one({'ai_system_id':aid})
                        else:
                            await update(collection,{'ai_system_id':aid},{'$set':{'status':'retired'}})
                    return await update(collection,query,changes)
                with patch.object(collection_type,'update_one',new=change_parent):
                    response=await self.client.post('/api/ai_systems/'+aid+'/links',json={'kind':'risks','id':'own-risk'})
                self.assertEqual(response.status_code,409,response.text)
                stored=await server.db.ai_systems.find_one({'ai_system_id':aid})
                if remove: self.assertIsNone(stored)
                else:
                    self.assertEqual(stored['status'],'retired')
                    self.assertEqual(stored['related_links'],[])
                self.assertEqual(await server.db.audit_logs.count_documents({'action':'AI record linked','entity_id':aid}),0)

    async def test_legacy_malformed_links_remain_stored_but_reader_projection_is_safe(self):
        row=await self.create(screening={'consequential':True});aid=row['ai_system_id']
        valid={'kind':'risks','id':'valid-risk','classification':'Context','source':'','rationale':''}
        legacy=[{'kind':'risks','id':{'$eq':'valid-risk'},'classification':'Context','source':'','rationale':''},
            {'kind':'requirements','id':'legacy-req','classification':'Context','source':{'unexpected':'object'},'rationale':''},
            None,{'id':'missing-kind'}]
        await server.db.risks.insert_one({'risk_id':'valid-risk','client_id':'a','title':'Synthetic risk',
            'likelihood_score':3,'impact_score':3,'status':'open'})
        await server.db.ai_systems.update_one({'ai_system_id':aid},{'$set':{'related_links':[valid,*legacy]}})
        before=await server.db.ai_systems.find_one({'ai_system_id':aid})
        audit_count=await server.db.audit_logs.count_documents({})
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.sign_in('member')
        current=(await self.client.get('/api/ai_systems?client_id=a')).json()[0]
        self.assertEqual(current['related_links'],[valid])
        self.assertTrue(current['relationship_integrity_warning'])
        self.assertNotIn('risk',[alert['key'] for alert in current['alerts']])
        self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id':aid}),before)
        self.assertEqual(await server.db.audit_logs.count_documents({}),audit_count)
        self.assertEqual((await self.client.get('/api/ai_systems?client_id=b')).status_code,403)
        for links in (legacy,{'kind':'risks','id':'valid-risk'},None):
            await server.db.ai_systems.update_one({'ai_system_id':aid},{'$set':{'related_links':links}})
            stored=await server.db.ai_systems.find_one({'ai_system_id':aid})
            current=(await self.client.get('/api/ai_systems?client_id=a')).json()[0]
            self.assertEqual(current['related_links'],[])
            self.assertTrue(current['relationship_integrity_warning'])
            self.assertIn('risk',[alert['key'] for alert in current['alerts']])
            self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id':aid}),stored)

    async def test_legacy_valid_links_keep_exact_values_without_an_integrity_warning(self):
        row=await self.create();aid=row['ai_system_id']
        valid={'kind':'requirements','id':'legacy-readable'}
        await server.db.ai_systems.update_one({'ai_system_id':aid},{'$set':{'related_links':[valid],'status':'retired'}})
        before=await server.db.ai_systems.find_one({'ai_system_id':aid})
        current=(await self.client.get('/api/ai_systems?client_id=a')).json()[0]
        self.assertEqual(current['related_links'],[valid])
        self.assertFalse(current['relationship_integrity_warning'])
        self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id':aid}),before)
