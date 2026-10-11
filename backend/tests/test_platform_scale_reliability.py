"""Bounded read/recovery campaign, not ten years of executed business transitions.

Ten-year history is seeded load-test volume. Existing FastAPI routes perform the
reads, paging, report generation and selected ordinary-record writes under test.
The signed actors are isolated fixtures, never hosted restricted-user evidence.
"""
import asyncio
import copy
import csv
from functools import wraps
import hashlib
import io
import json
import os
from pathlib import Path
import statistics
import time
import unittest
import uuid
from unittest.mock import AsyncMock, patch

import test_client_dashboard_sources as harness

server = harness.server


AS_OF = '2037-01-15T12:00:00Z'
START, END = '2027-01-01', '2037-01-01'  # Half-open UTC date interval.
CONFIGURATIONS = (
    ('scale-cis-ig1', 'cis-ig1', {'implementation_group': 1}),
    ('scale-cis-ig2', 'cis-ig1', {'implementation_group': 2}),
    ('scale-cis-ig3', 'cis-ig1', {'implementation_group': 3}),
    ('scale-iso', 'iso-27001', {}),
    ('scale-soc', 'soc-2', {'categories': ['security', 'availability', 'confidentiality']}),
)
PRIVATE_LOAD_TEXT = 'Synthetic scale-only historical narrative. ' * 300
LOAD_EVIDENCE_SHA = hashlib.sha256(b'TEST').hexdigest()
READ_COLLECTIONS = ('clients', 'requirements', 'framework_assessments', 'reviews', 'tasks', 'findings', 'evidence')


def bounded_case(seconds):
    """A harness resource limit is not an application latency acceptance budget."""
    def decorate(method):
        @wraps(method)
        async def run(self):
            try:
                return await asyncio.wait_for(method(self), seconds)
            except TimeoutError:
                self.report['status'] = 'harness_budget_exceeded_not_product_defect'
                raise AssertionError(f'Isolated QA case exceeded its {seconds}s resource budget; cause remains unestablished') from None
        return run
    return decorate


