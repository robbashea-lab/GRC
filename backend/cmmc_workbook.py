"""CMMC planning inputs are independent of the assessment and remediation lifecycles."""
from datetime import date, datetime, timezone
import json
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pymongo.errors import DuplicateKeyError, PyMongoError
from pymongo.read_concern import ReadConcern

import authorization
import framework_reports
import r4_reports
from create_requests import digest
from framework_catalog import active_definitions
from cmmc_scope import configuration
from r4_services import assert_settled


RULES = json.loads((Path(__file__).parents[1] / 'shared/catalogs/cmmcWorkbook.json').read_text(encoding='utf-8'))
TEXT = Annotated[str, StringConstraints(max_length=4000, strict=True)]
ROW_SECTIONS = {'plans', 'decisions', 'exceptions'}
ASSET_CATEGORIES = {'', 'cui', 'sp', 'crma', 'specialized', 'out'}
PLANNING_STATUSES = {'Open', 'In progress', 'Ready for review', 'Closed'}
REPORT_FIELDS = {
    'framework_assessments': ('framework_assessment_id','definition_id','client_id','framework_key','framework_version',
        'owner_id','status','implementation','verification','updated_at','last_saved','last_assessed','assessment_history.at','assessment_history.status','assessment_history.by','assessment_history.implementation','na_rationale','items_to_address','related_links',
        'unlinked_evidence_ids','policy_link_ids','_r4_context_pending'),
    'tasks': ('task_id','title','status','framework_assessment_id','finding_id','review_id','assignee_id','owner_id','due_date'),
    'findings': ('finding_id','title','status','framework_assessment_id','review_id','assessment_item_id'),
    'reviews': ('review_id','title','status','owner_id','due_date','framework_key','framework_safeguards','framework_assessment_id','framework_drivers','framework_driver_active','risk_id','policy_id','ai_system_id','vendor_id','vendor_purpose','current_occurrence_id','framework_plan_key','review_template_id','baseline_key','activity_setup'),
    'evidence': ('evidence_id','display_name','filename','linked_type','linked_id','occurrence_id','relationships','archived_at','version'),
    'assets': ('asset_id','name','asset_type','location','owner_id','status'),
    'policies': ('policy_id','title','status','version','baseline_key','framework_assessment_id','presence',
                 'approved_at','approval_subject.subject_id','approval_request_id','approval_history.action','decision_history.action'),
}


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra='forbid',strict=True)
    client_id: str = Field(min_length=1,max_length=160)
    level: int = Field(ge=1,le=2)
    kind: Literal['ssp','sprs','poam']
    request_id: str = Field(pattern=r'^[A-Za-z0-9_-]{16,128}$')


