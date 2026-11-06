import {ids} from './store';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishInitechBaseline} from './cisCanonicalInitechBaseline';
import {populateInitechAssessments} from './cisCanonicalInitechAssessments';
import {populateInitechGovernance} from './cisCanonicalInitechGovernance';
import {seedInitechOperations} from './cisCanonicalInitechOperations';
import {seedInitechHistory} from './cisCanonicalInitechHistory';
import {reviewSchedule} from '../lib/reviewOccurrences';
import {effectivePolicySubject} from './policyReviewCoverage';

const CID = 'demo_initech', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const copy = value => JSON.parse(JSON.stringify(value));
const names = ['Bill Lumbergh','Peter Gibbons','Michael Bolton','Samir Nagheenanajar','Tom Smykowski','Milton Waddams','Nina'];
const deficiencyIds = ['2.6','3.8','5.5','9.5','13.6','15.4','16.4','3.9'];
let prepared;

function build(clock = CLOCK) {
  const dates = cisDemoFixtureDates(clock);
  const actor = {user_id:'existing_demo_actor', name:'Synthetic importer', email:'importer@example.test',
    role:'super_admin', workspace_mode:'demo', status:'active', client_ids:[CID,'other']};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])), user:actor, users:[actor],
    logs:[{log_id:'foreign-history-event', client_id:'other', action:'Retained event', meta:{keep:'Visitor data'}}],
    notifications:[], drafts:{}, baselines:{other:{completed:true}}, clients:[{
      client_id:CID,name:'Initech',environment:'Demo',status:'active',logo:'retained-initech',
      primary_contact_id:CID+'_contact_1',assigned_owner_id:actor.user_id},
    {client_id:'other',name:'Retained client',status:'active',environment:'Demo'}],
    contacts:names.map((name,index) => ({client_id:CID,contact_id:CID+'_contact_'+index,name,status:'active'})),
    policies:[{policy_id:'foreign-policy',client_id:'other',status:'draft',notes:'Visitor policy'}],
    risks:[{risk_id:'foreign-risk',client_id:'other',notes:'Visitor Risk'}]};
  establishInitechBaseline(db,{dates});
  populateInitechAssessments(db,{dates,owner:actor.user_id});
  const governance = populateInitechGovernance(db,{dates,owner:actor.user_id});
  const operations = seedInitechOperations(db,{dates,owner:actor.user_id});
  return {db,dates,owner:actor.user_id,governance,operations};
}
const fixture = () => copy(prepared);
// Date helpers are functions, so restore them after cloning the decoded records.
function state() {const value = fixture(); value.dates = cisDemoFixtureDates(CLOCK); return value;}
const install = value => seedInitechHistory(value.db,value);

beforeAll(() => {jest.useFakeTimers().setSystemTime(CLOCK); prepared = build(); jest.useRealTimers();});
beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => jest.useRealTimers());

