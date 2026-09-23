"""AI inventory/context only. Reviews, remediation and evidence remain authoritative elsewhere."""
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field, ConfigDict, StrictBool
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
import review_occurrences
import assignment_eligibility
import create_requests

CATALOG = json.loads((Path(__file__).parents[1] / 'frontend/src/lib/aiGovernanceCatalog.json').read_text(encoding='utf-8'))

class AIInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    client_id: str
    name: str = Field(min_length=1, max_length=240)
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

def screening(row):
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
    result.update(screening(row), last_review=max(filter(None,done),default=None), next_review=min(dates,default=None))
    periodic = next((r for r in linked if r.get('ai_review_purpose') == 'periodic' and r.get('status') not in ('completed','cancelled')), None)
    result['review_cadence'] = periodic.get('recurrence') if periodic else None
    result['alerts'] = []
    if row.get('status') != 'active':
        return result
    def alert(key, label, condition):
        if condition: result['alerts'].append({'key':key,'label':label,'classification':'Recommended governance practice'})
    answers = row.get('screening') or {}
    alert('owner','AI Owner Missing',not row.get('owner_id'))
    alert('schedule','AI Review Not Scheduled',not result['next_review'])
    alert('overdue','AI Review Overdue',bool(result['next_review'] and result['next_review'][:10] < (today or datetime.now(timezone.utc).date().isoformat())))
    ids = {x['id'] for x in row.get('related_links',[]) if x['kind']=='risks'}
    assessed = any(r['client_id']==row['client_id'] and r.get('risk_id') in ids and r.get('status') not in ('closed','retired') and type(r.get('likelihood_score')) is int and type(r.get('impact_score')) is int for r in risks)
    alert('risk','High-Risk AI Without Risk Assessment',result['risk_tier']=='high' and not assessed)
    alert('screening','AI Governance Assessment Missing',not result['screening_complete'])
    consequential = answers.get('consequential') or answers.get('employment') or 'HR / Employment' in row.get('purposes',[])
    alert('oversight','Consequential AI Without Documented Oversight',consequential and not row.get('oversight_notes','').strip())
    alert('vendor','Third-Party AI Without Vendor Relationship',(answers.get('third_party') or row.get('provider')) and not row.get('vendor_id'))
    sensitive = answers.get('sensitive') or bool(set(row.get('data_types',[]))-{'Public','Internal','No Sensitive Data'})
    alert('sensitive','Sensitive Data Without Completed Governance Review',sensitive and not result['last_review'])
    alert('change','Material Change Review Needed',row.get('material_change_at') and (not result['last_review'] or row['material_change_at'] > result['last_review']))
    return result

