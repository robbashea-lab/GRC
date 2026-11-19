"""Explicit setup removal/restoration through native HTTP and owned fixtures."""
from copy import deepcopy
from datetime import datetime
import unittest
from unittest.mock import patch

import create_requests
from framework_catalog import CATALOGS, active_plans
import r4_services as services
import review_occurrences
import test_client_dashboard_sources as fixture

server = fixture.server


class R4SetupRemovalTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def activity(self, existing=True, plan=None):
        self.sign_in('admin')
        plan = plan or active_plans('cis-ig1')[0]
        await server.db.requirements.insert_one({'requirement_id': 'r4-owned-cis', 'client_id': 'a',
            'baseline_key': 'cis-ig1', 'baseline_response': 'applies'})
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {
            'updated_at': '2026-11-19T00:00:00+00:00', 'profile.services': {'areas': {}, 'exclusions': {}}}})
        rid = 'r4-owned-removal-review'
        if existing:
            review = {'review_id': rid, 'client_id': 'a', 'title': 'Owned recurring activity',
                'review_type': plan['review_type'], 'framework_key': 'cis-ig1', 'framework_plan_key': plan['key'],
                'baseline_key': plan.get('baseline_key'),
                'status': 'upcoming', 'recurrence': 'quarterly', 'custom_recurrence_days': None,
                'due_date': '2099-12-01', 'recurrence_due_date': None,
                'current_occurrence_id': 'r4-owned-current', 'owner_id': 'member', 'reviewer_id': 'admin',
                'notes': 'Retained operational notes', 'updated_at': '2026-11-19T00:00:01+00:00',
                'activity_setup': {'no_ticket': False, 'notes': 'Retained setup notes'},
                'occurrences': [{'occurrence_id': 'r4-owned-prior', 'status': 'completed',
                    'completed_at': '2026-01-01T00:00:00+00:00', 'completed_by': 'member',
                    'checklist_results': [{'step_id': 'retained', 'result': 'Pass'}]}]}
            review.update(review_occurrences.schedule(review))
            self.assertEqual(review['schedule_anchor'], {'day': 1, 'month_end': False})
            self.assertEqual(review['next_review_date'][:10], '2100-03-01')
            await server.db.reviews.insert_one(review)
            await server.db.evidence.insert_one({'evidence_id': 'r4-owned-removal-evidence', 'client_id': 'a',
                'linked_type': 'review', 'linked_id': rid, 'filename': 'synthetic.txt', 'content_base64': 'U1lOVEhFVElD'})
        response = await self.client.get('/api/clients/a/iv-setup')
        self.assertEqual(response.status_code, 200, response.text)
        entry = next(row for row in response.json()['activities'] if row['plan_key'] == plan['key'])
        return entry['activity_id'], rid

    async def intent(self, activity_id, excluded, **values):
        response = await self.client.get('/api/clients/a/iv-setup')
        self.assertEqual(response.status_code, 200, response.text)
        current = response.json()
        entry = next(row for row in current['activities'] if row['activity_id'] == activity_id)
        return {'expected_client_updated_at': current['expected_client_updated_at'],
                'expected_updated_at': entry['expected_updated_at'], 'excluded': excluded, **values}

    def path(self, activity_id):
        return '/api/clients/a/iv-setup/exclusion/' + activity_id

    async def removal(self, activity_id):
        client = await server.db.clients.find_one({'client_id': 'a'})
        return client['profile']['services']['exclusions'].get(activity_id)

    def assert_review_preserved(self, before, after):
        before, after = deepcopy(before), deepcopy(after)
        for row in (before, after):
            row.pop('updated_at', None)
            for field in list(row):
                if field.startswith('_r4_context_'):
                    row.pop(field)
            row['activity_setup'].pop('no_ticket', None)
        self.assertEqual(after, before)

    async def test_three_explicit_choices_retain_canonical_reason_actor_note_and_review(self):
        activity, rid = await self.activity()
        original = await server.db.reviews.find_one({'review_id': rid})
        evidence = await server.db.evidence.find({}).to_list(None)
        expected = {'spm': 'The Security Program Manager performs it; no recurring ticket',
                    'client': 'The client or another provider does it', 'na': 'Doesn’t apply to Populated'}
        for kind in ('spm', 'client', 'na'):
            with self.subTest(kind=kind):
                values = {'kind': kind}
                if kind != 'client':
                    values['note'] = '  Synthetic tracking note  '
                body = await self.intent(activity, True, **values)
                response = await self.client.post(self.path(activity), json=body,
                    headers={'Idempotency-Key': 'r4-removal-explicit-' + kind})
                self.assertEqual(response.status_code, 200, response.text)
                recorded = await self.removal(activity)
                note = '' if kind == 'client' else 'Synthetic tracking note'
                self.assertEqual(recorded['kind'], kind)
                self.assertEqual(recorded['note'], note)
                self.assertEqual(recorded['reason'], expected[kind] + (' — ' + note if note else ''))
                self.assertEqual(recorded['by'], 'admin')
                self.assertIsNotNone(datetime.fromisoformat(recorded['at']).tzinfo)
                current = await server.db.reviews.find_one({'review_id': rid})
                # Changing from SPM to client/N/A preserves the already saved flag.
                self.assertIs(current['activity_setup']['no_ticket'], True)
                self.assert_review_preserved(original, current)
        restored = await self.client.post(self.path(activity), json=await self.intent(activity, False),
            headers={'Idempotency-Key': 'r4-removal-explicit-restore'})
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertIsNone(await self.removal(activity))
        current = await server.db.reviews.find_one({'review_id': rid})
        self.assertIs(current['activity_setup']['no_ticket'], False)
        self.assert_review_preserved(original, current)
        self.assertEqual(await server.db.evidence.find({}).to_list(None), evidence)
        self.assertEqual(await server.db.reviews.count_documents({}), 1)

    async def test_removing_uncreated_activity_does_not_create_operational_records(self):
        activity, _ = await self.activity(existing=False)
        before = {name: await server.db[name].find({}).to_list(None)
                  for name in ('reviews', 'vendors', 'tasks', 'findings', 'evidence', 'framework_assessments')}
        body = await self.intent(activity, True, kind='spm')
        response = await self.client.post(self.path(activity), json=body,
            headers={'Idempotency-Key': 'r4-removal-uncreated-activity'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((await self.removal(activity))['kind'], 'spm')
        self.assertEqual({name: await server.db[name].find({}).to_list(None) for name in before}, before)
        response = await self.client.post(self.path(activity), json=await self.intent(activity, False),
            headers={'Idempotency-Key': 'r4-restore-uncreated-activity'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual({name: await server.db[name].find({}).to_list(None) for name in before}, before)

    async def test_legacy_reason_shape_and_fingerprints_replay_without_kind_inference(self):
        activity, rid = await self.activity()
        reason = 'The Security Program Manager performs it; no recurring ticket'
        body = await self.intent(activity, True, reason=reason)
        key = 'r4-legacy-removal-receipt'
        route = 'clients/a/iv-setup/exclusion/' + activity
        identity = create_requests.digest(['admin', 'a', route, key])
        response = await self.client.post(self.path(activity), json=body, headers={'Idempotency-Key': key})
        self.assertEqual(response.status_code, 200, response.text)
        recorded = await self.removal(activity)
        self.assertEqual(set(recorded), {'reason', 'by', 'at'})
        self.assertEqual(recorded['reason'], reason)
        self.assertIs((await server.db.reviews.find_one({'review_id': rid}))['activity_setup']['no_ticket'], False)
        receipt = await server.db.create_requests.find_one({'_id': identity})
        self.assertEqual(receipt['fingerprint'], create_requests.digest(body))
        frozen = deepcopy(receipt['r4_write_plan'])
        self.assertEqual((await self.client.post(self.path(activity), json=body,
            headers={'Idempotency-Key': key})).status_code, 200)
        self.assertEqual(await self.removal(activity), recorded)
        self.assertEqual((await server.db.create_requests.find_one({'_id': identity}))['r4_write_plan'], frozen)
        read = await self.client.get('/api/clients/a/iv-setup')
        legacy = next(row for row in read.json()['activities'] if row['activity_id'] == activity)['exclusion']
        self.assertNotIn('kind', legacy)
        restore = await self.intent(activity, False)
        key = 'r4-legacy-restore-receipt'
        response = await self.client.post(self.path(activity), json=restore, headers={'Idempotency-Key': key})
        self.assertEqual(response.status_code, 200, response.text)
        identity = create_requests.digest(['admin', 'a', route, key])
        self.assertEqual((await server.db.create_requests.find_one({'_id': identity}))['fingerprint'],
                         create_requests.digest({**restore, 'reason': ''}))
        self.assertEqual((await self.client.post(self.path(activity), json=restore,
            headers={'Idempotency-Key': key})).status_code, 200)

    async def test_spm_removal_and_restore_recover_the_same_two_record_journal(self):
        activity, rid = await self.activity()
        original_review = await server.db.reviews.find_one({'review_id': rid})
        evidence = await server.db.evidence.find({}).to_list(None)
        for excluded in (True, False):
            with self.subTest(excluded=excluded):
                body = await self.intent(activity, excluded, **({'kind': 'spm', 'note': 'Original explicit note'} if excluded else {}))
                key = 'r4-removal-journal-' + str(excluded)
                identity = create_requests.digest(['admin', 'a', 'clients/a/iv-setup/exclusion/' + activity, key])
                collection_type = type(server.db.reviews)
                original_update = collection_type.update_one
                injected = False

                async def interrupt_review(collection, query, update, *args, **kwargs):
                    nonlocal injected
                    fields = update.get('$set', {})
                    if (not injected and collection.name == 'reviews' and query.get('review_id') == rid
                            and fields.get('_r4_context_applied') == identity and 'activity_setup.no_ticket' in fields):
                        injected = True
                        raise RuntimeError('Synthetic interruption between the exclusion and its Review flag')
                    return await original_update(collection, query, update, *args, **kwargs)

                with patch.object(collection_type, 'update_one', interrupt_review):
                    first = await self.client.post(self.path(activity), json=body, headers={'Idempotency-Key': key})
                self.assertTrue(injected, 'The fault must land before the paired Review business write')
                self.assertEqual(first.status_code, 503, first.text)
                receipt = await server.db.create_requests.find_one({'_id': identity})
                frozen = deepcopy(receipt['r4_write_plan'])
                self.assertEqual([(row['collection'], row['id']) for row in frozen], [('clients', 'a'), ('reviews', rid)])
                self.assertEqual(frozen[1]['patch']['activity_setup.no_ticket'], excluded)
                self.assertEqual((await self.client.get('/api/clients/a/iv-setup')).status_code, 409)
                recovered = await self.client.post(self.path(activity), json=body, headers={'Idempotency-Key': key})
                self.assertEqual(recovered.status_code, 200, recovered.text)
                self.assertEqual((await server.db.create_requests.find_one({'_id': identity}))['r4_write_plan'], frozen)
                current = await server.db.reviews.find_one({'review_id': rid})
                self.assertIs(current['activity_setup']['no_ticket'], excluded)
                self.assert_review_preserved(original_review, current)
                if excluded:
                    self.assertEqual(await self.removal(activity), frozen[0]['patch']['profile.services']['exclusions'][activity])
                else:
                    self.assertIsNone(await self.removal(activity))
                before_replay = await server.db.reviews.find_one({'review_id': rid})
                self.assertEqual((await self.client.post(self.path(activity), json=body,
                    headers={'Idempotency-Key': key})).status_code, 200)
                self.assertEqual(await server.db.reviews.find_one({'review_id': rid}), before_replay)
        self.assertEqual(await server.db.reviews.count_documents({}), 1)
        self.assertEqual(await server.db.evidence.find({}).to_list(None), evidence)

    async def test_restore_clears_only_actual_shared_driver_aliases_and_preserves_legacy_decisions(self):
        primary, other_key, other = next((first, key, second)
            for first in active_plans('cis-ig1') if first.get('baseline_key')
            for key in CATALOGS if key != 'cis-ig1'
            for second in active_plans(key) if second.get('baseline_key') == first['baseline_key'])
        activity, rid = await self.activity(plan=primary)
        await server.db.requirements.insert_one({'requirement_id': 'r4-owned-shared-program', 'client_id': 'a',
            'baseline_key': other_key, 'baseline_response': 'applies'})
        first_alias = 'plan:cis-ig1:' + primary['key']
        later_alias = 'plan:' + other_key + ':' + other['key']
        legacy = {'reason': 'Retained later-driver decision', 'by': 'historical-actor', 'at': '2026-01-01T00:00:00+00:00'}
        unrelated = {'review:unrelated-owned-id': {'reason': 'Retained unrelated decision'},
                     'plan:unknown:retained-id': {'reason': 'Retained unknown legacy decision'}}
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {
            'profile.services.exclusions': {later_alias: legacy, **unrelated}}})
        before = await server.db.clients.find_one({'client_id': 'a'})
        audit_before = await server.db.audit_logs.find({}).to_list(None)
        read = await self.client.get('/api/clients/a/iv-setup')
        self.assertEqual(read.status_code, 200, read.text)
        entry = next(row for row in read.json()['activities'] if row['activity_id'] == activity)
        self.assertTrue(any(driver['framework_key'] == other_key for driver in entry['drivers']))
        self.assertEqual(entry['state'], 'removed')
        self.assertEqual(entry['exclusion'], legacy)
        self.assertNotIn('kind', entry['exclusion'])
        self.assertEqual(await server.db.clients.find_one({'client_id': 'a'}), before)
        self.assertEqual(await server.db.audit_logs.find({}).to_list(None), audit_before)
        # Multiple retained keys for this same native activity must all clear;
        # unrelated and unknown decisions are not part of that identity set.
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {
            'profile.services.exclusions': {activity: {'reason': 'Canonical decision'}, first_alias: {'reason': 'First-driver decision'},
                                            later_alias: legacy, **unrelated}}})
        review_before = await server.db.reviews.find_one({'review_id': rid})
        evidence_before = await server.db.evidence.find({}).to_list(None)
        restored = await self.client.post(self.path(activity), json=await self.intent(activity, False),
            headers={'Idempotency-Key': 'r4-restore-actual-driver-aliases'})
        self.assertEqual(restored.status_code, 200, restored.text)
        client = await server.db.clients.find_one({'client_id': 'a'})
        self.assertEqual(client['profile']['services']['exclusions'], unrelated)
        current = await server.db.reviews.find_one({'review_id': rid})
        self.assertIs(current['activity_setup']['no_ticket'], False)
        self.assert_review_preserved(review_before, current)
        self.assertEqual(await server.db.reviews.count_documents({}), 1)
        self.assertEqual(await server.db.evidence.find({}).to_list(None), evidence_before)

    async def test_invalid_choices_unmatched_notes_spoofed_actor_and_stale_tokens_do_not_write(self):
        activity, rid = await self.activity()
        body = await self.intent(activity, True, kind='spm')
        client_before = await server.db.clients.find_one({'client_id': 'a'})
        review_before = await server.db.reviews.find_one({'review_id': rid})
        invalid = [({**body, 'kind': 'invented'}, 422), ({**body, 'note': 1}, 422),
                   ({**body, 'note': 'x' * 2001}, 422), ({**body, 'by': 'member'}, 422),
                   ({**body, 'kind': None, 'reason': '', 'note': ''}, 422),
                   ({**body, 'kind': None, 'reason': 'Legacy reason', 'note': 'Must not disappear'}, 422),
                   ({**body, 'expected_client_updated_at': 'obsolete'}, 409),
                   ({**body, 'expected_updated_at': 'obsolete'}, 409)]
        for index, (payload, status) in enumerate(invalid):
            with self.subTest(index=index):
                response = await self.client.post(self.path(activity), json=payload,
                    headers={'Idempotency-Key': 'r4-invalid-removal-' + str(index)})
                self.assertEqual(response.status_code, status, response.text)
                self.assertEqual(await server.db.clients.find_one({'client_id': 'a'}), client_before)
                self.assertEqual(await server.db.reviews.find_one({'review_id': rid}), review_before)
        self.sign_in('member')
        denied = await self.client.post(self.path(activity), json=body,
            headers={'Idempotency-Key': 'r4-contributor-removal-denied'})
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(await server.db.clients.find_one({'client_id': 'a'}), client_before)
        self.assertEqual(await server.db.reviews.find_one({'review_id': rid}), review_before)

    async def test_review_refetch_rejects_a_change_after_the_activity_snapshot(self):
        activity, rid = await self.activity()
        body = await self.intent(activity, True, kind='spm')
        client_before = await server.db.clients.find_one({'client_id': 'a'})
        review_before = await server.db.reviews.find_one({'review_id': rid})
        original_activities = services.activities
        injected = False

        async def concurrent_activity_read(s, client):
            nonlocal injected
            rows = await original_activities(s, client)
            if not injected:
                injected = True
                await s.db.reviews.update_one({'review_id': rid}, {'$set': {
                    'updated_at': '2026-11-19T00:00:02+00:00', 'notes': 'Concurrent retained note'}})
            return rows

        with patch.object(services, 'activities', concurrent_activity_read):
            denied = await self.client.post(self.path(activity), json=body,
                headers={'Idempotency-Key': 'r4-removal-refetch-conflict'})
        self.assertTrue(injected)
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertEqual(await server.db.clients.find_one({'client_id': 'a'}), client_before)
        expected = {**review_before, 'updated_at': '2026-11-19T00:00:02+00:00', 'notes': 'Concurrent retained note'}
        self.assertEqual(await server.db.reviews.find_one({'review_id': rid}), expected)
