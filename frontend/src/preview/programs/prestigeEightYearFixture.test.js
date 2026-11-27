import crypto from 'crypto';
import {stable} from '../commandRequests';
import {fixtureFingerprint} from '../cisDemoHistoryContext';
import {installPrestigeEightYearFixture, materializePrestigeEightYearFixture} from './prestigeEightYearFixture';

const CID = 'demo_prestige', FOREIGN = 'demo_other';
const ADMIN = 'loader-admin', OWNER = 'loader-owner', FOREIGN_USER = 'foreign-user';
const ANCHOR = '2026-11-02T00:00:00.000Z', VERSION = 'prestige-eight-year-v1';
const CLOCK = '2026-11-07T15:00:00.000Z';
const copy = value => JSON.parse(JSON.stringify(value));
const KEYS = {
  organizational_controls: 'control_id', framework_assessments: 'framework_assessment_id',
  ai_systems: 'ai_system_id', reviews: 'review_id', findings: 'finding_id', risks: 'risk_id',
  policies: 'policy_id', vendors: 'vendor_id', assets: 'asset_id', tasks: 'task_id',
  exceptions: 'exception_id', requirements: 'requirement_id', evidence: 'evidence_id',
  assessments: 'assessment_id', comments: 'comment_id', logs: 'audit_id', notifications: 'notification_id',
};
const COUNTS = {framework_assessments: 38, policies: 16, vendors: 23, risks: 31,
  ai_systems: 4, organizational_controls: 25, reviews: 103};
const REQUESTS = ['create_requests', 'vendor_action_requests', 'command_requests'];
const GUIDED = ['guided_assessment_pilot', 'guided_assessment_history'];
const REPORTING = ['snapshots', 'identities', 'scope_events', 'source_refresh_proofs'];
const owned = (db, kind) => db[kind].filter(row => row.client_id === CID);
const firstId = kind => 'fixture-' + kind + '-1';
const scope = JSON.stringify([OWNER, CID, 'loader-request']);
const guidedKey = firstId('framework_assessments') + ':' + OWNER;
function declareForeignUser(payload) {
  payload.required_users.push({user_id: FOREIGN_USER, role: 'client_contributor', status: 'active', client_access: false});
  payload.required_users.sort((a, b) => a.user_id.localeCompare(b.user_id));
}

