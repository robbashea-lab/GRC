"""Real native lifecycle contracts against the shipped portfolio in a disposable DB."""
from copy import deepcopy
import json
import unittest

import httpx

import approved_v3
from framework_catalog import active_definitions
import shared_review_plans
import test_approved_v3 as portfolio_fixture

# The fixture imports the native server under its isolated Mongo/env bindings.
from routes.onboarding import BASELINE_CATALOG


server = portfolio_fixture.server


def all_program_onboarding_state():
    """Native equivalent of the source's all-program, 17 Unsure policy intake."""
    state = {'version': 3, 'step': 3, 'completed': True,
             'policies': {policy['key']: 'unsure' for policy in BASELINE_CATALOG['policies']},
             'selected_policy_keys': [policy['key'] for policy in BASELINE_CATALOG['policies']],
             'requirements': {key: 'applies' for key in shared_review_plans.CATALOGS},
             'framework_settings': {'cis-ig1': {'implementation_group': 3}, 'cmmc': {'level': 2}},
             'framework_reviews': {}, 'reviews': []}
    for plan in shared_review_plans.selected_plans(state):
        config = shared_review_plans.shared_config({**state, 'framework_reviews': {}}, plan)
        state['framework_reviews'][plan['key']] = {'enabled': config['enabled'], 'recurrence': config['recurrence'], 'due_date': None}
        if config['recurrence'] == 'custom':
            state['framework_reviews'][plan['key']]['custom_recurrence_days'] = config['custom_recurrence_days']
    return state


