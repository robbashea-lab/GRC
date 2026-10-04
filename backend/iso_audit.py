"""ISO audit package work on normal Reviews and immutable Review occurrences."""
import copy
import json
import uuid
from calendar import monthrange
from datetime import date
from framework_catalog import ROOT as CATALOG_ROOT
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
import assignment_eligibility
import review_occurrences
import create_requests

CATALOG = json.loads((CATALOG_ROOT / 'isoAuditProgram.json').read_text(encoding='utf-8'))
PACKAGES = {p['key']: p for p in CATALOG['packages']}


class Activation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    client_id: str
    start_date: date
    first_package: str
    auditor_id: str = Field(min_length=1, max_length=128)
    scope: str = Field(min_length=1, max_length=4000)
    independence: str = Field(min_length=1, max_length=4000)


class ItemPatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    occurrence_id: str
    expected_updated_at: Optional[str]
    status: Literal['not_started', 'in_progress', 'reviewed', 'not_applicable']
    result: Literal['', 'conforming', 'observation', 'nonconformity'] = ''
    notes: str = Field(default='', max_length=20000)
    na_rationale: str = Field(default='', max_length=4000)
    evidence_ids: list[str] = Field(default_factory=list, max_length=50)
    finding_ids: list[str] = Field(default_factory=list, max_length=50)


class ReportPatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    occurrence_id: str
    expected_updated_at: Optional[str]
    report_evidence_id: Optional[str] = None


def activation_plan(body):
    if body.first_package not in PACKAGES:
        raise HTTPException(422, 'Choose an audit package')
    keys = list(PACKAGES)
    start = keys.index(body.first_package)
    quarter = (body.start_date.month - 1) // 3
    rows = []
    for offset in range(len(keys)):
        q = quarter + offset
        year, month = body.start_date.year + q // 4, (q % 4 + 1) * 3
        if year > 9998:
            raise HTTPException(422, 'Choose a supported prospective date')
        key = keys[(start + offset) % len(keys)]
        rows.append({'package_key': key, 'title': PACKAGES[key]['title'],
                     'due_date': date(year, month, monthrange(year, month)[1]).isoformat()})
    return rows


def initial_state(key, cycle=1):
    return {'package_key': key, 'catalog_version': CATALOG['version'],
            'cycle': cycle, 'items': {}, 'report_evidence_id': None}


def item_complete(item):
    return (item.get('status') == 'not_applicable' and bool(item.get('na_rationale', '').strip())) or (
        item.get('status') == 'reviewed' and item.get('result') in ('conforming', 'observation', 'nonconformity'))


def progress(state):
    definitions = PACKAGES[state['package_key']]['items']
    items = [state.get('items', {}).get(d['key'], {}) for d in definitions]
    return {'total': len(items), 'complete': sum(item_complete(i) for i in items),
            'excluded': sum(i.get('status') == 'not_applicable' for i in items),
            'nonconformities': sum(i.get('result') == 'nonconformity' for i in items),
            'observations': sum(i.get('result') == 'observation' for i in items)}


def evidence_ids(state):
    return {eid for item in (state or {}).get('items', {}).values() for eid in item.get('evidence_ids', [])} | (
        {state['report_evidence_id']} if state and state.get('report_evidence_id') else set())


async def evidence_record(s, review, ident):
    row = await s.db.evidence.find_one({'evidence_id': ident, 'client_id': review['client_id'], 'archived_at': None}, {'_id': 0, 'content_base64': 0})
    if not row:
        raise HTTPException(422, 'Select available Evidence from this client')
    return row


async def validate_item(s, review, item):
    if item['status'] == 'not_applicable' and not item['na_rationale'].strip():
        raise HTTPException(422, 'Document why this audit item is not applicable')
    if item['status'] == 'not_applicable' and item['result']:
        raise HTTPException(422, 'N/A is not an audit result')
    for eid in item['evidence_ids']:
        await evidence_record(s, review, eid)
    for fid in item['finding_ids']:
        found = await s.db.findings.find_one({'finding_id': fid, 'client_id': review['client_id'],
            'review_id': review['review_id'], **review_occurrences.occurrence_query(review)}, {'_id': 0})
        if not found:
            raise HTTPException(422, 'Select a Finding from this audit occurrence')


