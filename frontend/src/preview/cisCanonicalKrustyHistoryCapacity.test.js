import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {buildCanonicalBrawndoCandidate} from './cisCanonicalBrawndoCandidate';
import {buildCanonicalInitechCandidate} from './cisCanonicalInitechCandidate';
import {populateKrustyModel} from './cisCanonicalKrustyModel';
import {prepareCanonicalCisOnboarding} from './cisCanonicalScope';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {lightweightStore,restoreFiles,clearFileCache} from './evidenceStorage';
import {writePortfolioStore,readPortfolioStore} from './portfolioReporting';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import {cisSummary} from '../lib/cisVerification';

const {createHash} = require('crypto');
const CID = 'demo_krusty_krab', CLIENTS = ['demo_brawndo','demo_initech',CID];
const CLOCK = new Date('2026-11-04T12:00:00.000Z'), dates = cisDemoFixtureDates(CLOCK);
const PHYSICAL_LIMIT = 5*1024*1024;
const copy = value => JSON.parse(JSON.stringify(value));
const utf8 = value => Buffer.byteLength(JSON.stringify(value),'utf8');
const hash = value => createHash('sha256').update(Buffer.from(value,'base64')).digest('hex');
let db, model, originalOutside, beforeKrusty, originalFiles, report;

function saveReport() {
  report.preflight_passed = !!(report.cohort_reconciled && report.native_roundtrip);
  if (!process.env.CIS_REBUILD_AUDIT_OUTPUT) return;
  const fs = require('fs'), path = require('path'), directory = process.env.CIS_REBUILD_AUDIT_OUTPUT;
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'KRUSTY-FULL-HISTORY-CAPACITY.json'),JSON.stringify(report,null,2)+'\n');
}

function outsideClients(value,clientIds) {
  const other = copy(value);
  for (const cid of clientIds) prepareCanonicalCisOnboarding(other,cid,{purpose:'canonical_fixture_build'});
  other.clients = other.clients.filter(row => !clientIds.includes(row.client_id));
  for (const cid of clientIds) delete other.baselines[cid];
  // Native creation may leave these optional containers empty after scope removal.
  for (const key of ['ai_intake','command_requests','guided_assessment_pilot']) {
    if (other[key] && typeof other[key] === 'object' && !Array.isArray(other[key]) && Object.keys(other[key]).length === 0)
      delete other[key];
  }
  return other;
}

function domainRecords(value) {
  const records = copy(value);
  // Native Portfolio restore retains these opaque serialization backing pools.
  // Expanded snapshots/scopes/source references and every domain field remain compared.
  for (const key of ['storage_version','source_records','source_vectors']) delete records.portfolio_reporting?.[key];
  return records;
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(CLOCK);
  report = {anchor:dates.anchor,timezone:'UTC',stage:'before construction',construction_complete:false,
    scope:'Fresh complete native Brawndo/Initech fixtures plus full Krusty native Model history/current records.',
    excluded:'Krusty Books/files and later collection-day synthetic verification are NOT generated or qualified. The open measured51-file contract decision and final full Candidate capacity are not resolved by this preflight. Separate Dunder/Prestige proposals are not integrated.',
    qualification:'Native in-memory storage/cache-loss preflight only; not Browser quota, download, hosted persistence, activation, CI or acceptance proof.',
    native_browser_verified:false,native_decode_limit_bytes:MAX_DEMO_DECODE_BYTES,
    controlled_physical_limit_utf16_bytes:PHYSICAL_LIMIT,cohort_reconciled:false,native_roundtrip:false,
    all_61_existing_file_hashes_match:false};
  saveReport();
  try {
    report.stage = 'constructing source cohort';
    db = preExpansionCisFixture(CLOCK); originalOutside = outsideClients(db,CLIENTS);
    buildCanonicalBrawndoCandidate(db,{clock:CLOCK});
    buildCanonicalInitechCandidate(db,{clock:CLOCK});
    beforeKrusty = outsideClients(db,[CID]);
    originalFiles = new Map(db.evidence.filter(row => ['demo_brawndo','demo_initech'].includes(row.client_id))
      .map(row => [row.evidence_id,hash(row.content_base64)]));
    report.stage = 'constructing complete Krusty native history without Books or later verification';
    model = populateKrustyModel(db,dates);
    Object.assign(report,{construction_complete:true,stage:'constructed; assertions pending',raw_full_utf8_bytes:utf8(db),
      source_clients:db.clients.map(row => row.client_id),existing_file_count:originalFiles.size,
      original_file_sha256:Object.fromEntries(originalFiles),krusty_review_parents:model.history.reviews.length,
      krusty_historical_occurrences:model.history.occurrence_count,krusty_file_count:db.evidence.filter(row => row.client_id === CID).length,
      krusty_verification_counts:Object.fromEntries(['verified','needs_validation'].map(state => [state,
        model.program.assessments.filter(row => row.verification === state).length]))});
  } catch (error) {
    report.failure = {stage:report.stage,name:error.name,message:error.message};
    throw error;
  } finally {saveReport();}
});

afterAll(() => {clearFileCache();jest.useRealTimers();});

