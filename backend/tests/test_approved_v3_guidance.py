"""The approved interview has its own actor-bound contract beside the native guides."""
import unittest

import approved_v3_guidance as guide
import test_framework_governance as harness


class ApprovedGuidanceTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.FrameworkTests.asyncSetUp
    sign_in = harness.FrameworkTests.sign_in
    configure = harness.FrameworkTests.configure
    body = harness.FrameworkTests.body

    async def context(self):
        row = (await self.configure())['assessments'][0]
        await harness.server.db.clients.update_one({'client_id':'a'},{'$set':{'approved_v3_source':guide.SOURCE_MARK}})
        client = await harness.server.db.clients.find_one({'client_id': 'a'})
        path = '/api/framework_assessments/' + row['framework_assessment_id']
        return row, path, {'version': guide.SOURCE_SHA256, 'expected_revision': 0,
            'expected_assessment_token': row.get('last_saved') or row.get('last_assessed'),
            'expected_client_updated_at': client.get('updated_at'),
            'checkpoint': {'stage': 'q', 'idx': 1, 'ans': {'freq': 'Every six months'}}}

    async def test_reviewed_text_and_items_save_once_to_assessment_and_its_history(self):
        row, path, draft = await self.context()
        url = path + '/approved-guide'
        progress = await self.client.put(url, json=draft)
        self.assertEqual(progress.status_code, 200, progress.text)
        self.assertEqual((await self.client.put(url, json=draft)).json(), progress.json())
        self.assertEqual((await self.client.get(path)).json()['status'], row['status'])
        self.assertEqual((await self.client.get(path + '/guided-assessment')).json()['revision'], 0)
        self.assertEqual((await self.client.put(url, json={**draft, 'checkpoint': {'stage':'q','idx':2,'ans':{}}})).status_code,409)
        approved = {**draft,'reviewed':True,'expected_revision':1,
            'checkpoint':{**draft['checkpoint'],'stage':'applied','draft':'Observed inventory process.\n\nIdentified gaps\n- Confirm all devices.'}}
        response = await self.client.put(url, json=approved)
        self.assertEqual(response.status_code,200,response.text)
        ref = {k:response.json()[k] for k in ('version','revision','digest')}
        intent = {'approved_v3_guide':ref, 'implementation':'Observed inventory process.',
                  'expected_last_assessed':draft['expected_assessment_token'],
                  'item_draft':{'expected_revision':0,'operations':[{'operation':'add','request_id':'approved_v3_item_26',
                      'item_type':'confirmation','text':'Confirm all devices.'}]}}
        self.assertEqual((await self.client.patch(path,json={**intent,'implementation':'Unreviewed change'})).status_code,422)
        for extra, include_items in (({'status':'in_progress'}, True), ({'status':'addressed'}, False),
                                     ({'verification':'verified'}, True)):
            with self.subTest(extra=extra, include_items=include_items):
                proposed = {**intent, **extra}
                if not include_items:
                    proposed.pop('item_draft')
                rejected = await self.client.patch(path,json=proposed)
                self.assertEqual(rejected.status_code,422,rejected.text)
        unchanged = (await self.client.get(path)).json()
        self.assertEqual(unchanged['status'],row['status'])
        self.assertEqual(unchanged.get('items_to_address',[]),row.get('items_to_address',[]))
        self.assertEqual(unchanged.get('assessment_history',[]),row.get('assessment_history',[]))
        saved = await self.client.patch(path,json=intent)
        self.assertEqual(saved.status_code,200,saved.text)
        self.assertEqual(saved.json()['status'],row['status'])
        self.assertEqual(saved.json()['implementation'],intent['implementation'])
        self.assertEqual(saved.json()['approved_v3_guide']['by'],'admin')
        self.assertEqual(saved.json()['items_to_address'][0]['text'],'Confirm all devices.')
        self.assertEqual(saved.json()['assessment_history'][-1]['approved_v3_guide']['digest'],ref['digest'])
        self.assertNotIn('freq', str(saved.json()['assessment_history']))
        self.sign_in('member')
        self.assertEqual((await self.client.get(url)).json()['revision'],0)
        self.assertNotEqual((await self.client.patch(path,json=intent)).status_code,200)

    async def test_wrong_scope_stale_base_and_malformed_claims_cannot_save(self):
        row, path, draft = await self.context()
        url = path + '/approved-guide'
        for fields in ({'version':'0'*64}, {'expected_client_updated_at':'changed'},
                       {'expected_assessment_token':'changed'},{'user_id':'member'},{'reviewed':True},
                       {'checkpoint':{'stage':'q','idx':0,'ans':{'__proto__': {'other':'private'}}}}):
            with self.subTest(fields=fields):
                self.assertIn((await self.client.put(url,json={**draft,**fields})).status_code,(409,422))
        await harness.server.db.requirements.update_one({'client_id':'a','baseline_key':'cis-ig1'},
            {'$set':{'baseline_response':'unsure'}})
        self.assertEqual((await self.client.put(url,json=draft)).status_code,409)
        self.assertEqual(await harness.server.db.approved_v3_guidance.count_documents({}),0)

    async def test_first_guided_save_records_an_explicit_judgment_and_reviewed_text_once(self):
        row, path, draft = await self.context()
        wording = 'The synthetic inventory covers only managed laptops.'
        response = await self.client.put(path + '/approved-guide', json={
            **draft, 'reviewed': True,
            'checkpoint': {'stage': 'applied', 'idx': 1, 'ans': {'exist': 'Partially'}, 'draft': wording},
        })
        self.assertEqual(response.status_code, 200, response.text)
        reference = {key: response.json()[key] for key in ('version', 'revision', 'digest')}
        before = (await self.client.get(path)).json()
        self.assertEqual(before['status'], 'not_assessed')
        intent = {
            'approved_v3_guide': reference, 'implementation': wording,
            'expected_last_assessed': draft['expected_assessment_token'],
            'status': 'in_progress', 'record_approved_v3_judgment': True,
            'item_draft': {'expected_revision': 0, 'operations': [{
                'operation': 'add', 'request_id': 'approved_v3_item_27',
                'item_type': 'confirmation', 'text': 'Confirm unmanaged devices.',
            }]},
        }
        self.assertEqual((await self.client.patch(path, json={**intent, 'verification': 'verified'})).status_code, 422)
        self.assertEqual((await self.client.patch(path, json={**intent, 'implementation': 'Unreviewed change'})).status_code, 422)
        saved = await self.client.patch(path, json=intent)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.sign_in('admin')
        reopened = (await self.client.get(path)).json()
        self.assertEqual(reopened['framework_assessment_id'], row['framework_assessment_id'])
        self.assertEqual(reopened['status'], 'in_progress')
        for field in ('verification', 'verification_checklist'):
            self.assertEqual(reopened.get(field), before.get(field))
        self.assertEqual(reopened['implementation'], wording)
        self.assertEqual(len(reopened['assessment_history']), len(before.get('assessment_history', [])) + 1)
        self.assertEqual(reopened['assessment_history'][-1]['implementation'], wording)
        self.assertEqual(reopened['items_to_address'][0]['text'], 'Confirm unmanaged devices.')

    async def test_reviewed_implementation_and_recurring_activity_use_the_same_native_save(self):
        row,path,draft=await self.context()
        context=(await self.client.get(path+'/service-context')).json()
        activity=context['candidates'][0]
        wording='The reported inventory is reviewed every six months.'
        response=await self.client.put(path+'/approved-guide',json={**draft,'reviewed':True,
            'checkpoint':{'stage':'applied','idx':7,'ans':{'ticket':'57842','tool':['ninjaone']},'draft':wording}})
        self.assertEqual(response.status_code,200,response.text)
        ref={k:response.json()[k] for k in ('version','revision','digest')}
        body={'expected_last_assessed':draft['expected_assessment_token'],'implementation':wording,'approved_v3_guide':ref,
            'coordination':{'activity_id':activity['activity_id'],'review_id':activity['review_id'],'expected_updated_at':activity['expected_updated_at'],
                'expected_client_updated_at':context['expected_client_updated_at'],'recurring_ticket_number':'57842','cadence':'semiannual',
                'first_next_due':'2027-02-01','area_id':activity['area_id'],'tool_ids':['ninjaone'],'ticket_confirmed':True}}
        headers={'Idempotency-Key':'approved-v3-coordination-0001'}
        first=await self.client.patch(path,json=body,headers=headers)
        self.assertEqual(first.status_code,200,first.text)
        repeat=await self.client.patch(path,json=body,headers=headers)
        self.assertEqual(repeat.status_code,200,repeat.text)
        current=(await self.client.get(path+'/service-context')).json()
        activity=next(r for r in current['candidates'] if r['activity_id']==current['selected_activity_id'])
        self.assertEqual(activity['setup']['recurring_ticket_number'],'57842')
        self.assertEqual(activity['first_next_due'],'2027-02-01')
        self.assertIn('ninjaone',current['services']['areas'][activity['area_id']]['tool_ids'])
        self.assertEqual(len((await self.client.get(path)).json()['assessment_history']),len(row.get('assessment_history',[]))+1)