@asynccontextmanager
async def lease(db, ai_id):
    if not ai_id:
        yield
        return
    token, now = uuid.uuid4().hex, datetime.now(timezone.utc)
    result = await db.ai_systems.update_one({'ai_system_id':ai_id,'$or':[{'_governance_lock':None},{'_governance_lock.until':{'$lt':now.isoformat()}}]}, {'$set':{'_governance_lock':{'token':token,'until':(now+timedelta(seconds=120)).isoformat()}}})
    if not result.modified_count: raise HTTPException(409,'Another AI governance action is being saved; retry')
    try:
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
    async def validate(data,user,old=None):
        await client_scope(data['client_id'],user,True)
        if not data['name'].strip(): raise HTTPException(422,'Name is required')
        if old and old['client_id']!=data['client_id']: raise HTTPException(422,'Cannot move records between clients')
        if old and old['status']=='retired': raise HTTPException(409,'Retired AI records remain historical')
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
        async def execute(identity):
            return await create_ai_record(body,user,identity)
        return await create_requests.run(s.db,idempotency_key,user['user_id'],body.client_id,'ai_systems',body.model_dump(),execute)
    async def create_ai_record(body,user,identity):
        existing=await s.db.ai_systems.find_one({'_id':'create:'+identity},{'_id':0})
        if existing:
            await s.audit(user,'AI use case created','ai_system',existing['ai_system_id'],existing['client_id'])
            return await view(existing)
        data=body.model_dump();await validate(data,user)
        counter_key='ai-display:'+data['client_id']
        try:
            counter=await s.db.business_counters.find_one_and_update({'_id':counter_key},{'$inc':{'sequence':1}},upsert=True,return_document=ReturnDocument.AFTER)
        except DuplicateKeyError:
            counter=await s.db.business_counters.find_one_and_update({'_id':counter_key},{'$inc':{'sequence':1}},return_document=ReturnDocument.AFTER)
        row={**data,'ai_system_id':s._uid('ai'),'display_id':f"AI-{counter['sequence']:03d}",'created_at':s._now(),'updated_at':s._now(),'created_by':user['user_id'],'related_links':[]}
        row=await create_requests.insert_primary(s.db,'ai_systems',row,identity)
        await s.audit(user,'AI use case created','ai_system',row['ai_system_id'],row['client_id'])
        return await view(row)
    @router.patch('/ai_systems/{aid}')
    async def update_ai(aid:str,body:dict,user=Depends(s.get_current_user)):
        old=await parent(aid,user,True)
        s._require_snapshot(body,old)
        changes={k:v for k,v in body.items() if k!='expected_updated_at'}
        if set(changes)-set(AIInput.model_fields): raise HTTPException(422,'Unknown or read-only AI fields')
        async with lease(s.db,aid):
            old=await parent(aid,user,True)
            s._require_snapshot(body,old)
            try: data=AIInput(**{**{k:old[k] for k in AIInput.model_fields if k in old},**changes}).model_dump()
            except Exception as exc: raise HTTPException(422,'Invalid AI fields') from exc
            await validate(data,user,old)
            if data['status']=='retired':
                # Started work may finish as a one-time closure obligation; history is retained.
                for review in await s.db.reviews.find({'ai_system_id':aid,'client_id':old['client_id'],'status':{'$nin':['completed','cancelled']}},{'_id':0}).to_list(None):
                    changes={'recurrence':'none','next_review_date':None,'updated_at':s._now()}
                    if review['status']!='in_progress': changes['status']='cancelled'
                    await s.db.reviews.update_one({'review_id':review['review_id']},{'$set':changes})
                    await s._review_event(user,review,'AI retired; recurring review stopped')
            data['updated_at']=s._next_write_time(old.get('updated_at'))
            changed_record=await s.db.ai_systems.update_one({'ai_system_id':aid,'updated_at':old.get('updated_at')},{'$set':data})
            if not changed_record.matched_count:raise HTTPException(409,'Record changed since it was opened; reload before saving')
            changed=[k for k in data if k!='updated_at' and data[k]!=old.get(k)]
            if changed: await s.audit(user,'AI '+('retired' if data['status']=='retired' else 'suspended' if data['status']=='suspended' else 'governance updated'),'ai_system',aid,old['client_id'],meta={'changed_fields':changed,'previous_tier':screening(old)['risk_tier'],'risk_tier':screening(data)['risk_tier']})
            return await view({**old,**data})
    @router.post('/ai_systems/{aid}/reviews')
    async def schedule_ai(aid:str,body:dict,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True,True)
        async with lease(s.db,aid):
            row=await parent(aid,user,True,True)
            if row['status'] in ('retired','suspended'): raise HTTPException(409,'Inactive AI cannot start periodic reviews')
            if body.get('recurrence') not in ('quarterly','semiannual','annual','custom') or not review_occurrences.scheduled_date(body.get('due_date')): raise HTTPException(422,'Choose a valid date and cadence')
            if body['recurrence']=='custom' and (type(body.get('custom_recurrence_days')) is not int or not 1<=body['custom_recurrence_days']<=3650): raise HTTPException(422,'Custom recurrence must be 1–3650 days')
            existing=await s.db.reviews.find_one({'ai_system_id':aid,'ai_review_purpose':'periodic','status':{'$nin':['completed','cancelled']}},{'_id':0})
            if existing: return review_occurrences.view(existing)
            review={'review_id':s._uid('rev'),'client_id':row['client_id'],'ai_system_id':aid,'ai_review_purpose':'periodic','title':f"AI Governance Review — {row['display_id']} — {row['name']}",'review_type':'ai_governance','owner_id':row.get('owner_id'),'due_date':body['due_date'],'recurrence':body['recurrence'],'custom_recurrence_days':body.get('custom_recurrence_days'),'status':'upcoming','created_at':s._now(),'updated_at':s._now(),'created_by':user['user_id']}
            review.update(review_occurrences.schedule(review));review['current_occurrence_id']=review_occurrences.occurrence_id(review)
            await s.db.reviews.insert_one(review)
            review.pop('_id',None)
            await s.audit(user,'AI Governance Review scheduled','ai_system',aid,row['client_id'],meta={'review_id':review['review_id']})
            return review_occurrences.view(review)
    @router.post('/ai_systems/{aid}/material-change')
    async def change_ai(aid:str,body:dict,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True,True)
        if not isinstance(body.get('note'),str) or not body['note'].strip(): raise HTTPException(422,'Describe the material change')
        async with lease(s.db,aid):
            row=await parent(aid,user,True,True)
            if row['status']=='retired': raise HTTPException(409,'Retired AI is historical')
            at=s._now()
            await s.db.ai_systems.update_one({'ai_system_id':aid},{'$set':{'material_change_at':at,'material_change_note':body['note'],'updated_at':at}})
            await s.audit(user,'AI material change recorded','ai_system',aid,row['client_id'],meta={'note':body['note']})
            # The alert initiates reassessment through the existing Review; no automatic duplicate.
            return await view({**row,'material_change_at':at,'material_change_note':body['note'],'updated_at':at})
    @router.post('/ai_systems/{aid}/links')
    async def link_ai(aid:str,body:dict,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True)
        if row['status']=='retired': raise HTTPException(409,'Retired AI is historical')
        kind=body.get('kind');key=s.ID_FIELD_MAP.get(kind)
        if kind not in ('risks','findings','tasks','policies','requirements','vendors') or not key: raise HTTPException(422,'Unsupported relationship')
        target=await s._authorized_parent(kind,body.get('id'),user)
        if target['client_id']!=row['client_id']: raise HTTPException(422,'Relationship must belong to the same client')
        classification=body.get('classification','Context')
        if classification not in CATALOG['relationship_classes']: raise HTTPException(422,'Invalid relationship classification')
        if classification.startswith(('Explicit','Required')) and not (body.get('source','').strip() and body.get('rationale','').strip()): raise HTTPException(422,'Requirement claims need an authoritative source and applicability rationale')
        link={'kind':kind,'id':body['id'],'classification':classification,'source':body.get('source',''),'rationale':body.get('rationale','')}
        changed=await s.db.ai_systems.update_one({'ai_system_id':aid,'status':{'$ne':'retired'}},{'$addToSet':{'related_links':link}})
        if not changed.matched_count: raise HTTPException(409,'Retired AI is historical')
        await s.audit(user,'AI record linked','ai_system',aid,row['client_id'],meta=link)
        return {'ok':True}
    @router.get('/ai_systems/{aid}/activity')
    async def activity(aid:str,user=Depends(s.get_current_user)):
        row=await parent(aid,user)
        reviews=await s.db.reviews.find({'client_id':row['client_id'],'ai_system_id':aid},{'review_id':1}).to_list(None)
        return await s.db.audit_logs.find({'client_id':row['client_id'],'entity_id':{'$in':[aid]+[r['review_id'] for r in reviews]}},{'_id':0}).sort('at',-1).to_list(500)
    return router
