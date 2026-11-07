import onboardingCatalog from '@catalogs/onboardingCatalog.json';
import * as store from '../store';
import * as nativeAI from '../aiOnboarding';
import {aiRequest, aiRelated} from '../aiGovernance';
import {action} from '../workflows';
import {guardEdit} from '../decisions';
import {baselineRecordVersions, saveBaseline} from '../baseline';
import {validateVendor} from '../vendors';
import {vendorPlans, vendorSignals} from '../../lib/vendorGovernance';
import {assessedRisk} from '../../lib/grcWork';
import {onboardingProjection, annualDate, questions, proposalFor} from '../../lib/aiOnboarding';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {PRESTIGE_VENDOR_FACTS, PRESTIGE_RISK_FACTS, PRESTIGE_AI_FACTS, createPrestigeCurrentRegisters} from './prestigeEightYearRegisters';

const CID = 'demo_prestige', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const OPTIONS = {clock: CLOCK, purpose: 'current_register_source_qa'};
const MARKER = 'prestige_current_register_fixture';
const copy = value => JSON.parse(JSON.stringify(value));
const owned = (db, kind) => db[kind].filter(row => row.client_id === CID);
const rowFor = (db, kind, id) => db[kind].find(row => row[store.ids[kind]] === id);
let prepared, candidate, started, finished, sourceBefore;

beforeAll(async () => {
  const source = store.buildLegacyDemoStore(CLOCK);
  prepared = preparePrestigeNativeOnboarding(source, {clock: CLOCK, purpose: 'native_onboarding_qa'});
  const state = {version: 3, step: 3, selected_policy_keys: [], policies: {}, reviews: [], framework_reviews: {},
    requirements: Object.fromEntries(onboardingCatalog.requirements.map(item => [item.key, item.key === 'soc-2' ? 'applies' : 'does_not_apply']))};
  saveBaseline(prepared.db, CID, state, true, {expected_updated_at: null, expected_records: baselineRecordVersions(prepared.db, CID)});
  sourceBefore = JSON.stringify(prepared);
  started = Date.now();
  candidate = await createPrestigeCurrentRegisters(prepared, OPTIONS);
  finished = Date.now();
});

afterEach(() => { jest.restoreAllMocks(); });

function nativeRequest(db, fact) {
  const key = candidate.manifest.ai_request_keys[fact.key];
  const scope = JSON.stringify([db.user.user_id, CID, '/ai_systems/onboard', key]);
  const receipt = db.command_requests[scope];
  expect(receipt).toBeDefined();
  return {key, body: JSON.parse(receipt.fingerprint), receipt};
}

test('the explicit current-only cohort has 23 Vendors, 30 Risks and four AI records without mutating preparation', () => {
  expect(JSON.stringify(prepared)).toBe(sourceBefore);
  expect(candidate.backup).toEqual(prepared.db);
  expect(candidate.backup).not.toBe(prepared.db);
  expect(candidate.backup).not.toBe(candidate.db);
  expect(candidate.backup.clients[0]).not.toBe(prepared.db.clients[0]);
  expect(candidate.backup.clients[0]).not.toBe(candidate.db.clients[0]);
  expect(owned(candidate.db, 'vendors')).toHaveLength(23);
  expect(PRESTIGE_VENDOR_FACTS).toHaveLength(23);
  expect(PRESTIGE_VENDOR_FACTS.filter(fact => fact.key === 'openai')).toHaveLength(1);
  expect(PRESTIGE_RISK_FACTS).toHaveLength(26);
  expect(owned(candidate.db, 'risks')).toHaveLength(30);
  expect(owned(candidate.db, 'ai_systems')).toHaveLength(4);
  expect(new Set(Object.values(candidate.manifest.vendor_ids)).size).toBe(23);
  expect(new Set(Object.values(candidate.manifest.risk_ids)).size).toBe(30);
  expect(new Set(Object.values(candidate.manifest.ai_ids)).size).toBe(4);
  expect(owned(candidate.db, 'risks').map(row => row.display_id).sort()).toEqual(
    Array.from({length: 30}, (_, index) => 'RISK-' + String(index + 1).padStart(3, '0')));
  expect(owned(candidate.db, 'ai_systems').map(row => row.display_id).sort()).toEqual(['AI-001', 'AI-002', 'AI-003', 'AI-004']);
  expect(candidate.db.riskSequences[CID]).toBe(30);
  expect(candidate.db.ai_counters[CID]).toBe(4);
  expect(candidate.db.ai_intake[CID]).toMatchObject({client_id: CID, usage: 'yes',
    indicators: ['Third-party AI tools internally', 'Sensitive/personal data', 'Production/system access', 'Consequential decisions']});
});