class Edit(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    client_id: str = Field(min_length=1,max_length=160)
    level: int = Field(ge=1,le=2)
    revision: int = Field(ge=0)
    request_id: str = Field(pattern=r'^[A-Za-z0-9_-]{16,128}$')
    section: Literal['ssp','plans','assets','decisions','posting','conditional','exceptions']
    target: str = Field(default='',max_length=180)
    assessed_version: str = Field(default='',max_length=120)
    values: dict[str,TEXT] = Field(max_length=32)


def invalid(message):
    raise HTTPException(422, message)


def assessment_token(row):
    return row.get('last_saved') or row.get('last_assessed') or row.get('updated_at') or ''


def gap_snapshot(ident, row, exception=None):
    prerequisite=ident=='3.12.4'
    partial=RULES['partial'].get(ident)
    choice=(exception or {}).get('value') if (exception or {}).get('assessed_version')==assessment_token(row) else None
    weight=None if prerequisite else 5 if ident in RULES['five'] else 3 if ident in RULES['three'] else 1
    maximum=3 if partial and choice==partial else weight
    minimum=3 if partial and choice!='not-implemented' else maximum
    points=minimum if minimum==maximum else None
    eligibility=('blocked' if ident in RULES['prohibited'] else
                 'review' if ident=='3.13.11' and choice not in {partial,'not-implemented'} else
                 'candidate' if weight==1 or ident=='3.13.11' and choice==partial else 'blocked')
    label='SSP prerequisite' if prerequisite else str(points) if points is not None else f'{minimum}–{maximum}'
    return {'points':points,'pointLabel':label,'deductionMin':minimum,'deductionMax':maximum,
            'eligibility':eligibility,'narrative':row.get('implementation') or '', 'status':row.get('status'),
            'assessed_version':assessment_token(row)}


def clean_edit(body, prior, assessment, exception=None):
    section, values = body.section, {key:value.strip() for key,value in body.values.items()}
    fields = {f['id'] for f in RULES['sspFields']} if section == 'ssp' else set(RULES['fields'][section])
    if not values or set(values)-fields:
        invalid('Unsupported workbook fields')
    result = {**prior, **values}
    for field in set(values) & {'lastReview','nextReview','date','due_date'}:
        if not values[field]:
            continue
        try:
            parsed = date.fromisoformat(values[field])
            if parsed.isoformat() != values[field] or field in {'lastReview','date'} and parsed > datetime.now(timezone.utc).date():
                raise ValueError()
        except ValueError:
            invalid('Enter a valid date for the recorded or planned activity')
    if section in {'plans','exceptions','posting','conditional'} and body.level != 2:
        invalid('This workbook section is available for Level 2')
    if section == 'plans':
        gaps=[event for event in assessment.get('assessment_history',[]) if event.get('status') in {'in_progress','needs_attention'}]
        reopening = prior.get('status') == 'Closed' and result.get('status') != 'Closed'
        if reopening and not values.get('closeout'):
            invalid('Enter a reason for reopening this plan')
        if assessment['status'] in {'in_progress','needs_attention'} and (prior.get('status') != 'Closed' or reopening):
            result['assessment']=gap_snapshot(body.target,assessment,exception)
        elif not result.get('assessment') and gaps:
            result['assessment']=gap_snapshot(body.target,{**gaps[-1],'last_saved':gaps[-1].get('at')})
        if not result.get('assessment'):
            invalid('The saved assessment has no gap to plan')
        if gaps and not result.get('opened_at'):
            result['opened_at']=gaps[0].get('at')
        if result.get('status','Open') not in PLANNING_STATUSES:
            invalid('Choose a valid POA&M plan status')
        if result.get('status') == 'Closed' and not (result.get('closeout') and result.get('evidence')):
            invalid('Closing a plan requires validation notes and an evidence reference')
    if section == 'exceptions':
        choice = RULES['partial'].get(body.target)
        if not choice or result.get('value') not in {'',choice,'not-implemented'} or assessment['status'] not in {'in_progress','needs_attention'}:
            invalid('This scoring condition is unavailable for the saved assessment')
        result['assessed_version'] = assessment_token(assessment)
    if section == 'assets' and result.get('category','') not in ASSET_CATEGORIES:
        invalid('Choose a valid asset scope classification')
    if section == 'posting':
        try:
            score = int(result['score'])
            if str(score) != result['score'] or not -203 <= score <= 110: raise ValueError()
        except (KeyError,ValueError):
            invalid('Record the submitted score between -203 and 110')
        if not result.get('date') or not result.get('scope'):
            invalid('Record the actual assessment date and scope')
    if section == 'decisions':
        if assessment.get('status') != 'not_applicable' or not assessment.get('na_rationale','').strip():
            invalid('Record applicability and its rationale in the assessment first')
        if result.get('outcome') not in {'pending','approved','adjudicated'}:
            invalid('Choose a recorded decision')
        if result['outcome'] != 'pending' and not all(result.get(key) for key in ('date','reference','authority')):
            invalid('A recorded approval requires its date, reference, and authority')
        result['rationale'] = assessment['na_rationale']
    return result


async def scope(s, cid, user, session):
    authorization.scope(user,cid)
    current = await s.db.users.find_one({'user_id':user['user_id']},session=session)
    if not current or current.get('status') != 'active' or current.get('password_change_required') or authorization.role_of(current) != authorization.role_of(user):
        raise HTTPException(403,'Account access changed')
    authorization.scope(current,cid)
    if any(current.get(k) != user.get(k) for k in ('password_changed_at','sessions_revoked_at')):
        raise HTTPException(401,'Your session changed; sign in again')
    client = await s.db.clients.find_one({'client_id':cid},session=session)
    if not client: raise HTTPException(404,'Client not found')
    assert_settled(client)
    active = await s.db.requirements.find_one({'client_id':cid,'baseline_key':'cmmc','baseline_response':'applies'},session=session)
    if not active: raise HTTPException(404,'CMMC is not active for this client')
    assert_settled(active)
    return client, current


async def bounded(s, kind, query, fields, session, limit=10000):
    rows = await s.db[kind].find(query,{'_id':0,**dict.fromkeys((*fields,'client_id','_r4_context_pending'),1)},session=session).to_list(limit+1)
    if len(rows)>limit: raise HTTPException(413,'The workbook exceeds the supported record count')
    for row in rows:
        assert_settled(row)
        row.pop('_r4_context_pending',None)
    return rows


def identity(cid,level):
    return digest(['cmmc-workbook',cid,level])


def router_for(s):
    router = APIRouter(prefix='/api/frameworks/cmmc',tags=['CMMC workspace'])

    async def workbook(client_id,user,export=None):
        async def read(session):
            client,actor = await scope(s,client_id,user,session)
            level = configuration(client)['level']
            if export:
                framework_reports.require_access(actor,client_id)
                if not client.get('onboarding_baseline',{}).get('completed') or level!=export.level or level==1 and export.kind!='ssp':
                    raise HTTPException(409,'Current program scope does not support this export')
            key = identity(client_id,level)
            records = await s.db.cmmc_workbooks.find_one({'_id':key},{'_id':0},session=session) or {'client_id':client_id,'level':level,'revision':0}
            data = {'configuration':{'level':level},'assessments':await bounded(s,'framework_assessments',{'client_id':client_id,'framework_key':'cmmc'},REPORT_FIELDS['framework_assessments'],session,150)}
            # An explicit finding assignment in any program narrows a shared Review's work.
            scoped = await bounded(s,'framework_assessments',{'client_id':client_id,'framework_key':{'$ne':'cmmc'},
                'related_links.kind':'findings'},('framework_assessment_id','related_links'),session)
            records['findingScopes']=[{'client_id':client_id,'framework_assessment_id':item['framework_assessment_id'],
                'related_links':[{'kind':'findings','id':link['id']} for link in item.get('related_links',[])
                                 if link.get('kind')=='findings' and link.get('id')]} for item in scoped]
            for kind in ('reviews','findings','tasks','evidence','assets','policies'):
                query={'client_id':client_id}
                if kind=='evidence': query['archived_at']=None
                records[{'evidence':'files','assets':'inventory'}.get(kind,kind)]=await bounded(s,kind,query,REPORT_FIELDS[kind],session)
            records['history']=await bounded(s,'cmmc_workbook_edits',{'workbook':key},('at','section','target','actor','actor_name','before','after','revision'),session)
            records['history'].sort(key=lambda event:event['revision'],reverse=True)
            contact = await s.db.contacts.find_one({'client_id':client_id,'contact_id':client.get('primary_contact_id')},{'name':1},session=session) if client.get('primary_contact_id') else None
            names=await bounded(s,'users',{'status':'active','$or':[{'client_ids':client_id},{'user_id':client.get('assigned_owner_id'),'role':'super_admin'},
                {'user_id':client.get('assigned_owner_id'),'role':'platform_admin','all_clients':True}]},('user_id','name'),session)
            records['toolCatalog']=await bounded(s,'tool_catalog',{},('tool_id','name','retired'),session)
            summary={'client_id':client_id,'name':client.get('name'),'status':client.get('status'),'primary_contact':(contact or {}).get('name'),'assigned_owner_id':client.get('assigned_owner_id'),
                'names':{person['user_id']:person.get('name') for person in names},'profile':client.get('profile') or {}}
            packet = {'data':data,'records':records,'client':summary}
            if export:
                snapshot_hash=digest(packet)
                receipt_id='cmmc-export:'+digest([key,export.kind,user['user_id'],export.request_id])
                existing=await s.db.audit_logs.find_one({'_id':receipt_id},session=session)
                if existing and existing['meta']['source_hash']!=snapshot_hash:
                    raise HTTPException(409,'Export sources changed; start a fresh download')
                if not existing:
                    await s.db.audit_logs.insert_one({'_id':receipt_id,'log_id':receipt_id,'at':s._now(),'user_id':actor['user_id'],
                        'user_name':actor.get('name'),'user_email':actor.get('email'),'outcome':'success','action':'prepare-export',
                        'entity_type':'cmmc-workbook','entity_id':key,'entity_name':export.kind.upper(),'client_id':client_id,
                        'client_name':client.get('name'),'meta':{'level':level,'kind':export.kind,'source_hash':snapshot_hash,
                        'revision':records['revision']}},session=session)
            return packet
        return await transaction(s,read)

    @router.get('/workbook')
    async def read_workbook(client_id:str,user=Depends(s.get_current_user)):
        return await workbook(client_id,user)

    @router.post('/workbook/export')
    async def prepare_export(body:ExportRequest,request:Request,user=Depends(s.get_current_user)):
        await r4_reports.authority(s,request,body.client_id,'cmmc',user)
        packet=await workbook(body.client_id,user,body)
        await r4_reports.authority(s,request,body.client_id,'cmmc',user)
        return packet

    @router.put('/workbook')
    async def save_workbook(body: Edit,user=Depends(s.get_current_user)):
        async def write(session):
            cid,level=body.client_id,body.level
            client,actor=await scope(s,cid,user,session)
            if not authorization.writable(actor) or client.get('status')=='archived':
                raise HTTPException(403,'This workbook is read-only')
            if configuration(client)['level']!=level:
                raise HTTPException(409,'CMMC level changed; reopen the workbook')
            key=identity(cid,level)
            event_id=digest([key,actor['user_id'],body.request_id])
            fingerprint=digest(body.model_dump())
            section,target=body.section,body.target
            assessment=None
            if section in ROW_SECTIONS:
                if target not in {d['id'] for d in active_definitions('cmmc',{'level':level})}: invalid('Requirement is outside the active CMMC scope')
                assessment=await s.db.framework_assessments.find_one({'client_id':cid,'framework_key':'cmmc','definition_id':target},session=session)
                if not assessment: raise HTTPException(409,'Assessment is unavailable')
                assert_settled(assessment)
                authorization.require_assigned(actor,'framework_assessments',assessment)
            elif actor['role']==authorization.CONTRIBUTOR:
                raise HTTPException(403,'An assigned manager must record program-wide changes')
            if section=='assets':
                if not await s.db.assets.find_one({'client_id':cid,'asset_id':target},session=session): invalid('Choose a current client asset')
            elif section not in ROW_SECTIONS and target: invalid('Unexpected workbook target')
            previous_event=await s.db.cmmc_workbook_edits.find_one({'_id':event_id},session=session)
            if previous_event:
                if previous_event['fingerprint']!=fingerprint: raise HTTPException(409,'This save already carries different values')
                return {'revision':previous_event['revision']}
            if assessment and assessment_token(assessment)!=body.assessed_version:
                raise HTTPException(409,'Assessment changed; reopen the workbook item')
            doc=await s.db.cmmc_workbooks.find_one({'_id':key},session=session) or {'_id':key,'client_id':cid,'level':level,'revision':0}
            if doc['revision']!=body.revision: raise HTTPException(409,'Workbook changed; reopen the form')
            group=doc.get(section) or {}
            before=group.get(target,{}) if target else group
            after=clean_edit(body,before,assessment,doc.get('exceptions',{}).get(target))
            if before==after: return {'revision':body.revision}
            at=s._now()
            doc[section]={**group,target:after} if target else after
            doc['revision']+=1
            event={'workbook':key,'client_id':cid,'revision':doc['revision'],'section':section,'target':target,'actor':actor['user_id'],
                'actor_name':actor.get('name'),'at':at,'before':before,'after':after,'fingerprint':fingerprint}
            await s.db.cmmc_workbooks.replace_one({'_id':key},doc,upsert=True,session=session)
            await s.db.cmmc_workbook_edits.insert_one({'_id':event_id,**event},session=session)
            await s.db.audit_logs.insert_one({'_id':'cmmc:'+event_id,'log_id':'cmmc_'+event_id,'at':at,'user_id':actor['user_id'],
                'user_name':actor.get('name'),'user_email':actor.get('email'),'outcome':'success','action':'update','entity_type':'cmmc-workbook',
                'entity_id':key,'entity_name':'CMMC Level '+str(level)+' workbook','client_id':cid,'client_name':client.get('name'),
                'meta':{'section':section,'target':target,'revision':doc['revision']}},session=session)
            return {'revision':doc['revision']}
        return await transaction(s,write)
    return router


async def transaction(s,operation):
    try:
        async with await s.db.client.start_session() as session:
            return await session.with_transaction(operation,read_concern=ReadConcern('snapshot'))
    except DuplicateKeyError as exc:
        raise HTTPException(409,'Another workbook save completed; reopen the record') from exc
    except PyMongoError as exc:
        raise HTTPException(503,'The database could not confirm this workbook operation; retry the same request') from exc
