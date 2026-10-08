"""Client-scoped versioned CIS interviews; assessment writes remain separate."""
import json
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field
from fastapi import HTTPException
from framework_catalog import ROOT, client_configuration

LEGACY = json.loads((ROOT / 'guidedAssessmentPilot.json').read_text(encoding='utf-8'))
CONTROL1 = json.loads((ROOT / 'guidedControl1.json').read_text(encoding='utf-8'))
CONTROL1['safeguards'] = {**LEGACY['safeguards'], **json.loads((ROOT / 'guidedControl1Additional.json').read_text(encoding='utf-8'))['safeguards']}
for safeguard in ('1.1', '1.2'):
    CONTROL1['safeguards'][safeguard] = [*CONTROL1['safeguards'][safeguard], {'id': 'unknowns', 'type': 'text'}]
PROGRAM = json.loads((ROOT / 'guidedCisProgram.json').read_text(encoding='utf-8'))
PROGRAM_V1 = json.loads((ROOT / 'guidedCisProgramV1.json').read_text(encoding='utf-8'))
CONTROL1_V3 = json.loads((ROOT / 'guidedControl1V3.json').read_text(encoding='utf-8'))

def program_questions(definition):
    questions = [{'id': 'practice', 'type': 'select', 'choices': ['Yes', 'Partially', 'No', 'Not sure']}]
    for conditional in (False, True):
        elements = [e for e in definition['elements'] if e['conditional'] == conditional]
        for offset in range(0, len(elements), 5):
            questions.append({'id': ('conditional' if conditional else 'requirements') + '_' + str(offset),
                'type': 'matrix', 'rows': [e['text'] for e in elements[offset:offset + 5]],
                'choices': ['Yes', 'Partially', 'No', 'Not sure'] + (['Not applicable'] if conditional else [])})
    questions.extend({'id': key, 'type': 'text'} for key in ('existing', 'scope_reason', 'system', 'owner', 'operation', 'evidence', 'gaps', 'unknowns'))
    return questions

def program_catalog(source):
    return {**source, 'definitions': {
        **{id: {**d, 'question_set_version': CONTROL1['version']} for id, d in CONTROL1['definitions'].items()},
        **{id: {**d, 'question_set_version': source['version']} for id, d in source['definitions'].items()}},
        'safeguards': {**CONTROL1['safeguards'], **{id: program_questions(d) for id, d in source['definitions'].items()}}}

PROGRAM1_CATALOG = program_catalog(PROGRAM_V1)
CURRENT_PROGRAM = program_catalog(PROGRAM)
CATALOG = {**CURRENT_PROGRAM,
    'definitions': {**CURRENT_PROGRAM['definitions'], **{id: {**d, 'question_set_version': CONTROL1_V3['version']} for id, d in CONTROL1_V3['definitions'].items()}},
    'safeguards': {**CURRENT_PROGRAM['safeguards'], **CONTROL1_V3['safeguards']}}
VERSIONS = {LEGACY['version']: LEGACY, CONTROL1['version']: CONTROL1, PROGRAM_V1['version']: PROGRAM1_CATALOG, CONTROL1_V3['version']: CONTROL1_V3, PROGRAM['version']: CATALOG}

def current_version(id, upgraded=False):
    catalog = CATALOG if upgraded else PROGRAM1_CATALOG
    return catalog['definitions'][id]['question_set_version']

