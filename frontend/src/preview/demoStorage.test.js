import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY,readStore,saveStore,seedStore,clearEvidenceFiles,demoDiagnostics} from './store';
import {compressDemoStore,decodeDemoStore} from './demoStorageCodec';
import {getCisDemoScenarioContext} from './cisDemoHistoryContext';
import {CIS_SHOWCASE_VERSION,cisDemoFixtureDates} from './cisDemoFixtureDates';
import {clearFileCache,getEvidenceCacheRevision,lightweightEvidence,lightweightStore,rememberFiles,restoreFiles,storageDiagnostics} from './evidenceStorage';
const api=axios.create({adapter:previewAdapter});
const persisted=()=>JSON.parse(sessionStorage.getItem(STORE_KEY));
const OPENED_AT='2026-10-13T17:00:00.000Z',RESET_AT='2026-10-13T18:00:00.000Z';
beforeEach(async()=>{jest.useFakeTimers().setSystemTime(new Date(OPENED_AT));sessionStorage.clear();localStorage.clear();clearFileCache();await api.post('/demo/enter');});
afterEach(()=>jest.useRealTimers());
const upload=async(bytes,name='sample.txt')=>(await api.post('/evidence',{client_id:persisted().clients[0].client_id,filename:name,mime_type:'text/plain',content_base64:btoa('x'.repeat(bytes))})).data;
const utf8Base64=text=>btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16))));

test('compressed storage remains readable by native read, previous-save, clear and diagnostics paths',async()=>{
 const file=await upload(10,'compressed-retained.bin');
 const before=readStore(),serialized=sessionStorage.getItem(STORE_KEY);
 const payloadCount=decodeDemoStore(serialized).evidence.filter(e=>e.content_base64).length;
 sessionStorage.setItem(STORE_KEY,compressDemoStore(serialized));
 expect(readStore()).toEqual(before);
 expect(demoDiagnostics()).toMatchObject({storage:'sessionStorage',persisted_payload_count:payloadCount});
 expect(demoDiagnostics().uncompressed_json_bytes).toBeGreaterThan(demoDiagnostics().approximate_bytes);
 const current=readStore();current.clients[0].name='Synthetic compressed prior snapshot';saveStore(current);
 expect(readStore().clients[0].name).toBe('Synthetic compressed prior snapshot');
 expect((await api.get(`/evidence/${file.evidence_id}/download`)).data.content_base64).toBe(btoa('x'.repeat(10)));
 sessionStorage.setItem(STORE_KEY,compressDemoStore(sessionStorage.getItem(STORE_KEY)));
 clearEvidenceFiles();
 const cleared=decodeDemoStore(sessionStorage.getItem(STORE_KEY));
 expect(cleared.evidence.find(e=>e.evidence_id===file.evidence_id)).toMatchObject({demo_file_storage:'cleared'});
 expect(cleared.evidence.every(e=>!e.content_base64)).toBe(true);
});

test('binary and Unicode payloads survive document-cache loss when inline space is available',async()=>{
 const db=readStore();db.evidence=[];saveStore(db);
 const payloads=[
  {filename:'sample.bin',mime_type:'application/octet-stream',content_base64:'data:application/octet-stream;base64,'+btoa(String.fromCharCode(0,255,128,1,2,10,13,65,127,254))},
  {filename:'résumé 日本語 QA.txt',mime_type:'text/plain',content_base64:'data:text/plain;base64,'+utf8Base64('SYNTHETIC Phase 2 evidence\ncafé ✓ 日本語\n')}
 ];
 const rows=[];
 for(const payload of payloads)rows.push((await api.post('/evidence',{client_id:'demo_brawndo',...payload})).data);
 const before=persisted();
 clearFileCache();readStore();
 for(const [i,row] of rows.entries())expect((await api.get(`/evidence/${row.evidence_id}/download`)).data.content_base64).toBe(payloads[i].content_base64);
 expect(persisted().evidence).toEqual(before.evidence);
 expect((await api.get('/demo/storage')).data).toMatchObject({persisted_payload_count:2,temporary_payload_count:0,unavailable_temporary_payload_count:0,memory_file_count:0});
});