test('the full 24-month history preserves native current counts, all identities, source dates and future parent cycles', () => {
  const value = state(), before = copy(value.db), result = install(value);
  expect(result.assessments).toHaveLength(130);
  expect(result.reviews).toHaveLength(66);
  expect(result.findings).toHaveLength(11);
  expect(value.operations.risks.filter(row => row.status === 'closed')).toHaveLength(10);
  expect(result.tasks).toHaveLength(21);
  expect(value.db.tasks.filter(row => row.client_id === CID)).toHaveLength(31);
  expect(Object.fromEntries(['addressed','in_progress','needs_attention','not_assessed'].map(status =>
    [status,result.assessments.filter(row => row.status === status).length])))
    .toEqual({addressed:120,in_progress:7,needs_attention:1,not_assessed:2});
  expect(result.origin).toBe('2024-11-02');
  for (const assessment of result.assessments) {
    const original = before.framework_assessments.find(row => row.framework_assessment_id === assessment.framework_assessment_id);
    for (const key of ['framework_assessment_id','status','created_at','created_by','implementation','technology','notes',
      'last_assessed','last_saved','assessed_by','guided_assessment_source','verification','verification_checklist'])
      expect(assessment[key]).toEqual(original[key]);
    expect(assessment.assessment_history.every(row => row.at >= '2024-06-25' && row.at <= value.dates.anchor)).toBe(true);
  }
  for (const review of result.reviews) {
    const original = before.reviews.find(row => row.review_id === review.review_id);
    for (const key of ['review_id','created_at','created_by','due_date','recurrence','custom_recurrence_days',
      'schedule_anchor','recurrence_due_date','next_review_date','status','current_occurrence_id','cancelled_at'])
      expect(review[key]).toEqual(original[key]);
    const origin = value.operations.review_origins.find(row => row.review_id === review.review_id);
    let previous;
    for (const occurrence of review.occurrences) {
      expect(occurrence).toMatchObject({client_id:CID,review_id:review.review_id,status:'completed'});
      expect(occurrence.created_at <= occurrence.started_at && occurrence.started_at <= occurrence.completed_at).toBe(true);
      expect(occurrence.completed_at < value.dates.anchor).toBe(true);
      expect(occurrence.due_date >= result.origin).toBe(true);
      expect(occurrence.completed_at >= review.created_at).toBe(true);
      if (origin?.terminal_at) expect(occurrence.completed_at < origin.terminal_at).toBe(true);
      if (previous) expect(previous.next_review_date.slice(0,10)).toBe(occurrence.due_date);
      expect(occurrence.evidence).toEqual([]);
      expect(occurrence.occurrences).toBeUndefined();
      expect(occurrence.cancelled_at).toBeUndefined();
      expect(occurrence.fixture_history_provenance).toMatch(/not browser execution/);
      previous = occurrence;
    }
    if (review.recurrence === 'none') expect(review.occurrences).toEqual([]);
  }
  expect(value.db.users).toEqual(before.users); expect(value.db.contacts).toEqual(before.contacts);
  for (const [kind] of Object.entries(ids))
    expect(value.db[kind].filter(row => row.client_id !== CID)).toEqual(before[kind].filter(row => row.client_id !== CID));
  expect(value.db.logs.filter(row => row.client_id !== CID)).toEqual(before.logs.filter(row => row.client_id !== CID));
});

test('the latest full asset inventory is exactly the actual interview date and weekly log cycles remain weekly', () => {
  const value = state(), result = install(value);
  const inventory = result.reviews.find(row => row.framework_plan_key === 'asset-inventory');
  const draft = value.db.guided_assessment_pilot['fw_'+CID+'_assessment_1.1:'+value.owner];
  expect(draft.answers.last_review).toBe('2026-10-02');
  expect(inventory.occurrences.at(-1).completed_at.slice(0,10)).toBe(draft.answers.last_review);
  expect(inventory.due_date).toBe('2027-04-02');
  expect(inventory.occurrences.at(-1).next_review_date.slice(0,10)).toBe(inventory.due_date);
  const logs = result.reviews.find(row => row.framework_setup_key === `fw_${CID}_review_requirement:8.11`);
  expect(logs.recurrence).toBe('custom'); expect(logs.custom_recurrence_days).toBe(7);
  expect(logs.occurrences.length).toBeGreaterThan(100);
  for (let index = 1; index < logs.occurrences.length; index++)
    expect((Date.parse(logs.occurrences[index].due_date)-Date.parse(logs.occurrences[index-1].due_date))/86400000).toBe(7);
});

test('all eight deficiencies reuse existing Risk identities and each shares exactly one native Finding Action', () => {
  const value = state(), riskIds = value.operations.risks.map(row => row.risk_id), result = install(value);
  expect(value.db.risks.filter(row => row.client_id === CID).map(row => row.risk_id)).toEqual(riskIds);
  for (const id of deficiencyIds) {
    const assessment = result.assessments.find(row => row.definition_id === id);
    const findings = result.findings.filter(row => row.definition_id === id);
    expect(findings).toHaveLength(1);
    const finding = findings[0], tasks = value.db.tasks.filter(row => row.finding_id === finding.finding_id);
    expect(tasks).toHaveLength(1);
    const task = tasks[0], source = value.operations.source_definition_risks.find(row => row.definition_id === id);
    const risk = value.db.risks.find(row => row.risk_id === source.risk_id);
    expect(task).toMatchObject({source_type:'finding',source_id:finding.finding_id});
    expect(risk.related_task_ids).toEqual([task.task_id]);
    expect(risk.related_finding_ids).toContain(finding.finding_id);
    expect(task.related_links).toContainEqual({kind:'risks',id:risk.risk_id});
    expect(finding.primary_task_id).toBe(task.task_id);
    expect(finding.closed_at).toBeUndefined();
    expect(assessment.items_to_address.filter(row => row.kind === 'gap').every(row => row.finding_id === finding.finding_id)).toBe(true);
    expect(assessment.assessment_history.some(row => row.status === 'addressed')).toBe(false);
  }
  const pending = result.findings.find(row => row.definition_id === '2.3');
  expect(pending.status).toBe('remediated');
  expect(result.tasks.find(row => row.task_id === pending.primary_task_id).status).toBe('done');
  expect(pending.validated_at).toBeUndefined();
  for (const id of ['6.2','8.11']) {
    const finding = result.findings.find(row => row.definition_id === id);
    const task = result.tasks.find(row => row.task_id === finding.primary_task_id);
    expect(finding.status).toBe('closed'); expect(finding.validated_at > task.completed_at).toBe(true);
    expect(finding.decision_history[0].rationale).toMatch(/not an in-app client signature/);
  }
});

