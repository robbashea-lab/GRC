"""Five independent ten-year programs through existing API commands.

Local identities use the existing modeled-token fixture, not hosted sign-in proof.
Default storage is Mongo mock. Opt-in actual Motor/Mongo requires the explicit
root-owned loopback URI and platform_acceptance_20261011_tenyear prefix.
No authentication/recovery campaign, external mail, live clock or live data.
"""
import asyncio
import base64
import copy
import csv
import hashlib
import json
import io
import logging
import os
import re
import subprocess
import sys
import unittest
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from time import perf_counter
from unittest.mock import AsyncMock, patch
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parent)]
import test_client_dashboard_sources as harness
import test_framework_three_year as lifecycle
import iso_audit
import record_integrity
from framework_catalog import CATALOGS, FRAMEWORKS
from routes.onboarding import BASELINE_CATALOG

server = harness.server
START, END = date(2027, 1, 1), date(2037, 1, 1)
CASES = {
    'cis-ig1': ('cis-ig1', {'implementation_group': 1}, 56),
    'cis-ig2': ('cis-ig1', {'implementation_group': 2}, 130),
    'cis-ig3': ('cis-ig1', {'implementation_group': 3}, 153),
    'iso-27001': ('iso-27001', {}, 123),
    'soc-2': ('soc-2', {'categories': ['security', 'availability', 'confidentiality']}, 38),
}
MONTH_STEPS = {'monthly': 1, 'quarterly': 3, 'semiannual': 6, 'annual': 12}
KEYS = {'reviews': 'review_id', 'findings': 'finding_id', 'tasks': 'task_id',
        'risks': 'risk_id', 'vendors': 'vendor_id', 'policies': 'policy_id'}
RECORD_KEYS = {**KEYS, 'evidence': 'evidence_id', 'framework_assessments': 'framework_assessment_id',
               'exceptions': 'exception_id', 'requirements': 'requirement_id'}


def expected_dates(first, cadence, days=None):
    """Independent oracle: enumerate from the original date, never runtime output."""
    first = date.fromisoformat(first[:10])
    if cadence == 'none':
        return [first.isoformat()] if START <= first < END else []
    if cadence == 'custom':
        assert isinstance(days, int) and days > 0
        return [(first + timedelta(days=elapsed)).isoformat()
                for elapsed in range(0, (END - first).days, days)
                if first + timedelta(days=elapsed) >= START]
    step = MONTH_STEPS[cadence]
    last_day = first.day == monthrange(first.year, first.month)[1]
    result = []
    for elapsed in range(0, (END.year - first.year + 1) * 12, step):
        serial = first.year * 12 + first.month - 1 + elapsed
        year, month0 = divmod(serial, 12)
        month = month0 + 1
        last = monthrange(year, month)[1]
        due = date(year, month, last if last_day else min(first.day, last))
        if due >= END:
            break
        if due >= START:
            result.append(due.isoformat())
    return result


def definition_ids(key, configuration):
    """Catalog input oracle, independent of runtime active_definitions/plans."""
    return {row['id'] for row in CATALOGS[key]['requirements']
            if (key != 'cis-ig1' or row.get('implementation_group', 1) <= configuration['implementation_group'])
            and (key != 'soc-2' or row['category'] in configuration['categories'])}


