import {CATALOGS, activeDefinitions, reviewDrivers} from '../lib/frameworks';
import {reviewSchedule, reviewView} from '../lib/reviewOccurrences';
import {requirementBasis, validateGovernanceContext} from '../lib/requirementBasis';
import {policyReviewIds} from '../lib/brawndoAdditionalPolicyVendor';
import {ids, write} from './store';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishKrustyBaseline, krustyOnboardingSelection} from './cisCanonicalKrustyBaseline';
import {populateKrustyAssessments} from './cisCanonicalKrustyAssessments';
import {populateKrustyGovernance} from './cisCanonicalKrustyGovernance';
import {approvalSnapshot} from './policyProvenance';
import {effectivePolicySubject} from './policyReviewCoverage';
import {ensurePolicyReview} from './policyReviews';
import * as policyReviews from './policyReviews';
import {action} from './workflows';

const CID = 'demo_krusty_krab', CLOCK = new Date('2026-11-04T12:00:00.000Z');
const dates = cisDemoFixtureDates(CLOCK), copy = value => JSON.parse(JSON.stringify(value));
const names = ['Eugene Krabs','Squidward Tentacles','SpongeBob SquarePants'];
const scoped = (db, kind) => db[kind].filter(row => row.client_id === CID);
function fixture() {
  const actor = {user_id:'demo_admin', name:'Synthetic coordinator', email:'coordinator@example.test',
    workspace_mode:'demo', role:'super_admin', status:'active', client_ids:[CID,'other']};
  const owner = {user_id:'demo_provider_lead', name:'Morgan Ellis', email:'morgan@example.test',
    workspace_mode:'demo', role:'platform_admin', status:'active', client_ids:[CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])), user:actor, users:[actor,owner],
    logs:[{log_id:'foreign-audit-alias', client_id:'other', at:'2020-01-01T00:00:00.000Z', action:'Retained visitor event'}],
    baselines:{other:{completed:true, notes:'Retained onboarding'}}, drafts:{},
    clients:[{client_id:CID, name:'The Krusty Krab', environment:'Demo', status:'active', logo:'retained-krusty',
      primary_contact_id:CID+'_contact_0', assigned_owner_id:owner.user_id},
    {client_id:'other', name:'Retained client', environment:'Demo', status:'active'}],
    contacts:names.map((name, index) => ({contact_id:CID+'_contact_'+index, client_id:CID, name, status:'active'})),
    policies:[{policy_id:'foreign-policy', client_id:'other', status:'draft', summary:'Visitor content'}],
    evidence:[{evidence_id:'foreign-book', client_id:'other', filename:'retained.csv', content_base64:'b3JpZ2luYWw='}]};
  establishKrustyBaseline(db, {dates});
  populateKrustyAssessments(db, {dates, owner:owner.user_id});
  db.guided_assessment_pilot.foreign = {client_id:'other', answers:{keep:'Visitor answers'}};
  return db;
}
const populate = (db, options = {}) => populateKrustyGovernance(db, {dates, owner:'demo_provider_lead', ...options});
const policyFor = (result, key) => result.policies.find(row => row.baseline_key === 'policy-'+key+'-policy');
const withoutLinks = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'related_links'));

beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => {jest.restoreAllMocks(); jest.useRealTimers();});

