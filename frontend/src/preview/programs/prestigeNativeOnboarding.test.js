import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {buildLegacyDemoStore} from '../store';
import {baselineRecordVersions, saveBaseline} from '../baseline';
import catalog from '@catalogs/onboardingCatalog.json';

const CLIENT_ID = 'demo_prestige';
const CLOCK = new Date('2026-11-02T12:00:00.000Z');
const OPTIONS = {clock: CLOCK, purpose: 'native_onboarding_qa'};
const copy = value => JSON.parse(JSON.stringify(value));
let source;
beforeAll(() => { source = buildLegacyDemoStore(CLOCK); });

test('prepare only canonical Prestige with a recoverable backup and no user, scope or foreign change', () => {
  const before = JSON.stringify(source);
  const {db, backup, inventory, removedRecordIds} = preparePrestigeNativeOnboarding(source, OPTIONS);
  expect(JSON.stringify(source)).toBe(before);
  expect(JSON.stringify(backup)).toBe(before);
  expect(db.users).toEqual(source.users);
  expect(db.contacts).toEqual(source.contacts);
  expect(db.clients.filter(row => row.client_id !== CLIENT_ID)).toEqual(source.clients.filter(row => row.client_id !== CLIENT_ID));
  const prior = source.clients.find(row => row.client_id === CLIENT_ID);
  const client = db.clients.find(row => row.client_id === CLIENT_ID);
  for (const key of Object.keys(prior).filter(key => !['initial_program_baseline', 'onboarding_baseline'].includes(key)))
    expect(client[key]).toEqual(prior[key]);
  for (const [kind, rows] of Object.entries(source)) {
    if (Array.isArray(rows) && !['clients', 'users', 'contacts'].includes(kind))
      expect(db[kind]).toEqual(rows.filter(row => row.client_id !== CLIENT_ID));
  }
  expect(inventory.framework_assessments).toBe(38);
  expect(removedRecordIds.framework_assessments).toEqual(source.framework_assessments
    .filter(row => row.client_id === CLIENT_ID).map(row => row.framework_assessment_id));
  expect(db.baselines[CLIENT_ID]).toMatchObject({version: 3, step: 0, completed: false, updated_at: null});
  expect(db.baselines.demo_dunder).toEqual(source.baselines.demo_dunder);
});

test.each([
  ['wrong purpose', db => db, {...OPTIONS, purpose: 'ordinary_reload'}],
  ['wrong day', db => db, {...OPTIONS, clock: new Date('2026-11-03T12:00:00Z')}],
  ['invalid clock', db => db, {...OPTIONS, clock: new Date('invalid')}],
  ['standard actor', db => { db.user.workspace_mode = 'standard'; return db; }, OPTIONS],
  ['read-only actor', db => { db.user.role = 'client_readonly'; return db; }, OPTIONS],
  ['disabled actor', db => { db.user.status = 'disabled'; return db; }, OPTIONS],
  ['wrong environment', db => { db.clients.find(row => row.client_id === CLIENT_ID).environment = 'Production'; return db; }, OPTIONS],
  ['archived client', db => { db.clients.find(row => row.client_id === CLIENT_ID).archived = true; return db; }, OPTIONS],
  ['duplicate client', db => { db.clients.push(copy(db.clients.find(row => row.client_id === CLIENT_ID))); return db; }, OPTIONS],
  ['changed category scope', db => { db.clients.find(row => row.client_id === CLIENT_ID).framework_settings['soc-2'].categories.push('privacy'); return db; }, OPTIONS],
  ['another enrolled program', db => { db.baselines[CLIENT_ID].requirements['iso-27001'] = 'applies'; return db; }, OPTIONS],
  ['another framework assessment', db => {
    db.framework_assessments.push({framework_assessment_id: 'other-program', client_id: CLIENT_ID, framework_key: 'iso-27001'});
    return db;
  }, OPTIONS],
  ['foreign nested evidence relationship', db => {
    const target = db.evidence.find(row => row.client_id === CLIENT_ID).evidence_id;
    db.vendors.push({vendor_id: 'foreign-assurance', client_id: 'demo_dunder', assurance_records: [{evidence_ids: [target]}]});
    return db;
  }, OPTIONS],
  ['foreign assessment link', db => {
    const target = db.framework_assessments.find(row => row.client_id === CLIENT_ID).framework_assessment_id;
    db.organizational_controls.push({control_id: 'foreign-control', client_id: 'demo_dunder', assessment_ids: [target]});
    return db;
  }, OPTIONS],
  ['conflicting guided ownership', db => {
    const target = db.framework_assessments.find(row => row.client_id === CLIENT_ID).framework_assessment_id;
    db.guided_assessment_pilot = {[target + ':actor']: {client_id: 'demo_dunder', assessment_id: target}};
    return db;
  }, OPTIONS],
  ['foreign guided key with owned assessment', db => {
    const target = db.framework_assessments.find(row => row.client_id === CLIENT_ID).framework_assessment_id;
    db.guided_assessment_history = {'unrelated:key': {client_id: 'demo_dunder', assessment_id: target}};
    return db;
  }, OPTIONS],
  ['foreign cached command relationship', db => {
    const target = db.reviews.find(row => row.client_id === CLIENT_ID).review_id;
    db.command_requests = {[JSON.stringify(['reviews', 'demo_dunder', 'request'])]: {client_id: 'demo_dunder', review_id: target}};
    return db;
  }, OPTIONS],
  ['foreign draft relationship', db => {
    const target = db.risks.find(row => row.client_id === CLIENT_ID).risk_id;
    db.drafts ||= {};
    db.drafts.demo_dunder = {related_links: [{kind: 'risks', id: target}]};
    return db;
  }, OPTIONS],
  ['conflicting reporting ownership', db => {
    db.portfolio_reporting ||= {};
    db.portfolio_reporting.snapshots ||= [];
    db.portfolio_reporting.snapshots.push({client_id: CLIENT_ID, program_id: 'demo_dunder:iso-27001'});
    return db;
  }, OPTIONS],
])('%s fails atomically', (_label, change, options) => {
  const db = change(copy(source)), before = JSON.stringify(db);
  expect(() => preparePrestigeNativeOnboarding(db, options)).toThrow();
  expect(JSON.stringify(db)).toBe(before);
});