function sourceSeed() {
  const user = {user_id: ADMIN, name: 'Retained administrator', email: 'admin@example.invalid',
    workspace_mode: 'demo', role: 'super_admin', status: 'active', client_ids: []};
  const source = {
    user, users: [copy(user), {user_id: OWNER, role: 'client_contributor', status: 'active', client_ids: [CID]},
      {user_id: FOREIGN_USER, role: 'client_contributor', status: 'active', client_ids: [FOREIGN]}],
    clients: [{client_id: CID, name: 'Retained Prestige identity', environment: 'Demo', status: 'active',
      primary_contact_id: 'contact-1', notes: 'Old owned notes',
      framework_settings: {'soc-2': {categories: ['security', 'availability', 'confidentiality']},
        'iso-27001': {retained_setting: true}}},
    {client_id: FOREIGN, name: 'Other client', environment: 'Demo', status: 'active'}],
    contacts: [...Array.from({length: 6}, (_, i) => ({contact_id: 'contact-' + (i + 1),
      client_id: CID, status: 'active', linked_user_id: i === 0 ? OWNER : null})),
    {contact_id: 'foreign-contact', client_id: FOREIGN, status: 'active', linked_user_id: FOREIGN_USER}],
    caller_clock: CLOCK, unrelated_receipt: {client_id: FOREIGN, nested: ['preserve exactly']},
    baselines: {[CID]: {completed: true, requirements: {'soc-2': 'applies'}},
      [FOREIGN]: {completed: true, requirements: {'iso-27001': 'applies'}}},
    drafts: {[CID]: {old: true}, [FOREIGN]: {keep: true}},
    ai_intake: {[CID]: {old: true}, [FOREIGN]: {keep: true}},
    ai_counters: {[CID]: 99, [FOREIGN]: 7}, riskSequences: {[CID]: 99, [FOREIGN]: 8},
    portfolio_reporting: {activity_proofs: {'old-risks': {client_id: CID},
      'foreign-risks': {client_id: FOREIGN, unchanged: true}}},
  };
  for (const [kind, key] of Object.entries(KEYS)) {
    source[kind] = [{[key]: 'old-' + kind, client_id: CID}, {[key]: 'foreign-' + kind, client_id: FOREIGN}];
    if (kind === 'framework_assessments') source[kind][0].framework_key = 'soc-2';
  }
  source.logs[1].log_id = 'foreign-log-alias';
  for (const key of REQUESTS) source[key] = {
    [JSON.stringify([OWNER, CID, 'old'])]: {client_id: CID},
    [JSON.stringify([FOREIGN_USER, FOREIGN, 'retained'])]: {client_id: FOREIGN, retained: true},
  };
  for (const key of GUIDED) source[key] = {
    ['old-framework_assessments:' + OWNER]: {client_id: CID, assessment_id: 'old-framework_assessments', user_id: OWNER},
    ['foreign-framework_assessments:' + FOREIGN_USER]: {client_id: FOREIGN,
      assessment_id: 'foreign-framework_assessments', user_id: FOREIGN_USER, retained: true},
  };
  for (const key of REPORTING) source.portfolio_reporting[key] = [
    {client_id: CID, program_id: CID + ':soc-2', label: 'old-owned'},
    {client_id: FOREIGN, program_id: FOREIGN + ':iso-27001', label: 'retained-foreign'},
  ];
  return source;
}

// Loader-only data: complete cardinalities and native ownership shapes, not a qualified business scenario.
// No onboarding/current-model/history generator is mocked or claimed to have run by these tests.
function loaderOnlyCandidate(source) {
  const db = copy(source);
  for (const [kind, key] of Object.entries(KEYS)) {
    db[kind] = [...db[kind].filter(row => row.client_id !== CID),
      ...Array.from({length: COUNTS[kind] || 1}, (_, i) => ({[key]: 'fixture-' + kind + '-' + (i + 1), client_id: CID}))];
  }
  for (const row of owned(db, 'framework_assessments')) Object.assign(row, {framework_key: 'soc-2',
    definition_id: 'loader-criterion-' + row.framework_assessment_id, owner_id: OWNER, process_owner_id: 'contact-1'});
  for (const kind of ['policies', 'risks', 'findings', 'assets', 'requirements', 'exceptions'])
    for (const row of owned(db, kind)) row.owner_id = OWNER;
  for (const [i, row] of owned(db, 'risks').entries()) row.display_id = 'RISK-' + String(i + 1).padStart(3, '0');
  for (const [i, row] of owned(db, 'ai_systems').entries()) Object.assign(row, {
    display_id: 'AI-' + String(i + 1).padStart(3, '0'), owner_id: OWNER,
    technical_owner_id: OWNER, oversight_owner_id: OWNER});
  for (const row of owned(db, 'reviews')) Object.assign(row, {owner_id: OWNER, reviewer_id: OWNER});
  for (const row of owned(db, 'vendors')) row.business_owner_id = OWNER;
  owned(db, 'tasks')[0].assignee_id = OWNER;
  Object.assign(owned(db, 'logs')[0], {log_id: 'fixture-log-alias', by: ADMIN});
  Object.assign(db.clients.find(row => row.client_id === CID), {notes: 'Materialized owned narrative',
    profile: {business_description: 'Fictional loader test'}, initial_program_baseline: {version: 3},
    onboarding_baseline: {completed: true}});
  db.baselines[CID] = {completed: true, requirements: {'soc-2': 'applies'}, selected_policy_keys: ['loader-policy']};
  db.drafts[CID] = {step: 2}; db.ai_intake[CID] = {approved: true};
  db.riskSequences[CID] = 31; db.ai_counters[CID] = 4;
  for (const key of REQUESTS) db[key] = {
    ...Object.fromEntries(Object.entries(db[key]).filter(([, row]) => row.client_id !== CID)),
    [scope]: {client_id: CID, record_id: firstId('tasks')},
  };
  for (const key of GUIDED) db[key] = Object.fromEntries(Object.entries(db[key]).filter(([, row]) => row.client_id !== CID));
  const context = {client_id: CID, assessment_id: firstId('framework_assessments'), user_id: OWNER,
    revision: 1, base_scope_fingerprint: 'a'.repeat(64), answers: {loader_question: 'yes'}};
  db.guided_assessment_pilot[guidedKey] = context;
  db.guided_assessment_history[guidedKey + ':1'] = copy(context);
  for (const key of REPORTING) db.portfolio_reporting[key] = [
    ...db.portfolio_reporting[key].filter(row => row.client_id !== CID),
    {client_id: CID, program_id: CID + ':soc-2', label: 'materialized-owned', source_records: [{source_id: firstId('risks')}]},
  ];
  delete db.portfolio_reporting.activity_proofs['old-risks'];
  db.portfolio_reporting.activity_proofs[firstId('risks')] = {client_id: CID, source_id: firstId('risks')};
  return {db, backup: copy(source), clientId: CID, anchor: ANCHOR,
    scenarioManifest: {client_id: CID, status: 'source_complete', test_purpose: 'loader_contract_only'}};
}

