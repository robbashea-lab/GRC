"""Import the approved fictional portfolio alongside existing native records."""
from copy import deepcopy
from pathlib import Path
import json
import re

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pymongo import UpdateOne
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, ConfigDict, Field

import create_requests
import assignment_eligibility


SOURCE_SHA256 = '5bb03e1219276a01459f2a44be6da44dce71271feb8a17c15a2083e6db397db9'
SCENARIO_PATH = Path(__file__).resolve().parents[1] / 'shared' / 'fixtures' / 'approvedV3Scenario.json'
ID_FIELDS = {
    'clients': 'client_id', 'users': 'user_id', 'contacts': 'contact_id',
    'requirements': 'requirement_id', 'framework_assessments': 'framework_assessment_id',
    'reviews': 'review_id', 'findings': 'finding_id', 'tasks': 'task_id',
    'risks': 'risk_id', 'vendors': 'vendor_id', 'policies': 'policy_id',
    'assets': 'asset_id', 'evidence': 'evidence_id', 'ai_systems': 'ai_system_id',
}
SOURCE_CLIENTS = {'brawndo', 'dunder', 'prestige', 'initech', 'krusty', 'ppth', 'cyberdyne', 'piedpiper'}
CLIENT_IDS = {'v3sample_' + key for key in SOURCE_CLIENTS}
SOURCE_MARK = {'sha256': SOURCE_SHA256, 'kind': 'approved_v3_workspace'}
DRAFT_FIELDS = {'itemHist', 'itemExtra', 'onboarding', 'activity'}


