"""2027–2032 synthetic CIS operation via supported routes; IG3 test gate only."""
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import unittest
import uuid
from unittest.mock import patch

import test_framework_three_year as lifecycle
import test_framework_governance as framework
import framework_governance
from framework_catalog import CIS, active_definitions

server = framework.server


class CisSixYearTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = lifecycle.FrameworkThreeYearTests.asyncSetUp
    sign_in = lifecycle.FrameworkThreeYearTests.sign_in
    clock = lifecycle.FrameworkThreeYearTests.clock
    call = lifecycle.FrameworkThreeYearTests.call
    get = lifecycle.FrameworkThreeYearTests.get
    post = lifecycle.FrameworkThreeYearTests.post
    edit = lifecycle.FrameworkThreeYearTests.edit
    body = framework.FrameworkTests.body

    async def workspace(self, cid):
        return await self.get('/frameworks/cis-ig1', client_id=cid)

    async def test_fresh_released_groups_are_unassessed_and_optional(self):
        for group, count, review_count in [(1, 56, 12), (2, 130, 15)]:
            cid = (await self.post('/clients', {'name': f'Synthetic fresh IG{group}'}))['client_id']
            body = self.body(cid=cid)
            body['state']['framework_settings'] = {'cis-ig1': {'implementation_group': group}}
            await self.post('/onboarding/baseline', body)
            ws = await self.workspace(cid)
            self.assertEqual({r['definition_id'] for r in ws['assessments']}, {r['id'] for r in active_definitions('cis-ig1', {'implementation_group': group})})
            self.assertEqual(len(ws['assessments']), count)
            for row in ws['assessments']:
                self.assertEqual(row['status'], 'not_assessed')
                self.assertNotEqual(row.get('verification'), 'verified')
                self.assertFalse(row.get('implementation'))
                self.assertFalse(row.get('last_assessed'))
                self.assertFalse(row.get('owner_id'))
            reviews = await self.get('/reviews', client_id=cid)
            self.assertEqual(len(reviews), review_count)
            self.assertTrue(all(not r.get('due_date') and not r.get('owner_id') for r in reviews))
            self.assertEqual({i for r in reviews for i in r['framework_safeguards']}, set(ws['active_definition_ids']))

    async def test_six_year_progression_preserves_supported_work(self):
        override = patch.dict(CIS, {'available_implementation_groups': [1, 2, 3]})
        override.start()
        self.addCleanup(override.stop)
        self.clock('2027-01-01')
        # Give the isolation assertion real foreign-framework records to protect.
        await self.post('/onboarding/baseline', self.body(cid='b', programs=('hipaa',)))
        cid = (await self.post('/clients', {'name': 'Synthetic six-year CIS progression — disposable'}))['client_id']
        body = self.body(cid=cid)
        await self.post('/onboarding/baseline', body)
        foreign = copy.deepcopy(await server.db.framework_assessments.find({'client_id': {'$ne': cid}}).to_list(None))
        self.assertTrue(foreign)
        timeline, upgrades, snapshots, gaps, evidence_ids = [], [], {}, [], []
        histories, evidence_hashes = {}, {}
        probe = None

        async def verify_saved_payloads():
            for eid, expected in evidence_hashes.items():
                payload = await self.get('/evidence/' + eid + '/download')
                self.assertEqual(hashlib.sha256(base64.b64decode(payload['content_base64'])).hexdigest(), expected, eid)

        for group, start_year, count, additions in [(1, 2027, 56, 56), (2, 2029, 130, 74), (3, 2031, 153, 23)]:
            self.clock(f'{start_year}-01-01')
            if group > 1:
                before = await self.workspace(cid)
                reviews_before = await self.get('/reviews', client_id=cid)
                findings_before = await self.get('/findings', client_id=cid)
                tasks_before = await self.get('/tasks', client_id=cid)
                evidence_before = await self.get('/evidence', client_id=cid)
                command = {'client_id': cid, 'implementation_group': group, 'expected_updated_at': before['configuration'].get('expected_updated_at')}
                key = uuid.uuid4().hex
                original = framework_governance.reconcile
                async def interrupt(*args, **kwargs):
                    await original(*args, **kwargs)
                    if kwargs.get('cis_active_configuration') is not None:
                        raise RuntimeError('Synthetic upgrade interruption before publication')
                with patch.object(framework_governance, 'reconcile', side_effect=interrupt):
                    failure = await self.client.patch('/api/frameworks/cis-ig1/configuration', json=command, headers={'Idempotency-Key': key})
                self.assertEqual(failure.status_code, 503, failure.text)
                self.assertEqual(len((await self.workspace(cid))['active_definition_ids']), count - additions)
                # Recover the original interrupted intent and replay it exactly.
                recovered = await self.client.patch('/api/frameworks/cis-ig1/configuration', json=command, headers={'Idempotency-Key': key})
                self.assertEqual(recovered.status_code, 200, recovered.text)
                replay = await self.client.patch('/api/frameworks/cis-ig1/configuration', json=command, headers={'Idempotency-Key': key})
                self.assertEqual(replay.json(), recovered.json())
                after = await self.workspace(cid)
                self.assertEqual(len(after['assessments']) - len(before['assessments']), additions)
                inherited = {r['definition_id']: r for r in after['assessments']}
                for row in before['assessments']:
                    # Additive Review relationships are permitted; existing links must survive.
                    retained = inherited[row['definition_id']]
                    for field in ['framework_assessment_id', 'implementation', 'status', 'verification', 'last_assessed', 'assessed_by', 'owner_id', 'notes', 'assessment_history', 'cis_operation', 'cis_assessment_criteria']:
                        self.assertEqual(retained.get(field), row.get(field), (group, row['definition_id'], field))
                    self.assertTrue(all(link in retained.get('related_links', []) for link in row.get('related_links', [])))
                fresh = [r for r in after['assessments'] if r['definition_id'] not in {r['definition_id'] for r in before['assessments']}]
                self.assertEqual(len(fresh), additions)
                self.assertEqual({r['definition_id'] for r in fresh}, {d['id'] for d in CIS['requirements'] if d['implementation_group'] == group})
                for row in fresh:
                    for field in ['implementation', 'owner_id', 'assessment_history', 'cis_assessment_criteria']:
                        self.assertFalse(row.get(field), (group, row['definition_id'], field))
                    self.assertFalse([link for link in row.get('related_links', []) if link.get('kind') in ('evidence', 'tasks', 'findings')])
                self.assertTrue(all(r['status'] == 'not_assessed' and r.get('verification') != 'verified' and not r.get('last_assessed') for r in fresh))
                reviews_after = await self.get('/reviews', client_id=cid)
                for row in reviews_before:
                    retained = next(r for r in reviews_after if r['review_id'] == row['review_id'])
                    for field in ['title', 'description', 'owner_id', 'due_date', 'recurrence', 'custom_recurrence_days', 'schedule_anchor', 'occurrences']:
                        self.assertEqual(retained.get(field), row.get(field), (group, field))
                self.assertEqual(await self.get('/findings', client_id=cid), findings_before)
                self.assertEqual(await self.get('/tasks', client_id=cid), tasks_before)
                self.assertEqual(await self.get('/evidence', client_id=cid), evidence_before)
                await verify_saved_payloads()
                self.assertEqual(len(reviews_after), 15)
                upgrades.append({'group': group, 'preserved_assessments': count - additions, 'new_unassessed': additions, 'interrupted_retry': True, 'replay': True, 'preserved_reviews': len(reviews_before)})

            ws = await self.workspace(cid)
            self.assertEqual(len(ws['active_definition_ids']), count)
            if probe is None:
                probe = (await self.get('/reviews', client_id=cid))[0]['review_id']
            for review in await self.get('/reviews', client_id=cid):
                if not review.get('due_date'):
                    await self.edit('/reviews/' + review['review_id'], {'owner_id': 'admin', 'due_date': f'{start_year}-03-31', 'recurrence': 'custom' if review['review_id'] == probe else review['recurrence'], **({'custom_recurrence_days': 42} if review['review_id'] == probe else {}), 'expected_occurrence_id': review['current_occurrence_id']})

            phase_rows = [r for r in ws['assessments'] if next(d for d in CIS['requirements'] if d['id'] == r['definition_id'])['implementation_group'] == group]
            phase_gaps = []
            for year in [start_year, start_year + 1]:
                self.clock(f'{year}-01-15')
                for row in (await self.workspace(cid))['assessments']:
                    ident = row['definition_id']
                    path = '/framework_assessments/' + row['framework_assessment_id']
                    is_gap = year == start_year and row['definition_id'] in {r['definition_id'] for r in phase_rows[:3]}
                    definition = next(d for d in CIS['requirements'] if d['id'] == ident)
                    population = {
                        1: 'eight managed endpoints, two servers, one cloud network and one regularly connected supplier device',
                        2: 'approved endpoint/server software and two internally developed applications',
                        3: 'customer contact data in endpoint files, the service database and the hosting provider',
                        4: 'managed endpoints, mobile devices, servers, network devices and application configurations',
                        5: 'staff, administrators and service accounts in the directory and application',
                        6: 'staff roles, application privileges, remote access and provider-managed identities',
                        7: 'internal servers, endpoints and the externally exposed service',
                        8: 'endpoint, server, network, application and supported provider audit sources',
                        9: 'managed browsers, email clients, hosted mail and gateway controls',
                        10: 'managed endpoints, servers and removable-media handling',
                        11: 'customer service database, files and isolated recovery copies',
                        12: 'office, cloud and administrative network paths',
                        13: 'host, network, remote-access and application traffic monitoring',
                        14: 'eight staff, new hires, administrators and application developers',
                        15: 'hosting and support suppliers and their contract/data/access lifecycles',
                        16: 'two applications, their developers, dependencies and release environments',
                        17: 'incident lead, backup, response team and workforce reporting routes',
                        18: 'external/internal infrastructure and relevant application test scopes',
                    }[definition['control']]
                    content = f'SYNTHETIC external activity dossier {ident}, year {year}. Scope: {population}. Method: {definition["guidance"]} Timing/trigger: {definition["source_cadence"]} Evidence includes synthetic configuration samples, dated operating results and exception dispositions. January role change and July service/contract change were checked where applicable; post-incident and post-test follow-up were sampled where relevant. '
                    content += 'The sample exposes an unresolved coverage gap requiring correction.' if is_gap else 'The synthetic sample supports the stated outcome without an unresolved exception.'
                    content += ' This is test evidence, not actual technical execution or independent operational assurance.'
                    evidence = await self.post('/evidence', {'client_id': cid, 'linked_type': 'framework_assessment', 'linked_id': row['framework_assessment_id'], 'filename': f'synthetic-{ident}-{year}.txt', 'content_base64': base64.b64encode(content.encode()).decode()})
                    evidence_ids.append(evidence['evidence_id'])
                    evidence_hashes[evidence['evidence_id']] = hashlib.sha256(content.encode()).hexdigest()
                    self.assertEqual(base64.b64decode((await self.get('/evidence/' + evidence['evidence_id'] + '/download'))['content_base64']).decode(), content)
                    if is_gap:
                        finding = await self.post(path + '/findings', {'request_id': f'gap-{group}-{ident}', 'title': f'Synthetic coverage gap {ident}', 'description': 'Sample indicates incomplete operating coverage.', 'remediation_title': 'Correct coverage and validate results', 'due_date': f'{year + 1}-01-10', 'owner_id': 'admin'})
                        phase_gaps.append(finding['finding_id'])
                        gaps.append(finding['finding_id'])
                    saved = await self.edit(path, {'implementation': content, 'owner_id': 'admin', 'notes': 'Synthetic validation; evidence alternatives are not mandatory paperwork.', 'status': 'in_progress' if is_gap else 'addressed', 'verification': 'gap_identified' if is_gap else 'verified', 'cis_assessment_criteria': [] if is_gap else [c['id'] for c in framework_governance.CIS_CRITERIA[ident]['criteria']], 'cis_operation': {'provider': 'Synthetic operating provider', 'confirmed': False}})
                    previous = histories.get(ident, [])
                    history = saved['assessment_history']
                    self.assertEqual(history[:-1], previous, (year, ident, 'history prefix'))
                    self.assertEqual(len(history), len(previous) + 1, (year, ident, 'history append'))
                    histories[ident] = copy.deepcopy(history)

                if year == start_year + 1:
                    for fid in phase_gaps:
                        tasks = [t for t in await self.get('/tasks', client_id=cid) if t.get('finding_id') == fid]
                        self.assertEqual(len(tasks), 1)
                        await self.edit('/tasks/' + tasks[0]['task_id'], {'status': 'done'})
                        self.assertEqual((await self.get('/findings/' + fid))['status'], 'remediated')
                        self.assertEqual((await self.post('/findings/' + fid + '/validate', {'rationale': 'Synthetic independent resampling confirms the corrected coverage.'}))['status'], 'closed')

                executions = 0
                while True:
                    due = sorted([r for r in await self.get('/reviews', client_id=cid) if r.get('due_date') and r['due_date'][:10] <= f'{year}-12-31' and r['status'] not in ('completed', 'cancelled')], key=lambda r: r['due_date'])
                    if not due:
                        break
                    review = due[0]
                    executions += 1
                    self.assertLess(executions, 160)
                    scheduled = review['due_date'][:10]
                    completion = (lifecycle.clocks.REAL_DATE.fromisoformat(scheduled) + lifecycle.timedelta(days=8)).isoformat() if review['review_id'] == probe and year == 2027 else scheduled
                    self.clock(max(lifecycle.clocks.Clock.now.date().isoformat(), completion))
                    path = '/reviews/' + review['review_id']
                    await self.post(path + '/start', {'occurrence_id': review['current_occurrence_id']})
                    evidence = await self.post('/evidence', {'client_id': cid, 'linked_type': 'review', 'linked_id': review['review_id'], 'occurrence_id': review['current_occurrence_id'], 'filename': f'synthetic-review-{scheduled}.txt', 'content_base64': base64.b64encode(b'SYNTHETIC governance sampling; external technical activity records examined separately.').decode()})
                    evidence_hashes[evidence['evidence_id']] = hashlib.sha256(b'SYNTHETIC governance sampling; external technical activity records examined separately.').hexdigest()
                    result = await self.post(path + '/complete', {'occurrence_id': review['current_occurrence_id']})
                    occurrence = result['occurrence']
                    self.assertEqual(occurrence['due_date'][:10], scheduled)
                    self.assertIn(evidence['evidence_id'], [e['evidence_id'] for e in occurrence['evidence']])
                    snapshots[occurrence['occurrence_id']] = copy.deepcopy(occurrence)
                    if review['review_id'] == probe:
                        current = await self.get(path)
                        self.assertEqual(current['due_date'][:10], (lifecycle.clocks.REAL_DATE.fromisoformat(scheduled) + lifecycle.timedelta(days=42)).isoformat())
                self.clock(f'{year}-12-31')
                live = await self.workspace(cid)
                reviews = await self.get('/reviews', client_id=cid)
                for review in reviews:
                    for occurrence in review.get('occurrences', []):
                        self.assertEqual(occurrence, snapshots[occurrence['occurrence_id']])
                self.assertFalse([r for r in reviews if r.get('due_date') and r['due_date'][:10] <= f'{year}-12-31'])
                if year == start_year + 1:
                    self.assertTrue(all(r['status'] == 'addressed' and r['verification'] == 'verified' for r in live['assessments']))
                    self.assertTrue(all(f['status'] == 'closed' for f in await self.get('/findings', client_id=cid)))
                    self.assertTrue(all(t['status'] == 'done' for t in await self.get('/tasks', client_id=cid)))
                open_gaps = [f for f in await self.get('/findings', client_id=cid) if f['status'] != 'closed']
                self.assertEqual(len(open_gaps), 3 if year == start_year else 0)
                timeline.append({'year': year, 'group': group, 'active_assessments': count, 'review_executions': executions, 'completed_snapshots': len(snapshots), 'open_planned_gaps': len(open_gaps)})

        await verify_saved_payloads()
        self.assertTrue(all(histories.values()))
        self.assertEqual(len(set(evidence_ids)), len(evidence_ids))
        # The six-year evidence population exceeds the legacy list limit.
        # Verify the supported paginated Library exposes every retained record.
        library_ids, page = set(), 1
        while True:
            library = await self.get('/evidence/catalog', client_id=cid, page=page, page_size=100)
            library_ids.update(item['evidence_id'] for item in library['items'])
            if len(library_ids) == library['total']:
                break
            self.assertTrue(library['items'])
            page += 1
            self.assertLess(page, 20)
        self.assertEqual(len(library_ids), len(evidence_ids) + len(snapshots))
        self.assertTrue(set(evidence_ids).issubset(library_ids))
        self.assertEqual(await server.db.framework_assessments.find({'client_id': {'$ne': cid}}).to_list(None), foreign)
        report = {'simulation': '2027–2032; supported route commands, synthetic external activity evidence, controlled Python clock', 'ig3_gate': 'test-only; released product remains unavailable', 'timeline': timeline, 'upgrades': upgrades, 'resolved_findings': len(gaps), 'assessment_evidence_records': len(evidence_ids), 'completed_review_snapshots': len(snapshots)}
        if os.environ.get('CIS_SIX_YEAR_REPORT'):
            Path(os.environ['CIS_SIX_YEAR_REPORT']).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
