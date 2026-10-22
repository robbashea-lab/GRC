import {demoCurrentPositions,captureDemoReporting,compactPortfolioReporting,restorePortfolioReporting,readPortfolioStore,writePortfolioStore} from './portfolioReporting';
import * as codec from './demoStorageCodec';
import * as canonical from './commandRequests';
import {activeDefinitions,frameworkCatalog} from '../lib/frameworks';


const copy=value=>JSON.parse(JSON.stringify(value));
const reference=()=>JSON.parse('{"id":"a","extra":{"__proto__":{"safe":true},"text":"Unicode ✓"}}');
const position=(index,extra={})=>({scope_signature:null,continuity_proven:true,...extra,
  provenance:{kind:'fixture',unknown:{retained:true},_portfolio_source_index:index}});
function packed(version=2){
  const rows=[reference(),{id:'b',status:'addressed',extra:{values:[1,2]}}];
  const vectors=[[0,1,0],[1,0],[]];
  return {clients:[],evidence:[],portfolio_reporting:{storage_version:version,identities:[],
    source_records:rows,source_vectors:version===1?vectors.map(vector=>JSON.stringify(vector.map(index=>rows[index]))):vectors,
    snapshots:[{snapshot_id:'first',client_id:'c',framework_key:'cis-ig1',current:position(0)},
      {snapshot_id:'second',client_id:'c',framework_key:'cis-ig1',current:position(0)},
      {snapshot_id:'empty',client_id:'c',framework_key:'cis-ig1',current:position(2)}],
    scope_events:[{client_id:'c',framework_key:'cis-ig1',unknown:'keep',before:position(0),after:position(1)}],
    unknown:{retain:'all history metadata'}}};
}
const provenance=(db,index=0)=>db.portfolio_reporting.snapshots[index].current.provenance;

beforeEach(()=>jest.restoreAllMocks());
afterEach(()=>jest.restoreAllMocks());

test.each(['v1','v2-string','v2-object'])('%s restores expanded native JSON with enumerable independent source references',shape=>{
  const saved=packed(shape==='v1'?1:2);
  if(shape==='v2-string')saved.portfolio_reporting.source_records=saved.portfolio_reporting.source_records.map(row=>JSON.stringify(row));
  const original=JSON.stringify(saved),restored=restorePortfolioReporting(saved),first=provenance(restored);
  const descriptor=Object.getOwnPropertyDescriptor(first,'source_references');
  expect(descriptor.enumerable).toBe(true);expect(descriptor.configurable).toBe(true);expect(typeof descriptor.get).toBe('function');
  expect(JSON.stringify(first)).toBe('{"kind":"fixture","unknown":{"retained":true},"source_references":[{"id":"a","extra":{"__proto__":{"safe":true},"text":"Unicode ✓"}},{"id":"b","status":"addressed","extra":{"values":[1,2]}},{"id":"a","extra":{"__proto__":{"safe":true},"text":"Unicode ✓"}}]}');
  expect(Object.hasOwn(first,'_portfolio_source_index')).toBe(false);
  expect(restored.portfolio_reporting.snapshots[0].current.continuity_proven).toBe(true);
  expect(restored.portfolio_reporting.scope_events[0].unknown).toBe('keep');
  expect(restored.portfolio_reporting.scope_events[0].after.provenance.source_references.map(row=>row.id)).toEqual(['b','a']);
  expect(provenance(restored,2).source_references).toEqual([]);
  first.source_references[0].extra.__proto__.safe=false;
  expect(first.source_references[2].extra.__proto__.safe).toBe(true);
  expect(provenance(restored,1).source_references[0].extra.__proto__.safe).toBe(true);
  expect(restored.portfolio_reporting.scope_events[0].before.provenance.source_references[0].extra.__proto__.safe).toBe(true);
  expect(JSON.stringify(saved)).toBe(original);
});

test('untouched vectors canonicalize each unique immutable row once at compact and preserve first encounter order',()=>{
  const serialize=jest.spyOn(canonical,'stable');
  const saved=packed(),restored=restorePortfolioReporting(saved),first=provenance(restored);
  expect(serialize).not.toHaveBeenCalled();
  const getter=Object.getOwnPropertyDescriptor(first,'source_references').get;
  const result=compactPortfolioReporting(restored);
  expect(serialize).toHaveBeenCalledTimes(2);
  expect(Object.getOwnPropertyDescriptor(first,'source_references').get).toBe(getter);
  expect(result.portfolio_reporting.source_records).toEqual([reference(),saved.portfolio_reporting.source_records[1]]);
  // Snapshot traversal first encounters the empty vector before scope-event after.
  expect(result.portfolio_reporting.source_vectors).toEqual([[0,1,0],[],[1,0]]);
  expect(result.portfolio_reporting.snapshots.map(row=>row.current.provenance._portfolio_source_index)).toEqual([0,0,1]);
  expect(result.portfolio_reporting.scope_events[0].before.provenance._portfolio_source_index).toBe(0);
  expect(result.portfolio_reporting.scope_events[0].after.provenance._portfolio_source_index).toBe(2);
  expect(result.portfolio_reporting.unknown).toEqual({retain:'all history metadata'});
});

test('materialization and nested mutation use current native data on the next compact',()=>{
  const restored=restorePortfolioReporting(packed()),first=provenance(restored);
  first.source_references[0].extra.text='Edited native value';
  const result=restorePortfolioReporting(compactPortfolioReporting(restored));
  expect(provenance(result).source_references[0].extra.text).toBe('Edited native value');
  expect(provenance(result).source_references[2].extra.text).toBe('Unicode ✓');
  expect(provenance(result,1).source_references[0].extra.text).toBe('Unicode ✓');
});

test.each(['assign','redefine','delete'])('%s cannot retain stale source-vector metadata',operation=>{
  const restored=restorePortfolioReporting(packed()),first=provenance(restored),replacement=[{id:'replacement',nested:{retained:true}}];
  if(operation==='assign')first.source_references=replacement;
  if(operation==='redefine')Object.defineProperty(first,'source_references',{value:replacement,enumerable:true,writable:true,configurable:true});
  if(operation==='delete')delete first.source_references;
  const result=restorePortfolioReporting(compactPortfolioReporting(restored));
  if(operation==='delete')expect(Object.hasOwn(provenance(result),'source_references')).toBe(false);
  else expect(provenance(result).source_references).toEqual(replacement);
  expect(provenance(result,1).source_references[0].id).toBe('a');
});

