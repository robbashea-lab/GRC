"""ISO interview validation and reported implementation; native SoA stays separate."""
import hashlib
import json

from fastapi import HTTPException
import authorization
from framework_catalog import ROOT, client_configuration, definition_for

VERSION = 'iso27001-omni-1'
CATALOG = {'version': VERSION, 'framework_id': 'iso-27001', 'definitions': {}}
for filename in ('guidedIsoIsms.json', 'guidedIsoOrganizationalPeople.json', 'guidedIsoPhysicalTechnology.json'):
    part = json.loads((ROOT / filename).read_text(encoding='utf-8'))
    if part['version'] != VERSION or part['framework_id'] != 'iso-27001' or CATALOG['definitions'].keys() & part['definitions'].keys():
        raise ValueError('Incompatible or duplicate ISO interview definitions')
    CATALOG['definitions'].update(part['definitions'])
VERSIONS = {VERSION: CATALOG}
CHOICES = ['Yes', 'Partially', 'No', 'Not sure']
CONTEXT_CHOICES = ['Relevant', 'Not relevant here', 'Not sure']
EXTRA_KEYS = {'gaps', 'unknowns', 'evidence'}
TEXT_WHITESPACE = ' \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


def _text(answers, key):
    return answers.get(key, '').strip(TEXT_WHITESPACE)


def _definition(id, version=None):
    catalog = VERSIONS.get(version or VERSION)
    if not catalog or id not in catalog['definitions']:
        raise HTTPException(409, 'ISO question set is not available')
    return catalog['definitions'][id]


def current_version(id):
    _definition(id)
    return VERSION


def _questions(id, version=None):
    return [{**question, 'type': question.get('type', 'select'),
             'choices': CONTEXT_CHOICES if question.get('type') == 'context' else CHOICES,
             'conditions': [condition for condition in (group.get('condition'), question.get('condition')) if condition]}
            for group in _definition(id, version)['groups'] for question in group['questions']]


def _active_questions(id, answers, version=None):
    questions = _questions(id, version)
    by_id = {question['id']: question for question in questions}

    def active(question, seen=frozenset()):
        if question['id'] in seen:
            return False
        return all(condition['id'] in by_id and answers.get(condition['id']) == condition['equals']
                   and active(by_id[condition['id']], seen | {question['id']})
                   for condition in question['conditions'])

    return [question for question in questions if active(question)]


def check_scope(row, client):
    if (row.get('framework_key') != 'iso-27001' or not row.get('client_id') or not client
            or client.get('client_id') != row['client_id']
            or row.get('definition_id') not in CATALOG['definitions']
            or not definition_for('iso-27001', row.get('definition_id'))):
        raise HTTPException(404, 'ISO guided assessment is not enabled for this requirement')


async def require_active(s, row, client):
    check_scope(row, client)
    if not await s.db.requirements.find_one(
            {'client_id': row['client_id'], 'baseline_key': 'iso-27001', 'baseline_response': 'applies'}):
        raise HTTPException(404, 'ISO guided assessment is not active for this client')


async def write_context(s, aid, user):
    """Recheck the live actor, assignment and program after acquiring the ISO lease."""
    actor = await s.db.users.find_one({'user_id': user['user_id'], 'status': 'active'}, {'_id': 0})
    if not actor or actor.get('password_change_required'):
        raise HTTPException(403, 'ISO write access is no longer available')
    row = await s._authorized_parent('framework_assessments', aid, actor, True)
    authorization.require_assigned(actor, 'framework_assessments', row)
    client = await s.db.clients.find_one({'client_id': row['client_id']}, {'_id': 0})
    if client and client.get('status') == 'archived' and authorization.role_of(actor) != authorization.OWNER:
        raise HTTPException(403, 'Archived clients are read-only')
    await require_active(s, row, client)
    return row, client, actor


def validate_answers(id, answers, version=None):
    questions = {question['id']: question for question in _questions(id, version)}
    questions.update({key: {'type': 'text'} for key in EXTRA_KEYS})
    if not isinstance(answers, dict):
        raise HTTPException(422, 'Invalid ISO interview answers')
    for key, value in answers.items():
        detail = isinstance(key, str) and key.endswith('_detail')
        question = questions.get(key[:-7] if detail else key) if isinstance(key, str) else None
        if (not question or not isinstance(value, str)
                or len(value.encode('utf-16-le', errors='surrogatepass')) // 2 > 2000
                or not detail and question['type'] != 'text' and value not in question['choices']):
            raise HTTPException(422, 'Invalid ISO interview answer')


def validate_completion(id, answers, version=None):
    validate_answers(id, answers, version)
    for question in _active_questions(id, answers, version):
        if question['type'] == 'text':
            continue
        if not answers.get(question['id']):
            raise HTTPException(422, 'Answer each applicable ISO question before completing the interview')
        if (question['type'] == 'context' and answers[question['id']] == 'Not relevant here'
                and not _text(answers, question['id'] + '_detail')):
            raise HTTPException(422, 'Explain why this conditional context is not relevant here')


def result_status(id, answers, version=None):
    validate_answers(id, answers, version)
    meaningful = partial = confirmed_no = False
    for question in _active_questions(id, answers, version):
        value = answers.get(question['id'])
        if question['type'] == 'text':
            continue
        if question['type'] == 'context':
            if value != 'Relevant' and not (value == 'Not relevant here' and _text(answers, question['id'] + '_detail')):
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
    scope = {'client_id': row['client_id'], 'assessment_id': row['framework_assessment_id'],
             'framework_key': row['framework_key'], 'framework_version': row.get('framework_version'),
             'definition_id': row['definition_id'],
             'question_version': current_version(row['definition_id']),
             'owner_id': row.get('owner_id'), 'process_owner_id': row.get('process_owner_id'),
             'configuration': client_configuration('iso-27001', client),
             'soa_applicability': row.get('soa_applicability') or '',
             'soa_justification': row.get('soa_justification') or ''}
    return {'base_assessment_token': row.get('last_saved') or row.get('last_assessed'),
            'base_scope_fingerprint': hashlib.sha256(json.dumps(scope, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}
