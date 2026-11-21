"""Native Actions for confirmation/evidence Items, committed with their originating link."""
from copy import deepcopy
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

import action_items
import assessment_items
import authorization
import create_requests
import portfolio_activity
import r4_services


class ItemTask(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    expected_revision: int = Field(ge=0)
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(default='', max_length=20000)
    priority: Literal['low', 'medium', 'high', 'critical'] = 'medium'
    assignee_id: str | None = Field(default=None, max_length=200)
    due_date: str | None = Field(default=None, max_length=100)

    @field_validator('title')
    @classmethod
    def nonblank_title(cls, value):
        if not value.strip():
            raise ValueError('An Action title is required')
        return value.strip()


async def current_authority(s, row, user, identity=None):
    await r4_services.assessment_writer(s, row, user, identity)


async def authorize_plan(s, writes, user, identity, assessment_item):
    """Only this exact assessment-plus-new-Action link may use ordinary assigned-writer authority."""
    aid, iid = assessment_item
    if len(writes) != 2:
        raise HTTPException(409, 'The retained Item Action plan is invalid')
    assessment, task = writes
    if (assessment['collection'], assessment['id_field'], assessment['id'], assessment['new']) != (
            'framework_assessments', 'framework_assessment_id', aid, False) or (
            task['collection'], task['id_field'], task['id'], task['new']) != (
            'tasks', 'task_id', 'tsk_' + identity, True):
        raise HTTPException(409, 'The retained Item Action identity is invalid')
    row = await s.db.framework_assessments.find_one({'framework_assessment_id': aid}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Assessment not found')
    await current_authority(s, row, user, identity)
    before, patch, document = assessment['preconditions'], assessment['patch'], task['document']
    if (set(before) != {'client_id', 'framework_key', 'items_to_address', 'items_revision', 'last_saved', 'last_assessed'}
            or before['client_id'] != row['client_id'] or before['framework_key'] != row['framework_key']
            or assessment['client_id'] != row['client_id'] or task['client_id'] != row['client_id']
            or any(key not in {'items_to_address', 'items_revision'} and not key.startswith('_portfolio_activity') for key in patch)
            or task['patch'] or task['preconditions']):
        raise HTTPException(409, 'The retained Item Action write scope is invalid')
    original = next((item for item in before['items_to_address'] if item['item_id'] == iid), None)
    if not original or not assessment_items.task_eligible(row, original):
        raise HTTPException(409, 'Only an open confirmation or Evidence Item can create an Action')
    expected = deepcopy(before['items_to_address'])
    target = next(item for item in expected if item['item_id'] == iid)
    actual = next((item for item in patch.get('items_to_address', []) if item['item_id'] == iid), None)
    if not actual or not isinstance(actual.get('updated_at'), str):
        raise HTTPException(409, 'The retained Item Action relationship is invalid')
    target.update(task_id=task['id'], updated_at=actual['updated_at'])
    target.setdefault('history', []).append({'at': actual['updated_at'], 'by': user['user_id'],
        'event': 'task_linked', 'state': original['state'], 'resolution': original.get('resolution', ''), 'task_id': task['id']})
    if patch.get('items_to_address') != expected or patch.get('items_revision') != (before['items_revision'] or 0) + 1:
        raise HTTPException(409, 'The retained Item Action must preserve every other Item field')
    native_fields = set(s.TaskIn.model_fields)
    metadata = {'task_id', 'created_at', 'updated_at', 'created_by', 'framework_assessment_id', 'framework_key', 'assessment_item_id'}
    if (any(key not in native_fields | metadata and not key.startswith('_portfolio_activity') for key in document) or document.get('task_id') != task['id']
            or document.get('client_id') != row['client_id'] or document.get('framework_assessment_id') != aid
            or document.get('framework_key') != row['framework_key'] or document.get('assessment_item_id') != iid
            or document.get('created_by') != user['user_id'] or document.get('status') != 'open'
            or document.get('source_type') != 'other' or document.get('source_id') is not None):
        raise HTTPException(409, 'The retained Action provenance is invalid')
    parsed = s.TaskIn(**{key: value for key, value in document.items() if key in native_fields}).model_dump()
    await authorization.require_creation_assignee(s.db, user, row['client_id'], parsed.get('assignee_id'))
    await action_items.prepare(s.db, parsed, s._can_access_client)


async def create(s, aid, iid, body, user, key):
    candidate = await s.db.framework_assessments.find_one({'framework_assessment_id': aid}, {'_id': 0})
    if not candidate or not s._can_access_client(user, candidate['client_id']):
        raise HTTPException(404, 'Assessment not found')
    route, payload = '/framework_assessments/' + aid + '/items/' + iid + '/task', body.model_dump()
    retained = await r4_services.authorize_retained_command(s, key, user, candidate['client_id'], route,
        payload, assessment_item=(aid, iid))
    await current_authority(s, candidate, user, retained)

    async def execute(identity):
        receipt = await s.db.create_requests.find_one({'_id': identity})
        writes = receipt.get('r4_write_plan')
        if writes is None:
            row = await s._authorized_parent('framework_assessments', aid, user, True)
            await current_authority(s, row, user)
            if body.expected_revision != row.get('items_revision', 0):
                raise HTTPException(409, 'Items changed in another window; refresh before creating work')
            item = assessment_items.current_item(row, iid)
            if not assessment_items.task_eligible(row, item):
                raise HTTPException(409, 'Only an unlinked open confirmation or Evidence Item can create an Action')
            task_input = {key: getattr(body, key) for key in ('title', 'description', 'priority', 'assignee_id', 'due_date')}
            task_input.update(client_id=row['client_id'], status='open', source_type='other', source_id=None,
                source=row['framework_key'] + ' ' + row['definition_id'] + ' assessment Item')
            parsed = s.TaskIn(**s._editable_patch('tasks', task_input, user=user)).model_dump()
            await authorization.require_creation_assignee(s.db, user, row['client_id'], parsed.get('assignee_id'))
            parsed = await action_items.prepare(s.db, parsed, s._can_access_client)
            at, tid = s._now(), 'tsk_' + identity
            task = {**parsed, 'task_id': tid, 'created_at': at, 'updated_at': at, 'created_by': user['user_id'],
                'framework_assessment_id': aid, 'framework_key': row['framework_key'], 'assessment_item_id': iid}
            task_capture, _ = s._portfolio_event_patch('task', tid, row['client_id'], user, None, task, at, 'create')
            task.update(task_capture)
            items = deepcopy(row.get('items_to_address', []))
            target = next(item for item in items if item['item_id'] == iid)
            target.update(task_id=tid, updated_at=at)
            target.setdefault('history', []).append({'at': at, 'by': user['user_id'], 'event': 'task_linked',
                'state': target['state'], 'resolution': target.get('resolution', ''), 'task_id': tid})
            changes = {'items_to_address': items, 'items_revision': row.get('items_revision', 0) + 1}
            capture, _ = s._portfolio_event_patch('framework_assessment', aid, row['client_id'], user, row, {**row, **changes}, at)
            before = {field: row.get(field) for field in ('client_id', 'framework_key', 'items_to_address', 'items_revision', 'last_saved', 'last_assessed')}
            writes = [r4_services.write_row('framework_assessments', 'framework_assessment_id', row,
                {**changes, **capture}, preconditions=before),
                r4_services.write_row('tasks', 'task_id', task, {}, new=True)]
        async def finish_native_task():
            stored = await s._authorized_parent('tasks', 'tsk_' + identity, user)
            await s._finish_entity_create('tasks', stored, user)
        await r4_services.apply_plan(s, writes, identity, user, 'Assessment Item Action created',
            assessment_item=(aid, iid), after_apply=finish_native_task)
        return {'task_id': 'tsk_' + identity}

    result = await create_requests.run(s.db, key, user['user_id'], candidate['client_id'], route, payload, execute)
    task = await s._authorized_parent('tasks', result['task_id'], user)
    return portfolio_activity.public_source(action_items.view(task))