test('unknown restore and IDS safeguards have no fabricated execution, judgment, verification or successful historical finding', () => {
  const value = state(), result = install(value);
  for (const id of ['11.5','13.3']) {
    const row = result.assessments.find(item => item.definition_id === id);
    expect(row).toMatchObject({status:'not_assessed',last_saved:null,last_assessed:null,assessed_by:null,verification:null,assessment_history:[]});
    expect(row.guided_assessment_source).toBeUndefined();
    expect(result.findings.some(item => item.definition_id === id)).toBe(false);
    const snapshots = result.reviews.flatMap(review => review.occurrences.flatMap(occurrence => occurrence.requirement_snapshot || []));
    expect(snapshots.filter(snapshot => snapshot.definition_id === id).every(snapshot => snapshot.status === 'not_assessed')).toBe(true);
  }
  const restore = result.reviews.find(row => row.framework_setup_key === `fw_${CID}_review_requirement:11.5`);
  expect(restore.recurrence).toBe('quarterly'); expect(restore.occurrences).toEqual([]);
  expect(restore.fixture_history_exception).toMatch(/no completion/);
  expect(result.exceptions).toContainEqual({review_id:restore.review_id,reason:restore.fixture_history_exception});
});

test('historical coverage uses exact approval versions and context-only Reviews never become document schedules', () => {
  const value = state(), approvalBefore = copy(value.db.policies), result = install(value);
  const versions = new Set();
  for (const review of result.reviews.filter(row => row.policy_id)) {
    const policy = value.db.policies.find(row => row.policy_id === review.policy_id);
    for (const occurrence of review.occurrences) {
      const subject = effectivePolicySubject(policy,occurrence.completed_at);
      expect(occurrence.policy_coverage).toEqual(subject ? [subject] : []);
      if (subject) {versions.add(subject.version); expect(subject.version).not.toBe('2.1-draft');}
    }
  }
  expect([...versions].sort()).toEqual(['1.0','2.0']);
  for (const plan of ['secure-development','penetration-testing']) {
    const review = result.reviews.find(row => row.framework_plan_key === plan);
    expect(review.policy_id).toBeUndefined(); expect(review.policy_ids).toBeUndefined();
    expect(review.related_links.some(row => row.kind === 'policies')).toBe(true);
    expect(review.occurrences.every(row => row.policy_coverage === undefined)).toBe(true);
  }
  for (const policy of value.db.policies) {
    const before = approvalBefore.find(row => row.policy_id === policy.policy_id);
    for (const key of ['version','status','approval_history','decision_history','approval_subject','approved_at','approval_source'])
      expect(policy[key]).toEqual(before[key]);
  }
});

test('source creation, acceptance and terminal cutoffs control snapshots without backdating AI use or closure', () => {
  const value = state(), result = install(value);
  for (const system of value.db.ai_systems.filter(row => row.client_id === CID)) {
    expect(system.approval_status).toBe('pending_assessment'); expect(system.approval_history).toBeUndefined();
    for (const review of result.reviews.filter(row => row.ai_system_id === system.ai_system_id))
      expect(review.occurrences.every(row => row.completed_at >= system.created_at && row.source_snapshot.approval_status === 'pending_assessment')).toBe(true);
  }
  for (const risk of value.db.risks.filter(row => row.client_id === CID)) {
    const review = result.reviews.find(row => row.risk_id === risk.risk_id);
    for (const occurrence of review.occurrences) {
      expect(occurrence.completed_at >= risk.created_at).toBe(true);
      if (risk.acceptance_date && occurrence.completed_at < risk.acceptance_date) {
        expect(occurrence.risk_after.status).toBe('assessed'); expect(occurrence.risk_after.acceptance_date).toBeNull();
      }
      if (risk.closed_at) expect(occurrence.completed_at < risk.closed_at).toBe(true);
    }
    if (risk.status === 'closed') {
      expect(review.status).toBe('cancelled'); expect(risk.next_review).toBeNull();
      const tasks = value.db.tasks.filter(row => row.risk_id === risk.risk_id);
      expect(tasks).toHaveLength(1); expect(tasks[0].completed_at < risk.closed_at).toBe(true);
    }
  }
  for (const vendor of value.db.vendors.filter(row => row.client_id === CID && row.status === 'inactive')) {
    const review = result.reviews.find(row => row.vendor_id === vendor.vendor_id && row.vendor_purpose === 'vendor');
    expect(review.status).toBe('cancelled'); expect(vendor.next_review).toBeNull();
    expect(review.occurrences.every(row => row.completed_at < vendor.offboarded_at)).toBe(true);
  }
});

