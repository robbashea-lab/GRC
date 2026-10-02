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

    async def soc_row(self):
        self.sign_in('admin')
        response = await self.client.post('/api/onboarding/baseline', json=self.body(programs=('soc-2',)))
        self.assertEqual(response.status_code, 200, response.text)
        workspace = (await self.client.get('/api/frameworks/soc-2', params={'client_id': 'a'})).json()
        row = next(a for a in workspace['assessments'] if a['definition_id'] == 'CC9.2')
        return row, '/api/framework_assessments/' + row['framework_assessment_id']

    async def test_soc_guidance_is_validated_independent_and_preserves_history(self):
        row, base = await self.soc_row()
        legacy={'foundation':['old-unmapped-check']}
        await server.db.framework_assessments.update_one({'framework_assessment_id':row['framework_assessment_id']},{'$set':{'verification_checklist':legacy}})
        response=await self.client.patch(base,json={'notes':'Retained note','verification':'needs_validation','expected_last_assessed':row.get('last_assessed')})
        self.assertEqual(response.status_code,200,response.text)
        old=response.json()
        checks=['CC9.2-v1-r1','CC9.2-v1-o1']
        response=await self.client.patch(base,json={'soc_assessment_checks':checks+[checks[0]],'expected_last_assessed':old['last_assessed']})
        self.assertEqual(response.status_code,200,response.text)
        saved=response.json()
        self.assertEqual(saved['soc_assessment_checks'],checks)
        for key in ('status','verification','implementation','notes','verification_checklist'):
            self.assertEqual(saved.get(key),old.get(key))
        self.assertEqual(saved['assessment_history'][:-1],old['assessment_history'])
        self.assertEqual(saved['assessment_history'][-1]['soc_assessment_checks'],checks)
        self.assertEqual((await self.client.get(base)).json()['soc_assessment_checks'],checks)
        for bad in (['CC1.1-v1-r1'],['CC9.2-v1-r99'],['CC9.2-f1'],None,{},[1],checks*16):
            response=await self.client.patch(base,json={'soc_assessment_checks':bad,'expected_last_assessed':saved['last_assessed']})
            self.assertEqual(response.status_code,422,(bad,response.text))
        response=await self.client.patch(base,json={'soc_assessment_checks':[],'expected_last_assessed':old['last_assessed']})
        self.assertEqual(response.status_code,409,response.text)
        response=await self.client.patch(base,json={'soc_assessment_checks':[],'expected_last_assessed':saved['last_assessed']})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['assessment_history'][-2]['soc_assessment_checks'],checks)
        self.assertEqual(response.json()['verification_checklist'],legacy)

    async def test_soc_guidance_preserves_framework_and_authorization_boundaries(self):
        row, base = await self.cis_row()
        response=await self.client.patch(base,json={'soc_assessment_checks':[]})
        self.assertEqual(response.status_code,422,response.text)
        response=await self.client.patch(base,json={'notes':'Unrelated CIS update'})
        self.assertNotIn('soc_assessment_checks',response.json()['assessment_history'][-1])
        row, base = await self.soc_row()
        response=await self.client.patch(base,json={'soc_assessment_checks':[]})
        self.assertEqual(response.status_code,200,response.text)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_viewer'}})
        self.sign_in('member')
        response=await self.client.patch(base,json={'soc_assessment_checks':[]})
        self.assertEqual(response.status_code,403,response.text)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_contributor','client_ids':['b']}})
        response=await self.client.patch(base,json={'soc_assessment_checks':[]})
        self.assertEqual(response.status_code,403,response.text)

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

    async def test_soc_verification_round_trips_without_cis_checklist(self):
        row, base = await self.soc_row()
        response = await self.client.patch(base, json={'verification': 'needs_validation', 'expected_last_assessed': row.get('last_assessed')})
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()
        self.assertEqual(saved['verification'], 'needs_validation')
        self.assertEqual(saved['assessment_history'][-1]['verification'], 'needs_validation')
        self.assertNotIn('verification_checklist', saved['assessment_history'][-1])
        rejected = await self.client.patch(base, json={'verification_checklist': {}, 'expected_last_assessed': saved['last_assessed']})
        self.assertEqual(rejected.status_code, 422, rejected.text)

    async def test_criteria_are_independent_scoped_and_historical(self):
        row, base = await self.cis_row()
        self.assertEqual((await self.client.patch(base,json={'cis_assessment_criteria':[]})).status_code,200)
        old=(await self.client.patch(base,json={'verification_checklist':{'foundation':['1.1-f1']}})).json()
        response=await self.client.patch(base,json={'cis_assessment_criteria':['1.1-c1','1.1-c1'],'expected_last_assessed':old['last_assessed']})
        self.assertEqual(response.status_code,200,response.text)
        saved=response.json()
        self.assertEqual(saved['cis_assessment_criteria'],['1.1-c1'])
        self.assertEqual(saved['status'],old['status'])
        self.assertEqual(saved.get('verification'),old.get('verification'))
        self.assertEqual(saved['verification_checklist'],old['verification_checklist'])
        self.assertEqual(saved['assessment_history'][:-1],old['assessment_history'])
        self.assertEqual(saved['assessment_history'][-1]['cis_assessment_criteria'],['1.1-c1'])
        for bad in (['1.2-c1'],['1.1-c99'],['1.1-f1'],None,{},['1.1-c1']*21):
            r=await self.client.patch(base,json={'cis_assessment_criteria':bad,'expected_last_assessed':saved['last_assessed']})
            self.assertEqual(r.status_code,422,(bad,r.text))


if __name__ == '__main__':
    unittest.main()
