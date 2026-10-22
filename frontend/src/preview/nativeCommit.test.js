import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY,readStore,saveStore,saveStoreAsync,resetStore,clearEvidenceFiles,write} from './store';
import {decodeDemoStore} from './demoStorageCodec';
import {clearFileCache} from './evidenceStorage';

const {CompressionStream:NativeCompressionStream,WritableStream}=require('node:stream/web');
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
const settle=promise=>promise.then(value=>({value}),error=>({error}));
const create=(title,key,options={})=>api.post('/tasks',{client_id:cid,title},{...options,headers:{'Idempotency-Key':key}});
let compressionDescriptor,storage,releases=[];
function gateCompression(){
 let release,started;
 const ready=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 releases.push(release);
 globalThis.CompressionStream=class{constructor(format){const native=new NativeCompressionStream(format),writer=native.writable.getWriter();this.readable=native.readable;this.writable=new WritableStream({async write(bytes){started();await gate;await writer.write(bytes);},close:()=>writer.close(),abort:error=>writer.abort(error)});}};
 return {ready,release};
}
function forceRawQuota(allWrites=false){
 const original=Storage.prototype.setItem;
 storage=jest.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){
  if(key===STORE_KEY&&(allWrites||!Object.hasOwn(JSON.parse(value),'demo_storage_codec')))throw new DOMException('Synthetic physical quota','QuotaExceededError');
  return original.call(this,key,value);
 });
}
beforeEach(async()=>{
 compressionDescriptor=Object.getOwnPropertyDescriptor(globalThis,'CompressionStream');
 releases=[];
 globalThis.CompressionStream=NativeCompressionStream;
 localStorage.clear();sessionStorage.clear();clearFileCache();
 await api.post('/demo/enter');
});
afterEach(async()=>{
 for(const release of releases)release();
 storage?.mockRestore();storage=null;
 // Drain any rejected or interrupted case before replacing its native stream.
 await api.get('/tasks',{params:{client_id:cid}}).catch(()=>undefined);
 if(compressionDescriptor)Object.defineProperty(globalThis,'CompressionStream',compressionDescriptor);else delete globalThis.CompressionStream;
 jest.useRealTimers();
 jest.restoreAllMocks();
});

test('Evidence hashing cannot observe caller mutations to an already authorized object request',async()=>{
 const db=readStore(),foreign=db.clients.find(row=>row.client_id!==cid).client_id;
 const ownTask=db.tasks.find(row=>row.client_id===cid),foreignTask=db.tasks.find(row=>row.client_id===foreign);
 expect(ownTask).toBeTruthy();expect(foreignTask).toBeTruthy();
 db.user={...db.user,user_id:'synthetic-scoped-contributor',role:'client_contributor',client_ids:[cid]};saveStore(db);
 let release,started;
 const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});releases.push(release);
 const digest=globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
 jest.spyOn(globalThis.crypto.subtle,'digest').mockImplementation(async(...args)=>{started();await gate;return digest(...args);});
 const body={client_id:cid,filename:'synthetic owned intent.bin',content_base64:btoa('original bytes'),linked_type:'task',linked_id:ownTask.task_id};
 const params={client_id:cid},headers={'Idempotency-Key':'original-evidence-intent'};
 const pending=settle(previewAdapter({url:'/evidence',method:'post',data:body,params,headers}));await ready;
 body.client_id=foreign;body.linked_id=foreignTask.task_id;body.filename='must not persist';
 params.client_id=foreign;headers['Idempotency-Key']='changed-external-intent';release();
 const result=await pending;
 expect(result.error).toBeUndefined();
 expect(result.value.data).toMatchObject({client_id:cid,linked_id:ownTask.task_id,filename:'synthetic owned intent.bin'});
 const persisted=readStore();
 expect(persisted.evidence.find(row=>row.evidence_id===result.value.data.evidence_id)).toMatchObject({client_id:cid,linked_id:ownTask.task_id});
 expect(persisted.evidence.some(row=>row.filename==='must not persist')).toBe(false);
});

test('queued object bodies, params and plain headers retain their arrival-time intent',async()=>{
 const gate=gateCompression();forceRawQuota();
 const first=create('Synthetic queue blocker','owned-queue-blocker');await gate.ready;
 const actor=readStore().user.user_id,body={client_id:cid,title:'Synthetic original queued object'},params={client_id:cid},headers={'Idempotency-Key':'owned-arrival-key'};
 const pending=settle(previewAdapter({url:'/tasks',method:'post',data:body,params,headers}));
 body.title='Must not replace arrival title';body.client_id='missing-foreign-client';params.client_id='missing-foreign-client';headers['Idempotency-Key']='changed-after-arrival';
 gate.release();await first;
 const result=await pending;expect(result.error).toBeUndefined();
 expect(result.value.data).toMatchObject({client_id:cid,title:'Synthetic original queued object'});
 const db=readStore(),original=JSON.stringify([actor,cid,'owned-arrival-key']);
 expect(db.create_requests[original].record_id).toBe(result.value.data.task_id);
 expect(Object.keys(db.create_requests).some(key=>key.includes('changed-after-arrival'))).toBe(false);
 expect(db.tasks.some(row=>row.title==='Must not replace arrival title')).toBe(false);
});