class ViewDraftIn(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    client_id: str = Field(min_length=1, max_length=160)
    expected_revision: int = Field(ge=0)
    view: dict


class NewClientIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    source_id: str = Field(min_length=1, max_length=80, pattern=r'^[A-Za-z0-9_-]+$')
    client: dict


def load_scenario(path=SCENARIO_PATH):
    scenario = json.loads(path.read_text(encoding='utf-8'))
    return validate_scenario(scenario)


def validate_scenario(scenario):
    if scenario.get('schema_version') != 1 or scenario.get('source_sha256') != SOURCE_SHA256:
        raise ValueError('The approved portfolio fixture does not match the supplied document')
    records = scenario.get('records')
    if not isinstance(records, dict) or set(records) - set(ID_FIELDS):
        raise ValueError('Unsupported approved portfolio collection')
    if {row.get('client_id') for row in records.get('clients', [])} != CLIENT_IDS:
        raise ValueError('The approved portfolio must contain all eight clients')
    for kind, rows in records.items():
        ids = set()
        for row in rows:
            identity = row.get(ID_FIELDS[kind])
            prefix = 'fw_v3sample_' if kind == 'framework_assessments' else 'v3sample_'
            if not isinstance(identity, str) or not identity.startswith(prefix) or identity in ids:
                raise ValueError('Invalid or duplicate approved portfolio identity')
            ids.add(identity)
            if kind != 'users' and row.get('client_id') not in CLIENT_IDS:
                raise ValueError('Approved portfolio contains a foreign client reference')
            if kind == 'users' and (not isinstance(row.get('client_ids'), list)
                                     or set(row['client_ids']) - CLIENT_IDS):
                raise ValueError('Approved reference people contain a foreign client reference')
            if '_id' in row or any(key.startswith('$') for key in row):
                raise ValueError('The approved portfolio contains a database control field')
    return scenario


def seed_document(kind, row):
    document = deepcopy(row)
    document['approved_v3_source'] = SOURCE_MARK
    # Fictional people are stored outside the authentication user collection.
    if kind == 'users':
        document['source_account_status'] = document.get('status')
        document['reference_only'] = True
        for field in ('password_hash', 'password', 'external_subject', 'google_sub', 'azure_oid'):
            document.pop(field, None)
    return document


def collection_name(kind):
    return 'approved_v3_people' if kind == 'users' else kind


async def initialize(s, user, key, scenario=None):
    if user.get('role') != 'super_admin':
        raise HTTPException(403, 'Platform Owner required to import the approved sample portfolio')
    scenario = validate_scenario(scenario) if scenario is not None else load_scenario()
    records = scenario['records']

    async def execute(identity):
        # Preflight every identity before inserting. Existing business records
        # never become sample records because a name or an ID happens to match.
        for kind, rows in records.items():
            field = ID_FIELDS[kind]
            existing = await s.db[collection_name(kind)].find({field: {'$in': [row[field] for row in rows]}},
                {field: 1, 'client_id': 1, 'approved_v3_source': 1}).to_list(None)
            clients_by_id = {row[field]: row.get('client_id') for row in rows}
            if any(row.get('approved_v3_source') != SOURCE_MARK
                   or row.get('client_id') != clients_by_id[row[field]] for row in existing):
                raise HTTPException(409, 'An approved sample identity is already in use; import was stopped')
            if kind == 'users' and await s.db.users.find_one(
                    {'user_id': {'$in': [row[field] for row in rows]}}):
                raise HTTPException(409, 'A reference person identity is already used by an account')

        # Publish client rows last. An interrupted import is resumed using only
        # insert-once writes and cannot replace edits made after a successful run.
        collections = [kind for kind in records if kind != 'clients'] + ['clients']
        for kind in collections:
            rows, field = records.get(kind, []), ID_FIELDS[kind]
            if rows:
                await s.db[collection_name(kind)].bulk_write([
                    UpdateOne({field: row[field]}, {'$setOnInsert': seed_document(kind, row)}, upsert=True)
                    for row in rows
                ], ordered=True)
            if kind == 'ai_systems':
                for cid in CLIENT_IDS:
                    numbers = [int(row['display_id'][3:]) for row in rows
                        if row['client_id'] == cid and re.fullmatch(r'AI-[0-9]+', row.get('display_id', ''))]
                    if numbers:
                        await s.db.business_counters.update_one({'_id': 'ai-display:' + cid},
                            {'$max': {'sequence': max(numbers)}}, upsert=True)
        await s.audit(user, 'import-approved-portfolio', 'client', 'approved-v3-portfolio',
            meta={'source_sha256': SOURCE_SHA256, 'clients': len(CLIENT_IDS),
                  'records': {kind: len(rows) for kind, rows in records.items()}})
        await s.db.approved_v3_imports.update_one({'_id': SOURCE_SHA256}, {'$setOnInsert': {
            'client_ids': sorted(CLIENT_IDS), 'source_sha256': SOURCE_SHA256,
            'imported_by': user['user_id'], 'imported_at': s._now(),
        }}, upsert=True)
        return {'source_sha256': SOURCE_SHA256, 'client_ids': sorted(CLIENT_IDS),
                'records': {kind: len(rows) for kind, rows in records.items()}}

    return await create_requests.run(s.db, key, user['user_id'], None,
        '/v3/approved-portfolio/initialize', {'source_sha256': SOURCE_SHA256}, execute)


async def workspace_people(s, user, client_id):
    # Historical actors resolve saved names. The assignment resolver also knows
    # about active all-client operators who have never acted on this tenant.
    people = {row['user_id']: {**row, 'assignment_eligible': False}
              for row in await s.client_members(client_id, user)}
    offset, limit = 0, 100
    fields = {key: 1 for key in ('user_id', 'name', 'email', 'status', 'role', 'client_ids', 'all_clients')}
    while True:
        page = await assignment_eligibility.candidates(s.db, client_id, offset=offset, limit=limit, caller=user)
        ids = [person['user_id'] for person in page['items']]
        if offset + len(ids) > 10000:
            raise HTTPException(413, 'The complete client assignment list exceeds the supported workspace size')
        missing = [uid for uid in ids if uid not in people]
        if missing:
            async for account in s.db.users.find({'user_id': {'$in': missing}}, {'_id': 0, **fields}):
                people[account['user_id']] = s._member_summary(account, user)
        for uid in ids:
            person = people.get(uid)
            if person and not person.get('reference_only') and person.get('status') == 'active':
                person['assignment_eligible'] = True
        if not page['has_more']:
            break
        offset += limit
    return sorted(people.values(), key=lambda row: ((row.get('name') or row.get('email') or '').casefold(), row['user_id']))


async def read_records(s, user, client_id):
    if user.get('role') not in ('super_admin', 'platform_admin') or not s._can_access_client(user, client_id):
        raise HTTPException(403, 'Forbidden for this client')
    client = await s.db.clients.find_one({'client_id': client_id}, {'_id': 0})
    if not client or client.get('approved_v3_source') != SOURCE_MARK:
        raise HTTPException(404, 'Approved portfolio client not found')
    s.r4_services.assert_settled(client)
    result = {'clients': [client]}
    for kind in ID_FIELDS:
        if kind in ('clients', 'users'):
            continue
        rows = await s.db[kind].find({'client_id': client_id}, {'_id': 0, 'content_base64': 0}).limit(10001).to_list(10001)
        if len(rows) > 10000:
            raise HTTPException(413, 'The complete client collection exceeds the supported workspace size')
        for row in rows:
            s.r4_services.assert_settled(row)
        result[kind] = rows
    result['users'] = await workspace_people(s, user, client_id)
    result['ai_systems'] = [s.ai_governance.projection(row, result['reviews'], result['risks'])
                            for row in result['ai_systems']]
    result['approved_v3_guidance'] = await s.db.approved_v3_guidance.find(
        {'client_id': client_id, 'user_id': user['user_id']}, {'_id': 0}).to_list(None)
    # The workspace shows recent tenant activity. The native Audit Log retains
    # the full paginated history. Keep event payloads and platform events out.
    audit_fields = {key: 1 for key in ('log_id', 'client_id', 'at', 'user_id', 'user_name', 'action',
                                       'entity_type', 'entity_id', 'entity_name', 'outcome')}
    result['audit_logs'] = await s.db.audit_logs.find(
        {'client_id': client_id}, {'_id': 0, **audit_fields}).sort('at', -1).limit(200).to_list(200)
    return {'source_sha256': SOURCE_SHA256, 'client_id': client_id, 'records': result}


def activity_owners(source):
    owners = {}
    for client in source['clients']:
        cid = client['id']
        work, program, records = (source.get(field, {}).get(cid, {}) for field in ('work', 'programs', 'records'))
        for kind, rows, field in (
                ('rev', [*work.get('revs', []), *work.get('hist', [])], 'id'),
                ('act', [*work.get('acts', []), *work.get('done', [])], 'id'),
                ('risk', program.get('risks', []), 'id'), ('pol', program.get('pols', []), 'name'),
                ('ven', program.get('vendors', []), 'name'), ('ai', records.get('ai', []), 'name')):
            for row in rows:
                if isinstance(row, dict):
                    for value in (row.get(field), row.get('wfId')):
                        if isinstance(value, str) and value:
                            owners.setdefault(kind + '|' + value, set()).add(cid)
    return owners


def scoped_source_state(source, allowed, actor):
    state = deepcopy(source)
    state['clients'] = [row for row in state['clients'] if row['id'] in allowed]
    for field in ('work', 'programs', 'records', 'reg', 'dash', 'profile', 'own',
                  'evidence', 'services', 'onboarding', 'touched'):
        state[field] = {key: value for key, value in state.get(field, {}).items() if key in allowed}
    for field in ('itemCur', 'itemHist', 'itemExtra', 'ita', 'guideSaved'):
        state[field] = {key: value for key, value in state.get(field, {}).items()
                        if key.partition('|')[0] in allowed}
    # Early mockups keyed these two dictionaries by display ID or vendor name,
    # which can be reused by different clients. Only unambiguous legacy keys
    # can safely be attached to a client.
    owners = activity_owners(source)
    def permitted_legacy(key):
        matches = owners.get(key, set())
        return len(matches) == 1 and matches.issubset(allowed)
    state['activity'] = {key: value for key, value in state.get('activity', {}).items()
                         if key.partition('|')[0] in allowed or permitted_legacy(key)}
    state['checklists'] = {key: value for key, value in state.get('checklists', {}).items()
                           if key.partition('|')[0] in allowed or '|' not in key and permitted_legacy('rev|' + key)}
    state['audit'] = [row for row in state.get('audit', []) if row.get('client') in allowed
                      or not row.get('client') and actor['role'] == 'super_admin']
    state['files'] = [row for row in state.get('files', []) if row.get('clientId') in allowed]
    users = []
    for row in state.get('users', []):
        clients = allowed if row.get('clients') == 'all' else set(row.get('clients') or []) & allowed
        if clients:
            users.append({**row, 'clients': sorted(clients), 'self': False})
    state['users'] = users
    state['account'] = {key: actor.get(key) for key in ('name', 'email', 'role')}
    return state


async def bootstrap(s, user):
    if user.get('role') not in ('super_admin', 'platform_admin'):
        raise HTTPException(403, 'An internal workspace account is required')
    receipt = await s.db.approved_v3_imports.find_one({'_id': SOURCE_SHA256})
    if not receipt:
        return {'initialized': False, 'source_sha256': SOURCE_SHA256}
    scenario = load_scenario()
    clients = await s.db.clients.find({'approved_v3_source': SOURCE_MARK}, {'_id': 0}).to_list(None)
    clients = [client for client in clients if s._can_access_client(user, client['client_id'])]
    allowed = {client['source_client_id'] for client in clients}
    if len(allowed) != len(clients):
        raise HTTPException(409, 'Two saved clients share a workspace identity. Reconcile the client links before opening the portfolio.')
    state = scoped_source_state(scenario['source_state'], allowed, user)
    for client in clients:
        if client['source_client_id'] in SOURCE_CLIENTS:
            continue
        state['clients'].append({'id': client['source_client_id'], 'name': client['name'],
            'industry': client.get('industry', ''), 'env': client.get('environment'),
            'status': client.get('status', 'onboarding').title(), 'isNew': True,
            'onboarded': bool(client.get('onboarding_baseline', {}).get('completed')), 'progs': []})
    native = {}
    drafts = {}
    for client in clients:
        cid = client['client_id']
        native[cid] = (await read_records(s, user, cid))['records']
        draft = await s.db.approved_v3_view_drafts.find_one(
            {'_id': cid + ':' + user['user_id'], 'client_id': cid, 'updated_by': user['user_id']}, {'_id': 0})
        drafts[cid] = draft or {'client_id': cid, 'revision': 0, 'view': {}}
    return {'initialized': True, 'source_sha256': SOURCE_SHA256, 'source_state': state,
            'records': native, 'drafts': drafts,
            'actor': {key: user.get(key) for key in ('user_id', 'name', 'email', 'role')}}


async def create_client(s, user, body, key):
    if user.get('role') != 'super_admin':
        raise HTTPException(403, 'Platform Owner required')
    if body.source_id in SOURCE_CLIENTS | {'__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__',
        '__lookupGetter__', '__lookupSetter__', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
        'toLocaleString', 'toString', 'valueOf'}:
        raise HTTPException(409, 'This approved client identity is already in use')
    if set(body.client) - set(s.ClientIn.model_fields):
        raise HTTPException(422, 'Unsupported client fields')
    try:
        model = s.ClientIn.model_validate(body.client)
    except ValueError:
        raise HTTPException(422, 'Invalid client fields')
    async def execute(identity):
        alias = body.source_id
        reservations = s.db.approved_v3_client_references
        # A dedicated receipt namespace prevents reuse of a normal /clients
        # receipt from turning an unrelated native client into a sample client.
        try:
            await reservations.update_one({'_id': alias}, {'$setOnInsert': {'intent': identity}}, upsert=True)
        except DuplicateKeyError:
            pass  # A competing insert won the unique alias. Verify its intent below.
        reserved = await reservations.find_one({'_id': alias})
        if not reserved or reserved.get('intent') != identity:
            raise HTTPException(409, 'Another create request is using this client identity')
        expected_id = 'cli_' + identity
        binding = {'_id': 'create:' + identity, 'client_id': expected_id}
        if await s.db.clients.find_one({'source_client_id': alias, '_id': {'$ne': binding['_id']}}):
            raise HTTPException(409, 'This workspace identity belongs to another client')
        try:
            await s._create_client(model, user, identity)
        except HTTPException as error:
            receipt = await s.db.create_requests.find_one({'_id': identity})
            if error.status_code in (403, 409, 422, 428) and receipt and not receipt.get('primary_started'):
                await reservations.delete_one({'_id': alias, 'intent': identity})
            raise
        updated = await s.db.clients.update_one({**binding,
            'source_client_id': {'$in': [None, alias]}, 'source_record_id': {'$in': [None, alias]},
            'approved_v3_source': {'$in': [None, SOURCE_MARK]}},
            {'$set': {'source_client_id': alias, 'source_record_id': alias, 'approved_v3_source': SOURCE_MARK}})
        if not updated.matched_count:
            raise HTTPException(409, 'The newly created client could not be bound to this workspace identity')
        return {'client_id': expected_id}

    saved = await create_requests.run(s.db, key, user['user_id'], None, '/v3/approved-portfolio/clients',
                                      {'source_id': body.source_id, 'client': model.model_dump()}, execute)
    client = await s.db.clients.find_one({**saved, 'source_client_id': body.source_id,
                                          'approved_v3_source': SOURCE_MARK}, {'_id': 0})
    if not client:
        raise HTTPException(409, 'The saved client binding changed. Reload the workspace.')
    return client


async def save_view_draft(s, user, body):
    native = await read_records(s, user, body.client_id)
    source_id = native['records']['clients'][0]['source_client_id']
    if native['records']['clients'][0].get('status') == 'archived':
        raise HTTPException(403, 'Archived clients are read-only')
    if set(body.view) - DRAFT_FIELDS or len(json.dumps(body.view).encode()) > 2_000_000:
        raise HTTPException(422, 'The workspace draft contains unsupported or oversized fields')
    for field, values in body.view.items():
        if not isinstance(values, dict):
            raise HTTPException(422, 'Each workspace draft section must be an object')
        for key in values:
            if key.partition('|')[0] != source_id:
                raise HTTPException(422, 'The workspace draft contains another client')
    identity = body.client_id + ':' + user['user_id']
    current = await s.db.approved_v3_view_drafts.find_one({'_id': identity})
    if current and (current.get('client_id') != body.client_id or current.get('updated_by') != user['user_id']):
        raise HTTPException(409, 'The draft identity could not be verified for this account')
    revision = (current or {}).get('revision', 0)
    if revision != body.expected_revision:
        raise HTTPException(409, 'The workspace draft changed. Reload its saved version before editing.')
    at = s._now()
    document = {'client_id': body.client_id, 'revision': revision + 1, 'view': body.view,
                'updated_at': at, 'updated_by': user['user_id']}
    try:
        saved = await s.db.approved_v3_view_drafts.update_one(
            {'_id': identity, 'client_id': body.client_id, 'updated_by': user['user_id'], 'revision': current['revision']}
            if current else {'_id': identity, 'revision': {'$exists': False}},
            {'$set': document}, upsert=current is None)
    except DuplicateKeyError:
        raise HTTPException(409, 'The workspace draft changed. Reload before saving.')
    if current and not saved.matched_count:
        raise HTTPException(409, 'The workspace draft changed. Reload before saving.')
    await s.audit(user, 'save-workspace-draft', 'client', body.client_id, body.client_id,
                  meta={'sections': sorted(body.view), 'revision': revision + 1})
    return document


def router_for(s):
    router = APIRouter(prefix='/api/v3/approved-portfolio')

    @router.post('/initialize')
    async def initialize_route(user=Depends(s.get_current_user), idempotency_key: str | None = Header(None)):
        return await initialize(s, user, idempotency_key)

    @router.get('/records')
    async def records_route(client_id: str = Query(..., min_length=1, max_length=160),
                            user=Depends(s.get_current_user)):
        return await read_records(s, user, client_id)

    @router.get('/bootstrap')
    async def bootstrap_route(user=Depends(s.get_current_user)):
        return await bootstrap(s, user)

    @router.put('/view-draft')
    async def view_draft_route(body: ViewDraftIn, user=Depends(s.get_current_user)):
        return await save_view_draft(s, user, body)

    @router.post('/clients')
    async def create_client_route(body: NewClientIn, user=Depends(s.get_current_user),
                                  idempotency_key: str | None = Header(None)):
        return await create_client(s, user, body, idempotency_key)

    return router
