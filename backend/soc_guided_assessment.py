"""SOC-specific interview validation and reported-readiness evaluation; no writes."""
import hashlib
import json

from fastapi import HTTPException
from framework_catalog import ROOT, client_configuration

CATALOG = json.loads((ROOT / 'guidedSoc2.json').read_text(encoding='utf-8'))
VERSIONS = {CATALOG['version']: CATALOG}
CHOICES = ['Yes', 'Partially', 'No', 'Not sure']
CONTEXT_CHOICES = ['Relevant', 'Outside the selected system', 'Not sure']
EXTRA_KEYS = {'gaps', 'unknowns', 'evidence'}
# Match JavaScript trim for deterministic browser/server outcome and completion checks.
TEXT_WHITESPACE = ' \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


def _text(answers, key):
    return answers.get(key, '').strip(TEXT_WHITESPACE)


def _definition(id, version=None):
    catalog = VERSIONS.get(version or CATALOG['version'])
    if not catalog or id not in catalog['definitions']:
        raise HTTPException(409, 'SOC question set is not available')
    return catalog['definitions'][id]


def current_version(id):
    _definition(id)
    return CATALOG['version']


def _questions(id, version=None):
    return [{**question, 'type': question.get('type', 'select'),
             'choices': question.get('choices', CONTEXT_CHOICES if question.get('type') == 'context' else CHOICES)}
            for group in _definition(id, version)['groups'] for question in group['questions']]


def _active_questions(id, answers, version=None):
    questions = _questions(id, version)
    by_id = {question['id']: question for question in questions}

    def active(question, seen=frozenset()):
        condition = question.get('condition')
        if not condition:
            return True
        parent = by_id.get(condition['id'])
        return bool(parent and question['id'] not in seen
                    and answers.get(parent['id']) == condition['equals']
                    and active(parent, seen | {question['id']}))

    return [question for question in questions if active(question)]


def check_scope(row, client):
    configuration = client_configuration('soc-2', client)
    definition = CATALOG['definitions'].get(row.get('definition_id'))
    categories = configuration.get('categories')
    if (row.get('framework_key') != 'soc-2' or not row.get('client_id') or not client
            or client.get('client_id') != row['client_id'] or not definition
            or not isinstance(categories, list) or 'security' not in categories
            or any(category not in {d['category'] for d in CATALOG['definitions'].values()} for category in categories)
            or definition['category'] not in categories):
        raise HTTPException(404, 'SOC guided assessment is not enabled for this criterion')


def validate_answers(id, answers, version=None):
    questions = {question['id']: question for question in _questions(id, version)}
    questions.update({key: {'type': 'text'} for key in EXTRA_KEYS})
    if not isinstance(answers, dict):
        raise HTTPException(422, 'Invalid SOC interview answers')
    for key, value in answers.items():
        detail = isinstance(key, str) and key.endswith('_detail')
        question = questions.get(key[:-7] if detail else key) if isinstance(key, str) else None
        if (not question or not isinstance(value, str) or len(value.encode('utf-16-le', errors='surrogatepass')) // 2 > 2000
                or not detail and question['type'] != 'text' and value not in question['choices']):
            raise HTTPException(422, 'Invalid SOC interview answer')


def validate_completion(id, answers, version=None):
    validate_answers(id, answers, version)
    for question in _active_questions(id, answers, version):
        if question['type'] == 'text':
            continue
        if not answers.get(question['id']):
            raise HTTPException(422, 'Answer each applicable SOC question before completing the interview')
        if (question['type'] == 'context' and answers[question['id']] == 'Outside the selected system'
                and not _text(answers, question['id'] + '_detail')):
            raise HTTPException(422, 'Explain why the selected context is outside the system')


def result_status(id, answers, version=None):
    validate_answers(id, answers, version)
    meaningful = False
    partial = False
    confirmed_no = False
    for question in _active_questions(id, answers, version):
        value = answers.get(question['id'])
        if question['type'] == 'text':
            continue
        if question['type'] == 'context':
            if value != 'Relevant' and not (value == 'Outside the selected system'
                                           and _text(answers, question['id'] + '_detail')):
                partial = True
            continue
        meaningful |= value in ('Yes', 'Partially')
        confirmed_no |= value == 'No'
        partial |= value != 'Yes'
    if confirmed_no:
        return 'needs_attention'
    if not meaningful:
        return 'not_assessed'
    return 'in_progress' if partial else 'addressed'


def current_base(row, client):
    check_scope(row, client)
    configuration = client_configuration('soc-2', client)
    scope = {'client_id': row['client_id'], 'assessment_id': row['framework_assessment_id'],
             'framework_key': row['framework_key'], 'framework_version': row.get('framework_version'),
             'definition_id': row['definition_id'], 'question_version': current_version(row['definition_id']),
             'categories': sorted(configuration['categories']),
             'system_description': configuration.get('system_description') or '',
             'period_start': configuration.get('period_start') or '',
             'period_end': configuration.get('period_end') or '',
             'configuration_token': configuration.get('expected_updated_at'),
             'owner_id': row.get('owner_id'), 'process_owner_id': row.get('process_owner_id')}
    return {'base_assessment_token': row.get('last_saved') or row.get('last_assessed'),
            'base_scope_fingerprint': hashlib.sha256(json.dumps(scope, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}
