import {ids} from './store';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishKrustyBaseline} from './cisCanonicalKrustyBaseline';
import {populateKrustyAssessments} from './cisCanonicalKrustyAssessments';
import {populateKrustyGovernance} from './cisCanonicalKrustyGovernance';
import {seedKrustyOperations} from './cisCanonicalKrustyOperations';
import {seedKrustyHistory} from './cisCanonicalKrustyHistory';
import {krustyHistoryVolumePlan} from './cisCanonicalKrustyVolume';
import {reviewSchedule} from '../lib/reviewOccurrences';
import {effectivePolicySubject} from './policyReviewCoverage';
import {prepareTask} from './actionItems';
import * as reporting from './cisDemoHistory';

const CID = 'demo_krusty_krab', PREFIX = CID+'_canonical_history_';
const CLOCK = new Date('2026-11-04T12:00:00.000Z');
const copy = value => JSON.parse(JSON.stringify(value));
const names = ['Eugene Krabs','Squidward Tentacles','SpongeBob SquarePants'];
let prepared;

function build(clock = CLOCK) {
  const dates = cisDemoFixtureDates(clock);
  const actor = {user_id:'demo_admin',name:'Synthetic importer',email:'importer@example.test',
    role:'super_admin',workspace_mode:'demo',status:'active',client_ids:[CID,'other']};
  const owner = {user_id:'demo_owner',name:'Morgan Ellis',email:'morgan@example.test',
    role:'client_grc_manager',workspace_mode:'demo',status:'active',client_ids:[CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])),user:actor,users:[actor,owner],
    logs:[{log_id:'foreign-history-event',client_id:'other',action:'Retained event',meta:{note:'Visitor content'}}],
    notifications:[],drafts:{},baselines:{other:{completed:true}},riskSequences:{other:17},ai_counters:{other:4},
    ai_intake:{other:{usage:'unsure',updated_at:'retained'}},command_requests:{
      [JSON.stringify(['foreign-actor','other','/retained','retained-request'])]:{fingerprint:'retained',result:{keep:true}}},
    clients:[{client_id:CID,name:'The Krusty Krab',environment:'Demo',status:'active',logo:'retained-krusty',
      primary_contact_id:CID+'_contact_0',assigned_owner_id:owner.user_id},
    {client_id:'other',name:'Retained client',environment:'Demo',status:'active'}],
    contacts:names.map((name,index) => ({client_id:CID,contact_id:CID+'_contact_'+index,name,status:'active'})),
    policies:[{policy_id:'foreign-policy',client_id:'other',status:'draft',summary:'Visitor policy'}],
    risks:[{risk_id:'foreign-risk',client_id:'other',title:'Retained unrated Risk'}],
    vendors:[{vendor_id:'foreign-vendor',client_id:'other',name:'Visitor supplier'}]};
  establishKrustyBaseline(db,{dates});
  populateKrustyAssessments(db,{dates,owner:owner.user_id});
  const governance = populateKrustyGovernance(db,{dates,owner:owner.user_id});
  const operations = seedKrustyOperations(db,{dates,owner:owner.user_id});
  return {db,dates,owner:owner.user_id,governance,operations};
}
function state() {const value = copy(prepared);value.dates = cisDemoFixtureDates(CLOCK);return value;}
const install = value => seedKrustyHistory(value.db,value);
const nativePlan = value => krustyHistoryVolumePlan(value.db.reviews.filter(row => row.client_id === CID),{
  anchor:value.dates.anchor,organization_origin:value.governance.organization_origin,framework_origin:value.governance.origin,
  review_origins:value.operations.review_origins,framework_review_ids:value.governance.reviews.map(row => row.review_id)});
// Native Volume retains caller order; the DB and source manifest use different valid orders.
const planByReviewId = plan => ({...plan,reviews:[...plan.reviews].sort((a,b) => a.review_id.localeCompare(b.review_id))});

beforeAll(() => {jest.useFakeTimers().setSystemTime(CLOCK);prepared = build();jest.useRealTimers();});
beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => {jest.restoreAllMocks();jest.useRealTimers();});

