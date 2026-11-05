import {CATALOGS, activeDefinitions, reviewDrivers} from '../lib/frameworks';
import {reviewSchedule, reviewView} from '../lib/reviewOccurrences';
import {requirementBasis, validateGovernanceContext} from '../lib/requirementBasis';
import {policyReviewIds} from '../lib/brawndoAdditionalPolicyVendor';
import {ids, write} from './store';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishInitechBaseline, initechOnboardingSelection} from './cisCanonicalInitechBaseline';
import {populateInitechAssessments} from './cisCanonicalInitechAssessments';
import {populateInitechGovernance} from './cisCanonicalInitechGovernance';
import {approvalSnapshot} from './policyProvenance';
import {effectivePolicySubject} from './policyReviewCoverage';
import {ensurePolicyReview} from './policyReviews';
import * as policyReviews from './policyReviews';
import {action} from './workflows';

const CID = 'demo_initech', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const dates = cisDemoFixtureDates(CLOCK), copy = value => JSON.parse(JSON.stringify(value));
const names = ['Peter Gibbons','Bill Lumbergh','Michael Bolton','Samir Nagheenanajar','Tom Smykowski','Milton Waddams','Nina'];
function fixture() {
  const actor = {user_id:'demo_admin', name:'Synthetic coordinator', email:'coordinator@example.test',
    workspace_mode:'demo', role:'super_admin', status:'active', client_ids:[CID,'other']};
  const owner = {user_id:'demo_provider_lead', name:'Morgan Ellis', email:'morgan@example.test',
    workspace_mode:'demo', role:'platform_admin', status:'active', client_ids:[CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])), user:actor, users:[actor,owner],
    logs:[{log_id:'foreign-audit-alias', client_id:'other', action:'Retained visitor event'}],
    baselines:{other:{completed:true, notes:'Retained onboarding'}}, drafts:{},
    clients:[{client_id:CID, name:'Initech', environment:'Demo', status:'active', logo:'retained-initech',
      primary_contact_id:CID+'_contact_0', assigned_owner_id:owner.user_id},
    {client_id:'other', name:'Retained client', environment:'Demo', status:'active'}],
    contacts:names.map((name, index) => ({contact_id:CID+'_contact_'+index, client_id:CID, name, status:'active'})),
    policies:[{policy_id:'foreign-policy', client_id:'other', status:'draft', summary:'Visitor content'}]};
  establishInitechBaseline(db, {dates});
  populateInitechAssessments(db, {dates, owner:owner.user_id});
  db.guided_assessment_pilot.foreign = {client_id:'other', answers:{keep:'Visitor answers'}};
  return db;
}
const populate = (db, options = {}) => populateInitechGovernance(db, {dates, owner:'demo_provider_lead', ...options});
const policyFor = (result, key) => result.policies.find(row => row.baseline_key === 'policy-'+key+'-policy');
const withoutLinks = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'related_links'));

beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => {jest.restoreAllMocks(); jest.useRealTimers();});

test('nine mapped documents and15 native parents preserve the imported assessments, original baseline and all unrelated data', () => {
  const db = fixture(), before = copy(db), users = db.users, contacts = db.contacts, foreignPolicy = db.policies[0];
  const catalogBefore = copy(CATALOGS['cis-ig1']), result = populate(db);
  expect(result.policies).toHaveLength(9);
  expect(result.reviews).toHaveLength(15);
  expect(result.reviews.filter(row => row.framework_plan_key).map(row => row.framework_plan_key).sort())
    .toEqual(initechOnboardingSelection().plans.map(row => row.key).sort());
  expect(result.assessments.map(withoutLinks)).toEqual(before.framework_assessments.map(withoutLinks));
  expect(db.guided_assessment_pilot).toEqual(before.guided_assessment_pilot);
  expect(result.assessments.filter(row => row.status === 'addressed')).toHaveLength(120);
  expect(result.assessments.filter(row => row.status === 'in_progress')).toHaveLength(7);
  expect(result.assessments.filter(row => row.status === 'needs_attention')).toHaveLength(1);
  expect(result.assessments.filter(row => row.status === 'not_assessed')).toHaveLength(2);
  expect(result.reviews.every(row => row.occurrences.length === 0 && !row.completion_date && !row.completed_at)).toBe(true);
  expect(result.policies.every(row => row.last_reviewed_at == null)).toBe(true);
  expect(db.users).toBe(users); expect(db.contacts).toBe(contacts); expect(db.policies[0]).toBe(foreignPolicy);
  expect(db.clients[0].initial_program_baseline).toEqual(before.clients[0].initial_program_baseline);
  expect(db.clients[1]).toBeDefined(); expect(db.clients[1]).toEqual(before.clients[1]);
  for (const key of ['user','users','contacts','logs','evidence','findings','tasks','risks','vendors','ai_systems','drafts'])
    expect(db[key]).toEqual(before[key]);
  expect(db.baselines.other).toEqual(before.baselines.other);
  expect(CATALOGS['cis-ig1']).toEqual(catalogBefore);
});

