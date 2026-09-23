"""Isolated engineering gates. Mock persistence is not a real Mongo load test."""
import asyncio
from calendar import monthrange
from datetime import datetime
from unittest.mock import AsyncMock, patch
import unittest
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from review_occurrences import schedule


class EngineeringReliabilityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    def test_recurrence_bounds_do_not_crash_read_projection(self):
        for recurrence in ('monthly','quarterly','semiannual','annual','custom'):
            with self.subTest(recurrence=recurrence):
                result=schedule({'due_date':'9999-12-31','recurrence':recurrence,'custom_recurrence_days':3650})
                self.assertIsNone(result['next_review_date'])

    def test_25_year_recurrence_preserves_calendar_anchor(self):
        for years in (1,3,10,25):
            for recurrence,months in [('monthly',1),('quarterly',3),('semiannual',6),('annual',12)]:
                for start in ('2024-01-31','2024-02-29','2024-01-30'):
                    with self.subTest(years=years,recurrence=recurrence,start=start):
                        row={'due_date':start,'recurrence':recurrence};seen=set()
                        first=datetime.fromisoformat(start)
                        anchor_end=first.day==monthrange(first.year,first.month)[1]
                        for index in range(years*12//months):
                            result=schedule(row);next_date=datetime.fromisoformat(result['next_review_date'])
                            self.assertNotIn(next_date,seen);seen.add(next_date)
                            total=first.year*12+first.month-1+(index+1)*months
                            year,month=total//12,total%12+1
                            day=monthrange(year,month)[1] if anchor_end else min(first.day,monthrange(year,month)[1])
                            self.assertEqual(next_date.date().isoformat(),f'{year:04d}-{month:02d}-{day:02d}')
                            row={**row,**result,'due_date':result['next_review_date']}

    async def test_parallel_completion_is_one_occurrence(self):
        self.sign_in('admin')
        for count in (5,10,50):
            rid=f'parallel-{count}'
            await server.db.reviews.insert_one({'review_id':rid,'client_id':'a','title':'Synthetic Review','status':'upcoming','due_date':'2026-01-31','recurrence':'monthly'})
            results=await asyncio.gather(*(self.client.post(f'/api/reviews/{rid}/complete',json={'occurrence_id':'occ_'+rid}) for _ in range(count)))
            self.assertTrue(all(r.status_code in (200,409) for r in results),[r.status_code for r in results])
            row=await server.db.reviews.find_one({'review_id':rid})
            self.assertEqual(len(row['occurrences']),1)
            self.assertEqual(row['due_date'][:10],'2026-02-28')

    async def test_lost_response_completion_retry_preserves_history(self):
        self.sign_in('admin')
        await server.db.reviews.insert_one({'review_id':'retry','client_id':'a','title':'Synthetic','status':'upcoming','due_date':'2026-01-31','recurrence':'monthly'})
        with patch.object(server,'_review_event',AsyncMock(side_effect=RuntimeError('injected audit failure'))):
            with self.assertRaises(RuntimeError):
                await self.client.post('/api/reviews/retry/complete',json={'occurrence_id':'occ_retry'})
        retry=await self.client.post('/api/reviews/retry/complete',json={'occurrence_id':'occ_retry'})
        self.assertEqual(retry.status_code,200,retry.text)
        self.assertEqual(len(retry.json()['review']['occurrences']),1)

    async def test_cross_client_mass_assignment_is_rejected(self):
        self.sign_in('member')
        for body in ({'client_id':'b','title':'Forbidden'},{'client_id':'a','title':'Injection','status':{'$ne':None}}, {'client_id':'a','title':'History injection','decision_history':[{}]}):
            response=await self.client.post('/api/findings',json=body)
            self.assertIn(response.status_code,(403,422),response.text)
        self.assertEqual(await server.db.findings.count_documents({}),0)

    async def test_register_does_not_silently_hide_records_above_limit(self):
        self.sign_in('admin')
        await server.db.findings.insert_many([{'finding_id':f'volume-{i}','client_id':'a','title':f'Synthetic {i}','created_at':'2026-01-01','status':'open'} for i in range(1001)])
        response=await self.client.get('/api/findings?client_id=a')
        self.assertEqual(response.status_code,413,response.text[:120])
        self.assertIn('No partial results',response.json()['detail'])

    async def test_stale_editor_cannot_overwrite_newer_finding(self):
        self.sign_in('admin')
        created=await self.client.post('/api/findings',json={'client_id':'a','title':'Original'})
        row=created.json();path='/api/findings/'+row['finding_id']
        first=await self.client.patch(path,json={'title':'Newer edit','expected_updated_at':row['updated_at']})
        self.assertEqual(first.status_code,200,first.text)
        stale=await self.client.patch(path,json={'title':'Stale form','expected_updated_at':row['updated_at']})
        self.assertEqual(stale.status_code,409,stale.text)
        self.assertEqual((await self.client.get(path)).json()['title'],'Newer edit')

    async def test_stale_assessment_preserves_conclusion_and_history(self):
        from test_framework_governance import FrameworkTests
        self.sign_in('admin')
        await self.client.post('/api/onboarding/baseline',json=FrameworkTests.body(self))
        row=(await self.client.get('/api/frameworks/cis-ig1?client_id=a')).json()['assessments'][0]
        path='/api/framework_assessments/'+row['framework_assessment_id']
        first=await self.client.patch(path,json={'notes':'Newer assessment','expected_last_assessed':None})
        self.assertEqual(first.status_code,200,first.text)
        stale=await self.client.patch(path,json={'notes':'Stale assessment','expected_last_assessed':None})
        self.assertEqual(stale.status_code,409,stale.text)
        saved=(await self.client.get(path)).json()
        self.assertEqual(saved['notes'],'Newer assessment')
        self.assertEqual(len(saved['assessment_history']),1)
        self.assertNotIn('expected_last_assessed',saved['assessment_history'][0])

    async def test_fault_characterization_generic_create_is_not_retry_safe(self):
        # Characterization, not a passing resilience claim: no request identity exists here.
        self.sign_in('admin')
        with patch.object(server,'audit',AsyncMock(side_effect=RuntimeError('injected post-write failure'))):
            with self.assertRaises(RuntimeError):
                await self.client.post('/api/findings',json={'client_id':'a','title':'Response lost'})
        retry=await self.client.post('/api/findings',json={'client_id':'a','title':'Response lost'})
        self.assertEqual(retry.status_code,200,retry.text)
        self.assertEqual(await server.db.findings.count_documents({'client_id':'a','title':'Response lost'}),2)

    async def test_parallel_validation_records_one_decision(self):
        self.sign_in('admin')
        for count in (5,10,50):
            fid=f'validate-{count}'
            await server.db.findings.insert_one({'finding_id':fid,'client_id':'a','title':'Ready','status':'remediated'})
            results=await asyncio.gather(*(self.client.post(f'/api/findings/{fid}/validate',json={'rationale':'Synthetic validation'}) for _ in range(count)))
            self.assertEqual(sum(r.status_code==200 for r in results),1)
            self.assertTrue(all(r.status_code in (200,409) for r in results))
            row=await server.db.findings.find_one({'finding_id':fid})
            self.assertEqual(row['status'],'closed')
            self.assertEqual(len(row['decision_history']),1)

    async def test_input_boundaries_preserve_literal_text_and_reject_operator_types(self):
        self.sign_in('admin')
        for value in ('', '   ', {'$ne':None}, [], 42):
            response=await self.client.post('/api/findings',json={'client_id':'a','title':value})
            self.assertEqual(response.status_code,422,response.text)
        for title in ('x', 'Unicode café 😀', "O'Brien", '<script>alert(1)</script>', 'line 1\nline 2', 'x'*10000):
            response=await self.client.post('/api/findings',json={'client_id':'a','title':title})
            self.assertEqual(response.status_code,200,response.text[:100])
            self.assertEqual(response.json()['title'],title)
        for value in (0,-1,6,10**10,1.2,'high',True):
            response=await self.client.post('/api/risks',json={'client_id':'a','title':'Rating boundary','likelihood_score':value})
            self.assertEqual(response.status_code,422,response.text)
        self.assertEqual((await self.client.get('/api/findings/missing')).status_code,404)

    async def test_evidence_boundaries_and_database_failure_recovery(self):
        self.sign_in('admin')
        response=await self.client.post('/api/evidence',json={'client_id':'a','filename':'proof.txt','content_base64':'not base64 !!!'})
        self.assertEqual(response.status_code,422,response.text)
        self.assertEqual(await server.db.evidence.count_documents({}),0)
        collection_type=type(server.db.findings)
        original=collection_type.find_one
        async def unavailable(collection,*args,**kwargs):
            if collection.name=='findings':raise ConnectionError('injected outage')
            return await original(collection,*args,**kwargs)
        with patch.object(collection_type,'find_one',unavailable):
            with self.assertRaises(ConnectionError):
                await self.client.get('/api/findings/missing')
        self.assertEqual((await self.client.get('/api/findings/missing')).status_code,404)

    def test_edit_token_remains_distinct_when_clock_repeats(self):
        with patch.object(server,'_now',return_value='2026-01-01T00:00:00+00:00'):
            first=server._next_write_time('2026-01-01T00:00:00+00:00')
            second=server._next_write_time(first)
        self.assertGreater(second,first)

    async def test_due_dates_reject_impossible_calendar_days(self):
        self.sign_in('admin')
        for kind,extra in [('reviews',{'review_type':'access'}),('findings',{}),('tasks',{})]:
            for date in ('2026-02-29','2026-02-30','2026-04-31','not-a-date'):
                response=await self.client.post('/api/'+kind,json={'client_id':'a','title':'Date boundary','due_date':date,**extra})
                self.assertEqual(response.status_code,422,(kind,date,response.text[:100]))
            for date in ('2024-02-29','0001-01-01','9999-12-31','2026-03-08T01:30:00-05:00'):
                response=await self.client.post('/api/'+kind,json={'client_id':'a','title':'Valid date boundary','due_date':date,**extra})
                self.assertEqual(response.status_code,200,(kind,date,response.text[:100]))
