"""Shared lifecycle outcomes through real routes with isolated in-memory persistence."""
import json
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, patch

import test_client_dashboard_sources as harness
from review_occurrences import schedule

server = harness.server
CONTRACT = json.loads((Path(__file__).resolve().parents[2] / "shared/contracts/governance-lifecycle.json").read_text())


class GovernanceLifecycleContractTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def post(self, path, body, **kwargs):
        response = await self.client.post('/api' + path, json=body, **kwargs)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_shared_recurrence_boundaries(self):
        for case in CONTRACT['recurrence_cases']:
            review = dict(case['review'])
            for expected in case['next_dates']:
                with self.subTest(case=case['name'], expected=expected):
                    result = schedule(review)
                    self.assertEqual((result['next_review_date'] or '')[:10] or None, expected)
                    review = {**review, **result, 'due_date': result['next_review_date']}

    async def test_late_completion_and_definition_edits_retain_history(self):
        self.sign_in('admin')
        case = CONTRACT['review_history']
        review = await self.post('/reviews', {'client_id': 'a', 'owner_id': 'admin', **case['initial']})
        route = '/reviews/' + review['review_id']
        selected = {'occurrence_id': review['current_occurrence_id']}
        with patch.object(server, '_now', return_value=case['completed_at']):
            done = await self.post(route + '/complete', selected)
        self.assertEqual(done['review']['due_date'][:10], case['next_due'])
        history = done['occurrence']
        self.assertEqual(history['owner_id'], 'admin')
        self.assertEqual(history['title'], case['initial']['title'])
        self.assertEqual(history['completed_at'], case['completed_at'])
        updated = await self.client.patch('/api' + route, json={**case['edited'], 'owner_id':None,
            'expected_updated_at': done['review']['updated_at'], 'expected_occurrence_id': done['review']['current_occurrence_id']})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()['next_review_date'][:10], case['next_after_edit'])
        retry = await self.post(route + '/complete', selected)
        self.assertEqual(retry['occurrence'], history)
        stored = await server.db.reviews.find_one({'review_id':review['review_id']})
        self.assertEqual(stored['occurrences'], [history])

    async def test_shared_schedule_projections(self):
        self.sign_in('admin')
        for case in CONTRACT['schedule_projections']:
            with self.subTest(kind=case['kind']):
                row = await self.post('/'+case['kind'], {'client_id':'a', **case['create']})
                if case['kind']=='policies':
                    review = await self.post('/reviews', {'client_id':'a','title':'Projection review','review_type':'policy',
                        'policy_id':row['policy_id'],'due_date':case['due_date'],'recurrence':case['recurrence']})
                else:
                    reviews = (await self.client.get('/api/reviews', params={'client_id':'a'})).json()
                    review = next(r for r in reviews if r.get(case['key'])==row[case['key']] and r.get('vendor_purpose','vendor')=='vendor')
                with patch.object(server, '_now', return_value=CONTRACT['projection_completed_at']):
                    done = await self.post('/reviews/'+review['review_id']+'/complete', {'occurrence_id':review['current_occurrence_id']})
                saved = (await self.client.get('/api/'+case['kind']+'/'+row[case['key']])).json()
                self.assertEqual(saved[case['next_field']][:10], case['next_due'])
                self.assertEqual(saved[case['last_field']], done['occurrence']['completed_at'])
                self.assertEqual(done['occurrence']['due_date'][:10], case['due_date'])
                self.assertEqual(done['review']['due_date'][:10], case['next_due'])
                for field in ('status','risk_score'):
                    if field in case:self.assertEqual(saved[field],case[field])

    async def test_failed_primary_persistence_recovers_once(self):
        self.sign_in('admin')
        case=CONTRACT['persistence_failure']
        body={'client_id':'a','title':case['title']}
        headers={'Idempotency-Key':case['request_id']}
        with patch.object(server.create_requests, 'insert_primary', AsyncMock(side_effect=RuntimeError('injected unavailable database'))):
            failed=await self.client.post('/api/findings',json=body,headers=headers)
        self.assertEqual(failed.status_code,503)
        self.assertEqual(await server.db.findings.count_documents({}),case['after_failure_count'])
        first=await self.post('/findings',body,headers=headers)
        retry=await self.post('/findings',body,headers=headers)
        self.assertEqual(first['finding_id'],retry['finding_id'])
        self.assertEqual(await server.db.findings.count_documents({}),case['after_retry_count'])

    async def test_stale_write_and_cross_tenant_reads(self):
        self.sign_in('admin')
        case=CONTRACT['stale_write']
        row=await self.post('/findings',{'client_id':'b','title':case['initial_title']})
        route='/api/findings/'+row['finding_id']
        newer=await self.client.patch(route,json={'title':case['new_title'],'expected_updated_at':row['updated_at']})
        self.assertEqual(newer.status_code,200,newer.text)
        stale=await self.client.patch(route,json={'title':case['stale_title'],'expected_updated_at':row['updated_at']})
        self.assertEqual(stale.status_code,case['status'])
        self.assertEqual((await self.client.get(route)).json()['title'],case['new_title'])
        self.sign_in('member')
        self.assertEqual((await self.client.get(route)).status_code,CONTRACT['tenant_denied_status'])
