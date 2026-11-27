"""Real prospective completion routes with explicit synthetic operator results."""
import copy
import csv
import io
import unittest

import test_client_dashboard_sources as fixture

server = fixture.server
STEPS = [f'risk_rec:record:{index}' for index in range(1, 6)]


class R4ReviewRouteTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def prepare(self):
        self.sign_in('admin')
        response = await self.client.post('/api/risks', json={
            'client_id': 'a', 'title': 'Synthetic R4 operating review', 'owner_id': 'member',
            'next_review': '2099-12-31', 'review_cadence': 'annual',
            'likelihood_score': 3, 'impact_score': 2})
        self.assertEqual(response.status_code, 200, response.text)
        risk = response.json()
        review = await server.db.reviews.find_one({'risk_id': risk['risk_id']}, {'_id': 0})
        path = '/api/reviews/' + review['review_id']
        guide = (await self.client.get(path + '/completion-guide')).json()
        self.assertEqual([step['step_id'] for step in guide['steps']], STEPS)
        body = {'occurrence_id': guide['occurrence_id'], 'expected_updated_at': guide['expected_updated_at'],
                'checklist': {'contract_token': guide['contract_token'], 'results': [
                    {'step_id': step, 'result': 'Pass', 'reason': ''} for step in STEPS]},
                'outcome': 'No exceptions noted', 'supporting_reference': 'Synthetic completed operating record R4-123'}
        return risk, review, path, body

    async def business_state(self):
        collections = ('clients', 'reviews', 'risks', 'findings', 'tasks', 'evidence', 'audit_logs')
        return {name: await server.db[name].find({}, {'_id': 0}).to_list(None) for name in collections}

    async def test_invalid_completion_does_not_mutate_any_connected_business_record(self):
        _, _, path, valid = await self.prepare()
        inputs = []
        missing = copy.deepcopy(valid); missing.pop('checklist'); inputs.append((409, missing))
        truncated = copy.deepcopy(valid); truncated['checklist']['results'].pop(); inputs.append((422, truncated))
        reason = copy.deepcopy(valid); reason['checklist']['results'][0].update(result='NMI', reason=' '); inputs.append((422, reason))
        support = copy.deepcopy(valid); support['supporting_reference'] = ''; inputs.append((422, support))
        stale = copy.deepcopy(valid); stale['expected_updated_at'] = 'outdated'; inputs.append((409, stale))
        before = await self.business_state()
        for expected, body in inputs:
            with self.subTest(expected=expected, body=body):
                denied = await self.client.post(path + '/complete', json=body)
                self.assertEqual(denied.status_code, expected, denied.text)
                self.assertEqual(await self.business_state(), before)

    async def test_supported_completion_retains_exact_results_and_replays_once(self):
        risk, review, path, body = await self.prepare()
        old = {'occurrence_id': 'historical-r4', 'status': 'completed', 'completed_by': None,
               'completed_at': '2020-01-01', 'notes': 'Original legacy facts; no checklist existed'}
        await server.db.reviews.update_one({'review_id': review['review_id']}, {'$set': {'occurrences': [old]}})
        accepted = await self.client.post(path + '/complete', json=body)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        occurrence = accepted.json()['occurrence']
        self.assertEqual([row['step_id'] for row in occurrence['checklist_results']], STEPS)
        self.assertEqual([row['result'] for row in occurrence['checklist_results']], ['Pass'] * 5)
        self.assertEqual(occurrence['supporting_reference'], body['supporting_reference'])
        self.assertEqual(occurrence['checklist_outcome'], 'No exceptions noted')
        self.assertEqual(occurrence['outcome'], 'Reviewed — No Change')
        self.assertEqual(occurrence['completed_by'], 'admin')
        replay = await self.client.post(path + '/complete', json=body)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()['occurrence'], occurrence)
        saved = await server.db.reviews.find_one({'review_id': review['review_id']})
        self.assertEqual(saved['occurrences'], [old, occurrence])
        self.assertNotIn('checklist_outcome', saved['occurrences'][0])
        self.assertNotEqual(saved['current_occurrence_id'], occurrence['occurrence_id'])
        self.assertIsNone(saved.get('r4_current_checklist'))
        current_guide = (await self.client.get(path + '/completion-guide')).json()
        self.assertEqual(current_guide['results'], [])
        self.assertEqual(current_guide['supporting_reference'], '')
        after = await server.db.risks.find_one({'risk_id': risk['risk_id']})
        for field in ('risk_id', 'client_id', 'created_at', 'status', 'owner_id', 'risk_score', 'acceptance_date'):
            self.assertEqual(after.get(field), risk.get(field), field)

    async def test_checkpoint_is_draft_and_cannot_bypass_stale_revision_or_assignment(self):
        _, review, path, body = await self.prepare()
        checkpoint = {key: value for key, value in body.items() if key != 'outcome'}
        checkpoint['checklist'] = {**checkpoint['checklist'], 'results': checkpoint['checklist']['results'][:1]}
        self.sign_in('member')
        saved = await self.client.put(path + '/completion-guide', json=checkpoint,
                                      headers={'Idempotency-Key': 'synthetic-r4-checkpoint'})
        self.assertEqual(saved.status_code, 200, saved.text)
        current = await server.db.reviews.find_one({'review_id': review['review_id']})
        self.assertEqual(current.get('occurrences', []), [])
        self.assertEqual(current['due_date'], review['due_date'])
        denied = await self.client.post(path + '/complete', json=body)
        self.assertEqual(denied.status_code, 409, denied.text)
        await server.db.reviews.update_one({'review_id': review['review_id']}, {'$set': {'owner_id': 'admin', 'reviewer_id': 'admin'}})
        denied = await self.client.put(path + '/completion-guide', json={**checkpoint,
            'expected_updated_at': saved.json()['expected_updated_at']})
        self.assertEqual(denied.status_code, 403, denied.text)

    async def test_cycle_ticket_stays_on_its_completed_occurrence_and_export(self):
        _, review, path, completion = await self.prepare()
        await server.db.reviews.update_one({'review_id': review['review_id']}, {
            '$set': {'activity_setup.recurring_ticket_number': '836501'}})
        checkpoint = {key: value for key, value in completion.items() if key != 'outcome'}
        checkpoint['checklist'] = {**completion['checklist'], 'results': completion['checklist']['results'][:1]}
        checkpoint['cycle_ticket_number'] = ' 836502 '
        saved = await self.client.put(path + '/completion-guide', json=checkpoint)
        self.assertEqual(saved.status_code, 200, saved.text)
        stale = await self.client.put(path + '/completion-guide', json={**checkpoint, 'cycle_ticket_number': '836503'})
        self.assertEqual(stale.status_code, 409, stale.text)

        reopened = (await self.client.get(path + '/completion-guide')).json()
        self.assertEqual(reopened['cycle_ticket_number'], '836502')
        self.assertEqual(reopened['occurrence_id'], completion['occurrence_id'])
        self.assertEqual(reopened['results'], checkpoint['checklist']['results'])
        self.assertEqual(reopened['supporting_reference'], completion['supporting_reference'])

        # A checklist client that does not edit the ticket preserves it.
        checklist_only = {key: value for key, value in checkpoint.items() if key != 'cycle_ticket_number'}
        checklist_only['expected_updated_at'] = reopened['expected_updated_at']
        checklist_only['checklist'] = completion['checklist']
        updated = await self.client.put(path + '/completion-guide', json=checklist_only)
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()['cycle_ticket_number'], '836502')
        completion['expected_updated_at'] = updated.json()['expected_updated_at']
        completed = await self.client.post(path + '/complete', json=completion)
        self.assertEqual(completed.status_code, 200, completed.text)
        immutable = completed.json()['occurrence']
        self.assertEqual(immutable['activity_setup']['cycle_ticket_number'], '836502')
        self.assertEqual(immutable['activity_setup']['recurring_ticket_number'], '836501')
        successor = (await self.client.get(path + '/completion-guide')).json()
        self.assertEqual(successor['cycle_ticket_number'], '')
        self.assertNotEqual(successor['occurrence_id'], immutable['occurrence_id'])

        export = await self.client.get('/api/reviews/completions/export', params={
            'client_id': 'a', 'from_date': immutable['completed_at'][:10], 'to_date': immutable['completed_at'][:10]})
        self.assertEqual(export.status_code, 200, export.text)
        rows = list(csv.reader(io.StringIO(export.text)))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][8:10], ['836501', '836502'])

    async def test_exception_cannot_change_rating_or_complete_without_its_recorded_finding(self):
        _, _, path, body = await self.prepare()
        body['checklist']['results'][0].update(result='Exception', reason='Synthetic exception requiring corrective work')
        body['outcome'] = 'Exceptions noted'
        before = await self.business_state()
        denied = await self.client.post(path + '/complete', json=body)
        self.assertEqual(denied.status_code, 422, denied.text)
        self.assertIn('Raise finding', denied.text)
        self.assertEqual(await self.business_state(), before)
        denied = await self.client.post(path + '/complete', json={**body, 'risk_assessment': {}})
        self.assertEqual(denied.status_code, 422, denied.text)
        self.assertEqual(await self.business_state(), before)