test('the real November4 cohort materializes every qualified native period without changing current source facts', () => {
  const value = state(), before = copy(value.db), plan = nativePlan(value), result = install(value);
  expect(result.reviews).toHaveLength(70);expect(result.assessments).toHaveLength(153);
  expect(result.occurrence_count).toBe(514);expect(planByReviewId(result.volume_plan)).toEqual(planByReviewId(plan));
  expect(plan.counts.resolved_periods_by_recurrence).toEqual({annual:130,monthly:112,semiannual:10,custom:244,quarterly:18,none:0});
  for (const review of result.reviews) {
    const original = before.reviews.find(row => row.review_id === review.review_id);
    for (const key of ['review_id','created_at','created_by','due_date','recurrence','custom_recurrence_days',
      'schedule_anchor','recurrence_due_date','next_review_date','status','current_occurrence_id','cancelled_at','owner_id','reviewer_id'])
      expect(review[key]).toEqual(original[key]);
    expect(review.occurrences.map(row => row.due_date)).toEqual(plan.reviews.find(row => row.review_id === review.review_id).due_dates);
  }
  for (const assessment of result.assessments) {
    const original = before.framework_assessments.find(row => row.framework_assessment_id === assessment.framework_assessment_id);
    for (const key of ['framework_assessment_id','status','created_at','created_by','implementation','technology','notes','owner_id','process_owner_id',
      'last_assessed','last_saved','assessed_by','guided_assessment_source','verification','verification_checklist','items_to_address'])
      expect(assessment[key]).toEqual(original[key]);
  }
  for (const key of ['users','contacts','clients','baselines','guided_assessment_pilot','command_requests','ai_intake','ai_counters','riskSequences','evidence'])
    expect(value.db[key]).toEqual(before[key]);
  for (const kind of Object.keys(ids)) expect(value.db[kind].filter(row => row.client_id !== CID))
    .toEqual(before[kind].filter(row => row.client_id !== CID));
  expect(result.exceptions).toEqual([]);expect(result.volume_plan.complete).toBe(true);
});

test('periods preserve original due dates, native next cycles, real births and exclusive cancellation cutoffs', () => {
  const value = state(), result = install(value), occurrenceIds = [];
  for (const review of result.reviews) {
    const planned = result.volume_plan.reviews.find(row => row.review_id === review.review_id);
    let previous;
    for (const occurrence of review.occurrences) {
      occurrenceIds.push(occurrence.occurrence_id);
      expect(occurrence).toMatchObject({client_id:CID,review_id:review.review_id,status:'completed',completed_by:value.owner});
      expect(occurrence.due_date >= planned.origin.slice(0,10)).toBe(true);
      expect(occurrence.completed_at < value.dates.anchor).toBe(true);
      expect(occurrence.due_date).not.toBe(review.due_date);expect(occurrence.due_date).not.toBe(planned.current_period_date);
      if (planned.terminal_at) expect(occurrence.due_date < planned.terminal_at.slice(0,10)).toBe(true);
      expect(occurrence.created_at <= occurrence.started_at && occurrence.started_at <= occurrence.completed_at).toBe(true);
      expect(occurrence.next_review_date).toBe(reviewSchedule({...review,due_date:occurrence.due_date,recurrence_due_date:null}).next_review_date);
      if (previous) expect(previous.next_review_date.slice(0,10)).toBe(occurrence.due_date);
      expect(occurrence.occurrences).toBeUndefined();expect(occurrence.cancelled_at).toBeUndefined();expect(occurrence.evidence).toEqual([]);
      expect(occurrence.fixture_history_provenance).toMatch(/not browser execution/);
      previous = occurrence;
    }
  }
  expect(new Set(occurrenceIds).size).toBe(result.occurrence_count);
  const inventory = result.reviews.find(row => row.framework_plan_key === 'asset-inventory');
  expect(inventory.occurrences.at(-1).completed_at.slice(0,10))
    .toBe(value.db.guided_assessment_pilot['fw_'+CID+'_assessment_1.1:'+value.owner].answers.last_review);
  for (const key of ['passive-discovery-reconciliation','8.11']) {
    const review = result.reviews.find(row => row.framework_plan_key === key || row.framework_setup_key === 'fw_'+CID+'_review_requirement:'+key);
    expect(review.recurrence).toBe('custom');expect(review.custom_recurrence_days).toBe(7);
    for (let index = 1;index < review.occurrences.length;index++)
      expect((Date.parse(review.occurrences[index].due_date)-Date.parse(review.occurrences[index-1].due_date))/86400000).toBe(7);
  }
});