test('nine current documents and19 native parents preserve all153 implementation and pending-validation judgments', () => {
  const db = fixture(), before = copy(db), users = db.users, contacts = db.contacts, foreignPolicy = db.policies[0];
  const catalogBefore = copy(CATALOGS['cis-ig1']), result = populate(db);
  expect(result.policies).toHaveLength(9); expect(result.reviews).toHaveLength(19);
  expect(result.reviews.filter(row => row.framework_plan_key).map(row => row.framework_plan_key).sort())
    .toEqual(krustyOnboardingSelection().plans.map(row => row.key).sort());
  expect(result.assessments).toHaveLength(153);
  expect(result.assessments.map(withoutLinks)).toEqual(scoped(before, 'framework_assessments').map(withoutLinks));
  expect(result.assessments.every(row => row.status === 'addressed' && row.verification === 'needs_validation'
    && row.verification_checklist === null && row.assessment_history.length === 0)).toBe(true);
  expect(db.guided_assessment_pilot).toEqual(before.guided_assessment_pilot);
  expect(result.policies.every(row => row.status === 'approved' && row.version === '2.0' && row.last_reviewed_at == null)).toBe(true);
  expect(result.reviews.every(row => row.occurrences.length === 0 && !row.completion_date && !row.completed_at)).toBe(true);
  expect(db.users).toBe(users); expect(db.contacts).toBe(contacts); expect(db.policies[0]).toBe(foreignPolicy);
  expect(db.clients[0].initial_program_baseline).toEqual(before.clients[0].initial_program_baseline);
  expect(db.clients[1]).toEqual(before.clients[1]);
  for (const key of ['user','users','contacts','logs','evidence','findings','tasks','risks','vendors','ai_systems','drafts'])
    expect(db[key]).toEqual(before[key]);
  expect(db.baselines.other).toEqual(before.baselines.other); expect(CATALOGS['cis-ig1']).toEqual(catalogBefore);
  expect(result.origin).toBe('2024-07-01T00:00:00.000Z');
  expect(result.organization_origin).toBe('2021-11-04T00:00:00.000Z'); expect(result.anchor).toBe(dates.anchor);
});

test('approved current and original document versions retain distinct external decisions without platform signatures or file claims', () => {
  const db = fixture(), result = populate(db);
  for (const policy of result.policies) {
    expect(policy.approval_history).toEqual([]);
    expect(policy.decision_history.map(entry => entry.action)).toEqual(['external_approval_recorded','external_approval_recorded']);
    expect(policy.decision_history.map(entry => entry.subject.version)).toEqual(['1.0','2.0']);
    const [first,current] = policy.decision_history;
    expect(first.subject.summary).not.toBe(current.subject.summary);
    expect(first.reported_approved_at).toBe(result.origin);
    expect(current.reported_approved_at).toBe(dates.month(-4)+'T00:00:00.000Z');
    for (const entry of policy.decision_history) {
      expect(entry.reported_approver_id).toBe(CID+'_contact_0'); expect(entry.recorded_by).toBe('demo_provider_lead');
      expect(entry.subject.named_approver).toEqual({contact_id:CID+'_contact_0',name:'Eugene Krabs'});
      expect(entry.subject.client_id).toBe(CID); expect(entry.subject.policy_id).toBe(policy.policy_id);
      expect(entry.subject.subject_id).toBe(policy.policy_id+'_subject_'+entry.subject.version.replaceAll('.', '_'));
      expect(entry.subject.basis).toMatchObject({type:'external',document_version:entry.subject.version,
        verification:'Reference recorded; external bytes not verified'});
      expect(entry.provenance).toMatch(/Fictional external approval reference; not an in-app signature/);
      expect(entry.recorded_at >= result.origin && entry.recorded_at <= result.anchor).toBe(true);
    }
    expect(effectivePolicySubject(policy, result.origin).version).toBe('1.0');
    expect(effectivePolicySubject(policy, dates.anchor).version).toBe('2.0');
    expect(policy.approval_subject).toEqual(current.subject); expect(policy.approval_subject.summary).toBe(policy.summary);
    expect(approvalSnapshot(db, policy).basis).toMatchObject({type:'external',document_version:'2.0'});
    expect(policy.approval_source).toEqual({version:'2.0',external_reference:current.subject.basis.reference,external_version:'2.0'});
    expect(JSON.stringify(policy)).not.toMatch(/"evidence_id"|"document_url"|"sha256"|"approval_account_id"|"submitted_by"/);
  }
});