let source, candidate, fixture;
beforeAll(async () => {
  source = sourceSeed(); candidate = loaderOnlyCandidate(source);
  fixture = await materializePrestigeEightYearFixture(candidate);
});
const install = (db = copy(source), bundle = copy(fixture), options = {}) =>
  installPrestigeEightYearFixture(db, bundle, {fresh: true, clock: new Date(CLOCK), ...options});

test('materialization owns only the expanded Prestige slice and hashes the actual payload without mutation', async () => {
  const before = stable(candidate), result = await materializePrestigeEightYearFixture(candidate);
  expect(stable(candidate)).toBe(before);
  expect(result.payload_sha256).toBe(crypto.createHash('sha256').update(stable(result.payload), 'utf8').digest('hex'));
  expect(result.fingerprint).toBe(fixtureFingerprint(result.payload));
  expect(result.provenance).toEqual(candidate.scenarioManifest);
  for (const [kind, rows] of Object.entries(result.payload.collections)) {
    expect(rows).toEqual(owned(candidate.db, kind));
    expect(rows).not.toBe(candidate.db[kind]);
  }
  expect(result.payload.required_users.map(row => row.user_id).sort()).toEqual([ADMIN, OWNER].sort());
  expect(result.payload.required_contacts).toHaveLength(6);
  expect(Object.keys(result.payload.reporting.activity_proofs)).toEqual([firstId('risks')]);
  expect(result.payload.reporting.snapshots.every(row => row.client_id === CID)).toBe(true);
});

