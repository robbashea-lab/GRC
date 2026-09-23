import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
import test_onboarding_handoff as onboarding_tests


class ClientProfileTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in
    body = onboarding_tests.OnboardingHandoffTests.body
    complete = onboarding_tests.OnboardingHandoffTests.complete

    async def profile(self):
        response=await self.client.get('/api/clients/a/profile')
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    async def save(self,section,values,**kwargs):
        p=await self.profile()
        return await self.client.patch('/api/clients/a/profile',json={'section':section,'values':values,'expected_updated_at':p['updated_at'],**kwargs})

    async def test_typed_context_concurrency_and_audit(self):
        self.sign_in('admin')
        self.assertEqual((await self.profile())['profile'],{})
        response=await self.save('organization',{'employees':0,'workforce':'Unknown','country':'  US  '})
        self.assertEqual(response.status_code,200,response.text)
        p=await self.profile()
        self.assertEqual(p['profile']['organization'],{'employees':0,'workforce':'Unknown','country':'US'})
        self.assertEqual(p['history'][0]['meta']['changes']['country'],{'before':None,'after':'US'})
        for section,values in [('organization',{'employees':True}),('organization',{'employees':-1}),('organization',{'bogus':'x'}),('technical',{'cloud':['Unknown','AWS']}),('security',{'data_types':['Invented']}),('organization',{'insurance_renewal':'2026-02-30'})]:
            self.assertEqual((await self.save(section,values)).status_code,422)
        self.assertEqual((await self.save('organization',{'employees':5},expected_updated_at=None)).status_code,409)
        self.assertEqual(await server.db.risks.count_documents({}),0)
        self.assertEqual(await server.db.vendors.count_documents({}),0)

    async def test_permissions_no_cross_client_and_reserved_snapshot(self):
        self.sign_in('member')
        self.assertEqual((await self.client.get('/api/clients/b/profile')).status_code,403)
        self.assertEqual((await self.save('organization',{'employees':5})).status_code,403)
        self.sign_in('admin')
        response=await self.client.patch('/api/clients/a',json={'initial_program_baseline':{'fake':True}})
        # The existing ClientPatch model ignores extra input; it must not write it.
        self.assertIsNone((await server.db.clients.find_one({'client_id':'a'})).get('initial_program_baseline'))

    async def test_baseline_retirement_and_reactivation_preserve_records(self):
        await self.complete()
        initial=(await self.profile())['baseline']
        self.assertEqual(initial['policies'],17)
        self.assertIsNotNone(initial['completed_at'])
        reviews=await server.db.reviews.find({'client_id':'a'}).to_list(None)
        assessments=await server.db.framework_assessments.count_documents({'client_id':'a'})
        self.assertEqual((await self.client.patch('/api/onboarding/programs/cis-ig1',json={'client_id':'a','applicability':'retired'})).status_code,422)
        payload={'client_id':'a','applicability':'retired','reason':'Program discontinued','effective_date':'2026-01-01'}
        response=await self.client.patch('/api/onboarding/programs/cis-ig1',json=payload)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),assessments)
        historical=await self.client.get('/api/frameworks/cis-ig1?client_id=a')
        self.assertEqual(historical.status_code,200)
        self.assertFalse(historical.json()['selected'])
        self.assertEqual(len(historical.json()['assessments']),assessments)
        for row in reviews:
            retained=await server.db.reviews.find_one({'review_id':row['review_id']})
            for field in ['status','due_date','recurrence','owner_id']:
                self.assertEqual(retained.get(field),row.get(field))
        self.assertEqual((await self.profile())['baseline'],initial)
        await self.save('security',{'data_types':['CUI'],'incident_response':'Partial'})
        await self.client.patch('/api/onboarding/programs/cis-ig1',json={'client_id':'a','applicability':'applies'})
        await self.complete()
        self.assertEqual((await self.profile())['baseline'],initial)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),len(reviews))

    async def test_legacy_client_not_reonboarded_or_fabricated(self):
        self.sign_in('admin')
        await server.db.clients.update_one({'client_id':'a'},{'$set':{'onboarding_baseline':{'completed':True,'requirements':{'hipaa':'applies'}}}})
        p=await self.profile()
        self.assertTrue(p['completed'])
        self.assertTrue(p['baseline']['legacy'])
        self.assertIsNone(p['baseline']['completed_at'])
        self.assertNotIn('reviews',p['baseline'])
        self.assertIsNone((await server.db.clients.find_one({'client_id':'a'})).get('initial_program_baseline'))

    async def test_original_six_step_completion_is_recognized_without_fabrication(self):
        self.sign_in('admin')
        await server.db.audit_logs.insert_one({'client_id':'a','action':'onboarding-complete','at':'2025-01-01T00:00:00Z','user_id':'admin'})
        p=await self.profile()
        self.assertTrue(p['completed'])
        self.assertEqual(p['baseline']['state'],{})
        self.assertEqual(p['baseline']['completed_at'],'2025-01-01T00:00:00Z')
        handoff=await self.client.get('/api/onboarding/handoff?client_id=a')
        self.assertTrue(handoff.json()['completed'])
        response=await self.client.patch('/api/onboarding/programs/cmmc',json={'client_id':'a','applicability':'applies'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(await server.db.framework_assessments.count_documents({}),0)
