import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {buildCanonicalInitechCandidate} from './cisCanonicalInitechCandidate';
import {lightweightStore,restoreFiles,clearFileCache} from './evidenceStorage';
import {writePortfolioStore,readPortfolioStore} from './portfolioReporting';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {evidencePage} from './evidence';
import {MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import * as recipes from './cisDemoArtifactRecipes';

const {createHash} = require('crypto');
const CID = 'demo_initech', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(Buffer.from(value,'base64')).digest('hex');
const outside = db => Object.fromEntries(Object.entries(db).filter(([,value]) => Array.isArray(value))
  .map(([kind,rows]) => [kind,rows.filter(row => row.client_id !== CID)]));
let db, result, originalOutside, originalBytes, saved, reloaded, receipt;

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(CLOCK);
  db = preExpansionCisFixture(CLOCK); originalOutside = copy(outside(db));
  result = buildCanonicalInitechCandidate(db,{clock:CLOCK});
  originalBytes = new Map(result.evidence.map(row => [row.evidence_id,hash(row.content_base64)]));
  receipt = {anchor:result.anchor,stage:'Complete Initech fixture, including real synthetic byte payloads and occurrence links',
    raw_chars:JSON.stringify(db).length,utf8_bytes:Buffer.byteLength(JSON.stringify(db),'utf8'),
    historical_raw_ceiling_chars:4000000,historical_raw_ceiling_passes:JSON.stringify(db).length < 4000000,
    native_decoded_limit_bytes:MAX_DEMO_DECODE_BYTES,files:result.evidence.length,
    file_sha256:Object.fromEntries(originalBytes),completed_occurrences:result.history.occurrence_count,
    native_browser_verified:false,qualification:'Native in-memory domain/storage test only; not Browser or hosted proof'};
});
afterAll(() => {clearFileCache(); jest.useRealTimers();});

test('the complete fixture preserves unrelated records and stays within native decoded limits', () => {
  expect(outside(db)).toEqual(originalOutside);
  expect(result.evidence).toHaveLength(30);
  expect(result.history.occurrence_count).toBe(238);
  expect(receipt.utf8_bytes).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
  for (const row of result.evidence) {
    expect(Buffer.from(row.content_base64,'base64').length).toBe(row.size);
    expect(row.size).toBeLessThanOrEqual(16384); expect(row.relationships.length).toBeLessThanOrEqual(100);
  }
});

test('full native history and available files survive cache loss and the unchanged controlled storage contract', () => {
  const physicalLimit = 5*1024*1024;
  let attempts = 0;
  const storage = {setItem(_key,value) {
    attempts++;
    if (value.length*2 > physicalLimit) throw new DOMException('Controlled 5MiB capacity','QuotaExceededError');
    saved = value;
  }};
  writePortfolioStore(storage,'synthetic_initech',lightweightStore(db));
  clearFileCache(); reloaded = restoreFiles(readPortfolioStore(saved));
  expect(reloaded.reviews).toEqual(copy(db.reviews));
  expect(reloaded.framework_assessments).toEqual(copy(db.framework_assessments));
  expect(reloaded.guided_assessment_pilot).toEqual(copy(db.guided_assessment_pilot));
  for (const review of reloaded.reviews.filter(row => row.client_id === CID)) for (const occurrence of review.occurrences) {
    expect(occurrence.evidence.length).toBeGreaterThan(0);
    for (const link of occurrence.evidence) expect(reloaded.evidence.some(row => row.evidence_id === link.evidence_id)).toBe(true);
  }
  let restoredCount = 0;
  for (const row of reloaded.evidence.filter(row => row.client_id === CID)) {
    const file = row.content_base64 ? row : restoredCisDemoEvidence(reloaded,row);
    expect(file).toBeTruthy(); expect(hash(file.content_base64)).toBe(originalBytes.get(row.evidence_id));
    expect(Buffer.from(file.content_base64,'base64').length).toBe(row.size); restoredCount++;
  }
  Object.assign(receipt,{controlled_roundtrip:true,physical_limit_utf16_bytes:physicalLimit,
    stored_utf16_bytes:saved.length*2,write_attempts:attempts,all_file_hashes_match:restoredCount === originalBytes.size});
  if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
    const fs = require('fs'), path = require('path'), output = process.env.CIS_REBUILD_AUDIT_OUTPUT;
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'INITECH-FULL-CAPACITY.json'),JSON.stringify(receipt,null,2)+'\n');
    fs.writeFileSync(path.join(output,'INITECH-FULL-SOURCE.json'),JSON.stringify(db)+'\n');
  }
});

test('historical occurrence files stay reachable without treating future occurrences as completed', () => {
  const review = db.reviews.find(row => row.client_id === CID && row.occurrences.length), occurrence = review.occurrences[0];
  const row = db.evidence.find(item => item.evidence_id === occurrence.evidence[0].evidence_id);
  row.archived_at = CLOCK.toISOString();
  try {
    const view = evidencePage(db,{client_id:CID,entity_type:'reviews',entity_id:review.review_id,
      occurrence_id:occurrence.occurrence_id,page_size:100});
    expect(view.items.some(item => item.evidence_id === row.evidence_id)).toBe(true);
  } finally {delete row.archived_at;}
  expect(db.reviews.filter(item => item.client_id === CID && !['cancelled','completed'].includes(item.status))
    .every(item => !item.completed_at && !item.completion_date)).toBe(true);
});

test('cleared, altered and foreign file metadata fail closed while legitimate notes remain editable', () => {
  const source = reloaded.evidence.find(row => row.client_id === CID && !row.content_base64);
  expect(source).toBeDefined();
  const row = copy(source), scoped = {...reloaded,evidence:reloaded.evidence.map(item => item.evidence_id === row.evidence_id ? row : item)};
  row.notes = 'Disposable visitor notes';
  expect(hash(restoredCisDemoEvidence(scoped,row).content_base64)).toBe(originalBytes.get(row.evidence_id));
  row.demo_file_storage = 'cleared'; expect(restoredCisDemoEvidence(scoped,row)).toBeNull();
  Object.assign(row,source); row.filename = 'altered.csv'; expect(restoredCisDemoEvidence(scoped,row)).toBeNull();
  Object.assign(row,source); row.client_id = 'foreign_demo'; expect(restoredCisDemoEvidence(scoped,row)).toBeNull();
});

test('authenticated context is rejected without changing its input records', () => {
  const original = preExpansionCisFixture(CLOCK);
  original.user.workspace_mode = 'authenticated'; const denied = copy(original);
  expect(() => buildCanonicalInitechCandidate(original,{clock:CLOCK})).toThrow(); expect(original).toEqual(denied);
});

test('late registration failure leaves the entire input scenario untouched', () => {
  const original = preExpansionCisFixture(CLOCK), before = copy(original), native = recipes.registerCisDemoArtifacts;
  const registration = jest.spyOn(recipes,'registerCisDemoArtifacts').mockImplementation((...args) => {
    native(...args); return false;
  });
  try {
    expect(() => buildCanonicalInitechCandidate(original,{clock:CLOCK})).toThrow('registration failed');
    expect(registration).toHaveBeenCalledTimes(1); expect(original).toEqual(before);
  } finally {registration.mockRestore();}
});
