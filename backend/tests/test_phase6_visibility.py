import unittest
from unittest.mock import patch
from framework_summary import progress, ongoing
from framework_catalog import active_definitions
import test_client_dashboard_sources as harness
from routes.onboarding import BASELINE_CATALOG

server = harness.server


class Phase6VisibilityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    def test_resolution_rules_and_empty_scope(self):
        rows=[{'definition_id':'1.1','status':state,'na_rationale':'Reason' if i==4 else ''}
              for i,state in enumerate(['addressed','in_progress','not_assessed','needs_attention','not_applicable','not_applicable','legacy'])]
        self.assertEqual(progress(rows,'cis-ig1'),dict(total=7,resolved=2,valid_na=1,invalid_na=1,percent=29))
        self.assertIsNone(progress([],'cis-ig1')['percent'])
        for key,spec in [('iso-27001','isms_clause'),('hipaa','addressable')]:
            definition=next(d for d in active_definitions(key) if d.get('specification')==spec)
            self.assertEqual(progress([{'definition_id':definition['id'],'status':'not_applicable','na_rationale':'Legacy'}],key)['resolved'],0)
        definition=next(d for d in active_definitions('iso-27001') if d.get('specification')=='annex_control')
        row={'definition_id':definition['id'],'status':'not_applicable','soa_applicability':'excluded','soa_justification':'Documented exclusion'}
        self.assertEqual(progress([row],'iso-27001')['percent'],100)
        self.assertEqual(progress([{**row,'soa_justification':''}],'iso-27001')['percent'],0)

    async def test_program_detail_is_paged_scoped_and_obligations_do_not_change_progress(self):
        rows=await self.configure()
        aid=rows[0]['framework_assessment_id']
        for rid,due in [('past','2026-09-22'),('today','2026-09-23'),('30','2026-10-23'),('future','2026-10-24'),('none',None)]:
            await server.db.reviews.insert_one({'client_id':'a','review_id':rid,'title':rid,'framework_assessment_id':aid,
                'status':'upcoming','recurrence':'annual','due_date':due})
        await server.db.reviews.insert_one({'client_id':'b','review_id':'foreign','title':'Private','framework_assessment_id':aid,
            'status':'upcoming','recurrence':'annual','due_date':'2000-01-01'})
        with patch.object(server,'_now',lambda:'2026-09-23T12:00:00Z'):
            summary=(await self.summary())['items'][0]
            # Finalizing CIS creates twelve authoritative, unscheduled baseline Reviews.
            self.assertEqual(summary['ongoing']['counts'],dict(past_due=1,due_soon=2,current=1,unscheduled=13))
            self.assertEqual(summary['assessment_progress']['percent'],0)
            self.sign_in('member')
            for state,count in summary['status_counts'].items():
                response=await self.client.get('/api/frameworks/summary',params={'client_id':'a','program':'cis-ig1','detail':state,'limit':25})
                self.assertEqual(response.status_code,200,response.text)
                self.assertEqual(response.json()['total'],count)
                self.assertLessEqual(len(response.json()['items']),25)
            detail=(await self.client.get('/api/frameworks/summary?client_id=a&program=cis-ig1&detail=past_due')).json()
            self.assertEqual([r['id'] for r in detail['items']],['past'])
            self.assertEqual((await self.client.get('/api/frameworks/summary?client_id=b&program=cis-ig1&detail=all')).status_code,403)
            await server.db.reviews.update_one({'review_id':'past'},{'$set':{'due_date':'2026-10-25'}})
            after=(await self.summary())['items'][0]
            self.assertEqual(after['assessment_progress'],summary['assessment_progress'])
            self.assertEqual(after['ongoing']['counts']['past_due'],0)

    def test_completed_and_one_time_reviews_are_not_recurring_obligations(self):
        base={'review_id':'r','status':'upcoming','recurrence':'annual','due_date':'2026-09-23'}
        result,groups=ongoing([base,{**base,'review_id':'done','status':'completed'},
                              {**base,'review_id':'once','recurrence':'none'}],'2026-09-23')
        self.assertEqual(result['total'],1)
        self.assertEqual([r['id'] for r in groups['due_soon']],['r'])

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
        self.assertEqual(before['items'][1]['status_counts'],{'not_assessed':33,'in_progress':0,'addressed':0,'needs_attention':0,'not_applicable':0})
        self.assertTrue(before['items'][1]['tracking_available'])
        self.assertEqual(cis['assessment_progress'], {'total':56,'resolved':3,'valid_na':1,'invalid_na':0,'percent':5})
        await self.client.patch('/api/framework_assessments/'+rows[6]['framework_assessment_id'],json={'status':'in_progress'})
        self.assertEqual((await self.summary())['items'][0]['status_counts']['not_assessed'],49)
        self.assertEqual((await self.summary())['items'][0]['status_counts']['in_progress'],4)
        await self.client.patch('/api/onboarding/programs/cis-ig1',json={'client_id':'a','applicability':'does_not_apply'})
        self.assertEqual([p['key'] for p in (await self.summary())['items']],['soc-2'])
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),89)

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
