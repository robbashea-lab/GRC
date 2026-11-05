import {seedBrawndoOperations} from './cisCanonicalBrawndoOperations';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {assessedRisk} from '../lib/grcWork';
import {aiProjection, validateAI, catalog as aiGovernanceCatalog} from '../lib/aiGovernance';
import * as aiGovernanceRequests from './aiGovernance';
import {aiScope} from '../lib/brawndoAI';
import {screeningStale} from '../lib/aiOnboarding';
import {validateAssignment} from './assignmentEligibility';
import {registerCatalogLogo} from '../lib/registerCatalogLogo';
import {brawndoSafeguardContent, BRAWNDO_SCENARIO_PROFILE} from './cisCanonicalBrawndoContent';
import {VENDOR_DATA_TYPES} from '../lib/vendorGovernance';
import {vendorMatches,renewalAction} from '../lib/brawndoVendors';
import {vendorOutstandingWork} from '../lib/vendorOutstandingWork';
import {SCHEMAS} from '../lib/schemas';
import rules from '../lib/grcRules.json';

const CID='demo_brawndo';
const copy=value=>JSON.parse(JSON.stringify(value));
const dates=cisDemoFixtureDates(new Date('2026-11-02T12:00:00.000Z'));
function fixture() {
  const actor={user_id:'demo_admin',name:'Demo Explorer',email:'explorer@example.test',role:'super_admin',status:'active',workspace_mode:'demo',client_ids:[CID,'other']};
  const owner={user_id:'brawndo_manager',name:'Joe Bowers',email:'joe@example.test',role:'client_grc_manager',status:'active',client_ids:[CID]};
  return {user:actor,users:[actor,owner],clients:[{client_id:CID,name:'Brawndo',environment:'Demo',status:'active',framework_settings:{'cis-ig1':{implementation_group:1}}}],
    requirements:[{requirement_id:'brawndo_cis',client_id:CID,baseline_key:'cis-ig1',baseline_response:'applies'}],
    risks:[],vendors:[],ai_systems:[],reviews:[],tasks:[],evidence:[],findings:[],assets:[],logs:[],contacts:[],
    riskSequences:{other:17},ai_counters:{other:4}};
}
const seed=(db,clock=dates)=>seedBrawndoOperations(db,{dates:clock,owner:'brawndo_manager'});
afterEach(()=>jest.restoreAllMocks());

test('29 distinct Risks preserve separate treatment, acceptance and closed lifecycle groups',()=>{
  const db=fixture(),result=seed(db),active=result.risks.filter(row=>!['closed','accepted'].includes(row.status));
  expect(active).toHaveLength(15);
  expect(result.risks.filter(row=>row.status==='accepted')).toHaveLength(4);
  expect(result.risks.filter(row=>row.status==='closed')).toHaveLength(10);
  expect(new Set(result.risks.map(row=>row.risk_id)).size).toBe(29);
  expect(new Set(result.risks.map(row=>row.display_id)).size).toBe(29);
  expect(new Set(result.risks.map(row=>row.risk_level))).toEqual(new Set(['critical','high','moderate','low']));
  for(const risk of result.risks) {
    expect(risk).toMatchObject({risk_score:assessedRisk(risk).risk_score,risk_level:assessedRisk(risk).risk_level});
    expect(risk.description).toMatch(/^Fictional Brawndo:/);
    expect(risk.likelihood_rationale.length).toBeGreaterThan(35);
    expect(risk.impact_rationale.length).toBeGreaterThan(35);
    expect(()=>validateAssignment(db,'risks',risk)).not.toThrow();
    const reviews=result.reviews.filter(row=>row.risk_id===risk.risk_id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].recurrence).toBe('annual');
    if(risk.status==='closed') {
      expect(risk.next_review).toBeNull();
      expect(risk.closed_at).toBeTruthy();
      expect(reviews[0].status).toBe('cancelled');
      expect(risk.decision_history.at(-1).action).toBe('closed');
    } else expect(reviews[0].status).toBe('upcoming');
    if(risk.status==='accepted') {
      expect(risk.acceptance_expires_at).not.toBe(risk.next_review);
      expect(risk.decision_history.at(-1).action).toBe('accepted');
    }
    if(risk.status==='in_progress')expect(result.tasks.some(task=>task.risk_id===risk.risk_id&&['open','in_progress'].includes(task.status))).toBe(true);
  }
  for(const lifecycle of result.risk_lifecycles.filter(row=>row.treatment_started_at))
    expect(lifecycle.treatment_started_at).toBe(result.tasks.find(task=>task.risk_id===lifecycle.risk_id).created_at);
  expect(result.reviews.filter(row=>row.risk_id&&!['completed','cancelled'].includes(row.status))).toHaveLength(19);
  const inventory=result.risks.find(row=>row.risk_id.endsWith('risk_asset-owners'));
  expect(Object.values(BRAWNDO_SCENARIO_PROFILE.asset_scope).reduce((total,count)=>total+count,0)).toBe(79);
  expect(inventory.description).toContain('All 79 identified assets');
  expect(inventory.description).toContain('Six of the ten packaging kiosks');
  expect(brawndoSafeguardContent('1.1','in_progress').current_implementation).toContain('six packaging kiosks');
  expect(result.risks.map(row=>row.description).join(' ')).not.toMatch(/eleven warehouse scanners|eleven.*devices/i);
});

