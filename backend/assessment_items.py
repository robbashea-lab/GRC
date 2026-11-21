"""Assessment-local reported follow-up; completion never changes assessment judgment."""
from copy import deepcopy
import calendar
import re
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
import create_requests
import guided_assessment
import iso_guided_assessment
import soc_guided_assessment
import generic_guided_assessment


class ItemPatch(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    expected_revision: int = Field(ge=0)
    state: Literal['open', 'resolved']
    resolution: str = Field(default='', max_length=4000)


class ManualItem(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    request_id: str = Field(pattern=r'^[A-Za-z0-9_-]{16,128}$')
    item_type: Literal['gap', 'confirmation', 'evidence']
    text: str = Field(min_length=1, max_length=4000)

    @field_validator('text')
    @classmethod
    def nonblank_text(cls, value):
        if not value.strip():
            raise ValueError('Describe the item before adding it')
        return value.strip()


class ItemAdd(ManualItem):
    expected_revision: int = Field(ge=0)


class ItemRemove(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    expected_revision: int = Field(ge=0)


class ItemTarget(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    item_id: str | None = Field(default=None, min_length=1, max_length=500)
    question_id: str | None = Field(default=None, min_length=1, max_length=200)
    kind: Literal['gap', 'verification'] | None = None
    manual_request_id: str | None = Field(default=None, pattern=r'^[A-Za-z0-9_-]{16,128}$')

    @model_validator(mode='after')
    def one_identity(self):
        modes = [self.item_id is not None, self.question_id is not None or self.kind is not None,
                 self.manual_request_id is not None]
        if sum(modes) != 1 or modes[1] and (self.question_id is None or self.kind is None):
            raise ValueError('Use exactly one saved, guided or pending manual Item identity')
        return self


class AddOperation(ManualItem):
    operation: Literal['add']


class ResolveOperation(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    operation: Literal['resolve']
    target: ItemTarget
    state: Literal['open', 'resolved']
    resolution: str = Field(default='', max_length=4000)


class RemoveOperation(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    operation: Literal['remove']
    target: ItemTarget


class ItemDraft(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    expected_revision: int = Field(ge=0)
    operations: list[Annotated[AddOperation | ResolveOperation | RemoveOperation,
                               Field(discriminator='operation')]] = Field(min_length=1, max_length=100)


def manual_id(row, request_id):
    return 'item_' + uuid.uuid5(uuid.NAMESPACE_URL,
        row['framework_assessment_id'] + ':manual:' + request_id).hex


def known_manual(row, item):
    request, kind, item_type = item.get('request_id'), item.get('kind'), item.get('item_type')
    history = item.get('history')
    return (item.get('origin') == 'manual' and isinstance(request, str)
        and re.fullmatch(r'[A-Za-z0-9_-]{16,128}', request) is not None
        and item.get('item_id') == manual_id(row, request)
        and item_type in ('gap', 'confirmation', 'evidence')
        and kind == ('gap' if item_type == 'gap' else 'verification')
        and isinstance(item.get('text'), str) and 0 < len(item['text'].strip()) <= 4000
        and item.get('state') in ('open', 'resolved', 'removed')
        and isinstance(item.get('resolution'), str) and len(item['resolution']) <= 4000
        and isinstance(history, list) and bool(history) and isinstance(history[0], dict)
        and history[0].get('event') == 'added' and history[0].get('state') == 'open'
        and history[0].get('text') == item['text'] and isinstance(history[0].get('by'), str)
        and bool(history[0]['by']) and history[0].get('at') == item.get('created_at')
        and isinstance(item.get('created_at'), str) and bool(item['created_at']))


def known_guided(row, item):
    """Retained rows need a real catalog origin; unknown history grants no edit authority."""
    if item.get('origin') not in (None, 'guided') or item.get('kind') not in ('gap', 'verification'):
        return False
    question, version, framework = item.get('question_id'), item.get('source_version'), row['framework_key']
    if not isinstance(question, str) or not question or not isinstance(version, str) or not version or not isinstance(item.get('source_fingerprint'), str) or not re.fullmatch(r'[0-9a-f]{64}', item['source_fingerprint']):
        return False
    expected_type = 'gap' if item['kind'] == 'gap' else 'evidence' if question == 'evidence' else 'confirmation'
    if item.get('item_type', expected_type) != expected_type:
        return False
    if item.get('item_id') != item_id(row, question, item['kind']):
        return False
    if framework in generic_guided_assessment.FRAMEWORKS:
        if generic_guided_assessment.VERSIONS.get(version) != framework:
            return False
        questions = generic_guided_assessment.CATALOG['questions']
    elif framework in ('iso-27001', 'soc-2'):
        engine = iso_guided_assessment if framework == 'iso-27001' else soc_guided_assessment
        if version not in engine.VERSIONS:
            return False
        questions = engine._questions(row['definition_id'], version)
    else:
        questions = guided_assessment.VERSIONS.get(version, {}).get('safeguards', {}).get(row['definition_id'])
        if questions is None:
            return False
    return question in {q['id'] for q in questions} | {'summary_confirmation', 'scope_reason', 'evidence', 'gaps', 'unknowns'}


def add_manual(row, items, body, actor, at):
    identity = manual_id(row, body.request_id)
    previous = next((item for item in items if item['item_id'] == identity), None)
    if previous:
        if not known_manual(row, previous) or any(previous.get(key) != value for key, value in {
                'origin': 'manual', 'request_id': body.request_id, 'item_type': body.item_type, 'text': body.text}.items()):
            raise HTTPException(409, 'This Item request already has different content')
        return False  # Lost responses must not duplicate, reopen or rewrite an existing Item.
    items.append({'item_id': identity, 'origin': 'manual', 'request_id': body.request_id,
        'item_type': body.item_type, 'kind': 'gap' if body.item_type == 'gap' else 'verification',
        'text': body.text, 'state': 'open', 'resolution': '', 'finding_id': None,
        'created_at': at, 'updated_at': at,
        'history': [{'at': at, 'by': actor, 'event': 'added', 'state': 'open', 'text': body.text}]})
    return True


def remove_item(row, item, actor, at):
    manual = known_manual(row, item)
    if not manual and not (known_guided(row, item) and item['state'] in ('resolved', 'removed')):
        raise HTTPException(409, 'Only a manual Item or a resolved known interview Item can be removed')
    if item['state'] == 'removed':
        return False
    item.update(previous_state=item['state'], state='removed', updated_at=at)
    item.setdefault('history', []).append({'at': at, 'by': actor, 'event': 'removed',
        'state': 'removed', 'resolution': item.get('resolution', '')})
    return True


def task_eligible(row, item):
    return (item.get('kind') == 'verification' and item.get('state') == 'open'
        and not item.get('finding_id') and not item.get('task_id')
        and (known_manual(row, item) or known_guided(row, item)))


def with_item_controls(row):
    """Derived UI affordances only; leave the stored Item array and its history exact."""
    controls = {}
    for item in row.get('items_to_address') or []:
        if not isinstance(item, dict) or not isinstance(item.get('item_id'), str) or not item['item_id']:
            continue
        manual, guided = known_manual(row, item), known_guided(row, item)
        current = item.get('state') not in ('superseded', 'removed')
        controls[item['item_id']] = {'origin': 'manual' if manual else 'guided' if guided else 'unknown',
            'can_remove': bool(current and (manual or guided and item.get('state') == 'resolved')),
            'can_create_action': task_eligible(row, item),
            'can_create_finding': bool((manual or guided) and item.get('kind') == 'gap' and item.get('state') == 'open'
                and not item.get('finding_id') and not item.get('task_id'))}
    return {**row, 'item_controls': controls}


def apply_draft(row, items, draft, actor, at, *, allow_replay=False):
    """Apply typed local Item edits only inside the assessment's explicit atomic Save."""
    stale = draft.expected_revision != row.get('items_revision', 0)
    if stale and not allow_replay:
        raise HTTPException(409, 'Items changed in another window; refresh before saving')
    original, items = items, deepcopy(items)
    for operation in draft.operations:
        if operation.operation == 'add':
            add_manual(row, items, operation, actor, at)
            continue
        target = operation.target
        identity = target.item_id or (manual_id(row, target.manual_request_id) if target.manual_request_id else
            item_id(row, target.question_id, target.kind))
        item = next((item for item in items if item['item_id'] == identity), None)
        if item is None or (target.question_id and not known_guided(row, item)):
            raise HTTPException(409, 'The pending Item no longer belongs to this reviewed assessment')
        if operation.operation == 'remove':
            remove_item(row, item, actor, at)
        else:
            if item['state'] in ('superseded', 'removed'):
                raise HTTPException(409, 'This Item is no longer current')
            if item['state'] != operation.state or item.get('resolution', '') != operation.resolution:
                item.update(state=operation.state, resolution=operation.resolution, updated_at=at)
                item.setdefault('history', []).append({'at': at, 'by': actor,
                    'event': 'resolved' if operation.state == 'resolved' else 'reopened',
                    'state': operation.state, 'resolution': operation.resolution})
    if stale and items != original:
        raise HTTPException(409, 'Items changed in another window; refresh before saving')
    return items


def _text(answers, key):
    return (answers.get(key) or '').strip(soc_guided_assessment.TEXT_WHITESPACE)


def item_id(row, question_id, kind):
    return 'item_' + uuid.uuid5(uuid.NAMESPACE_URL,
        row['framework_assessment_id'] + ':' + question_id + ':' + kind).hex


def _questions(row, draft):
    framework, definition, version = row['framework_key'], row['definition_id'], draft['version']
    if framework in generic_guided_assessment.FRAMEWORKS:
        questions = generic_guided_assessment.visible_questions(draft['answers'])
    elif framework == 'soc-2':
        questions = soc_guided_assessment._active_questions(definition, draft['answers'], version)
    elif framework == 'iso-27001':
        questions = iso_guided_assessment._active_questions(definition, draft['answers'], version)
    else:
        questions = guided_assessment.VERSIONS[version]['safeguards'][definition]
        questions = [q for q in questions if not q.get('when') or all(
            draft['answers'].get(key) in values for key, values in q['when'].items())]
    return {q['id']: q for q in questions}


def _date_origin(draft, value):
    """Match the existing local-day cutoff without inventing legacy clock data."""
    try:
        last = date.fromisoformat(value)
        if last.isoformat() != value:
            return 'gap'
    except ValueError:
        return 'gap'
    evaluation_date = (draft.get('result') or {}).get('evaluation_date')
    if evaluation_date:
        days = [date.fromisoformat(evaluation_date)]
    else:
        try:
            stamp = datetime.fromisoformat(draft['generated_at'])
            if stamp.tzinfo is None:
                return 'verification'
        except (KeyError, ValueError, TypeError):
            return 'verification'
        utc_day = stamp.astimezone(timezone.utc).date()
        days = [utc_day + timedelta(days=offset) for offset in (-1, 0, 1)]
    valid = []
    for today in days:
        month = today.year * 12 + today.month - 1 - 6
        cutoff = date(month // 12, month % 12 + 1,
            min(today.day, calendar.monthrange(month // 12, month % 12 + 1)[1]))
        valid.append(cutoff <= last <= today)
    return None if all(valid) else 'gap' if not any(valid) else 'verification'


def _origins(row, draft, questions):
    """Mirror existing answer signals; client result metadata is not task authority."""
    answers, framework = draft['answers'], row['framework_key']
    origins = {}
    if framework in generic_guided_assessment.FRAMEWORKS:
        return generic_guided_assessment.origins(answers)
    if framework in ('soc-2', 'iso-27001'):
        engine = soc_guided_assessment if framework == 'soc-2' else iso_guided_assessment
        def sentence(fragment):
            return fragment if engine.uses_inline_sentences(draft['version']) and fragment.endswith(('.', '!', '?')) else fragment + '.'
        substantive = 0
        outside = 'Outside the selected system' if framework == 'soc-2' else 'Not relevant here'
        for question in questions.values():
            key, value = question['id'], answers.get(question['id'])
            detail = _text(answers,key + '_detail')
            topic = question.get('topic') or question['prompt']
            suffix = ' — ' + detail if detail else ''
            if question['type'] == 'text':
                continue
            if question['type'] == 'context':
                if value != 'Relevant' and not (value == outside and detail):
                    relevance = 'system relevance' if framework=='soc-2' else 'conditional relevance'
                    origins[(key, 'verification')] = sentence(topic + ': '+relevance+' needs confirmation' + suffix)
                continue
            substantive += 1
            if value in ('No', 'Partially'):
                origins[(key, 'gap')] = sentence(topic + (': reported not in place' if value == 'No' else ': reported partially in place') + suffix)
            elif value != 'Yes':
                origins[(key, 'verification')] = sentence(topic + ': needs confirmation' + suffix)
        if not substantive:
            scope = 'selected system' if framework == 'soc-2' else 'ISMS scope'
            label='criterion assessment' if framework=='soc-2' else 'implementation assessment'
            origins[('summary_confirmation', 'verification')] = 'No substantive practice is established by the applicable answers; confirm the '+label+' in the ' + scope + '.'
        return origins
    catalog = guided_assessment.VERSIONS[draft['version']]
    definition = catalog.get('definitions', {}).get(row['definition_id']) or guided_assessment.CONTROL1['definitions'][row['definition_id']]
    corrected = draft['version'] in (guided_assessment.PROGRAM_V5['version'], guided_assessment.CONTROL1_V5['version'])
    current = draft['version'] in (guided_assessment.PROGRAM['version'], guided_assessment.PROGRAM_V4['version'], guided_assessment.PROGRAM_V5['version'], guided_assessment.CONTROL1_V4['version']) or corrected and row['definition_id'] not in ('1.1','1.2')
    root, states = definition.get('root'), []
    for question in questions.values():
        key = question['id']
        critical = question.get('critical', question['type'] == 'matrix' or key == root)
        if not critical or current and (root == 'practice' or corrected) and key == root:
            continue
        value = answers.get(key)
        values = list((value or {}).get(name) for name in question['rows']) if question['type'] == 'matrix' else value if question['type'] == 'multi' else [value]
        values = values or [None]
        deficient = question.get('deficient_values', ('No', 'Partially', 'None'))
        unknown = [v for v in values if not v or v == 'Not sure' or v == 'Not applicable' and not _text(answers,'scope_reason')]
        missing = [v for v in values if v in deficient]
        if not current and row['definition_id'] in ('1.1','1.2'):
            if key == 'unresolved':
                missing = [value] if value in ('Yes','Partially') else []
            elif key == 'sources':
                missing = [value] if value == 'Multiple unreconciled sources' else []
            elif key == 'frequency':
                late = ('Annually','Ad hoc') if row['definition_id']=='1.1' else ('Every two weeks','Monthly','Ad hoc')
                missing = [value] if value in late else []
            elif question['type'] == 'date' and value:
                conclusion = _date_origin(draft, value)
                missing = [value] if conclusion == 'gap' else []
                unknown = [value] if conclusion == 'verification' else []
        for v in values:
            excluded = question['type'] == 'matrix' and v == 'Not applicable' and bool(_text(answers,'scope_reason'))
            states.append('excluded' if excluded else 'unknown' if v in unknown else 'absent' if v in ('No', 'None', 'Never') and v in deficient else 'partial' if v in deficient else 'met')
        prompt = question.get('prompt') or question.get('topic') or definition['title']
        for kind, needed in (('gap', missing), ('verification', unknown)):
            if needed:
                text = question.get('gap_template' if kind == 'gap' else 'unknown_template') or ('Address: ' if kind == 'gap' else 'Confirm: ') + prompt
                origins[(key, kind)] = text
    if current:
        if draft['version'] == guided_assessment.CONTROL1_V5['version'] and answers.get(root) in (None, '', 'Not sure'):
            question = questions[root]
            origins[(root, 'verification')] = question.get('unknown_template') or 'Confirm: '+question['prompt']
        if corrected and answers.get(root) == 'No' and not any(kind == 'gap' for _, kind in origins):
            origins[(root, 'gap')] = 'The requirement practice is reported not in place.'
        applicable = [state for state in states if state != 'excluded']
        if draft['version'] == guided_assessment.CONTROL1_V5['version'] and answers.get(root) == 'Partially' and applicable and not any(kind == 'gap' for _, kind in origins):
            question=questions[root]
            origins[(root, 'gap')] = question.get('gap_template') or 'Address: '+question['prompt']
        if states and not applicable:
            origins[('scope_reason', 'verification')] = 'Applicability requires native assessment decision; excluded scope is not proof of implementation.'
        elif (answers.get(root) == 'No' and any(state in ('met', 'partial') for state in applicable)
                or answers.get(root) == 'Partially' and applicable and all(state == 'met' for state in applicable)):
            origins[(root, 'verification')] = 'The overall practice answer conflicts with the reported requirement details; confirm the actual implementation.'
        elif answers.get(root) in ('Yes', 'Partially') and applicable and all(state == 'absent' for state in applicable):
            origins[('summary_confirmation', 'verification')] = 'The overall practice answer conflicts with the reported absence of every substantive requirement; confirm the overall answer.'
    return origins


def reported_evidence(row, draft):
    """Only actual current visible Evidence text can request a linking follow-up."""
    value = draft['answers'].get('evidence')
    if row['framework_key'] in ('iso-27001', 'soc-2'):
        engine = iso_guided_assessment if row['framework_key'] == 'iso-27001' else soc_guided_assessment
        question = next((question for question in engine.extra_questions(draft['version']) if question['id'] == 'evidence'), None)
    else:
        question = _questions(row, draft).get('evidence')
    return value.strip(soc_guided_assessment.TEXT_WHITESPACE) if (
        question and question.get('type') == 'text' and isinstance(value, str)) else ''


def generated(row, draft, *, evidence_linked=None):
    """Use validated answer origins, never parse native prose or trust result signals."""
    answers = draft['answers']
    questions = _questions(row, draft)
    origins = _origins(row, draft, questions)
    if row['framework_key'] == 'cis-ig1':
        for (question_id, kind), text in list(origins.items()):
            question = questions.get(question_id)
            if question is None:
                continue
            value = answers.get(question_id)
            if question.get('type') == 'matrix':
                values = value if isinstance(value, dict) else {}
                affected = [key for key in question['rows'] if
                    values.get(key) in question.get('deficient_values', ('No', 'Partially', 'None'))] if kind == 'gap' else [
                    key for key in question['rows'] if not values.get(key) or values.get(key) == 'Not sure'
                    or values.get(key) == 'Not applicable' and not _text(answers,'scope_reason')]
                text = ('Address: ' if kind == 'gap' else 'Confirm: ') + '; '.join(
                    key + ' — ' + str(values.get(key) or 'Not recorded') for key in affected)
            if _text(answers,question_id + '_detail'):
                text += ' — ' + _text(answers,question_id + '_detail')
            origins[(question_id, kind)] = text
    for question_id, kind in (('gaps', 'gap'), ('unknowns', 'verification')):
        if row['framework_key']=='cis-ig1' and draft['version']==guided_assessment.LEGACY['version'] and question_id=='gaps':
            kind='verification'  # The original prompt combines deficiencies, exclusions and uncertainty.
        if row['framework_key']=='cis-ig1' and draft['version'] in (guided_assessment.PROGRAM_V5['version'],guided_assessment.CONTROL1_V5['version']) and answers.get('additional_gap' if kind=='gap' else 'additional_confirmation')!='Yes':
            continue
        engine = soc_guided_assessment if row['framework_key'] == 'soc-2' else iso_guided_assessment if row['framework_key'] == 'iso-27001' else None
        if engine and draft['version'] != engine.LEGACY['version'] and answers.get('additional_gap' if kind == 'gap' else 'additional_confirmation') != 'Yes':
            continue
        if isinstance(answers.get(question_id), str) and _text(answers,question_id):
            origins[(question_id, kind)] = _text(answers,question_id)
    if evidence_linked is False and (reported := reported_evidence(row, draft)):
        origins[('evidence', 'verification')] = 'Link the reported evidence: ' + reported
    return [{
        'item_id': item_id(row, question_id, kind), 'question_id': question_id,
        'kind': kind, 'text': text, 'origin': 'guided',
        'item_type': 'gap' if kind == 'gap' else 'evidence' if question_id == 'evidence' else 'confirmation',
        'source_version': draft['version'],
        'source_fingerprint': create_requests.digest({
            'answer': answers if question_id == 'summary_confirmation' or question_id == 'scope_reason' else answers.get(question_id),
            'detail': answers.get(question_id + '_detail')})
    } for (question_id, kind), text in origins.items()]


def reconcile(row, draft, actor, at, *, evidence_linked=None):
    items = deepcopy(row.get('items_to_address', []))
    by_id = {item['item_id']: item for item in items}
    active = set()
    for source in generated(row, draft, evidence_linked=evidence_linked):
        identity = source['item_id']
        active.add(identity)
        if identity not in by_id:
            item = {**source, 'state': 'open', 'resolution': '', 'finding_id': None,
                    'created_at': at, 'updated_at': at, 'history': []}
            event = 'generated'
            items.append(item)
            by_id[identity] = item
        else:
            item = by_id[identity]
            if not known_guided(row, item):
                raise HTTPException(409, 'The retained Item origin needs confirmation before reconciliation')
            different = item['source_fingerprint'] != source['source_fingerprint']
            if item['state'] == 'removed' and not different:
                continue
            if not different and item['state'] != 'superseded' and all(item.get(k) == v for k, v in source.items()):
                continue
            state = 'open' if different or item['state'] == 'superseded' else item['state']
            event = 'reassessed' if different else 'restored' if item['state'] == 'superseded' else 'reconciled'
            item.update(source, state=state, updated_at=at)
            item.pop('previous_state', None)
        item['history'].append({'at': at, 'by': actor, 'event': event,
            'state': item['state'], 'resolution': item['resolution'], 'text': item['text'],
            'source_version': item['source_version'], 'source_fingerprint': item['source_fingerprint']})
    for item in items:
        if item['item_id'] not in active and item['state'] not in ('superseded', 'removed') and known_guided(row, item):
            item.update(previous_state=item['state'], state='superseded', updated_at=at)
            item['history'].append({'at': at, 'by': actor, 'event': 'superseded',
                'state': 'superseded', 'resolution': item['resolution'], 'source_fingerprint': item['source_fingerprint']})
    return items


def current_item(row, identity):
    item = next((item for item in row.get('items_to_address', []) if item['item_id'] == identity), None)
    if item is None:
        raise HTTPException(404, 'Item not found for this assessment')
    if item['state'] in ('superseded', 'removed'):
        raise HTTPException(409, 'This item is superseded; refresh the current assessment')
    return item


async def save_items(s, row, items, user, at):
    revision = row.get('items_revision', 0)
    # Items have an independent CAS; do not claim a concurrently changing judgment.
    before = {key: row.get(key) for key in ('client_id', 'framework_key', 'items_to_address', 'items_revision')}
    patch, event = s._portfolio_event_patch('framework_assessment', row['framework_assessment_id'],
        row['client_id'], user, before, {**before, 'items_to_address': items, 'items_revision': revision + 1}, at)
    result = await s.db.framework_assessments.update_one({
        'framework_assessment_id': row['framework_assessment_id'], 'client_id': row['client_id'],
        'items_revision': row.get('items_revision'), '_r4_context_pending': None},
        {'$set': {'items_to_address': items, 'items_revision': revision + 1, **patch}})
    if not result.matched_count:
        raise HTTPException(409, 'Items changed in another window; refresh before saving')
    return event


async def command_item(s, aid, body, user, identity=None, *, action=None):
    """Use the existing journal so a post-CAS audit failure retains its exact accepted Item write."""
    import portfolio_activity
    import r4_services
    row = await s.db.framework_assessments.find_one({'framework_assessment_id': aid}, {'_id': 0})
    if not row or not s._can_access_client(user, row['client_id']):
        raise HTTPException(404, 'Assessment not found')
    action = action or ('remove' if identity else 'add')
    route = '/framework_assessments/' + aid + '/items' + ('/' + identity + ('/remove' if action == 'remove' else '') if identity else '')
    payload = body.model_dump()
    key = (create_requests.digest(['resolve', identity, payload]) if action == 'resolve' else
        create_requests.digest(['remove', identity, body.expected_revision]) if identity else body.request_id)
    retained = await r4_services.authorize_retained_command(s, key, user, row['client_id'], route, payload)
    await r4_services.assessment_writer(s, row, user, retained, require_active=action != 'resolve')

    async def execute(command):
        receipt = await s.db.create_requests.find_one({'_id': command})
        writes = receipt.get('r4_write_plan')
        if writes is None:
            current = await s._authorized_parent('framework_assessments', aid, user, True)
            await r4_services.assessment_writer(s, current, user, require_active=action != 'resolve')
            items, at = deepcopy(current.get('items_to_address', [])), s._now()
            if action == 'resolve':
                if body.expected_revision != current.get('items_revision', 0):
                    raise HTTPException(409, 'Items changed in another window; refresh before saving')
                item = current_item({**current, 'items_to_address': items}, identity)
                changed = item['state'] != body.state or item.get('resolution', '') != body.resolution
                if changed:
                    item.update(state=body.state, resolution=body.resolution, updated_at=at)
                    item.setdefault('history', []).append({'at': at, 'by': user['user_id'],
                        'event': 'resolved' if body.state == 'resolved' else 'reopened', 'state': body.state, 'resolution': body.resolution})
            elif identity is None:
                changed = add_manual(current, items, body, user['user_id'], at)
            else:
                item = next((item for item in items if item['item_id'] == identity), None)
                if item is None:
                    raise HTTPException(404, 'Item not found for this assessment')
                changed = remove_item(current, item, user['user_id'], at)
            if changed and body.expected_revision != current.get('items_revision', 0):
                raise HTTPException(409, 'Items changed in another window; refresh before saving')
            writes = []
            if changed:
                changes = {'items_to_address': items, 'items_revision': current.get('items_revision', 0) + 1}
                capture, _ = s._portfolio_event_patch('framework_assessment', aid, current['client_id'], user,
                    current, {**current, **changes}, at)
                before = {field: current.get(field) for field in
                    ('client_id', 'framework_key', 'items_to_address', 'items_revision', 'last_saved', 'last_assessed')}
                writes = [r4_services.write_row('framework_assessments', 'framework_assessment_id', current,
                    {**changes, **capture}, preconditions=before)]
            else:
                await s.db.create_requests.update_one({'_id': command}, {'$set': {'r4_write_plan': []}})
        if writes:
            prefix = '_portfolio_activity_pending.'
            event_id = next((field[len(prefix):] for field in writes[0]['patch'] if field.startswith(prefix)), None)
            async def finish_audit():
                await s.audit(user, 'Assessment item updated', 'framework_assessment', aid, row['client_id'],
                    meta={'item_id': identity or manual_id(row, body.request_id),
                        **({'state': body.state} if action == 'resolve' else {'event': 'removed' if identity else 'added'}),
                        '_portfolio_activity_event_id': event_id, '_portfolio_activity_noop': event_id is None})
            await r4_services.apply_plan(s, writes, command, user, 'Assessment Item saved', after_apply=finish_audit)
        return {'ok': True}

    await create_requests.run(s.db, key, user['user_id'], row['client_id'], route, payload, execute)
    return portfolio_activity.public_source(with_item_controls(await s._authorized_parent('framework_assessments', aid, user)))


async def client_questions(s, client, framework, user):
    """Read saved open Items with proven Client responsibility across the complete active program."""
    from framework_catalog import active_definitions, client_configuration
    import r4_services
    cid = client['client_id']
    if not s._can_access_client(user, cid):
        raise HTTPException(403, 'Forbidden for this client')
    if not await s.db.requirements.find_one({'client_id': cid, 'baseline_key': framework, 'baseline_response': 'applies'}):
        raise HTTPException(404, 'This program is not active for the client')
    eligible = {definition['id'] for definition in active_definitions(framework, client_configuration(framework, client))}
    rows = await s.db.framework_assessments.find({'client_id': cid, 'framework_key': framework}, {'_id': 0}).to_list(10001)
    if len(rows) > 10000:
        raise HTTPException(413, 'The complete program Item population exceeds the supported limit')
    rows = [row for row in rows if row['definition_id'] in eligible]
    if len(rows) != len(eligible) or {row['definition_id'] for row in rows} != eligible:
        raise HTTPException(409, 'The complete current program assessment population could not be verified')
    activities = await r4_services.activities(s, client)
    bindings = r4_services.services_of(client).get('assessment_activities', {})
    questions, unconfirmed = [], 0
    for row in rows:
        r4_services.assert_settled(row)
        candidates = [activity for activity in activities if any(driver['framework_key'] == framework
            and row['definition_id'] in driver['framework_safeguards'] for driver in activity['drivers'])]
        binding = bindings.get(row['framework_assessment_id'])
        # A unique candidate is available context, not a saved responsibility binding.
        selected = next((activity for activity in candidates if activity['activity_id'] == binding), None) if binding else None
        responsibility = (selected or {}).get('responsibility', 'un')
        for item in row.get('items_to_address', []):
            if item.get('state') != 'open':
                continue
            if responsibility != 'cl':
                unconfirmed += responsibility != 'iv'
                continue
            if not isinstance(item.get('text'), str) or not item['text'].strip() or not item.get('item_id'):
                raise HTTPException(409, 'A saved Client Item could not be verified')
            questions.append({'item_id': item['item_id'], 'assessment_id': row['framework_assessment_id'],
                'definition_id': row['definition_id'], 'text': item['text'],
                'basis': {'activity_id': selected['activity_id'], 'area_id': selected['area_id'], 'responsibility': 'cl'}})
    latest = await s.db.clients.find_one({'client_id': cid}, {'_id': 0})
    if not latest or any(latest.get(field) != client.get(field) for field in ('updated_at', 'framework_settings', 'profile', '_r4_context_pending')):
        raise HTTPException(409, 'Client program or service responsibility changed; reload the current questions')
    return {'client_id': cid, 'framework_key': framework, 'questions': questions, 'unconfirmed_count': unconfirmed}


async def link_finding(s, row, identity, finding_id, user):
    # Retry only the relationship CAS; the canonical Finding already exists.
    for _ in range(3):
        current = await s._authorized_parent('framework_assessments', row['framework_assessment_id'], user, True)
        items = deepcopy(current.get('items_to_address', []))
        item = next((item for item in items if item['item_id'] == identity), None)
        if item is None:
            raise HTTPException(409, 'Originating item changed; retry the original finding request')
        if item.get('finding_id') == finding_id:
            return
        if item.get('finding_id'):
            raise HTTPException(409, 'This item already has a linked Finding')
        at = s._now()
        item.update(finding_id=finding_id, updated_at=at)
        item['history'].append({'at': at, 'by': user['user_id'], 'event': 'finding_linked',
            'state': item['state'], 'resolution': item['resolution'], 'finding_id': finding_id})
        try:
            event = await save_items(s, current, items, user, at)
        except HTTPException as error:
            if error.status_code != 409:
                raise
            continue
        await s.audit(user, 'Assessment item updated', 'framework_assessment', row['framework_assessment_id'],
            row['client_id'], meta={'item_id': identity, 'state': item['state'], 'finding_id': finding_id,
                '_portfolio_activity_event_id': event['event_id'] if event else None,
                '_portfolio_activity_noop': event is None})
        return
    raise HTTPException(409, 'Items changed while linking the Finding; retry the original request')