test('current and earlier external approval subjects retain exact versions without invented in-app signatures or file verification', () => {
  const db = fixture(), result = populate(db);
  for (const policy of result.policies) {
    expect(policy.decision_history.map(entry => entry.action)).toEqual(['external_approval_recorded','external_approval_recorded']);
    expect(policy.decision_history.map(entry => entry.subject.version)).toEqual(['1.0','2.0']);
    expect(policy.approval_history.some(entry => entry.action === 'approved')).toBe(false);
    for (const entry of policy.decision_history) {
      expect(entry.reported_approver_id).toBe(CID+'_contact_1');
      expect(entry.recorded_by).toBe('demo_provider_lead');
      expect(entry.reported_approved_at).toBe(entry.recorded_at);
      expect(entry.subject.client_id).toBe(CID); expect(entry.subject.policy_id).toBe(policy.policy_id);
      expect(entry.subject.subject_id).toBe(policy.policy_id+'_subject_'+entry.subject.version.replaceAll('.', '_'));
      expect(entry.subject.basis.type).toBe('external');
      expect(entry.subject.basis.document_version).toBe(entry.subject.version);
      expect(entry.subject.basis.verification).toBe('Reference recorded; external bytes not verified');
      expect(entry.provenance).toMatch(/Fictional external approval reference; not an in-app signature/);
      expect(entry.recorded_at >= result.origin && entry.recorded_at <= result.anchor).toBe(true);
    }
    expect(effectivePolicySubject(policy, dates.month(-20)+'T00:00:00.000Z').version).toBe('1.0');
    expect(effectivePolicySubject(policy, dates.anchor).version).toBe('2.0');
    expect(approvalSnapshot(db, policy).basis).toMatchObject({type:'external', document_version:policy.version,
      verification:'Reference recorded; external bytes not verified'});
    expect(policy.approval_source).toEqual({version:policy.version,
      external_reference:policy.approval_subject.basis.reference, external_version:policy.version});
    expect(JSON.stringify(policy)).not.toMatch(/"evidence_id"|"document_url"|"sha256"|"approval_account_id"/);
  }
});

test('the pending export appendix cannot overwrite the approved base process or manufacture executed provider-contract terms', () => {
  const result = populate(fixture()), data = policyFor(result, 'data-classification-handling');
  expect(data.status).toBe('in_review'); expect(data.approved_at).toBeNull();
  expect(data.version).toBe('2.1-draft'); expect(data.approval_subject.version).toBe('2.1-draft');
  expect(data.approval_history.map(entry => entry.action)).toEqual(['submitted']);
  const base = effectivePolicySubject(data, dates.anchor);
  expect(base.version).toBe('2.0'); expect(base.subject.summary).toMatch(/approved base data-management process/);
  expect(base.subject.summary).toMatch(/handling, retention and disposal requirements/);
  expect(base.subject.summary).not.toMatch(/known settlement export store/);
  expect(base.subject.summary).toMatch(/does not approve the later settlement-export appendix/);
  expect(data.summary).toMatch(/lacks recipient, purpose and return-path details/);
  expect(result.assessments.find(row => row.definition_id === '3.1').status).toBe('addressed');
  expect(result.assessments.find(row => row.definition_id === '3.8').status).toBe('in_progress');
  const vendor = policyFor(result, 'vendor-third-party-risk-management');
  expect(vendor.status).toBe('approved'); expect(vendor.summary).toMatch(/do not place missing security clauses into executed legacy contracts/);
  expect(result.assessments.find(row => row.definition_id === '15.2').status).toBe('addressed');
  expect(result.assessments.find(row => row.definition_id === '15.4').status).toBe('in_progress');
});