test('native Action examples retain explicit priority, ownership and real started-work dates',()=>{
  const db=fixture(),result=seed(db);
  const dispatch=result.tasks.find(row=>row.task_id.endsWith('_task_dispatch'));
  expect(dispatch).toMatchObject({priority:'critical',status:'in_progress',due_date:dates.day(0),
    started_at:dates.instant(-12),started_by:'brawndo_manager',updated_at:dates.instant(-8)});
  expect(dispatch.created_at < dispatch.started_at && dispatch.started_at < dispatch.updated_at).toBe(true);
  expect(dispatch.completed_at).toBeUndefined();
  const backup=result.tasks.find(row=>row.task_id.endsWith('_task_backup-dependency'));
  expect(backup).toMatchObject({priority:'low',status:'open',due_date:dates.day(12)});
  expect(backup.started_at).toBeUndefined();
  const software=result.tasks.find(row=>row.task_id.endsWith('_task_software'));
  expect(software.assignee_id).toBeNull();
  expect(result.risks.find(row=>row.risk_id===software.risk_id).owner_id).toBe('brawndo_manager');
  const priorities=SCHEMAS.tasks.fields.find(field=>field.name==='priority').options.map(option=>option.value);
  for(const task of [dispatch,backup,software]) {
    expect(priorities).toContain(task.priority);
    expect(rules.statuses.tasks).toContain(task.status);
    expect(()=>validateAssignment(db,'tasks',task)).not.toThrow();
  }
});

test('15 supplier relationships have 14 annual active reviews and distinct contract/assurance work',()=>{
  const db=fixture(),result=seed(db);
  expect(result.vendors).toHaveLength(15);
  const active=result.vendors.filter(row=>row.status==='active'),inactive=result.vendors.find(row=>row.status==='inactive');
  expect(active).toHaveLength(14);
  for(const vendor of active) {
    expect(vendor.data_types.every(type=>VENDOR_DATA_TYPES.includes(type))).toBe(true);
    const primary=result.reviews.filter(row=>row.vendor_id===vendor.vendor_id&&row.vendor_purpose==='vendor'&&row.status!=='cancelled');
    expect(primary).toHaveLength(1);expect(primary[0].recurrence).toBe('annual');
    expect(primary[0].governance_context.rationale).toMatch(/organization-selected/);
  }
  expect(registerCatalogLogo('vendors',active.find(row=>row.catalog_key==='microsoft-365'))).toBeTruthy();
  expect(registerCatalogLogo('vendors',active.find(row=>row.name==='Cloudflare'))).toBeUndefined();
  expect(active.find(row=>row.name==='Cloudflare').service).toMatch(/Gateway DNS.*roaming/);
  expect(active.find(row=>row.name==='1Password').service).toMatch(/vaults.*membership.*platform controls/);
  expect(inactive.next_review).toBeNull();
  expect(result.reviews.filter(row=>row.vendor_id===inactive.vendor_id).every(row=>row.status==='cancelled')).toBe(true);
  expect(result.reviews.filter(row=>row.vendor_purpose==='contract')).toHaveLength(3);
  expect(result.reviews.filter(row=>row.vendor_purpose==='assurance')).toHaveLength(1);
  expect(result.reviews.filter(row=>['contract','assurance'].includes(row.vendor_purpose)).every(row=>row.recurrence==='none')).toBe(true);
  const assuranceTask=result.tasks.find(row=>row.assurance_id),renewalTask=result.tasks.find(row=>/contract renewal/.test(row.title));
  expect(assuranceTask.vendor_id).not.toBe(renewalTask.vendor_id);
  expect(assuranceTask.source_type).toBe('vendor');
  expect(renewalTask.assurance_id).toBeUndefined();
});

