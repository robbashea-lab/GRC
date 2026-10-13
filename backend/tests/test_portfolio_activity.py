"""Activity facts, access and recovery against isolated in-memory Mongo fixtures."""
import copy
import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
import portfolio_activity as activity
import test_onboarding_recovery as onboarding_scenarios
import portfolio_deletions as deletions
from create_requests import digest
from pymongo.results import DeleteResult


class PortfolioActivityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()['portfolio_activity_isolated']
        self.user = {'user_id': 'operator', 'name': 'Original operator', 'role': 'platform_admin', 'client_ids': ['a']}
        self.clients = [{'client_id': 'a', 'name': 'Authorized client'}]
        self.now = datetime.now(timezone.utc)
        self.as_of = self.now.isoformat()

    async def event(self, identity, at=None, kind='risks', before=None, after=None, client_id='a'):
        key = activity.SOURCES[kind][0]
        before = {'status': 'identified'} if before is None else before
        after = {'status': 'assessed'} if after is None else after
        event = activity.project_committed_change(kind, identity, client_id, self.user, before, after,
                                                  at or self.as_of)
        await self.db[kind].insert_one({key: identity, 'client_id': client_id, **after})
        await activity.persist_event(self.db, event)
        return event

    async def test_actual_business_values_and_historical_actor_are_minimized(self):
        before = {'client_id': 'a', 'status': 'identified', 'risk_score': None, 'notes': 'SECRET OLD'}
        after = {'client_id': 'a', 'status': 'assessed', 'risk_score': 16, 'likelihood_score': 4,
                 'impact_score': 4, 'description': 'SECRET NEW', 'password_hash': 'SECRET HASH'}
        event = await self.event('risk-one', before=before, after=after)
        self.user['name'] = 'Renamed person'
        result = await activity.read_activity(self.db, self.user, self.clients, self.as_of)
        public = result['events'][0]
        self.assertEqual(public['actor']['name'], 'Original operator')
        self.assertEqual(public['before'], {'status': 'identified', 'risk_score': None})
        self.assertEqual(public['after']['risk_score'], 16)
        self.assertNotIn('SECRET', json.dumps(result))
        self.assertEqual(public['source']['to'], '/risks?id=risk-one&client_id=a')
        self.assertEqual(event['event_id'], public['event_id'])

    async def test_noop_technical_noise_and_failed_audits_are_not_business_events(self):
        before = {'status': 'open', 'updated_at': 'old'}
        after = {'status': 'open', 'updated_at': 'new', '_save_command': 'retry'}
        self.assertIsNone(activity.project_committed_change('risks', 'r', 'a', self.user, before, after, self.as_of))
        audit = {'log_id': 'audit-one', 'client_id': 'a', 'entity_id': 'r', 'entity_type': 'risk',
                 'action': 'Risk updated', 'outcome': 'success', 'at': self.as_of,
                 'meta': {'changed_fields': ['updated_at']}}
        self.assertIsNone(activity.project_audit(audit))
        audit['meta']['changed_fields'] = ['status']
        self.assertIsNone(activity.project_audit(audit))
        audit['meta']['changes'] = {'status': {'before': 'identified', 'after': 'assessed'}}
        self.assertIsNotNone(activity.project_audit(audit))
        for outcome in ('failed', 'requested', 'cancelled'):
            self.assertIsNone(activity.project_audit({**audit, 'outcome': outcome}))
        for action in ('login', 'view', 'delete-requested', 'CIS assessment export'):
            self.assertIsNone(activity.project_audit({**audit, 'action': action}))
        self.assertIsNone(activity.project_audit({**audit, 'meta': {'_portfolio_activity_event_id': 'atomic-id'}}))
        self.assertIsNone(activity.project_committed_change('evidence', 'archive', 'a', self.user,
            {'archived_at': '2026-10-12T12:00:00Z'}, {'archived_at': self.as_of}, self.as_of))
        scope = {**audit, 'entity_type': 'client', 'action': 'CIS scope updated'}
        self.assertIsNone(activity.project_audit({**scope, 'meta': {'before': 2, 'after': 2}}))
        self.assertIsNotNone(activity.project_audit({**scope, 'meta': {'before': 1, 'after': 2}}))
        self.assertIsNone(activity.project_audit({**scope, 'action': 'SOC 2 readiness scope updated',
            'meta': {'categories': ['security', 'availability']}}))

    async def test_distinct_same_timestamp_changes_keep_separate_safe_events(self):
        first = activity.project_committed_change('risks', 'same-time', 'a', self.user,
            {'status': 'identified'}, {'status': 'assessed'}, self.as_of)
        second = activity.project_committed_change('risks', 'same-time', 'a', self.user,
            {'status': 'assessed'}, {'status': 'identified'}, self.as_of)
        self.assertNotEqual(first['event_id'], second['event_id'])
        self.assertEqual(first['event_id'], activity.project_committed_change('risks', 'same-time', 'a', self.user,
            {'status': 'identified'}, {'status': 'assessed'}, self.as_of)['event_id'])
        control = activity.project_committed_change('organizational_controls', 'control', 'a', self.user,
            {'frequency': 'monthly', 'design': 'adequate'},
            {'frequency': 'quarterly', 'design': 'gap', 'reconciliation_note': 'PRIVATE NOTE'}, self.as_of)
        self.assertEqual(control['after'], {'design': 'gap'})
        self.assertNotIn('PRIVATE NOTE', json.dumps(control))

    async def test_all_categories_use_actual_source_links_without_invented_programs(self):
        for kind in ('framework_assessments', 'findings', 'risks', 'policies', 'evidence', 'requirements'):
            before, after = {'status': 'not_assessed'}, {'status': 'addressed'}
            if kind == 'framework_assessments':
                before['framework_key'] = after['framework_key'] = 'cis-ig1'
            if kind == 'evidence':
                before, after = {}, {'filename': 'Secret contents.txt', 'content_base64': 'SECRET BYTES'}
            if kind == 'requirements':
                before, after = {'baseline_response': 'unsure'}, {'baseline_response': 'applies'}
            await self.event(kind + '-record', kind=kind, before=before, after=after)
        result = await activity.read_activity(self.db, self.user, self.clients, self.as_of)
        self.assertEqual({event['type'] for event in result['events']}, activity.TYPES)
        policy = next(event for event in result['events'] if event['type'] == 'Policies')
        self.assertNotIn('program_key', policy)
        assessment = next(event for event in result['events'] if event['type'] == 'Assessments')
        self.assertIn('/compliance/cis-ig1?', assessment['source']['to'])
        self.assertNotIn('SECRET BYTES', json.dumps(result))
        self.assertNotIn('Secret contents.txt', json.dumps(result))

    async def test_assessment_program_label_retains_actual_saved_group_without_current_scope_inference(self):
        before = {'framework_key': 'cis-ig1', 'status': 'not_assessed'}
        after = {'framework_key': 'cis-ig1', 'status': 'addressed',
                 '_portfolio_program_key': 'cis-ig2', '_portfolio_program_label': 'CIS IG2'}
        await self.event('group-at-save', kind='framework_assessments', before=before, after=after)
        clients = [{**self.clients[0], 'framework_settings': {'cis-ig1': {'implementation_group': 3}}}]
        result = await activity.read_activity(self.db, self.user, clients, self.as_of)
        event = result['events'][0]
        self.assertEqual(event['program_key'], 'cis-ig2')
        self.assertEqual(event['program_label'], 'CIS IG2')
        self.assertEqual(event['source']['framework_key'], 'cis-ig1')
        self.assertIn('/compliance/cis-ig1?', event['source']['to'])
        self.assertNotIn('CIS IG3', str(result))

    async def test_legacy_assessment_without_saved_group_uses_generic_native_program_label(self):
        row = {'framework_assessment_id': 'legacy', 'client_id': 'a', 'framework_key': 'cis-ig1'}
        await self.db.framework_assessments.insert_one(row)
        event = activity.project_audit({'log_id': 'legacy-assessment-log', 'entity_type': 'framework_assessment',
            'entity_id': 'legacy', 'client_id': 'a', 'at': self.as_of,
            'action': 'Framework assessment updated', 'meta': {'changed_fields': ['status'], 'status': 'addressed',
                'changes': {'status': {'before': 'not_assessed', 'after': 'addressed'}}}})
        await activity.persist_event(self.db, event)
        clients = [{**self.clients[0], 'framework_settings': {'cis-ig1': {'implementation_group': 3}}}]
        result = await activity.read_activity(self.db, self.user, clients, self.as_of)
        self.assertEqual(result['events'][0]['program_label'], 'CIS Controls')
        self.assertNotIn('CIS IG3', str(result))

    async def test_review_configuration_mirrors_require_genuine_changed_field_receipt(self):
        document = {'log_id': 'config-mirror', 'entity_type': 'review', 'entity_id': 'r', 'client_id': 'a',
            'at': self.as_of, 'action': 'Review configuration changed', 'meta': {'fields': ['owner_id']}}
        self.assertIsNone(activity.project_audit(document))
        document['meta']['changed_fields'] = ['owner_id']
        self.assertIsNone(activity.project_audit(document))
        document['meta']['changes'] = {'owner_id': {'before': 'original', 'after': 'new'}}
        self.assertIsNotNone(activity.project_audit(document))
        document['meta']['_portfolio_activity_event_id'] = 'atomic-review-event'
        self.assertIsNone(activity.project_audit(document))

    async def test_pending_event_survives_interruption_duplicate_delivery_and_restart(self):
        event = activity.project_committed_change('risks', 'retained', 'a', self.user,
            {'status': 'identified'}, {'status': 'assessed'}, self.as_of)
        identity = event['event_id']
        await self.db.risks.insert_one({'risk_id': 'retained', 'client_id': 'a', 'status': 'assessed',
            '_portfolio_activity_pending': {identity: event}})
        original = type(self.db.risks).update_one

        async def interrupted(collection, *args, **kwargs):
            if collection.name == 'risks':
                raise RuntimeError('source acknowledgement unavailable')
            return await original(collection, *args, **kwargs)

        with patch.object(type(self.db.risks), 'update_one', interrupted):
            with self.assertRaisesRegex(RuntimeError, 'acknowledgement'):
                await activity.reconcile_pending(self.db)
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 1)
        self.assertIn(identity, (await self.db.risks.find_one({}))['_portfolio_activity_pending'])
        recovered = await activity.reconcile_pending(self.db)
        self.assertEqual(recovered, {'processed': 1, 'inserted': 0})
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 1)
        self.assertNotIn('_portfolio_activity_pending', await self.db.risks.find_one({}))
        self.assertFalse(await activity.persist_event(self.db, event))

    async def test_projection_failure_never_acknowledges_source_pending_marker(self):
        event = activity.project_committed_change('evidence', 'proof', 'a', self.user, {}, {'filename': 'f'}, self.as_of)
        await self.db.evidence.insert_one({'evidence_id': 'proof', 'client_id': 'a',
            '_portfolio_activity_pending': {event['event_id']: event}})
        with patch.object(activity, 'persist_event', side_effect=RuntimeError('projection outage')):
            with self.assertRaisesRegex(RuntimeError, 'projection outage'):
                await activity.reconcile_pending(self.db)
        self.assertTrue((await self.db.evidence.find_one({}))['_portfolio_activity_pending'])
        self.assertEqual((await activity.reconcile_pending(self.db))['inserted'], 1)

    async def test_explicit_assessment_judgment_is_captured_without_draft_or_noop_noise(self):
        before = {'status': 'addressed', 'implementation': 'Existing implementation', 'last_assessed': 'old'}
        after = {**before, 'last_assessed': self.as_of}
        self.assertIsNone(activity.project_committed_change('framework_assessments', 'a1', 'a', self.user,
            before, after, self.as_of))
        recorded = activity.project_committed_change('framework_assessments', 'a1', 'a', self.user,
            before, after, self.as_of, action='record_assessment')
        self.assertIsNotNone(recorded)
        self.assertEqual(recorded['title'], 'Assessment recorded')
        self.assertEqual(recorded['changed_fields'], [])
        self.assertNotIn('Existing implementation', json.dumps(recorded))
        audit = {'log_id': 'evidence-mirror', 'entity_type': 'framework_assessment', 'client_id': 'a',
            'entity_id': 'a1', 'at': self.as_of, 'action': 'Framework record linked',
            'meta': {'kind': 'evidence', 'id': 'existing-proof'}}
        self.assertIsNone(activity.project_audit(audit))

    async def test_count_and_pages_match_with_tied_timestamps_and_frozen_cutoff(self):
        for index in range(7):
            await self.event('tie-' + str(index))
        result = await activity.read_activity(self.db, self.user, self.clients, self.as_of, limit=2)
        observed = []
        while True:
            self.assertEqual(result['total'], 7)
            observed.extend(event['event_id'] for event in result['events'])
            if not result['next_cursor']:
                break
            result = await activity.read_activity(self.db, self.user, self.clients,
                (self.now + timedelta(seconds=30)).isoformat(), cursor=result['next_cursor'], limit=2)
        self.assertEqual(len(set(observed)), 7)
        self.assertEqual(observed, sorted(observed, reverse=True))
        self.assertEqual(await activity.count_activity(self.db, self.user, self.clients, self.as_of), 7)

    async def test_date_boundaries_offsets_filters_and_complete_counts(self):
        await self.event('inclusive-start', at=(self.now - timedelta(days=7)).isoformat())
        await self.event('too-old', at=(self.now - timedelta(days=7, microseconds=1)).isoformat())
        await self.event('future', at=(self.now + timedelta(microseconds=1)).isoformat())
        await self.event('now-as-offset', at=self.now.astimezone(timezone(timedelta(hours=-4))).isoformat(), kind='policies')
        result = await activity.read_activity(self.db, self.user, self.clients, self.as_of, limit=1)
        self.assertEqual(result['total'], 2)
        self.assertIsNotNone(result['next_cursor'])
        filtered = await activity.read_activity(self.db, self.user, self.clients, self.as_of, change_type='Risks')
        self.assertEqual(filtered['total'], 1)
        self.assertEqual(filtered['events'][0]['source']['entity_id'], 'inclusive-start')
        self.assertEqual(await activity.count_activity(self.db, self.user, self.clients, self.as_of, change_type='Risks'), 1)

    async def test_current_source_authorization_precedes_count_payload_and_revoked_cursor(self):
        await self.event('own')
        await self.event('wrong-client', client_id='b')
        mismatch = await self.event('moved-source')
        await self.db.risks.update_one({'risk_id': 'moved-source'}, {'$set': {'client_id': 'b'}})
        result = await activity.read_activity(self.db, self.user, self.clients, self.as_of)
        self.assertEqual(result['total'], 1)
        self.assertNotIn(mismatch['event_id'], str(result))
        self.assertEqual(await activity.count_activity(self.db, self.user, self.clients, self.as_of), 1)
        with self.assertRaises(HTTPException) as denied:
            await activity.read_activity(self.db, self.user, [{'client_id': 'b', 'name': 'Restricted'}], self.as_of)
        self.assertEqual(denied.exception.status_code, 403)
        await self.db.risks.insert_one({'risk_id': 'own', 'client_id': 'b', 'title': 'Restricted duplicate'})
        self.assertEqual(await activity.count_activity(self.db, self.user, self.clients, self.as_of), 0)
        await self.db.risks.delete_one({'risk_id': 'own', 'client_id': 'b'})
        await self.event('another')
        cursor = (await activity.read_activity(self.db, self.user, self.clients, self.as_of, limit=1))['next_cursor']
        revoked = {**self.user, 'client_ids': []}
        with self.assertRaises(HTTPException) as denied:
            await activity.read_activity(self.db, revoked, self.clients, self.as_of, cursor=cursor)
        self.assertEqual(denied.exception.status_code, 403)
        with self.assertRaises(HTTPException) as denied:
            await activity.read_activity(self.db, {**self.user, 'role': 'client_readonly'}, self.clients, self.as_of)
        self.assertEqual(denied.exception.status_code, 403)

    async def test_missing_and_archived_sources_are_truthful_and_do_not_expose_old_fields(self):
        await self.event('removed')
        await self.db.risks.delete_one({'risk_id': 'removed'})
        await self.event('archived')
        await self.db.risks.update_one({'risk_id': 'archived'}, {'$set': {'archived': True}})
        result = await activity.read_activity(self.db, self.user, self.clients, self.as_of)
        self.assertEqual(result['total'], 2)
        for event in result['events']:
            self.assertFalse(event['source']['available'])
            self.assertIsNone(event['source']['to'])
            self.assertNotIn('before', event)
            self.assertNotIn('after', event)
            self.assertIn('Source record', event['note'])

    async def test_audit_catchup_is_bounded_restartable_and_finds_late_original_receipts(self):
        audit = {'log_id': 'retained-log', 'client_id': 'a', 'entity_id': 'r', 'entity_type': 'risk',
                 'action': 'Risk reassessed', 'at': self.as_of, 'user_name': 'Historical name',
                 'meta': {'changed_fields': ['likelihood_score'], 'previous_score': 4, 'score': 16,
                          'password': 'SECRET', 'notes': 'SECRET'}}
        await self.db.audit_logs.insert_one(copy.deepcopy(audit))
        self.assertEqual((await activity.reconcile(self.db, 1))['inserted'], 1)
        self.assertEqual((await activity.reconcile(self.db, 1))['inserted'], 0)
        late = {**audit, 'log_id': 'late-repaired', 'at': (self.now - timedelta(days=2)).isoformat()}
        await self.db.audit_logs.insert_one(late)
        self.assertEqual((await activity.reconcile(self.db, 1))['inserted'], 1)
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 2)
        self.assertNotIn('SECRET', str(await self.db.portfolio_events.find({}).to_list(None)))
        self.assertEqual(await self.db.audit_logs.count_documents({}), 2)
        retained = await self.db.audit_logs.find_one({'log_id': audit['log_id']}, {'_id': 0})
        self.assertEqual(retained, audit)

    async def test_empty_is_zero_unavailable_raises_and_input_is_bounded(self):
        result = await activity.read_activity(self.db, self.user, self.clients, self.as_of)
        self.assertEqual(result['total'], 0)
        self.assertEqual(result['events'], [])
        self.assertEqual(result['coverage']['status'], 'partial')
        for kwargs in ({'days': 8}, {'days': True}, {'limit': 0}, {'limit': 101},
                       {'cursor': 'malformed'}, {'change_type': 'Login'}):
            with self.assertRaises(HTTPException) as invalid:
                await activity.read_activity(self.db, self.user, self.clients, self.as_of, **kwargs)
            self.assertEqual(invalid.exception.status_code, 422)
        with self.assertRaises(HTTPException):
            await activity.read_activity(self.db, self.user, self.clients, '2026-10-13T00:00:00')
        with patch.object(type(self.db.portfolio_events), 'aggregate', side_effect=RuntimeError('source unavailable')):
            with self.assertRaisesRegex(RuntimeError, 'source unavailable'):
                await activity.read_activity(self.db, self.user, self.clients, self.as_of)


class PortfolioScopeCaptureTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = onboarding_scenarios.OnboardingRecoveryTests.asyncSetUp
    sign_in = onboarding_scenarios.OnboardingRecoveryTests.sign_in
    baseline_body = onboarding_scenarios.OnboardingRecoveryTests.baseline_body
    submit = onboarding_scenarios.OnboardingRecoveryTests.submit

    async def test_native_review_configuration_capture_does_not_count_audit_mirror_or_noop(self):
        server = onboarding_scenarios.server
        created = await self.client.post('/api/reviews', json={'client_id': 'a', 'title': 'Isolated configuration',
            'review_type': 'access', 'owner_id': 'admin', 'due_date': '2026-12-01', 'recurrence': 'annual'})
        self.assertEqual(created.status_code, 200, created.text)
        await activity.reconcile(server.db)
        before_count = await server.db.portfolio_events.count_documents({})
        url = '/api/reviews/' + created.json()['review_id']
        changed = await self.client.patch(url, json={'due_date': '2026-12-02'})
        self.assertEqual(changed.status_code, 200, changed.text)
        await activity.reconcile(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), before_count + 1)
        noop = await self.client.patch(url, json={'due_date': '2026-12-02'})
        self.assertEqual(noop.status_code, 200, noop.text)
        await activity.reconcile(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), before_count + 1)

    async def test_native_finalization_captures_once_without_report_and_drafts_do_not(self):
        server = onboarding_scenarios.server
        body = await self.baseline_body()
        finalized = await self.submit(body)
        self.assertEqual(finalized.status_code, 200, finalized.text)
        await activity.reconcile_pending(server.db)
        events = await server.db.portfolio_events.find({}).to_list(None)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['type'], 'Scope')
        self.assertTrue(events[0]['after']['baseline_completed'])
        self.assertEqual((await self.submit(body)).status_code, 200)
        await activity.reconcile(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 1)
        draft = await self.baseline_body()
        draft['finalize'] = False
        draft['state']['policies'][next(iter(draft['state']['policies']))] = 'yes'
        response = await self.submit(draft, key='portfolio-draft-only-0001')
        self.assertEqual(response.status_code, 200, response.text)
        await activity.reconcile(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 1)

    async def test_native_applicability_cas_noop_and_failed_write_feed_eligibility(self):
        server = onboarding_scenarios.server
        finalized = await self.submit(await self.baseline_body())
        self.assertEqual(finalized.status_code, 200, finalized.text)
        await activity.reconcile(server.db)
        before_count = await server.db.portfolio_events.count_documents({})
        row = await server.db.requirements.find_one({'client_id': 'a', 'baseline_key': 'cis-ig1'})
        url = '/api/onboarding/programs/cis-ig1'
        body = {'client_id': 'a', 'applicability': 'applies', 'expected_updated_at': row['updated_at']}
        failed = await self.raw.patch(url, json={**body, 'expected_updated_at': 'stale'})
        self.assertEqual(failed.status_code, 409, failed.text)
        self.assertNotIn('_portfolio_activity_pending', await server.db.requirements.find_one({'requirement_id': row['requirement_id']}))
        changed = await self.raw.patch(url, json=body)
        self.assertEqual(changed.status_code, 200, changed.text)
        saved = await server.db.requirements.find_one({'requirement_id': row['requirement_id']})
        self.assertTrue(saved['_portfolio_activity_pending'])
        await activity.reconcile(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), before_count + 1)
        event = await server.db.portfolio_events.find_one({'source_kind': 'requirements'})
        self.assertEqual(event['before']['baseline_response'], 'does_not_apply')
        self.assertEqual(event['after']['baseline_response'], 'applies')
        noop = await self.raw.patch(url, json={**body, 'expected_updated_at': saved['updated_at']})
        self.assertEqual(noop.status_code, 200, noop.text)
        await activity.reconcile(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), before_count + 1)


class PortfolioDeletionReceiptTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()['portfolio_deletion_isolated']
        self.clock = datetime.now(timezone.utc)
        self.actor = {'user_id': 'original', 'name': 'Original operator'}
        self.source = {'finding_id': 'deletion-source', 'client_id': 'a', 'status': 'open',
            'updated_at': self.clock.isoformat(), 'history': [{'status': 'open'}]}
        self.predicate = {'finding_id': self.source['finding_id'], 'updated_at': self.source['updated_at']}
        await self.db.findings.insert_one(copy.deepcopy(self.source))

    def now(self):
        return self.clock.isoformat()

    def identity(self, actor):
        return digest(['portfolio-delete-v1', 'findings', 'a', self.source['finding_id'],
                       self.source['updated_at'], actor['user_id']])

    async def remove(self, actor=None):
        return await deletions.delete(self.db, 'findings', 'finding_id', self.source,
                                     self.predicate, actor or self.actor, self.now)

    async def prior(self, actor, state='prepared', lease=True, predecessors=None):
        identity = self.identity(actor)
        event = activity.project_committed_change('findings', self.source['finding_id'], 'a', actor,
                                                 self.source, None, self.now(), 'delete')
        receipt = {'_id': identity, 'state': state, 'kind': 'findings', 'key': 'finding_id',
            'source_id': self.source['finding_id'], 'client_id': 'a', 'expected_updated_at': self.source['updated_at'],
            'actor_id': actor['user_id'], 'actor': actor, 'replaced_receipts': predecessors or [], 'event': event}
        if lease:
            receipt['lease'] = {'token': 'old-token', 'until': (self.clock + timedelta(seconds=120)).isoformat()}
        await self.db.portfolio_deletions.insert_one(receipt)
        await self.db.findings.update_one(self.predicate, {'$set': {
            '_portfolio_delete_receipt': identity, '_portfolio_delete_token': 'old-token'}})
        return identity

    async def test_same_intent_has_one_lease_one_physical_delete_and_preserves_prior_pending(self):
        pending = activity.project_committed_change('findings', self.source['finding_id'], 'a', self.actor,
            {'status': 'in_progress'}, self.source, self.now())
        await self.db.findings.update_one(self.predicate, {'$set': {'_portfolio_activity_pending': {pending['event_id']: pending}}})
        reached, release = asyncio.Event(), asyncio.Event()
        original = activity.persist_event

        async def held(database, event):
            if event['event_id'] == pending['event_id']:
                reached.set()
                await release.wait()
            return await original(database, event)

        with patch.object(activity, 'persist_event', held):
            first = asyncio.create_task(self.remove())
            try:
                await reached.wait()
                receipt = await self.db.portfolio_deletions.find_one({})
                self.assertEqual(activity._time(receipt['lease']['until']) - self.clock, timedelta(seconds=120))
                with self.assertRaises(HTTPException) as busy:
                    await self.remove()
                self.assertEqual(busy.exception.status_code, 409)
                self.assertEqual(await self.db.findings.count_documents({}), 1)
            finally:
                release.set()
            result, event = await first
        self.assertEqual(result.deleted_count, 1)
        self.assertEqual(event['actor']['name'], 'Original operator')
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 2)
        self.assertEqual(await self.db.portfolio_deletions.count_documents({'state': 'complete'}), 1)

    async def test_other_authorized_actor_recovers_expired_prepared_claim_without_old_actor(self):
        old = await self.prior(self.actor)
        other = {'user_id': 'current-authorized', 'name': 'Current authorized operator'}
        with self.assertRaises(HTTPException) as busy:
            await self.remove(other)
        self.assertEqual(busy.exception.status_code, 409)
        self.clock += timedelta(seconds=121)
        result, event = await self.remove(other)
        self.assertEqual(result.deleted_count, 1)
        self.assertEqual(event['actor']['id'], other['user_id'])
        self.assertEqual((await self.db.portfolio_deletions.find_one({'_id': old}))['state'], 'abandoned')
        await deletions.reconcile(self.db)
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 1)

    async def test_interrupted_takeover_retires_all_predecessors_before_any_delete(self):
        old = await self.prior(self.actor, state='claimed', lease=False)
        second = {'user_id': 'second', 'name': 'Second operator'}
        original = type(self.db.portfolio_deletions).update_one

        async def interrupted(collection, query, update, *args, **kwargs):
            if collection.name == 'portfolio_deletions' and query.get('_id') == old and update.get('$set', {}).get('state') == 'abandoned':
                raise RuntimeError('interrupted predecessor retirement')
            return await original(collection, query, update, *args, **kwargs)

        with patch.object(type(self.db.portfolio_deletions), 'update_one', interrupted):
            with self.assertRaisesRegex(RuntimeError, 'predecessor'):
                await self.remove(second)
        self.assertEqual(await self.db.findings.count_documents({}), 1)
        self.assertEqual(await deletions.reconcile(self.db), 0)
        third = {'user_id': 'third', 'name': 'Third operator'}
        result, event = await self.remove(third)
        self.assertEqual(result.deleted_count, 1)
        self.assertEqual(event['actor']['id'], 'third')
        self.assertEqual((await self.db.portfolio_deletions.find_one({'_id': old}))['state'], 'abandoned')
        self.assertEqual((await self.db.portfolio_deletions.find_one({'_id': self.identity(second)}))['state'], 'abandoned')
        await deletions.reconcile(self.db)
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 1)

    async def test_expired_lease_immediately_before_delete_does_not_dispatch(self):
        original = type(self.db.portfolio_deletions).update_one

        async def expire(collection, query, update, *args, **kwargs):
            result = await original(collection, query, update, *args, **kwargs)
            if collection.name == 'portfolio_deletions' and update.get('$set', {}).get('state') == 'claimed':
                self.clock += timedelta(seconds=121)
            return result

        with patch.object(type(self.db.portfolio_deletions), 'update_one', expire):
            with self.assertRaises(HTTPException) as expired:
                await self.remove()
        self.assertEqual(expired.exception.status_code, 409)
        current = await self.db.findings.find_one({})
        self.assertEqual(current['updated_at'], self.source['updated_at'])
        self.assertEqual(current['history'], self.source['history'])
        self.assertEqual(await deletions.reconcile(self.db), 0)
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 0)

    async def test_lost_delete_reply_recovers_same_dispatch_time_and_frozen_actor_once(self):
        original = type(self.db.findings).delete_one

        async def uncertain(collection, *args, **kwargs):
            result = await original(collection, *args, **kwargs)
            if collection.name == 'findings':
                self.assertEqual(result.deleted_count, 1)
                raise RuntimeError('lost deletion acknowledgement')
            return result

        with patch.object(type(self.db.findings), 'delete_one', uncertain):
            with self.assertRaisesRegex(RuntimeError, 'acknowledgement'):
                await self.remove()
        original_event = (await self.db.portfolio_deletions.find_one({}))['event']
        self.clock += timedelta(days=2)
        result, event = await self.remove({**self.actor, 'name': 'Renamed later'})
        self.assertEqual(result.deleted_count, 1)
        self.assertEqual(event, original_event)
        self.assertEqual(event['actor']['name'], 'Original operator')
        await deletions.reconcile(self.db)
        await self.remove(self.actor)
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 1)

    async def test_failed_native_predicate_and_zero_delete_never_emit_business_event(self):
        with self.assertRaises(HTTPException) as stale:
            await deletions.delete(self.db, 'findings', 'finding_id', self.source,
                {**self.predicate, 'updated_at': 'stale'}, self.actor, self.now)
        self.assertEqual(stale.exception.status_code, 409)
        original = type(self.db.findings).delete_one

        async def rejected(collection, *args, **kwargs):
            if collection.name == 'findings':
                return DeleteResult({'n': 0}, True)
            return await original(collection, *args, **kwargs)

        with patch.object(type(self.db.findings), 'delete_one', rejected):
            result, event = await self.remove()
        self.assertEqual(result.deleted_count, 0)
        self.assertIsNone(event)
        self.assertEqual(await deletions.reconcile(self.db), 0)
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 0)
        current = await self.db.findings.find_one({})
        self.assertEqual(current['history'], self.source['history'])
        self.assertEqual(current['updated_at'], self.source['updated_at'])
        self.assertNotIn('_portfolio_delete_receipt', current)

    async def test_cancelled_prepared_claim_releases_lease_and_can_be_recovered_by_current_actor(self):
        entered, release = asyncio.Event(), asyncio.Event()
        pending = activity.project_committed_change('findings', self.source['finding_id'], 'a', self.actor,
            {'status': 'in_progress'}, self.source, self.now())
        await self.db.findings.update_one(self.predicate, {'$set': {'_portfolio_activity_pending': {pending['event_id']: pending}}})
        original = activity.persist_event

        async def held(database, event):
            entered.set()
            await release.wait()
            return await original(database, event)

        with patch.object(activity, 'persist_event', held):
            interrupted = asyncio.create_task(self.remove())
            await entered.wait()
            interrupted.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await interrupted
        receipt = await self.db.portfolio_deletions.find_one({})
        self.assertEqual(receipt['state'], 'prepared')
        self.assertNotIn('lease', receipt)
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 0)
        result, event = await self.remove({'user_id': 'replacement', 'name': 'Currently authorized operator'})
        self.assertEqual(result.deleted_count, 1)
        self.assertEqual(event['actor']['id'], 'replacement')
        self.assertEqual(await self.db.portfolio_events.count_documents({}), 2)


if __name__ == '__main__':
    unittest.main()
