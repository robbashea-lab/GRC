"""SOC engine-only checks; not HTTP authorization, persistence or hosted evidence."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import unittest
from unittest.mock import patch

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
    def test_prospective_proposal_active_default_includes_reported_work_in_status_precedence(self):
        cases = (
            ('affirmative gap', {'additional_gap': 'Yes', 'gaps': 'A scoped practice is confirmed missing.'}, 'needs_attention', False),
            ('affirmative confirmation', {'additional_confirmation': 'Yes', 'unknowns': 'Confirm the unresolved scoped practice.'}, 'not_assessed', False),
            ('gap before confirmation', {'additional_gap': 'Yes', 'gaps': 'A scoped practice is confirmed missing.',
                                         'additional_confirmation': 'Yes', 'unknowns': 'Confirm the unresolved scoped practice.'}, 'needs_attention', False),
            ('partial practice with confirmation', {'additional_confirmation': 'Yes', 'unknowns': 'Confirm the unresolved scoped practice.'}, 'in_progress', True),
        )
        for label, extra, expected, partial_practice in cases:
            with self.subTest(prospective_proposal=label):
                answers = {**complete('CC1.1'), **extra}
                if partial_practice:
                    answers[first_practice('CC1.1')['id']] = 'Partially'
                before = copy.deepcopy(answers)
                engine.validate_completion('CC1.1', answers)
                self.assertEqual(engine.result_status('CC1.1', answers), expected)
                self.assertEqual(answers, before)

    def test_rollout_is_active_without_reinterpreting_prior_versions(self):
        self.assertEqual(engine.current_version('CC1.1'), 'soc2-assessment-rollout-2')
        self.assertEqual(engine.ROLLOUT['version'], 'soc2-assessment-rollout-1')
        self.assertEqual(list(engine.ROLLOUT['definitions']), list(engine.CATALOG['definitions']))
        self.assertEqual(engine.ROLLOUT['extra_questions'], engine.CATALOG['extra_questions'])
        added = 0
        for id, definition in engine.ROLLOUT['definitions'].items():
            with self.subTest(criterion=id):
                previous = engine.CATALOG['definitions'][id]
                self.assertEqual(definition['groups'][:-1], previous['groups'])
                for field in ('title', 'category', 'objective', 'source_page'):
                    self.assertEqual(definition[field], previous[field])
                context = definition['groups'][-1]
                self.assertEqual(context['id'], 'implementation_context')
                self.assertEqual(context['title'], 'Implementation context')
                self.assertEqual([q['id'] for q in context['questions'][:3]],
                    [id + '-implementation-method', id + '-responsible-owner', id + '-operating-schedule'])
                for question in context['questions']:
                    self.assertEqual(question['type'], 'text')
                    self.assertIs(question['optional'], True)
                    self.assertNotIn('condition', question)
                    self.assertNotIn('default', question)
                added += len(context['questions'])
        self.assertEqual(added, 220)
        for version in ('soc2-omni-2', 'soc2-assessment-rollout-1'):
            self.assertTrue(engine.uses_intent_gates(version))
            self.assertTrue(engine.uses_inline_sentences(version))
        for version in ('soc2-omni-1', 'foreign-version'):
            self.assertFalse(engine.uses_intent_gates(version))
            self.assertFalse(engine.uses_inline_sentences(version))

    def test_prospective_proposal_catalog_and_feature_preserve_all_historical_readers(self):
        self.assertEqual(engine.PROPOSAL['version'], 'soc2-assessment-rollout-2')
        self.assertEqual({**engine.PROPOSAL, 'version': engine.ROLLOUT['version']}, engine.ROLLOUT)
        self.assertTrue(engine.uses_reported_work_status(engine.PROPOSAL['version']))
        self.assertTrue(engine.uses_intent_gates(engine.PROPOSAL['version']))
        self.assertTrue(engine.uses_inline_sentences(engine.PROPOSAL['version']))
        for version in (engine.LEGACY['version'], engine.CATALOG['version'], engine.ROLLOUT['version'], 'foreign-version'):
            self.assertFalse(engine.uses_reported_work_status(version))

    def test_prospective_proposal_preserves_core_precedence_for_every_criterion(self):
        for id in engine.PROPOSAL['definitions']:
            practice = first_practice(id)['id']
            cases = (
                ({'additional_gap': 'Yes', 'gaps': 'A confirmed scoped deficiency.'}, 'needs_attention'),
                ({'additional_confirmation': 'Yes', 'unknowns': 'The scoped practice needs confirmation.'}, 'not_assessed'),
                ({'additional_gap': 'Yes', 'gaps': 'A confirmed scoped deficiency.',
                  'additional_confirmation': 'Yes', 'unknowns': 'The scoped practice needs confirmation.'}, 'needs_attention'),
                ({practice: 'Partially', 'additional_confirmation': 'Yes', 'unknowns': 'The scoped practice needs confirmation.'}, 'in_progress'),
                ({practice: 'No', 'additional_confirmation': 'Yes', 'unknowns': 'The scoped practice needs confirmation.'}, 'needs_attention'),
            )
            for extra, expected in cases:
                with self.subTest(criterion=id, extra=extra):
                    answers = {**complete(id), **extra}
                    before = copy.deepcopy(answers)
                    engine.validate_completion(id, answers)
                    self.assertEqual(engine.result_status(id, answers), expected)
                    self.assertEqual(answers, before)

    def test_prospective_proposal_requires_affirmative_populated_details_with_javascript_whitespace(self):
        for field, intent, expected in (('gaps', 'additional_gap', 'needs_attention'),
                                        ('unknowns', 'additional_confirmation', 'not_assessed')):
            for invalid in (True, 'yes', 'Maybe', {}):
                self.assert_rejected(lambda: engine.validate_answers('CC1.1', {intent: invalid}), 422)
            for value in (None, 'No', 'Not sure'):
                answers = {**complete('CC1.1'), field: 'Retained text without affirmative intent.'}
                if value is not None:
                    answers[intent] = value
                engine.validate_completion('CC1.1', answers)
                self.assertEqual(engine.result_status('CC1.1', answers), 'addressed')
            for blank in ('', ' \n\t', '\ufeff', '\u00a0\u2028\u3000'):
                answers = {**complete('CC1.1'), intent: 'Yes', field: blank}
                self.assert_rejected(lambda: engine.validate_completion('CC1.1', answers), 422)
                self.assertEqual(engine.result_status('CC1.1', answers), 'addressed')
            self.assert_rejected(lambda: engine.validate_completion('CC1.1', {**complete('CC1.1'), intent: 'Yes'}), 422)
            for detail in ('\ufeff Reconcile café / 核对 😀 \u00a0', '\u0085', '\u001c'):
                answers = {**complete('CC1.1'), intent: 'Yes', field: detail}
                before = copy.deepcopy(answers)
                engine.validate_completion('CC1.1', answers)
                self.assertEqual(engine.result_status('CC1.1', answers), expected)
                self.assertEqual(answers, before)

    def test_unpatched_active_default_exposes_every_optional_context_field(self):
        added = 0
        for id in engine.CATALOG['definitions']:
            with self.subTest(criterion=id):
                self.assertEqual(engine.current_version(id), engine.PROPOSAL['version'])
                active = engine._questions(id)
                answers = {q['id']: 'Exact current context: ' + q['id'] if q['type'] == 'text'
                           else 'Relevant' if q['type'] == 'context' else 'Yes' for q in active}
                context = engine.PROPOSAL['definitions'][id]['groups'][-1]['questions']
                added += len(context)
                self.assertTrue(all(q['id'] in answers for q in context))
                engine.validate_completion(id, answers)
                self.assertEqual(engine.result_status(id, answers), 'addressed')
        self.assertEqual(added, 220)

    def test_rollout_optional_context_is_strict_non_scoring_and_not_accepted_by_old_versions(self):
        version = engine.ROLLOUT['version']
        for id, definition in engine.ROLLOUT['definitions'].items():
            with self.subTest(criterion=id):
                optional = definition['groups'][-1]['questions']
                supplied = {q['id']: 'Other source — scope unconfirmed; reported by the owner.' for q in optional}
                answers = {**complete(id), **supplied}
                before = copy.deepcopy(answers)
                engine.validate_completion(id, complete(id), version)
                engine.validate_completion(id, answers, version)
                self.assertEqual(engine.result_status(id, answers, version), engine.result_status(id, complete(id)))
                self.assertEqual(engine.result_status(id, supplied, version), 'not_assessed')
                self.assert_rejected(lambda: engine.validate_completion(id, supplied, version), 422)
                self.assertEqual(answers, before)
                for question in optional:
                    key = question['id']
                    engine.validate_answers(id, {key: ''}, version)
                    engine.validate_answers(id, {key: '\U0001f600' * 1000}, version)
                    for bad in (True, [], {}, 'x' * 2001, '\U0001f600' * 1001):
                        self.assert_rejected(lambda: engine.validate_answers(id, {key: bad}, version), 422)
                    for prior in ('soc2-omni-1', 'soc2-omni-2'):
                        self.assert_rejected(lambda: engine.validate_answers(id, {key: 'Custom source'}, prior), 422)
                self.assert_rejected(lambda: engine.validate_answers(id, {id + '-unregistered-context': 'Unknown'}, version), 422)

    def test_native01_02_preserves_the_held_additional_gap_confirmation_proposal(self):
        for id in engine.CATALOG['definitions']:
            for version in (engine.CATALOG['version'], engine.ROLLOUT['version']):
                for extra in (
                    {'additional_gap': 'Yes', 'gaps': 'A substantive scoped practice is missing.'},
                    {'additional_confirmation': 'Yes', 'unknowns': 'Confirm the unresolved coverage.'},
                    {'additional_gap': 'Yes', 'gaps': 'A substantive scoped practice is missing.',
                     'additional_confirmation': 'Yes', 'unknowns': 'Confirm the unresolved coverage.'},
                ):
                    with self.subTest(criterion=id, version=version, extra=extra):
                        answers = {**complete(id), **extra}
                        before = copy.deepcopy(answers)
                        engine.validate_completion(id, answers, version)
                        # Characterization only: do not change the native evaluator to resolve this hold.
                        self.assertEqual(engine.result_status(id, answers, version), 'addressed')
                        self.assertEqual(answers, before)
                        for key in ('gaps', 'unknowns'):
                            if key in extra:
                                self.assert_rejected(lambda: engine.validate_completion(id, {**answers, key: ' \n'}, version), 422)

    def test_explicit_v1_retains_historical_uncertainty_semantics(self):
        self.assertEqual(engine.LEGACY['version'], 'soc2-omni-1')
        for id in engine.LEGACY['definitions']:
            with self.subTest(criterion=id):
                answers = {**complete(id), first_practice(id)['id']: 'Not sure', 'gaps': 'Historical context'}
                engine.validate_completion(id, answers, engine.LEGACY['version'])
                self.assertEqual(engine.result_status(id, answers, engine.LEGACY['version']), 'in_progress')

    def assert_rejected(self, operation, status):
        with self.assertRaises(HTTPException) as error:
            operation()
        self.assertEqual(error.exception.status_code, status)
        self.assertLess(len(error.exception.detail), 200)

    @patch.object(engine, 'CURRENT_VERSION', 'soc2-omni-2')
    def test_catalog_exact_coverage_and_version_is_separate_from_cis(self):
        # Original current-V2 characterization; the real unpatched default is checked above.
        self.assertEqual(engine.CATALOG['version'], 'soc2-omni-2')
        self.assertEqual(engine.CATALOG['framework_id'], 'soc-2')
        self.assertEqual(set(engine.CATALOG['definitions']), {row['id'] for row in SOC['requirements']})
        self.assertEqual(len(engine.CATALOG['definitions']), 61)
        counts = {}
        for id, definition in engine.CATALOG['definitions'].items():
            self.assertEqual(engine.current_version(id), 'soc2-omni-2')
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
                for value, expected in [('No', 'needs_attention'), ('Partially', 'in_progress'), ('Not sure', 'not_assessed')]:
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

    @patch.object(engine, 'CURRENT_VERSION', 'soc2-omni-2')
    def test_scope_fingerprint_is_exact_and_changes_with_authoritative_lineage(self):
        # Retain the exact historical V2 fingerprint oracle rather than reinterpret it.
        row = {'client_id': 'synthetic-soc-client', 'framework_assessment_id': 'synthetic-CC1.1',
               'framework_key': 'soc-2', 'framework_version': SOC['version'], 'definition_id': 'CC1.1',
               'owner_id': 'synthetic-owner', 'process_owner_id': 'synthetic-process-owner',
               'last_saved': '2026-10-10T10:00:00Z', 'last_assessed': '2026-10-01T10:00:00Z'}
        client = {'client_id': row['client_id'], 'soc_configuration_updated_at': '2026-10-09T10:00:00Z',
                  'framework_settings': {'soc-2': {'categories': ['security', 'privacy']}}}
        scope = {key: row[key] for key in ['client_id', 'framework_key', 'framework_version', 'definition_id', 'owner_id', 'process_owner_id']}
        scope.update(assessment_id=row['framework_assessment_id'], question_version='soc2-omni-2',
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
        for id, definition in engine.ROLLOUT['definitions'].items():
            optional = {q['id']: 'Custom source and reported scope.' for q in definition['groups'][-1]['questions']}
            for extra in ({}, {'additional_gap': 'Yes', 'gaps': 'A substantive scoped practice is missing.'},
                          {'additional_confirmation': 'Yes', 'unknowns': 'Confirm the unresolved coverage.'}):
                answers = {**complete(id), **optional, **extra}
                engine.validate_completion(id, answers, engine.ROLLOUT['version'])
                fixtures.append({'id': id, 'answers': answers, 'version': engine.ROLLOUT['version'],
                                 'status': engine.result_status(id, answers, engine.ROLLOUT['version']), 'completed': True,
                                 'signals': ([['gaps', 'gap']] if 'gaps' in extra else [])
                                            + ([['unknowns', 'verification']] if 'unknowns' in extra else [])})
        for id in engine.PROPOSAL['definitions']:
            practice = first_practice(id)['id']
            for extra, expected in (
                ({'additional_gap': 'Yes', 'gaps': 'A confirmed scoped deficiency.'}, 'needs_attention'),
                ({'additional_confirmation': 'Yes', 'unknowns': 'The scoped practice needs confirmation.'}, 'not_assessed'),
                ({'additional_gap': 'Yes', 'gaps': 'A confirmed scoped deficiency.',
                  'additional_confirmation': 'Yes', 'unknowns': 'The scoped practice needs confirmation.'}, 'needs_attention'),
                ({practice: 'Partially', 'additional_confirmation': 'Yes', 'unknowns': 'The scoped practice needs confirmation.'}, 'in_progress'),
                ({practice: 'No', 'additional_confirmation': 'Yes', 'unknowns': 'The scoped practice needs confirmation.'}, 'needs_attention'),
            ):
                answers = {**complete(id), **extra}
                engine.validate_completion(id, answers, engine.PROPOSAL['version'])
                self.assertEqual(engine.result_status(id, answers, engine.PROPOSAL['version']), expected)
                fixtures.append({'id': id, 'answers': answers, 'version': engine.PROPOSAL['version'],
                                 'status': expected, 'completed': True})
        for field, intent, expected in (('gaps', 'additional_gap', 'needs_attention'),
                                        ('unknowns', 'additional_confirmation', 'not_assessed')):
            for detail in ('', '\u00a0\u2028\u3000\ufeff', '\ufeff Reconcile café / 核对 😀 \u00a0', '\u0085', '\u001c'):
                answers = {**complete('CC1.1'), intent: 'Yes', field: detail}
                populated = bool(detail.strip(engine.TEXT_WHITESPACE))
                fixtures.append({'id': 'CC1.1', 'answers': answers, 'version': engine.PROPOSAL['version'],
                                 'status': expected if populated else 'addressed', 'completed': populated})
        root = Path(__file__).resolve().parents[2]
        script = """