class ApprovedV3LifecycleTests(unittest.IsolatedAsyncioTestCase):
    auth = portfolio_fixture.ApprovedPortfolioTests.auth
    initialize = portfolio_fixture.ApprovedPortfolioTests.initialize

    async def asyncSetUp(self):
        await portfolio_fixture.ApprovedPortfolioTests.asyncSetUp(self)
        self.scenario = json.loads(approved_v3.SCENARIO_PATH.read_text(encoding='utf-8'))
        initialized = await self.initialize()
        self.assertEqual(initialized.status_code, 200, initialized.text)
        self.portfolio_client = self.client
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
                                       base_url='https://isolated.example.test', headers=self.auth('owner'))
        self.addAsyncCleanup(self.client.aclose)

    async def complete(self, review):
        path = '/api/reviews/' + review['review_id']
        response = await self.client.get(path + '/completion-guide')
        self.assertEqual(response.status_code, 200, response.text)
        guide = response.json()
        self.assertFalse(guide['read_only'])
        self.assertGreater(len(guide['steps']), 0)
        # These are explicit synthetic operator results in the isolated test.
        # No request hook supplies evidence, results or current version tokens.
        body = {'occurrence_id': guide['occurrence_id'], 'expected_updated_at': guide['expected_updated_at'],
                'checklist': {'contract_token': guide['contract_token'], 'results': [
                    {'step_id': step['step_id'], 'result': 'Pass', 'reason': ''} for step in guide['steps']]},
                'outcome': 'No exceptions noted', 'supporting_reference': 'Synthetic completed native workflow test record'}
        accepted = await self.client.post(path + '/complete', json=body)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        occurrence = accepted.json()['occurrence']
        self.assertEqual(occurrence['completed_by'], 'owner')
        self.assertEqual(occurrence['occurrence_id'], guide['occurrence_id'])
        saved = await self.db.reviews.find_one({'review_id': review['review_id']}, {'_id': 0})
        self.assertEqual(saved['occurrences'][:-1], review.get('occurrences', []))
        self.assertEqual(saved['occurrences'][-1], occurrence)
        replay = await self.client.post(path + '/complete', json=body)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()['occurrence'], occurrence)
        self.assertEqual((await self.db.reviews.find_one({'review_id': review['review_id']}))['occurrences'], saved['occurrences'])
        return saved, occurrence

    async def test_all_eight_risk_reviews_complete_and_reschedule_one_canonical_series(self):
        visited = set()
        for client_id in sorted(approved_v3.CLIENT_IDS):
            with self.subTest(client_id=client_id):
                review = await self.db.reviews.find_one({'client_id': client_id, 'risk_id': {'$exists': True},
                                                        'status': {'$nin': ['completed', 'cancelled']}}, {'_id': 0})
                self.assertIsNotNone(review)
                risk_before = await self.db.risks.find_one({'risk_id': review['risk_id']}, {'_id': 0})
                saved, occurrence = await self.complete(review)
                self.assertNotEqual(saved['current_occurrence_id'], occurrence['occurrence_id'])
                risk = await self.db.risks.find_one({'risk_id': review['risk_id']}, {'_id': 0})
                self.assertEqual(risk['last_reviewed'], occurrence['completed_at'])
                self.assertEqual(risk['next_review'], saved['due_date'])
                self.assertEqual(risk['risk_score'], risk_before['risk_score'])
                self.assertEqual(risk['status'], risk_before['status'])
                moved = await self.client.patch('/api/reviews/' + review['review_id'], json={
                    'due_date': '2028-12-15', 'calendar_move': True,
                    'expected_updated_at': saved.get('updated_at'),
                    'expected_occurrence_id': saved['current_occurrence_id']})
                self.assertEqual(moved.status_code, 200, moved.text)
                after = await self.db.reviews.find_one({'review_id': review['review_id']}, {'_id': 0})
                self.assertEqual(after['current_occurrence_id'], saved['current_occurrence_id'])
                self.assertEqual(after['occurrences'], saved['occurrences'])
                self.assertEqual((await self.db.risks.find_one({'risk_id': review['risk_id']}))['next_review'][:10], '2028-12-15')
                self.assertEqual(await self.db.reviews.count_documents({'client_id': client_id, 'risk_id': review['risk_id']}), 1)
                records = await self.portfolio_client.get('/api/v3/approved-portfolio/records',
                    params={'client_id': client_id}, headers=self.auth('owner'))
                self.assertEqual(records.status_code, 200, records.text)
                packet = records.json()['records']
                self.assertEqual(next(row for row in packet['reviews'] if row['review_id'] == review['review_id'])['due_date'][:10], '2028-12-15')
                self.assertTrue(all(row['client_id'] == client_id for key in ('reviews', 'risks', 'tasks', 'evidence') for row in packet[key]))
                visited.add(client_id)
        self.assertEqual(visited, approved_v3.CLIENT_IDS)
        self.assertEqual(await self.db.clients.count_documents({'client_id': 'existing-client'}), 1)
        self.assertEqual(await self.db.users.count_documents({}), 3)

    async def test_policy_vendor_and_ai_review_completion_update_their_saved_parent_readbacks(self):
        for kind, field, key in [('policies', 'policy_id', 'policy_id'), ('vendors', 'vendor_id', 'vendor_id'),
                                 ('ai_systems', 'ai_system_id', 'ai_system_id')]:
            client_ids = {row['client_id'] for row in self.scenario['records']['reviews'] if row.get(field)}
            self.assertGreater(len(client_ids), 0)
            for client_id in sorted(client_ids):
                with self.subTest(kind=kind, client_id=client_id):
                    review = await self.db.reviews.find_one({'client_id': client_id, field: {'$exists': True},
                                                            'status': {'$nin': ['completed', 'cancelled']}}, {'_id': 0})
                    self.assertIsNotNone(review)
                    parent_before = await self.db[kind].find_one({key: review[field]}, {'_id': 0})
                    saved, occurrence = await self.complete(deepcopy(review))
                    rows = await self.client.get('/api/' + kind, params={'client_id': client_id})
                    self.assertEqual(rows.status_code, 200, rows.text)
                    parent = next(row for row in rows.json() if row[key] == review[field])
                    self.assertEqual(parent['status'], parent_before['status'])
                    if kind == 'policies':
                        self.assertEqual(parent['last_reviewed_at'], occurrence['completed_at'])
                        self.assertEqual(parent['next_review_date'], saved['due_date'])
                    elif kind == 'ai_systems':
                        self.assertEqual(parent['last_review'], occurrence['completed_at'])
                        self.assertEqual(parent['next_review'], saved['due_date'])
                    else:
                        stored = await self.db.vendors.find_one({key: review[field]})
                        purpose = review.get('vendor_purpose', 'vendor')
                        self.assertEqual(stored.get('last_review' if purpose == 'vendor' else purpose + '_last_reviewed'),
                                         occurrence['completed_at'])

    async def test_authorized_archived_client_catalog_remains_readable_and_archived_files_require_the_explicit_filter(self):
        client_id = 'v3sample_brawndo'
        review = await self.db.reviews.find_one({'client_id': client_id, 'risk_id': {'$exists': True}})
        uploaded = await self.client.post('/api/evidence', headers={'Idempotency-Key': 'native-multi-folder-proof'}, json={
            'client_id': client_id, 'linked_type': 'review', 'linked_id': review['review_id'],
            'occurrence_id': review['current_occurrence_id'], 'filename': 'native-multi-folder-proof.txt',
            'mime_type': 'text/plain', 'content_base64': 'VEVTVA=='})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        catalog = await self.client.get('/api/evidence/catalog', params={'client_id': client_id, 'q': 'native-multi-folder-proof.txt'})
        self.assertEqual(catalog.status_code, 200, catalog.text)
        self.assertEqual(catalog.json()['total'], 1)
        row = catalog.json()['items'][0]
        self.assertEqual(row['program_areas'], ['Reviews', 'Risks'])
        self.assertEqual({folder['area'] for folder in row['folders']}, {'Reviews', 'Risks'})
        await self.db.clients.update_one({'client_id': client_id}, {'$set': {
            'status': 'archived', 'archived_at': '2026-11-25T12:00:00Z'}})
        before = await self.client.get('/api/evidence/catalog', params={'client_id': client_id})
        self.assertEqual(before.status_code, 200, before.text)
        self.assertGreater(before.json()['total'], 0)
        evidence_id = before.json()['items'][0]['evidence_id']
        await self.db.evidence.update_one({'evidence_id': evidence_id}, {'$set': {'archived_at': '2026-11-25T12:00:00Z'}})
        current = await self.client.get('/api/evidence/catalog', params={'client_id': client_id})
        self.assertEqual(current.status_code, 200, current.text)
        self.assertEqual(current.json()['total'], before.json()['total'] - 1)
        retained = await self.client.get('/api/evidence/catalog', params={
            'client_id': client_id, 'state': json.dumps({'include_archived': True})})
        self.assertEqual(retained.status_code, 200, retained.text)
        self.assertEqual(retained.json()['total'], before.json()['total'])
        self.assertTrue(all(row['client_id'] == client_id for row in retained.json()['items']))

    async def test_all_six_program_onboarding_keeps_one_schedule_per_shared_review_and_rejects_conflicts(self):
        created = await self.client.post('/api/clients', headers={'Idempotency-Key': 'all-program-client'},
                                         json={'name': 'Synthetic all-program intake', 'assigned_owner_id': 'owner'})
        self.assertEqual(created.status_code, 200, created.text)
        client_id = created.json()['client_id']
        loaded = await self.client.get('/api/onboarding/baseline', params={'client_id': client_id})
        self.assertEqual(loaded.status_code, 200, loaded.text)
        state = all_program_onboarding_state()
        plans = shared_review_plans.selected_plans(state)
        user_access = [plan for plan in plans if plan.get('baseline_key') == 'user-access']
        self.assertEqual({plan['framework_key'] for plan in user_access}, set(state['requirements']))
        bad_state = deepcopy(state)
        bad_state['framework_reviews'][user_access[-1]['key']]['enabled'] = False
        body = {'client_id': client_id, 'state': bad_state, 'finalize': True,
                'expected_updated_at': loaded.json()['state'].get('updated_at'),
                'expected_records': loaded.json()['record_versions']}
        rejected = await self.client.post('/api/onboarding/baseline', headers={'Idempotency-Key': 'conflicting-shared-intake'}, json=body)
        self.assertEqual(rejected.status_code, 422, rejected.text)
        self.assertIn('Choose one cadence and first due date for shared Review', rejected.text)
        for table in ('policies', 'requirements', 'reviews', 'framework_assessments'):
            self.assertEqual(await self.db[table].count_documents({'client_id': client_id}), 0, table)
        self.assertFalse((await self.db.clients.find_one({'client_id': client_id})).get('onboarding_baseline', {}).get('completed'))

        # The source's individual NIST default was quarterly while CIS/CMMC
        # proposed monthly for this same activity. That disagreement must be
        # reconciled by the adapter before submission, never by weakening native validation.
        cadence_conflict = deepcopy(state)
        nist_vulnerability = next(plan for plan in plans if plan['framework_key'] == 'nist-csf-2'
                                  and plan.get('baseline_key') == 'vulnerability')
        cadence_conflict['framework_reviews'][nist_vulnerability['key']]['recurrence'] = 'quarterly'
        body['state'] = cadence_conflict
        rejected = await self.client.post('/api/onboarding/baseline', headers={'Idempotency-Key': 'conflicting-cadence-intake'}, json=body)
        self.assertEqual(rejected.status_code, 422, rejected.text)
        self.assertIn('Choose one cadence and first due date for shared Review', rejected.text)
        for table in ('policies', 'requirements', 'reviews', 'framework_assessments'):
            self.assertEqual(await self.db[table].count_documents({'client_id': client_id}), 0, table)

        body['state'] = state
        accepted = await self.client.post('/api/onboarding/baseline', headers={'Idempotency-Key': 'consistent-shared-intake'}, json=body)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        saved = await self.db.clients.find_one({'client_id': client_id})
        self.assertTrue(saved['onboarding_baseline']['completed'])
        self.assertEqual(saved['framework_settings']['cis-ig1']['implementation_group'], 3)
        self.assertEqual(saved['framework_settings']['cmmc']['level'], 2)
        policies = await self.db.policies.find({'client_id': client_id}, {'_id': 0}).to_list(None)
        self.assertEqual(len(policies), 17)
        self.assertTrue(all(policy['presence'] == 'needs_confirmation' and policy['status'] == 'needs_verification' for policy in policies))
        reviews = await self.db.reviews.find({'client_id': client_id}, {'_id': 0}).to_list(None)
        enabled_plans = [plan for plan in plans if state['framework_reviews'][plan['key']]['enabled']]
        groups = {plan.get('baseline_key') or plan['key'] for plan in enabled_plans}
        represented = {plan.get('baseline_key') for plan in enabled_plans}
        generic = set(state['reviews']) - represented
        self.assertEqual(len(reviews), len(groups) + len(generic))
        self.assertTrue(all(review['status'] == 'needs_scheduling' and not review.get('due_date') for review in reviews))
        for plan in plans:
            linked = [review for review in reviews if any(driver['framework_plan_key'] == plan['key']
                      for driver in shared_review_plans.active_mappings(review))]
            self.assertEqual(len(linked), 1 if state['framework_reviews'][plan['key']]['enabled'] else 0, plan['key'])
            if not linked:
                continue
            self.assertEqual(linked[0]['recurrence'], state['framework_reviews'][plan['key']]['recurrence'])
            if state['framework_reviews'][plan['key']]['recurrence'] == 'custom':
                self.assertEqual(linked[0]['custom_recurrence_days'], state['framework_reviews'][plan['key']]['custom_recurrence_days'])
        shared_access = [review for review in reviews if any(driver['framework_plan_key'] == user_access[0]['key']
                         for driver in shared_review_plans.active_mappings(review))]
        self.assertEqual(len(shared_access), 1)
        self.assertEqual(shared_access[0]['recurrence'], 'quarterly')
        self.assertEqual(len(shared_review_plans.active_mappings(shared_access[0])), 6)
        for framework in state['requirements']:
            assessments = await self.db.framework_assessments.find({'client_id': client_id, 'framework_key': framework}, {'_id': 0}).to_list(None)
            self.assertEqual(len(assessments), len(active_definitions(framework, state['framework_settings'].get(framework, {}))))
            self.assertTrue(all(row['status'] == 'not_assessed' and not row.get('implementation') for row in assessments))
        replay = await self.client.post('/api/onboarding/baseline', headers={'Idempotency-Key': 'consistent-shared-intake'}, json=body)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(await self.db.reviews.count_documents({'client_id': client_id}), len(reviews))
