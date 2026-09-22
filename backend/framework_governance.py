"""Reusable client requirement assessments; CIS is the only populated framework."""
import json
import uuid
from pathlib import Path
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
import review_occurrences
import assignment_eligibility

ROOT=Path(__file__).parents[1]/'frontend/src/lib'
FRAMEWORKS=json.loads((ROOT/'frameworkDefinitions.json').read_text())['frameworks']
CIS=json.loads((ROOT/'cisIG1.json').read_text())
DEFINITIONS={r['id']:r for r in CIS['requirements']}
STATUSES=('not_assessed','in_progress','addressed','needs_attention','not_applicable')
CADENCES=('monthly','quarterly','semiannual','annual','custom')

def stable(cid,kind,key):
    return 'fw_'+uuid.uuid5(uuid.NAMESPACE_URL,f'{cid}:cis-ig1:8.1:{kind}:{key}').hex

def validate_configuration(state):
    configs=state.get('framework_reviews',{})
    if not isinstance(configs,dict) or set(configs)-{p['key'] for p in CIS['review_plans']}:
        raise HTTPException(422,'Invalid framework Review configuration')
    for config in configs.values():
        if not isinstance(config,dict) or set(config)-{'enabled','recurrence','custom_recurrence_days','due_date'}:
            raise HTTPException(422,'Invalid framework Review fields')
        if 'enabled' in config and type(config['enabled']) is not bool: raise HTTPException(422,'Invalid Review selection')
        if config.get('recurrence','annual') not in CADENCES: raise HTTPException(422,'Invalid client cadence')
        if config.get('recurrence')=='custom' and (type(config.get('custom_recurrence_days')) is not int or not 1<=config['custom_recurrence_days']<=3650): raise HTTPException(422,'Custom cadence must be 1–3650 days')
        if config.get('due_date') and not review_occurrences.scheduled_date(config['due_date']): raise HTTPException(422,'Invalid Review date')

async def reconcile(s,cid,state,user):
    """Only explicit v3 completion configures assessments. Never delete or reset responses."""
    selected=state.get('requirements',{}).get('cis-ig1')=='applies'
    if not selected:
        await s.db.reviews.update_many({'client_id':cid,'framework_key':'cis-ig1'},{'$set':{'framework_driver_active':False}})
        return
    for definition in CIS['requirements']:
        aid=stable(cid,'assessment',definition['id'])
        await s.db.framework_assessments.update_one({'_id':aid},{'$setOnInsert':{
            'framework_assessment_id':aid,'client_id':cid,'framework_key':'cis-ig1','definition_id':definition['id'],
            'framework_version':'8.1','status':'not_assessed','implementation':'','technology':'','notes':'','na_rationale':'',
            'owner_id':None,'process_owner_id':None,'created_at':s._now(),'related_links':[],'assessment_history':[]}},upsert=True)
    for plan in CIS['review_plans']:
        config={'enabled':True,'recurrence':plan['default_cadence'],**state.get('framework_reviews',{}).get(plan['key'],{})}
        old=await s.db.reviews.find_one({'client_id':cid,'framework_plan_key':plan['key']},{'_id':0})
        if not config['enabled']:
            if old: await s.db.reviews.update_one({'review_id':old['review_id']},{'$set':{'framework_driver_active':False}})
            continue
        if not old and plan.get('baseline_key'):
            old=await s.db.reviews.find_one({'client_id':cid,'baseline_key':plan['baseline_key']},{'_id':0})
        mapping={'framework_key':'cis-ig1','framework_version':'8.1','framework_plan_key':plan['key'],'framework_driver_active':True,
                 'framework_safeguards':plan['safeguards'],'framework_basis':plan['basis'],'framework_source_cadence':plan['source_cadence'],
                 'framework_default_cadence':plan['default_cadence']}
        if old:
            # Dates, owners, overrides, occurrences and lifecycle are never reset by re-onboarding.
            await s.db.reviews.update_one({'review_id':old['review_id'],'client_id':cid},{'$set':mapping})
        else:
            rid=stable(cid,'review',plan['key'])
            row={'review_id':rid,'client_id':cid,'title':plan['title'],'review_type':plan['review_type'],'status':'needs_scheduling',
                 'due_date':config.get('due_date') or None,'recurrence':config['recurrence'],'custom_recurrence_days':config.get('custom_recurrence_days'),
                 'owner_id':None,'created_at':s._now(),'created_by':user['user_id'],**mapping}
            row.update(review_occurrences.schedule(row));row['current_occurrence_id']=review_occurrences.occurrence_id(row)
            await s.db.reviews.update_one({'_id':rid},{'$setOnInsert':row},upsert=True)