test('the real full native history cohort preserves foreign scopes and61 existing files while excluding Krusty Books and later verification', () => {
  try {
    expect(outsideClients(db,CLIENTS)).toEqual(originalOutside);
    expect(outsideClients(db,[CID])).toEqual(beforeKrusty);
    expect(originalFiles.size).toBe(61);
    const files = db.evidence.filter(row => ['demo_brawndo','demo_initech'].includes(row.client_id));
    expect(files.map(row => row.evidence_id).sort()).toEqual([...originalFiles.keys()].sort());
    for (const row of files) expect(hash(row.content_base64)).toBe(originalFiles.get(row.evidence_id));
    expect(model.program.assessments).toHaveLength(153);
    expect(cisSummary(model.program.assessments,CLOCK)).toMatchObject({total:153,applicable:153,addressed:153,partial:0,gap:0});
    expect(model.program.assessments.every(row => row.verification === 'needs_validation' && row.verification_checklist === null
      && row.assessment_history.at(-1).at === row.last_saved && row.last_saved < dates.anchor)).toBe(true);
    expect(model.history.reviews).toHaveLength(70);
    expect(model.history.occurrence_count).toBe(514);
    expect(model.history.volume_plan.complete).toBe(true);
    expect(model.history.occurrence_count).toBe(model.history.volume_plan.counts.planned_past_periods);
    expect(model.history.reviews.reduce((sum,row) => sum+row.occurrences.length,0)).toBe(514);
    expect(db.evidence.filter(row => row.client_id === CID)).toEqual([]);
    // Opaque unrelated preservation sentinels; no other Demo scenario is populated.
    const withForeign = copy(db), foreignCid = 'history-capacity-unrelated';
    const requestKey = JSON.stringify(['retained-owner',foreignCid,'/retained','history-capacity-sentinel']);
    const foreignMaps = {
      ai_intake:{[foreignCid]:{client_id:foreignCid,usage:'unsure',indicators:[],updated_at:'retained-source-version'}},
      command_requests:{[requestKey]:{fingerprint:'retained-foreign-request',result:{keep:'Original foreign receipt'}}},
      guided_assessment_pilot:{[foreignCid+'_assessment:retained-owner']:{client_id:foreignCid,
        assessment_id:foreignCid+'_assessment',answers:{note:'Original foreign draft'},revision:3}}
    };
    for (const [key,entries] of Object.entries(foreignMaps)) withForeign[key] = {...withForeign[key],...copy(entries)};
    const expectedForeign = outsideClients(withForeign,[CID]);
    populateKrustyModel(withForeign,dates);
    const actualForeign = outsideClients(withForeign,[CID]);
    expect(actualForeign).toEqual(expectedForeign);
    for (const [key,entries] of Object.entries(foreignMaps)) for (const [id,value] of Object.entries(entries))
      expect(actualForeign[key][id]).toEqual(value);
    report.cohort_reconciled = true;
  } catch (error) {
    report.failure = {stage:'cohort reconciliation',name:error.name,message:error.message};
    throw error;
  } finally {saveReport();}
});

test('all complete native records and61 existing file hashes survive the unchanged codec and controlled physical storage after cache loss', () => {
  let saved;
  const attempts = [], storage = {setItem(_key,value) {
    const physical = value.length*2;
    attempts.push({utf8_bytes:Buffer.byteLength(value,'utf8'),utf16_bytes:physical,accepted:physical<=PHYSICAL_LIMIT});
    if (physical>PHYSICAL_LIMIT) throw new DOMException('Controlled existing 5MiB capacity','QuotaExceededError');
    saved = value;
  }};
  try {
    report.stage = 'native lightweight/write/read/restore roundtrip';
    const lightweight = lightweightStore(db);
    report.lightweight_utf8_bytes = utf8(lightweight);
    writePortfolioStore(storage,'synthetic_krusty_full_history_without_books',lightweight);
    const encoded = JSON.parse(saved), decodedBytes = encoded.demo_storage_codec ? encoded.utf8_bytes : Buffer.byteLength(saved,'utf8');
    Object.assign(report,{codec:encoded.demo_storage_codec || 'plain JSON',stored_utf8_bytes:Buffer.byteLength(saved,'utf8'),
      native_decoded_utf8_bytes:decodedBytes,stored_utf16_bytes:saved.length*2});
    clearFileCache();
    const restored = restoreFiles(readPortfolioStore(saved)), expected = domainRecords(db);
    expected.evidence = copy(lightweight.evidence);
    expect(domainRecords(restored)).toEqual(expected);
    const restoredHashes = {};
    report.restored_file_sha256 = restoredHashes;
    for (const row of restored.evidence.filter(item => originalFiles.has(item.evidence_id))) {
      const available = row.content_base64 ? row : restoredCisDemoEvidence(restored,row);
      expect(available).toBeTruthy(); expect(Buffer.from(available.content_base64,'base64').length).toBe(row.size);
      restoredHashes[row.evidence_id] = hash(available.content_base64);
      expect(restoredHashes[row.evidence_id]).toBe(originalFiles.get(row.evidence_id));
    }
    expect(Object.keys(restoredHashes).sort()).toEqual([...originalFiles.keys()].sort());
    expect(decodedBytes).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
    expect(saved.length*2).toBeLessThanOrEqual(PHYSICAL_LIMIT);
    report.all_61_existing_file_hashes_match = true;
    report.native_roundtrip = true;
    report.stage = 'complete native history preflight only; Krusty Books/later verification remain excluded';
  } catch (error) {
    report.failure = {stage:report.stage,name:error.name,message:error.message};
    throw error;
  } finally {report.write_attempts = attempts;saveReport();}
});
