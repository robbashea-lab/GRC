"""Actual IG3 content through isolated routes; release enabled only in the test."""
import asyncio
import copy
import csv
import io
import uuid
import unittest
from unittest.mock import patch

import test_framework_governance as harness
import test_cis_ig2 as ig2
import framework_governance
from framework_catalog import CIS

IG3_IDS = '1.5 2.7 3.13 3.14 4.12 6.8 8.12 9.7 12.8 13.7 13.8 13.9 13.10 13.11 15.5 15.6 15.7 16.12 16.13 16.14 17.9 18.4 18.5'.split()


class CisIG3ScopeTests(unittest.IsolatedAsyncioTestCase):
    sign_in = harness.FrameworkTests.sign_in
    body = harness.FrameworkTests.body
    configure = harness.FrameworkTests.configure
    scope = ig2.CisIG2Tests.scope
    workspace = ig2.CisIG2Tests.workspace

    async def asyncSetUp(self):
        await harness.FrameworkTests.asyncSetUp(self)
        fixture = copy.deepcopy(CIS)
        fixture['available_implementation_groups'] = [1, 2, 3]
        override = patch.dict(CIS, fixture)
        override.start()
        self.addCleanup(override.stop)

    async def test_all_transitions_preserve_rows_reviews_and_exports(self):
        await self.configure()
        db = harness.server.db
        row = await db.framework_assessments.find_one({'client_id':'a'})
        saved = {'implementation':'Saved process','owner_id':'admin','verification':'verified',
                 'assessment_history':[{'implementation':'Original'}], 'related_control_ids':['existing-control']}
        await db.framework_assessments.update_one({'framework_assessment_id':row['framework_assessment_id']},{'$set':saved})
        original_reviews = await db.reviews.find({'client_id':'a'}).to_list(None)
        token = None
        identities = None
        for group, count in [(3,153),(2,130),(3,153),(1,56),(3,153)]:
            before = (await self.workspace())['configuration']['implementation_group']
            context = {'confirm_reduction':True,'reason':'Synthetic transition','effective_date':'2026-10-03'} if group<before else {}
            response = await self.scope(group,token=token,**context)
            self.assertEqual(response.status_code,200,response.text)
            token = response.json()['expected_updated_at']
            workspace = await self.workspace()
            self.assertEqual(len(workspace['active_definition_ids']),count)
            self.assertEqual(len(set(workspace['active_definition_ids'])),count)
            rows = await db.framework_assessments.find({'client_id':'a'}).to_list(None)
            current = {r['definition_id']:r['framework_assessment_id'] for r in rows}
            self.assertEqual(len(current),153)
            if identities is not None:self.assertEqual(current,identities)
            identities = current
            retained = next(r for r in rows if r['framework_assessment_id']==row['framework_assessment_id'])
            self.assertEqual({k:retained[k] for k in saved},saved)
            reviews = await db.reviews.find({'client_id':'a'}).to_list(None)
            self.assertLessEqual({r['review_id'] for r in original_reviews},{r['review_id'] for r in reviews})
            for original in original_reviews:
                current_review = next(r for r in reviews if r['review_id']==original['review_id'])
                for field in ['title','description','owner_id','due_date','recurrence','occurrences']:
                    self.assertEqual(current_review.get(field),original.get(field))
            self.assertEqual(len(reviews),15)
            exported = await self.client.get('/api/frameworks/cis-ig1/export',params={'client_id':'a'})
            records = list(csv.DictReader(io.StringIO(exported.text)))
            self.assertEqual(len(records),count)
            if group==3:self.assertEqual(sum(r['scope_group']=='Added in IG3' for r in records),23)

    async def test_new_ig3_and_add_to_other_program(self):
        body = self.body()
        body['state']['framework_settings'] = {'cis-ig1':{'implementation_group':3}}
        self.assertEqual(len((await self.configure(body))['assessments']),153)
        await self.configure(self.body(programs=('hipaa',),cid='b'))
        before = await harness.server.db.framework_assessments.find({'client_id':'b'}).to_list(None)
        response = await self.client.patch('/api/onboarding/programs/cis-ig1',json={'client_id':'b','applicability':'applies','implementation_group':3})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(await harness.server.db.framework_assessments.count_documents({'client_id':'b','framework_key':'cis-ig1'}),153)
        for row in before:self.assertEqual(await harness.server.db.framework_assessments.find_one({'framework_assessment_id':row['framework_assessment_id']}),row)

    async def test_failure_retry_concurrency_and_reduction_confirmation(self):
        await self.configure()
        original = framework_governance.reconcile
        async def interrupted(*args,**kwargs):
            await original(*args,**kwargs)
            if kwargs.get('cis_active_configuration') is not None:raise RuntimeError('Synthetic prepublication failure')
        key = uuid.uuid4().hex
        with patch.object(framework_governance,'reconcile',side_effect=interrupted):
            self.assertEqual((await self.scope(3,key=key)).status_code,503)
        self.assertEqual(len((await self.workspace())['active_definition_ids']),56)
        response = await self.scope(3,key=key)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual((await self.scope(3,key=key)).json(),response.json())
        token = response.json()['expected_updated_at']
        self.assertEqual((await self.scope(2,token=token)).status_code,422)
        results = await asyncio.gather(self.scope(3,token=token),self.scope(3,token=token))
        self.assertEqual(sorted(r.status_code for r in results),[200,409])
        self.assertEqual(await harness.server.db.framework_assessments.count_documents({'client_id':'a'}),153)

    async def test_gate_rejects_every_entry_point_without_writes(self):
        CIS['available_implementation_groups'] = [1,2]
        await self.configure()
        before = await harness.server.db.clients.find_one({'client_id':'a'})
        self.assertEqual((await self.scope(3)).status_code,422)
        self.assertEqual(await harness.server.db.clients.find_one({'client_id':'a'}),before)
        body = self.body(cid='b');body['state']['framework_settings']={'cis-ig1':{'implementation_group':3}}
        self.assertEqual((await self.client.post('/api/onboarding/baseline',json=body)).status_code,422)
        await self.configure(self.body(programs=('hipaa',),cid='b'))
        before = await harness.server.db.clients.find_one({'client_id':'b'})
        response = await self.client.patch('/api/onboarding/programs/cis-ig1',json={'client_id':'b','applicability':'applies','implementation_group':3})
        self.assertEqual(response.status_code,422,response.text)
        self.assertEqual(await harness.server.db.clients.find_one({'client_id':'b'}),before)

    async def test_permissions_and_invalid_groups(self):
        await self.configure()
        for group in [True,'3',0,4,None]:self.assertEqual((await self.scope(group)).status_code,422)
        self.sign_in('member')
        self.assertEqual((await self.scope(3)).status_code,403)
        await harness.server.db.users.update_one({'user_id':'member'},{'$set':{'role':'platform_admin','client_ids':['b']}})
        self.assertEqual((await self.scope(3)).status_code,403)

    async def test_postpublication_reduction_recovery_retains_history_and_open_work(self):
        await self.configure()
        upgraded = await self.scope(3)
        db = harness.server.db
        before = await db.framework_assessments.find({'client_id':'a'}).to_list(None)
        await db.tasks.insert_one({'task_id':'synthetic-open','client_id':'a','status':'open','framework_assessment_id':before[-1]['framework_assessment_id']})
        original = framework_governance.reconcile
        async def interrupted(*args,**kwargs):
            if kwargs.get('cis_active_configuration') is None:raise RuntimeError('Synthetic postpublication failure')
            await original(*args,**kwargs)
        context = {'token':upgraded.json()['expected_updated_at'],'confirm_reduction':True,'reason':'Synthetic reduction','effective_date':'2026-10-03'}
        key = uuid.uuid4().hex
        with patch.object(framework_governance,'reconcile',side_effect=interrupted):
            self.assertEqual((await self.scope(2,key=key,**context)).status_code,503)
        workspace = await self.workspace()
        allowed = set(workspace['active_definition_ids'])
        self.assertEqual(len(allowed),130)
        for review in await db.reviews.find({'client_id':'a'}).to_list(None):
            for driver in review['framework_drivers']:
                if driver['framework_key']=='cis-ig1' and driver['framework_driver_active']:
                    self.assertLessEqual(set(driver['framework_safeguards']),allowed)
        self.assertEqual((await self.scope(2,key=key,**context)).status_code,200)
        self.assertEqual(await db.framework_assessments.find({'client_id':'a'}).to_list(None),before)
        self.assertEqual((await db.tasks.find_one({'task_id':'synthetic-open'}))['status'],'open')

    async def test_optional_weekly_review_is_explicit_and_reused_after_scope_changes(self):
        await self.configure()
        await self.scope(3)
        db=harness.server.db
        self.assertEqual(await db.reviews.count_documents({'client_id':'a'}),15)
        row=await db.framework_assessments.find_one({'client_id':'a','definition_id':'1.5'})
        body={'plan_key':'passive-discovery-reconciliation','title':'Client discovery reconciliation','recurrence':'custom','custom_recurrence_days':7}
        path='/api/framework_assessments/'+row['framework_assessment_id']+'/reviews'
        invalid=await self.client.post(path,json={**body,'custom_recurrence_days':0})
        self.assertEqual(invalid.status_code,422)
        created=await self.client.post(path,json=body)
        self.assertEqual(created.status_code,200,created.text)
        self.assertEqual(created.json()['custom_recurrence_days'],7)
        retry=await self.client.post(path,json=body)
        self.assertEqual(retry.json()['review_id'],created.json()['review_id'])
        self.assertEqual(await db.reviews.count_documents({'client_id':'a'}),16)
        token=(await self.workspace())['configuration']['expected_updated_at']
        reduced=await self.scope(2,token=token,confirm_reduction=True,reason='Isolated preservation check',effective_date='2026-10-03')
        self.assertEqual(reduced.status_code,200,reduced.text)
        await self.scope(3,token=reduced.json()['expected_updated_at'])
        retained=await db.reviews.find_one({'review_id':created.json()['review_id']})
        self.assertEqual((retained['title'],retained['recurrence'],retained['custom_recurrence_days']),('Client discovery reconciliation','custom',7))
        self.assertTrue(retained['framework_driver_active'])
