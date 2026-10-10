"""SOC engine-only checks; not HTTP authorization, persistence or hosted evidence."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import unittest

from fastapi import HTTPException
from framework_catalog import SOC
import soc_guided_assessment as engine


def questions(id):
    return [question for group in engine.CATALOG['definitions'][id]['groups'] for question in group['questions']]


def complete(id):
    return {question['id']: '' if question.get('type') == 'text' else 'Relevant' if question.get('type') == 'context' else 'Yes'
            for question in questions(id)}


def first_practice(id):
    return next(question for question in questions(id) if question.get('type') not in ('text', 'context'))


class SocGuidedTests(unittest.TestCase):
    def assert_rejected(self, operation, status):
        with self.assertRaises(HTTPException) as error:
            operation()
        self.assertEqual(error.exception.status_code, status)
        self.assertLess(len(error.exception.detail), 200)

    def test_catalog_exact_coverage_and_version_is_separate_from_cis(self):
        self.assertEqual(engine.CATALOG['version'], 'soc2-omni-1')
        self.assertEqual(engine.CATALOG['framework_id'], 'soc-2')
        self.assertEqual(set(engine.CATALOG['definitions']), {row['id'] for row in SOC['requirements']})
        self.assertEqual(len(engine.CATALOG['definitions']), 61)
        counts = {}
        for id, definition in engine.CATALOG['definitions'].items():
            self.assertEqual(engine.current_version(id), 'soc2-omni-1')
            self.assertEqual(definition['category'], next(row['category'] for row in SOC['requirements'] if row['id'] == id))
            counts[definition['category']] = counts.get(definition['category'], 0) + 1
            self.assertLessEqual(len(definition['groups']), 30)
            keys = [question['id'] for question in questions(id)]
            self.assertEqual(len(set(keys)), len(keys))
        self.assertEqual(counts, {'security': 33, 'availability': 3, 'confidentiality': 2, 'processing_integrity': 5, 'privacy': 18})
        self.assert_rejected(lambda: engine.current_version('CC999'), 409)
        self.assert_rejected(lambda: engine.validate_answers('CC1.1', {}, 'cis-v8.1-program-4'), 409)

    def test_every_criterion_fresh_resume_completion_reassessment_and_optional_notes(self):
        for id in engine.CATALOG['definitions']:
            with self.subTest(criterion=id):
                self.assertEqual(engine.result_status(id, {}), 'not_assessed')
                self.assert_rejected(lambda: engine.validate_completion(id, {}), 422)
                answers = complete(id)
                before = copy.deepcopy(answers)
                engine.validate_answers(id, answers)
                engine.validate_completion(id, answers)
                self.assertEqual(engine.result_status(id, answers), 'addressed')
                self.assertEqual(engine.result_status(id, json.loads(json.dumps(answers))), 'addressed')
                key = first_practice(id)['id']
                for value, expected in [('No', 'needs_attention'), ('Partially', 'in_progress'), ('Not sure', 'in_progress')]:
                    revised = {**answers, key: value}
                    self.assertEqual(engine.result_status(id, revised), expected)
                    engine.validate_completion(id, revised)
                uncertain = {question['id']: '' if question.get('type') == 'text' else 'Not sure' for question in questions(id)}
                self.assertEqual(engine.result_status(id, uncertain), 'not_assessed')
                optional = {question['id']: 'Not sure; optional note' for question in questions(id) if question.get('type') == 'text'}
                self.assertEqual(engine.result_status(id, {**answers, **optional, 'evidence': 'No supporting record identified yet'}), 'addressed')
                self.assertEqual(engine.result_status(id, {**answers, 'gaps': 'Confirmed gap'}), 'addressed')
                self.assertEqual(engine.result_status(id, {**answers, 'unknowns': 'Coverage unconfirmed'}), 'addressed')
                self.assertEqual(engine.result_status(id, {'unknowns': 'Coverage unconfirmed'}), 'not_assessed')
                self.assertEqual(answers, before)

    def test_all_61_freeform_gap_and_optional_name_uncertainty_are_outcome_neutral(self):
        variants = [{'gaps': 'No outstanding gaps.'},
                    {'unknowns': 'All substantive items confirmed; optional document title not known.'},
                    {'gaps': 'Confirmed gap', 'unknowns': 'Material uncertainty'}]
        for id in engine.CATALOG['definitions']:
            answers, key = complete(id), first_practice(id)['id']
            for choice in ['Yes', 'No', 'Partially', 'Not sure']:
                structured = {**answers, key: choice}
                for context in variants:
                    with self.subTest(criterion=id, choice=choice, context=context):
                        combined = {**structured, **context}
                        before = copy.deepcopy(combined)
                        self.assertEqual(engine.result_status(id, combined), engine.result_status(id, structured))
                        self.assertEqual(combined, before)

    def test_every_criterion_strict_known_keys_choices_and_2000_character_limit(self):
        for id in engine.CATALOG['definitions']:
            with self.subTest(criterion=id):
                key = first_practice(id)['id']
                for bad in [None, [], {'foreign': 'secret'}, {1: 'secret'}, {'role': 'platform_owner'},
                            {key: True}, {key: {'Yes': True}}, {key: 'Not applicable'}, {key: 'Other'},
                            {key + '_detail': 'x' * 2001}, {'gaps': 'x' * 2001}]:
                    self.assert_rejected(lambda: engine.validate_answers(id, bad), 422)
                engine.validate_answers(id, {key + '_detail': 'x' * 2000})
                engine.validate_answers(id, {key + '_detail': '\U0001f600' * 1000})
                self.assert_rejected(lambda: engine.validate_answers(id, {key + '_detail': '\U0001f600' * 1001}), 422)

    def test_context_exclusions_require_explanation_and_retained_answers_are_inactive(self):
        checked = 0
        for id in engine.CATALOG['definitions']:
            for context in [question for question in questions(id) if question.get('type') == 'context']:
                checked += 1
                answers = {**complete(id), context['id']: 'Outside the selected system'}
                self.assert_rejected(lambda: engine.validate_completion(id, answers), 422)
                answers[context['id'] + '_detail'] = 'Confirmed against the selected system boundary.'
                engine.validate_completion(id, answers)
                expected = engine.result_status(id, answers)
                for question in questions(id):
                    if question.get('condition', {}).get('id') == context['id']:
                        answers[question['id']] = 'No'
                self.assertEqual(engine.result_status(id, answers), expected)
                self.assertNotEqual(expected, 'not_applicable')
                answers[context['id']] = 'Relevant'
                self.assertEqual(engine.result_status(id, answers), 'needs_attention')
        self.assertGreater(checked, 0)

    def test_category_tenant_framework_scope_and_configuration_defaults(self):
        client = {'client_id': 'synthetic-soc-client'}
        for id, definition in engine.CATALOG['definitions'].items():
            row = {'client_id': client['client_id'], 'framework_key': 'soc-2', 'definition_id': id}
            if definition['category'] == 'security':
                engine.check_scope(row, client)
            else:
                self.assert_rejected(lambda: engine.check_scope(row, client), 404)
            configured = {**client, 'framework_settings': {'soc-2': {'categories': ['security', definition['category']]}}}
            engine.check_scope(row, configured)
            for wrong in [{**row, 'framework_key': 'cis-ig1'}, {**row, 'framework_key': 'soc2'}, {**row, 'client_id': 'another-client'}, {**row, 'definition_id': 'CC999'}]:
                self.assert_rejected(lambda: engine.check_scope(wrong, configured), 404)
        for categories in [[], ['privacy'], ['security', 'invented'], 'security']:
            client['framework_settings'] = {'soc-2': {'categories': categories}}
            self.assert_rejected(lambda: engine.check_scope({'client_id': client['client_id'], 'framework_key': 'soc-2', 'definition_id': 'CC1.1'}, client), 404)

    def test_scope_fingerprint_is_exact_and_changes_with_authoritative_lineage(self):
        row = {'client_id': 'synthetic-soc-client', 'framework_assessment_id': 'synthetic-CC1.1',
               'framework_key': 'soc-2', 'framework_version': SOC['version'], 'definition_id': 'CC1.1',
               'owner_id': 'synthetic-owner', 'process_owner_id': 'synthetic-process-owner',
               'last_saved': '2026-10-10T10:00:00Z', 'last_assessed': '2026-10-01T10:00:00Z'}
        client = {'client_id': row['client_id'], 'soc_configuration_updated_at': '2026-10-09T10:00:00Z',
                  'framework_settings': {'soc-2': {'categories': ['security', 'privacy']}}}
        scope = {key: row[key] for key in ['client_id', 'framework_key', 'framework_version', 'definition_id', 'owner_id', 'process_owner_id']}
        scope.update(assessment_id=row['framework_assessment_id'], question_version='soc2-omni-1',
                     categories=['privacy', 'security'], system_description='', period_start='', period_end='',
                     configuration_token=client['soc_configuration_updated_at'])
        expected = hashlib.sha256(json.dumps(scope, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        base = engine.current_base(row, client)
        self.assertEqual(base, {'base_assessment_token': row['last_saved'], 'base_scope_fingerprint': expected})
        reordered = copy.deepcopy(client)
        reordered['framework_settings']['soc-2']['categories'].reverse()
        self.assertEqual(engine.current_base(row, reordered), base)
        for key in ['owner_id', 'process_owner_id', 'definition_id', 'framework_version', 'framework_assessment_id']:
            changed = {**row, key: 'CC1.2' if key == 'definition_id' else 'changed'}
            self.assertNotEqual(engine.current_base(changed, client)['base_scope_fingerprint'], expected)
        changed = {**client, 'soc_configuration_updated_at': 'later'}
        self.assertNotEqual(engine.current_base(row, changed)['base_scope_fingerprint'], expected)
        changed = {**client, 'framework_settings': {'soc-2': {'categories': ['security']}}}
        self.assertNotEqual(engine.current_base(row, changed)['base_scope_fingerprint'], expected)
        for key in ['system_description', 'period_start', 'period_end']:
            changed = copy.deepcopy(client)
            changed['framework_settings']['soc-2'][key] = 'changed'
            self.assertNotEqual(engine.current_base(row, changed)['base_scope_fingerprint'], expected)
        self.assertEqual(engine.current_base({**row, 'last_saved': None}, client)['base_assessment_token'], row['last_assessed'])

    def test_javascript_python_status_and_completion_conformance(self):
        from guided_assessment import ResultSnapshot
        node = shutil.which('node')
        if not node:
            self.skipTest('Node is unavailable; cross-language conformance was not executed')
        # One synthetic fixture batch is evaluated by both actual engines, not a reimplementation.
        fixtures = []
        for id in engine.CATALOG['definitions']:
            answers, key = complete(id), first_practice(id)['id']
            variants = [{}, answers, {**answers, key: 'No'}, {**answers, key: 'Partially'}, {**answers, key: 'Not sure'},
                        {**answers, 'gaps': 'Confirmed gap'}, {**answers, 'unknowns': 'Material uncertainty'},
                        {**answers, 'evidence': 'Not sure'}, {**answers, 'gaps': ' ', 'unknowns': '\n'},
                        {**answers, 'gaps': '\ufeff'}, {**answers, 'unknowns': '\ufeff'},
                        {**answers, 'gaps': '\u0085'}, {**answers, 'unknowns': '\u001c'},
                        {**answers, 'gaps': 'No outstanding gaps.'},
                        {**answers, 'unknowns': 'All substantive items confirmed; optional document title not known.'},
                        {question['id']: '' if question.get('type') == 'text' else 'Not sure' for question in questions(id)},
                        {**answers, **{question['id']: 'Optional name not sure' for question in questions(id) if question.get('type') == 'text'}},
                        {**answers, key + '_detail': '\U0001f600' * 1000}]
            for context in [question for question in questions(id) if question.get('type') == 'context']:
                excluded = {**answers, context['id']: 'Outside the selected system'}
                variants.extend([excluded, {**excluded, context['id'] + '_detail': 'Documented system boundary'},
                                 {**excluded, context['id'] + '_detail': '\ufeff'},
                                 {**answers, context['id']: 'Not sure'}])
            for variant in variants:
                try:
                    engine.validate_completion(id, variant)
                    completed = True
                except HTTPException:
                    completed = False
                fixtures.append({'id': id, 'answers': variant, 'status': engine.result_status(id, variant), 'completed': completed})
        root = Path(__file__).resolve().parents[2]
        script = """
