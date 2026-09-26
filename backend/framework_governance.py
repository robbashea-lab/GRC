"""Tenant-authorized framework assessments and shared operational relationships."""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
import review_occurrences
import assignment_eligibility
from framework_catalog import CATALOGS, CIS, definition_for, assessment_title, active_definitions
from csf_profile import CsfProfile
from soc_readiness import SocConfiguration, ManagementControl, configuration as soc_configuration

ROOT=Path(__file__).parents[1]/'frontend/src/lib'
FRAMEWORKS=json.loads((ROOT/'frameworkDefinitions.json').read_text(encoding='utf-8'))['frameworks']
STATUSES=('not_assessed','in_progress','addressed','needs_attention','not_applicable')
CADENCES=('monthly','quarterly','semiannual','annual','custom')

def stable(cid,kind,key,framework='cis-ig1'):
    # Retain the original CIS namespace and IDs, including stored occurrence links.
    version=CATALOGS[framework]['version']
    return 'fw_'+uuid.uuid5(uuid.NAMESPACE_URL,f'{cid}:{framework}:{version}:{kind}:{key}').hex

def validate_configuration(state):
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

async def reconcile(s,cid,state,user):
    """Explicit activation only. Absent keys are untouched (single-program Settings edits)."""
    for key,catalog in CATALOGS.items():
        if key not in state.get('requirements',{}):
            continue
        if state['requirements'][key]!='applies':
            await s.db.reviews.update_many({'client_id':cid,'framework_key':key},{'$set':{'framework_driver_active':False}})
            continue
        await reconcile_catalog(s,cid,state,user,key,catalog)


