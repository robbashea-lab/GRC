import onboardingCatalog from '@catalogs/onboardingCatalog.json';
import * as store from '../store';
import * as approval from '../policyApproval';
import {action} from '../workflows';
import {guardEdit} from '../decisions';
import {saveBaseline, baselineRecordVersions} from '../baseline';
import {reviewDrivers} from '../../lib/frameworks';
import {occurrenceId, assertCurrentOccurrence, scheduledDate} from '../../lib/reviewOccurrences';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {createPrestigeCurrentRegisters} from './prestigeEightYearRegisters';
import {PRESTIGE_POLICY_DOCUMENT_FACTS, PRESTIGE_GOVERNANCE_REVIEW_FACTS, PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY,
  prestigeGovernanceOnboardingState, createPrestigeCurrentGovernance} from './prestigeCurrentGovernance';

const CID = 'demo_prestige', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const OPTIONS = {clock: CLOCK, purpose: 'current_governance_source_qa'}, MARKER = 'prestige_current_governance_fixture';
const copy = value => JSON.parse(JSON.stringify(value));
const owned = (db, kind) => db[kind].filter(row => row.client_id === CID);
const policyFor = (db, key) => owned(db, 'policies').find(row => row.baseline_key === key);
const reviewFor = (db, key) => owned(db, 'reviews').find(row => reviewDrivers(row).some(driver => driver.framework_plan_key === key));
let prepared, candidate, sourceBefore, started, finished;

beforeAll(async () => {
  prepared = preparePrestigeNativeOnboarding(store.buildLegacyDemoStore(CLOCK), {clock: CLOCK, purpose: 'native_onboarding_qa'});
  saveBaseline(prepared.db, CID, prestigeGovernanceOnboardingState(), true, {
    expected_updated_at: prepared.db.baselines?.[CID]?.updated_at ?? null,
    expected_records: baselineRecordVersions(prepared.db, CID)});
  sourceBefore = JSON.stringify(prepared);
  started = Date.now();
  candidate = await createPrestigeCurrentGovernance(prepared, OPTIONS);
  finished = Date.now();
});

afterEach(() => { jest.restoreAllMocks(); });

test('the explicit native input selects only the approved 16 Policies and eight SOC Review configurations', () => {
  const state = prestigeGovernanceOnboardingState();
  expect(state.selected_policy_keys).toHaveLength(16);
  expect(new Set(state.selected_policy_keys).size).toBe(16);
  expect(state.selected_policy_keys).not.toContain('policy-acceptable-use-policy');
  expect(state.policies).toEqual(Object.fromEntries(state.selected_policy_keys.map(key => [key, 'yes'])));
  expect(state.reviews).toEqual([]);
  expect(state).not.toHaveProperty('framework_settings');
  expect(Object.keys(state.framework_reviews)).toHaveLength(8);
  expect(Object.values(state.framework_reviews).filter(row => row.recurrence === 'annual')).toHaveLength(7);
  expect(state.framework_reviews['soc-user-access']).toEqual({enabled: true, recurrence: 'quarterly', due_date: '2027-02-02'});
  expect(state.requirements).toEqual(Object.fromEntries(onboardingCatalog.requirements.map(item => [item.key, item.key === 'soc-2' ? 'applies' : 'does_not_apply'])));
  expect(owned(prepared.db, 'policies')).toHaveLength(16);
  expect(owned(prepared.db, 'policies').every(row => row.presence === 'reported_existing' && row.status === 'needs_verification')).toBe(true);
  expect(owned(prepared.db, 'reviews')).toHaveLength(8);
  expect(owned(prepared.db, 'framework_assessments')).toHaveLength(38);
  state.selected_policy_keys.pop(); state.framework_reviews['soc-user-access'].due_date = '2030-01-01';
  expect(prestigeGovernanceOnboardingState().selected_policy_keys).toHaveLength(16);
  expect(prestigeGovernanceOnboardingState().framework_reviews['soc-user-access'].due_date).toBe('2027-02-02');
});

