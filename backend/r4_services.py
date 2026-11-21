"""Shared service configuration and recoverable activity commands, using native Reviews."""
import copy
import json
import re
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo.errors import DuplicateKeyError

import authorization
import create_requests
import review_occurrences
import shared_review_plans
from framework_catalog import CATALOGS, active_definitions, active_plans, client_configuration
from r4_review_completion import CATALOG as TEMPLATES, TOPICS, template_id

CATALOG = json.loads((Path(__file__).parents[1] / 'shared/catalogs/r4ServicesTools.json').read_text(encoding='utf-8'))
AREA_IDS = {a['id'] for a in CATALOG['areas']}
RESP_IDS = {r['id'] for r in CATALOG['responsibilities']}


class StrictInput(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class ToolIn(StrictInput):
    tool_id: str = Field(min_length=1, max_length=160, pattern=r'^[A-Za-z0-9_-]+$')
    name: str = Field(min_length=1, max_length=255)
    vendor: str = Field(default='', max_length=255)
    category: Literal['iv', 'ivx', 'org', 'custom'] = 'org'
    area_ids: list[str] = Field(min_length=1, max_length=23)
    description: str = Field(default='', max_length=4000)
    product_reference: str = Field(default='', max_length=2000)
    source_references: list[str] = Field(default_factory=list, max_length=100)
    capabilities: list[str] = Field(default_factory=list, max_length=100)
    gaps: list[str] = Field(default_factory=list, max_length=100)
    possible_records: list[str] = Field(default_factory=list, max_length=100)
    verification_hints: list[str] = Field(default_factory=list, max_length=100)
    to_confirm: str = Field(default='', max_length=2000)
    retired: bool = False

    @field_validator('name')
    @classmethod
    def name_required(cls, value):
        if not value.strip():
            raise ValueError('A tool name is required')
        return value.strip()

    @field_validator('area_ids')
    @classmethod
    def valid_areas(cls, value):
        if set(value) - AREA_IDS or len(set(value)) != len(value):
            raise ValueError('Choose known, distinct service areas')
        return value

    @field_validator('source_references', 'capabilities', 'gaps', 'possible_records', 'verification_hints')
    @classmethod
    def bounded_lines(cls, value):
        if any(not isinstance(v, str) or len(v) > 2000 for v in value):
            raise ValueError('Tool descriptions must contain bounded text lines')
        return value


class AreaIn(StrictInput):
    responsibility: Literal['un', 'iv', 'co', 'cl', 'tp', 'no'] = 'un'
    tool_ids: list[str] = Field(default_factory=list, max_length=100)

    @field_validator('tool_ids')
    @classmethod
    def known_shape(cls, value):
        if len(set(value)) != len(value) or any(not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', ident) for ident in value):
            raise ValueError('Choose distinct, valid tool identities')
        return value


class ServicesIn(StrictInput):
    expected_updated_at: str | None = Field(max_length=100)
    areas: dict[str, AreaIn]
    custom_tools: list[ToolIn] = Field(default_factory=list, max_length=100)
    preset: Literal['full', 'comanaged', 'security', 'advisory'] | None = None


class CoordinationIn(StrictInput):
    activity_id: str | None = Field(default=None, max_length=255)
    review_id: str | None = Field(default=None, max_length=160)
    expected_updated_at: str | None = Field(default=None, max_length=100)
    expected_client_updated_at: str | None = Field(max_length=100)
    area_id: str | None = Field(default=None, max_length=64)
    tool_ids: list[str] = Field(default_factory=list, max_length=100)
    custom_tools: list[ToolIn] = Field(default_factory=list, max_length=100)
    recurring_ticket_number: str = Field(default='', max_length=33)
    recurring_ticket_url: str = Field(default='', max_length=2048)
    recurring_ticket_summary: str = Field(default='', max_length=255)
    cadence: Literal['monthly', 'quarterly', 'semiannual', 'annual', 'custom'] | None = None
    custom_days: int | None = Field(default=None, ge=1, le=3660)
    first_next_due: str | None = Field(default=None, max_length=10)
    notes: str = Field(default='', max_length=2000)
    no_ticket: bool | None = None
    ticket_confirmed: bool = False

    @field_validator('tool_ids')
    @classmethod
    def valid_tool_ids(cls, value):
        return AreaIn.known_shape(value)

    @field_validator('recurring_ticket_number')
    @classmethod
    def ticket(cls, value):
        value = value.strip()
        if not value:
            return ''
        if not re.fullmatch(r'#?\s*\d{1,32}', value):
            raise ValueError('Enter the ticket number only, using up to 32 digits')
        return value.lstrip('#').strip()

    @field_validator('recurring_ticket_url')
    @classmethod
    def ticket_url(cls, value):
        value = value.strip()
        if value:
            url = urlsplit(value)
            if url.scheme != 'https' or not url.hostname or url.username or url.password:
                raise ValueError('Use an HTTPS ticket URL without sign-in details')
        return value

    @field_validator('first_next_due')
    @classmethod
    def due_date(cls, value):
        if value and date.fromisoformat(value).isoformat() != value:
            raise ValueError('Enter a valid first / next review date')
        return value


class SetupIn(CoordinationIn):
    responsibility: Literal['iv', 'co', 'cl', 'tp', 'no'] | None = None


class ExclusionIn(StrictInput):
    expected_updated_at: str | None = Field(max_length=100)
    expected_client_updated_at: str | None = Field(max_length=100)
    excluded: bool
    reason: str = Field(default='', max_length=2000)
    kind: Literal['spm', 'client', 'na'] | None = None
    note: str = Field(default='', max_length=2000)


class ToolSaveIn(StrictInput):
    expected_updated_at: str | None = Field(max_length=100)
    tool: ToolIn


class CatalogBulkIn(StrictInput):
    tool_ids: list[str] = Field(min_length=1, max_length=500)
    expected_versions: dict[str, str | None]
    category: Literal['iv', 'ivx', 'org'] | None = None
    add_area_id: str | None = None
    retired: bool | None = None


class ReplaceIn(StrictInput):
    replacement_id: str = Field(min_length=1, max_length=160)
    expected_updated_at: str | None = Field(max_length=100)
    retire: bool = True


def assert_settled(row, identity=None):
    pending = (row or {}).get('_r4_context_pending')
    if pending and pending != (identity or create_requests.current.get()):
        raise HTTPException(409, 'An earlier shared activity save needs recovery; retry its original command first')


async def require_settled_population(db, scope, rows=(), collections=()):
    """Check authorized raw inputs before deriving, counting or projecting them.

    Callers supply the authorized Mongo query. Named collections use that exact
    query, so count/projection limits cannot hide a pending contributing record.
    """
    for row in rows:
        assert_settled(row)
    for name in dict.fromkeys(('clients', *collections)):
        pending = await db[name].find({**scope, '_r4_context_pending': {'$exists': True}},
            {'_id': 0, 'client_id': 1, '_r4_context_pending': 1}).to_list(None)
        for row in pending:
            assert_settled(row)


async def client_for(s, cid, user, write=False, identity=None):
    authorization.scope(user, cid)
    if write:
        authorization.require_program_admin(user)
    client = await s.db.clients.find_one({'client_id': cid}, {'_id': 0})
    if not client:
        raise HTTPException(404, 'Client not found')
    assert_settled(client, identity)
    if write and client.get('status') == 'archived':
        raise HTTPException(409, 'Restore the archived client before changing service setup')
    return client


async def assessment_writer(s, row, user, identity=None, *, require_active=True):
    """Recheck the actual assigned writer and current program, including retained commands."""
    if not authorization.writable(user):
        raise HTTPException(403, 'Read-only role')
    authorization.scope(user, row['client_id'])
    authorization.require_assigned(user, 'framework_assessments', row)
    assert_settled(row, identity)
    client = await client_for(s, row['client_id'], user, identity=identity)
    if client.get('status') == 'archived':
        raise HTTPException(409, 'Archived clients are read-only')
    if row['framework_key'] not in CATALOGS:
        raise HTTPException(404, 'Assessment items are not available for this framework')
    if not require_active:
        return  # Existing resolution access to retained records survives a program scope reduction.
    if not await s.db.requirements.find_one({'client_id': row['client_id'],
            'baseline_key': row['framework_key'], 'baseline_response': 'applies'}):
        raise HTTPException(409, 'Activate the program before changing follow-up work')
    if row['definition_id'] not in {definition['id'] for definition in
            active_definitions(row['framework_key'], client_configuration(row['framework_key'], client))}:
        raise HTTPException(409, 'This assessment is outside the current program scope')


async def catalog(s):
    merged = {t['tool_id']: {**copy.deepcopy(t), 'updated_at': None} for t in CATALOG['tools']}
    for row in await s.db.tool_catalog.find({}, {'_id': 0}).to_list(None):
        assert_settled(row)
        merged[row['tool_id']] = {k: v for k, v in row.items() if not k.startswith('_')}
    return list(merged.values())


def services_of(client):
    return copy.deepcopy((client.get('profile') or {}).get('services') or {'areas': {}, 'custom_tools': [], 'preset': None, 'exclusions': {}})


async def read_tool_usage(s, request, tool_id, user):
    """Current saved selections in the caller's complete accessible Client scope."""
    authorization.require_program_admin(user)
    known = {tool['tool_id']: tool for tool in await catalog(s)}
    tool = known.get(tool_id)
    if not tool:
        raise HTTPException(404, 'Tool not found')
    scope = authorization.scope(user)

    async def sources():
        await require_settled_population(s.db, scope)
        rows = await s.db.clients.find(scope, {'_id': 0, 'client_id': 1, 'name': 1,
            'status': 1, 'updated_at': 1, 'profile': 1,
            '_r4_context_pending': 1}).sort('client_id', 1).to_list(501)
        if len(rows) > 500:
            raise HTTPException(413, 'Tool usage exceeds the supported complete Client population')
        await require_settled_population(s.db, scope, rows=rows)
        return rows

    clients = await sources()
    usage, area_names = [], {area['id']: area['name'] for area in CATALOG['areas']}
    for client in clients:
        profile = client.get('profile')
        if profile is not None and not isinstance(profile, dict):
            raise HTTPException(409, 'Saved service selections could not be verified; reconcile them before using Tool usage')
        services = (profile or {}).get('services')
        if services is None:
            services = {}
        if not isinstance(services, dict):
            raise HTTPException(409, 'Saved service selections could not be verified; reconcile them before using Tool usage')
        areas = services.get('areas')
        if areas is None:
            areas = {}
        if not isinstance(areas, dict):
            raise HTTPException(409, 'Saved service selections could not be verified; reconcile them before using Tool usage')
        selected = []
        for area_id, area in sorted(areas.items()):
            if area is None:
                continue
            if not isinstance(area, dict) or (area.get('tool_ids') is not None and (
                    not isinstance(area['tool_ids'], list) or any(not isinstance(ident, str) for ident in area['tool_ids']))):
                raise HTTPException(409, 'Saved service selections could not be verified; reconcile them before using Tool usage')
            if tool_id in (area.get('tool_ids') or []):
                selected.append({'area_id': area_id, 'name': area_names.get(area_id, area_id)})
        if selected:
            usage.append({'client_id': client['client_id'], 'name': client.get('name'),
                'status': client.get('status'), 'expected_updated_at': client.get('updated_at'), 'areas': selected})
    # Recheck the same sources before publishing counts; a preview grants no replacement permission.
    if clients != await sources() or tool != next((item for item in await catalog(s) if item['tool_id'] == tool_id), None):
        raise HTTPException(409, 'Tool usage changed while loading; reload its current selections')
    current = await s.get_current_user(request)
    authorization.require_program_admin(current)
    if current['user_id'] != user['user_id'] or authorization.scope(current) != scope:
        raise HTTPException(409, 'Tool usage access changed while loading; reload its current selections')
    return {'tool_id': tool_id, 'expected_updated_at': tool.get('updated_at'), 'scope': 'authorized_clients',
        'client_count': len(usage), 'selection_count': sum(len(row['areas']) for row in usage), 'clients': usage}


async def provider_vendor_plan(s, client, services, user):
    """An internal provider relationship is provisional, never access or assurance evidence."""
    areas = [key for key, area in services.get('areas', {}).items() if area.get('responsibility') in ('iv', 'co')]
    if not areas or services.get('provider_vendor_id'):
        return []
    existing = await s.db.vendors.find({'client_id': client['client_id'], 'catalog_key': 'iventure-solutions'}, {'_id': 0}).to_list(None)
    for vendor in existing:
        assert_settled(vendor)
    if len(existing) == 1:
        services['provider_vendor_id'] = existing[0]['vendor_id']
        return []
    # A display name is insufficient to silently join or overwrite a genuine legacy relationship.
    legacy = await s.db.vendors.find({'client_id': client['client_id'], 'name': {'$regex': r'^iVenture\b', '$options': 'i'}}, {'_id': 0, 'vendor_id': 1, '_r4_context_pending': 1}).to_list(None)
    for vendor in legacy:
        assert_settled(vendor)
    if existing or legacy:
        services['provider_linkage'] = {'status': 'needs_reconciliation', 'candidate_ids': [row['vendor_id'] for row in existing + legacy]}
        return []
    administrative = any(key not in ('governance', 'pentest', 'training', 'darkweb') for key in areas)
    ident = 'vnd_' + uuid.uuid5(uuid.NAMESPACE_URL, client['client_id'] + ':services:iventure-solutions').hex
    at = s._now()
    vendor = {'vendor_id': ident, 'client_id': client['client_id'], 'name': 'iVenture Solutions', 'catalog_key': 'iventure-solutions',
              'service': 'Managed IT and security services provider (MSP/MSSP); service areas are recorded in Services & Tools' if administrative else
                         'Security and compliance advisory provider (vCISO / GRC program); service areas are recorded in Services & Tools',
              'category': 'Service Provider', 'criticality': 'critical' if administrative else 'high', 'criticality_provisional': True,
              'status': 'onboarding', 'data_types': [], 'data_relationship': [], 'business_owner_id': None, 'next_review': None,
              'last_review': None, 'review_frequency': 'annual', 'assurance_required': False, 'assurance_records': [],
              'source_services': {'by': user['user_id'], 'at': at, 'area_ids': areas,
                  'qualification': 'Provisional conservative criticality. Confirm actual business impact and access separately; service responsibility does not establish privileges, assurance or BAA status.'},
              'created_at': at, 'created_by': user['user_id']}
    services['provider_vendor_id'] = ident
    return [write_row('vendors', 'vendor_id', vendor, {'updated_at': at}, new=True)]


def exclusion_keys(activity):
    return list(dict.fromkeys([activity['activity_id'], *[
        'plan:' + driver['framework_key'] + ':' + driver['framework_plan_key']
        for driver in activity['drivers']]]))


async def activities(s, client):
    cid = client['client_id']
    selected = await s.db.requirements.find({'client_id': cid, 'baseline_response': 'applies'}, {'_id': 0, 'baseline_key': 1}).to_list(None)
    keys = {r['baseline_key'] for r in selected}
    plans = [(key, p) for key in CATALOGS if key in keys for p in active_plans(key, client_configuration(key, client))]
    reviews = await s.db.reviews.find({'client_id': cid, 'status': {'$nin': ['completed', 'cancelled']}}, {'_id': 0}).to_list(None)
    for review in reviews:
        assert_settled(review)
    result, used = [], set()
    exclusions = services_of(client).get('exclusions', {})
    for key, plan in plans:
        matches = [r for r in reviews if not any(r.get(f) for f in ('risk_id', 'policy_id', 'vendor_id', 'ai_system_id')) and
                   (r.get('framework_plan_key') == plan['key'] or any(d.get('framework_key') == key and d.get('framework_plan_key') == plan['key'] for d in r.get('framework_drivers', [])) or
                    plan.get('baseline_key') and r.get('baseline_key') == plan['baseline_key'])]
        if len(matches) > 1:
            raise HTTPException(409, 'Multiple Reviews claim the same native activity; reconcile their identities first')
        review = matches[0] if matches else None
        ident = 'review:' + review['review_id'] if review else ('shared:' + plan['baseline_key'] if plan.get('baseline_key') else 'plan:' + key + ':' + plan['key'])
        if ident in used:
            prior = next(x for x in result if x['activity_id'] == ident)
            prior['drivers'].append(shared_review_plans.driver(key, plan))
            continue
        used.add(ident)
        sample = review or {'framework_key': key, 'framework_plan_key': plan['key'], 'review_template_id': plan.get('review_template_id')}
        topic = template_id(sample)
        area_ids = TOPICS.get(topic, {}).get('areas', ['governance'])
        setup = copy.deepcopy((review or {}).get('activity_setup') or {})
        exclusion = exclusions.get(ident) or exclusions.get('plan:' + key + ':' + plan['key'])
        if setup.get('no_ticket') and not exclusion:
            exclusion = {'reason': 'No recurring ticket: the Security Program Manager performs this review', 'kind': 'spm'}
        areas = services_of(client).get('areas', {})
        primary = area_ids[0]
        responsibility = areas.get(primary, {}).get('responsibility', 'un')
        technical = [a for a in area_ids if a != 'governance' and areas.get(a, {}).get('responsibility') in ('iv', 'co')]
        display_area = technical[0] if responsibility not in ('iv', 'co', 'un') and technical else primary
        scheduled = review_occurrences.view(review) if review else {}
        configured = (review and setup.get('recurring_ticket_number') and scheduled.get('status') != 'needs_scheduling'
                      and scheduled.get('next_review_date') and review.get('recurrence') in ('monthly', 'quarterly', 'semiannual', 'annual', 'custom')
                      and (review.get('recurrence') != 'custom' or type(review.get('custom_recurrence_days')) is int
                           and 1 <= review['custom_recurrence_days'] <= 3660))
        state = 'removed' if exclusion else 'decide' if responsibility == 'un' else 'done' if configured else 'todo'
        result.append({'activity_id': ident, 'review_id': review.get('review_id') if review else None, 'title': review.get('title') if review else plan['title'],
            'template_id': topic, 'framework_key': key, 'plan_key': plan['key'], 'drivers': [shared_review_plans.driver(key, plan)],
            'area_ids': area_ids, 'area_id': display_area, 'responsibility': areas.get(display_area, {}).get('responsibility', 'un'),
            'state': state, 'exclusion': exclusion, 'expected_updated_at': (review or {}).get('updated_at'),
            'cadence': (review or {}).get('recurrence', plan.get('default_cadence')), 'custom_days': (review or {}).get('custom_recurrence_days'),
            'first_next_due': ((review or {}).get('due_date') or '')[:10], 'setup': setup,
            'internal': primary == 'governance', 'provider_relevant': responsibility in ('iv', 'co', 'un') or bool(technical)})
    # Resolve saved decisions after all actual drivers have merged. A later
    # driver's stable alias may hold a legacy decision; never infer its kind.
    for activity in result:
        for alias in exclusion_keys(activity):
            if exclusions.get(alias):
                activity.update(exclusion=exclusions[alias], state='removed')
                break
    return result


async def read_context(s, assessment, user):
    client = await client_for(s, assessment['client_id'], user)
    candidates = [a for a in await activities(s, client) if any(d['framework_key'] == assessment['framework_key'] and assessment['definition_id'] in d['framework_safeguards'] for d in a['drivers'])]
    services = services_of(client)
    binding = services.get('assessment_activities', {}).get(assessment['framework_assessment_id'])
    return {'client_id': client['client_id'], 'expected_client_updated_at': client.get('updated_at'), 'services': services,
            'candidates': candidates, 'selected_activity_id': binding if any(a['activity_id'] == binding for a in candidates) else candidates[0]['activity_id'] if len(candidates) == 1 else None,
            'catalog': await catalog(s)}


def write_row(collection, field, row, patch, *, new=False, preconditions=None):
    return {'collection': collection, 'id_field': field, 'id': row[field], 'expected_updated_at': row.get('updated_at'),
            'patch': patch, 'new': new, 'document': row if new else None, 'preconditions': preconditions or {}, 'client_id': row.get('client_id')}


async def authorize_write_plan(s, writes, user, identity, *, assessment_item=None):
    """A frozen plan retains accepted values, never its actor's former access."""
    if assessment_item is not None:
        from assessment_item_tasks import authorize_plan
        await authorize_plan(s, writes, user, identity, assessment_item)
    elif any(item['collection'] != 'framework_assessments' for item in writes):
        authorization.require_program_admin(user)
    elif not authorization.writable(user):
        raise HTTPException(403, 'Read-only role')
    for cid in sorted({item.get('client_id') for item in writes} - {None}):
        client = await client_for(s, cid, user, identity=identity)
        if client.get('status') == 'archived':
            raise HTTPException(409, 'Restore the archived client before changing service setup')


async def apply_plan(s, writes, identity, user, description, *, assessment_item=None, after_apply=None):
    """Claim the complete validated write set before business writes; retain failed intents."""
    receipt = await s.db.create_requests.find_one({'_id': identity})
    stored = (receipt or {}).get('r4_write_plan')
    if stored is not None:
        writes = stored
    await authorize_write_plan(s, writes, user, identity, assessment_item=assessment_item)
    if stored is None:
        await s.db.create_requests.update_one({'_id': identity}, {'$set': {'r4_write_plan': writes}})
    claimed = []
    try:
        for item in writes:
            coll = s.db[item['collection']]
            query = {item['id_field']: item['id']}
            current = await coll.find_one(query)
            if current and current.get('_r4_context_applied') == identity:
                claimed.append(item)
                continue
            assert_settled(current, identity)
            if current and current.get('_r4_context_pending') == identity:
                claimed.append(item)
                continue
            if item['new'] and current:
                raise HTTPException(409, 'The activity was created in another save; reload its canonical Review')
            if not item['new'] and (not current or current.get('updated_at') != item['expected_updated_at']):
                raise HTTPException(409, 'Shared activity context changed; reload before saving')
            if current and any(current.get(k) != v for k, v in item.get('preconditions', {}).items()):
                raise HTTPException(409, 'The assessment changed after Apply; reload before saving')
            if item['new']:
                doc = {**item['document'], '_id': item['id'], '_r4_context_pending': identity}
                try:
                    await coll.insert_one(doc)
                except DuplicateKeyError as error:
                    raise HTTPException(409, 'The activity was created in another save; reload before saving') from error
            else:
                claim = {**query, **item.get('preconditions', {}), 'updated_at': item['expected_updated_at'], '_r4_context_pending': None}
                if item['collection'] == 'reviews':
                    # Native execution and annual coverage own their accepted
                    # occurrence until they finish. Claim in the same CAS so a
                    # completion cannot start between our read and reservation.
                    claim.update({'_policy_coverage_pending': None, '$or': [
                        {'_execution_lock': None},
                        {'_execution_lock.until': {'$lt': datetime.now(timezone.utc).isoformat()}}]})
                changed = await coll.update_one(claim, {'$set': {'_r4_context_pending': identity}})
                if not changed.matched_count:
                    raise HTTPException(409, 'Another shared configuration save is in progress')
            claimed.append(item)
    except HTTPException:
        # No existing business data was changed before the full claim succeeded.
        if not (receipt or {}).get('primary_started'):
            for item in claimed:
                if item['new']:
                    await s.db[item['collection']].delete_one({item['id_field']: item['id'], '_r4_context_pending': identity, '_r4_context_applied': None})
                else:
                    await s.db[item['collection']].update_one({item['id_field']: item['id'], '_r4_context_pending': identity}, {'$unset': {'_r4_context_pending': ''}})
        raise
    await s.db.create_requests.update_one({'_id': identity}, {'$set': {'primary_started': True}})
    for item in writes:
        current = await s.db[item['collection']].find_one({item['id_field']: item['id']})
        if current.get('_r4_context_applied') == identity:
            continue
        changed = await s.db[item['collection']].update_one({item['id_field']: item['id'], '_r4_context_pending': identity},
            {'$set': {**item['patch'], '_r4_context_applied': identity}})
        if not changed.matched_count:
            raise HTTPException(409, 'Shared activity recovery is pending; retry the same save')
    for cid in sorted({item.get('client_id') for item in writes} - {None}):
        await s.audit(user, description, 'client', cid, cid, meta={'request_id': identity})
    await s.audit(user, description, 'service_configuration', identity, None, meta={'record_count': len(writes)})
    if after_apply is not None:
        # Keep the accepted set claimed until its domain-specific audit/effects finish.
        await after_apply()
    for item in writes:
        await s.db[item['collection']].update_one({item['id_field']: item['id'], '_r4_context_pending': identity}, {'$unset': {'_r4_context_pending': ''}})


async def prepare_context_plan(s, assessment, user, coordination):
    data = coordination.model_dump(exclude_unset=True) if isinstance(coordination, BaseModel) else CoordinationIn.model_validate(coordination).model_dump(exclude_unset=True)
    context = await read_context(s, assessment, user)
    client = await client_for(s, assessment['client_id'], user)
    if data.get('expected_client_updated_at') != client.get('updated_at'):
        raise HTTPException(409, 'Services changed after this proposal was applied; reload and apply it again')
    candidate = next((a for a in context['candidates'] if a['activity_id'] == data.get('activity_id')), None)
    activity_fields = {'recurring_ticket_number', 'recurring_ticket_url', 'recurring_ticket_summary', 'cadence', 'first_next_due', 'no_ticket', 'notes'}
    if any(data.get(k) for k in activity_fields) and not candidate:
        raise HTTPException(422, 'Choose the exact recurring activity before saving its setup')
    if candidate and (data.get('review_id') != candidate['review_id'] or data.get('expected_updated_at') != candidate['expected_updated_at']):
        raise HTTPException(409, 'The selected activity changed after Apply; reopen its setup')
    services = services_of(client)
    known = {t['tool_id']: t for t in context['catalog'] + services.get('custom_tools', [])}
    for tool in data.get('custom_tools', []):
        if tool['category'] != 'custom':
            raise HTTPException(422, 'An interview tool must remain client-specific')
        if tool['tool_id'] not in known:
            services.setdefault('custom_tools', []).append(tool)
            known[tool['tool_id']] = tool
    area = data.get('area_id') or (candidate or {}).get('area_id')
    if area and area not in AREA_IDS:
        raise HTTPException(422, 'Choose a known service area')
    for ident in data.get('tool_ids', []):
        if ident not in known:
            raise HTTPException(422, 'A selected tool is unavailable; reload its catalog')
    if area:
        current = services.setdefault('areas', {}).setdefault(area, {'responsibility': 'un', 'tool_ids': []})
        if any(known[t].get('retired') and t not in current.get('tool_ids', []) for t in data.get('tool_ids', [])):
            raise HTTPException(422, 'A retired tool cannot be newly selected')
        current['tool_ids'] = list(dict.fromkeys(current.get('tool_ids', []) + data.get('tool_ids', [])))
    writes = []
    at = s._next_write_time(client.get('updated_at'))
    if candidate:
        review = await s.db.reviews.find_one({'review_id': candidate['review_id'], 'client_id': client['client_id']}, {'_id': 0}) if candidate['review_id'] else None
        if review:
            assert_settled(review)
            if review.get('updated_at') != data.get('expected_updated_at'):
                raise HTTPException(409, 'The activity changed; reopen before saving')
        else:
            from framework_governance import stable
            key, plan_key = candidate['framework_key'], candidate['plan_key']
            plan = next(p for p in CATALOGS[key]['review_plans'] if p['key'] == plan_key)
            canonical = next(((fk, p) for fk, cat in CATALOGS.items() for p in cat['review_plans'] if plan.get('baseline_key') and p.get('baseline_key') == plan['baseline_key']), (key, plan))
            rid = stable(client['client_id'], 'review', canonical[1]['key'], canonical[0])
            review = {'review_id': rid, 'client_id': client['client_id'], 'title': candidate['title'], 'review_type': plan['review_type'],
                'framework_key': key, 'framework_plan_key': plan_key, 'framework_version': CATALOGS[key]['version'], 'framework_drivers': candidate['drivers'],
                'baseline_key': plan.get('baseline_key'), 'review_template_id': candidate['template_id'], 'owner_id': None,
                'status': 'needs_scheduling', 'recurrence': candidate['cadence'], 'due_date': None, 'created_by': user['user_id'], 'created_at': at}
            review['current_occurrence_id'] = review_occurrences.occurrence_id(review)
        setup = copy.deepcopy(review.get('activity_setup') or {})
        for field in ('recurring_ticket_number', 'recurring_ticket_url', 'recurring_ticket_summary', 'notes', 'no_ticket'):
            if field in data:
                setup[field] = data[field]
        if setup.get('recurring_ticket_url') and not setup.get('recurring_ticket_number'):
            raise HTTPException(422, 'Record the recurring ticket number alongside its URL')
        if data.get('ticket_confirmed') and setup.get('recurring_ticket_number'):
            setup['no_ticket'] = False
            services.setdefault('exclusions', {}).pop(candidate['activity_id'], None)
        patch = {'activity_setup': setup, 'updated_at': s._next_write_time(review.get('updated_at')), 'review_template_id': candidate['template_id']}
        cadence = data.get('cadence') or review.get('recurrence')
        custom = data.get('custom_days', review.get('custom_recurrence_days'))
        if cadence == 'custom' and (type(custom) is not int or not 1 <= custom <= 3660):
            raise HTTPException(422, 'Custom recurrence must be 1-3660 whole days')
        due = data.get('first_next_due')
        changed_schedule = cadence != review.get('recurrence') or cadence == 'custom' and custom != review.get('custom_recurrence_days')
        if changed_schedule and not due:
            raise HTTPException(422, 'Choose the first / next date when changing its schedule')
        if due and (due != str(review.get('due_date') or '')[:10] or changed_schedule):
            patch.update(due_date=due, recurrence=cadence, custom_recurrence_days=custom, recurrence_due_date=None)
            patch.update(review_occurrences.schedule({**review, **patch}, reset_anchor=True))
            patch['status'] = review_occurrences.view({**review, **patch})['status']
        writes.append(write_row('reviews', 'review_id', review, patch, new=candidate['review_id'] is None))
        services.setdefault('assessment_activities', {})[assessment['framework_assessment_id']] = 'review:' + review['review_id']
    writes.extend(await provider_vendor_plan(s, client, services, user))
    if services != services_of(client):
        writes.append(write_row('clients', 'client_id', client, {'profile.services': services, 'updated_at': at}))
    if writes:
        authorization.require_program_admin(user)
    return {'client_id': client['client_id'], 'assessment_id': assessment['framework_assessment_id'], 'writes': writes}


async def commit_context_plan(s, assessment, user, plan, identity, additional_writes=None):
    if plan['client_id'] != assessment['client_id'] or plan['assessment_id'] != assessment['framework_assessment_id']:
        raise HTTPException(409, 'This proposal belongs to another client or assessment')
    await apply_plan(s, plan['writes'] + (additional_writes or []), identity, user, 'Shared assessment context saved')


async def authorize_retained_command(s, key, user, cid, route, payload, *, assessment_item=None):
    # create_requests may repair audits or return a completed receipt before
    # execute runs. Check the retained affected set before either fast path.
    if key is not None and re.fullmatch(r'[A-Za-z0-9_-]{16,128}', key):
        identity = create_requests.digest([user['user_id'], cid, route, key])
        receipt = await s.db.create_requests.find_one({'_id': identity})
        if receipt and receipt.get('fingerprint') == create_requests.digest(payload):
            writes = receipt.get('r4_write_plan')
            if writes is not None:
                await authorize_write_plan(s, writes, user, identity, assessment_item=assessment_item)
                return identity
            elif receipt.get('primary_started') or receipt.get('state') == 'complete':
                raise HTTPException(409, 'The retained shared activity plan is unavailable; reconcile its original command')
    return None


async def run_command(s, key, user, cid, route, payload, prepare):
    if cid:
        authorization.scope(user, cid)
    authorization.require_program_admin(user)
    await authorize_retained_command(s, key, user, cid, route, payload)
    async def execute(identity):
        receipt = await s.db.create_requests.find_one({'_id': identity})
        writes = receipt.get('r4_write_plan')
        if writes is None:
            writes = await prepare()
        await apply_plan(s, writes, identity, user, 'Services and tools updated')
        return {'ok': True}
    return await create_requests.run(s.db, key, user['user_id'], cid, route, payload, execute)


def router_for(s):
    router = APIRouter(prefix='/api')

    @router.get('/service-catalog')
    async def read_catalog(user=Depends(s.get_current_user)):
        return {**CATALOG, 'tools': await catalog(s)}

    @router.get('/tool-catalog/{tool_id}/usage')
    async def tool_usage(tool_id: str, request: Request, user=Depends(s.get_current_user)):
        return await read_tool_usage(s, request, tool_id, user)

    @router.get('/clients/{cid}/services')
    async def read_services(cid: str, user=Depends(s.get_current_user)):
        client = await client_for(s, cid, user)
        return {'client_id': cid, 'services': services_of(client), 'updated_at': client.get('updated_at'), 'catalog': await catalog(s)}

    @router.post('/clients/{cid}/services')
    async def save_services(cid: str, body: ServicesIn, user=Depends(s.get_current_user), key: str | None = Header(default=None, alias='Idempotency-Key')):
        async def prepare():
            client = await client_for(s, cid, user, True)
            s._require_snapshot(body.model_dump(), client)
            if set(body.areas) - AREA_IDS:
                raise HTTPException(422, 'Unknown service area')
            services = services_of(client)
            custom = [t.model_dump() for t in body.custom_tools]
            if any(t['category'] != 'custom' for t in custom):
                raise HTTPException(422, 'Client tools must use the client-specific category')
            # Preserve custom records omitted from a form, including historical identities.
            known_custom = {t['tool_id']: t for t in services.get('custom_tools', [])}
            known_custom.update({t['tool_id']: t for t in custom})
            known = {t['tool_id']: t for t in await catalog(s)}
            known.update(known_custom)
            for area, value in body.areas.items():
                if len(set(value.tool_ids)) != len(value.tool_ids) or set(value.tool_ids) - set(known):
                    raise HTTPException(422, 'Unknown or duplicate selected tool')
                existing = services.get('areas', {}).get(area, {}).get('tool_ids', [])
                if any(known[t].get('retired') and t not in existing for t in value.tool_ids):
                    raise HTTPException(422, 'A retired tool cannot be newly selected')
                services.setdefault('areas', {})[area] = value.model_dump()
            services.update(custom_tools=list(known_custom.values()), preset=body.preset)
            provider_writes = await provider_vendor_plan(s, client, services, user)
            return provider_writes + [write_row('clients', 'client_id', client, {'profile.services': services, 'updated_at': s._next_write_time(client.get('updated_at'))})]
        return await run_command(s, key, user, cid, 'clients/' + cid + '/services', body.model_dump(), prepare)

    @router.get('/clients/{cid}/iv-setup')
    async def read_setup(cid: str, user=Depends(s.get_current_user)):
        client = await client_for(s, cid, user)
        rows = await activities(s, client)
        return {'client_id': cid, 'expected_client_updated_at': client.get('updated_at'), 'activities': rows,
                'outstanding_count': sum(a['provider_relevant'] and not a['internal'] and a['state'] in ('todo', 'decide') for a in rows)}

    @router.post('/clients/{cid}/iv-setup')
    async def save_setup(cid: str, body: SetupIn, user=Depends(s.get_current_user), key: str | None = Header(default=None, alias='Idempotency-Key')):
        async def prepare():
            client = await client_for(s, cid, user, True)
            entry = next((a for a in await activities(s, client) if a['activity_id'] == body.activity_id), None)
            if not entry:
                raise HTTPException(409, 'This activity is no longer in the active scope')
            if body.responsibility in ('iv', 'co') and (not body.recurring_ticket_number or not body.first_next_due or not body.cadence):
                raise HTTPException(422, 'Record the recurring ticket, cadence and first / next date')
            if body.responsibility in ('cl', 'tp', 'no'):
                if body.expected_client_updated_at != client.get('updated_at') or body.expected_updated_at != entry['expected_updated_at']:
                    raise HTTPException(409, 'Shared setup changed; reload before saving')
                services = services_of(client)
                services.setdefault('areas', {}).setdefault(entry['area_id'], {'tool_ids': []})['responsibility'] = body.responsibility
                return [write_row('clients', 'client_id', client, {'profile.services': services, 'updated_at': s._next_write_time(client.get('updated_at'))})]
            assessment = {'client_id': cid, 'framework_assessment_id': 'setup:' + entry['activity_id'], 'framework_key': entry['framework_key'], 'definition_id': entry['drivers'][0]['framework_safeguards'][0]}
            coordination = CoordinationIn.model_validate(body.model_dump(exclude={'responsibility'}, exclude_unset=True))
            plan = await prepare_context_plan(s, assessment, user, coordination)
            if body.responsibility:
                client_write = next((w for w in plan['writes'] if w['collection'] == 'clients'), None)
                services = copy.deepcopy(client_write['patch']['profile.services']) if client_write else services_of(client)
                services.setdefault('areas', {}).setdefault(entry['area_id'], {'tool_ids': []})['responsibility'] = body.responsibility
                if client_write:
                    client_write['patch']['profile.services'] = services
                else:
                    plan['writes'].append(write_row('clients', 'client_id', client, {'profile.services': services, 'updated_at': s._next_write_time(client.get('updated_at'))}))
                plan['writes'].extend(await provider_vendor_plan(s, client, services, user))
            return plan['writes']
        return await run_command(s, key, user, cid, 'clients/' + cid + '/iv-setup', body.model_dump(exclude_unset=True), prepare)

    @router.post('/clients/{cid}/iv-setup/exclusion/{activity_id:path}')
    async def exclusion(cid: str, activity_id: str, body: ExclusionIn, user=Depends(s.get_current_user), key: str | None = Header(default=None, alias='Idempotency-Key')):
        async def prepare():
            client = await client_for(s, cid, user, True)
            if body.expected_client_updated_at != client.get('updated_at'):
                raise HTTPException(409, 'Services changed; reload before changing this exclusion')
            entry = next((a for a in await activities(s, client) if a['activity_id'] == activity_id), None)
            if not entry or entry['expected_updated_at'] != body.expected_updated_at:
                raise HTTPException(409, 'Activity changed; reload before changing its exclusion')
            note = body.note.strip()
            if body.kind is None and note:
                raise HTTPException(422, 'Choose an explicit removal reason before adding a note')
            if body.excluded and body.kind is None and not body.reason.strip():
                raise HTTPException(422, 'Record the exclusion reason')
            review = None
            if entry['review_id']:
                review = await s.db.reviews.find_one({'review_id': entry['review_id'], 'client_id': cid}, {'_id': 0})
                if not review or review.get('updated_at') != body.expected_updated_at:
                    raise HTTPException(409, 'Activity changed; reload before changing its exclusion')
                assert_settled(review)
            services = services_of(client)
            if body.excluded:
                removal = {'reason': body.reason.strip(), 'by': user['user_id'], 'at': s._now()}
                if body.kind is not None:
                    base = {'spm': 'The Security Program Manager performs it; no recurring ticket',
                            'client': 'The client or another provider does it',
                            'na': 'Doesn’t apply to ' + client['name']}[body.kind]
                    removal.update(kind=body.kind, note=note, reason=base + (' — ' + note if note else ''))
                services.setdefault('exclusions', {})[activity_id] = removal
            else:
                for alias in exclusion_keys(entry):
                    services.setdefault('exclusions', {}).pop(alias, None)
            writes = [write_row('clients', 'client_id', client, {'profile.services': services, 'updated_at': s._next_write_time(client.get('updated_at'))})]
            if review and (not body.excluded or body.kind == 'spm'):
                writes.append(write_row('reviews', 'review_id', review, {'activity_setup.no_ticket': body.excluded, 'updated_at': s._next_write_time(review.get('updated_at'))}))
            return writes
        # Preserve every old default in legacy fingerprints; add only explicitly
        # supplied new fields so an accepted pre-extension receipt still replays.
        payload = body.model_dump(exclude={'kind', 'note'})
        payload.update(body.model_dump(include={'kind', 'note'}, exclude_unset=True))
        return await run_command(s, key, user, cid, 'clients/' + cid + '/iv-setup/exclusion/' + activity_id, payload, prepare)

    @router.get('/framework_assessments/{aid}/service-context')
    async def assessment_context(aid: str, user=Depends(s.get_current_user)):
        return await read_context(s, await s._authorized_parent('framework_assessments', aid, user), user)

    @router.post('/tool-catalog/save')
    async def save_tool(body: ToolSaveIn, user=Depends(s.get_current_user), key: str | None = Header(default=None, alias='Idempotency-Key')):
        authorization.require_program_admin(user)
        async def prepare():
            current = next((t for t in await catalog(s) if t['tool_id'] == body.tool.tool_id), None)
            if (current or {}).get('updated_at') != body.expected_updated_at:
                raise HTTPException(409, 'The tool changed; reload before saving')
            if body.tool.category == 'custom' or 'governance' in body.tool.area_ids:
                raise HTTPException(422, 'The global catalog contains tools; add client-specific tools in Services & Tools')
            stored = await s.db.tool_catalog.find_one({'tool_id': body.tool.tool_id}, {'_id': 0})
            row = stored or {'tool_id': body.tool.tool_id}
            patch = {**(current or {}), **body.tool.model_dump(), 'updated_at': s._next_write_time((current or {}).get('updated_at')), 'updated_by': user['user_id']}
            return [write_row('tool_catalog', 'tool_id', row, patch, new=stored is None)]
        return await run_command(s, key, user, None, 'tool-catalog/save', body.model_dump(), prepare)

    @router.post('/tool-catalog/bulk')
    async def bulk(body: CatalogBulkIn, user=Depends(s.get_current_user), key: str | None = Header(default=None, alias='Idempotency-Key')):
        authorization.require_program_admin(user)
        async def prepare():
            if body.add_area_id and (body.add_area_id not in AREA_IDS or body.add_area_id == 'governance'):
                raise HTTPException(422, 'Choose a tool service area')
            known = {t['tool_id']: t for t in await catalog(s)}
            writes = []
            for ident in dict.fromkeys(body.tool_ids):
                tool = known.get(ident)
                if not tool or ident not in body.expected_versions or tool.get('updated_at') != body.expected_versions[ident]:
                    raise HTTPException(409, 'A selected tool changed; reload the catalog')
                patch = copy.deepcopy(tool)
                if body.category is not None:
                    patch['category'] = body.category
                if body.retired is not None:
                    patch['retired'] = body.retired
                if body.add_area_id and body.add_area_id not in patch['area_ids']:
                    patch['area_ids'].append(body.add_area_id)
                patch.update(updated_at=s._next_write_time(tool.get('updated_at')), updated_by=user['user_id'])
                stored = await s.db.tool_catalog.find_one({'tool_id': ident}, {'_id': 0})
                writes.append(write_row('tool_catalog', 'tool_id', stored or {'tool_id': ident}, patch, new=stored is None))
            return writes
        return await run_command(s, key, user, None, 'tool-catalog/bulk', body.model_dump(), prepare)

    @router.post('/tool-catalog/{tool_id}/replace')
    async def replace(tool_id: str, body: ReplaceIn, user=Depends(s.get_current_user), key: str | None = Header(default=None, alias='Idempotency-Key')):
        authorization.require_program_admin(user)
        async def prepare():
            known = {t['tool_id']: t for t in await catalog(s)}
            old, target = known.get(tool_id), known.get(body.replacement_id)
            if not old or not target or tool_id == body.replacement_id or target.get('retired'):
                raise HTTPException(422, 'Choose a different active replacement tool')
            if old.get('updated_at') != body.expected_updated_at:
                raise HTTPException(409, 'The tool changed; reload before replacement')
            writes = []
            for client in await s.db.clients.find({}, {'_id': 0}).to_list(None):
                services = services_of(client)
                changed = False
                for area in services.get('areas', {}).values():
                    if tool_id in area.get('tool_ids', []):
                        await client_for(s, client['client_id'], user, True)
                        area['tool_ids'] = list(dict.fromkeys(body.replacement_id if t == tool_id else t for t in area['tool_ids']))
                        changed = True
                if changed:
                    writes.append(write_row('clients', 'client_id', client, {'profile.services': services, 'updated_at': s._next_write_time(client.get('updated_at'))}))
            if body.retire:
                stored = await s.db.tool_catalog.find_one({'tool_id': tool_id}, {'_id': 0})
                writes.append(write_row('tool_catalog', 'tool_id', stored or {'tool_id': tool_id}, {**old, 'retired': True, 'updated_at': s._next_write_time(old.get('updated_at')), 'updated_by': user['user_id']}, new=stored is None))
            return writes
        return await run_command(s, key, user, None, 'tool-catalog/' + tool_id + '/replace', body.model_dump(), prepare)

    return router
