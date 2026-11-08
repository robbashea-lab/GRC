import baseline from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS,activePlans} from '../lib/frameworks';
import {reviewSchedule,reviewView} from '../lib/reviewOccurrences';
import {assessedRisk} from '../lib/grcWork';
import {AI_DEFAULTS} from '../lib/aiGovernance';
import {AI_PILOT_DEFAULTS} from '../lib/brawndoAI';
import {reconcileFramework} from './frameworks';
import {ensureRiskReview} from './risks';
import {ensureVendorReviews} from './vendors';
import {allocateRiskId} from './riskIds';
import {CIS_DEMO_REVISION,CIS_DEMO_SCENARIOS,cisDemoSelection} from './cisDemoSelection';
import {seedCisScenarioHistory} from './cisDemoHistory';

const clone=value=>JSON.parse(JSON.stringify(value));
// Compact change detection only, never authorization or sufficient proof for deleting a record.
function seedFingerprint(row){const text=JSON.stringify(row);let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return `${text.length}:${hash>>>0}`;}
const identity={policies:'policy_id',reviews:'review_id',contacts:'contact_id',framework_assessments:'framework_assessment_id',risks:'risk_id',vendors:'vendor_id',assets:'asset_id',findings:'finding_id',tasks:'task_id',evidence:'evidence_id',ai_systems:'ai_system_id'};
const dateAt=(clock,days)=>new Date(+clock+days*86400000).toISOString().slice(0,10);
const atDay=day=>day+'T12:00:00.000Z';
function priorMonth(day,months){const d=new Date(atDay(day)),n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);d.setUTCDate(Math.min(n,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.toISOString().slice(0,10);}
const selectedState=(selection,at)=>({version:3,step:3,completed:true,updated_at:at,selected_policy_keys:selection.selected_policy_keys,
  policies:Object.fromEntries(selection.selected_policy_keys.map(key=>[key,'yes'])),reviews:[],framework_reviews:{},
  requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),framework_settings:{'cis-ig1':{implementation_group:selection.implementation_group}}});

function seedAI(db,scenario,risk,vendor,owner,clock){
  const cid=scenario.client_id,day=days=>dateAt(clock,days),aiId=cid+'_ai_drafting';db.ai_systems||=[];db.ai_systems.push({...AI_DEFAULTS,...AI_PILOT_DEFAULTS,ai_system_id:aiId,display_id:'AI-001',client_id:cid,name:`${scenario.name} internal procedure drafting assistant`,description:'A fictional staff assistant drafts internal operating instructions; a human checks each output before use.',owner_id:owner,technical_owner_id:owner,oversight_owner_id:owner,provider:'Fictional managed assistant provider',vendor_id:vendor.vendor_id,product_model:'Internal drafting assistant',status:'active',approval_status:'pending_assessment',purposes:['Content Generation'],data_types:['Internal'],permitted_data_types:['Internal'],access:[],roles:[],screening:{},human_review_required:true,human_approval_required:true,oversight_notes:'Staff verify accuracy; no sensitive customer data or autonomous changes.',environment:'Managed internal workspace',restrictions:'No autonomous actions or customer decisions.',data_settings:'Synthetic internal examples only.',related_links:[{kind:'risks',id:risk.risk_id}],created_at:atDay(day(-120)),updated_at:atDay(day(-20))});
  db.ai_counters||={};db.ai_counters[cid]=Math.max(db.ai_counters[cid]||0,1);
  db.reviews.push(reviewView({review_id:cid+'_review_ai',client_id:cid,ai_system_id:aiId,ai_review_purpose:'periodic',title:'AI use and oversight review',review_type:'security',owner_id:owner,due_date:day(45),recurrence:'quarterly',status:'upcoming',created_at:atDay(day(-120)),updated_at:atDay(day(-20)),occurrences:[]}));
}

