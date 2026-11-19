import axios from 'axios';
import {createHash,webcrypto} from 'crypto';
import {unzipSync,strFromU8} from 'fflate';
import {previewAdapter} from './adapter';
import {ids,saveStore,readStore,STORE_KEY} from './store';
import {clearFileCache,getEvidenceCacheRevision} from './evidenceStorage';
import {decodeDemoStore,writeDemoStore} from './demoStorageCodec';
import {buildEvidenceArchive} from '../lib/evidenceArchive';
import archiveApi from '../lib/api';
import {CIS_SHOWCASE_VERSION} from '../lib/demoClients';
import {registerCisDemoArtifact} from './cisDemoArtifactRecipes';
import {renderCisOperationArtifact} from './cisDemoOperations';
jest.mock('../lib/api',()=>({__esModule:true,default:{get:jest.fn()},PREVIEW_MODE:true,formatError:error=>error.message}));

const api=axios.create({adapter:previewAdapter}),copy=value=>JSON.parse(JSON.stringify(value));
const sha=base64=>createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex');
let baseline,original,target;
beforeAll(()=>{
  Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  const cid='demo_krusty_krab',anchor='2026-10-28T00:00:00.000Z',day='2026-10-08';
  const recipe={kind:'operation',schema_version:1,fixture_version:CIS_SHOWCASE_VERSION,client_id:cid,anchor,key:'evidence_vendor_current',title:'Synthetic Microsoft workspace assurance checklist',day};
  const actor={user_id:'archive-reader',role:'super_admin',status:'active',workspace_mode:'demo',name:'Archive reader',email:'archive@example.test'};
  // Use the real registrar/provider with one authorized fixture; archive proof
  // does not depend on unrelated full Demo workflow-history construction.
  baseline={...Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]])),user:actor,users:[actor],logs:[],baselines:{},clients:[{client_id:cid,name:'The Krusty Krab',environment:'Demo',status:'active'}],vendors:[{vendor_id:cid+'_vendor_hosting',client_id:cid,name:'Recorded provider',status:'active'}],cis_demo_refresh:{version:CIS_SHOWCASE_VERSION,anchor,timezone:'UTC',clients:{[cid]:{version:CIS_SHOWCASE_VERSION,state:'fresh_fixture'}}}};
  const row={evidence_id:cid+'_evidence_vendor_current',client_id:cid,filename:'evidence_vendor_current.txt',mime_type:'text/plain',version:1,...renderCisOperationArtifact(recipe),linked_type:'vendor',linked_id:cid+'_vendor_hosting',created_at:day+'T00:00:00.000Z',uploaded_at:day+'T00:00:00.000Z',uploaded_by:actor.user_id,uploaded_by_email:actor.email};
  baseline.evidence.push(row);expect(registerCisDemoArtifact(baseline,row,recipe)).toBe(true);
});
beforeEach(()=>{
  sessionStorage.clear();localStorage.clear();clearFileCache();original=copy(baseline);const retained=copy(original);delete retained.evidence[0].content_base64;retained.evidence[0].demo_file_storage='session_only';writeDemoStore(sessionStorage,STORE_KEY,JSON.stringify(retained));sessionStorage.setItem('grc_demo_entered','true');clearFileCache();
  const packed=decodeDemoStore(sessionStorage.getItem(STORE_KEY));target=packed.evidence.find(row=>row.client_id==='demo_krusty_krab'&&!row.content_base64&&row.demo_file_storage==='session_only'&&row.sha256==null);
  expect(target).toBeTruthy();archiveApi.get.mockImplementation((...args)=>api.get(...args));
});
afterEach(()=>{jest.restoreAllMocks();jest.clearAllMocks();sessionStorage.clear();localStorage.clear();clearFileCache();});
function inlineFile(change=()=>{}){const db=decodeDemoStore(sessionStorage.getItem(STORE_KEY)),row=db.evidence.find(row=>row.evidence_id===target.evidence_id);row.content_base64=original.evidence.find(row=>row.evidence_id===target.evidence_id).content_base64;delete row.demo_file_storage;change(db,row);writeDemoStore(sessionStorage,STORE_KEY,JSON.stringify(db));clearFileCache();}

