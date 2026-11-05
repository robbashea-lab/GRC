import catalog from '@catalogs/onboardingCatalog.json';
import {seedStore, saveStore, readStore} from './store';
import {prepareCisOnboardingFixture} from './cisCanonicalOnboarding';
import {snapshotCanonicalCisClient} from './cisCanonicalScope';
import {baselineRecordVersions, saveBaseline} from './baseline';
import {activePlans, FRAMEWORKS} from '../lib/frameworks';
import {recordedBaseline} from '../lib/clientProfile';
import {cisDemoSelection} from './cisDemoSelection';
import {clearFileCache} from './evidenceStorage';

const CID = 'demo_brawndo';
const CLOCK = new Date('2026-11-02T12:00:00.000Z');
const clone = value => JSON.parse(JSON.stringify(value));
const outsideRows = db => Object.fromEntries(Object.entries(db)
  .filter(([, value]) => Array.isArray(value))
  .map(([key, value]) => [key, value.filter(row => row.client_id !== CID)]));

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(CLOCK);
  sessionStorage.clear();
  clearFileCache();
});
afterEach(() => {
  sessionStorage.clear();
  clearFileCache();
  jest.useRealTimers();
});

test('fresh canonical preparation survives a native save/read without legacy reseeding or unrelated changes', () => {
  const db = seedStore(CLOCK), outside = clone(outsideRows(db)), users = clone(db.users), actor = clone(db.user);
  const before = snapshotCanonicalCisClient(db, CID);
  if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
    const fs = require('fs'), path = require('path'), crypto = require('crypto');
    const out = path.resolve(process.env.CIS_REBUILD_AUDIT_OUTPUT);
    fs.mkdirSync(out, {recursive:true});
    const bytes = JSON.stringify({source:'Source-generated baseline, not a visitor-session backup',
      source_revision:'49db19446c226ee8923dc7d0b4d69b91c15ce947', anchor:'2026-11-02T00:00:00.000Z', snapshot:before}, null, 2);
    fs.writeFileSync(path.join(out, 'BRAWNDO-BEFORE.json'), bytes);
    fs.writeFileSync(path.join(out, 'BRAWNDO-BEFORE.sha256'), crypto.createHash('sha256').update(bytes).digest('hex')+'\n');
  }
  prepareCisOnboardingFixture(db, CID);
  expect(outsideRows(db)).toEqual(outside);
  expect(db.users).toEqual(users);
  expect(db.user).toEqual(actor);
  saveStore(db);
  const reloaded = readStore();
  expect(reloaded.baselines[CID]).toMatchObject({completed:false, step:0, selected_policy_keys:[], requirements:{}});
  expect(recordedBaseline(reloaded.clients.find(row => row.client_id === CID), reloaded.baselines[CID], reloaded.logs)).toBeNull();
  for (const kind of ['framework_assessments','reviews','policies','risks','vendors','ai_systems','tasks','findings','evidence'])
    expect(reloaded[kind].filter(row => row.client_id === CID)).toEqual([]);
  expect(reloaded.users).toEqual(users);
  expect(reloaded.user).toEqual(actor);
  expect(reloaded.clients.filter(row => row.client_id !== CID)).toEqual(outside.clients);
  expect(reloaded.framework_assessments.filter(row => row.client_id !== CID)).toEqual(outside.framework_assessments);
});

test('ordinary native onboarding establishes the selected mapped program once and preserves all other clients', () => {
  const db = seedStore(CLOCK);
  prepareCisOnboardingFixture(db, CID);
  const outside = clone(outsideRows(db)), selected = cisDemoSelection(1);
  // Retention/disposal content is housed in Data Classification & Handling;
  // a second supporting template is not a separate CIS document mandate.
  const keys = selected.selected_policy_keys.filter(key => key !== 'policy-data-retention-secure-disposal-policy');
  expect(keys).toHaveLength(9);
  const state = {...db.baselines[CID], step:3, selected_policy_keys:keys,
    policies:Object.fromEntries(keys.map(key => [key,'no'])),
    requirements:Object.fromEntries(FRAMEWORKS.map(item => [item.key, item.key === 'cis-ig1' ? 'applies' : 'does_not_apply'])),
    framework_reviews:Object.fromEntries(activePlans('cis-ig1', {implementation_group:1}).map(plan => [plan.key,
      {enabled:!!plan.source_minimum, recurrence:plan.default_cadence, due_date:null}]))};
  const saved = saveBaseline(db, CID, state, true,
    {expected_updated_at:null, expected_records:baselineRecordVersions(db, CID)});
  expect(saved.completed).toBe(true);
  expect(db.framework_assessments.filter(row => row.client_id === CID)).toHaveLength(56);
  expect(db.framework_assessments.filter(row => row.client_id === CID).every(row => row.status === 'not_assessed')).toBe(true);
  expect(db.policies.filter(row => row.client_id === CID).map(row => row.baseline_key).sort()).toEqual([...keys].sort());
  expect(db.policies.filter(row => row.client_id === CID).every(row => row.presence === 'reported_missing')).toBe(true);
  expect(db.reviews.filter(row => row.client_id === CID)).toHaveLength(11);
  expect(db.reviews.filter(row => row.client_id === CID).every(row => row.status === 'needs_scheduling')).toBe(true);
  expect(db.reviews.some(row => row.client_id === CID && row.framework_plan_key === 'endpoint-validation')).toBe(false);
  const ids = db.framework_assessments.filter(row => row.client_id === CID).map(row => row.framework_assessment_id);
  const policyIds = db.policies.filter(row => row.client_id === CID).map(row => row.policy_id);
  saveBaseline(db, CID, saved, true, {expected_updated_at:saved.updated_at, expected_records:baselineRecordVersions(db, CID)});
  expect(db.framework_assessments.filter(row => row.client_id === CID).map(row => row.framework_assessment_id)).toEqual(ids);
  expect(db.policies.filter(row => row.client_id === CID).map(row => row.policy_id)).toEqual(policyIds);
  expect(db.reviews.filter(row => row.client_id === CID)).toHaveLength(11);
  expect(outsideRows(db)).toEqual(outside);
  expect(catalog.policies.filter(item => keys.includes(item.key))).toHaveLength(9);
});
