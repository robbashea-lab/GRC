"""Ticket integrity through real routes; isolated fixtures, no external target."""
import unittest
from unittest.mock import patch
import test_framework_governance as framework

server = framework.server


class TicketIntegrityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = framework.FrameworkTests.asyncSetUp
    sign_in = framework.FrameworkTests.sign_in
    body = framework.FrameworkTests.body
    configure = framework.FrameworkTests.configure

    async def test_requestless_decisions_recover_original_generation(self):
        for action, versioned in [('validate',True),('validate',False),('accept',True)]:
            with self.subTest(action=action,versioned=versioned):
                _,_,_,f,t=await self.pair(request_id='legacy-'+action+str(versioned))
                if action=='validate':
                    await self.client.patch('/api/tasks/'+t['task_id'],json={'status':'done'})
                current=await server.db.findings.find_one({'finding_id':f['finding_id']})
                body={'rationale':'Legacy same decision'}
                if versioned:body['expected_updated_at']=current['updated_at']
                path='/api/findings/'+f['finding_id']+'/'+action
                original=server.audit
                async def fail(user,event,*args,**kwargs):
                    if event==action:raise RuntimeError('Injected legacy decision audit failure')
                    return await original(user,event,*args,**kwargs)
                with patch.object(server,'audit',fail):
                    first=await self.client.post(path,json=body)
                self.assertEqual(first.status_code,503,first.text)
                recovered=await self.client.post(path,json=body)
                self.assertEqual(recovered.status_code,200,recovered.text)
                self.assertEqual(len(recovered.json()['decision_history']),1)
                self.assertEqual((await self.client.post(path,json=body)).json(),recovered.json())
                reopened=await self.client.post('/api/findings/'+f['finding_id']+'/reopen',json={'request_id':'legacy-reopen-cycle','expected_updated_at':recovered.json()['updated_at']})
                self.assertEqual(reopened.status_code,200,reopened.text)
                await self.client.patch('/api/tasks/'+reopened.json()['primary_task_id'],json={'status':'done'})
                if versioned:
                    current=await server.db.findings.find_one({'finding_id':f['finding_id']})
                    body['expected_updated_at']=current['updated_at']
                second=await self.client.post(path,json=body)
                self.assertEqual(second.status_code,200,second.text)
                self.assertEqual(len(second.json()['decision_history']),3)

    async def test_definitive_prewrite_conflict_releases_intent_but_applied_retry_does_not(self):
        _,_,_,f,t=await self.pair()
        path='/api/tasks/'+t['task_id']
        stale=await self.client.patch(path,json={'title':'Stale','expected_updated_at':'obsolete'},headers={'Idempotency-Key':'stale-task-intent-001'})
        self.assertEqual(stale.status_code,409,stale.text)
        self.assertEqual(stale.headers.get('x-create-rejected'),'true')
        self.assertEqual((await server.db.tasks.find_one({'task_id':t['task_id']}))['title'],t['title'])
        await self.client.patch(path,json={'status':'done'})
        stale_decision=await self.client.post('/api/findings/'+f['finding_id']+'/validate',json={'request_id':'stale-decision-intent','rationale':'Checked','expected_updated_at':'obsolete'})
        self.assertEqual(stale_decision.status_code,409,stale_decision.text)
        self.assertEqual(stale_decision.headers.get('x-create-rejected'),'true')

    async def test_applied_reassignment_recovers_when_target_becomes_ineligible(self):
        await server.db.users.insert_one({'user_id':'manager','role':'client_grc_manager','status':'active','client_ids':['a']})
        for actor in ('admin','manager'):
            for change in ({'status':'disabled'},{'client_ids':['b']}):
                with self.subTest(actor=actor,change=change):
                    await server.db.users.update_one({'user_id':'member'},{'$set':{'status':'active','client_ids':['a']}})
                    self.sign_in('admin')
                    created=await self.client.post('/api/tasks',json={'client_id':'a','title':'Reassignment recovery'})
                    self.assertEqual(created.status_code,200,created.text)
                    t=created.json();path='/api/tasks/'+t['task_id']
                    self.sign_in(actor)
                    body={'assignee_id':'member','expected_updated_at':t['updated_at']}
                    headers={'Idempotency-Key':'assignment-recovery-intent-001'}
                    original=server.audit
                    async def fail(user,event,*args,**kwargs):
                        if event=='Assignment changed':raise RuntimeError('Injected assignment audit failure')
                        return await original(user,event,*args,**kwargs)
                    with patch.object(server,'audit',fail):
                        first=await self.client.patch(path,json=body,headers=headers)
                    self.assertEqual(first.status_code,503,first.text)
                    applied=await server.db.tasks.find_one({'task_id':t['task_id']})
                    await server.db.users.update_one({'user_id':'member'},{'$set':change})
                    recovered=await self.client.patch(path,json=body,headers=headers)
                    self.assertEqual(recovered.status_code,200,recovered.text)
                    self.assertEqual(recovered.json()['assignee_id'],'member')
                    self.assertEqual(recovered.json()['updated_at'],applied['updated_at'])
                    self.assertEqual((await self.client.patch(path,json={**body,'title':'Contradiction'},headers=headers)).status_code,409)
                    self.assertEqual(await server.db.audit_logs.count_documents({'entity_id':t['task_id'],'action':'Assignment changed'}),1)
                    # A different Task/new intent still rejects the ineligible target.
                    self.sign_in('admin')
                    fresh=await self.client.post('/api/tasks',json={'client_id':'a','title':'New work'})
                    self.sign_in(actor)
                    denied=await self.client.patch('/api/tasks/'+fresh.json()['task_id'],json={'assignee_id':'member','expected_updated_at':fresh.json()['updated_at']},headers={'Idempotency-Key':'new-assignment-intent-001'})
                    self.assertIn(denied.status_code,(403,422),denied.text)

    async def test_reopening_with_departed_owner_preserves_history_and_starts_unassigned(self):
        _,_,_,f,t=await self.pair()
        await server.db.tasks.update_one({'task_id':t['task_id']},{'$set':{'assignee_id':'member'}})
        await self.client.patch('/api/tasks/'+t['task_id'],json={'status':'done','resolution':'Original correction'})
        closed=await self.client.post('/api/findings/'+f['finding_id']+'/validate',json={'rationale':'Original checked sample'})
        prior=await server.db.tasks.find_one({'task_id':t['task_id']})
        await server.db.users.update_one({'user_id':'member'},{'$set':{'status':'disabled'}})
        reopened=await self.client.post('/api/findings/'+f['finding_id']+'/reopen',json={'request_id':'reopen-departed-owner','expected_updated_at':closed.json()['updated_at']})
        self.assertEqual(reopened.status_code,200,reopened.text)
        new=await server.db.tasks.find_one({'task_id':reopened.json()['primary_task_id']})
        self.assertIsNone(new['assignee_id'])
        self.assertEqual(await server.db.tasks.find_one({'task_id':t['task_id']}),prior)
        self.assertEqual(len(reopened.json()['decision_history']),2)

    async def test_contributor_unassignment_retry_keeps_original_authority_only(self):
        _,_,_,_,t = await self.pair()
        await server.db.tasks.update_one({'task_id':t['task_id']}, {'$set':{'assignee_id':'member','created_by':'admin'}})
        self.sign_in('member')
        path = '/api/tasks/' + t['task_id']
        body = {'assignee_id':None,'expected_updated_at':t['updated_at']}
        headers = {'Idempotency-Key':'unassign-ticket-intent-001'}
        original = server.audit
        async def fail(user,event,*args,**kwargs):
            if event == 'Assignment changed': raise RuntimeError('Injected audit failure')
            return await original(user,event,*args,**kwargs)
        with patch.object(server,'audit',fail):
            first = await self.client.patch(path,json=body,headers=headers)
        self.assertEqual(first.status_code,503,first.text)
        self.assertIsNone((await server.db.tasks.find_one({'task_id':t['task_id']}))['assignee_id'])
        self.assertEqual((await self.client.patch(path,json={**body,'title':'Different'},headers=headers)).status_code,409)
        self.assertEqual((await self.client.patch(path,json=body,headers={'Idempotency-Key':'new-unassigned-intent-001'})).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'client_ids':['b']}})
        self.assertEqual((await self.client.patch(path,json=body,headers=headers)).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'client_ids':['a']}})
        recovered = await self.client.patch(path,json=body,headers=headers)
        self.assertEqual(recovered.status_code,200,recovered.text)
        self.assertEqual((await self.client.patch(path,json=body,headers=headers)).json(),recovered.json())
        self.assertEqual(await server.db.audit_logs.count_documents({'action':'Assignment changed','entity_id':t['task_id']}),1)

    async def test_acceptance_recovers_audit_and_retains_unfinished_work(self):
        _,_,_,f,t=await self.pair()
        self.client.event_hooks['request'] = []
        path='/api/findings/'+f['finding_id']+'/accept'
        missing=await self.client.post(path,json={'request_id':'missing-version','rationale':'Must retain version guard'})
        self.assertEqual(missing.status_code,428,missing.text)
        body={'request_id':'accept-once','rationale':'Recorded management decision','expected_updated_at':f['updated_at']}
        original=server.audit
        async def fail(user,event,*args,**kwargs):
            if event=='accept':raise RuntimeError('Injected audit failure')
            return await original(user,event,*args,**kwargs)
        with patch.object(server,'audit',fail):
            self.assertEqual((await self.client.post(path,json=body)).status_code,503)
        accepted=await self.client.post(path,json=body)
        self.assertEqual(accepted.status_code,200,accepted.text)
        self.assertEqual(accepted.json()['status'],'accepted')
        self.assertEqual(len(accepted.json()['decision_history']),1)
        self.assertEqual((await server.db.tasks.find_one({'task_id':t['task_id']}))['status'],'open')
        self.assertEqual((await self.client.post(path,json=body)).json(),accepted.json())

    async def test_cross_tenant_ticket_commands_and_reads_are_denied(self):
        _,_,_,f,t=await self.pair()
        await server.db.users.update_one({'user_id':'member'},{'$set':{'client_ids':['b']}})
        self.sign_in('member')
        for kind,ident in [('findings',f['finding_id']),('tasks',t['task_id'])]:
            self.assertIn((await self.client.get('/api/'+kind+'/'+ident)).status_code,(403,404))
        self.assertIn((await self.client.patch('/api/tasks/'+t['task_id'],json={'status':'done'})).status_code,(403,404))
        for action in ['validate','accept','reopen']:
            response=await self.client.post('/api/findings/'+f['finding_id']+'/'+action,json={'request_id':'foreign','rationale':'Must not save','expected_updated_at':f['updated_at']})
            self.assertIn(response.status_code,(403,404),response.text)
        self.assertEqual((await server.db.tasks.find_one({'task_id':t['task_id']}))['status'],'open')

    async def test_comments_protect_an_unlinked_legacy_finding(self):
        await server.db.findings.insert_one({'finding_id':'legacy','client_id':'a','title':'Retained','status':'open','updated_at':'2026-01-01T00:00:00Z'})
        await server.db.comments.insert_one({'comment_id':'comment','client_id':'a','entity_type':'findings','entity_id':'legacy','body':'Retained investigation'})
        self.sign_in('admin')
        response=await self.client.request('DELETE','/api/findings/legacy',json={'expected_updated_at':'2026-01-01T00:00:00Z'})
        self.assertEqual(response.status_code,409,response.text)

    async def pair(self, request_id='ticket-test'):
        workspace = await self.configure()
        aid = workspace['assessments'][0]['framework_assessment_id']
        path = '/api/framework_assessments/' + aid + '/findings'
        body = {'request_id':request_id, 'title':'Issue', 'description':'Actual issue',
                'remediation_title':'Correct the issue', 'owner_id':None, 'due_date':'2027-01-01'}
        response = await self.client.post(path, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        finding = response.json()
        task = await server.db.tasks.find_one({'finding_id':finding['finding_id']})
        return aid, path, body, finding, task

    async def test_framework_retry_rejects_contradictory_payload(self):
        _, path, body, finding, _ = await self.pair()
        replay = await self.client.post(path, json=body)
        self.assertEqual(replay.json(), finding)
        conflict = await self.client.post(path, json={**body, 'remediation_title':'Different work'})
        self.assertEqual(conflict.status_code, 409, conflict.text)

    async def test_framework_creation_recovers_missing_source_audit(self):
        workspace = await self.configure()
        aid = workspace['assessments'][0]['framework_assessment_id']
        path = '/api/framework_assessments/' + aid + '/findings'
        body = {'request_id':'source-audit', 'title':'Issue', 'remediation_title':'Correct it'}
        original = server.audit
        async def fail(user, action, *args, **kwargs):
            if action == 'Finding raised': raise RuntimeError('Injected audit outage')
            return await original(user, action, *args, **kwargs)
        with patch.object(server, 'audit', fail):
            first = await self.client.post(path, json=body)
        self.assertEqual(first.status_code, 503, first.text)
        result = await self.client.post(path, json=body)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(await server.db.findings.count_documents({'framework_assessment_id':aid}), 1)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id':result.json()['finding_id']}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_id':aid,'action':'Finding raised'}), 1)

    async def test_validation_retry_repairs_audit_without_duplicate_decision(self):
        _, _, _, f, t = await self.pair()
        await self.client.patch('/api/tasks/'+t['task_id'], json={'status':'done'})
        f = await server.db.findings.find_one({'finding_id':f['finding_id']})
        path = '/api/findings/'+f['finding_id']+'/validate'
        body = {'request_id':'validation-one', 'rationale':'Checked the correction', 'expected_updated_at':f['updated_at']}
        original = server.audit
        async def fail(user, action, *args, **kwargs):
            if action == 'validate': raise RuntimeError('Injected validation audit outage')
            return await original(user, action, *args, **kwargs)
        with patch.object(server, 'audit', fail):
            response = await self.client.post(path, json=body)
        self.assertEqual(response.status_code, 503, response.text)
        recovered = await self.client.post(path, json=body)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual(recovered.json()['status'], 'closed')
        self.assertEqual(len(recovered.json()['decision_history']), 1)
        self.assertEqual((await self.client.post(path,json=body)).json(), recovered.json())
        self.assertEqual((await self.client.post(path,json={**body,'rationale':'Changed'})).status_code,409)
        self.assertEqual(await server.db.audit_logs.count_documents({'action':'validate','entity_id':f['finding_id']}),1)

    async def test_linked_finding_cannot_be_deleted(self):
        _, _, _, f, t = await self.pair()
        response = await self.client.request('DELETE','/api/findings/'+f['finding_id'],json={'expected_updated_at':f['updated_at']})
        self.assertEqual(response.status_code,409,response.text)
        self.assertIsNotNone(await server.db.findings.find_one({'finding_id':f['finding_id']}))
        self.assertIsNotNone(await server.db.tasks.find_one({'task_id':t['task_id']}))

    async def test_validation_checks_stale_version_and_tenant(self):
        _, _, _, f, t = await self.pair()
        await self.client.patch('/api/tasks/'+t['task_id'],json={'status':'done'})
        path='/api/findings/'+f['finding_id']+'/validate'
        body={'request_id':'stale-validation','rationale':'Checked','expected_updated_at':f['updated_at']}
        self.assertEqual((await self.client.post(path,json=body)).status_code,409)
        self.sign_in('member')
        self.assertEqual((await self.client.post(path,json=body)).status_code,403)

    async def test_completion_retry_preserves_resolution_and_repairs_audit(self):
        _,_,_,f,t=await self.pair()
        path='/api/tasks/'+t['task_id']
        body={'status':'done','description':'Planned correction','resolution':'Actual correction',
              'expected_updated_at':t['updated_at']}
        headers={'Idempotency-Key':'ticket-complete-intent-001'}
        original=server.audit
        async def fail(user,event,*args,**kwargs):
            if event=='Action Item completed':raise RuntimeError('Injected audit failure')
            return await original(user,event,*args,**kwargs)
        with patch.object(server,'audit',fail):
            self.assertEqual((await self.client.patch(path,json=body,headers=headers)).status_code,503)
        current=await server.db.tasks.find_one({'task_id':t['task_id']})
        self.assertEqual(current['resolution'],'Actual correction')
        self.assertEqual((await self.client.patch(path,json={'title':'Concurrent edit','expected_updated_at':current['updated_at']})).status_code,409)
        recovered=await self.client.patch(path,json=body,headers=headers)
        self.assertEqual(recovered.status_code,200,recovered.text)
        self.assertEqual(recovered.json()['completed_at'],current['completed_at'])
        self.assertEqual(recovered.json()['description'],'Planned correction')
        self.assertEqual((await self.client.patch(path,json=body,headers=headers)).json(),recovered.json())
        self.assertEqual((await self.client.patch(path,json={**body,'resolution':'Different'},headers=headers)).status_code,409)
        self.assertEqual(await server.db.audit_logs.count_documents({'action':'Action Item completed','entity_id':t['task_id']}),1)

    async def test_reopen_preserves_completed_action_and_recovers_once(self):
        _,_,_,f,t=await self.pair()
        await self.client.patch('/api/tasks/'+t['task_id'],json={'status':'done','resolution':'Original correction'})
        closed=await self.client.post('/api/findings/'+f['finding_id']+'/validate',json={'rationale':'Original validation'})
        self.assertEqual(closed.status_code,200,closed.text)
        prior=await server.db.tasks.find_one({'task_id':t['task_id']})
        body={'request_id':'reopen-one','expected_updated_at':closed.json()['updated_at']}
        path='/api/findings/'+f['finding_id']+'/reopen'
        original=server.audit
        async def fail(user,event,*args,**kwargs):
            if event=='Remediation reopened':raise RuntimeError('Injected audit failure')
            return await original(user,event,*args,**kwargs)
        with patch.object(server,'audit',fail):
            self.assertEqual((await self.client.post(path,json=body)).status_code,503)
        pending=await server.db.tasks.find_one({'finding_id':f['finding_id'],'task_id':{'$ne':t['task_id']}})
        self.assertEqual((await self.client.request('DELETE','/api/tasks/'+pending['task_id'],json={'expected_updated_at':pending['updated_at']})).status_code,409)
        response=await self.client.post(path,json=body)
        self.assertEqual(response.status_code,200,response.text)
        reopened=response.json()
        self.assertEqual(reopened['finding_id'],f['finding_id'])
        self.assertEqual(reopened['status'],'in_remediation')
        self.assertNotEqual(reopened['primary_task_id'],t['task_id'])
        self.assertEqual(await server.db.tasks.find_one({'task_id':t['task_id']}),prior)
        self.assertEqual(len(reopened['decision_history']),2)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id':f['finding_id']}),2)
        self.assertEqual((await self.client.post(path,json=body)).json(),reopened)
        self.sign_in('member')
        self.assertEqual((await self.client.post(path,json=body)).status_code,403)
