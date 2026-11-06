import {CIS_SHOWCASE_VERSION} from '../lib/demoClients';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';
import {CIS_CANONICAL_SCENARIO_REVISION,canonicalArtifactDefinition,renderCanonicalArtifact,resolveCanonicalArtifact,resolveCanonicalArtifacts} from './cisCanonicalArtifactBooks';
import {registerCisDemoArtifact,registerCisDemoArtifacts,cisDemoArtifactDescriptor,resolveCisDemoArtifact} from './cisDemoArtifactRecipes';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {renderCisOperationArtifact} from './cisDemoOperations';
import {renderCisOperatingArtifact} from './cisDemoOperatingEvidence';
import {getEvidenceCacheRevision} from './evidenceStorage';
import {brawndoArtifactSpecs} from './cisCanonicalBrawndoBooks';
import * as bookSources from './cisCanonicalBrawndoBooks';

const {createHash}=require('crypto');
const CID='demo_brawndo',ANCHOR='2026-11-02T00:00:00.000Z';
const copy=value=>JSON.parse(JSON.stringify(value));
const hash=base64=>createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex');
const recipe=()=>({kind:'scenario_book',schema_version:1,fixture_version:CIS_SHOWCASE_VERSION,
  client_id:CID,anchor:ANCHOR,key:'safeguards-1',scenario_revision:CIS_CANONICAL_SCENARIO_REVISION});
let originalFixture;
function prepared() {
  if(!originalFixture) {
    const source=recipe(),definition=canonicalArtifactDefinition(source),bytes=renderCanonicalArtifact(source);
    if(!definition||!bytes)throw new Error('The fixed Brawndo safeguards-1 book must exist.');
    const row={evidence_id:definition.evidence_id,client_id:CID,filename:definition.filename,mime_type:definition.mime_type,
      linked_type:definition.linked_type,linked_id:definition.linked_id,occurrence_id:definition.occurrence_id,
      version:1,...bytes,sha256:hash(bytes.content_base64),
      created_at:ANCHOR,uploaded_at:ANCHOR,uploaded_by:'fictional-uploader',uploaded_by_email:'fictional@example.test',
      display_name:'Original fictional book',notes:'Original notes',relationships:[]};
    const db={user:{workspace_mode:'demo'},clients:[{client_id:CID,environment:'Demo',status:'active'}],evidence:[row],
      cis_demo_refresh:{version:CIS_SHOWCASE_VERSION,anchor:ANCHOR,timezone:'UTC',clients:{[CID]:{
        version:CIS_SHOWCASE_VERSION,state:'fresh_fixture',canonical_revision:CIS_CANONICAL_SCENARIO_REVISION}}}};
    registerCisDemoArtifact(db,row,source);
    originalFixture={db,source,text:definition.text,original:bytes.content_base64};
  }
  const fixture=copy(originalFixture);fixture.row=fixture.db.evidence[0];
  return fixture;
}
function evicted(row) {delete row.content_base64;row.demo_file_storage='session_only';return row;}
let initialBooks;
function batchFixture() {
  initialBooks ||= brawndoArtifactSpecs(ANCHOR);
  const books=copy(initialBooks),{db,row}=prepared();
  const recipes=books.map(book=>({...recipe(),key:book.key}));
  const evidenceRows=books.map(book=>{
    const bytes=Buffer.from(book.text,'utf8'),content_base64=bytes.toString('base64');
    return {...row,evidence_id:book.evidence_id,filename:book.filename,mime_type:book.mime_type,
      linked_type:book.linked_type,linked_id:book.linked_id,occurrence_id:book.occurrence_id,
      content_base64,size:bytes.length,sha256:hash(content_base64),relationships:book.relationships};
  });
  db.evidence=evidenceRows;
  return {db,books,recipes,evidenceRows};
}
afterEach(()=>jest.restoreAllMocks());

test('a fixed allowlisted book renders deterministic original UTF-8 CSV bytes within the unchanged file bound',()=>{
  const source=recipe(),definition=canonicalArtifactDefinition(source),first=renderCanonicalArtifact(source),second=renderCanonicalArtifact(copy(source));
  expect(first).toEqual(second);expect(definition.evidence_id).toBe(CID+'_canonical_evidence_safeguards-1');
  expect(definition.filename).toBe('cis-safeguards-1.csv');expect(definition.mime_type).toBe('text/csv');
  expect(Buffer.from(first.content_base64,'base64').toString('utf8')).toBe(definition.text);
  expect(definition.text).toMatch(/DEMO.*SYNTHETIC/i);expect(definition.text).toContain('1.1');
  expect(first.size).toBe(Buffer.from(first.content_base64,'base64').length);
  expect(first.size).toBeGreaterThan(0);expect(first.size).toBeLessThanOrEqual(DEMO_INLINE_LIMIT);
  expect(definition.occurrence_id).toBeNull();
  expect(resolveCanonicalArtifact(source)).toEqual({definition,...first});
});

