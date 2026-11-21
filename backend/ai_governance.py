"""Native AI inventory, use approval and reassessment; linked work stays authoritative."""
import json
import re
import uuid
from copy import deepcopy
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field, ConfigDict, StrictBool, StrictStr, ValidationError, field_validator, model_validator
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
import review_occurrences
import assignment_eligibility
import create_requests
import ai_onboarding
from register_catalog_identity import validate_catalog_key

CATALOG = json.loads((Path(__file__).parents[1] / 'frontend/src/lib/aiGovernanceCatalog.json').read_text(encoding='utf-8'))
AI_METADATA_DEFAULTS = {'environment':'','restrictions':'','data_settings':'','permitted_data_types':[]}
AI_DECISIONS = {'approved','approved_with_conditions','not_approved'}
AI_APPROVAL_FIELDS = (
    'name','product_model','provider','vendor_id','description','purposes','data_types',
    'access','screening','human_review_required','human_approval_required','oversight_notes',
    *AI_METADATA_DEFAULTS,
)

class AIInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    client_id: str
    name: str = Field(min_length=1, max_length=240)
    catalog_key: Optional[str] = None
    description: str = ''
    owner_id: Optional[str] = None
    technical_owner_id: Optional[str] = None
    provider: str = ''
    vendor_id: Optional[str] = None
    product_model: str = ''
    status: Literal['draft','under_review','active','suspended','retired'] = 'draft'
    purposes: list[str] = Field(default_factory=list)
    data_types: list[str] = Field(default_factory=list)
    access: list[str] = Field(default_factory=list)
    roles: list[str] = Field(default_factory=list)
    risk_topics: list[str] = Field(default_factory=list)
    screening: dict[str, Optional[StrictBool]] = Field(default_factory=dict)
    human_review_required: Optional[StrictBool] = None
    human_approval_required: Optional[StrictBool] = None
    oversight_owner_id: Optional[str] = None
    oversight_notes: str = ''
    governance_notes: str = ''
    environment: str = Field(default='', strict=True, max_length=10000)
    restrictions: str = Field(default='', strict=True, max_length=10000)
    data_settings: str = Field(default='', strict=True, max_length=10000)
    permitted_data_types: list[StrictStr] = Field(default_factory=list, strict=True, max_length=len(CATALOG['data_types']))

    @field_validator('catalog_key', mode='before')
    @classmethod
    def valid_catalog_key(cls, value):
        return validate_catalog_key('ai_systems', value)

    @field_validator('permitted_data_types')
    @classmethod
    def valid_permitted_data_types(cls, values):
        if any(value not in CATALOG['data_types'] for value in values):
            raise ValueError('Invalid permitted data classifications')
        return values


