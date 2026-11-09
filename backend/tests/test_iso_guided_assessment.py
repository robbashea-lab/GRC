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


def complete(id, version=engine.V2['version']):
    # Historical test fixtures do not acquire new optional keys from the active default.
    return {q['id']: '' if q['type'] == 'text' else 'Relevant' if q['type'] == 'context' else 'Yes'
            for q in engine._questions(id, version)}


ROLLOUT_VERSION = 'iso27001-assessment-rollout-1'
PROSPECTIVE_VERSION = 'iso27001-assessment-rollout-2'
OPTIONAL_REGISTRATIONS = [
    *((id, f'SPEC-ISO-{id}-tool-context') for id in
      ('6.1.2', '6.1.3', '7.2', '7.3', '7.5.3', '9.2.2', '9.3.3', '10.2')),
    *((id, f'ISO-{id}-tool-location-context') for id in (
        'A.5.9', 'A.5.12', 'A.5.13', 'A.5.15', 'A.5.16', 'A.5.17', 'A.5.18', 'A.5.19',
        'A.5.20', 'A.5.21', 'A.5.22', 'A.5.23', 'A.5.24', 'A.5.25', 'A.5.26', 'A.5.27',
        'A.5.28', 'A.5.29', 'A.5.30', 'A.5.34', 'A.6.3', 'A.6.7', 'A.6.8', 'A.8.1',
        'A.8.2', 'A.8.3', 'A.8.4', 'A.8.5', 'A.8.7', 'A.8.8', 'A.8.9', 'A.8.12',
        'A.8.13', 'A.8.15', 'A.8.16', 'A.8.18', 'A.8.19', 'A.8.20', 'A.8.21', 'A.8.22',
        'A.8.23', 'A.8.25', 'A.8.26', 'A.8.27', 'A.8.28', 'A.8.29', 'A.8.30', 'A.8.31', 'A.8.32')),
]