test('a ZIP includes exact authorized restored Demo bytes and labels a delivery checksum without changing retained metadata, cache or storage',async()=>{
  const before=sessionStorage.getItem(STORE_KEY),cache=getEvidenceCacheRevision(),expected=original.evidence.find(row=>row.evidence_id===target.evidence_id);
  const response=await api.get('/evidence/'+target.evidence_id+'/download');
  expect(response.data.content_base64).toBe(expected.content_base64);expect(response.data.computed_sha256).toBe(sha(expected.content_base64));expect(response.data.computed_sha256_source).toBe('verified_immutable_fixture_bytes');expect(response.data.sha256).toBe(target.sha256);
  const result=await buildEvidenceArchive({clientId:target.client_id,params:{q:target.filename},isCurrent:()=>true}),zip=unzipSync(result.bytes),paths=Object.keys(zip).filter(path=>path!=='index.csv');
  expect(result.fileCount).toBe(1);expect(paths.length).toBeGreaterThan(0);for(const path of paths)expect(Buffer.from(zip[path]).toString('base64')).toBe(expected.content_base64);
  expect(strFromU8(zip['index.csv'])).toContain('Computed at download from verified immutable fixture bytes');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);expect(getEvidenceCacheRevision()).toBe(cache);expect(readStore().evidence.find(row=>row.evidence_id===target.evidence_id).sha256).toBe(target.sha256);
});
test.each(['cleared','modified descriptor'])('%s bytes never acquire a computed checksum or become an archive',async condition=>{
  if(condition==='cleared')await api.post('/demo/clear-evidence-files');
  else{const db=copy(readStore());db.cis_demo_refresh.clients[target.client_id].artifacts[target.evidence_id].recipe.title+=' modified';saveStore(db,{resetFiles:true});clearFileCache();}
  const before=sessionStorage.getItem(STORE_KEY);
  await expect(api.get('/evidence/'+target.evidence_id+'/download')).rejects.toMatchObject({response:{status:400}});
  await expect(buildEvidenceArchive({clientId:target.client_id,params:{q:target.filename},isCurrent:()=>true})).rejects.toThrow();
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
test('exact known inline fixture bytes receive only a computed delivery token without rewriting their stored checksum',async()=>{
  inlineFile();const before=sessionStorage.getItem(STORE_KEY),expected=original.evidence.find(row=>row.evidence_id===target.evidence_id);
  const {data}=await api.get('/evidence/'+target.evidence_id+'/download');expect(data.content_base64).toBe(expected.content_base64);expect(data.computed_sha256).toBe(sha(expected.content_base64));expect(data.computed_sha256_source).toBe('verified_immutable_fixture_bytes');expect(data.sha256).toBe(target.sha256);expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
test.each(['bytes','descriptor','cleared'])('changed inline fixture %s cannot claim a verified delivery checksum',async condition=>{
  inlineFile((db,row)=>{if(condition==='bytes')row.content_base64=btoa('Different inline contents');if(condition==='descriptor')db.cis_demo_refresh.clients[target.client_id].artifacts[target.evidence_id].recipe.title+=' changed';if(condition==='cleared')row.demo_file_storage='cleared';});
  const before=sessionStorage.getItem(STORE_KEY);await expect(api.get('/evidence/'+target.evidence_id+'/download')).rejects.toMatchObject({response:{status:409}});expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
test('an ordinary inline upload without an immutable fixture descriptor never receives a computed fixture token',async()=>{
  inlineFile((db,row)=>{row.evidence_id='ordinary-native-upload';row.computed_sha256=sha(row.content_base64);row.computed_sha256_source='verified_immutable_fixture_bytes';});const {data}=await api.get('/evidence/ordinary-native-upload/download');expect(data.content_base64).toBeTruthy();expect(data.computed_sha256).toBeUndefined();expect(data.computed_sha256_source).toBeUndefined();
});
test.each(['store','cache','session','cancel'])('the read-only delivery hash rejects changed %s after Web Crypto yields',async condition=>{
  const digest=webcrypto.subtle.digest.bind(webcrypto.subtle);let release;
  jest.spyOn(webcrypto.subtle,'digest').mockImplementationOnce((algorithm,bytes)=>new Promise(resolve=>{release=async()=>resolve(await digest(algorithm,bytes));}));
  const controller=new AbortController(),pending=api.get('/evidence/'+target.evidence_id+'/download',{signal:controller.signal});
  for(let count=0;count<30&&!release;count++)await Promise.resolve();expect(release).toBeDefined();
  if(condition==='store')sessionStorage.setItem(STORE_KEY,sessionStorage.getItem(STORE_KEY)+' ');
  if(condition==='cache')clearFileCache();
  if(condition==='session')await api.post('/auth/logout');
  if(condition==='cancel')controller.abort();
  const rejected=condition==='cancel'?expect(pending).rejects.toMatchObject({code:'ERR_CANCELED'}):expect(pending).rejects.toMatchObject({response:{status:condition==='session'?401:409}});
  await release();await rejected;
});
