"""Prospective SOC/ISO versions through native routes and isolated storage, not staging."""
import copy
import unittest

import test_framework_governance as harness
import soc_guided_assessment
import iso_guided_assessment

server = harness.server
FAMILIES = (
    ('soc-2', 'CC1.1', soc_guided_assessment, 'soc2-assessment-rollout-1', 'soc2-assessment-rollout-2'),
    ('iso-27001', '4.1', iso_guided_assessment, 'iso27001-assessment-rollout-1', 'iso27001-assessment-rollout-2'),
)
CONCERNS = (
    ('gap', {'additional_gap': 'Yes', 'gaps': 'A scoped practice is confirmed missing.'}, 'needs_attention'),
    ('confirmation', {'additional_confirmation': 'Yes', 'unknowns': 'Confirm the unresolved scoped practice.'}, 'not_assessed'),
)


def complete(engine, definition, version, extra):
    answers = {}
    for _ in range(30):
        missing = [q for q in engine._active_questions(definition, answers, version) if q['id'] not in answers]
        if not missing:
            break
        for question in missing:
            answers[question['id']] = ('' if question.get('type') == 'text' else
                                       'Relevant' if question.get('type') == 'context' else
                                       'No' if question.get('optional') else 'Yes')
    answers.update(extra)
    engine.validate_completion(definition, answers, version)
    return answers


def reported_result(engine, definition, version, answers, narrative):
    # The backend records client-reviewed wording; its native evaluator independently validates the status.
    return {'version': version, 'status': engine.result_status(definition, answers, version), 'narrative': narrative,
            'basis': [], 'gaps': [answers['gaps']] if answers.get('additional_gap') == 'Yes' else [],
            'unknowns': [answers['unknowns']] if answers.get('additional_confirmation') == 'Yes' else [],
            'nextSteps': [], 'evidence': [], 'answers': []}


def source(draft):
    return {key: draft[key] for key in ('version', 'revision', 'generated_at')}


def write(draft):
    return {key: draft[key] for key in ('version', 'answers', 'step', 'completed', 'narrative', 'result', 'summary_review')} | {
        'expected_revision': draft['revision']}


