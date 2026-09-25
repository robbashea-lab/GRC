"""Ten years of Brawndo-equivalent operation through the real FastAPI routes.

Server twin of the Demo longitudinal validation (frontend/src/preview/brawndoTenYear.test.js).
One controlled clock drives every server time source while a Security Program Manager works the
program weekly: Reviews on time, late, missed and caught up; Findings, Actions and validation;
CIS IG1 reassessment with Evidence; Risk acceptance and expiry; Vendor assurance; Policy approval;
a departing owner; Systems entering and leaving scope. Quarterly checkpoints reconcile the
Dashboard with its drill-downs and source registers, and the run verifies occurrence history,
references, client isolation and document growth.

Mongo mock: this is lifecycle and reconciliation evidence, not index, query-plan, durability or
production-capacity evidence.
"""
import json
import os
import random
import unittest
from datetime import date as REAL_DATE, datetime as REAL_DATETIME, time, timedelta, timezone
from unittest.mock import patch

import bson

from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
import ai_governance, calendar_view, client_profile, create_requests, dashboard_contract, evidence_context, evidence_library
import framework_governance, management_obligations, portfolio_overview, review_occurrences, soc_readiness, vendor_governance
from routes import baseline as baseline_routes, onboarding as onboarding_routes, portfolio as portfolio_routes
from routes.onboarding import BASELINE_CATALOG
from framework_governance import CIS, FRAMEWORKS

START, END = REAL_DATE(2026, 9, 28), REAL_DATE.fromisoformat(os.environ.get('TEN_YEAR_END', '2036-09-29'))
A, B = 'a', 'b'
JOE, CAMACHO, FRITO = 'joe', 'camacho', 'frito'
OPEN_REVIEW, TASK_DONE, OPEN_FINDING = ('needs_scheduling', 'upcoming', 'in_progress'), ('done', 'cancelled'), ('open', 'in_remediation', 'remediated')
DISCIPLINE = [0.8, 0.9, 0.55, 0.72, 0.88, 0.7, 0.92, 0.8, 0.66, 0.9]
SLOW = [1, 0.9, 1.7, 1.3, 1, 1.4, 0.9, 1.1, 1.3, 1]


class Clock:
    now = REAL_DATETIME.combine(START, time(14), tzinfo=timezone.utc)


class SimDatetime(REAL_DATETIME):
    @classmethod
    def now(cls, tz=None):
        return Clock.now.astimezone(tz) if tz else Clock.now.replace(tzinfo=None)

    @classmethod
    def utcnow(cls):
        return Clock.now.replace(tzinfo=None)


class SimDate(REAL_DATE):
    @classmethod
    def today(cls):
        return Clock.now.date()


CLOCKED = [server, ai_governance, calendar_view, client_profile, create_requests, dashboard_contract, evidence_context, evidence_library,
           framework_governance, management_obligations, portfolio_overview, review_occurrences, soc_readiness, vendor_governance,
           baseline_routes, onboarding_routes, portfolio_routes]


def day(value):
    return str(value)[:10] if value else None


def add_days(value, n):
    return (REAL_DATE.fromisoformat(value) + timedelta(days=n)).isoformat()


class TenYearOperationTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp_harness = Harness.asyncSetUp

    async def asyncSetUp(self):
        await self.asyncSetUp_harness()
        for module in CLOCKED:
            for name, fake in (('datetime', SimDatetime), ('date', SimDate)):
                if getattr(module, name, None) in (REAL_DATETIME, REAL_DATE):
                    clock = patch.object(module, name, fake)
                    clock.start()
                    self.addCleanup(clock.stop)
        self.rng = random.Random(20260928)
        self.report = {'discrepancies': [], 'rejections': [], 'expected_rejections': [], 'checkpoints': [], 'volume': [], 'events': []}
        self.ledger = {'occurrences': {}, 'assessments': {}, 'decisions': {}}
        self.plans, self.task_plans, self.validation_plans, self.catch_up, self.departed = {}, {}, {}, set(), set()
        self.counts = {'completions': 0, 'late': 0, 'findings': 0, 'validated': 0, 'evidence': 0, 'tasks_done': 0}

    def sign_in(self, uid):
        # Tokens carry real time: PyJWT checks iat/exp against the real clock, not the simulated one.
        now = REAL_DATETIME.now(timezone.utc)
        token = server.jwt.encode({'sub': uid, 'email': uid + '@example.test', 'type': 'access', 'iss': 'omnisciente',
                                   'aud': server.security_runtime.environment(), 'iat': now.timestamp(), 'exp': now + timedelta(days=7)},
                                  server._jwt_secret(), algorithm=server.JWT_ALGORITHM)
        self.client.headers['Authorization'] = 'Bearer ' + token

    @property
    def today(self):
        return Clock.now.date().isoformat()

    def year(self):
        return min(9, (Clock.now.date() - START).days * 10 // 3653)

    async def call(self, method, path, expect_failure=False, label=None, **kwargs):
        response = await self.client.request(method, '/api' + path, **kwargs)
        if response.status_code >= 400:
            entry = {'today': self.today, 'method': method, 'path': path, 'status': response.status_code, 'detail': response.text[:240], 'label': label}
            self.report['expected_rejections' if expect_failure else 'rejections'].append(entry)
            return None
        if expect_failure:
            self.report['rejections'].append({'today': self.today, 'path': path, 'label': label, 'detail': 'UNEXPECTED SUCCESS'})
        return response.json()

    def discrepancy(self, area, **detail):
        self.report['discrepancies'].append({'today': self.today, 'area': area, **detail})

    async def upload(self, linked_type, linked_id, title, **extra):
        row = await self.call('POST', '/evidence', json={'client_id': A, 'linked_type': linked_type, 'linked_id': linked_id,
                              'filename': f"{title[:40].lower().replace(' ', '-')}-{self.today}.txt", 'content_base64': 'RGVtbw==', **extra}, label='evidence')
        if row:
            self.counts['evidence'] += 1
        return row

    # ------------------------------------------------------------------ setup
    async def seed(self):
        await server.db.users.insert_many([
            {'user_id': JOE, 'email': 'joe@example.test', 'name': 'Joe Bowers', 'role': 'platform_admin', 'client_ids': [A], 'status': 'active'},
            {'user_id': CAMACHO, 'email': 'camacho@example.test', 'name': 'President Camacho', 'role': 'client_contributor', 'client_ids': [A], 'status': 'active'},
            {'user_id': FRITO, 'email': 'frito@example.test', 'name': 'Frito Pendejo', 'role': 'client_contributor', 'client_ids': [A], 'status': 'active'},
            {'user_id': 'other_member', 'email': 'other@example.test', 'name': 'Other Client Member', 'role': 'client_contributor', 'client_ids': [B], 'status': 'active'}])
        await server.db.clients.update_one({'client_id': A}, {'$set': {'name': 'Brawndo (server twin)'}})
        self.sign_in('admin')
        plans = {p['key']: {'enabled': True, 'recurrence': p['default_cadence'], 'due_date': add_days(self.today, 10 + i * 6)} for i, p in enumerate(CIS['review_plans'])}
        for cid in (A, B):
            state = {'version': 3, 'step': 3, 'policies': {p['key']: 'yes' for p in BASELINE_CATALOG['policies']},
                     'requirements': {f['key']: 'applies' if f['key'] == 'cis-ig1' else 'does_not_apply' for f in FRAMEWORKS},
                     'reviews': [], 'framework_reviews': plans}
            done = await self.call('POST', '/onboarding/baseline', json={'client_id': cid, 'finalize': True, 'state': state}, label='onboarding')
            self.assertIsNotNone(done, self.report['rejections'])
        owners = [JOE, CAMACHO, FRITO]
        for i, review in enumerate(await self.call('GET', '/reviews', params={'client_id': A})):
            await self.call('PATCH', '/reviews/' + review['review_id'], json={'owner_id': owners[i % 3], 'expected_occurrence_id': review['current_occurrence_id']}, label='assign review')
        workspace = await self.call('GET', '/frameworks/cis-ig1', params={'client_id': A})
        self.aids = {row['definition_id']: row['framework_assessment_id'] for row in workspace['assessments']}
        statuses = self.brawndo_statuses()
        for i, row in enumerate(workspace['assessments']):
            status = statuses.get(row['definition_id'], 'not_assessed')
            body = {'owner_id': owners[i % 3], 'status': status, 'technology': 'Managed service stack',
                    'implementation': '' if status == 'not_assessed' else f"Initial assessment of {row['definition_id']}."}
            saved = await self.call('PATCH', '/framework_assessments/' + row['framework_assessment_id'], json=body, label='initial assessment')
            if saved:
                self.ledger['assessments'][row['framework_assessment_id']] = list(saved['assessment_history'])
        for key, did, severity in (('inventory', '1.1', 'high'), ('immutable', '11.4', 'high'), ('offboarding', '6.2', 'medium')):
            await self.cis_finding(did, f'CIS {did} gap at program start', severity, add_days(self.today, 30))
        self.risks = {}
        for key, title, likelihood, impact, owner in (('recovery', 'Recovery testing has not validated application dependencies', 3, 4, JOE),
                                                     ('admin', 'Cloud administrative permissions exceed least privilege', 2, 3, CAMACHO),
                                                     ('supplier', 'Supplier recovery concentration', 2, 3, FRITO)):
            risk = await self.call('POST', '/risks', json={'client_id': A, 'title': title, 'likelihood_score': likelihood, 'impact_score': impact, 'owner_id': owner,
                                   'treatment': 'mitigate', 'review_cadence': 'quarterly', 'next_review': add_days(self.today, 40 + len(self.risks) * 20)}, label='risk')
            self.risks[key] = risk['risk_id']
        await self.accept_risk('supplier', add_days(self.today, 140))
        self.vendors = {}
        for key, name, criticality, owner, due in (('recovery', 'Sentinel Recovery Services', 'critical', JOE, 16), ('payroll', 'Northstar Payroll', 'medium', CAMACHO, 150),
                                                   ('collab', 'Harbor Collaboration Services', 'low', FRITO, 170)):
            vendor = await self.call('POST', '/vendors', json={'client_id': A, 'name': name, 'service': name, 'criticality': criticality, 'business_owner_id': owner,
                                     'review_frequency': 'annual', 'next_review': add_days(self.today, due), 'contract_renewal': add_days(self.today, due + 60),
                                     'assurance_required': True, 'assurance_records': [{'type': 'Security Questionnaire', 'required': True, 'evidence_ids': []}]}, label='vendor')
            self.vendors[key] = vendor['vendor_id']
        self.assets = {}
        for key, name, criticality, owner in (('tenant', 'Identity and productivity tenant', 'high', JOE), ('endpoints', 'Managed endpoint fleet', 'high', CAMACHO),
                                              ('backup', 'Backup and recovery platform', 'high', FRITO), ('core', 'Core service application', 'critical', JOE)):
            asset = await self.call('POST', '/assets', json={'client_id': A, 'name': name, 'criticality': criticality, 'owner_id': owner, 'asset_type': 'application'}, label='asset')
            self.assets[key] = asset['asset_id']
        for name, role in (('Joe Bowers', 'Information Security Lead'), ('President Camacho', 'Executive Sponsor'), ('Frito Pendejo', 'IT Lead'), ('Rita', 'Finance Contact')):
            await self.call('POST', '/contacts', json={'client_id': A, 'name': name, 'role': role}, label='contact')
        self.policies = [p for p in await self.call('GET', '/policies', params={'client_id': A})][:6]
        await self.call('POST', '/reviews', json={'client_id': B, 'title': 'Other client access review', 'review_type': 'access', 'recurrence': 'quarterly',
                        'due_date': add_days(self.today, 20)}, label='other client review')

    def brawndo_statuses(self):
        # The Demo reference program is the source of Brawndo's starting assessment profile.
        path = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'src', 'preview', 'brawndoProgram.js')
        letters = {'A': 'addressed', 'P': 'in_progress', 'G': 'needs_attention', 'N': 'not_assessed'}
        import re
        return {m.group(1): letters[m.group(2)] for m in re.finditer(r"'(\d+\.\d+)':\[([APGN]),", open(path, encoding='utf-8').read())}

    # --------------------------------------------------------------- workflows
    async def cis_finding(self, did, title, severity, due, assignee=None):
        aid = self.aids[did]
        finding = await self.call('POST', f'/framework_assessments/{aid}/findings', json={'title': title, 'severity': severity, 'remediation_title': 'Remediate ' + title,
                                  'request_id': f'sim-{did}-{self.today}', 'description': title}, label='CIS finding ' + did)
        if not finding:
            return None
        self.counts['findings'] += 1
        task = await server.db.tasks.find_one({'finding_id': finding['finding_id']}, {'_id': 0})
        await self.call('PATCH', '/tasks/' + task['task_id'], json={'due_date': due, **({'assignee_id': assignee} if assignee else {})}, label='plan CIS action')
        return finding

    async def assess(self, did, evidence=False, **body):
        aid = self.aids[did]
        if evidence:
            await self.upload('framework_assessment', aid, f'CIS {did} validation')
        saved = await self.call('PATCH', '/framework_assessments/' + aid, json=body, label='assess ' + did)
        if saved:
            self.ledger['assessments'][aid] = list(saved['assessment_history'])
        return saved

    async def accept_risk(self, key, expiry):
        saved = await self.call('POST', f"/risks/{self.risks[key]}/accept", json={'rationale': f'Time-limited acceptance recorded {self.today}.', 'expiry_date': expiry}, label='accept risk')
        if saved:
            self.ledger['decisions']['risk:' + self.risks[key]] = list(saved.get('decision_history') or [])

    def plan_review(self, review):
        if review['review_id'] in self.catch_up or self.rng.random() < DISCIPLINE[self.year()]:
            return self.today
        return add_days(self.today, 7 * (self.rng.randint(1, 5) if self.rng.random() < 0.7 else self.rng.randint(6, 16)))

    async def work_reviews(self):
        for review in await self.call('GET', '/reviews', params={'client_id': A}) or []:
            guard = 0
            while review and review['status'] in ('upcoming', 'in_progress') and day(review.get('due_date')) and day(review['due_date']) <= add_days(self.today, 6) and guard < 4:
                guard += 1
                if review.get('owner_id') in self.departed:
                    break
                key = review['review_id'] + '|' + review['current_occurrence_id']
                self.plans.setdefault(key, self.plan_review(review))
                if self.plans[key] > self.today:
                    break
                review = await self.execute_review(review)

    async def execute_review(self, review):
        rid, oid = review['review_id'], review['current_occurrence_id']
        if review['status'] != 'in_progress' and not await self.call('POST', f'/reviews/{rid}/start', json={'occurrence_id': oid}, label='start review'):
            return None
        if self.rng.random() < 0.6:
            await self.upload('review', rid, review['title'], occurrence_id=oid)
        if self.rng.random() < (0.14 if self.year() in (2, 5, 8) else 0.08):
            severity = self.rng.choice(['low', 'medium', 'medium', 'high'])
            finding = await self.call('POST', f'/reviews/{rid}/create-finding', json={'occurrence_id': oid, 'request_id': f'sim-{rid}-{self.today}', 'title': f"{review['title']} exception {self.today}",
                                      'remediation_title': 'Remediate exception', 'severity': severity, 'due_date': add_days(self.today, 90),
                                      'owner_id': None if review.get('owner_id') in self.departed else review.get('owner_id')}, label='review finding')
            if finding:
                self.counts['findings'] += 1
        body = {'occurrence_id': oid}
        if review.get('risk_id'):
            body.update({'risk_assessment': {}, 'risk_outcome': 'Reviewed — No Change'})
        result = await self.call('POST', f'/reviews/{rid}/complete', json=body, label='complete review')
        if not result:
            return None
        occurrence = result['occurrence']
        if occurrence['occurrence_id'] in self.ledger['occurrences'].setdefault(rid, {}):
            self.discrepancy('reviews', issue='duplicate occurrence', review=rid)
        self.ledger['occurrences'][rid][occurrence['occurrence_id']] = json.loads(json.dumps(occurrence))
        self.counts['completions'] += 1
        if day(occurrence['due_date']) < self.today:
            self.counts['late'] += 1
            self.catch_up.add(rid)
        else:
            self.catch_up.discard(rid)
        if review.get('vendor_id') and (review.get('vendor_purpose') or 'vendor') == 'vendor':
            await self.refresh_assurance(review['vendor_id'])
        return result['review']

    async def refresh_assurance(self, vendor_id):
        vendor = await self.call('GET', '/vendors/' + vendor_id)
        if not vendor or vendor.get('status') == 'inactive':
            return
        evidence = await self.upload('vendor', vendor_id, vendor['name'] + ' assurance')
        records = [{**a, 'received_at': self.today, 'refresh_due': add_days(self.today, 365), 'evidence_ids': [evidence['evidence_id']]} for a in vendor['assurance_records']]
        await self.call('PATCH', '/vendors/' + vendor_id, json={'assurance_records': records}, label='refresh assurance')
        if vendor['status'] == 'under_review':
            await self.call('PATCH', '/vendors/' + vendor_id, json={'status': 'active'}, label='activate vendor')

    async def work_tasks(self):
        for task in await self.call('GET', '/tasks', params={'client_id': A}) or []:
            if task['status'] in TASK_DONE or (task.get('assignee_id') or task.get('owner_id')) in self.departed:
                continue
            if task['task_id'] not in self.task_plans:
                weeks = max(1, round({'critical': 3, 'high': 6, 'medium': 9, 'low': 14}.get(task.get('priority'), 9) * SLOW[self.year()] * self.rng.uniform(0.6, 1.5)))
                self.task_plans[task['task_id']] = {'done': add_days(self.today, 7 * weeks), 'extend': self.rng.random() < 0.15}
            plan = self.task_plans[task['task_id']]
            if plan['extend'] and day(task.get('due_date')) and day(task['due_date']) <= self.today < plan['done']:
                plan['extend'] = False
                await self.call('PATCH', '/tasks/' + task['task_id'], json={'due_date': add_days(self.today, 60)}, label='extend action')
            if task['status'] == 'open':
                await self.call('PATCH', '/tasks/' + task['task_id'], json={'status': 'in_progress'}, label='start action')
            if plan['done'] <= self.today and await self.call('PATCH', '/tasks/' + task['task_id'], json={'status': 'done'}, label='complete action'):
                self.counts['tasks_done'] += 1

    async def validate(self):
        for finding in await self.call('GET', '/findings', params={'client_id': A}) or []:
            if finding['status'] != 'remediated':
                continue
            self.validation_plans.setdefault(finding['finding_id'], add_days(self.today, 7 * self.rng.randint(1, 6)))
            if self.validation_plans[finding['finding_id']] > self.today:
                continue
            saved = await self.call('POST', f"/findings/{finding['finding_id']}/validate", json={'rationale': f'Validated {self.today}'}, label='validate')
            if saved:
                self.counts['validated'] += 1
                self.ledger['decisions']['finding:' + finding['finding_id']] = list(saved.get('decision_history') or [])

    def schedule(self):
        """Dated operator events; each runs on the first weekly tick on or after its date."""
        async def approve_policy():
            p = self.policies[0]
            subject = await self.call('POST', f"/policies/{p['policy_id']}/approval-subject", json={'version': '3.0', 'external_reference': 'Controlled register / ' + p['title'], 'external_version': 'Revision 3.0'}, label='policy basis')
            submitted = subject and await self.call('POST', f"/policies/{p['policy_id']}/submit-review", json={}, label='policy submit')
            approved = submitted and await self.call('POST', f"/policies/{p['policy_id']}/approve", json={'approval_request_id': submitted['approval_request_id'], 'comment': 'Approved'}, label='policy approve')
            if approved:
                self.ledger['decisions']['policy:' + p['policy_id']] = list(approved.get('approval_history') or [])

        async def depart():
            await self.call('PATCH', '/users/' + FRITO, json={'status': 'disabled'}, label='disable departing user')
            self.departed.add(FRITO)
            opened = await self.call('GET', f'/users/{FRITO}/open_assignments', params={'client_id': A}) or {}
            self.report['events'].append({'today': self.today, 'event': 'departure', 'open': opened.get('total')})

        async def departed_owner_finding():
            rows = (await self.call('GET', '/frameworks/cis-ig1', params={'client_id': A}))['assessments']
            owned = next(r for r in rows if r.get('owner_id') == FRITO)
            finding = await self.call('POST', f"/framework_assessments/{owned['framework_assessment_id']}/findings", json={'title': 'Gap found after owner left', 'remediation_title': 'Restore coverage', 'request_id': 'departed-owner'}, label='departed-owner CIS finding')
            self.report['departed_owner_finding'] = {'created': bool(finding), 'owner': (finding or {}).get('owner_id')}

        async def reassign():
            opened = await self.call('GET', f'/users/{FRITO}/open_assignments', params={'client_id': A}) or {}
            fields = {'reviews': 'owner_id', 'tasks': 'assignee_id', 'findings': 'owner_id', 'risks': 'owner_id', 'vendors': 'business_owner_id', 'policies': 'owner_id', 'assets': 'owner_id', 'framework_assessments': 'owner_id'}
            for item in opened.get('items', []):
                body = {fields.get(item['kind'], 'owner_id'): CAMACHO}
                if item['kind'] == 'reviews':
                    review = await self.call('GET', '/reviews/' + item['id'])
                    body['expected_occurrence_id'] = review['current_occurrence_id']
                await self.call('PATCH', f"/{item['kind']}/{item['id']}", json=body, label='reassign ' + item['kind'])
            self.departed.discard(FRITO)

        async def unlink_wrong_evidence():
            aid = self.aids['9.2']
            wrong = await self.upload('framework_assessment', aid, 'Wrong file')
            await self.call('DELETE', f'/framework_assessments/{aid}/links', json={'kind': 'evidence', 'id': wrong['evidence_id']}, label='unlink evidence')

        async def delete_duplicate_evidence():
            wrong = await self.upload('framework_assessment', self.aids['10.2'], 'Duplicate file')
            await self.call('DELETE', '/evidence/' + wrong['evidence_id'], label='delete evidence')

        async def backup_failure():
            await self.assess('11.4', status='needs_attention', implementation='Retention lock disabled during migration.')
            finding = await self.cis_finding('11.4', 'Immutable backup retention lock disabled', 'critical', '2032-03-02', assignee=JOE)
            if finding and await self.call('POST', f"/findings/{finding['finding_id']}/raise-risk", label='risk from finding'):
                self.report['events'].append({'today': self.today, 'event': 'risk raised from finding'})

        async def sweep():
            rows = (await self.call('GET', '/frameworks/cis-ig1', params={'client_id': A}))['assessments']
            for row in rows:
                if row['status'] == 'addressed' and self.rng.random() < 0.6:
                    await self.assess(row['definition_id'], evidence=self.rng.random() < 0.5, implementation=(row.get('implementation') or 'Implemented.') + f' Verified {self.today}.')

        events = [
            ('2027-01-04', approve_policy),
            ('2027-02-22', lambda: self.checkpoint('risk acceptance lapsed')),
            ('2027-03-01', lambda: self.accept_risk('supplier', '2028-03-01')),
            ('2027-06-07', lambda: self.assess('11.4', evidence=True, status='addressed', implementation='Immutable copy configured and tested.')),
            ('2028-02-28', lambda: self.checkpoint('leap-year boundary')),
            ('2028-06-05', lambda: self.call('POST', f"/risks/{self.risks['recovery']}/close", json={'reason': 'remediated', 'note': 'Validated twice.'}, label='close risk')),
            ('2029-01-15', depart),
            ('2029-04-09', departed_owner_finding),
            ('2029-06-04', reassign),
            ('2030-01-06', unlink_wrong_evidence),
            ('2031-02-03', delete_duplicate_evidence),
            ('2031-06-02', lambda: self.call('PATCH', '/vendors/' + self.vendors['collab'], json={'status': 'offboarding'}, label='offboard vendor')),
            ('2031-09-01', lambda: self.call('PATCH', '/vendors/' + self.vendors['collab'], json={'status': 'inactive'}, label='vendor inactive')),
            ('2032-02-02', backup_failure),
            ('2032-03-01', lambda: self.checkpoint('backup incident')),
            ('2033-07-04', lambda: self.call('POST', '/bulk', json={'kind': 'assets', 'ids': [self.assets['core']], 'action': 'close'}, label='retire system (bulk close)')),
            ('2034-05-01', lambda: self.call('POST', f"/risks/{self.risks['supplier']}/close", json={'reason': 'condition_removed', 'note': 'Second provider.'}, label='close risk')),
            ('2034-06-05', lambda: self.call('PATCH', '/risks/' + self.risks['supplier'], json={'status': 'assessed'}, expect_failure=True, label='reopen closed risk')),
        ]
        events += [(f'{year}-10-01', sweep) for year in range(2027, 2036) if year != 2028]
        return sorted(events, key=lambda e: e[0])

    async def events(self):
        while self.pending and self.pending[0][0] <= self.today:
            await self.pending.pop(0)[1]()

    # ------------------------------------------------------------- checkpoints
    async def pages(self, key):
        items, offset = [], 0
        while True:
            page = await self.call('GET', '/dashboard', params={'client_id': A, 'detail': key, 'offset': offset, 'limit': 100})
            items += page['items']
            if not page['has_more']:
                return items, page['total']
            offset += 100

    async def checkpoint(self, label):
        today = self.today
        dash = await self.call('GET', '/dashboard', params={'client_id': A})
        registers = {k: await self.call('GET', '/' + k, params={'client_id': A}) for k in ('reviews', 'findings', 'tasks', 'risks', 'vendors', 'policies', 'assets')}
        totals = dash['posture']['totals']
        windows = {'pastDue': ('0000-01-01', add_days(today, -1)), 'due30': (today, add_days(today, 30)), 'due3190': (add_days(today, 31), add_days(today, 90))}
        ids = {'reviews': 'review_id', 'findings': 'finding_id', 'tasks': 'task_id', 'risks': 'risk_id', 'vendors': 'vendor_id', 'policies': 'policy_id'}
        for key, headline in totals.items():
            items, total = await self.pages(key)
            if total != headline or len(items) != headline:
                self.discrepancy('dashboard', issue='total != drill-down', key=key, headline=headline, total=total, items=len(items))
            if len({i['key'] for i in items}) != len(items):
                self.discrepancy('dashboard', issue='duplicate drill-down rows', key=key)
            if key in windows:
                low, high = windows[key]
                listed = {i['kind'] + ':' + i['id'] for i in items}
                for item in items:
                    source = next((r for r in registers.get(item['kind'], []) if r[ids[item['kind']]] == item['id']), None)
                    if not source or source['client_id'] != A:
                        self.discrepancy('dashboard', issue='drill-down item without a Brawndo source', key=item['key'])
                    elif not low <= day(item['due_date']) <= high:
                        self.discrepancy('dashboard', issue='item outside bucket', bucket=key, item=item['key'])
                for review in registers['reviews']:
                    if review['status'] in OPEN_REVIEW and day(review.get('due_date')) and low <= day(review['due_date']) <= high and 'reviews:' + review['review_id'] not in listed:
                        self.discrepancy('dashboard', issue='open Review missing from bucket', bucket=key, review=review['review_id'])
                for task in registers['tasks']:
                    if task['status'] not in TASK_DONE and day(task.get('due_date')) and low <= day(task['due_date']) <= high and 'tasks:' + task['task_id'] not in listed:
                        self.discrepancy('dashboard', issue='open Action missing from bucket', bucket=key, task=task['task_id'])
        material = sum(1 for f in registers['findings'] if f['status'] in OPEN_FINDING and f.get('severity') in ('high', 'critical'))
        if material != totals['materialFindings']:
            self.discrepancy('reconciliation', issue='material findings tile != register', tile=totals['materialFindings'], register=material)
        significant = sum(1 for r in registers['risks'] if r['status'] not in ('closed', 'retired') and r.get('risk_level') in ('high', 'critical'))
        if significant != totals['significantRisks']:
            self.discrepancy('reconciliation', issue='significant risks tile != register', tile=totals['significantRisks'], register=significant)
        if dash['kpis']['open_findings'] != sum(1 for f in registers['findings'] if f['status'] in OPEN_FINDING):
            self.discrepancy('reconciliation', issue='open_findings KPI != register')
        overdue_reviews = sum(1 for r in registers['reviews'] if r['status'] in OPEN_REVIEW and day(r.get('due_date')) and day(r['due_date']) < today)
        if dash['kpis']['overdue_reviews'] != overdue_reviews:
            self.discrepancy('reconciliation', issue='overdue_reviews KPI != register', kpi=dash['kpis']['overdue_reviews'], register=overdue_reviews)
        await self.cis_check(registers)
        await self.calendar_check(registers)
        self.volume(label)
        self.report['checkpoints'].append({'today': today, 'label': label, 'totals': totals})

    async def cis_check(self, registers):
        workspace = await self.call('GET', '/frameworks/cis-ig1', params={'client_id': A})
        evidence = [e for e in await server.db.evidence.find({'client_id': A, 'archived_at': None}, {'_id': 0, 'content_base64': 0}).to_list(None)]
        summary = await self.call('GET', '/frameworks/summary', params={'client_id': A})
        counts = next(i for i in summary['items'] if i['key'] == 'cis-ig1')['status_counts']
        for status, n in counts.items():
            if n != sum(1 for a in workspace['assessments'] if a['status'] == status):
                self.discrepancy('cis', issue='program summary != workspace', status=status)
        now = Clock.now
        for row in workspace['assessments']:
            work = workspace['work'][row['framework_assessment_id']]
            unlinked = set(row.get('unlinked_evidence_ids') or [])
            own = [e for e in evidence if e['evidence_id'] not in unlinked and (e.get('linked_type') in ('framework_assessment', 'framework_assessments') and e.get('linked_id') == row['framework_assessment_id']
                   or {'kind': 'evidence', 'id': e['evidence_id']} in (row.get('related_links') or []))]
            if work['evidence_count'] != len(own):
                self.discrepancy('cis', issue='evidence count != current support', safeguard=row['definition_id'], work=work['evidence_count'], expected=len(own))
            direct = [f for f in registers['findings'] if f['status'] in OPEN_FINDING and f.get('framework_assessment_id') == row['framework_assessment_id']]
            if work['direct_findings'] != len(direct):
                self.discrepancy('cis', issue='direct findings != register', safeguard=row['definition_id'])
            if row.get('last_assessed') and row['status'] != 'not_assessed':
                age = (now - REAL_DATETIME.fromisoformat(row['last_assessed'])).days
                self.report.setdefault('stale_seen', set()).add(row['definition_id']) if age > 365 else None

    async def calendar_check(self, registers):
        today = REAL_DATE.fromisoformat(self.today)
        start = today.replace(day=1)
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        calendar = await self.call('GET', '/calendar', params={'client_id': A, 'start': start.isoformat(), 'end': end.isoformat(), 'scope': 'active'})
        entries = [e for group in calendar.values() for rows in group.values() for e in rows]
        expected = [r for r in registers['reviews'] if r['status'] in OPEN_REVIEW and day(r.get('due_date')) and start.isoformat() <= day(r['due_date']) <= end.isoformat()]
        expected += [f for f in registers['findings'] if f['status'] in OPEN_FINDING and day(f.get('due_date')) and start.isoformat() <= day(f['due_date']) <= end.isoformat()]
        expected += [t for t in registers['tasks'] if t['status'] not in TASK_DONE and day(t.get('due_date')) and start.isoformat() <= day(t['due_date']) <= end.isoformat()]
        if len(entries) != len(expected) or any(e.get('historical') for e in entries):
            self.discrepancy('calendar', issue='Calendar month != open dated records', calendar=len(entries), expected=len(expected))

    def volume(self, label):
        self.report['volume'].append({'today': self.today, 'label': label})

    async def measure(self, label):
        docs = {k: await server.db[k].find({'client_id': A}, {'_id': 0}).to_list(None) for k in ('reviews', 'findings', 'tasks', 'evidence', 'framework_assessments', 'risks', 'vendors', 'audit_logs')}
        largest = max(docs['reviews'], key=lambda r: len(bson.encode(r)))
        largest_assessment = max(docs['framework_assessments'], key=lambda r: len(bson.encode(r)))
        evidence_list = await self.call('GET', '/evidence', params={'client_id': A})
        return {'today': self.today, 'label': label, **{k: len(v) for k, v in docs.items()},
                'occurrences': sum(len(r.get('occurrences') or []) for r in docs['reviews']),
                'largest_review_bytes': len(bson.encode(largest)), 'largest_review_occurrences': len(largest.get('occurrences') or []),
                'largest_assessment_bytes': len(bson.encode(largest_assessment)), 'largest_assessment_history': len(largest_assessment.get('assessment_history') or []),
                'evidence_list_returned': len(evidence_list or [])}

    # --------------------------------------------------------------------- run
    async def test_ten_years_of_operation(self):
        await self.seed()
        other_before = {k: await server.db[k].find({'client_id': B}, {'_id': 0}).to_list(None) for k in ('reviews', 'findings', 'tasks', 'risks', 'vendors', 'policies', 'framework_assessments', 'evidence')}
        await self.checkpoint('seed')
        self.report['measure'] = [await self.measure('seed')]
        self.pending = self.schedule()
        current, next_checkpoint = START, START + timedelta(days=91)
        while current <= END:
            Clock.now = REAL_DATETIME.combine(current, time(14), tzinfo=timezone.utc)
            await self.events()
            await self.work_reviews()
            await self.work_tasks()
            await self.validate()
            if current >= next_checkpoint:
                await self.checkpoint('quarterly')
                next_checkpoint += timedelta(days=91)
            if current.month == 10 and current.day <= 7:
                self.report['measure'].append(await self.measure('annual'))
            current += timedelta(days=7)
        await self.checkpoint('year 10')
        self.report['measure'].append(await self.measure('year 10'))
        # History: every recorded occurrence and decision remains exactly as captured.
        mismatches = []
        for rid, captured in self.ledger['occurrences'].items():
            stored = {o['occurrence_id']: o for o in (await server.db.reviews.find_one({'review_id': rid}))['occurrences']}
            for oid, snapshot in captured.items():
                if oid not in stored or json.dumps(stored[oid], sort_keys=True, default=str) != json.dumps(snapshot, sort_keys=True, default=str):
                    mismatches.append(oid)
        for aid, history in self.ledger['assessments'].items():
            stored = (await server.db.framework_assessments.find_one({'framework_assessment_id': aid}))['assessment_history']
            if json.dumps(stored[:len(history)], sort_keys=True, default=str) != json.dumps(history, sort_keys=True, default=str):
                mismatches.append(aid)
        for key, history in self.ledger['decisions'].items():
            kind, ident = key.split(':', 1)
            field = 'approval_history' if kind == 'policy' else 'decision_history'
            coll, id_field = {'risk': ('risks', 'risk_id'), 'finding': ('findings', 'finding_id'), 'policy': ('policies', 'policy_id')}[kind]
            stored = (await server.db[coll].find_one({id_field: ident})).get(field) or []
            if json.dumps(stored[:len(history)], sort_keys=True, default=str) != json.dumps(history, sort_keys=True, default=str):
                mismatches.append(key)
        # Referential integrity within the client and across clients.
        orphans = []
        for finding in await server.db.findings.find({'client_id': A}).to_list(None):
            if finding.get('review_id') and not await server.db.reviews.find_one({'review_id': finding['review_id'], 'client_id': A}):
                orphans.append(finding['finding_id'])
        for task in await server.db.tasks.find({'client_id': A}).to_list(None):
            if task.get('finding_id') and not await server.db.findings.find_one({'finding_id': task['finding_id'], 'client_id': A}):
                orphans.append(task['task_id'])
        for evidence in await server.db.evidence.find({'client_id': A}).to_list(None):
            kind = evidence_context.ALIASES.get(evidence.get('linked_type'))
            if kind and not await server.db[kind].find_one({evidence_context.SOURCES[kind]['key']: evidence['linked_id'], 'client_id': A}):
                orphans.append(evidence['evidence_id'])
        # Isolation: the other client's records are unchanged; its member cannot read Brawndo.
        other_after = {k: await server.db[k].find({'client_id': B}, {'_id': 0}).to_list(None) for k in other_before}
        self.sign_in('other_member')
        denied = [(await self.client.get('/api/' + path)).status_code for path in (f'reviews?client_id={A}', f'findings?client_id={A}', f'dashboard?client_id={A}',
                  f"reviews/{next(iter(self.ledger['occurrences']))}/history", f'frameworks/cis-ig1?client_id={A}', f'evidence?client_id={A}')]
        other_view = json.dumps([await self.call('GET', '/' + k, params={'client_id': B}) for k in ('reviews', 'findings', 'tasks', 'risks')])
        self.sign_in('admin')
        system = await self.call('GET', '/assets/' + self.assets['core'])
        self.report.update(counts=self.counts, history_mismatches=mismatches, orphans=orphans, denied=denied, retired_system=system['status'])
        if os.environ.get('TEN_YEAR_REPORT'):
            with open(os.environ['TEN_YEAR_REPORT'], 'w') as handle:
                json.dump(self.report, handle, indent=1, default=lambda v: sorted(v) if isinstance(v, set) else str(v))
        self.assertEqual(self.report['rejections'], [])
        self.assertEqual(self.report['discrepancies'], [])
        self.assertEqual(mismatches, [])
        self.assertEqual(orphans, [])
        self.assertGreater(self.counts['completions'], 450)
        self.assertGreater(self.counts['late'], 50)
        self.assertEqual(self.report['departed_owner_finding'], {'created': True, 'owner': None})
        self.assertEqual(system['status'], 'retired')
        self.assertEqual([r['detail'] for r in self.report['expected_rejections']], [self.report['expected_rejections'][0]['detail']])
        self.assertTrue(all(code == 403 for code in denied), denied)
        self.assertNotIn('"client_id": "a"', other_view)
        self.assertEqual(json.dumps(other_before, sort_keys=True, default=str), json.dumps(other_after, sort_keys=True, default=str))


if __name__ == '__main__':
    unittest.main()
