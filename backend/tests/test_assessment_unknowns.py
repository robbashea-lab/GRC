"""Engine outcomes and native Item origins; no external client mutations."""
import unittest
from fastapi import HTTPException
import assessment_items
import soc_guided_assessment
import iso_guided_assessment
import guided_assessment


class AssessmentUnknownsTests(unittest.TestCase):
    def test_original_cis_pilot_preserves_mixed_follow_up_as_confirmation_without_inventing_gap(self):
        version=guided_assessment.LEGACY['version']
        for identity,root in [('1.1','inventory'),('1.2','process')]:
            with self.subTest(definition=identity):
                answers={root:'Not sure','gaps':'A recorded scope exclusion and an unresolved owner confirmation.'}
                row={'framework_key':'cis-ig1','framework_assessment_id':'isolated:'+identity,'definition_id':identity}
                items=assessment_items.generated(row,{'answers':answers,'version':version})
                self.assertIn(('gaps','verification'),[(item['question_id'],item['kind']) for item in items])
                self.assertFalse(any(item['kind']=='gap' for item in items))
                self.assertEqual(next(item for item in items if item['question_id']=='gaps')['text'],answers['gaps'])

    def test_current_control1_explicit_partial_keeps_gap_and_separate_unknown_cadence(self):
        catalog=guided_assessment.CONTROL1_V5
        for identity, definition in catalog['definitions'].items():
            with self.subTest(definition=identity):
                answers={definition['root']:'Partially','frequency':'Not sure'}
                row={'framework_key':'cis-ig1','framework_assessment_id':'isolated:'+identity,'definition_id':identity}
                items=assessment_items.generated(row,{'answers':answers,'version':catalog['version']})
                self.assertIn((definition['root'],'gap'),[(item['question_id'],item['kind']) for item in items])
                self.assertIn(('frequency','verification'),[(item['question_id'],item['kind']) for item in items])

    def test_mandatory_unknowns_do_not_invent_partial_implementation(self):
        for framework, engine in [('soc-2', soc_guided_assessment), ('iso-27001', iso_guided_assessment)]:
            for identity in engine.CATALOG['definitions']:
                with self.subTest(framework=framework, definition=identity):
                    answers = {q['id']: '' if q['type'] == 'text' else 'Relevant' if q['type'] == 'context' else 'Yes'
                               for q in engine._questions(identity)}
                    practices = [q for q in engine._active_questions(identity, answers) if q['type'] == 'select']
                    uncertain, known = practices[:2]
                    mixed = {**answers, uncertain['id']: 'Not sure'}
                    self.assertEqual(engine.result_status(identity, mixed), 'not_assessed')
                    self.assertEqual(engine.result_status(identity, {**mixed, known['id']: 'Partially'}), 'in_progress')
                    self.assertEqual(engine.result_status(identity, {**mixed, known['id']: 'No'}), 'needs_attention')

    def test_explicit_reported_notes_retain_origins_without_changing_status(self):
        for framework, engine in [('soc-2', soc_guided_assessment), ('iso-27001', iso_guided_assessment)]:
            for identity in engine.CATALOG['definitions']:
                with self.subTest(framework=framework, definition=identity):
                    answers = {q['id']: '' if q['type'] == 'text' else 'Relevant' if q['type'] == 'context' else 'Yes'
                               for q in engine._questions(identity)}
                    answers.update(gaps='The selected service has a reported coverage gap.', unknowns='The supporting record location needs confirmation.')
                    row = {'framework_key': framework, 'framework_assessment_id': 'test:' + identity, 'definition_id': identity}
                    self.assertEqual(engine.result_status(identity, answers), 'addressed')
                    self.assertEqual(assessment_items.generated(row, {'answers':answers,'version':engine.CATALOG['version']}), [])
                    answers.update(additional_gap='Yes',additional_confirmation='Yes')
                    engine.validate_completion(identity,answers)
                    origins = assessment_items.generated(row, {'answers': answers, 'version': engine.CATALOG['version']})
                    self.assertEqual([(item['question_id'], item['kind'], item['text']) for item in origins],
                                     [('gaps', 'gap', answers['gaps']), ('unknowns', 'verification', answers['unknowns'])])
                    self.assertEqual(engine.result_status(identity,answers),'addressed')
                    with self.assertRaises(HTTPException) as error:
                        engine.validate_completion(identity,{**answers,'gaps':''})
                    self.assertEqual(error.exception.status_code,422)
