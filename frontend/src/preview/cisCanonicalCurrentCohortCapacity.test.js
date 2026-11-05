import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {buildCanonicalBrawndoCandidate} from './cisCanonicalBrawndoCandidate';
import {buildCanonicalInitechCandidate} from './cisCanonicalInitechCandidate';
import {establishKrustyBaseline} from './cisCanonicalKrustyBaseline';
import {populateKrustyAssessments} from './cisCanonicalKrustyAssessments';
import {populateKrustyGovernance} from './cisCanonicalKrustyGovernance';
import {seedKrustyOperations} from './cisCanonicalKrustyOperations';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {cisSummary} from '../lib/cisVerification';
import {lightweightStore,restoreFiles,clearFileCache} from './evidenceStorage';
import {writePortfolioStore,readPortfolioStore} from './portfolioReporting';
import {MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {canonicalReviewForecast} from './cisCanonicalReviewForecast';
import {krustyHistoryVolumePlan} from './cisCanonicalKrustyVolume';

const {createHash} = require('crypto');

const CLOCK = new Date('2026-11-04T12:00:00.000Z');
const CLIENTS = ['demo_brawndo','demo_initech','demo_krusty_krab'];
const physicalLimit = 5*1024*1024;
const copy = value => JSON.parse(JSON.stringify(value));
const utf8 = value => Buffer.byteLength(JSON.stringify(value),'utf8');
const fileHash = value => createHash('sha256').update(Buffer.from(value,'base64')).digest('hex');
const outside = db => Object.fromEntries(Object.entries(db).filter(([,value]) => Array.isArray(value))
  .map(([key,rows]) => [key,rows.filter(row => !CLIENTS.includes(row.client_id))]));
const targetCounts = (db,cid) => Object.fromEntries(Object.entries(db).filter(([,value]) => Array.isArray(value))
  .map(([key,rows]) => [key,rows.filter(row => row.client_id === cid).length]));
let db, originalOutside, report, originalFiles, krustySources;

function saveReport() {
  if (!process.env.CIS_REBUILD_AUDIT_OUTPUT) return;
  const fs = require('fs'), path = require('path'), directory = process.env.CIS_REBUILD_AUDIT_OUTPUT;
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'CURRENT-COHORT-CAPACITY.json'),JSON.stringify(report,null,2)+'\n');
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(CLOCK);
  const dates = cisDemoFixtureDates(CLOCK);
  db = preExpansionCisFixture(CLOCK); originalOutside = copy(outside(db));
  buildCanonicalBrawndoCandidate(db,{clock:CLOCK});
  buildCanonicalInitechCandidate(db,{clock:CLOCK});
  const owner = db.users.find(row => row.user_id === db.user.user_id);
  establishKrustyBaseline(db,{dates});
  populateKrustyAssessments(db,{dates,owner});
  const governance = populateKrustyGovernance(db,{dates,owner});
  const operations = seedKrustyOperations(db,{dates,owner});
  krustySources = {governance,operations};
  originalFiles = new Map(db.evidence.filter(row => ['demo_brawndo','demo_initech'].includes(row.client_id))
    .map(row => [row.evidence_id,fileHash(row.content_base64)]));
  report = {anchor:dates.anchor,timezone:'UTC',source_clients:db.clients.map(row => row.client_id),
    scope:'Fresh whole source cohort: complete Brawndo/Initech fixtures; current Krusty records; other clients unchanged.',
    limitation:'Krusty five-year history, operating sample files, verification and final fixture installation are not generated or qualified here. Separately proposed Dunder/Prestige work is not integrated.',
    native_browser_verified:false,raw_full_utf8_bytes:utf8(db),native_decode_limit_bytes:MAX_DEMO_DECODE_BYTES,
    existing_target_files:originalFiles.size,existing_target_file_sha256:Object.fromEntries(originalFiles),
    controlled_physical_limit_utf16_bytes:physicalLimit,counts:Object.fromEntries(CLIENTS.map(cid => [cid,targetCounts(db,cid)])),
    distribution:Object.fromEntries(CLIENTS.map(cid => [cid,cisSummary(db.framework_assessments.filter(row => row.client_id === cid && row.framework_key === 'cis-ig1'),CLOCK)])),
    historical_occurrences:Object.fromEntries(CLIENTS.map(cid => [cid,db.reviews.filter(row => row.client_id === cid)
      .reduce((count,row) => count+(row.occurrences || []).length,0)])),native_roundtrip:false};
  saveReport();
});