async def completion_snapshot(s, review):
    """Called by central completion before its atomic history/advance update."""
    output = {}
    if review.get('iso_audit'):
        findings=await s.db.findings.find({'review_id':review['review_id'],'client_id':review['client_id'],
            **review_occurrences.occurrence_query(review),'audit_item_key':{'$exists':True}}, {'request_id':1,'created_by':1}).to_list(None)
        receipts=[create_requests.digest([f['created_by'],review['client_id'],'reviews/'+review['review_id']+'/create-finding',
            create_requests.digest(f['request_id'])]) for f in findings if f.get('request_id') and f.get('created_by')]
        if await s.db.create_requests.find_one({'_id':{'$in':receipts},'state':'pending'}):
            raise HTTPException(409,'Finish the pending audit ticket creation before closing this occurrence')
        state = review['iso_audit']
        if progress(state)['complete'] != progress(state)['total']:
            raise HTTPException(422, 'Complete every applicable audit item and record each result before closing the package')
        for item in state['items'].values():
            await validate_item(s, review, item)
            if item.get('result') in ('observation', 'nonconformity') and not item.get('finding_ids'):
                raise HTTPException(422, 'Link an Observation or Nonconformity to a shared Finding before package closure')
        if not state.get('report_evidence_id'):
            raise HTTPException(422, 'Link the issued audit report before closing the package')
        report = await evidence_record(s, review, state['report_evidence_id'])
        snapshot = copy.deepcopy(state)
        # Pin artifact versions and the workbook methodology version, not live projections.
        ids = {e for i in state['items'].values() for e in i.get('evidence_ids', [])}
        ids.add(report['evidence_id'])
        snapshot['evidence'] = [{k: row.get(k) for k in ('evidence_id', 'filename', 'version', 'sha256')}
            for row in [await evidence_record(s, review, eid) for eid in sorted(ids)]]
        snapshot['methodology_source'] = CATALOG['source']
        snapshot['progress'] = progress(state)
        output['iso_audit'] = snapshot
    drivers = review.get('framework_drivers') or [review]
    if any(d.get('framework_plan_key') == 'iso-soa-review' for d in drivers):
        rows = await s.db.framework_assessments.find({'client_id': review['client_id'], 'framework_key': 'iso-27001',
            'definition_id': {'$regex': '^A\\.'}}, {'_id': 0, 'assessment_history': 0}).to_list(None)
        client = await s.db.clients.find_one({'client_id': review['client_id']}, {'_id': 0, 'profile': 1})
        output['iso_soa_snapshot'] = {'assessments': rows, 'profile': (client or {}).get('profile'), 'captured_at': s._now()}
    return output


