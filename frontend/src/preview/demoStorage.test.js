import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY,readStore,saveStore} from './store';
import {clearFileCache,lightweightStore,rememberFiles,restoreFiles,storageDiagnostics} from './evidenceStorage';
const api=axios.create({adapter:previewAdapter});
const persisted=()=>JSON.parse(sessionStorage.getItem(STORE_KEY));
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();clearFileCache();await api.post('/demo/enter');});
const upload=async(bytes,name='sample.txt')=>(await api.post('/evidence',{client_id:persisted().clients[0].client_id,filename:name,mime_type:'text/plain',content_base64:btoa('x'.repeat(bytes))})).data;

test('small files persist; large files retain metadata but no payload after reload',async()=>{
 const small=await upload(10),large=await upload(20000);
 expect(persisted().evidence.find(e=>e.evidence_id===small.evidence_id).content_base64).toBe(btoa('x'.repeat(10)));
 const metadata=persisted().evidence.find(e=>e.evidence_id===large.evidence_id);
 expect(metadata).toMatchObject({filename:'sample.txt',size:20000,mime_type:'text/plain',demo_file_storage:'session_only'});
 expect(metadata.content_base64).toBeUndefined();expect(metadata.uploaded_at).toBeTruthy();
 expect((await api.get('/evidence/'+large.evidence_id+'/download')).data.content_base64).toBe(btoa('x'.repeat(20000)));
 clearFileCache();await expect(api.get('/evidence/'+large.evidence_id+'/download')).rejects.toThrow('metadata and relationships are preserved');
 expect((await api.get('/evidence/'+small.evidence_id+'/download')).data.content_base64).toBeTruthy();
});
test('oversized uploads fail before writes with an explicit error code',async()=>{
 const before=sessionStorage.getItem(STORE_KEY);
 await expect(upload(1024*1024+1)).rejects.toMatchObject({response:{data:{storage_code:'FILE_TOO_LARGE'}}});
 expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
test('clear files preserves users, scopes, permissions and all relationships',async()=>{
 await upload(20000);const before=persisted();localStorage.setItem('real-tenant-sentinel','untouched');
 await api.post('/demo/clear-evidence-files');const after=persisted();
 for(const key of Object.keys(before).filter(k=>k!=='evidence'))expect(after[key]).toEqual(before[key]);
 expect(after.evidence).toEqual(before.evidence.map(({content_base64,...metadata})=>({...metadata,demo_file_storage:'cleared'})));
 expect((await api.get('/demo/storage')).data).toMatchObject({persisted_payload_count:0,memory_file_count:0});
 expect(localStorage.getItem('real-tenant-sentinel')).toBe('untouched');
});
test('legacy large payloads migrate without dropping evidence IDs or relationships',()=>{
 const db=persisted(),e=db.evidence[0];e.content_base64=btoa('a'.repeat(30000));
 sessionStorage.setItem(STORE_KEY,JSON.stringify(db));const loaded=readStore();
 expect(loaded.evidence[0].content_base64).toBe(e.content_base64);
 expect(persisted().evidence[0]).toEqual({...e,content_base64:undefined,demo_file_storage:'session_only'});
 expect(persisted().users).toEqual(db.users);
});
test('full reset recovers corrupted data and restores canonical roles and frameworks',async()=>{
 const canonical=persisted();await upload(20000);sessionStorage.setItem(STORE_KEY,'{broken');
 await expect(api.get('/clients')).rejects.toMatchObject({response:{data:{storage_code:'UNKNOWN_STORAGE_ERROR'}}});
 await api.post('/demo/reset');expect(persisted()).toEqual(canonical);
 expect(new Set(persisted().users.map(u=>u.role))).toEqual(new Set(canonical.users.map(u=>u.role)));
 expect((await api.get('/demo/storage')).data.memory_file_count).toBe(0);
});
test.each([['QuotaExceededError','QUOTA_EXCEEDED'],['SecurityError','STORAGE_UNAVAILABLE'],['Error','WRITE_FAILED']])('%s classifies writes and retains the prior snapshot',async(name,code)=>{
 const before=sessionStorage.getItem(STORE_KEY),db=readStore();db.clients[0].name='Unsaved';
 const stub=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('internal details',name);});
 try{expect(()=>saveStore(db)).toThrow('Changes were not saved');expect((await api.get('/demo/storage')).data.last_error).toBe(code);}finally{stub.mockRestore();}
 expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
test('blocked reads are classified without exposing browser internals',async()=>{
 const stub=jest.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new DOMException('secret browser details','SecurityError');});
 try{await expect(api.get('/clients')).rejects.toMatchObject({response:{data:{storage_code:'STORAGE_UNAVAILABLE'}}});}finally{stub.mockRestore();}
});
test('aggregate persistent and memory payload budgets are bounded',()=>{
 const db={evidence:Array.from({length:100},(_,i)=>({evidence_id:String(i),client_id:'a',content_base64:btoa('x'.repeat(16000))}))};
 const saved=lightweightStore(db);expect(storageDiagnostics(JSON.stringify(saved),saved).persisted_payload_bytes).toBeLessThanOrEqual(256*1024);
 const large={evidence:Array.from({length:10},(_,i)=>({evidence_id:String(i),client_id:'a',content_base64:btoa('x'.repeat(1024*1024))}))};
 rememberFiles(large);expect(storageDiagnostics('',{}).memory_file_bytes).toBeLessThanOrEqual(8*1024*1024);clearFileCache();
});

test('failed clear leaves files and records recoverable; retry succeeds',async()=>{
 const file=await upload(20000),before=sessionStorage.getItem(STORE_KEY);
 const stub=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
 try{await expect(api.post('/demo/clear-evidence-files')).rejects.toMatchObject({response:{data:{storage_code:'QUOTA_EXCEEDED'}}});}finally{stub.mockRestore();}
 expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
 expect((await api.get('/evidence/'+file.evidence_id+'/download')).data.content_base64).toBeTruthy();
 await api.post('/demo/clear-evidence-files');expect((await api.get('/demo/storage')).data.memory_file_count).toBe(0);
});

test('cache cannot hydrate another client and deleted files are pruned',()=>{
 rememberFiles({evidence:[{evidence_id:'same-id',client_id:'client-a',content_base64:btoa('x'.repeat(20000))}]});
 const other={evidence:[{evidence_id:'same-id',client_id:'client-b',demo_file_storage:'session_only'}]};
 expect(restoreFiles(other).evidence[0].content_base64).toBeUndefined();
 rememberFiles({evidence:[]});expect(storageDiagnostics('',{}).memory_file_count).toBe(0);
});
test('a retired seven-client store is discarded, never read back, and never recreated',()=>{
 sessionStorage.clear();
 sessionStorage.setItem('grc_interactive_demo_v2',JSON.stringify({clients:[{client_id:'demo_globo',name:'Globo Gym'}],evidence:[]}));
 const db=readStore();
 expect(db.clients.map(c=>c.name)).toEqual(['Brawndo','Dunder Mifflin','Prestige Worldwide']);
 expect(sessionStorage.getItem('grc_interactive_demo_v2')).toBeNull();
 expect(readStore().clients.map(c=>c.client_id)).toEqual(['demo_brawndo','demo_dunder','demo_prestige']);
});