test.each(PRESTIGE_VENDOR_FACTS.map(fact => [fact.key, fact]))('%s follows full native Vendor lifecycle and keeps separate uncompleted obligations', (_key, fact) => {
  const db = candidate.db, vendor = rowFor(db, 'vendors', candidate.manifest.vendor_ids[fact.key]);
  expect(vendor).toMatchObject({client_id: CID, name: fact.name, service: fact.service, status: fact.inactiveSince ? 'inactive' : 'active', review_frequency: 'annual'});
  expect(() => validateVendor(copy(db), copy(vendor), copy(vendor))).not.toThrow();
  expect(vendor.notes).toContain(fact.adopted);
  const linked = db.reviews.filter(row => row.client_id === CID && row.vendor_id === vendor.vendor_id);
  if (fact.inactiveSince) {
    expect(linked.some(row => !['completed', 'cancelled'].includes(row.status) && row.vendor_purpose !== 'offboarding')).toBe(false);
    expect(() => guardEdit('vendors', {name: 'Rewritten history'}, vendor, db.user, db)).toThrow(/historical/);
  } else {
    for (const [purpose, [due, recurrence]] of Object.entries(vendorPlans(vendor))) {
      const live = linked.filter(row => row.vendor_purpose === purpose && !['completed', 'cancelled'].includes(row.status));
      expect(live).toHaveLength(1);
      expect(live[0].due_date.slice(0, 10)).toBe(due.slice(0, 10));
      expect(live[0].recurrence).toBe(recurrence);
    }
    const primary = linked.find(row => row.vendor_purpose === 'vendor');
    const contract = linked.find(row => row.vendor_purpose === 'contract');
    expect(primary.recurrence).toBe('annual');
    expect(contract.recurrence).toBe('none');
    expect(contract.due_date).not.toBe(primary.due_date);
    if (vendor.assurance_required) {
      const assurance = linked.find(row => row.vendor_purpose === 'assurance');
      expect(assurance.due_date).not.toBe(primary.due_date);
      expect(vendor.assurance_records).toEqual([expect.objectContaining({review_status: 'requested', evidence_ids: [], history: []})]);
      expect(vendor.assurance_records[0]).not.toHaveProperty('received_at');
      expect(vendor.assurance_records[0]).not.toHaveProperty('reviewed_by');
      expect(vendorSignals(vendor, db.reviews)._assuranceIssue).toBe(true);
    }
  }
  expect(linked.every(row => row.status !== 'completed' && !(row.occurrences || []).length)).toBe(true);
});