class AIMaterialChangeInput(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    note: str = Field(min_length=1, max_length=10000)
    expected_updated_at: Optional[str] = Field(default=None, max_length=100)

    @field_validator('note')
    @classmethod
    def meaningful_note(cls, value):
        if not value.strip():
            raise ValueError('Describe the decision or material change')
        return value.strip()


class AIApprovalInput(AIMaterialChangeInput):
    status: Literal['approved','approved_with_conditions','not_approved']


def approval_scope(row):
    """Bind decisions to the saved use and questionnaire, not a display tier or Review."""
    scope = {
        key: deepcopy(row.get(key, AIInput.model_fields[key].get_default(call_default_factory=True)))
        for key in AI_APPROVAL_FIELDS
    }
    saved = row.get('onboarding_screening')
    if saved:
        # Reconfirming the same answers must not invalidate a decision because a
        # review timestamp/history changed. The original decision keeps its basis.
        scope['onboarding_screening'] = deepcopy({
            key: saved.get(key) for key in ('schema_version','catalog_version','answers','scope')
        })
    return scope


def reassessment_patch(old, candidate, at, note):
    if old.get('approval_status') not in AI_DECISIONS or approval_scope(old) == approval_scope(candidate):
        return {}
    return {'approval_status':'pending_assessment','material_change_at':at,'material_change_note':note}


def normalized_name(value):
    return value.strip().lower()


class AILinkInput(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    kind: Literal['risks','findings','tasks','policies','requirements','vendors']
    id: str = Field(min_length=1, max_length=160)
    classification: str = 'Context'
    source: str = ''
    rationale: str = ''

    @model_validator(mode='after')
    def valid_relationship(self):
        if not self.id.strip(): raise ValueError('A concrete record identifier is required')
        if self.classification not in CATALOG['relationship_classes']: raise ValueError('Invalid relationship classification')
        if self.classification.startswith(('Explicit','Required')) and not (self.source.strip() and self.rationale.strip()):
            raise ValueError('Requirement claims need an authoritative source and applicability rationale')
        return self

def readable_links(row):
    stored=row.get('related_links',[])
    if not isinstance(stored,list): return []
    links=[]
    for link in stored:
        try: AILinkInput.model_validate(link)
        except ValidationError: continue
        links.append(link)
    return links

def screening(row):
    onboarding=ai_onboarding.screening_projection(row)
    if onboarding is not None:return onboarding
    answers = row.get('screening') or {}
    complete = all(type(answers.get(q['key'])) is bool for q in CATALOG['questions'])
    high = any(answers.get(q['key']) is True for q in CATALOG['questions'] if q.get('high'))
    high |= 'HR / Employment' in row.get('purposes', []) or 'Automated Decision-Making' in row.get('purposes', []) or 'Autonomous Action Capability' in row.get('access', [])
    moderate = any(answers.get(q['key']) is True for q in CATALOG['questions'] if not q.get('protective')) or answers.get('oversight') is False
    moderate |= bool(row.get('vendor_id') or row.get('provider') or row.get('access') or set(row.get('data_types', [])) - {'Public','Internal','No Sensitive Data'})
    return {'risk_tier': 'high' if high else 'moderate' if moderate else 'low' if complete else None, 'screening_complete': complete, 'screening_version': CATALOG['version']}

def projection(row, reviews, risks, today=None):
    linked = [r for r in reviews if r.get('ai_system_id') == row['ai_system_id'] and r['client_id'] == row['client_id']]
    done = [o.get('completed_at') or o.get('completion_date') for r in linked for o in r.get('occurrences', []) if o.get('status') == 'completed']
    done += [r.get('completion_date') for r in linked if r.get('status') == 'completed']
    dates = [r['due_date'] for r in linked if r.get('status') not in ('completed','cancelled') and r.get('due_date')]
    result = {k:v for k,v in row.items() if not k.startswith('_')}
    links=readable_links(row)
    stored=row.get('related_links',[])
    # Projection excludes unreadable context; stored relationships and history are never repaired here.
    result.update(related_links=links,relationship_integrity_warning=not isinstance(stored,list) or len(links)!=len(stored))
    result.update(screening(row), last_review=max(filter(None,done),default=None), next_review=min(dates,default=None))
    periodic = next((r for r in linked if r.get('ai_review_purpose') == 'periodic' and r.get('status') not in ('completed','cancelled')), None)
    result['review_cadence'] = periodic.get('recurrence') if periodic else None
    result['review_schedule_pending'] = bool(row.get('_ai_review_schedule_pending'))
    result['alerts'] = []
    if row.get('status') != 'active':
        return result
    def alert(key, label, condition):
        if condition: result['alerts'].append({'key':key,'label':label,'classification':'Recommended governance practice'})
    answers = ai_onboarding.governance_answers(row)
    alert('owner','AI Owner Missing',not row.get('owner_id'))
    alert('schedule','AI Review Not Scheduled',not result['next_review'])
    alert('overdue','AI Review Overdue',bool(result['next_review'] and result['next_review'][:10] < (today or datetime.now(timezone.utc).date().isoformat())))
    ids = {x['id'] for x in links if x['kind']=='risks'}
    assessed = any(r['client_id']==row['client_id'] and r.get('risk_id') in ids and r.get('status') not in ('closed','retired') and type(r.get('likelihood_score')) is int and type(r.get('impact_score')) is int for r in risks)
    alert('risk','High-Risk AI Without Risk Assessment',result['risk_tier']=='high' and not assessed)
    alert('screening','AI Governance Assessment Missing',not result['screening_complete'])
    consequential = answers.get('consequential') or (row.get('screening') or {}).get('employment') or 'HR / Employment' in row.get('purposes',[])
    alert('oversight','Consequential AI Without Documented Oversight',consequential and not row.get('oversight_notes','').strip())
    alert('vendor','Third-Party AI Without Vendor Relationship',((row.get('screening') or {}).get('third_party') or row.get('provider')) and not row.get('vendor_id'))
    sensitive = answers.get('sensitive') or bool(set(row.get('data_types',[]))-{'Public','Internal','No Sensitive Data'})
    alert('sensitive','Sensitive Data Without Completed Governance Review',sensitive and not result['last_review'])
    alert('change','Material Change Review Needed',row.get('material_change_at') and (not result['last_review'] or row['material_change_at'] > result['last_review']))
    return result

@asynccontextmanager
async def lease(db, ai_id, *, recovery_schedule=None):
    if not ai_id:
        yield
        return
    token, now = uuid.uuid4().hex, datetime.now(timezone.utc)
    result = await db.ai_systems.update_one({'ai_system_id':ai_id,'$or':[{'_governance_lock':None},{'_governance_lock.until':{'$lt':now.isoformat()}}]}, {'$set':{'_governance_lock':{'token':token,'until':(now+timedelta(seconds=120)).isoformat()}}})
    if not result.modified_count: raise HTTPException(409,'Another AI governance action is being saved; retry')
    try:
        pending=await db.ai_systems.find_one({'ai_system_id':ai_id},{'client_id':1,'_ai_retirement_pending':1,'_ai_review_schedule_pending':1})
        retirement=(pending or {}).get('_ai_retirement_pending')
        if retirement and retirement!=create_requests.current.get():
            raise HTTPException(409,'Retry the pending AI retirement before changing its linked work')
        schedule=(pending or {}).get('_ai_review_schedule_pending')
        if schedule and schedule!=create_requests.current.get() and schedule!=recovery_schedule:
            raise HTTPException(409,'Retry the pending AI Review schedule before changing this system')
        yield
    finally:
        await db.ai_systems.update_one({'ai_system_id':ai_id,'_governance_lock.token':token},{'$unset':{'_governance_lock':''}})

def router_for(s):
    router = APIRouter(prefix='/api', tags=['ai-governance'])
    async def client_scope(cid,user,write=False,admin=False):
        if not s._can_access_client(user,cid) or write and not s._writable(user) or admin and user.get('role') not in ('super_admin','platform_admin'):
            raise HTTPException(403,'Forbidden')
        if not await s.db.clients.find_one({'client_id':cid}): raise HTTPException(404,'Client not found')
    async def parent(aid,user,write=False,admin=False):
        row=await s._authorized_parent('ai_systems',aid,user,write)
        await client_scope(row['client_id'],user,write,admin)
        return row
    async def view(row):
        q={'client_id':row['client_id']}
        return projection(row,await s.db.reviews.find({**q,'ai_system_id':row['ai_system_id']},{'_id':0}).to_list(None),await s.db.risks.find(q,{'_id':0}).to_list(None))
    async def metadata_scope(cid,supplied):
        if not set(supplied).intersection(AI_METADATA_DEFAULTS): return
        client=await s.db.clients.find_one({'client_id':cid})
        if not client or client.get('status') not in ('active','onboarding') \
            or client.get('archived') or client.get('archived_at'):
            raise HTTPException(422,'AI governance metadata requires an active or onboarding client that is not archived')
    async def validate(data,user,old=None):
        await client_scope(data['client_id'],user,True)
        if not data['name'].strip(): raise HTTPException(422,'Name is required')
        if old and old['client_id']!=data['client_id']: raise HTTPException(422,'Cannot move records between clients')
        if old and old['status']=='retired': raise HTTPException(409,'Retired AI records remain historical')
        if not old or normalized_name(data['name'])!=normalized_name(old['name']):
            query={'client_id':data['client_id'],'$or':[
                {'ai_name_key':normalized_name(data['name'])},
                {'name':{'$regex':r'^\s*'+re.escape(data['name'].strip())+r'\s*$','$options':'i'}},
            ]}
            if old: query['ai_system_id']={'$ne':old['ai_system_id']}
            if await s.db.ai_systems.find_one(query,{'ai_system_id':1}):
                raise HTTPException(409,'An AI system with that name already exists.')
        if data['status'] in ('active','suspended','retired') and (not old or old['status']!=data['status']): await client_scope(data['client_id'],user,True,True)
        for key in ('purposes','data_types','access','roles','risk_topics'):
            if set(data[key])-set(CATALOG[key]): raise HTTPException(422,'Invalid '+key)
        if set(data['screening'])-{q['key'] for q in CATALOG['questions']}: raise HTTPException(422,'Invalid screening question')
        await assignment_eligibility.validate(s.db, 'ai_systems', data, s._can_access_client, old)
        if data.get('vendor_id') and not await s.db.vendors.find_one({'vendor_id':data['vendor_id'],'client_id':data['client_id']}): raise HTTPException(422,'Vendor must belong to this client')
    @router.get('/ai-intake')
    async def get_intake(client_id:str,user=Depends(s.get_current_user)):
        await client_scope(client_id,user)
        return await s.db.ai_intake.find_one({'client_id':client_id},{'_id':0}) or {'client_id':client_id,'usage':'unsure','indicators':[]}
    @router.post('/ai-intake')
    async def save_intake(body:dict,user=Depends(s.get_current_user)):
        cid=body.get('client_id');await client_scope(cid,user,True)
        old=await s.db.ai_intake.find_one({'client_id':cid}) or {}
        s._require_snapshot(body,old)
        if body.get('usage') not in ('yes','no','unsure') or not isinstance(body.get('indicators',[]),list) or set(body.get('indicators',[]))-set(CATALOG['intake_indicators']): raise HTTPException(422,'Invalid AI intake')
        data={'client_id':cid,'usage':body['usage'],'indicators':body.get('indicators',[]) if body['usage']=='yes' else [],'updated_at':s._next_write_time(old.get('updated_at'))}
        if old:
            result=await s.db.ai_intake.update_one({'_id':old['_id'],'updated_at':old.get('updated_at')},{'$set':data})
            if result.matched_count!=1: raise HTTPException(409,'Record changed since it was opened; reload before saving')
        else:
            try: await s.db.ai_intake.insert_one({'_id':'ai-intake:'+cid,**data})
            except DuplicateKeyError: raise HTTPException(409,'Record changed since it was opened; reload before saving')
        await s.audit(user,'AI intake updated','client',cid,cid)
        return data
    @router.get('/ai_systems')
    async def list_ai(client_id:str,user=Depends(s.get_current_user)):
        await client_scope(client_id,user)
        rows=await s.db.ai_systems.find({'client_id':client_id},{'_id':0}).to_list(1000)
        return [await view(r) for r in rows]
    @router.post('/ai_systems')
    async def create_ai(body:AIInput,user=Depends(s.get_current_user),idempotency_key:Optional[str]=Header(None)):
        await client_scope(body.client_id,user,True)
        await metadata_scope(body.client_id,body.model_fields_set)
        async def execute(identity):
            await metadata_scope(body.client_id,body.model_fields_set)
            return await create_ai_record(body,user,identity)
        payload=body.model_dump()
        if idempotency_key is not None and all(payload[key]==default for key,default in AI_METADATA_DEFAULTS.items()):
            # Exact retained schemas only. Empty new metadata must not strand an
            # old create, but a real association or governance edit stays hashed.
            previous_payload={key:value for key,value in payload.items() if key not in AI_METADATA_DEFAULTS}
            candidates=[previous_payload]
            if body.catalog_key is None:
                candidates.append({key:value for key,value in previous_payload.items() if key!='catalog_key'})
            identity=create_requests.digest([user['user_id'],body.client_id,'ai_systems',idempotency_key])
            receipt=await s.db.create_requests.find_one({'_id':identity},{'fingerprint':1})
            for candidate in candidates:
                if receipt and receipt.get('fingerprint')==create_requests.digest(candidate):
                    payload=candidate
                    break
        return await create_requests.run(s.db,idempotency_key,user['user_id'],body.client_id,'ai_systems',payload,execute)
    async def create_ai_record(body,user,identity,creation_metadata=None):
        existing=await s.db.ai_systems.find_one({'_id':'create:'+identity},{'_id':0})
        if existing:
            await s.audit(user,'AI use case created','ai_system',existing['ai_system_id'],existing['client_id'])
            return await view(existing)
        data=body.model_dump(exclude=set(AI_METADATA_DEFAULTS)-body.model_fields_set)
        await validate(data,user)
        counter_key='ai-display:'+data['client_id']
        try:
            counter=await s.db.business_counters.find_one_and_update({'_id':counter_key},{'$inc':{'sequence':1}},upsert=True,return_document=ReturnDocument.AFTER)
        except DuplicateKeyError:
            counter=await s.db.business_counters.find_one_and_update({'_id':counter_key},{'$inc':{'sequence':1}},return_document=ReturnDocument.AFTER)
        row={**data,'ai_name_key':normalized_name(data['name']),'ai_system_id':s._uid('ai'),'display_id':f"AI-{counter['sequence']:03d}",'created_at':s._now(),'updated_at':s._now(),'created_by':user['user_id'],'related_links':[],'approval_status':'pending_assessment'}
        if creation_metadata:
            row.update(creation_metadata)
            row['_ai_onboarding_initial_version']=row['updated_at']
        try: row=await create_requests.insert_primary(s.db,'ai_systems',row,identity)
        except DuplicateKeyError as exc:
            if creation_metadata is None and not await s.db.ai_systems.find_one({'_id':'create:'+identity},{'_id':1}):
                # A unique-name race rejected this insert. Its own receipt can
                # use the existing rejected-create flow. An onboarding child
                # must never advertise rejection of its partially saved parent.
                await s.db.create_requests.update_one({'_id':identity},{'$set':{'primary_started':False}})
            raise HTTPException(409,'An AI system with that name already exists.') from exc
        await s.audit(user,'AI use case created','ai_system',row['ai_system_id'],row['client_id'])
        return await view(row)
    async def prepare_update(old,body,user):
        changes={k:v for k,v in body.items() if k!='expected_updated_at'}
        reviewed_screening=changes.pop('onboarding_screening',None)
        if 'onboarding_screening' in body and not isinstance(reviewed_screening,dict):
            raise HTTPException(422,'Invalid screening review')
        if set(changes)-set(AIInput.model_fields): raise HTTPException(422,'Unknown or read-only AI fields')
        await metadata_scope(old['client_id'],changes)
        try: data=AIInput(**{**{k:old[k] for k in AIInput.model_fields if k in old},**changes}).model_dump()
        except ValidationError as exc: raise HTTPException(422,'Invalid AI fields') from exc
        # Empty form defaults do not backfill absent legacy boundaries.
        for key,default in AI_METADATA_DEFAULTS.items():
            if key not in old and data[key]==default: data.pop(key)
        await validate(data,user,old)
        if normalized_name(data['name'])!=normalized_name(old['name']):
            data['ai_name_key']=normalized_name(data['name'])
        data['updated_at']=s._next_write_time(old.get('updated_at'))
        if reviewed_screening is not None:
            await metadata_scope(old['client_id'],{'environment'})
            data['onboarding_screening']=ai_onboarding.reassessment(old,{**old,**data},reviewed_screening,user,data['updated_at'])
        data.update(reassessment_patch(old,{**old,**data},data['updated_at'],
            'Approval boundaries changed; reassessment required.'))
        return data

    async def save_update(aid,old,data):
        try:
            result=await s.db.ai_systems.update_one(
                {'ai_system_id':aid,'client_id':old['client_id'],'updated_at':old.get('updated_at')},{'$set':data})
        except DuplicateKeyError as exc:
            raise HTTPException(409,'An AI system with that name already exists.') from exc
        if not result.matched_count:raise HTTPException(409,'Record changed since it was opened; reload before saving')

    async def retire_ai(aid,body,user):
        selected=await parent(aid,user,True,True)
        if 'expected_updated_at' not in body: s._require_snapshot(body,selected)
        await metadata_scope(selected['client_id'],body)

        async def execute(identity):
            async with lease(s.db,aid):
                row=await parent(aid,user,True,True)
                await metadata_scope(row['client_id'],body)
                receipt=await s.db.create_requests.find_one({'_id':identity})
                if row.get('_ai_retirement_command')!=identity:
                    s._require_snapshot(body,row)
                    data=await prepare_update(row,body,user)
                    reviews=await s.db.reviews.find({'ai_system_id':aid,'client_id':row['client_id'],
                        'status':{'$nin':['completed','cancelled']}},{'_id':0,'_execution_lock':0}).to_list(None)
                    plan=[]
                    for review in reviews:
                        updates={'recurrence':'none','next_review_date':None,
                            'updated_at':s._next_write_time(review.get('updated_at')),'_ai_retirement_command':identity}
                        if review['status']!='in_progress': updates['status']='cancelled'
                        plan.append({'before':review,'updates':updates})
                    meta={'changed_fields':[k for k in data if k!='updated_at' and data[k]!=row.get(k)],
                        'previous_tier':screening(row)['risk_tier'],'risk_tier':screening({**row,**data})['risk_tier']}
                    await s.db.create_requests.update_one({'_id':identity},{'$set':{
                        'ai_retirement_reviews':plan,'ai_retirement_meta':meta,'primary_started':True}})
                    data.update(_ai_retirement_command=identity,_ai_retirement_pending=identity)
                    await save_update(aid,row,data)
                    row={**row,**data}
                    receipt={**receipt,'ai_retirement_reviews':plan,'ai_retirement_meta':meta}
                elif row.get('status')!='retired':
                    raise HTTPException(409,'The accepted retirement changed; no saved record was overwritten')
                if 'ai_retirement_reviews' not in receipt:
                    raise HTTPException(409,'The retained AI retirement plan needs review')
                for item in receipt['ai_retirement_reviews']:
                    review=item['before']
                    query={'review_id':review['review_id'],'client_id':row['client_id'],'ai_system_id':aid}
                    current=await s.db.reviews.find_one(query,{'_id':0})
                    if not current: raise HTTPException(409,'A linked Review is missing; the retirement plan was retained')
                    if current.get('_ai_retirement_command')!=identity:
                        changed=await s.db.reviews.update_one({**query,'updated_at':review.get('updated_at'),
                            'status':review.get('status'),'current_occurrence_id':review.get('current_occurrence_id')},
                            {'$set':item['updates']})
                        if not changed.matched_count:
                            raise HTTPException(409,'A linked Review changed; its saved work was retained')
                    await s._review_event(user,review,'AI retired; recurring review stopped')
                await s.audit(user,'AI retired','ai_system',aid,row['client_id'],meta=receipt['ai_retirement_meta'])
                await s.db.ai_systems.update_one({'ai_system_id':aid,'_ai_retirement_pending':identity},
                    {'$unset':{'_ai_retirement_pending':''}})
                return await view(row)

        await create_requests.run(s.db,create_requests.digest(body),user['user_id'],selected['client_id'],
            'ai_systems/'+aid+'/retire/update',body,execute)
        return await view(await parent(aid,user,True,True))

    @router.patch('/ai_systems/{aid}')
    async def update_ai(aid:str,body:dict,user=Depends(s.get_current_user)):
        if body.get('status')=='retired': return await retire_ai(aid,body,user)
        old=await parent(aid,user,True)
        s._require_snapshot(body,old)
        async with lease(s.db,aid):
            old=await parent(aid,user,True)
            s._require_snapshot(body,old)
            data=await prepare_update(old,body,user)
            await save_update(aid,old,data)
            changed=[k for k in data if k!='updated_at' and data[k]!=old.get(k)]
            if changed: await s.audit(user,'AI '+('suspended' if data['status']=='suspended' else 'governance updated'),'ai_system',aid,old['client_id'],meta={'changed_fields':changed,'previous_tier':screening(old)['risk_tier'],'risk_tier':screening({**old,**data})['risk_tier']})
            return await view({**old,**data})
    @router.post('/ai_systems/{aid}/approval')
    async def approve_ai(aid:str,body:AIApprovalInput,user=Depends(s.get_current_user)):
        selected=await parent(aid,user,True,True)
        incoming=body.model_dump(exclude_unset=True)
        if 'expected_updated_at' not in incoming: s._require_snapshot(incoming,selected)
        await metadata_scope(selected['client_id'],AI_METADATA_DEFAULTS)

        async def execute(identity):
            async with lease(s.db,aid):
                row=await parent(aid,user,True,True)
                await metadata_scope(row['client_id'],AI_METADATA_DEFAULTS)
                history=row.get('approval_history',[])
                if not isinstance(history,list):
                    raise HTTPException(409,'The retained approval history needs review before adding a decision')
                decision=next((d for d in history if isinstance(d,dict) and d.get('request_id')==identity),None)
                if not decision:
                    s._require_snapshot(incoming,row)
                    if row['status']=='retired': raise HTTPException(409,'Retired AI is historical')
                    if body.status!='not_approved':
                        permitted=row.get('permitted_data_types')
                        if not all(isinstance(row.get(key),str) and row[key].strip() for key in ('environment','description')) or not isinstance(permitted,list) or not permitted or any(value not in CATALOG['data_types'] for value in permitted):
                            raise HTTPException(422,'Record the environment, approved use and permitted data before approving')
                        if body.status=='approved_with_conditions' and not (isinstance(row.get('restrictions'),str) and row['restrictions'].strip()):
                            raise HTTPException(422,'Record the approval conditions in Restrictions / boundaries')
                    at=s._next_write_time(row.get('updated_at'))
                    decision={'status':body.status,'note':body.note,'scope':approval_scope(row),'at':at,
                        'by':user['user_id'],'by_name':user.get('name') or user.get('email'),'request_id':identity}
                    updates={'approval_status':body.status,'updated_at':at}
                    await s.db.create_requests.update_one({'_id':identity},{'$set':{'primary_started':True}})
                    changed=await s.db.ai_systems.update_one(
                        {'ai_system_id':aid,'client_id':row['client_id'],'updated_at':row.get('updated_at')},
                        {'$set':updates,'$push':{'approval_history':decision}})
                    if not changed.matched_count:
                        raise HTTPException(409,'Record changed since it was opened; reload before making a decision')
                    row={**row,**updates,'approval_history':[*history,decision]}
                await s.audit(user,'AI approval decision recorded','ai_system',aid,row['client_id'],
                    meta={'status':decision['status'],'note':decision['note']})
                return await view(row)

        payload=body.model_dump()
        await create_requests.run(s.db,create_requests.digest(payload),user['user_id'],selected['client_id'],
            'ai_systems/'+aid+'/approval/update',payload,execute)
        return await view(await parent(aid,user,True,True))
    @router.post('/ai_systems/{aid}/reviews')
    async def schedule_ai(aid:str,body:dict,user=Depends(s.get_current_user)):
        selected=await parent(aid,user,True,True)
        rejected={'X-Create-Rejected':'true'}
        if selected['status'] in ('retired','suspended'):
            raise HTTPException(409,'Inactive AI cannot start periodic reviews',headers={} if selected.get('_ai_review_schedule_pending') else rejected)
        if 'expected_updated_at' not in body:
            raise HTTPException(428,'Reload the record before saving; an edit version is required',headers=rejected)
        if set(body)-{'due_date','recurrence','custom_recurrence_days','owner_id','expected_updated_at'}:
            raise HTTPException(422,'Unknown AI Review scheduling fields',headers=rejected)
        if not isinstance(body.get('owner_id'),str) or not body['owner_id']:
            raise HTTPException(422,'Choose an eligible Review owner',headers=rejected)
        if body.get('recurrence') not in ('quarterly','semiannual','annual','custom') or not review_occurrences.scheduled_date(body.get('due_date')):
            raise HTTPException(422,'Choose a valid date and cadence',headers=rejected)
        if body['recurrence']=='custom' and (type(body.get('custom_recurrence_days')) is not int or not 1<=body['custom_recurrence_days']<=3660):
            raise HTTPException(422,'Custom recurrence must be 1-3660 days',headers=rejected)

        async def execute(identity):
            async with lease(s.db,aid):
                row=await parent(aid,user,True,True)
                query={'client_id':row['client_id'],'ai_system_id':aid}
                review=await s.db.reviews.find_one({'_id':'create:'+identity,**query},{'_id':0})
                if review is None:
                    if row['status'] in ('retired','suspended'):
                        raise HTTPException(409,'Inactive AI cannot start periodic reviews')
                    s._require_snapshot(body,row)
                    if not await assignment_eligibility.eligible(s.db,body['owner_id'],row['client_id'],s._can_access_client):
                        raise HTTPException(422,'Choose an active platform user with access to this client')
                    existing=await s.db.reviews.find_one({**query,'ai_review_purpose':'periodic','status':{'$nin':['completed','cancelled']}},{'_id':0})
                    if existing: return review_occurrences.view(existing)
                    receipt=await s.db.create_requests.find_one({'_id':identity})
                    review=receipt.get('ai_review_plan')
                    if review is None:
                        at=s._now()
                        review={'review_id':s._uid('rev'),**query,'ai_review_purpose':'periodic',
                            'title':f"AI Governance Review - {row['display_id']} - {row['name']}",
                            'review_type':'ai_governance','owner_id':body['owner_id'],'due_date':body['due_date'],
                            'recurrence':body['recurrence'],'custom_recurrence_days':body.get('custom_recurrence_days'),
                            'status':'upcoming','created_at':at,'updated_at':at,'created_by':user['user_id']}
                        review.update(review_occurrences.schedule(review))
                        review['current_occurrence_id']=review_occurrences.occurrence_id(review)
                        await s.db.create_requests.update_one({'_id':identity},{'$set':{'ai_review_plan':review,'ai_review_request':body}})
                    if row.get('_ai_review_schedule_pending')!=identity:
                        claimed=await s.db.ai_systems.update_one({**query,'updated_at':row.get('updated_at'),'_ai_review_schedule_pending':None},
                            {'$set':{'_ai_review_schedule_pending':identity}})
                        if not claimed.matched_count:
                            raise HTTPException(409,'AI record changed before its Review schedule was accepted')
                    review=await create_requests.insert_primary(s.db,'reviews',review,identity)
                await s.audit(user,'AI Governance Review scheduled','ai_system',aid,row['client_id'],meta={'review_id':review['review_id']})
                await s.db.ai_systems.update_one({**query,'_ai_review_schedule_pending':identity},{'$unset':{'_ai_review_schedule_pending':''}})
                return review_occurrences.view(review)

        result=await create_requests.run(s.db,create_requests.digest(body),user['user_id'],selected['client_id'],
            'ai_systems/'+aid+'/reviews/update',body,execute)
        await parent(aid,user,True,True)
        current=await s.db.reviews.find_one({'review_id':result['review_id'],'client_id':selected['client_id'],'ai_system_id':aid},{'_id':0})
        if current is None: raise HTTPException(409,'The accepted AI Review is missing; preserve the original request for review')
        return review_occurrences.view(current)
    async def pending_schedule(row,identity):
        receipt=await s.db.create_requests.find_one({'_id':identity})
        plan=(receipt or {}).get('ai_review_plan')
        request=(receipt or {}).get('ai_review_request')
        if (not isinstance(plan,dict) or not isinstance(request,dict)
                or plan.get('client_id')!=row['client_id'] or plan.get('ai_system_id')!=row['ai_system_id']
                or not isinstance(plan.get('created_by'),str) or not plan.get('review_id') or not plan.get('current_occurrence_id')
                or create_requests.digest(request)!=(receipt or {}).get('fingerprint')
                or create_requests.digest([plan['created_by'],row['client_id'],
                    'ai_systems/'+row['ai_system_id']+'/reviews/update',create_requests.digest(request)])!=identity):
            raise HTTPException(409,'The retained Review schedule needs authoritative reconciliation')
        schedule=review_occurrences.schedule({key:request.get(key) for key in ('due_date','recurrence','custom_recurrence_days')})
        if (not isinstance(plan['review_id'],str) or not isinstance(plan['current_occurrence_id'],str)
                or plan['current_occurrence_id']!='occ_'+plan['review_id']
                or plan.get('status')!='upcoming' or plan.get('review_type')!='ai_governance'
                or plan.get('ai_review_purpose')!='periodic'
                or any(plan.get(key)!=request.get(key) for key in ('due_date','recurrence','custom_recurrence_days','owner_id'))
                or any(plan.get(key)!=value for key,value in schedule.items())):
            raise HTTPException(409,'The retained Review schedule plan needs authoritative reconciliation')
        return receipt,plan

    @router.get('/ai_systems/{aid}/reviews/pending')
    async def pending_ai_review(aid:str,user=Depends(s.get_current_user)):
        row=await parent(aid,user,False,True)
        identity=row.get('_ai_review_schedule_pending')
        if not identity:return {'pending':None}
        _,plan=await pending_schedule(row,identity)
        review=await s.db.reviews.find_one({'_id':'create:'+identity},{'_id':0})
        return {'pending':{'schedule_id':identity,'review_id':plan['review_id'],
            'occurrence_id':plan['current_occurrence_id'],'due_date':plan['due_date'],
            'recurrence':plan['recurrence'],'owner_id':(review or plan).get('owner_id'),
            'expected_updated_at':row.get('updated_at'),
            'expected_review_updated_at':review.get('updated_at') if review else None}}

    @router.post('/ai_systems/{aid}/reviews/recover')
    async def recover_ai_review(aid:str,body:dict,user=Depends(s.get_current_user)):
        selected=await parent(aid,user,True,True)
        if set(body)!={'schedule_id','owner_id','expected_updated_at','expected_review_updated_at'}:
            raise HTTPException(422,'Choose the retained schedule, current versions and an eligible owner',headers={'X-Create-Rejected':'true'})
        schedule_id=body.get('schedule_id')
        if not isinstance(schedule_id,str) or not re.fullmatch('[0-9a-f]{64}',schedule_id):
            raise HTTPException(422,'Choose the retained schedule',headers={'X-Create-Rejected':'true'})
        async def recover(identity):
            async with lease(s.db,aid,recovery_schedule=schedule_id):
                row=await parent(aid,user,True,True)
                receipt=await s.db.create_requests.find_one({'_id':identity})
                saved=receipt.get('ai_review_recovery')
                if not saved and row.get('_ai_review_schedule_pending')!=schedule_id:
                    raise HTTPException(409,'The pending schedule changed; reload before recovery')
                original,plan=await pending_schedule(row,schedule_id)
                now=datetime.now(timezone.utc)
                token=uuid.uuid4().hex
                claimed=await s.db.create_requests.update_one({'_id':schedule_id,'$or':[
                    {'lease':None},{'lease.until':{'$lt':now.isoformat()}}]},
                    {'$set':{'lease':{'token':token,'until':(now+timedelta(seconds=120)).isoformat()}}})
                if not claimed.modified_count:raise HTTPException(409,'The original schedule is still processing; retry recovery')
                try:
                    primary={'_id':'create:'+schedule_id,'client_id':row['client_id'],'ai_system_id':aid}
                    review=await s.db.reviews.find_one(primary,{'_id':0})
                    applied=review and identity in review.get('_ai_review_recovery_commands',[])
                    if not applied:
                        s._require_snapshot(body,row)
                        if row['status'] in ('retired','suspended'):
                            raise HTTPException(409,'Inactive AI cannot start periodic reviews')
                        if not isinstance(body.get('owner_id'),str) or not await assignment_eligibility.eligible(s.db,body['owner_id'],row['client_id'],s._can_access_client):
                            raise HTTPException(422,'Choose an active platform user with access to this client')
                        base=saved or {'primary_identity':schedule_id,'review_id':plan['review_id'],
                            'occurrence_id':plan['current_occurrence_id'],'previous_owner_id':(review or plan).get('owner_id'),
                            'expected_review_updated_at':body['expected_review_updated_at'],
                            'materialized_updated_at':plan.get('updated_at'),'owner_id':body['owner_id'],
                            'updated_at':s._next_write_time((review or plan).get('updated_at'))}
                        if review and review.get('updated_at')!=base['expected_review_updated_at'] and not (
                                base['expected_review_updated_at'] is None and review.get('updated_at')==base['materialized_updated_at']):
                            raise HTTPException(409,'The Review changed; reload before recovery')
                        if review and (review.get('status')!='upcoming' or review.get('occurrences') or
                                any(review.get(key)!=plan.get(key) for key in ('review_id','current_occurrence_id',
                                    'due_date','recurrence','custom_recurrence_days','schedule_anchor','recurrence_due_date','review_type','ai_review_purpose'))):
                            raise HTTPException(409,'Started or historical Review work cannot be changed by schedule recovery')
                        if not saved:
                            await s.db.create_requests.update_one({'_id':identity},{'$set':{'ai_review_recovery':base,'primary_started':True}})
                        # Always use the ORIGINAL primary key. A delayed original
                        # upsert cannot create a second Review or replace this edit.
                        await s.db.reviews.update_one({'_id':primary['_id']},{'$setOnInsert':plan},upsert=True)
                        review=await s.db.reviews.find_one(primary,{'_id':0})
                        if review.get('review_id')!=base['review_id'] or review.get('current_occurrence_id')!=base['occurrence_id']:
                            raise HTTPException(409,'The retained Review identity requires reconciliation')
                        expected=base['expected_review_updated_at'] or base['materialized_updated_at']
                        changed=await s.db.reviews.update_one({**primary,'updated_at':expected,'status':'upcoming',
                            'current_occurrence_id':base['occurrence_id'],'$or':[{'occurrences':None},{'occurrences':[]}]},
                            {'$set':{'owner_id':base['owner_id'],'updated_at':base['updated_at']},
                             '$addToSet':{'_ai_review_recovery_commands':identity}})
                        if not changed.matched_count:raise HTTPException(409,'The Review changed before recovery; no edit was overwritten')
                        review=await s.db.reviews.find_one(primary,{'_id':0})
                    for audit_id,document in original.get('pending_audits',{}).items():
                        await s.db.audit_logs.update_one({'_id':'create:'+audit_id},{'$setOnInsert':document},upsert=True)
                    if not await s.db.audit_logs.find_one({'action':'AI Governance Review scheduled','entity_id':aid,'meta.review_id':plan['review_id']}):
                        await s.audit(user,'AI Governance Review scheduled','ai_system',aid,row['client_id'],meta={'review_id':plan['review_id'],'recovered_from_actor':plan['created_by']})
                    base=saved or (await s.db.create_requests.find_one({'_id':identity}))['ai_review_recovery']
                    await s.audit(user,'AI Review schedule recovered','ai_system',aid,row['client_id'],meta={
                        'review_id':plan['review_id'],'occurrence_id':plan['current_occurrence_id'],
                        'previous_owner_id':base['previous_owner_id'],'owner_id':base['owner_id']})
                    result=review_occurrences.view(review)
                    settled=await s.db.create_requests.update_one({'_id':schedule_id,'lease.token':token},
                        {'$set':{'state':'complete','result':result,'recovered_by':identity}})
                    if not settled.matched_count:raise HTTPException(409,'Original schedule recovery ownership changed; retry this recovery')
                    await s.db.ai_systems.update_one({'ai_system_id':aid,'_ai_review_schedule_pending':schedule_id},
                        {'$unset':{'_ai_review_schedule_pending':''}})
                    return result
                finally:
                    await s.db.create_requests.update_one({'_id':schedule_id,'lease.token':token},{'$unset':{'lease':''}})
        result=await create_requests.run(s.db,create_requests.digest(body),user['user_id'],selected['client_id'],
            'ai_systems/'+aid+'/reviews/recover/update',body,recover)
        await parent(aid,user,True,True)
        current=await s.db.reviews.find_one({'review_id':result['review_id'],'client_id':selected['client_id'],'ai_system_id':aid},{'_id':0})
        if current is None:raise HTTPException(409,'The recovered Review is missing; preserve the request')
        return review_occurrences.view(current)

    @router.post('/ai_systems/{aid}/material-change')
    async def change_ai(aid:str,body:AIMaterialChangeInput,user=Depends(s.get_current_user)):
        selected=await parent(aid,user,True,True)
        incoming=body.model_dump(exclude_unset=True)
        if 'expected_updated_at' not in incoming: s._require_snapshot(incoming,selected)
        await metadata_scope(selected['client_id'],AI_METADATA_DEFAULTS)

        async def execute(identity):
            async with lease(s.db,aid):
                row=await parent(aid,user,True,True)
                await metadata_scope(row['client_id'],AI_METADATA_DEFAULTS)
                previous=row.get('_ai_material_change_command')
                if previous!=identity:
                    if previous:
                        prior=await s.db.create_requests.find_one({'_id':previous})
                        if not prior or prior.get('state')!='complete':
                            raise HTTPException(409,'Retry the pending material change before recording another')
                    s._require_snapshot(incoming,row)
                    if row['status']=='retired': raise HTTPException(409,'Retired AI is historical')
                    at=s._next_write_time(row.get('updated_at'))
                    updates={'material_change_at':at,'material_change_note':body.note,
                        'updated_at':at,'_ai_material_change_command':identity}
                    if row.get('approval_status') in AI_DECISIONS:
                        updates['approval_status']='pending_assessment'
                    await s.db.create_requests.update_one({'_id':identity},{'$set':{
                        'primary_started':True,'ai_material_change':{'at':at,'note':body.note}}})
                    changed=await s.db.ai_systems.update_one(
                        {'ai_system_id':aid,'client_id':row['client_id'],'updated_at':row.get('updated_at')},
                        {'$set':updates})
                    if not changed.matched_count:
                        raise HTTPException(409,'Record changed since it was opened; reload before recording a material change')
                    row={**row,**updates}
                receipt=await s.db.create_requests.find_one({'_id':identity})
                saved=receipt.get('ai_material_change')
                if not saved: raise HTTPException(409,'The retained material-change command needs review')
                await s.audit(user,'AI material change recorded','ai_system',aid,row['client_id'],meta={'note':saved['note']})
                # Reassessment uses the existing Review; no duplicate is created.
                return await view(row)

        payload=body.model_dump()
        await create_requests.run(s.db,create_requests.digest(payload),user['user_id'],selected['client_id'],
            'ai_systems/'+aid+'/material-change/update',payload,execute)
        return await view(await parent(aid,user,True,True))
    @router.post('/ai_systems/{aid}/links')
    async def link_ai(aid:str,body:AILinkInput,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True)
        if row['status']=='retired': raise HTTPException(409,'Retired AI is historical')
        target=await s._authorized_parent(body.kind,body.id,user)
        if target['client_id']!=row['client_id']: raise HTTPException(422,'Relationship must belong to the same client')
        link=body.model_dump()
        changed=await s.db.ai_systems.update_one({'ai_system_id':aid,'status':{'$ne':'retired'}},{'$addToSet':{'related_links':link}})
        if not changed.matched_count: raise HTTPException(409,'Retired AI is historical')
        await s.audit(user,'AI record linked','ai_system',aid,row['client_id'],meta=link)
        return {'ok':True}
    @router.get('/ai_systems/{aid}/activity')
    async def activity(aid:str,user=Depends(s.get_current_user)):
        row=await parent(aid,user)
        reviews=await s.db.reviews.find({'client_id':row['client_id'],'ai_system_id':aid},{'review_id':1}).to_list(None)
        return await s.db.audit_logs.find({'client_id':row['client_id'],'entity_id':{'$in':[aid]+[r['review_id'] for r in reviews]}},{'_id':0}).sort('at',-1).to_list(500)
    ai_onboarding.register(router,s,ai_model=AIInput,create_ai=create_ai_record,validate_ai=validate,
        client_scope=client_scope,metadata_scope=metadata_scope,project_ai=view,lease_ai=lease)
    return router
