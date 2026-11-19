import axios from 'axios';
import {previewAdapter} from './adapter';
import {ids, readStore, saveStore, STORE_KEY} from './store';

const api = axios.create({adapter: previewAdapter});
const CLIENT = 'r4_native_a', FOREIGN = 'r4_native_b', FINDING = 'r4_native_finding';
const FIRST = 'r4_native_first_action', SECOND = 'r4_native_second_action';
const AT = '2026-01-01T12:00:00.000Z';
const copy = value => JSON.parse(JSON.stringify(value));

function user(id, role='platform_admin', clients=[CLIENT]) {
  return {user_id: id, name: 'Synthetic ' + id, email: id + '@example.test', role,
    status: 'active', client_ids: clients, all_clients: false, workspace_mode: 'demo'};
}

function fixture() {
  const db = Object.fromEntries(Object.keys(ids).map(kind => [kind, []]));
  db.users = [user('r4_admin', 'super_admin', [CLIENT, FOREIGN]), user('worker_a'), user('worker_b'),
    user('prior_worker'), user('current_owner'), user('fresh_worker'), user('validator'),
    user('foreign_admin', 'platform_admin', [FOREIGN]), user('reader', 'client_readonly'),
    user('manager', 'client_grc_manager')];
  db.user = copy(db.users[0]);
  db.clients = [{client_id: CLIENT, name: 'Synthetic R4 client', status: 'active', environment: 'Demo', created_at: AT, updated_at: AT},
    {client_id: FOREIGN, name: 'Synthetic foreign client', status: 'active', environment: 'Demo', created_at: AT, updated_at: AT}];
  db.baselines = {[CLIENT]: {completed: false, requirements: {}}, [FOREIGN]: {completed: false, requirements: {}}};
  db.logs = [];
  db.findings = [{finding_id: FINDING, client_id: CLIENT, title: 'Synthetic collective remediation',
    status: 'remediated', severity: 'high', owner_id: 'current_owner', primary_task_id: FIRST,
    created_at: AT, created_by: 'r4_admin', updated_at: AT, decision_history: []}];
  db.tasks = [{task_id: FIRST, client_id: CLIENT, finding_id: FINDING, source_type: 'finding', source_id: FINDING,
    title: 'First submitted corrective action', description: 'Retained manual description', resolution: 'Retained first outcome',
    status: 'done', priority: 'high', assignee_id: 'current_owner', created_at: AT, created_by: 'r4_admin', updated_at: AT,
    completed_by: 'worker_a', completed_at: '2026-01-03T12:00:00.000Z',
    submission_history: [{by: 'prior_worker', at: '2026-01-02T12:00:00.000Z'}, {by: 'worker_a', at: '2026-01-03T12:00:00.000Z'}]},
  {task_id: SECOND, client_id: CLIENT, finding_id: FINDING, source_type: 'finding', source_id: FINDING,
    title: 'Second submitted corrective action', resolution: 'Retained second outcome', status: 'done', priority: 'high',
    assignee_id: 'current_owner', created_at: AT, created_by: 'r4_admin', updated_at: AT,
    completed_by: 'worker_b', completed_at: '2026-01-04T12:00:00.000Z',
    submission_history: [{by: 'worker_b', at: '2026-01-04T12:00:00.000Z'}]}];
  return db;
}

beforeEach(async () => {
  sessionStorage.clear();
  localStorage.clear();
  // An owned minimal session exercises the real adapter/store without loading or
  // editing the large, separately qualified fictional client fixture.
  saveStore(fixture(), {resetFiles: true});
  await api.post('/demo/enter');
});

function asUser(id) {
  const db = readStore();
  db.user = copy(db.users.find(account => account.user_id === id));
  saveStore(db);
}

const finding = () => readStore().findings.find(row => row.finding_id === FINDING);
const actions = () => readStore().tasks.filter(row => row.finding_id === FINDING);

test.each(['worker_a', 'worker_b', 'prior_worker', 'current_owner'])(
  'the actual %s cannot validate or reject collective remediation', async id => {
    asUser(id);
    const before = sessionStorage.getItem(STORE_KEY);
    for (const operation of ['validate', 'reject']) {
      await expect(api.post(`/findings/${FINDING}/${operation}`, {
        rationale: 'Synthetic attempted self-validation', expected_updated_at: finding().updated_at,
        request_id: `r4-denied-${id}-${operation}`,
      })).rejects.toThrow('Validation requires a different account from every work submitter and current Action owner.');
      expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
    }
    expect(actions()).toHaveLength(2);
    expect(finding().status).toBe('remediated');
  }
);

