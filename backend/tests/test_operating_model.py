"""Multi-year operating-model checks using real routes and isolated Mongo only."""
import copy
import unittest
from calendar import monthrange
from unittest.mock import patch

from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from test_soc_framework import SocTests


class OperatingModelTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    async def ok(self, method, path, **kwargs):
        response = await self.client.request(method, '/api' + path, **kwargs)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_36_month_occurrences_calendar_and_history(self):
        self.sign_in('admin')
        # Independent expected dates, not the production recurrence helper.
        for cadence, step in [('monthly', 1), ('quarterly', 3), ('semiannual', 6), ('annual', 12)]:
            review = await self.ok('POST', '/reviews', json={
                'client_id': 'a', 'title': 'QA ' + cadence, 'review_type': 'access',
                'owner_id': 'member', 'recurrence': cadence, 'due_date': '2027-01-31'})
            rid = review['review_id']
            original = copy.deepcopy(review)
            frozen = []
            for elapsed in range(0, 36, step):
                year, month = 2027 + elapsed // 12, elapsed % 12 + 1
                expected = f'{year}-{month:02}-{monthrange(year, month)[1]:02}'
                self.assertEqual(review['due_date'][:10], expected)
                oid = review['current_occurrence_id']
                await self.ok('POST', f'/reviews/{rid}/start', json={'occurrence_id': oid})
                with patch.object(server, '_now', return_value=expected + 'T12:00:00+00:00'):
                    result = await self.ok('POST', f'/reviews/{rid}/complete', json={
                        'occurrence_id': oid, 'completion_notes': f'Execution {elapsed}'})
                frozen.append(copy.deepcopy(result['occurrence']))
                review = result['review']
                self.assertEqual(review['occurrences'], frozen)
                retry = await self.ok('POST', f'/reviews/{rid}/complete', json={'occurrence_id': oid})
                self.assertEqual(retry['review']['occurrences'], frozen)
                self.assertEqual(retry['review']['current_occurrence_id'], review['current_occurrence_id'])
                stale = await self.client.patch('/api/reviews/' + rid, json={
                    'notes': 'Stale overwrite', 'expected_occurrence_id': oid})
                self.assertEqual(stale.status_code, 409)
                calendar = await self.ok('GET', '/calendar', params={
                    'client_id': 'a', 'start': expected, 'end': review['due_date'][:10], 'scope': 'all'})
                entries = [e for day in calendar['reviews'].values() for e in day if e['id'] == rid]
                self.assertEqual(len(entries), 2)
                self.assertEqual(len({e['key'] for e in entries}), 2)
                self.assertEqual(sum(not e['historical'] for e in entries), 1)
            self.assertEqual(review['due_date'][:10], '2030-01-31')
            self.assertEqual(len({o['occurrence_id'] for o in frozen}), 36 // step)
            self.assertEqual(await server.db.reviews.count_documents({'review_id': rid}), 1)
            self.assertEqual(frozen[0]['owner_id'], original['owner_id'])

    async def test_one_gap_and_evidence_reused_by_five_frameworks(self):
        await SocTests.configure(self, ('cis-ig1', 'nist-csf-2', 'hipaa', 'iso-27001', 'soc-2'))
        rows = await server.db.framework_assessments.find({'client_id': 'a'}).to_list(None)
        selected = [next(a for a in rows if a['framework_key'] == key)
                    for key in ('cis-ig1', 'nist-csf-2', 'hipaa', 'iso-27001', 'soc-2')]
        first = '/framework_assessments/' + selected[0]['framework_assessment_id']
        finding = await self.ok('POST', first + '/findings', json={
            'title': 'Privileged MFA enforcement gap', 'remediation_title': 'Enforce privileged MFA',
            'severity': 'high', 'request_id': 'operating-model-mfa'})
        action = await server.db.tasks.find_one({'finding_id': finding['finding_id']})
        evidence = await self.ok('POST', '/evidence', json={
            'client_id': 'a', 'filename': 'fictional-mfa.txt', 'content_base64': 'cWE=',
            'linked_type': 'framework_assessment', 'linked_id': selected[0]['framework_assessment_id']})
        for assessment in selected:
            path = '/framework_assessments/' + assessment['framework_assessment_id']
            for kind, identity in [('findings', finding['finding_id']), ('tasks', action['task_id']), ('evidence', evidence['evidence_id'])]:
                for _ in range(2):
                    await self.ok('POST', path + '/links', json={'kind': kind, 'id': identity})
            related = await self.ok('GET', path + '/related')
            for kind in ('findings', 'tasks', 'evidence'):
                self.assertEqual(len(related[kind]), 1)
        await self.ok('PATCH', '/tasks/' + action['task_id'], json={'status': 'done'})
        self.assertEqual((await self.ok('GET', '/findings/' + finding['finding_id']))['status'], 'remediated')
        await self.ok('POST', '/findings/' + finding['finding_id'] + '/validate', json={'rationale': 'Validated fictional MFA coverage'})
        for assessment in selected:
            saved = await self.ok('GET', '/framework_assessments/' + assessment['framework_assessment_id'])
            self.assertEqual(saved['status'], 'not_assessed')
        for kind in ('findings', 'tasks', 'evidence'):
            self.assertEqual(await server.db[kind].count_documents({'client_id': 'a'}), 1)

    async def test_risk_and_vendor_three_year_projection_retains_sources(self):
        self.sign_in('admin')
        risk = await self.ok('POST', '/risks', json={
            'client_id': 'a', 'title': 'Persistent supplier exposure', 'owner_id': 'member',
            'likelihood_score': 3, 'impact_score': 4, 'next_review': '2027-01-31', 'review_cadence': 'annual'})
        vendor = await self.ok('POST', '/vendors', json={
            'client_id': 'a', 'name': 'Fictional SaaS', 'service': 'Identity service',
            'next_review': '2027-01-31', 'review_frequency': 'annual'})
        risk_review = (await self.ok('POST', '/risks/' + risk['risk_id'] + '/review'))['review']
        vendor_review = await server.db.reviews.find_one({'vendor_id': vendor['vendor_id']})
        for review, kind, source in [(risk_review, 'risks', risk), (vendor_review, 'vendors', vendor)]:
            field = 'risk_id' if kind == 'risks' else 'vendor_id'
            for year in range(2027, 2030):
                with patch.object(server, '_now', return_value=f'{year}-02-01T12:00:00+00:00'):
                    review = (await self.ok('POST', '/reviews/' + review['review_id'] + '/complete',
                        json={'occurrence_id': review['current_occurrence_id']}))['review']
                saved = await self.ok('GET', '/' + kind + '/' + source[field])
                self.assertEqual(saved['next_review'][:10], f'{year + 1}-01-31')
                self.assertNotIn(saved['status'], ('closed', 'retired', 'inactive'))
                self.assertEqual(len(review['occurrences']), year - 2026)
            self.assertEqual(await server.db.reviews.count_documents({field: source[field]}), 1)

    async def test_framework_deactivation_preserves_explicit_review_recurrence(self):
        await SocTests.configure(self, ('cis-ig1',))
        review = await server.db.reviews.find_one({'client_id': 'a', 'framework_plan_key': 'account-authorization'})
        path = '/reviews/' + review['review_id']
        review = await self.ok('PATCH', path, json={'due_date': '2027-01-31', 'recurrence': 'annual'})
        review = (await self.ok('POST', path + '/complete', json={'occurrence_id': review['current_occurrence_id']}))['review']
        frozen = copy.deepcopy(review['occurrences'])
        for key in ('hipaa', 'iso-27001', 'soc-2', 'nist-csf-2'):
            await self.ok('PATCH', '/onboarding/programs/' + key, json={'client_id': 'a', 'applicability': 'applies'})
        count = await server.db.reviews.count_documents({'client_id': 'a'})
        for response in ('does_not_apply', 'applies', 'does_not_apply'):
            await self.ok('PATCH', '/onboarding/programs/cis-ig1', json={'client_id': 'a', 'applicability': response})
            saved = await self.ok('GET', path)
            self.assertEqual(saved['occurrences'], frozen)
            self.assertEqual(saved['due_date'], review['due_date'])
            self.assertEqual(saved['recurrence'], 'annual')
            self.assertEqual(saved['status'], 'upcoming')
            self.assertEqual(await server.db.reviews.count_documents({'client_id': 'a'}), count)
        self.assertFalse(saved['framework_driver_active'])
        next_review = (await self.ok('POST', path + '/complete', json={'occurrence_id': saved['current_occurrence_id']}))['review']
        self.assertEqual(next_review['due_date'][:10], '2029-01-31')
        self.assertEqual(next_review['occurrences'][0], frozen[0])

    async def test_all_shared_framework_governance_over_three_years(self):
        await SocTests.configure(self, ('cis-ig1', 'nist-csf-2', 'hipaa', 'iso-27001', 'soc-2'))
        reviews = await server.db.reviews.find({'client_id': 'a'}).to_list(None)
        self.assertEqual(len(reviews), 23)
        original_assessments = await server.db.framework_assessments.find({'client_id': 'a'}).to_list(None)
        for row in reviews:
            path = '/reviews/' + row['review_id']
            current = await self.ok('PATCH', path, json={'due_date': '2027-01-31'})
            step = {'monthly': 1, 'quarterly': 3, 'semiannual': 6, 'annual': 12}[current['recurrence']]
            history = []
            for elapsed in range(0, 36, step):
                year, month = 2027 + elapsed // 12, elapsed % 12 + 1
                due = f'{year}-{month:02}-{monthrange(year, month)[1]:02}'
                self.assertEqual(current['due_date'][:10], due)
                with patch.object(server, '_now', return_value=due + 'T12:00:00+00:00'):
                    result = await self.ok('POST', path + '/complete', json={'occurrence_id': current['current_occurrence_id']})
                history.append(copy.deepcopy(result['occurrence']))
                current = result['review']
                self.assertEqual(current['occurrences'], history)
                self.assertEqual(current['framework_key'], row['framework_key'])
                self.assertEqual(current['framework_safeguards'], row['framework_safeguards'])
            self.assertEqual(current['due_date'][:10], '2030-01-31')
        self.assertEqual(await server.db.reviews.count_documents({'client_id': 'a'}), 23)
        self.assertEqual(await server.db.framework_assessments.find({'client_id': 'a'}).to_list(None), original_assessments)