test('frozen and sealed provenance remains readable with independent references',()=>{
  const restored=restorePortfolioReporting(packed()),first=provenance(restored),second=provenance(restored,1);
  Object.freeze(first);Object.seal(second);
  expect(()=>first.source_references).not.toThrow();
  expect(()=>second.source_references).not.toThrow();
  first.source_references[0].extra.text='Frozen container still has mutable nested data';
  expect(second.source_references[0].extra.text).toBe('Unicode ✓');
  expect(()=>{first.source_references=[];}).toThrow(TypeError);
  const result=restorePortfolioReporting(compactPortfolioReporting(restored));
  expect(provenance(result).source_references[0].extra.text).toBe('Frozen container still has mutable nested data');
});

test('restoration detaches opaque references from later source-pool and index mutations',()=>{
  const saved=packed(),restored=restorePortfolioReporting(saved);
  saved.portfolio_reporting.source_records[0].extra.text='External pool mutation';
  saved.portfolio_reporting.source_vectors[0][0]=1;
  const result=restorePortfolioReporting(compactPortfolioReporting(restored));
  expect(provenance(result).source_references.map(row=>row.id)).toEqual(['a','b','a']);
  expect(provenance(result).source_references[0].extra.text).toBe('Unicode ✓');
});

test('legacy string rows normalize overflow and duplicate keys before any source access',()=>{
  const saved=packed();saved.portfolio_reporting.source_records[0]='{"id":"last","id":"a","overflow":1e999,"extra":{"__proto__":{"safe":true},"text":"✓"}}';
  const restored=restorePortfolioReporting(saved),result=compactPortfolioReporting(restored);
  expect(result.portfolio_reporting.source_records[0]).toMatchObject({id:'a',overflow:null});
  expect(provenance(restored).source_references[0].overflow).toBeNull();
});

test('unreferenced malformed pool data is ignored but every referenced error fails eagerly',()=>{
  const saved=packed();saved.portfolio_reporting.source_records.push('unused malformed');saved.portfolio_reporting.source_vectors.push(['unused bad index']);
  expect(()=>restorePortfolioReporting(saved)).not.toThrow();
  for(const invalid of [null,-1,0.5,'0',999]){
    const corrupt=copy(saved);corrupt.portfolio_reporting.source_vectors[0][0]=invalid;
    expect(()=>restorePortfolioReporting(corrupt)).toThrow(/source reference is unavailable/);
  }
  for(const invalid of [null,[],17,'null','[]','malformed']){
    const corrupt=copy(saved);corrupt.portfolio_reporting.source_records[0]=invalid;
    expect(()=>restorePortfolioReporting(corrupt)).toThrow();
  }
  const badVector=copy(saved);badVector.portfolio_reporting.source_vectors[0]={invalid:true};
  expect(()=>restorePortfolioReporting(badVector)).toThrow(/source reference is unavailable/);
  const badLegacy=packed(1);badLegacy.portfolio_reporting.source_vectors[0]='malformed';
  expect(()=>restorePortfolioReporting(badLegacy)).toThrow();
});

test('mixed new native observations and opaque history rebuild only reachable rows without growth',()=>{
  let saved=packed();saved.portfolio_reporting.source_records.push({id:'unused-pool-row'});
  for(let n=0;n<4;n++){
    const restored=restorePortfolioReporting(saved);
    if(n===0)restored.portfolio_reporting.snapshots.push({snapshot_id:'new',client_id:'c',framework_key:'cis-ig1',current:{
      provenance:{kind:'native',source_references:[{id:'new',nested:{unknown:'keep'}}]}}});
    saved=compactPortfolioReporting(restored);
    expect(saved.portfolio_reporting.source_records.map(row=>row.id)).toEqual(['a','b','new']);
    expect(saved.portfolio_reporting.source_vectors).toHaveLength(4);
    expect(saved.portfolio_reporting.snapshots).toHaveLength(4);
    expect(saved.portfolio_reporting.scope_events).toHaveLength(1);
  }
  const expanded=restorePortfolioReporting(saved);
  expect(provenance(expanded,3).source_references).toEqual([{id:'new',nested:{unknown:'keep'}}]);
  expect(expanded.portfolio_reporting.snapshots[0].current.continuity_proven).toBe(true);
});

test.each([1,2])('opaque and expanded V%s stores produce identical complete compact JSON including scopes and unknown fields',version=>{
  const saved=packed(version);
  const scope={configuration:{implementation_group:2},definition_ids:['1.1','1.2'],enrollment_ids:['original-enrollment'],unknown:{kept:true}};
  saved.portfolio_reporting.identities=[{program_id:'c:cis-ig1',scopes:[JSON.stringify({...scope,enrollment_ids:undefined})],head:{signature:'existing',revision:7}}];
  saved.portfolio_reporting.snapshots[0].current._portfolio_scope_index=0;
  saved.portfolio_reporting.snapshots[0].current._portfolio_enrollment_ids=['original-enrollment'];
  Object.defineProperty(saved.portfolio_reporting.snapshots[0].current.provenance,'__proto__',{value:{unknown:true},enumerable:true,configurable:true,writable:true});
  const opaque=restorePortfolioReporting(saved),expanded=copy(restorePortfolioReporting(copy(saved)));
  const before=JSON.stringify(expanded);
  expect(JSON.stringify(compactPortfolioReporting(opaque))).toBe(JSON.stringify(compactPortfolioReporting(expanded)));
  expect(JSON.stringify(opaque)).toBe(before);
  expect(opaque.portfolio_reporting.snapshots[0].current.scope.enrollment_ids).toEqual(['original-enrollment']);
  expect(Object.hasOwn(provenance(opaque),'__proto__')).toBe(true);
});

function memoryStorage(initial){
  const values=new Map(initial?[['demo',initial]]:[]);
  return {getItem:key=>values.get(key),setItem:jest.fn((key,value)=>values.set(key,value))};
}
function rowSerializations(spy){return spy.mock.calls.filter(([value])=>value?.id==='a'||value?.id==='b');}

test('first native read proves canonical row text and repeated reads retain no native objects',()=>{
  const db=restorePortfolioReporting(packed());db.case_marker='writer-bound-cache';
  const storage=memoryStorage(),saved=writePortfolioStore(storage,'demo',db);
  expect(saved).toBe(storage.getItem('demo'));
  expect(Object.isFrozen(db)).toBe(false);
  db.clients.push({client_id:'unsaved'});
  const serialize=jest.spyOn(JSON,'stringify'),canonicalize=jest.spyOn(canonical,'stable');
  readPortfolioStore(saved);
  expect(rowSerializations(serialize).length).toBeGreaterThan(0);
  serialize.mockClear();
  const first=readPortfolioStore(saved);
  expect(rowSerializations(serialize)).toHaveLength(0);
  expect(canonicalize).not.toHaveBeenCalled();
  compactPortfolioReporting(first);
  expect(canonicalize).not.toHaveBeenCalled();
  const source=provenance(first).source_references;
  source[0].extra.text='Native edit';
  first.clients.push({client_id:'returned-only'});
  const second=readPortfolioStore(saved);
  expect(second.clients).toEqual([]);
  expect(provenance(second).source_references[0].extra.text).toBe('Unicode ✓');
  compactPortfolioReporting(first);
  expect(canonicalize).toHaveBeenCalled();
});