test('unknown legacy worker identity prevents an otherwise independent decision', async () => {
  const db = readStore(), historical = db.tasks.find(row => row.task_id === FIRST);
  delete historical.completed_by;
  delete historical.submission_history;
  saveStore(db);
  asUser('validator');
  const before = sessionStorage.getItem(STORE_KEY);
  await expect(api.post(`/findings/${FINDING}/validate`, {rationale: 'Synthetic independent review',
    expected_updated_at: finding().updated_at, request_id: 'r4-unknown-worker-validate'}))
    .rejects.toThrow('Reconcile unknown legacy work submitter identities before validation.');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(finding().status).toBe('remediated');
});

test('an outstanding corrective action blocks validation before any closure is saved', async () => {
  const db = readStore();
  db.tasks.push({task_id: 'r4_native_outstanding_action', client_id: CLIENT, finding_id: FINDING,
    source_type: 'finding', source_id: FINDING, title: 'Outstanding third corrective action',
    status: 'open', priority: 'high', assignee_id: 'current_owner', created_at: AT, updated_at: AT});
  saveStore(db);
  asUser('validator');
  const before = sessionStorage.getItem(STORE_KEY);
  await expect(api.post(`/findings/${FINDING}/validate`, {rationale: 'Synthetic premature review',
    expected_updated_at: finding().updated_at, request_id: 'r4-outstanding-work-validate'}))
    .rejects.toThrow('Complete outstanding corrective work before independent validation.');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(finding().validated_by).toBeUndefined();
});

