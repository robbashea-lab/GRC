"""Fault-injection tests through real routes and isolated Mongo persistence."""
import asyncio
import unittest
from unittest.mock import patch

import httpx

from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
import routes.onboarding as onboarding


class OnboardingRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await Harness.asyncSetUp(self)
        self.sign_in('admin')
        self.raw = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=server.app, raise_app_exceptions=False),
            base_url='https://isolated.example.test', headers=self.client.headers)
        self.addAsyncCleanup(self.raw.aclose)
        self.route_db = patch.object(onboarding, 'db', server.db)
        self.route_db.start()
        self.addCleanup(self.route_db.stop)

    sign_in = Harness.sign_in

    async def baseline_body(self):
        current = (await self.client.get('/api/onboarding/baseline?client_id=a')).json()
        return {'client_id': 'a', 'finalize': True,
                'expected_updated_at': current['state'].get('updated_at'),
                'expected_records': current['record_versions'], 'state': {
                    'version': 3, 'policies': {p['key']: 'unsure' for p in onboarding.BASELINE_CATALOG['policies']},
                    'requirements': {p['key']: 'does_not_apply' for p in onboarding.BASELINE_CATALOG['requirements']},
                    'reviews': [onboarding.BASELINE_CATALOG['reviews'][0]['key']]}}

    async def submit(self, body, route='baseline', key='onboarding-recovery-0001'):
        return await self.raw.post('/api/onboarding/' + route, json=body, headers={'Idempotency-Key': key})

    async def test_partial_baseline_write_resumes_original_snapshot(self):
        body = await self.baseline_body()
        original = type(server.db.policies).update_one
        writes = 0

        async def interrupted(collection, *args, **kwargs):
            nonlocal writes
            if collection.name == 'policies':
                writes += 1
                if writes == 2:
                    raise RuntimeError('injected persistence failure')
            return await original(collection, *args, **kwargs)

        with patch.object(type(server.db.policies), 'update_one', interrupted):
            failed = await self.submit(body)
        self.assertIn(failed.status_code, (500, 503), failed.text)
        self.assertEqual(await server.db.policies.count_documents({'client_id': 'a'}), 1)
        retried = await self.submit(body)
        self.assertEqual(retried.status_code, 200, retried.text)
        self.assertEqual(await server.db.policies.count_documents({'client_id': 'a'}), len(onboarding.BASELINE_CATALOG['policies']))
        self.assertEqual(await server.db.reviews.count_documents({'client_id': 'a'}), 1)
        self.assertEqual((await self.submit(body)).json(), retried.json())
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'onboarding-complete'}), 1)

    async def test_audit_failure_retry_preserves_later_register_edit(self):
        body = await self.baseline_body()
        original = type(server.db.audit_logs).update_one
        original_insert = type(server.db.audit_logs).insert_one

        async def interrupted(collection, *args, **kwargs):
            if collection.name == 'audit_logs':
                raise RuntimeError('injected audit failure')
            return await original(collection, *args, **kwargs)

        async def interrupted_insert(collection, *args, **kwargs):
            if collection.name == 'audit_logs':
                raise RuntimeError('injected audit failure')
            return await original_insert(collection, *args, **kwargs)

        # Existing code uses insert_one; fail either write API before receipt support.
        with patch.object(type(server.db.audit_logs), 'update_one', interrupted), \
             patch.object(type(server.db.audit_logs), 'insert_one', interrupted_insert):
            failed = await self.submit(body)
        self.assertIn(failed.status_code, (500, 503), failed.text)
        row = await server.db.policies.find_one({'client_id': 'a'})
        await server.db.policies.update_one({'policy_id': row['policy_id']}, {'$set': {
            'presence': 'verified_existing', 'status': 'approved', 'updated_at': '2030-01-01T00:00:00+00:00'}})
        retried = await self.submit(body)
        self.assertEqual(retried.status_code, 200, retried.text)
        stored = await server.db.policies.find_one({'policy_id': row['policy_id']})
        self.assertEqual((stored['presence'], stored['status']), ('verified_existing', 'approved'))
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'onboarding-complete'}), 1)

    async def test_lost_client_completion_response_replays_and_concurrent_retries(self):
        body = await self.baseline_body()
        original = type(server.db.clients).update_one
        failed_once = False

        async def interrupted(collection, query, update, **kwargs):
            nonlocal failed_once
            result = await original(collection, query, update, **kwargs)
            if collection.name == 'clients' and 'onboarding_baseline' in update.get('$set', {}) and not failed_once:
                failed_once = True
                raise RuntimeError('injected lost write acknowledgment')
            return result

        with patch.object(type(server.db.clients), 'update_one', interrupted):
            failed = await self.submit(body)
        self.assertIn(failed.status_code, (500, 503), failed.text)
        replies = await asyncio.gather(*(self.submit(body) for _ in range(5)))
        self.assertTrue(all(r.status_code in (200, 409) for r in replies))
        retried = await self.submit(body)
        self.assertEqual(retried.status_code, 200, retried.text)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'onboarding-complete'}), 1)
        client = await server.db.clients.find_one({'client_id': 'a'})
        self.assertTrue(client['initial_program_baseline']['state']['completed'])

    async def test_legacy_partial_write_and_audit_retry_are_deterministic(self):
        body = {'client_id': 'a', 'policy_responses': [{'name': 'Recovery policy', 'response': 'no'}],
                'known_issues': [{'title': 'Known gap', 'classification': 'verified_finding'}],
                'recurring_reviews': [{'title': 'Month end', 'review_type': 'governance', 'recurrence': 'monthly', 'due_date': '2028-01-31'}]}
        with patch.object(onboarding, 'audit', side_effect=RuntimeError('injected audit failure')):
            failed = await self.submit(body, 'finalize')
        self.assertIn(failed.status_code, (500, 503), failed.text)
        retried = await self.submit(body, 'finalize')
        self.assertEqual(retried.status_code, 200, retried.text)
        self.assertEqual((await self.submit(body, 'finalize')).json(), retried.json())
        for collection in ('policies', 'tasks', 'findings', 'reviews'):
            self.assertEqual(await server.db[collection].count_documents({'client_id': 'a'}), 1)
        review = await server.db.reviews.find_one({'client_id': 'a'})
        self.assertEqual(review['schedule_anchor'], {'day': 31, 'month_end': True})
        self.assertTrue(review['next_review_date'].startswith('2028-02-29'))
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'onboarding-complete'}), 1)

    async def test_request_identity_payload_and_authorization_boundaries(self):
        body = await self.baseline_body()
        missing = await self.raw.post('/api/onboarding/baseline', json=body)
        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertEqual(await server.db.policies.count_documents({}), 0)
        self.assertEqual((await self.submit(body)).status_code, 200)
        changed = {**body, 'state': {**body['state'], 'reviews': []}}
        self.assertEqual((await self.submit(changed)).status_code, 409)
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'client_readonly'}})
        self.assertEqual((await self.submit(body)).status_code, 403)
        self.assertEqual(await server.db.policies.count_documents({'client_id': 'b'}), 0)

    async def test_unapplied_record_edit_conflicts_without_overwriting(self):
        item = onboarding.BASELINE_CATALOG['policies'][1]
        await server.db.policies.insert_one({'policy_id': 'existing', 'client_id': 'a', 'title': item['name'],
                                            'presence': 'reported_existing', 'updated_at': '2026-01-01T00:00:00+00:00'})
        body = await self.baseline_body()
        original = type(server.db.policies).update_one

        async def interrupted(collection, query, *args, **kwargs):
            if collection.name == 'policies' and query.get('policy_id') == 'existing':
                raise RuntimeError('injected failure before second policy')
            return await original(collection, query, *args, **kwargs)

        with patch.object(type(server.db.policies), 'update_one', interrupted):
            self.assertEqual((await self.submit(body)).status_code, 503)
        await server.db.policies.update_one({'policy_id': 'existing'}, {'$set': {
            'presence': 'verified_existing', 'updated_at': '2026-02-01T00:00:00+00:00'}})
        response = await self.submit(body)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotEqual(response.headers.get('x-create-rejected'), 'true')
        self.assertEqual((await server.db.policies.find_one({'policy_id': 'existing'}))['presence'], 'verified_existing')
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'onboarding-complete'}), 0)

    async def test_framework_reconciliation_failure_resumes_and_preserves_review_history(self):
        body = await self.baseline_body()
        body['state']['requirements']['cis-ig1'] = 'applies'
        original = type(server.db.framework_assessments).update_one
        writes = 0

        async def interrupted(collection, *args, **kwargs):
            nonlocal writes
            if collection.name == 'framework_assessments':
                writes += 1
                if writes == 2:
                    raise RuntimeError('injected reconciliation outage')
            return await original(collection, *args, **kwargs)

        with patch.object(type(server.db.framework_assessments), 'update_one', interrupted):
            self.assertEqual((await self.submit(body)).status_code, 503)
        completed = await self.submit(body)
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id': 'a'}), 56)
        review = await server.db.reviews.find_one({'client_id': 'a', 'framework_key': 'cis-ig1'})
        history = [{'occurrence_id': 'historical', 'status': 'completed', 'title': 'Original title'}]
        await server.db.reviews.update_one({'review_id': review['review_id']}, {'$set': {
            'title': 'Operator title', 'owner_id': 'member', 'completed_occurrences': history}})
        self.assertEqual((await self.submit(body)).json(), completed.json())
        retained = await server.db.reviews.find_one({'review_id': review['review_id']})
        self.assertEqual((retained['title'], retained['owner_id'], retained['completed_occurrences']),
                         ('Operator title', 'member', history))

    async def test_legacy_invalid_schedule_rejects_batch_before_writing(self):
        body = {'client_id': 'a', 'policy_responses': [{'name': 'Must not appear', 'response': 'yes'}],
                'recurring_reviews': [{'title': 'Bad date', 'review_type': 'governance', 'due_date': 'not-a-date'}]}
        response = await self.submit(body, 'finalize')
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.headers.get('x-create-rejected'), 'true')
        self.assertEqual(await server.db.policies.count_documents({'client_id': 'a'}), 0)
        self.assertEqual(await server.db.reviews.count_documents({'client_id': 'a'}), 0)

    async def test_legacy_foreign_evidence_and_ineligible_owners_reject_before_writes(self):
        await server.db.evidence.insert_many([
            {'evidence_id': 'foreign', 'client_id': 'b'},
            {'evidence_id': 'archived', 'client_id': 'a', 'archived_at': '2026-01-01'}])
        await server.db.users.insert_many([
            {'user_id': 'foreign-owner', 'email': 'foreign-owner@example.test', 'client_ids': ['b'], 'role': 'client_grc_manager', 'status': 'active'},
            {'user_id': 'inactive-owner', 'email': 'inactive-owner@example.test', 'client_ids': ['a'], 'role': 'client_grc_manager', 'status': 'disabled'}])
        cases = [
            {'assessments': [{'name': 'External audit', 'evidence_ids': [ident]}]} for ident in ('foreign', 'archived', 'missing')]
        for owner in ('foreign-owner', 'inactive-owner', 'missing'):
            cases.extend([
                {'known_issues': [{'title': 'Unassigned gap', 'owner_id': owner, 'classification': classification}]} for classification in ('reported', 'verified_finding')])
            cases.append({'recurring_reviews': [{'title': 'Invalid owner', 'review_type': 'governance', 'owner_id': owner}]})
        for index, extra in enumerate(cases):
            with self.subTest(extra):
                body = {'client_id': 'a', 'policy_responses': [{'name': 'Must not appear', 'response': 'yes'}], **extra}
                response = await self.submit(body, 'finalize', key=f'invalid-onboarding-reference-{index}')
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.headers.get('x-create-rejected'), 'true')
                for collection in ('policies', 'assessments', 'findings', 'tasks', 'reviews'):
                    self.assertEqual(await server.db[collection].count_documents({'client_id': 'a'}), 0)