test('external rows reuse normalization on exact bytes but cannot claim canonical status through persisted fields',()=>{
  const external=packed();external.case_marker='external-unknown-canonical';
  external.portfolio_reporting.source_records[0].canonicalKnown=true;
  const saved=JSON.stringify(external);
  readPortfolioStore(saved);
  const serialize=jest.spyOn(JSON,'stringify'),canonicalize=jest.spyOn(canonical,'stable');
  const second=readPortfolioStore(saved);
  expect(rowSerializations(serialize)).toHaveLength(0);
  compactPortfolioReporting(second);
  expect(canonicalize).toHaveBeenCalledTimes(2);
  expect(provenance(second).source_references[0].canonicalKnown).toBe(true);
});

test('a corrupt referenced index still fails eagerly on an exact-value cache hit and preserves prior valid metadata',()=>{
  const db=restorePortfolioReporting(packed());db.case_marker='cache-hit-validation';
  const saved=writePortfolioStore(memoryStorage(),'demo',db);
  readPortfolioStore(saved);
  const corrupted=codec.decodeDemoStore(saved);corrupted.portfolio_reporting.source_vectors[0][0]=999;
  const decode=jest.spyOn(codec,'decodeDemoStore').mockReturnValueOnce(corrupted);
  expect(()=>readPortfolioStore(saved)).toThrow(/source reference is unavailable/);
  decode.mockRestore();
  const serialize=jest.spyOn(JSON,'stringify');
  expect(()=>readPortfolioStore(saved)).not.toThrow();
  expect(rowSerializations(serialize)).toHaveLength(0);
});

test('failed writes leave both old bytes and the exact-value metadata entry intact',()=>{
  const original=restorePortfolioReporting(packed());original.case_marker='failed-cache-publication';
  const storage=memoryStorage(),saved=writePortfolioStore(storage,'demo',original);
  readPortfolioStore(saved);
  const changed=restorePortfolioReporting(packed());changed.case_marker='unsaved-replacement';
  provenance(changed).source_references[0].id='unsaved-row';
  storage.setItem.mockImplementation(()=>{throw new DOMException('Synthetic full storage','QuotaExceededError');});
  expect(()=>writePortfolioStore(storage,'demo',changed)).toThrow();
  expect(storage.getItem('demo')).toBe(saved);
  const serialize=jest.spyOn(JSON,'stringify');
  const restored=readPortfolioStore(saved);
  expect(rowSerializations(serialize)).toHaveLength(0);
  expect(provenance(restored).source_references[0].id).toBe('a');
});

test('metadata publication performs no parsing after storage has acknowledged a commit',()=>{
  const db=restorePortfolioReporting(packed());db.case_marker='post-commit-assignment-only';
  const parse=JSON.parse;let committed=false,afterCommit=0,saved;
  const storage={setItem:jest.fn((_key,value)=>{saved=value;committed=true;})};
  const spy=jest.spyOn(JSON,'parse').mockImplementation((...args)=>{
    if(committed){afterCommit++;throw new Error('Unexpected post-commit validation');}
    return parse(...args);
  });
  let result;
  try{result=writePortfolioStore(storage,'demo',db);}finally{spy.mockRestore();}
  expect(result).toBe(saved);expect(afterCommit).toBe(0);
  expect(readPortfolioStore(saved).case_marker).toBe('post-commit-assignment-only');
});

test('external replacement and reset cannot reuse stale native rows or old pool entries',()=>{
  const db=restorePortfolioReporting(packed());db.case_marker='before-external-change';
  const storage=memoryStorage(),saved=writePortfolioStore(storage,'demo',db);
  const external=codec.decodeDemoStore(saved);
  external.portfolio_reporting.source_records[0].extra.text='External replacement';
  const replacement=JSON.stringify(external);
  expect(provenance(readPortfolioStore(replacement)).source_references[0].extra.text).toBe('External replacement');
  const reset={clients:[],evidence:[],case_marker:'reset-empty',portfolio_reporting:{identities:[],snapshots:[],scope_events:[]}};
  const resetSaved=writePortfolioStore(storage,'demo',reset),read=readPortfolioStore(resetSaved);
  expect(read.portfolio_reporting.source_records).toEqual([]);
  expect(read.portfolio_reporting.source_vectors).toEqual([]);
  expect(read.portfolio_reporting.snapshots).toEqual([]);
  expect(provenance(readPortfolioStore(saved)).source_references[0].extra.text).toBe('Unicode ✓');
});

test('serialization metadata cap skips optimization without rejecting otherwise valid raw storage',()=>{
  const db=restorePortfolioReporting(packed());db.case_marker='metadata-cap-only';
  db.padding='x'.repeat(Math.floor(codec.MAX_DEMO_DECODE_BYTES/2)+100);
  const storage=memoryStorage(),saved=writePortfolioStore(storage,'demo',db);
  expect(saved.length*2).toBeGreaterThan(codec.MAX_DEMO_DECODE_BYTES);
  const serialize=jest.spyOn(JSON,'stringify');
  const restored=readPortfolioStore(saved);
  expect(rowSerializations(serialize).length).toBeGreaterThan(0);
  serialize.mockClear();
  readPortfolioStore(saved);
  expect(rowSerializations(serialize).length).toBeGreaterThan(0);
  expect(restored.padding).toBe(db.padding);
});

test.each(['root','history','array-prototype'])('custom %s toJSON keeps normal writes and reader-owned actual-byte validation',kind=>{
  const db=restorePortfolioReporting(packed());db.case_marker='custom-json-'+kind;
  const serializeNormally=function(){this.custom_serialization=true;return {...this,toJSON:undefined};};
  const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'toJSON');
  let saved;
  try{
    if(kind==='root')db.toJSON=serializeNormally;
    if(kind==='history')db.portfolio_reporting.toJSON=serializeNormally;
    if(kind==='array-prototype')Object.defineProperty(Array.prototype,'toJSON',{configurable:true,value:function(){return Array.from(this);}});
    saved=writePortfolioStore(memoryStorage(),'demo',db);
  }finally{
    if(descriptor)Object.defineProperty(Array.prototype,'toJSON',descriptor);else delete Array.prototype.toJSON;
  }
  const restored=readPortfolioStore(saved),canonicalize=jest.spyOn(canonical,'stable');
  compactPortfolioReporting(restored);
  expect(canonicalize).not.toHaveBeenCalled();
  expect(restored.case_marker).toBe('custom-json-'+kind);
});