test.each(PRESTIGE_POLICY_DOCUMENT_FACTS.map(fact => [fact.key, fact]))('%s records an external current subject with distinct business Contact and actual platform provenance', (_key, fact) => {
  const db = candidate.db, policy = policyFor(db, fact.key), original = policyFor(prepared.db, fact.key);
  const owner = db.users.find(row => row.user_id === policy.owner_id), robert = db.contacts.find(row => row.client_id === CID && row.name === 'Robert Doback');
  expect(policy.policy_id).toBe(original.policy_id);
  expect(policy.title).toBe(original.title);
  expect(policy.baseline_key).toBe(fact.key);
  expect(policy).toMatchObject({version: fact.version, presence: 'verified_existing', status: 'approved', approved_at: fact.approved_at,
    owner_id: 'demo_prestige_user_' + ({grc: 0, executive: 1, engineering: 2}[fact.owner]), approver_contact_id: robert.contact_id,
    approval_account_id: null, verified_by: db.user.user_id, next_review_date: '2027-11-02'});
  expect(owner.status).toBe('active');
  expect(policy.summary).toContain(fact.summary);
  expect(policy.summary).toContain(fact.effective_date);
  expect(policy.created_at).toBe(original.created_at);
  expect(policy.created_by).toBe(original.created_by);
  expect(policy.approval_source).toEqual({version: fact.version, external_reference: fact.external_reference, external_version: fact.external_version});
  expect(policy.approval_subject).toMatchObject({policy_id: policy.policy_id, client_id: CID, title: policy.title, version: fact.version,
    owner_id: policy.owner_id, named_approver: {contact_id: robert.contact_id, name: 'Robert Doback'},
    basis: {type: 'external', reference: fact.external_reference, document_version: fact.external_version,
      verification: 'Reference recorded; external bytes not verified'}});
  expect(policy.approval_subject.basis).not.toHaveProperty('sha256');
  expect(policy.approval_subject.basis).not.toHaveProperty('evidence_id');
  expect(policy.approval_history.map(row => row.action)).toEqual(['authority_updated', 'approval_basis_updated']);
  expect(policy.approval_history.every(row => row.by === db.user.user_id && row.by_name === db.user.name)).toBe(true);
  expect(policy.decision_history).toHaveLength(1);
  expect(policy.decision_history[0]).toMatchObject({action: 'external_approval_recorded', recorded_by: db.user.user_id,
    recorded_by_name: db.user.name, reported_approved_at: fact.approved_at, provenance: 'Verified metadata; not an in-app approval', subject: policy.approval_subject});
  expect(policy.decision_history[0].recorded_by).not.toBe(robert.contact_id);
  expect(policy.approver_id).toBeUndefined();
  expect(policy).not.toHaveProperty('approval_request_id');
  for (const timestamp of [policy.verified_at, policy.approval_subject.captured_at, policy.decision_history[0].recorded_at]) {
    expect(Date.parse(timestamp)).toBeGreaterThanOrEqual(started);
    expect(Date.parse(timestamp)).toBeLessThanOrEqual(finished);
  }
  expect(policy.approved_at < '2026-11-02T00:00:00.000Z').toBe(true);
  expect(scheduledDate(fact.effective_date)).not.toBeNull();
  expect(fact.approved_at.slice(0, 10) <= fact.effective_date && fact.effective_date <= '2026-11-02').toBe(true);
});

test.each(PRESTIGE_GOVERNANCE_REVIEW_FACTS.map(fact => [fact.plan_key, fact]))('%s configures the same native parent without completing or replacing its occurrence', (_key, fact) => {
  const review = reviewFor(candidate.db, fact.plan_key), original = reviewFor(prepared.db, fact.plan_key);
  expect(review).toMatchObject({review_id: original.review_id, title: original.title, status: 'upcoming', due_date: fact.due_date,
    recurrence: fact.recurrence, owner_id: 'demo_prestige_user_' + ({grc: 0, executive: 1, engineering: 2}[fact.owner])});
  expect(reviewDrivers(review)).toEqual(reviewDrivers(original));
  expect(occurrenceId(review)).toBe(occurrenceId(original));
  expect(review.occurrences || []).toEqual(original.occurrences || []);
  expect(review.created_at).toBe(original.created_at);
  expect(review.created_by).toBe(original.created_by);
  expect(review.completion_date || null).toBeNull();
  expect(review.next_review_date.slice(0, 10)).toBe(fact.recurrence === 'quarterly' ? '2027-05-02' : fact.due_date.replace('2027', '2028'));
  expect(review.notes).toContain(fact.notes);
  expect(review.notes).toContain('Management-selected operating cadence');
});