function addClient(db,scenario,clock){
  const cid=scenario.client_id,at=atDay(dateAt(clock,-420)),selection=cisDemoSelection(scenario.implementation_group),state=selectedState(selection,at);
  const client={client_id:cid,name:scenario.name,status:'active',environment:'Demo',created_at:at,updated_at:at,
    assigned_owner_id:'demo_admin',primary_contact_id:cid+'_contact_0',framework_settings:state.framework_settings,onboarding_baseline:state,
    initial_program_baseline:{state:clone(state),completed_at:at,completed_by:'demo_admin',policies:selection.selected_policy_keys.length,reviews:selection.selected_framework_plan_keys.length},
    notes:'Fictional CIS-only program. Sample operating records are not a certification or compliance determination.'};
  db.clients.push(client);db.baselines[cid]=state;
  for(const item of baseline.requirements)db.requirements.push({requirement_id:cid+'_requirement_'+item.key,client_id:cid,baseline_key:item.key,title:item.name,category:item.category,
    baseline_response:state.requirements[item.key]||'does_not_apply',applicability:item.key==='cis-ig1'?'applicable':'not_applicable',status:'under_review',created_at:at,updated_at:at});
  // These are simulated Demo cohort entries, not application accounts or grants.
  for(const user of [...db.users,db.user].filter(Boolean))if(user.user_id==='demo_admin'&&!(user.client_ids||[]).includes(cid))(user.client_ids||=[]).push(cid);
  return client;
}