class AssessmentPatch(BaseModel):
    model_config=ConfigDict(extra='forbid')
    status: Optional[Literal['not_assessed','in_progress','addressed','needs_attention','not_applicable']]=None
    implementation: Optional[str]=Field(default=None,max_length=20000)
    technology: Optional[str]=Field(default=None,max_length=4000)
    notes: Optional[str]=Field(default=None,max_length=20000)
    na_rationale: Optional[str]=Field(default=None,max_length=4000)
    owner_id: Optional[str]=None
    process_owner_id: Optional[str]=None

class LinkInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    kind: Literal['reviews','findings','tasks','risks','policies','evidence','requirements']
    id: str=Field(min_length=1,max_length=160)

class FindingInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    title:str=Field(min_length=1,max_length=500)
    remediation_title:str=Field(min_length=1,max_length=500)
    description:str=Field(default='',max_length=20000)
    severity:Literal['low','medium','high','critical']='medium'
    request_id:str=Field(min_length=1,max_length=128)

async def related(s,row):
    cid,aid,did=row['client_id'],row['framework_assessment_id'],row['definition_id']
    out={}
    for kind,key in {'reviews':'review_id','findings':'finding_id','tasks':'task_id','risks':'risk_id','policies':'policy_id','requirements':'requirement_id','evidence':'evidence_id'}.items():
        links=[l['id'] for l in row.get('related_links',[]) if l['kind']==kind]
        clauses=[{key:{'$in':links}},{'framework_assessment_id':aid}]
        if kind=='reviews':clauses.append({'framework_key':row['framework_key'],'framework_safeguards':did})
        if kind=='policies':clauses.append({'baseline_key':{'$in':[p['policy_key'] for p in CIS['policy_mappings'] if did in p['safeguards']]}})
        if kind=='evidence':clauses.append({'linked_type':{'$in':['framework_assessment','framework_assessments']},'linked_id':aid})
        out[kind]=await s.db[kind].find({'client_id':cid,'$or':clauses},{'_id':0,'content_base64':0}).to_list(None)
    rids=[r['review_id'] for r in out['reviews']]
    findings=await s.db.findings.find({'client_id':cid,'review_id':{'$in':rids}},{'_id':0}).to_list(None)
    out['findings']=list({r['finding_id']:r for r in out['findings']+findings}.values())
    tasks=await s.db.tasks.find({'client_id':cid,'$or':[{'finding_id':{'$in':[f['finding_id'] for f in out['findings']]}},{'review_id':{'$in':rids}}]},{'_id':0}).to_list(None)
    out['tasks']=list({r['task_id']:r for r in out['tasks']+tasks}.values())
    review_evidence=await s.db.evidence.find({'client_id':cid,'linked_type':{'$in':['review','reviews']},'linked_id':{'$in':rids}},{'_id':0,'content_base64':0}).to_list(None)
    out['evidence']=list({e['evidence_id']:e for e in out['evidence']+review_evidence}.values())
    return out

