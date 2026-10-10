import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {guidedCatalog,versionForSafeguard,generateResult} from '../lib/guidedAssessment';
import {readStore,saveStore,ids} from './store';
import {prepareGuidedContext} from './frameworks';
import lineageContract from '../../../backend/tests/fixtures/guided-lineage-contract.json';
import baseline from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS} from '../lib/frameworks';
const api=axios.create({adapter:previewAdapter});
let row,path,pilotBody;
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');const w=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;row=w.assessments.find(a=>a.definition_id==='1.1');path='/framework_assessments/'+row.framework_assessment_id+'/guided-assessment';const initial=(await api.get(path)).data;pilotBody={...body,version:initial.version,...Object.fromEntries(['base_assessment_token','base_scope_fingerprint'].map(key=>[key,initial[key]]))};});
const body={version:versionForSafeguard('1.1'),answers:{inventory:'No',existing:'Manual list'},step:1,completed:false,expected_revision:0};
const source=draft=>Object.fromEntries(['version','revision','generated_at'].map(key=>[key,draft[key]]));
const continuation=(draft,changes={})=>({version:draft.version,answers:draft.answers,step:draft.step,completed:draft.completed,narrative:draft.narrative||'',expected_revision:draft.revision,...changes});
async function firstWrite(route,changes={}){
  const current=(await api.get(route)).data;
  return {...body,version:current.version,base_assessment_token:current.base_assessment_token,base_scope_fingerprint:current.base_scope_fingerprint,...changes};
}
const persisted=draft=>Object.fromEntries(Object.entries(draft).filter(([key])=>!['current_assessment_token','current_scope_fingerprint','lineage_known','lineage_stale'].includes(key)));
async function restart(route=path,id='1.1'){
  const draft=(await api.get(route)).data;
  return {version:versionForSafeguard(id,true),answers:{},step:0,completed:false,narrative:'',expected_revision:draft.revision,restart:true,
    base_assessment_token:draft.current_assessment_token,base_scope_fingerprint:draft.current_scope_fingerprint};
}
function editStore(edit){const db=readStore();edit(db);saveStore(db);}
function isolateNewClientFixture(){
  // Provisioning exercises the real adapter in an empty authorized portfolio.
  // Existing-client and cross-client regressions below retain the full Demo.
  const db=readStore();
  for(const key of Object.keys(ids))if(key!=='users')db[key]=[];
  for(const key of ['baselines','drafts','riskSequences','ai_intake','ai_counters','guided_assessment_pilot'])db[key]={};
  db.logs=[];db.notifications=[];
  saveStore(db);
}
test('save and resume leave native assessment evidence and history unchanged',async()=>{
  const first=(await api.put(path,pilotBody)).data;expect(first.revision).toBe(1);
  expect((await api.get(path)).data.answers).toEqual(body.answers);
  expect((await api.get('/framework_assessments/'+row.framework_assessment_id)).data).toEqual(row);
  await expect(api.put(path,pilotBody)).rejects.toMatchObject({response:{status:409}});
});
test('Apply uses normal save and preserves verification and history attribution',async()=>{
  const draft=(await api.put(path,{...pilotBody,completed:true})).data,source=Object.fromEntries(['version','revision','generated_at'].map(k=>[k,draft[k]]));
  const result=(await api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Brawndo reports no inventory.',status:'needs_attention',guided_assessment_source:source})).data;
  expect(result.verification).toBe(row.verification);expect(result.last_assessed).toBeTruthy();
  expect(result.assessment_history.at(-1).guided_assessment_source.answers).toEqual(body.answers);
  expect(result.guided_assessment_source.base_scope_fingerprint).toBe(draft.base_scope_fingerprint);
  expect(result.related_links).toEqual(row.related_links);
  const edited=(await api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Manual correction'})).data;
  expect(edited.guided_assessment_source).toBeNull();
  expect(edited.assessment_history.at(-2).guided_assessment_source).toEqual(result.guided_assessment_source);
});
test('applicable CIS clients start clean and unrelated frameworks reject access',async()=>{
  const cis=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_initech'}})).data;
  const interview=(await api.get('/framework_assessments/'+cis.assessments.find(a=>a.definition_id==='1.1').framework_assessment_id+'/guided-assessment')).data;
  expect(interview.answers).toEqual({});expect(interview.revision).toBe(0);
  for(const [framework,cid] of [['iso-27001','demo_dunder']]){
    const w=(await api.get('/frameworks/'+framework,{params:{client_id:cid}})).data;
    if(w.assessments?.length)await expect(api.get('/framework_assessments/'+w.assessments[0].framework_assessment_id+'/guided-assessment')).rejects.toMatchObject({response:{status:404}});
  }
});

test.each([1,2,3])('new IG%i clients receive canonical clean interviews and preserve inherited work on upgrade',async group=>{
  isolateNewClientFixture();
  const cid=(await api.post('/clients',{name:'Temporary Omni provisioning QA'})).data.client_id;
  const state={version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),reviews:[],framework_reviews:{},framework_settings:{'cis-ig1':{implementation_group:group}}};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  const workspace=async()=>(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
  const initial=await workspace(),first=initial.assessments.find(a=>a.definition_id==='1.1'),route='/framework_assessments/'+first.framework_assessment_id+'/guided-assessment';
  expect(initial.active_definition_ids).toHaveLength({1:56,2:130,3:153}[group]);
  await Promise.all(Object.keys(guidedCatalog.definitions).filter(id=>guidedCatalog.definitions[id].groups.includes(group)).map(async id=>{
    const record=initial.assessments.find(a=>a.definition_id===id);
    expect((await api.get('/framework_assessments/'+record.framework_assessment_id+'/guided-assessment')).data).toMatchObject({version:versionForSafeguard(id),answers:{},revision:0});
  }));
  const interview=(await api.put(route,await firstWrite(route,{narrative:'Synthetic preserved narrative',completed:true}))).data;
  const original=(await api.patch('/framework_assessments/'+first.framework_assessment_id,{implementation:'Synthetic implementation',status:'needs_attention'})).data;
  for(const next of [2,3].filter(g=>g>group)){
    await api.patch('/frameworks/cis-ig1/configuration',{client_id:cid,implementation_group:next,expected_updated_at:(await workspace()).configuration.expected_updated_at},{headers:{'Idempotency-Key':'omni-upgrade-'+group+'-'+next}});
    const updated=await workspace();expect(updated.active_definition_ids).toHaveLength(next===2?130:153);
    expect(updated.assessments.filter(a=>a.definition_id==='1.1')).toHaveLength(1);
    expect(updated.assessments.find(a=>a.framework_assessment_id===first.framework_assessment_id)).toEqual(original);
    const resumed=(await api.get(route)).data;
    expect(persisted(resumed)).toEqual(persisted(interview));
    expect(resumed.lineage_stale).toBe(true);
    await Promise.all(Object.keys(guidedCatalog.definitions).filter(id=>guidedCatalog.definitions[id].groups.includes(next)&&id!=='1.1').map(async id=>{
      const added=updated.assessments.find(a=>a.definition_id===id);
      expect((await api.get('/framework_assessments/'+added.framework_assessment_id+'/guided-assessment')).data.answers).toEqual({});
    }));
  }
});

test('direct IG1 to IG3 preserves expanded interview and native history without copying client answers',async()=>{
  const cid=(await api.post('/clients',{name:'Temporary direct upgrade QA'})).data.client_id;
  const state={version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),reviews:[],framework_reviews:{},framework_settings:{'cis-ig1':{implementation_group:1}}};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  const workspace=async()=>(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
  const initial=await workspace(),record=initial.assessments.find(a=>a.definition_id==='2.1');
  const route='/framework_assessments/'+record.framework_assessment_id+'/guided-assessment';
  const interview=(await api.put(route,await firstWrite(route,{answers:{practice:'Partially',operation:'Synthetic preserved software process'},narrative:'Operator supplied summary'}))).data;
  const saved=(await api.patch('/framework_assessments/'+record.framework_assessment_id,{implementation:'Preserved implementation',status:'in_progress'})).data;
  await api.patch('/frameworks/cis-ig1/configuration',{client_id:cid,implementation_group:3,expected_updated_at:initial.configuration.expected_updated_at},{headers:{'Idempotency-Key':'omni-direct-upgrade'}});
  const upgraded=await workspace();
  expect(upgraded.active_definition_ids).toHaveLength(153);
  expect(new Set(upgraded.active_definition_ids).size).toBe(153);
  expect(upgraded.assessments.find(a=>a.framework_assessment_id===record.framework_assessment_id)).toEqual(saved);
  const resumed=(await api.get(route)).data;
  expect(persisted(resumed)).toEqual(persisted(interview));
  expect(resumed.lineage_stale).toBe(true);
  expect(upgraded.guided_assessment_drafts['2.1']).toEqual({revision:1,completed:false,version:interview.version,generated_at:null,user_id:'demo_admin'});
  const added=upgraded.assessments.find(a=>a.definition_id==='18.5');
  expect((await api.get('/framework_assessments/'+added.framework_assessment_id+'/guided-assessment')).data).toMatchObject({answers:{},revision:0});
});

test('pilot GET reports trusted context without creating an interview or changing native dates',async()=>{
  const before=readStore(),first=(await api.get(path)).data;
  expect(first).toMatchObject({version:versionForSafeguard('1.1',true),revision:0,lineage_known:true,lineage_stale:false});
  expect(first.base_assessment_token).toBe(row.last_saved||row.last_assessed||null);
  expect(first.base_scope_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(first.current_scope_fingerprint).toBe(first.base_scope_fingerprint);
  const after=readStore();expect(after.guided_assessment_pilot).toEqual(before.guided_assessment_pilot);
  expect(after.framework_assessments).toEqual(before.framework_assessments);
  editStore(db=>{const record=db.framework_assessments.find(a=>a.framework_assessment_id===row.framework_assessment_id);delete record.last_saved;delete record.last_assessed;delete record.assessed_by;});
  const unknown=(await api.get(path)).data;
  expect(unknown.base_assessment_token).toBeNull();
  const current=(await api.get('/framework_assessments/'+row.framework_assessment_id)).data;
  expect(current).not.toHaveProperty('last_assessed');expect(current).not.toHaveProperty('last_saved');
});

test('Demo lineage fingerprint matches the backend contract including Unicode scope inputs',async()=>{
  const db={clients:[lineageContract.client],framework_assessments:[lineageContract.row],
    user:{role:'super_admin',workspace_mode:'demo',user_id:'synthetic-hash-account'}};
  const context=await prepareGuidedContext(db,'/framework_assessments/'+lineageContract.row.framework_assessment_id+'/guided-assessment','get',{});
  expect(Object.fromEntries(['base_assessment_token','base_scope_fingerprint'].map(key=>[key,context[key]]))).toEqual(lineageContract.base);
});

test('exact engine output is recorded separately from editable narrative and archived unchanged',async()=>{
  const result=generateResult('1.1',pilotBody.answers,new Date('2026-10-07T12:00:00Z'),pilotBody.version);
  expect(result.version).toBe(pilotBody.version);
  const first=(await api.put(path,{...pilotBody,completed:true,result,narrative:'Reviewer-edited original'})).data;
  expect((await api.get(path)).data.result).toEqual(result);
  const edited=(await api.put(path,continuation(first,{result,narrative:'Later edited narrative'}))).data;
  const history=(await api.get(path+'/history')).data;
  expect(history.items[0]).toMatchObject({revision:1,result,narrative:'Reviewer-edited original',generated_at:first.generated_at});
  expect(edited.result).toEqual(result);expect(edited.narrative).toBe('Later edited narrative');
  for(const invalid of [{...result,version:'different'},{...result,verification:'verified'},{...result,status:'verified'},{...result,gaps:['x'.repeat(4001)]},{...result,basis:Array(154).fill('entry')},{...result,signals:[{kind:'unknown',questionId:'practice'}]}])
    await expect(api.put(path,continuation(edited,{result:invalid}))).rejects.toMatchObject({response:{status:422}});
  await expect(api.put(path,continuation(edited,{completed:false,result}))).rejects.toMatchObject({response:{status:422}});
  const checkpoint=(await api.put(path,continuation(edited,{completed:false,narrative:'',result:null}))).data;
  expect(checkpoint.result).toBeNull();
  const page=(await api.get(path+'/history',{params:{limit:1}})).data;
  expect(page.items.map(d=>d.revision)).toEqual([2]);expect(page.has_more).toBe(true);
  const earlier=(await api.get(path+'/history',{params:{limit:1,before_revision:page.next_before_revision}})).data;
  expect(earlier.items.map(d=>d.revision)).toEqual([1]);expect(earlier.next_before_revision).toBeNull();
  for(const params of [{limit:101},{limit:0},{before_revision:0}])await expect(api.get(path+'/history',{params})).rejects.toMatchObject({response:{status:422}});
});

test('an explicit empty restart archives an incomplete checkpoint and captures a fresh base',async()=>{
  const first=(await api.put(path,pilotBody)).data;
  const restarted=(await api.put(path,await restart())).data;
  expect(restarted).toMatchObject({revision:2,answers:{},step:0,completed:false,lineage_known:true,lineage_stale:false,result:null});
  const archived=(await api.get(path+'/history')).data.items[0];
  expect(archived.answers).toEqual(first.answers);expect(archived.updated_at).toBe(first.updated_at);
  expect(archived.generated_at).toBeNull();
  await expect(api.put(path,{...await restart(),answers:{inventory:'Yes'}})).rejects.toMatchObject({response:{status:422}});
});

test('legacy saved versions can continue only their actual own answers and unknown lineage stays unknown',async()=>{
  const db=readStore(),key=row.framework_assessment_id+':'+db.user.user_id;
  const old={version:versionForSafeguard('1.1',false),answers:body.answers,step:1,completed:true,revision:5,narrative:'Preserved historical narrative',generated_at:'2026-09-01T12:00:00Z'};
  editStore(store=>{(store.guided_assessment_pilot||={})[key]=old;});
  const historical=(await api.get(path)).data;
  expect(historical).toMatchObject({version:old.version,lineage_known:false,lineage_stale:null});
  expect(historical).not.toHaveProperty('base_assessment_token');expect(historical).not.toHaveProperty('result');
  const continued=(await api.put(path,continuation(historical,{narrative:'Edited on the same historical version'}))).data;
  expect(continued.version).toBe(old.version);expect(continued.lineage_known).toBe(false);expect(continued.lineage_stale).toBeNull();
  await expect(api.put(path,continuation(continued,{version:versionForSafeguard('1.1',true)}))).rejects.toMatchObject({response:{status:409}});
  await expect(api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Unknown-base proposal',status:'needs_attention',guided_assessment_source:source(continued)})).rejects.toMatchObject({response:{status:409}});
  const fresh=(await api.put(path,await restart())).data;
  expect(fresh.version).toBe(versionForSafeguard('1.1',true));expect(fresh.lineage_known).toBe(true);
  expect((await api.get(path+'/history')).data.items.at(-1).narrative).toBe(old.narrative);
  editStore(store=>{delete store.guided_assessment_pilot[key];});
  await expect(api.put(path,{...pilotBody,version:old.version})).rejects.toMatchObject({response:{status:409}});
});

test('old program matrix answers survive continuation before an explicit new-version restart',async()=>{
  await api.patch('/frameworks/cis-ig1/configuration',{client_id:'demo_brawndo',implementation_group:2,expected_updated_at:(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data.configuration.expected_updated_at},{headers:{'Idempotency-Key':'pilot-program-upgrade'}});
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data,record=workspace.assessments.find(a=>a.definition_id==='13.2');
  const route='/framework_assessments/'+record.framework_assessment_id+'/guided-assessment',db=readStore(),key=record.framework_assessment_id+':'+db.user.user_id;
  const old={version:versionForSafeguard('13.2',false),answers:{practice:'Partially',operation:'Historical operator report'},step:1,completed:false,revision:3,narrative:''};
  editStore(store=>{(store.guided_assessment_pilot||={})[key]=old;});
  const continued=(await api.put(route,continuation(old))).data;
  expect(continued.version).toBe(old.version);expect(continued.answers).toEqual(old.answers);
  const fresh=(await api.put(route,await restart(route,'13.2'))).data;
  expect(fresh.version).toBe(versionForSafeguard('13.2',true));expect(fresh.answers).toEqual({});
  expect((await api.get(route+'/history')).data.items[0].answers).toEqual(old.answers);
});

test('missing or forged bases reject first save and stale manual edits reject Apply with a fresh native token',async()=>{
  await expect(api.put(path,body)).rejects.toMatchObject({response:{status:409}});
  await expect(api.put(path,{...pilotBody,base_scope_fingerprint:'0'.repeat(64)})).rejects.toMatchObject({response:{status:409}});
  const first=(await api.put(path,{...pilotBody,completed:true})).data;
  const manual=(await api.patch('/framework_assessments/'+row.framework_assessment_id,{notes:'Updated while recommendation was open'})).data;
  await expect(api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Stale recommendation',status:'needs_attention',expected_last_assessed:manual.last_saved,guided_assessment_source:source(first)})).rejects.toMatchObject({response:{status:409}});
  expect((await api.get('/framework_assessments/'+row.framework_assessment_id)).data).toEqual(manual);
  const stale=(await api.get(path)).data;expect(stale.lineage_stale).toBe(true);
  await expect(api.put(path,continuation(stale,{base_assessment_token:stale.current_assessment_token}))).rejects.toMatchObject({response:{status:409}});
  const fresh=(await api.put(path,await restart())).data;expect(fresh.lineage_stale).toBe(false);
});

test('configuration and operating-provider changes invalidate lineage without new date policies',async()=>{
  const first=(await api.put(path,{...pilotBody,completed:true})).data;
  editStore(db=>{const native=db.framework_assessments.find(a=>a.framework_assessment_id===row.framework_assessment_id);native.cis_operation={...native.cis_operation,provider:'Changed operating provider'};});
  expect((await api.get(path)).data.lineage_stale).toBe(true);
  await expect(api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Outdated provider result',status:'needs_attention',guided_assessment_source:source(first)})).rejects.toMatchObject({response:{status:409}});
  const restarted=(await api.put(path,await restart())).data;expect(restarted.base_scope_fingerprint).not.toBe(first.base_scope_fingerprint);
  editStore(db=>{db.clients.find(c=>c.client_id==='demo_brawndo').cis_configuration_updated_at='2026-10-07T15:00:00Z';});
  expect((await api.get(path)).data.lineage_stale).toBe(true);
  expect((await api.get('/framework_assessments/'+row.framework_assessment_id)).data.last_assessed).toBe(row.last_assessed);
});

test('interview history and new drafts remain scoped to the current account and authorized client',async()=>{
  const first=(await api.put(path,{...pilotBody,completed:true})).data;
  await api.put(path,continuation(first,{narrative:'Archived account report'}));
  editStore(db=>{db.user={...db.user,user_id:'other-demo-account'};});
  expect((await api.get(path+'/history')).data.items).toEqual([]);
  expect((await api.get(path)).data).toMatchObject({revision:0,answers:{}});
  const other=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_initech'}})).data.assessments.find(a=>a.definition_id==='1.1'),route='/framework_assessments/'+other.framework_assessment_id+'/guided-assessment';
  const clean=(await api.get(route)).data;
  expect(clean).toMatchObject({version:versionForSafeguard('1.1'),answers:{},step:0,completed:false,revision:0,lineage_known:true,lineage_stale:false});
  expect(clean.current_scope_fingerprint).toBe(clean.base_scope_fingerprint);
  expect((await api.get(route+'/history')).data.items).toEqual([]);
  editStore(db=>{db.user={...db.user,role:'client_contributor',client_ids:['demo_initech']};});
  await expect(api.get(path+'/history')).rejects.toMatchObject({response:{status:403}});
});

test('configured CIS clients use trusted current defaults and reject forged bases and fresh historical versions',async()=>{
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_initech'}})).data,record=workspace.assessments.find(a=>a.definition_id==='1.1');
  const route='/framework_assessments/'+record.framework_assessment_id+'/guided-assessment';
  expect((await api.get(route)).data.version).toBe(versionForSafeguard('1.1'));
  await expect(api.put(route,body)).rejects.toMatchObject({response:{status:409}});
  const trusted=await firstWrite(route);
  await expect(api.put(route,{...trusted,version:versionForSafeguard('1.1',false)})).rejects.toMatchObject({response:{status:409}});
  await expect(api.put(route,{...trusted,base_scope_fingerprint:'0'.repeat(64)})).rejects.toMatchObject({response:{status:409}});
  const first=(await api.put(route,trusted)).data;
  expect(first.base_scope_fingerprint).toBe(trusted.base_scope_fingerprint);
  await expect(api.put(route,continuation(first,{upgraded:true}))).rejects.toMatchObject({response:{status:422}});
  await expect(api.put(route,continuation(first,{base_scope_fingerprint:'0'.repeat(64)}))).rejects.toMatchObject({response:{status:409}});
  expect((await api.get(route)).data).toEqual(first);
  expect((await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_initech'}})).data.guided_assessment_drafts['1.1']).toEqual({revision:1,completed:false,version:first.version,generated_at:null,user_id:'demo_admin'});
});

test('CIS work context uses native relationships and non-CIS work keeps its original shape',async()=>{
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;
  const work=workspace.work[row.framework_assessment_id];
  expect(work.context_complete).toBe(true);expect(work.task_ids).toEqual([...new Set(work.task_ids)].sort());
  expect(work.priority_records.every(item=>!['completed','cancelled','done','closed','accepted'].includes(item.status))).toBe(true);
  expect(new Set(work.priority_records.map(item=>item.kind+':'+item.id)).size).toBe(work.priority_records.length);
  expect(work.priority_records.every(item=>!Object.keys(item).some(key=>['description','notes','content_base64','verification','occurrences'].includes(key)))).toBe(true);
  const legacy=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_initech'}})).data;
  expect(Object.values(legacy.work).every(value=>value.context_complete===true&&Array.isArray(value.priority_records))).toBe(true);
  for(const key of ['soc-2','iso-27001']){
    editStore(db=>{db.framework_assessments.push({...row,framework_assessment_id:'demo-other-'+key,framework_key:key,definition_id:key==='soc-2'?'CC1.1':'A.5.1'});});
    const other=(await api.get('/frameworks/'+key,{params:{client_id:'demo_brawndo'}})).data.work['demo-other-'+key];
    for(const field of ['context_complete','priority_records','task_ids']){
      if(key==='soc-2')expect(other).toHaveProperty(field);else expect(other).not.toHaveProperty(field);
    }
  }
});

test('all 153 current CIS defaults use configured program scope without a client-name exception',async()=>{
  const current=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data.configuration;
  await api.patch('/frameworks/cis-ig1/configuration',{client_id:'demo_brawndo',implementation_group:3,expected_updated_at:current.expected_updated_at},{headers:{'Idempotency-Key':'pilot-all-current-versions'}});
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;
  expect(workspace.active_definition_ids).toHaveLength(153);
  for(const record of workspace.assessments){
    const draft=(await api.get('/framework_assessments/'+record.framework_assessment_id+'/guided-assessment')).data;
    expect(draft).toMatchObject({version:versionForSafeguard(record.definition_id,true),answers:{},revision:0,lineage_known:true,lineage_stale:false});
  }
},60000); // 153 real local adapter requests include asynchronous native hashes.

test('concurrent completed edits keep a single CAS winner and immutable prior output',async()=>{
  const first=(await api.put(path,{...pilotBody,completed:true,narrative:'Original completed report'})).data;
  const attempts=await Promise.allSettled(['First window','Second window'].map(narrative=>api.put(path,continuation(first,{narrative}))));
  expect(attempts.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(attempts.find(result=>result.status==='rejected').reason.response.status).toBe(409);
  const history=(await api.get(path+'/history')).data.items;
  expect(history).toHaveLength(1);expect(history[0].narrative).toBe('Original completed report');
  const winner=attempts.find(result=>result.status==='fulfilled').value.data;
  expect((await api.get(path)).data.narrative).toBe(winner.narrative);
});

test('storage reload after asynchronous hashing preserves unrelated writes and rejects a changed native base',async()=>{
  const subtle=globalThis.crypto.subtle,original=subtle.digest.bind(subtle);
  let arrived,release;const started=new Promise(resolve=>{arrived=resolve;}),paused=new Promise(resolve=>{release=resolve;});
  const spy=jest.spyOn(subtle,'digest').mockImplementation(async(...args)=>{arrived();await paused;return original(...args);});
  try{
    const pending=api.put(path,pilotBody);await started;
    const other=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_initech'}})).data.assessments[0];
    const unrelated=(await api.patch('/framework_assessments/'+other.framework_assessment_id,{notes:'Concurrent unrelated native edit'})).data;
    release();await pending;
    expect((await api.get('/framework_assessments/'+other.framework_assessment_id)).data).toEqual(unrelated);
  }finally{release();spy.mockRestore();}
  let arrivedAgain,releaseAgain;const startedAgain=new Promise(resolve=>{arrivedAgain=resolve;}),pausedAgain=new Promise(resolve=>{releaseAgain=resolve;});
  const nextSpy=jest.spyOn(subtle,'digest').mockImplementation(async(...args)=>{arrivedAgain();await pausedAgain;return original(...args);});
  try{
    const pending=api.put(path,{...pilotBody,expected_revision:1});await startedAgain;
    const native=(await api.patch('/framework_assessments/'+row.framework_assessment_id,{notes:'Concurrent native base edit'})).data;
    releaseAgain();await expect(pending).rejects.toMatchObject({response:{status:409}});
    expect((await api.get('/framework_assessments/'+row.framework_assessment_id)).data).toEqual(native);
  }finally{releaseAgain();nextSpy.mockRestore();}
});

test('an account switch while hashing cannot save or expose the prior account draft',async()=>{
  const subtle=globalThis.crypto.subtle,original=subtle.digest.bind(subtle);
  let arrived,release;const started=new Promise(resolve=>{arrived=resolve;}),paused=new Promise(resolve=>{release=resolve;});
  const spy=jest.spyOn(subtle,'digest').mockImplementation(async(...args)=>{arrived();await paused;return original(...args);});
  try{
    const pending=api.put(path,pilotBody);await started;
    editStore(db=>{db.user={...db.user,user_id:'switched-demo-account'};});
    release();await expect(pending).rejects.toMatchObject({response:{status:409}});
    expect((await api.get(path)).data).toMatchObject({revision:0,answers:{}});
    expect((await api.get(path+'/history')).data.items).toEqual([]);
  }finally{release();spy.mockRestore();}
});

test.each(['archived client','read-only role','revoked membership','reassigned owner','ended session'])('a %s during hashing rejects the write under current authorization',async change=>{
  const contributor=['revoked membership','reassigned owner'].includes(change);
  editStore(db=>{
    db.user={...db.user,role:contributor?'client_contributor':'platform_admin',all_clients:!contributor,client_ids:['demo_brawndo']};
    if(contributor)db.framework_assessments.find(a=>a.framework_assessment_id===row.framework_assessment_id).owner_id=db.user.user_id;
  });
  const initial=(await api.get(path)).data,currentBody={...pilotBody,...Object.fromEntries(['base_assessment_token','base_scope_fingerprint'].map(key=>[key,initial[key]]))};
  const before=readStore(),subtle=globalThis.crypto.subtle,original=subtle.digest.bind(subtle);
  let arrived,release;const started=new Promise(resolve=>{arrived=resolve;}),paused=new Promise(resolve=>{release=resolve;});
  const spy=jest.spyOn(subtle,'digest').mockImplementation(async(...args)=>{arrived();await paused;return original(...args);});
  try{
    const pending=api.put(path,currentBody);await started;
    if(change==='ended session')await api.post('/auth/logout');
    else editStore(db=>{
      if(change==='archived client')db.clients.find(c=>c.client_id==='demo_brawndo').status='archived';
      if(change==='read-only role')db.user.role='client_readonly';
      if(change==='revoked membership')db.user.client_ids=[];
      if(change==='reassigned owner')db.framework_assessments.find(a=>a.framework_assessment_id===row.framework_assessment_id).owner_id=null;
    });
    const authorizedState=readStore();
    release();await expect(pending).rejects.toMatchObject({response:{status:change==='ended session'?401:403}});
    const after=readStore();
    expect(after.guided_assessment_pilot).toEqual(before.guided_assessment_pilot);
    expect(after.guided_assessment_history).toEqual(before.guided_assessment_history);
    expect(after.framework_assessments).toEqual(authorizedState.framework_assessments);
    expect(after.clients).toEqual(authorizedState.clients);
    expect(after.user).toEqual(authorizedState.user);
  }finally{release();spy.mockRestore();}
});

test('unavailable native hashing fails explicitly without fabricated lineage or a saved draft',async()=>{
  const crypto=globalThis.crypto;
  try{globalThis.crypto={};await expect(api.put(path,pilotBody)).rejects.toMatchObject({response:{status:503}});}
  finally{globalThis.crypto=crypto;}
  expect((await api.get(path)).data.revision).toBe(0);
});
