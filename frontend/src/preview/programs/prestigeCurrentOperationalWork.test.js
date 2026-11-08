import crypto from 'crypto';
import * as store from '../store';
import fixture from './prestigeEightYearFixtureData.json';
import {installPrestigeEightYearFixture} from './prestigeEightYearFixture';
import {createPrestigeCurrentOperationalWork} from './prestigeCurrentOperationalWork';
import {fixtureFingerprint} from '../cisDemoHistoryContext';
import {stable} from '../commandRequests';
import {taskSource} from '../../lib/actionItems';
import {aggregateClientDashboard, DASHBOARD_KINDS} from '../../lib/clientDashboard';
import {managementMetrics} from '../../lib/managementMetrics';
import {dashboardWorkQueue} from '../../lib/dashboardWorkQueue';
import {eligible} from '../assignmentEligibility';
import {occurrenceId} from '../../lib/reviewOccurrences';

const CID = 'demo_prestige', ANCHOR = '2026-11-02T00:00:00.000Z';
const MARKER = 'prestige_current_operational_work_fixture';
const OPTIONS = {purpose: 'current_operational_work_source_qa'};
const CLOCK = new Date('2026-11-08T12:00:00.000Z');
const FLAGS = ['REACT_APP_PREVIEW', 'REACT_APP_DUNDER_EIGHT_YEAR_QA',
  'REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA', 'REACT_APP_PRESTIGE_EIGHT_YEAR_ONBOARDING_QA'];
const copy = value => JSON.parse(JSON.stringify(value));
const own = (db, kind) => db[kind].filter(row => row.client_id === CID);
const row = (db, kind, field, id) => db[kind].find(value => value[field] === id);
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const sha = value => crypto.createHash('sha256').update(stable(value), 'utf8').digest('hex');
// Independent approved planning expectations, not a second implementation of the native writes.
const EXPECTED = [
  ['session-containment', 'Advanced workforce session-token theft', 'critical', 'in_progress', CID + '_user_2', '2026-10-30'],
  ['secondary-copy-sample', 'Secondary-copy verification depth', 'high', 'open', CID + '_user_2', '2026-11-02'],
  ['customer-terms', 'New customer confidentiality terms', 'high', 'blocked', CID + '_user_0', '2026-11-05'],
  ['renewal-cross-references', 'Supplier renewal evidence navigation', 'medium', 'in_progress', CID + '_user_0', '2026-11-14'],
  ['ai-brief-refresher', 'AI public-brief handling reinforcement', 'medium', 'open', null, '2026-11-26'],
  ['supplier-exit', 'Supplier exit runbook rehearsal', 'medium', 'open', CID + '_user_0', '2026-12-03'],
  ['travel-device', 'Travel-device response rehearsal', 'low', 'open', CID + '_user_2', '2026-12-16'],
  ['cloud-response-options', 'Primary cloud provider concentration', 'low', 'open', CID + '_user_1', '2027-01-15'],
];

// Test-only recovery of this append's exact receipt boundary. Never used by production or startup.
// The actual bundled fixture is installed first; no model/history/file generation is repeated.
function preStageBranch(installed, receipt) {
  const result = copy(installed);
  if (!receipt) return result;
  const {receipt_sha256: signed, ...unsigned} = receipt;
  expect(sha(unsigned)).toBe(signed);
  const tasks = new Set(Object.values(receipt.task_ids));
  expect(result.db.tasks.filter(value => tasks.has(value.task_id))).toHaveLength(8);
  expect(result.db.policies.filter(value => value.policy_id === receipt.draft_policy_id)).toHaveLength(1);
  result.db.tasks = result.db.tasks.filter(value => !tasks.has(value.task_id));
  result.db.policies = result.db.policies.filter(value => value.policy_id !== receipt.draft_policy_id);
  for (const [kind, field] of [['risks', 'risk_id'], ['reviews', 'review_id']])
    for (const original of Object.values(receipt.source_rows[kind])) {
      const index = result.db[kind].findIndex(value => value[field] === original[field]);
      expect(index).toBeGreaterThanOrEqual(0);
      result.db[kind][index] = copy(original);
    }
  const customer = receipt.source_rows.new_customer_risk;
  row(result.db, 'risks', 'risk_id', customer.risk_id).status = customer.status;
  const auditIds = new Set(receipt.audit_ids);
  expect(result.db.logs.filter(value => auditIds.has(value.audit_id))).toHaveLength(auditIds.size);
  result.db.logs = result.db.logs.filter(value => !auditIds.has(value.audit_id));
  delete result.db[MARKER]; delete result.currentWorkManifest;
  return result;
}