test('6.8 and17.9 extend existing Access/Incident contents and3.4/3.5 reuse Data Handling without shared mapping edits', () => {
  const db = fixture(), catalogBefore = copy(CATALOGS['cis-ig1']), result = populate(db);
  const expected = [
    ['access-control-identity-management',['6.8']],
    ['incident-response',['17.9']],
    ['data-classification-handling',['3.4','3.5']]
  ];
  for (const [key, ids] of expected) {
    const policy = policyFor(result, key), entry = result.mapping.find(row => row.policy_id === policy.policy_id);
    expect(entry.source_supported_contents).toEqual(ids);
    for (const id of ids) {
      expect(entry.native_template_safeguards).not.toContain(id);
      expect(entry.safeguards).toContain(id);
      expect(result.assessments.find(row => row.definition_id === id).related_links).toContainEqual({kind:'policies',id:policy.policy_id});
    }
    expect(entry.sections.every(section => section.state !== 'pending')).toBe(true);
  }
  const access = result.mapping.find(row => row.policy_id === policyFor(result, 'access-control-identity-management').policy_id);
  const incident = result.mapping.find(row => row.policy_id === policyFor(result, 'incident-response').policy_id);
  const granting = access.sections.find(section => section.ids.includes('6.1'));
  const revoking = access.sections.find(section => section.ids.includes('6.2'));
  expect(granting).toMatchObject({ids:['6.1'],classification:'required_documented_process'});
  expect(granting.content).toMatch(/documented joiner and role-change granting process/);
  expect(revoking).toMatchObject({ids:['6.2'],classification:'required_process'});
  expect(revoking.content).toMatch(/Termination, rights revocation and role change trigger immediate access removal/);
  expect(revoking.content).toMatch(/disabling the relevant accounts/);
  expect(revoking.content).toMatch(/disabled identities are retained to preserve audit trails/);
  const development = result.mapping.find(row => row.policy_id === policyFor(result, 'vulnerability-patch-management').policy_id);
  const processes = development.sections.find(section => section.ids.includes('16.1'));
  const severity = development.sections.find(section => section.ids.includes('16.6'));
  expect(processes).toMatchObject({ids:['16.1','16.2'],classification:'required_process'});
  expect(processes.content).toMatch(/documentation is reviewed annually and after significant enterprise change/);
  expect(severity).toMatchObject({ids:['16.6'],classification:'required_process'});
  expect(severity.content).toMatch(/reviewed and updated at least annually/);
  expect(severity.content).not.toMatch(/significant.*change|annual\/change/);
  expect(access.required_contents).toContain('6.8'); expect(incident.required_contents).toContain('17.9');
  expect(policyFor(result, 'access-control-identity-management').summary).toMatch(/role-to-rights matrix/);
  expect(policyFor(result, 'incident-response').summary).toMatch(/Thresholds are reviewed annually and after significant change/);
  expect(policyFor(result, 'data-retention-secure-disposal')).toBeUndefined();
  expect(CATALOGS['cis-ig1']).toEqual(catalogBefore);
  const scope = new Set(activeDefinitions('cis-ig1', {implementation_group:3}).map(row => row.id));
  for (const entry of result.mapping) {
    expect(new Set([...entry.required_contents,...entry.supporting_context])).toEqual(new Set(entry.safeguards));
    expect(entry.safeguards.every(id => scope.has(id))).toBe(true);
    expect(entry.approved_version).toBe('2.0'); expect(entry.current_version).toBe('2.0');
  }
});

