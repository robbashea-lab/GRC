"""Tenant-authorized framework assessments and shared operational relationships."""
import json
import csv
import io
import re
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import StreamingResponse
import security_runtime
from pydantic import BaseModel, ConfigDict, Field, field_validator
import review_occurrences
import assignment_eligibility
import create_requests
import authorization
import shared_review_plans
import guided_assessment
from framework_catalog import CATALOGS, CIS, FRAMEWORKS, ROOT as CATALOG_ROOT, capabilities, definition_for, assessment_title, active_definitions
from csf_profile import CsfProfile
from soc_readiness import SocConfiguration, ManagementControl, configuration as soc_configuration
from cis_scope import CisConfiguration, validate_settings
from framework_catalog import client_configuration, active_plans
import create_requests

ROOT=Path(__file__).parents[1]/'frontend/src/lib'
CIS_CRITERIA=json.loads((CATALOG_ROOT/'operatorGuidance/cisAssessmentCriteria.json').read_text(encoding='utf-8'))['requirements']
SOC_GUIDANCE=json.loads((CATALOG_ROOT/'operatorGuidance/socAssessmentGuidance.json').read_text(encoding='utf-8'))['criteria']
ISO_CRITERIA=json.loads((CATALOG_ROOT/'operatorGuidance/isoAssessmentCriteria.json').read_text(encoding='utf-8'))['requirements']
STATUSES=('not_assessed','in_progress','addressed','needs_attention','not_applicable')
CADENCES=('monthly','quarterly','semiannual','annual','custom')

def stable(cid,kind,key,framework='cis-ig1'):
    # Retain the original CIS namespace and IDs, including stored occurrence links.
    version=CATALOGS[framework]['version']
    return 'fw_'+uuid.uuid5(uuid.NAMESPACE_URL,f'{cid}:{framework}:{version}:{kind}:{key}').hex

def validate_configuration(state):
    try: validate_settings(state.get('framework_settings', {}))
    except ValueError as error: raise HTTPException(422, str(error)) from error
    configs=state.get('framework_reviews',{})
    if not isinstance(configs,dict) or set(configs)-{p['key'] for c in CATALOGS.values() for p in c['review_plans']}:
        raise HTTPException(422,'Invalid framework Review configuration')
    for config in configs.values():
        if not isinstance(config,dict) or set(config)-{'enabled','recurrence','custom_recurrence_days','due_date'}:
            raise HTTPException(422,'Invalid framework Review fields')
        if 'enabled' in config and type(config['enabled']) is not bool: raise HTTPException(422,'Invalid Review selection')
        if config.get('recurrence','annual') not in CADENCES: raise HTTPException(422,'Invalid client cadence')
        if config.get('recurrence')=='custom' and (type(config.get('custom_recurrence_days')) is not int or not 1<=config['custom_recurrence_days']<=3650): raise HTTPException(422,'Custom cadence must be 1–3650 days')
        if config.get('due_date') and not review_occurrences.scheduled_date(config['due_date']): raise HTTPException(422,'Invalid Review date')

async def reconcile(s,cid,state,user,*,cis_active_configuration=None):
    """Explicit activation only. Absent keys are untouched (single-program Settings edits)."""
    for key,catalog in CATALOGS.items():
        if key not in state.get('requirements',{}):
            continue
        if state['requirements'][key]!='applies':
            rows=await s.db.reviews.find({'client_id':cid,'$or':[{'framework_key':key},{'framework_drivers.framework_key':key}]},{'_id':0}).to_list(None)
            for row in rows:
                drivers=[{**d,'framework_driver_active':False} if d['framework_key']==key else d for d in shared_review_plans.drivers(row)]
                await save_drivers(s,row,drivers)
            continue
        await reconcile_catalog(s,cid,state,user,key,catalog,cis_active_configuration=cis_active_configuration if key=='cis-ig1' else None)


async def save_drivers(s,row,drivers):
    """Only current provenance changes; completed occurrences keep their snapshot."""
    drivers=sorted(drivers,key=lambda d:d['framework_plan_key'])
    if row.get('framework_drivers')==drivers:return
    # The legacy scalar describes the original framework, not the whole driver set.
    primary=next((d for d in drivers if d['framework_plan_key']==row.get('framework_plan_key')),None)
    updates={'framework_drivers':drivers,'framework_driver_active':primary['framework_driver_active'] if primary else row.get('framework_driver_active',True),
             'updated_at':s._next_write_time(row.get('updated_at'))}
    changed=await s.db.reviews.update_one({'client_id':row['client_id'],'review_id':row['review_id'],
        'framework_drivers':row.get('framework_drivers'),'updated_at':row.get('updated_at')},{'$set':updates})
    if not changed.matched_count:raise HTTPException(409,'Review drivers changed; reload configuration before retrying')


async def add_driver(s,cid,rid,key,plan,active=True):
    row=await s.db.reviews.find_one({'client_id':cid,'review_id':rid},{'_id':0})
    drivers=shared_review_plans.drivers(row)
    updated=shared_review_plans.driver(key,plan,active)
    drivers=[d for d in drivers if d['framework_plan_key']!=plan['key']]+[updated]
    await save_drivers(s,row,drivers)