test('empty-cache restoration preserves exact original bytes/hash and legitimate later metadata without writing records or caches',()=>{
  const {db,row,original}=prepared();evicted(row);
  row.display_name='Authorized later label';row.notes='Authorized later note';row.evidence_date='2026-10-30';
  row.relationships=[{kind:'risks',id:CID+'_canonical_risk_asset-owners'}];
  db.framework_assessments=[{framework_assessment_id:row.linked_id,client_id:CID,status:'addressed',implementation:'Later visitor edit'}];
  const before=copy(db),revision=getEvidenceCacheRevision(),restored=restoredCisDemoEvidence(db,row);
  expect(restored.content_base64).toBe(original);expect(hash(restored.content_base64)).toBe(row.sha256);
  for(const key of ['display_name','notes','evidence_date','relationships'])expect(restored[key]).toEqual(row[key]);
  expect(db).toEqual(before);expect(getEvidenceCacheRevision()).toBe(revision);
  expect(row.content_base64).toBeUndefined();
  expect(JSON.stringify(cisDemoArtifactDescriptor(db,row))).not.toContain(original);
  const resolved=resolveCisDemoArtifact(db,row);
  expect(resolved.descriptor).toBe(db.cis_demo_refresh.clients[CID].artifacts[row.evidence_id]);
  expect(resolved.rendered).toEqual({content_base64:original,size:row.size});
});

test('a historical Review book binds its original occurrence and never creates an unqualified current-cycle relationship',()=>{
  const source={...recipe(),key:'review-executions-1'},definition=canonicalArtifactDefinition(source),bytes=renderCanonicalArtifact(source);
  const book=brawndoArtifactSpecs(ANCHOR).find(item=>item.key===source.key);
  expect(definition.linked_type).toBe('review');
  expect(definition.occurrence_id).toBeTruthy();expect(definition.occurrence_id).not.toBe('occ_'+definition.linked_id);
  const references=book.relationships.filter(link=>link.kind==='reviews');
  expect(references.length).toBeGreaterThan(0);
  expect(references.every(link=>typeof link.occurrence_id==='string'&&!!link.occurrence_id)).toBe(true);
  expect(references.some(link=>link.id===definition.linked_id&&link.occurrence_id===definition.occurrence_id)).toBe(true);
  const {db,row}=prepared();
  Object.assign(row,{evidence_id:definition.evidence_id,filename:definition.filename,mime_type:definition.mime_type,
    linked_type:definition.linked_type,linked_id:definition.linked_id,occurrence_id:definition.occurrence_id,
    ...bytes,sha256:hash(bytes.content_base64)});
  db.cis_demo_refresh.clients[CID].artifacts={};
  registerCisDemoArtifact(db,row,source);evicted(row);
  expect(restoredCisDemoEvidence(db,row).content_base64).toBe(bytes.content_base64);
  row.occurrence_id=null;
  expect(restoredCisDemoEvidence(db,row)).toBeNull();
});

test.each(['risk_review_','vendor_review_'])('actual %s primary books retain native ownership and exact historical byte recovery',prefix=>{
  const book=brawndoArtifactSpecs(ANCHOR).find(item=>item.linked_type==='review'&&item.linked_id.startsWith(prefix+CID+'_'));
  expect(book).toBeTruthy();
  const source={...recipe(),key:book.key},definition=canonicalArtifactDefinition(source),bytes=renderCanonicalArtifact(source);
  expect(definition.linked_id).toBe(book.linked_id);expect(definition.occurrence_id).toBe(book.occurrence_id);
  expect(definition.occurrence_id.startsWith(definition.linked_id+'_')).toBe(true);
  const {db,row}=prepared();
  Object.assign(row,{evidence_id:definition.evidence_id,filename:definition.filename,mime_type:definition.mime_type,
    linked_type:definition.linked_type,linked_id:definition.linked_id,occurrence_id:definition.occurrence_id,
    ...bytes,sha256:hash(bytes.content_base64)});
  db.cis_demo_refresh.clients[CID].artifacts={};
  expect(registerCisDemoArtifact(db,row,source)).toBe(true);evicted(row);
  expect(restoredCisDemoEvidence(db,row).content_base64).toBe(bytes.content_base64);
  const original=copy(row);
  for(const other of ['demo_initech','demo_krusty_krab','demo_dunder','visitor_demo']) {
    row.linked_id=book.linked_id.replace(prefix+CID+'_',prefix+other+'_');
    row.occurrence_id=book.occurrence_id.replace(prefix+CID+'_',prefix+other+'_');
    expect(restoredCisDemoEvidence(db,row)).toBeNull();
  }
  Object.assign(row,original);
  expect(hash(restoredCisDemoEvidence(db,row).content_base64)).toBe(row.sha256);
});

