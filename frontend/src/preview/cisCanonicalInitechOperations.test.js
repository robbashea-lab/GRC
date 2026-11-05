import {ids} from './store';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishInitechBaseline} from './cisCanonicalInitechBaseline';
import {populateInitechAssessments} from './cisCanonicalInitechAssessments';
import {populateInitechGovernance} from './cisCanonicalInitechGovernance';
import {seedInitechOperations} from './cisCanonicalInitechOperations';
import * as aiOnboardingRequests from './aiOnboarding';
import * as aiRequests from './aiGovernance';
import {stable} from './commandRequests';
import {assessedRisk, riskDue} from '../lib/grcWork';
import {screeningStale, questions} from '../lib/aiOnboarding';
import {aiProjection, validateAI} from '../lib/aiGovernance';
import {registerCatalogLogo} from '../lib/registerCatalogLogo';
import {VENDOR_DATA_TYPES} from '../lib/vendorGovernance';
import {renewalAction} from '../lib/brawndoVendors';
import {ensureRiskReview} from './risks';
import {ensureVendorReviews, validateVendor} from './vendors';
import {prepareTask} from './actionItems';
import {validateAssignment} from './assignmentEligibility';
import rules from '../lib/grcRules.json';

const CID = 'demo_initech', PREFIX = CID+'_canonical_';
const CLOCK = new Date('2026-11-02T12:00:00.000Z'), dates = cisDemoFixtureDates(CLOCK);
const copy = value => JSON.parse(JSON.stringify(value));
const names = ['Peter Gibbons','Bill Lumbergh','Michael Bolton','Samir Nagheenanajar','Tom Smykowski','Milton Waddams','Nina'];
let prepared;

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(CLOCK);
  const actor = {user_id:'demo_admin', name:'Synthetic coordinator', email:'coordinator@example.test',
    workspace_mode:'demo', role:'super_admin', status:'active', client_ids:[CID,'other']};
  const owner = {user_id:'demo_provider_lead', name:'Morgan Ellis', email:'morgan@example.test',
    workspace_mode:'demo', role:'client_grc_manager', status:'active', client_ids:[CID]};
  prepared = {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])), user:actor, users:[actor,owner],
    logs:[{log_id:'foreign-audit', client_id:'other', action:'Retained visitor event', meta:{note:'Keep original'}}],
    baselines:{other:{completed:true, notes:'Retained onboarding'}}, drafts:{},
    clients:[{client_id:CID, name:'Initech', environment:'Demo', status:'active', logo:'retained-initech',
      primary_contact_id:CID+'_contact_0', assigned_owner_id:owner.user_id},
    {client_id:'other', name:'Retained client', environment:'Demo', status:'active'}],
    contacts:names.map((name, index) => ({contact_id:CID+'_contact_'+index, client_id:CID, name, status:'active'})),
    risks:[{risk_id:'foreign-risk', client_id:'other', title:'Retained unrated visitor Risk'}],
    vendors:[{vendor_id:'foreign-vendor', client_id:'other', name:'Visitor supplier'}],
    policies:[{policy_id:'foreign-policy', client_id:'other', status:'draft', summary:'Visitor content'}],
    riskSequences:{other:17}, ai_counters:{other:4}, ai_intake:{other:{client_id:'other',usage:'unsure',indicators:[],updated_at:'foreign-version'}},
    command_requests:{[JSON.stringify(['foreign-actor','other','/retained','retained-request'])]:{fingerprint:'retained',result:{keep:true}}}};
  establishInitechBaseline(prepared, {dates});
  populateInitechAssessments(prepared, {dates, owner:owner.user_id});
  populateInitechGovernance(prepared, {dates, owner:owner.user_id});
  jest.useRealTimers();
});
beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => {jest.restoreAllMocks(); jest.useRealTimers();});

const fixture = () => copy(prepared);
const seed = (db, options = {}) => seedInitechOperations(db, {dates, owner:'demo_provider_lead', ...options});

