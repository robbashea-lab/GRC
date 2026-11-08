"""Native completion routes in the isolated mocked and real-Mongo harnesses."""
import asyncio
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
        await server.db.clients.insert_one({'client_id': CID, 'name': 'Synthetic Policy coverage', 'status': 'active',
            'framework_settings': {'cis-ig1': {'implementation_group': 1}},
            'onboarding_baseline': {'completed': True, 'requirements': {'cis-ig1': 'applies'},
                                    'framework_settings': {'cis-ig1': {'implementation_group': 1}}}})
        await server.db.requirements.insert_one({'requirement_id': CID + '-cis', 'client_id': CID,
            'baseline_key': 'cis-ig1', 'baseline_response': 'applies'})
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

    async def test_selected_cis_groups_cover_real_client_identities_without_demo_name(self):
        for group in (1, 2, 3):
            with self.subTest(group=group):
                cid = 'synthetic-cis-ig' + str(group)
                await server.db.clients.insert_one({'client_id': cid, 'name': 'Synthetic configured client', 'status': 'active',
                    'framework_settings': {'cis-ig1': {'implementation_group': group}},
                    'onboarding_baseline': {'completed': True, 'requirements': {'cis-ig1': 'applies'},
                        'framework_settings': {'cis-ig1': {'implementation_group': group}}}})
                await server.db.requirements.insert_one({'requirement_id': cid + '-cis', 'client_id': cid,
                    'baseline_key': 'cis-ig1', 'baseline_response': 'applies'})
                await server.db.reviews.update_one({'review_id': 'annual'}, {'$set': {'client_id': cid}})
                await self.policy('group-' + str(group), client_id=cid)
                response = await self.complete()
                self.assertEqual(response.status_code, 200, response.text)
                covered = response.json()['occurrence']['policy_coverage']
                self.assertEqual([(m['client_id'], m['policy_id'], m['version']) for m in covered],
                                 [(cid, 'group-' + str(group), '1')])
                # Restore the same synthetic annual fixture for the next independent group.
                await server.db.reviews.delete_one({'review_id': 'annual'})
                await server.db.reviews.insert_one(deepcopy(self.annual))

    async def test_incomplete_selected_cis_configuration_cannot_silently_skip_coverage(self):
        await self.policy('A')
        before = await server.db.policies.find_one({'policy_id': 'A'}, {'_id': 0})
        for invalid in (None, 0, 4, True, '2'):
            with self.subTest(group=invalid):
                await server.db.clients.update_one({'client_id': CID}, {'$set': {
                    'framework_settings.cis-ig1.implementation_group': invalid}})
                response = await self.complete()
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(await server.db.policies.find_one({'policy_id': 'A'}, {'_id': 0}), before)
                self.assertNotIn('_policy_coverage_pending', await server.db.reviews.find_one({'review_id': 'annual'}))

    async def test_non_cis_generic_review_does_not_enable_policy_set_feature(self):
        await self.policy('A')
        await server.db.clients.update_one({'client_id': CID}, {'$set': {
            'onboarding_baseline.requirements.cis-ig1': 'does_not_apply'}})
        await server.db.requirements.update_one({'client_id': CID, 'baseline_key': 'cis-ig1'},
                                               {'$set': {'baseline_response': 'does_not_apply'}})
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn('policy_coverage', response.json()['occurrence'])
        self.assertNotIn('last_reviewed_at', await server.db.policies.find_one({'policy_id': 'A'}))

    async def test_malformed_stored_program_or_foreign_annual_kind_cannot_silently_complete(self):
        await self.policy('A')
        for settings in (None, [], 'invalid', {'cis-ig1': None}, {'cis-ig1': []}):
            with self.subTest(settings=settings):
                await server.db.clients.update_one({'client_id': CID}, {'$set': {'framework_settings': settings}})
                response = await self.complete()
                self.assertEqual(response.status_code, 409, response.text)
        await server.db.clients.update_one({'client_id': CID}, {'$set': {'framework_settings': {'cis-ig1': {'implementation_group': 2}}}})
        await server.db.reviews.update_one({'review_id': 'annual'}, {'$set': {'review_type': 'access'}})
        response = await self.complete()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn('last_reviewed_at', await server.db.policies.find_one({'policy_id': 'A'}))
        self.assertNotIn('occurrences', await server.db.reviews.find_one({'review_id': 'annual'}))

    async def test_saved_setup_draft_cannot_change_committed_client_projection_or_annual_coverage(self):
        await self.policy('A')
        setup = (await self.client.get('/api/onboarding/baseline?client_id=' + CID)).json()
        draft = {**setup['state'], 'version': 3, 'selected_policy_keys': [], 'policies': {}, 'reviews': [],
                 'requirements': {'cis-ig1': 'does_not_apply'}}
        saved = await self.client.post('/api/onboarding/baseline', json={'client_id': CID, 'finalize': False,
            'state': draft, 'expected_updated_at': setup['state'].get('updated_at')})
        self.assertEqual(saved.status_code, 200, saved.text)
        clients = (await self.client.get('/api/clients')).json()
        client = next(row for row in clients if row['client_id'] == CID)
        self.assertEqual(client['onboarding_baseline']['requirements']['cis-ig1'], 'does_not_apply')
        self.assertTrue(client['cis_program']['selected'])
        self.assertEqual(client['cis_program']['implementation_group'], 1)
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([member['policy_id'] for member in response.json()['occurrence']['policy_coverage']], ['A'])

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

    async def test_overlapping_annual_requests_conflict_then_replay_exactly_once(self):
        originals = [await self.policy('A'), await self.policy('C', pending=True)]
        draft = await self.policy('B', 'draft')
        await server.db.reviews.update_one({'review_id': 'review-A'}, {'$set': {'notes': 'Original child notes'}})
        entered, release = asyncio.Event(), asyncio.Event()
        plans = []
        original_reconcile = server.policy_review_coverage.reconcile

        async def hold_first_reconcile(db, review, plan, user, authorize):
            # The native request already owns its lease and durable frozen plan.
            # Hold only this test boundary, never production code or the database.
            plans.append(deepcopy(plan))
            if len(plans) == 1:
                entered.set()
                await release.wait()
            return await original_reconcile(db, review, plan, user, authorize)

        intent = {'conclusion': 'Synthetic overlapping annual completion'}
        with patch.object(server.policy_review_coverage, 'reconcile', side_effect=hold_first_reconcile):
            first = asyncio.create_task(self.complete(**intent))
            try:
                await asyncio.wait_for(entered.wait(), timeout=10)
                held = await server.db.reviews.find_one({'review_id': 'annual'}, {'_id': 0})
                self.assertTrue(held['_execution_lock']['token'])
                self.assertEqual(held['_policy_coverage_pending'], plans[0])
                self.assertNotIn('occurrences', held)
                self.assertFalse(first.done())

                # A second authenticated HTTP request actually runs while the
                # first is suspended inside completion, rather than after it.
                second = await asyncio.wait_for(self.complete(**intent), timeout=10)
                self.assertEqual(second.status_code, 409, second.text)
                self.assertEqual(second.json()['detail'], 'Another occurrence action is being saved; please retry')
                self.assertFalse(first.done())
                self.assertEqual(len(plans), 1)
                self.assertEqual(await server.db.reviews.find_one({'review_id': 'annual'}, {'_id': 0}), held)
                for key in ('A', 'C'):
                    self.assertNotIn('occurrences', await server.db.reviews.find_one({'review_id': 'review-' + key}))
                    self.assertNotIn('review_history', await server.db.policies.find_one({'policy_id': key}))

                edited = await self.client.patch('/api/reviews/review-A', json={
                    'notes': 'Saved while annual completion is in flight',
                    'expected_updated_at': BEFORE, 'expected_occurrence_id': 'A-2026'})
                self.assertEqual(edited.status_code, 200, edited.text)
                release.set()
                response = await asyncio.wait_for(asyncio.shield(first), timeout=10)
            finally:
                release.set()
                if not first.done():
                    first.cancel()
                await asyncio.gather(first, return_exceptions=True)

        self.assertEqual(response.status_code, 200, response.text)
        occurrence = response.json()['occurrence']
        self.assertEqual(occurrence['policy_coverage'], plans[0]['completed']['policy_coverage'])
        self.assertEqual([(m['policy_id'], m['version'], m['subject_id']) for m in occurrence['policy_coverage']],
                         [('A', '1', 'A-subject-1'), ('C', '1', 'C-subject-1')])
        for original in originals:
            key = original['policy_id']
            stored = await server.db.policies.find_one({'policy_id': key}, {'_id': 0})
            for field in ('status', 'version', 'approval_subject', 'approval_source', 'approval_request_id',
                          'approved_at', 'approval_history', 'decision_history'):
                self.assertEqual(stored.get(field), original.get(field), field)
            self.assertEqual(len(stored['review_history']), 1)
            self.assertEqual(stored['review_history'][0], {
                'review_id': 'annual', 'occurrence_id': 'annual-2026',
                'completed_at': AT, 'completed_by': 'admin',
                'subject_id': key + '-subject-1', 'version': '1'})
            child = await server.db.reviews.find_one({'review_id': 'review-' + key}, {'_id': 0})
            self.assertEqual(len(child['occurrences']), 1)
            self.assertEqual(child['occurrences'][0]['occurrence_id'], key + '-2026')
            self.assertEqual(child['occurrences'][0]['covered_by'],
                             {'review_id': 'annual', 'occurrence_id': 'annual-2026'})
            self.assertEqual(child['occurrences'][0]['policy_coverage'],
                             [next(member for member in occurrence['policy_coverage'] if member['policy_id'] == key)])
            self.assertEqual(child['due_date'][:10], '2027-01-31')
            if key == 'A':
                self.assertEqual(child['notes'], 'Saved while annual completion is in flight')
                self.assertEqual(child['occurrences'][0]['notes'], 'Original child notes')
        self.assertEqual(await server.db.policies.find_one({'policy_id': 'B'}, {'_id': 0}), draft)
        annual = await server.db.reviews.find_one({'review_id': 'annual'}, {'_id': 0})
        self.assertEqual(annual['occurrences'], [occurrence])
        self.assertEqual(annual['due_date'][:10], '2027-10-01')
        self.assertNotIn('_execution_lock', annual)
        self.assertNotIn('_policy_coverage_pending', annual)

        # Retry the losing request after the winner commits. Compare complete
        # synthetic records, not merely a successful response or history counts.
        before_retry = {
            'reviews': await server.db.reviews.find({}, {'_id': 0}).to_list(100),
            'policies': await server.db.policies.find({}, {'_id': 0}).to_list(100),
        }
        retry = await self.complete(**intent)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()['occurrence'], occurrence)
        self.assertEqual(await server.db.reviews.find({}, {'_id': 0}).to_list(100), before_retry['reviews'])
        self.assertEqual(await server.db.policies.find({}, {'_id': 0}).to_list(100), before_retry['policies'])

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
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn('coverage is incomplete for A', response.text)
        self.assertNotIn('_policy_coverage_pending', await server.db.reviews.find_one({'review_id': 'annual'}))
        self.assertNotIn('occurrences', await server.db.reviews.find_one({'review_id': 'annual'}))

    async def test_incomplete_approval_blocks_whole_set_without_partial_child_or_policy_writes(self):
        await self.policy('A')
        original = await self.policy('Z')
        cases = [
            {'approval_history': [], 'approval_subject': None, 'approved_at': None},
            {'approval_history': [{**original['approval_history'][0], 'subject': None}]},
            {'approval_history': [{key: value for key, value in original['approval_history'][0].items() if key != 'subject'}]},
            {'approval_history': [{**original['approval_history'][0], 'subject': {**original['approval_subject'], 'subject_id': ''}}]},
            {'approval_history': [{**original['approval_history'][0], 'subject': {**original['approval_subject'], 'version': ''}}]},
            {'approval_history': [{**original['approval_history'][0], 'at': 'invalid'}]},
            {'approval_history': [original['approval_history'][0], {'action': 'approved', 'at': '2026-01-01', 'subject': None}]},
            {'approval_history': [], 'approval_subject': None, 'status': 'in_review'},
            {'version': '2', 'approved_at': BEFORE, 'approval_subject': None},
            {'version': None, 'approval_subject': None},
            {'version': ' ', 'approval_subject': None},
            {'approved_at': BEFORE, 'approval_subject': None},
        ]
        before_a = await server.db.policies.find_one({'policy_id': 'A'}, {'_id': 0})
        before_child = await server.db.reviews.find_one({'review_id': 'review-A'}, {'_id': 0})
        for fields in cases:
            with self.subTest(fields=fields):
                await server.db.policies.replace_one({'policy_id': 'Z'}, {**deepcopy(original), **fields})
                before_z = await server.db.policies.find_one({'policy_id': 'Z'}, {'_id': 0})
                response = await self.complete()
                self.assertEqual(response.status_code, 409, response.text)
                self.assertIn('coverage is incomplete for Z', response.text)
                self.assertEqual(await server.db.policies.find_one({'policy_id': 'A'}, {'_id': 0}), before_a)
                self.assertEqual(await server.db.policies.find_one({'policy_id': 'Z'}, {'_id': 0}), before_z)
                self.assertEqual(await server.db.reviews.find_one({'review_id': 'review-A'}, {'_id': 0}), before_child)
                annual = await server.db.reviews.find_one({'review_id': 'annual'})
                self.assertNotIn('_policy_coverage_pending', annual)
                self.assertNotIn('occurrences', annual)

    async def test_genuinely_no_eligible_policies_is_not_incomplete_approval(self):
        await self.policy('draft', 'draft')
        await self.policy('retired', 'retired')
        future = await self.policy('future')
        future['approval_history'][0]['at'] = '2090-01-01'
        future['approved_at'] = '2090-01-01'
        await server.db.policies.replace_one({'policy_id': 'future'}, future)
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['occurrence']['policy_coverage'], [])

    def test_current_approved_claim_cannot_borrow_older_identity_but_pending_and_future_claims_keep_prior_coverage(self):
        from policy_review_coverage import effective_subject
        from fastapi import HTTPException
        subject = {'subject_id': 'prior-v1', 'client_id': CID, 'policy_id': 'versioned', 'version': '1'}
        event = {'action': 'approved', 'at': '2025-01-01', 'subject': subject, 'by': 'original-approver'}
        row = {'policy_id': 'versioned', 'client_id': CID, 'status': 'approved', 'version': '2',
               'approved_at': BEFORE, 'approval_subject': None, 'approval_history': [event]}
        for fields in [{}, {'version': None}, {'version': ' '}, {'version': '1'}]:
            with self.subTest(incomplete=fields):
                with self.assertRaises(HTTPException) as caught:
                    effective_subject({**row, **fields}, AT)
                self.assertEqual(caught.exception.status_code, 409)
                self.assertIn('coverage is incomplete', caught.exception.detail)
        for fields in [
            {'status': 'draft', 'approved_at': None},
            {'status': 'in_review', 'approved_at': None},
            {'approved_at': '2090-01-01'},
            {'effective_date': '2090-01-01'},
        ]:
            with self.subTest(prior_version=fields):
                result = effective_subject({**row, **fields}, AT)
                self.assertEqual((result['subject_id'], result['version']), ('prior-v1', '1'))
                self.assertEqual(result['approval']['by'], 'original-approver')
        # Missing denormalized date does not erase the complete, exact authoritative approval event.
        exact = {**row, 'version': '1', 'approved_at': None}
        original = deepcopy(exact)
        self.assertEqual(effective_subject(exact, AT)['subject_id'], 'prior-v1')
        self.assertEqual(exact, original)

    def test_external_approval_compares_reported_approval_moment_not_later_recording_time(self):
        from policy_review_coverage import effective_subject
        from fastapi import HTTPException
        subject = {'subject_id': 'external-v1', 'client_id': CID, 'policy_id': 'external', 'version': '1'}
        event = {'action': 'external_approval_recorded', 'recorded_at': BEFORE,
                 'reported_approved_at': '2025-01-01', 'subject': subject}
        row = {'policy_id': 'external', 'client_id': CID, 'status': 'approved', 'version': '1',
               'approved_at': '2025-01-01', 'decision_history': [event]}
        self.assertEqual(effective_subject(row, AT)['subject_id'], 'external-v1')
        for fields in [{'reported_approved_at': None}, {'reported_approved_at': '2024-01-01'}]:
            with self.subTest(fields=fields):
                with self.assertRaises(HTTPException) as caught:
                    effective_subject({**row, 'decision_history': [{**event, **fields}]}, AT)
                self.assertEqual(caught.exception.status_code, 409)
        direct = {**row, 'decision_history': [], 'approval_subject': subject}
        self.assertEqual(effective_subject(direct, AT)['subject_id'], 'external-v1')

    async def test_legacy_unchecked_pending_plan_is_preserved_and_requires_explicit_reconciliation(self):
        await self.policy('A')
        await self.freeze_pending()
        saved = await server.db.reviews.find_one({'review_id': 'annual'}, {'_id': 0})
        self.assertEqual(saved['_policy_coverage_pending']['identity_validation_version'], 1)
        original = deepcopy(saved['_policy_coverage_pending'])
        for members in [[], original['members']]:
            with self.subTest(empty=not members):
                legacy = {key: value for key, value in original.items() if key != 'identity_validation_version'}
                legacy['members'] = members
                await server.db.reviews.update_one({'review_id': 'annual'}, {'$set': {'_policy_coverage_pending': legacy}})
                before = await server.db.reviews.find_one({'review_id': 'annual'}, {'_id': 0})
                child = await server.db.reviews.find_one({'review_id': 'review-A'}, {'_id': 0})
                response = await self.complete()
                self.assertEqual(response.status_code, 409, response.text)
                self.assertIn('predates approval identity validation', response.text)
                self.assertEqual(await server.db.reviews.find_one({'review_id': 'annual'}, {'_id': 0}), before)
                self.assertEqual(await server.db.reviews.find_one({'review_id': 'review-A'}, {'_id': 0}), child)
        await server.db.reviews.update_one({'review_id': 'annual'}, {'$set': {'_policy_coverage_pending': original}})
        response = await self.complete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([member['policy_id'] for member in response.json()['occurrence']['policy_coverage']], ['A'])

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