test('five-year program history stays framework-neutral and known CIS gaps control the actual first clean baseline', () => {
  const value = state(), result = install(value);
  expect(result.organization_origin).toBe('2021-11-04T00:00:00.000Z');expect(result.origin).toBe('2024-07-01');
  const program = value.db.logs.filter(row => row.client_id === CID && row.action === 'Security program milestone');
  expect(program.map(row => row.at)).toEqual(['2021-11-04T00:00:00.000Z','2022-11-04T00:00:00.000Z','2023-11-04T00:00:00.000Z']);
  expect(program.every(row => row.meta.classification.includes('framework-neutral'))).toBe(true);
  for (const assessment of result.assessments) {
    expect(assessment.assessment_history[0].at).toBe('2024-07-01T00:00:00.000Z');
    expect(['not_assessed','needs_attention']).toContain(assessment.assessment_history[0].status);
    for (const event of assessment.assessment_history) {
      expect(event.at >= value.governance.origin && event.at <= assessment.last_saved).toBe(true);
      if (event.at !== assessment.last_saved) {
        expect(event.guided_assessment_source).toBeUndefined();expect(event.cis_assessment_criteria).toBeUndefined();
      }
    }
    expect(assessment.verification).toBe('needs_validation');expect(assessment.verification_checklist).toBeNull();
    const current = assessment.assessment_history.find(row => row.at === assessment.last_saved);
    expect(current.guided_assessment_source).toEqual(assessment.guided_assessment_source);
  }
  const context = value.db.cis_demo_scenario_history[CID];
  expect(result.reporting_seeded).toBe(true);expect(context.point_ids).toHaveLength(6);
  for (const point of value.db.portfolio_reporting.snapshots.filter(row => context.point_ids.includes(row.snapshot_id))) {
    const implemented = result.assessments.filter(row => row.assessment_history.filter(event => event.at <= point.effective_at).at(-1)?.status === 'addressed').length;
    expect(point.current.implemented).toBe(implemented);expect(point.current.denominator).toBe(153);
  }
  expect(value.db.portfolio_reporting.snapshots.at(-1).current.implemented).toBe(153);
  const at = cutoff => result.assessments.filter(row => row.assessment_history.filter(event => event.at <= cutoff).at(-1)?.status === 'addressed').length;
  expect(at('2024-11-04T00:00:00.000Z')).toBeLessThan(153);
  expect(at(result.first_fully_implemented_at)).toBe(153);
  expect(result.first_fully_implemented_at).toBe(result.tasks.find(row => row.risk_id === CID+'_canonical_risk_retired-hosting').completed_at);
  expect(result.first_fully_implemented_at.startsWith('2025-07')).toBe(true);
  expect(result.verification_basis).toHaveLength(153);expect(result.verification_basis.every(row => row.verification === 'needs_validation')).toBe(true);
});

test('historical document coverage uses exact effective approved1.0/2.0 subjects without rewriting approvals', () => {
  const value = state(), before = copy(value.db.policies), result = install(value), versions = new Set();
  for (const review of result.reviews.filter(row => row.policy_id)) {
    const policy = value.db.policies.find(row => row.policy_id === review.policy_id);
    for (const occurrence of review.occurrences) {
      const covered = effectivePolicySubject(policy,occurrence.completed_at);
      expect(occurrence.policy_coverage).toEqual([covered]);versions.add(covered.version);
      expect(covered.approval_recorded_at <= occurrence.completed_at).toBe(true);
      expect(covered.approval.action).toBe('external_approval_recorded');
    }
  }
  expect([...versions].sort()).toEqual(['1.0','2.0']);
  for (const policy of value.db.policies) {
    const original = before.find(row => row.policy_id === policy.policy_id);
    for (const key of ['status','version','approval_history','decision_history','approval_subject','approved_at','approval_source','effective_date'])
      expect(policy[key]).toEqual(original[key]);
  }
  for (const review of result.reviews.filter(row => ['secure-development','penetration-testing'].includes(row.framework_plan_key)))
    expect(review.occurrences.every(row => row.policy_coverage === undefined)).toBe(true);
});

