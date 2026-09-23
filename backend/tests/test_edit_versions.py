"""Real API preconditions with no fresh-token fixture assistance."""
import asyncio
import unittest
from unittest.mock import patch
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server


class EditVersionTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=Harness.asyncSetUp
    sign_in=Harness.sign_in

    async def test_client_stale_form_and_missing_version_rejected(self):
        self.sign_in('admin');self.client.event_hooks['request']=[]
        path='/api/clients/a'
        missing=await self.client.patch(path,json={'name':'Unversioned'})
        self.assertEqual(missing.status_code,428,missing.text)
        first=await self.client.patch(path,json={'name':'New name','expected_updated_at':None})
        self.assertEqual(first.status_code,200,first.text)
        stale=await self.client.patch(path,json={'name':'Stale name','expected_updated_at':None})
        self.assertEqual(stale.status_code,409,stale.text)
        row=await server.db.clients.find_one({'client_id':'a'})
        self.assertEqual(row['name'],'New name')
        self.assertNotIn('expected_updated_at',row)

    async def test_disjoint_edits_require_conscious_reload(self):
        self.sign_in('admin');self.client.event_hooks['request']=[]
        await server.db.tasks.insert_one({'task_id':'t','client_id':'a','title':'Action','status':'open','assignee_id':None,'due_date':'2026-10-01'})
        path='/api/tasks/t'
        first=await self.client.patch(path,json={'assignee_id':'member','expected_updated_at':None})
        self.assertEqual(first.status_code,200,first.text)
        stale=await self.client.patch(path,json={'due_date':'2026-11-01','expected_updated_at':None})
        self.assertEqual(stale.status_code,409,stale.text)
        saved=(await self.client.get(path)).json()
        self.assertEqual(saved['assignee_id'],'member');self.assertEqual(saved['due_date'],'2026-10-01')
        reapplied=await self.client.patch(path,json={'due_date':'2026-11-01','expected_updated_at':saved['updated_at']})
        self.assertEqual(reapplied.status_code,200,reapplied.text)
        self.assertEqual(reapplied.json()['assignee_id'],'member')

    async def test_same_snapshot_concurrent_edits_have_one_winner(self):
        self.sign_in('admin');self.client.event_hooks['request']=[]
        with patch.object(server,'_now',lambda:'2026-09-23T00:00:00+00:00'):
            responses=await asyncio.gather(*(self.client.patch('/api/clients/a',json={'name':str(i),'expected_updated_at':None}) for i in range(10)))
        self.assertEqual(sum(r.status_code==200 for r in responses),1)
        self.assertEqual(sum(r.status_code==409 for r in responses),9)

    async def test_auth_checks_precede_preconditions(self):
        self.sign_in('member');self.client.event_hooks['request']=[]
        await server.db.findings.insert_one({'finding_id':'foreign','client_id':'b','title':'Private','status':'open'})
        self.assertEqual((await self.client.patch('/api/findings/foreign',json={'title':'No'})).status_code,403)
        self.assertEqual((await self.client.patch('/api/clients/b',json={'name':'No'})).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        await server.db.findings.insert_one({'finding_id':'local','client_id':'a','title':'Read only','status':'open'})
        self.assertEqual((await self.client.patch('/api/findings/local',json={'title':'No'})).status_code,403)

    async def test_generic_legacy_callers_cannot_omit_version(self):
        self.sign_in('admin');self.client.event_hooks['request']=[]
        for kind,(_,_,key,_) in server.ENTITY_MAP.items():
            with self.subTest(kind=kind):
                await server.db[kind].insert_one({key:'record','client_id':'a','title':'Original','name':'Original','status':'open'})
                result=await self.client.patch('/api/'+kind+'/record',json={'title':'Unversioned'})
                self.assertEqual(result.status_code,428,result.text)
                self.assertEqual((await server.db[kind].find_one({key:'record'}))['title'],'Original')

    async def test_bulk_stale_selection_preserves_all_records(self):
        self.sign_in('admin');self.client.event_hooks['request']=[]
        await server.db.tasks.insert_many([{'task_id':key,'client_id':'a','title':key,'status':'open','updated_at':'new' if key=='b' else None} for key in ['a','b']])
        body={'kind':'tasks','ids':['a','b'],'action':'set-due-date','payload':{'due_date':'2026-12-01'},'expected_versions':{'a':None,'b':None}}
        response=await self.client.post('/api/bulk',json=body)
        self.assertEqual(response.status_code,409,response.text)
        self.assertTrue(all('due_date' not in row for row in await server.db.tasks.find({}).to_list(None)))

    async def test_ai_inventory_version_is_returned_and_stale_edit_denied(self):
        self.sign_in('admin')
        created=await self.client.post('/api/ai_systems',json={'client_id':'a','name':'Original'})
        self.assertEqual(created.status_code,200,created.text)
        row=created.json();path='/api/ai_systems/'+row['ai_system_id'];self.client.event_hooks['request']=[]
        first=await self.client.patch(path,json={'name':'Newer','expected_updated_at':row['updated_at']})
        self.assertEqual(first.status_code,200,first.text)
        self.assertNotEqual(first.json()['updated_at'],row['updated_at'])
        stale=await self.client.patch(path,json={'name':'Stale','expected_updated_at':row['updated_at']})
        self.assertEqual(stale.status_code,409,stale.text)
        self.assertEqual((await server.db.ai_systems.find_one({'ai_system_id':row['ai_system_id']}))['name'],'Newer')

    async def test_configuration_tokens_and_concurrent_applicability(self):
        from test_framework_governance import FrameworkTests
        self.sign_in('admin')
        body=FrameworkTests.body(self,programs=('soc-2','cis-ig1'))
        created=await self.client.post('/api/onboarding/baseline',json=body)
        self.assertEqual(created.status_code,200,created.text)
        self.client.event_hooks['request']=[]
        body['expected_updated_at']=None
        stale=await self.client.post('/api/onboarding/baseline',json=body)
        self.assertEqual(stale.status_code,409,stale.text)
        requirement=await server.db.requirements.find_one({'client_id':'a','baseline_key':'cis-ig1'})
        reviews=await server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        change={'client_id':'a','applicability':'does_not_apply','expected_updated_at':requirement['updated_at']}
        responses=await asyncio.gather(*(self.client.patch('/api/onboarding/programs/cis-ig1',json=change) for _ in range(10)))
        self.assertEqual(sum(r.status_code==200 for r in responses),1,[r.text for r in responses])
        self.assertTrue(all(r.status_code in (200,409) for r in responses))
        after=await server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        for before in reviews:
            row=next(r for r in after if r['review_id']==before['review_id'])
            for field in ('status','due_date','recurrence','occurrences'):
                self.assertEqual(row.get(field),before.get(field))
        config={'client_id':'a','categories':['security','privacy'],'expected_updated_at':None}
        first=await self.client.patch('/api/frameworks/soc-2/configuration',json=config)
        self.assertEqual(first.status_code,200,first.text)
        self.assertEqual((await self.client.patch('/api/frameworks/soc-2/configuration',json=config)).status_code,409)
        self.assertNotIn('_configuration_lock',await server.db.clients.find_one({'client_id':'a'}))

    async def test_risk_closure_cannot_be_overwritten_by_stale_acceptance(self):
        self.sign_in('admin')
        response=await self.client.post('/api/risks',json={'client_id':'a','title':'Risk','likelihood_score':4,'impact_score':4})
        self.assertEqual(response.status_code,200,response.text)
        row=response.json();path='/api/risks/'+row['risk_id'];self.client.event_hooks['request']=[]
        closed=await self.client.post(path+'/close',json={'reason':'remediated','note':'Verified','expected_updated_at':row['updated_at']})
        self.assertEqual(closed.status_code,200,closed.text)
        stale=await self.client.post(path+'/accept',json={'rationale':'Old form','expiry_date':'2099-01-01','expected_updated_at':row['updated_at']})
        self.assertEqual(stale.status_code,409,stale.text)
        final=await server.db.risks.find_one({'risk_id':row['risk_id']})
        self.assertEqual(final['status'],'closed');self.assertEqual(len(final['decision_history']),1)

    async def test_intake_initial_race_and_stale_edit(self):
        self.sign_in('admin');self.client.event_hooks['request']=[]
        body={'client_id':'a','usage':'yes','indicators':[],'expected_updated_at':None}
        responses=await asyncio.gather(*(self.client.post('/api/ai-intake',json=body) for _ in range(10)))
        self.assertEqual(sum(r.status_code==200 for r in responses),1)
        self.assertEqual(sum(r.status_code==409 for r in responses),9)
        self.assertEqual(await server.db.ai_intake.count_documents({'client_id':'a'}),1)
        stale=await self.client.post('/api/ai-intake',json={**body,'usage':'no'})
        self.assertEqual(stale.status_code,409,stale.text)
        self.assertEqual((await server.db.ai_intake.find_one({'client_id':'a'}))['usage'],'yes')

    async def test_stale_delete_preserves_newer_record(self):
        self.sign_in('admin');self.client.event_hooks['request']=[]
        await server.db.tasks.insert_one({'task_id':'t','client_id':'a','title':'Newer','status':'open','updated_at':'2026-09-23T00:00:00+00:00'})
        response=await self.client.request('DELETE','/api/tasks/t',json={'expected_updated_at':None})
        self.assertEqual(response.status_code,409,response.text)
        bulk=await self.client.post('/api/bulk',json={'kind':'tasks','ids':['t'],'action':'delete','expected_versions':{'t':None}})
        self.assertEqual(bulk.status_code,409,bulk.text)
        self.assertEqual(await server.db.tasks.count_documents({'task_id':'t'}),1)

    async def test_legacy_onboarding_cannot_overwrite_newer_policy(self):
        import routes.onboarding as onboarding
        self.sign_in('admin');self.client.event_hooks['request']=[]
        await server.db.policies.insert_one({'policy_id':'p','client_id':'a','title':'Policy','presence':'verified_existing','updated_at':'2026-09-23T00:00:00+00:00'})
        response={'name':'Policy','response':'no','expected_updated_at':None}
        with patch.object(onboarding,'db',server.db):
            for path,key in [('policy-responses','responses'),('finalize','policy_responses')]:
                result=await self.client.post('/api/onboarding/'+path,json={'client_id':'a',key:[response]})
                self.assertEqual(result.status_code,409,result.text)
        self.assertEqual((await server.db.policies.find_one({'policy_id':'p'}))['presence'],'verified_existing')
        self.assertEqual(await server.db.tasks.count_documents({}),0)

    async def test_contact_link_stale_unlink_does_not_erase_new_association(self):
        self.sign_in('admin');self.client.event_hooks['request']=[]
        await server.db.contacts.insert_one({'contact_id':'contact','client_id':'a','name':'Contact'})
        path='/api/contacts/contact/account-link'
        response=await self.client.post(path,json={'user_id':'member','confirmed':True,'expected_linked_user_id':None})
        self.assertEqual(response.status_code,200,response.text)
        stale=await self.client.post(path,json={'user_id':None,'confirmed':True,'expected_linked_user_id':None})
        self.assertEqual(stale.status_code,409,stale.text)
        self.assertEqual((await server.db.contacts.find_one({'contact_id':'contact'}))['linked_user_id'],'member')

    async def test_validation_serializes_with_inflight_remediation_creation(self):
        self.sign_in('admin')
        await server.db.findings.insert_one({'finding_id':'f','client_id':'a','title':'Finding','status':'remediated'})
        entered,release=asyncio.Event(),asyncio.Event()
        original=server.action_items.prepare
        async def paused(*args,**kwargs):
            entered.set();await release.wait()
            return await original(*args,**kwargs)
        with patch.object(server.action_items,'prepare',paused):
            creation=asyncio.create_task(self.client.post('/api/tasks',json={'client_id':'a','title':'New remediation','finding_id':'f'}))
            try:
                await asyncio.wait_for(entered.wait(),5)
                validation=await self.client.post('/api/findings/f/validate',json={'rationale':'Verified'})
                self.assertEqual(validation.status_code,409,validation.text)
            finally:
                release.set()
            self.assertEqual((await creation).status_code,200)
        row=await server.db.findings.find_one({'finding_id':'f'})
        self.assertEqual(row['status'],'in_remediation');self.assertNotIn('_remediation_lock',row)
        self.assertEqual((await self.client.post('/api/findings/f/validate',json={'rationale':'Verified'})).status_code,409)

    async def test_profile_stale_snapshot_does_not_erase_newer_name(self):
        self.sign_in('admin');self.client.event_hooks['request']=[]
        first=await self.client.patch('/api/me',json={'name':'Newer','expected_updated_at':None})
        self.assertEqual(first.status_code,200,first.text)
        stale=await self.client.patch('/api/me',json={'name':'Older','expected_updated_at':None})
        self.assertEqual(stale.status_code,409,stale.text)
        self.assertEqual((await server.db.users.find_one({'user_id':'admin'}))['name'],'Newer')

    async def test_baseline_source_edit_after_load_blocks_finalization(self):
        from test_framework_governance import FrameworkTests
        self.sign_in('admin')
        body=FrameworkTests.body(self,programs=('cis-ig1',))
        self.assertEqual((await self.client.post('/api/onboarding/baseline',json=body)).status_code,200)
        snapshot=(await self.client.get('/api/onboarding/baseline?client_id=a')).json()
        policy=await server.db.policies.find_one({'client_id':'a'})
        await server.db.policies.update_one({'policy_id':policy['policy_id']},{'$set':{'onboarding_note':'Newer operator edit','updated_at':server._next_write_time(policy.get('updated_at'))}})
        self.client.event_hooks['request']=[]
        result=await self.client.post('/api/onboarding/baseline',json={**body,'expected_updated_at':snapshot['state']['updated_at'],'expected_records':snapshot['record_versions']})
        self.assertEqual(result.status_code,409,result.text)
        self.assertEqual((await server.db.policies.find_one({'policy_id':policy['policy_id']}))['onboarding_note'],'Newer operator edit')
