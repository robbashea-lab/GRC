"""Accepted pre-R4 coverage journals resume without invented historical checks."""
from copy import deepcopy
import unittest
from unittest.mock import patch

import test_client_dashboard_sources as fixture
import policy_review_coverage as coverage
import review_occurrences


AT = '2026-10-21T12:00:00+00:00'
BEFORE = '2026-10-20T12:00:00+00:00'
server = fixture.server


class R4CoverageRecoveryTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def accepted_fixture(self, partial=False):
        """Explicit legacy fixture, accepted by the native durable-plan function.

        The old approval and completion are test facts, not a claimed migration
        of genuine records. No present-day checklist result is supplied.
        """
        self.sign_in('admin')
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {
            'framework_settings': {'cis-ig1': {'implementation_group': 1}}}})
        await server.db.requirements.insert_one({'requirement_id': 'legacy-cis', 'client_id': 'a',
            'baseline_key': 'cis-ig1', 'baseline_response': 'applies'})
        annual = {'review_id': 'annual-legacy', 'client_id': 'a', 'baseline_key': 'policy-review',
                  'review_type': 'policy', 'title': 'Synthetic accepted pre-R4 annual completion',
                  'status': 'upcoming', 'recurrence': 'annual', 'due_date': '2026-10-01',
                  'current_occurrence_id': 'annual-2026', 'updated_at': BEFORE, 'owner_id': 'admin'}
        await server.db.reviews.insert_one(deepcopy(annual))
        subject = {'subject_id': 'fixture-approved-subject', 'policy_id': 'legacy-policy',
                   'client_id': 'a', 'version': '1', 'title': 'Explicit synthetic legacy approval fixture'}
        approval = {'action': 'approved', 'at': '2025-01-01T00:00:00+00:00',
                    'by': 'fixture-legacy-approver', 'subject': subject}
        await server.db.policies.insert_one({'policy_id': 'legacy-policy', 'client_id': 'a',
            'title': subject['title'], 'status': 'approved', 'version': '1', 'updated_at': BEFORE,
            'approved_at': approval['at'], 'approval_subject': subject, 'approval_history': [approval]})
        await server.db.reviews.insert_one({'review_id': 'legacy-child', 'client_id': 'a',
            'policy_id': 'legacy-policy', 'title': 'Synthetic covered child', 'review_type': 'policy',
            'status': 'upcoming', 'recurrence': 'annual', 'due_date': '2026-01-31',
            'current_occurrence_id': 'child-2026', 'updated_at': BEFORE, 'owner_id': 'admin'})
        request = {'occurrence_id': 'annual-2026', 'completion_notes': 'Actual retained legacy fixture result'}
        user = await server.db.users.find_one({'user_id': 'admin'}, {'_id': 0})
        completed = review_occurrences.snapshot(annual, [], 0, user, AT)
        completed['notes'] = request['completion_notes']
        updates = {'updated_at': AT, 'due_date': '2027-10-01', 'current_occurrence_id': 'annual-2027',
                   'status': 'upcoming', 'notes': None, 'completion_date': None, 'completion_snapshot': None}
        updates.update(review_occurrences.schedule({**annual, **updates}))
        plan = await coverage.prepare(server.db, annual, completed, updates, request, user)
        self.assertNotIn('review_template_version', plan['completed'])
        if partial:
            await coverage.reconcile(server.db, annual, plan, user, server._authorized_parent)
        return annual, request, plan

    async def state(self):
        return {kind: await server.db[kind].find({}, {'_id': 0}).to_list(None)
                for kind in ('clients', 'reviews', 'policies', 'audit_logs', 'portfolio_activity_events')}

    async def test_exact_accepted_legacy_intent_resumes_once_without_retrofitting_history(self):
        _, request, plan = await self.accepted_fixture(partial=True)
        child_before = await server.db.reviews.find_one({'review_id': 'legacy-child'}, {'_id': 0})
        self.assertEqual(len(child_before['occurrences']), 1)
        with patch.object(server.r4_review_completion, 'validate_completion',
                          side_effect=AssertionError('An accepted journal must use its actual frozen completion')):
            response = await self.client.post('/api/reviews/annual-legacy/complete', json=request)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()['occurrence']
        self.assertEqual(result['completed_at'], AT)
        self.assertEqual(result['completed_by'], plan['completed']['completed_by'])
        self.assertEqual(result['notes'], request['completion_notes'])
        for field in ('checklist', 'checklist_results', 'review_template_id', 'review_template_version'):
            self.assertNotIn(field, result)
            self.assertNotIn(field, child_before['occurrences'][0])
        saved = await server.db.reviews.find_one({'review_id': 'annual-legacy'}, {'_id': 0})
        self.assertNotIn('_policy_coverage_pending', saved)
        self.assertEqual(saved['occurrences'], [result])
        self.assertEqual(saved['current_occurrence_id'], 'annual-2027')
        child_after = await server.db.reviews.find_one({'review_id': 'legacy-child'}, {'_id': 0})
        self.assertEqual(child_after, child_before)
        policy = await server.db.policies.find_one({'policy_id': 'legacy-policy'})
        self.assertEqual(len(policy['review_history']), 1)
        replay = await self.client.post('/api/reviews/annual-legacy/complete', json=request)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()['occurrence'], result)
        self.assertEqual(len((await server.db.reviews.find_one({'review_id': 'annual-legacy'}))['occurrences']), 1)

    async def test_changed_intent_and_unvalidated_or_wrong_identity_plans_are_denied_before_writes(self):
        _, request, plan = await self.accepted_fixture()
        candidates = [({**request, 'completion_notes': 'Changed intent'}, plan),
                      ({**request, 'occurrence_id': 'another-occurrence'}, plan)]
        for change in ({'identity_validation_version': None},
                       {'completed': {**plan['completed'], 'client_id': 'b'}},
                       {'completed': {**plan['completed'], 'review_id': 'another-review'}},
                       {'completed': {**plan['completed'], 'completed_by': None}}):
            candidates.append((request, {**plan, **change}))
        for payload, pending in candidates:
            with self.subTest(payload=payload, completed=pending.get('completed')):
                await server.db.reviews.update_one({'review_id': 'annual-legacy'},
                    {'$set': {'_policy_coverage_pending': deepcopy(pending)}})
                before = await self.state()
                denied = await self.client.post('/api/reviews/annual-legacy/complete', json=payload)
                self.assertEqual(denied.status_code, 409, denied.text)
                self.assertEqual(await self.state(), before)

    async def test_current_tenant_role_and_assignment_remain_required_for_recovery(self):
        _, request, _ = await self.accepted_fixture()
        self.sign_in('member')
        for fields in ({}, {'role': 'client_readonly'},
                       {'role': 'client_contributor', 'client_ids': ['b']}):
            with self.subTest(fields=fields):
                if fields:
                    await server.db.users.update_one({'user_id': 'member'}, {'$set': fields})
                before = await self.state()
                denied = await self.client.post('/api/reviews/annual-legacy/complete', json=request)
                self.assertEqual(denied.status_code, 403, denied.text)
                after = await self.state()
                before_logs, after_logs = before.pop('audit_logs'), after.pop('audit_logs')
                self.assertEqual(after, before)
                self.assertEqual(after_logs[:-1], before_logs)
                self.assertEqual(len(after_logs), len(before_logs) + 1)
                event = after_logs[-1]
                self.assertEqual(event['action'], 'access-denied')
                self.assertEqual(event['user_id'], 'member')
                self.assertEqual(event['meta'], {'outcome': 'denied', 'method': 'POST',
                    'route': '/api/reviews/{review_id}/complete', 'status': 403})

    async def test_no_pending_plan_keeps_new_completion_subject_to_current_contract(self):
        _, request, _ = await self.accepted_fixture()
        await server.db.reviews.update_one({'review_id': 'annual-legacy'},
                                          {'$unset': {'_policy_coverage_pending': ''}})
        before = await self.state()
        denied = await self.client.post('/api/reviews/annual-legacy/complete', json=request)
        self.assertEqual(denied.status_code, 428, denied.text)
        self.assertEqual(await self.state(), before)

    async def test_authorized_guide_exposes_only_exact_accepted_retry_and_remains_inert_for_read_only_actor(self):
        _, request, plan = await self.accepted_fixture()
        before = await self.state()
        response = await self.client.get('/api/reviews/annual-legacy/completion-guide')
        self.assertEqual(response.status_code, 200, response.text)
        guide = response.json()
        self.assertFalse(guide['read_only'])
        self.assertEqual(guide['accepted_completion_retry'], {'request': request,
            'completed_at': AT, 'completed_by': plan['completed']['completed_by']})
        self.assertNotIn('_policy_coverage_pending', response.text)
        self.assertNotIn('members', guide['accepted_completion_retry'])
        self.assertEqual(await self.state(), before)
        self.sign_in('member')
        readonly = await self.client.get('/api/reviews/annual-legacy/completion-guide')
        self.assertEqual(readonly.status_code, 200, readonly.text)
        self.assertTrue(readonly.json()['read_only'])
        self.assertEqual(readonly.json()['accepted_completion_retry']['request'], request)
        denied = await self.client.post('/api/reviews/annual-legacy/complete', json=request)
        self.assertEqual(denied.status_code, 403, denied.text)
        after = await self.state()
        self.assertEqual(after['reviews'], before['reviews'])
        self.assertEqual(after['policies'], before['policies'])
        self.assertEqual(after['clients'], before['clients'])
