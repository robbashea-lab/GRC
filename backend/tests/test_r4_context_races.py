"""R4 pending-claim races through native routes and isolated Mongo fixtures."""
import copy
import unittest
from unittest.mock import patch

import test_framework_governance as fixture

server = fixture.server
ACCESS_STEPS = [
    'access:operation:ticket', 'access:operation:due', 'access:operation:results',
    'access:operation:exceptions', 'access:operation:next', 'access:client:1', 'access:client:2',
]
FOREIGN_CLAIM = 'f' * 64


class R4ContextRaceTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.FrameworkTests.asyncSetUp
    sign_in = fixture.FrameworkTests.sign_in
    body = fixture.FrameworkTests.body
    configure = fixture.FrameworkTests.configure

    async def scheduled_review(self):
        body = self.body()
        body['state']['framework_reviews']['account-authorization'] = {
            'recurrence': 'quarterly', 'due_date': '2099-12-01'}
        await self.configure(body)
        review = await server.db.reviews.find_one(
            {'client_id': 'a', 'framework_plan_key': 'account-authorization'}, {'_id': 0})
        path = '/api/reviews/' + review['review_id']
        guide_response = await self.client.get(path + '/completion-guide')
        self.assertEqual(guide_response.status_code, 200, guide_response.text)
        guide = guide_response.json()
        self.assertEqual([step['step_id'] for step in guide['steps']], ACCESS_STEPS)
        complete = {
            'occurrence_id': guide['occurrence_id'], 'expected_updated_at': guide['expected_updated_at'],
            'checklist': {'contract_token': guide['contract_token'], 'results': [
                {'step_id': step, 'result': 'Pass', 'reason': ''} for step in ACCESS_STEPS]},
            'outcome': 'No exceptions noted',
            'supporting_reference': 'Synthetic completed account result record ACCESS-RACE-001',
        }
        return review, path, complete

    async def assert_review_claim_wins(self, action):
        before, path, complete = await self.scheduled_review()
        collection = server.db.reviews
        collection_type = type(collection)
        original = collection_type.update_one
        injected = False

        async def claim_before_write(target, query, update, **kwargs):
            nonlocal injected
            native_write = ('occurrences' in update.get('$push', {}) if action == 'complete' else
                            update.get('$set', {}).get('status') == 'in_progress')
            if (not injected and target.full_name == collection.full_name
                    and query.get('review_id') == before['review_id'] and native_write):
                injected = True
                # Claim after the route read and validation, without changing its saved revision.
                await original(target, {'review_id': before['review_id']},
                               {'$set': {'_r4_context_pending': FOREIGN_CLAIM}})
            return await original(target, query, update, **kwargs)

        body = complete if action == 'complete' else {'occurrence_id': complete['occurrence_id']}
        with patch.object(collection_type, 'update_one', claim_before_write):
            denied = await self.client.post(path + '/' + action, json=body)
        self.assertTrue(injected, 'The fault must land at the actual native write')
        self.assertEqual(denied.status_code, 409, denied.text)
        after = await server.db.reviews.find_one({'review_id': before['review_id']}, {'_id': 0})
        self.assertEqual(after['_r4_context_pending'], FOREIGN_CLAIM)
        for field in ('status', 'due_date', 'current_occurrence_id', 'recurrence', 'schedule_anchor',
                      'updated_at', 'started_at', 'started_by', 'completion_date', 'completion_snapshot'):
            self.assertEqual(after.get(field), before.get(field), field)
        self.assertEqual(after.get('occurrences', []), before.get('occurrences', []))
        self.assertEqual(await server.db.audit_logs.count_documents({
            'entity_id': before['review_id'], 'action': {'$in': ['Review started', 'Review completed']}}), 0)

    async def test_start_cannot_overwrite_a_shared_context_claim_after_its_read(self):
        await self.assert_review_claim_wins('start')

    async def test_complete_cannot_advance_history_after_a_shared_context_claim(self):
        await self.assert_review_claim_wins('complete')

    async def test_onboarding_draft_cannot_publish_over_a_claimed_client(self):
        self.sign_in('admin')
        before = await server.db.clients.find_one({'client_id': 'a'}, {'_id': 0})
        body = self.body(programs=())
        body.update(finalize=False, expected_updated_at=None)
        body['state']['step'] = 1
        collection = server.db.clients
        collection_type = type(collection)
        original = collection_type.update_one
        injected = False

        async def claim_before_publish(target, query, update, **kwargs):
            nonlocal injected
            if (not injected and target.full_name == collection.full_name and query.get('client_id') == 'a'
                    and 'onboarding_baseline' in update.get('$set', {})):
                injected = True
                await original(target, {'client_id': 'a'}, {'$set': {'_r4_context_pending': FOREIGN_CLAIM}})
            return await original(target, query, update, **kwargs)

        with patch.object(collection_type, 'update_one', claim_before_publish):
            denied = await self.client.post('/api/onboarding/baseline', json=copy.deepcopy(body))
        self.assertTrue(injected, 'The fault must land at the baseline publication CAS')
        self.assertEqual(denied.status_code, 409, denied.text)
        after = await server.db.clients.find_one({'client_id': 'a'}, {'_id': 0})
        self.assertEqual(after.pop('_r4_context_pending'), FOREIGN_CLAIM)
        self.assertEqual(after, before)
        for name in ('framework_assessments', 'reviews', 'policies'):
            self.assertEqual(await server.db[name].count_documents({'client_id': 'a'}), 0)
