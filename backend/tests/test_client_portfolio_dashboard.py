"""Independent portfolio acceptance through real routes and disposable clients.

No Demo fixture, live database, browser session or authorization override is used.
Expected concurrency tokens come from the actual read being tested, not the
legacy harness's automatic read-before-write substitution.
"""
import copy
import unittest
import uuid

import httpx

import test_client_dashboard_sources as route_harness
import test_framework_governance as framework_tests
import test_iso_guided_routes as iso_route_tests
from framework_catalog import CATALOGS, active_definitions
import portfolio_reporting as reports

server = route_harness.server


class ClientPortfolioDashboardTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = route_harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = route_harness.ClientDashboardSourcesTests.sign_in
    body = framework_tests.FrameworkTests.body

    async def configure(self, cid='a', programs=('cis-ig1',), settings=None):
        self.sign_in('admin')
        self.client.event_hooks['request'].clear()
        baseline = await self.get_json('onboarding/baseline', client_id=cid)
        body = self.body(programs=programs, cid=cid)
        body.update(expected_updated_at=baseline['state'].get('updated_at'),
                    expected_records=baseline['record_versions'])
        if settings:
            body['state']['framework_settings'] = settings
        response = await self.client.post('/api/onboarding/baseline', json=body,
            headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def get_json(self, path, **params):
        response = await self.client.get('/api/' + path, params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def overview(self, **params):
        return await self.get_json('portfolio/reporting/overview', **params)

    async def program(self, cid, key):
        overview = await self.overview(client_ids=cid)
        return next(row for row in overview['programs'] if row['framework_key'] == key)

    async def history(self, cid, program_key, period='3m'):
        return await self.get_json('portfolio/reporting/history', client_id=cid,
                                   program_key=program_key, range=period)

    async def source(self, cid, key, definition=None):
        workspace = await self.get_json('frameworks/' + key, client_id=cid)
        return next(row for row in workspace['assessments']
                    if definition is None or row['definition_id'] == definition)

    async def save(self, row, **values):
        response = await self.client.patch('/api/framework_assessments/' + row['framework_assessment_id'],
            json={'expected_last_assessed': row.get('last_saved') or row.get('last_assessed'), **values})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def change_program(self, cid, key, applicability):
        row = await server.db.requirements.find_one({'client_id': cid, 'baseline_key': key})
        response = await self.client.patch('/api/onboarding/programs/' + key, json={
            'client_id': cid, 'applicability': applicability,
            'expected_updated_at': (row or {}).get('updated_at')})
        self.assertEqual(response.status_code, 200, response.text)

    async def collections(self):
        names = ('clients', 'requirements', 'framework_assessments', 'audit_logs',
                 'portfolio_events', 'portfolio_snapshots', 'portfolio_reporting_state')
        return {name: await server.db[name].find({}).sort('_id', 1).to_list(None) for name in names}

    def assert_position(self, current, *, applicable, implemented, partial=0, gaps=0, not_assessed=0):
        self.assertEqual(current['availability'], 'available')
        self.assertEqual(current['denominator'], applicable)
        self.assertEqual(current['implemented'], implemented)
        expected = {'addressed': implemented, 'in_progress': partial,
                    'needs_attention': gaps, 'not_assessed': not_assessed}
        included = {row['key']: row['count'] for row in current['counts'] if row['key'] in expected}
        self.assertEqual(included, expected)
        self.assertEqual(sum(included.values()), applicable)
        self.assertEqual(current['assessed'], applicable - not_assessed)
        if applicable:
            self.assertAlmostEqual(current['percentage'], implemented / applicable * 100)
        else:
            self.assertIsNone(current['percentage'])

    async def test_actual_reads_preserve_sources_activity_and_history(self):
        await self.configure(programs=('cis-ig1', 'soc-2', 'iso-27001'))
        await reports.initialize(server.db)
        await reports.collect(server.db)
        before = copy.deepcopy(await self.collections())
        first = await self.overview(client_ids='a')
        self.assertEqual(len(first['programs']), 3)
        for program in first['programs']:
            for period in ('1m', '3m', '6m', '12m', '36m'):
                history = await self.history('a', program['program_key'], period)
                self.assertEqual(history['current']['source_revision'], program['current']['source_revision'])
            await self.get_json('frameworks/' + program['framework_key'], client_id='a')
        await self.get_json('portfolio/reporting/activity', client_ids='a')
        self.assertEqual(await self.collections(), before)

    async def test_dynamic_enable_future_client_and_retained_program_reenable(self):
        await self.configure(programs=('cis-ig1',))
        original = await self.source('a', 'cis-ig1')
        original = await self.save(original, status='addressed', implementation='Synthetic committed inventory')
        prior = await self.program('a', 'cis-ig1')
        await self.change_program('a', 'soc-2', 'applies')
        soc = await self.program('a', 'soc-2')
        self.assert_position(soc['current'], applicable=33, implemented=0, not_assessed=33)
        self.assertNotEqual(soc['program_id'], prior['program_id'])
        self.assertTrue(all(row['status'] == 'not_assessed' for row in
            (await self.get_json('frameworks/soc-2', client_id='a'))['assessments']))
        soc_history = await self.history('a', soc['program_key'])
        self.assertTrue(all(row['implemented'] == 0 for row in soc_history['snapshots']))
        self.assertEqual((await self.program('a', 'cis-ig1'))['current']['implemented'], 1)

        await self.configure(cid='b', settings={'cis-ig1': {'implementation_group': 2}})
        b_before = copy.deepcopy(await self.program('b', 'cis-ig1'))
        await self.change_program('b', 'iso-27001', 'applies')
        newly_enabled_iso = await self.program('b', 'iso-27001')
        self.assertEqual(newly_enabled_iso['current']['implemented'], 0)
        self.assertTrue(all(row['status'] == 'not_assessed' for row in
            (await self.get_json('frameworks/iso-27001', client_id='b'))['assessments']))
        self.assertEqual((await self.program('b', 'cis-ig1'))['current']['source_revision'],
                         b_before['current']['source_revision'])

        retained = copy.deepcopy(await server.db.framework_assessments.find({'client_id': 'a', 'framework_key': 'cis-ig1'}).to_list(None))
        snapshot_ids = {row['snapshot_id'] for row in await server.db.portfolio_snapshots.find({'client_id': 'a', 'framework_key': 'cis-ig1'}).to_list(None)}
        await self.change_program('a', 'cis-ig1', 'does_not_apply')
        self.assertNotIn('cis-ig1', [row['framework_key'] for row in (await self.overview(client_ids='a'))['programs']])
        await self.change_program('a', 'cis-ig1', 'applies')
        self.assertEqual((await self.program('a', 'cis-ig1'))['program_id'], prior['program_id'])
        self.assertEqual(await server.db.framework_assessments.find({'client_id': 'a', 'framework_key': 'cis-ig1'}).to_list(None), retained)
        restored_ids = {row['snapshot_id'] for row in await server.db.portfolio_snapshots.find({'client_id': 'a', 'framework_key': 'cis-ig1'}).to_list(None)}
        self.assertTrue(snapshot_ids <= restored_ids)

        # A new normal client uses the same enrollment path and stable IDs, not
        # the named Demo targets or another client's assessments/history.
        created = await self.client.post('/api/clients', json={'name': 'SYNTHETIC future portfolio client'},
                                         headers={'Idempotency-Key': 'independent-portfolio-future-client'})
        self.assertEqual(created.status_code, 200, created.text)
        cid = created.json()['client_id']
        baseline = await self.get_json('onboarding/baseline', client_id=cid)
        body = self.body(programs=('soc-2', 'iso-27001'), cid=cid)
        body.update(expected_updated_at=baseline['state'].get('updated_at'),
                    expected_records=baseline['record_versions'])
        completed = await self.client.post('/api/onboarding/baseline', json=body,
            headers={'Idempotency-Key': 'independent-portfolio-future-baseline'})
        self.assertEqual(completed.status_code, 200, completed.text)
        future = (await self.overview(client_ids=cid))['programs']
        self.assertEqual({row['framework_key'] for row in future}, {'soc-2', 'iso-27001'})
        self.assertTrue(all(row['current']['implemented'] == 0 for row in future))
        self.assertTrue(all(row['client_id'] == cid for row in future))
        self.assertFalse({row['program_id'] for row in future} & {prior['program_id'], soc['program_id']})

    async def test_status_transitions_rejected_writes_and_second_session_reconcile(self):
        await self.configure(programs=('cis-ig1', 'soc-2'))
        unrelated = copy.deepcopy(await server.db.framework_assessments.find({'framework_key': 'soc-2'}).to_list(None))
        row = await self.source('a', 'cis-ig1', '1.1')
        initial = await self.program('a', 'cis-ig1')
        self.assert_position(initial['current'], applicable=56, implemented=0, not_assessed=56)
        saved = await self.save(row, status='addressed', implementation='Synthetic inventory implementation')
        implemented = await self.program('a', 'cis-ig1')
        self.assert_position(implemented['current'], applicable=56, implemented=1, not_assessed=55)
        self.assertNotEqual(implemented['current']['source_revision'], initial['current']['source_revision'])
        captured = await self.history('a', implemented['program_key'])
        self.assertTrue(any(point['implemented'] == 1 and
                            point['observation_kind'] == 'committed_event' for point in captured['snapshots']))
        before_failure = copy.deepcopy(await self.collections())
        stale = await self.client.patch('/api/framework_assessments/' + row['framework_assessment_id'],
            json={'expected_last_assessed': row.get('last_saved') or row.get('last_assessed'), 'status': 'in_progress'})
        self.assertEqual(stale.status_code, 409, stale.text)
        invalid = await self.client.patch('/api/framework_assessments/' + row['framework_assessment_id'],
            json={'expected_last_assessed': saved.get('last_saved'), 'status': 'invented'})
        self.assertEqual(invalid.status_code, 422, invalid.text)
        self.assertEqual(await self.collections(), before_failure)
        partial = await self.save(saved, status='in_progress')
        current = await self.program('a', 'cis-ig1')
        self.assert_position(current['current'], applicable=56, implemented=0, partial=1, not_assessed=55)
        self.assertEqual(await server.db.framework_assessments.find({'framework_key': 'soc-2'}).to_list(None), unrelated)
        self.assertEqual(partial.get('verification'), row.get('verification'))
        self.assertEqual(len(partial['assessment_history']), 2)
        token = server.create_access_token('admin', 'admin@example.test')
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
            base_url='https://isolated.example.test', headers={'Authorization': 'Bearer ' + token}) as second:
            reread = await second.get('/api/portfolio/reporting/overview', params={'client_ids': 'a'})
            self.assertEqual(reread.status_code, 200, reread.text)
            result = next(p for p in reread.json()['programs'] if p['framework_key'] == 'cis-ig1')
            self.assertEqual(result['current']['source_revision'], current['current']['source_revision'])
            self.assertEqual(result['current']['counts'], current['current']['counts'])

    async def test_soc_category_and_iso_same_size_membership_changes_keep_old_denominators(self):
        await self.configure(programs=('soc-2', 'iso-27001'))
        client = await server.db.clients.find_one({'client_id': 'a'})
        response = await self.client.patch('/api/frameworks/soc-2/configuration', json={
            'client_id': 'a', 'categories': ['security', 'availability'],
            'expected_updated_at': client.get('soc_configuration_updated_at')})
        self.assertEqual(response.status_code, 200, response.text)
        expanded = await self.program('a', 'soc-2')
        self.assert_position(expanded['current'], applicable=36, implemented=0, not_assessed=36)
        response = await self.client.patch('/api/frameworks/soc-2/configuration', json={
            'client_id': 'a', 'categories': ['security'],
            'expected_updated_at': response.json()['expected_updated_at']})
        self.assertEqual(response.status_code, 200, response.text)
        soc = await self.program('a', 'soc-2')
        self.assert_position(soc['current'], applicable=33, implemented=0, not_assessed=33)
        history = await self.history('a', soc['program_key'])
        self.assertIn(36, [point['denominator'] for point in history['snapshots']])
        self.assertNotEqual(soc['current']['scope_signature'], expanded['current']['scope_signature'])

        one = await self.source('a', 'iso-27001', 'A.5.1')
        two = await self.source('a', 'iso-27001', 'A.5.2')
        one = await self.save(one, soa_applicability='included', soa_justification='Synthetic treatment scope one')
        before = await self.program('a', 'iso-27001')
        one = await self.save(one, soa_applicability='excluded', soa_justification='Synthetic scope exclusion one')
        two = await self.save(two, soa_applicability='included', soa_justification='Synthetic treatment scope two')
        after = await self.program('a', 'iso-27001')
        self.assertEqual(before['current']['denominator'], after['current']['denominator'])
        self.assertNotEqual(before['current']['scope_signature'], after['current']['scope_signature'])
        history = await self.history('a', after['program_key'])
        self.assertTrue(history['scope_changes'])
        self.assertTrue(any(point['scope_signature'] == before['current']['scope_signature']
                            for point in history['snapshots']))

    async def test_authorized_cohort_program_tampering_and_no_data_leak(self):
        await self.configure(cid='a')
        await self.configure(cid='b', programs=('soc-2',))
        await server.db.users.insert_one({'user_id': 'scoped', 'email': 'scoped@example.test',
            'role': 'platform_admin', 'status': 'active', 'client_ids': ['a']})
        await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'assigned_owner_id': 'scoped', 'name': 'SYNTHETIC foreign secret'}})
        self.sign_in('scoped')
        result = await self.overview()
        self.assertEqual({row['client_id'] for row in result['programs']}, {'a'})
        self.assertNotIn('SYNTHETIC foreign secret', str(result))
        for endpoint, params in [('overview', {'client_ids': 'b'}),
                                 ('history', {'client_id': 'b', 'program_key': 'soc-2'}),
                                 ('activity', {'client_ids': 'b'})]:
            response = await self.client.get('/api/portfolio/reporting/' + endpoint, params=params)
            self.assertEqual(response.status_code, 403, response.text)
        for program_key in ('soc-2', 'cis-ig3', 'unknown-program'):
            response = await self.client.get('/api/portfolio/reporting/history',
                params={'client_id': 'a', 'program_key': program_key})
            self.assertEqual(response.status_code, 404, response.text)
        empty = await self.overview(client_ids='')
        self.assertEqual(empty['programs'], [])
        self.client.headers.clear()
        self.assertEqual((await self.client.get('/api/portfolio/reporting/overview')).status_code, 401)

    async def test_native_scope_group_discovery_and_verification_independence(self):
        await self.configure(settings={'cis-ig1': {'implementation_group': 3}})
        program = await self.program('a', 'cis-ig1')
        self.assertEqual(program['program_key'], 'cis-ig3')
        count = len(active_definitions('cis-ig1', {'implementation_group': 3}))
        self.assertEqual(count, 153)
        self.assert_position(program['current'], applicable=count, implemented=0, not_assessed=count)
        row = await self.source('a', 'cis-ig1', '1.1')
        saved = await self.save(row, status='addressed', implementation='Synthetic implemented but not verified')
        self.assertEqual(saved.get('verification'), row.get('verification'))
        self.assertEqual(saved.get('verification') or 'not_verified', 'not_verified')
        current = await self.program('a', 'cis-ig1')
        self.assert_position(current['current'], applicable=count, implemented=1, not_assessed=count - 1)
        self.assertEqual(current['current']['scope']['catalog_version'], CATALOGS['cis-ig1']['version'])

    async def test_guided_progress_is_not_native_commit_and_bulk_cannot_bypass_it(self):
        await self.configure(programs=('iso-27001',))
        row = await self.source('a', 'iso-27001', '4.1')
        program = await self.program('a', 'iso-27001')
        native_before = copy.deepcopy(await server.db.framework_assessments.find_one(
            {'framework_assessment_id': row['framework_assessment_id']}))
        snapshots_before = copy.deepcopy(await server.db.portfolio_snapshots.find({}).to_list(None))
        # Reuse the established canonical ISO answer builder/payload contract;
        # this helper dispatches real GET/PUT requests, with no evaluator mock.
        self.path = lambda record: '/api/framework_assessments/' + record['framework_assessment_id']
        self.token = lambda record: record.get('last_saved') or record.get('last_assessed')
        draft, _ = await iso_route_tests.IsoGuidedRoutes.finish(self, row)
        self.assertEqual(await server.db.framework_assessments.find_one(
            {'framework_assessment_id': row['framework_assessment_id']}), native_before)
        self.assertEqual(await server.db.portfolio_snapshots.find({}).to_list(None), snapshots_before)
        self.assertEqual((await self.program('a', 'iso-27001'))['current']['source_revision'],
                         program['current']['source_revision'])
        bypass = await self.client.post('/api/bulk', json={'kind': 'framework_assessments',
            'ids': [row['framework_assessment_id']], 'action': 'set-status', 'payload': {'status': 'addressed'}})
        self.assertEqual(bypass.status_code, 404, bypass.text)
        self.assertEqual(await server.db.portfolio_snapshots.find({}).to_list(None), snapshots_before)
        body = iso_route_tests.IsoGuidedRoutes.native(self, row, draft)
        response = await self.client.patch(self.path(row), json=body)
        self.assertEqual(response.status_code, 200, response.text)
        committed = await self.program('a', 'iso-27001')
        self.assertEqual(committed['current']['implemented'], 1)
        self.assertNotEqual(committed['current']['source_revision'], program['current']['source_revision'])
        self.assertEqual(response.json()['implementation'], draft['narrative'])
        self.assertEqual(response.json()['status'], 'addressed')
        history = await self.history('a', committed['program_key'])
        self.assertTrue(any(point['implemented'] == 1 and
                            point['observation_kind'] == 'committed_event' for point in history['snapshots']))

    async def test_assigned_readonly_history_does_not_grant_portfolio_or_write_access(self):
        await self.configure()
        row = await self.source('a', 'cis-ig1', '1.1')
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        self.sign_in('member')
        before = copy.deepcopy(await self.collections())
        history = await self.history('a', 'cis-ig1')
        self.assertEqual(history['client_id'], 'a')
        self.assertEqual(history['current']['denominator'], 56)
        self.assertEqual(await self.collections(), before)
        self.assertEqual((await self.client.get('/api/portfolio/reporting/overview')).status_code, 403)
        foreign = await self.client.get('/api/portfolio/reporting/history',
            params={'client_id': 'b', 'program_key': 'soc-2'})
        self.assertEqual(foreign.status_code, 403, foreign.text)
        response = await self.client.patch('/api/framework_assessments/' + row['framework_assessment_id'],
            json={'expected_last_assessed': row.get('last_saved') or row.get('last_assessed'),
                  'status': 'addressed', 'implementation': 'Forbidden synthetic write'})
        self.assertEqual(response.status_code, 403, response.text)
        requirement = await server.db.requirements.find_one({'client_id': 'a', 'baseline_key': 'soc-2'})
        response = await self.client.patch('/api/onboarding/programs/soc-2', json={
            'client_id': 'a', 'applicability': 'applies', 'expected_updated_at': requirement.get('updated_at')})
        self.assertEqual(response.status_code, 403, response.text)
        after = await self.collections()
        self.assertEqual({key: value for key, value in after.items() if key != 'audit_logs'},
                         {key: value for key, value in before.items() if key != 'audit_logs'})
        prior_logs = {row['_id']: row for row in before['audit_logs']}
        after_logs = {row['_id']: row for row in after['audit_logs']}
        self.assertEqual({key: after_logs.get(key) for key in prior_logs}, prior_logs)
        denials = [row for key, row in after_logs.items() if key not in prior_logs]
        self.assertEqual(len(denials), 4)
        self.assertTrue(all(row['action'] == 'access-denied' and row['entity_type'] == 'security'
                            and row['meta']['status'] == 403 for row in denials))
        self.assertEqual({(row['meta']['method'], row['meta']['route']) for row in denials}, {
            ('GET', '/api/portfolio/reporting/overview'), ('GET', '/api/portfolio/reporting/history'),
            ('PATCH', '/api/framework_assessments/{aid}'), ('PATCH', '/api/onboarding/programs/{key}')})
