"""Pilot routes against the existing isolated authorization harness."""
import unittest
import test_framework_governance as harness
from guided_assessment import CATALOG
server=harness.server

class GuidedTests(unittest.IsolatedAsyncioTestCase):
    sign_in=harness.FrameworkTests.sign_in
    configure=harness.FrameworkTests.configure
    body=harness.FrameworkTests.body
    async def asyncSetUp(self):
        await harness.FrameworkTests.asyncSetUp(self)
        workspace=await self.configure()
        self.row=next(a for a in workspace['assessments'] if a['definition_id']=='1.1')
        self.foreign=self.row['framework_assessment_id']
        self.aid='pilot-1.1'
        await server.db.clients.insert_one({'client_id':'demo_brawndo','name':'Brawndo','status':'active'})
        await server.db.framework_assessments.insert_one({**self.row,'_id':self.aid,'framework_assessment_id':self.aid,'client_id':'demo_brawndo','owner_id':'member'})
        self.path='/api/framework_assessments/'+self.aid+'/guided-assessment'
        self.pilot_body={'version':CATALOG['version'],'answers':{'inventory':'No','existing':'Manual records'},'step':1,'completed':False,'expected_revision':0}

    async def test_pilot_save_resume_is_separate_and_conflict_safe(self):
        before=await server.db.framework_assessments.find_one({'framework_assessment_id':self.aid})
        first=await self.client.put(self.path,json=self.pilot_body)
        self.assertEqual(first.status_code,200,first.text)
        resumed=await self.client.get(self.path)
        self.assertEqual(resumed.json()['answers'],self.pilot_body['answers'])
        stale=await self.client.put(self.path,json=self.pilot_body)
        self.assertEqual(stale.status_code,409,stale.text)
        after=await server.db.framework_assessments.find_one({'framework_assessment_id':self.aid})
        self.assertEqual(before,after)

    async def test_authorization_scope_user_isolation_and_answer_validation(self):
        self.sign_in('member')
        self.assertEqual((await self.client.get(self.path)).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$addToSet':{'client_ids':'demo_brawndo'}})
        self.assertEqual((await self.client.put(self.path,json=self.pilot_body)).status_code,200)
        self.sign_in('admin')
        self.assertEqual((await self.client.get(self.path)).json()['answers'],{})
        unsupported='/api/framework_assessments/'+self.foreign+'/guided-assessment'
        self.assertEqual((await self.client.get(unsupported)).status_code,404)
        for bad in [{'foreign':'secret'},{'coverage':{'Foreign':'Yes'}},{'owner':'x'*2001}]:
            self.assertEqual((await self.client.put(self.path,json={**self.pilot_body,'answers':bad})).status_code,422)
        await server.db.clients.update_one({'client_id':'demo_brawndo'},{'$set':{'framework_settings':{'cis-ig1':{'implementation_group':2}}}})
        self.assertEqual((await self.client.get(self.path)).status_code,404)

    async def test_apply_source_snapshot_native_save_and_manual_edit(self):
        draft=(await self.client.put(self.path,json={**self.pilot_body,'completed':True})).json()
        source={k:draft[k] for k in ('version','revision','generated_at')}
        saved=await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Brawndo reports no inventory.','status':'needs_attention','guided_assessment_source':source})
        self.assertEqual(saved.status_code,200,saved.text)
        row=saved.json()
        self.assertTrue(row['last_assessed'])
        self.assertEqual(row['guided_assessment_source']['answers'],self.pilot_body['answers'])
        self.assertEqual(row['assessment_history'][-1]['guided_assessment_source']['origin'],'guided-assessment-pilot')
        self.assertNotEqual(row.get('verification'),'verified')
        edited=await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Manually revised'})
        self.assertEqual(edited.status_code,200,edited.text)
        self.assertIsNone(edited.json()['guided_assessment_source'])
        self.assertEqual(edited.json()['assessment_history'][-2]['guided_assessment_source']['version'],CATALOG['version'])
