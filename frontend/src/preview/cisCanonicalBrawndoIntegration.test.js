import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {populateBrawndoModel} from './cisCanonicalBrawndoModel';
import {brawndoArtifactSpecs} from './cisCanonicalBrawndoBooks';
import {getCisDemoScenarioContext} from './cisDemoHistoryContext';
import {MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';

const CID='demo_brawndo', CLOCK=new Date('2026-11-02T12:00:00.000Z');
const copy=value=>JSON.parse(JSON.stringify(value));
const otherRows=db=>Object.fromEntries(Object.entries(db).filter(([,value])=>Array.isArray(value))
  .map(([key,rows])=>[key,rows.filter(row=>row.client_id!==CID)]));
beforeEach(()=>jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(()=>jest.useRealTimers());

test('the complete native Brawndo data model preserves unrelated records and measures capacity before installation',()=>{
  const db=preExpansionCisFixture(CLOCK), outside=copy(otherRows(db)), users=copy(db.users), before=JSON.stringify(db).length;
  const dates=cisDemoFixtureDates(CLOCK), {program,operations,history}=populateBrawndoModel(db,dates);
  const books=brawndoArtifactSpecs(dates.anchor), raw=JSON.stringify(db);
  const receipt={stage:'Complete Brawndo records/history, before Evidence rows/descriptors/bytes',
    anchor:dates.anchor, baseline_raw_chars:before, candidate_raw_chars:raw.length,
    original_limit_chars:4000000, passes_raw_guard:raw.length<4000000,
    assessments:program.assessments.length, reviews:history.reviews.length, occurrences:history.occurrence_count,
    risks:operations.risks.length,vendors:operations.vendors.length,ai_systems:operations.ai_systems.length,
    findings:history.findings.length,tasks:history.tasks.length,
    artifact_books:books.map(row=>({key:row.key,utf8_bytes:Buffer.byteLength(row.text,'utf8'),relationships:row.relationships.length})),
    per_key_chars:Object.fromEntries(Object.entries(db).map(([key,value])=>[key,JSON.stringify(value).length]))};
  if(process.env.CIS_REBUILD_AUDIT_OUTPUT){
    const fs=require('fs'),path=require('path'),out=process.env.CIS_REBUILD_AUDIT_OUTPUT;
    fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'BRAWNDO-CORE-CAPACITY.json'),JSON.stringify(receipt,null,2)+'\n');
    fs.writeFileSync(path.join(out,'BRAWNDO-CORE-SOURCE.json'),raw);
  }
  expect(otherRows(db)).toEqual(outside);
  expect(db.users).toEqual(users);
  expect(program.assessments.filter(row=>row.status==='addressed')).toHaveLength(48);
  expect(history.occurrence_count).toBeGreaterThan(60);
  expect(books.length).toBeLessThanOrEqual(32);
  expect(books.every(row=>Buffer.byteLength(row.text,'utf8')<=16384&&row.relationships.length<=100)).toBe(true);
  expect(getCisDemoScenarioContext({...db,cis_demo_refresh:{version:'cis81-showcase-v2',anchor:dates.anchor,
    clients:{[CID]:{version:'cis81-showcase-v2'}}}},CID,CLOCK.toISOString())).toBeTruthy();
  // Approved expanded-fixture qualification uses existing native limits. The
  // receipt still records failure against the historical 4M raw ceiling.
  expect(Buffer.byteLength(raw,'utf8')).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
});