test('the recorded LineCare notice and existing contract Action use distinct native dates and relationships',()=>{
  const db=fixture(),result=seed(db),now=new Date(dates.day(0)+'T12:00:00.000Z');
  const vendor=result.vendors.find(row=>row.vendor_id.endsWith('_vendor_maintenance'));
  const task=result.tasks.find(row=>row.task_id.endsWith('_task_vendor_maintenance'));
  const contract=result.reviews.find(row=>row.vendor_id===vendor.vendor_id&&row.vendor_purpose==='contract');
  const annual=result.reviews.find(row=>row.vendor_id===vendor.vendor_id&&row.vendor_purpose==='vendor');
  expect(vendor.contract_notice_deadline).toBe(dates.day(20));
  expect(vendor.contract_renewal).toBe(dates.day(65));
  expect(Date.parse(vendor.contract_renewal)-Date.parse(vendor.contract_notice_deadline)).toBe(45*86400000);
  expect(vendor.contract_notes).toMatch(/Fictional LineCare.*45 calendar days/);
  expect(renewalAction(vendor)).toEqual({date:dates.day(20),label:'Notice deadline'});
  expect(vendorMatches(vendor,'renewal_soon',now)).toBe(true);
  expect(contract).toMatchObject({due_date:dates.day(5),recurrence:'none'});
  expect(annual).toMatchObject({due_date:dates.day(15),recurrence:'annual'});
  expect(task).toMatchObject({review_id:contract.review_id,occurrence_id:contract.current_occurrence_id,
    source_type:'vendor',source_id:vendor.vendor_id,vendor_id:vendor.vendor_id,due_date:dates.day(5)});
  const work=vendorOutstandingWork(result.vendors,result.reviews,result.tasks,now);
  expect(work.events.find(event=>event.task?.task_id===task.task_id)).toMatchObject({kind:'ren',label:'Contract action',date:dates.day(5)});
  expect(work.events.find(event=>event.label==='Notice deadline'&&event.vendor.vendor_id===vendor.vendor_id))
    .toMatchObject({date:dates.day(20),outstanding:false});
  expect(result.vendors).toHaveLength(15);expect(result.tasks).toHaveLength(11);
  expect(result.reviews.filter(row=>row.vendor_id===vendor.vendor_id)).toHaveLength(2);
});

test('three preset AIs reuse three distinct existing Risks and have separate annual AI reviews',()=>{
  const db=fixture(),result=seed(db);
  expect(result.ai_systems.map(row=>row.catalog_key)).toEqual(['chatgpt','claude','m365']);
  const linked=[];
  for(const ai of result.ai_systems) {
    expect(()=>validateAI(db,ai)).not.toThrow();
    expect(screeningStale(ai)).toBe(false);
    expect(Object.values(ai.onboarding_screening.answers).every(value=>typeof value==='boolean')).toBe(true);
    expect(registerCatalogLogo('ai_systems',ai)).toBeTruthy();
    const link=ai.related_links.find(row=>row.kind==='risks'),risk=result.risks.find(row=>row.risk_id===link.id);
    expect(risk.client_id).toBe(CID);expect(['assessed','in_progress']).toContain(risk.status);linked.push(risk.risk_id);
    expect(result.vendors.find(row=>row.vendor_id===ai.vendor_id).related_risk_ids).toContain(risk.risk_id);
    const review=result.reviews.find(row=>row.ai_system_id===ai.ai_system_id),riskReview=result.reviews.find(row=>row.risk_id===risk.risk_id);
    expect(review.recurrence).toBe('annual');expect(riskReview.recurrence).toBe('annual');expect(review.review_id).not.toBe(riskReview.review_id);
    expect(aiProjection(ai,result.reviews,result.risks,dates.day(0)).screening_complete).toBe(true);
    if(ai.approval_status!=='pending_assessment')expect(ai.approval_history.at(-1).scope).toEqual(aiScope(ai));
  }
  expect(new Set(linked).size).toBe(3);expect(result.risks).toHaveLength(29);
  expect(result.ai_systems[0]).toMatchObject({status:'draft',approval_status:'pending_assessment'});
  expect(result.ai_systems[0].onboarding_screening.answers).toMatchObject({harm:true,settings:false,external:false});
  expect(result.ai_systems[1].onboarding_screening.answers).toMatchObject({harm:false,external:true});
  const copilot=result.ai_systems[2];
  expect(copilot.onboarding_screening.answers).toMatchObject({sensitive:true,connected:true,harm:true,external:true,writes:false,autonomous:false});
  expect(copilot.data_types).toEqual(expect.arrayContaining(['Confidential','Employee Data','PII']));
  expect(copilot.permitted_data_types).toEqual(['Public','Internal']);
  expect(copilot.environment).toContain('separately licensed');
});