test('a retained saturated budget explicitly diagnoses small temporary files before and after reload',async()=>{
 const db=readStore();
 // Three retained files leave 16 bytes, less than even a 10-byte upload's base64.
 db.evidence=Array.from({length:3},(_,i)=>({evidence_id:`retained-${i}`,client_id:'demo_dunder',filename:`retained-${i}.bin`,content_base64:btoa('r'.repeat(8190))}));
 saveStore(db);const before=persisted().evidence;
 const binary=await upload(10,'small.bin');
 const unicode=(await api.post('/evidence',{client_id:'demo_brawndo',filename:'unicode.txt',mime_type:'text/plain',content_base64:utf8Base64('Résumé — 日本語 🔐\n')})).data;
 expect((await api.get('/demo/storage')).data).toMatchObject({inline_budget_bytes:65536,persisted_payload_bytes:65520,inline_remaining_bytes:16,temporary_payload_count:2,unavailable_temporary_payload_count:0,memory_file_count:2});
 for(const row of [binary,unicode])expect(persisted().evidence.find(e=>e.evidence_id===row.evidence_id)).toMatchObject({demo_file_storage:'session_only'});
 clearFileCache();readStore();
 expect((await api.get('/demo/storage')).data).toMatchObject({persisted_payload_bytes:65520,inline_remaining_bytes:16,temporary_payload_count:2,unavailable_temporary_payload_count:2,memory_file_count:0});
 for(const row of [binary,unicode])await expect(api.get(`/evidence/${row.evidence_id}/download`)).rejects.toThrow('metadata and relationships are preserved');
 expect(persisted().evidence.filter(e=>e.evidence_id.startsWith('retained-'))).toEqual(before);
});

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

