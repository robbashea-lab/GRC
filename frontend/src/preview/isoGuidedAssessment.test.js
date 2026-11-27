import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,saveStore} from './store';
import {FRAMEWORKS} from '../lib/frameworks';
import {isoGuidedCatalog,isoQuestions,isoGuidedResult} from '../lib/isoGuidedAssessment';
import baseline from '@catalogs/onboardingCatalog.json';
const api=axios.create({adapter:previewAdapter});
let cid;
const state=programs=>({version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,programs.includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}});
const workspace=async id=>(await api.get('/frameworks/iso-27001',{params:{client_id:id||cid}})).data;
const nativePath=row=>'/framework_assessments/'+row.framework_assessment_id;
const source=draft=>Object.fromEntries(['version','revision','generated_at'].map(k=>[k,draft[k]]));
async function configure(programs=['iso-27001']){await api.post('/onboarding/baseline',{client_id:cid,state:state(programs),finalize:true});return workspace();}
function positive(id){
  const answers={};
  for(let pass=0;pass<30;pass++){
    const missing=isoQuestions(id,answers).filter(q=>!(q.id in answers));if(!missing.length)break;
    for(const q of missing)answers[q.id]=q.type==='text'?'':q.type==='context'?'Relevant':q.optional?'No':'Yes';
  }
  return answers;
}
async function complete(row){
  const path=nativePath(row)+'/guided-assessment',draft=(await api.get(path)).data,answers=positive(row.definition_id);
  const result=isoGuidedResult(row.definition_id,answers,draft.version,'Synthetic ISO QA');
  return (await api.put(path,{version:draft.version,answers,summary_review:{version:draft.version,answers},step:0,completed:true,narrative:result.narrative,result,expected_revision:draft.revision,base_assessment_token:draft.current_assessment_token,base_scope_fingerprint:draft.current_scope_fingerprint})).data;
}
async function apply(row,draft){return (await api.patch(nativePath(row),{implementation:draft.narrative,status:draft.result.status,guided_assessment_source:source(draft),expected_last_assessed:row.last_saved||row.last_assessed||null})).data;}
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'Agent 2 isolated ISO fixture'})).data.client_id;});

test('first and repeated unchanged native footer saves preserve guided state and do not materialize empty fields',async()=>{
  const row=(await configure()).assessments.find(a=>a.definition_id==='4.2');
  const saved=await apply(row,await complete(row));
  const footer=Object.fromEntries(['status','implementation','technology','notes','na_rationale','addressable_decision','addressable_rationale'].map(key=>[key,saved[key]??'']));
  Object.assign(footer,{owner_id:saved.owner_id??null,process_owner_id:saved.process_owner_id??null,iso_assessment_checks:saved.iso_assessment_checks??[],expected_last_assessed:saved.last_saved||saved.last_assessed||null});
  const before=readStore();
  for(let attempt=0;attempt<2;attempt++){
    expect((await api.patch(nativePath(saved),footer)).data).toEqual(saved);
    expect(readStore()).toEqual(before);
  }
  const noted=(await api.patch(nativePath(saved),{...footer,notes:'Actual additional note.'})).data;
  for(const key of ['addressable_decision','addressable_rationale','iso_assessment_checks']){
    expect(noted[key]).toEqual(saved[key]);
    expect(Object.hasOwn(noted,key)).toBe(Object.hasOwn(saved,key));
  }
  expect(noted.guided_assessment_source).toEqual(saved.guided_assessment_source);
  const changed=(await api.patch(nativePath(saved),{...footer,notes:noted.notes,implementation:saved.implementation+'\nActual manual change.',expected_last_assessed:noted.last_saved})).data;
  expect(changed.last_saved).not.toBe(noted.last_saved);
  expect(changed.assessment_history).toHaveLength(noted.assessment_history.length+1);
  expect(changed.guided_assessment_source).toBeNull();
  await expect(api.patch(nativePath(saved),footer)).rejects.toMatchObject({response:{status:409}});
});

test('new/add/mixed program defaults and repeated activation retain other programs without reseeding',async()=>{
  const fresh=await configure();expect(fresh.assessments).toHaveLength(123);
  for(const row of fresh.assessments){expect(row.status).toBe('not_assessed');expect(row.implementation).toBe('');expect(row.soa_applicability||'').toBe('');expect((await api.get(nativePath(row)+'/guided-assessment')).data.version).toBe(isoGuidedCatalog.version);}
  const second=(await api.post('/clients',{name:'Agent 2 existing add ISO fixture'})).data.client_id;
  await api.post('/onboarding/baseline',{client_id:second,state:state(['cis-ig1','soc-2']),finalize:true});
  const before=readStore().framework_assessments.filter(a=>a.client_id===second);
  for(let n=0;n<2;n++)await api.patch('/onboarding/programs/iso-27001',{client_id:second,applicability:'applies'});
  expect((await workspace(second)).assessments).toHaveLength(123);
  expect(readStore().framework_assessments.filter(a=>a.client_id===second&&a.framework_key!=='iso-27001')).toEqual(before);
},60000);

