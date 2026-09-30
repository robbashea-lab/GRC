"""CIS verification fields on framework assessments; real routes, isolated Mongo mock."""
import unittest
from test_client_dashboard_sources import server
from test_framework_governance import FrameworkTests as Base


class AssessmentVerificationTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Base.asyncSetUp
    sign_in = Base.sign_in
    body = Base.body
    configure = Base.configure

    async def cis_row(self):
        w = await self.configure()
        row = next(a for a in w['assessments'] if a['definition_id'] == '1.1')
        return row, '/api/framework_assessments/' + row['framework_assessment_id']

    async def test_round_trip_history_and_dedupe(self):
        row, base = await self.cis_row()
        self.assertNotIn('verification', row)
        checklist = {'foundation': ['1.1-f1', '1.1-f2', '1.1-f1'], 'mature': ['1.1-m10']}
        r = await self.client.patch(base, json={'verification': 'needs_validation', 'verification_checklist': checklist})
        self.assertEqual(r.status_code, 200, r.text)
        expected = {'foundation': ['1.1-f1', '1.1-f2'], 'mature': ['1.1-m10']}
        self.assertEqual(r.json()['verification'], 'needs_validation')
        self.assertEqual(r.json()['verification_checklist'], expected)
        w = (await self.client.get('/api/frameworks/cis-ig1', params={'client_id': 'a'})).json()
        got = next(a for a in w['assessments'] if a['framework_assessment_id'] == row['framework_assessment_id'])
        self.assertEqual((got['verification'], got['verification_checklist']), ('needs_validation', expected))
        snap = got['assessment_history'][-1]
        self.assertEqual((snap['verification'], snap['verification_checklist']), ('needs_validation', expected))
        r = await self.client.patch(base, json={'verification': 'verified'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['assessment_history'][-1]['verification_checklist'], expected)

    async def test_invalid_values_rejected(self):
        _, base = await self.cis_row()
        bad = [
            {'verification': 'done'},
            {'verification_checklist': {'extra': []}},
            {'verification_checklist': {'foundation': ['1.1-o1']}},
            {'verification_checklist': {'foundation': ['1.2-f1']}},
            {'verification_checklist': {'foundation': ['1.1_f1']}},
            {'verification_checklist': {'foundation': ['1.1-f123']}},
            {'verification_checklist': {'foundation': [1]}},
            {'verification_checklist': {'foundation': ['1.1-f1'] * 21}},
            {'verification_checklist': ['1.1-f1']},
        ]
        for patch in bad:
            r = await self.client.patch(base, json=patch)
            self.assertEqual(r.status_code, 422, (patch, r.text))
        stored = await server.db.framework_assessments.find_one({'framework_assessment_id': base.rsplit('/', 1)[1]})
        self.assertNotIn('verification', stored)
        self.assertEqual(stored['assessment_history'], [])

    async def test_non_cis_rejects_fields_and_history_unchanged(self):
        self.sign_in('admin')
        r = await self.client.post('/api/onboarding/baseline', json=self.body(programs=('nist-csf-2',)))
        self.assertEqual(r.status_code, 200, r.text)
        w = (await self.client.get('/api/frameworks/nist-csf-2', params={'client_id': 'a'})).json()
        base = '/api/framework_assessments/' + w['assessments'][0]['framework_assessment_id']
        for patch in [{'verification': 'verified'}, {'verification_checklist': {}}, {'verification': None}]:
            self.assertEqual((await self.client.patch(base, json=patch)).status_code, 422, patch)
        r = await self.client.patch(base, json={'notes': 'CSF note'})
        self.assertEqual(r.status_code, 200, r.text)
        snap = r.json()['assessment_history'][-1]
        self.assertNotIn('verification', snap)
        self.assertNotIn('verification_checklist', snap)

    async def test_concurrency_unchanged(self):
        row, base = await self.cis_row()
        first = await self.client.patch(base, json={'verification': 'gap_identified', 'expected_last_assessed': row.get('last_assessed')})
        self.assertEqual(first.status_code, 200, first.text)
        stale = await self.client.patch(base, json={'verification': 'verified', 'expected_last_assessed': row.get('last_assessed')})
        self.assertEqual(stale.status_code, 409, stale.text)
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as missing:
            server._require_snapshot({'verification': 'verified'}, first.json(), 'last_assessed')
        self.assertEqual(missing.exception.status_code, 428)


if __name__ == '__main__':
    unittest.main()
