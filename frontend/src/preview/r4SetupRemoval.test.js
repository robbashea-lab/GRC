import axios from 'axios';
import {previewAdapter} from './adapter';
import {ids, readStore, saveStore, STORE_KEY} from './store';
import {activePlans, reviewDriver} from '../lib/frameworks';
import {serviceCatalog} from '../lib/r4ServicesTools';
import {reviewView} from '../lib/reviewOccurrences';

const api = axios.create({adapter: previewAdapter});
const CID = 'synthetic_r4_setup_removal';
const FOREIGN = 'synthetic_r4_setup_foreign';
const RID = 'synthetic_r4_setup_review';
const ACTOR = 'synthetic_r4_setup_admin';
const WORKER = 'synthetic_r4_setup_worker';
let intent = 0;

function fixture({withReview = true, noTicket = false} = {}) {
  const db = Object.fromEntries(Object.keys(ids).map(kind => [kind, []]));
  db.user = {user_id: ACTOR, name: 'Owned Setup QA administrator', email: 'setup-admin@example.test',
    role: 'platform_admin', status: 'active', client_ids: [CID], all_clients: false, workspace_mode: 'demo'};
  db.users = [{...db.user}, {user_id: WORKER, name: 'Owned Setup QA worker', email: 'setup-worker@example.test',
    role: 'client_contributor', status: 'active', client_ids: [CID]}];
  db.baselines = {};
  db.logs = [];
  db.command_requests = {};
  db.clients = [{client_id: CID, name: 'Owned Setup QA', status: 'active',
    updated_at: '2026-11-19T00:00:00.000Z', framework_settings: {'cis-ig1': {implementation_group: 1}},
    profile: {services: {areas: Object.fromEntries(serviceCatalog.areas.map(area => [area.id,
      {responsibility: 'iv', tool_ids: []}])), custom_tools: [], exclusions: {}}}},
  {client_id: FOREIGN, name: 'Retained foreign QA client', status: 'active',
    updated_at: '2026-11-19T00:00:00.000Z', profile: {retained: 'Foreign data stays unchanged'}}];
  db.requirements = [{requirement_id: 'synthetic_r4_setup_program', client_id: CID,
    baseline_key: 'cis-ig1', baseline_response: 'applies'}];
  const plan = activePlans('cis-ig1', {implementation_group: 1})[0];
  if (withReview) db.reviews.push(reviewView({review_id: RID, client_id: CID, title: 'Owned recurring QA review',
    review_type: plan.review_type, framework_key: 'cis-ig1', framework_plan_key: plan.key,
    status: 'upcoming', recurrence: 'annual', due_date: '2099-12-01',
    current_occurrence_id: 'synthetic_r4_setup_occurrence', owner_id: WORKER, reviewer_id: WORKER,
    created_at: '2026-11-18T00:00:00.000Z', created_by: ACTOR, updated_at: '2026-11-19T00:00:01.000Z',
    activity_setup: {recurring_ticket_number: '318', recurring_ticket_url: 'https://example.test/ticket/318',
      recurring_ticket_summary: 'Retained operational ticket', notes: 'Retained instructions', no_ticket: noTicket},
    occurrences: [{occurrence_id: 'synthetic_r4_setup_previous', status: 'completed',
      due_date: '2098-12-01', completed_at: '2098-12-02T14:00:00.000Z', completed_by: WORKER,
      completion_summary: 'Retained synthetic historical result'}]}));
  if (withReview) {
    db.tasks = [{task_id: 'synthetic_r4_setup_action', client_id: CID, title: 'Retained related action',
      status: 'todo', review_id: RID, occurrence_id: 'synthetic_r4_setup_occurrence', assignee_id: WORKER}];
    db.evidence = [{evidence_id: 'synthetic_r4_setup_evidence', client_id: CID, linked_type: 'review',
      linked_id: RID, filename: 'synthetic-setup-evidence.txt', version: 1, content_base64: 'UjQgZml4dHVyZQ=='}];
  }
  return db;
}

async function resetFixture(options) {
  saveStore(fixture(options), {resetFiles: true});
  await api.post('/demo/enter');
}

function edit(mutator) {
  const db = readStore();
  mutator(db);
  saveStore(db);
}

async function context() {
  const {data} = await api.get(`/clients/${CID}/iv-setup`);
  const entry = data.activities.find(row => row.review_id === RID) || data.activities[0];
  expect(entry).toBeDefined();
  return {entry, body: {expected_updated_at: entry.expected_updated_at,
    expected_client_updated_at: data.expected_client_updated_at}};
}

