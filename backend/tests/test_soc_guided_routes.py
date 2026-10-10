"""SOC routes/native writer with real authorization and isolated Mongo mock only.

This is not hosted authentication or durable Mongo evidence.
"""
import copy
import asyncio
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch
from pymongo.errors import AutoReconnect, NetworkTimeout, OperationFailure, WriteConcernError
import guided_assessment
import soc_guided_lease
import test_framework_governance as harness
from soc_guided_assessment import CATALOG, _questions, result_status

server=harness.server
CATEGORIES=['security','availability','confidentiality','processing_integrity','privacy']

class SocGuidedRoutes(unittest.IsolatedAsyncioTestCase):
    # Do not inherit the parent test campaign; reuse only its fixture/helpers.
    asyncSetUp=harness.FrameworkTests.asyncSetUp
    sign_in=harness.FrameworkTests.sign_in
    body=harness.FrameworkTests.body
    configure=harness.FrameworkTests.configure

    async def setup_soc(self,cid='a'):
        payload=self.body(('soc-2','iso-27001'),cid)
        await self.configure(payload)
        configured=await self.client.patch('/api/frameworks/soc-2/configuration',json={'client_id':cid,'categories':CATEGORIES,'system_description':'Isolated synthetic SOC system','period_start':'','period_end':''})
        self.assertEqual(configured.status_code,200,configured.text)
        response=await self.client.get('/api/frameworks/soc-2',params={'client_id':cid})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    def answers(self,id):
        return {q['id']:('Relevant' if q['type']=='context' else '' if q['type']=='text' else 'Yes') for q in _questions(id)}

    async def complete(self,row,changes=None):
        path='/api/framework_assessments/'+row['framework_assessment_id']+'/guided-assessment'
        draft=(await self.client.get(path)).json()
        answers={**self.answers(row['definition_id']),**(changes or {})}
        text='OVERVIEW\nSynthetic reported practices for '+row['definition_id']+'\n\nIMPLEMENTATION BREAKDOWN\n- Reviewed synthetic write-up.\n\nITEMS TO ADDRESS\n- Review reported limits.'
        status=result_status(row['definition_id'],answers,CATALOG['version'])
        result={'version':CATALOG['version'],'status':status,'narrative':text,'basis':[],'gaps':[],'unknowns':[],'nextSteps':[],'evidence':[],'answers':[],'signals':[]}
        payload={'version':CATALOG['version'],'answers':answers,'step':0,'completed':True,'narrative':text,'expected_revision':draft['revision'],'result':result,
            'summary_review':{'version':CATALOG['version'],'answers':answers},
            **{k:draft[k] for k in ('base_assessment_token','base_scope_fingerprint')}}
        response=await self.client.put(path,json=payload)
        self.assertEqual(response.status_code,200,response.text)
        return response.json(),payload

    async def race_fixture(self):
        workspace=await self.setup_soc()
        row=next(a for a in workspace['assessments'] if a['definition_id']=='CC1.1')
        path='/api/framework_assessments/'+row['framework_assessment_id']
        draft,payload=await self.complete(row)
        write={'implementation':draft['narrative'],'status':draft['result']['status'],
            'guided_assessment_source':{k:draft[k] for k in ('version','revision','generated_at')},
            'expected_last_assessed':row.get('last_saved') or row.get('last_assessed')}
        negative=copy.deepcopy(payload)
        question=next(q for q in _questions('CC1.1') if q['type']=='select')
        negative['answers'][question['id']]='No'
        negative['summary_review']['answers']=copy.deepcopy(negative['answers'])
        negative['result']['status']='needs_attention'
        negative['expected_revision']=draft['revision']
        return row,path,write,negative

    async def assert_negative_retry_rejects_old_native(self,path,write,negative):
        retried=await self.client.put(path+'/guided-assessment',json=negative)
        self.assertEqual(retried.status_code,200,retried.text)
        self.assertEqual(retried.json()['result']['status'],'needs_attention')
        native=(await self.client.get(path)).json()
        stale=await self.client.patch(path,json={**write,'expected_last_assessed':native.get('last_saved') or native.get('last_assessed')})
        self.assertEqual(stale.status_code,409,stale.text)
        history=(await self.client.get(path+'/guided-assessment/history')).json()['items']
        self.assertEqual(history[0]['result']['status'],'addressed')
        self.assertEqual(history[0]['revision'],negative['expected_revision'])

    async def test_interview_cannot_interleave_after_latest_eligibility_read(self):
        _,path,write,negative=await self.race_fixture()
        original=guided_assessment.read_draft
        reads=0
        attempts=[]
        async def interleave(*args,**kwargs):
            nonlocal reads
            result=await original(*args,**kwargs)
            reads+=1
            if reads==2:
                attempts.append(await self.client.put(path+'/guided-assessment',json=negative))
            return result
        with patch.object(guided_assessment,'read_draft',side_effect=interleave):
            native=await self.client.patch(path,json=write)
        self.assertEqual(len(attempts),1)
        self.assertEqual(attempts[0].status_code,409,attempts[0].text)
        self.assertEqual(native.status_code,200,native.text)
        await self.assert_negative_retry_rejects_old_native(path,write,negative)

    async def test_interview_cannot_interleave_immediately_before_native_cas(self):
        _,path,write,negative=await self.race_fixture()
        collection=server.db.framework_assessments
        original=collection.update_one
        attempts=[]
        async def interleave(query,update,*args,**kwargs):
            if update.get('$set',{}).get('status')=='addressed' and '$push' in update:
                attempts.append(await self.client.put(path+'/guided-assessment',json=negative))
            return await original(query,update,*args,**kwargs)
        with patch.object(server.db,'framework_assessments',collection), patch.object(collection,'update_one',side_effect=interleave):
            native=await self.client.patch(path,json=write)
        self.assertEqual(len(attempts),1)
        self.assertEqual(attempts[0].status_code,409,attempts[0].text)
        self.assertEqual(native.status_code,200,native.text)
        await self.assert_negative_retry_rejects_old_native(path,write,negative)

    async def test_native_cannot_interleave_with_interview_cas(self):
        _,path,write,negative=await self.race_fixture()
        collection=server.db.guided_assessment_pilot
        original=collection.update_one
        attempts=[]
        async def interleave(query,update,*args,**kwargs):
            if update.get('$set',{}).get('result',{}).get('status')=='needs_attention':
                attempts.append(await self.client.patch(path,json=write))
            return await original(query,update,*args,**kwargs)
        with patch.object(server.db,'guided_assessment_pilot',collection), patch.object(collection,'update_one',side_effect=interleave):
            changed=await self.client.put(path+'/guided-assessment',json=negative)
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertEqual(len(attempts),1)
        self.assertEqual(attempts[0].status_code,409,attempts[0].text)
        self.assertEqual((await self.client.patch(path,json=write)).status_code,409)
        self.assertEqual((await self.client.get(path)).json()['status'],'not_assessed')

    async def assert_lease_released(self,aid):
        lease=await server.db.soc_guided_locks.find_one({'_id':aid})
        self.assertIsNotNone(lease)
        self.assertEqual(lease['until'],'')
        self.assertNotIn('token',lease)

    async def test_database_contention_expiry_and_no_outward_lease_metadata(self):
        row,path,write,negative=await self.race_fixture()
        aid=row['framework_assessment_id']
        before=(await self.client.get(path)).json()
        locks=server.db.soc_guided_locks
        future=(datetime.now(timezone.utc)+timedelta(seconds=120)).isoformat()
        await locks.update_one({'_id':aid},{'$set':{'token':'another-worker','until':future}})
        for request in (self.client.put(path+'/guided-assessment',json=negative),self.client.patch(path,json=write)):
            response=await request
            self.assertEqual(response.status_code,409,response.text)
        held=await locks.find_one({'_id':aid})
        self.assertEqual(held['token'],'another-worker')
        self.assertEqual(held['until'],future)
        def check_public(value):
            if isinstance(value,dict):
                for key,item in value.items():
                    self.assertNotIn(key,('token','until','_soc_guided_lock','soc_guided_locks'))
                    check_public(item)
            elif isinstance(value,list):
                for item in value:check_public(item)
        for url in (path,path+'/guided-assessment',path+'/guided-assessment/history',path+'/related','/api/frameworks/soc-2?client_id=a'):
            response=await self.client.get(url)
            self.assertEqual(response.status_code,200,response.text)
            check_public(response.json())
        self.assertEqual((await self.client.get(path)).json(),before)
        await locks.update_one({'_id':aid},{'$set':{'until':(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()}})
        changed=await self.client.put(path+'/guided-assessment',json=negative)
        self.assertEqual(changed.status_code,200,changed.text)
        await self.assert_lease_released(aid)

    async def test_failed_validation_and_database_writes_release_and_allow_safe_retry(self):
        row,path,write,negative=await self.race_fixture()
        aid=row['framework_assessment_id']
        bad=copy.deepcopy(negative);bad['result']['status']='addressed'
        invalid=await self.client.put(path+'/guided-assessment',json=bad)
        self.assertEqual(invalid.status_code,422,invalid.text)
        await self.assert_lease_released(aid)
        invalid_native=await self.client.patch(path,json={**write,'implementation':'Unreviewed text'})
        self.assertEqual(invalid_native.status_code,422,invalid_native.text)
        await self.assert_lease_released(aid)
        before=(await self.client.get(path)).json()
        before_draft=(await self.client.get(path+'/guided-assessment')).json()
        for name,method,url,payload in (
                ('guided_assessment_pilot',self.client.put,path+'/guided-assessment',negative),
                ('framework_assessments',self.client.patch,path,write)):
            with self.subTest(collection=name):
                collection=server.db[name]
                async def fail(*args,**kwargs):raise RuntimeError('Injected isolated write failure')
                with patch.object(server.db,name,collection), patch.object(collection,'update_one',side_effect=fail):
                    with self.assertRaisesRegex(RuntimeError,'Injected isolated write failure'):
                        await method(url,json=payload)
                await self.assert_lease_released(aid)
                self.assertEqual((await self.client.get(path)).json(),before)
                self.assertEqual((await self.client.get(path+'/guided-assessment')).json(),before_draft)
        await self.assert_negative_retry_rejects_old_native(path,write,negative)

    async def assert_lease_held_then_expire(self, row, path, payload):
        aid=row['framework_assessment_id']
        locks=server.db.soc_guided_locks
        held=await locks.find_one({'_id':aid})
        self.assertTrue(held.get('token'))
        self.assertGreater(datetime.fromisoformat(held['until']),datetime.now(timezone.utc))
        self.assertEqual((await self.client.put(path+'/guided-assessment',json=payload)).status_code,409)
        self.assertEqual(await locks.find_one({'_id':aid}),held)
        # Controlled-clock/unit boundary only; the separate real-Motor probe
        # waits for the actual unchanged 120-second expiration.
        await locks.update_one({'_id':aid},{'$set':{'until':(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()}})

    async def test_timed_out_and_cancelled_save_retain_lease_without_draft_loss(self):
        row,path,_,negative=await self.race_fixture()
        original=guided_assessment._save_draft
        before=(await self.client.get(path+'/guided-assessment')).json()
        entered=asyncio.Event()
        never=asyncio.Event()
        async def blocked(*args,**kwargs):
            entered.set()
            await never.wait()
            return await original(*args,**kwargs)
        with patch.object(guided_assessment,'_save_draft',side_effect=blocked), patch.object(soc_guided_lease,'SAVE_TIMEOUT_SECONDS',0.02):
            response=await self.client.put(path+'/guided-assessment',json=negative)
        self.assertTrue(entered.is_set())
        self.assertEqual(response.status_code,503,response.text)
        await self.assert_lease_held_then_expire(row,path,negative)
        self.assertEqual((await self.client.get(path+'/guided-assessment')).json(),before)
        entered.clear()
        with patch.object(guided_assessment,'_save_draft',side_effect=blocked):
            request=asyncio.create_task(self.client.put(path+'/guided-assessment',json=negative))
            try:
                await asyncio.wait_for(entered.wait(),timeout=5)
                request.cancel()
                with self.assertRaises(asyncio.CancelledError):await request
            finally:
                if not request.done():
                    request.cancel()
                    try:await request
                    except asyncio.CancelledError:pass
        await self.assert_lease_held_then_expire(row,path,negative)
        self.assertEqual((await self.client.get(path+'/guided-assessment')).json(),before)
        self.assertEqual((await self.client.put(path+'/guided-assessment',json=negative)).status_code,200)
        await self.assert_lease_released(row['framework_assessment_id'])

    async def test_indeterminate_driver_errors_retain_lease_and_require_reload(self):
        row,path,write,negative=await self.race_fixture()
        before=(await self.client.get(path)).json()
        errors=(NetworkTimeout('Synthetic timeout'),AutoReconnect('Synthetic connection loss'),
                WriteConcernError('Synthetic uncertain acknowledgement'),
                OperationFailure('Synthetic retryable write',details={'errorLabels':['RetryableWriteError']}))
        for error in errors:
            with self.subTest(error=type(error).__name__):
                with patch.object(guided_assessment,'read_draft',side_effect=error):
                    response=await self.client.patch(path,json=write)
                self.assertEqual(response.status_code,503,response.text)
                self.assertIn('reload',response.json()['detail'])
                self.assertEqual((await self.client.get(path)).json(),before)
                await self.assert_lease_held_then_expire(row,path,negative)
        self.assertEqual((await self.client.patch(path,json=write)).status_code,200)
        await self.assert_lease_released(row['framework_assessment_id'])

    async def test_driver_deadline_is_soc_scoped_and_cleanup_has_no_expired_deadline(self):
        from pymongo import _csot
        row,path,write,_=await self.race_fixture()
        collection=server.db.framework_assessments
        locks=server.db.soc_guided_locks
        original_write=collection.update_one
        original_lock=locks.update_one
        write_deadlines=[]
        cleanup_deadlines=[]
        async def write_cas(*args,**kwargs):
            write_deadlines.append(_csot.get_timeout())
            return await original_write(*args,**kwargs)
        async def lock_cas(query,update,*args,**kwargs):
            if update.get('$unset',{}).get('token')=='':
                cleanup_deadlines.append(_csot.get_timeout())
            return await original_lock(query,update,*args,**kwargs)
        with patch.object(server.db,'framework_assessments',collection), patch.object(collection,'update_one',side_effect=write_cas), patch.object(server.db,'soc_guided_locks',locks), patch.object(locks,'update_one',side_effect=lock_cas):
            response=await self.client.patch(path,json=write)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(write_deadlines,[soc_guided_lease.DRIVER_TIMEOUT_SECONDS])
        self.assertEqual(cleanup_deadlines,[None])
        self.assertIsNone(_csot.get_timeout())
        self.assertLess(soc_guided_lease.DRIVER_TIMEOUT_SECONDS,soc_guided_lease.SAVE_TIMEOUT_SECONDS)
        self.assertLess(soc_guided_lease.SAVE_TIMEOUT_SECONDS,soc_guided_lease.LEASE_SECONDS)

    async def test_expired_holder_cannot_write_or_release_successor(self):
        row,path,_,negative=await self.race_fixture()
        locks=server.db.soc_guided_locks
        collection=server.db.guided_assessment_history
        original=collection.update_one
        future=(datetime.now(timezone.utc)+timedelta(seconds=120)).isoformat()
        async def takeover(*args,**kwargs):
            result=await original(*args,**kwargs)
            await locks.update_one({'_id':row['framework_assessment_id']},{'$set':{'token':'successor','until':future}})
            return result
        before=(await self.client.get(path+'/guided-assessment')).json()
        with patch.object(server.db,'guided_assessment_history',collection), patch.object(collection,'update_one',side_effect=takeover):
            response=await self.client.put(path+'/guided-assessment',json=negative)
        self.assertEqual(response.status_code,409,response.text)
        self.assertEqual((await self.client.get(path+'/guided-assessment')).json(),before)
        retained=await locks.find_one({'_id':row['framework_assessment_id']})
        self.assertEqual(retained['token'],'successor')
        self.assertEqual(retained['until'],future)

    async def test_native_expiry_before_cas_preserves_record_and_allows_retry(self):
        row,path,write,negative=await self.race_fixture()
        original=guided_assessment.read_draft
        before=(await self.client.get(path)).json()
        reads=0
        async def expire(*args,**kwargs):
            nonlocal reads
            result=await original(*args,**kwargs)
            reads+=1
            if reads==2:
                await server.db.soc_guided_locks.update_one({'_id':row['framework_assessment_id']},
                    {'$set':{'until':(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()}})
            return result
        with patch.object(guided_assessment,'read_draft',side_effect=expire):
            response=await self.client.patch(path,json=write)
        self.assertEqual(response.status_code,409,response.text)
        self.assertEqual((await self.client.get(path)).json(),before)
        await self.assert_lease_released(row['framework_assessment_id'])
        await self.assert_negative_retry_rejects_old_native(path,write,negative)

    async def test_denied_writes_do_not_touch_leases(self):
        row,path,write,negative=await self.race_fixture()
        collection=server.db.soc_guided_locks
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.sign_in('member')
        with patch.object(server.db,'soc_guided_locks',collection), patch.object(collection,'update_one',side_effect=AssertionError('Denied access touched lease storage')):
            self.assertEqual((await self.client.get(path+'/guided-assessment')).status_code,200)
            self.assertEqual((await self.client.put(path+'/guided-assessment',json=negative)).status_code,403)
            self.assertEqual((await self.client.patch(path,json=write)).status_code,403)
            self.client.cookies.clear();self.client.headers.pop('Authorization',None)
            self.assertEqual((await self.client.put(path+'/guided-assessment',json=negative)).status_code,401)
            self.assertEqual((await self.client.patch(path,json=write)).status_code,401)
            self.sign_in('member')
            await server.db.users.update_one({'user_id':'member'},{'$set':{'client_ids':['b'],'role':'client_grc_manager'}})
            self.assertEqual((await self.client.put(path+'/guided-assessment',json=negative)).status_code,403)
            self.assertEqual((await self.client.patch(path,json=write)).status_code,403)
        await self.assert_lease_released(row['framework_assessment_id'])

    async def test_cis_draft_and_native_writes_never_touch_soc_lease(self):
        workspace=await self.configure()
        row=next(a for a in workspace['assessments'] if a['definition_id']=='1.1')
        path='/api/framework_assessments/'+row['framework_assessment_id']
        draft=(await self.client.get(path+'/guided-assessment')).json()
        payload={'version':draft['version'],'answers':{},'expected_revision':0,
            **{k:draft[k] for k in ('base_assessment_token','base_scope_fingerprint')}}
        collection=server.db.soc_guided_locks
        with patch.object(server.db,'soc_guided_locks',collection), patch.object(collection,'update_one',side_effect=AssertionError('CIS touched SOC lease storage')):
            saved=await self.client.put(path+'/guided-assessment',json=payload)
            self.assertEqual(saved.status_code,200,saved.text)
            self.assertNotIn('summary_review',saved.json())
            native=await self.client.patch(path,json={'implementation':'Preserved CIS path','expected_last_assessed':row.get('last_saved') or row.get('last_assessed')})
            self.assertEqual(native.status_code,200,native.text)
            self.assertNotIn('summary_review',native.json())
        self.assertEqual(await collection.count_documents({}),0)

    async def test_every_criterion_progress_resume_exact_native_write_and_retained_fields(self):
        workspace=await self.setup_soc()
        self.assertEqual(len(workspace['assessments']),61)
        for row in workspace['assessments']:
            with self.subTest(criterion=row['definition_id']):
                aid=row['framework_assessment_id'];path='/api/framework_assessments/'+aid
                before=copy.deepcopy((await self.client.get(path)).json())
                draft,payload=await self.complete(row)
                self.assertEqual((await self.client.get(path)).json(),before)
                self.assertEqual((await self.client.get(path+'/guided-assessment')).json()['answers'],payload['answers'])
                native={'implementation':draft['narrative'],'status':draft['result']['status'],'record_assessment':True,
                    'guided_assessment_source':{k:draft[k] for k in ('version','revision','generated_at')},'expected_last_assessed':before.get('last_saved') or before.get('last_assessed')}
                response=await self.client.patch(path,json=native)
                self.assertEqual(response.status_code,200,response.text)
                after=(await self.client.get(path)).json()
                self.assertEqual(after['implementation'],draft['narrative'])
                self.assertEqual(after['status'],'addressed')
                for key in ('soc_assessment_checks','management_controls','verification','related_links','owner_id','process_owner_id','notes'):
                    self.assertEqual(after.get(key),before.get(key),key)
                self.assertEqual(after['assessment_history'][-1]['guided_assessment_source']['answers'],payload['answers'])
                self.assertEqual((await self.client.patch(path,json=native)).status_code,409)
        self.assertEqual(await server.db.findings.count_documents({'client_id':'a'}),0)

    async def test_wrong_client_reader_unauthenticated_and_wrong_category_are_denied(self):
        workspace=await self.setup_soc('b');row=workspace['assessments'][0]
        path='/api/framework_assessments/'+row['framework_assessment_id']+'/guided-assessment'
        self.sign_in('member')
        self.assertEqual((await self.client.get(path)).status_code,403)
        self.sign_in('admin');await self.setup_soc('a')
        row=(await self.client.get('/api/frameworks/soc-2',params={'client_id':'a'})).json()['assessments'][0]
        path='/api/framework_assessments/'+row['framework_assessment_id']+'/guided-assessment'
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.sign_in('member')
        self.assertEqual((await self.client.get(path)).status_code,200)
        self.assertEqual((await self.client.put(path,json={'version':CATALOG['version'],'answers':{},'expected_revision':0})).status_code,403)
        self.client.cookies.clear();self.client.headers.pop('Authorization',None)
        self.assertIn((await self.client.get(path)).status_code,(401,403))
        self.sign_in('admin')
        await server.db.clients.update_one({'client_id':'a'},{'$set':{'framework_settings.soc-2.categories':['security']}})
        outside=next(a for a in (await self.client.get('/api/frameworks/soc-2',params={'client_id':'a'})).json()['assessments'] if a['definition_id']=='P1.1')
        self.assertEqual((await self.client.get('/api/framework_assessments/'+outside['framework_assessment_id']+'/guided-assessment')).status_code,404)

    async def test_forged_result_property_changes_stale_base_and_history(self):
        workspace=await self.setup_soc();row=next(a for a in workspace['assessments'] if a['definition_id']=='CC1.1')
        path='/api/framework_assessments/'+row['framework_assessment_id']
        draft,payload=await self.complete(row)
        write={'implementation':draft['narrative'],'status':draft['result']['status'],'guided_assessment_source':{k:draft[k] for k in ('version','revision','generated_at')},'expected_last_assessed':row.get('last_saved') or row.get('last_assessed')}
        for extra in ({'status':'not_applicable','na_rationale':'Outsourced'},{'verification':'verified'},{'implementation':'Unreviewed text'}):
            self.assertEqual((await self.client.patch(path,json={**write,**extra})).status_code,422)
        forged={**payload,'expected_revision':draft['revision'],'result':{**payload['result'],'status':'needs_attention'}}
        self.assertEqual((await self.client.put(path+'/guided-assessment',json=forged)).status_code,422)
        manual=await self.client.patch(path,json={'implementation':'Manual native correction','expected_last_assessed':write['expected_last_assessed']})
        self.assertEqual(manual.status_code,200,manual.text)
        self.assertEqual((await self.client.patch(path,json={**write,'expected_last_assessed':manual.json()['last_saved']})).status_code,409)
        history=await self.client.get(path+'/guided-assessment/history')
        self.assertEqual(history.status_code,200)
        await server.db.requirements.update_many({'client_id':'a','baseline_key':'soc-2'},{'$set':{'baseline_response':'does_not_apply'}})
        self.assertEqual((await self.client.get(path+'/guided-assessment')).status_code,404)
        self.assertEqual((await self.client.get(path)).json()['implementation'],'Manual native correction')
