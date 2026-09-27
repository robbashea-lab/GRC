"""Client-owned control design and period observations; never criterion conclusions."""
from copy import deepcopy
import json
import re
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
import authorization
import assignment_eligibility
from soc_readiness import validate_period

DESIGN_FIELDS = ('name', 'description', 'frequency', 'design')
SNAPSHOT_FIELDS = (*DESIGN_FIELDS, 'owner_id', 'assessment_ids', 'related_links')
KEYS = {'reviews':'review_id', 'evidence':'evidence_id', 'policies':'policy_id',
        'findings':'finding_id', 'tasks':'task_id', 'risks':'risk_id', 'vendors':'vendor_id'}
SUPPORTED_FRAMEWORKS = ('cis-ig1', 'iso-27001', 'soc-2')


def identity(cid, key):
    return 'ctrl_' + uuid.uuid5(uuid.NAMESPACE_URL, json.dumps([cid, key])).hex


def migration_plan(rows, cid, at, actor):
    """Exact IDs within a client only. Never infer identity from similar names."""
    groups = {}
    for row in rows:
        if row.get('client_id') != cid or row.get('framework_key') != 'soc-2':
            continue
        aid = row['framework_assessment_id']
        entries = [(row, True), *((h, False) for h in row.get('assessment_history', []))]
        for snapshot, current in entries:
            for index, value in enumerate(snapshot.get('management_controls') or []):
                legacy_id = value.get('control_id')
                # Missing legacy IDs cannot safely be grouped across criteria.
                key = legacy_id or f'missing:{aid}:{index}'
                group = groups.setdefault(key, {'sources':[], 'current':[], 'assessment_ids':[]})
                source = {'assessment_id':aid, 'criterion':row['definition_id'],
                          'at':snapshot.get('at', row.get('last_assessed')),
                          'by':snapshot.get('by', row.get('assessed_by')),
                          'current_at_migration':current, 'value':deepcopy(value)}
                if source not in group['sources']:
                    group['sources'].append(source)
                if current:
                    group['current'].append(value)
                    if aid not in group['assessment_ids']:
                        group['assessment_ids'].append(aid)
    result = []
    for key, group in groups.items():
        design, conflicts = {}, []
        for field in DESIGN_FIELDS:
            values = {c.get(field) or ('not_assessed' if field == 'design' else '') for c in group['current']}
            design[field] = next(iter(values)) if len(values) == 1 else ('not_assessed' if field == 'design' else '')
            if len(values) > 1:
                conflicts.append(field)
        if not group['current']:
            conflicts.append('historical_only')
        result.append({'control_id':identity(cid, 'legacy:'+key), 'client_id':cid, 'legacy_id':key,
                       **design, 'owner_id':None, 'assessment_ids':group['assessment_ids'],
                       'related_links':[], 'legacy_sources':group['sources'], 'conflicts':conflicts,
                       'reconciliation_note':'', 'history':[], 'observations':[],
                       'created_at':at, 'created_by':actor, 'updated_at':at})
    return result


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class ClientInput(Input):
    client_id: str = Field(min_length=1, max_length=160)


class Link(Input):
    kind: Literal['reviews','evidence','policies','findings','tasks','risks','vendors']
    id: str = Field(min_length=1, max_length=160)


class Design(Input):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default='', max_length=4000)
    frequency: str = Field(default='', max_length=200)
    design: Literal['not_assessed','adequate','gap'] = 'not_assessed'
    owner_id: Optional[str] = Field(default=None, max_length=160)
    assessment_ids: list[str] = Field(default_factory=list, max_length=500)
    related_links: list[Link] = Field(default_factory=list, max_length=500)

    @model_validator(mode='after')
    def unique(self):
        if any(not a or len(a) > 160 for a in self.assessment_ids) or len(set(self.assessment_ids)) != len(self.assessment_ids):
            raise ValueError('Use unique assessment identifiers')
        if len({(l.kind, l.id) for l in self.related_links}) != len(self.related_links):
            raise ValueError('Use unique record relationships')
        return self


class Create(Design, ClientInput):
    request_id: str = Field(min_length=1, max_length=128)


class Edit(Design):
    expected_updated_at: str = Field(min_length=1, max_length=100)
    resolve_conflicts: bool = False
    reconciliation_note: str = Field(default='', max_length=4000)


class Observation(Input):
    request_id: str = Field(min_length=1, max_length=128)
    expected_updated_at: str = Field(min_length=1, max_length=100)
    period_start: str = Field(min_length=10, max_length=10)
    period_end: str = Field(min_length=10, max_length=10)
    operating: Literal['not_assessed','effective','gap'] = 'not_assessed'
    expected_instances: Optional[int] = Field(default=None, strict=True, ge=0, le=1000000)
    collected_instances: Optional[int] = Field(default=None, strict=True, ge=0, le=1000000)
    notes: str = Field(min_length=1, max_length=4000)

    @model_validator(mode='after')
    def period(self):
        validate_period(self.period_start, self.period_end)
        return self