test.each(PRESTIGE_RISK_FACTS.map(fact => [fact.key, fact]))('%s has native ratings, lifecycle decision provenance and its own Review', (_key, fact) => {
  const db = candidate.db, risk = rowFor(db, 'risks', candidate.manifest.risk_ids[fact.key]);
  const calculated = assessedRisk(risk);
  expect(risk).toMatchObject({client_id: CID, title: fact.title, status: fact.state, risk_score: fact.likelihood * fact.impact,
    risk_level: calculated.risk_level, treatment_plan: fact.plan});
  expect(risk.likelihood_rationale).toBeTruthy();
  expect(risk.impact_rationale).toBeTruthy();
  const reviews = db.reviews.filter(row => row.client_id === CID && row.risk_id === risk.risk_id);
  expect(reviews).toHaveLength(1);
  if (fact.state === 'closed') {
    expect(risk.next_review).toBeNull();
    expect(risk.closed_by).toBe(db.user.user_id);
    expect(risk.closure_note).toContain(fact.plan);
    expect(risk.decision_history).toEqual([expect.objectContaining({action: 'closed', by: db.user.user_id, reason: fact.reason})]);
    expect(Date.parse(risk.closed_at)).toBeGreaterThanOrEqual(started);
    expect(Date.parse(risk.closed_at)).toBeLessThanOrEqual(finished);
    expect(reviews[0].status).toBe('cancelled');
    expect(() => guardEdit('risks', {notes: 'Overwrite closed record'}, risk, db.user, db)).toThrow(/historical/);
  } else {
    expect(reviews[0]).toMatchObject({recurrence: 'annual', owner_id: risk.owner_id});
    expect(reviews[0].status).not.toBe('completed');
    if (fact.state === 'accepted') {
      expect(risk).toMatchObject({accepted: true, accepted_by: db.user.user_id, treatment: 'accept'});
      expect(risk.acceptance_rationale).toContain('Robert Doback sponsors');
      expect(Date.parse(risk.acceptance_date)).toBeGreaterThanOrEqual(started);
      expect(Date.parse(risk.acceptance_expires_at)).toBeGreaterThan(finished);
      expect(risk.decision_history).toEqual([expect.objectContaining({action: 'accepted', by: db.user.user_id, expires_at: risk.acceptance_expires_at})]);
    }
  }
  expect(risk.risk_score).toBeGreaterThan(0);
  if (fact.vendorKey) expect(risk.vendor_id).toBe(candidate.manifest.vendor_ids[fact.vendorKey]);
});

test.each(PRESTIGE_AI_FACTS.map(fact => [fact.key, fact]))('%s uses actual native preset/custom onboarding and same-client provider/Risk relationships', (_key, fact) => {
  const db = candidate.db, ai = rowFor(db, 'ai_systems', candidate.manifest.ai_ids[fact.key]);
  const risk = rowFor(db, 'risks', candidate.manifest.risk_ids[fact.riskKey]);
  const {body, receipt} = nativeRequest(db, fact);
  expect(fact.adopted >= fact.availableSince).toBe(true);
  expect(ai).toMatchObject({client_id: CID, catalog_key: fact.catalogKey, name: fact.name, provider: fact.provider,
    vendor_id: candidate.manifest.vendor_ids[fact.vendorKey], status: 'active', approval_status: 'pending_assessment'});
  expect(ai).not.toHaveProperty('approval_history');
  expect(ai.governance_notes).toContain(fact.adopted);
  expect(ai.governance_notes).toContain(fact.availableSince);
  expect(Object.keys(ai.onboarding_screening.answers)).toEqual(questions.map(question => question.id));
  expect(ai.onboarding_screening).toMatchObject({schema_version: 1, catalog_version: '2026-10-25', answers: fact.answers, recorded_by: db.user.user_id});
  expect(Date.parse(ai.onboarding_screening.recorded_at)).toBeGreaterThanOrEqual(started);
  expect(Date.parse(ai.onboarding_screening.recorded_at)).toBeLessThanOrEqual(finished);
  expect(ai.created_at).toBe(ai.onboarding_screening.recorded_at);
  expect(onboardingProjection(ai)).toMatchObject({screening_complete: true, screening_requires_reassessment: false});
  const proposal = proposalFor({...body.ai, answers: body.screening.answers});
  expect(body.risk).toMatchObject({likelihood: proposal.likelihood, impact: proposal.impact, override: false});
  expect(risk).toMatchObject({client_id: CID, status: fact.riskState, likelihood_score: proposal.likelihood,
    impact_score: proposal.impact, vendor_id: ai.vendor_id, treatment_plan: fact.response});
  expect(receipt.result).toMatchObject({ai_system_id: ai.ai_system_id, risk_id: risk.risk_id, vendor_id: ai.vendor_id});
  expect(ai.related_links).toContainEqual(expect.objectContaining({kind: 'risks', id: risk.risk_id, classification: 'Context'}));
  expect(aiRelated(db, 'risks', risk, {}).ai_systems.map(row => row.ai_system_id)).toContain(ai.ai_system_id);
  const review = rowFor(db, 'reviews', receipt.result.review_id);
  expect(review).toMatchObject({client_id: CID, ai_system_id: ai.ai_system_id, recurrence: 'annual'});
  expect(review.due_date.slice(0, 10)).toBe(annualDate(ai.created_at.slice(0, 10)));
  expect(review.status).not.toBe('completed');
});

