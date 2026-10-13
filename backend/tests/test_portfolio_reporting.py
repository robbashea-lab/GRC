"""Real routes/writers and automatic collection against a disposable database."""
import asyncio
import copy
import json
from unittest.mock import AsyncMock, patch
from test_client_dashboard_sources import ClientDashboardSourcesTests, server
import portfolio_reporting as reports
import portfolio_activity
import portfolio_deletions
from framework_catalog import active_definitions, FRAMEWORKS
import portfolio_progress


class PortfolioReportingTests(ClientDashboardSourcesTests):
    def test_compact_historical_projection_retains_counts_identity_and_continuity_without_catalog_payload(self):
        client = {'client_id': 'large', 'name': 'Isolated large contract fixture', 'status': 'active',
            'onboarding_baseline': {'completed': True}, 'framework_settings': {'cis-ig1': {'implementation_group': 3}}}
        rows = [{'client_id': 'large', 'framework_key': 'cis-ig1', 'framework_assessment_id': 'large-' + definition['id'],
            'definition_id': definition['id'], 'framework_version': '8.1', 'status': 'not_assessed',
            'created_at': '2026-07-01T00:00:00+00:00'} for definition in active_definitions('cis-ig1', {'implementation_group': 3})]
        position = portfolio_progress.current_position(client, next(framework for framework in FRAMEWORKS if framework['key'] == 'cis-ig1'), [], rows,
            '2026-10-13T18:00:00+00:00')
        document = {**position, 'snapshot_id': 'actual-observation', 'captured_at': position['current']['captured_at'],
            'effective_at': '2026-10-12T18:00:00+00:00', 'observation_kind': 'committed_event', 'source_event': 'native-event',
            'source_revision': position['current']['source_revision'], 'observation_sequence': 3}
        document['current'].update(continuity_proven=True, effective_until='2026-10-14T18:00:00+00:00', continuity_source_event='next-native-event')
        before = copy.deepcopy(document)
        point = reports.observation(document)
        for field in ('counts', 'included_counts', 'denominator', 'implemented', 'scope_signature', 'status_signature', 'measure_version'):
            self.assertEqual(point[field], document['current'][field])
        self.assertEqual(point['effective_at'], document['effective_at'])
        self.assertEqual(point['source_revision'], document['source_revision'])
        self.assertTrue(point['continuity_proven'])
        self.assertNotIn('scope', point)
        self.assertNotIn('components', point)
        self.assertNotIn('source_references', point['provenance'])
        self.assertLess(len(json.dumps(point)), 2200)
        self.assertLess(len(json.dumps([point] * (20 * 90))), 5 * 1024 * 1024)
        self.assertEqual(document, before)
        self.assertEqual(len(document['current']['scope']['definition_ids']), 153)
        self.assertEqual(len(document['current']['provenance']['source_references']), 153)

    async def test_profile_configuration_and_audit_metadata_do_not_capture_posture_observations(self):
        await self.seed_program()
        client = await server.db.clients.find_one({'client_id': 'a'})
        for field, value in [('industry', 'Isolated metadata'), ('iso_audit_program', {'active': True}),
                             ('framework_settings', {**client['framework_settings'], 'soc-2': {'categories': ['security'], 'system_description': 'Reviewed system wording'}})]:
            changed = {**client, field: value}
            event = portfolio_activity.project_committed_change('clients', 'a', 'a', {'user_id': 'admin'}, client, changed, reports.now())
            if event:
                self.assertFalse(event['implementation_scope_changed'])
                self.assertEqual(await reports.capture_committed(server.db, event), 0)
        self.assertEqual(await server.db.portfolio_snapshots.count_documents({}), 0)

    async def seed_program(self):
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {
            'onboarding_baseline': {'completed': True}, 'framework_settings': {'cis-ig1': {'implementation_group': 1}}}})
        await server.db.requirements.insert_one({'requirement_id': 'program-a', 'client_id': 'a',
            'baseline_key': 'cis-ig1', 'baseline_response': 'applies', 'status': 'active'})
        await server.db.framework_assessments.insert_many([{
            'framework_assessment_id': 'a-' + d['id'], 'client_id': 'a', 'framework_key': 'cis-ig1',
            'definition_id': d['id'], 'framework_version': '8.1', 'status': 'not_assessed', 'implementation': '',
            'assessment_history': []} for d in active_definitions('cis-ig1', {'implementation_group': 1})])

    async def test_report_scope_and_empty_cohort_never_widen(self):
        self.sign_in('admin')
        empty = await self.client.get('/api/portfolio/reporting/overview', params={'client_ids': ''})
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()['total_clients'], 0)
        await server.db.users.insert_one({'user_id': 'scoped', 'role': 'platform_admin', 'status': 'active',
            'client_ids': ['a'], 'email': 'scoped@example.test'})
        self.sign_in('scoped')
        response = await self.client.get('/api/portfolio/reporting/overview')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['total_clients'], 1)
        for endpoint in ('overview', 'activity'):
            self.assertEqual((await self.client.get('/api/portfolio/reporting/' + endpoint, params={'client_ids': 'b'})).status_code, 403)
        self.sign_in('member')
        self.assertEqual((await self.client.get('/api/portfolio/reporting/overview')).status_code, 403)
        self.client.headers.pop('Authorization', None)
        self.assertEqual((await self.client.get('/api/portfolio/reporting/overview')).status_code, 401)

    async def test_current_real_inventory_and_reads_do_not_capture(self):
        await self.seed_program()
        self.sign_in('admin')
        before = await server.db.framework_assessments.find({}, {'_id': 0}).to_list(None)
        for period in ('30d', '6m', '12m'):
            result = await self.client.get('/api/portfolio/reporting/history', params={'client_id': 'a', 'program_key': 'cis-ig1', 'range': period})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()['current']['denominator'], 56)
            self.assertEqual(result.json()['snapshots'], [])
            self.assertIsNone(result.json()['comparison']['baseline'])
        self.assertEqual(await server.db.portfolio_snapshots.count_documents({}), 0)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 0)
        self.assertEqual(await server.db.framework_assessments.find({}, {'_id': 0}).to_list(None), before)

    async def test_automatic_loop_captures_without_report_and_restarts_idempotently(self):
        await self.seed_program()
        await reports.initialize(server.db)
        source = await server.db.framework_assessments.find({}, {'_id': 0}).to_list(None)
        async def stop_after_sweep(_seconds):
            raise asyncio.CancelledError()
        with patch.object(reports.asyncio, 'sleep', stop_after_sweep):
            with self.assertRaises(asyncio.CancelledError):
                await reports.run(server.db)
        self.assertEqual(await server.db.portfolio_snapshots.count_documents({'client_id': 'a'}), 1)
        await reports.initialize(server.db)
        await reports.collect(server.db)
        self.assertEqual(await server.db.portfolio_snapshots.count_documents({'client_id': 'a'}), 1)
        self.assertEqual(await server.db.framework_assessments.find({}, {'_id': 0}).to_list(None), source)
        self.sign_in('admin')
        result = await self.client.get('/api/portfolio/reporting/history', params={'client_id': 'a', 'program_key': 'cis-ig1'})
        self.assertEqual(len(result.json()['snapshots']), 1)
        self.assertIsNone(result.json()['comparison']['baseline'])

    async def test_ordinary_save_failed_noop_duplicate_and_projection_recovery(self):
        self.sign_in('admin')
        created = await self.client.post('/api/findings', json={'client_id': 'a', 'title': 'Isolated finding', 'severity': 'low'}, headers={'Idempotency-Key': 'portfolio-create-0001'})
        self.assertEqual(created.status_code, 200, created.text)
        row = created.json()
        fid = row['finding_id']
        same = await self.client.post('/api/findings', json={'client_id': 'a', 'title': 'Isolated finding', 'severity': 'low'}, headers={'Idempotency-Key': 'portfolio-create-0001'})
        self.assertEqual(same.json()['finding_id'], fid)
        await portfolio_activity.reconcile_pending(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 1)
        failed = await self.client.patch('/api/findings/' + fid, json={'expected_updated_at': 'stale', 'severity': 'high'})
        self.assertEqual(failed.status_code, 409, failed.text)
        noop = await self.client.patch('/api/findings/' + fid, json={'expected_updated_at': row['updated_at'], 'severity': 'low'})
        self.assertEqual(noop.status_code, 200, noop.text)
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('isolated interruption'))):
            with self.assertRaises(RuntimeError):
                await self.client.patch('/api/findings/' + fid, json={'expected_updated_at': noop.json()['updated_at'], 'severity': 'high'})
        # The domain write and its envelope committed despite the later audit failure.
        saved = await server.db.findings.find_one({'finding_id': fid})
        self.assertEqual(saved['severity'], 'high')
        with patch.object(portfolio_activity, 'persist_event', AsyncMock(side_effect=RuntimeError('projection unavailable'))):
            with self.assertRaises(RuntimeError):
                await portfolio_activity.reconcile_pending(server.db)
        self.assertTrue((await server.db.findings.find_one({'finding_id': fid}))['_portfolio_activity_pending'])
        await portfolio_activity.reconcile_pending(server.db)
        await portfolio_activity.reconcile_pending(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 2)

    async def test_capture_retains_same_day_reversion_and_next_day_observation(self):
        await self.seed_program()
        at = '2026-10-13T12:00:00+00:00'
        with patch.object(reports, 'now', return_value=at):
            self.assertEqual(await reports.capture_client(server.db, await server.db.clients.find_one({'client_id': 'a'})), 1)
            await server.db.framework_assessments.update_one({'client_id': 'a'}, {'$set': {'status': 'addressed'}})
            self.assertEqual(await reports.capture_client(server.db, await server.db.clients.find_one({'client_id': 'a'})), 1)
            await server.db.framework_assessments.update_one({'client_id': 'a'}, {'$set': {'status': 'not_assessed'}})
            self.assertEqual(await reports.capture_client(server.db, await server.db.clients.find_one({'client_id': 'a'})), 1)
            self.assertEqual(await reports.capture_client(server.db, await server.db.clients.find_one({'client_id': 'a'})), 0)
        rows = await server.db.portfolio_snapshots.find({'client_id': 'a'}).sort('observation_sequence', 1).to_list(None)
        self.assertEqual([row['current']['implemented'] for row in rows], [0, 1, 0])
        self.assertEqual(len({row['snapshot_id'] for row in rows}), 3)
        with patch.object(reports, 'now', return_value='2026-10-14T12:00:00+00:00'):
            self.assertEqual(await reports.capture_client(server.db, await server.db.clients.find_one({'client_id': 'a'})), 1)
            self.assertEqual(await reports.capture_client(server.db, await server.db.clients.find_one({'client_id': 'a'})), 0)

    async def test_endpoint_input_bounds_and_archive_scope(self):
        self.sign_in('admin')
        await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'status': 'archived'}})
        self.assertEqual((await self.client.get('/api/portfolio/reporting/overview')).json()['total_clients'], 1)
        self.assertEqual((await self.client.get('/api/portfolio/reporting/overview?include_archived=true')).json()['total_clients'], 2)
        for url in ('activity?days=8', 'activity?limit=1000', 'overview?range=365d', 'overview?client_ids=%24ne', 'activity?cursor=invalid', 'activity?as_of=2099-01-01T00:00:00Z'):
            self.assertEqual((await self.client.get('/api/portfolio/reporting/' + url)).status_code, 422, url)
        for days in (7, 30, 90):
            response = await self.client.get('/api/portfolio/reporting/activity', params={'days': days, 'client_ids': 'a'})
            self.assertEqual(response.status_code, 200, response.text)

    async def test_native_risk_decisions_and_policy_verification_capture_with_audit_interrupted(self):
        self.sign_in('admin')
        risk = (await self.client.post('/api/risks', json={'client_id': 'a', 'title': 'Isolated decisions'})).json()
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('after committed acceptance'))):
            with self.assertRaises(RuntimeError):
                await self.client.post('/api/risks/' + risk['risk_id'] + '/accept', json={'rationale': 'Isolated decision', 'expiry_date': '2099-01-01'})
        closed = await self.client.post('/api/risks/' + risk['risk_id'] + '/close', json={'reason': 'remediated'})
        self.assertEqual(closed.status_code, 200, closed.text)
        policy = (await self.client.post('/api/policies', json={'client_id': 'a', 'title': 'Isolated verification'})).json()
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('after committed verification'))):
            with self.assertRaises(RuntimeError):
                await self.client.post('/api/policies/' + policy['policy_id'] + '/verify', json={'version': '1'})
        await portfolio_activity.reconcile(server.db)
        await portfolio_activity.reconcile(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({'source_kind': 'risks'}), 3)
        self.assertEqual(await server.db.portfolio_events.count_documents({'source_kind': 'policies'}), 2)

    async def test_delete_preserves_pending_activity_and_recovers_after_projection_failure(self):
        self.sign_in('admin')
        created = await self.client.post('/api/findings', json={'client_id': 'a', 'title': 'Isolated deletion', 'severity': 'low'})
        self.assertEqual(created.status_code, 200, created.text)
        row = created.json()
        fid = row['finding_id']
        original = portfolio_activity.persist_event
        async def fail_deletion(db, event):
            if event['title'] == 'Finding removed':
                raise RuntimeError('isolated projection interruption after committed deletion')
            return await original(db, event)
        with patch.object(portfolio_activity, 'persist_event', fail_deletion):
            with self.assertRaises(RuntimeError):
                await self.client.request('DELETE', '/api/findings/' + fid, json={'expected_updated_at': row['updated_at']})
        self.assertIsNone(await server.db.findings.find_one({'finding_id': fid}))
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 1)
        await portfolio_deletions.reconcile(server.db)
        await portfolio_deletions.reconcile(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 2)
        self.assertEqual(await server.db.portfolio_deletions.count_documents({'state': 'complete'}), 1)

    async def test_failed_conditional_delete_has_no_deletion_event(self):
        self.sign_in('admin')
        created = await self.client.post('/api/findings', json={'client_id': 'a', 'title': 'Keep stale deletion', 'severity': 'low'})
        row = created.json()
        await portfolio_activity.reconcile_pending(server.db)
        predicate = {'finding_id': row['finding_id'], 'updated_at': 'stale'}
        with self.assertRaises(Exception):
            await portfolio_deletions.delete(server.db, 'findings', 'finding_id', row, predicate,
                {'user_id': 'admin', 'name': 'Original actor'}, reports.now)
        await portfolio_deletions.reconcile(server.db)
        self.assertIsNotNone(await server.db.findings.find_one({'finding_id': row['finding_id']}))
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 1)