function populateScenario(db,client,scenario,clock,{preserveCreation=false}={}){
  const cid=client.client_id,selection=cisDemoSelection(scenario.implementation_group),day=days=>dateAt(clock,days),at=atDay(day(-420)),owner='demo_admin';
  const state=selectedState(selection,at);
  db.baselines[cid]=state;client.onboarding_baseline=clone(state);client.framework_settings={...client.framework_settings,...state.framework_settings};
  scenario.people.forEach((name,i)=>{const id=cid+'_contact_'+i;if(!db.contacts.some(c=>c.contact_id===id))db.contacts.push({contact_id:id,client_id:cid,name,title:['Program coordinator','Executive sponsor','Technology owner'][i],role:['Program coordinator','Executive sponsor','Technology owner'][i],status:'active',created_at:at,updated_at:at});});
  const processOwner=db.contacts.find(contact=>contact.client_id===cid&&contact.name===scenario.people[2]);
  client.primary_contact_id||=cid+'_contact_0';
  const existingReviews=new Set(db.reviews),existingLogs=new Set(db.logs);
  reconcileFramework(db,cid,state);
  // These new fictional rows have never been persisted or exposed. Stable seed
  // identities keep repeated same-day construction identical; native saves keep UIDs.
  const renamed=new Map();
  for(const review of db.reviews.filter(row=>row.client_id===cid&&!existingReviews.has(row))){
    const target=`${cid}_framework_${review.framework_plan_key}`;
    if(!review.framework_plan_key||db.reviews.some(row=>row!==review&&row.review_id===target))throw new Error('Fictional Review identity collision');
    renamed.set(review.review_id,target);
    const oldId=review.review_id;review.review_id=target;
    if(review.current_occurrence_id==='occ_'+oldId)review.current_occurrence_id='occ_'+target;
    else if(review.current_occurrence_id?.startsWith(oldId+'_'))review.current_occurrence_id=target+review.current_occurrence_id.slice(oldId.length);
    for(const occurrence of review.occurrences||[]){
      if(occurrence.review_id===oldId)occurrence.review_id=target;
      if(occurrence.occurrence_id==='occ_'+oldId)occurrence.occurrence_id='occ_'+target;
      else if(occurrence.occurrence_id?.startsWith(oldId+'_'))occurrence.occurrence_id=target+occurrence.occurrence_id.slice(oldId.length);
    }
  }
  for(const assessment of db.framework_assessments.filter(row=>row.client_id===cid))for(const link of assessment.related_links||[])if(link.kind==='reviews'&&renamed.has(link.id))link.id=renamed.get(link.id);
  const generatedLogs=db.logs.filter(row=>row.client_id===cid&&!existingLogs.has(row));
  for(const [index,log] of generatedLogs.entries()){
    if(log.entity_type==='reviews'&&renamed.has(log.entity_id))log.entity_id=renamed.get(log.entity_id);
    const target=`${cid}_fixture_audit_${log.entity_id}_${log.action}_${index}`;
    if(db.logs.some(row=>row!==log&&row.audit_id===target))throw new Error('Fictional audit identity collision');
    log.audit_id=target;
  }
  const plans=activePlans('cis-ig1',{implementation_group:scenario.implementation_group}).filter(p=>p.default_enabled!==false);
  for(const [i,plan] of plans.entries()){
    const row=db.reviews.find(r=>r.client_id===cid&&r.framework_plan_key===plan.key);
    if(!row)continue;
    const due=day(i===0?-5:i===1?10:35+i*3),months={monthly:1,quarterly:3,semiannual:6,annual:12}[plan.default_cadence];
    Object.assign(row,{title:plan.title,owner_id:owner,reviewer_id:owner,recurrence:plan.default_cadence,custom_recurrence_days:plan.default_custom_recurrence_days,due_date:due,created_at:preserveCreation?row.created_at:at,updated_at:preserveCreation?clock.toISOString():atDay(day(-3)),status:i===1?'in_progress':'upcoming',occurrences:[]});
    for(let n=Math.ceil(24/months);n>=1;n--){const scheduled=priorMonth(due,n*months);if(Date.parse(atDay(scheduled))>+clock||scheduled<priorMonth(day(0),12))continue;row.occurrences.push({...reviewView({...row,due_date:scheduled,occurrences:[]}),occurrences:undefined,
      occurrence_id:row.review_id+'_'+scheduled,status:'completed',due_date:atDay(scheduled),completed_at:atDay(scheduled),completion_date:atDay(scheduled),completed_by:owner,completed_by_name:'Demo administrator',outcome:'no_findings',finding_count:0,evidence:[],conclusion:'Fictional operating review completed; mapped duties and exceptions were inspected.',tested_scope:scenario.service,checklist_confirmed:true,no_evidence_reason:'Synthetic fixture summary; linked operating samples are illustrative.'});}
    const anchor=reviewSchedule(row,true).schedule_anchor;
    const last=row.occurrences.at(-1);
    if(last)row.due_date=reviewSchedule({...row,due_date:last.due_date,recurrence_due_date:null,schedule_anchor:anchor}).next_review_date.slice(0,10);
    Object.assign(row,{schedule_anchor:anchor},reviewSchedule({...row,schedule_anchor:anchor}),reviewView({...row,schedule_anchor:anchor}));
    state.framework_reviews[plan.key]={enabled:true,recurrence:row.recurrence,due_date:row.due_date};
  }
  const assessments=db.framework_assessments.filter(a=>a.client_id===cid&&a.framework_key==='cis-ig1');
  for(const [i,row] of assessments.entries()){
    const status=['addressed','addressed','in_progress','addressed','needs_attention','not_assessed'][(i+scenario.implementation_group)%6],assessed=day(-7-i%14);
    Object.assign(row,{status,owner_id:owner,process_owner_id:processOwner.contact_id,technology:scenario.implementation_group===2?'Managed Microsoft 365 and Initech service platform':'Managed ordering terminals, network segmentation and restaurant service platform',
      implementation:status==='not_assessed'?'':`${scenario.name}: the technology owner maintains ${row.definition_id} operating procedures and scoped records. ${status==='addressed'?'Sample execution was reviewed.':'Coverage gaps remain tracked for follow-up.'}`,
      notes:status==='not_assessed'?'':`Fictional assessment of ${scenario.service.toLowerCase()}; the recorded judgement is not certification.`,last_assessed:status==='not_assessed'?null:assessed,last_saved:status==='not_assessed'?null:preserveCreation?clock.toISOString():atDay(assessed),created_at:preserveCreation?row.created_at:at,fixture_history_origin_at:at,updated_at:preserveCreation?clock.toISOString():atDay(assessed),assessment_history:[]});
    if(status!=='not_assessed')for(const months of [12,6,3,1])row.assessment_history.push({at:atDay(priorMonth(day(0),months)),by:owner,status:months===1?status:months===3?(i%3===0?'in_progress':'needs_attention'):months===6&&i%5===0?'in_progress':'not_assessed',implementation:row.implementation,notes:row.notes,source:'Explicit fictional Demo operating history'});
  }
  for(const [i,item] of baseline.policies.filter(p=>selection.selected_policy_keys.includes(p.key)).entries()){
    const id=cid+'_'+item.key,approved=day(-230),draft=i===2,approver=db.contacts.find(c=>c.client_id===cid&&c.name===scenario.people[1])||db.contacts.find(c=>c.contact_id===cid+'_contact_1');
    if(db.policies.some(p=>p.policy_id===id))continue;
    const policy={policy_id:id,client_id:cid,baseline_key:item.key,title:item.name,category:item.category,presence:'verified_existing',baseline_response:'yes',status:draft?'draft':'approved',version:draft?'2.1-draft':'2.0',owner_id:owner,approver_contact_id:approver.contact_id,created_at:at,updated_at:atDay(approved),summary:`${scenario.name}: documented responsibilities and operating processes for ${item.name.toLowerCase()}, including the selected-IG mapped requirements.`,governance_context:{category:'organizational',rationale:'Mapped CIS document contents; the policy alone does not prove safeguard implementation.',cadence_source:'organization_defined',cadence_rationale:'Maintain mapped process documentation and reassess significant changes.'},approval_source:{version:draft?'2.1-draft':'2.0',external_reference:`Synthetic controlled document register / ${scenario.name} / ${item.name}`,external_version:draft?'Draft2.1':'Revision2.0'}};
    if(!draft){const subject={subject_id:id+'_subject_2',captured_at:atDay(approved),client_id:cid,policy_id:id,title:policy.title,version:'2.0',summary:policy.summary,owner_id:owner,named_approver:{contact_id:approver.contact_id,name:approver.name},basis:{type:'external',reference:policy.approval_source.external_reference,document_version:'Revision2.0',verification:'Reference recorded; external bytes not verified'}};Object.assign(policy,{approved_at:atDay(approved),effective_date:approved,approval_subject:subject,decision_history:[{action:'external_approval_recorded',recorded_by:owner,recorded_by_name:'Demo administrator',recorded_at:atDay(approved),reported_approver_id:approver.contact_id,reported_approved_at:atDay(approved),provenance:'Explicit fictional approval metadata; not an in-app signature',subject}]});}
    db.policies.push(policy);
  }
  const asset={asset_id:cid+'_asset_ordering',client_id:cid,name:scenario.implementation_group===2?'Initech payment-service platform':'Krusty Krab ordering platform',asset_type:'application',status:'active',criticality:'high',owner_id:owner,description:scenario.service,created_at:at,updated_at:at};db.assets.push(asset);
  const vendor={vendor_id:cid+'_vendor_hosting',client_id:cid,name:scenario.implementation_group===2?'TPS Managed Hosting (fictional)':'Bikini Bottom Managed Services (fictional)',service:'Managed identity, hosting and recovery',services:'Managed identity, hosting and recovery',criticality:'high',status:'active',business_owner_id:owner,owner_id:owner,connected_system_ids:[asset.asset_id],review_frequency:'annual',next_review:day(25),created_at:at,updated_at:at,assurance_records:[]};db.vendors.push(vendor);for(const review of ensureVendorReviews(db,vendor))Object.assign(review,{created_at:vendor.created_at,created_by:owner,updated_at:vendor.updated_at});
  const risk=assessedRisk({risk_id:cid+'_risk_recovery',display_id:allocateRiskId(db,cid),client_id:cid,title:`${scenario.name} service recovery dependencies remain untested`,description:`A disruption to ${scenario.service.toLowerCase()} could delay customer operations. The owner selected likelihood 3 and impact 4 based on dependency concentration and untested recovery.`,category:'operational',source_type:'manual',status:'in_progress',owner_id:owner,likelihood_score:3,impact_score:4,assessment_rationale:'Human fictional judgement: a plausible supplier outage and material interruption; existing controls reduce likelihood without proving recovery.',treatment:'mitigate',treatment_plan:'Validate dependency recovery and retain dated results.',date_identified:day(-190),created_at:atDay(day(-190)),updated_at:atDay(day(-20)),last_reviewed:day(-20),next_review:day(60),review_cadence:'quarterly',related_links:[{kind:'vendors',id:vendor.vendor_id}]});db.risks.push(risk);Object.assign(ensureRiskReview(db,risk),{created_at:risk.created_at,created_by:owner,updated_at:risk.updated_at});
  const assessment=assessments.find(a=>a.definition_id==='1.1'),review=db.reviews.find(r=>r.client_id===cid&&r.framework_plan_key==='asset-inventory'),findingId=cid+'_finding_inventory',taskId=cid+'_task_inventory';
  const observed=review.occurrences.at(-1);observed.outcome='findings_raised';observed.finding_count=1;
  const finding={finding_id:findingId,client_id:cid,title:`${scenario.name} inventory ownership is incomplete`,description:'The latest mapped inventory review found an unassigned service component; correcting the Action does not validate this Finding.',severity:'medium',status:'open',owner_id:owner,review_id:review.review_id,occurrence_id:observed.occurrence_id,framework_assessment_id:assessment.framework_assessment_id,definition_id:'1.1',primary_task_id:taskId,due_date:day(18),created_at:observed.completed_at,updated_at:atDay(day(-3)),created_by:owner};db.findings.push(finding);
  db.tasks.push({task_id:taskId,client_id:cid,title:'Confirm inventory owner and reconcile the service component',description:'Retain reconciliation evidence for independent Finding validation.',status:'in_progress',priority:'medium',finding_id:findingId,framework_assessment_id:assessment.framework_assessment_id,owner_id:owner,assignee_id:owner,due_date:day(12),created_at:finding.created_at,updated_at:finding.updated_at,created_by:owner});assessment.related_links.push({kind:'findings',id:findingId},{kind:'tasks',id:taskId});
  const text=`DEMO - SYNTHETIC DATA\n${scenario.name}: inventory reconciliation sample; unresolved owner tracked in ${findingId}.\nCollected: ${observed.completed_at.slice(0,10)}`,bytes=encodeURIComponent(text).replace(/%([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16))),evidence={evidence_id:cid+'_evidence_inventory',client_id:cid,filename:'inventory-sample.txt',display_name:'Inventory reconciliation sample',mime_type:'text/plain',size:bytes.length,content_base64:btoa(bytes),evidence_type:'Report',linked_type:'framework_assessment',linked_id:assessment.framework_assessment_id,relationships:[{kind:'findings',id:findingId},{kind:'reviews',id:review.review_id,occurrence_id:finding.occurrence_id}],uploaded_by:owner,created_at:finding.created_at,evidence_date:observed.completed_at.slice(0,10),version:1,notes:'Explicit small fictional evidence sample; Demo lifetime and budget apply.'};db.evidence.push(evidence);assessment.related_links.push({kind:'evidence',id:evidence.evidence_id});
  seedAI(db,scenario,risk,vendor,owner,clock);
  for(const review of db.reviews.filter(row=>row.client_id===cid))review.occurrences||=[];
  for(const log of db.logs.filter(row=>row.client_id===cid)){log.at=clock.toISOString();log.meta={...log.meta,simulated:true,fixture_revision:CIS_DEMO_REVISION};}
  client.onboarding_baseline=clone(state);
  client.initial_program_baseline||={state:clone(state),completed_at:at,completed_by:owner,policies:selection.selected_policy_keys.length,reviews:plans.length};
  seedCisScenarioHistory(db,client,clock);
}

