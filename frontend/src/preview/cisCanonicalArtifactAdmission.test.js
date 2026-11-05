import {CIS_SHOWCASE_VERSION} from '../lib/demoClients';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';
import {CIS_CANONICAL_SCENARIO_REVISION,canonicalArtifactLimit,resolveCanonicalArtifact,resolveCanonicalArtifacts} from './cisCanonicalArtifactBooks';
import * as brawndoBooks from './cisCanonicalBrawndoBooks';
import * as initechBooks from './cisCanonicalInitechBooks';
import * as krustyBooks from './cisCanonicalKrustyBooks';
import {registerCisDemoArtifact,registerCisDemoArtifacts,resolveCisDemoArtifact} from './cisDemoArtifactRecipes';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {renderCisOperationArtifact} from './cisDemoOperations';
import {renderCisOperatingArtifact} from './cisDemoOperatingEvidence';
import {clearFileCache,getEvidenceCacheRevision,lightweightStore,restoreFiles} from './evidenceStorage';

const {createHash}=require('crypto');
const K='demo_krusty_krab',ANCHOR='2030-01-01T00:00:00.000Z';
const copy=value=>JSON.parse(JSON.stringify(value));
const hash=base64=>createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex');
const recipe=(key,cid=K)=>({kind:'scenario_book',schema_version:1,fixture_version:CIS_SHOWCASE_VERSION,
  client_id:cid,anchor:ANCHOR,key,scenario_revision:CIS_CANONICAL_SCENARIO_REVISION});
const member=db=>db.cis_demo_refresh.clients[K];
let books;

function sourceStore(cid,evidence,canonicalRevision) {
  return {user:{workspace_mode:'demo'},clients:[{client_id:cid,environment:'Demo',status:'active'}],evidence,
    cis_demo_refresh:{version:CIS_SHOWCASE_VERSION,anchor:ANCHOR,timezone:'UTC',clients:{[cid]:{
      version:CIS_SHOWCASE_VERSION,state:'fresh_fixture',...(canonicalRevision?{canonical_revision:canonicalRevision}:{})}}}};
}
function fixture() {
  const recipes=books.map(book=>recipe(book.key)),evidenceRows=books.map(book=>{
    const bytes=Buffer.from(book.text,'utf8');
    return {evidence_id:book.evidence_id,client_id:K,filename:book.filename,mime_type:book.mime_type,
      linked_type:book.linked_type,linked_id:book.linked_id,occurrence_id:book.occurrence_id,
      content_base64:bytes.toString('base64'),size:bytes.length,version:1,
      created_at:ANCHOR,uploaded_at:ANCHOR,uploaded_by:'demo_admin',sha256:hash(bytes.toString('base64')),
      relationships:copy(book.relationships)};
  });
  return {db:sourceStore(K,evidenceRows,CIS_CANONICAL_SCENARIO_REVISION),recipes,evidenceRows};
}
function legacyFixture(cid,kind) {
  const source={kind,schema_version:1,fixture_version:CIS_SHOWCASE_VERSION,client_id:cid,anchor:ANCHOR,
    key:kind==='operation'?'evidence_vendor_current':'operating_periodic',
    ...(kind==='operation'?{title:'Synthetic Microsoft workspace assurance checklist',day:'2029-12-12'}:
      {rows:[{id:'1.1',state:'A',frequency:'s',trigger:false}]})};
  const bytes=kind==='operation'?renderCisOperationArtifact(source):renderCisOperatingArtifact(source);
  const timestamp=kind==='operation'?source.day+'T00:00:00.000Z':ANCHOR;
  const row={evidence_id:kind==='operation'?cid+'_'+source.key:cid+'_showcase_evidence_'+source.key,
    client_id:cid,filename:kind==='operation'?source.key+'.txt':'cis-'+source.key+'.csv',
    mime_type:kind==='operation'?'text/plain':'text/csv',version:1,...bytes,
    linked_type:kind==='operation'?'vendor':'framework_assessment',
    linked_id:kind==='operation'?cid+(cid==='demo_brawndo'?'_vendor_0':'_vendor_hosting'):'fw_'+cid+'_assessment_1.1',
    created_at:timestamp,uploaded_at:timestamp,uploaded_by:'demo_admin'};
  return {db:sourceStore(cid,[row],CIS_CANONICAL_SCENARIO_REVISION),row,source};
}
function expectAtomicRejection(db,operation) {
  const before=copy(db),inventory=member(db).artifacts;
  expect(operation).toThrow();
  expect(db).toEqual(before);expect(member(db).artifacts).toBe(inventory);
}

beforeAll(()=>{books=krustyBooks.krustyArtifactSpecs(ANCHOR);});
afterEach(()=>{jest.restoreAllMocks();clearFileCache();});