test('batch resolution enumerates the actual fixed source once and returns every ordered original definition and byte payload',()=>{
  const {books,recipes}=batchFixture(),enumerate=jest.spyOn(bookSources,'brawndoArtifactSpecs'),single=jest.spyOn(bookSources,'brawndoArtifactDefinition');
  const resolved=resolveCanonicalArtifacts(recipes);
  expect(enumerate).toHaveBeenCalledTimes(1);expect(enumerate).toHaveBeenCalledWith(ANCHOR);expect(single).not.toHaveBeenCalled();
  expect(resolved).toHaveLength(books.length);expect(resolved.length).toBeLessThanOrEqual(32);
  for(const [index,source] of resolved.entries()) {
    expect(source.definition.evidence_id).toBe(books[index].evidence_id);
    expect(source.definition.occurrence_id).toBe(books[index].occurrence_id);
    expect(Buffer.from(source.content_base64,'base64').toString('utf8')).toBe(books[index].text);
    expect(source.size).toBe(Buffer.byteLength(books[index].text,'utf8'));
  }
});

test('one atomic registration enumerates once, preserves an existing descriptor, and supports exact replay without replacing the inventory',()=>{
  const {db,recipes,evidenceRows}=batchFixture(),member=db.cis_demo_refresh.clients[CID],prior=member.artifacts,
    retained=prior[evidenceRows[0].evidence_id],enumerate=jest.spyOn(bookSources,'brawndoArtifactSpecs'),single=jest.spyOn(bookSources,'brawndoArtifactDefinition');
  expect(registerCisDemoArtifacts(db,evidenceRows,recipes)).toBe(true);
  expect(enumerate).toHaveBeenCalledTimes(1);expect(single).not.toHaveBeenCalled();
  expect(Object.keys(member.artifacts)).toHaveLength(evidenceRows.length);
  expect(member.artifacts[evidenceRows[0].evidence_id]).toBe(retained);
  expect(Object.keys(prior)).toHaveLength(1);
  const committed=member.artifacts;
  expect(registerCisDemoArtifacts(db,evidenceRows,recipes)).toBe(true);
  expect(enumerate).toHaveBeenCalledTimes(2);expect(member.artifacts).toBe(committed);
});

test.each([
  ['bad final original byte',({evidenceRows})=>{
    const row=evidenceRows.at(-1),bytes=atob(row.content_base64);
    row.content_base64=btoa(String.fromCharCode(bytes.charCodeAt(0)^1)+bytes.slice(1));
  }],
  ['wrong historical occurrence',({evidenceRows})=>{evidenceRows.find(row=>row.linked_type==='review').occurrence_id=null;}],
  ['foreign native Review prefix',({evidenceRows})=>{
    const row=evidenceRows.find(item=>item.linked_id.startsWith('risk_review_'));
    row.linked_id=row.linked_id.replace(CID,'demo_dunder');row.occurrence_id=row.occurrence_id.replace(CID,'demo_dunder');
  }],
  ['foreign row client',({evidenceRows})=>{evidenceRows.at(-1).client_id='demo_initech';}],
  ['duplicate native Evidence identity',({db,evidenceRows})=>{db.evidence=[...db.evidence,copy(evidenceRows.at(-1))];}],
  ['wrong metadata',({evidenceRows})=>{evidenceRows.at(-1).filename='different.csv';}],
  ['too many relationships',({evidenceRows})=>{evidenceRows.at(-1).relationships=Array.from({length:101},()=>({kind:'policies',id:'same'}));}],
  ['different existing descriptor',({db,evidenceRows})=>{db.cis_demo_refresh.clients[CID].artifacts[evidenceRows[0].evidence_id].fingerprint='changed';}],
  ['missing canonical revision',({db})=>{delete db.cis_demo_refresh.clients[CID].canonical_revision;}]
])('%s refuses the complete batch without a partial descriptor commit',(_label,change)=>{
  const fixture=batchFixture();change(fixture);
  const {db,evidenceRows,recipes}=fixture,before=copy(db),prior=db.cis_demo_refresh.clients[CID].artifacts;
  expect(()=>registerCisDemoArtifacts(db,evidenceRows,recipes)).toThrow();
  expect(db).toEqual(before);expect(db.cis_demo_refresh.clients[CID].artifacts).toBe(prior);
});

