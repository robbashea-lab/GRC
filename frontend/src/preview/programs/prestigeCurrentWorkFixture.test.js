import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bundled from './prestigeEightYearFixtureData.json';
import {seedStoreBeforePrestige, saveStore, readStore, STORE_KEY} from '../store';
import {clearFileCache} from '../evidenceStorage';
import {stable} from '../commandRequests';
import {createPrestigeCurrentOperationalWork} from './prestigeCurrentOperationalWork';
import {materializePrestigeEightYearFixture, installPrestigeEightYearFixture} from './prestigeEightYearFixture';
import {calendarBuckets} from '../../lib/calendarView';
import {getPrestigeDemoScenarioContext} from './prestigePreparedHistory';

const CID = 'demo_prestige', ANCHOR = '2026-11-02T00:00:00.000Z';
const CLOCK = new Date('2026-11-08T12:00:00.000Z');
const copy = value => JSON.parse(JSON.stringify(value));
const sha = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
const owned = (db, kind) => db[kind].filter(row => row.client_id === CID);
let input, source, before, result, fixture;
beforeAll(async () => {
  input = process.env.PRESTIGE_CURRENT_WORK_INPUT
    ? JSON.parse(fs.readFileSync(process.env.PRESTIGE_CURRENT_WORK_INPUT, 'utf8')) : copy(bundled);
  const prior = process.env.REACT_APP_PREVIEW;
  process.env.REACT_APP_PREVIEW = 'true';
  try { source = seedStoreBeforePrestige(CLOCK); }
  finally { if (prior === undefined) delete process.env.REACT_APP_PREVIEW; else process.env.REACT_APP_PREVIEW = prior; }
  before = installPrestigeEightYearFixture(source, input, {fresh: true, clock: CLOCK}).db;
  result = await createPrestigeCurrentOperationalWork({db: before, clientId: CID, anchor: ANCHOR,
    ...(input.provenance.current_work ? {currentWorkManifest: copy(input.provenance.current_work)} : {})},
  {purpose: 'current_operational_work_source_qa'});
  const scenario = copy(input.provenance);
  if (!scenario.current_work) {
    const previous = scenario.receipt_sha256;
    delete scenario.receipt_sha256;
    Object.assign(scenario, {previous_source_receipt_sha256: previous, current_work: result.currentWorkManifest,
      counts: Object.fromEntries(Object.keys(scenario.counts).map(kind => [kind, owned(result.db, kind).length])),
      state_sha256: sha(result.db)});
    scenario.receipt_sha256 = sha(scenario);
  }
  fixture = await materializePrestigeEightYearFixture({...result, backup: source, scenarioManifest: scenario});
});
afterAll(() => { sessionStorage.removeItem(STORE_KEY); clearFileCache(); });

test('the native current-work append preserves every original Evidence object and existing effective Policy', () => {
  expect(owned(result.db, 'evidence')).toEqual(input.payload.collections.evidence);
  const priorPolicies = input.payload.collections.policies.filter(row => row.status === 'approved');
  expect(owned(result.db, 'policies').filter(row => row.status === 'approved')).toEqual(priorPolicies);
  for (const kind of ['framework_assessments', 'organizational_controls', 'findings'])
    expect(owned(result.db, kind)).toEqual(input.payload.collections[kind]);
  for (const [kind, rows] of Object.entries(before)) if (Array.isArray(rows))
    expect(result.db[kind].filter(row => row.client_id !== CID)).toEqual(rows.filter(row => row.client_id !== CID));
  expect(owned(result.db, 'tasks')).toHaveLength(14);
  expect(owned(result.db, 'policies')).toHaveLength(17);
  expect(owned(result.db, 'reviews')).toHaveLength(input.payload.collections.reviews.length);
});

test('Calendar uses the same current Action identities and deadlines, including the unassigned improvement', () => {
  const records = Object.fromEntries(['reviews', 'findings', 'tasks'].map(kind => [kind, owned(result.db, kind)]));
  const buckets = calendarBuckets(records, result.db.user,
    {start: '2026-10-01', end: '2027-01-31', scope: 'active', overdue_before: '2026-11-02'});
  const entries = Object.values(buckets.tasks).flat();
  const workIds = Object.values(result.currentWorkManifest.task_ids);
  for (const id of workIds) {
    const task = records.tasks.find(row => row.task_id === id);
    expect(entries.filter(row => row.id === id)).toHaveLength(1);
    expect(entries.find(row => row.id === id).due_date_iso.slice(0, 10)).toBe(task.due_date.slice(0, 10));
  }
  expect(records.tasks.filter(row => workIds.includes(row.task_id) && !row.assignee_id)).toHaveLength(1);
  expect(new Set(records.tasks.filter(row => workIds.includes(row.task_id)).map(row => row.priority)))
    .toEqual(new Set(['critical', 'high', 'medium', 'low']));
});

test('materialization and complete-cohort native cold reload preserve the new work and eight historical positions within unchanged limits', () => {
  const installed = installPrestigeEightYearFixture(source, fixture, {fresh: true, clock: CLOCK}).db;
  saveStore(installed, {resetFiles: true});
  const stored = sessionStorage.getItem(STORE_KEY);
  expect(stored.length * 2).toBeLessThanOrEqual(5 * 1024 * 1024);
  clearFileCache();
  const cold = readStore();
  for (const kind of ['tasks', 'policies', 'risks'])
    expect(owned(cold, kind)).toEqual(owned(installed, kind));
  expect(getPrestigeDemoScenarioContext(cold, CID, CLOCK.toISOString()).point_ids).toHaveLength(8);
  for (const [kind, rows] of Object.entries(source)) if (Array.isArray(rows))
    expect(cold[kind].filter(row => row.client_id !== CID).map(row => row.client_id))
      .toEqual(rows.filter(row => row.client_id !== CID).map(row => row.client_id));
});

test('optional authoring output retains all frozen child receipts and original fourteen file identities', () => {
  for (const key of ['model_receipt_sha256', 'history_receipt_sha256', 'controls_receipt_sha256',
    'artifact_receipt_sha256', 'binding_receipt_sha256', 'operating_receipt_sha256'])
    expect(fixture.provenance[key]).toBe(input.provenance[key]);
  expect(fixture.payload.collections.evidence).toEqual(input.payload.collections.evidence);
  if (process.env.PRESTIGE_CURRENT_WORK_OUTPUT) {
    const dir = process.env.PRESTIGE_CURRENT_WORK_OUTPUT;
    fs.writeFileSync(path.join(dir, 'APPENDED-FIXTURE.json'), JSON.stringify(fixture));
    fs.writeFileSync(path.join(dir, 'CURRENT-WORK-RECEIPT.json'), JSON.stringify(result.currentWorkManifest, null, 2));
    fs.writeFileSync(path.join(dir, 'CAPACITY.json'), JSON.stringify({stored_utf16_bytes: sessionStorage.getItem(STORE_KEY).length * 2,
      payload_sha256: fixture.payload_sha256, fingerprint: fixture.fingerprint,
      fourteen_evidence_objects_unchanged: true, six_child_receipts_unchanged: true,
      scope: 'Controlled native Storage/codec; not physical Browser or hosted acceptance.'}, null, 2));
  }
});