test('native ratings produce29 distinct Risks, including active25/9/6/10 and separate accepted/closed groups', () => {
  const db = fixture(), result = seed(db);
  const active = result.risks.filter(row => !['accepted','closed'].includes(row.status));
  expect(active).toHaveLength(15);
  expect(result.risks.filter(row => row.status === 'accepted')).toHaveLength(4);
  expect(result.risks.filter(row => row.status === 'closed')).toHaveLength(10);
  expect(active.map(row => row.risk_score)).toEqual(expect.arrayContaining([25,9,6,10]));
  expect(new Set(result.risks.map(row => row.risk_id)).size).toBe(29);
  expect(new Set(result.risks.map(row => row.display_id)).size).toBe(29);
  expect(new Set(result.risks.map(row => row.risk_level))).toEqual(new Set(['critical','high','moderate','low']));
  for (const risk of result.risks) {
    const native = assessedRisk(risk);
    expect(risk).toMatchObject({risk_score:native.risk_score, risk_level:native.risk_level});
    expect(risk.description).toMatch(/^Fictional Initech:/);
    for (const key of ['assessment_rationale','likelihood_rationale','impact_rationale']) {
      expect(typeof risk[key]).toBe('string');
      expect(risk[key].trim()).not.toBe('');
    }
    expect(() => validateAssignment(db, 'risks', risk)).not.toThrow();
    const reviews = result.reviews.filter(row => row.risk_id === risk.risk_id);
    expect(reviews).toHaveLength(1); expect(reviews[0].recurrence).toBe('annual');
    if (risk.status === 'closed') {
      expect(risk.next_review).toBeNull(); expect(reviews[0].status).toBe('cancelled');
      expect(risk.closed_at > risk.created_at && risk.closed_at < dates.anchor).toBe(true);
    } else expect(reviews[0].due_date).toBe(risk.next_review);
    if (risk.status === 'accepted') {
      expect(risk.acceptance_expires_at).not.toBe(risk.next_review);
      expect(risk.acceptance_rationale).toMatch(/Fictional.*acceptance/);
      expect(risk.closed_at).toBeUndefined();
    }
  }
  const expired = result.risks.find(row => row.risk_id.endsWith('risk_public-status'));
  expect(expired.status).toBe('accepted');
  expect(riskDue(expired)).toBe(dates.day(-2));
  expect(expired.next_review).not.toBe(dates.day(-2));
});

test('the eight known CIS gaps map to real Risks without duplicate treatment Actions or fabricated Findings', () => {
  const db = fixture(), result = seed(db);
  expect(result.source_definition_risks.map(row => row.definition_id).sort())
    .toEqual(['2.6','3.8','3.9','5.5','9.5','13.6','15.4','16.4'].sort());
  for (const link of result.source_definition_risks) {
    expect(db.framework_assessments.some(row => row.framework_assessment_id === link.framework_assessment_id && row.client_id === CID)).toBe(true);
    expect(result.risks.some(row => row.risk_id === link.risk_id)).toBe(true);
    expect(db.contacts.some(row => row.contact_id === link.process_owner_id && row.client_id === CID)).toBe(true);
    expect(link.existing_task_ids).toEqual([]); expect(link.remediation_plan).not.toBe('');
    expect(result.tasks.some(row => row.risk_id === link.risk_id)).toBe(false);
  }
  expect(db.findings).toEqual(prepared.findings);
  expect(db.framework_assessments).toEqual(prepared.framework_assessments);
  expect(db.guided_assessment_pilot).toEqual(prepared.guided_assessment_pilot);
  expect(db.policies).toEqual(prepared.policies);
});