async def reconcile_catalog(s,cid,state,user,key,catalog,*,cis_active_configuration=None):
    client=await s.db.clients.find_one({'client_id':cid},{'_id':0,'framework_settings':1})
    configuration=client_configuration(key,client,state)
    definitions=active_definitions(key,configuration)
    # Shared schedule proposals use current settings, not the immutable intake baseline.
    state={**state,'framework_settings':{**(client or {}).get('framework_settings',{}),**state.get('framework_settings',{})}}
    for definition in definitions:
        aid=stable(cid,'assessment',definition['id'],key)
        await s.db.framework_assessments.update_one({'_id':aid},{'$setOnInsert':{
            'framework_assessment_id':aid,'client_id':cid,'framework_key':key,'definition_id':definition['id'],
            'framework_version':catalog['version'],'status':'not_assessed','implementation':'','technology':'','notes':'','na_rationale':'',
            'owner_id':None,'process_owner_id':None,'created_at':s._now(),'related_links':[],'assessment_history':[]}},upsert=True)
    plans=active_plans(key,configuration)
    # A scope proposal may initialize retained records, but its current drivers
    # must not exceed either side of the transition before scope is published.
    published_plans={p['key']:p for p in active_plans(key,cis_active_configuration if cis_active_configuration is not None else configuration)}
    if key=='cis-ig1':
        active_keys=set(published_plans)
        retained=await s.db.reviews.find({'client_id':cid,'$or':[{'framework_key':key},{'framework_drivers.framework_key':key}]},{'_id':0}).to_list(None)
        for row in retained:
            await save_drivers(s,row,[{**d,'framework_driver_active':False} if d['framework_key']==key and d['framework_plan_key'] not in active_keys else d for d in shared_review_plans.drivers(row)])
    for plan in plans:
        try:config=shared_review_plans.shared_config(state,plan)
        except ValueError as error:raise HTTPException(422,str(error)) from error
        old=await s.db.reviews.find_one({'client_id':cid,'framework_plan_key':plan['key']},{'_id':0})
        if not old and plan.get('baseline_key'):
            equivalent=[p['key'] for c in CATALOGS.values() for p in c['review_plans'] if p.get('baseline_key')==plan['baseline_key']]
            old=await s.db.reviews.find_one({'client_id':cid,'$or':[{'baseline_key':plan['baseline_key']},{'framework_plan_key':{'$in':equivalent}}]},{'_id':0})
        if old and plan.get('default_enabled') is False and plan['key'] not in state.get('framework_reviews', {}):
            config['enabled'] = True
        if not config['enabled']:
            if old:await add_driver(s,cid,old['review_id'],key,plan,False)
            continue
        published_plan=published_plans.get(plan['key'],{**plan,'safeguards':[]})
        driver_active=plan['key'] in published_plans
        mapping={'framework_key':key,'framework_version':catalog['version'],'framework_plan_key':plan['key'],'framework_driver_active':driver_active,
                 'framework_safeguards':published_plan['safeguards'],'framework_basis':plan['basis'],'framework_source_cadence':plan['source_cadence'],
                 'framework_default_cadence':plan['default_cadence']}
        mapping.update({'framework_'+field:plan[field] for field in ('purpose','evidence_expectations','completion_criteria') if field in plan})
        if old:
            rid=old['review_id']
            # Never replace another framework's provenance or operational history.
            if old.get('framework_key') in (None,key):
                await s.db.reviews.update_one({'review_id':rid,'client_id':cid},{'$set':mapping})
        else:
            # Equivalent plans use the same insertion key even during concurrent activation.
            canonical=next(((other_key,p) for other_key,c in CATALOGS.items() for p in c['review_plans'] if plan.get('baseline_key') and p.get('baseline_key')==plan['baseline_key']), (key,plan))
            rid=stable(cid,'review',canonical[1]['key'],canonical[0])
            row={'review_id':rid,'client_id':cid,'title':plan['title'],'review_type':plan['review_type'],'status':'needs_scheduling',
                 'due_date':config.get('due_date') or None,'recurrence':config['recurrence'],'custom_recurrence_days':config.get('custom_recurrence_days'),
                 'owner_id':None,'created_at':s._now(),'created_by':user['user_id'],**mapping}
            row.update(review_occurrences.schedule(row));row['current_occurrence_id']=review_occurrences.occurrence_id(row)
            await s.db.reviews.update_one({'_id':rid},{'$setOnInsert':row},upsert=True)
        await add_driver(s,cid,rid,key,published_plan,driver_active)
        await s.db.framework_assessments.update_many(
            {'client_id':cid,'framework_key':key,'definition_id':{'$in':plan['safeguards']}},
            {'$addToSet':{'related_links':{'kind':'reviews','id':rid}}})