test('a new upload cannot evict another client\'s previously persisted file',async()=>{
 const db=readStore();
 const retained={evidence_id:'retained-dunder-file',client_id:'demo_dunder',filename:'retained.txt',mime_type:'text/plain',content_base64:btoa('d'.repeat(16000))};
 db.evidence=[{evidence_id:'existing-brawndo-file',client_id:'demo_brawndo',content_base64:btoa('b'.repeat(8000))},retained];
 saveStore(db);
 const before=persisted().evidence.find(e=>e.evidence_id===retained.evidence_id);
 expect(before).toEqual(retained);
 const uploaded=(await api.post('/evidence',{client_id:'demo_brawndo',filename:'new.txt',mime_type:'text/plain',content_base64:btoa('n'.repeat(1000))})).data;
 expect(persisted().evidence.find(e=>e.evidence_id===retained.evidence_id)).toEqual(before);
 expect(persisted().evidence.find(e=>e.evidence_id===uploaded.evidence_id)).toMatchObject({demo_file_storage:'session_only'});
 expect((await api.get('/evidence/'+uploaded.evidence_id+'/download')).data.content_base64).toBe(btoa('n'.repeat(1000)));
 const reordered=readStore();reordered.evidence.reverse();saveStore(reordered);
 expect(persisted().evidence.find(e=>e.evidence_id===retained.evidence_id)).toEqual(before);
 clearFileCache();
 expect((await api.get('/evidence/'+retained.evidence_id+'/download')).data.content_base64).toBe(retained.content_base64);
});
test('failed uploads leave the stored snapshot and existing temporary files unchanged',async()=>{
 const temporary=await upload(20000),before=sessionStorage.getItem(STORE_KEY),diagnostics=(await api.get('/demo/storage')).data;
 const stub=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
 try{await expect(upload(30000,'unsaved.txt')).rejects.toMatchObject({response:{data:{storage_code:'QUOTA_EXCEEDED'}}});}finally{stub.mockRestore();}
 expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
 expect((await api.get('/demo/storage')).data).toMatchObject({memory_file_count:diagnostics.memory_file_count,memory_file_bytes:diagnostics.memory_file_bytes});
 expect((await api.get('/evidence/'+temporary.evidence_id+'/download')).data.content_base64).toBe(btoa('x'.repeat(20000)));
 clearFileCache();
 expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
test('retention does not transfer to another client with the same evidence ID',()=>{
 const previous=[{evidence_id:'same-id',client_id:'client-a',content_base64:btoa('a'.repeat(16000))}];
 const db={evidence:[{evidence_id:'new-file',client_id:'client-b',content_base64:btoa('b'.repeat(10000))},{...previous[0],client_id:'client-b'}]};
 const saved=lightweightStore(db,previous);
 expect(saved.evidence[0].content_base64).toBe(db.evidence[0].content_base64);
 expect(saved.evidence[1]).toMatchObject({demo_file_storage:'session_only'});
 expect(saved.evidence[1]).not.toHaveProperty('content_base64');
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
 const canonical=persisted();await upload(20000);const beforeReset=persisted();
 localStorage.setItem('standard-reset-sentinel','untouched');
 expect(Object.values(beforeReset.portfolio_reporting.activity_proofs).some(proof=>proof.eligible)).toBe(true);
 sessionStorage.setItem(STORE_KEY,'{broken');
 await expect(api.get('/clients')).rejects.toMatchObject({response:{data:{storage_code:'UNKNOWN_STORAGE_ERROR'}}});
 jest.setSystemTime(new Date(RESET_AT));await api.post('/demo/reset');const restored=persisted();
 const {portfolio_reporting:originalReporting,...originalSources}=canonical;
 const {portfolio_reporting:reporting,...restoredSources}=restored;
 // Fresh native Reviews receive new command IDs and reset-time metadata.
 // Normalize only those volatile identities (including references) and clock;
 // keep the complete canonical content/roles/approvals/history comparison.
 const canonicalSources=sources=>{
   const runtimeIds=sources.reviews.filter(row=>/^reviews_demo_/.test(row.review_id)).map(row=>[row.review_id,
     `native-review:${row.client_id}:${row.baseline_key||''}:${row.policy_id||row.vendor_id||row.risk_id||row.ai_system_id||row.title}`]);
   runtimeIds.push(...sources.logs.filter(row=>/^audit_demo_/.test(row.audit_id)).map((row,index)=>[row.audit_id,`native-audit:${index}`]));
   const visit=(value,field)=>{
     if(typeof value==='string'){
       let text=value.replaceAll(OPENED_AT,'<reset-clock>').replaceAll(RESET_AT,'<reset-clock>');
       for(const [id,stableId] of runtimeIds)text=text.replaceAll(id,stableId);
       return text;
     }
     if(Array.isArray(value))return value.map(item=>visit(item));
     if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[visit(key),field==='seed_fingerprints'?'<fresh-record-digest>':visit(item,key)]));
     return value;
   };
   return visit(sources);
 };
 expect(canonicalSources(restoredSources)).toEqual(canonicalSources(originalSources));
 expect(reporting).toMatchObject({started_at:RESET_AT,last_captured_at:RESET_AT,activity_proofs:{}});
 expect(reporting.activity_proofs).toEqual({});
 expect(reporting.snapshots).toHaveLength(originalReporting.snapshots.length);
 expect(reporting.snapshots.filter(snapshot=>snapshot.observation_kind==='demo_fixture')).toHaveLength(18);
 const currentSnapshots=reporting.snapshots.filter(snapshot=>snapshot.observation_kind!=='demo_fixture');
 expect(currentSnapshots.length).toBeGreaterThan(0);
 expect(currentSnapshots.every(snapshot=>snapshot.captured_at===RESET_AT&&snapshot.current.captured_at===RESET_AT)).toBe(true);
 // Synthetic observations are fixed to the UTC initialization day; current
 // native positions still record the exact reset commit time above.
 const fixtureAnchor=cisDemoFixtureDates(new Date(RESET_AT)).anchor;
 expect(restored.cis_demo_refresh).toMatchObject({version:CIS_SHOWCASE_VERSION,anchor:fixtureAnchor,timezone:'UTC'});
 expect(reporting.fixture_versions?.['brawndo-cis-ig1-history-v2']).toBeUndefined();
 const oldIds=new Set(beforeReset.portfolio_reporting.snapshots.map(snapshot=>snapshot.snapshot_id));
 const fresh=seedStore(),decoded=readStore(),canonicalIds=new Set();
 for(const [clientId,total] of [['demo_brawndo',56],['demo_initech',130],['demo_krusty_krab',153]]){
   const context=getCisDemoScenarioContext(decoded,clientId,RESET_AT);
   const expected=getCisDemoScenarioContext(fresh,clientId,RESET_AT);
   expect(context).toBeTruthy();
   expect(context).toMatchObject({version:CIS_SHOWCASE_VERSION,client_id:clientId,program_id:clientId+':cis-ig1',anchor:fixtureAnchor});
   expect(context).toEqual(expected);
   expect(context.point_ids).toHaveLength(6);
   const points=decoded.portfolio_reporting.snapshots.filter(point=>context.point_ids.includes(point.snapshot_id));
   expect(points).toEqual(fresh.portfolio_reporting.snapshots.filter(point=>expected.point_ids.includes(point.snapshot_id)));
   expect(points).toHaveLength(6);
   expect(points.every(point=>point.observation_kind==='demo_fixture'&&point.program_id===clientId+':cis-ig1'
     &&point.current.provenance.fixture_revision===CIS_SHOWCASE_VERSION&&point.current.scenario_anchor===fixtureAnchor)).toBe(true);
   expect(points.slice(0,-1).every(point=>point.captured_at<fixtureAnchor)).toBe(true);
   expect(points.at(-1).captured_at).toBe(fixtureAnchor);
   const nativeRows=decoded.framework_assessments.filter(row=>row.client_id===clientId&&row.framework_key==='cis-ig1');
   expect(nativeRows).toHaveLength(total);
   const references=points.at(-1).current.provenance.source_references;
   expect(references).toHaveLength(total);
   expect(references.map(row=>row.id).sort()).toEqual(nativeRows.map(row=>row.framework_assessment_id).sort());
   expect(references.every(row=>row.framework_version==='8.1')).toBe(true);
   expect(Object.fromEntries(references.map(row=>[row.definition_id,row.status])))
     .toEqual(Object.fromEntries(nativeRows.map(row=>[row.definition_id,row.status])));
   context.point_ids.forEach(id=>canonicalIds.add(id));
 }
 expect(reporting.snapshots.filter(snapshot=>oldIds.has(snapshot.snapshot_id)).every(snapshot=>canonicalIds.has(snapshot.snapshot_id))).toBe(true);
 expect(currentSnapshots.some(snapshot=>oldIds.has(snapshot.snapshot_id))).toBe(false);
 expect(new Set(restored.users.map(u=>u.role))).toEqual(new Set(canonical.users.map(u=>u.role)));
 expect((await api.get('/demo/storage')).data.memory_file_count).toBe(0);
 expect(localStorage.getItem('standard-reset-sentinel')).toBe('untouched');
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
 const saved=lightweightStore(db);expect(storageDiagnostics(JSON.stringify(saved),saved).persisted_payload_bytes).toBeLessThanOrEqual(64*1024);
 const large={evidence:Array.from({length:10},(_,i)=>({evidence_id:String(i),client_id:'a',content_base64:btoa('x'.repeat(1024*1024))}))};
 rememberFiles(large);expect(storageDiagnostics('',{}).memory_file_bytes).toBeLessThanOrEqual(8*1024*1024);clearFileCache();
});

