"""Private checkpoints for the approved v3 interview and its reviewed implementation."""
import json
import re
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator
from pymongo.errors import DuplicateKeyError

import create_requests
import authorization
from approved_v3 import SOURCE_MARK, SOURCE_SHA256
from framework_catalog import active_definitions, client_configuration


class SourceGuideRef(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    version: str = Field(pattern='^[a-f0-9]{64}$')
    revision: int = Field(ge=1)
    digest: str = Field(pattern='^[a-f0-9]{64}$')


class SourceCheckpoint(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    stage: Literal['intro', 'q', 'review', 'draft', 'applied']
    idx: int = Field(ge=0, le=256)
    ans: dict[str, JsonValue] = Field(max_length=256)
    draft: str | None = Field(default=None, max_length=40000)

    @field_validator('ans')
    @classmethod
    def bounded_answers(cls, values):
        if len(json.dumps(values, ensure_ascii=False).encode()) > 100000:
            raise ValueError('Interview answers exceed the saved interview size')
        def validate(node, depth):
            if depth > 10:
                raise ValueError('Interview answer nesting exceeds the supported depth')
            if isinstance(node, dict):
                for key, value in node.items():
                    if not key or len(key) > 256 or key.startswith('$') or '.' in key or '\x00' in key or key in ('__proto__', 'constructor', 'prototype'):
                        raise ValueError('Invalid interview answer field')
                    validate(value, depth + 1)
            elif isinstance(node, list):
                for value in node:
                    validate(value, depth + 1)
        validate(values, 0)
        return values


class SourceGuideWrite(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    version: str = Field(pattern='^[a-f0-9]{64}$')
    expected_revision: int = Field(ge=0)
    expected_assessment_token: str | None = Field(max_length=100)
    expected_client_updated_at: str | None = Field(max_length=100)
    checkpoint: SourceCheckpoint
    reviewed: bool = False

    @model_validator(mode='after')
    def require_reviewable_text(self):
        if self.reviewed != (self.checkpoint.stage == 'applied'):
            raise ValueError('Only an explicitly reviewed draft may be applied')
        if self.reviewed and not reviewed_text(self.checkpoint.draft):
            raise ValueError('Review the implementation wording before applying it')
        return self


def reviewed_text(draft):
    return re.split(r'\n\s*\n(?=Identified gaps|Items requiring confirmation)', draft or '', 1)[0].strip()


def identity(row, user):
    return create_requests.digest([SOURCE_SHA256, row['client_id'], row['framework_assessment_id'], user['user_id']])


async def check_scope(s, row, client):
    if client.get('approved_v3_source') != SOURCE_MARK:
        raise HTTPException(404, 'This client has no approved v3 workspace')
    key = row['framework_key']
    if not await s.db.requirements.find_one({'client_id': row['client_id'], 'baseline_key': key, 'baseline_response': 'applies'}) or not any(
            d['id'] == row['definition_id'] for d in active_definitions(key, client_configuration(key, client))):
        raise HTTPException(409, 'The interview is outside the active program scope')


def check_position(row, client, assessment_token, client_token):
    if (row.get('last_saved') or row.get('last_assessed')) != assessment_token or client.get('updated_at') != client_token:
        raise HTTPException(409, 'The assessment or client context changed; reopen the interview')


async def read(s, row, client, user):
    await check_scope(s, row, client)
    return await s.db.approved_v3_guidance.find_one({'_id': identity(row, user)}, {'_id': 0}) or {
        'version': SOURCE_SHA256, 'revision': 0, 'checkpoint': None, 'reviewed': False}


async def save(s, row, client, user, body):
    await check_scope(s, row, client)
    authorization.require_assigned(user, 'framework_assessments', row)
    if body.version != SOURCE_SHA256:
        raise HTTPException(409, 'This interview version changed; reopen the assessment')
    check_position(row, client, body.expected_assessment_token, body.expected_client_updated_at)
    key = identity(row, user)
    payload = body.model_dump()
    digest = create_requests.digest(payload)
    revision = body.expected_revision + 1
    stored = {k: row[k] for k in ('client_id', 'framework_assessment_id', 'framework_key', 'definition_id')}
    stored.update(user_id=user['user_id'], version=SOURCE_SHA256, revision=revision, digest=digest,
                  checkpoint=payload['checkpoint'], reviewed=body.reviewed, saved_at=s._now(),
                  assessment_token=body.expected_assessment_token, client_token=body.expected_client_updated_at)

    async def execute(_):
        query = {'_id': key, 'revision': body.expected_revision}
        try:
            result = await s.db.approved_v3_guidance.update_one(query, {'$set': stored}, upsert=body.expected_revision == 0)
            accepted = result.matched_count == 1 or result.upserted_id is not None
        except DuplicateKeyError:
            accepted = False
        if not accepted:
            previous = await s.db.approved_v3_guidance.find_one({'_id': key, 'revision': revision, 'digest': digest}, {'_id': 0})
            if not previous:
                raise HTTPException(409, 'Interview progress changed; reopen the saved interview')
        else:
            previous = stored
        if body.reviewed:
            await s.db.approved_v3_guidance_versions.update_one({'_id': create_requests.digest([key, revision, digest])},
                {'$setOnInsert': previous}, upsert=True)
        await s.audit(user, 'Approved v3 interview reviewed' if body.reviewed else 'Approved v3 interview checkpoint saved',
                      'framework_assessment', row['framework_assessment_id'], row['client_id'], meta={'version': SOURCE_SHA256, 'revision': revision})
        return {'version': SOURCE_SHA256, 'revision': revision, 'digest': digest, 'saved_at': previous['saved_at']}

    return await create_requests.run(s.db, digest, user['user_id'], row['client_id'],
                                     '/framework_assessments/' + row['framework_assessment_id'] + '/approved-guide', {'digest': digest}, execute)


async def verify_application(s, row, client, user, reference, implementation):
    authorization.require_assigned(user, 'framework_assessments', row)
    saved = await read(s, row, client, user)
    if not saved.get('reviewed') or any(saved.get(k) != v for k, v in reference.model_dump().items()):
        raise HTTPException(409, 'Reopen and review the saved v3 interview before applying it')
    check_position(row, client, saved['assessment_token'], saved['client_token'])
    if implementation is None or implementation != reviewed_text(saved['checkpoint']['draft']):
        raise HTTPException(422, 'Save the implementation wording reviewed in the v3 interview')
    return {**reference.model_dump(), 'by': user['user_id'], 'reviewed_at': saved['saved_at']}
