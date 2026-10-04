"""Cumulative lifecycle through real FastAPI routes and isolated mock Mongo."""
import asyncio
import copy
import unittest
import uuid
import csv
import io
import json
from unittest.mock import patch
import test_framework_governance as harness
import framework_governance
from framework_catalog import CIS, active_definitions, active_plans
from framework_governance import CIS_CRITERIA


class CisIG2Tests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=harness.FrameworkTests.asyncSetUp
    sign_in=harness.FrameworkTests.sign_in
    body=harness.FrameworkTests.body
    configure=harness.FrameworkTests.configure

    async def scope(self, group, key=None, token=None, **context):
        return await self.client.patch('/api/frameworks/cis-ig1/configuration',json={
            'client_id':'a','implementation_group':group,'expected_updated_at':token,**context},
            headers={'Idempotency-Key':key or uuid.uuid4().hex})

    async def workspace(self):
        response=await self.client.get('/api/frameworks/cis-ig1',params={'client_id':'a'})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    def test_exact_membership_and_guidance(self):
        counts=[4,6,12,11,6,7,7,11,6,7,5,7,6,9,4,11,8,3]
        expected={f'{c}.{n}' for c,count in enumerate(counts,1) for n in range(1,count+1)}
        self.assertEqual({d['id'] for d in active_definitions('cis-ig1',{'implementation_group':2})},expected)
        self.assertEqual(len(active_definitions('cis-ig1')),56)
        self.assertEqual(sum(d['implementation_group']==2 for d in CIS['requirements']),74)
        self.assertEqual(set(CIS_CRITERIA),expected)
        self.assertEqual(len(active_plans('cis-ig1')),12)
        self.assertEqual(len(active_plans('cis-ig1',{'implementation_group':2})),15)
        self.assertNotIn('15.5',expected)

    async def test_upgrade_reduce_reenable_preserves_original_work(self):
        s=harness.server
        original=await self.configure()
        first=original['assessments'][0]
        await s.db.framework_assessments.update_one({'framework_assessment_id':first['framework_assessment_id']},{'$set':{
            'status':'addressed','verification':'verified','implementation':'Original process','owner_id':'admin',
            'assessment_history':[{'implementation':'Historical','at':'2026-01-01'}]}})
        review=await s.db.reviews.find_one({'client_id':'a','framework_plan_key':'asset-inventory'})
        saved={'title':'Custom review','description':'Client procedure','recurrence':'custom','custom_recurrence_days':42,'due_date':'2027-01-01','schedule_anchor':'2026-01-01',
               'occurrences':[{'occurrence_id':'historical','framework_safeguards':['1.1','1.2'],'conclusion':'Original assessment'}]}
        await s.db.reviews.update_one({'review_id':review['review_id']},{'$set':saved})
        before={a['definition_id']:a for a in await s.db.framework_assessments.find({'client_id':'a'}).to_list(None)}
        upgraded=await self.scope(2)
        self.assertEqual(upgraded.status_code,200,upgraded.text)
        workspace=await self.workspace();self.assertEqual(len(workspace['assessments']),130)
        for row in workspace['assessments']:
            if row['definition_id'] in before:
                expected={k:v for k,v in before[row['definition_id']].items() if k!='_id'}
                self.assertEqual(row,expected)
            else:self.assertEqual((row['status'],row['implementation'],row['assessment_history']),('not_assessed','',[]))
        after=await s.db.reviews.find_one({'review_id':review['review_id']})
        self.assertEqual({k:after[k] for k in saved},saved)
        self.assertEqual(after['framework_safeguards'],['1.1','1.2','1.3','1.4'])
        await s.db.tasks.insert_one({'task_id':'open-ig2-work','client_id':'a','status':'open','framework_assessment_id':next(a['framework_assessment_id'] for a in workspace['assessments'] if a['definition_id']=='18.2')})
        token=upgraded.json()['expected_updated_at']
        refused=await self.scope(1,token=token);self.assertEqual(refused.status_code,422)
        reduced=await self.scope(1,token=token,confirm_reduction=True,reason='Changed client scope',effective_date='2026-10-03')
        self.assertEqual(reduced.status_code,200,reduced.text)
        workspace=await self.workspace();self.assertEqual(len(workspace['active_definition_ids']),56);self.assertEqual(len(workspace['assessments']),130)
        exported=await self.client.get('/api/frameworks/cis-ig1/export',params={'client_id':'a'})
        self.assertEqual(exported.status_code,200,exported.text)
        self.assertEqual(len(list(csv.DictReader(io.StringIO(exported.text)))),56)
        links=[{'url':'https://example.test/evidence','label':'Synthetic reference'}]
        await s.db.framework_assessments.update_one({'framework_assessment_id':first['framework_assessment_id']},{'$set':{'notes':' =SUM(1,2)','related_links':links}})
        escaped=await self.client.get('/api/frameworks/cis-ig1/export',params={'client_id':'a'})
        escaped_row=next(r for r in csv.DictReader(io.StringIO(escaped.text)) if r['framework_assessment_id']==first['framework_assessment_id'])
        self.assertEqual(escaped_row['notes'],"' =SUM(1,2)")
        self.assertEqual(json.loads(escaped_row['related_links']),links)
        retained_export=await self.client.get('/api/frameworks/cis-ig1/export',params={'client_id':'a','include_retained':True})
        exported_rows=list(csv.DictReader(io.StringIO(retained_export.text)))
        self.assertEqual(len(exported_rows),130);self.assertEqual(sum(r['in_active_scope']=='False' for r in exported_rows),74)
        summary=(await self.client.get('/api/frameworks/summary',params={'client_id':'a'})).json()
        self.assertEqual(summary['items'][0]['total'],56)
        self.assertEqual((await s.db.tasks.find_one({'task_id':'open-ig2-work'}))['status'],'open')
        pentest=await s.db.reviews.find_one({'client_id':'a','framework_plan_key':'penetration-testing'})
        self.assertFalse(pentest['framework_driver_active']);self.assertNotEqual(pentest['status'],'cancelled')
        retained=next(a for a in workspace['assessments'] if a['definition_id']=='18.2')
        blocked=await self.client.post('/api/framework_assessments/'+retained['framework_assessment_id']+'/reviews',json={'plan_key':'penetration-testing'})
        self.assertEqual(blocked.status_code,409)
        again=await self.scope(2,token=reduced.json()['expected_updated_at']);self.assertEqual(again.status_code,200,again.text)
        self.assertEqual(await s.db.framework_assessments.count_documents({'client_id':'a'}),130)
        self.assertEqual(await s.db.reviews.count_documents({'client_id':'a'}),15)
        client=await s.db.clients.find_one({'client_id':'a'})
        self.assertEqual(client['initial_program_baseline']['state'].get('framework_settings',{}),{})

    async def test_new_and_later_enabled_ig2_and_invalid_scope(self):
        body=self.body();body['state']['framework_settings']={'cis-ig1':{'implementation_group':2}}
        workspace=await self.configure(body);self.assertEqual(len(workspace['assessments']),130)
        for bad in [True,'2',3,0,None]:
            response=await self.scope(bad);self.assertEqual(response.status_code,422,response.text)
        for setting in [{'cis-ig1':{'implementation_group':True}},{'cis-ig1':{'implementation_group':3}},{'cis-ig1':{'other':2}}]:
            body=self.body(cid='b');body['state']['framework_settings']=setting
            response=await self.client.post('/api/onboarding/baseline',json=body);self.assertEqual(response.status_code,422,response.text)
        await self.configure(self.body(programs=(),cid='b'))
        response=await self.client.patch('/api/onboarding/programs/cis-ig1',json={'client_id':'b','applicability':'applies','implementation_group':2})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(await harness.server.db.framework_assessments.count_documents({'client_id':'b','framework_key':'cis-ig1'}),130)

    async def test_partial_initialization_retry_and_concurrent_intents(self):
        s=harness.server;await self.configure()
        original=framework_governance.stable
        calls=0
        def fail_once(*args,**kwargs):
            nonlocal calls
            calls+=1
            if calls==70:raise RuntimeError('Injected isolated persistence failure')
            return original(*args,**kwargs)
        key=uuid.uuid4().hex
        with patch.object(framework_governance,'stable',side_effect=fail_once):
            failed=await self.scope(2,key=key)
        self.assertEqual(failed.status_code,503,failed.text)
        self.assertEqual((await self.workspace())['configuration']['implementation_group'],1)
        resumed=await self.scope(2,key=key);self.assertEqual(resumed.status_code,200,resumed.text)
        replay=await self.scope(2,key=key);self.assertEqual(replay.json(),resumed.json())
        self.assertEqual(await s.db.framework_assessments.count_documents({'client_id':'a'}),130)
        self.assertEqual(await s.db.audit_logs.count_documents({'action':'CIS scope updated'}),1)
        stale=await self.scope(1,token=None,confirm_reduction=True,reason='Stale',effective_date='2026-10-03');self.assertEqual(stale.status_code,409)
        token=resumed.json()['expected_updated_at']
        results=await asyncio.gather(self.scope(2,token=token),self.scope(2,token=token))
        self.assertEqual(sorted(r.status_code for r in results),[200,409])
        self.assertEqual(await s.db.reviews.count_documents({'client_id':'a'}),15)

    async def test_permissions_and_tenant_isolation(self):
        await self.configure()
        self.sign_in('member')
        denied=await self.scope(2);self.assertEqual(denied.status_code,403)
        for path in ['/api/frameworks/cis-ig1','/api/frameworks/summary','/api/frameworks/cis-ig1/export']:
            denied=await self.client.get(path,params={'client_id':'b'});self.assertEqual(denied.status_code,403)
        await harness.server.db.users.update_one({'user_id':'member'},{'$set':{'role':'platform_admin','client_ids':['b']}})
        denied=await self.scope(2);self.assertEqual(denied.status_code,403)

    async def test_prepublication_failure_keeps_proposed_review_work_inactive(self):
        s=harness.server
        await self.configure()
        original_reconcile=framework_governance.reconcile
        async def fail_publication(*args,**kwargs):
            await original_reconcile(*args,**kwargs)
            if kwargs.get('cis_active_configuration') is not None:
                raise RuntimeError('Injected failure after proposed Review initialization')
        key=uuid.uuid4().hex
        with patch.object(framework_governance,'reconcile',side_effect=fail_publication):
            response=await self.scope(2,key=key)
        self.assertEqual(response.status_code,503,response.text)
        workspace=await self.workspace()
        self.assertEqual(workspace['configuration']['implementation_group'],1)
        self.assertEqual(len(workspace['assessments']),130)
        self.assertEqual(len(workspace['active_definition_ids']),56)
        allowed=set(workspace['active_definition_ids'])
        reviews=await s.db.reviews.find({'client_id':'a'}).to_list(None)
        self.assertEqual(len(reviews),15)
        for review in reviews:
            for driver in review['framework_drivers']:
                if driver['framework_key']=='cis-ig1':
                    self.assertLessEqual(set(driver['framework_safeguards']),allowed)
                    if review['framework_plan_key'] in {'network-defense','secure-development','penetration-testing'}:
                        self.assertFalse(driver['framework_driver_active'])
                        self.assertFalse(review['framework_driver_active'])
        summary=(await self.client.get('/api/frameworks/summary',params={'client_id':'a'})).json()
        self.assertEqual(summary['items'][0]['total'],56)
        exported=await self.client.get('/api/frameworks/cis-ig1/export',params={'client_id':'a'})
        self.assertEqual(len(list(csv.DictReader(io.StringIO(exported.text)))),56)
        recovered=await self.scope(2,key=key)
        self.assertEqual(recovered.status_code,200,recovered.text)
        self.assertEqual((await self.workspace())['configuration']['implementation_group'],2)
        self.assertEqual(await s.db.reviews.count_documents({'client_id':'a'}),15)
        for review in await s.db.reviews.find({'client_id':'a'}).to_list(None):
            self.assertTrue(review['framework_driver_active'])

    async def test_reduction_preserves_other_review_drivers_and_audit_failure_recovers(self):
        s=harness.server
        await self.configure()
        original_audit=s.audit
        key=uuid.uuid4().hex
        failed_once=False
        async def fail_scope_audit(*args,**kwargs):
            nonlocal failed_once
            if args[1]=='CIS scope updated' and not failed_once:
                failed_once=True
                raise RuntimeError('Injected isolated audit persistence failure')
            return await original_audit(*args,**kwargs)
        with patch.object(s,'audit',side_effect=fail_scope_audit):
            first=await self.scope(2,key=key)
            self.assertEqual(first.status_code,503,first.text)
            retry=await self.scope(2,key=key)
            self.assertEqual(retry.status_code,200,retry.text)
        self.assertEqual(await s.db.audit_logs.count_documents({'action':'CIS scope updated'}),1)
        review=await s.db.reviews.find_one({'client_id':'a','framework_plan_key':'penetration-testing'})
        other={'framework_key':'iso-27001','framework_plan_key':'independent-iso-driver','framework_driver_active':True,'framework_safeguards':['A.8.29']}
        await s.db.reviews.update_one({'review_id':review['review_id']},{'$push':{'framework_drivers':other}})
        reduced=await self.scope(1,token=retry.json()['expected_updated_at'],confirm_reduction=True,reason='Scope reduction QA',effective_date='2026-10-03')
        self.assertEqual(reduced.status_code,200,reduced.text)
        retained=await s.db.reviews.find_one({'review_id':review['review_id']})
        self.assertIn(other,retained['framework_drivers'])
        replay=await self.scope(2,key=key)
        self.assertEqual(replay.json(),retry.json())
        self.assertEqual((await self.workspace())['configuration']['implementation_group'],1)

    async def test_postpublication_reduction_failure_has_no_active_ig2_review_drivers(self):
        s=harness.server
        await self.configure()
        upgraded=await self.scope(2)
        before=await s.db.framework_assessments.find({'client_id':'a'}).to_list(None)
        original_reconcile=framework_governance.reconcile
        async def fail_after_publication(*args,**kwargs):
            if kwargs.get('cis_active_configuration') is None:
                raise RuntimeError('Injected interruption immediately after reduced scope publication')
            await original_reconcile(*args,**kwargs)
        key=uuid.uuid4().hex
        context={'token':upgraded.json()['expected_updated_at'],'confirm_reduction':True,'reason':'Reduction recovery QA','effective_date':'2026-10-03'}
        with patch.object(framework_governance,'reconcile',side_effect=fail_after_publication):
            failed=await self.scope(1,key=key,**context)
        self.assertEqual(failed.status_code,503,failed.text)
        workspace=await self.workspace()
        self.assertEqual(workspace['configuration']['implementation_group'],1)
        allowed=set(workspace['active_definition_ids'])
        self.assertEqual(len(allowed),56)
        for review in await s.db.reviews.find({'client_id':'a'}).to_list(None):
            for driver in review['framework_drivers']:
                if driver['framework_key']=='cis-ig1' and driver['framework_driver_active']:
                    self.assertLessEqual(set(driver['framework_safeguards']),allowed)
            if review['framework_plan_key'] in {'network-defense','secure-development','penetration-testing'}:
                self.assertFalse(review['framework_driver_active'])
        retry=await self.scope(1,key=key,**context)
        self.assertEqual(retry.status_code,200,retry.text)
        self.assertEqual(await s.db.framework_assessments.find({'client_id':'a'}).to_list(None),before)
        reenabling=await self.scope(2,token=retry.json()['expected_updated_at'])
        self.assertEqual(reenabling.status_code,200,reenabling.text)
        self.assertEqual(await s.db.framework_assessments.find({'client_id':'a'}).to_list(None),before)
        self.assertEqual(await s.db.reviews.count_documents({'client_id':'a'}),15)