test('the inventory current due date follows the actual interview review date using native six-month calendar arithmetic', () => {
  const db = fixture(), result = populate(db), inventory = result.reviews.find(row => row.framework_plan_key === 'asset-inventory');
  const draft = db.guided_assessment_pilot['fw_'+CID+'_assessment_1.1:demo_provider_lead'];
  expect(draft.answers.last_review).toBe('2026-10-02');
  expect(inventory.due_date).toBe('2027-04-02');
  expect(inventory.due_date).toBe(reviewSchedule({due_date:draft.answers.last_review, recurrence:'semiannual'}, true).next_review_date.slice(0,10));
  expect(inventory.next_review_date).toBe('2027-10-02T00:00:00.000Z');
  expect(inventory.schedule_anchor).toEqual({day:2, month_end:false});
  expect(reviewView(inventory)).toEqual(inventory);
  expect(inventory.occurrences).toEqual([]);
});

test('two requirement-specific tracking parents retain operating duties without forged plans or assessed restore outcomes', () => {
  const result = populate(fixture()), manual = result.reviews.filter(row => !row.framework_plan_key);
  expect(manual.map(row => row.review_id).sort()).toEqual(['fw_'+CID+'_review_requirement:11.5','fw_'+CID+'_review_requirement:8.11'].sort());
  const weekly = manual.find(row => row.framework_safeguards.includes('8.11'));
  expect(weekly).toMatchObject({recurrence:'custom', custom_recurrence_days:7, due_date:'2026-11-05', next_review_date:'2026-11-12T00:00:00.000Z'});
  const quarterly = manual.find(row => row.framework_safeguards.includes('11.5'));
  expect(quarterly).toMatchObject({recurrence:'quarterly', due_date:'2026-11-14', next_review_date:'2027-02-14T00:00:00.000Z'});
  expect(quarterly.notes).toMatch(/remains unassessed; no performed or passed test is claimed/);
  for (const review of manual) {
    expect(review.framework_setup_key).toBe(review.review_id);
    expect(review.framework_plan_key).toBeUndefined(); expect(reviewDrivers(review)).toEqual([]);
    expect(review.status).toBe('upcoming'); expect(review.occurrences).toEqual([]);
    expect(review.governance_context.rationale).toMatch(/not a claim that CIS mandates a manual platform Review ticket/);
    const related = result.assessments.filter(row => row.related_links.some(link => link.kind === 'reviews' && link.id === review.review_id));
    expect(requirementBasis('reviews', review, {framework_assessments:related})[0].requirements.map(row => row.definition.id))
      .toEqual(review.framework_safeguards);
    expect(() => validateGovernanceContext(review.governance_context)).not.toThrow();
  }
  for (const id of ['11.5','13.3']) {
    const row = result.assessments.find(item => item.definition_id === id);
    expect(row.status).toBe('not_assessed'); expect(row.last_assessed).toBeNull(); expect(row.verification).toBeNull();
    expect(row.guided_assessment_source).toBeUndefined(); expect(row.assessment_history).toEqual([]);
  }
});

test('IG2 source attribution retains the native validation classification while making mandatory underlying duties explicit', () => {
  const result = populate(fixture()), scope = new Set(activeDefinitions('cis-ig1', {implementation_group:2}).map(row => row.id));
  const expected = {'account-authorization':['5.5','6.6'], 'provider-inventory':['15.2','15.3','15.4'],
    'incident-governance':['17.4','17.5','17.6','17.7','17.8'], 'secure-development':['16.1','16.2','16.4','16.6','16.9'],
    'penetration-testing':['18.1','18.2','18.3'], 'secure-configuration':['12.4']};
  for (const [key, ids] of Object.entries(expected)) {
    const entry = result.review_manifest.find(row => row.plan_key === key);
    expect(entry.source_obligations.map(row => row.definition_id)).toEqual(expect.arrayContaining(ids));
    expect(entry.source_obligations.every(row => scope.has(row.definition_id))).toBe(true);
  }
  for (const key of ['secure-development','penetration-testing']) {
    const row = result.reviews.find(item => item.framework_plan_key === key);
    const plan = CATALOGS['cis-ig1'].review_plans.find(item => item.key === key);
    expect(reviewDrivers(row)[0].framework_basis).toBe(plan.basis);
    expect(result.review_manifest.find(item => item.plan_key === key).native_cadence_class).toBe('D');
    expect(row.notes).toMatch(/not optional/);
  }
  expect(result.review_manifest.flatMap(row => row.safeguards).some(id => ['6.8','15.5','16.12','16.13','18.4','18.5'].includes(id))).toBe(false);
  expect(result.reviews.find(row => row.framework_plan_key === 'data-governance')).toMatchObject({due_date:dates.day(0), status:'in_progress'});
  for (const key of ['secure-development','provider-inventory']) {
    const row = result.reviews.find(item => item.framework_plan_key === key);
    expect(row.due_date < dates.day(0)).toBe(true); expect(row.status).toBe('in_progress');
  }
});