afterAll(() => {clearFileCache();jest.useRealTimers();});

test('the combined current fixtures preserve unrelated clients and reconcile cumulative status totals', () => {
  expect(outside(db)).toEqual(originalOutside);
  for (const [cid,total,addressed,partial,gap,notAssessed] of [
    ['demo_brawndo',56,48,4,2,2],['demo_initech',130,120,7,1,2],['demo_krusty_krab',153,153,0,0,0]
  ]) expect(report.distribution[cid]).toMatchObject({total,applicable:total,addressed,partial,gap,notAssessed});
  expect(report.counts.demo_krusty_krab).toMatchObject({policies:9,reviews:70,risks:29,vendors:15,ai_systems:3,tasks:10});
  expect(report.historical_occurrences.demo_krusty_krab).toBe(0);
  expect(originalFiles.size).toBe(61);
  expect(db.framework_assessments.filter(row => row.client_id === 'demo_krusty_krab')
    .every(row => row.assessment_history.length === 0 && row.verification === 'needs_validation')).toBe(true);
});

test('the actual current cohort persists through the unchanged native codec and controlled physical budget', () => {
  let saved;
  const attempts = [];
  const storage = {setItem(_key,value) {
    attempts.push({utf16_bytes:value.length*2,accepted:value.length*2<=physicalLimit});
    if (value.length*2>physicalLimit) throw new DOMException('Controlled existing 5MiB capacity','QuotaExceededError');
    saved = value;
  }};
  const lightweight = lightweightStore(db);
  report.lightweight_utf8_bytes = utf8(lightweight);
  try {
    writePortfolioStore(storage,'synthetic_current_cohort',lightweight);
    clearFileCache();
    const restored = restoreFiles(readPortfolioStore(saved));
    for (const key of ['clients','framework_assessments','guided_assessment_pilot','reviews','risks','vendors','ai_systems','tasks','policies','baselines'])
      expect(restored[key]).toEqual(copy(db[key]));
    expect(restored.evidence).toEqual(copy(lightweight.evidence));
    expect(restored.cis_demo_refresh).toEqual(copy(db.cis_demo_refresh));
    expect(restored.cis_demo_rollout).toEqual(copy(db.cis_demo_rollout));
    // Review snapshots expand on read; file payloads retain the existing inline budget.
    const expectedOutside = copy(outside(db));
    expectedOutside.evidence = copy(outside(lightweight).evidence);
    expect(outside(restored)).toEqual(expectedOutside);
    const restoredHashes = {};
    for (const row of restored.evidence.filter(item => originalFiles.has(item.evidence_id))) {
      const available = row.content_base64 ? row : restoredCisDemoEvidence(restored,row);
      expect(available).toBeTruthy();
      expect(Buffer.from(available.content_base64,'base64').length).toBe(row.size);
      restoredHashes[row.evidence_id] = fileHash(available.content_base64);
      expect(restoredHashes[row.evidence_id]).toBe(originalFiles.get(row.evidence_id));
    }
    expect(Object.keys(restoredHashes).sort()).toEqual([...originalFiles.keys()].sort());
    report.restored_target_file_sha256 = restoredHashes;
    report.all_existing_target_file_hashes_match = true;
    const encoded = JSON.parse(saved);
    report.encoded_utf8_bytes = encoded.demo_storage_codec ? encoded.utf8_bytes : Buffer.byteLength(saved,'utf8');
    report.stored_utf16_bytes = saved.length*2;
    report.codec = encoded.demo_storage_codec || 'plain JSON';
    expect(report.encoded_utf8_bytes).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
    expect(report.stored_utf16_bytes).toBeLessThanOrEqual(physicalLimit);
    report.native_roundtrip = true;
  } catch (error) {
    report.failure = {name:error.name,message:error.message};
    throw error;
  } finally {
    report.write_attempts = attempts;
    saveReport();
  }
});