function removal(entry, body, key = 'r4-setup-removal-' + ++intent) {
  return api.post(`/clients/${CID}/iv-setup/exclusion/${encodeURIComponent(entry.activity_id)}`, body,
    {headers: {'Idempotency-Key': key}});
}

function unaffected(db) {
  return {foreign: db.clients.find(row => row.client_id === FOREIGN), tasks: db.tasks,
    evidence: db.evidence, findings: db.findings, vendors: db.vendors, policies: db.policies,
    assets: db.assets, assessments: db.framework_assessments, requirements: db.requirements};
}

function expectReviewRetained(actual, original, noTicket) {
  expect(actual.activity_setup.no_ticket).toBe(noTicket);
  expect({...actual, updated_at: original.updated_at,
    activity_setup: {...actual.activity_setup, no_ticket: original.activity_setup.no_ticket}}).toEqual(original);
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetFixture();
});

afterEach(() => jest.restoreAllMocks());

test.each([
  ['spm', false, 'The Security Program Manager performs it; no recurring ticket'],
  ['client', true, 'The client or another provider does it'],
  ['na', true, 'Doesn’t apply to Owned Setup QA']
])('%s removal and Restore preserve the actual review and connected records', async (kind, noTicket, base) => {
  await resetFixture({noTicket});
  const {entry, body} = await context();
  const before = readStore();
  const original = before.reviews.find(row => row.review_id === RID);
  await removal(entry, {...body, excluded: true, kind, note: '  Follow the existing register  '});
  const removed = readStore();
  const saved = removed.clients.find(row => row.client_id === CID).profile.services.exclusions[entry.activity_id];
  expect(saved).toEqual({kind, note: 'Follow the existing register',
    reason: base + ' — Follow the existing register', by: ACTOR, at: expect.any(String)});
  expect(Number.isFinite(Date.parse(saved.at))).toBe(true);
  expectReviewRetained(removed.reviews.find(row => row.review_id === RID), original, true);
  if (kind !== 'spm') expect(removed.reviews).toEqual(before.reviews);
  expect(unaffected(removed)).toEqual(unaffected(before));
  const reloaded = await context();
  expect(reloaded.entry.state).toBe('removed');
  expect(reloaded.entry.exclusion).toEqual(saved);
  await removal(reloaded.entry, {...reloaded.body, excluded: false});
  const restored = readStore();
  expect(restored.clients.find(row => row.client_id === CID).profile.services.exclusions).not.toHaveProperty(entry.activity_id);
  expectReviewRetained(restored.reviews.find(row => row.review_id === RID), original, false);
  expect(unaffected(restored)).toEqual(unaffected(before));
  expect((await context()).entry.state).toBe('done');
});

test('removing and restoring an uncreated activity never creates or deletes native records', async () => {
  await resetFixture({withReview: false});
  const before = readStore();
  for (const kind of ['spm', 'client', 'na']) {
    const current = await context();
    expect(current.entry.review_id).toBeNull();
    const note = kind === 'na' ? 'x'.repeat(2000) : '';
    await removal(current.entry, {...current.body, excluded: true, kind, note});
    expect((await context()).entry.state).toBe('removed');
    expect((await context()).entry.exclusion.note).toBe(note);
    const removed = await context();
    await removal(removed.entry, {...removed.body, excluded: false});
    expect(readStore().reviews).toEqual(before.reviews);
    expect(unaffected(readStore())).toEqual(unaffected(before));
  }
});

test('legacy reason-only requests retain their shape, history and exact replay identity', async () => {
  const {entry, body} = await context();
  const request = {...body, excluded: true, reason: '  Retained legacy rationale  '};
  const key = 'r4-setup-legacy-reason-only';
  await removal(entry, request, key);
  const saved = readStore();
  const exclusion = saved.clients.find(row => row.client_id === CID).profile.services.exclusions[entry.activity_id];
  expect(exclusion).toEqual({reason: 'Retained legacy rationale', by: ACTOR, at: expect.any(String)});
  expect(exclusion).not.toHaveProperty('kind');
  expect(exclusion).not.toHaveProperty('note');
  expect(saved.reviews.find(row => row.review_id === RID).activity_setup.no_ticket).toBe(false);
  const identity = JSON.stringify([ACTOR, CID,
    `/clients/${CID}/iv-setup/exclusion/${encodeURIComponent(entry.activity_id)}`, key]);
  expect(saved.command_requests[identity]).toBeDefined();
  expect(JSON.parse(saved.command_requests[identity].fingerprint)).toEqual(request);
  await removal(entry, request, key);
  expect(readStore()).toEqual(saved);
  await expect(removal(entry, {...request, kind: 'spm'}, key)).rejects.toMatchObject({response: {status: 409}});
  expect(readStore()).toEqual(saved);
  const current = await context();
  await removal(current.entry, {...current.body, excluded: true, reason: 'Explicit null retains legacy', kind: null, note: ''});
  const next = readStore();
  expect(next.clients.find(row => row.client_id === CID).profile.services.exclusions[entry.activity_id]).toEqual({
    reason: 'Explicit null retains legacy', by: ACTOR, at: expect.any(String)
  });
  expect(next.command_requests[identity]).toEqual(saved.command_requests[identity]);
});

