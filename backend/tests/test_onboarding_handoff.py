import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from routes.onboarding import BASELINE_CATALOG as catalog


class OnboardingHandoffTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    def body(self):
        return {'client_id': 'a', 'finalize': True, 'state': {'version': 3, 'step': 3,
            'policies': {p['key']: ['yes','no','unsure'][i%3] for i,p in enumerate(catalog['policies'])},
            'requirements': {'cis-ig1':'applies','iso-27001':'unsure','hipaa':'does_not_apply'},
            'reviews':[catalog['reviews'][0]['key']]}}

    async def complete(self):
        self.sign_in('admin')
        response = await self.client.post('/api/onboarding/baseline', json=self.body())
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def snapshot(self):
        response = await self.client.get('/api/onboarding/handoff?client_id=a')
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_new_empty_and_completed_contract_no_fake_work(self):
        self.sign_in('admin')
        empty = await self.snapshot()
        self.assertFalse(empty['completed'])
        self.assertTrue(all(not r for r in empty['records'].values()))
        baseline = await self.complete()
        data = await self.snapshot()
        self.assertTrue(data['completed'])
        self.assertEqual(len(data['records']['policies']), 17)
        self.assertEqual(len(data['records']['framework_assessments']), 56)
        self.assertTrue(all(r['owner_id'] is None for r in data['records']['reviews']))
        self.assertEqual(baseline['policies'][catalog['policies'][2]['key']], 'unsure')
        for kind in ['tasks','findings','contacts']:
            self.assertEqual(await server.db[kind].count_documents({'client_id':'a'}),0)
        self.assertEqual(await server.db.users.count_documents({}),2)
        await self.complete()
        self.assertEqual((await self.snapshot())['records'], data['records'])

    async def test_current_records_change_without_altering_baseline(self):
        baseline = await self.complete()
        before = await self.snapshot()
        r = before['records']['reviews'][0]
        response = await self.client.patch('/api/reviews/'+r['review_id'], json={'due_date':'2027-01-15','recurrence':'annual','owner_id':'member'})
        self.assertEqual(response.status_code,200,response.text)
        p = next(p for p in before['records']['policies'] if p['presence']=='reported_existing')
        response = await self.client.post('/api/policies/'+p['policy_id']+'/verify',json={'status':'draft','version':'1.0'})
        self.assertEqual(response.status_code,200,response.text)
        a = before['records']['framework_assessments'][0]
        response = await self.client.patch('/api/framework_assessments/'+a['framework_assessment_id'],json={'status':'in_progress'})
        self.assertEqual(response.status_code,200,response.text)
        after = await self.snapshot()
        self.assertEqual(next(x for x in after['records']['reviews'] if x['review_id']==r['review_id'])['owner_id'],'member')
        self.assertEqual(next(x for x in after['records']['policies'] if x['policy_id']==p['policy_id'])['presence'],'verified_existing')
        self.assertEqual(next(x for x in after['records']['framework_assessments'] if x['framework_assessment_id']==a['framework_assessment_id'])['status'],'in_progress')
        self.assertEqual((await self.client.get('/api/onboarding/baseline?client_id=a')).json()['state'],baseline)

    async def test_read_authorization_minimal_payload_and_no_mutation(self):
        await self.complete()
        await server.db.reviews.insert_one({'review_id':'foreign','client_id':'b','title':'Private'})
        await server.db.users.insert_one({'user_id':'foreign','client_ids':['b'],'status':'active','role':'client_contributor','email':'foreign@example.com'})
        self.sign_in('member')
        data = await self.snapshot()
        self.assertEqual(data['people']['active_client_users'],1)
        self.assertTrue(data['people']['eligible_assignees_available'])
        self.assertNotIn('foreign',str(data))
        self.assertNotIn('email',str(data))
        for kind,rows in data['records'].items():
            self.assertTrue(all(r['client_id']=='a' for r in rows),kind)
        count = await server.db.audit_logs.count_documents({})
        await self.snapshot()
        self.assertEqual(await server.db.audit_logs.count_documents({}),count)
        self.assertEqual((await self.client.get('/api/onboarding/handoff?client_id=b')).status_code,403)
        self.client.headers.clear()
        self.assertIn((await self.client.get('/api/onboarding/handoff?client_id=a')).status_code,(401,403))

    async def test_people_contact_only_disabled_and_no_lead_are_not_completion_errors(self):
        await server.db.contacts.insert_one({'client_id':'a','contact_id':'maya','name':'Maya Chen','status':'active'})
        await server.db.clients.update_one({'client_id':'a'},{'$set':{'primary_contact_id':'maya'}})
        await server.db.users.update_one({'user_id':'member'},{'$set':{'status':'disabled'}})
        await self.complete()
        data = await self.snapshot()
        self.assertEqual(data['people']['contacts'],1)
        self.assertEqual(data['people']['active_client_users'],0)
        self.assertTrue(data['people']['eligible_assignees_available']) # Existing internal scope.
        self.assertIsNone(data['client']['assigned_owner_id'])
        self.assertEqual(data['client']['primary_contact_record']['name'],'Maya Chen')
        self.assertFalse(await server.db.users.find_one({'name':'Maya Chen'}))

    async def test_program_evolution_does_not_replay_intake_or_destroy_history(self):
        baseline = await self.complete()
        before = await self.snapshot()
        for key,value in [('soc-2','applies'),('cis-ig1','does_not_apply'),('cis-ig1','applies')]:
            response = await self.client.patch('/api/onboarding/programs/'+key,json={'client_id':'a','applicability':value})
            self.assertEqual(response.status_code,200,response.text)
        after = await self.snapshot()
        for kind in ['policies','reviews','framework_assessments']:
            self.assertEqual(after['records'][kind],before['records'][kind])
        self.assertEqual(next(r for r in after['records']['requirements'] if r['baseline_key']=='soc-2')['baseline_response'],'applies')
        self.assertEqual((await self.client.get('/api/onboarding/baseline?client_id=a')).json()['state'],baseline)
        self.assertEqual(await server.db.tasks.count_documents({}),0)

    async def test_program_write_restrictions_and_invalid_payload(self):
        self.sign_in('admin')
        body = {'client_id':'a','applicability':'applies'}
        self.assertEqual((await self.client.patch('/api/onboarding/programs/cis-ig1',json=body)).status_code,409)
        await self.complete()
        for key,payload in [('unknown',body),('cis-ig1',{**body,'applicability':'certified'}),('cis-ig1',{**body,'role':'super_admin'})]:
            self.assertEqual((await self.client.patch('/api/onboarding/programs/'+key,json=payload)).status_code,422)
        self.sign_in('member')
        self.assertEqual((await self.client.patch('/api/onboarding/programs/cis-ig1',json={**body,'client_id':'b'})).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.patch('/api/onboarding/programs/cis-ig1',json=body)).status_code,403)

    async def test_bounded_read_fails_instead_of_inaccurate_counts(self):
        self.sign_in('admin')
        await server.db.reviews.insert_many([{'client_id':'a','review_id':str(i)} for i in range(2001)])
        self.assertEqual((await self.client.get('/api/onboarding/handoff?client_id=a')).status_code,413)