def router_for(s):
    router = APIRouter(prefix='/api', tags=['iso-audit'])

    async def client_for(cid, user):
        if not s._can_access_client(user, cid):
            raise HTTPException(403, 'Forbidden for this client')
        row = await s.db.clients.find_one({'client_id': cid}, {'_id': 0})
        if not row:
            raise HTTPException(404, 'Client not found')
        return row

    @router.get('/iso-audit')
    async def get_program(client_id: str, user=Depends(s.get_current_user)):
        client = await client_for(client_id, user)
        reviews = await s.db.reviews.find({'client_id': client_id, 'iso_audit.package_key': {'$in': list(PACKAGES)}}, {'_id': 0, '_execution_lock': 0}).to_list(None)
        return {'program': client.get('iso_audit_program'), 'reviews': [review_occurrences.view(r) for r in reviews]}

    @router.post('/iso-audit/activate')
    @s.configuration_mutation
    async def activate(body: Activation, user=Depends(s.get_current_user)):
        client = await client_for(body.client_id, user)
        if not await s.db.requirements.find_one({'client_id': body.client_id, 'baseline_key': 'iso-27001', 'baseline_response': 'applies'}):
            raise HTTPException(409, 'Enable ISO in Client Profile first')
        config = body.model_dump(mode='json')
        program = client.get('iso_audit_program')
        if program and program['configuration'] != config:
            raise HTTPException(409, 'Program already configured. Adjust current package dates and assignments in Reviews; history is retained')
        if not program:
            if body.start_date < date.today():
                raise HTTPException(422, 'Activation must be prospective, not before today')
            if not body.scope.strip() or not body.independence.strip():
                raise HTTPException(422, 'Document scope and auditor objectivity')
            await assignment_eligibility.validate(s.db, 'reviews', {'client_id': body.client_id, 'owner_id': body.auditor_id}, s._can_access_client)
            program = {'configuration': config, 'activated_at': s._now(), 'activated_by': user['user_id'], 'status': 'configuring', 'schedule': activation_plan(body)}
            # Durable intent permits safe retry of a partially interrupted four-record activation.
            await s.db.clients.update_one({'client_id': body.client_id}, {'$set': {'iso_audit_program': program}})
        for plan in program['schedule']:
            key = plan['package_key']
            rid = 'isoa_' + uuid.uuid5(uuid.NAMESPACE_URL, body.client_id + ':' + key).hex
            draft = s.ReviewIn(client_id=body.client_id, title='Internal Audit — ' + plan['title'], review_type='requirements',
                owner_id=body.auditor_id, recurrence='annual', due_date=plan['due_date'], status='upcoming', scope=body.scope).model_dump()
            draft.update(review_id=rid, created_at=program['activated_at'], updated_at=program['activated_at'], created_by=user['user_id'],
                framework_key='iso-27001', framework_safeguards=list(dict.fromkeys(i['definition_id'] for i in PACKAGES[key]['items'])),
                framework_basis='Organization-defined internal audit program', framework_source_cadence='Planned intervals; four staggered annual packages are organization-defined, not an ISO-prescribed quarterly frequency.',
                governance_context={'category': 'organizational', 'rationale': body.scope,
                    'cadence_source': 'organization_defined',
                    'cadence_rationale': 'Management selected four staggered annual audit packages for planned coverage. ISO requires planned intervals, not this quarterly rotation.'},
                iso_audit=initial_state(key), audit_independence=body.independence, audit_program_start=body.start_date.isoformat())
            draft.update(review_occurrences.schedule(draft))
            draft['current_occurrence_id'] = review_occurrences.occurrence_id(draft)
            await s.db.reviews.update_one({'_id': rid}, {'$setOnInsert': draft}, upsert=True)
        if program['status'] != 'active':
            await s.db.clients.update_one({'client_id': body.client_id}, {'$set': {'iso_audit_program.status': 'active'}})
            await s.audit(user, 'ISO audit program activated', 'client', body.client_id, body.client_id)
        return await get_program(body.client_id, user)

    async def current_review(review_id, body, user):
        review = await s._authorized_parent('reviews', review_id, user, write=True)
        await s._review_selection(review, body.occurrence_id, write=True)
        s._require_snapshot(body.model_dump(exclude_unset=True), review)
        if not review.get('iso_audit'):
            raise HTTPException(422, 'This Review is not an audit package')
        return review

    async def save_state(review, state, user):
        at = s._next_write_time(review.get('updated_at'))
        changes = {'iso_audit': state, 'updated_at': at}
        result = await s.db.reviews.update_one({'review_id': review['review_id'], 'client_id': review['client_id'],
            'updated_at': review.get('updated_at')}, {'$set': changes})
        if not result.matched_count:
            raise HTTPException(409, 'Audit package changed; reload before saving')
        await s._review_event(user, review, 'Audit work updated', review_occurrences.occurrence_id(review))
        return review_occurrences.view({**review, **changes})

    @router.patch('/reviews/{review_id}/iso-audit/{item_key}')
    @s.review_mutation
    async def update_item(review_id: str, item_key: str, body: ItemPatch, user=Depends(s.get_current_user)):
        review = await current_review(review_id, body, user)
        state = copy.deepcopy(review['iso_audit'])
        if item_key not in {i['key'] for i in PACKAGES[state['package_key']]['items']}:
            raise HTTPException(404, 'Audit item not found')
        item = body.model_dump(exclude={'occurrence_id', 'expected_updated_at'})
        await validate_item(s, review, item)
        # A draft may be Reviewed without a result, but it never counts as complete.
        item.update(updated_at=s._now(), updated_by=user['user_id'])
        state['items'][item_key] = item
        return await save_state(review, state, user)

    @router.patch('/reviews/{review_id}/iso-audit')
    @s.review_mutation
    async def update_report(review_id: str, body: ReportPatch, user=Depends(s.get_current_user)):
        review = await current_review(review_id, body, user)
        if body.report_evidence_id:
            await evidence_record(s, review, body.report_evidence_id)
        state = {**review['iso_audit'], 'report_evidence_id': body.report_evidence_id}
        return await save_state(review, state, user)

    return router