test('fresh organization AI intake uses the native service without adding systems or inferring sensitive use',()=>{
  const db=fixture(),users=copy(db.users),actor=copy(db.user),client=copy(db.clients[0]);
  const foreign={client_id:'other',usage:'unsure',indicators:[],updated_at:'retained-profile'};
  const retainedAudit={audit_id:'retained-audit',client_id:'other',action:'Retained event',at:'2025-01-01T00:00:00.000Z'};
  db.ai_intake={other:foreign};db.logs=[retainedAudit];
  const nativeRequest=aiGovernanceRequests.aiRequest;
  const request=jest.spyOn(aiGovernanceRequests,'aiRequest').mockImplementation((staged,...args)=>{
    const kinds=['ai_systems','risks','reviews','vendors','requirements','findings','tasks'];
    const counts=kinds.map(kind=>staged[kind].length);
    const saved=nativeRequest(staged,...args);
    expect(kinds.map(kind=>staged[kind].length)).toEqual(counts);
    return saved;
  });
  const result=seed(db);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(expect.any(Object),'/ai-intake','post',{}, {
    client_id:CID,usage:'yes',indicators:['Third-party AI tools internally'],expected_updated_at:null});
  const intake=nativeRequest(db,'/ai-intake','get',{client_id:CID},{});
  expect(intake).toEqual({client_id:CID,usage:'yes',indicators:['Third-party AI tools internally'],updated_at:dates.instant(-6)});
  expect(intake.indicators.every(value=>aiGovernanceCatalog.intake_indicators.includes(value))).toBe(true);
  expect(db.ai_intake.other).toBe(foreign);expect(db.logs[1]).toBe(retainedAudit);
  expect(db.logs).toHaveLength(2);
  expect(db.logs[0]).toMatchObject({audit_id:CID+'_canonical_ai_intake',action:'AI intake updated',
    entity_type:'clients',entity_id:CID,client_id:CID,at:dates.instant(-6),user_id:actor.user_id,
    meta:{simulated:true,source:'Fictional Brawndo organization AI-use declaration through the native intake service'}});
  expect(result.ai_systems).toHaveLength(3);expect(result.risks).toHaveLength(29);expect(result.vendors).toHaveLength(15);
  expect(db.requirements).toHaveLength(1);expect(db.findings).toEqual([]);expect(db.evidence).toEqual([]);
  expect(db.users).toEqual(users);expect(db.user).toEqual(actor);expect(db.clients[0]).toEqual(client);
});

test.each(['yes','no','unsure'])('retry preserves a visitor %s organization declaration and creates no audit',usage=>{
  const db=fixture();seed(db);
  db.ai_intake[CID]={...db.ai_intake[CID],usage,indicators:usage==='yes'?['Other']:[],updated_at:'visitor-profile-version'};
  const intake=db.ai_intake,logs=db.logs,before=copy(db);
  const request=jest.spyOn(aiGovernanceRequests,'aiRequest');
  seed(db);
  expect(request).not.toHaveBeenCalled();expect(db).toEqual(before);
  expect(db.ai_intake).toBe(intake);expect(db.logs).toBe(logs);
});