test('an unavailable cohort leaves the staged batch and all source descriptors untouched',()=>{
  const {db,evidenceRows,recipes}=batchFixture();db.user.workspace_mode='standard';const before=copy(db);
  expect(registerCisDemoArtifacts(db,evidenceRows,recipes)).toBe(false);expect(db).toEqual(before);
});

test('batch scope, duplicate keys and count limits reject before source enumeration',()=>{
  const {recipes}=batchFixture(),enumerate=jest.spyOn(bookSources,'brawndoArtifactSpecs');
  for(const invalid of [[],Array.from({length:33},(_,index)=>({...recipe(),key:'safeguards-'+(index+1)})),
    [recipes[0],recipes[0]],[recipes[0],{...recipes[1],anchor:'2026-11-03T00:00:00.000Z'}],
    [recipes[0],{...recipes[1],client_id:'demo_initech'}],[recipes[0],{...recipes[1],fixture_version:'unknown'}],
    [recipes[0],{...recipes[1],scenario_revision:'unknown'}]])expect(resolveCanonicalArtifacts(invalid)).toBeNull();
  expect(enumerate).not.toHaveBeenCalled();
});

test('the existing descriptor bound is checked before the sole batch commit',()=>{
  const {db,evidenceRows,recipes}=batchFixture(),member=db.cis_demo_refresh.clients[CID];
  // Existing entries consume capacity even when this initial batch does not replace them.
  for(let index=0;index<33-evidenceRows.length;index++)member.artifacts['retained-'+index]={retained:true};
  expect(Object.keys(member.artifacts).length).toBeLessThan(32);
  const before=copy(db),prior=member.artifacts;
  expect(()=>registerCisDemoArtifacts(db,evidenceRows,recipes)).toThrow(/inventory.*full/i);
  expect(db).toEqual(before);expect(member.artifacts).toBe(prior);
});

test('registration rejects different original bytes even when their decoded size and metadata are unchanged',()=>{
  const {db,row,source}=prepared();delete db.cis_demo_refresh.clients[CID].artifacts;
  const original=atob(row.content_base64);
  row.content_base64=btoa(String.fromCharCode(original.charCodeAt(0)^1)+original.slice(1));
  const before=copy(db);
  expect(()=>registerCisDemoArtifact(db,row,source)).toThrow(/canonical.*bytes/i);
  expect(db).toEqual(before);
});

test.each([
  ['normal mode',db=>{db.user.workspace_mode='normal';}],
  ['standard mode',db=>{db.user.workspace_mode='standard';}],
  ['non-Demo client',db=>{db.clients[0].environment='Production';}],
  ['duplicate client',db=>{db.clients.push(copy(db.clients[0]));}],
  ['duplicate Evidence',db=>{db.evidence.push(copy(db.evidence[0]));}],
  ['retained session',db=>{db.cis_demo_refresh.clients[CID].state='retained_without_rewrite';}],
  ['missing canonical revision',db=>{delete db.cis_demo_refresh.clients[CID].canonical_revision;}],
  ['unknown canonical revision',db=>{db.cis_demo_refresh.clients[CID].canonical_revision='unknown';}],
  ['missing source descriptor',db=>{delete db.cis_demo_refresh.clients[CID].artifacts;}],
  ['changed scenario revision',db=>{db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].recipe.scenario_revision='unknown';}],
  ['copied arbitrary rows',db=>{db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].recipe.rows=[{content:'injected'}];}],
  ['copied arbitrary text',db=>{db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].recipe.text='injected';}],
  ['changed fingerprint',db=>{db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].fingerprint='changed';}]
])('%s cannot regenerate a canonical book',(_label,change)=>{
  const {db,row}=prepared();evicted(row);change(db);const before=copy(db);
  expect(restoredCisDemoEvidence(db,row)).toBeNull();expect(db).toEqual(before);
});