test('public compaction remains mutable and cannot confer reader-private canonical metadata',()=>{
  const result=compactPortfolioReporting(restorePortfolioReporting(packed()));
  expect(Object.isFrozen(result)).toBe(false);
  expect(Object.isFrozen(result.portfolio_reporting)).toBe(false);
  expect(Object.isFrozen(result.portfolio_reporting.source_records[0])).toBe(false);
  result.portfolio_reporting.source_records[0].id='Public edit';
  const expanded=restorePortfolioReporting(result);
  expect(provenance(expanded).source_references[0].id).toBe('Public edit');
});

test.each(['serializer','accessor'])('nested %s cannot bind old pool text to transformed saved rows',kind=>{
  const db=restorePortfolioReporting(packed());db.case_marker='nested-transform-'+kind;
  const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'toJSON');
  let accesses=0,saved;
  const install=()=>{
    accesses++;
    Object.defineProperty(Array.prototype,'toJSON',{configurable:true,value:function(){
      if(this.length===2&&this[0]?.id==='a'&&this[1]?.id==='b')return [{...this[0],id:'serialized-a'},this[1]];
      return Array.from(this);
    }});
  };
  if(kind==='serializer')db.clients=[{toJSON(){install();return {client_id:'c'};}}];
  else db.clients=[Object.defineProperty({},'client_id',{enumerable:true,get(){install();return 'c';}})];
  try{saved=writePortfolioStore(memoryStorage(),'demo',db);}finally{
    if(descriptor)Object.defineProperty(Array.prototype,'toJSON',descriptor);else delete Array.prototype.toJSON;
  }
  expect(accesses).toBe(1);
  const cached=readPortfolioStore(saved),pure=restorePortfolioReporting(codec.decodeDemoStore(saved));
  expect(JSON.stringify(cached)).toBe(JSON.stringify(pure));
  expect(provenance(cached).source_references[0].id).toBe('serialized-a');
});

test('a dynamically installed serializer may mutate its receiver without a new frozen-object failure',()=>{
  const db=restorePortfolioReporting(packed());db.case_marker='mutating-pool-serializer';
  const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'toJSON');
  db.clients=[{toJSON(){
    Object.defineProperty(Array.prototype,'toJSON',{configurable:true,value:function(){
      if(this.length===2&&this[0]?.id==='a'&&this[1]?.id==='b')this[0].id='serialized-mutating-a';
      return this;
    }});
    return {client_id:'c'};
  }}];
  let saved;
  try{saved=writePortfolioStore(memoryStorage(),'demo',db);}finally{
    if(descriptor)Object.defineProperty(Array.prototype,'toJSON',descriptor);else delete Array.prototype.toJSON;
  }
  const cached=readPortfolioStore(saved),pure=restorePortfolioReporting(codec.decodeDemoStore(saved));
  expect(JSON.stringify(cached)).toBe(JSON.stringify(pure));
  expect(provenance(cached).source_references[0].id).toBe('serialized-mutating-a');
});

test('undefined custom serialization preserves the normal physical writer behavior without metadata parsing',()=>{
  const db=restorePortfolioReporting(packed());db.toJSON=()=>undefined;
  const storage=memoryStorage();
  expect(()=>writePortfolioStore(storage,'demo',db)).not.toThrow();
  expect(storage.setItem).toHaveBeenCalledWith('demo',undefined);
});

test('actual saved rows retain transient serialization after prototypes are restored',()=>{
  const db=restorePortfolioReporting(packed());db.case_marker='transient-prototype-transform';
  const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'toJSON');
  db.clients=[{toJSON(){
    Object.defineProperty(Array.prototype,'toJSON',{configurable:true,value:function(){
      if(this.length===2&&this[0]?.id==='a'&&this[1]?.id==='b'){
        if(descriptor)Object.defineProperty(Array.prototype,'toJSON',descriptor);else delete Array.prototype.toJSON;
        return [{...this[0],id:'serialized-transient-a'},this[1]];
      }
      return Array.from(this);
    }});
    return {client_id:'c'};
  }}];
  let saved;
  try{saved=writePortfolioStore(memoryStorage(),'demo',db);}finally{
    if(descriptor)Object.defineProperty(Array.prototype,'toJSON',descriptor);else delete Array.prototype.toJSON;
  }
  expect(JSON.stringify(readPortfolioStore(saved))).toBe(JSON.stringify(restorePortfolioReporting(codec.decodeDemoStore(saved))));
  expect(provenance(readPortfolioStore(saved)).source_references[0].id).toBe('serialized-transient-a');
});


test.each(['fast','fallback'])('successful %s compressed writes reuse verified text while returning independent records',kind=>{
  const json=JSON.stringify({marker:'verified-write-'+kind,nested:{text:'Unicode ✓',values:[1,2,3]}});
  let attempts=0,saved;
  const storage={setItem:jest.fn((_key,value)=>{
    attempts++;
    if(attempts===1||(kind==='fallback'&&attempts===2))throw new DOMException('Synthetic physical quota','QuotaExceededError');
    saved=value;
  })};
  const result=codec.writeDemoStore(storage,'demo',json);
  expect(result).toBe(saved);expect(attempts).toBe(kind==='fast'?2:3);
  expect(JSON.parse(saved).demo_storage_codec).toBe('deflate-base64');
  const unpack=jest.spyOn(global,'atob');
  const first=codec.decodeDemoStore(saved),second=codec.decodeDemoStore(saved);
  expect(unpack).not.toHaveBeenCalled();
  expect(first).toEqual(JSON.parse(json));expect(second).toEqual(first);
  first.nested.values.push(4);first.nested.text='unsaved mutation';
  expect(second.nested).toEqual({text:'Unicode ✓',values:[1,2,3]});
  expect(codec.decodeDemoStore(saved)).toEqual(JSON.parse(json));
});