test('native reporting reconciles dated history, includes recent progress and leaves saved verification separate', () => {
  const value = state(), result = install(value), context = value.db.cis_demo_scenario_history[CID];
  expect(result.reporting_seeded).toBe(true); expect(context.point_ids).toHaveLength(6);
  const points = value.db.portfolio_reporting.snapshots.filter(row => context.point_ids.includes(row.snapshot_id));
  for (const point of points) {
    const implemented = result.assessments.filter(row => row.assessment_history.filter(event => event.at <= point.effective_at).at(-1)?.status === 'addressed').length;
    expect(point.current.implemented).toBe(implemented); expect(point.current.denominator).toBe(130);
  }
  expect(points.at(-1).current.implemented).toBe(120);
  expect(points[0].current.implemented < points.at(-1).current.implemented).toBe(true);
  const oneMonth = points.find(row => row.effective_at.slice(0,10) === value.dates.month(-1));
  expect(oneMonth.current.implemented < points.at(-1).current.implemented).toBe(true);
  for (const row of result.assessments.filter(item => item.status !== 'not_assessed'))
    expect(row.verification).toBe(row.status === 'addressed' ? 'needs_validation' : 'gap_identified');
});

test('imported Risk acceptance and closure have matching native decisions and dated audit history', () => {
  const value = state(); install(value);
  for (const risk of value.db.risks.filter(row => row.client_id === CID)) {
    const expected = risk.status === 'accepted' ? {action:'accepted',by:risk.accepted_by,at:risk.acceptance_date,
      rationale:risk.acceptance_rationale,expires_at:risk.acceptance_expires_at}
      : risk.status === 'closed' ? {action:'closed',by:risk.closed_by,at:risk.closed_at,
        reason:risk.closure_reason,note:risk.closure_note} : null;
    if (!expected) {expect(risk.decision_history).toEqual([]); continue;}
    expect(risk.decision_history).toHaveLength(1); expect(risk.decision_history[0]).toMatchObject(expected);
    expect(risk.decision_history[0].provenance).toMatch(/imported synthetic observations/);
    const audit = value.db.logs.filter(row => row.client_id === CID && row.entity_type === 'risks'
      && row.entity_id === risk.risk_id && row.action === (expected.action === 'accepted' ? 'Risk accepted' : 'Risk closed'));
    expect(audit).toHaveLength(1); expect(audit[0].at).toBe(expected.at); expect(audit[0].user_id).toBe(expected.by);
    expect(expected.at >= risk.created_at && expected.at <= value.dates.anchor).toBe(true);
    if (expected.action === 'closed') {
      const treatment = value.db.tasks.find(row => risk.related_task_ids.includes(row.task_id));
      expect(treatment.completed_at < expected.at).toBe(true);
    }
  }
  const before = copy(value.db); install(value); expect(value.db).toEqual(before);
});

test('native month-end anchoring includes clipped February without drifting later months', () => {
  const value = state(), review = value.db.reviews.find(row => row.framework_plan_key === 'software-support');
  review.due_date = '2026-11-30'; Object.assign(review,reviewSchedule(review,true));
  const result = install(value), cycles = result.reviews.find(row => row.review_id === review.review_id).occurrences;
  expect(cycles.some(row => row.due_date === '2026-02-28')).toBe(true);
  expect(cycles.some(row => row.due_date === '2026-03-31')).toBe(true);
  expect(cycles.at(-1).next_review_date.slice(0,10)).toBe('2026-11-30');
});