function retireFreshOptional(db,cid,selection,at){
  const selected=new Set(selection.selected_policy_keys),plans=new Set(selection.selected_framework_plan_keys);
  for(const policy of db.policies.filter(p=>p.client_id===cid&&!selected.has(p.baseline_key)))Object.assign(policy,{demo_seed_retired:{revision:CIS_DEMO_REVISION,previous_status:policy.status,reason:'Unselected optional organizational fixture; approval/history retained.'},status:'retired'});
  for(const review of db.reviews.filter(r=>r.client_id===cid)){
    const mapped=plans.has(review.framework_plan_key)||review.framework_drivers?.some(d=>plans.has(d.framework_plan_key));
    const linkedPolicy=review.policy_id&&db.policies.some(p=>p.policy_id===review.policy_id&&selected.has(p.baseline_key));
    if(mapped){
      const plan=selection.framework_reviews.find(p=>p.key===review.framework_plan_key)||selection.framework_reviews.find(p=>review.framework_drivers?.some(d=>d.framework_plan_key===p.key));
      if(review.recurrence!==plan.default_cadence){
        review.demo_seed_schedule_revision={revision:CIS_DEMO_REVISION,previous_recurrence:review.recurrence,at,reason:'Fresh strict preset adopts the canonical mapped plan schedule; historical occurrence snapshots are unchanged.'};
        review.recurrence=plan.default_cadence;Object.assign(review,reviewSchedule(review,true),reviewView(review));
      }
      continue;
    }
    if(linkedPolicy||review.risk_id||review.vendor_id||review.ai_system_id)continue;
    Object.assign(review,{demo_seed_retired:{revision:CIS_DEMO_REVISION,previous_status:review.status,reason:'Unselected generic organizational fixture; historical occurrences retained.'},status:'cancelled',cancelled_at:at});
  }
}