test('all15 Vendors validate with14 annual active Reviews, logos/fallbacks and separate contract/assurance work', () => {
  const db = fixture(), result = seed(db), active = result.vendors.filter(row => row.status === 'active');
  expect(result.vendors).toHaveLength(15); expect(active).toHaveLength(14);
  for (const vendor of result.vendors) {
    expect(() => validateVendor(db, copy(vendor), copy(vendor))).not.toThrow();
    expect(vendor.data_types.every(value => VENDOR_DATA_TYPES.includes(value))).toBe(true);
    const annual = result.reviews.filter(row => row.vendor_id === vendor.vendor_id && row.vendor_purpose === 'vendor');
    expect(annual).toHaveLength(1); expect(annual[0].recurrence).toBe('annual');
    expect(annual[0].governance_context.rationale).toMatch(/fictional.*not.*CIS-mandated/i);
    if (vendor.status === 'inactive') {
      expect(vendor.next_review).toBeNull(); expect(annual[0].status).toBe('cancelled');
      expect(result.reviews.filter(row => row.vendor_id === vendor.vendor_id).every(row => row.status === 'cancelled')).toBe(true);
    }
  }
  expect(registerCatalogLogo('vendors',active.find(row => row.catalog_key === 'amazon-web-services'))).toBeTruthy();
  expect(registerCatalogLogo('vendors',active.find(row => row.name === 'OpenAI'))).toBeUndefined();
  expect(result.reviews.filter(row => row.vendor_purpose === 'contract')).toHaveLength(3);
  expect(result.reviews.filter(row => row.vendor_purpose === 'assurance')).toHaveLength(1);
  expect(result.reviews.filter(row => ['contract','assurance'].includes(row.vendor_purpose)).every(row => row.recurrence === 'none')).toBe(true);
  const reporting = active.find(row => row.vendor_id.endsWith('_vendor_reporting'));
  const renewal = result.tasks.find(row => row.task_id.endsWith('_task_contract-notice'));
  const contract = result.reviews.find(row => row.review_id === renewal.review_id);
  expect(renewalAction(reporting)).toEqual({date:dates.day(25),label:'Notice deadline'});
  expect(reporting.contract_renewal).toBe(dates.day(70));
  expect(contract).toMatchObject({vendor_id:reporting.vendor_id, vendor_purpose:'contract',due_date:dates.day(10)});
  expect(renewal).toMatchObject({vendor_id:reporting.vendor_id,due_date:dates.day(10),occurrence_id:contract.current_occurrence_id});
  const assurance = result.tasks.find(row => row.assurance_id);
  expect(assurance.vendor_id).not.toBe(renewal.vendor_id);
  expect(assurance.review_id).toBeUndefined();
});

test('native Action creation and saves cover all priorities/statuses, anchored deadlines and unassigned work', () => {
  const db = fixture(), result = seed(db);
  expect(result.tasks).toHaveLength(10);
  expect(new Set(result.tasks.map(row => row.priority))).toEqual(new Set(['critical','high','medium','low','informational']));
  expect(new Set(result.tasks.map(row => row.status))).toEqual(new Set(rules.statuses.tasks));
  expect(result.tasks.map(row => row.due_date)).toEqual(expect.arrayContaining([
    dates.day(-5),dates.day(0),dates.day(3),dates.day(12),dates.day(30),dates.day(60)]));
  for (const task of result.tasks) {
    expect(() => prepareTask(db, copy(task), copy(task))).not.toThrow();
    expect(task.governance_context.category).toBe('organizational');
    if (task.status === 'done') {
      expect(task.completed_at > task.created_at && task.completed_at < dates.anchor).toBe(true);
      expect(task.resolution).not.toBe(''); expect(task.finding_id).toBeUndefined();
    } else expect(task.completed_at || null).toBeNull();
  }
  const today = result.tasks.find(row => row.task_id.endsWith('_task_settlement-window'));
  expect(today).toMatchObject({status:'in_progress',priority:'critical',due_date:dates.day(0),started_at:dates.instant(-15)});
  const unassigned = result.tasks.find(row => row.task_id.endsWith('_task_release-handover'));
  expect(unassigned.assignee_id).toBeNull();
  expect(result.risks.find(row => row.risk_id === unassigned.risk_id).owner_id).toBe('demo_provider_lead');
});

