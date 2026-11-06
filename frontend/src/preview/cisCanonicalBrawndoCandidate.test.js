import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {buildCanonicalBrawndoCandidate} from './cisCanonicalBrawndoCandidate';
import {lightweightStore,restoreFiles,clearFileCache} from './evidenceStorage';
import {writePortfolioStore,readPortfolioStore} from './portfolioReporting';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {evidencePage} from './evidence';
import {MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import frozenFiles from './cisCanonicalBrawndoFiles.v3.json';

const {createHash}=require('crypto');
const {performance:measurementClock}=require('perf_hooks');
const copy=value=>JSON.parse(JSON.stringify(value));
const hash=base64=>createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex');
const CID='demo_brawndo',CLOCK=new Date('2026-11-02T12:00:00.000Z');
let db,result,receipt;
beforeAll(()=>{
  jest.useFakeTimers().setSystemTime(CLOCK);
  db=preExpansionCisFixture(CLOCK);
  const outside=copy(Object.fromEntries(Object.entries(db).filter(([,value])=>Array.isArray(value))
    .map(([key,rows])=>[key,rows.filter(row=>row.client_id!==CID)])));
  const started=measurementClock.now();
  result=buildCanonicalBrawndoCandidate(db,{clock:CLOCK});
  receipt={anchor:result.anchor,phase:'Complete Brawndo candidate including actual Evidence bytes/descriptors/links',
    construction_ms:measurementClock.now()-started,timing_method:'Node perf_hooks; not the mocked scenario clock or Browser timing',raw_chars:JSON.stringify(db).length,original_raw_limit:4000000,
    raw_guard_passes:JSON.stringify(db).length<4000000,artifact_count:result.evidence.length,
    target_counts:Object.fromEntries(['framework_assessments','policies','reviews','findings','tasks','risks','vendors','ai_systems','evidence']
      .map(kind=>[kind,db[kind].filter(row=>row.client_id===CID).length])),
    completed_occurrences:db.reviews.filter(row=>row.client_id===CID).reduce((sum,row)=>sum+(row.occurrences?.length||0),0),
    outside_unchanged:JSON.stringify(Object.fromEntries(Object.entries(db).filter(([,value])=>Array.isArray(value))
      .map(([key,rows])=>[key,rows.filter(row=>row.client_id!==CID)])))===JSON.stringify(outside)};
});
afterAll(()=>{clearFileCache();jest.useRealTimers();});

test('v3 immutable file recipes retain the independently Browser-verified frozen bytes',()=>{
  expect(result.anchor).toBe(frozenFiles.anchor);
  expect(result.revision).toBe(frozenFiles.scenario_revision);
  expect(Object.fromEntries(result.evidence.map(row=>[row.evidence_id,hash(row.content_base64)]))).toEqual(frozenFiles.sha256);
});

test('all original file bytes and full native occurrence snapshots survive the existing bounded storage roundtrip',()=>{
  const files=new Map(result.evidence.map(row=>[row.evidence_id,hash(row.content_base64)]));
  let saved,attempts=0;
  const physicalLimit=5*1024*1024;
  const storage={setItem(_key,value){attempts++;if(value.length*2>physicalLimit)throw new DOMException('Controlled 5MiB capacity','QuotaExceededError');saved=value;}};
  const lightweight=lightweightStore(db),started=measurementClock.now();
  writePortfolioStore(storage,'synthetic_candidate',lightweight);
  clearFileCache();
  const reloaded=restoreFiles(readPortfolioStore(saved));
  expect(copy(reloaded.reviews)).toEqual(copy(db.reviews));
  expect(copy(reloaded.guided_assessment_pilot)).toEqual(copy(db.guided_assessment_pilot));
  expect(copy(reloaded.framework_assessments)).toEqual(copy(db.framework_assessments));
  expect(receipt.outside_unchanged).toBe(true);
  for(const review of db.reviews.filter(row=>row.client_id===CID))for(const occurrence of review.occurrences){
    expect(occurrence.evidence.length).toBeGreaterThan(0);
    for(const reference of occurrence.evidence){
      const row=db.evidence.find(item=>item.evidence_id===reference.evidence_id);
      expect(reference).toEqual({evidence_id:row.evidence_id,filename:row.filename,version:1,sha256:null});
    }
  }
  for(const row of reloaded.evidence.filter(item=>item.client_id===CID)){
    const restored=row.content_base64?row:restoredCisDemoEvidence(reloaded,row);
    expect(restored).toBeTruthy();
    expect(hash(restored.content_base64)).toBe(files.get(row.evidence_id));
    expect(Buffer.from(restored.content_base64,'base64').length).toBe(row.size);
  }
  Object.assign(receipt,{controlled_storage_roundtrip:true,physical_limit_utf16_bytes:physicalLimit,
    physical_stored_utf16_bytes:saved.length*2,write_attempts:attempts,
    native_lightweight_chars:JSON.stringify(lightweight).length,roundtrip_and_all_file_check_ms:measurementClock.now()-started,
    artifact_sha256:Object.fromEntries(files),native_browser_capacity_verified:false});
  if(process.env.CIS_REBUILD_AUDIT_OUTPUT){
    const fs=require('fs'),path=require('path');fs.mkdirSync(process.env.CIS_REBUILD_AUDIT_OUTPUT,{recursive:true});
    fs.writeFileSync(path.join(process.env.CIS_REBUILD_AUDIT_OUTPUT,'BRAWNDO-FULL-CAPACITY.json'),JSON.stringify(receipt,null,2)+'\n');
  }
});

test('completed-occurrence Evidence remains reachable through the native retained-history library rule',()=>{
  const review=db.reviews.find(row=>row.client_id===CID&&row.occurrences.length),occurrence=review.occurrences[0];
  const reference=occurrence.evidence[0],row=db.evidence.find(item=>item.evidence_id===reference.evidence_id);
  row.archived_at=CLOCK.toISOString();
  try{
    const view=evidencePage(db,{client_id:CID,entity_type:'reviews',entity_id:review.review_id,
      occurrence_id:occurrence.occurrence_id,page_size:100});
    expect(view.items.some(item=>item.evidence_id===reference.evidence_id)).toBe(true);
  }finally{delete row.archived_at;}
});

test('the expanded fixture stays within the unchanged native decoded budget',()=>{
  // Robb explicitly approved native-limit qualification on 2026-11-02.
  // The earlier failed 4M results remain evidence; native quotas are unchanged.
  expect(Buffer.byteLength(JSON.stringify(db),'utf8')).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
});