test('the public adapter rejects malformed URLs through its Promise contract',async()=>{
 let pending;
 expect(()=>{pending=previewAdapter({url:'http://[',method:'get'});}).not.toThrow();
 expect(pending).toBeInstanceOf(Promise);
 await expect(pending).rejects.toBeTruthy();
});

test('synchronous and native asynchronous store bridges preserve complete native documents',async()=>{
 jest.useFakeTimers({doNotFake:['performance','nextTick','queueMicrotask','setTimeout','clearTimeout','setInterval','clearInterval','setImmediate','clearImmediate']}).setSystemTime(new Date('2026-10-22T18:00:00.000Z'));
 const base=sessionStorage.getItem(STORE_KEY),source=readStore();
 source.synthetic_unknown=JSON.parse('{"__proto__":{"retained":true},"nested":["日本語",null,{"original":true}]}');
 const risk=source.risks.find(row=>row.client_id===cid),task=source.tasks.find(row=>row.client_id===cid);
 expect(risk).toBeTruthy();expect(task).toBeTruthy();
 const mutations=[
  db=>{db.clients.find(row=>row.client_id===cid).notes='Synthetic bridge client note';},
  db=>{db.framework_assessments.find(row=>row.client_id===cid&&row.framework_key==='cis-ig1').status='addressed';},
  db=>write(db,'risks',{...db.risks.find(row=>row.risk_id===risk.risk_id),notes:'Synthetic bridge risk note'},risk.risk_id),
  db=>write(db,'tasks',{...db.tasks.find(row=>row.task_id===task.task_id),description:'Synthetic bridge action description'},task.task_id),
  db=>{db.evidence=[];write(db,'evidence',{client_id:cid,filename:'synthetic 日本語.bin',mime_type:'application/octet-stream',content_base64:btoa(String.fromCharCode(0,255,1,128,...new TextEncoder().encode('café 日本語 🔐')))});}
 ];
 forceRawQuota();
 for(const mutate of mutations){
  const candidate=JSON.parse(JSON.stringify(source));mutate(candidate);
  // Restore identical bytes without invoking either bridge before each branch.
  storage.mockRestore();storage=null;sessionStorage.setItem(STORE_KEY,base);forceRawQuota();
  const sync=saveStore(JSON.parse(JSON.stringify(candidate)));
  const syncSaved=JSON.stringify(decodeDemoStore(sessionStorage.getItem(STORE_KEY))),syncRead=JSON.stringify(readStore()),syncReturned=JSON.stringify(sync);
  storage.mockRestore();storage=null;sessionStorage.setItem(STORE_KEY,base);forceRawQuota();
  const asynchronous=await saveStoreAsync(JSON.parse(JSON.stringify(candidate)),{expectedSaved:base});
  expect(JSON.stringify(decodeDemoStore(sessionStorage.getItem(STORE_KEY)))).toBe(syncSaved);
  expect(JSON.stringify(readStore())).toBe(syncRead);
  expect(JSON.stringify(asynchronous)).toBe(syncReturned);
  expect(readStore().synthetic_unknown.nested).toEqual(['日本語',null,{original:true}]);
 }
});

test('overlapping mutations, ordinary reads, AI reads and audited export wait for durable commit',async()=>{
 const gate=gateCompression(),before=sessionStorage.getItem(STORE_KEY);forceRawQuota();
 let acknowledged=false;
 const first=create('Synthetic first queued commit','native-first').then(response=>{acknowledged=true;return response;});
 await gate.ready;
 const second=create('Synthetic second queued commit','native-second');
 let observed=false;const get=api.get('/tasks',{params:{client_id:cid}}).then(response=>{observed=true;return response;});
 const ai=api.get('/ai_systems',{params:{client_id:cid}});
 const exported=api.get('/frameworks/cis-ig1/export',{params:{client_id:cid}});
 expect(acknowledged).toBe(false);expect(observed).toBe(false);expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
 gate.release();
 const [a,b,listed]=await Promise.all([first,second,get,ai,exported]);
 expect(listed.data.map(row=>row.task_id)).toEqual(expect.arrayContaining([a.data.task_id,b.data.task_id]));
 const reloaded=readStore();
 expect(reloaded.tasks.filter(row=>['Synthetic first queued commit','Synthetic second queued commit'].includes(row.title))).toHaveLength(2);
});

