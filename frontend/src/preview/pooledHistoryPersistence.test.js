import {activeDefinitions,frameworkCatalog} from '../lib/frameworks';
import {STORE_KEY,readStore,saveStore} from './store';
import {decodeDemoStore} from './demoStorageCodec';

const CLIENT='synthetic-pooled-history';
const INITIAL='2026-10-13T18:00:00.000Z';
const copy=value=>JSON.parse(JSON.stringify(value));
const saved=()=>decodeDemoStore(sessionStorage.getItem(STORE_KEY));
const history=db=>db.portfolio_reporting.snapshots;
function fixture(){
 const framework='cis-ig1';
 return {user:{user_id:'synthetic-owner',role:'super_admin',name:'Synthetic Owner'},users:[],clients:[{client_id:CLIENT,name:'Disposable pooled history',status:'active'}],baselines:{[CLIENT]:{completed:true}},requirements:[{requirement_id:'synthetic-cis',client_id:CLIENT,baseline_key:framework,baseline_response:'applies',status:'active'}],
  framework_assessments:activeDefinitions(framework,{implementation_group:1}).map(definition=>({...definition,definition_id:definition.id,framework_assessment_id:'synthetic:'+definition.id,client_id:CLIENT,framework_key:framework,framework_version:frameworkCatalog(framework).version,status:'not_assessed',created_at:INITIAL})),findings:[],risks:[],policies:[],evidence:[],logs:[],tasks:[],reviews:[],vendors:[]};
}
function install(version=2){
 saveStore(fixture(),{resetFiles:true});
 const packed=saved();
 // Prepare retained legacy bytes directly, rather than ask a native save to
 // rewrite authoritative historical observations.
 const index=packed.portfolio_reporting.source_vectors[history(packed)[0].current.provenance._portfolio_source_index][0];
 const row=packed.portfolio_reporting.source_records[index];
 const reference=typeof row==='string'?JSON.parse(row):row;
 reference.synthetic_unknown=JSON.parse('{"__proto__":{"retained":true},"versions":[{"approved":"original","draft":null}],"text":"日本語 ✓"}');
 packed.portfolio_reporting.source_records[index]=reference;
 if(version===1){
  packed.portfolio_reporting.source_vectors=packed.portfolio_reporting.source_vectors.map(vector=>JSON.stringify(vector.map(index=>{
   const record=packed.portfolio_reporting.source_records[index];return typeof record==='string'?JSON.parse(record):record;
  })));
  packed.portfolio_reporting.storage_version=1;
  delete packed.portfolio_reporting.source_records;
 }
 sessionStorage.setItem(STORE_KEY,JSON.stringify(packed));
 return copy(history(readStore()));
}
beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date(INITIAL));sessionStorage.clear();localStorage.clear();});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});

test.each([1,2])('native save failure preserves complete V%s pooled history and unread source recovery',version=>{
 const expected=install(version),before=sessionStorage.getItem(STORE_KEY),db=readStore();
 // Leave historical source properties unread on this independent native read.
 db.clients[0].name='Must never acknowledge this failed save';
 const storage=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Synthetic full store','QuotaExceededError');});
 try{expect(()=>saveStore(db)).toThrow();}finally{storage.mockRestore();}
 expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
 const reloaded=readStore();
 expect(reloaded.clients[0].name).toBe('Disposable pooled history');
 expect(history(reloaded)).toEqual(expected);
 const references=history(reloaded)[0].current.provenance.source_references;
 expect(Object.hasOwn(references[0].synthetic_unknown,'__proto__')).toBe(true);
 expect(references[0].synthetic_unknown.versions).toEqual([{approved:'original',draft:null}]);
});

test('native source changes append continuity while preserving exact prior observations and independent history',()=>{
 const expected=install(),db=readStore();
 jest.setSystemTime(new Date('2026-10-14T18:00:00.000Z'));
 db.framework_assessments[0].status='addressed';
 saveStore(db);
 const packed=saved();
 expect(packed.portfolio_reporting.storage_version).toBe(2);
 expect(packed.portfolio_reporting.source_vectors.every(vector=>vector.every(index=>Number.isInteger(index)&&index>=0&&index<packed.portfolio_reporting.source_records.length))).toBe(true);
 const reloaded=readStore(),observations=history(reloaded);
 expect(observations.length).toBeGreaterThan(expected.length);
 for(const prior of expected){
  const current=observations.find(row=>row.snapshot_id===prior.snapshot_id);
  expect(current.current.provenance.source_references).toEqual(prior.current.provenance.source_references);
  expect(current.current.scope).toEqual(prior.current.scope);
 }
 expect(reloaded.framework_assessments[0].status).toBe('addressed');
 const first=observations[0].current.provenance.source_references;
 first[0].synthetic_unknown.versions.push({draft:'caller-only'});
 expect(history(readStore())[0].current.provenance.source_references[0].synthetic_unknown.versions).toEqual([{approved:'original',draft:null}]);
});

test('external saved-value replacement and explicit reset cannot reuse a prior pooled source',()=>{
 install();const oldRead=readStore();
 const external=saved();external.clients[0].name='External synthetic replacement';
 const index=external.portfolio_reporting.source_vectors[history(external)[0].current.provenance._portfolio_source_index][0];
 const row=external.portfolio_reporting.source_records[index];
 const replacement=typeof row==='string'?JSON.parse(row):row;
 replacement.synthetic_unknown.text='Distinct externally written history';
 external.portfolio_reporting.source_records[index]=replacement;
 sessionStorage.setItem(STORE_KEY,JSON.stringify(external));
 const fresh=readStore();
 expect(fresh.clients[0].name).toBe('External synthetic replacement');
 expect(history(fresh)[0].current.provenance.source_references[0].synthetic_unknown.text).toBe('Distinct externally written history');
 expect(history(oldRead)[0].current.provenance.source_references[0].synthetic_unknown.text).toBe('日本語 ✓');
 saveStore(fixture(),{resetFiles:true});
 const reset=readStore();
 expect(reset.framework_assessments[0].status).toBe('not_assessed');
 expect(history(reset)[0].current.provenance.source_references.some(row=>Object.hasOwn(row,'synthetic_unknown'))).toBe(false);
});

test('a corrupt externally replaced pool is rejected before any partial history is returned',()=>{
 install();readStore();
 const corrupt=saved();
 const index=history(corrupt)[0].current.provenance._portfolio_source_index;
 corrupt.portfolio_reporting.source_vectors[index][0]=corrupt.portfolio_reporting.source_records.length;
 sessionStorage.setItem(STORE_KEY,JSON.stringify(corrupt));
 const before=sessionStorage.getItem(STORE_KEY);
 expect(()=>readStore()).toThrow();
 expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