test('provider inventory respects relationship births, full exit and the earlier entitlement-only correction', () => {
  const value = state(), result = install(value);
  const inventory = result.reviews.find(row => row.framework_plan_key === 'provider-inventory');
  const january2025 = inventory.occurrences.find(row => row.due_date.startsWith('2025-01')).source_snapshot.vendor_roster;
  const january2026 = inventory.occurrences.find(row => row.due_date.startsWith('2026-01')).source_snapshot.vendor_roster;
  expect(january2025).toHaveLength(13);expect(january2025.every(row => row.status === 'active')).toBe(true);
  expect(january2025.some(row => /vendor_(openai|anthropic)$/.test(row.vendor_id))).toBe(false);
  expect(january2026).toHaveLength(15);expect(january2026.every(row => row.status === 'active')).toBe(true);
  expect(value.db.vendors.filter(row => row.client_id === CID && row.status === 'active')).toHaveLength(14);
  const access = result.reviews.find(row => row.framework_plan_key === 'account-authorization');
  const entitlement = prefix => access.occurrences.find(row => row.due_date.startsWith(prefix)).source_snapshot.support_entitlements[0];
  expect(entitlement('2025-06')).toMatchObject({status:'active',relationship_status:'active'});
  expect(entitlement('2025-09')).toMatchObject({status:'revoked',relationship_status:'active'});
  expect(entitlement('2026-06')).toMatchObject({status:'revoked',relationship_status:'inactive'});
  const hosting = result.reviews.find(row => row.vendor_id === CID+'_canonical_vendor_hosting' && row.vendor_purpose === 'vendor');
  expect(hosting.occurrences.find(row => row.due_date.startsWith('2022')).source_snapshot.status).toBe('active');
});

test('recent AI births acquire no invented prior annual review, screening or approval', () => {
  const value = state(), before = copy(value.db.ai_systems), result = install(value);
  expect(value.db.ai_systems).toEqual(before);
  for (const ai of value.db.ai_systems.filter(row => row.client_id === CID)) {
    expect(ai.status).toBe('draft');expect(ai.approval_status).toBe('pending_assessment');expect(ai.approval_history || []).toEqual([]);
    const riskId = ai.related_links.find(row => row.kind === 'risks').id;
    for (const review of result.reviews.filter(row => row.ai_system_id === ai.ai_system_id || row.risk_id === riskId))
      expect(review.occurrences).toEqual([]);
  }
});

test('every diagnosed historical CIS defect has completed native work and a distinct validated Finding closure', () => {
  const value = state(), originalTasks = copy(value.operations.tasks), result = install(value);
  expect(result.findings).toHaveLength(13);
  for (const finding of result.findings) {
    const task = result.tasks.find(row => row.task_id === finding.primary_task_id);
    expect(finding.status).toBe('closed');expect(task).toMatchObject({status:'done',source_type:'finding',source_id:finding.finding_id,finding_id:finding.finding_id});
    expect(task.created_at <= task.started_at && task.started_at <= task.completed_at).toBe(true);
    expect(finding.validated_at > task.completed_at && finding.validated_at === finding.closed_at).toBe(true);
    expect(finding.decision_history).toEqual([expect.objectContaining({action:'validated',at:finding.validated_at,by:'demo_admin'})]);
    expect(finding.decision_history[0].rationale).toMatch(/not a client signature/);
    const assessment = result.assessments.find(row => row.framework_assessment_id === finding.framework_assessment_id);
    expect(assessment.related_links).toContainEqual({kind:'findings',id:finding.finding_id});
    expect(assessment.status).toBe('addressed');expect(assessment.items_to_address).toEqual([]);
    if (finding.occurrence_id) {
      const occurrence = result.reviews.find(row => row.review_id === finding.review_id).occurrences.find(row => row.occurrence_id === finding.occurrence_id);
      expect(occurrence.finding_ids).toContain(finding.finding_id);expect(occurrence.outcome).toBe('findings_raised');
      expect(task.occurrence_id).toBe(finding.occurrence_id);
    }
  }
  const critical = result.tasks.filter(row => row.priority === 'critical');expect(critical).toHaveLength(1);
  expect(critical[0].task_id).toBe(PREFIX+'task_app-auth27');
  expect(() => prepareTask(value.db,{...critical[0],status:'open'})).not.toThrow();
  expect(result.findings.find(row => row.finding_id === critical[0].finding_id).severity).toBe('high');
  for (const task of originalTasks) expect(value.db.tasks.find(row => row.task_id === task.task_id)).toEqual(task);
});