let installed, source, result, before, bundledReceipt;
beforeAll(async () => {
  const flags = Object.fromEntries(FLAGS.map(key => [key, process.env[key]]));
  try {
    process.env.REACT_APP_PREVIEW = 'true';
    for (const key of FLAGS.slice(1)) delete process.env[key];
    installed = installPrestigeEightYearFixture(store.seedStoreBeforePrestige(CLOCK), fixture, {fresh: true, clock: CLOCK});
  } finally {
    for (const [key, value] of Object.entries(flags)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  bundledReceipt = fixture.provenance?.current_work;
  source = preStageBranch(installed, bundledReceipt);
  before = stable(source);
  result = await createPrestigeCurrentOperationalWork(source, OPTIONS);
});
afterEach(() => jest.restoreAllMocks());

test('creates eight real Risk-sourced Actions Open first, then uses native status transitions and audit events', () => {
  const {db, currentWorkManifest: manifest} = result;
  expect(Object.keys(manifest.task_ids)).toEqual(EXPECTED.map(value => value[0]));
  expect(new Set(Object.values(manifest.task_ids)).size).toBe(8);
  expect(own(db, 'tasks')).toHaveLength(14);
  for (const [key, title, priority, status, assignee, due] of EXPECTED) {
    const task = row(db, 'tasks', 'task_id', manifest.task_ids[key]);
    const risk = own(db, 'risks').find(value => value.title === title);
    expect(task).toMatchObject({client_id: CID, source_type: 'risk', source_id: risk.risk_id,
      risk_id: risk.risk_id, priority, status, assignee_id: assignee, due_date: due});
    expect(taskSource(task, db)).toMatchObject({kind: 'risks', id: risk.risk_id, label: title, target: risk});
    expect(task.description.length).toBeGreaterThan(100);
    expect(task.completed_at).toBeFalsy();
    expect(Number.isFinite(Date.parse(task.created_at))).toBe(true);
    expect(task.created_by).toBe(source.db.user.user_id);
    const events = db.logs.filter(log => log.entity_type === 'tasks' && log.entity_id === task.task_id);
    expect(events.some(log => log.action === 'Action Item created')).toBe(true);
    if (status === 'in_progress') {
      expect(events.some(log => log.action === 'Work started')).toBe(true);
      expect(task.started_by).toBe(source.db.user.user_id);
      expect(Number.isFinite(Date.parse(task.started_at))).toBe(true);
    }
    if (status === 'blocked') {
      expect(events.some(log => log.action === 'Status changed')).toBe(true);
      expect(task.description).toMatch(/Blocked awaiting proposed customer terms/);
    }
  }
  const customer = own(db, 'risks').find(value => value.title === 'New customer confidentiality terms');
  expect(source.db.risks.find(value => value.risk_id === customer.risk_id).status).toBe('open');
  expect(customer.status).toBe('in_progress');
});

test('starts only the rescheduled existing residual Risk occurrence and preserves all completed dates and recurrence', () => {
  const {db, currentWorkManifest: manifest} = result;
  expect(db.reviews).toHaveLength(source.db.reviews.length);
  for (const [key, due, status] of [['session-theft', '2026-10-30', 'in_progress'], ['ai-brief-training', '2026-11-14', 'upcoming']]) {
    const original = manifest.source_rows.reviews[key], review = row(db, 'reviews', 'review_id', manifest.review_ids[key]);
    expect(review).toMatchObject({risk_id: manifest.risk_ids[key], status, due_date: due, recurrence: original.recurrence});
    expect(occurrenceId(review)).toBe(occurrenceId(original));
    expect(review.occurrences).toEqual(original.occurrences);
    expect(db.reviews.filter(value => value.risk_id === review.risk_id)).toHaveLength(1);
    expect(row(db, 'risks', 'risk_id', review.risk_id).next_review).toBe(due);
  }
  const started = row(db, 'reviews', 'review_id', manifest.review_ids['session-theft']);
  expect(started.started_by).toBe(source.db.user.user_id);
  expect(started.risk_baseline).toMatchObject({likelihood_score: 3, impact_score: 5, status: 'in_progress'});
  expect(Number.isFinite(Date.parse(started.started_at))).toBe(true);
});

test('adds one proposed supplemental draft without changing sixteen effective Policies, approvals or criterion mappings', () => {
  const {db, currentWorkManifest: manifest} = result, draft = row(db, 'policies', 'policy_id', manifest.draft_policy_id);
  expect(own(db, 'policies')).toHaveLength(17);
  expect(draft).toMatchObject({title: 'AI public-brief contractor working instruction', version: '0.1',
    owner_id: CID + '_user_0', status: 'draft'});
  expect(draft.summary).toMatch(/PROPOSED ONLY/);
  expect(draft.summary).toMatch(/not an effective or approved Policy/);
  expect(draft.summary.length).toBeGreaterThan(500);
  for (const field of ['approval_status', 'approval_source', 'approval_subject', 'approved_at', 'baseline_key'])
    expect(draft).not.toHaveProperty(field);
  for (const policy of source.db.policies) expect(row(db, 'policies', 'policy_id', policy.policy_id)).toEqual(policy);
  expect(db.reviews.some(value => value.policy_id === draft.policy_id)).toBe(false);
  expect(db.framework_assessments).toEqual(source.db.framework_assessments);
  const refresher = row(db, 'tasks', 'task_id', manifest.task_ids['ai-brief-refresher']);
  expect(refresher.assignee_id).toBeNull();
  expect(refresher.description).toContain(draft.policy_id);
  expect(refresher.description).toMatch(/not approved or effective/);
});

test('permits only the declared per-record mutations and preserves full Evidence bytes, old receipts and every foreign record', () => {
  const {db, currentWorkManifest: manifest} = result;
  expect(stable(source)).toBe(before);
  for (const key of Object.keys(source.db)) {
    if (!Array.isArray(source.db[key])) expect(db[key]).toEqual(source.db[key]);
    else {
      expect(db[key].filter(value => value.client_id !== CID)).toEqual(source.db[key].filter(value => value.client_id !== CID));
      if (!['risks', 'reviews', 'tasks', 'policies', 'logs'].includes(key)) expect(db[key]).toEqual(source.db[key]);
    }
  }
  for (const kind of ['evidence', 'framework_assessments', 'organizational_controls', 'findings', 'vendors', 'ai_systems', 'assets'])
    expect(db[kind]).toEqual(source.db[kind]);
  for (const task of source.db.tasks) expect(row(db, 'tasks', 'task_id', task.task_id)).toEqual(task);
  for (const original of source.db.risks) {
    const key = Object.keys(manifest.review_ids).find(value => manifest.risk_ids[value] === original.risk_id);
    const allowed = key ? ['next_review', 'updated_at'] : original.risk_id === manifest.source_rows.new_customer_risk.risk_id ? ['status'] : [];
    expect(omit(row(db, 'risks', 'risk_id', original.risk_id), allowed)).toEqual(omit(original, allowed));
  }
  for (const original of source.db.reviews) {
    const key = Object.keys(manifest.review_ids).find(value => manifest.review_ids[value] === original.review_id);
    const allowed = key ? ['due_date', 'recurrence_due_date', 'next_review_date', 'schedule_anchor', 'period',
      ...(key === 'session-theft' ? ['status', 'updated_at', 'started_at', 'started_by', 'risk_baseline'] : [])] : [];
    expect(omit(row(db, 'reviews', 'review_id', original.review_id), allowed)).toEqual(omit(original, allowed));
  }
  const cloud = own(source.db, 'risks').find(value => value.title === 'Primary cloud provider concentration');
  expect(row(db, 'risks', 'risk_id', cloud.risk_id)).toEqual(cloud);
  expect(db.logs.filter(log => !manifest.audit_ids.includes(log.audit_id))).toEqual(source.db.logs);
  expect(manifest.output_hash_scope).toMatch(/Eight source Risks/);
});

test('the native Work model and dashboard queue expose the same Action IDs, Risk sources, due dates and assignment gap', () => {
  const db = result.db, records = Object.fromEntries(DASHBOARD_KINDS.map(kind => [kind, own(db, kind)]));
  const aggregate = aggregateClientDashboard(records, {clientId: CID, members: db.users, user: db.user, today: CLOCK, scope: {kind: 'org'}});
  const model = {...managementMetrics(aggregate, {members: db.users, today: CLOCK}), activeRecords: aggregate.activeRecords};
  const queue = dashboardWorkQueue(model, new Set(db.users.filter(user => eligible(user, CID)).map(user => user.user_id)), records);
  for (const [key, title, , , , due] of EXPECTED) {
    const id = result.currentWorkManifest.task_ids[key], items = queue.all.filter(value => value.kind === 'tasks' && value.id === id);
    expect(items).toHaveLength(1); expect(items[0]).toMatchObject({due_date: due, source_label: title});
  }
  expect(queue.unassigned.some(value => value.id === result.currentWorkManifest.task_ids['ai-brief-refresher'])).toBe(true);
  expect(queue.pastDue.some(value => value.id === result.currentWorkManifest.task_ids['session-containment'])).toBe(true);
  expect(queue.due30.some(value => value.id === result.currentWorkManifest.task_ids['supplier-exit'])).toBe(true);
});

test('retries validate the actual receipt and native output records without allocating or changing IDs', async () => {
  const candidate = bundledReceipt ? {...copy(installed), currentWorkManifest: copy(bundledReceipt)} : result;
  const write = jest.spyOn(store, 'write'), original = stable(candidate);
  const retry = await createPrestigeCurrentOperationalWork(candidate, OPTIONS);
  expect(stable(candidate)).toBe(original); expect(retry.db).toEqual(candidate.db);
  expect(retry.currentWorkManifest).toEqual(candidate.currentWorkManifest);
  expect(write).not.toHaveBeenCalled();
  const altered = copy(result); row(altered.db, 'tasks', 'task_id', altered.currentWorkManifest.task_ids['customer-terms']).status = 'open';
  await expect(createPrestigeCurrentOperationalWork(altered, OPTIONS)).rejects.toThrow(/retry/);
  const receipt = copy(result); receipt.currentWorkManifest.draft_policy_id = 'changed';
  await expect(createPrestigeCurrentOperationalWork(receipt, OPTIONS)).rejects.toThrow(/retry/);
});

test.each([
  {name: 'wrong purpose', change: () => {}, options: {purpose: 'runtime'}},
  {name: 'wrong anchor', change: value => { value.anchor = '2026-11-03T00:00:00.000Z'; }},
  {name: 'read-only actor', change: value => { value.db.user.role = 'client_readonly'; }},
  {name: 'inactive assignee', change: value => { value.db.users.find(user => user.user_id === CID + '_user_2').status = 'inactive'; }},
  {name: 'ambiguous Risk title', change: value => { value.db.risks.push({...own(value.db, 'risks').find(risk => risk.title === EXPECTED[0][1]), risk_id: 'ambiguous-risk'}); }},
  {name: 'foreign returned Risk map', change: value => { value.manifest = {risk_ids: {'session-theft': value.db.risks.find(risk => risk.client_id !== CID).risk_id}}; }},
  {name: 'duplicate native Risk Review', change: value => {
    const risk = own(value.db, 'risks').find(item => item.title === EXPECTED[0][1]);
    value.db.reviews.push({...value.db.reviews.find(review => review.risk_id === risk.risk_id), review_id: 'duplicate-parent'});
  }},
])('rejects $name without mutating the caller or its backup', async ({change, options}) => {
  const input = copy(source); change(input); const original = stable(input);
  await expect(createPrestigeCurrentOperationalWork(input, options || OPTIONS)).rejects.toThrow();
  expect(stable(input)).toBe(original);
});

test('a later native write failure discards partial source work without changing the original dataset', async () => {
  const nativeWrite = store.write; let calls = 0;
  jest.spyOn(store, 'write').mockImplementation((db, kind, ...args) => {
    if (kind === 'tasks' && ++calls === 4) throw new Error('controlled native write failure');
    return nativeWrite(db, kind, ...args);
  });
  await expect(createPrestigeCurrentOperationalWork(source, OPTIONS)).rejects.toThrow('controlled native write failure');
  expect(calls).toBe(4); expect(stable(source)).toBe(before);
});

test('an arbitrary seventeenth Policy is rejected even after recomputing the payload fingerprint', () => {
  const bundle = copy(fixture);
  if (bundle.payload.collections.policies.length === 16) bundle.payload.collections.policies.push({
    policy_id: 'unadmitted-draft', client_id: CID, title: 'Unadmitted draft', status: 'draft', version: '0.1', owner_id: CID + '_user_0'});
  delete bundle.provenance.current_work;
  bundle.fingerprint = fixtureFingerprint(bundle.payload);
  const input = copy(installed.backup), original = stable(input);
  expect(() => installPrestigeEightYearFixture(input, bundle, {fresh: true, clock: CLOCK})).toThrow();
  expect(stable(input)).toBe(original);
});

test.each(['approval_history', 'decision_history', 'effective_date', 'effective-policy-status'])(
  'the proposed draft cohort rejects %s contamination without changing native records', field => {
    const bundle = copy(fixture);
    const draft = bundle.payload.collections.policies.find(policy => policy.policy_id === bundledReceipt.draft_policy_id);
    if (field === 'effective-policy-status') bundle.payload.collections.policies.find(policy => policy !== draft).status = 'draft';
    else draft[field] = field === 'effective_date' ? '2026-10-01' : [{status: 'approved', at: ANCHOR}];
    bundle.fingerprint = fixtureFingerprint(bundle.payload);
    const input = copy(installed.backup), original = stable(input);
    expect(() => installPrestigeEightYearFixture(input, bundle, {fresh: true, clock: CLOCK})).toThrow(/complete native baseline/);
    expect(stable(input)).toBe(original);
  });