test('failed compressed writes retain the prior verified text and raw success clears it',()=>{
  const prior=JSON.stringify({marker:'prior-verified-write',nested:{values:[1,2]}});
  let saved;
  const storage={setItem:jest.fn((_key,value)=>{
    if(value===prior)throw new DOMException('Synthetic raw quota','QuotaExceededError');
    saved=value;
  })};
  codec.writeDemoStore(storage,'demo',prior);
  const oldSaved=saved;
  storage.setItem.mockImplementation(()=>{throw new DOMException('Synthetic full storage','QuotaExceededError');});
  expect(()=>codec.writeDemoStore(storage,'demo',JSON.stringify({marker:'failed-new-value'}))).toThrow();
  expect(saved).toBe(oldSaved);
  const unpack=jest.spyOn(global,'atob');
  expect(codec.decodeDemoStore(oldSaved)).toEqual(JSON.parse(prior));
  expect(unpack).not.toHaveBeenCalled();
  storage.setItem.mockImplementation((_key,value)=>{saved=value;});
  codec.writeDemoStore(storage,'demo','{"marker":"raw-success"}');
  expect(saved).toBe('{"marker":"raw-success"}');
  expect(codec.decodeDemoStore(oldSaved)).toEqual(JSON.parse(prior));
  expect(unpack).toHaveBeenCalledTimes(1);
});

test('actual saved rows retain a transient change to one nested field in one pool row',()=>{
  const db=restorePortfolioReporting(packed());db.case_marker='single-deep-pool-change';
  const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'toJSON');
  db.clients=[{toJSON(){
    Object.defineProperty(Array.prototype,'toJSON',{configurable:true,value:function(){
      if(this.length===2&&this[0]?.id==='a'&&this[1]?.id==='b'){
        if(descriptor)Object.defineProperty(Array.prototype,'toJSON',descriptor);else delete Array.prototype.toJSON;
        return [this[0],{...this[1],extra:{...this[1].extra,values:[1,99]}}];
      }
      return Array.from(this);
    }});
    return {client_id:'c'};
  }}];
  let saved;
  try{saved=writePortfolioStore(memoryStorage(),'demo',db);}finally{
    if(descriptor)Object.defineProperty(Array.prototype,'toJSON',descriptor);else delete Array.prototype.toJSON;
  }
  const restored=readPortfolioStore(saved);
  expect(JSON.stringify(restored)).toBe(JSON.stringify(restorePortfolioReporting(codec.decodeDemoStore(saved))));
  expect(provenance(restored).source_references[0]).toEqual(reference());
  expect(provenance(restored).source_references[1].extra.values).toEqual([1,99]);
});

test.each([
  ['numeric keys and nested Unicode', '{"10":"ten","2":"two","01":"leading","4294967295":"nonindex","__proto__":{"a":"✓","z":[{"a":1,"z":2}]},"a":1,"z":2}',true],
  ['nonindex key order', '{"2":2,"10":10,"a":1,"01":"leading"}',false],
  ['nested unsorted object', '{"a":[{"z":1,"a":2}]}',false],
  ['overflow and duplicate normalization', '{"a":1e999,"b":1,"b":2}',true],
])('reader canonical proof preserves exact native output: %s',(_label,text,alreadyCanonical)=>{
  const fixture=packed();fixture.case_marker='reader-order-'+_label;
  fixture.portfolio_reporting.source_records=[text];
  fixture.portfolio_reporting.source_vectors=[[0],[0],[]];
  const saved=JSON.stringify(fixture);
  const expected=compactPortfolioReporting(restorePortfolioReporting(codec.decodeDemoStore(saved)));
  const actual=readPortfolioStore(saved),canonicalize=jest.spyOn(canonical,'stable');
  const compacted=compactPortfolioReporting(actual);
  expect(JSON.stringify(compacted)).toBe(JSON.stringify(expected));
  expect(canonicalize).toHaveBeenCalledTimes(alreadyCanonical?0:1);
  expect(provenance(actual).source_references[0]).toEqual(JSON.parse(JSON.stringify(JSON.parse(text))));
});


test('prototype hooks installed after a read cannot reuse earlier canonical proof',()=>{
  const saved=writePortfolioStore(memoryStorage(),'demo',restorePortfolioReporting(packed()));
  const priorRead=readPortfolioStore(saved);
  const descriptor=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  try{
    Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value:function(){
      return this.id==='a'?{...this,hook_added:'actual current serializer'}:this;
    }});
    const expected=restorePortfolioReporting(codec.decodeDemoStore(saved));
    expect(JSON.stringify(readPortfolioStore(saved))).toBe(JSON.stringify(expected));
    expect(JSON.stringify(compactPortfolioReporting(priorRead))).toBe(JSON.stringify(compactPortfolioReporting(expected)));
  }finally{
    if(descriptor)Object.defineProperty(Object.prototype,'toJSON',descriptor);else delete Object.prototype.toJSON;
  }
});


function comparisonFixture(){
  const client={client_id:'comparison_client',status:'active',framework_settings:{'cis-ig1':{implementation_group:1}}};
  const db={clients:[client],baselines:{comparison_client:{completed:true}},requirements:[{requirement_id:'comparison-enrollment',client_id:client.client_id,baseline_key:'cis-ig1',baseline_response:'applies',status:'active'}],
    framework_assessments:activeDefinitions('cis-ig1',{implementation_group:1}).map(row=>({...row,definition_id:row.id,framework_assessment_id:'comparison:'+row.id,client_id:client.client_id,framework_key:'cis-ig1',framework_version:frameworkCatalog('cis-ig1').version,status:'not_assessed',created_at:'2026-07-01T00:00:00.000Z'})),
    findings:[],risks:[],policies:[],evidence:[],logs:[],tasks:[],reviews:[],vendors:[]};
  captureDemoReporting(db,null,'2026-09-01T00:00:00.000Z');
  const refs=db.portfolio_reporting.snapshots[0].current.provenance.source_references;
  refs[0].unknown=JSON.parse('{"__proto__":{"retained":true},"Unicode":"✓","nested":[1,{"future":true}]}');
  return db;
}

