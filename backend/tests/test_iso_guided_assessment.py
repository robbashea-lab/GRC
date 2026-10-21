"""ISO engine checks; route/persistence checks live in test_iso_guided_routes."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from framework_catalog import ISO
import iso_guided_assessment as engine


def complete(id):
    return {q['id']: '' if q['type'] == 'text' else 'Relevant' if q['type'] == 'context' else 'Yes'
            for q in engine._questions(id)}


class IsoGuidedTests(unittest.TestCase):
    def test_explicit_v1_retains_historical_uncertainty_semantics(self):
        self.assertEqual(engine.LEGACY['version'], 'iso27001-omni-1')
        for id in engine.LEGACY['definitions']:
            with self.subTest(definition=id):
                answers = complete(id)
                key = next(q['id'] for q in engine._active_questions(id, answers) if q['type'] == 'select')
                answers.update({key: 'Not sure', 'gaps': 'Historical context'})
                engine.validate_completion(id, answers, engine.LEGACY['version'])
                self.assertEqual(engine.result_status(id, answers, engine.LEGACY['version']), 'in_progress')

    def assert_rejected(self, operation, status):
        with self.assertRaises(HTTPException) as error:
            operation()
        self.assertEqual(error.exception.status_code, status)

    def test_three_part_catalog_exact_123_ids_and_separate_version(self):
        self.assertEqual(engine.VERSION, 'iso27001-omni-2')
        self.assertEqual(engine.CATALOG['framework_id'], 'iso-27001')
        self.assertEqual(set(engine.CATALOG['definitions']), {d['id'] for d in ISO['requirements']})
        self.assertEqual(len(engine.CATALOG['definitions']), 123)
        self.assertEqual(sum(d['specification'] == 'isms_clause' for d in ISO['requirements']), 30)
        self.assertEqual(sum(d['specification'] == 'annex_control' for d in ISO['requirements']), 93)
        for id, definition in engine.CATALOG['definitions'].items():
            with self.subTest(id=id):
                self.assertEqual(engine.current_version(id), engine.VERSION)
                self.assertLessEqual(len(definition['groups']), 30)
                questions = engine._questions(id)
                self.assertTrue(questions)
                self.assertEqual(len(questions), len({q['id'] for q in questions}))
                self.assertTrue(any(q['type'] == 'select' for q in questions))
                for q in questions:
                    self.assertIn(q['type'], ('select', 'context', 'text'))
                    self.assertNotIn('Not applicable', q['choices'])
                    for condition in q['conditions']:
                        self.assertIn(condition['id'], {q['id'] for q in questions})
        self.assert_rejected(lambda: engine.current_version('CC1.1'), 409)
        self.assert_rejected(lambda: engine.validate_answers('4.1', {}, 'soc2-omni-1'), 409)

    def test_all_ids_completion_status_and_optional_text_neutrality(self):
        for id in engine.CATALOG['definitions']:
            with self.subTest(id=id):
                self.assertEqual(engine.result_status(id, {}), 'not_assessed')
                self.assert_rejected(lambda: engine.validate_completion(id, {}), 422)
                answers = complete(id)
                engine.validate_completion(id, answers)
                self.assertEqual(engine.result_status(id, answers), 'addressed')
                active = [q for q in engine._active_questions(id, answers) if q['type'] == 'select']
                self.assertTrue(active)
                key = active[0]['id']
                for value, expected in [('No', 'needs_attention'), ('Partially', 'in_progress')]:
                    revised = {**answers, key: value}
                    engine.validate_completion(id, revised)
                    self.assertEqual(engine.result_status(id, revised), expected)
                uncertain = {q['id']: 'Not sure' for q in engine._questions(id) if q['type'] != 'text'}
                engine.validate_completion(id, uncertain)
                self.assertEqual(engine.result_status(id, uncertain), 'not_assessed')
                for choice in engine.CHOICES:
                    structured = {**answers, key: choice}
                    context = {**structured, 'gaps': 'A freeform gap', 'unknowns': 'Optional name unknown', 'evidence': 'No evidence verified',
                               **{q['id']: 'Optional details' for q in engine._questions(id) if q['type'] == 'text'}}
                    before = copy.deepcopy(context)
                    self.assertEqual(engine.result_status(id, context), engine.result_status(id, structured))
                    self.assertEqual(context, before)
                self.assertEqual(engine.result_status(id, {'evidence': 'Supporting material'}), 'not_assessed')

    def test_all_ids_strict_known_keys_choices_and_browser_length(self):
        for id in engine.CATALOG['definitions']:
            key = next(q['id'] for q in engine._questions(id) if q['type'] == 'select')
            for bad in [None, [], {1: 'secret'}, {'role': 'super_admin'}, {key: True}, {key: {}},
                        {key: 'Not applicable'}, {key: 'Other'}, {key + '_detail': 'x' * 2001}, {'unknowns': 'x' * 2001}]:
                with self.subTest(id=id, bad=bad):
                    self.assert_rejected(lambda: engine.validate_answers(id, bad), 422)
            engine.validate_answers(id, {key + '_detail': '\U0001f600' * 1000})
            self.assert_rejected(lambda: engine.validate_answers(id, {key + '_detail': '\U0001f600' * 1001}), 422)

    def test_all_context_exclusions_require_reason_and_preserve_inactive_answers(self):
        contexts = 0
        for id in engine.CATALOG['definitions']:
            for q in [q for q in engine._active_questions(id, complete(id)) if q['type'] == 'context']:
                contexts += 1
                answers = {**complete(id), q['id']: 'Not relevant here'}
                for blank in ['', ' \n', '\ufeff']:
                    self.assert_rejected(lambda: engine.validate_completion(id, {**answers, q['id'] + '_detail': blank}), 422)
                answers[q['id'] + '_detail'] = 'Confirmed against the current ISMS context.'
                engine.validate_completion(id, answers)
                active_ids = {q['id'] for q in engine._active_questions(id, answers)}
                retained = {**answers, **{q['id']: 'No' for q in engine._questions(id) if q['type'] == 'select' and q['id'] not in active_ids}}
                self.assertEqual(engine.result_status(id, retained), engine.result_status(id, answers))
                self.assertNotEqual(engine.result_status(id, retained), 'not_applicable')
                self.assert_rejected(lambda: engine.validate_answers(id, {q['id']: 'Outside the selected system'}), 422)
        self.assertGreater(contexts, 0)

    def test_recursive_group_and_question_conditions_uncertainty_and_cycles(self):
        definition = {'groups': [
            {'questions': [{'id': 'core'}, {'id': 'context', 'type': 'context'}]},
            {'condition': {'id': 'context', 'equals': 'Relevant'}, 'questions': [
                {'id': 'child', 'type': 'context'},
                {'id': 'nested', 'condition': {'id': 'child', 'equals': 'Relevant'}}]}]}
        catalog = {**engine.CATALOG, 'definitions': {'4.1': definition}}
        with patch.dict(engine.VERSIONS, {engine.VERSION: catalog}):
            answers = {'core': 'Yes', 'context': 'Not relevant here', 'context_detail': 'Reason', 'child': 'Relevant', 'nested': 'No'}
            engine.validate_completion('4.1', answers)
            self.assertEqual(engine.result_status('4.1', answers), 'addressed')
            self.assertEqual(engine.result_status('4.1', {**answers, 'context': 'Not sure'}), 'not_assessed')
            self.assertEqual(engine.result_status('4.1', {**answers, 'context': 'Relevant'}), 'needs_attention')
            self.assertEqual(engine.result_status('4.1', {**answers, 'core': 'Not sure'}), 'not_assessed')
            definition['groups'][1]['questions'][0]['condition'] = {'id': 'nested', 'equals': 'Yes'}
            self.assertEqual({q['id'] for q in engine._active_questions('4.1', {**answers, 'context': 'Relevant', 'nested': 'Yes'})}, {'core', 'context'})

    def test_framework_client_and_definition_scope(self):
        client = {'client_id': 'iso-synthetic'}
        for id in engine.CATALOG['definitions']:
            row = {'client_id': client['client_id'], 'framework_key': 'iso-27001', 'definition_id': id}
            engine.check_scope(row, client)
            for wrong in [{**row, 'framework_key': 'soc-2'}, {**row, 'client_id': 'other'}, {**row, 'definition_id': 'missing'}]:
                self.assert_rejected(lambda: engine.check_scope(wrong, client), 404)
            self.assert_rejected(lambda: engine.check_scope(row, None), 404)

    def test_exact_demo_scope_contract_and_each_lineage_dimension(self):
        row = {'client_id': 'iso-synthetic', 'framework_assessment_id': 'synthetic-4.1', 'framework_key': 'iso-27001',
               'framework_version': ISO['version'], 'definition_id': '4.1', 'owner_id': None, 'process_owner_id': None,
               'last_saved': 'new', 'last_assessed': 'old', 'soa_applicability': '', 'soa_justification': ''}
        client = {'client_id': row['client_id']}
        scope = {key: row[key] for key in ('client_id', 'framework_key', 'framework_version', 'definition_id', 'owner_id', 'process_owner_id', 'soa_applicability', 'soa_justification')}
        scope.update(assessment_id=row['framework_assessment_id'], question_version=engine.VERSION, configuration={})
        expected = hashlib.sha256(json.dumps(scope, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.assertEqual(engine.current_base(row, client), {'base_assessment_token': 'new', 'base_scope_fingerprint': expected})
        for key in ('framework_assessment_id', 'framework_version', 'definition_id', 'owner_id', 'process_owner_id', 'soa_applicability', 'soa_justification'):
            revised = {**row, key: '4.2' if key == 'definition_id' else 'changed'}
            self.assertNotEqual(engine.current_base(revised, client)['base_scope_fingerprint'], expected)
        self.assertNotEqual(engine.current_base({**row, 'client_id': 'other'}, {'client_id': 'other'})['base_scope_fingerprint'], expected)
        with patch.object(engine, 'current_version', return_value='iso27001-omni-next'):
            self.assertNotEqual(engine.current_base(row, client)['base_scope_fingerprint'], expected)
        with patch.object(engine, 'client_configuration', return_value={'existing_future_configuration': True}):
            self.assertNotEqual(engine.current_base(row, client)['base_scope_fingerprint'], expected)
        self.assertEqual(engine.current_base({**row, 'last_saved': None}, client)['base_assessment_token'], 'old')

    def test_javascript_python_status_completion_and_result_contract(self):
        from guided_assessment import ResultSnapshot
        node = shutil.which('node')
        if not node:
            self.skipTest('Node unavailable; cross-language conformance not checked')
        fixtures = []
        for id in engine.CATALOG['definitions']:
            answers = complete(id)
            key = next(q['id'] for q in engine._active_questions(id, answers) if q['type'] == 'select')
            variants = [{}, answers, *[{**answers, key: value} for value in ('No', 'Partially', 'Not sure')],
                        {q['id']: 'Not sure' for q in engine._questions(id) if q['type'] != 'text'},
                        {**answers, 'gaps': 'Freeform reported gap', 'unknowns': 'Optional name unknown'},
                        {**answers, key + '_detail': '\U0001f600' * 1000}]
            for q in [q for q in engine._active_questions(id, answers) if q['type'] == 'context']:
                excluded = {**answers, q['id']: 'Not relevant here'}
                variants.extend([excluded, {**excluded, q['id'] + '_detail': 'Scoped reason'},
                                 {**excluded, q['id'] + '_detail': '\ufeff'}, {**answers, q['id']: 'Not sure'}])
            for variant in variants:
                try:
                    engine.validate_completion(id, variant)
                    completed = True
                except HTTPException:
                    completed = False
                fixtures.append({'id': id, 'answers': variant, 'status': engine.result_status(id, variant), 'completed': completed})
        script = """