test('the manifest explicitly declares new fictional document facts and preserves the limited known historical facts', () => {
  expect(candidate.manifest.authored_document_facts).toHaveLength(16);
  for (const fact of candidate.manifest.authored_document_facts) {
    const declared = PRESTIGE_POLICY_DOCUMENT_FACTS.find(row => row.document_id === fact.document_id);
    expect(fact.source).toBe('newly_authored_fictional_current_document');
    expect(fact.external_bytes_verified).toBe(false);
    expect(fact.named_business_approver).toEqual({contact_id: 'demo_prestige_contact_1', name: 'Robert Doback'});
    expect(fact.policy_id).toBe(policyFor(candidate.db, declared.key).policy_id);
    expect(fact).toMatchObject({version: declared.version, reported_approved_at: declared.approved_at, effective_date: declared.effective_date});
  }
  expect(candidate.manifest.provenance).toContain('newly authored fictional scenario data');
  expect(candidate.manifest.historical_fact_boundary).toEqual(PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY);
  expect(PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY[0]).toMatchObject({date: '2018-11-02', version: '1', document_reference: null});
  expect(PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY[1]).toMatchObject({year: 2022, date: null, version: null, document_reference: null});
  expect(candidate.db[MARKER]).not.toHaveProperty('authored_document_facts');
});

test('input, accounts, Contacts, baseline provenance, 38 assessments and every non-governance record remain exact', () => {
  expect(JSON.stringify(prepared)).toBe(sourceBefore);
  expect(candidate.backup).toEqual(prepared.db);
  expect(candidate.backup).not.toBe(prepared.db);
  expect(candidate.backup).not.toBe(candidate.db);
  expect(candidate.backup.clients[0]).not.toBe(prepared.db.clients[0]);
  expect(candidate.backup.clients[0]).not.toBe(candidate.db.clients[0]);
  for (const [key, value] of Object.entries(prepared.db)) {
    if (!['policies', 'reviews', 'logs', MARKER].includes(key)) expect(candidate.db[key]).toEqual(value);
  }
  for (const kind of ['policies', 'reviews', 'logs']) expect(candidate.db[kind].filter(row => row.client_id !== CID))
    .toEqual(prepared.db[kind].filter(row => row.client_id !== CID));
  expect(candidate.db.evidence).toEqual(prepared.db.evidence);
  expect(candidate.db.clients.find(row => row.client_id === CID).initial_program_baseline)
    .toEqual(prepared.db.clients.find(row => row.client_id === CID).initial_program_baseline);
  expect(owned(candidate.db, 'reviews')).toHaveLength(8);
  expect(owned(candidate.db, 'reviews').some(row => row.occurrences?.length || row.status === 'completed')).toBe(false);
});

test('an exact retry runs no further native commands and returned stores do not share mutable records', async () => {
  const input = {...prepared, db: copy(candidate.db)}, before = JSON.stringify(input);
  const result = await createPrestigeCurrentGovernance(input, OPTIONS);
  expect(result.db).toEqual(candidate.db);
  expect(result.manifest).toEqual(candidate.manifest);
  expect(JSON.stringify(input)).toBe(before);
  result.db.policies[0].title = 'Changed returned clone';
  expect(input.db.policies[0].title).not.toBe('Changed returned clone');
  expect(result.backup.policies[0].title).not.toBe('Changed returned clone');
});