function untouchedGreenfield(db,client){
  const cid=client.client_id,assessments=db.framework_assessments.filter(row=>row.client_id===cid),state=db.baselines[cid];
  const hasInterview=collection=>Object.entries(collection||{}).some(([key,draft])=>draft.client_id===cid||assessments.some(row=>key.startsWith(row.framework_assessment_id+':')));
  return cid==='demo_initech'&&client.demo_program_version==='cis81-ig2-greenfield-v1'&&client.framework_settings?.['cis-ig1']?.implementation_group===2
    &&client.notes==='Fictional fresh CIS IG2 program. Operating methods, dates and assessment results are not established.'
    &&!client.assigned_owner_id&&!client.profile&&client.primary_contact_id===cid+'_contact_1'
    &&state?.completed&&state.requirements?.['cis-ig1']==='applies'&&Object.entries(state.requirements).every(([key,value])=>key==='cis-ig1'||value==='does_not_apply')
    &&!Object.values(state.policies||{}).some(Boolean)&&!state.reviews?.length&&!state.selected_policy_keys
    &&!db.drafts?.[cid]&&!hasInterview(db.guided_assessment_pilot)&&!hasInterview(db.guided_assessment_history)
    &&!(db.logs||[]).some(log=>log.client_id===cid)
    &&!['policies','risks','findings','tasks','evidence','ai_systems','assets','vendors'].some(kind=>(db[kind]||[]).some(r=>r.client_id===cid))
    &&db.contacts.filter(c=>c.client_id===cid).every(c=>c.created_at===client.created_at&&c.updated_at===client.created_at)
    &&assessments.every(a=>a.framework_key==='cis-ig1'&&a.status==='not_assessed'&&!a.notes&&!a.implementation&&!a.technology&&!a.owner_id&&!a.process_owner_id&&!a.last_assessed&&!a.assessment_history?.length)
    &&db.reviews.filter(r=>r.client_id===cid).every(r=>!r.occurrences?.length&&!r.notes&&!r.owner_id&&!r.due_date);
}