class CisOperation(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    provider: str=Field(default='',max_length=2000)
    confirmed: bool=False

class AssessmentPatch(BaseModel):
    model_config=ConfigDict(extra='forbid')
    expected_last_assessed: Optional[str]=Field(default=None,max_length=100)
    record_assessment: bool=False
    status: Optional[Literal['not_assessed','in_progress','addressed','needs_attention','not_applicable']]=None
    implementation: Optional[str]=Field(default=None,max_length=20000)
    guided_assessment_source: Optional[guided_assessment.GuidedSource]=None
    technology: Optional[str]=Field(default=None,max_length=4000)
    notes: Optional[str]=Field(default=None,max_length=20000)
    na_rationale: Optional[str]=Field(default=None,max_length=4000)
    owner_id: Optional[str]=None
    process_owner_id: Optional[str]=None
    cis_operation: CisOperation = Field(default_factory=CisOperation)
    addressable_decision: Optional[Literal['','as_written','equivalent_alternative','not_reasonable_appropriate']]=None
    addressable_rationale: Optional[str]=Field(default=None,max_length=4000)
    soa_applicability: Optional[Literal['','included','excluded']]=None
    soa_justification: Optional[str]=Field(default=None,max_length=4000)
    csf_profile: CsfProfile = Field(default_factory=CsfProfile)
    management_controls: list[ManagementControl]=Field(default_factory=list,max_length=30)
    verification: Optional[Literal['not_verified','needs_validation','gap_identified','verified']]=None
    verification_checklist: Optional[dict[Literal['foundation','operational','mature'],list[str]]]=None
    cis_assessment_criteria: list[str]=Field(default_factory=list,max_length=20)
    soc_assessment_checks: list[str]=Field(default_factory=list,max_length=30)
    iso_assessment_checks: list[str]=Field(default_factory=list,max_length=30)

    @field_validator('verification_checklist')
    @classmethod
    def _checklist_shape(cls,value):
        if value is None:return value
        out={}
        for tier,ids in value.items():
            if len(ids)>20:raise ValueError('Each verification tier allows at most 20 checks')
            for check in ids:
                if len(check)>32 or not VERIFICATION_CHECK.fullmatch(check) or check.split('-')[1][0]!=tier[0]:
                    raise ValueError('Invalid verification check identifier')
            out[tier]=list(dict.fromkeys(ids))
        return out

VERIFICATION_FIELDS=('verification','verification_checklist','cis_assessment_criteria')
VERIFICATION_CHECK=re.compile(r'^[0-9]+\.[0-9]+-[fom][0-9]{1,2}$')

class LinkInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    kind: Literal['reviews','findings','tasks','risks','policies','evidence','requirements','vendors']
    id: str=Field(min_length=1,max_length=160)

class ReviewSetup(BaseModel):
    model_config=ConfigDict(extra='forbid')
    plan_key: Optional[str]=Field(default=None,max_length=160)
    review_id: Optional[str]=Field(default=None,max_length=160)
    title: str=Field(default='',max_length=500)
    owner_id: Optional[str]=None
    recurrence: Literal['monthly','quarterly','semiannual','annual','custom']='quarterly'
    custom_recurrence_days: Optional[int]=Field(default=None,ge=1,le=3650)
    due_date: Optional[str]=Field(default=None,max_length=10)

async def explicit_finding_scopes(s,cid):
    rows=await s.db.framework_assessments.find({'client_id':cid},{'_id':0,'framework_assessment_id':1,'related_links':1}).to_list(None)
    scopes={}
    for a in rows:
        for link in a.get('related_links',[]):
            if link['kind']=='findings':scopes.setdefault(link['id'],set()).add(a['framework_assessment_id'])
    return scopes

def finding_applies(row,f,rids,scopes):
    explicit=set(scopes.get(f['finding_id'],set()))
    if f.get('framework_assessment_id'):explicit.add(f['framework_assessment_id'])
    return row['framework_assessment_id'] in explicit if explicit else f.get('review_id') in rids

async def workspace_work(s,cid,rows,*,upgraded=False):
    """Tenant-scoped scalar reads, no occurrence/evidence/history payloads or per-row queries."""
    if not rows:return {}
    projection={'_id':0,'client_id':1,'review_id':1,'finding_id':1,'task_id':1,'framework_assessment_id':1,'framework_key':1,'framework_safeguards':1,'status':1,'due_date':1}
    if upgraded:
        projection.update({field:1 for field in ('title','severity','priority','owner_id','assignee_id','reviewer_id')})
    async def read(cursor,what):
        # Existing bounded-list contract refuses overflow; partial counts must not look complete.
        return await s._bounded(cursor,10000,what) if upgraded else await cursor.to_list(None)
    reviews=await read(s.db.reviews.find({'client_id':cid},projection),'workspace reviews')
    findings=await read(s.db.findings.find({'client_id':cid},projection),'workspace findings')
    if upgraded:
        scope_rows=await read(s.db.framework_assessments.find({'client_id':cid},{'_id':0,'framework_assessment_id':1,'related_links':1}),'workspace finding scopes')
        scopes={}
        for assessment in scope_rows:
            for link in assessment.get('related_links',[]):
                if link['kind']=='findings':scopes.setdefault(link['id'],set()).add(assessment['framework_assessment_id'])
    else:
        scopes=await explicit_finding_scopes(s,cid)
    tasks=await read(s.db.tasks.find({'client_id':cid,'status':{'$nin':['done','cancelled']}},projection),'workspace actions')
    # Evidence dates indicate support age only; upload/update is not verification.
    # Deleted (archived) Evidence is not current support.
    evidence=await read(s.db.evidence.find({'client_id':cid,'archived_at':None},{'_id':0,'evidence_id':1,'linked_type':1,'linked_id':1,'evidence_date':1,'created_at':1}),'workspace evidence')
    today=datetime.now(timezone.utc).date().isoformat()
    result={}
    for row in rows:
        links=row.get('related_links') or [];aid=row['framework_assessment_id']
        def linked(kind,ident):return {'kind':kind,'id':ident} in links
        rs=[r for r in reviews if linked('reviews',r['review_id']) or (r.get('framework_key')==row['framework_key'] and row['definition_id'] in r.get('framework_safeguards',[]))]
        rids={r['review_id'] for r in rs}
        relevant={f['finding_id'] for f in findings if finding_applies(row,f,rids,scopes)}
        fs=[f for f in findings if f['finding_id'] in relevant and f.get('status') not in ('closed','accepted')]
        fids={f['finding_id'] for f in fs}
        def overdue(r):return bool(r.get('due_date')) and r['due_date'][:10]<today
        ts=[t for t in tasks if linked('tasks',t['task_id']) or t.get('framework_assessment_id')==aid or
            (t.get('finding_id') in relevant if t.get('finding_id') else not t.get('framework_assessment_id') and t.get('review_id') in rids)]
        unlinked=set(row.get('unlinked_evidence_ids') or [])
        # Evidence the operator unlinked from this assessment no longer supports it.
        es=[e for e in evidence if e['evidence_id'] not in unlinked and (linked('evidence',e['evidence_id']) or (e.get('linked_type') in ('framework_assessment','framework_assessments') and e.get('linked_id')==aid))]
        dates=sorted(str(e.get('evidence_date') or e.get('created_at') or '')[:10] for e in es if e.get('evidence_date') or e.get('created_at'))
        direct=[f for f in fs if linked('findings',f['finding_id']) or f.get('framework_assessment_id')==aid]
        result[aid]={'review_ids':sorted(rids),'finding_ids':sorted(fids),'open_findings':len(fs),'direct_findings':len(direct),
          'overdue_reviews':sum(overdue(r) for r in rs if r.get('status') not in ('completed','cancelled')),
          'next_review_due':min((r['due_date'][:10] for r in rs if r.get('status') not in ('completed','cancelled') and r.get('due_date') and r['due_date'][:10]>=today),default=None),
          'overdue_actions':sum(overdue(t) for t in ts),'open_actions':len(ts),
          'evidence_count':len(es),'latest_evidence_at':dates[-1] if dates else None}
        if upgraded:
            def priority_record(kind,record,id_field,fields,open_gap=False):
                return {'kind':kind,'id':record[id_field],id_field:record[id_field],
                    **{field:record.get(field) for field in ('title','status','due_date',*fields)},'open_gap':open_gap}
            result[aid].update({'task_ids':sorted({t['task_id'] for t in ts}),'context_complete':True,
                'priority_records':[
                    *[priority_record('reviews',r,'review_id',('owner_id','reviewer_id')) for r in rs if r.get('status') not in ('completed','cancelled')],
                    *[priority_record('findings',f,'finding_id',('severity','owner_id'),True) for f in fs],
                    *[priority_record('tasks',t,'task_id',('priority','assignee_id','owner_id'),t.get('finding_id') in fids) for t in ts]]})
    return result

class FindingInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    title:str=Field(min_length=1,max_length=500)
    remediation_title:str=Field(min_length=1,max_length=500)
    description:str=Field(default='',max_length=20000)
    severity:Literal['low','medium','high','critical']='medium'
    request_id:str=Field(min_length=1,max_length=128)
    # Optional at creation; omitted, the Finding inherits the safeguard owner and has no target date.
    owner_id:Optional[str]=Field(default=None,max_length=200)
    due_date:Optional[str]=Field(default=None,max_length=40)

async def related(s,row):
    cid,aid,did=row['client_id'],row['framework_assessment_id'],row['definition_id']
    out={}
    for kind,key in {'reviews':'review_id','findings':'finding_id','tasks':'task_id','risks':'risk_id','policies':'policy_id','requirements':'requirement_id','evidence':'evidence_id','vendors':'vendor_id'}.items():
        links=[l['id'] for l in row.get('related_links',[]) if l['kind']==kind]
        clauses=[{key:{'$in':links}},{'framework_assessment_id':aid}]
        if kind=='reviews':clauses.append({'framework_key':row['framework_key'],'framework_safeguards':did})
        if kind=='policies':clauses.append({'baseline_key':{'$in':[p['policy_key'] for p in CATALOGS.get(row['framework_key'],{}).get('policy_mappings',[]) if did in p['safeguards']]}})
        if kind=='evidence':clauses.append({'linked_type':{'$in':['framework_assessment','framework_assessments']},'linked_id':aid})
        out[kind]=await s.db[kind].find({'client_id':cid,'$or':clauses},{'_id':0,'content_base64':0}).to_list(None)
    rids=[r['review_id'] for r in out['reviews']]
    findings=await s.db.findings.find({'client_id':cid,'review_id':{'$in':rids}},{'_id':0}).to_list(None)
    scopes=await explicit_finding_scopes(s,cid)
    findings=[f for f in findings if finding_applies(row,f,rids,scopes)]
    out['findings']=list({r['finding_id']:r for r in out['findings']+findings}.values())
    tasks=await s.db.tasks.find({'client_id':cid,'$or':[{'finding_id':{'$in':[f['finding_id'] for f in out['findings']]}},{'review_id':{'$in':rids}}]},{'_id':0}).to_list(None)
    tasks=[t for t in tasks if t.get('framework_assessment_id')==aid or
        (t.get('finding_id') in {f['finding_id'] for f in out['findings']} if t.get('finding_id') else not t.get('framework_assessment_id'))]
    out['tasks']=list({r['task_id']:r for r in out['tasks']+tasks}.values())
    review_evidence_query={'client_id':cid,'linked_type':{'$in':['review','reviews']},'linked_id':{'$in':rids}}
    if row['framework_key']=='cis-ig1':
        review_evidence_query={'client_id':cid,'$or':[{'linked_type':{'$in':['review','reviews']},'linked_id':{'$in':rids}},
            {'relationships':{'$elemMatch':{'kind':'reviews','id':{'$in':rids}}}}]}
    review_evidence=await s.db.evidence.find(review_evidence_query,{'_id':0,'content_base64':0}).to_list(None)
    out['evidence']=list({e['evidence_id']:e for e in out['evidence']+review_evidence}.values())
    excluded=set(row.get('unlinked_evidence_ids',[]))
    out['evidence']=[e for e in out['evidence'] if e['evidence_id'] not in excluded and not e.get('archived_at')]
    return out

def router_for(s):
    router=APIRouter(prefix='/api',tags=['framework-assessments'])
    async def scoped(cid,user):
        if not s._can_access_client(user,cid):raise HTTPException(403,'Forbidden')
        client=await s.db.clients.find_one({'client_id':cid},{'_id':0})
        if not client:raise HTTPException(404,'Client not found')
        return client
    async def parent(aid,user,write=False):
        return await s._authorized_parent('framework_assessments',aid,user,write)
    @router.get('/framework_assessments/{aid}/guided-assessment')
    async def get_guided(aid:str,user=Depends(s.get_current_user)):
        row=await parent(aid,user)
        client=await scoped(row['client_id'],user)
        guided_assessment.check_scope(row,client)
        return await guided_assessment.read_draft(s,row,user,client,upgraded=guided_assessment.upgraded_pilot(row,user))
    @router.get('/framework_assessments/{aid}/guided-assessment/history')
    async def get_guided_history(aid:str,limit:int=Query(25,ge=1,le=100),before_revision:Optional[int]=Query(None,ge=1),user=Depends(s.get_current_user)):
        row=await parent(aid,user)
        guided_assessment.check_scope(row,await scoped(row['client_id'],user))
        if not guided_assessment.upgraded_pilot(row,user):
            raise HTTPException(404,'Interview history is not available for this pilot')
        return await guided_assessment.read_history(s,row,user,limit,before_revision)
    @router.put('/framework_assessments/{aid}/guided-assessment')
    async def put_guided(aid:str,body:guided_assessment.InterviewWrite,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True)
        client=await scoped(row['client_id'],user)
        guided_assessment.check_scope(row,client)
        return await guided_assessment.save_draft(s,row,user,body,client,upgraded=guided_assessment.upgraded_pilot(row,user))
    async def target_record(kind,record_id,user):
        if kind!='evidence':return await s._authorized_parent(kind,record_id,user)
        # Evidence has separate routes, not the operational parent-record registry.
        target=await s.db.evidence.find_one({'evidence_id':record_id},{'_id':0,'content_base64':0})
        if not target:raise HTTPException(404,'Evidence not found')
        if not s._can_access_client(user,target['client_id']):raise HTTPException(403,'Forbidden')
        return target
    @router.get('/frameworks/summary')
    async def summary(client_id:str, program:Optional[str]=None, detail:Optional[str]=None,
                      offset:int=Query(0,ge=0), limit:int=Query(25,ge=1,le=100), user=Depends(s.get_current_user)):
        import framework_summary
        await scoped(client_id,user)
        client=await s.db.clients.find_one({'client_id':client_id},{'_id':0,'client_id':1,'onboarding_baseline.completed':1})
        return await framework_summary.read(s,client,(program,detail) if detail else None,offset,limit)
    @router.get('/frameworks/{key}')
    async def workspace(key:str,client_id:str,user=Depends(s.get_current_user)):
        client=await scoped(client_id,user)
        framework=next((f for f in FRAMEWORKS if f['key']==key),None)
        if not framework:raise HTTPException(404,'Framework not found')
        program=await s.db.requirements.find_one({'client_id':client_id,'baseline_key':key,'baseline_response':'applies'})
        rows=await s.db.framework_assessments.find({'client_id':client_id,'framework_key':key},{'_id':0}).to_list(None) if framework['implemented'] else []
        catalog=CATALOGS.get(key,{})
        config=client_configuration(key,client)
        retained={a['definition_id'] for a in rows}
        controls = await s.db.organizational_controls.find({'client_id':client_id},{'_id':0,'control_id':1,'legacy_id':1,'assessment_ids':1,'design':1,'conflicts':1,'observations.operating':1,'observations.expected_instances':1,'observations.collected_instances':1}).to_list(None) if key=='soc-2' else []
        upgraded=key=='cis-ig1' and guided_assessment.upgraded_pilot({'client_id':client_id,'framework_key':key},user)
        guided_drafts = {}
        if key == 'cis-ig1' and config.get('guided_assessment_enabled') is not False:
            identities = {a['framework_assessment_id'] + ':' + user['user_id']: a['definition_id'] for a in rows
                if config['implementation_group'] in guided_assessment.CATALOG['definitions'].get(a['definition_id'], {}).get('groups', [])}
            projection={'_id': 1, 'revision': 1, 'completed': 1}
            if upgraded:
                projection.update(version=1,generated_at=1,user_id=1)
            drafts = await s.db.guided_assessment_pilot.find({'client_id': client_id, '_id': {'$in': list(identities)}},projection).to_list(153)
            guided_drafts = {identities[d['_id']]: {'revision': d['revision'], 'completed': d['completed']} for d in drafts}
            if upgraded:
                for draft in drafts:
                    guided_drafts[identities[draft['_id']]].update({field:draft.get(field) for field in ('version','generated_at','user_id')})
        return {'framework':framework,'selected':bool(program),'configured':bool(rows),'organizational_controls':controls,
                'definitions':[d for d in catalog.get('requirements',[]) if d['id'] in retained],
                'assessments':rows,'configuration':config,'work':await workspace_work(s,client_id,rows,upgraded=upgraded),'guided_assessment_drafts':guided_drafts,
                'active_definition_ids':[d['id'] for d in active_definitions(key,config)]}
    @router.patch('/frameworks/cis-ig1/configuration')
    @s.configuration_mutation
    async def configure_cis(body:CisConfiguration,user=Depends(s.get_current_user),idempotency_key:Optional[str]=Header(default=None,alias='Idempotency-Key')):
        client=await scoped(body.client_id,user)
        if not client.get('onboarding_baseline',{}).get('completed'):
            raise HTTPException(409,'Complete onboarding before adjusting program configuration')
        if not await s.db.requirements.find_one({'client_id':body.client_id,'baseline_key':'cis-ig1','baseline_response':'applies'}):
            raise HTTPException(409,'Select CIS Applies before configuring its scope')
        async def execute(identity):
            current=await scoped(body.client_id,user)
            receipt=await s.db.create_requests.find_one({'_id':identity})
            intent=receipt.get('cis_scope_intent')
            if not intent:
                s._require_snapshot(body.model_dump(exclude_unset=True),{'updated_at':current.get('cis_configuration_updated_at')})
                before=client_configuration('cis-ig1',current)['implementation_group']
                if body.implementation_group<before and (not body.confirm_reduction or not body.reason or not body.effective_date):
                    raise HTTPException(422,'Scope reduction requires impact confirmation, reason and effective date; assessments, links and open work are retained')
                intent={'before':before,'after':body.implementation_group,'previous_updated_at':current.get('cis_configuration_updated_at'),
                    'updated_at':s._next_write_time(current.get('cis_configuration_updated_at')),'reason':body.reason,
                    'effective_date':body.effective_date or datetime.now(timezone.utc).date().isoformat(),'changed_by':user['user_id']}
                await s.db.create_requests.update_one({'_id':identity},{'$set':{'cis_scope_intent':intent}})
            if current.get('cis_configuration_updated_at') not in (intent['previous_updated_at'],intent['updated_at']):
                raise HTTPException(409,'CIS scope changed during recovery; reload before starting a new change')
            # Reconcile the proposal first. A partial failure leaves the old active scope
            # intact; deterministic IDs and the receipt resume the same proposal safely.
            state={**current['onboarding_baseline'],'requirements':{'cis-ig1':'applies'},'framework_settings':{'cis-ig1':{'implementation_group':intent['after']}}}
            await reconcile(s,body.client_id,state,user,cis_active_configuration={'implementation_group':min(intent['before'],intent['after'])})
            changed=await s.db.clients.update_one({'client_id':body.client_id,'cis_configuration_updated_at':current.get('cis_configuration_updated_at')},
                {'$set':{'framework_settings.cis-ig1':{'implementation_group':intent['after']},'cis_configuration_updated_at':intent['updated_at'],'cis_scope_change':intent}})
            if not changed.matched_count:raise HTTPException(409,'CIS scope changed; reload configuration')
            await reconcile(s,body.client_id,state,user)
            await s.audit(user,'CIS scope updated','client',body.client_id,body.client_id,meta=intent)
            return {'implementation_group':intent['after'],'expected_updated_at':intent['updated_at']}
        return await create_requests.run(s.db,idempotency_key,user['user_id'],body.client_id,'/frameworks/cis-ig1/configuration',body.model_dump(exclude_unset=True),execute)
    @router.get('/frameworks/cis-ig1/export')
    async def export_cis(client_id:str,include_retained:bool=False,user=Depends(s.get_current_user)):
        client=await scoped(client_id,user)
        configuration=client_configuration('cis-ig1',client)
        active={d['id'] for d in active_definitions('cis-ig1',configuration)}
        rows=await s._bounded(s.db.framework_assessments.find({'client_id':client_id,'framework_key':'cis-ig1'},{'_id':0}),10000,'assessments')
        fields=['framework_assessment_id','definition_id','title','scope_group','in_active_scope','client_implementation_group','status','verification','implementation','owner_id','process_owner_id','last_assessed','notes','related_links']
        output=io.StringIO();writer=csv.DictWriter(output,fieldnames=fields);writer.writeheader()
        for row in sorted(rows,key=lambda r:tuple(map(int,r['definition_id'].split('.')))):
            if not include_retained and row['definition_id'] not in active:continue
            d=definition_for('cis-ig1',row['definition_id'])
            values={**row,'title':d.get('title',row['definition_id']),'scope_group':f"Added in IG{d['implementation_group']}" if d.get('implementation_group',1)>1 else 'IG1 baseline',
                'in_active_scope':row['definition_id'] in active,'client_implementation_group':configuration['implementation_group'],'verification':row.get('verification') or 'not_verified'}
            writer.writerow({field:security_runtime.csv_cell(json.dumps(values[field],ensure_ascii=False) if isinstance(values.get(field),(dict,list)) else values.get(field,'')) for field in fields})
        await s.audit(user,'CIS assessment export','client',client_id,client_id,meta={'implementation_group':configuration['implementation_group'],'include_retained':include_retained})
        return StreamingResponse(iter([output.getvalue()]),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename="cis-assessments.csv"'})
    @router.patch('/frameworks/soc-2/configuration')
    @s.configuration_mutation
    async def configure_soc(body:SocConfiguration,user=Depends(s.get_current_user)):
        client=await scoped(body.client_id,user)
        if not s._writable(user):raise HTTPException(403,'Read-only role')
        if not client.get('onboarding_baseline',{}).get('completed'):
            raise HTTPException(409,'Complete onboarding before adjusting program configuration')
        if not await s.db.requirements.find_one({'client_id':body.client_id,'baseline_key':'soc-2','baseline_response':'applies'}):
            raise HTTPException(409,'Select SOC 2 Applies before configuring its scope')
        s._require_snapshot(body.model_dump(exclude_unset=True),{'updated_at':client.get('soc_configuration_updated_at')})
        config=body.model_dump(exclude={'client_id','expected_updated_at'})
        at=s._next_write_time(client.get('soc_configuration_updated_at'))
        await s.db.clients.update_one({'client_id':body.client_id},{'$set':{'framework_settings.soc-2':config,'soc_configuration_updated_at':at}})
        await reconcile(s,body.client_id,{**client['onboarding_baseline'],'requirements':{'soc-2':'applies'}},user)
        await s.audit(user,'SOC 2 readiness scope updated','client',body.client_id,body.client_id,
                      meta={'categories':config['categories'],'period_start':config['period_start'],'period_end':config['period_end']})
        return {**config,'expected_updated_at':at}
    @router.post('/framework_assessments/{aid}/reviews')
    async def setup_review(aid:str,body:ReviewSetup,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True);cid=row['client_id'];key=row['framework_key'];catalog=CATALOGS[key]
        if not await s.db.requirements.find_one({'client_id':cid,'baseline_key':key,'baseline_response':'applies'}):raise HTTPException(409,'Activate the program before configuring Reviews')
        client=await scoped(cid,user)
        scope=client_configuration(key,client)
        if row['definition_id'] not in {d['id'] for d in active_definitions(key,scope)}:
            raise HTTPException(409,'This assessment is retained outside the active program scope; existing work and history remain available')
        plan=next((p for p in active_plans(key,scope) if p['key']==body.plan_key and row['definition_id'] in p['safeguards']),None)
        if body.plan_key and not plan:raise HTTPException(422,'Review plan does not map to this requirement')
        old=None
        if body.review_id:
            old=await target_record('reviews',body.review_id,user)
            if old['client_id']!=cid:raise HTTPException(422,'Relationship must belong to this client')
        elif plan:
            equivalent=[p['key'] for c in CATALOGS.values() for p in c['review_plans'] if plan.get('baseline_key') and p.get('baseline_key')==plan['baseline_key']]
            clauses=[{'framework_plan_key':plan['key']}]
            if plan.get('baseline_key'):clauses.extend([{'baseline_key':plan['baseline_key']},{'framework_plan_key':{'$in':equivalent}}])
            old=await s.db.reviews.find_one({'client_id':cid,'$or':clauses},{'_id':0})
        canonical=next(((k,p) for k,c in CATALOGS.items() for p in c['review_plans'] if plan and plan.get('baseline_key') and p.get('baseline_key')==plan['baseline_key']), (key,plan))
        rid=old['review_id'] if old else stable(cid,'review',canonical[1]['key'] if plan else 'requirement:'+row['definition_id'],canonical[0])
        if not old:
            old=await s.db.reviews.find_one({'review_id':rid,'client_id':cid},{'_id':0})
        if not old:
            if not body.title.strip():raise HTTPException(422,'Review title is required')
            if body.due_date and not review_occurrences.scheduled_date(body.due_date):raise HTTPException(422,'Invalid Review date')
            if body.recurrence=='custom' and not body.custom_recurrence_days:raise HTTPException(422,'Custom interval is required')
            draft=s.ReviewIn(client_id=cid,title=body.title.strip(),review_type=plan['review_type'] if plan else 'requirements',owner_id=body.owner_id,recurrence=body.recurrence,custom_recurrence_days=body.custom_recurrence_days,due_date=body.due_date or None,status='upcoming' if body.due_date else 'needs_scheduling').model_dump()
            await assignment_eligibility.validate(s.db,'reviews',draft,s._can_access_client)
            draft.update(review_id=rid,created_at=s._now(),created_by=user['user_id'],framework_key=key,framework_safeguards=plan['safeguards'] if plan else [row['definition_id']])
            if plan:draft.update(framework_plan_key=plan['key'],baseline_key=plan.get('baseline_key'),framework_basis=plan['basis'],framework_source_cadence=plan['source_cadence'])
            draft.update(review_occurrences.schedule(draft));draft['current_occurrence_id']=review_occurrences.occurrence_id(draft)
            inserted=await s.db.reviews.update_one({'_id':rid},{'$setOnInsert':draft},upsert=True)
            if inserted.upserted_id:await s.audit(user,'create','reviews',rid,cid,meta={'framework_assessment_id':aid})
        if plan:await add_driver(s,cid,rid,key,plan)
        mapped=plan['safeguards'] if plan else [row['definition_id']]
        linked=await s.db.framework_assessments.update_many({'client_id':cid,'framework_key':key,'definition_id':{'$in':mapped}},{'$addToSet':{'related_links':{'kind':'reviews','id':rid}}})
        if linked.modified_count:await s.audit(user,'Framework Review linked','framework_assessments',aid,cid,meta={'review_id':rid})
        return await s.db.reviews.find_one({'review_id':rid,'client_id':cid},{'_id':0})

    @router.patch('/framework_assessments/{aid}')
    async def update(aid:str,body:AssessmentPatch,user=Depends(s.get_current_user)):
        old=await parent(aid,user,True);changes=body.model_dump(exclude_unset=True)
        if 'guided_assessment_source' in changes:
            guided_assessment.check_scope(old,await scoped(old['client_id'],user))
            if changes['guided_assessment_source']:
                source_client=await scoped(old['client_id'],user)
                upgraded=guided_assessment.upgraded_pilot(old,user)
                draft=await guided_assessment.read_draft(s,old,user,source_client,upgraded=upgraded)
                source=changes['guided_assessment_source']
                if not draft['completed'] or source!={k:draft.get(k) for k in ('version','revision','generated_at')}:
                    raise HTTPException(409,'Guided result changed; regenerate before applying')
                if upgraded:
                    if draft['version'] != guided_assessment.current_version(old['definition_id'], upgraded=True):
                        raise HTTPException(409, 'Current-source interview review is required before saving a new assessment')
                    guided_assessment.require_current_lineage(draft,old,source_client)
                changes['guided_assessment_source']={**source,'origin':'guided-assessment-pilot','answers':draft['answers'],'by':user['user_id']}
                if upgraded:
                    changes['guided_assessment_source'].update({key:draft[key] for key in ('base_assessment_token','base_scope_fingerprint')})
        elif old.get('guided_assessment_source') and any(k in changes and changes[k]!=old.get(k) for k in ('implementation','status')):
            changes['guided_assessment_source']=None
        if 'cis_operation' in changes:
            changes['cis_operation']=body.cis_operation.model_dump()
        # The legacy expected_last_assessed field carries the latest write token.
        s._require_snapshot(changes,{'last_assessed':old.get('last_saved') or old.get('last_assessed')},'last_assessed')
        changes.pop('expected_last_assessed')
        record_assessment=changes.pop('record_assessment',False)
        ownership_only=bool(changes) and set(changes)<= {'owner_id','process_owner_id'} and not record_assessment
        if 'record_assessment' in body.model_fields_set and old['framework_key']!='soc-2':
            raise HTTPException(422,'Explicit assessment recording applies only to SOC 2')
        data={**old,**changes}
        if record_assessment and data['status']=='not_assessed':
            raise HTTPException(422,'Choose an assessment status before recording an assessment')
        supported=capabilities(old['framework_key'])
        if 'cis_operation' in changes:
            if 'cis_operation' not in supported:
                raise HTTPException(422,'Operating arrangements apply only to CIS IG1')
            if changes['cis_operation']['confirmed'] and (not (data.get('owner_id') or data.get('process_owner_id')) or not (data.get('implementation') or '').strip()):
                raise HTTPException(422,'Record an accountable person and operating method before confirming the arrangement')
        # A changed responsibility/method needs a new explicit setup confirmation.
        if any(k in changes and changes[k]!=old.get(k) for k in ('owner_id','process_owner_id','implementation')) and old.get('cis_operation') and 'cis_operation' not in changes:
            changes['cis_operation']={**old['cis_operation'],'confirmed':False}
            data.update(changes)
        if 'soc_assessment_checks' in changes:
            if 'soc_assessment_checks' not in supported:
                raise HTTPException(422,'SOC assessment guidance applies only to SOC 2')
            valid={c['id'] for c in SOC_GUIDANCE.get(old['definition_id'],{}).get('items',[])}
            if any(c not in valid for c in changes['soc_assessment_checks']):
                raise HTTPException(422,'Invalid SOC assessment guidance check')
            changes['soc_assessment_checks']=list(dict.fromkeys(changes['soc_assessment_checks']))
            data['soc_assessment_checks']=changes['soc_assessment_checks']
        if 'cis_assessment_criteria' in changes:
            if 'cis_assessment_criteria' not in supported:
                raise HTTPException(422,'CIS assessment criteria apply only to CIS Controls IG1')
            entry=CIS_CRITERIA.get(old['definition_id'],{})
            valid={c['id'] for c in entry.get('criteria',[])+entry.get('legacy_criteria',[])}
            if any(c not in valid for c in changes['cis_assessment_criteria']):
                raise HTTPException(422,'Invalid CIS assessment criterion')
            changes['cis_assessment_criteria']=list(dict.fromkeys(changes['cis_assessment_criteria']))
            data['cis_assessment_criteria']=changes['cis_assessment_criteria']
        if 'iso_assessment_checks' in changes:
            if old['framework_key']!='iso-27001':
                raise HTTPException(422,'ISO assessment checks apply only to ISO 27001')
            entry=ISO_CRITERIA.get(old['definition_id'],{})
            valid={c['id'] for c in entry.get('criteria',[]) if entry.get('coverage')=='verified'} | set(old.get('iso_assessment_checks',[]))
            if any(c not in valid for c in changes['iso_assessment_checks']):
                raise HTTPException(422,'Invalid ISO assessment check')
            changes['iso_assessment_checks']=list(dict.fromkeys(changes['iso_assessment_checks']))
            data['iso_assessment_checks']=changes['iso_assessment_checks']
        if 'csf_profile' in changes and 'csf_profile' not in supported:
            raise HTTPException(422,'CSF profile fields apply only to NIST CSF')
        verification_allowed='verification' in supported
        if 'verification' in changes and not verification_allowed:
            raise HTTPException(422,'Verification is available only for CIS Controls IG1 and SOC 2')
        if 'verification_checklist' in changes:
            if 'verification_checklist' not in supported:raise HTTPException(422,'Verification checklists apply only to CIS Controls IG1')
            if any(c.split('-')[0]!=old['definition_id'] for ids in (changes.get('verification_checklist') or {}).values() for c in ids):
                raise HTTPException(422,'Verification checks must belong to this safeguard')
        if 'management_controls' in changes:
            if 'management_controls' not in supported:raise HTTPException(422,'Management control readiness fields apply only to SOC 2')
            if changes['management_controls'] != old.get('management_controls', []) and (old.get('controls_migrated') or await s.db.organizational_controls.find_one({'client_id':old['client_id'],'$or':[{'assessment_ids':aid},{'legacy_sources.assessment_id':aid}]})):
                raise HTTPException(409,'Legacy descriptions are preserved. Edit the shared organizational Control instead')
            ids=[c['control_id'] for c in changes['management_controls']]
            if len(ids)!=len(set(ids)):raise HTTPException(422,'Management control identifiers must be unique')
        if data['status'] not in STATUSES or any(data.get(k) is None for k in ('implementation','technology','notes','na_rationale')):raise HTTPException(422,'Invalid assessment fields')
        definition=definition_for(old['framework_key'],old['definition_id'])
        if data['status']=='not_applicable' and definition.get('specification')!='annex_control' and not data['na_rationale'].strip():raise HTTPException(422,'N/A rationale is required')
        if data['status']=='addressed' and not data['implementation'].strip():raise HTTPException(422,'Describe implementation before marking Addressed')
        if definition.get('specification')=='isms_clause' and data['status']=='not_applicable':
            raise HTTPException(422,'ISMS clauses 4–10 cannot be excluded for conformity')
        if definition.get('specification')=='annex_control':
            applicability=data.get('soa_applicability') or ''
            if applicability and not (data.get('soa_justification') or '').strip():
                raise HTTPException(422,'Document the SoA inclusion or exclusion justification')
            # Applicability is a separate risk-treatment decision. Preserve any
            # existing implementation conclusion when inclusion/exclusion changes.
        elif changes.get('soa_applicability') or changes.get('soa_justification'):
            raise HTTPException(422,'SoA fields apply only to Annex A controls')
        if definition.get('specification')=='addressable':
            if data['status']=='not_applicable':raise HTTPException(422,'Addressable is not optional; record an addressability decision instead of N/A')
            if data['status']=='addressed' and (not data.get('addressable_decision') or not (data.get('addressable_rationale') or '').strip()):raise HTTPException(422,'Document the addressability decision and rationale before marking Addressed')
        elif changes.get('addressable_decision') or changes.get('addressable_rationale'):
            raise HTTPException(422,'Addressability fields apply only to addressable specifications')
        await assignment_eligibility.validate(s.db, 'framework_assessments', data, s._can_access_client, old)
        if data.get('process_owner_id') and not await s.db.contacts.find_one({'contact_id':data['process_owner_id'],'client_id':old['client_id']}):raise HTTPException(422,'Process owner must be a client Contact')
        changed=[k for k in changes if changes[k]!=old.get(k)]
        if changed or record_assessment:
            if changes.get('guided_assessment_source') and guided_assessment.upgraded_pilot(old,user):
                source_client=await scoped(old['client_id'],user)
                guided_assessment.check_scope(old,source_client)
                guided_assessment.require_current_lineage(draft,old,source_client)
            history_verification=set(VERIFICATION_FIELDS)&set(supported)
            at=s._next_write_time(old.get('last_saved') or old.get('last_assessed'))
            if old['framework_key']=='soc-2' and not ownership_only:
                # Keep last_assessed as the legacy write token; never infer a
                # judgment date from old narrative saves or rewrite old history.
                judgment=record_assessment or ('status' in changed and data['status']!='not_assessed')
                changes.update(last_saved=at,assessment_recorded_at=at if judgment else old.get('assessment_recorded_at'),
                               assessment_recorded_by=user['user_id'] if judgment else old.get('assessment_recorded_by'))
                data.update(changes)
            snapshot={k:data.get(k) for k in AssessmentPatch.model_fields if k not in ('expected_last_assessed','record_assessment') and (k not in ('cis_assessment_criteria','soc_assessment_checks','iso_assessment_checks','cis_operation','guided_assessment_source') or k in data) and (k not in VERIFICATION_FIELDS or k in history_verification)};snapshot.update(at=at,by=user['user_id'])
            if old['framework_key']=='soc-2':
                snapshot.update({k:data.get(k) for k in ('last_saved','assessment_recorded_at','assessment_recorded_by')})
            predicate={'framework_assessment_id':aid,'client_id':old['client_id'],'last_assessed':old.get('last_assessed'),'last_saved':old.get('last_saved')}
            if 'management_controls' in changed: predicate['controls_migrated']={'$ne':True}
            write={'$set':{**changes,'last_saved':at}}
            if not ownership_only:
                write['$set'].update(last_assessed=at,assessed_by=user['user_id'])
                write['$push']={'assessment_history':snapshot}
            result=await s.db.framework_assessments.update_one(predicate,write)
            if not result.matched_count:raise HTTPException(409,'Assessment changed since it was opened; reload before saving')
            await s.audit(user,'Framework assessment updated','framework_assessment',aid,old['client_id'],meta={'changed_fields':changed,'status':data['status']})
        return await parent(aid,user)
    @router.get('/framework_assessments/{aid}')
    async def get_assessment(aid:str,user=Depends(s.get_current_user)):
        return await parent(aid,user)
    @router.get('/framework_assessments/{aid}/related')
    async def get_related(aid:str,user=Depends(s.get_current_user)):
        return await related(s,await parent(aid,user))
    @router.post('/framework_assessments/{aid}/links')
    async def link(aid:str,body:LinkInput,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True);target=await target_record(body.kind,body.id,user)
        if target['client_id']!=row['client_id']:raise HTTPException(422,'Relationship must belong to this client')
        update={'$addToSet':{'related_links':body.model_dump()}}
        if body.kind=='evidence':update['$pull']={'unlinked_evidence_ids':body.id}
        await s.db.framework_assessments.update_one({'framework_assessment_id':aid,'client_id':row['client_id']},update)
        await s.audit(user,'Framework record linked','framework_assessment',aid,row['client_id'],meta=body.model_dump())
        return {'ok':True}
    @router.delete('/framework_assessments/{aid}/links')
    async def unlink(aid:str,body:LinkInput,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True)
        if body.kind!='evidence':raise HTTPException(422,'Only Evidence relationships can be unlinked here')
        target=await target_record('evidence',body.id,user)
        if target['client_id']!=row['client_id']:raise HTTPException(422,'Relationship must belong to this client')
        # Suppress this assessment's current link, not the artifact or original provenance.
        await s.db.framework_assessments.update_one({'framework_assessment_id':aid,'client_id':row['client_id']},
            {'$pull':{'related_links':body.model_dump()},'$addToSet':{'unlinked_evidence_ids':body.id}})
        await s.audit(user,'Framework Evidence unlinked','framework_assessment',aid,row['client_id'],meta=body.model_dump())
        return {'ok':True}
    @router.post('/framework_assessments/{aid}/findings')
    async def finding(aid:str,body:FindingInput,user=Depends(s.get_current_user)):
        row=await parent(aid,user,True)
        async def execute(identity):
            legacy=stable(row['client_id'],'finding',aid+':'+body.request_id)
            saved=await s.db.findings.find_one({'_id':'create:'+identity},{'_id':0})
            if not saved:
                saved=await s.db.findings.find_one({'finding_id':legacy,'client_id':row['client_id'],'created_by':user['user_id']},{'_id':0})
            if not saved:
                if not body.title.strip() or not body.remediation_title.strip():raise HTTPException(422,'Finding and Action titles are required')
                owner=row.get('owner_id')
                if owner and not await assignment_eligibility.eligible(s.db,owner,row['client_id'],s._can_access_client):owner=None
                if 'owner_id' in body.model_fields_set:
                    owner=body.owner_id or None
                    if owner and not await assignment_eligibility.eligible(s.db,owner,row['client_id'],s._can_access_client):
                        raise HTTPException(422,'Finding owner must be an active user with access to this client')
                due=None
                if body.due_date:
                    try:due=date.fromisoformat(body.due_date[:10]).isoformat()
                    except ValueError:raise HTTPException(422,'Enter a valid target date')
                fid=stable(row['client_id'],'finding',identity)
                doc={'finding_id':fid,'client_id':row['client_id'],'title':body.title.strip(),'description':body.description,'severity':body.severity,
                     'status':'open','framework_assessment_id':aid,'source':assessment_title(row),'owner_id':owner,'due_date':due,
                     'created_at':s._now(),'updated_at':s._now(),'created_by':user['user_id'],'remediation_title':body.remediation_title.strip()}
                await assignment_eligibility.validate(s.db, 'findings', doc, s._can_access_client)
                await authorization.require_creation_assignee(s.db,user,row['client_id'],owner)
                saved=await create_requests.insert_primary(s.db,'findings',doc,identity)
            fid=saved['finding_id']
            await s.finding_create_task(fid,{'title':saved['remediation_title']},user)
            await s.audit(user,'Finding raised','framework_assessment',aid,row['client_id'],meta={'finding_id':fid})
            await s.audit(user,'create','finding',fid,row['client_id'],meta={'framework_assessment_id':aid})
            return await s.db.findings.find_one({'finding_id':fid},{'_id':0})
        return await create_requests.run(s.db,create_requests.digest(body.request_id),user['user_id'],row['client_id'],
            'framework_assessments/'+aid+'/findings',body.model_dump(exclude_unset=True),execute)
    @router.get('/framework_assessments/{aid}/activity')
    async def activity(aid:str,user=Depends(s.get_current_user)):
        row=await parent(aid,user)
        return await s.db.audit_logs.find({'client_id':row['client_id'],'entity_id':aid},{'_id':0}).sort('at',-1).to_list(500)
    return router