test.each(['unchanged','changed legacy fallback'])('read-only comparison preserves opaque history and complete capture output: %s',variant=>{
  const original=comparisonFixture();
  if(variant==='changed legacy fallback')original.portfolio_reporting.identities[0].head=null;
  const saved=JSON.stringify(compactPortfolioReporting(original));
  const actual=readPortfolioStore(saved),previous=readPortfolioStore(saved),expected=copy(readPortfolioStore(saved)),expectedPrevious=copy(readPortfolioStore(saved));
  const historical=actual.portfolio_reporting.snapshots[0].current.provenance;
  const previousHistorical=previous.portfolio_reporting.snapshots[0].current.provenance;
  const descriptor=Object.getOwnPropertyDescriptor(previousHistorical,'source_references');
  const currentDescriptor=Object.getOwnPropertyDescriptor(historical,'source_references');
  if(variant==='changed legacy fallback'){
    for(const db of [actual,expected])Object.assign(db.framework_assessments[0],{status:'addressed',last_saved:'2026-10-01T00:00:00.000Z'});
  }
  captureDemoReporting(actual,previous,'2026-10-01T00:00:00.000Z');
  captureDemoReporting(expected,expectedPrevious,'2026-10-01T00:00:00.000Z');
  expect(Object.getOwnPropertyDescriptor(previousHistorical,'source_references').get).toBe(descriptor.get);
  expect(Object.getOwnPropertyDescriptor(historical,'source_references').get).toBe(currentDescriptor.get);
  expect(JSON.stringify(compactPortfolioReporting(actual))).toBe(JSON.stringify(compactPortfolioReporting(expected)));
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  const references=previousHistorical.source_references;
  references[0].unknown.nested[1].future='public mutation';
  expect(Object.getOwnPropertyDescriptor(previousHistorical,'source_references').get).toBeUndefined();
  expect(provenance(readPortfolioStore(saved)).source_references[0].unknown.nested[1].future).toBe(true);
  expect(provenance(restorePortfolioReporting(compactPortfolioReporting(previous))).source_references[0].unknown.nested[1].future).toBe('public mutation');
});

test.each(['deleted','redefined','prototype hook'])('read-only comparison honors current %s source semantics',variant=>{
  const original=comparisonFixture();original.portfolio_reporting.identities[0].head=null;
  const saved=JSON.stringify(compactPortfolioReporting(original)),actual=readPortfolioStore(saved),previous=readPortfolioStore(saved);
  const expected=copy(readPortfolioStore(saved)),expectedPrevious=copy(readPortfolioStore(saved));
  for(const db of [actual,expected]){
    const historical=db.portfolio_reporting.snapshots[0].current.provenance;
    if(variant==='deleted')delete historical.source_references;
    if(variant==='redefined')Object.defineProperty(historical,'source_references',{enumerable:true,configurable:true,writable:true,value:[{id:'replacement',status:'addressed',unknown:{retained:true}}]});
  }
  const descriptor=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  try{
    if(variant==='prototype hook')Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value:function(){return this.kind==='framework_assessments'?{...this,current_hook:'preserved'}:this;}});
    captureDemoReporting(actual,previous,'2026-10-01T00:00:00.000Z');
    captureDemoReporting(expected,expectedPrevious,'2026-10-01T00:00:00.000Z');
    expect(JSON.stringify(compactPortfolioReporting(actual))).toBe(JSON.stringify(compactPortfolioReporting(expected)));
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  }finally{
    if(descriptor)Object.defineProperty(Object.prototype,'toJSON',descriptor);else delete Object.prototype.toJSON;
  }
});


test('parser-owned proof preserves normalized scalars and noncallable serializer data',()=>{
  const fixture=packed();fixture.case_marker='parsed-json-normalization-boundary';
  fixture.portfolio_reporting.source_records=['{"__proto__":{"safe":true},"a":-0,"b":1e999,"nested":[{"a":1,"toJSON":"retained data","z":2}],"toJSON":false,"z":3}'];
  fixture.portfolio_reporting.source_vectors=[[0],[0],[]];
  const saved=JSON.stringify(fixture),actual=readPortfolioStore(saved),expected=restorePortfolioReporting(codec.decodeDemoStore(saved));
  expect(JSON.stringify(compactPortfolioReporting(actual))).toBe(JSON.stringify(compactPortfolioReporting(expected)));
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  expect(provenance(actual).source_references[0]).toMatchObject({a:0,b:null,toJSON:false,nested:[{toJSON:'retained data'}]});
});

test('public restore retains custom serializer validation and hook-active reads normalize actual serializer output',()=>{
  const invalid=packed();invalid.portfolio_reporting.source_records[0]={toJSON(){return undefined;}};
  expect(()=>restorePortfolioReporting(invalid)).toThrow(SyntaxError);
  const fixture=packed();fixture.case_marker='hook-active-normalization-boundary';
  const saved=JSON.stringify(fixture),descriptor=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  try{
    Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value:function(){
      return this.id==='a'?{id:'hook-normalized-a',value:Infinity}:this;
    }});
    const actual=readPortfolioStore(saved),expected=restorePortfolioReporting(codec.decodeDemoStore(saved));
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
    expect(provenance(actual).source_references[0]).toEqual({id:'hook-normalized-a',value:null});
  }finally{
    if(descriptor)Object.defineProperty(Object.prototype,'toJSON',descriptor);else delete Object.prototype.toJSON;
  }
});


test.each(['normal','omitted','throws','second read null','getter installs hook','serializer installs hook'])('canonical source comparison preserves complete output and serializer ordering: %s',variant=>{
  const fixture=comparisonFixture();
  delete fixture.portfolio_reporting.snapshots[0].current.provenance.source_references[0].unknown;
  fixture.portfolio_reporting.identities[0].head=null;
  const saved=JSON.stringify(compactPortfolioReporting(fixture));
  const run=opaque=>{
    const db=opaque?readPortfolioStore(saved):copy(readPortfolioStore(saved));
    const historical=db.portfolio_reporting.snapshots[0].current,scope=historical.scope,events=[];
    const prototype=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
    let reads=0;
    const install=()=>Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value:function(){return this;}});
    const serializedScope={...scope,toJSON(key){
      events.push('serialize:'+key);
      if(variant==='throws')throw new Error('Synthetic scope serializer failure');
      if(variant==='omitted')return undefined;
      if(variant==='serializer installs hook')install();
      return scope;
    }};
    Object.defineProperty(historical,'scope',{enumerable:true,configurable:true,get(){
      events.push('scope:'+ ++reads);
      if(variant==='getter installs hook'&&reads===2)install();
      return variant==='second read null'&&reads===2?null:serializedScope;
    }});
    let result,error;
    try{result=demoCurrentPositions(db,db.clients,'2026-10-01T00:00:00.000Z');}
    catch(caught){error=caught.message;}
    finally{if(prototype)Object.defineProperty(Object.prototype,'toJSON',prototype);else delete Object.prototype.toJSON;}
    return {result,error,events};
  };
  const expected=run(false),actual=run(true);
  expect(actual).toEqual(expected);
  expect(actual.events.slice(0,2)).toEqual(['scope:1','scope:2']);
  if(variant==='normal'||variant==='serializer installs hook')expect(actual.result[0].current.source_revision).toContain(':legacy:');
  if(variant==='omitted'||variant==='second read null')expect(actual.result[0].current.source_revision).toBeNull();
  if(variant==='throws')expect(actual.error).toBe('Synthetic scope serializer failure');
});


