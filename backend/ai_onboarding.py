"""Recoverable, tenant-bound AI onboarding using native record writers."""
import calendar
import json
import uuid
from datetime import date
from datetime import datetime,timezone,timedelta
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError, field_validator

import assignment_eligibility
import create_requests
import review_occurrences
import risk_lifecycle
import vendor_governance

CATALOG = json.loads((Path(__file__).parents[1] / 'frontend/src/lib/aiOnboardingCatalog.json').read_text(encoding='utf-8'))
QUESTION_KEYS = {q['id'] for q in CATALOG['questions']}
SENSITIVE = {'Confidential','Highly Confidential','PII','PHI','Financial','Customer Data','Employee Data','Credentials','Source Code / IP','Production Data'}
CATALOG_KEYS = ['chatgpt','m365','claude','gemini','ghcopilot','cstudio','perplexity','zoomai','agentforce','grammarly']


def screening_scope(row):
    return {**{key:row.get(key) or '' for key in ('provider','environment','description','restrictions')},
        'vendor_id':row.get('vendor_id') or None,
        **{key:sorted(set(row.get(key) or [])) for key in ('purposes','data_types','permitted_data_types','access')}}


def governance_answers(row):
    saved=row.get('onboarding_screening') or {}
    if saved.get('schema_version')==1 and saved.get('catalog_version')==CATALOG['reviewedOn']:
        return saved.get('answers') or {}
    return row.get('screening') or {}


def screening_projection(row):
    saved=row.get('onboarding_screening')
    if not saved:return None
    answers=saved.get('answers') or {}
    stale=saved.get('schema_version')!=1 or saved.get('catalog_version')!=CATALOG['reviewedOn'] or saved.get('scope')!=screening_scope(row)
    complete=not stale and set(answers)==QUESTION_KEYS and all(type(value) is bool for value in answers.values())
    access=set(row.get('access') or [])
    high=any(answers.get(key) for key in ('writes','autonomous','consequential','harm')) or bool(access & {'Privileged Access','Autonomous Action Capability'})
    moderate=any(answers.get(key) for key in ('sensitive','connected','external')) or any(answers.get(key) is False for key in ('managed','oversight','settings')) or bool(access) or bool(set(row.get('data_types') or []) & SENSITIVE)
    return {'risk_tier':('high' if high else 'moderate' if moderate else 'low') if complete else None,
        'screening_complete':complete,'screening_version':'onboarding-1','screening_requires_reassessment':stale}


def proposed_rating(ai, answers):
    if any(value is None for value in answers.values()):
        return None, None
    preset = dict(zip(CATALOG_KEYS,CATALOG['tools'])).get(ai.catalog_key,{})
    likelihood,impact = preset.get('baselineLikelihood',2),preset.get('baselineImpact',2)
    if answers['sensitive'] or answers['external'] or set(ai.data_types) & (SENSITIVE-{'Source Code / IP','Production Data'}):
        impact=max(impact,3)
    if answers['writes'] or answers['consequential'] or answers['harm'] or 'Privileged Access' in ai.access:
        impact=max(impact,4)
    if not all(answers[key] for key in ('managed','oversight','settings')):
        likelihood=max(likelihood,3)
    if answers['autonomous'] or 'Autonomous Action Capability' in ai.access:
        likelihood=max(likelihood,4 if answers['writes'] or 'Privileged Access' in ai.access else 3)
    return likelihood,impact


class Screening(BaseModel):
    model_config = ConfigDict(extra='forbid')
    schema_version: Literal[1]
    catalog_version: Literal['2026-10-25']
    answers: dict[str, Optional[StrictBool]]

    @field_validator('schema_version',mode='before')
    @classmethod
    def strict_version(cls,value):
        if type(value) is not int or value != 1:
            raise ValueError('Unsupported screening schema')
        return value

    @field_validator('answers')
    @classmethod
    def exact_answers(cls, values):
        if set(values) != QUESTION_KEYS:
            raise ValueError('Answer all ten reviewed screening questions')
        return values