test('legacy unknown removal kinds remain readable and Restore clears only the setup decision', async () => {
  const initial = await context();
  const legacy = {kind: 'undocumented_old_kind', reason: 'Historical reason with unknown semantics',
    by: 'departed-synthetic-worker', at: '2026-01-01T00:00:00.000Z'};
  edit(db => {
    db.clients.find(row => row.client_id === CID).profile.services.exclusions[initial.entry.activity_id] = legacy;
    db.reviews.find(row => row.review_id === RID).activity_setup.no_ticket = true;
  });
  const before = readStore();
  const current = await context();
  expect(current.entry.exclusion).toEqual(legacy);
  expect(readStore()).toEqual(before);
  await removal(current.entry, {...current.body, excluded: false});
  const after = readStore();
  expectReviewRetained(after.reviews.find(row => row.review_id === RID), before.reviews.find(row => row.review_id === RID), false);
  expect(after.clients.find(row => row.client_id === CID).profile.services.exclusions).not.toHaveProperty(initial.entry.activity_id);
  expect(unaffected(after)).toEqual(unaffected(before));
});

test('a later shared driver removal remains visible and Restore clears only the actual activity aliases', async () => {
  const cisPlan = activePlans('cis-ig1', {implementation_group: 1}).find(plan => plan.baseline_key === 'user-access');
  const isoPlan = activePlans('iso-27001').find(plan => plan.baseline_key === 'user-access');
  expect(cisPlan).toBeDefined();
  expect(isoPlan).toBeDefined();
  const laterAlias = 'plan:iso-27001:' + isoPlan.key;
  const firstAlias = 'plan:cis-ig1:' + cisPlan.key;
  const unrelated = 'plan:iso-27001:unknown-retained-plan';
  const legacy = {kind: 'unknown_historical_kind', reason: 'Retained later-driver reason',
    by: 'departed-synthetic-worker', at: '2026-01-01T00:00:00.000Z'};
  edit(db => {
    db.requirements.push({requirement_id: 'synthetic_r4_setup_iso', client_id: CID,
      baseline_key: 'iso-27001', baseline_response: 'applies'});
    const review = db.reviews.find(row => row.review_id === RID);
    Object.assign(review, {framework_plan_key: cisPlan.key, baseline_key: 'user-access',
      framework_drivers: [reviewDriver('cis-ig1', cisPlan), reviewDriver('iso-27001', isoPlan)]});
    review.activity_setup.no_ticket = true;
    db.clients.find(row => row.client_id === CID).profile.services.exclusions = {
      [laterAlias]: legacy, [unrelated]: {reason: 'Unrelated historical decision stays unchanged'}};
  });
  const beforeRead = readStore();
  const shared = await context();
  expect(shared.entry.drivers).toEqual(expect.arrayContaining([
    expect.objectContaining({framework_key: 'cis-ig1', framework_plan_key: cisPlan.key}),
    expect.objectContaining({framework_key: 'iso-27001', framework_plan_key: isoPlan.key})
  ]));
  expect(shared.entry.exclusion).toEqual(legacy);
  expect(shared.entry.state).toBe('removed');
  expect(readStore()).toEqual(beforeRead);
  edit(db => {
    const exclusions = db.clients.find(row => row.client_id === CID).profile.services.exclusions;
    exclusions[shared.entry.activity_id] = {reason: 'Explicit canonical decision'};
    exclusions[firstAlias] = {reason: 'Retained first-driver reason'};
  });
  const beforeRestore = readStore();
  const current = await context();
  await removal(current.entry, {...current.body, excluded: false});
  const restored = readStore();
  expect(restored.clients.find(row => row.client_id === CID).profile.services.exclusions).toEqual({
    [unrelated]: beforeRestore.clients.find(row => row.client_id === CID).profile.services.exclusions[unrelated]
  });
  expectReviewRetained(restored.reviews.find(row => row.review_id === RID), beforeRestore.reviews.find(row => row.review_id === RID), false);
  expect(unaffected(restored)).toEqual(unaffected(beforeRestore));
  expect((await context()).entry.state).toBe('done');
});