test('a native intake failure after staged writes leaves all original data intact',()=>{
  const db=fixture();
  db.ai_intake={other:{client_id:'other',usage:'yes',indicators:['Other'],updated_at:'retained-profile'}};
  db.logs=[{audit_id:'retained-audit',client_id:'other',action:'Retained event'}];
  const intake=db.ai_intake,logs=db.logs,before=copy(db),nativeRequest=aiGovernanceRequests.aiRequest;
  const request=jest.spyOn(aiGovernanceRequests,'aiRequest').mockImplementation((staged,...args)=>{
    const saved=nativeRequest(staged,...args);
    expect(saved.usage).toBe('yes');expect(staged.ai_intake).not.toBe(intake);expect(staged.logs).not.toBe(logs);
    expect(staged.logs[0].action).toBe('AI intake updated');
    throw new Error('Native intake failed after its staged writes');
  });
  expect(()=>seed(db)).toThrow('Native intake failed after its staged writes');
  expect(request).toHaveBeenCalledTimes(1);expect(db).toEqual(before);
  expect(db.ai_intake).toBe(intake);expect(db.logs).toBe(logs);
});

test('repeat initialization preserves visitor edits and unrelated clients without duplicating data',()=>{
  const db=fixture(),users=copy(db.users),actor=copy(db.user);
  db.risks.push({risk_id:'outside_risk',client_id:'other',title:'Preserved outside record'});
  const outside=copy(db.risks[0]);
  seed(db);db.risks.find(row=>row.client_id===CID).treatment_plan='Visitor treatment edit';
  const saved=copy(db);seed(db);
  expect(db).toEqual(saved);expect(db.users).toEqual(users);expect(db.user).toEqual(actor);
  expect(db.risks.find(row=>row.client_id==='other')).toEqual(outside);
  expect(db.riskSequences.other).toBe(17);expect(db.ai_counters.other).toBe(4);
});

test('the same UTC initialization day produces identical records without changing Evidence or fabricating completed history',()=>{
  const first=fixture(),second=fixture();
  const a=seed(first),b=seed(second,cisDemoFixtureDates(new Date('2026-11-02T23:59:59.000Z')));
  expect(first).toEqual(second);expect(a).toEqual(b);expect(first.evidence).toEqual([]);
  expect(a.evidence_specs.length).toBeGreaterThan(0);
  expect(a.reviews.every(row=>row.occurrences.length===0)).toBe(true);
  expect(a.review_origins.every(row=>row.provenance.includes('Fictional'))).toBe(true);
  expect(a.risk_lifecycles.filter(row=>row.closed_at)).toHaveLength(10);
  expect(first.ai_intake[CID].updated_at).toBe(dates.instant(-6));
  expect(first.logs.filter(row=>row.audit_id===CID+'_canonical_ai_intake')).toHaveLength(1);
});

test.each(['other-client','standard-actor','wrong-group','unselected-program','archived','wrong-environment','ineligible-owner','foreign-review','existing-data','identity-collision','existing-intake','malformed-intake','intake-audit-collision','intake-log-collision'])('%s fails before any mutation',condition=>{
  const db=fixture(),options={dates,owner:'brawndo_manager'};
  if(condition==='other-client')db.clients[0].client_id='demo_initech';
  if(condition==='standard-actor')db.user.workspace_mode='standard';
  if(condition==='wrong-group')db.clients[0].framework_settings['cis-ig1'].implementation_group=2;
  if(condition==='unselected-program')db.requirements=[];
  if(condition==='archived')db.clients[0].archived=true;
  if(condition==='wrong-environment')db.clients[0].environment='Production';
  if(condition==='ineligible-owner')db.users[1].status='inactive';
  if(condition==='foreign-review')options.frameworkReviews=[{review_id:'foreign',client_id:'other'}];
  if(condition==='existing-data')db.risks.push({risk_id:'retained',client_id:CID,title:'Retained scenario'});
  if(condition==='identity-collision')db.risks.push({risk_id:CID+'_canonical_risk_dispatch',client_id:'other',title:'Retained collision'});
  if(condition==='existing-intake')db.ai_intake={[CID]:{client_id:CID,usage:'unsure',indicators:[],updated_at:null}};
  if(condition==='malformed-intake')db.ai_intake=[];
  if(condition==='intake-audit-collision')db.logs.push({audit_id:CID+'_canonical_ai_intake',client_id:'other',action:'Retained event'});
  if(condition==='intake-log-collision')db.logs.push({log_id:CID+'_canonical_ai_intake',client_id:'other',action:'Retained legacy event'});
  const before=copy(db);expect(()=>seedBrawndoOperations(db,options)).toThrow();expect(db).toEqual(before);
});