def snapshot(row):
    return {k:deepcopy(row.get(k)) for k in SNAPSHOT_FIELDS}


def router_for(s):
    router = APIRouter(prefix='/api/organizational-controls', tags=['organizational-controls'])

    async def scope(cid, user, write=False):
        if not s._can_access_client(user, cid):
            raise HTTPException(403, 'Forbidden for this client')
        client = await s.db.clients.find_one({'client_id':cid}, {'_id':0})
        if not client:
            raise HTTPException(404, 'Client not found')
        if write:
            authorization.require_program_admin(user)
            if client.get('status') == 'archived':
                raise HTTPException(409, 'Restore the client before changing its Controls')
        return client

    async def record(control_id, user, write=False):
        row = await s.db.organizational_controls.find_one(
            {'control_id':control_id, **s._scope_filter(user)}, {'_id':0})
        if not row:
            raise HTTPException(404, 'Control unavailable')
        await scope(row['client_id'], user, write)
        return row

    async def validate_links(cid, data, user, previous=None):
        if data.get('owner_id') and data['owner_id'] != (previous or {}).get('owner_id'):
            if not await assignment_eligibility.eligible(s.db, data['owner_id'], cid, s._can_access_client):
                raise HTTPException(422, 'Choose an active platform user with access to this client')
        aids = data['assessment_ids']
        rows = await s.db.framework_assessments.find(
            {'client_id':cid, 'framework_assessment_id':{'$in':aids}, 'framework_key':{'$in':SUPPORTED_FRAMEWORKS}}, {'_id':0}).to_list(len(aids)) if aids else []
        if len(rows) != len(aids):
            raise HTTPException(422, 'Map only CIS, ISO or SOC 2 assessments belonging to this client')
        for link in data['related_links']:
            target = await s.db[link['kind']].find_one(
                {'client_id':cid, KEYS[link['kind']]:link['id']}, {'_id':0, 'client_id':1})
            if not target:
                raise HTTPException(422, 'Linked record is unavailable in this client')

    async def save(old, user, updates, observation=None):
        at = s._next_write_time(old['updated_at'])
        change = {'$set':{**updates, 'updated_at':at}, '$push':{'history':{
            **snapshot(old), 'at':old['updated_at'], 'superseded_at':at, 'changed_by':user['user_id'],
            'conflicts':old.get('conflicts', []), 'reconciliation_note':old.get('reconciliation_note', '')}}}
        if observation:
            change['$push']['observations'] = observation
        result = await s.db.organizational_controls.update_one(
            {'control_id':old['control_id'], 'client_id':old['client_id'], 'updated_at':old['updated_at']}, change)
        if not result.matched_count:
            raise HTTPException(409, 'Control changed during save; reload before saving')
        await s.audit(user, 'Control observation recorded' if observation else 'Control updated',
                      'organizational_controls', old['control_id'], old['client_id'])
        return await record(old['control_id'], user)

    @router.get('')
    async def listing(client_id:str, assessment_id:Optional[str]=None, offset:int=Query(0,ge=0),
                      limit:int=Query(25,ge=1,le=100), user=Depends(s.get_current_user)):
        await scope(client_id, user)
        query = {'client_id':client_id}
        if assessment_id:
            query['assessment_ids'] = assessment_id
        items = await s.db.organizational_controls.find(query, {'_id':0,'history':0,'legacy_sources':0,'observations':0}).sort('control_id',1).skip(offset).to_list(limit+1)
        legacy = await s.db.framework_assessments.find({'client_id':client_id,'framework_key':'soc-2'}, {'_id':0}).to_list(None)
        planned = migration_plan(legacy, client_id, '', '')
        existing = {r['control_id'] for r in await s.db.organizational_controls.find({'client_id':client_id},{'_id':0,'control_id':1}).to_list(None)}
        return {'items':items[:limit], 'has_more':len(items)>limit,
                'migration_pending':sum(r['control_id'] not in existing for r in planned)}

    @router.post('/migrate')
    async def migrate(body:ClientInput, user=Depends(s.get_current_user)):
        await scope(body.client_id, user, True)
        query={'client_id':body.client_id,'framework_key':'soc-2'}
        # Atomic per-assessment write fence. An in-flight legacy update either wins
        # before this fence (and is captured below), or its conditional write fails.
        # A failed migration leaves originals readable and can be retried safely.
        await s.db.framework_assessments.update_many(query, {'$set':{'controls_migrated':True}})
        rows = await s.db.framework_assessments.find(query,{'_id':0}).to_list(None)
        plan = migration_plan(rows, body.client_id, s._now(), user['user_id'])
        inserted = 0
        for row in plan:
            result = await s.db.organizational_controls.update_one({'_id':row['control_id']}, {'$setOnInsert':row}, upsert=True)
            inserted += result.upserted_id is not None
        if inserted:
            await s.audit(user, 'Legacy Controls migrated', 'client', body.client_id, body.client_id, meta={'created':inserted})
        return {'created':inserted}

    @router.get('/candidates')
    async def candidates(client_id:str, kind:Literal['reviews','policies','findings','tasks','risks','vendors'],
                         q:str=Query('',max_length=100), offset:int=Query(0,ge=0), user=Depends(s.get_current_user)):
        await scope(client_id,user)
        query={'client_id':client_id}
        if q.strip():
            pattern={'$regex':re.escape(q.strip()),'$options':'i'}
            query['$or']=[{'title':pattern},{'name':pattern}]
        items=await s.db[kind].find(query,{'_id':0,KEYS[kind]:1,'title':1,'name':1,'status':1}).sort(KEYS[kind],1).skip(offset).to_list(26)
        return {'items':items[:25],'has_more':len(items)>25}

    @router.get('/assessments')
    async def assessment_candidates(client_id:str, user=Depends(s.get_current_user)):
        from framework_catalog import definition_for
        await scope(client_id,user)
        rows = await s.db.framework_assessments.find(
            {'client_id':client_id,'framework_key':{'$in':SUPPORTED_FRAMEWORKS}},
            {'_id':0,'framework_assessment_id':1,'framework_key':1,'definition_id':1,'status':1}).to_list(2001)
        if len(rows)>2000:
            raise HTTPException(413,'Too many assessment mappings; narrow the client scope')
        return [{**r,'title':(definition_for(r['framework_key'],r['definition_id']) or {}).get('title',r['definition_id'])} for r in rows]

    @router.post('')
    async def create(body:Create, user=Depends(s.get_current_user)):
        await scope(body.client_id, user, True)
        data = body.model_dump(exclude={'request_id'})
        await validate_links(body.client_id, data, user)
        ident, at = identity(body.client_id, 'request:'+body.request_id), s._now()
        existing = await s.db.organizational_controls.find_one({'control_id':ident},{'_id':0})
        if existing:
            if any(existing.get(k) != v for k,v in data.items()):
                raise HTTPException(409, 'This create request already produced a different Control')
            return existing
        row = {**data, 'control_id':ident, 'created_at':at, 'created_by':user['user_id'], 'updated_at':at,
               'history':[], 'observations':[], 'legacy_sources':[], 'conflicts':[], 'reconciliation_note':''}
        result = await s.db.organizational_controls.update_one({'_id':ident},{'$setOnInsert':row},upsert=True)
        if result.upserted_id:
            await s.audit(user,'Control created','organizational_controls',ident,body.client_id)
        saved = await record(ident,user)
        if any(saved.get(k) != v for k,v in data.items()):
            raise HTTPException(409,'This create request already produced a different Control')
        return saved

    @router.get('/{control_id}')
    async def detail(control_id:str,user=Depends(s.get_current_user)):
        row = await record(control_id,user)
        linked = {}
        versions = [row, *row.get('history', []), *[o['design_snapshot'] for o in row.get('observations', [])]]
        for kind,key in KEYS.items():
            ids = list({l['id'] for version in versions for l in version.get('related_links',[]) if l['kind']==kind})
            linked[kind] = await s.db[kind].find({'client_id':row['client_id'],key:{'$in':ids}},
                {'_id':0,'content_base64':0}).to_list(len(ids)) if ids else []
        return {**row,'linked_records':linked}

    @router.patch('/{control_id}')
    async def edit(control_id:str,body:Edit,user=Depends(s.get_current_user)):
        old = await record(control_id,user,True)
        if body.expected_updated_at != old['updated_at']:
            raise HTTPException(409,'Control changed since it was opened; reload before saving')
        data = body.model_dump(exclude={'expected_updated_at','resolve_conflicts','reconciliation_note'})
        await validate_links(old['client_id'],data,user,old)
        if body.resolve_conflicts:
            if not body.reconciliation_note:
                raise HTTPException(422,'Document the reconciliation decision before resolving conflicts')
            data.update(conflicts=[],reconciliation_note=body.reconciliation_note)
        return await save(old,user,data)

    @router.post('/{control_id}/observations')
    async def observe(control_id:str,body:Observation,user=Depends(s.get_current_user)):
        old = await record(control_id,user,True)
        prior = next((o for o in old.get('observations',[]) if o['request_id']==body.request_id),None)
        values = body.model_dump(exclude={'expected_updated_at'})
        if prior:
            if any(prior.get(k)!=v for k,v in values.items()):
                raise HTTPException(409,'Observation request already used with different content')
            return old
        if body.expected_updated_at != old['updated_at']:
            raise HTTPException(409,'Control changed since it was opened; reload before recording operation')
        if old.get('conflicts'):
            raise HTTPException(409,'Reconcile the Control design before recording shared operation')
        observation = {**values, 'at':s._now(), 'by':user['user_id'],
                       'control_revision':old['updated_at'], 'design_snapshot':snapshot(old)}
        return await save(old,user,{},observation)

    return router
