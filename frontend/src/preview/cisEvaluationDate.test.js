import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,saveStore} from './store';
import {visibleQuestions} from '../lib/guidedAssessment';
import {omniCisSummary} from '../lib/omniCisSummary';

const api=axios.create({adapter:previewAdapter});
let row,path,RealDate,clock;
beforeEach(async()=>{
  RealDate=Date;clock=new RealDate(2026,9,12,23,59).getTime();
  global.Date=class extends RealDate{
    constructor(...args){super(...(args.length?args:[clock]));}
    static now(){return clock;}
  };
  expect(new Date().getTime()).toBe(clock);
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;
  row=workspace.assessments.find(item=>item.definition_id==='1.1');path='/framework_assessments/'+row.framework_assessment_id;
});
afterEach(()=>{global.Date=RealDate;});
const setClock=(...parts)=>{clock=new RealDate(...parts).getTime();};
const get=async()=>(await api.get(path+'/guided-assessment')).data;
const body=(draft,answers,result)=>({version:draft.version,answers,narrative:result.narrative,result,step:0,completed:true,expected_revision:draft.revision,
  base_assessment_token:draft.base_assessment_token,base_scope_fingerprint:draft.base_scope_fingerprint});
async function complete(){
  const draft=await get(),answers={inventory:'Yes'};
  for(const q of visibleQuestions('1.1',answers,draft.version))answers[q.id]=q.type==='matrix'?Object.fromEntries(q.rows.map(name=>[name,'Yes'])):q.type==='text'?'':q.type==='date'?'2026-04-12':q.id==='frequency'?'Every six months':q.id==='sources'?'One source':q.choices.includes('Yes')?'Yes':q.choices[0];
  const result=omniCisSummary('1.1',answers,draft.version,'Synthetic client',new Date()).result;
  return (await api.put(path+'/guided-assessment',body(draft,answers,result))).data;
}

test('review clock metadata persists on unchanged or wording-only saves and bounds new dates',async()=>{
  const original=await complete();expect(original.result.evaluation_date).toBe('2026-10-12');
  setClock(2026,9,15,0,1);
  const omitted={...original.result};delete omitted.evaluation_date;
  const retained=(await api.put(path+'/guided-assessment',body(original,original.answers,omitted))).data;
  expect(retained.result.evaluation_date).toBe(original.result.evaluation_date);expect(retained.generated_at).toBe(original.generated_at);
  expect(retained.updated_at).not.toBe(original.updated_at);expect(retained.revision).toBe(original.revision+1);
  const manual={...retained.result,narrative:'Manually reviewed wording without changing any answers.'};
  const edited=(await api.put(path+'/guided-assessment',body(retained,retained.answers,manual))).data;
  expect(edited.generated_at).toBe(original.generated_at);expect((await get()).result).toEqual(manual);
  for(const evaluation_date of ['2026-02-30','2026-10-12T12:00:00Z','2026-10-01'])await expect(api.put(path+'/guided-assessment',body(edited,edited.answers,{...edited.result,evaluation_date}))).rejects.toMatchObject({response:{status:422}});
  const answers={...edited.answers,last_review:'2026-10-15'};
  await expect(api.put(path+'/guided-assessment',body(edited,answers,edited.result))).rejects.toMatchObject({response:{status:422}});
  const freshResult=omniCisSummary('1.1',answers,edited.version,'Synthetic client',new Date()).result;
  const fresh=(await api.put(path+'/guided-assessment',body(edited,answers,freshResult))).data;
  expect(fresh.result.evaluation_date).toBe('2026-10-15');expect(fresh.generated_at).not.toBe(original.generated_at);
  const db=readStore(),key=Object.keys(db.guided_assessment_pilot).find(key=>db.guided_assessment_pilot[key].assessment_id===row.framework_assessment_id);
  delete db.guided_assessment_pilot[key].result.evaluation_date;saveStore(db);
  const legacy=await get();setClock(2026,9,18,0,1);
  const legacyManual={...legacy.result,narrative:'Wording-only edit to an unchanged legacy snapshot.'};
  const legacyEdited=(await api.put(path+'/guided-assessment',body(legacy,legacy.answers,legacyManual))).data;
  expect(legacyEdited.generated_at).toBe(legacy.generated_at);expect(legacyEdited.result).not.toHaveProperty('evaluation_date');
});

test('review clock old-date replay after rebase requires the immediately archived native source',async()=>{
  const original=await complete();
  row=(await api.patch(path,{implementation:original.narrative,status:original.result.status,
    guided_assessment_source:Object.fromEntries(['version','revision','generated_at'].map(key=>[key,original[key]])),expected_last_assessed:row.last_saved??row.last_assessed??null})).data;
  setClock(2026,9,15,0,1);
  const current=await get();
  const rebased=(await api.put(path+'/guided-assessment',{version:current.version,answers:current.answers,narrative:current.narrative,step:current.step,completed:false,rebase:true,
    expected_revision:current.revision,base_assessment_token:current.current_assessment_token,base_scope_fingerprint:current.current_scope_fingerprint})).data;
  const before=readStore();
  const replayed=(await api.put(path+'/guided-assessment',body(rebased,original.answers,original.result))).data;
  expect(replayed.result.evaluation_date).toBe(original.result.evaluation_date);expect(replayed.generated_at).toBe(original.generated_at);
  expect(replayed.result.status).toBe(original.result.status);
  before.framework_assessments.find(item=>item.framework_assessment_id===row.framework_assessment_id).guided_assessment_source.by='another-reviewer';saveStore(before);
  await expect(api.put(path+'/guided-assessment',body(rebased,original.answers,original.result))).rejects.toMatchObject({response:{status:422}});
});

test('review clock metadata and timestamp replay stay limited to active CIS date questions',async()=>{
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;
  row=workspace.assessments.find(item=>item.definition_id==='2.1');path='/framework_assessments/'+row.framework_assessment_id;
  const draft=await get(),answers={practice:'No'},result=omniCisSummary('2.1',answers,draft.version,'Synthetic client',new Date()).result;
  expect(result).not.toHaveProperty('evaluation_date');
  const original=(await api.put(path+'/guided-assessment',body(draft,answers,result))).data;
  setClock(2026,9,15,0,1);
  const repeated=(await api.put(path+'/guided-assessment',body(original,answers,result))).data;
  expect(repeated.generated_at).not.toBe(original.generated_at);
  await expect(api.put(path+'/guided-assessment',body(repeated,answers,{...result,evaluation_date:'2026-10-15'}))).rejects.toMatchObject({response:{status:422}});
});