test('three native preset commands reuse existing Vendors and create only their three human-rated Risks', () => {
  const db = fixture(), request = jest.spyOn(aiRequests, 'aiRequest'), onboarding = jest.spyOn(aiOnboardingRequests, 'aiOnboardingRequest');
  const result = seed(db);
  expect(onboarding).toHaveBeenCalledTimes(3);
  expect(request.mock.calls.some(([target,path]) => target && /\/approval$/.test(path))).toBe(false);
  expect(result.ai_systems.map(row => row.catalog_key).sort()).toEqual(['chatgpt','claude','m365'].sort());
  const riskIds = [];
  for (const ai of result.ai_systems) {
    expect(() => validateAI(db, ai)).not.toThrow(); expect(screeningStale(ai)).toBe(false);
    expect(registerCatalogLogo('ai_systems',ai)).toBeTruthy();
    expect(Object.keys(ai.onboarding_screening.answers).sort()).toEqual(questions.map(row => row.id).sort());
    expect(Object.values(ai.onboarding_screening.answers).every(value => typeof value === 'boolean')).toBe(true);
    expect(ai).toMatchObject({status:'draft',approval_status:'pending_assessment',
      created_at:dates.instant(ai.catalog_key === 'chatgpt' ? -20 : -6)});
    expect(ai.approval_history || []).toEqual([]);
    const link = ai.related_links.find(row => row.kind === 'risks'), risk = result.risks.find(row => row.risk_id === link.id);
    expect(risk.client_id).toBe(CID); expect(risk.assessment_rationale).toMatch(/Fictional human judgment/); riskIds.push(risk.risk_id);
    expect(result.vendors.find(row => row.vendor_id === ai.vendor_id).related_risk_ids).toContain(risk.risk_id);
    const annual = result.reviews.find(row => row.ai_system_id === ai.ai_system_id);
    const riskReview = result.reviews.find(row => row.risk_id === risk.risk_id);
    expect(annual.recurrence).toBe('annual'); expect(riskReview.recurrence).toBe('annual');
    expect(annual.review_id).not.toBe(riskReview.review_id);
    expect(annual.due_date).not.toBe(riskReview.due_date);
    expect(aiProjection(ai,result.reviews,result.risks,dates.day(0)).screening_complete).toBe(true);
  }
  expect(new Set(riskIds).size).toBe(3); expect(result.risks).toHaveLength(29); expect(result.vendors).toHaveLength(15);
  const copilot = result.ai_systems.find(row => row.catalog_key === 'm365');
  expect(copilot.onboarding_screening.answers).toMatchObject({sensitive:true,connected:true,settings:false,writes:false,autonomous:false});
  expect(copilot.data_types).toEqual(expect.arrayContaining(['Confidential','Employee Data','PII']));
  expect([...copilot.permitted_data_types].sort()).toEqual(['Internal','Public']);
  expect(db.ai_intake[CID]).toEqual({client_id:CID,usage:'yes',indicators:['Third-party AI tools internally'],updated_at:dates.instant(-24)});
});

test('AI source creation precedes its first Review dates and retains combined and per-axis human judgments', () => {
  const db = fixture(), result = seed(db);
  for (const ai of result.ai_systems) {
    const risk = result.risks.find(row => row.risk_id === ai.related_links.find(link => link.kind === 'risks').id);
    const riskReview = result.reviews.find(row => row.risk_id === risk.risk_id);
    const aiReview = result.reviews.find(row => row.ai_system_id === ai.ai_system_id);
    expect(db.ai_intake[CID].updated_at < ai.created_at).toBe(true);
    expect(risk.created_at).toBe(ai.created_at);
    expect(riskReview.created_at).toBe(ai.created_at); expect(aiReview.created_at).toBe(ai.created_at);
    expect(riskReview.due_date >= riskReview.created_at.slice(0,10)).toBe(true);
    expect(aiReview.due_date >= aiReview.created_at.slice(0,10)).toBe(true);
    const command = result.ai_commands.find(row => row.result.ai_system_id === ai.ai_system_id);
    expect(risk.assessment_rationale).toBe(JSON.parse(command.fingerprint).risk.rationale);
    expect(typeof risk.likelihood_rationale).toBe('string'); expect(risk.likelihood_rationale.trim()).not.toBe('');
    expect(typeof risk.impact_rationale).toBe('string'); expect(risk.impact_rationale.trim()).not.toBe('');
  }
  const chatgpt = result.ai_systems.find(row => row.catalog_key === 'chatgpt');
  const linked = chatgpt.related_links.find(row => row.kind === 'risks').id;
  expect(result.reviews.find(row => row.risk_id === linked).due_date).toBe(dates.day(-12));
  expect(result.reviews.find(row => row.ai_system_id === chatgpt.ai_system_id).due_date).toBe(dates.day(-5));
});