test('Krusty native forecasting reaches twelve months without reviving terminal work or saving future completions', () => {
  const before = copy(db.reviews), dates = cisDemoFixtureDates(CLOCK);
  const forecast = canonicalReviewForecast(db.reviews,{client_id:'demo_krusty_krab',anchor:dates.anchor});
  expect(forecast.from_date).toBe(dates.day(0));
  expect(forecast.through_date).toBe(dates.month(12));
  expect(forecast.items.some(row => row.date>dates.month(11))).toBe(true);
  expect(forecast.items.every(row => row.date>=dates.day(0) && row.date<=dates.month(12))).toBe(true);
  const terminal = db.reviews.filter(row => row.client_id==='demo_krusty_krab' &&
    (row.risk_id && db.risks.some(risk => risk.risk_id===row.risk_id && risk.status==='closed') ||
      row.vendor_id && db.vendors.some(vendor => vendor.vendor_id===row.vendor_id && vendor.status==='inactive')));
  expect(terminal).toHaveLength(11);
  expect(forecast.items.every(row => !terminal.some(review => review.review_id===row.review_id))).toBe(true);
  expect(db.reviews).toEqual(before);
  report.future_forecast = {through_date:forecast.through_date,...forecast.summary,saved_occurrences_created:0};
  saveReport();
});

test('the real current Krusty cohort supplies an explicit past-period demand without creating completions', () => {
  const before = copy(db.reviews), reviews = db.reviews.filter(row => row.client_id==='demo_krusty_krab');
  const {governance,operations} = krustySources;
  let plan;
  try {
    plan = krustyHistoryVolumePlan(reviews,{anchor:report.anchor,organization_origin:operations.organization_origin,
      framework_origin:operations.origin,review_origins:operations.review_origins,
      framework_review_ids:governance.reviews.map(row => row.review_id)});
    report.history_demand_plan = plan;
    saveReport();
  } catch (error) {
    report.history_demand_error = {name:error.name,message:error.message};
    saveReport();
    throw error;
  }
  expect(plan.complete).toBe(true); expect(plan.unresolved).toEqual([]);
  expect(plan.counts).toMatchObject({review_parents:70,framework_review_parents:19,supplemental_review_parents:51});
  expect(plan.counts.planned_past_periods).toBeGreaterThan(0);
  expect(db.reviews).toEqual(before);
  expect(db.reviews.filter(row => row.client_id==='demo_krusty_krab').every(row => row.occurrences.length===0)).toBe(true);
  const existing = db.reviews.filter(row => ['demo_brawndo','demo_initech'].includes(row.client_id))
    .flatMap(row => row.occurrences || []).map(utf8).sort((left,right) => left-right);
  const maximum = existing[existing.length-1];
  report.occurrence_size_reference = {source:'Actual full existing Brawndo/Initech occurrence objects before native compaction',
    records:existing.length,minimum_utf8_bytes:existing[0],maximum_utf8_bytes:maximum,
    median_utf8_bytes:existing[Math.floor(existing.length/2)],
    estimated_new_occurrence_utf8_upper:maximum*plan.counts.planned_past_periods,
    limitation:'Occurrence-only conservative estimate. New assessments, verification, evidence and reporting data are excluded; final full-target native qualification remains required.'};
  saveReport();
});
