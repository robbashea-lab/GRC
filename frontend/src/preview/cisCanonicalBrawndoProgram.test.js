import {seedBrawndoProgram} from './cisCanonicalBrawndoProgram';
import {establishBrawndoBaseline,brawndoOnboardingSelection} from './cisCanonicalBrawndoBaseline';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {ids} from './store';
import {activeDefinitions,activePlans} from '../lib/frameworks';
import {generateResult,validateGuidedCompletion,visibleQuestions} from '../lib/guidedAssessment';
import {ensurePolicyReview} from './policyReviews';
import {approvalSnapshot} from './policyProvenance';
import {policyAlignment} from '../lib/brawndoPolicies';

const CID='demo_brawndo',dates=cisDemoFixtureDates(new Date('2026-11-02T12:00:00.000Z'));
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture() {
  const actor={user_id:'demo_admin',name:'Demo Explorer',email:'explorer@example.test',workspace_mode:'demo',role:'super_admin',status:'active',client_ids:[CID,'other']};
  const owner={user_id:'demo_provider_lead',name:'Morgan Ellis',email:'morgan@example.test',workspace_mode:'demo',role:'platform_admin',status:'active',client_ids:[CID]};
  const db={...Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]])),user:actor,users:[actor,owner],logs:[],notifications:[],drafts:{},baselines:{},
    clients:[{client_id:CID,name:'Brawndo',environment:'Demo',status:'active',logo:'brawndo',primary_contact_id:CID+'_contact_0',assigned_owner_id:owner.user_id,
      profile:{organization:{legal_name:'Brawndo'}},framework_settings:{'cis-ig1':{implementation_group:1}}},
      {client_id:'other',name:'Retained client',environment:'Demo',status:'active'}],
    contacts:[{client_id:CID,contact_id:CID+'_contact_0',name:'Joe Bowers',status:'active'},
      {client_id:CID,contact_id:CID+'_contact_1',name:'President Camacho',status:'active'}]};
  establishBrawndoBaseline(db,{dates});
  return db;
}
function seed(db) {
  return seedBrawndoProgram(db,{dates,owner:'demo_provider_lead',processOwners:{'Executive sponsor':CID+'_contact_1'}});
}

test('native onboarding is enriched into exactly 56 safeguards, nine documents and eleven source-backed Review parents',()=>{
  const db=fixture(),owner=copy(db.users),contacts=copy(db.contacts),profile=copy(db.clients[0].profile),selection=brawndoOnboardingSelection();
  const result=seed(db);
  expect(result.assessments.map(row=>row.definition_id)).toEqual(activeDefinitions('cis-ig1',{implementation_group:1}).map(row=>row.id));
  expect(Object.fromEntries(['addressed','in_progress','needs_attention','not_assessed'].map(status=>[status,result.assessments.filter(row=>row.status===status).length])))
    .toEqual({addressed:48,in_progress:4,needs_attention:2,not_assessed:2});
  expect(result.policies.map(row=>row.baseline_key).sort()).toEqual([...selection.policy_keys].sort());
  expect(result.reviews.map(row=>row.framework_plan_key).sort()).toEqual(selection.plans.map(row=>row.key).sort());
  expect(result.reviews.every(row=>row.occurrences.length===0)).toBe(true);
  expect(result.assessments.every(row=>row.assessment_history.length===0)).toBe(true);
  expect(result.reviews.some(row=>row.framework_plan_key==='endpoint-validation')).toBe(false);
  expect(db.users).toEqual(owner);expect(db.contacts).toEqual(contacts);expect(db.clients[0].profile).toEqual(profile);
  expect(result.history_outline.origin).toBe('2025-05-02T00:00:00.000Z');
});