test('Action audits on the Action and its parent use the Action event dates without changing source identities', () => {
  const db = fixture(), result = seed(db);
  for (const task of result.tasks) {
    const logs = db.logs.filter(row => row.client_id === CID
      && (row.entity_type === 'tasks' && row.entity_id === task.task_id || row.meta?.task_id === task.task_id));
    const created = logs.filter(row => row.action === 'Action Item created');
    expect(created.length).toBeGreaterThan(0);
    for (const event of created) expect(event.at).toBe(task.created_at);
    const stateEvents = logs.filter(row => ['Work started','Action Item completed','Status changed'].includes(row.action));
    for (const event of stateEvents) {
      expect(event.at).toBe(event.action === 'Work started' ? task.started_at
        : event.action === 'Action Item completed' ? task.completed_at : task.updated_at);
    }
    if (task.status === 'in_progress') {
      expect(stateEvents.filter(row => row.action === 'Work started').length).toBeGreaterThan(1);
      expect(logs.some(row => row.entity_type === 'risks' && row.entity_id === task.risk_id)).toBe(true);
    }
    if (task.status === 'done') expect(stateEvents.some(row => row.action === 'Action Item completed')).toBe(true);
    if (['blocked','cancelled'].includes(task.status)) expect(stateEvents.some(row => row.action === 'Status changed')).toBe(true);
    if (task.review_id) expect(logs.some(row => row.entity_type === 'reviews' && row.entity_id === task.review_id)).toBe(true);
    if (task.vendor_id) expect(logs.some(row => row.entity_type === 'vendors' && row.entity_id === task.vendor_id)).toBe(true);
  }
});

test('normalized native command receipts replay without duplicates, writes or changed fingerprints', () => {
  const db = fixture(), result = seed(db), before = copy(db);
  for (const command of result.ai_commands) {
    const receipt = db.command_requests[command.scope];
    expect(receipt.fingerprint).toBe(command.fingerprint);
    const replay = aiOnboardingRequests.aiOnboardingRequest(db, JSON.parse(command.fingerprint), command.key);
    expect(replay).toMatchObject(command.result);
    expect(db.ai_systems.some(row => row.ai_system_id === replay.ai_system_id && row.client_id === CID)).toBe(true);
    expect(db.risks.some(row => row.risk_id === replay.risk_id && row.client_id === CID)).toBe(true);
    expect(db.reviews.some(row => row.review_id === replay.review_id && row.ai_system_id === replay.ai_system_id)).toBe(true);
    expect(db.command_requests[command.scope].fingerprint).toBe(command.fingerprint);
  }
  expect(db).toEqual(before);
});

test.each(['empty-result','missing-result','array-result','extra-result-field','ai-id','risk-id','review-id','vendor-id','invalid-json','empty-body','noncanonical-fingerprint',
  'changed-confirmation','changed-rating','changed-client','wrong-actor-scope','wrong-path-scope','duplicate-scope'])(
  'complete retry rejects a corrupt %s receipt without mutating or rewriting it', condition => {
    const db = fixture(), result = seed(db), command = result.ai_commands[0], receipt = db.command_requests[command.scope];
    if (condition === 'empty-result') receipt.result = {};
    if (condition === 'missing-result') delete receipt.result;
    if (condition === 'array-result') receipt.result = [];
    if (condition === 'extra-result-field') receipt.result.extra = 'Unexpected result data';
    if (condition === 'ai-id') receipt.result.ai_system_id = 'foreign-ai';
    if (condition === 'risk-id') receipt.result.risk_id = PREFIX+'risk_library-loading';
    if (condition === 'review-id') receipt.result.review_id = 'risk_review_'+receipt.result.risk_id;
    if (condition === 'vendor-id') receipt.result.vendor_id = 'foreign-vendor';
    if (condition === 'invalid-json') receipt.fingerprint = 'not-json';
    if (condition === 'empty-body') receipt.fingerprint = '{}';
    if (condition === 'noncanonical-fingerprint') receipt.fingerprint += ' ';
    if (['changed-confirmation','changed-rating','changed-client'].includes(condition)) {
      const body = JSON.parse(receipt.fingerprint);
      if (condition === 'changed-confirmation') body.confirmations.risk = false;
      if (condition === 'changed-rating') body.risk.likelihood = 5;
      if (condition === 'changed-client') body.client_id = 'other';
      receipt.fingerprint = stable(body);
    }
    if (['wrong-actor-scope','wrong-path-scope','duplicate-scope'].includes(condition)) {
      const parts = JSON.parse(command.scope);
      if (condition === 'wrong-path-scope') parts[2] = '/another-command'; else parts[0] = 'foreign-actor';
      db.command_requests[JSON.stringify(parts)] = copy(receipt);
      if (condition !== 'duplicate-scope') delete db.command_requests[command.scope];
    }
    const before = copy(db), native = jest.spyOn(aiOnboardingRequests,'aiOnboardingRequest');
    expect(() => seed(db)).toThrow('reconciliation');
    expect(native).not.toHaveBeenCalled(); expect(db).toEqual(before);
  },
);