test('fresh installation replaces only owned records while preserving foreign data, identity and caller clock', () => {
  const input = copy(source), bundle = copy(fixture), before = stable(input), bundleBefore = stable(bundle);
  const clock = new Date(CLOCK), clockBefore = +clock;
  const result = install(input, bundle, {clock});
  expect(result.installed).toBe(true);
  expect(result.backup).toEqual(source);
  expect(result.backup).not.toBe(input);
  expect(stable(input)).toBe(before); expect(stable(bundle)).toBe(bundleBefore); expect(+clock).toBe(clockBefore);
  const db = result.db;
  expect(db).not.toBe(input);
  expect(db.user).toEqual(source.user); expect(db.users).toEqual(source.users); expect(db.contacts).toEqual(source.contacts);
  expect(db.clients.filter(row => row.client_id !== CID)).toEqual(source.clients.filter(row => row.client_id !== CID));
  expect(db.caller_clock).toBe(CLOCK); expect(db.unrelated_receipt).toEqual(source.unrelated_receipt);
  for (const kind of Object.keys(KEYS)) {
    expect(db[kind].filter(row => row.client_id !== CID)).toEqual(source[kind].filter(row => row.client_id !== CID));
    expect(owned(db, kind)).toEqual(bundle.payload.collections[kind]);
    expect(owned(db, kind).some(row => row[KEYS[kind]] === 'old-' + kind)).toBe(false);
  }
  const client = db.clients.find(row => row.client_id === CID);
  expect(client).toMatchObject({name: 'Retained Prestige identity', primary_contact_id: 'contact-1',
    notes: 'Materialized owned narrative', demo_program_version: VERSION,
    framework_settings: {'iso-27001': {retained_setting: true}}});
  expect(db.prestige_eight_year_fixture).toMatchObject({version: VERSION, client_id: CID, anchor: ANCHOR,
    fingerprint: bundle.fingerprint, generated_payload_sha256: bundle.payload_sha256});
  db.risks.find(row => row.client_id === CID).owner_id = 'changed-result-only';
  expect(stable(input)).toBe(before); expect(stable(bundle)).toBe(bundleBefore);
});

test('installation keeps complete counts, counters, native guided context and foreign map/reporting entries', () => {
  const {db} = install();
  for (const [kind, count] of Object.entries(COUNTS)) expect(owned(db, kind)).toHaveLength(count);
  expect(db.riskSequences).toEqual({[CID]: 31, [FOREIGN]: 8});
  expect(db.ai_counters).toEqual({[CID]: 4, [FOREIGN]: 7});
  for (const key of ['baselines', 'drafts', 'ai_intake']) {
    expect(db[key][CID]).toEqual(fixture.payload.maps[key]);
    expect(db[key][FOREIGN]).toEqual(source[key][FOREIGN]);
  }
  for (const key of [...REQUESTS, ...GUIDED]) {
    for (const [id, row] of Object.entries(fixture.payload.requests[key] || fixture.payload.guided[key])) expect(db[key][id]).toEqual(row);
    for (const [id, row] of Object.entries(source[key]).filter(([, value]) => value.client_id === FOREIGN)) expect(db[key][id]).toEqual(row);
  }
  expect(db.guided_assessment_pilot[guidedKey]).toMatchObject({assessment_id: firstId('framework_assessments'),
    user_id: OWNER, revision: 1, base_scope_fingerprint: 'a'.repeat(64)});
  for (const key of REPORTING) expect(db.portfolio_reporting[key].filter(row => row.client_id === FOREIGN))
    .toEqual(source.portfolio_reporting[key].filter(row => row.client_id === FOREIGN));
  expect(db.portfolio_reporting.activity_proofs['foreign-risks']).toEqual({client_id: FOREIGN, unchanged: true});
});

test('an installed seed retries as an exact no-op without allocating or migrating retained data', () => {
  const first = install(), before = stable(first.db);
  const retry = install(first.db);
  expect(retry).toEqual({db: first.db, installed: false});
  expect(retry.db).toBe(first.db); expect(stable(first.db)).toBe(before);
  const retained = install(first.db, null, {fresh: false});
  expect(retained.db).toBe(first.db); expect(retained.installed).toBe(false);
});

test.each([
  {name: 'retained visitor data', change: () => {}, options: {fresh: false}},
  {name: 'authenticated workspace', change: db => { db.user.workspace_mode = 'standard'; }},
  {name: 'new client identity', change: db => { db.clients[0].client_id = 'new-client'; }},
  {name: 'a seed before the scenario anchor', change: () => {}, options: {clock: new Date('2026-11-01T23:59:59.999Z')}},
])('$name is a no-op before the fixture is inspected', ({change, options}) => {
  const input = copy(source); change(input); const before = stable(input);
  expect(install(input, null, options)).toEqual({db: input, installed: false});
  expect(stable(input)).toBe(before);
});