test('only exact Krusty canonical v3 receives the approved forty-file bound',()=>{
  expect(canonicalArtifactLimit(K,CIS_CANONICAL_SCENARIO_REVISION)).toBe(40);
  for(const cid of ['demo_brawndo','demo_initech','demo_dunder','demo_prestige','clients_demo_new',K+'-copy',null])
    expect(canonicalArtifactLimit(cid,CIS_CANONICAL_SCENARIO_REVISION)).toBe(32);
  for(const revision of [undefined,null,CIS_SHOWCASE_VERSION,'cis81-canonical-rebuild-v2','unknown',CIS_CANONICAL_SCENARIO_REVISION+' '])
    expect(canonicalArtifactLimit(K,revision)).toBe(32);
});

test('all thirty-seven real 2030 books register atomically and restore exact bytes after metadata reload and cache loss',()=>{
  const {db,recipes,evidenceRows}=fixture(),original=new Map(evidenceRows.map(row=>[row.evidence_id,copy(row)]));
  expect(books).toHaveLength(37);expect(recipes.at(-1).key).toBe('record-books-37');
  const resolved=resolveCanonicalArtifacts(recipes);
  expect(resolved).toHaveLength(37);
  for(const [index,value] of resolved.entries()) {
    expect(value.definition.evidence_id).toBe(evidenceRows[index].evidence_id);
    expect(value.content_base64).toBe(evidenceRows[index].content_base64);
    expect(value.size).toBe(evidenceRows[index].size);
    expect(value.size).toBeLessThanOrEqual(DEMO_INLINE_LIMIT);
    expect(evidenceRows[index].relationships.length).toBeLessThanOrEqual(100);
  }
  expect(registerCisDemoArtifacts(db,evidenceRows,recipes)).toBe(true);
  const inventory=member(db).artifacts;
  expect(Object.keys(inventory)).toHaveLength(37);
  expect(registerCisDemoArtifacts(db,evidenceRows,recipes)).toBe(true);
  expect(member(db).artifacts).toBe(inventory);
  for(const descriptor of Object.values(inventory))expect(JSON.stringify(descriptor.recipe).length).toBeLessThanOrEqual(24000);

  const persisted=copy(lightweightStore(db));clearFileCache();
  const reloaded=restoreFiles(copy(persisted)),before=copy(reloaded),cache=getEvidenceCacheRevision();
  expect(reloaded.evidence.filter(row=>!row.content_base64).length).toBeGreaterThan(32);
  for(const row of reloaded.evidence) {
    const expected=original.get(row.evidence_id),restored=row.content_base64?row:restoredCisDemoEvidence(reloaded,row);
    expect(restored).toEqual({...row,content_base64:expected.content_base64});
    expect(restored.size).toBe(expected.size);expect(hash(restored.content_base64)).toBe(expected.sha256);
  }
  expect(reloaded).toEqual(before);expect(getEvidenceCacheRevision()).toBe(cache);
  const cleared=reloaded.evidence.find(row=>!row.content_base64);cleared.demo_file_storage='cleared';
  expect(restoredCisDemoEvidence(reloaded,cleared)).toBeNull();
});

test('forty allowed keys still require real source content and forty-one rejects before enumeration or mutation',()=>{
  const enumerate=jest.spyOn(krustyBooks,'krustyArtifactSpecs');
  expect(resolveCanonicalArtifact(recipe('record-books-40'))).toBeNull();
  expect(enumerate).toHaveBeenCalledTimes(1);
  enumerate.mockClear();
  const recipes=Array.from({length:41},(_,index)=>recipe('record-books-'+(index+1)));
  expect(resolveCanonicalArtifacts(recipes)).toBeNull();expect(enumerate).not.toHaveBeenCalled();
  expect(resolveCanonicalArtifact(recipes.at(-1))).toBeNull();expect(enumerate).not.toHaveBeenCalled();
  const {db,evidenceRows}=fixture();
  for(let index=evidenceRows.length;index<41;index++)evidenceRows.push({...copy(evidenceRows[0]),
    evidence_id:K+'_canonical_evidence_record-books-'+(index+1),filename:'cis-record-books-'+(index+1)+'.csv'});
  expectAtomicRejection(db,()=>registerCisDemoArtifacts(db,evidenceRows,recipes));
  expect(enumerate).not.toHaveBeenCalled();
});