test('every completed imported interview validates against its actual native question version and agrees with the saved assessment',()=>{
  const db=fixture(),{assessments}=seed(db);
  for(const row of assessments.filter(item=>item.status!=='not_assessed')) {
    const draft=db.guided_assessment_pilot[row.framework_assessment_id+':demo_provider_lead'];
    expect(draft.completed).toBe(true);
    expect(()=>validateGuidedCompletion(row.definition_id,draft.answers,draft.version)).not.toThrow();
    const [year,month,day]=row.last_saved.slice(0,10).split('-').map(Number);
    expect(generateResult(row.definition_id,draft.answers,new Date(year,month-1,day),draft.version).status).toBe(row.status);
    expect(row.guided_assessment_source.answers).toEqual(draft.answers);
    expect(row.guided_assessment_source.origin).toBe('fictional-demo-fixture');
    expect(visibleQuestions(row.definition_id,draft.answers,draft.version).filter(question=>question.critical)
      .every(question=>draft.answers[question.id]!==undefined)).toBe(true);
    expect(row.last_saved<=dates.anchor).toBe(true);
  }
  for(const id of ['1.1','3.1','4.1','7.1','7.2','15.1']) {
    const row=assessments.find(item=>item.definition_id===id);
    expect(row.items_to_address.some(item=>item.kind==='gap'&&item.state==='open')).toBe(true);
    expect(row.items_to_address.every(item=>item.created_at===row.last_saved&&item.finding_id===null)).toBe(true);
  }
});

test.each(['11.4','14.8'])('unassessed %s retains scope, accountable owner and an assessment plan without invented answers or decisions',id=>{
  const db=fixture(),row=seed(db).assessments.find(item=>item.definition_id===id);
  expect(row.status).toBe('not_assessed');expect(row.last_assessed).toBeNull();expect(row.last_saved).toBeNull();
  expect(row.assessed_by).toBeNull();expect(row.verification).toBeNull();expect(row.verification_checklist).toBeNull();
  expect(row.assessment_history).toEqual([]);expect(row.items_to_address).toEqual([]);expect(row.guided_assessment_source).toBeUndefined();
  expect(db.guided_assessment_pilot[row.framework_assessment_id+':demo_provider_lead']).toBeUndefined();
  expect(row.notes).toMatch(/Assessment plan:/);expect(row.implementation).toMatch(/not assessed/i);
  expect(row.owner_id).toBe('demo_provider_lead');expect(row.process_owner_id).toBe(CID+'_contact_0');
});

test('document approval subjects preserve the narrow network runbook, pending production appendix and missing vulnerability process truthfully',()=>{
  const db=fixture(),result=seed(db),find=key=>result.policies.find(row=>row.baseline_key===key);
  const config=find('policy-configuration-management-policy'),data=find('policy-data-classification-handling-policy'),vuln=find('policy-vulnerability-patch-management-policy');
  expect(config.status).toBe('draft');expect(config.approved_at).toBeNull();expect(config.approval_subject).toBeNull();
  expect(config.summary).toMatch(/endpoint\/server.*missing/i);
  expect(config.decision_history).toHaveLength(1);
  expect(config.decision_history[0].subject.title).toBe('Network Device Configuration Runbook');
  expect(config.decision_history[0].subject.summary).toMatch(/does not cover.*endpoint\/server/i);
  expect(data.status).toBe('in_review');expect(data.approved_at).toBeNull();
  expect(data.approval_subject.version).toBe('2.1-draft');expect(data.approval_history[0].action).toBe('submitted');
  expect(data.decision_history[0].subject.summary).toMatch(/Temporary production-file.*outside this approved version/i);
  expect(vuln).toMatchObject({status:'needs_creation',presence:'reported_missing',version:'',approved_at:null,approval_subject:null});
  expect(vuln.decision_history).toEqual([]);expect(vuln.summary).toMatch(/7\.1.*missing/i);
  for(const policy of result.policies.filter(row=>row.status==='approved')) {
    expect(policy.decision_history).toHaveLength(2);
    expect(policy.approval_source.version).toBe(policy.version);
    expect(policy.approval_subject.version).toBe(policy.version);
    expect(policy.decision_history.every(entry=>entry.provenance.includes('Fictional external approval metadata'))).toBe(true);
    expect(()=>approvalSnapshot(db,policy)).not.toThrow();
  }
});

