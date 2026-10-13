"""Assessment-local reported follow-up; completion never changes assessment judgment."""
from copy import deepcopy
import calendar
from datetime import date, datetime
from typing import Literal
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
import create_requests
import guided_assessment
import iso_guided_assessment
import soc_guided_assessment


class ItemPatch(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    expected_revision: int = Field(ge=0)
    state: Literal['open', 'resolved']
    resolution: str = Field(default='', max_length=4000)


def _text(answers, key):
    return (answers.get(key) or '').strip(soc_guided_assessment.TEXT_WHITESPACE)


def item_id(row, question_id, kind):
    return 'item_' + uuid.uuid5(uuid.NAMESPACE_URL,
        row['framework_assessment_id'] + ':' + question_id + ':' + kind).hex


def _questions(row, draft):
    framework, definition, version = row['framework_key'], row['definition_id'], draft['version']
    if framework == 'soc-2':
        questions = soc_guided_assessment._active_questions(definition, draft['answers'], version)
    elif framework == 'iso-27001':
        questions = iso_guided_assessment._active_questions(definition, draft['answers'], version)
    else:
        questions = guided_assessment.VERSIONS[version]['safeguards'][definition]
        questions = [q for q in questions if not q.get('when') or all(
            draft['answers'].get(key) in values for key, values in q['when'].items())]
    return {q['id']: q for q in questions}


def _origins(row, draft, questions):
    """Mirror existing answer signals; client result metadata is not task authority."""
    answers, framework = draft['answers'], row['framework_key']
    origins = {}
    if framework in ('soc-2', 'iso-27001'):
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
                    origins[(key, 'verification')] = topic + ': '+relevance+' needs confirmation' + suffix + '.'
                continue
            substantive += 1
            if value in ('No', 'Partially'):
                origins[(key, 'gap')] = topic + (': reported not in place' if value == 'No' else ': reported partially in place') + suffix + '.'
            elif value != 'Yes':
                origins[(key, 'verification')] = topic + ': needs confirmation' + suffix + '.'
        if not substantive:
            scope = 'selected system' if framework == 'soc-2' else 'ISMS scope'
            label='criterion assessment' if framework=='soc-2' else 'implementation assessment'
            origins[('summary_confirmation', 'verification')] = 'No substantive practice is established by the applicable answers; confirm the '+label+' in the ' + scope + '.'
        return origins
    catalog = guided_assessment.VERSIONS[draft['version']]
    definition = catalog['definitions'][row['definition_id']]
    current = draft['version'] in (guided_assessment.PROGRAM['version'], guided_assessment.PROGRAM_V4['version'], guided_assessment.CONTROL1_V4['version'])
    root, states = definition.get('root'), []
    for question in questions.values():
        key = question['id']
        critical = question.get('critical', question['type'] == 'matrix' or key == root)
        if not critical or current and root == 'practice' and key == root:
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
                today = datetime.fromisoformat(draft['generated_at']).astimezone().date() if draft.get('generated_at') else date.today()
                month = today.year*12+today.month-1-6
                cutoff = date(month//12,month%12+1,min(today.day,calendar.monthrange(month//12,month%12+1)[1]))
                try:
                    last = date.fromisoformat(value)
                    valid = len(value)==10 and cutoff<=last<=today
                except ValueError:
                    valid = False
                missing = [] if valid else [value]
        for v in values:
            excluded = question['type'] == 'matrix' and v == 'Not applicable' and bool(_text(answers,'scope_reason'))
            states.append('excluded' if excluded else 'unknown' if v in unknown else 'absent' if v in ('No', 'None', 'Never') and v in deficient else 'partial' if v in deficient else 'met')
        prompt = question.get('prompt') or question.get('topic') or definition['title']
        for kind, needed in (('gap', missing), ('verification', unknown)):
            if needed:
                text = question.get('gap_template' if kind == 'gap' else 'unknown_template') or ('Address: ' if kind == 'gap' else 'Confirm: ') + prompt
                origins[(key, kind)] = text
    if current:
        applicable = [state for state in states if state != 'excluded']
        if states and not applicable:
            origins[('scope_reason', 'verification')] = 'Applicability requires native assessment decision; excluded scope is not proof of implementation.'
        elif (answers.get(root) == 'No' and any(state in ('met', 'partial') for state in applicable)
                or answers.get(root) == 'Partially' and applicable and all(state == 'met' for state in applicable)):
            origins[(root, 'verification')] = 'The overall practice answer conflicts with the reported requirement details; confirm the actual implementation.'
        elif answers.get(root) in ('Yes', 'Partially') and applicable and all(state == 'absent' for state in applicable):
            origins[('summary_confirmation', 'verification')] = 'The overall practice answer conflicts with the reported absence of every substantive requirement; confirm the overall answer.'
    return origins


def generated(row, draft):
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
        if isinstance(answers.get(question_id), str) and _text(answers,question_id):
            origins[(question_id, kind)] = _text(answers,question_id)
    return [{
        'item_id': item_id(row, question_id, kind), 'question_id': question_id,
        'kind': kind, 'text': text, 'source_version': draft['version'],
        'source_fingerprint': create_requests.digest({
            'answer': answers if question_id == 'summary_confirmation' or question_id == 'scope_reason' else answers.get(question_id),
            'detail': answers.get(question_id + '_detail')})
    } for (question_id, kind), text in origins.items()]


def reconcile(row, draft, actor, at):
    items = deepcopy(row.get('items_to_address', []))
    by_id = {item['item_id']: item for item in items}
    active = set()
    for source in generated(row, draft):
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
            different = item['source_fingerprint'] != source['source_fingerprint']
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
        if item['item_id'] not in active and item['state'] != 'superseded':
            item.update(previous_state=item['state'], state='superseded', updated_at=at)
            item['history'].append({'at': at, 'by': actor, 'event': 'superseded',
                'state': 'superseded', 'resolution': item['resolution'], 'source_fingerprint': item['source_fingerprint']})
    return items


def current_item(row, identity):
    item = next((item for item in row.get('items_to_address', []) if item['item_id'] == identity), None)
    if item is None:
        raise HTTPException(404, 'Item not found for this assessment')
    if item['state'] == 'superseded':
        raise HTTPException(409, 'This item is superseded; refresh the current assessment')
    return item


async def save_items(s, row, items):
    revision = row.get('items_revision', 0)
    result = await s.db.framework_assessments.update_one({
        'framework_assessment_id': row['framework_assessment_id'], 'client_id': row['client_id'],
        'items_revision': row.get('items_revision')},
        {'$set': {'items_to_address': items, 'items_revision': revision + 1}})
    if not result.matched_count:
        raise HTTPException(409, 'Items changed in another window; refresh before saving')


async def update(s, row, identity, body, user):
    if body.expected_revision != row.get('items_revision', 0):
        raise HTTPException(409, 'Items changed in another window; refresh before saving')
    items = deepcopy(row.get('items_to_address', []))
    item = current_item({**row, 'items_to_address': items}, identity)
    if item['state'] == body.state and item['resolution'] == body.resolution:
        return
    at = s._now()
    item.update(state=body.state, resolution=body.resolution, updated_at=at)
    item['history'].append({'at': at, 'by': user['user_id'], 'event': 'resolved' if body.state == 'resolved' else 'reopened',
        'state': body.state, 'resolution': body.resolution})
    await save_items(s, row, items)
    await s.audit(user, 'Assessment item updated', 'framework_assessment', row['framework_assessment_id'],
        row['client_id'], meta={'item_id': identity, 'state': body.state})


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
            await save_items(s, current, items)
            return
        except HTTPException as error:
            if error.status_code != 409:
                raise
    raise HTTPException(409, 'Items changed while linking the Finding; retry the original request')