class IsoGuidedTests(unittest.TestCase):
    def test_saved_version_policies_do_not_depend_on_current_catalog(self):
        for policy in (engine.uses_intent_gates, engine.uses_inline_sentences):
            self.assertTrue(policy())
            self.assertFalse(policy(engine.LEGACY['version']))
            self.assertTrue(policy(engine.V2['version']))
            self.assertTrue(policy(ROLLOUT_VERSION))
            self.assertFalse(policy('iso27001-unknown'))
            with patch.object(engine, 'VERSION', ROLLOUT_VERSION):
                self.assertTrue(policy())
                self.assertTrue(policy(engine.V2['version']))
                self.assertFalse(policy(engine.LEGACY['version']))

    @patch.object(engine, 'VERSION', ROLLOUT_VERSION)
    def test_rollout_reader_preserves_v2_core_and_activates_the_compatible_default(self):
        # Retain the original R1 activation oracle; real R2 defaults are unpatched below.
        self.assertEqual(engine.VERSION, ROLLOUT_VERSION)
        self.assertEqual(engine.ROLLOUT['version'], ROLLOUT_VERSION)
        self.assertEqual(engine.ROLLOUT['framework_id'], engine.CATALOG['framework_id'])
        self.assertEqual(list(engine.ROLLOUT['definitions']), list(engine.CATALOG['definitions']))
        self.assertEqual(engine.ROLLOUT['extra_questions'], engine.CATALOG['extra_questions'])
        self.assertEqual(len(OPTIONAL_REGISTRATIONS), 57)
        registered = dict(OPTIONAL_REGISTRATIONS)
        for id, definition in engine.CATALOG['definitions'].items():
            with self.subTest(definition=id):
                rollout = engine.ROLLOUT['definitions'][id]
                native_group_count = len(definition['groups'])
                self.assertEqual({**rollout, 'groups': rollout['groups'][:native_group_count]}, definition)
                groups = rollout['groups'][native_group_count:]
                self.assertEqual(engine.current_version(id), engine.VERSION)
                if id not in registered:
                    self.assertEqual(groups, [])
                    continue
                self.assertEqual(len(groups), 1)
                self.assertEqual(groups[0]['id'], 'implementation_context')
                self.assertEqual(len(groups[0]['questions']), 1)
                question = groups[0]['questions'][0]
                self.assertEqual(question['id'], registered[id])
                self.assertEqual(question['type'], 'text')
                self.assertTrue(question['optional'])
                self.assertIsNone(question.get('condition'))
        existing = [q for q in engine._questions('A.8.24', ROLLOUT_VERSION)
                    if q['id'] == 'ISO-A.8.24-arrangement-note']
        self.assertEqual(len(existing), 1)
        self.assertEqual(existing[0]['type'], 'text')
        self.assertEqual(existing[0]['prompt'], 'Which cryptographic arrangement is used? (Optional)')

    def test_rollout_optional_keys_are_version_scoped_and_non_scoring(self):
        for id, key in OPTIONAL_REGISTRATIONS:
            with self.subTest(definition=id, question=key):
                answers = complete(id, ROLLOUT_VERSION)
                del answers[key]
                before = copy.deepcopy(answers)
                engine.validate_completion(id, answers, ROLLOUT_VERSION)
                baseline = engine.result_status(id, answers, ROLLOUT_VERSION)
                for value in ('', 'Not sure', 'Custom location — retained exactly', '\U0001f600' * 1000):
                    reported = {**answers, key: value}
                    snapshot = copy.deepcopy(reported)
                    engine.validate_completion(id, reported, ROLLOUT_VERSION)
                    self.assertEqual(engine.result_status(id, reported, ROLLOUT_VERSION), baseline)
                    self.assertEqual(reported, snapshot)
                    for version in (engine.LEGACY['version'], engine.V2['version']):
                        self.assert_rejected(lambda: engine.validate_answers(id, {key: value}, version), 422)
                for value in ('x' * 2001, '\U0001f600' * 1001, {}, True):
                    self.assert_rejected(lambda: engine.validate_answers(id, {key: value}, ROLLOUT_VERSION), 422)
                self.assert_rejected(lambda: engine.validate_answers('4.1', {key: 'Cross-record value'}, ROLLOUT_VERSION), 422)
                self.assertEqual(answers, before)

    def test_rollout_retains_v2_completion_and_native_status_for_all_definitions(self):
        for id in engine.CATALOG['definitions']:
            answers = complete(id)
            key = next(q['id'] for q in engine._active_questions(id, answers) if q['type'] == 'select')
            for value in engine.CHOICES:
                with self.subTest(definition=id, answer=value):
                    reported = {**answers, key: value}
                    snapshot = copy.deepcopy(reported)
                    engine.validate_completion(id, reported, engine.V2['version'])
                    engine.validate_completion(id, reported, ROLLOUT_VERSION)
                    self.assertEqual(engine.result_status(id, reported, ROLLOUT_VERSION),
                                     engine.result_status(id, reported, engine.V2['version']))
                    self.assertEqual(reported, snapshot)

    def test_native01_native02_preserve_proposal_without_a_reviewer_decision(self):
        for scenario, parent, detail in (('NATIVE01', 'additional_gap', 'gaps'),
                                        ('NATIVE02', 'additional_confirmation', 'unknowns')):
            for version in (engine.V2['version'], ROLLOUT_VERSION):
                with self.subTest(scenario=scenario, version=version):
                    reported = {**complete('A.8.13', version), parent: 'Yes',
                                detail: 'Specific reported work remains unresolved.'}
                    before = copy.deepcopy(reported)
                    engine.validate_completion('A.8.13', reported, version)
                    self.assertEqual(engine.result_status('A.8.13', reported, version), 'addressed')
                    self.assertEqual(reported, before)

    def test_prospective_iso_proposal_concern_precedence(self):
        cases = (
            ('affirmative gap overrides otherwise Yes core', 'Yes',
             {'additional_gap': 'Yes', 'gaps': 'A confirmed scoped backup gap remains.'}, 'needs_attention'),
            ('affirmative confirmation constrains otherwise Yes core', 'Yes',
             {'additional_confirmation': 'Yes', 'unknowns': 'Restore coverage remains unconfirmed.'}, 'not_assessed'),
            ('affirmative gap takes precedence over confirmation', 'Yes',
             {'additional_gap': 'Yes', 'gaps': 'A confirmed scoped backup gap remains.',
              'additional_confirmation': 'Yes', 'unknowns': 'Restore coverage remains unconfirmed.'}, 'needs_attention'),
            ('partial core retains its existing precedence over confirmation', 'Partially',
             {'additional_confirmation': 'Yes', 'unknowns': 'Restore coverage remains unconfirmed.'}, 'in_progress'),
            ('core No retains precedence over confirmation', 'No',
             {'additional_confirmation': 'Yes', 'unknowns': 'Restore coverage remains unconfirmed.'}, 'needs_attention'),
            ('affirmative gap overrides core uncertainty', 'Not sure',
             {'additional_gap': 'Yes', 'gaps': 'A confirmed scoped backup gap remains.'}, 'needs_attention'),
            ('affirmative gap constrains partial core', 'Partially',
             {'additional_gap': 'Yes', 'gaps': 'A confirmed scoped backup gap remains.'}, 'needs_attention'),
        )
        for scenario, core, concern, expected in cases:
            with self.subTest(scenario=scenario):
                answers = complete('A.8.13', engine.VERSION)
                first = next(question['id'] for question in engine._active_questions('A.8.13', answers)
                             if question['type'] == 'select')
                reported = {**answers, first: core, **concern}
                before = copy.deepcopy(reported)
                engine.validate_completion('A.8.13', reported)
                self.assertEqual(engine.result_status('A.8.13', reported), expected)
                self.assertEqual(reported, before)

    def test_prospective_iso_proposal_ignores_nonaffirmative_intent_and_unicode_blank_draft_detail(self):
        answers = complete('A.8.13', engine.VERSION)
        for intent in (None, 'No', 'Not sure'):
            with self.subTest(intent=intent):
                reported = {**answers, 'gaps': 'Retained hidden gap text.', 'unknowns': 'Retained hidden confirmation text.'}
                if intent is not None:
                    reported.update(additional_gap=intent, additional_confirmation=intent)
                before = copy.deepcopy(reported)
                engine.validate_completion('A.8.13', reported)
                self.assertEqual(engine.result_status('A.8.13', reported), 'addressed')
                self.assertEqual(reported, before)
        for parent, detail in (('additional_gap', 'gaps'), ('additional_confirmation', 'unknowns')):
            with self.subTest(blank_detail=detail):
                reported = {**answers, parent: 'Yes', detail: '\t\n\u00a0\u2003\ufeff '}
                before = copy.deepcopy(reported)
                self.assertEqual(engine.result_status('A.8.13', reported), 'addressed')
                self.assert_rejected(lambda: engine.validate_completion('A.8.13', reported), 422)
                self.assertEqual(reported, before)

    def test_prospective_iso_catalog_only_changes_version_and_preserves_historical_concern_status(self):
        self.assertEqual(engine.VERSION, PROSPECTIVE_VERSION)
        self.assertEqual(engine.PROSPECTIVE, {**engine.ROLLOUT, 'version': PROSPECTIVE_VERSION})
        self.assertTrue(engine.uses_concern_status())
        self.assertTrue(engine.uses_concern_status(PROSPECTIVE_VERSION))
        for version in (engine.LEGACY['version'], engine.V2['version'], ROLLOUT_VERSION, 'iso27001-unknown'):
            self.assertFalse(engine.uses_concern_status(version))
        with patch.object(engine, 'VERSION', ROLLOUT_VERSION):
            self.assertFalse(engine.uses_concern_status())
            self.assertTrue(engine.uses_concern_status(PROSPECTIVE_VERSION))
        answers = {**complete('A.8.13', ROLLOUT_VERSION), 'additional_gap': 'Yes', 'gaps': 'Exact retained R1 gap.'}
        before = copy.deepcopy(answers)
        self.assertEqual(engine.result_status('A.8.13', answers, ROLLOUT_VERSION), 'addressed')
        self.assertEqual(engine.result_status('A.8.13', answers, PROSPECTIVE_VERSION), 'needs_attention')
        self.assertEqual(answers, before)

    def test_prospective_iso_proposal_populated_unicode_detail_uses_existing_js_trim_boundary(self):
        for value in (' \u0085 ', ' \u200b ', '\u00a0Confirmed scoped gap.\ufeff'):
            with self.subTest(detail=value):
                answers = {**complete('A.8.13', engine.VERSION), 'additional_gap': 'Yes', 'gaps': value}
                before = copy.deepcopy(answers)
                engine.validate_completion('A.8.13', answers)
                self.assertEqual(engine.result_status('A.8.13', answers), 'needs_attention')
                self.assertEqual(answers, before)

    def test_unpatched_active_default_exposes_every_optional_context_field(self):
        added = 0
        for id in engine.CATALOG['definitions']:
            with self.subTest(definition=id):
                self.assertEqual(engine.current_version(id), PROSPECTIVE_VERSION)
                answers = complete(id, engine.VERSION)
                context = [q for group in engine.ROLLOUT['definitions'][id]['groups']
                           if group['id'] == 'implementation_context' for q in group['questions']]
                added += len(context)
                for question in context:
                    answers[question['id']] = 'Exact current context: ' + question['id']
                engine.validate_completion(id, answers)
                self.assertEqual(engine.result_status(id, answers), 'addressed')
        self.assertEqual(added, 57)

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

    @patch.object(engine, 'VERSION', 'iso27001-omni-2')
    def test_three_part_catalog_exact_123_ids_and_separate_version(self):
        # Original current-V2 characterization; the real unpatched default is checked above.
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
            if id == 'A.8.13':
                gap = {'additional_gap': 'Yes', 'gaps': 'Confirmed scoped gap.'}
                confirmation = {'additional_confirmation': 'Yes', 'unknowns': 'Scoped information remains unconfirmed.'}
                variants.extend([
                    {**answers, **gap}, {**answers, **confirmation}, {**answers, **gap, **confirmation},
                    {**answers, key: 'Partially', **confirmation}, {**answers, key: 'No', **confirmation},
                    {**answers, key: 'Not sure', **gap}, {**answers, key: 'Partially', **gap},
                    {**answers, 'additional_gap': 'Yes', 'gaps': '\u00a0\ufeff'},
                    {**answers, 'additional_gap': 'Yes', 'gaps': ' \u0085 '},
                    {**answers, 'additional_confirmation': 'Yes', 'unknowns': ' \u200b '},
                ])
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
for (const [name, file] of [['isms', 'guidedIsoIsms'], ['organizational', 'guidedIsoOrganizationalPeople'], ['technology', 'guidedIsoPhysicalTechnology'], ['currentCatalog', 'guidedIsoV2'], ['rolloutCatalog', 'guidedIso27001Rollout1'], ['prospectiveCatalog', 'guidedIso27001Rollout2']]) {
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