test('fresh installation rejects an invalid clock or an inconsistent existing receipt without mutation', () => {
  const input = copy(source), before = stable(input);
  expect(() => install(input, fixture, {clock: new Date('invalid')})).toThrow(/valid fresh-seed clock/);
  input.prestige_eight_year_fixture = {version: 'unknown'};
  const withReceipt = stable(input);
  expect(() => install(input)).toThrow(/existing or inconsistent fixture receipt/);
  expect(stable(input)).toBe(withReceipt);
  delete input.prestige_eight_year_fixture; expect(stable(input)).toBe(before);
});

test('payload corruption without a new fingerprint is rejected before installation', () => {
  const bundle = copy(fixture); bundle.payload.client_patch.notes = 'corrupted';
  const input = copy(source), before = stable(input);
  expect(() => install(input, bundle)).toThrow(/bundled materialized fixture changed/);
  expect(stable(input)).toBe(before);
});

test.each([
  {name: 'an incomplete source-scenario receipt', change: value => { value.scenarioManifest.status = 'partial'; }, error: /complete source scenario/},
  {name: 'conflicting client/program reporting ownership', change: value => { value.db.portfolio_reporting.snapshots.at(-1).program_id = FOREIGN + ':soc-2'; }, error: /reporting ownership/},
  {name: 'pooled reporting instead of expanded source records', change: value => { value.db.portfolio_reporting.snapshots.at(-1).source_records = [{_portfolio_source_index: 0}]; }, error: /expanded reporting records/},
])('materialization rejects $name without mutating the source', async ({change, error}) => {
  const input = copy(candidate); change(input); const before = stable(input);
  await expect(materializePrestigeEightYearFixture(input)).rejects.toThrow(error);
  expect(stable(input)).toBe(before);
});