test('invalid decisions, new-field types and unsupported metadata cannot change the saved journal', async () => {
  const {entry, body} = await context();
  const before = sessionStorage.getItem(STORE_KEY);
  for (const invalid of [
    {excluded: 'true', kind: 'spm'}, {excluded: true, kind: 'unknown'},
    {excluded: true, kind: 1}, {excluded: true, kind: 'spm', note: null},
    {excluded: true, kind: 'spm', note: {}}, {excluded: true, kind: 'spm', note: 'x'.repeat(2001)},
    {excluded: true, reason: 'x'.repeat(2001)}, {excluded: true, reason: {}},
    {excluded: true, reason: 'Legacy reason', note: 'Do not discard this note'},
    {excluded: true, kind: null, reason: 'Legacy reason', note: 'Do not discard this note'},
    {excluded: true, kind: null, reason: ''}, {excluded: true, kind: 'spm', by: WORKER},
    {excluded: true, kind: 'spm', at: '2026-01-01'}, {excluded: true, kind: 'spm', client_id: CID}
  ]) {
    await expect(removal(entry, {...body, ...invalid})).rejects.toMatchObject({response: {status: 422}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
});

test('both stale snapshot tokens refuse removal without changing related work', async () => {
  const {entry, body} = await context();
  const before = sessionStorage.getItem(STORE_KEY);
  for (const field of ['expected_updated_at', 'expected_client_updated_at']) {
    await expect(removal(entry, {...body, [field]: '2026-01-01T00:00:00.000Z', excluded: true,
      kind: 'spm'})).rejects.toMatchObject({response: {status: 409}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
});

test('cached removal still requires the current role, tenant, account and active client', async () => {
  const {entry, body} = await context();
  const request = {...body, excluded: true, kind: 'spm', note: ''};
  const key = 'r4-setup-current-authority';
  await removal(entry, request, key);
  const saved = readStore();
  for (const mutate of [
    ...['client_grc_manager', 'client_contributor', 'client_readonly', 'client_viewer', 'unknown_role']
      .map(role => db => { db.user.role = role; }),
    db => { db.user.client_ids = []; },
    db => { db.user.status = 'suspended'; },
    db => { db.clients.find(row => row.client_id === CID).status = 'archived'; }
  ]) {
    saveStore(saved);
    edit(mutate);
    const denied = sessionStorage.getItem(STORE_KEY);
    await expect(removal(entry, request, key)).rejects.toMatchObject({response: {status: 403}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(denied);
  }
});

test('an old successful removal retry cannot overwrite a later Restore', async () => {
  const initial = await context();
  const request = {...initial.body, excluded: true, kind: 'spm', note: ''};
  const key = 'r4-setup-old-removal-retry';
  await removal(initial.entry, request, key);
  const removed = await context();
  await removal(removed.entry, {...removed.body, excluded: false});
  const restored = readStore();
  await removal(initial.entry, request, key);
  expect(readStore()).toEqual(restored);
  expect((await context()).entry.state).toBe('done');
});

test('a failed storage commit retains both client and Review and permits the same intent retry', async () => {
  const {entry, body} = await context();
  const request = {...body, excluded: true, kind: 'spm', note: 'Owned quota-failure case'};
  const key = 'r4-setup-storage-failure';
  const before = sessionStorage.getItem(STORE_KEY);
  const nativeSetItem = Storage.prototype.setItem;
  const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
    if (this === sessionStorage && name === STORE_KEY) throw new DOMException('Synthetic owned storage failure', 'QuotaExceededError');
    return nativeSetItem.call(this, name, value);
  });
  await expect(removal(entry, request, key)).rejects.toMatchObject({response: {status: 400,
    data: {storage_code: 'QUOTA_EXCEEDED'}}});
  storage.mockRestore();
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect((await context()).entry.state).toBe('done');
  await removal(entry, request, key);
  expect((await context()).entry.state).toBe('removed');
  expect(readStore().reviews.find(row => row.review_id === RID).activity_setup.no_ticket).toBe(true);
});