export function applyCisDemoRollout(db,{clock=new Date(),fresh=false}={}){
  if(db.user?.workspace_mode!=='demo'||!db.clients?.some(c=>c.client_id==='demo_brawndo'&&c.environment==='Demo'))return false;
  db.cis_demo_rollout||={revision:CIS_DEMO_REVISION,clients:{},reconciliation_required:[]};let changed=false;
  for(const scenario of CIS_DEMO_SCENARIOS){
    const cid=scenario.client_id;if(db.cis_demo_rollout.clients[cid]?.revision===CIS_DEMO_REVISION)continue;
    let client=db.clients.find(c=>c.client_id===cid),created=!client;
    if(created)client=addClient(db,scenario,clock);
    const selection=cisDemoSelection(scenario.implementation_group),at=new Date(clock).toISOString();
    const populated=cid!=='demo_brawndo'&&(created||untouchedGreenfield(db,client));
    if(populated){populateScenario(db,client,scenario,clock,{preserveCreation:!created&&!fresh});client.notes='Fictional CIS-only operating program with explicit sample histories; not a compliance determination.';}
    else if(cid==='demo_initech')db.cis_demo_rollout.reconciliation_required.push({client_id:cid,kind:'clients',id:cid,reason:'Existing Initech has work or configuration beyond the untouched greenfield fixture; retained without population.',proposed_action:'Review user work and explicit scenario ownership before adding fictional progress/history.'});
    if(fresh&&cid==='demo_brawndo'){
      retireFreshOptional(db,cid,selection,at);const state=db.baselines[cid];
      if(!(db.ai_systems||[]).some(row=>row.client_id===cid)){
        const risk=assessedRisk({risk_id:cid+'_risk_ai_drafting',display_id:allocateRiskId(db,cid),client_id:cid,title:'Unverified AI-generated procedures could mislead operators',description:'A staff drafting assistant may produce inaccurate procedures. Human review reduces exposure; the fictional owner selected likelihood 2 and impact 3.',category:'operational',source_type:'manual',status:'assessed',owner_id:'demo_admin',likelihood_score:2,impact_score:3,assessment_rationale:'Human fictional judgement: limited internal scope and mandatory review reduce likelihood, while a wrong operating instruction could interrupt work.',treatment:'mitigate',treatment_plan:'Require owner verification against actual operating records before publishing AI-assisted instructions.',date_identified:dateAt(clock,-90),created_at:atDay(dateAt(clock,-90)),updated_at:atDay(dateAt(clock,-15)),last_reviewed:dateAt(clock,-15),next_review:dateAt(clock,60),review_cadence:'quarterly'});
        db.risks.push(risk);const riskReview=ensureRiskReview(db,risk);Object.assign(riskReview,{created_at:risk.created_at,created_by:'demo_admin',updated_at:risk.updated_at});riskReview.occurrences||=[];
        seedAI(db,scenario,risk,db.vendors.find(row=>row.client_id===cid),'demo_admin',clock);
      }
      state.selected_policy_keys=selection.selected_policy_keys;state.reviews=[];
      client.framework_settings={...client.framework_settings,'cis-ig1':client.framework_settings?.['cis-ig1']||{implementation_group:1}};
      state.framework_settings={...state.framework_settings,...client.framework_settings};
      for(const review of db.reviews.filter(r=>r.client_id===cid&&selection.selected_framework_plan_keys.includes(r.framework_plan_key)))state.framework_reviews[review.framework_plan_key]={enabled:true,recurrence:review.recurrence,due_date:review.due_date};
      client.onboarding_baseline=clone(state);
    }else if(!fresh&&cid==='demo_brawndo'){
      for(const kind of ['policies','reviews'])for(const row of db[kind].filter(r=>r.client_id===cid)){
        const optional=kind==='policies'?!selection.selected_policy_keys.includes(row.baseline_key):row.baseline_key&&!selection.selected_framework_plan_keys.some(key=>activePlans('cis-ig1',{implementation_group:1}).find(p=>p.key===key)?.baseline_key===row.baseline_key)&&!row.policy_id&&!row.risk_id&&!row.vendor_id&&!row.ai_system_id;
        if(optional&&!row.demo_seed_retired)db.cis_demo_rollout.reconciliation_required.push({client_id:cid,kind,id:row[identity[kind]],reason:'Legacy record has no seed ownership fingerprint; retained without modification.',proposed_action:'Compare to the original seed and user changes before explicitly archiving optional seed-only work.'});
      }
    }
    const fingerprints={};
    if(created||fresh||populated)for(const [kind,field] of Object.entries(identity))for(const row of db[kind]||[])if(row.client_id===cid)fingerprints[kind+':'+row[field]]=seedFingerprint(row);
    db.cis_demo_rollout.clients[cid]={revision:CIS_DEMO_REVISION,selection,seed_fingerprints:fingerprints,
      ownership:created||fresh?'fresh_fixture':populated?'untouched_greenfield_revision':'retained_unreconciled',applied_at:at};changed=true;
  }
  return changed;
}
