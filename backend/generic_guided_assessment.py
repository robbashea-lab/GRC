"""Source-qualified interviews for native HIPAA, CSF and CMMC assessments."""
import hashlib
import json

from fastapi import HTTPException
from framework_catalog import ROOT, active_definitions, client_configuration, definition_for

CATALOG = json.loads((ROOT / 'r4FrameworkGuidance.json').read_text(encoding='utf-8'))
FRAMEWORKS = tuple(CATALOG['frameworks'])
VERSIONS = {CATALOG['version_prefix'] + key: key for key in FRAMEWORKS}


def current_version(ident, framework):
    if framework not in FRAMEWORKS or not definition_for(framework, ident):
        raise HTTPException(404, 'Interview is unavailable for this requirement')
    return CATALOG['version_prefix'] + framework


def check_scope(row, client):
    key = row['framework_key']
    if key not in FRAMEWORKS or row['definition_id'] not in {
            d['id'] for d in active_definitions(key, client_configuration(key, client))}:
        raise HTTPException(404, 'Interview is outside the active program scope')


def visible_questions(answers):
    return [q for q in CATALOG['questions'] if not q.get('when') or all(
        answers.get(key) in values for key, values in q['when'].items())]


def validate_answers(ident, answers, version):
    key = VERSIONS.get(version)
    if not key or not definition_for(key, ident):
        raise HTTPException(409, 'Question set is unavailable')
    if not isinstance(answers, dict):
        raise HTTPException(422, 'Invalid interview answers')
    definitions = {q['id']: q for q in CATALOG['questions']}
    for name, value in answers.items():
        question = definitions.get(name)
        if (not question or not isinstance(value, str) or len(value) > 2000
                or question['type'] == 'select' and value not in question['choices']):
            raise HTTPException(422, 'Invalid interview answer')


def validate_completion(ident, answers, version):
    validate_answers(ident, answers, version)
    if any(q.get('required') and not (answers.get(q['id']) or '').strip()
           for q in visible_questions(answers)):
        raise HTTPException(422, 'Record each required answer and explanation before reviewing the draft')


def result_status(ident, answers, version):
    validate_completion(ident, answers, version)
    if answers['practice'] == 'No':
        return 'needs_attention'
    if answers['practice'] == 'Not sure':
        return 'not_assessed'
    if (answers['practice'] == 'Partially' or answers['gap'] != 'No'
            or answers['unknown'] != 'No'):
        return 'in_progress'
    return 'addressed'


def origins(answers):
    output = {}
    if answers.get('practice') in ('No', 'Partially'):
        output[('practice', 'gap')] = 'The practice is reported ' + ('not in place.' if answers['practice'] == 'No' else 'partially in place.')
    elif answers.get('practice') != 'Yes':
        output[('practice', 'verification')] = 'Confirm whether the practice is in place within the actual scope.'
    if answers.get('gap') == 'Yes':
        output[('gap_reason', 'gap')] = answers['gap_reason'].strip()
    elif answers.get('gap') == 'Not sure':
        output[('gap', 'verification')] = 'Confirm whether a source-specific deficiency exists.'
    if answers.get('unknown') == 'Yes':
        output[('unknown_reason', 'verification')] = answers['unknown_reason'].strip()
    elif answers.get('unknown') == 'Not sure':
        output[('unknown', 'verification')] = 'Confirm the substantive requirement information before concluding implementation.'
    return output


def current_base(row, client):
    configuration = client_configuration(row['framework_key'], client)
    scope = {'client_id': row['client_id'], 'assessment_id': row['framework_assessment_id'],
             'framework_key': row['framework_key'], 'framework_version': row.get('framework_version'),
             'definition_id': row['definition_id'],
             'question_version': current_version(row['definition_id'], row['framework_key']),
             'configuration': configuration, 'owner_id': row.get('owner_id'),
             'process_owner_id': row.get('process_owner_id')}
    return {'base_assessment_token': row.get('last_saved') or row.get('last_assessed'),
            'base_scope_fingerprint': hashlib.sha256(json.dumps(
                scope, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}