import fs from 'node:fs';
const root = process.argv[1];
let source = fs.readFileSync(root + '/frontend/src/lib/isoGuidedAssessment.js', 'utf8');
const inline = fs.readFileSync(root + '/frontend/src/lib/inlineAssessment.js', 'utf8');
const inlineUrl = 'data:text/javascript;base64,' + Buffer.from(inline).toString('base64');
source = source.replace(/from ['"]\\.\\/inlineAssessment['"]/g, 'from ' + JSON.stringify(inlineUrl));
for (const [name, file] of [['isms', 'guidedIsoIsms'], ['organizational', 'guidedIsoOrganizationalPeople'], ['technology', 'guidedIsoPhysicalTechnology'], ['currentCatalog', 'guidedIsoV2']]) {
  source = source.replace(`import ${name} from '@catalogs/${file}.json';`, 'const ' + name + ' = ' + fs.readFileSync(root + '/shared/catalogs/' + file + '.json', 'utf8') + ';');
}
const engine = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const fixtures = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(fixtures.map(({id, answers}) => {
  let completed = true;
  try { engine.validateIsoCompletion(id, answers); } catch { completed = false; }
  const result = engine.isoGuidedResult(id, answers);
  return {status: result.status, completed, result};
})));
"""
        result = subprocess.run([node, '--input-type=module', '-e', script, str(Path(__file__).resolve().parents[2])],
                                input=json.dumps(fixtures), text=True, encoding='utf-8', capture_output=True, timeout=60, check=True)
        output = json.loads(result.stdout)
        self.assertEqual(len(output), len(fixtures))
        for fixture, actual in zip(fixtures, output):
            with self.subTest(id=fixture['id'], answers=fixture['answers']):
                self.assertEqual({k: actual[k] for k in ('status', 'completed')}, {k: fixture[k] for k in ('status', 'completed')})
                self.assertEqual(ResultSnapshot.model_validate(actual['result']).status, fixture['status'])


if __name__ == '__main__':
    unittest.main()
