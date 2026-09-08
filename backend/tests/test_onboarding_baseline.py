import json
import unittest
from pathlib import Path
from backend.tests.test_client_dashboard_sources import ClientDashboardSourcesTests, server
from routes.onboarding import BASELINE_CATALOG as catalog

class BaselineTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = ClientDashboardSourcesTests.asyncSetUp
    sign_in = ClientDashboardSourcesTests.sign_in

    def body(self, cid='a'):
        return {'client_id':cid,'finalize':True,'state':{'policies':{r['key']:['yes','no','unsure'][i%3] for i,r in enumerate(catalog['policies'])},'requirements':{r['key']:['applies','does_not_apply','unsure'][i%3] for i,r in enumerate(catalog['requirements'])},'reviews':[r['key'] for r in catalog['reviews'][1:]]}}

    async def test_baseline_idempotence_and_existing_metadata(self):
        self.sign_in('admin')
        c = (await self.client.get('/api/onboarding/baseline?client_id=a')).json()
        self.assertEqual(len(c['state']['reviews']),17)
        self.assertEqual(catalog,json.loads((Path(__file__).resolve().parents[2]/'frontend/src/lib/onboardingCatalog.json').read_text()))
        await server.db.contacts.insert_one({'client_id':'a','contact_id':'old','name':'Preserved'})
        await server.db.requirements.insert_one({'client_id':'a','requirement_id':'soc','title':'SOC 2'})
        body=self.body()
        response=await self.client.post('/api/onboarding/baseline',json=body)
        self.assertEqual(response.status_code,200,response.text)
        reviews=await server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(100)
        self.assertEqual(len(reviews),16)
        for r in reviews:
            self.assertEqual(r['status'],'needs_scheduling')
            for k in ['owner_id','due_date','recurrence','next_review_date']:self.assertIsNone(r[k])
        chosen=reviews[0]['review_id']
        await server.db.reviews.update_one({'review_id':chosen},{'$set':{'title':'Renamed','due_date':'2027-01-01','recurrence':'annual','owner_id':'admin','status':'completed','notes':'Keep'}})
        self.assertEqual((await self.client.post('/api/onboarding/baseline',json=body)).status_code,200)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),16)
        self.assertEqual(await server.db.policies.count_documents({'client_id':'a'}),17)
        self.assertEqual(await server.db.requirements.count_documents({'client_id':'a'}),6)
        self.assertEqual(await server.db.contacts.count_documents({'client_id':'a'}),1)
        self.assertEqual(await server.db.risks.count_documents({}),0)
        self.assertEqual(await server.db.tasks.count_documents({}),0)
        self.assertEqual((await server.db.reviews.find_one({'review_id':chosen}))['notes'],'Keep')
        state=(await self.client.get('/api/onboarding/baseline?client_id=a')).json()['state']
        self.assertTrue(state['completed']);self.assertEqual(state['reviews'],body['state']['reviews'])
        self.assertEqual((await self.client.get('/api/onboarding/baseline?client_id=b')).json()['state']['policies'][catalog['policies'][0]['key']],'')

    async def test_auth_and_validation_before_writes(self):
        self.sign_in('member')
        self.assertEqual((await self.client.post('/api/onboarding/baseline',json=self.body('b'))).status_code,403)
        self.assertEqual((await self.client.get('/api/onboarding/baseline?client_id=b')).status_code,403)
        body=self.body();body['state']['policies'][catalog['policies'][0]['key']]='na'
        self.assertEqual((await self.client.post('/api/onboarding/baseline',json=body)).status_code,400)
        self.assertEqual(await server.db.policies.count_documents({}),0)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.post('/api/onboarding/baseline',json=self.body())).status_code,403)