test('mapped document maintenance reuses actual CIS process Reviews and keeps cadence and current overdue work',()=>{
  const db=fixture(),result=seed(db),count=db.reviews.length;
  expect(result.mapping).toHaveLength(9);
  for(const policy of result.policies) {
    const review=result.reviews.find(row=>row.policy_id===policy.policy_id);
    expect(review).toBeTruthy();expect(ensurePolicyReview(db,policy)).toBe(review);
    expect(policy.next_review_date).toBe(review.due_date);
    expect(review.recurrence).toBe(activePlans('cis-ig1',{implementation_group:1}).find(plan=>plan.key===review.framework_plan_key).default_cadence);
  }
  expect(db.reviews).toHaveLength(count);
  for(const key of ['vulnerability-remediation','provider-inventory'])expect(result.reviews.find(row=>row.framework_plan_key===key).due_date<dates.day(0)).toBe(true);
  expect(result.reviews.find(row=>row.framework_plan_key==='data-governance').status).toBe('in_progress');
  expect(result.assessments.find(row=>row.definition_id==='9.1')).toMatchObject({status:'addressed',verification:'needs_validation'});
});

test('combined data-management contents stay natively linked to retention and disposal without another policy or Review',()=>{
  const db=fixture(),result=seed(db);
  const policy=result.policies.find(row=>row.baseline_key==='policy-data-classification-handling-policy');
  const coverage=['3.1','3.2','3.4','3.5'];
  expect(result.mapping.find(row=>row.policy_id===policy.policy_id).safeguards.sort()).toEqual(coverage);
  expect(policyAlignment(policy,['cis-ig1'],result.assessments,1).map(row=>row.id).sort()).toEqual(coverage);
  for(const id of coverage)expect(result.assessments.find(row=>row.definition_id===id).related_links)
    .toContainEqual({kind:'policies',id:policy.policy_id});
  expect(result.policies).toHaveLength(9);expect(result.reviews).toHaveLength(11);
  expect(result.reviews.filter(row=>row.policy_id===policy.policy_id)).toHaveLength(1);
  expect(policy.status).toBe('in_review');expect(policy.version).toBe('2.1-draft');
  expect(policy.decision_history[0].subject.version).toBe('1.0');
});

test('source construction is deterministic despite native initial Review identities and preserves unrelated records',()=>{
  const first=fixture(),second=fixture();
  for(const kind of ['framework_assessments','policies','reviews']) {
    const key=ids[kind];first[kind].push({client_id:'other',[key]:'keep-'+kind,notes:'Visitor work'});
    second[kind].push({client_id:'other',[key]:'keep-'+kind,notes:'Visitor work'});
  }
  first.guided_assessment_pilot={foreign:{client_id:'other',answers:{keep:'Retained'}}};
  second.guided_assessment_pilot=copy(first.guided_assessment_pilot);
  const before=copy(first),a=seed(first),b=seed(second);
  for(const key of ['assessments','policies','reviews','mapping','history_outline'])expect(a[key]).toEqual(b[key]);
  for(const kind of ['framework_assessments','policies','reviews'])expect(first[kind].filter(row=>row.client_id!=='demo_brawndo'))
    .toEqual(before[kind].filter(row=>row.client_id!=='demo_brawndo'));
  expect(first.guided_assessment_pilot.foreign).toEqual(before.guided_assessment_pilot.foreign);
  expect(a.initial_normalization.policy_ids).toEqual(b.initial_normalization.policy_ids);
});

test.each([
  ['retained assessment edit',db=>{db.framework_assessments.find(row=>row.client_id===CID).implementation='Visitor work';}],
  ['retained Review occurrence',db=>{db.reviews.find(row=>row.client_id===CID).occurrences=[{status:'completed'}];}],
  ['missing native program',db=>{db.baselines[CID].completed=false;}],
  ['wrong workspace',db=>{db.user.workspace_mode='standard';}],
  ['out-of-scope group',db=>{db.clients[0].framework_settings['cis-ig1'].implementation_group=2;}],
  ['cross-client Contact',db=>{db.contacts[0].client_id='other';}],
  ['foreign canonical identity collision',db=>{db.policies.push({client_id:'other',policy_id:CID+'_policy-backup-restoration-policy'});}]
])('%s fails before changing source data',(_label,change)=>{
  const db=fixture();change(db);const before=copy(db);
  expect(()=>seed(db)).toThrow('Brawndo program:');expect(db).toEqual(before);
});