test('changed successful writes reuse exact content proof but still validate and serialize current rows',()=>{
  const db=restorePortfolioReporting(packed());
  provenance(db).source_references[0].proof={proof_probe:'unchanged',nested:[{a:1,z:'✓'}]};
  const storage=memoryStorage(),first=writePortfolioStore(storage,'demo',db),current=readPortfolioStore(first);
  current.case_marker='changed saved bytes';
  const next=writePortfolioStore(storage,'demo',current);
  expect(next).not.toBe(first);
  const nativeKeys=Object.keys,keys=jest.spyOn(Object,'keys').mockImplementation(value=>nativeKeys(value));
  const stringify=jest.spyOn(JSON,'stringify');
  let restored;
  try{
    restored=readPortfolioStore(next);
    expect(rowSerializations(stringify).length).toBeGreaterThan(0);
    expect(keys.mock.calls.filter(([value])=>value?.proof_probe==='unchanged')).toHaveLength(0);
  }finally{keys.mockRestore();stringify.mockRestore();}
  expect(JSON.stringify(restored)).toBe(JSON.stringify(restorePortfolioReporting(codec.decodeDemoStore(next))));
  const external=codec.decodeDemoStore(next);
  external.portfolio_reporting.source_records.find(row=>row.id==='a').proof.nested[0].z='changed content';
  external.case_marker='new full row content';
  const altered=JSON.stringify(external),keySpy=jest.spyOn(Object,'keys').mockImplementation(value=>nativeKeys(value));
  try{
    const changed=readPortfolioStore(altered);
    expect(keySpy.mock.calls.filter(([value])=>value?.proof_probe==='unchanged').length).toBeGreaterThan(0);
    expect(provenance(changed).source_references[0].proof.nested[0].z).toBe('changed content');
  }finally{keySpy.mockRestore();}
});

test('content proof follows complete row text through reordered pools and never authorizes corrupt indices',()=>{
  const storage=memoryStorage(),first=writePortfolioStore(storage,'demo',restorePortfolioReporting(packed()));
  readPortfolioStore(first);
  const reordered=codec.decodeDemoStore(first),history=reordered.portfolio_reporting;
  history.source_records.reverse();
  history.source_vectors=history.source_vectors.map(vector=>vector.map(index=>1-index));
  reordered.case_marker='reordered valid pool';
  const saved=JSON.stringify(reordered),actual=readPortfolioStore(saved);
  expect(JSON.stringify(actual)).toBe(JSON.stringify(restorePortfolioReporting(codec.decodeDemoStore(saved))));
  expect(provenance(actual).source_references.map(row=>row.id)).toEqual(['a','b','a']);
  const invalid=codec.decodeDemoStore(saved);invalid.portfolio_reporting.source_vectors[0][0]=99;
  expect(()=>readPortfolioStore(JSON.stringify(invalid))).toThrow(/source reference is unavailable/);
  expect(provenance(readPortfolioStore(saved)).source_references.map(row=>row.id)).toEqual(['a','b','a']);
});


function pooledScopeFixture(version=2,text='{"z":1e999,"a":-0,"__proto__":{"safe":"✓"},"nested":[{"future":true}],"enrollment_ids":["base"]}'){
  const db=packed(version),history=db.portfolio_reporting;
  history.identities=[{program_id:'c:cis-ig1',scopes:[text],head:null}];
  const currents=[...history.snapshots.map(row=>row.current),...history.scope_events.flatMap(row=>[row.before,row.after])];
  for(const current of currents)current._portfolio_scope_index=0;
  currents[0]._portfolio_enrollment_ids=['second','first'];currents[1]._portfolio_enrollment_ids=['other'];
  return db;
}

test.each([1,2])('V%s lazy pooled scopes preserve complete native values, enrollment order and packed bytes',version=>{
  const fixture=pooledScopeFixture(version),saved=JSON.stringify(fixture);
  const actual=readPortfolioStore(saved),expected=restorePortfolioReporting(copy(fixture));
  const current=actual.portfolio_reporting.snapshots[0].current,descriptor=Object.getOwnPropertyDescriptor(current,'scope');
  expect(typeof descriptor.get).toBe('function');
  expect(JSON.stringify(compactPortfolioReporting(actual))).toBe(JSON.stringify(compactPortfolioReporting(expected)));
  expect(Object.getOwnPropertyDescriptor(current,'scope').get).toBe(descriptor.get);
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  expect(Object.is(current.scope.a,-0)).toBe(true);expect(current.scope.z).toBe(Infinity);
  expect(Object.hasOwn(current.scope,'__proto__')).toBe(true);expect(current.scope.__proto__).toEqual({safe:'✓'});
  expect(current.scope.enrollment_ids).toEqual(['second','first']);
  current.scope.nested[0].future='public edit';current.scope.enrollment_ids.push('local');
  const second=actual.portfolio_reporting.snapshots[1].current.scope;
  expect(second.nested[0].future).toBe(true);expect(second.enrollment_ids).toEqual(['other']);
  expect(readPortfolioStore(saved).portfolio_reporting.snapshots[0].current.scope.nested[0].future).toBe(true);
});

test.each(['delete','redefine','set','freeze','seal','observer getter'])('lazy scope %s preserves ordinary native behavior',variant=>{
  const saved=JSON.stringify(pooledScopeFixture()),actual=readPortfolioStore(saved),expected=restorePortfolioReporting(codec.decodeDemoStore(saved));
  for(const db of [actual,expected]){
    const current=db.portfolio_reporting.snapshots[0].current;
    if(variant==='delete')delete current.scope;
    if(variant==='redefine')Object.defineProperty(current,'scope',{value:{replacement:{unknown:'✓'}},enumerable:true,configurable:true,writable:true});
    if(variant==='set')current.scope={replacement:{unknown:'✓'}};
    if(variant==='freeze'){Object.freeze(current);expect(()=>{current.scope={};}).toThrow(TypeError);expect(current.scope.enrollment_ids).toEqual(['second','first']);}
    if(variant==='seal'){Object.seal(current);current.scope={sealed_write:'retained'};}
    if(variant==='observer getter')Object.defineProperty(current,'observer',{enumerable:true,get(){return Object.getOwnPropertyDescriptor(current,'scope')?.get?'lazy':'materialized';}});
  }
  expect(JSON.stringify(compactPortfolioReporting(actual))).toBe(JSON.stringify(compactPortfolioReporting(expected)));
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
});

