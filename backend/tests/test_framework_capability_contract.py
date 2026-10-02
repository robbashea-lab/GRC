"""Shared capability scenarios against real API routes and an isolated database."""
import json
from pathlib import Path
import unittest
from test_client_dashboard_sources import server
from test_framework_governance import FrameworkTests as Base

CONTRACT=json.loads((Path(__file__).resolve().parents[2]/'shared/contracts/framework-capabilities.json').read_text())


class FrameworkCapabilityContractTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=Base.asyncSetUp
    sign_in=Base.sign_in
    body=Base.body

    async def workspace(self):
        cid=CONTRACT['client_id']
        await server.db.clients.insert_one({'client_id':cid,'name':'New capability contract client','status':'active'})
        self.sign_in('admin')
        response=await self.client.post('/api/onboarding/baseline',json=self.body(programs=('cis-ig1','soc-2','iso-27001'),cid=cid))
        self.assertEqual(response.status_code,200,response.text)
        rows=await server.db.framework_assessments.find({'client_id':cid},{'_id':0}).to_list(None)
        return {(r['framework_key'],r['definition_id']):r for r in rows}

    async def test_shared_acceptance_rejection_and_stale_contract(self):
        rows=await self.workspace()
        for case in CONTRACT['framework_cases']:
            with self.subTest(case['name']):
                row=rows[case['framework'],case['definition']]
                path='/api/framework_assessments/'+row['framework_assessment_id']
                before=(await self.client.get(path)).json()
                result=await self.client.patch(path,json={**case['patch'],'expected_last_assessed':before.get('last_assessed')})
                self.assertEqual(result.status_code,case['status'],result.text)
                if case['status']==200:
                    for field,value in case['patch'].items():self.assertEqual(result.json()[field],value)
                else:
                    self.assertEqual((await self.client.get(path)).json(),before)
        row=rows['cis-ig1','1.1']
        stale=await self.client.patch('/api/framework_assessments/'+row['framework_assessment_id'],json={'verification':'verified','expected_last_assessed':None})
        self.assertEqual(stale.status_code,CONTRACT['stale_write_status'],stale.text)

    async def test_capabilities_do_not_grant_permissions_or_membership(self):
        rows=await self.workspace()
        row=rows['cis-ig1','1.1'];cid=CONTRACT['client_id']
        for case in CONTRACT['access_cases']:
            with self.subTest(case['name']):
                await server.db.users.update_one({'user_id':'member'},{'$set':{'role':case['role'],'client_ids':[cid if case['client_scope']=='same' else 'b']}})
                self.sign_in('member')
                result=await self.client.patch('/api/framework_assessments/'+row['framework_assessment_id'],json={'cis_assessment_criteria':['1.1-c1'],'expected_last_assessed':None})
                self.assertEqual(result.status_code,case['status'],result.text)
        stored=await server.db.framework_assessments.find_one({'framework_assessment_id':row['framework_assessment_id']})
        self.assertNotIn('cis_assessment_criteria',stored)