test('forty inventory entries retain valid source reads and forty-one refuses registration and fallback',()=>{
  const {db,evidenceRows,recipes}=fixture();
  expect(registerCisDemoArtifacts(db,evidenceRows,recipes)).toBe(true);
  // Occupancy sentinels exercise the count guard; they are never claimed as source books.
  for(let index=0;index<3;index++)member(db).artifacts['retained-'+index]={retained:true};
  expect(Object.keys(member(db).artifacts)).toHaveLength(40);
  const inventory=member(db).artifacts;
  expect(registerCisDemoArtifacts(db,evidenceRows,recipes)).toBe(true);
  expect(member(db).artifacts).toBe(inventory);
  expect(resolveCisDemoArtifact(db,evidenceRows.at(-1)).rendered.content_base64).toBe(evidenceRows.at(-1).content_base64);
  member(db).artifacts['retained-3']={retained:true};
  expect(Object.keys(member(db).artifacts)).toHaveLength(41);
  expectAtomicRejection(db,()=>registerCisDemoArtifacts(db,evidenceRows,recipes));
  expectAtomicRejection(db,()=>registerCisDemoArtifact(db,evidenceRows.at(-1),recipes.at(-1)));
  const row=evidenceRows.at(-1);delete row.content_base64;row.demo_file_storage='session_only';
  const before=copy(db);expect(resolveCisDemoArtifact(db,row)).toBeNull();
  expect(restoredCisDemoEvidence(db,row)).toBeNull();expect(db).toEqual(before);
});

test.each([
  ['mixed row client',({evidenceRows})=>{evidenceRows.at(-1).client_id='demo_initech';}],
  ['mixed recipe client',({recipes})=>{recipes.at(-1).client_id='demo_initech';}],
  ['mixed scenario revision',({recipes})=>{recipes.at(-1).scenario_revision=CIS_SHOWCASE_VERSION;}],
  ['mixed fixture version',({recipes})=>{recipes.at(-1).fixture_version='unknown';}],
  ['mixed recipe kind',({recipes})=>{recipes.at(-1).kind='operating';}],
  ['different Evidence version',({evidenceRows})=>{evidenceRows.at(-1).version=2;}],
  ['different member revision',({db})=>{member(db).canonical_revision=CIS_SHOWCASE_VERSION;}],
  ['mixed anchor',({recipes})=>{recipes.at(-1).anchor='2030-01-02T00:00:00.000Z';}],
  ['foreign primary relationship',({evidenceRows})=>{evidenceRows.at(-1).linked_id='demo_initech_foreign_parent';}],
  ['more than one hundred links',({evidenceRows})=>{evidenceRows.at(-1).relationships=Array.from({length:101},()=>({kind:'policies',id:K+'_policy'}));}],
  ['oversized original file',({evidenceRows})=>{Object.assign(evidenceRows.at(-1),{size:16385,content_base64:Buffer.alloc(16385).toString('base64')});}],
  ['oversized source descriptor',({recipes})=>{recipes.at(-1).extra='x'.repeat(24001);}]
])('%s cannot partially register an otherwise valid thirty-seven-book batch',(_label,change)=>{
  const value=fixture();change(value);
  expectAtomicRejection(value.db,()=>registerCisDemoArtifacts(value.db,value.evidenceRows,value.recipes));
});

test('Brawndo, Initech and unknown clients cannot use the Krusty thirty-three-key allowance',()=>{
  const enumerations=[jest.spyOn(brawndoBooks,'brawndoArtifactSpecs'),jest.spyOn(initechBooks,'initechArtifactSpecs'),
    jest.spyOn(krustyBooks,'krustyArtifactSpecs')];
  for(const cid of ['demo_brawndo','demo_initech','demo_dunder','demo_prestige','clients_demo_new'])
    expect(resolveCanonicalArtifacts(Array.from({length:33},(_,index)=>recipe('record-books-'+(index+1),cid)))).toBeNull();
  for(const enumerate of enumerations)expect(enumerate).not.toHaveBeenCalled();
});

test.each(['operation','operating'])('retained v2 %s keeps its thirty-two-descriptor admission and read bound even under a v3 member marker',kind=>{
  for(const cid of ['demo_brawndo','demo_initech',K]) {
    const {db,row,source}=legacyFixture(cid,kind),cohort=db.cis_demo_refresh.clients[cid];
    expect(registerCisDemoArtifact(db,row,source)).toBe(true);
    const original=row.content_base64;delete row.content_base64;row.demo_file_storage='session_only';
    expect(restoredCisDemoEvidence(db,row).content_base64).toBe(original);
    for(let index=0;index<32;index++)cohort.artifacts['retained-'+index]={retained:true};
    const before=copy(db);expect(restoredCisDemoEvidence(db,row)).toBeNull();expect(db).toEqual(before);
    row.content_base64=original;
    const overfull=copy(db),overfullInventory=cohort.artifacts;
    expect(()=>registerCisDemoArtifact(db,row,source)).toThrow(/inventory.*full/i);
    expect(cohort.artifacts).toBe(overfullInventory);expect(db).toEqual(overfull);
    delete cohort.artifacts[row.evidence_id];
    const inventory=cohort.artifacts,full=copy(db);
    expect(Object.keys(inventory)).toHaveLength(32);
    expect(()=>registerCisDemoArtifact(db,row,source)).toThrow(/inventory.*full/i);
    expect(cohort.artifacts).toBe(inventory);expect(db).toEqual(full);
  }
});