async def reconcile_catalog(s,cid,state,user,key,catalog):
    client=await s.db.clients.find_one({'client_id':cid},{'_id':0,'framework_settings':1}) if key=='soc-2' else {}
    definitions=active_definitions(key,soc_configuration(client or {}))
    for definition in definitions:
        aid=stable(cid,'assessment',definition['id'],key)
        await s.db.framework_assessments.update_one({'_id':aid},{'$setOnInsert':{
            'framework_assessment_id':aid,'client_id':cid,'framework_key':key,'definition_id':definition['id'],
            'framework_version':catalog['version'],'status':'not_assessed','implementation':'','technology':'','notes':'','na_rationale':'',
            'owner_id':None,'process_owner_id':None,'created_at':s._now(),'related_links':[],'assessment_history':[]}},upsert=True)
    for plan in catalog['review_plans']:
        config={'enabled':True,'recurrence':plan['default_cadence'],**state.get('framework_reviews',{}).get(plan['key'],{})}
        old=await s.db.reviews.find_one({'client_id':cid,'framework_plan_key':plan['key']},{'_id':0})
        if not config['enabled']:
            if old: await s.db.reviews.update_one({'review_id':old['review_id']},{'$set':{'framework_driver_active':False}})
            continue
        if not old and plan.get('baseline_key'):
            equivalent=[p['key'] for c in CATALOGS.values() for p in c['review_plans'] if p.get('baseline_key')==plan['baseline_key']]
            old=await s.db.reviews.find_one({'client_id':cid,'$or':[{'baseline_key':plan['baseline_key']},{'framework_plan_key':{'$in':equivalent}}]},{'_id':0})
        mapping={'framework_key':key,'framework_version':catalog['version'],'framework_plan_key':plan['key'],'framework_driver_active':True,
                 'framework_safeguards':plan['safeguards'],'framework_basis':plan['basis'],'framework_source_cadence':plan['source_cadence'],
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
        await s.db.framework_assessments.update_many(
            {'client_id':cid,'framework_key':key,'definition_id':{'$in':plan['safeguards']}},
            {'$addToSet':{'related_links':{'kind':'reviews','id':rid}}})

class AssessmentPatch(BaseModel):
    model_config=ConfigDict(extra='forbid')
    expected_last_assessed: Optional[str]=Field(default=None,max_length=100)
    status: Optional[Literal['not_assessed','in_progress','addressed','needs_attention','not_applicable']]=None
    implementation: Optional[str]=Field(default=None,max_length=20000)
    technology: Optional[str]=Field(default=None,max_length=4000)
    notes: Optional[str]=Field(default=None,max_length=20000)
    na_rationale: Optional[str]=Field(default=None,max_length=4000)
    owner_id: Optional[str]=None
    process_owner_id: Optional[str]=None
    addressable_decision: Optional[Literal['','as_written','equivalent_alternative','not_reasonable_appropriate']]=None
    addressable_rationale: Optional[str]=Field(default=None,max_length=4000)
    soa_applicability: Optional[Literal['','included','excluded']]=None
    soa_justification: Optional[str]=Field(default=None,max_length=4000)
    csf_profile: CsfProfile = Field(default_factory=CsfProfile)
    management_controls: list[ManagementControl]=Field(default_factory=list,max_length=30)

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

async def workspace_work(s,cid,rows):
    """Four bounded-field reads, no occurrence/evidence/history payloads or per-row queries."""
    if not rows:return {}
    projection={'_id':0,'client_id':1,'review_id':1,'finding_id':1,'task_id':1,'framework_assessment_id':1,'framework_key':1,'framework_safeguards':1,'status':1,'due_date':1}
    reviews=await s.db.reviews.find({'client_id':cid},projection).to_list(None)
    findings=await s.db.findings.find({'client_id':cid,'status':{'$nin':['closed','accepted']}},projection).to_list(None)
    tasks=await s.db.tasks.find({'client_id':cid,'status':{'$nin':['done','cancelled']}},projection).to_list(None)
    # Evidence dates only (no content): supports derived validation freshness.
    # Deleted (archived) Evidence is not current support.
    evidence=await s.db.evidence.find({'client_id':cid,'archived_at':None},{'_id':0,'evidence_id':1,'linked_type':1,'linked_id':1,'evidence_date':1,'created_at':1}).to_list(None)
    today=datetime.now(timezone.utc).date().isoformat()
    result={}
    for row in rows:
        links=row.get('related_links') or [];aid=row['framework_assessment_id']
        def linked(kind,ident):return {'kind':kind,'id':ident} in links
        rs=[r for r in reviews if linked('reviews',r['review_id']) or (r.get('framework_key')==row['framework_key'] and row['definition_id'] in r.get('framework_safeguards',[]))]
        rids={r['review_id'] for r in rs}
        fs=[f for f in findings if linked('findings',f['finding_id']) or f.get('framework_assessment_id')==aid or f.get('review_id') in rids]
        fids={f['finding_id'] for f in fs}
        def overdue(r):return bool(r.get('due_date')) and r['due_date'][:10]<today
        ts=[t for t in tasks if linked('tasks',t['task_id']) or t.get('framework_assessment_id')==aid or t.get('review_id') in rids or t.get('finding_id') in fids]
        unlinked=set(row.get('unlinked_evidence_ids') or [])
        # Evidence the operator unlinked from this assessment no longer supports it.
        es=[e for e in evidence if e['evidence_id'] not in unlinked and (linked('evidence',e['evidence_id']) or (e.get('linked_type') in ('framework_assessment','framework_assessments') and e.get('linked_id')==aid))]
        dates=sorted(str(e.get('evidence_date') or e.get('created_at') or '')[:10] for e in es if e.get('evidence_date') or e.get('created_at'))
        direct=[f for f in fs if linked('findings',f['finding_id']) or f.get('framework_assessment_id')==aid]
        result[aid]={'review_ids':sorted(rids),'finding_ids':sorted(fids),'open_findings':len(fs),'direct_findings':len(direct),
          'overdue_reviews':sum(overdue(r) for r in rs if r.get('status') not in ('completed','cancelled')),
          'overdue_actions':sum(overdue(t) for t in ts),'open_actions':len(ts),
          'evidence_count':len(es),'latest_evidence_at':dates[-1] if dates else None}
    return result

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
    for kind,key in {'reviews':'review_id','findings':'finding_id','tasks':'task_id','risks':'risk_id','policies':'policy_id','requirements':'requirement_id','evidence':'evidence_id','vendors':'vendor_id'}.items():
        links=[l['id'] for l in row.get('related_links',[]) if l['kind']==kind]
        clauses=[{key:{'$in':links}},{'framework_assessment_id':aid}]
        if kind=='reviews':clauses.append({'framework_key':row['framework_key'],'framework_safeguards':did})
        if kind=='policies':clauses.append({'baseline_key':{'$in':[p['policy_key'] for p in CATALOGS.get(row['framework_key'],{}).get('policy_mappings',[]) if did in p['safeguards']]}})
        if kind=='evidence':clauses.append({'linked_type':{'$in':['framework_assessment','framework_assessments']},'linked_id':aid})
        out[kind]=await s.db[kind].find({'client_id':cid,'$or':clauses},{'_id':0,'content_base64':0}).to_list(None)
    rids=[r['review_id'] for r in out['reviews']]
    findings=await s.db.findings.find({'client_id':cid,'review_id':{'$in':rids}},{'_id':0}).to_list(None)
    out['findings']=list({r['finding_id']:r for r in out['findings']+findings}.values())
    tasks=await s.db.tasks.find({'client_id':cid,'$or':[{'finding_id':{'$in':[f['finding_id'] for f in out['findings']]}},{'review_id':{'$in':rids}}]},{'_id':0}).to_list(None)
    out['tasks']=list({r['task_id']:r for r in out['tasks']+tasks}.values())
    review_evidence=await s.db.evidence.find({'client_id':cid,'linked_type':{'$in':['review','reviews']},'linked_id':{'$in':rids}},{'_id':0,'content_base64':0}).to_list(None)
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
        config=soc_configuration(client) if key=='soc-2' else {}
        retained={a['definition_id'] for a in rows}
        return {'framework':framework,'selected':bool(program),'configured':bool(rows),
                'definitions':[d for d in catalog.get('requirements',[]) if d['id'] in retained],
                'assessments':rows,'configuration':config,'work':await workspace_work(s,client_id,rows),
                'active_definition_ids':[d['id'] for d in active_definitions(key,config)]}
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
        plan=next((p for p in catalog['review_plans'] if p['key']==body.plan_key and row['definition_id'] in p['safeguards']),None)
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
        mapped=plan['safeguards'] if plan else [row['definition_id']]
        linked=await s.db.framework_assessments.update_many({'client_id':cid,'framework_key':key,'definition_id':{'$in':mapped}},{'$addToSet':{'related_links':{'kind':'reviews','id':rid}}})
        if linked.modified_count:await s.audit(user,'Framework Review linked','framework_assessments',aid,cid,meta={'review_id':rid})
        return await s.db.reviews.find_one({'review_id':rid,'client_id':cid},{'_id':0})

    @router.patch('/framework_assessments/{aid}')
    async def update(aid:str,body:AssessmentPatch,user=Depends(s.get_current_user)):
        old=await parent(aid,user,True);changes=body.model_dump(exclude_unset=True)
        s._require_snapshot(changes,old,'last_assessed')
        changes.pop('expected_last_assessed')
        data={**old,**changes}
        if 'csf_profile' in changes and old['framework_key']!='nist-csf-2':
            raise HTTPException(422,'CSF profile fields apply only to NIST CSF')
        if 'management_controls' in changes:
            if old['framework_key']!='soc-2':raise HTTPException(422,'Management control readiness fields apply only to SOC 2')
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
            if (applicability=='excluded') != (data['status']=='not_applicable'):
                raise HTTPException(422,'An excluded Annex A control must be Not Applicable; other controls cannot be Not Applicable')
            if data['status']=='addressed' and applicability!='included':
                raise HTTPException(422,'Record SoA inclusion before marking Addressed')
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
        if changed:
            at=s._next_write_time(old.get('last_assessed'));snapshot={k:data.get(k) for k in AssessmentPatch.model_fields if k!='expected_last_assessed'};snapshot.update(at=at,by=user['user_id'])
            result=await s.db.framework_assessments.update_one({'framework_assessment_id':aid,'client_id':old['client_id'],'last_assessed':old.get('last_assessed')},{'$set':{**changes,'last_assessed':at,'assessed_by':user['user_id']},'$push':{'assessment_history':snapshot}})
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
        if not body.title.strip() or not body.remediation_title.strip():raise HTTPException(422,'Finding and Action titles are required')
        fid=stable(row['client_id'],'finding',aid+':'+body.request_id)
        # A departed or out-of-scope safeguard owner is never copied onto new work:
        # the Finding and its Action start visibly unassigned instead of failing.
        owner=row.get('owner_id')
        if owner and not await assignment_eligibility.eligible(s.db,owner,row['client_id'],s._can_access_client):owner=None
        doc={'finding_id':fid,'client_id':row['client_id'],'title':body.title.strip(),'description':body.description,'severity':body.severity,
             'status':'open','framework_assessment_id':aid,'source':assessment_title(row),'owner_id':owner,
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
