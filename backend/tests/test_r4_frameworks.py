"""R4 scope and guided workflow through isolated native handlers; no hosted state."""
import copy
import unittest
import uuid
from datetime import date, datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from framework_catalog import CATALOGS, FRAMEWORKS, active_definitions, active_plans
from framework_governance import stable
from portfolio_progress import current_position
import framework_reports
import generic_guided_assessment as guide
import test_framework_governance as harness


class R4CatalogTests(unittest.TestCase):
    def test_cumulative_scope_and_far_parents_are_distinct(self):
        self.assertEqual([len(active_definitions('cis-ig1', {'implementation_group': n})) for n in (1, 2, 3)], [56, 130, 153])
        one = active_definitions('cmmc', {'level': 1})
        self.assertEqual(len(one), 17)
        self.assertEqual(len({d['level_one_parent'] for d in one}), 15)
        self.assertEqual({d['id'] for d in one if d['level_one_parent'] == 'ix'}, {'3.10.3', '3.10.4', '3.10.5'})
        self.assertEqual(len(active_definitions('cmmc', {'level': 2})), 110)
        self.assertTrue(all(set(p['safeguards']) <= {d['id'] for d in one} for p in active_plans('cmmc', {'level': 1})))
        self.assertTrue(all(p['source_minimum'] is None for p in active_plans('cmmc')))

    def test_hipaa_child_units_preserve_native_parents_and_identity_version(self):
        definitions = {d['id']: d for d in CATALOGS['hipaa']['requirements']}
        self.assertEqual(len(definitions), 81)
        self.assertTrue({'164.302', '164.105', '164.530'} <= definitions.keys())
        children = {d['id']: d['parent_assessment_id'] for d in definitions.values() if d.get('parent_assessment_id')}
        self.assertEqual(len(children), 5)
        self.assertEqual(children['164.314(a)(2)(i)'], '164.314(a)(1)')
        before = stable('client', 'assessment', '164.308(b)(1)', 'hipaa')
        catalog = CATALOGS['hipaa']
        original = catalog['content_revision']
        try:
            catalog['content_revision'] = 'a later display correction'
            self.assertEqual(stable('client', 'assessment', '164.308(b)(1)', 'hipaa'), before)
        finally:
            catalog['content_revision'] = original

    def test_unknown_answers_never_become_confirmed_gaps(self):
        answers = {'practice': 'Not sure', 'implementation': 'Not confirmed', 'gap': 'Not sure', 'unknown': 'Yes', 'unknown_reason': 'Ask the accountable person'}
        version = guide.current_version('GV.OC-01', 'nist-csf-2')
        self.assertEqual(guide.result_status('GV.OC-01', answers, version), 'not_assessed')
        self.assertTrue(all(kind == 'verification' for _, kind in guide.origins(answers)))
        with self.assertRaises(HTTPException):
            guide.validate_completion('GV.OC-01', {**answers, 'unknown_reason': ' '}, version)
        with self.assertRaises(HTTPException):
            guide.validate_answers('GV.OC-01', {**answers, 'privileged': 'Yes'}, version)

    def test_cmmc_position_uses_level_scope_revision_and_pending_guard(self):
        client={'client_id':'scope-client','framework_settings':{'cmmc':{'level':1}},
            'cmmc_configuration_updated_at':'2026-11-19T00:00:00+00:00'}
        framework=next(f for f in FRAMEWORKS if f['key']=='cmmc')
        rows=[{'framework_assessment_id':'assessment-'+d['id'],'definition_id':d['id'],
            'framework_version':CATALOGS['cmmc']['version'],'status':'not_assessed'} for d in active_definitions('cmmc',{'level':2})]
        assignments=[{'baseline_key':'cmmc','requirement_id':'native-cmmc-enrollment'}]
        one=current_position(client,framework,assignments,rows,'2026-11-20T00:00:00+00:00')
        self.assertEqual(one['program_label'],'CMMC Level 1')
        self.assertEqual(one['current']['scope']['configuration'],{'level':1})
        self.assertEqual(one['current']['denominator'],17)
        self.assertEqual(one['current']['provenance']['source_as_of'],client['cmmc_configuration_updated_at'])
        client['framework_settings']['cmmc']['level']=2
        two=current_position(client,framework,assignments,rows,'2026-11-20T00:00:00+00:00')
        self.assertEqual(two['current']['denominator'],110)
        self.assertNotEqual(one['current']['scope_signature'],two['current']['scope_signature'])
        self.assertEqual(one['program_id'],two['program_id'])
        client['framework_settings']['cmmc']['level']=True
        self.assertEqual(current_position(client,framework,assignments,rows,'2026-11-20T00:00:00+00:00')['current']['availability'],'unavailable')
        client['framework_settings']['cmmc']['level']=1
        rows[0]['_r4_context_pending']='other-command'
        with self.assertRaises(HTTPException) as pending:
            current_position(client,framework,assignments,rows,'2026-11-20T00:00:00+00:00')
        self.assertEqual(pending.exception.status_code,409)

    def test_new_reports_keep_source_scope_and_native_outcome_language(self):
        client={'client_id':'scope-client','framework_settings':{'cmmc':{'level':1}}}
        rows=[{'framework_assessment_id':'assessment-'+d['id'],'definition_id':d['id'],
            'framework_version':CATALOGS['cmmc']['version'],'status':'not_assessed'} for d in active_definitions('cmmc',{'level':1})]
        now=datetime(2026,11,19,tzinfo=timezone.utc)
        report=framework_reports.build_snapshot(client,'cmmc',rows,[],[],now,'6m',
            (now.isoformat(),now.isoformat()),'isolated fixture')
        media=next(item for item in report['assessments'] if item['id']=='3.8.3')
        self.assertIn('FCI',media['title'])
        self.assertNotIn('CUI',media['title'])
        self.assertEqual(media['assessment_id'],'assessment-3.8.3')
        self.assertEqual(len(report['assessments']),17)
        self.assertIn('15 parent',report['framework']['scope'])
        self.assertEqual(framework_reports.labels('nist-csf-2')['addressed'],'Achieved')