test('receipt validation ignores legitimate saved AI, Risk and Vendor edits and keeps the original receipt', () => {
  const db = fixture(), result = seed(db), ai = result.ai_systems[0];
  const risk = result.risks.find(row => row.risk_id === ai.related_links.find(row => row.kind === 'risks').id);
  const vendor = result.vendors.find(row => row.vendor_id === ai.vendor_id);
  ai.description = 'Visitor clarified the proposed business use'; ai.owner_id = db.user.user_id;
  ai.data_settings = 'Visitor recorded a settings decision'; risk.treatment_plan = 'Visitor revised treatment work';
  vendor.service = 'Visitor clarified the contracted service'; vendor.updated_at = dates.instant(-1);
  const before = copy(db), commands = db.command_requests, native = jest.spyOn(aiOnboardingRequests,'aiOnboardingRequest');
  seed(db);
  expect(native).not.toHaveBeenCalled(); expect(db).toEqual(before); expect(db.command_requests).toBe(commands);
});

test('native annual schedule edits reuse parents and never revive closed Risks or inactive Vendors', () => {
  const db = fixture(), result = seed(db), count = db.reviews.length;
  const risk = result.risks.find(row => row.risk_id.endsWith('_risk_library-loading'));
  const original = result.reviews.find(row => row.risk_id === risk.risk_id);
  risk.next_review = dates.day(24);
  expect(ensureRiskReview(db,risk)).toMatchObject({review_id:original.review_id,due_date:dates.day(24),recurrence:'annual'});
  const vendor = result.vendors.find(row => row.vendor_id.endsWith('_vendor_hosting'));
  vendor.next_review = dates.day(22);
  expect(ensureVendorReviews(db,vendor).find(row => row.vendor_purpose === 'vendor')).toMatchObject({due_date:dates.day(22),recurrence:'annual'});
  for (const closed of result.risks.filter(row => row.status === 'closed')) expect(ensureRiskReview(db,closed)).toBeNull();
  const inactive = result.vendors.find(row => row.status === 'inactive'); ensureVendorReviews(db,inactive);
  expect(db.reviews.filter(row => row.vendor_id === inactive.vendor_id).every(row => row.status === 'cancelled')).toBe(true);
  expect(db.reviews).toHaveLength(count);
});

test('complete retry preserves visitor edits and all original users, Contacts, clients, source records and foreign state', () => {
  const db = fixture(), original = copy(db), user = db.user, users = db.users, contacts = db.contacts;
  const clients = db.clients, assessments = db.framework_assessments, policies = db.policies;
  const oldReviews = db.reviews.slice(), oldLogs = db.logs.slice(), foreignRisk = db.risks[0];
  seed(db); db.risks.find(row => row.client_id === CID).treatment_plan = 'Visitor treatment edit';
  db.ai_intake[CID] = {...db.ai_intake[CID],usage:'unsure',indicators:[],updated_at:'visitor-version'};
  const beforeRetry = copy(db), intake = db.ai_intake, logs = db.logs;
  const native = jest.spyOn(aiOnboardingRequests,'aiOnboardingRequest'); seed(db);
  expect(native).not.toHaveBeenCalled(); expect(db).toEqual(beforeRetry);
  expect(db.user).toBe(user); expect(db.users).toBe(users); expect(db.contacts).toBe(contacts);
  expect(db.clients).toBe(clients); expect(db.framework_assessments).toBe(assessments); expect(db.policies).toBe(policies);
  expect(db.ai_intake).toBe(intake); expect(db.logs).toBe(logs);
  for (const row of oldReviews) expect(db.reviews).toContain(row);
  for (const row of oldLogs) expect(db.logs).toContain(row);
  expect(db.risks.find(row => row.risk_id === 'foreign-risk')).toBe(foreignRisk);
  expect(foreignRisk.display_id).toBeUndefined(); expect(db.riskSequences.other).toBe(17); expect(db.ai_counters.other).toBe(4);
  expect(db.ai_intake.other).toEqual(original.ai_intake.other);
  for (const [key,value] of Object.entries(original.command_requests)) expect(db.command_requests[key]).toEqual(value);
});

