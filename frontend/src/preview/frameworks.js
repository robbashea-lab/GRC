import {validateCsfProfile} from '../lib/csfProfile';
import {pilotEnabled,guidedCatalog,validateAnswers} from '../lib/guidedAssessment';
import cisCriteria from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import socGuidance from '@catalogs/operatorGuidance/socAssessmentGuidance.json';
import isoCriteria from '@catalogs/operatorGuidance/isoAssessmentCriteria.json';
import {calendarDay} from '../lib/managementDates';
import { validateAssignment, eligible } from './assignmentEligibility';
import {CATALOGS,frameworkCatalog,frameworkDefinition,frameworkCapabilities,activeDefinitions,FRAMEWORKS,ASSESSMENT_STATUSES,CADENCES,reviewConfig} from '../lib/frameworks';
import {cisConfiguration,validateCisSettings,validateCisConfiguration} from '../lib/cisScope';
import {activePlans} from '../lib/frameworks';
import {socConfiguration,validateSocConfiguration,validateManagementControls} from '../lib/socReadiness';
import {record,write,audit,now,ids} from './store';
import {action} from './workflows';
import {assessmentWork,findingApplies} from '../lib/frameworkWorkspace';
import {existingFrameworkReview,sharedFrameworkPlans,reviewDriver,reviewDrivers} from '../lib/frameworks';
const stable=(cid,kind,key,framework='cis-ig1')=>`fw_${cid}_${kind}_${framework==='cis-ig1'?'':framework+'_'}${key}`;
const assessmentTitle=a=>`${frameworkCatalog(a.framework_key)?.label||(a.framework_key==='cis-ig1'?'CIS':a.framework_key.toUpperCase())} ${a.definition_id} · ${frameworkDefinition(a.framework_key,a.definition_id)?.title||a.definition_id}`;
const VERIFICATION_FIELDS=['verification','verification_checklist'],VERIFICATION_STATES=['not_verified','needs_validation','gap_identified','verified'],VERIFICATION_TIERS={foundation:'f',operational:'o',mature:'m'};
const fail=(message,status=422)=>{const error=new Error(message);error.status=status;throw error;};
// Shape and safeguard prefix only; the UI checks ids against operator guidance.
const validateVerificationChecklist=(value,definitionId)=>{
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid verification checklist');
  return Object.fromEntries(Object.entries(value).map(([tier,ids])=>{
    if(!VERIFICATION_TIERS[tier]||!Array.isArray(ids)||ids.length>20)throw new Error('Invalid verification checklist');
    for(const check of ids)if(typeof check!=='string'||check.length>32||!/^[0-9]+\.[0-9]+-[fom][0-9]{1,2}$/.test(check)||check.split('-')[1][0]!==VERIFICATION_TIERS[tier])throw new Error('Invalid verification check identifier');
    if(ids.some(check=>check.split('-')[0]!==definitionId))throw new Error('Verification checks must belong to this safeguard');
    return [tier,[...new Set(ids)]];
  }));
};
const writable=db=>{if(!['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(db.user.role))fail('Read-only role',403);};
export function frameworkScope(db,cid){
  record(db,'clients',cid);
  if(db.user.role!=='super_admin'&&!(db.user.role==='platform_admin'&&!db.user.client_ids?.length)&&!db.user.client_ids?.includes(cid))fail('Forbidden',403);
}
export function validateFrameworkConfig(state){
  validateCisSettings(state.framework_settings);
  const configs=state.framework_reviews||{};
  if(typeof configs!=='object'||Array.isArray(configs)||Object.keys(configs).some(k=>!Object.values(CATALOGS).some(c=>c.review_plans.some(p=>p.key===k))))throw new Error('Invalid framework Review configuration');
  for(const c of Object.values(configs)){
    if(!c||Object.keys(c).some(k=>!['enabled','recurrence','custom_recurrence_days','due_date'].includes(k)))throw new Error('Invalid framework Review fields');
    if((c.enabled!=null&&typeof c.enabled!=='boolean')||(c.recurrence&&!CADENCES.includes(c.recurrence)))throw new Error('Invalid client cadence');
    if(c.recurrence==='custom'&&(!Number.isInteger(c.custom_recurrence_days)||c.custom_recurrence_days<1||c.custom_recurrence_days>3650))throw new Error('Custom cadence must be 1–3650 days');
    if(c.due_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(c.due_date)||calendarDay(c.due_date)===null))throw new Error('Invalid Review date');
  }
}
export function reconcileFramework(db,cid,state){
  db.framework_assessments||=[];
  if(sharedFrameworkPlans(state).some(p=>reviewConfig(state,p).conflict))throw new Error('Choose one cadence and first due date for each shared Review');
  for(const [key,catalog] of Object.entries(CATALOGS)){
    if(!(key in (state.requirements||{})))continue;
    if(state.requirements[key]!=='applies'){
      for(const r of db.reviews.filter(r=>r.client_id===cid&&reviewDrivers(r).some(d=>d.framework_key===key))){
        r.framework_drivers=reviewDrivers(r).map(d=>d.framework_key===key?{...d,framework_driver_active:false}:d);
        r.framework_driver_active=r.framework_drivers.find(d=>d.framework_plan_key===r.framework_plan_key)?.framework_driver_active??r.framework_driver_active;
      }
      continue;
    }
    reconcileCatalog(db,cid,state,key,catalog);
  }
}
function reconcileCatalog(db,cid,state,key,catalog){
  const client=db.clients.find(c=>c.client_id===cid),configuration=key==='cis-ig1'?{...cisConfiguration(client),...state.framework_settings?.['cis-ig1']}:socConfiguration(client);
  state={...state,framework_settings:{...client.framework_settings,...state.framework_settings}};
  const plans=activePlans(key,configuration),planKeys=new Set(plans.map(p=>p.key));
  if(key==='cis-ig1')for(const row of db.reviews.filter(r=>r.client_id===cid))for(const driver of reviewDrivers(row).filter(d=>d.framework_key===key&&!planKeys.has(d.framework_plan_key)))addReviewDriver(row,key,{...catalog.review_plans.find(p=>p.key===driver.framework_plan_key),safeguards:driver.framework_safeguards},false);
  for(const d of activeDefinitions(key,configuration)){
    const aid=stable(cid,'assessment',d.id,key);
    if(!db.framework_assessments.some(a=>a.framework_assessment_id===aid))db.framework_assessments.push({framework_assessment_id:aid,client_id:cid,framework_key:key,framework_version:catalog.version,definition_id:d.id,status:'not_assessed',implementation:'',technology:'',notes:'',na_rationale:'',owner_id:null,process_owner_id:null,created_at:now(),related_links:[],assessment_history:[]});
  }
  for(const p of plans){
    const equivalent=Object.values(CATALOGS).flatMap(c=>c.review_plans).filter(other=>p.baseline_key&&other.baseline_key===p.baseline_key).map(other=>other.key);
    const shared=sharedFrameworkPlans(state).find(group=>group.drivers.some(d=>d.key===p.key))||p;
    const c=reviewConfig(state,shared),old=db.reviews.find(r=>r.client_id===cid&&r.framework_plan_key===p.key)||(p.baseline_key&&db.reviews.find(r=>r.client_id===cid&&(r.baseline_key===p.baseline_key||equivalent.includes(r.framework_plan_key))));
    if(old&&p.default_enabled===false&&!Object.hasOwn(state.framework_reviews||{},p.key))c.enabled=true;
    if(!c.enabled){if(old)addReviewDriver(old,key,p,false);continue;}
    const mapping={framework_key:key,framework_version:catalog.version,framework_plan_key:p.key,framework_driver_active:true,framework_safeguards:p.safeguards,framework_basis:p.basis,framework_source_cadence:p.source_cadence,framework_default_cadence:p.default_cadence};
    let review=old;
    for(const field of ['purpose','evidence_expectations','completion_criteria'])if(p[field])mapping['framework_'+field]=p[field];
    if(old){if(!old.framework_key||old.framework_key===key)Object.assign(old,mapping);}
    else review=write(db,'reviews',{client_id:cid,title:p.title,review_type:p.review_type,status:'needs_scheduling',due_date:c.due_date||null,recurrence:c.recurrence,custom_recurrence_days:c.custom_recurrence_days,owner_id:null,...mapping});
    addReviewDriver(review,key,p);
    for(const a of db.framework_assessments.filter(a=>a.client_id===cid&&a.framework_key===key&&p.safeguards.includes(a.definition_id))){
      if(!a.related_links.some(l=>l.kind==='reviews'&&l.id===review.review_id))a.related_links.push({kind:'reviews',id:review.review_id});
    }
  }
}
function addReviewDriver(review,key,plan,active=true){
  review.framework_drivers=[...reviewDrivers(review).filter(d=>d.framework_plan_key!==plan.key),reviewDriver(key,plan,active)].sort((a,b)=>a.framework_plan_key.localeCompare(b.framework_plan_key));
  review.framework_driver_active=review.framework_drivers.find(d=>d.framework_plan_key===review.framework_plan_key)?.framework_driver_active??review.framework_driver_active;
}
export function frameworkRelated(db,row){
  const cid=row.client_id,aid=row.framework_assessment_id,did=row.definition_id,result={};
  for(const kind of ['reviews','findings','tasks','risks','policies','requirements','evidence','vendors']){
    const direct=(row.related_links||[]).filter(l=>l.kind===kind).map(l=>l.id);
    result[kind]=(db[kind]||[]).filter(r=>r.client_id===cid&&(direct.includes(r[ids[kind]])||r.framework_assessment_id===aid||
      (kind==='reviews'&&r.framework_key===row.framework_key&&r.framework_safeguards?.includes(did))||
      (kind==='policies'&&frameworkCatalog(row.framework_key)?.policy_mappings.some(p=>p.policy_key===r.baseline_key&&p.safeguards.includes(did)))||
      (kind==='evidence'&&['framework_assessment','framework_assessments'].includes(r.linked_type)&&r.linked_id===aid)));
  }
  const rids=result.reviews.map(r=>r.review_id);
  result.findings=[...new Map([...result.findings,...db.findings.filter(f=>f.client_id===cid&&findingApplies(row,f,new Set(rids),db.framework_assessments))].map(r=>[r.finding_id,r])).values()];
  const fids=result.findings.map(f=>f.finding_id);
  result.tasks=[...new Map([...result.tasks,...db.tasks.filter(t=>t.client_id===cid&&(t.finding_id?fids.includes(t.finding_id):!t.framework_assessment_id&&rids.includes(t.review_id)))].map(r=>[r.task_id,r])).values()];
  result.evidence=[...new Map([...result.evidence,...db.evidence.filter(e=>e.client_id===cid&&['review','reviews'].includes(e.linked_type)&&rids.includes(e.linked_id))].map(r=>[r.evidence_id,r])).values()];
  if(row.framework_key==='cis-ig1')result.evidence=[...new Map([...result.evidence,...db.evidence.filter(e=>e.client_id===cid&&e.relationships?.some(l=>l.kind==='reviews'&&rids.includes(l.id)))].map(e=>[e.evidence_id,e])).values()];
  result.evidence=result.evidence.filter(e=>!e.archived_at&&!row.unlinked_evidence_ids?.includes(e.evidence_id));
  return result;
}
export function frameworkReverse(db,kind,source,result){
  if(kind==='framework_assessments')return frameworkRelated(db,source);
  const fid=source.finding_id,aid=source.framework_assessment_id||(kind==='evidence'&&['framework_assessment','framework_assessments'].includes(source.linked_type)?source.linked_id:null)||db.findings.find(f=>f.client_id===source.client_id&&f.finding_id===fid)?.framework_assessment_id;
  result.framework_assessments=(db.framework_assessments||[]).filter(a=>a.client_id===source.client_id&&(a.framework_assessment_id===aid||a.related_links?.some(l=>l.kind===kind&&l.id===source[ids[kind]])||(kind==='reviews'&&a.framework_key===source.framework_key&&source.framework_safeguards?.includes(a.definition_id))||(kind==='policies'&&frameworkCatalog(a.framework_key)?.policy_mappings.some(m=>m.policy_key===source.baseline_key&&m.safeguards.includes(a.definition_id)))))
    .filter(a=>kind!=='evidence'||!a.unlinked_evidence_ids?.includes(source.evidence_id)).map(a=>({...a,title:assessmentTitle(a)}));
  const finding=kind==='tasks'?db.findings.find(f=>f.client_id===source.client_id&&f.finding_id===source.finding_id):source;
  const explicitFinding=(db.framework_assessments||[]).filter(a=>a.client_id===source.client_id&&(a.framework_assessment_id===finding?.framework_assessment_id||a.related_links?.some(l=>l.kind==='findings'&&l.id===finding?.finding_id)));
  if(['tasks','findings'].includes(kind))result.framework_assessments=[...new Map([...result.framework_assessments,...explicitFinding.map(a=>({...a,title:assessmentTitle(a)}))].map(a=>[a.framework_assessment_id,a])).values()];
  if(['tasks','findings'].includes(kind)&&source.review_id&&!aid&&!explicitFinding.length){
    const review=db.reviews.find(r=>r.review_id===source.review_id&&r.client_id===source.client_id);
    if(review){const parent=frameworkReverse(db,'reviews',review,{}).framework_assessments;result.framework_assessments=[...new Map([...result.framework_assessments,...parent].map(a=>[a.framework_assessment_id,a])).values()];}
  }
  return result;
}
export function frameworkRequest(db,path,method,params,body){
  db.framework_assessments||=[];
  const [,kind,id,operation]=path.split('/');
  if(kind==='frameworks'&&id==='cis-ig1'&&operation==='configuration'&&method==='patch'){
    frameworkScope(db,body.client_id);
    if(!['super_admin','platform_admin'].includes(db.user.role))fail('Program configuration requires a service-provider administrator',403);
    if(!db.baselines?.[body.client_id]?.completed)fail('Complete onboarding before adjusting program configuration',409);
    if(!db.requirements.some(r=>r.client_id===body.client_id&&r.baseline_key==='cis-ig1'&&r.baseline_response==='applies'))fail('Select CIS Applies before configuring its scope',409);
    const config=validateCisConfiguration(body),client=record(db,'clients',body.client_id),before=cisConfiguration(client);
    if(!Object.hasOwn(body,'expected_updated_at'))fail('Reload the record before saving; an edit version is required',428);
    if(body.expected_updated_at!==before.expected_updated_at)fail('Record changed since it was opened; reload before saving',409);
    if(config.implementation_group<before.implementation_group&&(!body.confirm_reduction||!body.reason?.trim()||!body.effective_date))fail('Scope reduction requires impact confirmation, reason and effective date; assessments, links and open work are retained');
    reconcileFramework(db,body.client_id,{...db.baselines[body.client_id],requirements:{'cis-ig1':'applies'},framework_settings:{'cis-ig1':config}});
    client.framework_settings={...client.framework_settings,'cis-ig1':config};
    client.cis_configuration_updated_at=new Date(Math.max(Date.now(),(Date.parse(before.expected_updated_at)||0)+1)).toISOString();
    client.cis_scope_change={before:before.implementation_group,after:config.implementation_group,reason:body.reason||'',effective_date:body.effective_date||new Date().toISOString().slice(0,10),changed_by:db.user.user_id,updated_at:client.cis_configuration_updated_at};
    audit(db,'CIS scope updated','clients',client,client.cis_scope_change);
    return {...config,expected_updated_at:client.cis_configuration_updated_at};
  }
  if(kind==='frameworks'&&id==='soc-2'&&operation==='configuration'&&method==='patch'){
    frameworkScope(db,body.client_id);writable(db);
    if(!db.baselines?.[body.client_id]?.completed)throw new Error('Complete onboarding before adjusting program configuration');
    if(!db.requirements.some(r=>r.client_id===body.client_id&&r.baseline_key==='soc-2'&&r.baseline_response==='applies'))throw new Error('Select SOC 2 Applies before configuring its scope');
    const config=validateSocConfiguration(body),client=record(db,'clients',body.client_id);
    if(Object.prototype.hasOwnProperty.call(body,'expected_updated_at')&&body.expected_updated_at!==(client.soc_configuration_updated_at??null))throw new Error('Record changed since it was opened; reload before saving');
    client.framework_settings={...client.framework_settings,'soc-2':config};
    client.soc_configuration_updated_at=new Date(Math.max(Date.now(),(Date.parse(client.soc_configuration_updated_at)||0)+1)).toISOString();
    reconcileFramework(db,body.client_id,{...db.baselines[body.client_id],requirements:{'soc-2':'applies'}});
    audit(db,'SOC 2 readiness scope updated','clients',client,{categories:config.categories,period_start:config.period_start,period_end:config.period_end});
    return {...config,expected_updated_at:client.soc_configuration_updated_at};
  }
  if(kind==='frameworks'&&method==='get'){
    frameworkScope(db,params.client_id);const framework=FRAMEWORKS.find(f=>f.key===id);if(!framework)throw new Error('Framework not found');
    const assessments=framework.implemented?db.framework_assessments.filter(a=>a.client_id===params.client_id&&a.framework_key===id):[];
    const configuration=id==='cis-ig1'?cisConfiguration(record(db,'clients',params.client_id)):id==='soc-2'?socConfiguration(record(db,'clients',params.client_id)):{};
    if(id==='cis-ig1'&&operation==='export'){
      const active=new Set(activeDefinitions(id,configuration).map(d=>d.id)),fields=['framework_assessment_id','definition_id','title','scope_group','in_active_scope','client_implementation_group','status','verification','implementation','owner_id','process_owner_id','last_assessed','notes','related_links'];
      const cell=value=>{let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
      const includeRetained=params.include_retained===true||params.include_retained==='true';
      const selected=assessments.filter(r=>includeRetained||active.has(r.definition_id)).sort((a,b)=>a.definition_id.localeCompare(b.definition_id,undefined,{numeric:true}));
      const lines=selected.map(row=>{const d=frameworkDefinition(id,row.definition_id),values={...row,title:d.title,scope_group:d.implementation_group>1?`Added in IG${d.implementation_group}`:'IG1 baseline',in_active_scope:active.has(row.definition_id),client_implementation_group:configuration.implementation_group,verification:row.verification||'not_verified'};return fields.map(f=>cell(typeof values[f]==='object'&&values[f]!==null?JSON.stringify(values[f]):values[f])).join(',');});
      audit(db,'CIS assessment export','clients',record(db,'clients',params.client_id),{implementation_group:configuration.implementation_group,include_retained:includeRetained});
      return new Blob([[fields.join(','),...lines].join('\r\n')],{type:'text/csv;charset=utf-8'});
    }
    return {framework,selected:db.requirements.some(r=>r.client_id===params.client_id&&r.baseline_key===id&&r.baseline_response==='applies'),configured:!!assessments.length,
      definitions:(frameworkCatalog(id)?.requirements||[]).filter(d=>assessments.some(a=>a.definition_id===d.id)),assessments,configuration,
      organizational_controls:id==='soc-2'?(db.organizational_controls||[]).filter(c=>c.client_id===params.client_id).map(c=>({control_id:c.control_id,legacy_id:c.legacy_id,assessment_ids:c.assessment_ids,design:c.design,conflicts:c.conflicts,observations:c.observations.map(o=>({operating:o.operating,expected_instances:o.expected_instances,collected_instances:o.collected_instances}))})):[],
      work:Object.fromEntries(assessments.map(a=>[a.framework_assessment_id,assessmentWork(a,db)])),active_definition_ids:activeDefinitions(id,configuration).map(d=>d.id)};
  }
  const row=record(db,'framework_assessments',id);frameworkScope(db,row.client_id);if(method!=='get')writable(db);
  const pilot=()=>{if(!pilotEnabled(row.client_id,row.framework_key,cisConfiguration(record(db,'clients',row.client_id)),row.definition_id))fail('Guided pilot is not enabled for this assessment',404);};
  const draftKey=id+':'+db.user.user_id;
  const readDraft=()=>db.guided_assessment_pilot?.[draftKey]||{version:guidedCatalog.version,answers:{},step:0,completed:false,revision:0};
  if(operation==='guided-assessment'){
    pilot();
    if(method==='get')return readDraft();
    if(method!=='put')fail('Method not allowed',405);
    if(db.user.role==='client_contributor'&&row.owner_id!==db.user.user_id)fail('Forbidden',403);
    if(Object.keys(body).some(k=>!['version','answers','step','completed','narrative','expected_revision'].includes(k))||body.version!==guidedCatalog.version||!Number.isInteger(body.step)||body.step<0||body.step>30||typeof body.completed!=='boolean'||typeof (body.narrative??'')!=='string'||(body.narrative||'').length>20000)fail('Invalid interview');
    validateAnswers(row.definition_id,body.answers);
    const old=readDraft();if(old.revision!==body.expected_revision)fail('Interview changed; reload before saving',409);
    const at=now(),data={version:body.version,answers:body.answers,narrative:body.narrative||'',step:body.step,completed:body.completed,revision:old.revision+1,updated_at:at,generated_at:body.completed?at:null};
    (db.guided_assessment_pilot||={})[draftKey]=data;return data;
  }
  if(method==='post'&&operation==='reviews'){
    if(Object.keys(body).some(k=>!['plan_key','review_id','title','owner_id','recurrence','custom_recurrence_days','due_date'].includes(k)))throw new Error('Invalid Review setup fields');
    if(!db.requirements.some(r=>r.client_id===row.client_id&&r.baseline_key===row.framework_key&&r.baseline_response==='applies'))throw new Error('Activate the program before configuring Reviews');
    const catalog=frameworkCatalog(row.framework_key),client=record(db,'clients',row.client_id),configuration=row.framework_key==='cis-ig1'?cisConfiguration(client):socConfiguration(client);
    if(!activeDefinitions(row.framework_key,configuration).some(d=>d.id===row.definition_id))fail('This assessment is retained outside the active program scope; existing work and history remain available',409);
    const plan=activePlans(row.framework_key,configuration).find(p=>p.key===body.plan_key&&p.safeguards.includes(row.definition_id));
    if(body.plan_key&&!plan)throw new Error('Review plan does not map to this requirement');
    let review=body.review_id?record(db,'reviews',body.review_id):plan?existingFrameworkReview(db.reviews.filter(r=>r.client_id===row.client_id),plan):null;
    if(review&&review.client_id!==row.client_id)throw new Error('Relationship must belong to this client');
    const canonical=Object.entries(CATALOGS).flatMap(([key,c])=>c.review_plans.map(p=>({key,plan:p}))).find(p=>plan?.baseline_key&&p.plan.baseline_key===plan.baseline_key);
    const rid=stable(row.client_id,'review',plan?(canonical?.plan.key||plan.key):'requirement:'+row.definition_id,canonical?.key||row.framework_key);
    review||=db.reviews.find(r=>(r.review_id===rid||r.framework_setup_key===rid)&&r.client_id===row.client_id);
    if(!review){
      if(typeof body.title!=='string'||!body.title.trim()||body.title.length>500||!CADENCES.includes(body.recurrence))throw new Error('Review title and valid cadence are required');
      if(body.due_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)||calendarDay(body.due_date)===null))throw new Error('Invalid Review date');
      if(body.recurrence==='custom'&&(!Number.isInteger(body.custom_recurrence_days)||body.custom_recurrence_days<1||body.custom_recurrence_days>3650))throw new Error('Custom cadence must be 1–3650 days');
      review=write(db,'reviews',{client_id:row.client_id,title:body.title.trim(),review_type:plan?.review_type||'requirements',owner_id:body.owner_id||null,recurrence:body.recurrence,custom_recurrence_days:body.custom_recurrence_days,due_date:body.due_date||null,status:body.due_date?'upcoming':'needs_scheduling',framework_key:row.framework_key,framework_plan_key:plan?.key,baseline_key:plan?.baseline_key,framework_safeguards:plan?.safeguards||[row.definition_id],framework_basis:plan?.basis,framework_source_cadence:plan?.source_cadence,framework_setup_key:rid});
    }
    if(plan)addReviewDriver(review,row.framework_key,plan);
    let changed=false;
    for(const a of db.framework_assessments.filter(a=>a.client_id===row.client_id&&a.framework_key===row.framework_key&&(plan?.safeguards||[row.definition_id]).includes(a.definition_id))){a.related_links||=[];if(!a.related_links.some(l=>l.kind==='reviews'&&l.id===review.review_id)){a.related_links.push({kind:'reviews',id:review.review_id});changed=true;}}
    if(changed)audit(db,'Framework Review linked','framework_assessments',row,{review_id:review.review_id});return review;
  }
  if(method==='get'&&!operation)return row;
  if(method==='get'&&operation==='related')return frameworkRelated(db,row);
  if(method==='get'&&operation==='activity')return db.logs.filter(l=>l.client_id===row.client_id&&l.entity_id===id);
  if(method==='patch'&&!operation){
    if(Object.prototype.hasOwnProperty.call(body,'expected_last_assessed')&&body.expected_last_assessed!==(row.last_saved??row.last_assessed??null))fail('Assessment changed since it was opened; reload before saving',409);
    body={...body};delete body.expected_last_assessed;
    if('guided_assessment_source' in body){
      pilot();
      if(body.guided_assessment_source){
        const draft=readDraft(),source=body.guided_assessment_source;
        if(!draft.completed||Object.keys(source).length!==3||['version','revision','generated_at'].some(k=>source[k]!==draft[k]))fail('Guided result changed; regenerate before applying',409);
        body.guided_assessment_source={...source,origin:'guided-assessment-pilot',answers:JSON.parse(JSON.stringify(draft.answers)),by:db.user.user_id};
      }
    }else if(row.guided_assessment_source&&['implementation','status'].some(k=>k in body&&body[k]!==row[k]))body.guided_assessment_source=null;
    const recordAssessment=body.record_assessment===true;
    if('record_assessment' in body&&(row.framework_key!=='soc-2'||typeof body.record_assessment!=='boolean'))fail('Explicit assessment recording applies only to SOC 2');
    delete body.record_assessment;
    const ownershipOnly=Object.keys(body).length>0&&Object.keys(body).every(k=>['owner_id','process_owner_id'].includes(k))&&!recordAssessment;
    const supported=frameworkCapabilities(row.framework_key);
    const fields=['status','implementation','technology','notes','na_rationale','owner_id','process_owner_id','addressable_decision','addressable_rationale','soa_applicability','soa_justification','management_controls','csf_profile',...['cis_assessment_criteria','soc_assessment_checks','cis_operation'].filter(k=>supported.includes(k)),...(row.framework_key==='iso-27001'?['iso_assessment_checks']:[]),...('guided_assessment_source' in body||'guided_assessment_source' in row?['guided_assessment_source']:[])];
    if('cis_operation' in body){
      if(!supported.includes('cis_operation'))fail('Operating arrangements apply only to CIS IG1');
      const op=body.cis_operation;
      if(!op||typeof op!=='object'||Array.isArray(op)||Object.keys(op).some(k=>!['provider','confirmed'].includes(k))||('provider' in op&&typeof op.provider!=='string')||(op.provider||'').length>2000||('confirmed' in op&&typeof op.confirmed!=='boolean'))fail('Invalid CIS operating arrangement');
      body.cis_operation={provider:op.provider??'',confirmed:op.confirmed??false};
      const proposed={...row,...body};
      if(body.cis_operation.confirmed&&(!(proposed.owner_id||proposed.process_owner_id)||!proposed.implementation?.trim()))fail('Record an accountable person and operating method before confirming the arrangement');
    }
    if(row.cis_operation&&!('cis_operation' in body)&&['owner_id','process_owner_id','implementation'].some(k=>k in body&&body[k]!==row[k]))body.cis_operation={...row.cis_operation,confirmed:false};
    if('soc_assessment_checks' in body){
      if(!supported.includes('soc_assessment_checks'))fail('SOC assessment guidance applies only to SOC 2');
      const valid=new Set((socGuidance.criteria[row.definition_id]?.items||[]).map(c=>c.id));
      if(!Array.isArray(body.soc_assessment_checks)||body.soc_assessment_checks.length>30||body.soc_assessment_checks.some(c=>!valid.has(c)))fail('Invalid SOC assessment guidance checks');
      body.soc_assessment_checks=[...new Set(body.soc_assessment_checks)];
    }
    if('cis_assessment_criteria' in body){
      if(!supported.includes('cis_assessment_criteria'))fail('CIS assessment criteria apply only to CIS Controls IG1');
      const entry=cisCriteria.requirements[row.definition_id]||{};
      const valid=new Set([...(entry.criteria||[]),...(entry.legacy_criteria||[])].map(c=>c.id));
      if(!Array.isArray(body.cis_assessment_criteria)||body.cis_assessment_criteria.length>20||body.cis_assessment_criteria.some(c=>!valid.has(c)))fail('Invalid CIS assessment criteria');
      body.cis_assessment_criteria=[...new Set(body.cis_assessment_criteria)];
    }
    if('iso_assessment_checks' in body){
      if(row.framework_key!=='iso-27001')fail('ISO assessment checks apply only to ISO 27001');
      const entry=isoCriteria.requirements[row.definition_id]||{};
      const valid=new Set([...(entry.coverage==='verified'?entry.criteria.map(c=>c.id):[]),...(row.iso_assessment_checks||[])]);
      if(!Array.isArray(body.iso_assessment_checks)||body.iso_assessment_checks.length>30||body.iso_assessment_checks.some(c=>typeof c!=='string'||!valid.has(c)))fail('Invalid ISO assessment checks');
      body.iso_assessment_checks=[...new Set(body.iso_assessment_checks)];
    }
    if(Object.keys(body).some(k=>!fields.includes(k)&&!VERIFICATION_FIELDS.includes(k)))fail('Unknown or immutable assessment fields');
    const verificationAllowed=supported.includes('verification');
    if('verification' in body&&!verificationAllowed)fail('Verification is available only for CIS Controls IG1 and SOC 2');
    if('verification_checklist' in body){
      if(!supported.includes('verification_checklist'))fail('Verification checklists apply only to CIS Controls IG1');
      body={...body};
      body.verification_checklist=validateVerificationChecklist(body.verification_checklist,row.definition_id);
    }
    if('verification' in body&&body.verification!==null&&!VERIFICATION_STATES.includes(body.verification))throw new Error('Invalid verification state');
    const historyFields=row.framework_key==='cis-ig1'?[...fields,...VERIFICATION_FIELDS]:verificationAllowed?[...fields,'verification']:fields;
    if('csf_profile' in body){
      if(!supported.includes('csf_profile'))fail('CSF profile fields apply only to NIST CSF');
      body={...body,csf_profile:validateCsfProfile(body.csf_profile)};
    }
    if('management_controls' in body){
      if(!supported.includes('management_controls'))fail('Management control readiness fields apply only to SOC 2');
      if(JSON.stringify(body.management_controls)!==JSON.stringify(row.management_controls||[])&&(row.controls_migrated||db.organizational_controls?.some(c=>c.client_id===row.client_id&&(c.assessment_ids.includes(id)||c.legacy_sources.some(s=>s.assessment_id===id)))))throw new Error('Legacy descriptions are preserved. Edit the shared organizational Control instead');
      body={...body,management_controls:validateManagementControls(body.management_controls)};
    }
    const data={...row,...body};if(!ASSESSMENT_STATUSES[data.status]||['implementation','technology','notes','na_rationale'].some(k=>typeof data[k]!=='string'))throw new Error('Invalid assessment');
    if(recordAssessment&&data.status==='not_assessed')fail('Choose an assessment status before recording an assessment');
    const definition=frameworkDefinition(row.framework_key,row.definition_id);
    if(data.status==='not_applicable'&&definition?.specification!=='annex_control'&&!data.na_rationale.trim())throw new Error('N/A rationale is required');
    if(data.status==='addressed'&&!data.implementation.trim())throw new Error('Describe implementation before marking Addressed');
    if(body.soa_applicability!=null&&!['','included','excluded'].includes(body.soa_applicability))throw new Error('Invalid SoA applicability');
    if(body.soa_justification!=null&&(typeof body.soa_justification!=='string'||body.soa_justification.length>4000))throw new Error('Invalid SoA justification');
    if(definition?.specification==='isms_clause'&&data.status==='not_applicable')throw new Error('ISMS clauses 4–10 cannot be excluded for conformity');
    if(definition?.specification==='annex_control'){
      const applicability=data.soa_applicability||'';
      if(applicability&&!data.soa_justification?.trim())throw new Error('Document the SoA inclusion or exclusion justification');
      // SoA applicability and implementation are independent decisions.
    }else if(body.soa_applicability||body.soa_justification)throw new Error('SoA fields apply only to Annex A controls');
    if(body.addressable_decision!=null&&!['','as_written','equivalent_alternative','not_reasonable_appropriate'].includes(body.addressable_decision))throw new Error('Invalid addressability decision');
    if(body.addressable_rationale!=null&&(typeof body.addressable_rationale!=='string'||body.addressable_rationale.length>4000))throw new Error('Invalid addressability rationale');
    if(definition?.specification==='addressable'){
      if(data.status==='not_applicable')throw new Error('Addressable is not optional; record an addressability decision instead of N/A');
      if(data.status==='addressed'&&(!data.addressable_decision||!data.addressable_rationale?.trim()))throw new Error('Document the addressability decision and rationale before marking Addressed');
    }else if(body.addressable_decision||body.addressable_rationale)throw new Error('Addressability fields apply only to addressable specifications');
    validateAssignment(db, 'framework_assessments', data, row);
    if(data.process_owner_id&&!db.contacts.some(c=>c.client_id===row.client_id&&c.contact_id===data.process_owner_id))throw new Error('Process owner must be a client Contact');
    const changed=Object.keys(body).filter(k=>['verification_checklist','cis_assessment_criteria','soc_assessment_checks','iso_assessment_checks','cis_operation'].includes(k)?JSON.stringify(body[k])!==JSON.stringify(row[k]??null):body[k]!==row[k]);
    if(changed.length||recordAssessment){
      const at=new Date(Math.max(Date.now(),(Date.parse(row.last_saved??row.last_assessed)||0)+1)).toISOString();
      if(row.framework_key==='soc-2'&&!ownershipOnly){
        const judgment=recordAssessment||(changed.includes('status')&&data.status!=='not_assessed');
        Object.assign(body,{last_saved:at,assessment_recorded_at:judgment?at:row.assessment_recorded_at??null,assessment_recorded_by:judgment?db.user.user_id:row.assessment_recorded_by??null});
        historyFields.push('last_saved','assessment_recorded_at','assessment_recorded_by');
      }
      Object.assign(row,body,{last_saved:at});
      if(!ownershipOnly){
        Object.assign(row,{last_assessed:at,assessed_by:db.user.user_id});
        (row.assessment_history||=[]).push({...Object.fromEntries(historyFields.map(k=>[k,row[k]])),at,by:row.assessed_by});
      }
      audit(db,'Framework assessment updated','framework_assessments',row,{changed_fields:changed,status:row.status});
    }
    return row;
  }
  if(method==='post'&&operation==='links'){
    if(!['reviews','findings','tasks','risks','policies','evidence','requirements','vendors'].includes(body.kind))throw new Error('Unsupported relationship');
    const target=record(db,body.kind,body.id);if(target.client_id!==row.client_id)throw new Error('Relationship must belong to this client');
    if(body.kind==='evidence')row.unlinked_evidence_ids=(row.unlinked_evidence_ids||[]).filter(id=>id!==body.id);
    if(!row.related_links.some(l=>l.kind===body.kind&&l.id===body.id))row.related_links.push({kind:body.kind,id:body.id});audit(db,'Framework record linked','framework_assessments',row,body);return {ok:true};
  }
  if(method==='delete'&&operation==='links'){
    if(body.kind!=='evidence')throw new Error('Only Evidence relationships can be unlinked here');
    const target=record(db,'evidence',body.id);if(target.client_id!==row.client_id)throw new Error('Relationship must belong to this client');
    row.related_links=row.related_links.filter(l=>!(l.kind==='evidence'&&l.id===body.id));
    row.unlinked_evidence_ids=[...new Set([...(row.unlinked_evidence_ids||[]),body.id])];
    audit(db,'Framework Evidence unlinked','framework_assessments',row,body);return {ok:true};
  }
  if(method==='post'&&operation==='findings'){
    if(!body.title?.trim()||!body.remediation_title?.trim()||!body.request_id||!['low','medium','high','critical'].includes(body.severity||'medium'))throw new Error('Finding and Action titles, valid severity and request ID are required');
    const fid=stable(row.client_id,'finding',id+':'+body.request_id);let f=db.findings.find(f=>f.finding_id===fid);
    // A departed or out-of-scope safeguard owner is never copied onto new work; the Finding starts unassigned.
    let owner=row.owner_id&&eligible(db.users.find(u=>u.user_id===row.owner_id),row.client_id)?row.owner_id:null;
    // Optional at creation, as in the backend: an explicit owner must be eligible; a target date must be valid.
    if(Object.prototype.hasOwnProperty.call(body,'owner_id')){owner=body.owner_id||null;if(owner&&!eligible(db.users.find(u=>u.user_id===owner),row.client_id))throw new Error('Finding owner must be an active user with access to this client');}
    const due=body.due_date?calendarDay(body.due_date):null;
    if(body.due_date&&due===null)throw new Error('Enter a valid target date');
    if(!f){f={finding_id:fid,client_id:row.client_id,title:body.title.trim(),description:body.description||'',severity:body.severity||'medium',status:'open',framework_assessment_id:id,source:assessmentTitle(row),owner_id:owner,due_date:due===null?null:new Date(due*86400000).toISOString().slice(0,10),remediation_title:body.remediation_title.trim(),created_at:now(),updated_at:now()};validateAssignment(db, 'findings', f);db.findings.push(f);audit(db,'Finding raised','framework_assessments',row,{finding_id:fid});audit(db,'create','findings',f);}
    action(db,'findings',fid,'create-task',{title:f.remediation_title});return f;
  }
  throw new Error('Unsupported framework operation; assessment history is retained');
}