test('exact fixture retry performs no native command, duplicate creation, counter change or timestamp rewrite', async () => {
  const writeSpy = jest.spyOn(store, 'write');
  const onboardSpy = jest.spyOn(nativeAI, 'aiOnboardingRequest');
  const again = await createPrestigeCurrentRegisters({...prepared, db: candidate.db}, OPTIONS);
  expect(again.db).toEqual(candidate.db);
  expect(again.manifest).toEqual(candidate.manifest);
  expect(writeSpy).not.toHaveBeenCalled();
  expect(onboardSpy).not.toHaveBeenCalled();
});

test('native AI intent replay retains returned IDs and rejects changed intent without new effects', () => {
  const db = copy(candidate.db), fact = PRESTIGE_AI_FACTS[0], {key, body, receipt} = nativeRequest(db, fact);
  const before = JSON.stringify(db);
  const replay = nativeAI.aiOnboardingRequest(db, body, key);
  expect(replay).toMatchObject(receipt.result);
  expect(JSON.stringify(db)).toBe(before);
  expect(() => nativeAI.aiOnboardingRequest(db, {...body, ai: {...body.ai, name: 'Altered request intent'}}, key)).toThrow(/different data/);
  expect(JSON.stringify(db)).toBe(before);
});

test.each([
  ['edited Risk', db => { owned(db, 'risks')[0].description += ' Changed'; }],
  ['missing AI relationship', db => { owned(db, 'ai_systems')[0].related_links = []; }],
  ['altered ID map', db => { db[MARKER].vendor_ids.aws = db.vendors.find(row => row.client_id !== CID).vendor_id; }],
  ['altered facts receipt', db => { db[MARKER].facts_sha256 = '0'.repeat(64); }],
])('refuses mismatched prepared retry: %s', async (_label, change) => {
  const db = copy(candidate.db); change(db); const before = JSON.stringify(db);
  await expect(createPrestigeCurrentRegisters({...prepared, db}, OPTIONS)).rejects.toThrow(/mismatched retry/);
  expect(JSON.stringify(db)).toBe(before);
});

test.each([
  ['missing envelope', value => { delete value.clientId; }],
  ['wrong client', value => { value.clientId = 'demo_dunder'; }],
  ['unfinished baseline', value => { value.db.baselines[CID].completed = false; }],
  ['expanded scope', value => { value.db.clients.find(row => row.client_id === CID).framework_settings['soc-2'].categories.push('privacy'); }],
  ['missing criterion', value => { value.db.framework_assessments = value.db.framework_assessments.filter(row => row.definition_id !== 'C1.2' || row.client_id !== CID); }],
  ['another enrolled program', value => { value.db.baselines[CID].requirements['iso-27001'] = 'applies'; }],
  ['archived client', value => { value.db.clients.find(row => row.client_id === CID).archived = true; }],
  ['ordinary workspace', value => { value.db.user.workspace_mode = 'standard'; }],
  ['business owner as command actor', value => { value.db.user = value.db.users.find(row => row.user_id === 'demo_prestige_user_0'); }],
  ['disabled actor', value => { value.db.user.status = 'disabled'; }],
  ['forged actor label', value => { value.db.user.name = 'Robert Doback'; }],
  ['unavailable owner', value => { value.db.users.find(row => row.user_id === 'demo_prestige_user_2').status = 'disabled'; }],
  ['same-client legacy register', value => { value.db.risks.push({risk_id: 'legacy_prestige', client_id: CID}); }],
  ['existing counter', value => { value.db.riskSequences[CID] = 90; }],
  ['recorded AI declaration', value => { value.db.ai_intake ||= {}; value.db.ai_intake[CID] = {client_id: CID, usage: 'no'}; }],
  ['duplicate cross-client ID', value => { value.db.vendors.push({...value.db.vendors[0], client_id: CID}); }],
])('denies %s before publishing and keeps the source exact', async (_label, change) => {
  const value = copy(prepared); change(value); const before = JSON.stringify(value);
  await expect(createPrestigeCurrentRegisters(value, OPTIONS)).rejects.toThrow();
  expect(JSON.stringify(value)).toBe(before);
});