test.each([
  ['wrong source client', value => { value.clientId = 'demo_dunder'; }],
  ['missing envelope backup', value => { delete value.backup; }],
  ['wrong source anchor', value => { value.anchor = '2026-11-04T00:00:00.000Z'; }],
  ['ordinary environment', value => { value.db.clients.find(row => row.client_id === CID).environment = 'Production'; }],
  ['archived client', value => { value.db.clients.find(row => row.client_id === CID).archived = true; }],
  ['disabled actor', value => { value.db.user.status = 'inactive'; }],
  ['client actor', value => { value.db.user.role = 'client_grc_manager'; }],
  ['forged business actor label', value => { value.db.user.name = 'Robert Doback'; }],
  ['disabled account owner', value => { value.db.users.find(row => row.user_id === 'demo_prestige_user_0').status = 'inactive'; }],
  ['readonly operational owner', value => { value.db.users.find(row => row.user_id === 'demo_prestige_user_2').role = 'client_readonly'; }],
  ['missing named Contact', value => { value.db.contacts = value.db.contacts.filter(row => row.contact_id !== 'demo_prestige_contact_1'); }],
  ['uncompleted baseline', value => { value.db.baselines[CID].completed = false; }],
  ['another enrolled program', value => { value.db.baselines[CID].requirements['iso-27001'] = 'applies'; }],
  ['changed selected policies', value => { value.db.baselines[CID].selected_policy_keys.pop(); }],
  ['missing criterion', value => { value.db.framework_assessments.splice(value.db.framework_assessments.findIndex(row => row.client_id === CID), 1); }],
  ['missing Policy', value => { value.db.policies.splice(value.db.policies.findIndex(row => row.client_id === CID), 1); }],
  ['ambiguous Policy', value => { const row = copy(owned(value.db, 'policies')[0]); row.policy_id += '_duplicate'; value.db.policies.push(row); }],
  ['missing Review', value => { value.db.reviews.splice(value.db.reviews.findIndex(row => row.client_id === CID), 1); }],
  ['ambiguous Review', value => { const row = copy(owned(value.db, 'reviews')[0]); row.review_id += '_duplicate'; value.db.reviews.push(row); }],
  ['in-progress Review', value => { owned(value.db, 'reviews')[0].status = 'in_progress'; }],
  ['terminal Review', value => { owned(value.db, 'reviews')[0].status = 'cancelled'; }],
])('%s is rejected without mutating the caller or protected data', async (_name, change) => {
  const value = copy(prepared); change(value); const before = JSON.stringify(value);
  await expect(createPrestigeCurrentGovernance(value, OPTIONS)).rejects.toThrow(/Prestige current governance fixture/);
  expect(JSON.stringify(value)).toBe(before);
});

test('a missing purpose or a drifting source day never installs the current cohort', async () => {
  await expect(createPrestigeCurrentGovernance(prepared, {clock: CLOCK})).rejects.toThrow(/explicit prepared source envelope/);
  await expect(createPrestigeCurrentGovernance(prepared, {...OPTIONS, clock: new Date('2026-11-04T12:00:00Z')})).rejects.toThrow(/frozen source day/);
  expect(JSON.stringify(prepared)).toBe(sourceBefore);
});

test('existing approval subjects and history are retained by refusing to replace that source cohort', async () => {
  const value = {...prepared, db: copy(candidate.db)}; delete value.db[MARKER];
  const original = copy(owned(value.db, 'policies')[0]), before = JSON.stringify(value);
  await expect(createPrestigeCurrentGovernance(value, OPTIONS)).rejects.toThrow(/retain existing Policy decisions/);
  expect(JSON.stringify(value)).toBe(before);
  expect(owned(value.db, 'policies')[0]).toEqual(original);
});

test.each(['subject', 'receipt'])('a changed %s rejects replay rather than rewriting native provenance', async mode => {
  const value = {...prepared, db: copy(candidate.db)};
  if (mode === 'subject') owned(value.db, 'policies')[0].summary += ' Changed source';
  else value.db[MARKER].actor_id = 'demo_prestige_user_1';
  const before = JSON.stringify(value);
  await expect(createPrestigeCurrentGovernance(value, OPTIONS)).rejects.toThrow(/mismatched retry/);
  expect(JSON.stringify(value)).toBe(before);
});

test('a late native subject failure publishes no partial Policy verifications or source mutations', async () => {
  const value = copy(prepared), last = policyFor(value.db, PRESTIGE_POLICY_DOCUMENT_FACTS[15].key).policy_id;
  const before = JSON.stringify(value), native = approval.policyApprovalRequest;
  jest.spyOn(approval, 'policyApprovalRequest').mockImplementation((...args) => {
    if (args[1] === '/policies/' + last + '/approval-subject') throw new Error('Controlled late subject conflict');
    return native(...args);
  });
  await expect(createPrestigeCurrentGovernance(value, OPTIONS)).rejects.toThrow(/Controlled late subject conflict/);
  expect(JSON.stringify(value)).toBe(before);
  expect(owned(value.db, 'policies').every(row => row.status === 'needs_verification')).toBe(true);
});