test('existing control gaps carry into enrollment until real correction while ordinary operating defects do not invent safeguard failures', () => {
  const value = state(), result = install(value), access = result.assessments.find(row => row.definition_id === '6.2');
  const retained = result.findings.filter(row => row.finding_id.startsWith(PREFIX+'finding_retained-'));
  for (const finding of retained) {
    expect(finding.created_at).toBe(value.governance.origin);
    expect(finding.description).toContain('2021-11-04T00:00:00.000Z');
  }
  const at = value => access.assessment_history.filter(event => event.at <= value).at(-1);
  expect(at('2024-08-20T00:00:00.000Z').status).not.toBe('addressed');
  expect(at('2025-01-01T00:00:00.000Z').status).not.toBe('addressed');
  expect(at('2025-08-05T00:00:00.000Z').status).toBe('addressed');
  for (const id of ['2.3','7.7','16.2','18.3','13.11']) {
    const assessment = result.assessments.find(row => row.definition_id === id);
    expect(assessment.assessment_history.filter(event => ['needs_attention','in_progress'].includes(event.status))).toEqual([]);
  }
  const dormant = result.findings.find(row => row.finding_id === PREFIX+'finding_retained-old-menu-account');
  expect(dormant.description).toMatch(/exact dormancy duration is not established/);
  const dormantAssessment = result.assessments.find(row => row.definition_id === '5.3');
  expect(dormantAssessment.assessment_history[0].status).toBe('not_assessed');
  expect(dormantAssessment.assessment_history.filter(event => event.at <= '2024-10-01T00:00:00.000Z').at(-1).status).toBe('not_assessed');
  for (const id of ['2.2','5.2']) {
    const history = result.assessments.find(row => row.definition_id === id).assessment_history;
    expect(history.filter(event => ['needs_attention','in_progress'].includes(event.status))).toEqual([]);
    expect(history.filter(event => event.at <= '2024-10-01T00:00:00.000Z').at(-1).status).toBe('not_assessed');
  }
});

test('Risk assessment and decisions retain original dates; closed Risks and inactive Vendors remain closed', () => {
  const value = state(), before = copy(value.db.risks), result = install(value);
  for (const risk of value.db.risks.filter(row => row.client_id === CID)) {
    const original = before.find(row => row.risk_id === risk.risk_id), review = result.reviews.find(row => row.risk_id === risk.risk_id);
    for (const key of ['created_at','status','likelihood_score','impact_score','risk_score','accepted_by','acceptance_date','acceptance_expires_at','closed_at','closed_by','next_review'])
      expect(risk[key]).toEqual(original[key]);
    expect(risk.rating_history[0].at).toBe(risk.created_at);
    if (risk.status === 'closed') {
      expect(review.status).toBe('cancelled');expect(risk.next_review).toBeNull();
      const tasks = value.db.tasks.filter(row => row.risk_id === risk.risk_id);
      expect(tasks).toHaveLength(1);expect(tasks[0].status).toBe('done');expect(tasks[0].completed_at < risk.closed_at).toBe(true);
      expect(risk.decision_history[0]).toMatchObject({action:'closed',at:risk.closed_at,by:risk.closed_by});
    }
    if (risk.status === 'accepted') {
      expect(risk.decision_history[0]).toMatchObject({action:'accepted',at:risk.acceptance_date,expires_at:risk.acceptance_expires_at});
      for (const occurrence of review.occurrences.filter(row => row.completed_at < risk.acceptance_date)) {
        expect(occurrence.risk_after.status).toBe('assessed');expect(occurrence.risk_after.acceptance_date).toBeNull();
      }
    }
  }
  const retired = value.db.vendors.find(row => row.vendor_id === CID+'_canonical_vendor_retired');
  expect(retired.status).toBe('inactive');expect(retired.next_review).toBeNull();
  const review = result.reviews.find(row => row.vendor_id === retired.vendor_id);expect(review.status).toBe('cancelled');
  expect(review.occurrences.every(row => row.completed_at < retired.offboarded_at)).toBe(true);
});