class VendorChoice(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    mode: Literal['none','link','create']
    id: Optional[str] = None
    expected_updated_at: Optional[str] = None
    name: str = Field(default='', max_length=150)
    service: str = Field(default='', max_length=250)
    owner_id: Optional[str] = None


class RiskChoice(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    title: str = Field(min_length=1,max_length=240)
    description: str = Field(min_length=1,max_length=3000)
    likelihood: Optional[int] = Field(default=None,ge=1,le=5)
    impact: Optional[int] = Field(default=None,ge=1,le=5)
    rationale: str = Field(min_length=1,max_length=5000)
    override: StrictBool = False


class OnboardingInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    client_id: str = Field(min_length=1,max_length=160)
    ai: dict
    screening: Screening
    vendor: VendorChoice
    risk: RiskChoice
    confirmations: dict[str, StrictBool]


class ReassessmentInput(Screening):
    reviewed: StrictBool


def reassessment(old,candidate,payload,user,at):
    saved=old.get('onboarding_screening')
    if not saved or saved.get('schema_version')!=1 or saved.get('catalog_version')!=CATALOG['reviewedOn']:
        raise HTTPException(422,'This record retains its original native screening questionnaire')
    try: body=ReassessmentInput(**payload)
    except (ValidationError,TypeError) as exc: raise HTTPException(422,'Invalid screening review') from exc
    if not body.reviewed: raise HTTPException(422,'Confirm the screening review for this deployment')
    for values in (candidate.get('data_types') or [],candidate.get('permitted_data_types') or []):
        if 'No Sensitive Data' in values and set(values)&SENSITIVE:
            raise HTTPException(422,'No Sensitive Data cannot coexist with sensitive classifications')
    scope=screening_scope(candidate)
    if old.get('approval_status') in ('approved','approved_with_conditions') and (saved.get('answers')!=body.answers or saved.get('scope')!=scope):
        raise HTTPException(409,'This change affects a recorded AI approval scope; authenticated reassessment is not supported. The original decision and record are unchanged.')
    previous={key:value for key,value in saved.items() if key!='history'}
    return {**saved,**body.model_dump(exclude={'reviewed'}),'scope':scope,'reviewed_at':at,'reviewed_by':user['user_id'],
        'history':[*(saved.get('history') or []),previous]}


def annual_date(value):
    anchor = date.fromisoformat(value[:10])
    return anchor.replace(year=anchor.year+1, day=min(anchor.day,calendar.monthrange(anchor.year+1,anchor.month)[1])).isoformat()


async def ensure_native_reviews(db,kind,doc,user,now):
    """Resume native initialization under the same parent lease as ordinary edits."""
    field='risk_id' if kind=='risks' else 'vendor_id'
    identity=doc[field]
    token=uuid.uuid4().hex
    acquired=await db[kind].update_one({field:identity,'$or':[{'_governance_lock':None},{'_governance_lock.until':{'$lt':now}}]},
        {'$set':{'_governance_lock':{'token':token,'until':(datetime.now(timezone.utc)+timedelta(seconds=120)).isoformat()}}})
    if not acquired.modified_count:
        raise HTTPException(409,'Another native record action is being saved; retry the original Add')
    try:
        current=await db[kind].find_one({field:identity,'client_id':doc['client_id']})
        if current.get('updated_at')!=current.get('_ai_onboarding_initial_version'):
            raise HTTPException(409,'The onboarding record changed; no native edits were overwritten')
        linked=await db.reviews.find({field:identity,'client_id':doc['client_id']}).to_list(None)
        for review in linked:
            expected_id='risk-review:'+identity if kind=='risks' else 'vendor:'+identity+':'+review.get('vendor_purpose','vendor')
            if review.get('_id')!=expected_id or review.get('status')!='upcoming' or review.get('created_at')!=review.get('updated_at') or review.get('created_by')!=user['user_id'] or review.get('occurrences'):
                raise HTTPException(409,'A linked native Review changed; its history was retained')
            if kind=='risks':
                expected={'due_date':doc['next_review'],'recurrence':'annual','owner_id':doc.get('owner_id')}
            else:
                plan=vendor_governance.plans(doc).get(review.get('vendor_purpose','vendor'))
                if not plan: raise HTTPException(409,'An unrelated Vendor Review requires reconciliation')
                expected={'due_date':plan[0],'recurrence':plan[1],'owner_id':doc.get('business_owner_id')}
            if any(review.get(key)!=value for key,value in expected.items()):
                raise HTTPException(409,'A linked native Review changed; its schedule was retained')
        if kind=='risks': await risk_lifecycle.ensure_review(db,doc,user,now)
        else: await vendor_governance.ensure_reviews(db,doc,user,now)
    finally:
        await db[kind].update_one({field:identity,'_governance_lock.token':token},{'$unset':{'_governance_lock':''}})


def register(router, s, *, ai_model, create_ai, validate_ai, client_scope, metadata_scope, project_ai):
    async def authorize(cid,user):
        await client_scope(cid,user,True,True)
        await metadata_scope(cid,{'environment'})
        intake = await s.db.ai_intake.find_one({'client_id':cid})
        if intake and intake.get('usage') == 'no':
            raise HTTPException(409,'Update the client AI profile before adding an AI system')

    async def verify_vendor(body):
        if body.vendor.mode != 'link': return
        existing = await s.db.vendors.find_one({'vendor_id':body.vendor.id,'client_id':body.client_id})
        if not existing or existing.get('status') in ('inactive','terminated','offboarded','retired'):
            raise HTTPException(409,'Choose an available Vendor belonging to this client')
        if existing.get('updated_at') != body.vendor.expected_updated_at:
            raise HTTPException(409,'The selected Vendor changed; review its current record')

    async def validate(body,user,annual):
        await authorize(body.client_id,user)
        allowed = {'catalog_key','name','provider','environment','description','owner_id','restrictions','purposes','data_types','permitted_data_types','access'}
        if set(body.ai)-allowed or body.confirmations != {'details':True,'screening':True,'risk':True}:
            raise HTTPException(422,'Review all three onboarding steps and use only the supported fields')
        for field,limit in [('name',150),('provider',150),('environment',200),('description',1500),('restrictions',2000)]:
            value=body.ai.get(field,'')
            if not isinstance(value,str) or len(value)>limit:
                raise HTTPException(422,'Invalid AI '+field)
        try:
            ai = ai_model(**{**body.ai,'client_id':body.client_id,'status':'draft'})
        except ValidationError as exc:
            raise HTTPException(422,'Invalid AI details') from exc
        await validate_ai(ai.model_dump(),user)
        if not ai.description.strip():
            raise HTTPException(422,'Document the intended business use')
        for values in (ai.data_types,ai.permitted_data_types):
            if 'No Sensitive Data' in values and set(values)&SENSITIVE:
                raise HTTPException(422,'No Sensitive Data cannot coexist with sensitive classifications')
        risk = body.risk
        if not all(value.strip() for value in (risk.title,risk.description,risk.rationale)) or (risk.likelihood is None)!=(risk.impact is None) or risk.override and risk.likelihood is None:
            raise HTTPException(422,'Document the Risk scenario, both scale values and assessment rationale')
        if not risk.override and (risk.likelihood,risk.impact) != proposed_rating(ai,body.screening.answers):
            raise HTTPException(422,'The rating differs from the proposal; document a human override')
        vendor = body.vendor
        await verify_vendor(body)
        if vendor.mode == 'create' and (not vendor.name.strip() or not vendor.service.strip()):
            raise HTTPException(422,'Enter the Vendor name and service')
        risk_payload = {'client_id':body.client_id,'title':risk.title,'description':risk.description,
            'owner_id':ai.owner_id,'likelihood_score':risk.likelihood,'impact_score':risk.impact,
            'assessment_rationale':risk.rationale,'next_review':annual,'review_cadence':'annual','status':'identified'}
        vendor_payload = {'client_id':body.client_id,'name':vendor.name,'service':vendor.service,
            'business_owner_id':vendor.owner_id or ai.owner_id,'next_review':annual,'review_frequency':'annual','status':'onboarding'}
        for kind,payload in [('risks',risk_payload)]+([('vendors',vendor_payload)] if vendor.mode=='create' else []):
            parsed = s.ENTITY_MAP[kind][1](**s._editable_patch(kind,payload,user=user)).model_dump()
            await assignment_eligibility.validate(s.db,kind,parsed,s._can_access_client)
            if kind=='vendors': await vendor_governance.validate(s.db,parsed,s._can_access_client)
            else:
                risk_lifecycle.validate_schedule(parsed)
                await risk_lifecycle.prepare_source(s.db,parsed)
        return ai,risk_payload,vendor_payload

    async def verified(body,user,result):
        await authorize(body.client_id,user)
        rows = {}
        for kind,id_field in [('ai_systems','ai_system_id'),('risks','risk_id'),('reviews','review_id'),('vendors','vendor_id')]:
            identifier = result.get(id_field)
            if not identifier:
                if kind == 'vendors': continue
                raise HTTPException(409,'Onboarding receipt is incomplete; retry the original request')
            row = await s.db[kind].find_one({id_field:identifier,'client_id':body.client_id},{'_id':0})
            if not row: raise HTTPException(409,'A required onboarding record is no longer available')
            rows[kind] = row
        ai = rows['ai_systems']
        if ai.get('vendor_id') != result.get('vendor_id') or rows['reviews'].get('ai_system_id') != ai['ai_system_id'] or not any(link.get('kind')=='risks' and link.get('id')==result['risk_id'] for link in ai.get('related_links',[])):
            raise HTTPException(409,'Required onboarding relationships changed; no saved record was overwritten')
        return {**result,'ai_system':await project_ai(ai)}

    @router.post('/ai_systems/onboard')
    async def onboard(body:OnboardingInput,user=Depends(s.get_current_user),idempotency_key:Optional[str]=Header(None)):
        # Completed create receipts skip execute, so both authorization and disclosure checks surround it.
        await authorize(body.client_id,user)

        async def execute_body(identity):
            receipt = await s.db.create_requests.find_one({'_id':identity})
            anchor = receipt['created_at']
            annual = annual_date(anchor)
            ai,risk_payload,vendor_payload = await validate(body,user,annual)
            # This command owns a single creation instant, retained across interrupted retries.
            # Native writers apply it only on first insert; audit events keep their actual time.
            metadata = {'_ai_onboarding_command':identity,'created_at':anchor,'updated_at':anchor}

            async def child(stage,kind,payload,writer):
                await authorize(body.client_id,user)
                key = create_requests.digest([identity,stage])
                child_id = create_requests.digest([user['user_id'],body.client_id,'ai-onboard/'+stage,key])
                existing = await s.db[kind].find_one({'_id':'create:'+child_id})
                child_receipt = await s.db.create_requests.find_one({'_id':child_id})
                if existing and (existing.get('_ai_onboarding_command') != identity or
                    existing.get('updated_at') != (existing.get('_ai_onboarding_linked_version') or existing.get('_ai_onboarding_initial_version'))):
                    raise HTTPException(409,'An onboarding record changed; preserve the original request and review the native record')
                # A native child may insert before its audit fails; it retains its own recovery receipt.
                await s.db.create_requests.update_one({'_id':identity},{'$set':{'primary_started':True}})
                async def run_child(child_identity):
                    return await writer(child_identity)
                result = await create_requests.run(s.db,key,user['user_id'],body.client_id,'ai-onboard/'+stage,payload,run_child)
                if child_receipt and child_receipt.get('state') == 'complete' and not existing:
                    raise HTTPException(409,'The command-owned record is missing')
                return result

            vendor_id = body.vendor.id if body.vendor.mode=='link' else None
            if body.vendor.mode == 'create':
                vendor = await child('vendor','vendors',vendor_payload,lambda cid:s._create_entity('vendors',vendor_payload,user,cid,creation_metadata=metadata))
                vendor_id = vendor['vendor_id']
            ai = ai.model_copy(update={'vendor_id':vendor_id})
            screening = {**body.screening.model_dump(),'scope':screening_scope(ai.model_dump()),'recorded_at':anchor,'recorded_by':user['user_id']}
            ai_metadata = {**metadata,'onboarding_screening':screening,'approval_status':'pending_assessment'}
            created = await child('ai','ai_systems',ai.model_dump(),lambda cid:create_ai(ai,user,cid,creation_metadata=ai_metadata))
            risk = await child('risk','risks',risk_payload,lambda cid:s._create_entity('risks',risk_payload,user,cid,creation_metadata={**metadata,'date_identified':anchor}))

            async def initial_review(cid):
                existing = await s.db.reviews.find_one({'_id':'create:'+cid},{'_id':0})
                if existing is None:
                    unrelated = await s.db.reviews.find_one({'ai_system_id':created['ai_system_id'],'ai_review_purpose':'periodic','status':{'$nin':['completed','cancelled']}})
                    if unrelated: raise HTTPException(409,'A different periodic AI Review already exists')
                    review = {'review_id':s._uid('rev'),'client_id':body.client_id,'ai_system_id':created['ai_system_id'],
                        'ai_review_purpose':'periodic','title':f"AI Governance Review — {created['display_id']} — {created['name']}",
                        'review_type':'ai_governance','owner_id':ai.owner_id,'due_date':annual,'recurrence':'annual',
                        'status':'upcoming','created_at':anchor,'updated_at':anchor,'created_by':user['user_id'],
                        **metadata,'_ai_onboarding_initial_version':anchor}
                    review.update(review_occurrences.schedule(review))
                    review['current_occurrence_id'] = review_occurrences.occurrence_id(review)
                    existing = await create_requests.insert_primary(s.db,'reviews',review,cid)
                await s.audit(user,'AI Governance Review scheduled','ai_system',created['ai_system_id'],body.client_id,meta={'review_id':existing['review_id']})
                return review_occurrences.view(existing)

            review = await child('review','reviews',{'ai_system_id':created['ai_system_id'],'due_date':annual},initial_review)
            await authorize(body.client_id,user)
            await verify_vendor(body)
            current = await s.db.ai_systems.find_one({'ai_system_id':created['ai_system_id'],'client_id':body.client_id})
            link = {'kind':'risks','id':risk['risk_id'],'classification':'Context','source':'','rationale':body.risk.rationale}
            if not current.get('_ai_onboarding_linked'):
                if current.get('updated_at') != current.get('_ai_onboarding_initial_version'):
                    raise HTTPException(409,'AI record changed before linking; no edit was overwritten')
                linked_version=s._next_write_time(current['updated_at'])
                updated = await s.db.ai_systems.update_one({'ai_system_id':created['ai_system_id'],'updated_at':current['updated_at']},
                    {'$addToSet':{'related_links':link},'$set':{'_ai_onboarding_linked':identity,'_ai_onboarding_linked_version':linked_version,'updated_at':linked_version}})
                if not updated.matched_count: raise HTTPException(409,'AI record changed before linking')
            elif current['_ai_onboarding_linked'] != identity or link not in current.get('related_links',[]):
                raise HTTPException(409,'The command-owned AI Risk relationship changed')
            await s.audit(user,'AI record linked','ai_system',created['ai_system_id'],body.client_id,meta=link)
            result = {'ai_system_id':created['ai_system_id'],'risk_id':risk['risk_id'],'review_id':review['review_id'],'vendor_id':vendor_id}
            await verified(body,user,result)
            await verify_vendor(body)
            return result

        async def execute(identity):
            if body.vendor.mode != 'link': return await execute_body(identity)
            @s.vendor_mutation
            async def with_vendor(vendor_id,user):
                return await execute_body(identity)
            return await with_vendor(body.vendor.id,user)

        result = await create_requests.run(s.db,idempotency_key,user['user_id'],body.client_id,'ai_systems/onboard',body.model_dump(),execute)
        return await verified(body,user,result)