test('native stale versions, wrong-client Contacts and mismatched external basis remain rejected without changing a Policy', () => {
  const db = copy(candidate.db), policy = owned(db, 'policies')[0], before = JSON.stringify(db);
  expect(() => approval.policyApprovalRequest(db, '/policies/' + policy.policy_id + '/approval-authority', 'post', {},
    {approver_contact_id: policy.approver_contact_id, expected_updated_at: 'stale'})).toThrow(/changed since/);
  expect(() => approval.policyApprovalRequest(db, '/policies/' + policy.policy_id + '/approval-authority', 'post', {},
    {approver_contact_id: db.contacts.find(row => row.client_id !== CID).contact_id, expected_updated_at: policy.updated_at})).toThrow(/Contact from this client/);
  expect(() => approval.policyApprovalRequest(db, '/policies/' + policy.policy_id + '/approval-subject', 'post', {},
    {version: policy.version, external_reference: 'Controlled reference', expected_updated_at: policy.updated_at})).toThrow(/document\/version identifier/);
  expect(JSON.stringify(db)).toBe(before);
});

test('native Review edit guards retain occurrence, version, role and derived-history boundaries', () => {
  const db = copy(candidate.db), review = reviewFor(db, 'soc-user-access'), before = JSON.stringify(db);
  expect(() => assertCurrentOccurrence(review, 'stale-occurrence')).toThrow(/closed or has changed/);
  expect(() => store.write(db, 'reviews', {due_date: '2027-03-02', expected_updated_at: 'stale'}, review.review_id)).toThrow(/changed since/);
  expect(() => guardEdit('reviews', {due_date: '2027-02-30'}, review, db.user, db)).toThrow(/Invalid due date/);
  expect(() => guardEdit('reviews', {due_date: '2027-03-02'}, review, {...db.user, role: 'client_grc_manager'}, db)).toThrow(/Only platform administrators/);
  expect(() => guardEdit('reviews', {occurrences: [{occurrence_id: 'forged'}]}, review, db.user, db)).toThrow(/history fields/);
  expect(() => guardEdit('reviews', {framework_plan_key: 'other'}, review, db.user, db)).toThrow(/Framework relationships/);
  expect(JSON.stringify(db)).toBe(before);
});

test('configuring an ongoing parent retains a real native completed occurrence and its original dates, actor and result', async () => {
  const value = copy(prepared), review = reviewFor(value.db, 'soc-user-access');
  store.write(value.db, 'reviews', {due_date: '2026-10-20', expected_updated_at: review.updated_at}, review.review_id);
  action(value.db, 'reviews', review.review_id, 'start', {occurrence_id: occurrenceId(review)});
  const completed = action(value.db, 'reviews', review.review_id, 'complete', {occurrence_id: occurrenceId(review), completion_notes: 'Controlled current native completion; not eight-year source history.'});
  const original = copy(completed.occurrence), id = completed.review.review_id, current = occurrenceId(store.record(value.db, 'reviews', id));
  const result = await createPrestigeCurrentGovernance(value, OPTIONS), saved = store.record(result.db, 'reviews', id);
  expect(saved.occurrences).toEqual([original]);
  expect(saved.occurrences[0].due_date).toBe('2026-10-20');
  expect(saved.occurrences[0].completed_by).toBe(value.db.user.user_id);
  expect(occurrenceId(saved)).toBe(current);
  expect(saved.due_date).toBe('2027-02-02');
  expect(saved.status).toBe('upcoming');
});

test('current Governance composes with native Registers without modifying either cohort or manufacturing approval/completion', async () => {
  const governance = copy(candidate.db), assembled = await createPrestigeCurrentRegisters({...prepared, db: governance},
    {clock: CLOCK, purpose: 'current_register_source_qa'});
  expect(owned(assembled.db, 'policies')).toEqual(owned(candidate.db, 'policies'));
  for (const fact of PRESTIGE_GOVERNANCE_REVIEW_FACTS) expect(reviewFor(assembled.db, fact.plan_key)).toEqual(reviewFor(candidate.db, fact.plan_key));
  expect(owned(assembled.db, 'vendors')).toHaveLength(23);
  expect(owned(assembled.db, 'risks')).toHaveLength(30);
  expect(owned(assembled.db, 'ai_systems')).toHaveLength(4);
  expect(owned(assembled.db, 'ai_systems').every(row => row.approval_status === 'pending_assessment' && !row.approval_history?.length)).toBe(true);
  expect(owned(assembled.db, 'reviews').every(row => row.status !== 'completed' && !row.occurrences?.length)).toBe(true);
  const replay = await createPrestigeCurrentGovernance({...prepared, db: assembled.db}, OPTIONS);
  expect(replay.db).toEqual(assembled.db);
  expect(replay.manifest).toEqual(candidate.manifest);
  expect(governance).toEqual(candidate.db);
});