test.each(['save','reset','clear'])('a direct %s during compression cannot be overwritten by the pending adapter snapshot',async operation=>{
 const prior=readStore();prior.clients[0].name='Synthetic distinguishable prior';saveStore(prior);
 const gate=gateCompression();forceRawQuota();
 const pending=settle(create('Synthetic stale pending task','external-'+operation));await gate.ready;
 if(operation==='save'){const external=readStore();external.clients[0].name='Synthetic external save';saveStore(external);}
 if(operation==='reset')resetStore();
 if(operation==='clear')clearEvidenceFiles();
 const external=sessionStorage.getItem(STORE_KEY);gate.release();
 const result=await pending;expect(result.error?.response?.status).toBe(409);
 expect(sessionStorage.getItem(STORE_KEY)).toBe(external);
 expect(readStore().tasks.some(row=>row.title==='Synthetic stale pending task')).toBe(false);
});

test('logout and reentry invalidate both pending commit and requests queued in the former session',async()=>{
 const gate=gateCompression();forceRawQuota();
 const pending=settle(create('Synthetic ended session','ended'));await gate.ready;
 const queued=settle(api.get('/tasks',{params:{client_id:cid}}));
 await api.post('/auth/logout');await api.post('/demo/enter');
 const current=sessionStorage.getItem(STORE_KEY);gate.release();
 expect((await pending).error?.response?.status).toBe(401);
 expect((await queued).error?.response?.status).toBe(401);
 expect(sessionStorage.getItem(STORE_KEY)).toBe(current);
 await expect(api.get('/tasks',{params:{client_id:cid}})).resolves.toHaveProperty('status',200);
});

test('changed persisted authority rejects a pending save; cancellation leaves the queue usable',async()=>{
 const gate=gateCompression();forceRawQuota();
 const pending=settle(create('Synthetic former actor','former-actor'));await gate.ready;
 const authority=readStore();authority.user={...authority.user,user_id:'synthetic-other-actor',role:'client_viewer',client_ids:[cid]};saveStore(authority);
 const bytes=sessionStorage.getItem(STORE_KEY);gate.release();
 expect((await pending).error?.response?.status).toBe(409);expect(sessionStorage.getItem(STORE_KEY)).toBe(bytes);
 storage.mockRestore();storage=null;const restored=readStore();restored.user={...restored.user,user_id:'synthetic-owner',role:'super_admin'};saveStore(restored);
 const cancelledGate=gateCompression();forceRawQuota();const controller=new AbortController();
 const cancelled=settle(create('Synthetic cancelled task','cancelled',{signal:controller.signal}));await cancelledGate.ready;controller.abort();cancelledGate.release();
 expect((await cancelled).error?.code).toBe('ERR_CANCELED');
 const recovered=await create('Synthetic queue recovery','recovery');expect(readStore().tasks.some(row=>row.task_id===recovered.data.task_id)).toBe(true);
 expect(readStore().tasks.some(row=>row.title==='Synthetic cancelled task')).toBe(false);
});

test('failed physical writes publish neither record nor replay receipt; retry commits once',async()=>{
 const before=sessionStorage.getItem(STORE_KEY);forceRawQuota(true);
 await expect(create('Synthetic atomic replay','atomic-replay')).rejects.toBeTruthy();
 expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
 storage.mockRestore();storage=null;
 const first=(await create('Synthetic atomic replay','atomic-replay')).data;
 const retry=(await create('Synthetic atomic replay','atomic-replay')).data;
 expect(retry.task_id).toBe(first.task_id);
 expect(readStore().tasks.filter(row=>row.title==='Synthetic atomic replay')).toHaveLength(1);
});

test('native compressed Evidence commit preserves exact binary and Unicode bytes after cache loss and reload',async()=>{
 const db=readStore();db.evidence=[];saveStore(db);forceRawQuota();
 const samples=[{filename:'synthetic.bin',content:btoa(String.fromCharCode(...Array.from({length:256},(_,index)=>index)))},{filename:'日本語 résumé.txt',content:btoa(String.fromCharCode(...new TextEncoder().encode('café 日本語 🔐')))}];
 const uploaded=[];
 for(const sample of samples)uploaded.push((await api.post('/evidence',{client_id:cid,filename:sample.filename,mime_type:'application/octet-stream',content_base64:sample.content})).data);
 clearFileCache();readStore();
 for(let index=0;index<samples.length;index++){
  const download=(await api.get('/evidence/'+uploaded[index].evidence_id+'/download')).data;
  expect(download.content_base64).toBe(samples[index].content);
  expect(readStore().evidence.find(row=>row.evidence_id===uploaded[index].evidence_id).filename).toBe(samples[index].filename);
 }
});