import fs from 'node:fs';
const root = process.argv[1];
const catalog = fs.readFileSync(root + '/shared/catalogs/guidedSoc2.json', 'utf8');
const source = fs.readFileSync(root + '/frontend/src/lib/socGuidedAssessment.js', 'utf8')
  .replace("import catalog from '@catalogs/guidedSoc2.json';", 'const catalog = ' + catalog + ';');
const engine = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const fixtures = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = fixtures.map(({id, answers}) => {
  let completed = true;
  try { engine.validateSocCompletion(id, answers); } catch { completed = false; }
  const result = engine.socGuidedResult(id, answers);
  return {status: result.status, completed, result};
});
process.stdout.write(JSON.stringify(results));
"""
        result = subprocess.run([node, '--input-type=module', '-e', script, str(root)], input=json.dumps(fixtures),
                                text=True, encoding='utf-8', capture_output=True, timeout=60, check=True)
        actual = json.loads(result.stdout)
        self.assertEqual(len(actual), len(fixtures))
        for fixture, output in zip(fixtures, actual):
            with self.subTest(criterion=fixture['id'], answers=fixture['answers']):
                self.assertEqual({key: output[key] for key in ['status', 'completed']},
                                 {key: fixture[key] for key in ['status', 'completed']})
                snapshot = ResultSnapshot.model_validate(output['result'])
                self.assertEqual(snapshot.status, fixture['status'])


if __name__ == '__main__':
    unittest.main()