class PlatformTenYearTests(unittest.IsolatedAsyncioTestCase):
    sign_in = lifecycle.FrameworkThreeYearTests.sign_in
    clock = lifecycle.FrameworkThreeYearTests.clock

    async def asyncSetUp(self):
        await lifecycle.FrameworkThreeYearTests.asyncSetUp(self)
        asyncio.get_running_loop().set_debug(False)
        logging.getLogger('httpx').setLevel(logging.WARNING)
        self.report = {'source_revision': '28b806716024ec149af2ec5da621a5a618c669d5',
                       'interval': {'start_inclusive': START.isoformat(), 'end_exclusive': END.isoformat()},
                       'authentication': 'Modeled local fixture tokens; no hosted sign-in or role proof',
                       'storage': 'isolated Mongo mock', 'years': [], 'events': [], 'request_counts': {},
                       'timings': [], 'completed': False, 'unsupported': [
                           'No autonomous occurrence-generation scheduler; operator catch-up is sequential',
                           'No structured Backlog promotion state found',
                           'No in-place Evidence bytes/version-family replacement workflow found',
                           'Generic canceled Review and inactive Vendor reactivation are unsupported/rejected; client archive/restore is exercised',
                           'Notification delivery/retry, hosted worker disruption and driver cancellation not exercised',
                           'Actual logout/login and human UI usability belong to separate hosted evidence'],
                       'clock': 'UTC module clock; date-only/DST probes use America/New_York'}
        self.report['client_user_timezone_display'] = 'Unexecuted; UTC service dates and timezone-provider oracle do not prove browser/user-zone display'
        self.snapshots, self.files, self.contracts = {}, {}, {}
        self.expected_records = {kind: set() for kind in RECORD_KEYS}
        self.expected_relationships = []
        self.request_samples = {}
        self.request_total = 0
        self.started = perf_counter()
        self.report['harness_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        uri = os.environ.get('PLATFORM_ACCEPTANCE_MONGO_URI')
        if uri:
            parts = urlsplit(uri)
            prefix = parts.path.removeprefix('/')
            if (parts.scheme != 'mongodb' or parts.hostname != '127.0.0.1' or not parts.port
                    or parts.username or parts.password or parts.query or parts.fragment
                    or parts.port != 58749 or prefix != 'platform_acceptance_20261011_tenyear'):
                raise ValueError('Use root-owned mongodb://127.0.0.1:58749/platform_acceptance_20261011_tenyear without credentials/options')
            from motor.motor_asyncio import AsyncIOMotorClient
            from initialization import ensure_indexes
            mongo = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=3000)
            self.addCleanup(mongo.close)
            await mongo.admin.command('ping')
            database = prefix + '_' + uuid4().hex[:16]
            self.assertLessEqual(len(database), 63)
            self.assertNotIn(database, await mongo.list_database_names())
            actual = mongo[database]
            async def remove_owned_database():
                await mongo.drop_database(database)
            self.addAsyncCleanup(remove_owned_database)
            source = server.db
            for kind in await source.list_collection_names():
                rows = await source[kind].find({}).to_list(None)
                if rows:
                    await actual[kind].insert_many(rows)
            await ensure_indexes(actual)
            for module in (server, lifecycle.clocks.onboarding_routes):
                override = patch.object(module, 'db', actual)
                override.start()
                self.addCleanup(override.stop)
            self.report['storage'] = 'actual Motor/Mongo on explicit owned loopback database'
            self.report['database'] = database

    async def asyncTearDown(self):
        self.report['elapsed_seconds'] = round(perf_counter() - self.started, 4)
        self.report['operation_measurements'] = [
            {'operation': operation, 'year': year, 'sample_count': len(samples),
             'median_seconds': round(median([s[0] for s in samples]), 6),
             'min_seconds': round(min(s[0] for s in samples), 6), 'max_seconds': round(max(s[0] for s in samples), 6),
             'max_response_bytes': max(s[1] for s in samples),
             'sample_policy': 'first100 per operation/year; timings are observations, not capacity/SLO acceptance'}
            for (operation, year), samples in sorted(self.request_samples.items())]
        directory = os.environ.get('PLATFORM_ACCEPTANCE_REPORT_DIR')
        if directory:
            destination = Path(directory)
            destination.mkdir(parents=True, exist_ok=True)
            name = self.report.get('framework', self._testMethodName)
            (destination / (name + '.json')).write_text(json.dumps(self.report, indent=2) + '\n', encoding='utf-8')

    async def request(self, method, path, status=200, **kwargs):
        self.request_total += 1
        self.report['request_counts'][method] = self.report['request_counts'].get(method, 0) + 1
        started = perf_counter()
        response = await self.client.request(method, '/api' + path, **kwargs)
        operation = method + ' /' + path.strip('/').split('/')[0]
        if path == '/evidence/catalog':
            operation += '/catalog'
        elif path.endswith('/download'):
            operation += '/item/download'
        samples = self.request_samples.setdefault((operation, lifecycle.clocks.Clock.now.year), [])
        if len(samples) < 100:
            samples.append((perf_counter() - started, len(response.content)))
        self.assertEqual(response.status_code, status, (self.report.get('framework'), method, path, response.text))
        result = response.json()
        if method == 'POST' and status == 200 and isinstance(result, dict) and result.get('client_id') == getattr(self, 'cid', None):
            # Only acknowledged creation of the actual target adds an expected ID.
            # Reads/edits/reference fields must not normalize unexpected records.
            target = path.strip('/') if path.strip('/') in RECORD_KEYS else 'findings' if path.endswith('/findings') or path.endswith('/create-finding') else None
            if target:
                self.expected_records[target].add(result[RECORD_KEYS[target]])
        return result

    async def get(self, path, **params):
        return await self.request('GET', path, params=params)

    async def post(self, path, body=None, **kwargs):
        return await self.request('POST', path, json=body or {}, **kwargs)

    async def edit(self, path, body, **kwargs):
        return await self.request('PATCH', path, json=body, **kwargs)

    def event(self, year, scenario, **details):
        self.report['events'].append({'year': year, 'scenario': scenario, 'executed': True, **details})

    async def upload(self, kind, identity, content, **extra):
        payload = content.encode()
        evidence = await self.post('/evidence', {'client_id': self.cid, 'linked_type': kind,
            'linked_id': identity, 'filename': 'SYNTHETIC-' + uuid4().hex + '.txt',
            'content_base64': base64.b64encode(payload).decode(), **extra})
        self.files[evidence['evidence_id']] = hashlib.sha256(payload).hexdigest()
        self.assertEqual(evidence['sha256'], self.files[evidence['evidence_id']])
        target = {'review': 'reviews', 'finding': 'findings', 'framework_assessment': 'framework_assessments'}[kind]
        self.expected_relationships.append(('evidence', evidence['evidence_id'], 'linked_id', target, identity))
        if extra.get('occurrence_id'):
            self.expected_relationships.append(('evidence', evidence['evidence_id'], 'occurrence_id', 'occurrence', extra['occurrence_id']))
        return evidence

    async def onboard(self, label, key, config):
        client = await self.post('/clients', {'name': 'SYNTHETIC platform ten-year ' + label})
        cid = client['client_id']
        state = {'version': 3, 'step': 3, 'policies': {p['key']: 'unsure' for p in BASELINE_CATALOG['policies']},
                 'requirements': {f['key']: 'applies' if f['key'] == key else 'does_not_apply' for f in FRAMEWORKS},
                 'reviews': [], 'framework_settings': {key: config} if key == 'cis-ig1' else {},
                 'framework_reviews': {p['key']: {'enabled': p.get('default_enabled', True),
                    'recurrence': p['default_cadence'], 'custom_recurrence_days': p.get('default_custom_recurrence_days'),
                    'due_date': '2027-01-31'} for p in CATALOGS[key]['review_plans']
                    if set(p['safeguards']) & definition_ids(key, config)}}
        body = {'client_id': cid, 'state': state, 'finalize': True}
        await self.post('/onboarding/baseline', body)
        before = await self.get('/frameworks/' + key, client_id=cid)
        review_ids = {r['review_id'] for r in await self.get('/reviews', client_id=cid)}
        await self.post('/onboarding/baseline', body)
        self.assertEqual({r['framework_assessment_id'] for r in (await self.get('/frameworks/' + key, client_id=cid))['assessments']},
                         {r['framework_assessment_id'] for r in before['assessments']})
        self.assertEqual({r['review_id'] for r in await self.get('/reviews', client_id=cid)}, review_ids)
        if key == 'soc-2':
            await self.edit('/frameworks/soc-2/configuration', {'client_id': cid, **config,
                'system_description': 'SYNTHETIC isolated service; no operating assurance asserted'})
        return cid

    async def setup_program(self, label):
        self.clock(START.isoformat())
        self.sign_in('admin')
        key, config, count = CASES[label]
        self.key, self.config = key, config
        self.report.update(framework=label, canonical_framework_key=key, configuration=config,
                           expected_inventory=count, evidence_layer='actual API commands; local modeled authentication')
        self.cid = await self.onboard(label, key, config)
        workspace = await self.get('/frameworks/' + key, client_id=self.cid)
        self.assertEqual(len(workspace['assessments']), count)
        self.assertEqual(set(workspace['active_definition_ids']), definition_ids(key, config))
        for row in workspace['assessments']:
            self.assertEqual(row['status'], 'not_assessed')
            self.assertFalse(row.get('implementation'))
            self.assertNotEqual(row.get('verification'), 'verified')
        self.report['client_id'] = self.cid
        configured_plans = {p['key']: p for p in CATALOGS[key]['review_plans']
                            if p.get('default_enabled', True) and set(p['safeguards']) & definition_ids(key, config)}
        initial_reviews = await self.get('/reviews', client_id=self.cid)
        self.assertEqual({r['framework_plan_key'] for r in initial_reviews}, set(configured_plans))
        self.assertEqual(len(initial_reviews), len(configured_plans))
        for row in initial_reviews:
            plan = configured_plans[row['framework_plan_key']]
            self.assertEqual(row['due_date'], '2027-01-31')
            self.assertEqual(row['recurrence'], plan['default_cadence'])
            self.contracts[row['review_id']] = expected_dates('2027-01-31', plan['default_cadence'], plan.get('default_custom_recurrence_days'))
        # Documented starting identities only. No completed records/history are seeded.
        self.owner, self.validator = 'synthetic_owner', 'synthetic_validator'
        await server.db.users.insert_many([
            {'user_id': self.owner, 'name': 'Synthetic original operator', 'email': 'owner@example.test',
             'role': 'client_contributor', 'status': 'active', 'client_ids': [self.cid]},
            {'user_id': self.validator, 'name': 'Synthetic independent validator', 'email': 'validator@example.test',
             'role': 'platform_admin', 'status': 'active', 'client_ids': [self.cid]},
            {'user_id': 'synthetic_reader', 'name': 'Synthetic Reader', 'email': 'reader@example.test',
             'role': 'client_readonly', 'status': 'active', 'client_ids': [self.cid]}])
        self.probes = {}
        for cadence in ('monthly', 'quarterly', 'semiannual', 'annual', 'custom', 'none'):
            row = await self.post('/reviews', {'client_id': self.cid, 'title': 'SYNTHETIC recurrence probe ' + cadence,
                'review_type': 'governance', 'owner_id': self.owner, 'recurrence': cadence,
                'custom_recurrence_days': 7 if cadence == 'custom' else None,
                'due_date': '2027-01-08' if cadence == 'custom' else '2027-01-31'})
            self.probes[cadence] = row['review_id']
            self.assertEqual(row['recurrence'], cadence)
            self.assertEqual(row['due_date'], '2027-01-08' if cadence == 'custom' else '2027-01-31')
            self.contracts[row['review_id']] = expected_dates('2027-01-08' if cadence == 'custom' else '2027-01-31', cadence, 7 if cadence == 'custom' else None)
        selected = '1.1' if key == 'cis-ig1' else 'CC6.1' if key == 'soc-2' else 'A.8.30'
        self.assessment = next(r for r in workspace['assessments'] if r['definition_id'] == selected)
        self.ap = '/framework_assessments/' + self.assessment['framework_assessment_id']
        self.risk = await self.post('/risks', {'client_id': self.cid, 'title': 'SYNTHETIC supplier exposure',
            'owner_id': self.owner, 'likelihood_score': 3, 'impact_score': 4, 'treatment': 'mitigate',
            'next_review': '2027-06-30', 'review_cadence': 'annual'})
        self.vendor = await self.post('/vendors', {'client_id': self.cid, 'name': 'SYNTHETIC scoped supplier',
            'service': 'Synthetic support only', 'business_owner_id': self.owner, 'next_review': '2027-06-30',
            'review_frequency': 'annual', 'contract_renewal': '2028-03-31'})
        self.policy = (await self.get('/policies', client_id=self.cid))[0]
        self.pp = '/policies/' + self.policy['policy_id']
        if key == 'iso-27001':
            activation = await self.post('/iso-audit/activate', {'client_id': self.cid, 'start_date': '2027-01-01',
                'first_package': 'governance-risk', 'auditor_id': self.owner, 'scope': 'SYNTHETIC isolated service',
                'independence': 'Synthetic validator is separate from the operating owner'})
            self.assertEqual(len(activation['reviews']), 4)
            self.assertEqual({r['iso_audit']['package_key'] for r in activation['reviews']}, set(iso_audit.PACKAGES))
            for index, package in enumerate(iso_audit.PACKAGES):
                row = next(r for r in activation['reviews'] if r['iso_audit']['package_key'] == package)
                month = (index + 1) * 3
                first = date(2027, month, monthrange(2027, month)[1]).isoformat()
                self.assertEqual(row['due_date'], first)
                self.assertEqual(row['recurrence'], 'annual')
                self.contracts[row['review_id']] = expected_dates(first, 'annual')
        self.reviews = {r['review_id']: r for r in await self.get('/reviews', client_id=self.cid)}
        for source, identity in (('risk_id', self.risk['risk_id']), ('vendor_id', self.vendor['vendor_id'])):
            linked = [r for r in self.reviews.values() if r.get(source) == identity]
            self.assertEqual(len(linked), 1)
            self.assertEqual(linked[0]['due_date'], '2027-06-30')
            self.assertEqual(linked[0]['recurrence'], 'annual')
            self.contracts[linked[0]['review_id']] = expected_dates('2027-06-30', 'annual')
            self.expected_relationships.append(('reviews', linked[0]['review_id'], source, 'risks' if source == 'risk_id' else 'vendors', identity))
        self.assertEqual(set(self.reviews), set(self.contracts))
        for rid, row in list(self.reviews.items()):
            if row.get('owner_id') != self.owner:
                row = await self.edit('/reviews/' + rid, {'owner_id': self.owner,
                    'expected_occurrence_id': row['current_occurrence_id']})
                self.reviews[rid] = row
        # Capture the ordinary onboarding starting graph, after independently
        # checking inventories/configured plans; subsequent records come from commands.
        for kind, field in RECORD_KEYS.items():
            rows = await server.db[kind].find({'client_id': self.cid}, {'_id': 0}).to_list(None)
            self.expected_records[kind].update(r[field] for r in rows)
            if kind == 'policies':
                self.assertEqual({r['baseline_key'] for r in rows}, {p['key'] for p in BASELINE_CATALOG['policies']})
                self.assertEqual(len(rows), len(BASELINE_CATALOG['policies']))
        self.assertEqual(len(self.expected_records['framework_assessments']), count)
        self.assertEqual(self.expected_records['reviews'], set(self.contracts))
        self.report['starting_graph_proof'] = 'Observed initial record IDs; independently checked primary definitions, requested Review cohort and all baseline Policy keys. Other starting source populations are captured for drift, not claimed exhaustive provisioning proof.'
        self.report['starting_record_counts'] = {kind: len(identities) for kind, identities in self.expected_records.items()}
        self.report['requested_review_contracts'] = copy.deepcopy(self.contracts)
        self.native_history = []
        self.policy_history = []
        self.event(1, 'normal onboarding and repeated activation', definitions=count, reviews=len(self.reviews))

    async def yearly_assessment(self, year):
        narrative = 'OVERVIEW\nSYNTHETIC reported practice ' + str(year) + '\n\nIMPLEMENTATION BREAKDOWN\n- Retained manual wording.\n\nITEMS TO ADDRESS\n- Synthetic follow-up only.'
        changes = {'implementation': narrative, 'status': 'in_progress' if year in (2027, 2028, 2032) else 'addressed',
                   'owner_id': self.owner, 'verification': 'needs_validation'}
        if self.key == 'iso-27001':
            changes.update(soa_applicability='included', soa_justification='Synthetic supplier process is in scope')
        saved = await self.edit(self.ap, changes)
        self.assertEqual(saved['implementation'], narrative)
        self.assertNotEqual(saved['verification'], 'verified')
        self.assertEqual(saved['assessment_history'][:-1], self.native_history)
        self.native_history = copy.deepcopy(saved['assessment_history'])
        self.assertEqual((await self.get(self.ap))['implementation'], narrative)
        subject = await self.post(self.pp + '/approval-subject', {'version': str(year - 2026),
            'external_reference': 'https://documents.example.test/synthetic-policy', 'external_version': str(year)})
        self.sign_in(self.validator)
        submitted = await self.post(self.pp + '/submit-review')
        approved = await self.post(self.pp + '/approve', {'approval_request_id': submitted['approval_request_id'],
                                                        'comment': 'Synthetic independent version review'})
        history = [h for h in approved['approval_history'] if h['action'] == 'approved']
        self.assertEqual(history[:-1], self.policy_history)
        self.policy_history = copy.deepcopy(history)
        self.assertEqual(history[-1]['by'], self.validator)
        self.sign_in('admin')
        self.event(year - 2026, 'native reassessment and separate Policy version approval',
                   native_history=len(self.native_history), policy_versions=len(history), approval_subject=subject['version'])

    async def finding_cycle(self, year):
        finding = await self.post(self.ap + '/findings', {'request_id': 'synthetic-year-' + str(year),
            'title': 'SYNTHETIC operating gap ' + str(year), 'severity': 'high',
            'remediation_title': 'Synthetic remediation', 'owner_id': self.owner, 'due_date': str(year) + '-03-31'})
        first = await server.db.tasks.find_one({'finding_id': finding['finding_id']}, {'_id': 0})
        self.assertEqual(await server.db.tasks.count_documents({'finding_id': finding['finding_id']}), 1)
        self.expected_records['tasks'].add(first['task_id'])
        self.expected_relationships.extend([
            ('findings', finding['finding_id'], 'framework_assessment_id', 'framework_assessments', self.assessment['framework_assessment_id']),
            ('tasks', first['task_id'], 'finding_id', 'findings', finding['finding_id'])])
        second = await self.post('/tasks', {'client_id': self.cid, 'title': 'SYNTHETIC second remediation workstream',
            'source_type': 'finding', 'source_id': finding['finding_id'], 'assignee_id': self.owner,
            'due_date': str(year) + '-04-30'})
        self.expected_relationships.append(('tasks', second['task_id'], 'finding_id', 'findings', finding['finding_id']))
        await self.edit('/tasks/' + first['task_id'], {'status': 'done'})
        self.assertEqual((await self.get('/findings/' + finding['finding_id']))['status'], 'in_remediation')
        self.sign_in(self.validator)
        await self.post('/findings/' + finding['finding_id'] + '/validate', {'rationale': 'Synthetic premature validation'}, status=409)
        self.sign_in('admin')
        if year == 2028:
            self.clock('2028-05-15')
            overdue = await self.get('/dashboard', client_id=self.cid)
            self.assertEqual(overdue['kpis']['overdue_actions'], 1)
            self.event(2, 'partial remediation remained open beyond its due date before validation')
        await self.upload('finding', finding['finding_id'], 'SYNTHETIC remediation evidence ' + str(year))
        await self.edit('/tasks/' + second['task_id'], {'status': 'done'})
        pending = await self.get('/findings/' + finding['finding_id'])
        self.assertEqual(pending['status'], 'remediated')
        self.sign_in(self.validator)
        closed = await self.post('/findings/' + finding['finding_id'] + '/validate', {'rationale': 'SYNTHETIC independent resampling'})
        self.assertEqual(closed['status'], 'closed')
        self.sign_in('admin')
        if year == 2027:
            self.original_finding, self.original_action = copy.deepcopy(closed), copy.deepcopy(first)
        self.event(year - 2026, 'multiple Actions, partial remediation, independent validation', finding_id=closed['finding_id'])

    async def year_theme(self, year):
        number = year - 2026
        if year == 2029:
            original = await self.get('/reviews/' + self.probes['monthly'])
            self.assertEqual(original['occurrences'][0]['owner_id'], self.owner)
            await self.edit('/users/' + self.owner, {'status': 'disabled', 'role': 'client_readonly'})
            self.owner = self.validator
            for rid, row in list(self.reviews.items()):
                if row['status'] not in ('completed', 'cancelled'):
                    self.reviews[rid] = await self.edit('/reviews/' + rid, {'owner_id': self.owner,
                        'expected_occurrence_id': row['current_occurrence_id']})
            await self.edit('/risks/' + self.risk['risk_id'], {'owner_id': self.owner})
            await self.edit('/vendors/' + self.vendor['vendor_id'], {'business_owner_id': self.owner})
            self.event(number, 'departed operator disabled; active work reassigned; old owner attribution retained')
        elif year == 2030:
            old = next(iter(self.files))
            before = await self.get('/evidence/' + old + '/download')
            new_file = await self.upload('framework_assessment', self.assessment['framework_assessment_id'], 'SYNTHETIC replacement source ' + str(year))
            native_before = await self.get(self.ap)
            await self.request('DELETE', self.ap + '/links', json={'kind': 'evidence', 'id': new_file['evidence_id']})
            native_after = await self.get(self.ap)
            self.assertIn(new_file['evidence_id'], native_after['unlinked_evidence_ids'])
            for field in ('implementation', 'status', 'verification', 'assessment_history'):
                self.assertEqual(native_after.get(field), native_before.get(field))
            self.assertEqual(hashlib.sha256(base64.b64decode((await self.get('/evidence/' + new_file['evidence_id'] + '/download'))['content_base64'])).hexdigest(), self.files[new_file['evidence_id']])
            after = await self.get('/evidence/' + old + '/download')
            self.assertEqual(before, after)
            await self.edit('/vendors/' + self.vendor['vendor_id'], {'service': 'SYNTHETIC changed service; original history retained', 'status': 'active'})
            self.event(number, 'new evidence record/unlink and supplier change; old/new bytes and native assessment retained')
        elif year == 2031:
            await self.scope_derivative()
            self.event(number, 'supported scope change and repeated program addition on isolated derivative')
        elif year == 2032:
            accepted = await self.post('/risks/' + self.risk['risk_id'] + '/accept',
                {'rationale': 'SYNTHETIC bounded residual-risk decision', 'expiry_date': '2032-06-30'})
            self.assertEqual(accepted['status'], 'accepted')
            self.assertGreater(accepted['risk_score'], 0)
            exception = await self.post('/exceptions', {'client_id': self.cid, 'title': 'SYNTHETIC time-limited exception',
                'risk_id': self.risk['risk_id'], 'expires_at': '2032-06-30', 'owner_id': self.owner})
            await self.post('/exceptions/' + exception['exception_id'] + '/approve', {'rationale': 'SYNTHETIC explicit exception decision'})
            self.exception_id = exception['exception_id']
            finding_path = '/findings/' + self.original_finding['finding_id']
            previous = await self.get(finding_path)
            prior_tasks = await server.db.tasks.find({'finding_id': previous['finding_id']}, {'_id': 0}).to_list(None)
            command = {'request_id': 'synthetic-deterioration-year6', 'expected_updated_at': previous['updated_at']}
            reopened = await self.post(finding_path + '/reopen', command)
            self.assertEqual(reopened['decision_history'][:len(self.original_finding['decision_history'])], self.original_finding['decision_history'])
            self.assertEqual(reopened['decision_history'][-1]['action'], 'reopened')
            action = await self.get('/tasks/' + reopened['primary_task_id'])
            self.expected_records['tasks'].add(action['task_id'])
            self.expected_relationships.append(('tasks', action['task_id'], 'finding_id', 'findings', reopened['finding_id']))
            self.assertNotIn(action['task_id'], {task['task_id'] for task in prior_tasks})
            self.assertIsNone(action['assignee_id'])
            self.assertEqual((await self.post(finding_path + '/reopen', command))['primary_task_id'], action['task_id'])
            for task in prior_tasks:
                self.assertEqual(await server.db.tasks.find_one({'task_id': task['task_id']}, {'_id': 0}), task)
            await self.edit('/tasks/' + action['task_id'], {'status': 'done'})
            self.sign_in(self.validator)
            closed = await self.post('/findings/' + reopened['finding_id'] + '/validate', {'rationale': 'SYNTHETIC separate second validation'})
            self.assertEqual(closed['decision_history'][:len(self.original_finding['decision_history'])], self.original_finding['decision_history'])
            self.sign_in('admin')
            self.event(number, 'accepted risk retains exposure; future exception decision; reopened deterioration independently revalidated')
        elif year == 2033:
            before_native = await self.get(self.ap)
            await self.edit('/clients/' + self.cid, {'status': 'archived'})
            self.sign_in(self.validator)
            await self.edit(self.ap, {'notes': 'Must not persist while archived'}, status=403)
            self.sign_in('admin')
            preserved = await self.get(self.ap)
            for field in ('implementation', 'status', 'verification', 'owner_id', 'notes', 'last_saved', 'last_assessed', 'assessment_history', 'related_links'):
                self.assertEqual(preserved.get(field), before_native.get(field))
            await self.edit('/clients/' + self.cid, {'status': 'active'})
            linked_vendor = next(r for r in self.reviews.values() if r.get('vendor_id') == self.vendor['vendor_id'])
            old_vendor_history = copy.deepcopy(linked_vendor['occurrences'])
            for stage in ('offboarding', 'inactive'):
                await self.edit('/vendors/' + self.vendor['vendor_id'], {'status': stage})
            self.assertEqual((await self.get('/reviews/' + linked_vendor['review_id']))['status'], 'cancelled')
            inactive_vendor = await self.get('/vendors/' + self.vendor['vendor_id'])
            await self.edit('/vendors/' + self.vendor['vendor_id'], {'status': 'active'}, status=409)
            self.assertEqual(await self.get('/vendors/' + self.vendor['vendor_id']), inactive_vendor)
            retained_vendor_review = await self.get('/reviews/' + linked_vendor['review_id'])
            self.assertEqual(retained_vendor_review['occurrences'], old_vendor_history)
            self.reviews[linked_vendor['review_id']] = retained_vendor_review
            self.contracts[linked_vendor['review_id']] = [due for due in self.contracts[linked_vendor['review_id']] if due < '2033-01-01']
            self.event(number, 'supported Vendor offboarding/inactive retention; unsupported reactivation rejected')
            row = await self.post('/reviews', {'client_id': self.cid, 'title': 'SYNTHETIC canceled one-time work',
                'review_type': 'governance', 'recurrence': 'none', 'due_date': '2033-01-31', 'owner_id': self.owner})
            cancelled = await self.edit('/reviews/' + row['review_id'], {'status': 'cancelled', 'expected_occurrence_id': row['current_occurrence_id']})
            await self.post('/reviews/' + row['review_id'] + '/start', {'occurrence_id': row['current_occurrence_id']}, status=409)
            await self.edit('/reviews/' + row['review_id'], {'status': 'upcoming', 'expected_occurrence_id': cancelled['current_occurrence_id']}, status=409)
            preserved = await self.get('/reviews/' + row['review_id'])
            for field in ('status', 'due_date', 'updated_at', 'current_occurrence_id', 'occurrences'):
                self.assertEqual(preserved.get(field), cancelled.get(field))
            self.reviews[row['review_id']] = cancelled
            self.contracts[row['review_id']] = []
            self.assertFalse((await self.get('/reviews/' + row['review_id'])).get('occurrences'))
            self.event(number, 'archive read-only enforcement and restoration; canceled Review retained; unsupported reopen rejected')
        elif year == 2034:
            row = self.reviews[self.probes['annual']]
            payload = {'occurrence_id': row['current_occurrence_id'], 'request_id': 'synthetic-interrupted-year8',
                'title': 'SYNTHETIC interrupted ticket', 'remediation_title': 'Synthetic retry work', 'owner_id': self.owner}
            with patch.object(server, 'create_notification', AsyncMock(side_effect=RuntimeError('SYNTHETIC downstream outage'))):
                await self.post('/reviews/' + row['review_id'] + '/create-finding', payload, status=503)
            recovered = await self.post('/reviews/' + row['review_id'] + '/create-finding', payload)
            replay = await self.post('/reviews/' + row['review_id'] + '/create-finding', payload)
            self.assertEqual(replay['finding_id'], recovered['finding_id'])
            self.assertEqual(await server.db.tasks.count_documents({'finding_id': recovered['finding_id']}), 1)
            task = await server.db.tasks.find_one({'finding_id': recovered['finding_id']}, {'_id': 0})
            self.expected_records['tasks'].add(task['task_id'])
            self.unresolved_ticket = (recovered['finding_id'], task['task_id'])
            self.expected_relationships.extend([
                ('tasks', task['task_id'], 'finding_id', 'findings', recovered['finding_id']),
                ('findings', recovered['finding_id'], 'review_id', 'reviews', row['review_id']),
                ('findings', recovered['finding_id'], 'occurrence_id', 'occurrence', row['current_occurrence_id'])])
            self.event(number, 'interrupted sourced-ticket command and duplicate recovery; no external notification')
        elif year == 2035:
            row = self.reviews[self.probes['monthly']]
            original_token = row.get('updated_at')
            changed = await self.edit('/reviews/' + row['review_id'], {'notes': 'SYNTHETIC newer editor',
                'expected_occurrence_id': row['current_occurrence_id']})
            await self.edit('/reviews/' + row['review_id'], {'notes': 'SYNTHETIC stale overwrite',
                'expected_updated_at': original_token, 'expected_occurrence_id': row['current_occurrence_id']}, status=409)
            protected = await self.get('/reviews/' + row['review_id'])
            for field in ('notes', 'updated_at', 'due_date', 'current_occurrence_id', 'occurrences'):
                self.assertEqual(protected.get(field), changed.get(field))
            self.reviews[row['review_id']] = changed
            self.event(number, 'stale editor rejected using original explicit token')
        elif year == 2036:
            await self.get('/audit-logs', client_id=self.cid, page=1, page_size=100)
            exported = await self.client.get('/api/audit-logs/export.csv', params={'client_id': self.cid})
            self.assertEqual(exported.status_code, 200, exported.text[:200])
            self.assertIn(self.cid, exported.text)
            rows = list(csv.DictReader(io.StringIO(exported.text)))
            self.assertTrue(any(r['User'] == 'Synthetic original operator' and r['Timestamp'].startswith('2027') for r in rows))
            self.assertTrue(any(r['Entity ID'] == self.probes['monthly'] and r['Action'] == 'Review completed' and r['Timestamp'].startswith('2027') for r in rows))
            self.report['export_reconstruction'] = 'Executed first-year original actor and monthly Review completion present in year10 CSV'
            if self.key == 'cis-ig1':
                exported_framework = await self.client.get('/api/frameworks/cis-ig1/export', params={'client_id': self.cid})
                self.assertEqual(exported_framework.status_code, 200, exported_framework.text[:200])
            self.event(number, 'existing audit export and framework-supported reporting; leadership handoff reconstruction')

    async def scope_derivative(self):
        starting_config = {'implementation_group': 1} if self.key == 'cis-ig1' else self.config
        derivative = await self.onboard(self.report['framework'] + ' scope derivative', self.key, starting_config)
        before = await self.get('/frameworks/' + self.key, client_id=derivative)
        row = before['assessments'][0]
        saved = await self.edit('/framework_assessments/' + row['framework_assessment_id'],
            {'implementation': 'SYNTHETIC inherited manual marker', 'status': 'in_progress'})
        if self.key == 'cis-ig1':
            command = {'client_id': derivative, 'implementation_group': 3,
                'expected_updated_at': before['configuration'].get('expected_updated_at')}
            key = uuid4().hex
            await self.edit('/frameworks/cis-ig1/configuration', command, headers={'Idempotency-Key': key})
            await self.edit('/frameworks/cis-ig1/configuration', command, headers={'Idempotency-Key': key})
            self.assertEqual(len((await self.get('/frameworks/cis-ig1', client_id=derivative))['active_definition_ids']), 153)
        elif self.key == 'soc-2':
            await self.edit('/frameworks/soc-2/configuration', {'client_id': derivative,
                'categories': ['security', 'availability', 'confidentiality', 'processing_integrity', 'privacy']})
            self.assertEqual(len((await self.get('/frameworks/soc-2', client_id=derivative))['active_definition_ids']), 61)
        else:
            await self.edit('/onboarding/programs/cis-ig1', {'client_id': derivative, 'applicability': 'applies'})
            await self.edit('/onboarding/programs/cis-ig1', {'client_id': derivative, 'applicability': 'applies'})
            self.assertEqual(len((await self.get('/frameworks/cis-ig1', client_id=derivative))['active_definition_ids']), 56)
        retained = await self.get('/framework_assessments/' + row['framework_assessment_id'])
        for field in ('implementation', 'status', 'assessment_history', 'last_assessed'):
            self.assertEqual(retained.get(field), saved.get(field))
        await self.edit('/clients/' + derivative, {'status': 'archived'})

    async def complete(self, row, due, year):
        rid, oid = row['review_id'], row['current_occurrence_id']
        self.sign_in(self.owner)
        started = await self.post('/reviews/' + rid + '/start', {'occurrence_id': oid})
        evidence = await self.upload('review', rid, 'SYNTHETIC occurrence ' + due, occurrence_id=oid)
        if started.get('iso_audit'):
            for item in iso_audit.PACKAGES[started['iso_audit']['package_key']]['items']:
                started = await self.edit('/reviews/' + rid + '/iso-audit/' + item['key'],
                    {'status': 'reviewed', 'result': 'conforming', 'notes': 'SYNTHETIC command-path sampling only',
                     'na_rationale': '', 'evidence_ids': [evidence['evidence_id']], 'finding_ids': [],
                     'occurrence_id': oid, 'expected_updated_at': started.get('updated_at')})
            started = await self.edit('/reviews/' + rid + '/iso-audit', {'report_evidence_id': evidence['evidence_id'],
                'occurrence_id': oid, 'expected_updated_at': started.get('updated_at')})
        command = {'occurrence_id': oid}
        if year == 2035 and rid == self.probes['monthly'] and due.endswith('01-31'):
            responses = await asyncio.gather(*[self.client.post('/api/reviews/' + rid + '/complete', json=command) for _ in range(2)])
            self.assertTrue(all(r.status_code in (200, 409) for r in responses))
            self.assertTrue(any(r.status_code == 200 for r in responses))
            result = next(r.json() for r in responses if r.status_code == 200)
            self.event(9, 'simultaneous completion produces one immutable occurrence', response_statuses=[r.status_code for r in responses])
        else:
            result = await self.post('/reviews/' + rid + '/complete', command)
        occurrence = result['occurrence']
        self.assertEqual(occurrence['due_date'][:10], due)
        self.assertNotIn(oid, self.snapshots)
        self.assertEqual([e['evidence_id'] for e in occurrence['evidence']], [evidence['evidence_id']])
        self.snapshots[oid] = copy.deepcopy(occurrence)
        if due.endswith('01-31'):
            replay = await self.post('/reviews/' + rid + '/complete', command)
            self.assertEqual(replay['occurrence'], occurrence)
            self.assertEqual(replay['review']['occurrences'], result['review']['occurrences'])
        self.sign_in('admin')
        return result['review']

    async def checkpoint(self, year):
        before = perf_counter()
        live = await self.get('/reviews', client_id=self.cid)
        self.assertEqual({r['review_id'] for r in live}, set(self.contracts))
        self.assertEqual(len(live), len(self.contracts))
        all_occurrences = [o for r in live for o in r.get('occurrences', [])]
        expected_count = sum(sum(d <= str(year) + '-12-31' for d in dates) for dates in self.contracts.values())
        self.assertEqual(len(all_occurrences), expected_count)
        self.assertEqual(len(self.snapshots), expected_count)
        self.assertEqual({o['occurrence_id'] for o in all_occurrences}, set(self.snapshots))
        for row in live:
            expected = [d for d in self.contracts[row['review_id']] if d <= str(year) + '-12-31']
            self.assertEqual([o['due_date'][:10] for o in row.get('occurrences', [])], expected)
            self.assertEqual(len({o['occurrence_id'] for o in row.get('occurrences', [])}), len(expected))
            for snapshot in row.get('occurrences', []):
                self.assertEqual(snapshot, self.snapshots[snapshot['occurrence_id']])
            self.assertEqual(await server.db.reviews.count_documents({'review_id': row['review_id']}), 1)
        actual_inventory = await self.get('/frameworks/' + self.key, client_id=self.cid)
        self.assertEqual(len(actual_inventory['active_definition_ids']), self.report['expected_inventory'])
        self.assertEqual((await self.get(self.ap))['assessment_history'], self.native_history)
        registers = {kind: await self.get('/' + kind, client_id=self.cid) for kind in KEYS if kind != 'reviews'}
        if year >= 2034:
            fid, tid = self.unresolved_ticket
            self.assertEqual(next(f for f in registers['findings'] if f['finding_id'] == fid)['status'], 'in_remediation')
            self.assertEqual(next(t for t in registers['tasks'] if t['task_id'] == tid)['status'], 'open')
        dashboard = await self.get('/dashboard', client_id=self.cid)
        today = str(year) + '-12-31'
        self.assertEqual(dashboard['kpis']['overdue_reviews'], sum(r['status'] not in ('completed', 'cancelled') and r['due_date'][:10] < today for r in live))
        self.assertEqual(dashboard['kpis']['overdue_actions'], sum(t['status'] not in ('done', 'cancelled') and bool(t.get('due_date')) and t['due_date'][:10] < today for t in registers['tasks']))
        self.assertEqual(dashboard['kpis']['open_findings'], sum(f['status'] not in ('closed', 'accepted', 'cancelled') for f in registers['findings']))
        window = lambda row: bool(row.get('due_date')) and str(year) + '-12-01' <= row['due_date'][:10] <= today
        expected_keys = {'review:' + r['review_id'] + ':' + o['occurrence_id'] for r in live for o in r.get('occurrences', []) if window(o)}
        expected_keys.update('review:' + r['review_id'] + ':' + r['current_occurrence_id'] for r in live if window(r))
        calendar = await self.get('/calendar', client_id=self.cid, start=str(year) + '-12-01', end=today, scope='all')
        actual_keys = [r['key'] for entries in calendar['reviews'].values() for r in entries]
        self.assertEqual(set(actual_keys), expected_keys)
        self.assertEqual(len(actual_keys), len(expected_keys))
        integrity = await record_integrity.inspect_client(server.db, self.cid)
        self.assertEqual(integrity['issues'], [])
        raw = {}
        for kind, field in RECORD_KEYS.items():
            rows = await server.db[kind].find({'client_id': self.cid}, {'_id': 0}).to_list(None)
            self.assertEqual({r[field] for r in rows}, self.expected_records[kind], (kind, 'missing/unexpected records'))
            self.assertEqual(len(rows), len(self.expected_records[kind]), (kind, 'duplicate IDs'))
            raw[kind] = {r[field]: r for r in rows}
        for kind, identity, field, target_kind, target_id in self.expected_relationships:
            self.assertEqual(raw[kind][identity][field], target_id)
            if target_kind == 'occurrence':
                self.assertIn(target_id, self.snapshots)
            else:
                self.assertIn(target_id, raw[target_kind])
                self.assertEqual(raw[target_kind][target_id]['client_id'], self.cid)
        # Independent reference checks cover persisted direct IDs and link arrays,
        # not the application's diagnostic parser.
        relationship_targets = {'review_id': 'reviews', 'finding_id': 'findings', 'risk_id': 'risks',
                                'vendor_id': 'vendors', 'policy_id': 'policies',
                                'framework_assessment_id': 'framework_assessments'}
        independent_references = 0
        aliases = {'review': 'reviews', 'finding': 'findings', 'risk': 'risks', 'vendor': 'vendors',
                   'policy': 'policies', 'task': 'tasks', 'framework_assessment': 'framework_assessments',
                   'evidence': 'evidence', **{kind: kind for kind in RECORD_KEYS}}
        for kind, records in raw.items():
            for identity, row in records.items():
                for field, target in relationship_targets.items():
                    if field != RECORD_KEYS[kind] and row.get(field):
                        self.assertIn(row[field], raw[target], (kind, identity, field))
                        independent_references += 1
                if row.get('occurrence_id'):
                    self.assertIn(row['occurrence_id'], self.snapshots)
                    independent_references += 1
                if row.get('linked_type'):
                    target = aliases[row['linked_type']]
                    self.assertIn(row['linked_id'], raw[target])
                    independent_references += 1
                if row.get('source_type') in aliases and row.get('source_id'):
                    self.assertIn(row['source_id'], raw[aliases[row['source_type']]])
                    independent_references += 1
                for link in row.get('related_links', []):
                    self.assertIn(link['id'], raw[aliases[link['kind']]])
                    independent_references += 1
        evidence_count = await server.db.evidence.count_documents({'client_id': self.cid})
        library = await self.get('/evidence/catalog', client_id=self.cid, page=1, page_size=100)
        self.assertEqual(library['total'], evidence_count)
        self.assertEqual(len(library['items']), min(100, evidence_count))
        policy = await self.get(self.pp + '/approval-context')
        self.assertEqual([h for h in policy['history'] if h['action'] == 'approved'], self.policy_history)
        self.report['timings'].append({'year': year, 'operation': 'annual reconciliation (mock timings are not capacity proof)',
            'elapsed_seconds': round(perf_counter() - before, 4)})
        self.report['years'].append({'year': year, 'definitions': len(actual_inventory['active_definition_ids']),
            'expected_occurrences': expected_count,
            'actual_occurrences': len(self.snapshots), 'reviews': len(live), 'evidence': evidence_count,
            'native_history': len(self.native_history), 'policy_approvals': len(self.policy_history),
            'calendar_expected_keys': len(expected_keys), 'calendar_actual_keys': len(actual_keys),
            'duplicate_review_ids': len(live) - len({r['review_id'] for r in live}),
            'history_mismatches': sum(o != self.snapshots[o['occurrence_id']] for o in all_occurrences),
            'independent_relationship_checks': len(self.expected_relationships),
            'independent_persisted_reference_checks': independent_references,
            'expected_record_counts': {k: len(v) for k, v in self.expected_records.items()},
            'record_integrity_issues': len(integrity['issues']),
            'dashboard_kpis': dashboard['kpis'], 'requests': self.request_total})
        print(self.report['framework'] + ' year ' + str(year) + ' reconciled: ' + str(len(self.snapshots)) + ' occurrences', flush=True)

    async def run_program(self, label):
        await self.setup_program(label)
        for year in range(2027, 2037):
            self.clock(str(year) + '-01-01')
            self.sign_in('admin')
            await self.year_theme(year)
            await self.yearly_assessment(year)
            await self.finding_cycle(year)
            allowed_executions = sum(sum(str(year) + '-01-01' <= due <= str(year) + '-12-31' for due in dates) for dates in self.contracts.values())
            executions = 0
            while True:
                eligible = [r for r in self.reviews.values() if r['status'] not in ('completed', 'cancelled') and r['due_date'][:10] <= str(year) + '-12-31']
                if not eligible:
                    break
                row = min(eligible, key=lambda r: (r['due_date'], r['review_id']))
                due = row['due_date'][:10]
                executions += 1
                self.assertLessEqual(executions, allowed_executions)
                complete_on = max(lifecycle.clocks.Clock.now.date().isoformat(), due)
                if year == 2028 and due <= '2028-03-31':
                    complete_on = max(complete_on, '2028-04-15')
                if year == 2034 and due <= '2034-06-30':
                    complete_on = max(complete_on, '2034-07-15')
                self.clock(complete_on)
                result = await self.complete(row, due, year)
                self.assertTrue(result['status'] == 'completed' or result['due_date'][:10] > due, (row['review_id'], 'schedule must progress'))
                self.reviews[row['review_id']] = result
            self.assertEqual(executions, allowed_executions)
            self.clock(str(year) + '-12-31')
            if year == 2028:
                self.event(2, 'overdue and missed work completed individually without cadence drift', completion_floor='2028-04-15')
            if year == 2032:
                risk = await self.get('/risks/' + self.risk['risk_id'])
                self.assertEqual(risk['acceptance_expires_at'][:10], '2032-06-30')
                self.assertGreater(risk['risk_score'], 0)
                overdue = await self.get('/dashboard', client_id=self.cid, detail='pastDue', limit=100)
                expiry = next(row for row in overdue['items'] if row['kind'] == 'exceptions' and row['id'] == self.exception_id)
                self.assertEqual(expiry['due_date'][:10], '2032-06-30')
                self.event(6, 'after-expiry obligation appears in overdue dashboard; risk exposure is not erased')
            await self.checkpoint(year)
        for cadence, expected in [('monthly', 120), ('quarterly', 40), ('semiannual', 20), ('annual', 10), ('custom', 521), ('none', 1)]:
            stored = await self.get('/reviews/' + self.probes[cadence] + '/history')
            self.assertEqual(len(stored), expected)
            self.assertEqual({o['due_date'][:10] for o in stored}, set(self.contracts[self.probes[cadence]]))
        for eid, digest in self.files.items():
            payload = await self.get('/evidence/' + eid + '/download')
            self.assertEqual(hashlib.sha256(base64.b64decode(payload['content_base64'])).hexdigest(), digest)
        catalog_ids, page = set(), 1
        while True:
            catalog = await self.get('/evidence/catalog', client_id=self.cid, page=page, page_size=100)
            ids = [row['evidence_id'] for row in catalog['items']]
            self.assertFalse(catalog_ids.intersection(ids))
            catalog_ids.update(ids)
            if len(catalog_ids) == catalog['total']:
                break
            self.assertTrue(ids)
            page += 1
            self.assertLess(page, 30)
        self.assertEqual(catalog_ids, set(self.files))
        if len(self.files) > 1000:
            await self.request('GET', '/evidence', status=413, params={'client_id': self.cid})
            self.report['legacy_evidence_limit'] = 'Executed 413 fail-closed; paged catalog retained every file'
        self.report.update(completed=True, retained_file_hashes=len(self.files), retained_occurrence_snapshots=len(self.snapshots))

    async def test_cis_ig1_ten_years(self):
        await self.run_program('cis-ig1')

    async def test_cis_ig2_ten_years(self):
        await self.run_program('cis-ig2')

    async def test_cis_ig3_ten_years(self):
        await self.run_program('cis-ig3')

    async def test_iso_ten_years(self):
        await self.run_program('iso-27001')

    async def test_soc_ten_years(self):
        await self.run_program('soc-2')

    async def test_calendar_date_only_boundaries(self):
        self.sign_in('admin')
        for value in ('2027-03-14', '2027-11-07', '2028-02-29', '2036-12-31'):
            self.clock(value)
            review = await self.post('/reviews', {'client_id': 'a', 'title': 'SYNTHETIC date-only boundary',
                'review_type': 'governance', 'due_date': value, 'recurrence': 'none'})
            calendar = await self.get('/calendar', client_id='a', start=value, end=value, scope='active')
            entry = next(row for row in calendar['reviews'][value] if row['id'] == review['review_id'])
            self.assertEqual(entry['due_date_iso'], value)
            completed = await self.post('/reviews/' + review['review_id'] + '/complete', {'occurrence_id': review['current_occurrence_id']})
            self.assertEqual(completed['occurrence']['due_date'], value)
        self.report.update(completed=True, evidence_layer='Actual Calendar/Review API date-only checks; no browser-zone claim')

    def test_oracle_counts_and_new_york_date_only_boundaries(self):
        self.assertEqual([len(expected_dates('2027-01-31', cadence)) for cadence in MONTH_STEPS], [120, 40, 20, 10])
        self.assertEqual(len(expected_dates('2027-01-08', 'custom', 7)), 521)
        self.assertEqual(expected_dates('2027-01-31', 'none'), ['2027-01-31'])
        leap = expected_dates('2028-02-29', 'annual')
        self.assertIn('2032-02-29', leap)
        self.assertIn('2036-02-29', leap)
        self.assertEqual(expected_dates('2027-01-30', 'monthly')[:3], ['2027-01-30', '2027-02-28', '2027-03-30'])
        instants = ['2027-03-14T06:59:00Z', '2027-03-14T07:00:00Z', '2027-11-07T05:59:00Z', '2027-11-07T06:00:00Z']
        try:
            ny = ZoneInfo('America/New_York')
            offsets = [int(datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(ny).utcoffset().total_seconds() / 60) for value in instants]
            self.report['timezone_provider'] = 'IANA America/New_York'
        except ZoneInfoNotFoundError:
            if sys.platform != 'win32':
                raise
            # Windows' installed timezone provider avoids installing a test dependency.
            command = "$zone = [TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time'); @('" + "','".join(instants) + "') | ForEach-Object { $instant = [DateTimeOffset]::Parse($_); [int]$zone.GetUtcOffset($instant).TotalMinutes } | ConvertTo-Json -Compress"
            offsets = json.loads(subprocess.check_output(['powershell.exe', '-NoProfile', '-Command', command], text=True))
            self.report['timezone_provider'] = 'Windows TimeZoneInfo Eastern Standard Time'
        self.assertEqual(offsets, [-300, -240, -240, -300])
        for value in ('2027-03-14', '2027-11-07', '2028-02-29', '2036-12-31'):
            self.assertEqual(date.fromisoformat(value).isoformat(), value)


if __name__ == '__main__':
    unittest.main(verbosity=2, failfast=True)
