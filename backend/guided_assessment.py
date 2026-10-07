"""Client-scoped versioned Control 1 interviews; assessment writes remain separate."""
import json
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from fastapi import HTTPException
from framework_catalog import ROOT, client_configuration

LEGACY = json.loads((ROOT / 'guidedAssessmentPilot.json').read_text(encoding='utf-8'))
CATALOG = json.loads((ROOT / 'guidedControl1.json').read_text(encoding='utf-8'))
CATALOG['safeguards'] = {**LEGACY['safeguards'], **json.loads((ROOT / 'guidedControl1Additional.json').read_text(encoding='utf-8'))['safeguards']}
for safeguard in ('1.1', '1.2'):
    CATALOG['safeguards'][safeguard] = [*CATALOG['safeguards'][safeguard], {'id': 'unknowns', 'type': 'text'}]
VERSIONS = {LEGACY['version']: LEGACY, CATALOG['version']: CATALOG}

class InterviewWrite(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    version: str = Field(max_length=100)
    answers: dict = Field(default_factory=dict)
    step: int = Field(default=0, ge=0, le=30)
    completed: bool = False
    narrative: str = Field(default='',max_length=20000)
    expected_revision: int = Field(default=0, ge=0)

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
    catalog = VERSIONS.get(version or CATALOG['version'])
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
                valid = isinstance(value, dict) and all(k in q['rows'] and v in q['choices'] for k, v in value.items())
            elif q['type'] == 'multi':
                valid = isinstance(value, list) and all(isinstance(v, str) and v in q['choices'] for v in value) and len(value) == len(set(value))
            else:
                valid = isinstance(value, str) and value in q['choices']
        if not valid:
            raise HTTPException(422, 'Invalid guided interview answer')

async def read_draft(s, row, user):
    return await s.db.guided_assessment_pilot.find_one(
        {'_id': row['framework_assessment_id'] + ':' + user['user_id'], 'client_id': row['client_id']}, {'_id': 0}) or {
        'version': CATALOG['version'], 'answers': {}, 'step': 0, 'completed': False, 'revision': 0}

async def save_draft(s, row, user, body):
    if body.version != CATALOG['version']:
        raise HTTPException(409, 'Question set changed; reload the interview')
    validate_answers(row['definition_id'], body.answers)
    identity = row['framework_assessment_id'] + ':' + user['user_id']
    old = await read_draft(s, row, user)
    if old['revision'] != body.expected_revision:
        raise HTTPException(409, 'Interview changed in another window; reload before saving')
    at = s._now()
    # Preserve the complete previous interview on restart/version transition, including
    # its original narrative. Its identity makes repeated attempts idempotent.
    if old['revision'] and (old['version'] != body.version or old['completed'] and not body.completed and not body.answers):
        await s.db.guided_assessment_history.update_one(
            {'_id': identity + ':' + str(old['revision'])},
            {'$setOnInsert': {**old, 'client_id': row['client_id'], 'assessment_id': row['framework_assessment_id'], 'user_id': user['user_id']}}, upsert=True)
    data = {**body.model_dump(exclude={'expected_revision'}), 'client_id': row['client_id'],
            'assessment_id': row['framework_assessment_id'], 'user_id': user['user_id'],
            'revision': old['revision'] + 1, 'updated_at': at, 'generated_at': at if body.completed else None}
    if old['revision']:
        result = await s.db.guided_assessment_pilot.update_one({'_id': identity, 'revision': old['revision']}, {'$set': data})
        if not result.matched_count:
            raise HTTPException(409, 'Interview changed; reload before saving')
    else:
        from pymongo.errors import DuplicateKeyError
        try:
            await s.db.guided_assessment_pilot.insert_one({'_id': identity, **data})
        except DuplicateKeyError as error:
            raise HTTPException(409, 'Interview changed; reload before saving') from error
    return data
