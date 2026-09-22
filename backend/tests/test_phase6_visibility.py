import unittest
import test_client_dashboard_sources as harness
from routes.onboarding import BASELINE_CATALOG

server = harness.server


class Phase6VisibilityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def configure(self):
        self.sign_in('admin')
        response = await self.client.post('/api/onboarding/baseline', json={'client_id':'a','finalize':True,'state':{
            'version':3,'policies':{p['key']:'unsure' for p in BASELINE_CATALOG['policies']},
            'requirements':{'cis-ig1':'applies','soc-2':'applies','iso-27001':'unsure'},'reviews':[]}})
        self.assertEqual(response.status_code,200,response.text)
        return (await self.client.get('/api/frameworks/cis-ig1?client_id=a')).json()['assessments']

    async def summary(self):
        result = await self.client.get('/api/frameworks/summary?client_id=a')
        self.assertEqual(result.status_code,200,result.text)
        return result.json()

    async def calendar(self,scope='all',start='2026-09-01',end='2026-12-31'):
        result = await self.client.get('/api/calendar',params={'client_id':'a','start':start,'end':end,'scope':scope})
        self.assertEqual(result.status_code,200,result.text)
        return [r for days in result.json().values() for items in days.values() for r in items]

    async def test_framework_counts_current_applicability_and_no_scores(self):
        rows = await self.configure()
        for row,status in zip(rows[:6],['in_progress']*3+['addressed']*2+['not_applicable']):
            result=await self.client.patch('/api/framework_assessments/'+row['framework_assessment_id'],json={
                'status':status,'implementation':'Recorded operating practice','na_rationale':'Outside selected business scope'})
            self.assertEqual(result.status_code,200,result.text)
        before=await self.summary()
        self.assertEqual([p['key'] for p in before['items']],['cis-ig1','soc-2'])
        cis=before['items'][0]
        self.assertEqual(cis['total'],56)
        self.assertEqual(cis['status_counts'],{'not_assessed':50,'in_progress':3,'addressed':2,'not_applicable':1,'needs_attention':0})
        self.assertIsNone(before['items'][1]['status_counts'])
        self.assertFalse(before['items'][1]['tracking_available'])
        self.assertNotIn('percent',str(before))
        await self.client.patch('/api/framework_assessments/'+rows[6]['framework_assessment_id'],json={'status':'in_progress'})
        self.assertEqual((await self.summary())['items'][0]['status_counts']['not_assessed'],49)
        self.assertEqual((await self.summary())['items'][0]['status_counts']['in_progress'],4)
        await self.client.patch('/api/onboarding/programs/cis-ig1',json={'client_id':'a','applicability':'does_not_apply'})
        self.assertEqual([p['key'] for p in (await self.summary())['items']],['soc-2'])
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),56)

    async def test_remediation_deduplicated_separate_from_assessment_and_evidence(self):
        row=(await self.configure())[0];aid=row['framework_assessment_id']
        await self.client.patch('/api/framework_assessments/'+aid,json={'status':'addressed','implementation':'Documented implementation'})
        f=await self.client.post('/api/framework_assessments/'+aid+'/findings',json={'title':'Inventory gap','remediation_title':'Reconcile inventory','request_id':'phase6'})
        self.assertEqual(f.status_code,200,f.text)
        fid=f.json()['finding_id']
        await self.client.post('/api/framework_assessments/'+aid+'/links',json={'kind':'findings','id':fid})
        await self.client.post('/api/evidence',json={'client_id':'a','linked_type':'framework_assessment','linked_id':aid,'filename':'record.txt','content_base64':'eA=='})
        summary=(await self.summary())['items'][0]
        self.assertEqual((summary['open_findings'],summary['open_actions'],summary['status_counts']['addressed']),(1,1,1))
        task=await server.db.tasks.find_one({'finding_id':fid})
        await self.client.patch('/api/tasks/'+task['task_id'],json={'status':'done'})
        summary=(await self.summary())['items'][0]
        self.assertEqual((summary['open_findings'],summary['open_actions']),(1,0))
        await self.client.post('/api/findings/'+fid+'/validate',json={'rationale':'Corrective work checked'})
        self.assertEqual((await self.summary())['items'][0]['open_findings'],0)

    async def test_summary_authorization_minimal_payload_and_read_has_no_side_effects(self):
        await self.configure()
        await server.db.framework_assessments.insert_one({'client_id':'b','framework_key':'cis-ig1','framework_assessment_id':'foreign','definition_id':'1.1','status':'addressed','implementation':'Private'})
        self.sign_in('member')
        before=await server.db.audit_logs.count_documents({})
        result=await self.summary()
        self.assertNotIn('Private',str(result));self.assertNotIn('implementation',str(result))
        self.assertEqual(result['client_id'],'a')
        self.assertEqual(await server.db.audit_logs.count_documents({}),before)
        self.assertEqual((await self.client.get('/api/frameworks/summary?client_id=b')).status_code,403)
        self.client.headers.clear()
        self.assertIn((await self.client.get('/api/frameworks/summary?client_id=a')).status_code,(401,403))

    async def test_calendar_actions_findings_live_status_and_due_dates(self):
        self.sign_in('admin')
        f=(await self.client.post('/api/findings',json={'client_id':'a','title':'NO ISP','due_date':'2026-10-02','severity':'high'})).json()
        task=(await self.client.post('/api/tasks',json={'client_id':'a','title':'MAKE AN ISP','due_date':'2026-10-02','priority':'high','source_type':'finding','source_id':f['finding_id']})).json()
        self.assertEqual(len(await self.calendar('active')),2)
        changed=await self.client.patch('/api/tasks/'+task['task_id'],json={'status':'done'})
        self.assertEqual(changed.status_code,200,changed.text)
        active=await self.calendar('active')
        self.assertEqual([(r['kind'],r['status']) for r in active],[('finding','remediated')])
        past=await self.calendar('history')
        self.assertEqual([(r['id'],r['due_date_iso'],r['can_reschedule']) for r in past],[(task['task_id'],'2026-10-02',False)])
        await self.client.post('/api/findings/'+f['finding_id']+'/validate',json={'rationale':'Approved document checked'})
        self.assertEqual(await self.calendar('active'),[])
        self.assertEqual({r['status'] for r in await self.calendar('history')},{'done','closed'})

    async def test_calendar_recurring_history_no_duplicate_one_time_and_permissions(self):
        self.sign_in('admin')
        for rid,cadence in [('q','quarterly'),('once','none')]:
            await server.db.reviews.insert_one({'client_id':'a','review_id':rid,'title':rid,'review_type':'access','due_date':'2026-09-30','recurrence':cadence,'status':'upcoming'})
            result=await self.client.post('/api/reviews/'+rid+'/complete',json={'occurrence_id':'occ_'+rid})
            self.assertEqual(result.status_code,200,result.text)
        rows=await self.calendar()
        self.assertEqual(len(rows),3)
        self.assertEqual(len({r['key'] for r in rows}),3)
        self.assertEqual({(r['period'],r['status']) for r in rows if r['id']=='q'},{('Q3 2026','completed'),('Q4 2026','upcoming')})
        self.assertTrue(all(not r['can_reschedule'] for r in rows if r['historical']))
        live=next(r for r in rows if not r['historical'])
        self.assertTrue(live['can_reschedule'])
        self.sign_in('member')
        self.assertFalse((await self.calendar('active'))[0]['can_reschedule'])
        denied=await self.client.patch('/api/reviews/q',json={'due_date':'2026-12-15','expected_occurrence_id':live['occurrence_id']})
        self.assertEqual(denied.status_code,403)
        self.sign_in('admin')
        allowed=await self.client.patch('/api/reviews/q',json={'due_date':'2026-12-15','expected_occurrence_id':live['occurrence_id']})
        self.assertEqual(allowed.status_code,200,allowed.text)
        self.assertEqual((await self.calendar('history'))[1]['due_date_iso'],'2026-09-30')

    async def test_calendar_boundaries_isolation_contract_source_and_invalid_range(self):
        self.sign_in('admin')
        for cid in ['a','b']:
            await server.db.reviews.insert_one({'client_id':cid,'review_id':cid,'title':cid,'status':'upcoming','recurrence':'annual','due_date':'2026-10-01','vendor_purpose':'contract'})
            await server.db.tasks.insert_one({'client_id':cid,'task_id':cid,'title':cid,'status':'open','due_date':'2026-10-31T23:59:59-04:00','private_notes':'Not for Calendar'})
        self.sign_in('member')
        rows=await self.calendar(start='2026-10-01T09:00:00Z',end='2026-10-31')
        self.assertEqual(len(rows),2)
        self.assertTrue(all(r['client_id']=='a' for r in rows))
        self.assertNotIn('private_notes',str(rows))
        self.assertFalse(next(r for r in rows if r['kind']=='review')['can_reschedule'])
        self.assertEqual((await self.client.get('/api/calendar?client_id=b')).status_code,403)
        for query in ['start=2026-02-30','start=2026-10-02&end=2026-10-01','start=2000-01-01&end=2100-01-01','scope=invalid']:
            self.assertEqual((await self.client.get('/api/calendar?client_id=a&'+query)).status_code,422)

    async def test_calendar_capacity_error_is_not_a_partial_success(self):
        self.sign_in('admin')
        await server.db.tasks.insert_many([{'client_id':'a','task_id':str(i),'title':'Capacity fixture',
            'status':'open','due_date':'2026-10-02'} for i in range(5001)])
        result=await self.client.get('/api/calendar?client_id=a&start=2026-10-01&end=2026-10-31')
        self.assertEqual(result.status_code,413)
        self.assertIn('no partial results',result.json()['detail'])

    async def test_missing_and_unrecognized_assessments_are_not_invented(self):
        rows=await self.configure()
        await server.db.framework_assessments.update_one({'framework_assessment_id':rows[0]['framework_assessment_id']},
            {'$set':{'status':'legacy_unknown'}})
        summary=(await self.summary())['items'][0]
        self.assertEqual(summary['unrecognized_status_count'],1)
        self.assertEqual(summary['status_counts']['not_assessed'],55)
        # Only isolated test data is removed; summary reads must not initialize replacements.
        await server.db.framework_assessments.delete_many({'client_id':'a'})
        summary=(await self.summary())['items'][0]
        self.assertEqual(summary['total'],0)
        self.assertEqual(sum(summary['status_counts'].values()),0)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),0)
