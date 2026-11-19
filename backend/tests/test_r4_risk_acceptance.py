"""Native acceptance expiry is a decision deadline, never a recurrence edit."""
import copy
import unittest

import test_client_dashboard_sources as fixture

server = fixture.server


class R4RiskAcceptanceTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def test_acceptance_preserves_existing_review_identity_schedule_and_history(self):
        self.sign_in('admin')
        response = await self.client.post('/api/risks', json={
            'client_id': 'a', 'title': 'Synthetic R4 acceptance separation',
            'likelihood_score': 3, 'impact_score': 3,
            'next_review': '2099-12-31', 'review_cadence': 'annual'})
        self.assertEqual(response.status_code, 200, response.text)
        risk = response.json()
        query = {'risk_id': risk['risk_id'], 'client_id': 'a'}
        before = copy.deepcopy(await server.db.reviews.find_one(query))
        accepted = await self.client.post('/api/risks/' + risk['risk_id'] + '/accept', json={
            'rationale': 'Synthetic management decision; independent expiry',
            'expiry_date': '2099-01-15', 'expected_updated_at': risk['updated_at']})
        self.assertEqual(accepted.status_code, 200, accepted.text)
        saved = accepted.json()
        self.assertEqual(saved['next_review'], risk['next_review'])
        self.assertEqual(saved['acceptance_expires_at'], '2099-01-15')
        self.assertEqual(saved['risk_score'], 9)
        self.assertEqual(saved['created_at'], risk['created_at'])
        self.assertEqual(saved.get('date_identified'), risk.get('date_identified'))
        self.assertEqual(await server.db.reviews.find_one(query), before)
        replay = await self.client.post('/api/risks/' + risk['risk_id'] + '/accept', json={
            'rationale': 'Stale decision', 'expiry_date': '2099-02-01',
            'expected_updated_at': risk['updated_at']})
        self.assertEqual(replay.status_code, 409, replay.text)
        self.assertEqual(len((await server.db.risks.find_one(query))['decision_history']), 1)

    async def test_acceptance_does_not_invent_a_review_date_or_allow_archived_client_writes(self):
        self.sign_in('admin')
        risk = (await self.client.post('/api/risks', json={
            'client_id': 'a', 'title': 'Synthetic unscheduled acceptance'})).json()
        before = await server.db.reviews.find_one({'risk_id': risk['risk_id']})
        accepted = await self.client.post('/api/risks/' + risk['risk_id'] + '/accept', json={
            'rationale': 'Synthetic independent decision', 'expiry_date': '2099-01-15',
            'expected_updated_at': risk['updated_at']})
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertIsNone(accepted.json().get('next_review'))
        self.assertEqual(await server.db.reviews.find_one({'risk_id': risk['risk_id']}), before)
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'status': 'archived'}})
        denied = await self.client.post('/api/risks/' + risk['risk_id'] + '/accept', json={
            'rationale': 'Must not commit', 'expiry_date': '2099-02-01',
            'expected_updated_at': accepted.json()['updated_at']})
        self.assertEqual(denied.status_code, 403, denied.text)
        saved = await server.db.risks.find_one({'risk_id': risk['risk_id']})
        self.assertEqual(len(saved['decision_history']), 1)
