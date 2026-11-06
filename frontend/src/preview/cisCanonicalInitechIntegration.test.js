import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishInitechBaseline} from './cisCanonicalInitechBaseline';
import {populateInitechAssessments} from './cisCanonicalInitechAssessments';
import {populateInitechGovernance} from './cisCanonicalInitechGovernance';
import {seedInitechOperations} from './cisCanonicalInitechOperations';
import {MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';

const CID = 'demo_initech', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const copy = value => JSON.parse(JSON.stringify(value));
const outside = db => Object.fromEntries(Object.entries(db).filter(([, value]) => Array.isArray(value))
  .map(([kind, rows]) => [kind, rows.filter(row => row.client_id !== CID)]));

beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => jest.useRealTimers());

test('existing Demo identities support the Initech stages without new accounts or foreign changes', () => {
  const db = preExpansionCisFixture(CLOCK), dates = cisDemoFixtureDates(CLOCK);
  const before = copy(outside(db)), users = copy(db.users), actor = copy(db.user), contacts = copy(db.contacts);
  const clientOrder = db.clients.map(row => [row.client_id, row.name, row.logo]);
  const baselineBytes = Buffer.byteLength(JSON.stringify(db), 'utf8');
  const owner = db.users.find(row => row.user_id === db.user.user_id);
  expect(owner.user_id).toBe('demo_admin');
  establishInitechBaseline(db, {dates});
  populateInitechAssessments(db, {dates, owner});
  const governance = populateInitechGovernance(db, {dates, owner});
  const operations = seedInitechOperations(db, {dates, owner});
  expect(outside(db)).toEqual(before);
  expect(db.users).toEqual(users); expect(db.user).toEqual(actor); expect(db.contacts).toEqual(contacts);
  expect(db.clients.map(row => [row.client_id, row.name, row.logo])).toEqual(clientOrder);
  expect(governance.assessments).toHaveLength(130); expect(governance.policies).toHaveLength(9);
  expect(governance.reviews).toHaveLength(15); expect(operations.reviews).toHaveLength(51);
  expect(operations.risks).toHaveLength(29); expect(operations.vendors).toHaveLength(15);
  expect(operations.ai_systems).toHaveLength(3); expect(operations.tasks).toHaveLength(10);
  const raw = JSON.stringify(db), receipt = {anchor:dates.anchor,
    stage:'Pre-expansion Demo plus Initech baseline, interviews, governance and operations; before history/files',
    baseline_utf8_bytes:baselineBytes, candidate_utf8_bytes:Buffer.byteLength(raw, 'utf8'),
    native_decode_limit_bytes:MAX_DEMO_DECODE_BYTES,
    per_key_utf8_bytes:Object.fromEntries(Object.entries(db).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value), 'utf8')])),
    claims:'In-memory native-domain integration and preliminary volume only; no Browser, storage roundtrip or final cumulative capacity claim'};
  if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
    const fs = require('fs'), path = require('path'), output = process.env.CIS_REBUILD_AUDIT_OUTPUT;
    fs.mkdirSync(output, {recursive:true});
    fs.writeFileSync(path.join(output, 'INITECH-PREHISTORY-CAPACITY.json'), JSON.stringify(receipt, null, 2)+'\n');
  }
  expect(receipt.candidate_utf8_bytes).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
});