test('repeated Review snapshot fields compact without changing history',()=>{
 const db={evidence:[],reviews:[{review_id:'r',title:'Quarterly access review',scope:'Current scope',framework_drivers:[{framework_key:'iso-27001'}],occurrences:[{occurrence_id:'old',title:'Quarterly access review',scope:'Historical scope',framework_drivers:[{framework_key:'iso-27001'}]},{occurrence_id:'current',title:'Quarterly access review',scope:'Current scope',framework_drivers:[{framework_key:'iso-27001'}]}]}]};
 const persisted=JSON.parse(JSON.stringify(lightweightStore(db)));
 expect(persisted.reviews[0].occurrences[1]).not.toHaveProperty('framework_drivers');
 expect(restoreFiles(persisted)).toEqual(db);
});

test('inherited Review snapshots preserve primitive normalization and independent structured history',()=>{
 const scope=JSON.parse('{"nested":{"items":["original"]},"__proto__":{"retained":true}}');
 const parent={scope,framework_drivers:[{unknown:{items:['original']}}],title:'café 日本語 🔐\ud800',reviewer_id:undefined,owner_id:null,recurrence:false,baseline_key:-0,framework_key:NaN,framework_plan_key:Infinity,governance_context:new Date('2026-10-21T00:00:00Z')};
 const fields=Object.keys(parent),occurrences=[{_review_inherited:fields},{_review_inherited:fields}];
 const review={...parent,occurrences},before=JSON.stringify(review);
 const restored=restoreFiles({evidence:[],reviews:[review]}).reviews[0];
 const [first,second]=restored.occurrences;
 expect(JSON.stringify(review)).toBe(before);
 expect(first.title).toBe(parent.title);expect(first.reviewer_id).toBeUndefined();
 expect(Object.hasOwn(first,'reviewer_id')).toBe(true);
 expect(first.owner_id).toBeNull();expect(first.recurrence).toBe(false);
 expect(first.baseline_key).toBe(0);expect(Object.is(first.baseline_key,-0)).toBe(false);
 expect(first.framework_key).toBeNull();expect(first.framework_plan_key).toBeNull();
 expect(first.governance_context).toBe('2026-10-21T00:00:00.000Z');
 expect(Object.hasOwn(first.scope,'__proto__')).toBe(true);
 expect(first.scope.__proto__).toEqual({retained:true});
 expect(first.scope).not.toBe(scope);expect(first.scope).not.toBe(second.scope);
 expect(first.framework_drivers).not.toBe(parent.framework_drivers);
 expect(first.framework_drivers).not.toBe(second.framework_drivers);
 first.scope.nested.items.push('changed');first.scope.__proto__.retained=false;
 first.framework_drivers[0].unknown.items.push('changed');
 expect(scope.nested.items).toEqual(['original']);expect(scope.__proto__.retained).toBe(true);
 expect(second.scope.nested.items).toEqual(['original']);expect(second.scope.__proto__.retained).toBe(true);
 expect(parent.framework_drivers[0].unknown.items).toEqual(['original']);
 expect(second.framework_drivers[0].unknown.items).toEqual(['original']);
 expect(Object.getPrototypeOf(first.scope)).toBe(Object.prototype);
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
test('a prior-version store remains recoverable without silently importing or deleting its records',()=>{
 sessionStorage.clear();
 sessionStorage.setItem('grc_interactive_demo_v2',JSON.stringify({clients:[{client_id:'demo_globo',name:'Globo Gym'}],evidence:[]}));
 const db=readStore();
 expect(db.clients.map(c=>c.name)).toEqual(['Brawndo','Dunder Mifflin','Prestige Worldwide','Initech','The Krusty Krab']);
 expect(JSON.parse(sessionStorage.getItem('grc_interactive_demo_v2'))).toEqual({clients:[{client_id:'demo_globo',name:'Globo Gym'}],evidence:[]});
 expect(readStore().clients.map(c=>c.client_id)).toEqual(['demo_brawndo','demo_dunder','demo_prestige','demo_initech','demo_krusty_krab']);
});


test('read-time evidence checks do not compact discarded Review snapshots while saves still pack and expand them',()=>{
 const raw=decodeDemoStore(sessionStorage.getItem(STORE_KEY));
 const review=raw.reviews.find(row=>row.occurrences?.length);
 expect(review).toBeDefined();
 const marker='Synthetic read-compaction probe unique title';
 review.title=marker;review.occurrences[0].title=marker;
 review.scope={read_probe:marker,position:'parent'};
 review.occurrences[0].scope={read_probe:marker,position:'occurrence'};
 if(review.occurrences[0]._review_inherited)review.occurrences[0]._review_inherited=review.occurrences[0]._review_inherited.filter(field=>field!=='scope');
 sessionStorage.setItem(STORE_KEY,JSON.stringify(raw));
 const stringify=jest.spyOn(JSON,'stringify');
 let loaded;
 try{
   loaded=readStore();
   expect(stringify.mock.calls.filter(([value])=>value&&typeof value==='object'&&Object.hasOwn(value,'read_probe')&&value.read_probe===marker)).toHaveLength(0);
   expect(loaded.reviews.find(row=>row.review_id===review.review_id).occurrences[0].title).toBe(marker);
   stringify.mockClear();
   saveStore(loaded);
   expect(stringify.mock.calls.filter(([value])=>value&&typeof value==='object'&&Object.hasOwn(value,'read_probe')&&value.read_probe===marker).length).toBeGreaterThan(0);
 }finally{stringify.mockRestore();}
 const stored=decodeDemoStore(sessionStorage.getItem(STORE_KEY)).reviews.find(row=>row.review_id===review.review_id);
 expect(stored.occurrences[0]._review_inherited).toContain('title');
 expect(Object.hasOwn(stored.occurrences[0],'title')).toBe(false);
 expect(readStore().reviews.find(row=>row.review_id===review.review_id).occurrences[0].title).toBe(marker);
});

test('evidence-only preparation retains the same persisted-byte reservation and metadata as a full save',()=>{
 const durable={evidence_id:'durable',client_id:'a',content_base64:btoa('x'.repeat(14000))};
 const added={evidence_id:'added',client_id:'b',content_base64:btoa('y'.repeat(14000))};
 const evidence=[added,durable],previous=[durable];
 const evidenceOnly=lightweightEvidence(evidence,previous),full=lightweightStore({reviews:[],evidence},previous).evidence;
 expect(evidenceOnly).toEqual(full);
 expect(evidenceOnly[1].content_base64).toBe(durable.content_base64);
 expect(evidenceOnly[0]).toMatchObject({evidence_id:'added',demo_file_storage:'session_only'});
 expect(Object.hasOwn(evidenceOnly[0],'content_base64')).toBe(false);
 expect(evidence[0].content_base64).toBe(added.content_base64);
});


test.each([
 ['negative zero',-0,0,true],['NaN and null',NaN,null,true],['Infinity and null',Infinity,null,true],
 ['undefined and null',undefined,null,false],['undefined pair',undefined,undefined,true],
 ['string and boolean','true',true,false],['boolean pair',false,false,true],
])('Review inheritance retains JSON equality semantics for %s',(_label,parentValue,occurrenceValue,inherited)=>{
 const original={reviews:[{review_id:'synthetic-json-review',scope:parentValue,occurrences:[{occurrence_id:'synthetic-json-occurrence',scope:occurrenceValue}]}],evidence:[]};
 const packed=lightweightStore(original),occurrence=packed.reviews[0].occurrences[0];
 expect(occurrence._review_inherited?.includes('scope')||false).toBe(inherited);
 const expanded=restoreFiles(packed).reviews[0].occurrences[0];
 if(inherited&&typeof parentValue==='number')expect(expanded.scope).toBe(JSON.parse(JSON.stringify(parentValue)));
 else expect(expanded.scope).toBe(occurrenceValue);
 expect(Object.hasOwn(original.reviews[0].occurrences[0],'scope')).toBe(true);
});

test('Review object serializers retain callback ordering, failures and independently expanded values',()=>{
 const calls=[];
 const object=label=>({toJSON(key){calls.push([label,key]);return {nested:[{value:'retained Unicode ✓'}]};}});
 const review={review_id:'synthetic-serializer-review',scope:object('parent'),occurrences:[{occurrence_id:'first',scope:object('first')},{occurrence_id:'second',scope:object('second')}]};
 const packed=lightweightStore({reviews:[review],evidence:[]});
 expect(calls).toEqual([['first',''],['parent',''],['second',''],['parent','']]);
 expect(packed.reviews[0].occurrences.every(row=>row._review_inherited.includes('scope'))).toBe(true);
 calls.length=0;
 const expanded=restoreFiles(packed).reviews[0].occurrences;
 expect(calls).toEqual([['parent',''],['parent','']]);
 expanded[0].scope.nested[0].value='local change';
 expect(expanded[1].scope.nested[0].value).toBe('retained Unicode ✓');
 const broken={reviews:[{scope:{toJSON(){throw new Error('Synthetic serializer failure');}},occurrences:[{scope:{}}]}],evidence:[]};
 expect(()=>lightweightStore(broken)).toThrow('Synthetic serializer failure');
});

test('file-cache freshness changes before partial updates and clearing without changing persisted metadata',()=>{
 const metadata={evidence_id:'synthetic-cache-file',client_id:'demo_brawndo',demo_file_storage:'session_only'};
 const oldPayload=btoa('old temporary content'),newPayload=btoa('new temporary content');
 const persisted={evidence:[{...metadata}]},saved=sessionStorage.getItem(STORE_KEY);
 rememberFiles({evidence:[{...metadata,content_base64:oldPayload}]},persisted);
 const before=getEvidenceCacheRevision();
 expect(restoreFiles({evidence:[{...metadata}],reviews:[]}).evidence[0].content_base64).toBe(oldPayload);
 const broken={evidence_id:'synthetic-failed-file',get content_base64(){throw new Error('Synthetic cache update failure');}};
 expect(()=>rememberFiles({evidence:[{...metadata,content_base64:newPayload},broken]},
   {evidence:[{...metadata},{evidence_id:broken.evidence_id}]})).toThrow('Synthetic cache update failure');
 const partiallyUpdated=getEvidenceCacheRevision();
 expect(partiallyUpdated).not.toBe(before);
 expect(restoreFiles({evidence:[{...metadata}],reviews:[]}).evidence[0].content_base64).toBe(newPayload);
 expect(persisted).toEqual({evidence:[metadata]});
 clearFileCache();expect(getEvidenceCacheRevision()).not.toBe(partiallyUpdated);
 expect(restoreFiles({evidence:[{...metadata}],reviews:[]}).evidence[0].content_base64).toBeUndefined();
 expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);
});