test('per-ID document contents distinguish required process/artifact coverage from supporting technical context', () => {
  const result = populate(fixture()), byKey = key => result.mapping.find(row => row.policy_key === 'policy-'+key+'-policy');
  expect(byKey('access-control-identity-management').required_contents).toEqual(['6.1','6.2']);
  expect(byKey('information-security').required_contents).toEqual(['8.1']);
  expect(byKey('vendor-third-party-risk-management').required_contents).toEqual(['15.2']);
  expect(byKey('vendor-third-party-risk-management').supporting_context).toContain('15.4');
  expect(byKey('data-retention-secure-disposal')).toBeUndefined();
  expect(byKey('data-classification-handling').supporting_context).toEqual(expect.arrayContaining(['3.4','3.5']));
  expect(byKey('data-classification-handling').source_supported_contents).toEqual(['3.4','3.5']);
  expect(byKey('data-classification-handling').native_template_safeguards).not.toEqual(expect.arrayContaining(['3.4','3.5']));
  expect(byKey('data-classification-handling').sections.find(row => row.ids.includes('3.4')).content)
    .toMatch(/No specific retention duration or standalone document title is attributed to CIS/);
  expect(byKey('data-classification-handling').sections.find(row => row.ids.includes('3.8')).state).toBe('pending');
  for (const entry of result.mapping) {
    expect(new Set([...entry.required_contents,...entry.supporting_context])).toEqual(new Set(entry.safeguards));
    const policy = result.policies.find(row => row.policy_id === entry.policy_id);
    expect(policy.governance_context.rationale).toMatch(/template title is not a CIS mandate/);
    for (const id of entry.safeguards) expect(result.assessments.find(row => row.definition_id === id).related_links)
      .toContainEqual({kind:'policies', id:policy.policy_id});
  }
});

test('consolidated data contents use one scalar native schedule and verification does not add a duplicate Review', () => {
  const db = fixture(), result = populate(db), data = policyFor(result, 'data-classification-handling');
  expect(policyFor(result, 'data-retention-secure-disposal')).toBeUndefined();
  const review = result.reviews.find(row => row.framework_plan_key === 'data-governance');
  expect(policyReviewIds(review)).toEqual([data.policy_id]);
  expect(review.policy_id).toBe(data.policy_id);
  expect(result.reviews.every(row => row.policy_ids == null)).toBe(true);
  const beforeEnsure = copy(db.reviews), beforeLogs = copy(db.logs);
  for (const policy of result.policies) {
    const linked = result.reviews.filter(row => policyReviewIds(row).includes(policy.policy_id));
    expect(linked.length).toBeGreaterThan(0);
    expect(policy.next_review_date).toBe(linked.map(row => row.due_date).sort()[0]);
    expect(policy.schedule_from_reviews).toBe(true);
    expect(linked).toContain(ensurePolicyReview(db, policy));
  }
  expect(db.reviews).toEqual(beforeEnsure); expect(db.logs).toEqual(beforeLogs);
  expect(db.reviews).toHaveLength(15);
  const approved = policyFor(result, 'configuration-management');
  const approvedReview = result.reviews.find(row => row.policy_id === approved.policy_id);
  const resultPolicy = action(db, 'policies', approved.policy_id, 'verify', {status:'approved', version:approved.version,
    owner_id:approved.owner_id, approved_at:approved.approved_at, summary:approved.summary});
  expect(resultPolicy.status).toBe('approved'); expect(db.reviews).toHaveLength(15);
  expect(resultPolicy.next_review_date).toBe(approvedReview.due_date);
  expect(() => action(db, 'policies', approved.policy_id, 'verify', {status:'approved', next_review_date:dates.day(999)}))
    .toThrow('Policy Review dates are controlled by linked Reviews');
  expect(() => action(db, 'policies', data.policy_id, 'verify', {status:'approved'})).toThrow('Return the pending submission to Draft');
});

