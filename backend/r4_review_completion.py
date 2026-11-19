"""Prospective Review contracts; historic occurrences are never regenerated."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import re
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

import authorization
import create_requests
import evidence_context
import review_occurrences

CATALOG = json.loads((Path(__file__).parents[1] / 'shared/catalogs/r4ReviewTemplates.json').read_text(encoding='utf-8'))
SERVICES = json.loads((Path(__file__).parents[1] / 'shared/catalogs/r4ServicesTools.json').read_text(encoding='utf-8'))
TOPICS = {t['id']: t for t in CATALOG['topics']}
RECORDS = {t['id']: t for t in CATALOG['record_guides']}
AREAS = {a['id']: a for a in SERVICES['areas']}
RESP = {r['id']: r['label'] for r in SERVICES['responsibilities']}


class StepResultIn(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    step_id: str = Field(min_length=1, max_length=160)
    result: Literal['Pass', 'Exception', 'N/A', 'NMI']
    reason: str = Field(default='', max_length=4000)


class ChecklistIn(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    contract_token: str = Field(min_length=64, max_length=64)
    results: list[StepResultIn] = Field(default_factory=list, max_length=200)


class GuideCheckpointIn(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    occurrence_id: str = Field(min_length=1, max_length=160)
    expected_updated_at: str | None = Field(max_length=100)
    checklist: ChecklistIn
    supporting_reference: str = Field(default='', max_length=4000)


def template_id(review):
    explicit = review.get('review_template_id')
    if explicit:
        return explicit
    if review.get('risk_id'):
        return 'risk_rec'
    if review.get('policy_id'):
        return 'policy_rec'
    if review.get('ai_system_id'):
        return 'ai_rec'
    if review.get('vendor_id'):
        purpose = review.get('vendor_purpose') or 'vendor'
        if purpose == 'offboarding':
            return 'native_only'
        return {'assurance': 'assure_rec', 'security_assurance': 'assure_rec', 'renewal': 'contract_rec',
                'contract': 'contract_rec', 'contract_renewal': 'contract_rec'}.get(purpose, 'vendor_rec')
    drivers = review.get('framework_drivers') or [review]
    for driver in drivers:
        if driver.get('framework_driver_active') is False:
            continue
        plan = driver.get('framework_plan_key')
        if plan:
            if plan in CATALOG['plan_templates']:
                return CATALOG['plan_templates'][plan]
            # New catalogs can declare the association without changing native plan identity.
            from framework_catalog import CATALOGS
            definition = next((p for p in CATALOGS.get(driver.get('framework_key'), {}).get('review_plans', []) if p['key'] == plan), {})
            if definition.get('review_template_id'):
                return definition['review_template_id']
            raise HTTPException(409, 'This native Review plan needs a completion-template mapping')
    baseline = review.get('baseline_key')
    if baseline:
        if baseline not in CATALOG['baseline_templates']:
            raise HTTPException(409, 'This native Review baseline needs a completion-template mapping')
        return CATALOG['baseline_templates'][baseline]
    if review.get('framework_key') or review.get('iso_audit'):
        if review.get('iso_audit'):
            return 'native_only'
        raise HTTPException(409, 'This framework Review needs its native plan association reconciled')
    return 'custom'


def service_snapshot(services, area_ids):
    tools = {t['tool_id']: t for t in services.get('catalog', SERVICES['tools'])}
    tools.update({t['tool_id']: t for t in services.get('custom_tools', [])})
    return [{'area_id': key, 'name': AREAS[key]['name'],
             'responsibility': services.get('areas', {}).get(key, {}).get('responsibility', 'un'),
             'responsibility_label': RESP[services.get('areas', {}).get(key, {}).get('responsibility', 'un')],
             'tools': [{'tool_id': ident, 'name': tools.get(ident, {}).get('name', ident)}
                       for ident in services.get('areas', {}).get(key, {}).get('tool_ids', [])]} for key in area_ids]


def contract_for(review, services=None):
    services = services or {}
    frozen = review.get('r4_current_checklist') or {}
    if frozen.get('occurrence_id') == review_occurrences.occurrence_id(review) and frozen.get('contract'):
        return copy.deepcopy(frozen['contract'])
    ident = template_id(review)
    steps, context = [], []
    def add(step_id, text, who, support='', operating=False):
        steps.append({'step_id': step_id, 'text': text, 'who': who, 'support': support, 'operating': operating})
    if ident in RECORDS:
        for index, (text, support, who) in enumerate(RECORDS[ident]['steps']):
            add(f'{ident}:record:{index + 1}', text, who, support)
    elif ident in TOPICS:
        topic = TOPICS[ident]
        context = service_snapshot(services, topic['areas'])
        primary = context[0]
        resp = primary['responsibility']
        setup = review.get('activity_setup') or {}
        if primary['area_id'] != 'governance' and resp in ('cl', 'tp'):
            operator = 'the client' if resp == 'cl' else 'another provider'
            names = ', '.join(t['name'] for t in primary['tools'])
            add(f'{ident}:operation:confirmation', primary['name'] + ' is run by ' + operator +
                (f' ({names})' if names else '') + ': their confirmation and results for this period are on file', 'cl', 'Results for this review period', True)
            add(f'{ident}:operation:exceptions', 'Exceptions they reported are resolved or raised as findings', 'cl', operating=True)
        elif primary['area_id'] != 'governance' and not setup.get('no_ticket') and resp in ('iv', 'co', 'un'):
            cadence = {'monthly': 'every month', 'quarterly': 'every quarter', 'semiannual': 'every six months', 'annual': 'every year'}.get(review.get('recurrence'), f"every {review.get('custom_recurrence_days')} days")
            once = review.get('recurrence') == 'none'
            add(f'{ident}:operation:ticket', 'Recurring ConnectWise ticket is active and set to ' + ('run once' if once else 'recur ' + cadence), 'spm', operating=True)
            add(f'{ident}:operation:due', 'Latest ticket was completed by its due date', 'spm', operating=True)
            add(f'{ident}:operation:results', 'Results from the ticket are uploaded to this review', 'spm', 'Results for this review period', True)
            add(f'{ident}:operation:exceptions', 'Exceptions noted in the ticket are resolved or raised as findings', 'spm', operating=True)
            if not once:
                add(f'{ident}:operation:next', 'Next occurrence is scheduled in ConnectWise', 'spm', operating=True)
        elif primary['area_id'] != 'governance' and resp != 'no':
            add(f'{ident}:operation:results', 'Review performed for this period and results uploaded to this review', 'spm', 'Results for this review period', True)
            add(f'{ident}:operation:exceptions', 'Exceptions found are resolved or raised as findings', 'spm', operating=True)
        cis = review.get('framework_key') == 'cis-ig1' or any(d.get('framework_key') == 'cis-ig1' for d in review.get('framework_drivers', []))
        tuples = topic['generic'] + topic['always'] + topic['client']
        governance = topic.get('governance')
        rows = []
        if governance:
            for index, text in enumerate(governance['gov']):
                if isinstance(text, str) and text.startswith('@always'):
                    text = topic['always'][int(text[7:])][0]
                if isinstance(text, list):
                    text = text[0 if cis else 1]
                rows.append((f'governance:{index + 1}', text, 'spm'))
            rows += [(f'client:{index + 1}', text, 'client') for index, text in enumerate(governance['client'])]
        else:
            rows = [(f'always:{index + 1}', row[0], row[2]) for index, row in enumerate(topic['always'])]
            rows += [(f'client:{index + 1}', row[0], row[2]) for index, row in enumerate(topic['client'])]
        for step_id, raw, who in rows:
            support = next((row[1] for row in tuples if row[0] == raw), '')
            text = raw
            if not cis:
                if text.startswith(('For CIS ', 'For applicable CIS ')):
                    text = {'vuln': 'Review vulnerability-management and risk-based remediation processes under the applicable framework and organizational plan; confirm actual operational timeliness separately.',
                            'backup': 'Review the data recovery process under the applicable framework and organizational plan, including relevant changes and separate operational testing.',
                            'awareness': 'Confirm workforce and new-hire training under the applicable program and organizational timing policy.' if 'train new hires' in text.lower() else 'Review awareness-program content under the applicable requirements and organizational plan, including relevant changes.'}.get(ident, text)
                text = 'GoverNara recommended check: ' + text.replace('where the framework requires', 'where the applicable source or organizational policy calls for')
            add(f'{ident}:{step_id}', text, who, support)
        kind = review.get('framework_key')
        source_context = None
        if ident == 'awareness' and kind == 'hipaa':
            source_context = 'HIPAA source context: the security awareness and training program covers all workforce members, including management. Evaluate the addressable specifications for security reminders, protection from malicious software, log-in monitoring and password management; document the applicable 164.306(d) decisions and measures.'
        if ident == 'awareness' and kind == 'nist-csf-2':
            source_context = "NIST CSF source context: assess awareness and training for general roles (PR.AT-01) and the knowledge and skills needed for specialized roles (PR.AT-02), against the organization's selected outcomes and responsibilities. CSF does not prescribe the shared topic list or annual interval."
        if kind == 'nist-csf-2' and ident in ('incident', 'backup'):
            source_context = 'NIST CSF source context: distinguish planning and exercises from actual incident response and recovery. An exercise or governance Review alone does not establish incident-dependent execution outcomes.'
        if source_context:
            first_governance = next((step for step in steps if not step['operating']), None)
            if first_governance:
                first_governance['text'] += ' ' + source_context
    elif ident not in ('custom', 'native_only'):
        raise HTTPException(409, 'Unknown completion template; reconcile the native Review mapping')
    result = {'template_id': ident, 'template_version': CATALOG['version'], 'steps': steps,
              'required_support': list(dict.fromkeys(s['support'] for s in steps if s['support'])),
              'service_context': context, 'custom': ident == 'custom', 'native_gate': ident == 'native_only'}
    result['contract_token'] = create_requests.digest(result)
    return result


async def get_contract(s, review, user):
    authorization.scope(user, review['client_id'])
    client = await s.db.clients.find_one({'client_id': review['client_id']}, {'_id': 0})
    if not client:
        raise HTTPException(404, 'Client not found')
    services = (client.get('profile') or {}).get('services', {})
    from r4_services import catalog
    services = {**services, 'catalog': await catalog(s)}
    contract = contract_for(review, services)
    checkpoint = review.get('r4_current_checklist') or {}
    same = checkpoint.get('occurrence_id') == review_occurrences.occurrence_id(review)
    accepted = {}
    pending = review.get('_policy_coverage_pending')
    if pending is not None:
        from policy_review_coverage import pending_retry
        plan = pending_retry(review, pending.get('request') if isinstance(pending, dict) else None)
        accepted = {'accepted_completion_retry': {
            'request': copy.deepcopy(plan['request']),
            'completed_at': plan['completed']['completed_at'],
            'completed_by': plan['completed']['completed_by']}}
    return {**contract, **accepted, 'occurrence_id': review_occurrences.occurrence_id(review), 'expected_updated_at': review.get('updated_at'),
            'results': copy.deepcopy(checkpoint.get('results', [])) if same else [],
            'supporting_reference': checkpoint.get('supporting_reference', '') if same else '',
            'read_only': client.get('status') == 'archived' or review.get('status') in ('completed', 'cancelled') or not authorization.writable(user)
                or user.get('role') == 'client_contributor' and user.get('user_id') not in (review.get('owner_id'), review.get('reviewer_id'))}


def validate_results(contract, checklist, complete=True):
    data = checklist.model_dump() if isinstance(checklist, BaseModel) else checklist
    if not data or data.get('contract_token') != contract['contract_token']:
        raise HTTPException(409, 'The Review guide changed; reopen its current checklist before saving')
    values = data.get('results', [])
    allowed = {step['step_id'] for step in contract['steps']}
    supplied = [value['step_id'] for value in values]
    if len(set(supplied)) != len(supplied) or set(supplied) - allowed:
        raise HTTPException(422, 'Unknown or duplicate checklist step')
    if complete and set(supplied) != allowed:
        raise HTTPException(422, 'Record a result for every checklist step before completing this Review')
    for value in values:
        if value.get('result') not in CATALOG['result_values']:
            raise HTTPException(422, 'Choose Pass, Exception, Not applicable or Not managed by iVenture')
        if complete and value['result'] != 'Pass' and not value.get('reason', '').strip():
            raise HTTPException(422, 'Record a reason for every non-Pass result')
    return {v['step_id']: v for v in values}


async def current_file_support(s, review, metadata):
    """Verify one captured version at a time without returning or retaining file bytes."""
    oid = review_occurrences.occurrence_id(review)
    for item in metadata:
        ident, digest = item.get('evidence_id'), item.get('sha256')
        version, size = item.get('version'), item.get('size')
        if not (isinstance(ident, str) and ident.strip() and
                isinstance(item.get('filename'), str) and item['filename'].strip() and
                type(version) is int and version > 0 and type(size) is int and 0 <= size <= 8 * 1024 * 1024 and
                isinstance(digest, str) and re.fullmatch(r'[0-9a-f]{64}', digest)):
            continue
        # Recheck the exact native relationship and captured version after the metadata read.
        row = await s.db.evidence.find_one({'evidence_id': ident, 'client_id': review['client_id'],
            'archived_at': None, 'version': version, 'sha256': digest, 'size': size,
            **evidence_context.review_evidence_query(review, oid)}, {'_id': 0, 'content_base64': 1})
        encoded = (row or {}).get('content_base64')
        if not isinstance(encoded, str) or len(encoded) > 12 * 1024 * 1024:
            continue
        try:
            content = base64.b64decode(encoded.split(',')[-1], validate=True)
        except (ValueError, base64.binascii.Error):
            continue
        if len(content) == size and hashlib.sha256(content).hexdigest() == digest:
            return True
    return False


async def validate_completion(s, review, body, evidence, user):
    data = body.model_dump(exclude_unset=True) if isinstance(body, BaseModel) else body
    contract = await get_contract(s, review, user)
    # Existing completed-occurrence retry handling must run before this prospective gate.
    if data.get('occurrence_id') != contract['occurrence_id']:
        raise HTTPException(409, 'The Review occurrence changed; reload before completing')
    if contract['steps'] and 'expected_updated_at' not in data:
        raise HTTPException(428, 'Reopen the Review to obtain its current saved revision')
    s._require_snapshot(data, review)
    if contract['read_only']:
        raise HTTPException(409, 'This retained Review is read-only')
    checklist = data.get('checklist')
    if not contract['steps'] and not checklist:
        results = {}
    else:
        results = validate_results(contract, checklist)
    exception = any(v['result'] == 'Exception' for v in results.values())
    if 'outcome' in data and data['outcome'] not in ('No exceptions noted', 'Exceptions noted'):
        raise HTTPException(422, 'Choose a valid Review outcome')
    if exception and data.get('outcome') != 'Exceptions noted':
        raise HTTPException(422, 'The checklist contains an Exception; retain its findings and follow-up')
    if exception and ('risk_assessment' in data or 'risk_outcome' in data):
        raise HTTPException(422, 'Complete this exception through the Review follow-up form; risk rating is a separate decision')
    if exception and not await s.db.findings.count_documents({'client_id': review['client_id'], 'review_id': review['review_id'],
            **review_occurrences.occurrence_query(review, contract['occurrence_id'])}):
        raise HTTPException(422, 'Record the exception through Raise finding before completing this Review; corrective work may remain open')
    if not isinstance(data.get('supporting_reference', ''), str):
        raise HTTPException(422, 'Record the supporting result reference as text')
    reference = data.get('supporting_reference', '').strip()
    if len(reference) > 4000:
        raise HTTPException(422, 'Keep the supporting result reference within 4,000 characters')
    setup = review.get('activity_setup') or {}
    planned = {str(setup.get(k) or '').strip() for k in ('recurring_ticket_number', 'recurring_ticket_url')}
    for item in evidence:
        ident = item.get('evidence_id')
        if item.get('client_id') != review['client_id'] or not isinstance(ident, str) or not ident.strip():
            raise HTTPException(422, 'Evidence must belong to this client and Review occurrence')
        linked = await s.db.evidence.find_one({'evidence_id': ident, 'client_id': review['client_id'],
            **evidence_context.review_evidence_query(review, contract['occurrence_id'])}, {'_id': 0, 'evidence_id': 1})
        if not linked:
            raise HTTPException(422, 'Evidence must belong to this client and Review occurrence')
    result_reference = reference and reference not in planned and reference.lstrip('#').strip() not in planned
    if contract['required_support'] and not result_reference and not await current_file_support(s, review, evidence):
        raise HTTPException(422, 'Attach current-occurrence support or record an explicit completed-result reference; a planned recurring ticket alone is insufficient')
    return {**({'checklist_outcome': data['outcome']} if 'outcome' in data else {}),
            'review_template_id': contract['template_id'], 'review_template_version': contract['template_version'],
            'checklist': {k: copy.deepcopy(contract[k]) for k in ('template_id', 'template_version', 'contract_token', 'required_support', 'service_context')},
            'checklist_results': [{**step, 'result': results[step['step_id']]['result'], 'reason': results[step['step_id']].get('reason', '')} for step in contract['steps']],
            'supporting_reference': reference, 'activity_setup': copy.deepcopy(setup)}


def router_for(s):
    router = APIRouter(prefix='/api')

    @router.get('/reviews/{review_id}/completion-guide')
    async def read(review_id: str, user=Depends(s.get_current_user)):
        return await get_contract(s, await s._authorized_parent('reviews', review_id, user), user)

    @router.put('/reviews/{review_id}/completion-guide')
    @s.review_mutation
    async def save(review_id: str, body: GuideCheckpointIn, user=Depends(s.get_current_user), key: str | None = Header(default=None, alias='Idempotency-Key')):
        selected = await s._authorized_parent('reviews', review_id, user, write=True)
        async def execute(identity):
            review = await s._authorized_parent('reviews', review_id, user, write=True)
            checkpoint = review.get('r4_current_checklist') or {}
            if checkpoint.get('request_id') != identity:
                await s._review_selection(review, body.occurrence_id, write=True)
                s._require_snapshot(body.model_dump(), review)
                contract = await get_contract(s, review, user)
                validate_results(contract, body.checklist, complete=False)
                frozen = {k: copy.deepcopy(contract[k]) for k in ('template_id', 'template_version', 'contract_token', 'steps', 'required_support', 'service_context', 'custom', 'native_gate')}
                checkpoint = {'occurrence_id': body.occurrence_id, 'contract': frozen, 'results': [r.model_dump() for r in body.checklist.results],
                              'supporting_reference': body.supporting_reference, 'saved_by': user['user_id'], 'request_id': identity}
                at = s._next_write_time(review.get('updated_at'))
                changed = await s.db.reviews.update_one({'review_id': review_id, 'client_id': review['client_id'], 'updated_at': review.get('updated_at'),
                    'current_occurrence_id': review.get('current_occurrence_id')}, {'$set': {'r4_current_checklist': checkpoint, 'updated_at': at}})
                if not changed.matched_count:
                    raise HTTPException(409, 'Review changed; keep the draft and reload before saving')
                review = {**review, 'r4_current_checklist': checkpoint, 'updated_at': at}
                await s.db.create_requests.update_one({'_id': identity}, {'$set': {'primary_started': True}})
            await s.audit(user, 'Review checklist saved', 'review', review_id, review['client_id'], meta={'occurrence_id': body.occurrence_id})
            return await get_contract(s, review, user)
        return await create_requests.run(s.db, key or create_requests.digest(body.model_dump()), user['user_id'], selected['client_id'],
                                         'reviews/' + review_id + '/completion-guide', body.model_dump(), execute)

    return router