test('foreign native log_id-only history survives in the caller, backup, candidate and exact retry without alias backfill', async () => {
  const value = copy(prepared), legacy = value.db.logs.find(row => row.client_id !== CID);
  legacy.log_id = legacy.audit_id || legacy.log_id;
  delete legacy.audit_id;
  const before = JSON.stringify(value), retained = JSON.stringify(legacy);
  const foreign = value.db.logs.filter(row => row.client_id !== CID);
  const result = await createPrestigeCurrentGovernance(value, OPTIONS);
  expect(JSON.stringify(value)).toBe(before);
  expect(result.backup).toEqual(value.db);
  expect(result.db.logs.filter(row => row.client_id !== CID)).toEqual(foreign);
  const saved = result.db.logs.find(row => row.log_id === legacy.log_id);
  expect(JSON.stringify(saved)).toBe(retained);
  expect(saved).not.toHaveProperty('audit_id');
  expect(owned(result.db, 'policies')).toHaveLength(16);
  expect(owned(result.db, 'policies').every(row => row.status === 'approved')).toBe(true);
  const replay = await createPrestigeCurrentGovernance({...value, db: result.db}, OPTIONS);
  expect(replay.db).toEqual(result.db);
  expect(JSON.stringify(replay.db.logs.find(row => row.log_id === legacy.log_id))).toBe(retained);
});

test.each(['equal', 'distinct'])('%s native audit_id/log_id aliases within one retained row remain unchanged and valid', async mode => {
  const value = copy(prepared), row = value.db.logs.find(item => item.client_id !== CID);
  row.audit_id = row.audit_id || row.log_id;
  row.log_id = mode === 'equal' ? row.audit_id : row.audit_id + '_retained_secondary_alias';
  const retained = JSON.stringify(row), before = JSON.stringify(value);
  const result = await createPrestigeCurrentGovernance(value, OPTIONS);
  expect(JSON.stringify(value)).toBe(before);
  expect(JSON.stringify(result.db.logs.find(item => item.audit_id === row.audit_id))).toBe(retained);
  expect(result.backup).toEqual(value.db);
});

test.each([
  ['audit_id/audit_id', (first, second) => { second.audit_id = first.audit_id; }],
  ['log_id/log_id', (first, second) => { first.log_id = first.audit_id; delete first.audit_id; second.log_id = first.log_id; delete second.audit_id; }],
  ['audit_id/log_id', (first, second) => { second.log_id = first.audit_id; delete second.audit_id; }],
  ['secondary log_id/audit_id', (first, second) => { first.log_id = first.audit_id + '_retained_secondary_alias'; second.audit_id = first.log_id; }],
  ['secondary audit_id/log_id', (first, second) => { first.log_id = first.audit_id; first.audit_id += '_retained_secondary_alias'; second.log_id = first.audit_id; delete second.audit_id; }],
])('duplicate %s identities reject atomically instead of normalizing or rewriting retained logs', async (_name, change) => {
  const value = copy(prepared), [first, second] = value.db.logs.filter(row => row.client_id !== CID);
  for (const row of [first, second]) { row.audit_id = row.audit_id || row.log_id; delete row.log_id; }
  change(first, second);
  const before = JSON.stringify(value), nativeWrite = jest.spyOn(store, 'write');
  await expect(createPrestigeCurrentGovernance(value, OPTIONS)).rejects.toThrow(/duplicate or invalid native logs identity/);
  expect(JSON.stringify(value)).toBe(before);
  expect(nativeWrite).not.toHaveBeenCalled();
});

test.each([
  ['missing both aliases', row => { delete row.audit_id; delete row.log_id; }],
  ['non-string secondary alias', row => { row.audit_id = row.audit_id || row.log_id; row.log_id = 123; }],
])('%s remains an invalid log identity and rejects without native writes', async (_name, change) => {
  const value = copy(prepared), row = value.db.logs.find(item => item.client_id !== CID);
  change(row);
  const before = JSON.stringify(value), nativeWrite = jest.spyOn(store, 'write');
  await expect(createPrestigeCurrentGovernance(value, OPTIONS)).rejects.toThrow(/duplicate or invalid native logs identity/);
  expect(JSON.stringify(value)).toBe(before);
  expect(nativeWrite).not.toHaveBeenCalled();
});