test('the current baseline cache matches source schedules without changing the original onboarding snapshot', () => {
  const db = fixture(), original = copy(db.clients[0].initial_program_baseline), result = populate(db);
  expect(db.baselines[CID]).toEqual(db.clients[0].onboarding_baseline);
  expect(db.baselines[CID]).toMatchObject({completed:true, version:3, updated_at:dates.instant(-2), reviews:[]});
  expect(db.clients[0].initial_program_baseline).toEqual(original);
  expect(Object.values(db.baselines[CID].policies).every(value => value === 'yes')).toBe(true);
  for (const review of result.reviews.filter(row => row.framework_plan_key))
    expect(db.baselines[CID].framework_reviews[review.framework_plan_key]).toMatchObject({enabled:true, recurrence:review.recurrence, due_date:review.due_date});
  expect(Object.keys(db.baselines[CID].framework_reviews).some(key => key.includes('requirement:'))).toBe(false);
  const before = copy(db);
  expect(() => populate(db)).toThrow('fresh native IG2 baseline');
  expect(db).toEqual(before);
});

test.each(['vulnerability-remediation','secure-development','penetration-testing'])
('%s retains its source work and permits a native notes save with exactly one Policy schedule', plan => {
  const db = fixture(), result = populate(db);
  const review = db.reviews.find(row => row.framework_plan_key === plan), before = copy(review);
  const notes = review.notes+' Disposable native-save regression note.';
  expect(() => write(db, 'reviews', {notes, expected_updated_at:review.updated_at}, review.review_id)).not.toThrow();
  const saved = db.reviews.find(row => row.review_id === review.review_id);
  expect(saved.notes).toBe(notes);
  for (const key of ['review_id','client_id','owner_id','reviewer_id','framework_safeguards','due_date','next_review_date','recurrence','occurrences'])
    expect(saved[key]).toEqual(before[key]);
  expect(db.reviews).toHaveLength(15);
  const policy = policyFor(result, 'vulnerability-patch-management');
  const authoritative = db.reviews.filter(row => row.policy_id === policy.policy_id);
  expect(authoritative.map(row => row.framework_plan_key)).toEqual(['vulnerability-remediation']);
  for (const key of ['secure-development','penetration-testing']) {
    const related = db.reviews.find(row => row.framework_plan_key === key);
    expect(related.policy_id).toBeUndefined(); expect(related.policy_ids).toBeUndefined();
    expect(related.related_links).toContainEqual({kind:'policies', id:policy.policy_id});
  }
});

test.each([
  ['authenticated mode', db => {db.user.workspace_mode = 'authenticated';}],
  ['read-only writer', db => {db.user.role = 'client_readonly';}],
  ['wrong cumulative group', db => {db.clients[0].framework_settings['cis-ig1'].implementation_group = 3;}],
  ['foreign application owner', db => {db.users.find(row => row.user_id === 'demo_provider_lead').client_ids = ['other'];}],
  ['inactive approver Contact', db => {db.contacts[1].status = 'inactive';}],
  ['retained assessment edit', db => {db.framework_assessments[0].notes = 'Visitor edit';}],
  ['retained interview revision', db => {Object.values(db.guided_assessment_pilot).find(row => row.client_id === CID).revision = 2;}],
  ['retained verification', db => {db.framework_assessments[0].verification = 'verified';}],
  ['retained policy approval', db => {db.policies.find(row => row.client_id === CID).approval_history = [{action:'approved'}];}],
  ['retained Review period', db => {db.reviews[0].occurrences = [{status:'completed'}];}],
  ['existing source Evidence', db => {db.evidence.push({evidence_id:'existing', client_id:CID});}],
  ['foreign tracking identity', db => {db.reviews.push({review_id:'fw_'+CID+'_review_requirement:8.11', client_id:'other'});}]
])('%s is rejected without altering any caller-owned state', (label, mutate) => {
  const db = fixture(); mutate(db); const before = copy(db);
  expect(() => populate(db)).toThrow(); expect(db).toEqual(before);
});

test('a late native synchronization failure leaves target and unrelated records untouched', () => {
  const db = fixture(), before = copy(db), native = policyReviews.syncPolicyReview;
  let calls = 0;
  jest.spyOn(policyReviews, 'syncPolicyReview').mockImplementation((staged, review) => {
    native(staged, review);
    if (++calls === 2) throw new Error('Synthetic native synchronization failure');
  });
  expect(() => populate(db)).toThrow('Synthetic native synchronization failure');
  expect(calls).toBe(2); expect(db).toEqual(before);
});