test('evidence specifications resolve to actual occurrences and records and retain the later compilation date', () => {
  const value = state(), result = install(value), kinds = {review:'reviews',finding:'findings',task:'tasks'};
  expect(value.db.evidence.filter(row => row.client_id === CID)).toEqual([]);
  for (const spec of result.evidence_specs) {
    expect(value.db[kinds[spec.linked_type]].some(row => row[ids[kinds[spec.linked_type]]] === spec.linked_id && row.client_id === CID)).toBe(true);
    expect(spec.content_outline.join(' ')).toMatch(/retrospective synthetic observations/);
    for (const relationship of spec.relationships) {
      const target = value.db[relationship.kind].find(row => row[ids[relationship.kind]] === relationship.id);
      expect(target.client_id).toBe(CID);
      if (relationship.occurrence_id) expect(target.occurrences.some(row => row.occurrence_id === relationship.occurrence_id)).toBe(true);
    }
    if (spec.linked_type === 'review') expect(spec.content_outline.join(' ')).toContain('Retrospectively compiled at '+value.dates.anchor);
  }
});

test('a month-end parent retains native February clamping throughout the materialized ledger', () => {
  const value = state(), review = value.db.reviews.find(row => row.framework_plan_key === 'software-support');
  review.due_date = '2026-11-30';Object.assign(review,reviewSchedule(review,true));
  const result = install(value), cycles = result.reviews.find(row => row.review_id === review.review_id).occurrences;
  expect(cycles.some(row => row.due_date === '2026-02-28')).toBe(true);expect(cycles.some(row => row.due_date === '2026-03-31')).toBe(true);
  expect(cycles.at(-1).next_review_date.slice(0,10)).toBe('2026-11-30');
  expect(result.occurrence_count).toBe(result.volume_plan.counts.planned_past_periods);
});

test('a complete repeat is read-only and preserves original record identities', () => {
  const value = state(), reviews = value.db.reviews.slice(), assessments = value.db.framework_assessments.slice();
  install(value);const before = copy(value.db), result = install(value);
  expect(value.db).toEqual(before);expect(result.occurrence_count).toBe(514);
  for (const review of reviews) expect(value.db.reviews.find(row => row.review_id === review.review_id)).toBe(review);
  for (const assessment of assessments) expect(value.db.framework_assessments.find(row => row.framework_assessment_id === assessment.framework_assessment_id)).toBe(assessment);
});

test('a later frozen source cohort follows its actual plan rather than a universal514 constant', () => {
  const clock = new Date('2027-11-04T12:00:00.000Z');jest.setSystemTime(clock);
  const value = build(clock), plan = nativePlan(value), result = install(value);
  expect(plan.counts.planned_past_periods).not.toBe(514);
  expect(result.occurrence_count).toBe(plan.counts.planned_past_periods);
  for (const row of result.reviews) expect(row.occurrences.map(occurrence => occurrence.due_date))
    .toEqual(plan.reviews.find(parent => parent.review_id === row.review_id).due_dates);
});

test('a partial retained installation is rejected without filling or rewriting it', () => {
  const value = state();install(value);value.db.reviews.find(row => row.client_id === CID && row.occurrences.length).occurrences.pop();
  const before = copy(value.db);expect(() => install(value)).toThrow(/partial retained history/);expect(value.db).toEqual(before);
});