test.each(['null','0','true','[]','{"enrollment_ids":null}','{invalid'])('legacy or corrupt pooled scope retains original handling: %s',text=>{
  const fixture=pooledScopeFixture(2,text);
  // Exercise the original shape rather than an enrollment override.
  for(const row of fixture.portfolio_reporting.snapshots)delete row.current._portfolio_enrollment_ids;
  const run=fn=>{try{return {value:JSON.stringify(fn())};}catch(error){return {error:error.name,message:error.message};}};
  expect(run(()=>readPortfolioStore(JSON.stringify(fixture)))).toEqual(run(()=>restorePortfolioReporting(copy(fixture))));
});

test('pooled scope corruption fails eagerly and current serializer hooks keep the public fallback',()=>{
  const invalid=pooledScopeFixture();invalid.portfolio_reporting.snapshots[1].current._portfolio_scope_index=99;
  expect(()=>readPortfolioStore(JSON.stringify(invalid))).toThrow(/scope reference is unavailable/);
  const saved=JSON.stringify(pooledScopeFixture()),actual=readPortfolioStore(saved),expected=restorePortfolioReporting(codec.decodeDemoStore(saved));
  const descriptor=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  try{
    Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value:function(){return this.nested?{...this,hook_added:'preserved'}:this;}});
    expect(JSON.stringify(compactPortfolioReporting(actual))).toBe(JSON.stringify(compactPortfolioReporting(expected)));
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
    const hookActive=readPortfolioStore(saved);
    expect(Object.getOwnPropertyDescriptor(hookActive.portfolio_reporting.snapshots[0].current,'scope').get).toBeUndefined();
  }finally{
    if(descriptor)Object.defineProperty(Object.prototype,'toJSON',descriptor);else delete Object.prototype.toJSON;
  }
});


test('exact-saved reads retain independent lazy scope validation and external replacements are revalidated',()=>{
  const saved=JSON.stringify(pooledScopeFixture());
  readPortfolioStore(saved);
  const hit=readPortfolioStore(saved),current=hit.portfolio_reporting.snapshots[0].current;
  expect(typeof Object.getOwnPropertyDescriptor(current,'scope').get).toBe('function');
  current.scope.nested[0].future='hit-local';
  expect(readPortfolioStore(saved).portfolio_reporting.snapshots[0].current.scope.nested[0].future).toBe(true);
  const changed=codec.decodeDemoStore(saved);changed.portfolio_reporting.identities[0].scopes[0]='{"replacement":{"unknown":"✓"}}';
  expect(readPortfolioStore(JSON.stringify(changed)).portfolio_reporting.snapshots[0].current.scope).toMatchObject({replacement:{unknown:'✓'},enrollment_ids:['second','first']});
  const corrupt=codec.decodeDemoStore(saved);corrupt.portfolio_reporting.identities[0].scopes[0]='{invalid';
  expect(()=>readPortfolioStore(JSON.stringify(corrupt))).toThrow(SyntaxError);
  expect(readPortfolioStore(saved).portfolio_reporting.snapshots[0].current.scope.nested[0].future).toBe(true);
});

test.each(['species','constructor','iterator'])('post-read %s changes preserve original scope callback/output behavior',variant=>{
  const saved=JSON.stringify(pooledScopeFixture());
  const run=lazy=>{
    const db=lazy?readPortfolioStore(saved):restorePortfolioReporting(codec.decodeDemoStore(saved));
    const species=Object.getOwnPropertyDescriptor(Array,Symbol.species),constructor=Object.getOwnPropertyDescriptor(Array.prototype,'constructor'),iterator=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator);
    let calls=0,result;
    try{
      if(variant==='species')Object.defineProperty(Array,Symbol.species,{configurable:true,get(){calls++;return Array;}});
      if(variant==='constructor'){
        const replacement={};Object.defineProperty(replacement,Symbol.species,{get(){calls++;return Array;}});
        Object.defineProperty(Array.prototype,'constructor',{...constructor,value:replacement});
      }
      if(variant==='iterator')Object.defineProperty(Array.prototype,Symbol.iterator,{...iterator,value:function*(){
        for(let i=0;i<this.length;i++){calls++;yield typeof this[i]==='string'&&['second','first','base','other'].includes(this[i])?this[i]+'-current-iterator':this[i];}
      }});
      result=JSON.stringify(compactPortfolioReporting(db));
    }finally{
      Object.defineProperty(Array,Symbol.species,species);Object.defineProperty(Array.prototype,'constructor',constructor);Object.defineProperty(Array.prototype,Symbol.iterator,iterator);
    }
    return {result,calls};
  };
  const expected=run(false),actual=run(true);
  expect(actual).toEqual(expected);expect(actual.calls).toBeGreaterThan(0);
});

test('many distinct enrollment variants fall back eagerly when scope metadata eligibility is exhausted',()=>{
  const fixture=pooledScopeFixture(2,JSON.stringify({padding:'x'.repeat(180000),unknown:{retained:'✓'}}));
  const template=fixture.portfolio_reporting.snapshots[0];
  fixture.portfolio_reporting.snapshots=Array.from({length:32},(_,index)=>({...copy(template),snapshot_id:'bounded-scope-'+index,current:{...copy(template.current),_portfolio_enrollment_ids:['variant-'+index]}}));
  const saved=JSON.stringify(fixture),actual=readPortfolioStore(saved),expected=restorePortfolioReporting(codec.decodeDemoStore(saved));
  expect(typeof Object.getOwnPropertyDescriptor(actual.portfolio_reporting.snapshots[0].current,'scope').get).toBe('function');
  expect(Object.getOwnPropertyDescriptor(actual.portfolio_reporting.snapshots.at(-1).current,'scope').get).toBeUndefined();
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
});


test('valid deeply nested pooled scope remains readable when optional canonical preparation exceeds the stack',()=>{
  const depth=16000,text='{"a":'.repeat(depth)+'0'+'}'.repeat(depth);
  const fixture=pooledScopeFixture(2,text),saved=JSON.stringify(fixture);
  let publicRead,privateRead;
  expect(()=>{publicRead=restorePortfolioReporting(fixture);}).not.toThrow();
  expect(()=>{privateRead=readPortfolioStore(saved);}).not.toThrow();
  for(const db of [publicRead,privateRead]){
    const current=db.portfolio_reporting.snapshots[0].current;
    expect(Object.getOwnPropertyDescriptor(current,'scope').get).toBeUndefined();
    let value=current.scope;
    for(let i=0;i<depth;i++)value=value.a;
    expect(value).toBe(0);
    expect(current.scope.enrollment_ids).toEqual(['second','first']);
    // Canonicalization is still required when actually compacting this scope.
    expect(()=>compactPortfolioReporting(db)).toThrow(RangeError);
  }
});