class PlatformScaleReliabilityTests(unittest.IsolatedAsyncioTestCase):
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        self.report = {'test': self._testMethodName, 'status': 'started_not_completed', 'interval': [START, END],
                       'as_of': AS_OF, 'clock_boundary': 'Only server _now patched; no OS/shared clock change',
                       'persistence': 'real_loopback_motor_mongo' if os.environ.get('PLATFORM_ACCEPTANCE_SCALE_MONGO') else 'mongomock_motor',
                       'identity': 'isolated modeled signed actor; no live hosted role proof',
                       'measurements': [], 'volume': {}, 'owned_database': None, 'limitations': [
                           'Historical saves/approval/closure are seeded load volume, not executed lifecycle proof.',
                           'No hosted backend/browser, real restricted identity or production capacity claim.',
                           'Latency observations have no invented pass threshold; adopted payload/cap budgets are separately asserted.',
                           'Mongo mock does not prove durability, index/query-plan or multiworker contention.',
                           'Board PDF date/generated labels and recent-policy 90-day cutoff use actual server.datetime; no recent-policy fixture or full-clock claim.',
                           'Cleanup receipt is author-harness evidence; coordinator independently checks the exact recorded database afterward.',
                       ]}
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        self.real_mongo = None
        mongo_url = os.environ.get('PLATFORM_ACCEPTANCE_SCALE_MONGO')
        if mongo_url:
            self.assertEqual(mongo_url, 'mongodb://127.0.0.1:58749', 'Only the assigned run-owned loopback Mongo is allowed')
            from motor.motor_asyncio import AsyncIOMotorClient
            self.real_mongo = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000)
            self.addCleanup(self.real_mongo.close)
            self.database_name = 'platform_acceptance_20261011_scale_' + uuid.uuid4().hex[:16]
            self.assertRegex(self.database_name, r'^platform_acceptance_20261011_scale_[a-f0-9]{16}$')
            self.assertLessEqual(len(self.database_name.encode()), 63)
            owned_database = self.real_mongo[self.database_name]
            self.assertEqual(await owned_database.list_collection_names(), [], 'Refuse to reuse a pre-existing database')
            self.report['owned_database'] = {'origin': mongo_url, 'database_name': self.database_name,
                                            'fresh_collection_readback': [], 'cleanup': 'not_started'}
            self.write_report()  # Keep the owned name recoverable if the runner is interrupted.
            real_database = patch.object(server, 'db', owned_database)
            real_database.start()
            self.addCleanup(real_database.stop)
            self.addAsyncCleanup(self.drop_owned_database)
            await server.db.users.insert_one({'user_id': 'admin', 'email': 'admin@example.test', 'name': 'Synthetic scale operator',
                                              'role': 'super_admin', 'status': 'active', 'client_ids': []})
        self.sign_in('admin')
        clock = patch.object(server, '_now', lambda: AS_OF)
        clock.start()
        self.addCleanup(clock.stop)

    async def drop_owned_database(self):
        self.assertRegex(self.database_name, r'^platform_acceptance_20261011_scale_[a-f0-9]{16}$')
        self.assertLessEqual(len(self.database_name.encode()), 63)
        try:
            await self.real_mongo.drop_database(self.database_name)
            self.report['owned_database']['cleanup'] = 'drop_acknowledged_by_driver'
        except Exception as error:
            self.report['owned_database']['cleanup'] = 'drop_failed'
            self.report['owned_database']['cleanup_error_type'] = type(error).__name__
            raise
        finally:
            self.write_report()

    async def asyncTearDown(self):
        self.write_report()

    def write_report(self):
        destination = os.environ.get('PLATFORM_ACCEPTANCE_SCALE_REPORT_DIR')
        if destination:
            directory = Path(destination)
            directory.mkdir(parents=True, exist_ok=True)
            (directory / (self._testMethodName + '.json')).write_text(json.dumps(self.report, indent=2) + '\n', encoding='utf-8')

    async def measured(self, method, path, expected=200, **kwargs):
        started = time.perf_counter_ns()
        response = await self.client.request(method, path, **kwargs)
        self.report['measurements'].append({'method': method, 'path': path, 'status': response.status_code,
                                            'elapsed_ms': round((time.perf_counter_ns() - started) / 1_000_000, 3),
                                            'response_bytes': len(response.content)})
        self.assertEqual(response.status_code, expected, response.text[:300])
        return response

    async def fingerprints(self, collections=READ_COLLECTIONS):
        result = {}
        for name in collections:
            rows = await server.db[name].find({}, {'_id': 0}).to_list(None)
            serialized = sorted(json.dumps(row, sort_keys=True, default=str) for row in rows)
            result[name] = hashlib.sha256('\n'.join(serialized).encode()).hexdigest()
        return result

    async def seed_history_volume(self):
        from framework_catalog import CATALOGS, active_definitions
        volume = {}
        for cid, framework, configuration in CONFIGURATIONS:
            definitions = active_definitions(framework, configuration)
            await server.db.clients.insert_one({'client_id': cid, 'name': 'Synthetic scale only ' + cid, 'status': 'active',
                'framework_settings': {framework: configuration}, 'onboarding_baseline': {'completed': True}})
            await server.db.requirements.insert_one({'client_id': cid, 'requirement_id': cid + '-program', 'title': framework,
                'baseline_key': framework, 'baseline_response': 'applies', 'status': 'active'})
            assessments = []
            for definition in definitions:
                assessments.append({'client_id': cid, 'framework_assessment_id': cid + '-assessment-' + definition['id'],
                    'framework_key': framework, 'framework_version': CATALOGS[framework]['version'], 'definition_id': definition['id'],
                    'status': 'not_assessed', 'implementation': '', 'assessment_history': [
                        {'at': f'{year}-12-31T12:00:00Z', 'by': 'admin', 'status': 'in_progress',
                         'implementation': PRIVATE_LOAD_TEXT} for year in range(2027, 2037)]})
            await server.db.framework_assessments.insert_many(assessments)
            review_rows, evidence_rows = [], []
            for number in range(12):
                rid = f'{cid}-review-{number:02}'
                occurrences = []
                for year in range(2027, 2037):
                    for month in range(1, 13):
                        oid = f'{rid}-{year}-{month:02}'
                        eid = f'{cid}-evidence-{year}-{month:02}'
                        occurrences.append({'review_id': rid, 'client_id': cid, 'occurrence_id': oid, 'period': f'{year}-{month:02}',
                            'title': f'Synthetic monthly history {number}', 'review_type': 'access', 'status': 'completed',
                            'due_date': f'{year}-{month:02}-15T12:00:00Z', 'completed_at': f'{year}-{month:02}-15T14:00:00Z',
                            'completed_by': 'admin', 'completed_by_name': 'Synthetic scale operator', 'notes': PRIVATE_LOAD_TEXT,
                            'framework_key': framework, 'evidence': [{'evidence_id': eid, 'sha256': LOAD_EVIDENCE_SHA, 'version': 1}] if number == 0 else []})
                        if number == 0:
                            evidence_rows.append({'client_id': cid, 'evidence_id': eid, 'filename': f'synthetic-volume-{year}-{month:02}.txt',
                                'display_name': f'Synthetic criterion evidence {year}-{month:02}', 'linked_type': 'review', 'linked_id': rid,
                                'occurrence_id': oid, 'created_at': f'{year}-{month:02}-15T14:00:00Z', 'content_base64': 'VEVTVA==',
                                'sha256': LOAD_EVIDENCE_SHA, 'version': 1, 'uploaded_by': 'admin', 'mime_type': 'text/plain'})
                due = '2037-01-14' if number < 4 else '2037-01-15' if number < 8 else '2037-02-15'
                review_rows.append({'review_id': rid, 'client_id': cid, 'title': f'Synthetic active Review {number}', 'review_type': 'access',
                    'status': 'upcoming', 'recurrence': 'monthly', 'due_date': due, 'owner_id': 'admin', 'framework_key': framework,
                    'current_occurrence_id': rid + '-current', 'occurrences': occurrences, 'created_at': START})
            await server.db.reviews.insert_many(review_rows)
            await server.db.evidence.insert_many(evidence_rows)
            tasks = [{'task_id': f'{cid}-historical-{year}-{number:02}', 'client_id': cid, 'title': f'Synthetic completed {year}-{number}',
                      'status': 'done', 'created_at': f'{year}-06-01', 'due_date': f'{year}-06-30', 'completed_at': f'{year}-06-30T14:00:00Z',
                      'description': PRIVATE_LOAD_TEXT, 'framework_key': framework} for year in range(2027, 2037) for number in range(20)]
            for number in range(40):
                due = '2037-01-14' if number < 10 else '2037-02-14' if number < 20 else '2037-02-15' if number < 30 else None
                tasks.append({'task_id': f'{cid}-open-{number:02}', 'client_id': cid, 'title': f'Synthetic open task {number:02}',
                    'status': 'open', 'created_at': '2036-12-01', 'due_date': due, 'priority': 'medium', 'assignee_id': 'admin',
                    'framework_key': framework, 'description': PRIVATE_LOAD_TEXT})
            fid = cid + '-historical-finding'
            await server.db.findings.insert_one({'client_id': cid, 'finding_id': fid, 'title': 'Synthetic retained Finding',
                'status': 'closed', 'created_at': '2036-01-01', 'closed_at': '2036-12-31', 'decision_history': [
                    {'at': '2036-12-31', 'by': 'admin', 'action': 'validate', 'rationale': 'Synthetic volume only'}]})
            tasks += [{'client_id': cid, 'task_id': f'{cid}-linked-{number:03}', 'finding_id': fid, 'source_type': 'finding', 'source_id': fid,
                       'title': f'Synthetic historical remediation {number:03}', 'status': 'done', 'created_at': '2036-01-01',
                       'completed_at': '2036-12-31', 'description': PRIVATE_LOAD_TEXT} for number in range(205)]
            await server.db.tasks.insert_many(tasks)
            volume[cid] = {'active_definitions': len(definitions), 'reviews': 12, 'seeded_review_occurrences': 1440,
                           'tasks': 445, 'active_tasks': 40, 'evidence_files': 120, 'retained_findings': 1,
                           'seeded_assessment_history_rows': len(definitions) * 10}
        self.assertEqual([volume[cid]['active_definitions'] for cid, _, _ in CONFIGURATIONS], [56, 130, 153, 123, 38])
        self.report['volume'] = volume

    @bounded_case(240)
    async def test_five_client_history_reads_pages_filters_relationships_and_reports(self):
        await self.seed_history_volume()
        before = await self.fingerprints()
        report_events_before = await server.db.audit_logs.count_documents({'entity_type': 'board-report'})
        for cid, framework, _ in CONFIGURATIONS:
            with self.subTest(client=cid):
                tasks = (await self.measured('GET', '/api/tasks', params={'client_id': cid})).json()
                expected_tasks = {f'{cid}-historical-{year}-{n:02}' for year in range(2027, 2037) for n in range(20)}
                expected_tasks |= {f'{cid}-open-{n:02}' for n in range(40)}
                expected_tasks |= {f'{cid}-linked-{n:03}' for n in range(205)}
                self.assertEqual(len(tasks), 445)
                self.assertEqual({row['task_id'] for row in tasks}, expected_tasks)
                self.assertTrue(all(row['client_id'] == cid for row in tasks))
                expected_all = {f'{cid}-open-{n:02}' for n in range(40)} | {f'{cid}-review-{n:02}' for n in range(12)}
                expected_past = {f'{cid}-open-{n:02}' for n in range(10)} | {f'{cid}-review-{n:02}' for n in range(4)}
                expected_soon = {f'{cid}-open-{n:02}' for n in range(10, 20)} | {f'{cid}-review-{n:02}' for n in range(4, 8)}
                for _ in range(3):
                    preview = (await self.measured('GET', '/api/dashboard', params={'client_id': cid, 'work_queue': True})).json()
                    self.assertEqual({key: value['total'] for key, value in preview['groups'].items()},
                                     {'all': 52, 'pastDue': 14, 'due30': 14, 'unassigned': 0})
                    self.assertTrue(all(len(value['items']) <= 9 for value in preview['groups'].values()))
                for group, expected in [('all', expected_all), ('pastDue', expected_past), ('due30', expected_soon)]:
                    actual = []
                    for offset in range(0, len(expected), 13):
                        page = (await self.measured('GET', '/api/dashboard', params={'client_id': cid, 'work_queue': True,
                            'detail': group, 'framework': framework, 'offset': offset, 'limit': 13})).json()
                        self.assertEqual(page['total'], len(expected))
                        self.assertTrue(all(row['record']['client_id'] == cid for row in page['items']))
                        self.assertEqual(page['has_more'], offset + 13 < len(expected))
                        actual.extend(row['id'] for row in page['items'])
                    self.assertEqual(set(actual), expected)
                    self.assertEqual(len(actual), len(expected))
                search = (await self.measured('GET', '/api/dashboard', params={'client_id': cid, 'work_queue': True,
                    'detail': 'all', 'framework': framework, 'search': 'open task 39'})).json()
                self.assertEqual([row['id'] for row in search['items']], [cid + '-open-39'])
                summary = await self.measured('GET', '/api/dashboard', params={'client_id': cid})
                self.assertLess(len(summary.content), 256000)  # Existing DashboardContractTests budget.
                self.assertNotIn(PRIVATE_LOAD_TEXT[:80], summary.text)
                self.assertNotIn('assessment_history', summary.text)
                self.assertNotIn('occurrences', summary.text)
                calendar = (await self.measured('GET', '/api/calendar', params={'client_id': cid,
                    'start': '2036-01-01', 'end': '2036-12-31', 'scope': 'history'})).json()
                entries = [row for buckets in calendar.values() for bucket in buckets.values() for row in bucket]
                expected_calendar = {('review', f'{cid}-review-{n:02}', f'{cid}-review-{n:02}-2036-{month:02}')
                                     for n in range(12) for month in range(1, 13)}
                expected_calendar |= {('task', f'{cid}-historical-2036-{n:02}', None) for n in range(20)}
                self.assertEqual({(row['kind'], row['id'], row.get('occurrence_id')) for row in entries}, expected_calendar)
                self.assertEqual(len(entries), 164)
                self.assertEqual(len({row['key'] for row in entries}), 164)
                self.assertTrue(all(row['client_id'] == cid and not row['can_reschedule'] for row in entries))
                self.assertNotIn(PRIVATE_LOAD_TEXT[:80], json.dumps(calendar))
                related = (await self.measured('GET', '/api/related', params={'entity_type': 'findings',
                    'entity_id': cid + '-historical-finding'})).json()
                self.assertEqual({row['task_id'] for row in related['tasks']}, {f'{cid}-linked-{n:03}' for n in range(205)})
                self.assertEqual(len(related['tasks']), 205)
                self.assertTrue(all(row['client_id'] == cid for row in related['tasks']))
                evidence_ids = []
                for page_number in range(1, 9):
                    page = (await self.measured('GET', '/api/evidence/catalog', params={'client_id': cid,
                        'q': 'Synthetic criterion evidence', 'page': page_number, 'page_size': 17})).json()
                    self.assertEqual(page['total'], 120)
                    self.assertLessEqual(len(page['items']), 17)
                    self.assertTrue(all(row['client_id'] == cid and 'content_base64' not in row for row in page['items']))
                    evidence_ids.extend(row['evidence_id'] for row in page['items'])
                self.assertEqual(set(evidence_ids), {f'{cid}-evidence-{year}-{month:02}' for year in range(2027, 2037) for month in range(1, 13)})
                self.assertEqual(len(evidence_ids), 120)
                filtered = (await self.measured('GET', '/api/evidence/catalog', params={'client_id': cid,
                    'state': json.dumps({'filters': {'years': ['2036']}}), 'page_size': 100})).json()
                self.assertEqual(filtered['total'], 12)
                self.assertEqual(len(filtered['items']), 12)
                self.assertEqual({row['evidence_id'] for row in filtered['items']}, {f'{cid}-evidence-2036-{month:02}' for month in range(1, 13)})
                exported = await self.measured('GET', '/api/export/tasks', params={'client_id': cid})
                csv_rows = list(csv.DictReader(io.StringIO(exported.text)))
                self.assertEqual(len(csv_rows), 445)
                self.assertEqual({row['task_id'] for row in csv_rows}, expected_tasks)
                self.assertTrue(all(row['client_id'] == cid for row in csv_rows))
                with patch.object(server, 'Table', wraps=server.Table) as tables:
                    pdf = await self.measured('GET', '/api/reports/board', params={'client_id': cid})
                self.assertTrue(pdf.content.startswith(b'%PDF'))
                self.assertEqual(tables.call_args_list[0].args[0][1], ['4', '0', '0', '0'])
                self.assertEqual(len(tables.call_args_list[1].args[0]) - 1, 4)
        self.assertEqual(await self.fingerprints(), before)
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_type': 'board-report'}), report_events_before + 5)
        times = [row['elapsed_ms'] for row in self.report['measurements']]
        self.report['latency_summary'] = {'samples': len(times), 'median_ms': statistics.median(times), 'max_ms': max(times),
                                          'latency_budget': None, 'interpretation': 'Observed baseline only; heterogeneous routes, not throughput/p95 certification'}
        self.report['status'] = 'passed'

    @bounded_case(60)
    async def test_register_export_caps_fail_closed_and_export_retains_complete_set(self):
        cid = 'scale-cap-register'
        await server.db.clients.insert_one({'client_id': cid, 'name': 'Synthetic cap-only fixture', 'status': 'active'})
        rows = [{'client_id': cid, 'asset_id': f'cap-{n:05}', 'name': f'Synthetic cap {n}', 'status': 'active', 'created_at': START} for n in range(1000)]
        await server.db.assets.insert_many(copy.deepcopy(rows))
        listed = await self.measured('GET', '/api/assets', params={'client_id': cid})
        self.assertEqual(len(listed.json()), 1000)
        self.assertEqual({row['asset_id'] for row in listed.json()}, {row['asset_id'] for row in rows})
        await server.db.assets.insert_one({'client_id': cid, 'asset_id': 'cap-01000', 'name': 'Synthetic cap 1000', 'status': 'active'})
        over_register = await self.measured('GET', '/api/assets', expected=413, params={'client_id': cid})
        self.assertIn('No partial results', over_register.json()['detail'])
        exported = await self.measured('GET', '/api/export/assets', params={'client_id': cid})
        exported_rows = list(csv.DictReader(io.StringIO(exported.text)))
        self.assertEqual(len(exported_rows), 1001)
        self.assertEqual({row['asset_id'] for row in exported_rows}, {f'cap-{n:05}' for n in range(1001)})
        await server.db.assets.insert_many([{'client_id': cid, 'asset_id': f'cap-{n:05}', 'name': f'Synthetic cap {n}', 'status': 'active'} for n in range(1001, 10001)])
        over_export = await self.measured('GET', '/api/export/assets', expected=413, params={'client_id': cid})
        self.assertIn('No partial results', over_export.json()['detail'])
        self.assertNotIn('asset_id', over_export.text)
        self.assertEqual(await server.db.assets.count_documents({'client_id': cid}), 10001)
        self.report['volume'] = {'cap_only_assets': 10001, 'register_limit': 1000, 'export_limit': 10000,
                                'not_plausible_lifecycle_seed': 'Exact declared capacity boundary fixture only'}
        self.report['status'] = 'passed'

    @bounded_case(60)
    async def test_calendar_limit_and_invalid_windows_never_return_partial_success(self):
        cid = 'scale-cap-calendar'
        await server.db.clients.insert_one({'client_id': cid, 'name': 'Synthetic calendar cap-only fixture', 'status': 'active'})
        await server.db.tasks.insert_many([{'client_id': cid, 'task_id': f'calendar-cap-{n:05}', 'title': 'Synthetic cap-only task',
                                          'status': 'open', 'due_date': '2037-01-15'} for n in range(5000)])
        params = {'client_id': cid, 'start': '2037-01-01', 'end': '2037-01-31', 'scope': 'active'}
        result = (await self.measured('GET', '/api/calendar', params=params)).json()
        self.assertEqual(len(result['tasks']['2037-01-15']), 5000)
        await server.db.tasks.insert_one({'client_id': cid, 'task_id': 'calendar-cap-05000', 'title': 'Synthetic cap-only task',
                                         'status': 'open', 'due_date': '2037-01-15'})
        cap = await self.measured('GET', '/api/calendar', expected=413, params=params)
        self.assertIn('no partial results', cap.json()['detail'])
        self.assertNotIn('tasks', cap.json())
        for start, end in [('2037-01-01', '2038-01-03'), ('2037-02-30', '2037-03-31'), ('2037-01-31', '2037-01-01')]:
            await self.measured('GET', '/api/calendar', expected=422, params={**params, 'start': start, 'end': end})
        self.assertEqual(await server.db.tasks.count_documents({'client_id': cid}), 5001)
        self.report['volume'] = {'cap_only_tasks': 5001, 'calendar_limit': 5000, 'window_limit_days_inclusive': 367}
        self.report['status'] = 'passed'

    @bounded_case(60)
    async def test_ordinary_record_parallel_stale_and_post_write_audit_failure_retry(self):
        cid = 'scale-reliability'
        await server.db.clients.insert_one({'client_id': cid, 'name': 'Synthetic ordinary save fixture', 'status': 'active'})
        path = '/api/assets/scale-retry'
        await server.db.assets.insert_one({'client_id': cid, 'asset_id': 'scale-retry', 'name': 'Before', 'status': 'active',
                                          'updated_at': '2027-01-01T00:00:00+00:00'})
        body = {'name': 'Reviewed exact change', 'expected_updated_at': '2027-01-01T00:00:00+00:00'}
        headers = {'Idempotency-Key': 'platform-scale-retry-original'}
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('isolated ordinary-record audit failure'))):
            await self.measured('PATCH', path, expected=503, json=body, headers=headers)
        self.assertEqual((await self.measured('GET', path)).json()['name'], 'Reviewed exact change')
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_id': 'scale-retry', 'action': 'update'}), 0)
        recovered = await self.measured('PATCH', path, json=body, headers=headers)
        replayed = await self.measured('PATCH', path, json=body, headers=headers)
        self.assertEqual(replayed.json(), recovered.json())
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_id': 'scale-retry', 'action': 'update'}), 1)
        version = recovered.json()['updated_at']
        results = await asyncio.gather(*(self.client.patch(path, json={'name': f'Concurrent accepted value {n}',
            'expected_updated_at': version}, headers={'Idempotency-Key': f'platform-scale-concurrent-{n}'}) for n in range(8)))
        self.assertEqual([r.status_code for r in results].count(200), 1)
        self.assertTrue(all(r.status_code in (200, 409) for r in results), [r.status_code for r in results])
        winning = next(r.json() for r in results if r.status_code == 200)
        current = (await self.measured('GET', path)).json()
        self.assertEqual(current['name'], winning['name'])
        await self.measured('PATCH', path, expected=409, json=body, headers={'Idempotency-Key': 'platform-scale-stale-new-intent'})
        self.assertEqual((await self.measured('GET', path)).json()['name'], winning['name'])
        await self.measured('PATCH', path, json=body, headers=headers)
        self.assertEqual((await self.measured('GET', path)).json()['name'], winning['name'])
        self.assertEqual(await server.db.assets.count_documents({'client_id': cid}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_id': 'scale-retry', 'action': 'update'}), 2)
        self.report['concurrent_results'] = [r.status_code for r in results]
        self.report['reliability_boundary'] = 'Injected exception after ordinary Asset primary CAS but before audit call writes; not lost driver/audit-write acknowledgement. No server/process kill, driver cancellation, auth endpoint or hosted fault injection'
        self.report['status'] = 'passed'