const semanticFailures = [
  {name: 'a foreign native record', mutate: (_db, p) => { p.collections.risks[0].client_id = FOREIGN; }, error: /foreign or missing risks identity/},
  {name: 'an incomplete criterion cohort', mutate: (_db, p) => { p.collections.framework_assessments.pop(); }, error: /complete native baseline/},
  {name: 'a regressed risk counter', mutate: (_db, p) => { p.maps.riskSequences = 30; }, error: /display identities and counters/},
  {name: 'a duplicated native display ID', mutate: (_db, p) => { p.collections.risks[1].display_id = p.collections.risks[0].display_id; }, error: /display identities and counters/},
  {name: 'a foreign request key', mutate: (_db, p) => { p.requests.create_requests[JSON.stringify([OWNER, FOREIGN, 'spoof'])] = {client_id: CID}; }, error: /request scope/},
  {name: 'nested foreign request ownership', mutate: (_db, p) => { p.requests.command_requests[scope].result = {client_id: FOREIGN}; }, error: /request scope/},
  {name: 'an ineligible request actor', mutate: (_db, p) => { p.requests.create_requests[JSON.stringify([FOREIGN_USER, CID, 'spoof'])] = {client_id: CID}; }, error: /request scope/},
  {name: 'a foreign guided assessment', mutate: (_db, p) => { p.guided.guided_assessment_pilot[guidedKey].assessment_id = 'foreign-framework_assessments'; }, error: /guided history scope/},
  {name: 'a foreign guided client', mutate: (_db, p) => { p.guided.guided_assessment_pilot[guidedKey].client_id = FOREIGN; }, error: /guided history scope/},
  {name: 'a guided pilot key with an actor-prefix suffix', mutate: (_db, p) => {
    p.guided.guided_assessment_pilot[guidedKey + '-spoof'] = p.guided.guided_assessment_pilot[guidedKey];
    delete p.guided.guided_assessment_pilot[guidedKey];
  }, error: /guided history scope/},
  {name: 'a guided history key with the wrong revision', mutate: (_db, p) => {
    p.guided.guided_assessment_history[guidedKey + ':2'] = p.guided.guided_assessment_history[guidedKey + ':1'];
    delete p.guided.guided_assessment_history[guidedKey + ':1'];
  }, error: /guided history scope/},
  {name: 'a foreign process-owner Contact', mutate: (_db, p) => { p.collections.framework_assessments[0].process_owner_id = 'foreign-contact'; }, error: /process.owner|Contact|contact/},
  {name: 'an ineligible AI technical-owner alias despite a truthful roster', mutate: (_db, p) => {
    p.collections.ai_systems[0].technical_owner_id = FOREIGN_USER; declareForeignUser(p);
  }, error: /active platform user/},
  {name: 'an ineligible Review reviewer alias despite a truthful roster', mutate: (_db, p) => {
    p.collections.reviews[0].reviewer_id = FOREIGN_USER; declareForeignUser(p);
  }, error: /active platform user/},
  {name: 'an audit alias colliding with a retained log ID', mutate: (_db, p) => { p.collections.logs[0].log_id = 'foreign-log-alias'; }, error: /duplicate, foreign or missing logs identity/},
  {name: 'conflicting reporting client and program', mutate: (_db, p) => { p.reporting.snapshots[0].program_id = FOREIGN + ':soc-2'; }, error: /foreign reporting/},
  {name: 'a global storage-pool reference', mutate: (_db, p) => { p.reporting.snapshots[0].nested = {_portfolio_source_index: 0}; }, error: /bundled materialized fixture changed/},
  {name: 'an activity proof for a foreign identity', mutate: (_db, p) => { p.reporting.activity_proofs['foreign-risks'] = {client_id: FOREIGN}; }, error: /activity proof ownership/},
  {name: 'nested foreign activity-proof ownership', mutate: (_db, p) => { p.reporting.activity_proofs[firstId('risks')].nested = {program_id: FOREIGN + ':soc-2'}; }, error: /activity proof ownership/},
  {name: 'an omitted recording-actor roster', mutate: (_db, p) => { p.required_users = []; }, error: /complete retained recording-actor roster/},
  {name: 'a missing declared recording role', mutate: (_db, p) => { delete p.required_users.find(row => row.user_id === OWNER).role; }, error: /complete retained recording-actor roster/},
  {name: 'a changed recording role', mutate: db => { db.users.find(row => row.user_id === OWNER).role = 'client_readonly'; }, error: /complete retained recording-actor roster/},
  {name: 'a missing recording actor', mutate: db => { db.users = db.users.filter(row => row.user_id !== OWNER); }, error: /complete retained recording-actor roster/},
  {name: 'a missing declared Contact status', mutate: (_db, p) => { delete p.required_contacts[0].status; }, error: /business Contact/},
  {name: 'a missing business Contact', mutate: db => { db.contacts = db.contacts.filter(row => row.contact_id !== 'contact-6'); }, error: /business Contact/},
  {name: 'a changed Contact-account relationship', mutate: db => { db.contacts.find(row => row.contact_id === 'contact-1').linked_user_id = FOREIGN_USER; }, error: /business Contact/},
  {name: 'a missing retained administrator', mutate: db => { db.users = db.users.filter(row => row.user_id !== ADMIN); }, error: /native administrator/},
];

test.each(semanticFailures)('reject $name even with a recomputed fingerprint, atomically', ({mutate, error}) => {
  const input = copy(source), bundle = copy(fixture);
  mutate(input, bundle.payload);
  bundle.fingerprint = fixtureFingerprint(bundle.payload);
  expect(bundle.fingerprint).toBe(fixtureFingerprint(bundle.payload));
  const before = stable(input), bundleBefore = stable(bundle);
  expect(() => install(input, bundle)).toThrow(error);
  expect(stable(input)).toBe(before); expect(stable(bundle)).toBe(bundleBefore);
});