const batches=Object.keys(isoGuidedCatalog.definitions).reduce((all,id,index)=>{const batch=Math.floor(index/25);(all[batch]||=[]).push(id);return all;},[]);
test.each(batches.map((ids,index)=>[index+1,ids]))('catalog batch %s: exact native text/status, unrelated fields/history; progress is separate',async(_batch,ids)=>{
  const ws=await configure();
  const selected=ws.assessments.filter(row=>ids.includes(row.definition_id));
  expect(selected.map(row=>row.definition_id).sort()).toEqual([...ids].sort());
  for(let row of selected){
    if(isoGuidedCatalog.definitions[row.definition_id].specification==='annex_control')row=(await api.patch(nativePath(row),{soa_applicability:'included',soa_justification:'Synthetic risk-treatment basis',expected_last_assessed:row.last_saved||row.last_assessed||null})).data;
    const before=JSON.parse(JSON.stringify(row)),draft=await complete(row);
    expect((await api.get(nativePath(row))).data).toEqual(before);
    const text=draft.narrative+'\n\nOperator wording — retain this exact line.\nSecond line.';
    const reviewed=(await api.put(nativePath(row)+'/guided-assessment',{version:draft.version,answers:draft.answers,summary_review:{version:draft.version,answers:draft.answers},step:0,completed:true,narrative:text,result:{...draft.result,narrative:text},expected_revision:draft.revision})).data;
    const saved=await apply(row,reviewed);expect(saved.implementation).toBe(text);expect(saved.status).toBe('addressed');
    for(const key of ['soa_applicability','soa_justification','notes','technology','owner_id','process_owner_id','iso_assessment_checks','related_links'])expect(saved[key]).toEqual(before[key]);
    expect(saved.assessment_history.at(-1).guided_assessment_source.answers).toEqual(draft.answers);
    expect((await api.get(nativePath(row))).data.implementation).toBe(text);
    await expect(apply(row,reviewed)).rejects.toMatchObject({response:{status:409}});
    const nativeBeforeReplay=readStore();
    expect(await apply(saved,reviewed)).toEqual(saved);expect(readStore()).toEqual(nativeBeforeReplay);
  }
  expect(readStore().findings.filter(row=>row.client_id===cid)).toHaveLength(0);
},120000);

test('SoA/Annex are the same current record; separate decisions preserve implementation/history and invalidate stale interview bases',async()=>{
  let row=(await configure()).assessments.find(a=>a.definition_id==='A.5.1'),draft=await complete(row);
  await expect(apply(row,draft)).rejects.toThrow();
  row=(await api.patch(nativePath(row),{soa_applicability:'included',soa_justification:'Documented synthetic risk treatment',expected_last_assessed:row.last_saved||row.last_assessed||null})).data;
  await expect(apply(row,draft)).rejects.toThrow();
  const loaded=(await api.get(nativePath(row)+'/guided-assessment')).data;
  await api.put(nativePath(row)+'/guided-assessment',{version:loaded.version,answers:loaded.answers,narrative:loaded.narrative,step:loaded.step,completed:false,rebase:true,result:null,expected_revision:loaded.revision,base_assessment_token:loaded.current_assessment_token,base_scope_fingerprint:loaded.current_scope_fingerprint});
  draft=await complete(row);row=await apply(row,draft);
  const soa=(await workspace()).assessments.find(a=>a.definition_id==='A.5.1');expect(soa).toEqual(row);
  const nativeEdit=(await api.patch(nativePath(row),{implementation:'Changed in Annex A native editor\nExact text',status:'in_progress',expected_last_assessed:row.last_saved})).data;
  expect((await workspace()).assessments.find(a=>a.definition_id==='A.5.1').implementation).toBe(nativeEdit.implementation);
  const excluded=(await api.patch(nativePath(row),{soa_applicability:'excluded',soa_justification:'Re-evaluated necessity in synthetic scope',expected_last_assessed:nativeEdit.last_saved})).data;
  expect(excluded.implementation).toBe(nativeEdit.implementation);expect(excluded.status).toBe('in_progress');expect(excluded.assessment_history.slice(0,-1)).toEqual(nativeEdit.assessment_history);
  const deactivated=readStore().framework_assessments.filter(a=>a.client_id===cid);
  await api.patch('/onboarding/programs/iso-27001',{client_id:cid,applicability:'does_not_apply'});await expect(api.get(nativePath(row)+'/guided-assessment')).rejects.toMatchObject({response:{status:404}});
  await api.patch('/onboarding/programs/iso-27001',{client_id:cid,applicability:'applies'});expect(readStore().framework_assessments.filter(a=>a.client_id===cid)).toEqual(deactivated);
});

test('read-only/wrong-client denial, forged version/fields and manual wording are preserved in the Demo boundary',async()=>{
  const row=(await configure()).assessments.find(a=>a.definition_id==='4.1'),draft=await complete(row);
  const path=nativePath(row),body={implementation:draft.narrative,status:draft.result.status,guided_assessment_source:source(draft),expected_last_assessed:row.last_saved||row.last_assessed||null};
  for(const extra of [{soa_applicability:'excluded',soa_justification:'Not permitted for clause'},{notes:'Privileged unrelated edit'},{status:'not_applicable'},{implementation:'Unreviewed substitution'}])await expect(api.patch(path,{...body,...extra})).rejects.toThrow();
  await api.patch(path,{implementation:'Manual text not inferred as answers',expected_last_assessed:row.last_saved||row.last_assessed||null});await expect(api.patch(path,{...body,expected_last_assessed:(await api.get(path)).data.last_saved})).rejects.toThrow();
  expect((await api.get(path)).data.implementation).toBe('Manual text not inferred as answers');
  const db=readStore();db.user={...db.user,role:'client_readonly',client_ids:[cid]};saveStore(db);
  expect((await api.get(path+'/guided-assessment')).data.answers).toEqual(draft.answers);
  await expect(api.patch(path,body)).rejects.toMatchObject({response:{status:403}});
  await expect(api.put(path+'/guided-assessment',{version:draft.version,answers:{},step:0,completed:false,expected_revision:draft.revision})).rejects.toMatchObject({response:{status:403}});
  const other=readStore();other.user.client_ids=[];saveStore(other);await expect(api.get(path+'/guided-assessment')).rejects.toMatchObject({response:{status:403}});
});