test.each([
  ['filename','different.csv'],['mime_type','text/html'],['size',1],['version',2],['linked_type','task'],
  ['linked_id',CID+'_another-parent'],['occurrence_id','another-occurrence'],['created_at','2026-11-01T00:00:00.000Z'],
  ['uploaded_at','2026-11-01T00:00:00.000Z'],['uploaded_by','different-user'],['uploaded_by_email','different@example.test'],['sha256','a'.repeat(64)]
])('changed immutable %s refuses fallback', (key,value)=>{
  const {db,row}=prepared();evicted(row);row[key]=value;const before=copy(db);
  expect(restoredCisDemoEvidence(db,row)).toBeNull();expect(db).toEqual(before);
});

test('native clear and existing bytes retain precedence, and generic/other canonical clients do not inherit Brawndo books',()=>{
  const {db,row}=prepared();expect(restoredCisDemoEvidence(db,row)).toBeNull();
  evicted(row);row.demo_file_storage='cleared';expect(restoredCisDemoEvidence(db,row)).toBeNull();
  for(const client_id of ['demo_initech','demo_krusty_krab','demo_dunder','demo_prestige','visitor_demo']) {
    expect(canonicalArtifactDefinition({...recipe(),client_id})).toBeNull();
    expect(renderCanonicalArtifact({...recipe(),client_id})).toBeNull();
  }
});

test.each([
  ['unknown key',{key:'arbitrary-upload'}],['prototype key',{key:'constructor'}],['wrong kind',{kind:'custom_file'}],
  ['new schema',{schema_version:2}],['new fixture',{fixture_version:'unknown'}],['new scenario',{scenario_revision:'unknown'}],
  ['non-midnight anchor',{anchor:'2026-11-02T12:00:00.000Z'}],['invalid date',{anchor:'2026-02-30T00:00:00.000Z'}],
  ['extra bytes',{content_base64:'eA=='}],['extra rows',{rows:[]}],['extra content',{text:'arbitrary body'}]
])('%s is outside the fixed descriptor-only schema',(_label,patch)=>{
  expect(canonicalArtifactDefinition({...recipe(),...patch})).toBeNull();
  expect(renderCanonicalArtifact({...recipe(),...patch})).toBeNull();
});

test.each(['operation','operating'])('retained v2 %s descriptors restore without a canonical v3 marker',kind=>{
  const source={kind,schema_version:1,fixture_version:CIS_SHOWCASE_VERSION,client_id:CID,anchor:ANCHOR,
    key:kind==='operation'?'evidence_vendor_current':'operating_periodic',
    ...(kind==='operation'?{title:'Synthetic Microsoft workspace assurance checklist',day:'2026-10-13'}:
      {rows:[{id:'1.1',state:'P',frequency:'s',trigger:false}]})};
  const bytes=kind==='operation'?renderCisOperationArtifact(source):renderCisOperatingArtifact(source);
  const row={evidence_id:kind==='operation'?CID+'_'+source.key:CID+'_showcase_evidence_'+source.key,
    client_id:CID,filename:kind==='operation'?source.key+'.txt':'cis-'+source.key+'.csv',
    mime_type:kind==='operation'?'text/plain':'text/csv',version:1,...bytes,
    linked_type:kind==='operation'?'vendor':'framework_assessment',linked_id:kind==='operation'?CID+'_vendor_0':'fw_'+CID+'_assessment_1.1',
    created_at:kind==='operation'?source.day+'T00:00:00.000Z':ANCHOR,
    uploaded_at:kind==='operation'?source.day+'T00:00:00.000Z':ANCHOR,uploaded_by:'old-uploader'};
  const db={user:{workspace_mode:'demo'},clients:[{client_id:CID,environment:'Demo'}],evidence:[row],
    cis_demo_refresh:{version:CIS_SHOWCASE_VERSION,anchor:ANCHOR,timezone:'UTC',clients:{[CID]:{version:CIS_SHOWCASE_VERSION,state:'fresh_fixture'}}}};
  expect(registerCisDemoArtifact(db,row,source)).toBe(true);
  const captured=copy(cisDemoArtifactDescriptor(db,row));evicted(row);
  expect(restoredCisDemoEvidence(db,row).content_base64).toBe(bytes.content_base64);
  expect(cisDemoArtifactDescriptor(db,row)).toEqual(captured);
});