test.each([
  ['changed current implementation',value => {value.db.framework_assessments.find(row => row.client_id === CID).status = 'in_progress';}],
  ['missing process Contact',value => {const id = value.db.framework_assessments.find(row => row.client_id === CID).process_owner_id;
    value.db.contacts.find(row => row.contact_id === id).status = 'inactive';}],
  ['foreign source Review',value => {value.db.reviews.find(row => row.client_id === CID).client_id = 'other';}],
  ['source origin conflict',value => {value.operations.review_origins[0].origin = '2020-01-01';}],
  ['missing terminal',value => {const review = value.db.reviews.find(row => row.status === 'cancelled');delete review.cancelled_at;
    value.operations.review_origins.find(row => row.review_id === review.review_id).terminal_at = null;}],
  ['retained assessment history',value => {value.db.framework_assessments.find(row => row.client_id === CID).assessment_history = [{at:'2025-01-01'}];}],
  ['retained occurrence',value => {value.db.reviews[0].occurrences = [{occurrence_id:'visitor-history'}];}],
  ['retained Finding',value => {value.db.findings.push({finding_id:'visitor-finding',client_id:CID});}],
  ['retained Action',value => {value.db.tasks.push({task_id:'visitor-task',client_id:CID});}],
  ['retained reporting',value => {value.db.portfolio_reporting = {snapshots:[{client_id:CID}]};}],
  ['incomplete historical approval',value => {const policy = value.db.policies.find(row => row.client_id === CID);
    policy.decision_history = policy.decision_history.filter(row => row.subject.version !== '1.0');}],
  ['duplicate closed-Risk treatment',value => {value.db.risks.find(row => row.risk_id.endsWith('retired-pos-route')).related_task_ids = ['visitor-task'];}],
  ['future audit',value => {value.db.logs.push({audit_id:'future-source',client_id:CID,at:value.dates.instant(1)});}]
])('%s rejects without partial target or foreign writes', (_label,change) => {
  const value = state();change(value);const before = copy(value.db);
  expect(() => install(value)).toThrow();expect(value.db).toEqual(before);
});

test.each(['audit_id','log_id'])('foreign %s aliases cannot collide with generated history audits', field => {
  const valid = state();install(valid);
  const id = valid.db.logs.find(row => row.client_id === CID && row.audit_id?.startsWith(PREFIX)).audit_id;
  const value = state();value.db.logs.push({client_id:'other',[field]:id,action:'Retained event'});const before = copy(value.db);
  expect(() => install(value)).toThrow(/collides/);expect(value.db).toEqual(before);
});

test.each([
  ['findings','finding_id',PREFIX+'finding_retained-retired-pos-route'],
  ['tasks','task_id',PREFIX+'task_retained-retired-pos-route'],
])('foreign generated %s identities are preserved and reject the whole import', (kind,field,id) => {
  const value = state();value.db[kind].push({client_id:'other',[field]:id});const before = copy(value.db);
  expect(() => install(value)).toThrow(/collides/);expect(value.db).toEqual(before);
});

test('a foreign occurrence identity cannot be overwritten by a generated period', () => {
  const value = state(), plan = nativePlan(value), parent = plan.reviews.find(row => row.due_dates.length);
  value.db.reviews.push({client_id:'other',review_id:'foreign-review',occurrences:[{occurrence_id:parent.review_id+'_'+parent.due_dates[0]}]});
  const before = copy(value.db);expect(() => install(value)).toThrow(/occurrence identity collides/);expect(value.db).toEqual(before);
});

test('failure after the native reporting service stages data leaves the entire input unchanged', () => {
  const value = state(), before = copy(value.db), native = reporting.seedCisScenarioHistory;
  const spy = jest.spyOn(reporting,'seedCisScenarioHistory').mockImplementation((...args) => {
    native(...args);throw new Error('Injected failure after native reporting write');
  });
  expect(() => install(value)).toThrow('Injected failure after native reporting write');expect(spy).toHaveBeenCalledTimes(1);
  expect(value.db).toEqual(before);
});