test('Dunder markers, shared accounts and other client maps remain exact', () => {
  const db = copy(source);
  for (const key of ['dunder_demo_prepared_history', 'dunder_demo_modeled_history', 'dunder_demo_artifacts'])
    db[key] = {version: 'retained-proof', client_id: 'demo_dunder', nested: {original: ['keep']}};
  db.ai_intake = {[CLIENT_ID]: {usage: 'yes'}, demo_dunder: {usage: 'no'}};
  db.riskSequences = {[CLIENT_ID]: 30, demo_dunder: 28};
  const prepared = preparePrestigeNativeOnboarding(db, OPTIONS).db;
  for (const key of ['dunder_demo_prepared_history', 'dunder_demo_modeled_history', 'dunder_demo_artifacts'])
    expect(prepared[key]).toEqual(db[key]);
  expect(prepared.ai_intake).toEqual({demo_dunder: {usage: 'no'}});
  expect(prepared.riskSequences).toEqual({demo_dunder: 28});
  expect(prepared.users).toEqual(db.users);
});

test('native baseline completion creates only the existing 38 unknown SOC criteria in retained scope', () => {
  const {db} = preparePrestigeNativeOnboarding(source, OPTIONS);
  const state = {version: 3, step: 3, selected_policy_keys: [], policies: {}, reviews: [], framework_reviews: {},
    requirements: Object.fromEntries(catalog.requirements.map(item => [item.key, item.key === 'soc-2' ? 'applies' : 'does_not_apply']))};
  saveBaseline(db, CLIENT_ID, state, true, {expected_updated_at: null, expected_records: baselineRecordVersions(db, CLIENT_ID)});
  expect(db.baselines[CLIENT_ID].completed).toBe(true);
  const rows = db.framework_assessments.filter(row => row.client_id === CLIENT_ID);
  expect(rows).toHaveLength(38);
  for (const row of rows) {
    expect(row.framework_key).toBe('soc-2');
    expect(row.status).toBe('not_assessed');
    expect(row.implementation).toBe('');
    expect(row.assessment_history).toEqual([]);
  }
  expect(db.clients.find(row => row.client_id === CLIENT_ID).framework_settings['soc-2'].categories)
    .toEqual(source.clients.find(row => row.client_id === CLIENT_ID).framework_settings['soc-2'].categories);
});