test('one frozen anchor yields identical source records across native execution dates and supplies only evidence outlines', () => {
  const first = fixture(), second = fixture(), result = seed(first);
  jest.setSystemTime(new Date('2026-11-03T21:00:00.000Z')); seed(second);
  expect(second).toEqual(first);
  expect(result.reviews).toHaveLength(51); expect(first.reviews.filter(row => row.client_id === CID)).toHaveLength(66);
  expect(result.reviews.every(row => row.occurrences.length === 0 && !row.completed_at && !row.completion_date)).toBe(true);
  expect(result.review_origins.every(row => row.provenance.includes('not browser execution'))).toBe(true);
  expect(result.evidence_specs).toHaveLength(57); expect(first.evidence).toEqual(prepared.evidence);
  expect(first.findings).toEqual(prepared.findings);
});

test('a late native AI failure rolls back records, counters, audit and receipt effects together', () => {
  const db = fixture(), before = copy(db), arrays = Object.fromEntries(['risks','vendors','ai_systems','reviews','tasks','logs'].map(kind => [kind,db[kind]]));
  const native = aiOnboardingRequests.aiOnboardingRequest;
  jest.spyOn(aiOnboardingRequests,'aiOnboardingRequest').mockImplementation((staged,...args) => {
    const result = native(staged,...args);
    if (staged.ai_systems.filter(row => row.client_id === CID).length === 2) throw new Error('Injected failure after native AI effects');
    return result;
  });
  expect(() => seed(db)).toThrow('Injected failure after native AI effects'); expect(db).toEqual(before);
  for (const [kind,rows] of Object.entries(arrays)) expect(db[kind]).toBe(rows);
});

test('a foreign linked Risk introduced after native creation is rejected atomically', () => {
  const db = fixture(), before = copy(db), native = aiOnboardingRequests.aiOnboardingRequest;
  jest.spyOn(aiOnboardingRequests,'aiOnboardingRequest').mockImplementation((staged,...args) => {
    const result = native(staged,...args);
    staged.ai_systems.find(row => row.ai_system_id === result.ai_system_id).related_links[0].id = 'foreign-risk';
    return result;
  });
  expect(() => seed(db)).toThrow(); expect(db).toEqual(before);
});

test.each(['actor','reader','client','archived','group','owner','contact','fresh-stage','existing-intake','counter','malformed-map','foreign-id','audit-id','audit-alias'])(
  'invalid %s input cannot mutate source state', condition => {
    const db = fixture(), options = {};
    if (condition === 'actor') db.user.workspace_mode = 'standard';
    if (condition === 'reader') db.user.role = 'client_readonly';
    if (condition === 'client') db.clients.find(row => row.client_id === CID).environment = 'Production';
    if (condition === 'archived') db.clients.find(row => row.client_id === CID).archived = true;
    if (condition === 'group') db.clients.find(row => row.client_id === CID).framework_settings['cis-ig1'].implementation_group = 3;
    if (condition === 'owner') db.users.find(row => row.user_id === 'demo_provider_lead').status = 'inactive';
    if (condition === 'contact') options.processOwners = {program:'foreign-contact'};
    if (condition === 'fresh-stage') db.framework_assessments.find(row => row.client_id === CID).assessment_history = [{note:'Retained event'}];
    if (condition === 'existing-intake') db.ai_intake[CID] = {client_id:CID,usage:'no',indicators:[]};
    if (condition === 'counter') db.riskSequences[CID] = 8;
    if (condition === 'malformed-map') db.command_requests = [];
    if (condition === 'foreign-id') db.risks[0].risk_id = PREFIX+'risk_library-loading';
    if (condition === 'audit-id') db.logs.push({audit_id:PREFIX+'operations_audit_0',client_id:'other',action:'Preserved collision'});
    if (condition === 'audit-alias') db.logs.push({log_id:PREFIX+'operations_audit_0',client_id:'other',action:'Preserved alias collision'});
    const before = copy(db); expect(() => seed(db,options)).toThrow(); expect(db).toEqual(before);
  },
);

test('a partial prior installation is rejected without trying to repair or overwrite it', () => {
  const db = fixture(); seed(db);
  db.ai_systems = db.ai_systems.filter(row => row.catalog_key !== 'claude');
  const before = copy(db); expect(() => seed(db)).toThrow('explicit reconciliation'); expect(db).toEqual(before);
});