test('current native Review schedules retain exact duty cadences, source semantics and no overdue obligations', () => {
  const db = fixture(), result = populate(db), plans = krustyOnboardingSelection().plans;
  for (const plan of plans) {
    const review = result.reviews.find(row => row.framework_plan_key === plan.key);
    expect(review.recurrence).toBe(plan.default_cadence); expect(reviewDrivers(review)).toHaveLength(1);
    expect(reviewDrivers(review)[0].framework_basis).toBe(plan.basis);
    expect(reviewView(review)).toEqual(review); expect(review.due_date > dates.day(0)).toBe(true);
    expect(() => validateGovernanceContext(review.governance_context)).not.toThrow();
  }
  for (const key of ['passive-discovery-reconciliation','script-allowlist-reassessment','event-alert-tuning','internal-penetration-test'])
    expect(result.review_manifest.find(row => row.plan_key === key).native_cadence_class).toBe('B');
  const weekly = result.reviews.find(row => row.framework_plan_key === 'passive-discovery-reconciliation');
  expect(weekly).toMatchObject({recurrence:'custom',custom_recurrence_days:7,due_date:dates.day(3)});
  expect(result.reviews.find(row => row.framework_plan_key === 'script-allowlist-reassessment').recurrence).toBe('semiannual');
  expect(result.reviews.find(row => row.framework_plan_key === 'event-alert-tuning').recurrence).toBe('monthly');
  expect(result.reviews.find(row => row.framework_plan_key === 'internal-penetration-test').recurrence).toBe('annual');
  const manual = result.reviews.filter(row => !row.framework_plan_key);
  expect(manual.map(row => row.review_id).sort()).toEqual(['fw_'+CID+'_review_requirement:8.11','fw_'+CID+'_review_requirement:11.5'].sort());
  for (const review of manual) {
    expect(review.framework_setup_key).toBe(review.review_id); expect(reviewDrivers(review)).toEqual([]);
    expect(review.occurrences).toEqual([]); expect(review.status).toBe('upcoming');
    const linked = result.assessments.filter(row => row.related_links.some(link => link.kind === 'reviews' && link.id === review.review_id));
    expect(requirementBasis('reviews', review, {framework_assessments:linked})[0].requirements.map(row => row.definition.id))
      .toEqual(review.framework_safeguards);
  }
  expect(manual.find(row => row.framework_safeguards.includes('8.11'))).toMatchObject({recurrence:'custom',custom_recurrence_days:7});
  expect(manual.find(row => row.framework_safeguards.includes('11.5')).recurrence).toBe('quarterly');
  const inventory = result.reviews.find(row => row.framework_plan_key === 'asset-inventory');
  const interview = db.guided_assessment_pilot['fw_'+CID+'_assessment_1.1:demo_provider_lead'];
  expect(inventory.due_date).toBe(reviewSchedule({due_date:interview.answers.last_review,recurrence:'semiannual'},true).next_review_date.slice(0,10));
  expect(result.reviews.some(row => row.framework_plan_key === 'provider-assessment')).toBe(false);
  expect(result.reviews.find(row => row.framework_plan_key === 'provider-inventory').notes).toMatch(/new\/renewed-contract assessments,15.6 policy-defined monitoring/);
  expect(result.reviews.every(row => row.due_date > dates.day(0) && !row.completed_at && !row.started_at)).toBe(true);
});

test('one authoritative schedule per document survives native ensure and verification without adding duplicate Reviews', () => {
  const db = fixture(), result = populate(db), beforeReviews = copy(db.reviews), beforeLogs = copy(db.logs);
  for (const policy of result.policies) {
    const linked = result.reviews.filter(row => policyReviewIds(row).includes(policy.policy_id));
    expect(linked).toHaveLength(1); expect(linked[0].policy_id).toBe(policy.policy_id);
    expect(policy.next_review_date).toBe(linked[0].due_date); expect(policy.schedule_from_reviews).toBe(true);
    expect(ensurePolicyReview(db, policy)).toBe(linked[0]);
  }
  expect(db.reviews).toEqual(beforeReviews); expect(db.logs).toEqual(beforeLogs);
  const approved = policyFor(result, 'vulnerability-patch-management');
  const saved = action(db, 'policies', approved.policy_id, 'verify', {status:'approved',version:approved.version,
    owner_id:approved.owner_id,approved_at:approved.approved_at,summary:approved.summary});
  expect(saved.status).toBe('approved'); expect(db.reviews).toHaveLength(19);
  expect(() => action(db, 'policies', approved.policy_id, 'verify', {status:'approved',next_review_date:dates.day(999)}))
    .toThrow('Policy Review dates are controlled by linked Reviews');
});

test.each(['secure-development','penetration-testing','internal-penetration-test'])
('%s remains related process work rather than a second Policy-schedule owner', plan => {
  const db = fixture(), result = populate(db), review = db.reviews.find(row => row.framework_plan_key === plan);
  const notes = review.notes+' Disposable native-save regression note.';
  expect(() => write(db, 'reviews', {notes,expected_updated_at:review.updated_at},review.review_id)).not.toThrow();
  const saved = db.reviews.find(row => row.review_id === review.review_id);
  expect(saved.notes).toBe(notes); expect(saved.policy_id).toBeUndefined(); expect(saved.policy_ids).toBeUndefined();
  const policy = policyFor(result, 'vulnerability-patch-management');
  expect(saved.related_links).toContainEqual({kind:'policies',id:policy.policy_id});
  expect(db.reviews.filter(row => row.policy_id === policy.policy_id).map(row => row.framework_plan_key)).toEqual(['vulnerability-remediation']);
  expect(db.reviews).toHaveLength(19);
});