import fs from 'node:fs';
const root = process.argv[1];
const catalog = fs.readFileSync(root + '/shared/catalogs/guidedSoc2.json', 'utf8');
const inline = fs.readFileSync(root + '/frontend/src/lib/inlineAssessment.js', 'utf8');
const inlineUrl = 'data:text/javascript;base64,' + Buffer.from(inline).toString('base64');
const source = fs.readFileSync(root + '/frontend/src/lib/socGuidedAssessment.js', 'utf8')
  .replace("import catalog from '@catalogs/guidedSoc2.json';", 'const catalog = ' + catalog + ';')
  .replace("import legacyCatalog from '@catalogs/guidedSoc2V1.json';", 'const legacyCatalog = ' + fs.readFileSync(root + '/shared/catalogs/guidedSoc2V1.json', 'utf8') + ';')
  .replace("import rolloutCatalog from '@catalogs/guidedSoc2Rollout1.json';", 'const rolloutCatalog = ' + fs.readFileSync(root + '/shared/catalogs/guidedSoc2Rollout1.json', 'utf8') + ';')
  .replace("import proposalCatalog from '@catalogs/guidedSoc2Rollout2.json';", 'const proposalCatalog = ' + fs.readFileSync(root + '/shared/catalogs/guidedSoc2Rollout2.json', 'utf8') + ';')
  .replace(/from ['"]\\.\\/inlineAssessment['"]/g, 'from ' + JSON.stringify(inlineUrl));
const engine = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const fixtures = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = fixtures.map(({id, answers, version}) => {
  let completed = true;
  try { engine.validateSocCompletion(id, answers, version); } catch { completed = false; }
  const result = engine.socGuidedResult(id, answers, version);
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
                if 'signals' in fixture:
                    self.assertEqual([[signal['questionId'], signal['kind']] for signal in output['result']['signals']], fixture['signals'])


if __name__ == '__main__':
    unittest.main()