class ResultAnswer(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    prompt: str = Field(max_length=4000)
    answer: str = Field(max_length=12000)

class ResultSignal(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    kind: Literal['gap', 'verification']
    questionId: str = Field(max_length=100)
    text: str | None = Field(default=None, max_length=4000)

class ResultSnapshot(BaseModel):
    """Recorded client-reported output; never evidence review or authorization."""
    model_config = ConfigDict(extra='forbid', strict=True)
    version: str | None = Field(default=None, max_length=100)
    status: Literal['not_assessed', 'needs_attention', 'in_progress', 'addressed']
    narrative: str = Field(max_length=20000)
    basis: list[Annotated[str, Field(max_length=4000)]] = Field(max_length=153)
    gaps: list[Annotated[str, Field(max_length=4000)]] = Field(max_length=153)
    unknowns: list[Annotated[str, Field(max_length=4000)]] = Field(max_length=153)
    nextSteps: list[Annotated[str, Field(max_length=4000)]] = Field(max_length=153)
    evidence: list[Annotated[str, Field(max_length=4000)]] = Field(max_length=153)
    answers: list[ResultAnswer] = Field(max_length=300)
    signals: list[ResultSignal] | None = Field(default=None, max_length=300)

class InterviewWrite(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    version: str = Field(max_length=100)
    answers: dict = Field(default_factory=dict)
    step: int = Field(default=0, ge=0, le=30)
    completed: bool = False
    narrative: str = Field(default='',max_length=20000)
    expected_revision: int = Field(default=0, ge=0)
    base_assessment_token: str | None = Field(default=None, max_length=100)
    base_scope_fingerprint: str | None = Field(default=None, max_length=64, pattern=r'^[a-f0-9]{64}$')
    restart: bool = False
    result: ResultSnapshot | None = None

class GuidedSource(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    version: str = Field(max_length=100)
    revision: int = Field(ge=1)
    generated_at: str = Field(max_length=100)

def check_scope(row, client):
    configuration = client_configuration('cis-ig1', client)
    definition = CATALOG['definitions'].get(row['definition_id'])
    if (row['framework_key'] != CATALOG['framework_id'] or not definition
        or configuration.get('guided_assessment_enabled') is False
        or configuration['implementation_group'] not in definition['groups']):
        raise HTTPException(404, 'Guided pilot is not enabled for this assessment')

def validate_answers(id, answers, version=None):
    catalog = VERSIONS.get(version or current_version(id))
    if not catalog or id not in catalog['safeguards']:
        raise HTTPException(409, 'Question set is not available')
    definitions = {q['id']: q for q in catalog['safeguards'][id]}
    for key, value in answers.items():
        detail = key.endswith('_detail')
        q = definitions.get(key[:-7] if detail else key)
        valid = q is not None
        if valid:
            if detail or q['type'] in ('text', 'date'):
                valid = isinstance(value, str) and len(value) <= 2000
            elif q['type'] == 'matrix':
                valid = isinstance(value, dict) and all(k in q['rows'] and v in q.get('row_choices', {}).get(k, q['choices']) for k, v in value.items())
            elif q['type'] == 'multi':
                valid = isinstance(value, list) and all(isinstance(v, str) and v in q['choices'] for v in value) and len(value) == len(set(value))
            else:
                valid = isinstance(value, str) and value in q['choices']
        if not valid:
            raise HTTPException(422, 'Invalid guided interview answer')

_PILOT = json.loads((ROOT / 'omniWorkspacePilot.json').read_text(encoding='utf-8'))

def upgraded_pilot(row, user):
    cid = row.get('client_id')
    if not user or not cid:
        return False
    return cid == _PILOT['demoClientId'] if user.get('workspace_mode') == 'demo' else cid in _PILOT['stagingClientIds']

def current_base(row, client):
    import hashlib
    configuration = client_configuration('cis-ig1', client)
    scope = {'client_id': row['client_id'], 'assessment_id': row['framework_assessment_id'],
             'framework_key': row['framework_key'], 'framework_version': row.get('framework_version'),
             'definition_id': row['definition_id'], 'question_version': current_version(row['definition_id'], upgraded=True),
             'implementation_group': configuration['implementation_group'],
             'configuration_token': configuration.get('expected_updated_at'),
             'owner_id': row.get('owner_id'), 'process_owner_id': row.get('process_owner_id'),
             'provider': (row.get('cis_operation') or {}).get('provider')}
    return {'base_assessment_token': row.get('last_saved') or row.get('last_assessed'),
            'base_scope_fingerprint': hashlib.sha256(json.dumps(scope, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}

def lineage_known(draft):
    fingerprint = draft.get('base_scope_fingerprint')
    return ('base_assessment_token' in draft and isinstance(fingerprint, str) and len(fingerprint) == 64
            and (draft['base_assessment_token'] is None or isinstance(draft['base_assessment_token'], str)))

def require_current_lineage(draft, row, client):
    if not lineage_known(draft):
        raise HTTPException(409, 'This interview has no recorded assessment base; begin a new review before applying')
    if any(draft.get(key) != value for key, value in current_base(row, client).items()):
        raise HTTPException(409, 'Assessment or scope changed after this review began; compare the saved record and begin a new review')

async def stored_draft(s, row, user):
    return await s.db.guided_assessment_pilot.find_one(
        {'_id': row['framework_assessment_id'] + ':' + user['user_id'], 'client_id': row['client_id']}, {'_id': 0})

async def read_draft(s, row, user, client=None, upgraded=False):
    old = await stored_draft(s, row, user)
    if not upgraded:
        return old or {'version': current_version(row['definition_id']), 'answers': {}, 'step': 0, 'completed': False, 'revision': 0}
    client = client if client is not None else await s.db.clients.find_one({'client_id': row['client_id']}, {'_id': 0})
    base = current_base(row, client)
    draft = old or {
        'version': current_version(row['definition_id'], upgraded=True), 'answers': {}, 'step': 0,
        'completed': False, 'revision': 0, **base}
    known = lineage_known(draft)
    return {**draft, 'current_assessment_token': base['base_assessment_token'],
            'current_scope_fingerprint': base['base_scope_fingerprint'], 'lineage_known': known,
            'lineage_stale': any(draft.get(key) != value for key, value in base.items()) if known else None}

async def read_history(s, row, user, limit=25, before_revision=None):
    query = {'client_id': row['client_id'], 'assessment_id': row['framework_assessment_id'], 'user_id': user['user_id']}
    if before_revision is not None:
        query['revision'] = {'$lt': before_revision}
    records = await s.db.guided_assessment_history.find(query, {'_id': 0}).sort('revision', -1).to_list(limit + 1)
    more = len(records) > limit
    items = records[:limit]
    # Pagination describes available snapshots, not completeness of legacy interview history.
    return {'items': items, 'has_more': more, 'next_before_revision': items[-1]['revision'] if more else None}

async def save_draft(s, row, user, body, client=None, upgraded=False):
    if not upgraded:
        if body.model_fields_set & {'base_assessment_token', 'base_scope_fingerprint', 'restart', 'result'}:
            raise HTTPException(422, 'Upgraded interview fields are not available for this client')
        if body.version != current_version(row['definition_id']):
            raise HTTPException(409, 'Question set changed; reload the interview')
        validate_answers(row['definition_id'], body.answers, body.version)
    identity = row['framework_assessment_id'] + ':' + user['user_id']
    old = await stored_draft(s, row, user) or {'revision': 0}
    if old['revision'] != body.expected_revision:
        raise HTTPException(409, 'Interview changed in another window; reload before saving')
    base = {}
    if upgraded:
        current = current_version(row['definition_id'], upgraded=True)
        if body.restart and (body.version != current or body.answers or body.completed or body.step != 0 or body.narrative):
            raise HTTPException(422, 'Restart must begin an empty current-version review')
        if body.version != current and (not old['revision'] or body.version != old['version'] or body.restart):
            raise HTTPException(409, 'Question set changed; continue the saved version or explicitly restart')
        if old['revision'] and body.version != old['version'] and not body.restart:
            raise HTTPException(409, 'Changing question sets requires an explicit empty restart')
        if body.result is not None and not body.completed:
            raise HTTPException(422, 'A recorded result belongs to a completed interview')
        if body.result is not None and body.result.version is not None and body.result.version != body.version:
            raise HTTPException(422, 'Recorded result question version must match the interview')
        validate_answers(row['definition_id'], body.answers, body.version)
        client = client if client is not None else await s.db.clients.find_one({'client_id': row['client_id']}, {'_id': 0})
        if not old['revision'] or body.restart:
            base = current_base(row, client)
            if not all(key in body.model_fields_set and getattr(body, key) == value for key, value in base.items()):
                raise HTTPException(409, 'Assessment or scope changed before this review started; reload before starting')
        else:
            base = {key: old[key] for key in ('base_assessment_token', 'base_scope_fingerprint') if key in old}
            if any(key in body.model_fields_set and getattr(body, key) != old.get(key) for key in base):
                raise HTTPException(409, 'The saved interview base cannot be replaced; explicitly restart for a new review')
    at = s._now()
    # Archive a saved state before replacement. A losing CAS may leave this valid
    # prior-state snapshot; it is not evidence that a restart/edit succeeded.
    archive = old['revision'] and ((old['completed'] or body.restart) if upgraded else (
        old['version'] != body.version or old['completed'] and not body.completed and not body.answers))
    if old['revision'] and archive:
        await s.db.guided_assessment_history.update_one(
            {'_id': identity + ':' + str(old['revision'])},
            {'$setOnInsert': {**old, 'client_id': row['client_id'], 'assessment_id': row['framework_assessment_id'], 'user_id': user['user_id']}}, upsert=True)
    data = {**body.model_dump(exclude={'expected_revision', 'base_assessment_token', 'base_scope_fingerprint', 'restart', 'result'}), **base, 'client_id': row['client_id'],
            'assessment_id': row['framework_assessment_id'], 'user_id': user['user_id'],
            'revision': old['revision'] + 1, 'updated_at': at, 'generated_at': at if body.completed else None}
    if upgraded:
        data['result'] = body.result.model_dump(exclude_none=True) if body.result is not None else None
    if old['revision']:
        predicate = {'_id': identity, 'revision': old['revision']}
        if upgraded:
            predicate['client_id'] = row['client_id']
        result = await s.db.guided_assessment_pilot.update_one(predicate, {'$set': data})
        if not result.matched_count:
            raise HTTPException(409, 'Interview changed; reload before saving')
    else:
        from pymongo.errors import DuplicateKeyError
        try:
            await s.db.guided_assessment_pilot.insert_one({'_id': identity, **data})
        except DuplicateKeyError as error:
            raise HTTPException(409, 'Interview changed; reload before saving') from error
    if not upgraded:
        return data
    current_context = current_base(row, client)
    known = lineage_known(data)
    return {**data, 'current_assessment_token': current_context['base_assessment_token'],
            'current_scope_fingerprint': current_context['base_scope_fingerprint'], 'lineage_known': known,
            'lineage_stale': any(data.get(key) != value for key, value in current_context.items()) if known else None}