test('cache reconciles selected schedules while initial onboarding, histories and source provenance remain unchanged', () => {
  const db = fixture(), initial = copy(db.clients[0].initial_program_baseline), result = populate(db);
  expect(db.clients[0].initial_program_baseline).toEqual(initial);
  expect(db.baselines[CID]).toEqual(db.clients[0].onboarding_baseline);
  expect(db.baselines[CID]).toMatchObject({completed:true,version:3,updated_at:dates.instant(-2),reviews:[]});
  expect(Object.values(db.baselines[CID].policies).every(value => value === 'yes')).toBe(true);
  for (const review of result.reviews.filter(row => row.framework_plan_key))
    expect(db.baselines[CID].framework_reviews[review.framework_plan_key]).toMatchObject({enabled:true,recurrence:review.recurrence,due_date:review.due_date});
  expect(db.baselines[CID].framework_reviews['passive-discovery-reconciliation'].custom_recurrence_days).toBe(7);
  expect(db.baselines[CID].framework_reviews['provider-assessment'].enabled).toBe(false);
  const before = copy(db); expect(() => populate(db)).toThrow('fresh native IG3 baseline'); expect(db).toEqual(before);
});

test.each([
  ['authenticated mode',db => {db.user.workspace_mode = 'standard';}],
  ['inactive writer',db => {db.user.status = 'disabled';}],
  ['read-only writer',db => {db.user.role = 'client_readonly';}],
  ['wrong group',db => {db.clients[0].framework_settings['cis-ig1'].implementation_group = 2;}],
  ['disabled guided scope',db => {db.clients[0].framework_settings['cis-ig1'].guided_assessment_enabled = false;}],
  ['foreign owner',db => {db.users[1].client_ids = ['other'];}],
  ['inactive Contact',db => {db.contacts[0].status = 'inactive';}],
  ['retained assessment edit',db => {db.framework_assessments[0].notes = 'Visitor edit';}],
  ['retained interview revision',db => {Object.values(db.guided_assessment_pilot).find(row => row.client_id === CID).revision = 2;}],
  ['retained verification',db => {db.framework_assessments[0].verification = 'verified';}],
  ['missing assessment',db => {db.framework_assessments.pop();}],
  ['retained approval',db => {scoped(db, 'policies')[0].approval_history = [{action:'approved'}];}],
  ['retained Review history',db => {db.reviews[0].occurrences = [{status:'completed'}];}],
  ['retained passive cadence',db => {db.reviews.find(row => row.framework_plan_key === 'passive-discovery-reconciliation').custom_recurrence_days = 14;}],
  ['existing target Evidence',db => {db.evidence.push({evidence_id:'retained',client_id:CID});}],
  ['foreign tracking ID',db => {db.reviews.push({review_id:'fw_'+CID+'_review_requirement:8.11',client_id:'other'});}],
  ['foreign setup alias',db => {db.reviews.push({review_id:'foreign',framework_setup_key:'fw_'+CID+'_review_requirement:11.5',client_id:'other'});}]
])('%s rejects without replacing target or unrelated state', (_label, mutate) => {
  const db = fixture(); mutate(db); const before = copy(db);
  expect(() => populate(db)).toThrow(); expect(db).toEqual(before);
});

test('a late native schedule-sync failure is atomic after staged target mutation', () => {
  const db = fixture(), before = copy(db), native = policyReviews.syncPolicyReview; let calls = 0;
  jest.spyOn(policyReviews, 'syncPolicyReview').mockImplementation((staged, review) => {
    native(staged, review); if (++calls === 2) throw new Error('Synthetic native synchronization failure');
  });
  expect(() => populate(db)).toThrow('Synthetic native synchronization failure');
  expect(calls).toBe(2); expect(db).toEqual(before);
});