class ProposalVersionHistoryTests(unittest.IsolatedAsyncioTestCase):
    # Reuse setup only. Inheriting the existing test class would duplicate its campaign.
    sign_in = harness.FrameworkTests.sign_in

    async def asyncSetUp(self):
        await harness.FrameworkTests.asyncSetUp(self)
        self.sign_in('admin')
        response = await self.client.post('/api/onboarding/baseline', json=harness.FrameworkTests.body(
            self, programs=('soc-2', 'iso-27001')))
        self.assertEqual(response.status_code, 200, response.text)
        self.rows = {}
        for framework, definition, _, _, _ in FAMILIES:
            response = await self.client.get('/api/frameworks/' + framework, params={'client_id': 'a'})
            self.assertEqual(response.status_code, 200, response.text)
            self.rows[framework] = next(row for row in response.json()['assessments'] if row['definition_id'] == definition)

    async def assessment(self, framework, suffix):
        row = copy.deepcopy(self.rows[framework])
        aid = 'synthetic-proposal-' + framework + '-' + suffix
        row.update(_id=aid, framework_assessment_id=aid)
        await server.db.framework_assessments.insert_one(row)
        path = '/api/framework_assessments/' + aid
        response = await self.client.get(path)
        self.assertEqual(response.status_code, 200, response.text)
        return path, path + '/guided-assessment', response.json()

    async def test_already_applied_r1_exact_acknowledgement_stays_a_noop_under_r2(self):
        for framework, definition, engine, r1, r2 in FAMILIES:
            with self.subTest(framework=framework):
                self.assertEqual(engine.current_version(definition), r2)
                path, route, native = await self.assessment(framework, 'already-applied')
                answers = complete(engine, definition, r1, {'additional_gap': 'No', 'additional_confirmation': 'No'})
                narrative, at = 'Exact previously recorded R1 wording.', '2026-10-01T12:00:00+00:00'
                result = reported_result(engine, definition, r1, answers, narrative)
                self.assertEqual(result['status'], 'addressed')
                old = {'version': r1, 'answers': answers, 'step': 0, 'completed': True, 'revision': 7,
                       'narrative': narrative, 'result': result, 'summary_review': {'version': r1, 'answers': answers},
                       'updated_at': at, 'generated_at': at, 'client_id': 'a', 'assessment_id': native['framework_assessment_id'],
                       'user_id': 'admin', 'base_assessment_token': at, 'base_scope_fingerprint': '1' * 64}
                # Explicit already-recorded fixture; its opaque saved lineage is deliberately stale under R2.
                recorded_source = {**source(old), 'origin': 'guided-assessment-pilot', 'answers': answers, 'by': 'admin',
                                   'base_assessment_token': old['base_assessment_token'], 'base_scope_fingerprint': old['base_scope_fingerprint']}
                history = [*native.get('assessment_history', []), {'at': at, 'by': 'admin', 'status': 'addressed',
                           'implementation': narrative, 'guided_assessment_source': recorded_source}]
                await server.db.framework_assessments.update_one({'framework_assessment_id': native['framework_assessment_id']},
                    {'$set': {'implementation': narrative, 'status': 'addressed', 'last_saved': at, 'last_assessed': at,
                              'guided_assessment_source': recorded_source, 'items_to_address': [], 'items_revision': 0,
                              'assessment_history': history}})
                await server.db.guided_assessment_pilot.insert_one({'_id': native['framework_assessment_id'] + ':admin', **old})
                retained = (await self.client.get(route)).json()
                self.assertEqual(retained['version'], r1)
                self.assertTrue(retained['lineage_stale'])
                before = (await self.client.get(path)).json()
                stored = await server.db.framework_assessments.find_one({'framework_assessment_id': native['framework_assessment_id']})
                payload = {'implementation': narrative, 'status': 'addressed', 'guided_assessment_source': source(old), 'expected_last_assessed': at}
                response = await self.client.patch(path, json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), before)
                self.assertEqual(await server.db.framework_assessments.find_one({'framework_assessment_id': native['framework_assessment_id']}), stored)
                response = await self.client.patch(path, json={**payload, 'implementation': narrative + ' Unreviewed change.'})
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual((await self.client.get(path)).json(), before)
                self.assertEqual(await server.db.framework_assessments.find_one({'framework_assessment_id': native['framework_assessment_id']}), stored)

    async def test_retained_r1_read_guards_and_restart_archive_exact_history(self):
        for framework, definition, engine, r1, r2 in FAMILIES:
            for label, extra, expected in CONCERNS:
                with self.subTest(framework=framework, concern=label):
                    self.assertEqual(engine.current_version(definition), r2)
                    path, route, native = await self.assessment(framework, 'retained-' + label)
                    answers = complete(engine, definition, r1, extra)
                    before_answers = copy.deepcopy(answers)
                    self.assertEqual(engine.result_status(definition, answers, r1), 'addressed')
                    self.assertEqual(engine.result_status(definition, answers, r2), expected)
                    self.assertEqual(answers, before_answers)
                    narrative = 'Exact retained client-reviewed R1 wording — ' + label
                    old = {'version': r1, 'answers': answers, 'step': 1, 'completed': True, 'revision': 7,
                           'narrative': narrative, 'result': reported_result(engine, definition, r1, answers, narrative),
                           'summary_review': {'version': r1, 'answers': answers},
                           'updated_at': '2026-10-01T12:01:00+00:00', 'generated_at': '2026-10-01T12:00:00+00:00',
                           'client_id': 'a', 'assessment_id': native['framework_assessment_id'], 'user_id': 'admin'}
                    identity = native['framework_assessment_id'] + ':admin'
                    # Explicit pre-lineage R1 fixture; no current-version/default patch surrounds its native reads.
                    await server.db.guided_assessment_pilot.insert_one({'_id': identity, **copy.deepcopy(old)})
                    response = await self.client.get(route)
                    self.assertEqual(response.status_code, 200, response.text)
                    retained = response.json()
                    self.assertEqual({key: retained[key] for key in old}, old)
                    self.assertFalse(retained['lineage_known'])
                    self.assertEqual((await self.client.get(route + '/history')).json()['items'], [])
                    self.assertEqual((await self.client.get(path)).json(), native)
                    self.assertEqual(await server.db.guided_assessment_pilot.find_one({'_id': identity}), {'_id': identity, **old})

                    response = await self.client.put(route, json=write(old))
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json(), retained)
                    for payload in ({**write(old), 'expected_revision': 6}, {**write(old), 'version': r2}):
                        response = await self.client.put(route, json=payload)
                        self.assertEqual(response.status_code, 409, response.text)
                    response = await self.client.patch(path, json={'implementation': narrative, 'status': 'addressed',
                        'guided_assessment_source': source(old), 'expected_last_assessed': native.get('last_saved') or native.get('last_assessed')})
                    self.assertEqual(response.status_code, 409, response.text)
                    self.assertEqual((await self.client.get(path)).json(), native)
                    self.assertEqual(await server.db.guided_assessment_pilot.find_one({'_id': identity}), {'_id': identity, **old})

                    restart = {'version': r2, 'answers': {}, 'step': 0, 'completed': False, 'narrative': '',
                               'result': None, 'summary_review': None, 'expected_revision': old['revision'], 'restart': True,
                               'base_assessment_token': retained['current_assessment_token'],
                               'base_scope_fingerprint': retained['current_scope_fingerprint']}
                    response = await self.client.put(route, json=restart)
                    self.assertEqual(response.status_code, 200, response.text)
                    fresh = response.json()
                    for key, value in {'version': r2, 'answers': {}, 'step': 0, 'completed': False, 'narrative': '',
                                       'revision': 8, 'result': None, 'summary_review': None, 'generated_at': None,
                                       'lineage_known': True, 'lineage_stale': False}.items():
                        self.assertEqual(fresh[key], value, key)
                    self.assertEqual((await self.client.get(route)).json(), fresh)
                    history = await self.client.get(route + '/history')
                    self.assertEqual(history.status_code, 200, history.text)
                    self.assertEqual(history.json(), {'items': [old], 'has_more': False, 'next_before_revision': None})
                    archive = await server.db.guided_assessment_history.find_one({'_id': identity + ':7'}, {'_id': 0})
                    self.assertEqual(archive, old)
                    response = await self.client.put(route, json=restart)
                    self.assertEqual(response.status_code, 409, response.text)
                    self.assertEqual((await self.client.get(path)).json(), native)

    async def test_r2_completion_does_not_save_assessment_and_native_replay_is_idempotent(self):
        for framework, definition, engine, _, r2 in FAMILIES:
            for label, extra, expected in CONCERNS:
                with self.subTest(framework=framework, concern=label):
                    self.assertEqual(engine.current_version(definition), r2)
                    path, route, native = await self.assessment(framework, 'current-' + label)
                    initial = (await self.client.get(route)).json()
                    self.assertEqual((initial['version'], initial['answers'], initial['revision']), (r2, {}, 0))
                    answers = complete(engine, definition, r2, extra)
                    narrative = 'Synthetic reviewed current wording — ' + label
                    result = reported_result(engine, definition, r2, answers, narrative)
                    self.assertEqual(result['status'], expected)
                    payload = {'version': r2, 'answers': answers, 'step': 0, 'completed': True, 'narrative': narrative,
                               'result': result, 'summary_review': {'version': r2, 'answers': answers}, 'expected_revision': 0,
                               'base_assessment_token': initial['current_assessment_token'],
                               'base_scope_fingerprint': initial['current_scope_fingerprint']}
                    response = await self.client.put(route, json=payload)
                    self.assertEqual(response.status_code, 200, response.text)
                    draft = response.json()
                    self.assertEqual(draft['answers'], answers)
                    self.assertEqual(draft['result'], result)
                    self.assertEqual((await self.client.get(route)).json(), draft)
                    self.assertEqual((await self.client.get(path)).json(), native)
                    self.assertEqual((await self.client.get(route + '/history')).json()['items'], [])
                    response = await self.client.put(route, json=payload)
                    self.assertEqual(response.status_code, 409, response.text)
                    response = await self.client.put(route, json={**payload, 'expected_revision': draft['revision']})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json(), draft)
                    self.assertEqual((await self.client.get(path)).json(), native)

                    save = {'implementation': narrative, 'status': expected, 'guided_assessment_source': source(draft),
                            'expected_last_assessed': native.get('last_saved') or native.get('last_assessed')}
                    response = await self.client.patch(path, json=save)
                    self.assertEqual(response.status_code, 200, response.text)
                    saved = response.json()
                    self.assertEqual((saved['implementation'], saved['status']), (narrative, expected))
                    for field in ('verification', 'owner_id', 'process_owner_id', 'related_links'):
                        self.assertEqual(saved.get(field), native.get(field), field)
                    self.assertEqual(saved['assessment_history'][:-1], native.get('assessment_history', []))
                    self.assertEqual(len(saved['assessment_history']), len(native.get('assessment_history', [])) + 1)
                    self.assertEqual(saved['guided_assessment_source']['answers'], answers)
                    self.assertEqual(saved['guided_assessment_source']['version'], r2)
                    self.assertEqual(saved['assessment_history'][-1]['guided_assessment_source'], saved['guided_assessment_source'])
                    self.assertEqual((await self.client.get(path)).json(), saved)
                    stored = await server.db.framework_assessments.find_one({'framework_assessment_id': native['framework_assessment_id']})
                    response = await self.client.patch(path, json={**save, 'expected_last_assessed': saved.get('last_saved') or saved.get('last_assessed')})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json(), saved)
                    self.assertEqual(await server.db.framework_assessments.find_one({'framework_assessment_id': native['framework_assessment_id']}), stored)


if __name__ == '__main__':
    unittest.main()