test('wrong source day or implicit purpose cannot activate this fixture', async () => {
  await expect(createPrestigeCurrentRegisters(prepared, {clock: CLOCK})).rejects.toThrow(/explicit prepared/);
  await expect(createPrestigeCurrentRegisters(prepared, {...OPTIONS, clock: new Date('2026-11-03T12:00:00Z')})).rejects.toThrow(/frozen source day/);
  await expect(createPrestigeCurrentRegisters(prepared.db, OPTIONS)).rejects.toThrow(/prepared source envelope/);
  expect(JSON.stringify(prepared)).toBe(sourceBefore);
});

test('a late native Firefly intent conflict discards all staged Vendor/Risk/AI effects atomically', async () => {
  const value = copy(prepared), key = candidate.manifest.ai_request_keys['firefly-concept-art'];
  value.db.command_requests ||= {};
  value.db.command_requests[JSON.stringify([value.db.user.user_id, CID, '/ai_systems/onboard', key])] = {fingerprint: '{}', result: {}};
  const before = JSON.stringify(value), spy = jest.spyOn(nativeAI, 'aiOnboardingRequest');
  await expect(createPrestigeCurrentRegisters(value, OPTIONS)).rejects.toThrow(/different data/);
  expect(spy).toHaveBeenCalledTimes(4);
  expect(JSON.stringify(value)).toBe(before);
});

test('a newly returned native ID cannot steal a foreign Vendor identity', async () => {
  const value = copy(prepared), before = JSON.stringify(value);
  const foreignId = value.db.vendors.find(row => row.client_id !== CID).vendor_id;
  const original = store.write;
  jest.spyOn(store, 'write').mockImplementationOnce((db, kind, body, id) => {
    const row = original(db, kind, body, id); row.vendor_id = foreignId; return row;
  });
  await expect(createPrestigeCurrentRegisters(value, OPTIONS)).rejects.toThrow(/duplicate or invalid native vendors identity/);
  expect(JSON.stringify(value)).toBe(before);
});

test('foreign legacy display IDs/counters and every other client, identity, history and non-register row stay exact', async () => {
  const value = copy(prepared), foreignRisk = value.db.risks.find(row => row.client_id !== CID);
  delete foreignRisk.display_id;
  value.db.riskSequences[foreignRisk.client_id] = 233;
  const before = copy(value.db), result = await createPrestigeCurrentRegisters(value, OPTIONS);
  for (const [kind, rows] of Object.entries(before)) if (Array.isArray(rows))
    expect(result.db[kind].filter(row => row.client_id !== CID)).toEqual(rows.filter(row => row.client_id !== CID));
  for (const kind of ['users', 'contacts', 'clients', 'policies', 'framework_assessments', 'tasks', 'findings', 'evidence', 'assessments'])
    expect(result.db[kind]).toEqual(before[kind]);
  for (const key of ['riskSequences', 'ai_counters', 'ai_intake'])
    expect(Object.fromEntries(Object.entries(result.db[key] || {}).filter(([clientId]) => clientId !== CID)))
      .toEqual(Object.fromEntries(Object.entries(before[key] || {}).filter(([clientId]) => clientId !== CID)));
  expect(result.db.portfolio_reporting).toEqual(before.portfolio_reporting);
  expect(value.db).toEqual(before);
});