class R4NativeFrameworkTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.FrameworkTests.asyncSetUp
    sign_in = harness.FrameworkTests.sign_in
    body = harness.FrameworkTests.body
    configure = harness.FrameworkTests.configure

    async def workspace(self, key):
        response = await self.client.get('/api/frameworks/' + key, params={'client_id': 'a'})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_cmmc_level_changes_reuse_answers_files_and_history(self):
        await self.configure(self.body(programs=('cmmc',)))
        initial = await self.workspace('cmmc')
        self.assertEqual(len(initial['active_definition_ids']), 110)
        row = next(r for r in initial['assessments'] if r['definition_id'] == '3.14.7')
        retained = {'implementation': 'Existing CUI scope method', 'assessment_history': [{'at': '2026-01-01', 'by': 'admin', 'implementation': 'Retained'}], 'related_links': [{'kind': 'evidence', 'id': 'retained-file'}]}
        await harness.server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']}, {'$set': retained})
        identities = {r['definition_id']: r['framework_assessment_id'] for r in initial['assessments']}
        token = None
        for level, count in ((1, 17), (2, 110), (1, 17), (2, 110)):
            response = await self.client.patch('/api/frameworks/cmmc/configuration', headers={'Idempotency-Key': uuid.uuid4().hex}, json={
                'client_id': 'a', 'level': level, 'expected_updated_at': token, 'confirm_reduction': True,
                'reason': 'Synthetic scope exercise', 'effective_date': date.today().isoformat()})
            self.assertEqual(response.status_code, 200, response.text)
            token = response.json()['expected_updated_at']
            current = await self.workspace('cmmc')
            self.assertEqual(len(current['active_definition_ids']), count)
            self.assertEqual({r['definition_id']: r['framework_assessment_id'] for r in current['assessments']}, identities)
            saved = next(r for r in current['assessments'] if r['definition_id'] == '3.14.7')
            self.assertEqual({key: saved[key] for key in retained}, retained)
        self.sign_in('member')
        denied = await self.client.patch('/api/frameworks/cmmc/configuration', headers={'Idempotency-Key': uuid.uuid4().hex}, json={'client_id': 'a', 'level': 1, 'expected_updated_at': token})
        self.assertEqual(denied.status_code, 403)

    async def test_cmmc_level_one_initialization_uses_only_its_native_child_scope(self):
        body=self.body(programs=('cmmc',))
        body['state']['framework_settings']={'cmmc':{'level':1}}
        await self.configure(body)
        current=await self.workspace('cmmc')
        expected={d['id'] for d in active_definitions('cmmc',{'level':1})}
        self.assertEqual(current['configuration']['level'],1)
        self.assertEqual(len(current['assessments']),17)
        self.assertEqual({row['definition_id'] for row in current['assessments']},expected)
        reviews=await harness.server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        self.assertTrue(all(set(driver['framework_safeguards'])<=expected for review in reviews for driver in review['framework_drivers']))

    async def test_three_new_interview_kinds_apply_only_on_native_save(self):
        await self.configure(self.body(programs=('hipaa', 'nist-csf-2', 'cmmc')))
        for key in ('hipaa', 'nist-csf-2', 'cmmc'):
            with self.subTest(key=key):
                row = (await self.workspace(key))['assessments'][0]
                path = '/api/framework_assessments/' + row['framework_assessment_id']
                original = copy.deepcopy(await harness.server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']}))
                draft = (await self.client.get(path + '/guided-assessment')).json()
                answers = {'practice': 'Not sure', 'implementation': 'Actual scope still needs confirmation', 'gap': 'Not sure', 'unknown': 'Yes', 'unknown_reason': 'Confirm with the accountable person'}
                result = {'version': draft['version'], 'status': 'not_assessed', 'narrative': 'Reported implementation remains unknown.', 'basis': [], 'gaps': [], 'unknowns': [], 'nextSteps': [], 'evidence': [], 'answers': []}
                payload = {'version': draft['version'], 'answers': answers, 'step': 8, 'completed': True, 'narrative': result['narrative'], 'expected_revision': 0,
                    'base_assessment_token': draft['base_assessment_token'], 'base_scope_fingerprint': draft['base_scope_fingerprint'], 'result': result}
                response = await self.client.put(path + '/guided-assessment', json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                saved_draft = response.json()
                self.assertEqual(await harness.server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']}), original)
                applied = await self.client.patch(path, json={'implementation': result['narrative'], 'status': 'not_assessed',
                    'expected_last_assessed': None, 'guided_assessment_source': {field: saved_draft[field] for field in ('version', 'revision', 'generated_at')}})
                self.assertEqual(applied.status_code, 200, applied.text)
                self.assertTrue(applied.json()['items_to_address'])
                self.assertTrue(all(item['kind'] == 'verification' for item in applied.json()['items_to_address']))
                stale = await self.client.patch(path, json={'implementation': 'Stale overwrite', 'expected_last_assessed': None})
                self.assertEqual(stale.status_code, 409)

    async def test_shared_context_and_assessment_save_retries_once(self):
        await self.configure()
        row = (await self.workspace('cis-ig1'))['assessments'][0]
        path = '/api/framework_assessments/' + row['framework_assessment_id']
        context = (await self.client.get(path + '/service-context')).json()
        activity = context['candidates'][0]
        body = {'implementation': 'Scoped actual implementation', 'status': 'in_progress', 'expected_last_assessed': None,
            'coordination': {'activity_id': activity['activity_id'], 'review_id': activity['review_id'],
                'expected_updated_at': activity['expected_updated_at'], 'expected_client_updated_at': context['expected_client_updated_at'],
                'notes': 'Retain the original setup notes and add this reviewed change.'}}
        key = uuid.uuid4().hex
        collection=harness.server.db.framework_assessments
        collection_type=type(collection)
        real_update=collection_type.update_one
        interrupted=False
        async def interrupt_assessment(target, query, update, **kwargs):
            nonlocal interrupted
            if target.full_name==collection.full_name and not interrupted and update.get('$set',{}).get('implementation')==body['implementation']:
                interrupted=True
                raise RuntimeError('Synthetic interruption after shared context writes')
            return await real_update(target,query,update,**kwargs)
        with patch.object(collection_type,'update_one',interrupt_assessment):
            failed=await self.client.patch(path,json=body,headers={'Idempotency-Key':key})
        self.assertEqual(failed.status_code,503,failed.text)
        self.assertTrue(interrupted)
        self.assertEqual((await self.client.get(path)).status_code,409)
        self.assertEqual((await self.client.get('/api/frameworks/summary',params={'client_id':'a'})).status_code,409)
        response = await self.client.patch(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(response.status_code, 200, response.text)
        retry = await self.client.patch(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), response.json())
        self.assertEqual(len(response.json()['assessment_history']), 1)
        review = await harness.server.db.reviews.find_one({'review_id': activity['review_id']})
        self.assertEqual(review['activity_setup']['notes'], body['coordination']['notes'])
        self.assertFalse(review.get('_r4_context_pending'))
        self.assertEqual(await harness.server.db.framework_assessments.count_documents({'client_id': 'b'}), 0)

    async def test_hipaa_explicit_reconciliation_adds_only_unanswered_children(self):
        await self.configure(self.body(programs=('hipaa',)))
        initial=await self.workspace('hipaa')
        rows=initial['assessments']
        parents={d['parent_assessment_id'] for d in CATALOGS['hipaa']['requirements'] if d.get('parent_assessment_id')}
        child_ids={d['id'] for d in CATALOGS['hipaa']['requirements'] if d.get('parent_assessment_id')}
        for row in rows:
            if row['definition_id'] in child_ids:
                await harness.server.db.framework_assessments.delete_one({'framework_assessment_id':row['framework_assessment_id']})
            elif row['definition_id'] in parents:
                await harness.server.db.framework_assessments.update_one({'framework_assessment_id':row['framework_assessment_id']},
                    {'$set':{'status':'addressed','implementation':'Previously assessed native parent',
                        'assessment_history':[{'at':'2026-01-01','implementation':'Retained parent judgment'}]}})
        saved_parents=await harness.server.db.framework_assessments.find({'client_id':'a','definition_id':{'$in':list(parents)}},{'_id':0}).to_list(None)
        self.assertEqual(len((await self.workspace('hipaa'))['assessments']),76)
        self.assertEqual(await harness.server.db.framework_assessments.count_documents({'client_id':'a'}),76)
        response=await self.client.patch('/api/onboarding/programs/hipaa',json={'client_id':'a','applicability':'applies'})
        self.assertEqual(response.status_code,200,response.text)
        current=await self.workspace('hipaa')
        self.assertEqual(len(current['assessments']),81)
        self.assertEqual(await harness.server.db.framework_assessments.find({'client_id':'a','definition_id':{'$in':list(parents)}},{'_id':0}).to_list(None),saved_parents)
        children=[row for row in current['assessments'] if row['definition_id'] in child_ids]
        self.assertTrue(all(row['status']=='not_assessed' and not row['implementation'] and not row['assessment_history'] for row in children))
        self.assertEqual(await harness.server.db.reviews.count_documents({'client_id':'a'}),8)