def router_for(s):
    router=APIRouter(prefix='/api',tags=['framework-assessments'])
    async def scoped(cid,user):
        if not s._can_access_client(user,cid):raise HTTPException(403,'Forbidden')
        if not await s.db.clients.find_one({'client_id':cid}):raise HTTPException(404,'Client not found')
    async def parent(aid,user,write=False):
        return await s._authorized_parent('framework_assessments',aid,user,write)
    @router.get('/frameworks/summary')
    async def summary(client_id:str,user=Depends(s.get_current_user)):
        import framework_summary
        await scoped(client_id,user)
        client=await s.db.clients.find_one({'client_id':client_id},{'_id':0,'client_id':1,'onboarding_baseline.completed':1})
        return await framework_summary.read(s,client)
    @router.get('/frameworks/{key}')
    async def workspace(key:str,client_id:str,user=Depends(s.get_current_user)):
        await scoped(client_id,user)
        framework=next((f for f in FRAMEWORKS if f['key']==key),None)
        if not framework:raise HTTPException(404,'Framework not found')
        program=await s.db.requirements.find_one({'client_id':client_id,'baseline_key':key,'baseline_response':'applies'})
        rows=await s.db.framework_assessments.find({'client_id':client_id,'framework_key':key},{'_id':0}).to_list(None) if framework['implemented'] else []
        return {'framework':framework,'selected':bool(program),'configured':bool(rows),'definitions':CIS['requirements'] if framework['implemented'] and rows else [],'assessments':rows}
    @router.patch('/framework_assessments/{aid}')
    async def update(aid:str,body:AssessmentPatch,user=Depends(s.get_current_user)):
        old=await parent(aid,user,True);changes=body.model_dump(exclude_unset=True);data={**old,**changes}
        if data['status'] not in STATUSES or any(data.get(k) is None for k in ('implementation','technology','notes','na_rationale')):raise HTTPException(422,'Invalid assessment fields')
        if data['status']=='not_applicable' and not data['na_rationale'].strip():raise HTTPException(422,'N/A rationale is required')
        if data['status']=='addressed' and not data['implementation'].strip():raise HTTPException(422,'Describe implementation before marking Addressed')
        await assignment_eligibility.validate(s.db, 'framework_assessments', data, s._can_access_client, old)
        if data.get('process_owner_id') and not await s.db.contacts.find_one({'contact_id':data['process_owner_id'],'client_id':old['client_id']}):raise HTTPException(422,'Process owner must be a client Contact')
        changed=[k for k in changes if changes[k]!=old.get(k)]
        if changed:
            at=s._now();snapshot={k:data.get(k) for k in AssessmentPatch.model_fields};snapshot.update(at=at,by=user['user_id'])
            await s.db.framework_assessments.update_one({'framework_assessment_id':aid,'client_id':old['client_id']},{'$set':{**changes,'last_assessed':at,'assessed_by':user['user_id']},'$push':{'assessment_history':snapshot}})
            await s.audit(user,'Framework assessment updated','framework_assessment',aid,old['client_id'],meta={'changed_fields':changed,'status':data['status']})
        return await parent(aid,user)
    @router.get('/framework_assessments/{aid}/related')
    async def get_related(aid:str,user=Depends(s.get_current_user)):
        return await related(s,await parent(aid,user))
    @router.post('/framework_assessments/{aid}/links')
    async def link(aid:str,body:LinkInput,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True);target=await s._authorized_parent(body.kind,body.id,user)
        if target['client_id']!=row['client_id']:raise HTTPException(422,'Relationship must belong to this client')
        await s.db.framework_assessments.update_one({'framework_assessment_id':aid},{'$addToSet':{'related_links':body.model_dump()}})
        await s.audit(user,'Framework record linked','framework_assessment',aid,row['client_id'],meta=body.model_dump())
        return {'ok':True}
    @router.post('/framework_assessments/{aid}/findings')
    async def finding(aid:str,body:FindingInput,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True)
        if not body.title.strip() or not body.remediation_title.strip():raise HTTPException(422,'Finding and Action titles are required')
        fid=stable(row['client_id'],'finding',aid+':'+body.request_id)
        doc={'finding_id':fid,'client_id':row['client_id'],'title':body.title.strip(),'description':body.description,'severity':body.severity,
             'status':'open','framework_assessment_id':aid,'source':'CIS IG1 · '+row['definition_id'],'owner_id':row.get('owner_id'),
             'created_at':s._now(),'updated_at':s._now(),'created_by':user['user_id'],'remediation_title':body.remediation_title.strip()}
        previous=await s.db.findings.find_one({'finding_id':fid,'client_id':row['client_id']})
        if not previous:
            await assignment_eligibility.validate(s.db, 'findings', doc, s._can_access_client)
        result=await s.db.findings.update_one({'_id':fid},{'$setOnInsert':doc},upsert=True)
        saved=await s.db.findings.find_one({'finding_id':fid},{'_id':0})
        await s.finding_create_task(fid,{'title':saved['remediation_title']},user)
        if result.upserted_id:
            await s.audit(user,'Finding raised','framework_assessment',aid,row['client_id'],meta={'finding_id':fid})
            await s.audit(user,'create','finding',fid,row['client_id'],meta={'framework_assessment_id':aid})
        return await s.db.findings.find_one({'finding_id':fid},{'_id':0})
    @router.get('/framework_assessments/{aid}/activity')
    async def activity(aid:str,user=Depends(s.get_current_user)):
        row=await parent(aid,user)
        return await s.db.audit_logs.find({'client_id':row['client_id'],'entity_id':aid},{'_id':0}).sort('at',-1).to_list(500)
    return router