test('native leap-year recurrence retains February29 and returns to the original month-end anchor', () => {
  const clock = new Date('2028-03-02T12:00:00.000Z'); jest.setSystemTime(clock);
  const value = build(clock), review = value.db.reviews.find(row => row.framework_plan_key === 'software-support');
  review.due_date = '2028-03-31'; Object.assign(review,reviewSchedule(review,true));
  const result = install(value), cycles = result.reviews.find(row => row.review_id === review.review_id).occurrences;
  expect(cycles.at(-1).due_date).toBe('2028-02-29');
  expect(cycles.at(-1).next_review_date.slice(0,10)).toBe('2028-03-31');
  expect(cycles.some(row => row.due_date === '2027-02-28')).toBe(true);
  expect(cycles.some(row => row.due_date === '2027-03-31')).toBe(true);
});

test('history evidence outlines resolve to actual native records and saved occurrences without claiming installed files', () => {
  const value = state(), result = install(value), kinds = {review:'reviews',finding:'findings',task:'tasks'};
  expect(value.db.evidence.filter(row => row.client_id === CID)).toEqual([]);
  for (const spec of result.evidence_specs) {
    const kind = kinds[spec.linked_type], record = value.db[kind].find(row => row[ids[kind]] === spec.linked_id);
    expect(record?.client_id).toBe(CID);
    expect(spec.content_outline.join(' ')).toMatch(/Explicit fictional Initech history/);
    for (const relationship of spec.relationships) {
      const target = value.db[relationship.kind].find(row => row[ids[relationship.kind]] === relationship.id);
      expect(target?.client_id).toBe(CID);
      if (relationship.occurrence_id)
        expect(target.occurrences.some(row => row.occurrence_id === relationship.occurrence_id)).toBe(true);
    }
  }
});

test('a complete repeat preserves visitor notes, original object references and already completed history', () => {
  const value = state(), result = install(value), review = result.reviews[0], assessment = result.assessments[0];
  review.notes = 'Retained visitor current notes'; const before = copy(value.db);
  install(value);
  expect(value.db).toEqual(before);
  expect(value.db.reviews.find(row => row.review_id === review.review_id)).toBe(review);
  expect(value.db.framework_assessments.find(row => row.framework_assessment_id === assessment.framework_assessment_id)).toBe(assessment);
});

test.each([
  ['standard actor', value => {value.db.user.workspace_mode = 'standard';}],
  ['read-only actor', value => {value.db.user.role = 'client_readonly';}],
  ['unknown application actor', value => {value.db.user.user_id = 'not-an-existing-account';}],
  ['ineligible owner', value => {value.db.user.status = 'disabled';}],
  ['wrong scope', value => {value.db.clients[0].framework_settings['cis-ig1'].implementation_group = 3;}],
  ['changed current conclusion', value => {value.db.framework_assessments.find(row => row.definition_id === '9.5').status = 'needs_attention';}],
  ['unknown given a judgment', value => {value.db.framework_assessments.find(row => row.definition_id === '11.5').last_assessed = value.dates.instant(-1);}],
  ['retained occurrence', value => {value.db.reviews[0].occurrences = [{occurrence_id:'visitor'}];}],
  ['completed current parent', value => {value.db.reviews[0].status = 'completed';}],
  ['invalid native cadence', value => {value.db.reviews[0].recurrence = 'weekly';}],
  ['retained assessment history', value => {value.db.framework_assessments[0].assessment_history = [{at:value.dates.anchor,status:'addressed'}];}],
  ['wrong lifecycle origin', value => {value.operations.review_origins[0].origin = value.dates.instant(-1);}],
  ['foreign source identity', value => {value.operations.source_definition_risks[0].risk_id = 'foreign-risk';}],
  ['existing treatment Action', value => {const source = value.operations.source_definition_risks[0];
    value.db.risks.find(row => row.risk_id === source.risk_id).related_task_ids = ['retained-treatment'];}],
  ['late audit event', value => {value.db.logs.push({client_id:CID,audit_id:'late-source-event',at:value.dates.instant(1)});}]
])('%s fails without partial history or connected-state writes', (_label, change) => {
  const value = state(); change(value); const before = copy(value.db);
  expect(() => install(value)).toThrow('Initech history:'); expect(value.db).toEqual(before);
});

test.each(['audit_id','log_id'])('a foreign %s alias cannot collide with a generated history event', field => {
  const valid = state(); install(valid);
  const id = valid.db.logs.find(row => row.client_id === CID && row.audit_id?.startsWith(CID+'_canonical_history_')).audit_id;
  const value = state(); value.db.logs.push({client_id:'other',[field]:id,action:'Retained foreign event'});
  const before = copy(value.db);
  expect(() => install(value)).toThrow('collides'); expect(value.db).toEqual(before);
});
