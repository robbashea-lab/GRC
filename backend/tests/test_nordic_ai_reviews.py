"""Nordic explicit AI Review scheduling through tenant-authorized native routes.

Uses the established isolated ASGI/Mongo fixture; no hosted accounts or services.
"""
import asyncio
import unittest
import uuid
from unittest.mock import patch

import test_client_dashboard_sources as fixture
import test_ai_onboarding as onboarding_fixture

server = fixture.server


class NordicAIReviewTests(unittest.IsolatedAsyncioTestCase):
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await fixture.ClientDashboardSourcesTests.asyncSetUp(self)
        self.client.event_hooks['request'] = []
        self.sign_in('admin')

    async def create_ai(self, **changes):
        response = await self.client.post('/api/ai_systems', json={
            'client_id': 'a', 'name': 'Synthetic Nordic AI ' + uuid.uuid4().hex,
            'status': 'draft', 'owner_id': 'member', **changes,
        }, headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def schedule(self, row, **changes):
        return {'due_date': '2028-02-29', 'recurrence': 'quarterly',
                'owner_id': 'admin', 'expected_updated_at': row['updated_at'], **changes}

    async def test_new_draft_explicit_owner_one_canonical_review_and_readbacks(self):
        row = await self.create_ai()
        path = '/api/ai_systems/' + row['ai_system_id'] + '/reviews'
        body = self.schedule(row)
        response = await self.client.post(path, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        review = response.json()
        self.assertEqual(review['owner_id'], 'admin')
        self.assertNotEqual(review['owner_id'], row['owner_id'])
        self.assertEqual((review['client_id'], review['ai_system_id']), ('a', row['ai_system_id']))
        self.assertTrue(review['current_occurrence_id'])
        repeated = await self.client.post(path, json=body)
        self.assertEqual(repeated.status_code, 200, repeated.text)
        self.assertEqual(repeated.json()['review_id'], review['review_id'])
        self.assertEqual(await server.db.reviews.count_documents({'ai_system_id': row['ai_system_id']}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI Governance Review scheduled'}), 1)
        loaded = (await self.client.get('/api/ai_systems?client_id=a')).json()[0]
        self.assertEqual((loaded['status'], loaded['approval_status']), ('draft', 'pending_assessment'))
        self.assertNotIn('approval_history', loaded)
        self.assertEqual((loaded['next_review'][:10], loaded['review_cadence']), ('2028-02-29', 'quarterly'))
        related = await self.client.get('/api/related', params={'entity_type': 'ai_systems', 'entity_id': row['ai_system_id']})
        self.assertEqual(related.status_code, 200, related.text)
        self.assertEqual([r['review_id'] for r in related.json()['reviews']], [review['review_id']])
        stored = await server.db.reviews.find_one({'review_id': review['review_id']})
        self.assertEqual(stored['current_occurrence_id'], review['current_occurrence_id'])
        self.assertFalse(stored.get('occurrences'))

    async def test_invalid_missing_stale_and_ineligible_inputs_leave_records_unchanged(self):
        row = await self.create_ai()
        path = '/api/ai_systems/' + row['ai_system_id'] + '/reviews'
        await server.db.users.insert_many([
            {'user_id': 'foreign', 'email': 'nordic-foreign@example.test', 'role': 'client_contributor', 'status': 'active', 'client_ids': ['b']},
            {'user_id': 'disabled', 'email': 'nordic-disabled@example.test', 'role': 'client_contributor', 'status': 'inactive', 'client_ids': ['a']},
        ])
        body = self.schedule(row)
        invalid = [
            ({k: v for k, v in body.items() if k != 'expected_updated_at'}, 428),
            ({**body, 'expected_updated_at': 'stale'}, 409),
            ({k: v for k, v in body.items() if k != 'owner_id'}, 422),
            ({**body, 'owner_id': None}, 422), ({**body, 'owner_id': 'foreign'}, 422),
            ({**body, 'owner_id': 'disabled'}, 422), ({**body, 'owner_id': 'missing'}, 422),
            ({**body, 'due_date': '2027-02-29'}, 422), ({**body, 'recurrence': ''}, 422),
            ({**body, 'recurrence': 'custom', 'custom_recurrence_days': True}, 422),
            ({**body, 'client_id': 'b'}, 422),
        ]
        before = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']})
        for request, status in invalid:
            with self.subTest(request=request):
                response = await self.client.post(path, json=request)
                self.assertEqual(response.status_code, status, response.text)
                self.assertEqual(response.headers.get('x-create-rejected'), 'true')
                self.assertEqual(await server.db.reviews.count_documents({}), 0)
                self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']}), before)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI Governance Review scheduled'}), 0)

    async def test_repeat_and_concurrent_requests_never_duplicate_linked_work(self):
        row = await self.create_ai()
        path = '/api/ai_systems/' + row['ai_system_id'] + '/reviews'
        results = await asyncio.gather(*[self.client.post(path, json=self.schedule(row)) for _ in range(3)])
        self.assertTrue(all(r.status_code in (200, 409) for r in results), [r.text for r in results])
        reviews = await server.db.reviews.find({'ai_system_id': row['ai_system_id']}).to_list(None)
        self.assertEqual(len(reviews), 1)
        self.assertTrue(any(r.status_code == 200 for r in results))
        retry = await self.client.post(path, json=self.schedule(row))
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()['review_id'], reviews[0]['review_id'])
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI Governance Review scheduled'}), 1)

    async def test_current_authority_owner_and_lifecycle_are_rechecked(self):
        row = await self.create_ai()
        path = '/api/ai_systems/' + row['ai_system_id'] + '/reviews'
        body = self.schedule(row, owner_id='member')
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'inactive'}})
        self.assertEqual((await self.client.post(path, json=body)).status_code, 422)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'active', 'role': 'client_readonly'}})
        self.sign_in('member')
        self.assertEqual((await self.client.post(path, json=body)).status_code, 403)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'platform_admin', 'client_ids': ['b']}})
        self.assertEqual((await self.client.post(path, json=body)).status_code, 403)
        self.sign_in('admin')
        for status in ('suspended', 'retired'):
            await server.db.ai_systems.update_one({'ai_system_id': row['ai_system_id']}, {'$set': {'status': status}})
            self.assertEqual((await self.client.post(path, json=body)).status_code, 409)
        self.assertEqual(await server.db.reviews.count_documents({}), 0)

    async def test_subject_changed_while_waiting_for_lease_is_not_scheduled(self):
        row = await self.create_ai()
        collection_type = type(server.db.ai_systems)
        update = collection_type.update_one
        async def change_during_claim(collection, query, changes, *args, **kwargs):
            result = await update(collection, query, changes, *args, **kwargs)
            if collection.name == 'ai_systems' and '_governance_lock' in changes.get('$set', {}):
                await update(collection, {'ai_system_id': row['ai_system_id']}, {'$set': {'updated_at': '2099-01-01T00:00:00+00:00', 'name': 'Saved competing edit'}})
            return result
        with patch.object(collection_type, 'update_one', new=change_during_claim):
            response = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/reviews', json=self.schedule(row))
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(await server.db.reviews.count_documents({}), 0)
        current = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']})
        self.assertEqual(current['name'], 'Saved competing edit')
        self.assertNotIn('_governance_lock', current)

    async def test_global_provider_offered_as_candidate_can_own_the_review(self):
        row = await self.create_ai()
        await server.db.users.insert_one({'user_id': 'global-provider', 'name': 'Synthetic provider',
            'email': 'global-provider@example.test', 'role': 'platform_admin',
            'status': 'active', 'client_ids': [], 'all_clients': True})
        candidates = await self.client.get('/api/clients/a/assignees')
        self.assertEqual(candidates.status_code, 200, candidates.text)
        self.assertIn('global-provider', {candidate['user_id'] for candidate in candidates.json()['items']})
        path = '/api/ai_systems/' + row['ai_system_id'] + '/reviews'
        response = await self.client.post(path, json=self.schedule(row, owner_id='global-provider'))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['owner_id'], 'global-provider')
        await server.db.users.update_one({'user_id': 'global-provider'}, {'$set': {'all_clients': False}})
        denied = await self.client.post(path, json=self.schedule(row, owner_id='global-provider', due_date='2028-03-01'))
        self.assertEqual(denied.status_code, 422, denied.text)
        self.assertEqual(await server.db.reviews.count_documents({'ai_system_id': row['ai_system_id']}), 1)

    async def test_interrupted_primary_and_audit_recover_the_same_review_without_overwrite(self):
        for phase in ('after_primary', 'audit_write'):
            with self.subTest(phase=phase):
                row = await self.create_ai()
                path = '/api/ai_systems/' + row['ai_system_id'] + '/reviews'
                body = self.schedule(row)
                collection_type = type(server.db.reviews)
                update = collection_type.update_one
                failed_once = False
                async def interrupt(collection, query, changes, *args, **kwargs):
                    nonlocal failed_once
                    is_primary = collection.name == 'reviews' and '$setOnInsert' in changes
                    is_audit = collection.name == 'audit_logs' and changes.get('$setOnInsert', {}).get('action') == 'AI Governance Review scheduled'
                    if not failed_once and phase == 'audit_write' and is_audit:
                        failed_once = True
                        raise RuntimeError('Synthetic scheduled Review audit storage outage')
                    result = await update(collection, query, changes, *args, **kwargs)
                    if not failed_once and phase == 'after_primary' and is_primary:
                        failed_once = True
                        raise RuntimeError('Synthetic transport interruption after Review insert')
                    return result
                with patch.object(collection_type, 'update_one', new=interrupt):
                    response = await self.client.post(path, json=body)
                self.assertEqual(response.status_code, 503, response.text)
                self.assertTrue(failed_once)
                reviews = await server.db.reviews.find({'ai_system_id': row['ai_system_id']}).to_list(None)
                self.assertEqual(len(reviews), 1)
                original = reviews[0]
                receipt = await server.db.create_requests.find_one({'ai_review_plan.review_id': original['review_id']})
                self.assertEqual(receipt['state'], 'pending')
                self.assertEqual(receipt['ai_review_request'], body)
                competing = await self.client.post(path, json=self.schedule(row, due_date='2028-03-01'))
                self.assertEqual(competing.status_code, 409, competing.text)
                self.assertEqual(await server.db.reviews.count_documents({'ai_system_id': row['ai_system_id']}), 1)
                self.assertEqual(receipt['ai_review_plan']['current_occurrence_id'], original['current_occurrence_id'])
                self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI Governance Review scheduled', 'entity_id': row['ai_system_id']}), 0)
                await server.db.ai_systems.update_one({'ai_system_id': row['ai_system_id']}, {'$set': {'name': 'Newer saved AI details', 'updated_at': '2099-01-01T00:00:00+00:00'}})
                self.sign_in('member')
                self.assertEqual((await self.client.post(path, json=body)).status_code, 403)
                self.sign_in('admin')
                recovered = await self.client.post(path, json=body)
                self.assertEqual(recovered.status_code, 200, recovered.text)
                self.assertEqual(recovered.json()['review_id'], original['review_id'])
                self.assertEqual(await server.db.reviews.find_one({'review_id': original['review_id']}), original)
                self.assertEqual(await server.db.reviews.count_documents({'ai_system_id': row['ai_system_id']}), 1)
                self.assertEqual(await server.db.audit_logs.count_documents({'action': 'AI Governance Review scheduled', 'entity_id': row['ai_system_id']}), 1)
                repeated = await self.client.post(path, json=body)
                self.assertEqual(repeated.status_code, 200, repeated.text)
                self.assertEqual(repeated.json()['current_occurrence_id'], original['current_occurrence_id'])
                current = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']})
                self.assertEqual((current['name'], current['updated_at']), ('Newer saved AI details', '2099-01-01T00:00:00+00:00'))
                self.assertEqual(current['approval_status'], 'pending_assessment')
                self.assertEqual((await server.db.create_requests.find_one({'_id': receipt['_id']}))['state'], 'complete')

    async def test_onboarding_and_explicit_scheduling_share_one_subject_lease(self):
        entered, release = asyncio.Event(), asyncio.Event()
        collection_type = type(server.db.reviews)
        find = collection_type.find_one
        captured = {}
        async def pause_initial_review(collection, query, *args, **kwargs):
            if collection.name == 'reviews' and query.get('ai_review_purpose') == 'periodic' and not entered.is_set():
                captured['ai_system_id'] = query['ai_system_id']
                entered.set()
                await asyncio.wait_for(release.wait(), 5)
            return await find(collection, query, *args, **kwargs)
        body = onboarding_fixture.AIOnboardingTests.payload(self)
        with patch.object(collection_type, 'find_one', new=pause_initial_review):
            onboarding = asyncio.create_task(self.client.post('/api/ai_systems/onboard', json=body, headers={'Idempotency-Key': uuid.uuid4().hex}))
            try:
                await asyncio.wait_for(entered.wait(), 5)
                row = await server.db.ai_systems.find_one({'ai_system_id': captured['ai_system_id']})
                explicit = await self.client.post('/api/ai_systems/' + row['ai_system_id'] + '/reviews', json=self.schedule(row))
                self.assertEqual(explicit.status_code, 409, explicit.text)
                self.assertEqual(await server.db.reviews.count_documents({'ai_system_id': row['ai_system_id']}), 0)
            finally:
                release.set()
            result = await asyncio.wait_for(onboarding, 10)
        self.assertEqual(result.status_code, 200, result.text)
        loaded = result.json()['ai_system']
        replay = await self.client.post('/api/ai_systems/' + loaded['ai_system_id'] + '/reviews', json=self.schedule(loaded))
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()['review_id'], result.json()['review_id'])
        self.assertEqual(await server.db.reviews.count_documents({'ai_system_id': loaded['ai_system_id']}), 1)

    async def interrupt_schedule(self,owner='member',phase='before_primary'):
        row=await self.create_ai()
        path='/api/ai_systems/'+row['ai_system_id']+'/reviews'
        body=self.schedule(row,owner_id=owner)
        collection_type=type(server.db.reviews)
        update=collection_type.update_one
        captured={}
        async def interrupt(collection,query,changes,*args,**kwargs):
            if collection.name=='reviews' and '$setOnInsert' in changes:
                from copy import deepcopy
                captured.update(query=deepcopy(query),changes=deepcopy(changes))
                if phase=='before_primary':raise RuntimeError('Synthetic uncertain primary wire outcome')
                result=await update(collection,query,changes,*args,**kwargs)
                raise RuntimeError('Synthetic lost primary acknowledgement')
            return await update(collection,query,changes,*args,**kwargs)
        with patch.object(collection_type,'update_one',new=interrupt):
            response=await self.client.post(path,json=body)
        self.assertEqual(response.status_code,503,response.text)
        pending=(await self.client.get(path+'/pending')).json()['pending']
        receipt=await server.db.create_requests.find_one({'_id':pending['schedule_id']})
        return row,path,body,pending,receipt,captured

    def recovery_body(self,pending,owner='admin'):
        return {key:pending[key] for key in ('schedule_id','expected_updated_at','expected_review_updated_at')}|{'owner_id':owner}

    async def test_current_admin_recovers_unknown_write_revoked_owner_and_delayed_original_upsert(self):
        row,path,body,pending,original,captured=await self.interrupt_schedule()
        await server.db.users.update_one({'user_id':'member'},{'$set':{'status':'inactive'}})
        denied=await self.client.post(path,json=body)
        self.assertEqual(denied.status_code,422,denied.text)
        self.assertEqual((await server.db.ai_systems.find_one({'ai_system_id':row['ai_system_id']}))['_ai_review_schedule_pending'],pending['schedule_id'])
        recovered=await self.client.post(path+'/recover',json=self.recovery_body(pending))
        self.assertEqual(recovered.status_code,200,recovered.text)
        self.assertEqual((recovered.json()['review_id'],recovered.json()['current_occurrence_id']),
                         (pending['review_id'],pending['occurrence_id']))
        self.assertEqual(recovered.json()['owner_id'],'admin')
        await server.db.reviews.update_one(captured['query'],captured['changes'],upsert=True)
        self.assertEqual(await server.db.reviews.count_documents({'ai_system_id':row['ai_system_id']}),1)
        stored=await server.db.reviews.find_one({'review_id':pending['review_id']})
        self.assertEqual(stored['owner_id'],'admin')
        self.assertEqual(stored['due_date'],body['due_date'])
        self.assertFalse(stored.get('occurrences'))
        receipt=await server.db.create_requests.find_one({'_id':pending['schedule_id']})
        self.assertEqual(receipt['ai_review_request'],original['ai_review_request'])
        self.assertEqual(receipt['ai_review_plan'],original['ai_review_plan'])
        self.assertEqual(receipt['state'],'complete')
        replay=await self.client.post(path,json=body)
        self.assertEqual(replay.status_code,200,replay.text)
        self.assertEqual(replay.json()['review_id'],pending['review_id'])
        events=await server.db.audit_logs.find({'action':'AI Review schedule recovered','entity_id':row['ai_system_id']}).to_list(None)
        self.assertEqual(len(events),1)
        self.assertEqual((events[0]['user_id'],events[0]['meta']['previous_owner_id'],events[0]['meta']['owner_id']),('admin','member','admin'))

    async def test_new_authorized_admin_recovers_revoked_requester_with_current_scope_and_versions(self):
        row,path,body,pending,_,_=await self.interrupt_schedule()
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'platform_admin'}})
        await server.db.users.update_one({'user_id':'admin'},{'$set':{'status':'inactive'}})
        self.sign_in('member')
        loaded=await self.client.get(path+'/pending')
        self.assertEqual(loaded.status_code,200,loaded.text)
        request=self.recovery_body(loaded.json()['pending'],'member')
        recovered=await self.client.post(path+'/recover',json=request)
        self.assertEqual(recovered.status_code,200,recovered.text)
        self.assertEqual(recovered.json()['owner_id'],'member')
        self.assertEqual(recovered.json()['review_id'],pending['review_id'])
        self.assertNotIn('_ai_review_schedule_pending',await server.db.ai_systems.find_one({'ai_system_id':row['ai_system_id']}))
        self.assertEqual(await server.db.reviews.count_documents({'ai_system_id':row['ai_system_id']}),1)

    async def test_recovery_denies_foreign_stale_owner_live_command_and_started_history(self):
        row,path,_,pending,_,_=await self.interrupt_schedule(phase='after_primary')
        body=self.recovery_body(pending)
        self.sign_in('member')
        self.assertEqual((await self.client.get(path+'/pending')).status_code,403)
        self.assertEqual((await self.client.post(path+'/recover',json=body)).status_code,403)
        self.sign_in('admin')
        before=await server.db.reviews.find_one({'review_id':pending['review_id']})
        for patch in ({'owner_id':'missing'},{'expected_updated_at':'stale'},{'expected_review_updated_at':'stale'},{'schedule_id':'f'*64}):
            denied=await self.client.post(path+'/recover',json={**body,**patch})
            self.assertIn(denied.status_code,(409,422),denied.text)
            self.assertEqual(before,await server.db.reviews.find_one({'review_id':pending['review_id']}))
        await server.db.create_requests.update_one({'_id':pending['schedule_id']},{'$set':{'lease':{'token':'active','until':'2999-01-01T00:00:00+00:00'}}})
        self.assertEqual((await self.client.post(path+'/recover',json=body)).status_code,409)
        await server.db.create_requests.update_one({'_id':pending['schedule_id']},{'$unset':{'lease':''}})
        await server.db.reviews.update_one({'review_id':pending['review_id']},{'$set':{'status':'in_progress'}})
        self.assertEqual((await self.client.post(path+'/recover',json=body)).status_code,409)
        self.assertEqual((await server.db.reviews.find_one({'review_id':pending['review_id']}))['owner_id'],'member')
        self.assertEqual(await server.db.audit_logs.count_documents({'action':'AI Review schedule recovered','entity_id':row['ai_system_id']}),0)

    async def test_recovery_audit_and_receipt_faults_retry_without_overwriting_later_owner(self):
        for phase in ('audit','receipt_complete','marker_clear'):
            with self.subTest(phase=phase):
                row,path,_,pending,_,_=await self.interrupt_schedule()
                body=self.recovery_body(pending)
                collection_type=type(server.db.reviews)
                update=collection_type.update_one
                once=False
                async def interrupt(collection,query,changes,*args,**kwargs):
                    nonlocal once
                    matches=(phase=='audit' and collection.name=='audit_logs' and changes.get('$setOnInsert',{}).get('action')=='AI Review schedule recovered'
                        or phase=='receipt_complete' and collection.name=='create_requests' and query.get('_id')!=pending['schedule_id'] and changes.get('$set',{}).get('state')=='complete'
                        or phase=='marker_clear' and collection.name=='ai_systems' and '_ai_review_schedule_pending' in changes.get('$unset',{}))
                    if matches and not once:
                        once=True
                        raise RuntimeError('Synthetic interrupted recovery settlement')
                    return await update(collection,query,changes,*args,**kwargs)
                with patch.object(collection_type,'update_one',new=interrupt):
                    failed=await self.client.post(path+'/recover',json=body)
                self.assertEqual(failed.status_code,503,failed.text)
                self.assertTrue(once)
                stored=await server.db.reviews.find_one({'review_id':pending['review_id']})
                self.assertEqual(stored['owner_id'],'admin')
                await server.db.reviews.update_one({'review_id':pending['review_id']},{'$set':{'owner_id':'member','updated_at':'2099-01-01T00:00:00+00:00'}})
                recovered=await self.client.post(path+'/recover',json=body)
                self.assertEqual(recovered.status_code,200,recovered.text)
                self.assertEqual(recovered.json()['owner_id'],'member')
                self.assertEqual(recovered.json()['updated_at'],'2099-01-01T00:00:00+00:00')
                self.assertEqual(await server.db.reviews.count_documents({'ai_system_id':row['ai_system_id']}),1)
                self.assertEqual(await server.db.audit_logs.count_documents({'action':'AI Review schedule recovered','entity_id':row['ai_system_id']}),1)
                self.assertNotIn('_ai_review_schedule_pending',await server.db.ai_systems.find_one({'ai_system_id':row['ai_system_id']}))

    async def test_recovery_rejects_corrupt_plan_and_foreign_admin_without_mutation(self):
        row,path,_,pending,original,_=await self.interrupt_schedule()
        body=self.recovery_body(pending)
        await server.db.create_requests.update_one({'_id':pending['schedule_id']},{'$set':{
            'ai_review_plan':{**original['ai_review_plan'],'due_date':'2030-01-01'}}})
        self.assertEqual((await self.client.get(path+'/pending')).status_code,409)
        self.assertEqual((await self.client.post(path+'/recover',json=body)).status_code,409)
        self.assertEqual(await server.db.reviews.count_documents({'ai_system_id':row['ai_system_id']}),0)
        await server.db.create_requests.update_one({'_id':pending['schedule_id']},{'$set':{'ai_review_plan':original['ai_review_plan']}})
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'platform_admin','client_ids':['b']}})
        self.sign_in('member')
        self.assertEqual((await self.client.get(path+'/pending')).status_code,403)
        self.assertEqual((await self.client.post(path+'/recover',json=body)).status_code,403)
        self.assertEqual((await server.db.ai_systems.find_one({'ai_system_id':row['ai_system_id']}))['_ai_review_schedule_pending'],pending['schedule_id'])

    async def test_stale_recovery_rejects_and_original_recovery_retry_preserves_later_authorized_owner(self):
        row,path,_,pending,_,_=await self.interrupt_schedule()
        first=self.recovery_body(pending)
        collection_type=type(server.db.reviews)
        update=collection_type.update_one
        async def fail_recovery_audit(collection,query,changes,*args,**kwargs):
            if collection.name=='audit_logs' and changes.get('$setOnInsert',{}).get('action')=='AI Review schedule recovered':
                raise RuntimeError('Synthetic recovery audit interruption')
            return await update(collection,query,changes,*args,**kwargs)
        with patch.object(collection_type,'update_one',new=fail_recovery_audit):
            failed=await self.client.post(path+'/recover',json=first)
        self.assertEqual(failed.status_code,503,failed.text)
        stale=await self.client.post(path+'/recover',json={**first,'owner_id':'member'})
        self.assertEqual(stale.status_code,409,stale.text)
        fresh=(await self.client.get(path+'/pending')).json()['pending']
        later=await self.client.post(path+'/recover',json=self.recovery_body(fresh,'member'))
        self.assertEqual(later.status_code,200,later.text)
        retried=await self.client.post(path+'/recover',json=first)
        self.assertEqual(retried.status_code,200,retried.text)
        self.assertEqual(retried.json()['owner_id'],'member')
        self.assertEqual(retried.json()['review_id'],pending['review_id'])
        self.assertEqual(await server.db.reviews.count_documents({'ai_system_id':row['ai_system_id']}),1)
        self.assertEqual(await server.db.audit_logs.count_documents({'action':'AI Review schedule recovered','entity_id':row['ai_system_id']}),2)