test('an eligible current account closes the Finding while retaining the original Actions', async () => {
  const retained = copy(actions());
  for (const id of ['reader', 'foreign_admin']) {
    asUser(id);
    const before = sessionStorage.getItem(STORE_KEY);
    await expect(api.post(`/findings/${FINDING}/validate`, {rationale: 'Synthetic unpermitted review',
      expected_updated_at: finding().updated_at, request_id: 'r4-unpermitted-' + id}))
      .rejects.toMatchObject({response: {status: 403}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
  asUser('validator');
  const result = (await api.post(`/findings/${FINDING}/validate`, {rationale: 'Independent result checked against retained work',
    expected_updated_at: finding().updated_at, request_id: 'r4-independent-final-validation'})).data;
  expect(result).toMatchObject({finding_id: FINDING, status: 'closed', validated_by: 'validator', closed_by: 'validator'});
  expect(result.decision_history).toHaveLength(1);
  expect(result.decision_history[0]).toMatchObject({action: 'validated', by: 'validator'});
  const loaded = (await axios.create({adapter: previewAdapter}).get('/findings/' + FINDING)).data;
  expect(loaded.validated_by).toBe('validator');
  expect(actions()).toEqual(retained);
});

test('reject creates one new rework Action and exact replay preserves completed history', async () => {
  asUser('validator');
  const retained = copy(actions());
  const body = {rationale: 'Independent review found remaining corrective work', expected_updated_at: finding().updated_at,
    request_id: 'r4-exact-native-rework-intent'};
  const rejected = (await api.post(`/findings/${FINDING}/reject`, body)).data;
  expect(rejected.status).toBe('in_remediation');
  expect(actions()).toHaveLength(3);
  const rework = actions().find(row => ![FIRST, SECOND].includes(row.task_id));
  expect(rework.task_id).toMatch(/^tasks_demo_/);
  expect(rejected.primary_task_id).toBe(rework.task_id);
  expect(rework).toMatchObject({client_id: CLIENT, finding_id: FINDING, status: 'open', source_type: 'finding', source_id: FINDING,
    title: 'First submitted corrective action', description: 'Retained manual description', assignee_id: 'current_owner'});
  expect(rework.completed_by).toBeUndefined();
  expect(actions().filter(row => [FIRST, SECOND].includes(row.task_id))).toEqual(retained);
  const replay = (await axios.create({adapter: previewAdapter}).post(`/findings/${FINDING}/reject`, body)).data;
  expect(replay.primary_task_id).toBe(rework.task_id);
  expect(actions()).toHaveLength(3);
  expect(finding().decision_history.filter(row => row.action === 'rejected')).toHaveLength(1);
  await expect(api.post(`/findings/${FINDING}/reject`, {...body, rationale: 'A different intent on the same key'}))
    .rejects.toMatchObject({response: {status: 409}});
  const before = sessionStorage.getItem(STORE_KEY);
  await expect(api.patch('/tasks/' + FIRST, {status: 'open', expected_updated_at: retained[0].updated_at}))
    .rejects.toThrow('Completed Action Items remain historical evidence; create new corrective work.');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  asUser('fresh_worker');
  const submitted = (await api.patch('/tasks/' + rework.task_id, {status: 'done', resolution: 'Fresh independently submitted rework',
    expected_updated_at: rework.updated_at}, {headers: {'Idempotency-Key': 'r4-new-rework-submission-0001'}})).data;
  expect(submitted.completed_by).toBe('fresh_worker');
  expect(submitted.submission_history).toHaveLength(1);
  expect(submitted.submission_history[0].by).toBe('fresh_worker');
  expect(finding().status).toBe('remediated');
  asUser('prior_worker');
  await expect(api.post(`/findings/${FINDING}/validate`, {rationale: 'A prior worker remains excluded after rework',
    expected_updated_at: finding().updated_at, request_id: 'r4-prior-worker-after-rework'}))
    .rejects.toThrow('Validation requires a different account from every work submitter and current Action owner.');
  expect(actions().filter(row => [FIRST, SECOND].includes(row.task_id))).toEqual(retained);
});

test('Risk acceptance retains the exact existing Review schedule and occurrence', async () => {
  const risk = (await api.post('/risks', {client_id: CLIENT, title: 'Synthetic scheduled exposure', source_type: 'manual',
    likelihood_score: 2, impact_score: 3, next_review: '2030-01-31', review_cadence: 'annual'},
  {headers: {'Idempotency-Key': 'r4-native-risk-create-0001'}})).data;
  const review = copy(readStore().reviews.find(row => row.risk_id === risk.risk_id));
  expect(review).toMatchObject({due_date: '2030-01-31', recurrence: 'annual', status: 'upcoming'});
  const accepted = (await api.post(`/risks/${risk.risk_id}/accept`, {rationale: 'Synthetic acceptance without rescheduling work',
    expiry_date: '2099-12-31', approver_id: 'r4_admin', expected_updated_at: risk.updated_at})).data;
  expect(accepted).toMatchObject({status: 'accepted', accepted_by: 'r4_admin', acceptance_expires_at: '2099-12-31', next_review: '2030-01-31'});
  expect(readStore().reviews.find(row => row.risk_id === risk.risk_id)).toEqual(review);
  expect((await api.get('/reviews/' + review.review_id)).data.current_occurrence_id).toBe(review.current_occurrence_id);
  expect(readStore().reviews.filter(row => row.risk_id === risk.risk_id)).toHaveLength(1);
});

test.each([null, 'cis-ig1', 'iso-27001', 'soc-2', 'hipaa', 'nist-csf-2', 'cmmc'])(
  'native AI approval and material reassessment work for the %s client cohort', async key => {
    if (key) {
      const db = readStore();
      const baseline = {completed: true, requirements: {[key]: 'applies'}};
      db.baselines[CLIENT] = baseline;
      db.clients.find(row => row.client_id === CLIENT).onboarding_baseline = copy(baseline);
      db.requirements.push({requirement_id: 'r4-selected-' + key, client_id: CLIENT, baseline_key: key, baseline_response: 'applies', status: 'active'});
      saveStore(db);
    }
    const created = (await api.post('/ai_systems', {client_id: CLIENT, name: 'Synthetic R4 assistant', environment: 'Owned synthetic workspace',
      description: 'Draft public synthetic material', permitted_data_types: ['Public']},
    {headers: {'Idempotency-Key': 'r4-ai-native-create-00001'}})).data;
    expect(created).toMatchObject({client_id: CLIENT, status: 'draft', approval_status: 'pending_assessment'});
    const approved = (await api.post(`/ai_systems/${created.ai_system_id}/approval`, {status: 'approved', note: 'Current administrator approves the saved synthetic use',
      expected_updated_at: created.updated_at})).data;
    expect(approved.approval_status).toBe('approved');
    expect(approved.approval_history).toHaveLength(1);
    expect(approved.approval_history[0]).toMatchObject({by: 'r4_admin', scope: {description: 'Draft public synthetic material', environment: 'Owned synthetic workspace', permitted_data_types: ['Public']}});
    const changed = (await api.patch('/ai_systems/' + created.ai_system_id, {description: 'A changed synthetic use', expected_updated_at: approved.updated_at})).data;
    expect(changed.approval_status).toBe('pending_assessment');
    expect(changed.approval_history).toEqual(approved.approval_history);
    const before = sessionStorage.getItem(STORE_KEY);
    await expect(api.post(`/ai_systems/${created.ai_system_id}/material-change`, {note: 'Stale material-change intent', expected_updated_at: approved.updated_at}))
      .rejects.toMatchObject({response: {status: 409}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
    const loaded = (await axios.create({adapter: previewAdapter}).get('/ai_systems', {params: {client_id: CLIENT}})).data;
    expect(loaded.find(row => row.ai_system_id === created.ai_system_id).approval_history).toEqual(approved.approval_history);
    expect(readStore().reviews).toHaveLength(0);
    expect(readStore().risks).toHaveLength(0);
    expect(readStore().vendors).toHaveLength(0);
    expect(readStore().tasks).toHaveLength(2);
  }
);

test('AI approval remains restricted to an actual scoped internal account', async () => {
  const created = (await api.post('/ai_systems', {client_id: CLIENT, name: 'Synthetic scoped AI', environment: 'Synthetic environment',
    description: 'Public synthetic drafting', permitted_data_types: ['Public']},
  {headers: {'Idempotency-Key': 'r4-scoped-ai-create-0001'}})).data;
  for (const id of ['manager', 'reader', 'foreign_admin']) {
    asUser(id);
    const before = sessionStorage.getItem(STORE_KEY);
    await expect(api.post(`/ai_systems/${created.ai_system_id}/approval`, {status: 'approved', note: 'Unpermitted decision', expected_updated_at: created.updated_at}))
      .rejects.toMatchObject({response: {status: 403}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
  expect(readStore().ai_systems.find(row => row.ai_system_id === created.ai_system_id).approval_status).toBe('pending_assessment');
});

test('provider service setup keeps provisional criticality until an authorized deliberate confirmation', async () => {
  const context = (await api.get(`/clients/${CLIENT}/services`)).data;
  const body = {expected_updated_at: context.updated_at, areas: {endpoint: {responsibility: 'iv', tool_ids: []}}};
  const config = {headers: {'Idempotency-Key': 'r4-provider-services-000001'}};
  await api.post(`/clients/${CLIENT}/services`, body, config);
  const providerId = 'vnd_services_r4_native_a_iventure_solutions';
  const provider = (await api.get('/vendors/' + providerId)).data;
  expect(provider).toMatchObject({vendor_id: providerId, client_id: CLIENT, name: 'iVenture Solutions',
    criticality: 'critical', criticality_provisional: true, status: 'onboarding', assurance_required: false, assurance_records: []});
  expect(provider.source_services).toMatchObject({by: 'r4_admin', area_ids: ['endpoint']});
  expect(provider.source_services.qualification).toContain('Provisional conservative criticality.');
  expect(provider.criticality_confirmed_at).toBeUndefined();
  await api.post(`/clients/${CLIENT}/services`, body, config);
  expect(readStore().vendors).toHaveLength(1);
  const ordinary = (await api.patch('/vendors/' + providerId, {service: 'Retained manual provider service wording', expected_updated_at: provider.updated_at})).data;
  expect(ordinary.criticality_provisional).toBe(true);
  expect(ordinary.source_services).toEqual(provider.source_services);
  const before = sessionStorage.getItem(STORE_KEY);
  await expect(api.patch('/vendors/' + providerId, {criticality_provisional: false, expected_updated_at: ordinary.updated_at}))
    .rejects.toThrow('Vendor provenance is system-controlled');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  asUser('manager');
  await expect(api.patch('/vendors/' + providerId, {criticality: 'critical', confirm_criticality: true, expected_updated_at: ordinary.updated_at}))
    .rejects.toMatchObject({response: {status: 403}});
  asUser('r4_admin');
  const confirmed = (await api.patch('/vendors/' + providerId, {criticality: 'critical', confirm_criticality: true, expected_updated_at: ordinary.updated_at})).data;
  expect(confirmed).toMatchObject({criticality: 'critical', criticality_provisional: false, criticality_confirmed_by: 'r4_admin', service: 'Retained manual provider service wording'});
  expect(confirmed.criticality_confirmed_at).toEqual(expect.any(String));
  expect(confirmed.source_services).toEqual(provider.source_services);
  expect((await axios.create({adapter: previewAdapter}).get('/vendors/' + providerId)).data.criticality_confirmed_at).toBe(confirmed.criticality_confirmed_at);
  expect(readStore().reviews).toHaveLength(0);
  expect(readStore().vendors).toHaveLength(1);
});
