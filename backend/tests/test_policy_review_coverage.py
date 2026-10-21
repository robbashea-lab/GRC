"""Real native completion routes; only the established isolated mocked Motor DB."""
from copy import deepcopy
from unittest.mock import patch
from test_client_dashboard_sources import ClientDashboardSourcesTests, server


AT = '2026-10-21T12:00:00+00:00'
BEFORE = '2026-10-20T12:00:00+00:00'
CID = 'demo_brawndo'


class PolicyCoverageTests(ClientDashboardSourcesTests):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.clock = patch.object(server, '_now', return_value=AT)
        self.clock.start()
        self.addCleanup(self.clock.stop)
        await server.db.clients.insert_one({'client_id': CID, 'name': 'Synthetic Policy coverage', 'status': 'active'})
        self.sign_in('admin')
        self.annual = {'review_id': 'annual', 'client_id': CID, 'baseline_key': 'policy-review', 'review_type': 'policy',
                       'title': 'Synthetic annual scope', 'status': 'upcoming', 'recurrence': 'annual',
                       'due_date': '2026-10-01', 'current_occurrence_id': 'annual-2026', 'updated_at': BEFORE}
        await server.db.reviews.insert_one(deepcopy(self.annual))

    async def policy(self, key, status='approved', pending=False, client_id=CID):
        subject = {'subject_id': key+'-subject-1', 'policy_id': key, 'client_id': client_id, 'title': key,
                   'version': '1', 'basis': {'type': 'external', 'reference': 'https://example.test/'+key, 'document_version': '1'}}
        approved = {'action': 'approved', 'at': '2025-01-01T00:00:00+00:00', 'by': 'original-approver',
                    'authority': 'internal_administrative', 'subject': subject}
        policy = {'policy_id': key, 'client_id': client_id, 'title': key, 'status': status, 'version': '1',
                  'updated_at': BEFORE, 'approval_history': [approved] if status == 'approved' or pending else [],
                  'decision_history': [], 'approved_at': approved['at'] if status == 'approved' else None,
                  'approval_subject': subject if status == 'approved' else None}
        if pending:
            policy.update(status='in_review', version='2', approval_request_id='pending-v2',
                          approval_source={'version': '2', 'external_reference': 'https://example.test/draft', 'external_version': '2'},
                          approval_subject={**subject, 'version': '2', 'subject_id': key+'-pending-2'})
            policy['approval_history'].append({'action': 'submitted', 'at': '2026-10-01', 'subject': deepcopy(policy['approval_subject'])})
        await server.db.policies.insert_one(deepcopy(policy))
        child = {'review_id': 'review-'+key, 'client_id': client_id, 'policy_id': key, 'review_type': 'policy',
                 'title': 'Review '+key, 'status': 'upcoming', 'recurrence': 'annual', 'due_date': '2026-01-31',
                 'updated_at': BEFORE, 'current_occurrence_id': key+'-2026'}
        await server.db.reviews.insert_one(child)
        return policy

    async def complete(self, **extra):
        return await self.client.post('/api/reviews/annual/complete', json={'occurrence_id': 'annual-2026', **extra})

    async def test_approved_members_pending_replacement_and_single_policy_are_independent(self):
        original_a = await self.policy('A')
        original_b = await self.policy('B', 'draft')
        original_c = await self.policy('C', pending=True)
        await self.policy('retired', 'retired')
        await self.policy('foreign', client_id='b')
        response = await self.complete(conclusion='Actual annual review')
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual([member['policy_id'] for member in result['occurrence']['policy_coverage']], ['A', 'C'])
        self.assertEqual([member['version'] for member in result['occurrence']['policy_coverage']], ['1', '1'])
        self.assertEqual(result['review']['due_date'][:10], '2027-10-01')
        for original in (original_a, original_c):
            stored = await server.db.policies.find_one({'policy_id': original['policy_id']}, {'_id': 0})
            for field in ('status', 'version', 'approval_subject', 'approval_source', 'approval_request_id', 'approved_at', 'approval_history', 'decision_history'):
                self.assertEqual(stored.get(field), original.get(field), field)
            self.assertEqual(stored['last_reviewed_at'], AT)
            self.assertEqual(len(stored['review_history']), 1)
            child = await server.db.reviews.find_one({'review_id': 'review-'+original['policy_id']}, {'_id': 0})
            self.assertEqual(len(child['occurrences']), 1)
            self.assertEqual(child['occurrences'][0]['covered_by'], {'review_id': 'annual', 'occurrence_id': 'annual-2026'})
            self.assertEqual(child['due_date'][:10], '2027-01-31')
        self.assertEqual(await server.db.policies.find_one({'policy_id': 'B'}, {'_id': 0}), original_b)
        replay = await self.complete(conclusion='Actual annual review')
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()['occurrence'], result['occurrence'])
        self.assertEqual(len((await server.db.reviews.find_one({'review_id': 'annual'}))['occurrences']), 1)
        child = await server.db.reviews.find_one({'review_id': 'review-A'}, {'_id': 0})
        single = await self.client.post('/api/reviews/review-A/complete', json={'occurrence_id': child['current_occurrence_id']})
        self.assertEqual(single.status_code, 200, single.text)
        self.assertEqual(len((await server.db.reviews.find_one({'review_id': 'annual'}))['occurrences']), 1)

    async def test_partial_failure_remains_open_freezes_membership_and_replays_once(self):
        await self.policy('A')
        await self.policy('C', pending=True)
        await server.db.reviews.update_one({'review_id': 'annual'}, {'$set': {'policy_ids': ['A', 'C']}})
        original_reconcile = server.policy_review_coverage.reconcile
        async def fail_metadata(db, review, plan, user, authorize):
            # One real child commit then failure; the same durable plan must resume.
            first = {**plan, 'members': plan['members'][:1]}
            await original_reconcile(db, review, first, user, authorize)
            raise RuntimeError('Synthetic persistence failure')
        with patch.object(server.policy_review_coverage, 'reconcile', side_effect=fail_metadata):
            with self.assertRaises(RuntimeError):
                await self.complete()
        annual = await server.db.reviews.find_one({'review_id': 'annual'}, {'_id': 0})
        self.assertNotIn('occurrences', annual)
        self.assertEqual(annual['current_occurrence_id'], 'annual-2026')
        self.assertEqual(annual['_policy_coverage_pending']['completed']['completed_at'], AT)
        for path in ['/api/reviews/annual', '/api/reviews/annual/history', '/api/related?entity_type=policies&entity_id=A']:
            public = await self.client.get(path)
            self.assertEqual(public.status_code, 200, public.text)
            self.assertNotIn('_policy_coverage_pending', public.text)
        related = (await self.client.get('/api/related?entity_type=policies&entity_id=A')).json()
        self.assertIn('annual', [row['review_id'] for row in related['reviews']])
        await self.policy('approved-later')
        changed = await self.complete(conclusion='Different intent')
        self.assertEqual(changed.status_code, 409, changed.text)
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([member['policy_id'] for member in response.json()['occurrence']['policy_coverage']], ['A', 'C'])
        for key in ('A', 'C'):
            self.assertEqual(len((await server.db.reviews.find_one({'review_id': 'review-'+key}))['occurrences']), 1)
            self.assertEqual(len((await server.db.policies.find_one({'policy_id': key}))['review_history']), 1)
        self.assertNotIn('_policy_coverage_pending', await server.db.reviews.find_one({'review_id': 'annual'}))

    async def test_busy_child_missing_child_and_foreign_subject_fail_closed(self):
        await self.policy('A')
        await server.db.reviews.update_one({'review_id': 'review-A'}, {'$set': {'_execution_lock': {'token': 'other', 'until': '2099-01-01'}}})
        response = await self.complete()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn('occurrences', await server.db.reviews.find_one({'review_id': 'annual'}))
        await server.db.reviews.delete_one({'review_id': 'review-A'})
        response = await self.complete()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn('occurrences', await server.db.reviews.find_one({'review_id': 'annual'}))

    async def test_foreign_identity_denied_actor_empty_set_and_unconfigured_cadence(self):
        self.sign_in('member')
        self.assertEqual((await self.complete()).status_code, 403)
        self.sign_in('admin')
        await server.db.reviews.update_one({'review_id': 'annual'}, {'$set': {'recurrence': 'quarterly'}})
        self.assertEqual((await self.complete()).status_code, 409)
        await server.db.reviews.update_one({'review_id': 'annual'}, {'$set': {'recurrence': 'annual'}})
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['occurrence']['policy_coverage'], [])

    async def test_independent_child_completion_is_reused_without_duplicate_history(self):
        await self.policy('A')
        original_reconcile = server.policy_review_coverage.reconcile
        async def concurrent_child(db, review, plan, user, authorize):
            response = await self.client.post('/api/reviews/review-A/complete', json={'occurrence_id': 'A-2026'})
            self.assertEqual(response.status_code, 200, response.text)
            self.independent = deepcopy(response.json()['occurrence'])
            return await original_reconcile(db, review, plan, user, authorize)
        with patch.object(server.policy_review_coverage, 'reconcile', side_effect=concurrent_child):
            response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        child = await server.db.reviews.find_one({'review_id': 'review-A'})
        self.assertEqual(child['occurrences'], [self.independent])
        self.assertEqual(response.json()['occurrence']['covered_policy_reviews'][0]['child_relation'], 'completed_independently')
        self.assertEqual((await self.complete()).status_code, 200)
        self.assertEqual((await server.db.reviews.find_one({'review_id': 'review-A'}))['occurrences'], [self.independent])

    async def freeze_pending(self):
        with patch.object(server.policy_review_coverage, 'reconcile', side_effect=RuntimeError('Synthetic interruption')):
            with self.assertRaises(RuntimeError):
                await self.complete()

    async def test_pending_retry_preserves_valid_child_owner_notes_and_future_schedule_save(self):
        await self.policy('A')
        await self.freeze_pending()
        changed = await self.client.patch('/api/reviews/review-A', json={'notes': 'Saved after annual cutoff',
            'owner_id': 'admin', 'due_date': '2030-02-15', 'expected_updated_at': BEFORE, 'expected_occurrence_id': 'A-2026'})
        self.assertEqual(changed.status_code, 200, changed.text)
        saved = changed.json()
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        child = await server.db.reviews.find_one({'review_id': 'review-A'})
        self.assertEqual(child['notes'], saved['notes'])
        self.assertEqual(child['owner_id'], saved['owner_id'])
        self.assertEqual(child['due_date'][:10], '2030-02-15')
        self.assertEqual(child['schedule_anchor'], saved['schedule_anchor'])
        self.assertEqual(server.review_occurrences.view(child)['next_review_date'][:10], '2031-02-15')
        self.assertEqual(child['occurrences'][0]['due_date'], '2026-01-31')
        self.assertEqual(child['occurrences'][0]['completed_at'], AT)
        self.assertEqual(response.json()['occurrence']['completed_at'], AT)
        next_event = await server.db.audit_logs.find_one({'entity_id': 'review-A', 'action': 'Next occurrence scheduled'})
        self.assertEqual(next_event['meta']['due_date'][:10], '2030-02-15')
        self.assertEqual(child['occurrences'][0]['covered_following_due_date'][:10], '2030-02-15')

    async def test_pending_retry_preserves_calendar_move_cycle_and_stopped_cadence(self):
        for calendar_move in (True, False):
            with self.subTest(calendar_move=calendar_move):
                await server.db.policies.delete_many({})
                await server.db.audit_logs.delete_many({})
                await server.db.reviews.delete_many({'review_id': {'$ne': 'annual'}})
                await server.db.reviews.replace_one({'review_id': 'annual'}, deepcopy(self.annual))
                await self.policy('A')
                await self.freeze_pending()
                request = {'due_date': '2030-02-15', 'expected_updated_at': BEFORE, 'expected_occurrence_id': 'A-2026'}
                request.update({'calendar_move': True} if calendar_move else {'recurrence': 'none'})
                saved = await self.client.patch('/api/reviews/review-A', json=request)
                self.assertEqual(saved.status_code, 200, saved.text)
                response = await self.complete()
                self.assertEqual(response.status_code, 200, response.text)
                child = await server.db.reviews.find_one({'review_id': 'review-A'})
                self.assertEqual(len(child['occurrences']), 1)
                self.assertEqual(child['occurrences'][0]['due_date'], '2026-01-31')
                if calendar_move:
                    self.assertEqual(child['due_date'][:10], '2027-01-31')
                    self.assertEqual(server.review_occurrences.view(child)['next_review_date'][:10], '2028-01-31')
                else:
                    self.assertEqual(child['recurrence'], 'none')
                    self.assertEqual(child['status'], 'completed')
                    self.assertIsNone(child['occurrences'][0]['covered_following_due_date'])
                    self.assertEqual(await server.db.audit_logs.count_documents({'entity_id': 'review-A', 'action': 'Next occurrence scheduled'}), 0)

    async def test_pending_retry_preserves_later_native_approval_and_frozen_original_subject(self):
        await self.policy('A')
        await self.freeze_pending()
        later = '2026-10-22T12:00:00+00:00'
        with patch.object(server, '_now', return_value=later):
            basis = await self.client.post('/api/policies/A/approval-subject', json={'version': '2',
                'external_reference': 'https://example.test/replacement', 'external_version': '2', 'expected_updated_at': BEFORE})
            self.assertEqual(basis.status_code, 200, basis.text)
            decision = await self.client.post('/api/policies/A/verify', json={'status': 'approved', 'expected_updated_at': basis.json()['updated_at']})
            self.assertEqual(decision.status_code, 200, decision.text)
        saved = decision.json()
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        member = response.json()['occurrence']['policy_coverage'][0]
        self.assertEqual((member['version'], member['subject_id']), ('1', 'A-subject-1'))
        stored = await server.db.policies.find_one({'policy_id': 'A'}, {'_id': 0})
        for field in ('status', 'version', 'approval_subject', 'approval_history', 'decision_history', 'approved_at', 'approval_source'):
            self.assertEqual(stored.get(field), saved.get(field), field)
        self.assertEqual(stored['review_history'][0]['version'], '1')

    async def test_pending_retry_keeps_retirement_and_does_not_schedule_another_child(self):
        await self.policy('A')
        await self.freeze_pending()
        retired = await self.client.patch('/api/policies/A', json={'status': 'retired', 'expected_updated_at': BEFORE})
        self.assertEqual(retired.status_code, 200, retired.text)
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        policy = await server.db.policies.find_one({'policy_id': 'A'})
        self.assertEqual(policy['status'], 'retired')
        self.assertIsNone(policy['next_review_date'])
        child = await server.db.reviews.find_one({'review_id': 'review-A'})
        self.assertEqual(child['status'], 'completed')
        self.assertEqual(len(child['occurrences']), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_id': 'review-A', 'action': 'Next occurrence scheduled'}), 0)

    async def test_pending_retry_retains_cancellation_without_inventing_completed_child(self):
        await self.policy('A')
        await self.freeze_pending()
        cancelled = await self.client.patch('/api/reviews/review-A', json={'status': 'cancelled',
            'expected_updated_at': BEFORE, 'expected_occurrence_id': 'A-2026'})
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        before = await server.db.reviews.find_one({'review_id': 'review-A'}, {'_id': 0})
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await server.db.reviews.find_one({'review_id': 'review-A'}, {'_id': 0}), before)
        self.assertFalse(before.get('occurrences'))
        self.assertEqual(response.json()['occurrence']['covered_policy_reviews'][0]['child_relation'], 'cancelled_after_cutoff')
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_id': 'review-A', 'action': 'Review completed'}), 0)

    async def test_pending_parent_child_and_policy_cannot_be_deleted_and_retry_still_completes(self):
        await self.policy('A')
        await self.freeze_pending()
        for path in ['/api/reviews/annual', '/api/reviews/review-A', '/api/policies/A']:
            response = await self.client.delete(path)
            self.assertEqual(response.status_code, 409, response.text)
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len((await server.db.reviews.find_one({'review_id': 'annual'}))['occurrences']), 1)

    async def test_foreign_subject_and_missing_approval_identity_do_not_expand_coverage(self):
        await self.policy('A')
        await server.db.policies.update_one({'policy_id': 'A'}, {'$set': {'approval_history.0.subject.client_id': 'b'}})
        response = await self.complete()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn('_policy_coverage_pending', await server.db.reviews.find_one({'review_id': 'annual'}))
        await server.db.policies.update_one({'policy_id': 'A'}, {'$set': {'approval_history': [], 'approval_subject': None}})
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['occurrence']['policy_coverage'], [])

    async def test_annual_catch_up_and_child_history_keep_one_real_completion_per_occurrence(self):
        await self.policy('A')
        await server.db.reviews.update_one({'review_id': 'annual'}, {'$set': {'due_date': '2020-02-29'}})
        await server.db.reviews.update_one({'review_id': 'review-A'}, {'$set': {'due_date': '2020-01-31'}})
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['review']['due_date'][:10], '2027-02-28')
        self.assertEqual(response.json()['occurrence']['due_date'], '2020-02-29')
        self.assertIn('2024-02-29', [day[:10] for day in response.json()['occurrence']['covered_schedule_skipped_dates']])
        child = await server.db.reviews.find_one({'review_id': 'review-A'})
        self.assertEqual(len(child['occurrences']), 1)
        self.assertEqual(child['occurrences'][0]['due_date'], '2020-01-31')
        self.assertEqual(child['due_date'][:10], '2027-01-31')
        logs = await server.db.audit_logs.find({'entity_id': 'review-A', 'action': 'Review completed'}).to_list(None)
        self.assertEqual(len(logs), 1)
        await self.complete()
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_id': 'review-A', 'action': 'Review completed'}), 1)

    async def test_invalid_annual_anchor_preserves_all_records(self):
        await self.policy('A')
        await server.db.reviews.update_one({'review_id': 'annual'}, {'$set': {'due_date': None}})
        response = await self.complete()
        self.assertEqual(response.status_code, 422, response.text)
        self.assertNotIn('occurrences', await server.db.reviews.find_one({'review_id': 'annual'}))
        self.assertNotIn('occurrences', await server.db.reviews.find_one({'review_id': 'review-A'}))

    def test_effective_subject_uses_latest_success_and_excludes_future_and_native_inactive_states(self):
        from policy_review_coverage import effective_subject
        subject = {'subject_id': 'approved-1', 'client_id': CID, 'policy_id': 'versions', 'version': '1'}
        second = {**subject, 'subject_id': 'approved-2', 'version': '2'}
        pending = {**subject, 'subject_id': 'pending-3', 'version': '3'}
        row = {'policy_id': 'versions', 'client_id': CID, 'version': '3', 'status': 'in_review', 'approval_subject': pending,
               'approval_history': [{'action': 'approved', 'at': '2025-01-01', 'by': 'first', 'subject': subject},
                                    {'action': 'approved', 'at': '2026-01-01', 'by': 'second', 'subject': second},
                                    {'action': 'submitted', 'at': '2026-10-20', 'subject': pending},
                                    {'action': 'approved', 'at': '2090-01-01', 'subject': pending}],
               'decision_history': [{'action': 'external_approval_recorded', 'recorded_at': '2026-10-20',
                                    'reported_approved_at': '2090-01-01', 'subject': pending}]}
        before = deepcopy(row)
        self.assertEqual(effective_subject(row, AT)['subject_id'], 'approved-2')
        self.assertEqual(effective_subject(row, AT)['approval']['by'], 'second')
        self.assertEqual(row, before)
        for status in ['retired', 'not_applicable', 'needs_creation', 'needs_verification', 'unknown']:
            with self.subTest(status=status):
                self.assertIsNone(effective_subject({**row, 'status': status}, AT))
        for exclusion in [{'archived': True}, {'archived_at': AT}, {'presence': 'reported_missing'}, {'presence': 'not_applicable'}]:
            with self.subTest(exclusion=exclusion):
                self.assertIsNone(effective_subject({**row, **exclusion}, AT))
        self.assertIsNone(effective_subject({**row, 'approval_history': []}, AT))
        future = {'policy_id': 'versions', 'client_id': CID, 'version': '2', 'status': 'approved',
                  'approval_subject': second, 'approved_at': '2090-01-01', 'effective_date': '2090-01-01'}
        self.assertIsNone(effective_subject(future, AT))