test('native approval, lifecycle and decision boundaries remain separate from inventory status and completed Actions', () => {
  const db = copy(candidate.db), ai = owned(db, 'ai_systems')[0], before = JSON.stringify(db);
  expect(() => aiRequest(db, '/ai_systems/' + ai.ai_system_id + '/approval', 'post', {}, {status: 'approved', note: 'No SOC approval capability', expected_updated_at: ai.updated_at})).toThrow(/configured CIS/);
  expect(JSON.stringify(db)).toBe(before);
  const inactive = owned(db, 'vendors').find(row => row.status === 'inactive');
  expect(() => guardEdit('vendors', {status: 'active'}, inactive, db.user, db)).toThrow(/historical/);
  const base = owned(db, 'vendors').find(row => row.status === 'active');
  expect(() => validateVendor(db, {...base, status: 'active'}, {...base, status: 'onboarding'})).toThrow(/next Vendor lifecycle/);
  const risk = rowFor(db, 'risks', candidate.manifest.risk_ids['session-theft']);
  const task = store.write(db, 'tasks', {client_id: CID, title: 'Controlled treatment check', risk_id: risk.risk_id,
    assignee_id: risk.owner_id, status: 'open', description: 'Controlled native rule check; not a source history artifact.'});
  expect(task.status).toBe('open');
  store.write(db, 'tasks', {status: 'in_progress'}, task.task_id);
  expect(db.tasks.find(row => row.task_id === task.task_id).status).toBe('in_progress');
  store.write(db, 'tasks', {status: 'done', resolution: 'Controlled task outcome only'}, task.task_id);
  expect(db.tasks.find(row => row.task_id === task.task_id).status).toBe('done');
  expect(risk.status).toBe('in_progress');
  expect(risk).not.toHaveProperty('closed_at');
  expect(db.reviews.find(row => row.risk_id === risk.risk_id).status).not.toBe('completed');
  const decisionBefore = JSON.stringify(risk);
  expect(() => action(db, 'risks', risk.risk_id, 'accept', {rationale: 'Expired test decision', expiry_date: '2020-01-01'})).toThrow(/future acceptance/);
  expect(JSON.stringify(risk)).toBe(decisionBefore);
});

test('foreign native log_id-only history survives in the caller, backup, candidate and exact retry without alias backfill', async () => {
  const value = copy(prepared), legacy = value.db.logs.find(row => row.client_id !== CID);
  legacy.log_id = legacy.audit_id || legacy.log_id;
  delete legacy.audit_id;
  const before = JSON.stringify(value), retained = JSON.stringify(legacy);
  const foreign = value.db.logs.filter(row => row.client_id !== CID);
  const result = await createPrestigeCurrentRegisters(value, OPTIONS);
  expect(JSON.stringify(value)).toBe(before);
  expect(result.backup).toEqual(value.db);
  expect(result.db.logs.filter(row => row.client_id !== CID)).toEqual(foreign);
  const saved = result.db.logs.find(row => row.log_id === legacy.log_id);
  expect(JSON.stringify(saved)).toBe(retained);
  expect(saved).not.toHaveProperty('audit_id');
  expect(owned(result.db, 'vendors')).toHaveLength(23);
  expect(owned(result.db, 'risks')).toHaveLength(30);
  expect(owned(result.db, 'ai_systems')).toHaveLength(4);
  expect(owned(result.db, 'ai_systems').every(row => row.approval_status === 'pending_assessment' && !row.approval_history?.length)).toBe(true);
  const replay = await createPrestigeCurrentRegisters({...value, db: result.db}, OPTIONS);
  expect(replay.db).toEqual(result.db);
  expect(JSON.stringify(replay.db.logs.find(row => row.log_id === legacy.log_id))).toBe(retained);
});

test.each(['equal', 'distinct'])('%s native audit_id/log_id aliases within one retained row remain unchanged and valid', async mode => {
  const value = copy(prepared), row = value.db.logs.find(item => item.client_id !== CID);
  row.audit_id = row.audit_id || row.log_id;
  row.log_id = mode === 'equal' ? row.audit_id : row.audit_id + '_retained_secondary_alias';
  const retained = JSON.stringify(row), before = JSON.stringify(value);
  const result = await createPrestigeCurrentRegisters(value, OPTIONS);
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
  await expect(createPrestigeCurrentRegisters(value, OPTIONS)).rejects.toThrow(/duplicate or invalid native logs identity/);
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
  await expect(createPrestigeCurrentRegisters(value, OPTIONS)).rejects.toThrow(/duplicate or invalid native logs identity/);
  expect(JSON.stringify(value)).toBe(before);
  expect(nativeWrite).not.toHaveBeenCalled();
});
