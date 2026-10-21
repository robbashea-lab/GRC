import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,saveStore} from './store';
import {generateResult,visibleQuestions,versionForSafeguard} from '../lib/guidedAssessment';
import {generatedItems,reconcileItems} from './assessmentItems';

const api=axios.create({adapter:previewAdapter});
const source=draft=>Object.fromEntries(['version','revision','generated_at'].map(key=>[key,draft[key]]));
let row,path;
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;
  row=workspace.assessments.find(row=>row.definition_id==='2.1');path='/framework_assessments/'+row.framework_assessment_id;
});
async function complete(answers={practice:'No',additional_gap:'Yes',gaps:'Reported follow-up',additional_confirmation:'No'}){
  const draft=(await api.get(path+'/guided-assessment')).data;
  const result=generateResult(row.definition_id,answers,new Date(),draft.version);
  return (await api.put(path+'/guided-assessment',{version:draft.version,answers,step:0,completed:true,narrative:result.narrative,result,
    expected_revision:draft.revision,base_assessment_token:draft.base_assessment_token,base_scope_fingerprint:draft.base_scope_fingerprint})).data;
}
async function apply(draft){return (await api.patch(path,{implementation:draft.narrative,status:draft.result.status,guided_assessment_source:source(draft),expected_last_assessed:row.last_saved??row.last_assessed??null})).data;}

test('final apply persists assessment-local items; completion notes leave native judgment and history unchanged',async()=>{
  const draft=await complete();expect((await api.get(path)).data.items_to_address).toBeUndefined();
  const saved=await apply(draft),item=saved.items_to_address.find(item=>item.question_id==='gaps');
  expect(item).toMatchObject({state:'open',resolution:'',finding_id:null,text:'Reported follow-up'});
  const protectedFields=['implementation','status','verification','last_assessed','last_saved','assessment_history'];
  const protectedState=Object.fromEntries(protectedFields.map(key=>[key,saved[key]]));
  const updated=(await api.patch(path+'/items/'+encodeURIComponent(item.item_id),{expected_revision:saved.items_revision,state:'resolved',resolution:'Completed; assessment review is separate.'})).data;
  expect(Object.fromEntries(protectedFields.map(key=>[key,updated[key]]))).toEqual(protectedState);
  expect((await api.get(path)).data.items_to_address.find(current=>current.item_id===item.item_id)).toMatchObject({state:'resolved',resolution:'Completed; assessment review is separate.'});
  await expect(api.patch(path+'/items/'+encodeURIComponent(item.item_id),{expected_revision:saved.items_revision,state:'open',resolution:''})).rejects.toMatchObject({response:{status:409}});
  await expect(api.patch(path,{items_to_address:[],expected_last_assessed:updated.last_saved})).rejects.toThrow();
});

test('explicit native finding is linked without resolving the originating item; retries and new intents share one finding/action',async()=>{
  const saved=await apply(await complete()),item=saved.items_to_address.find(item=>item.question_id==='gaps');
  const payload={item_id:item.item_id,title:'Explicit formal gap',description:item.text,remediation_title:'Close the gap',request_id:'item-finding'};
  const first=(await api.post(path+'/findings',payload)).data;
  const second=(await api.post(path+'/findings',{...payload,request_id:'new-intent-same-origin'})).data;
  expect(second.finding_id).toBe(first.finding_id);
  const stored=(await api.get(path)).data;
  expect(stored.items_to_address.find(current=>current.item_id===item.item_id)).toMatchObject({state:'open',finding_id:first.finding_id});
  expect(readStore().tasks.filter(task=>task.finding_id===first.finding_id)).toHaveLength(1);
  const db=readStore();db.user.role='client_readonly';saveStore(db);
  await expect(api.patch(path+'/items/'+encodeURIComponent(item.item_id),{expected_revision:stored.items_revision,state:'resolved',resolution:''})).rejects.toMatchObject({response:{status:403}});
});

test('matrix origins aggregate every affected row, retain notes/links, and reopen only after changed originating answers',()=>{
  const version=versionForSafeguard('2.1'),matrix=visibleQuestions('2.1',{practice:'Yes'},version).find(question=>question.type==='matrix');
  const answers={practice:'Yes',[matrix.id]:Object.fromEntries(matrix.rows.map((name,index)=>[name,index<2?'No':'Yes']))};
  const draft={version,answers,result:generateResult('2.1',answers,new Date(),version)};
  const generated=generatedItems(row,draft),item=generated.find(item=>item.question_id===matrix.id&&item.kind==='gap');
  expect(item.text).toContain(matrix.rows[0]);expect(item.text).toContain(matrix.rows[1]);
  const items=reconcileItems(row,draft,'reviewer','now');
  const selected=items.find(current=>current.item_id===item.item_id);Object.assign(selected,{state:'resolved',resolution:'Retained notes',finding_id:'fnd-native'});
  const unchanged=reconcileItems({...row,items_to_address:items},draft,'reviewer','later');expect(unchanged).toEqual(items);
  const changedAnswers={...answers,[matrix.id]:{...answers[matrix.id],[matrix.rows[0]]:'Partially'}};
  const changed=reconcileItems({...row,items_to_address:items},{version,answers:changedAnswers,result:generateResult('2.1',changedAnswers,new Date(),version)},'reviewer','later');
  expect(changed.find(current=>current.item_id===item.item_id)).toMatchObject({state:'open',resolution:'Retained notes',finding_id:'fnd-native'});
  const completeAnswers={practice:'Yes',...Object.fromEntries(visibleQuestions('2.1',{practice:'Yes'},version).filter(question=>question.type==='matrix').map(question=>[question.id,Object.fromEntries(question.rows.map(name=>[name,'Yes']))]))};
  const removed=reconcileItems({...row,items_to_address:items},{version,answers:completeAnswers,result:{signals:[],unknowns:[]}},'reviewer','later');
  expect(removed.find(current=>current.item_id===item.item_id)).toMatchObject({state:'superseded',previous_state:'resolved',resolution:'Retained notes',finding_id:'fnd-native'});
  const reintroduced=reconcileItems({...row,items_to_address:removed},draft,'reviewer','even later');
  expect(reintroduced.find(current=>current.item_id===item.item_id)).toMatchObject({state:'open',resolution:'Retained notes',finding_id:'fnd-native'});
  const forged=generatedItems(row,{...draft,result:{signals:[],gaps:[],unknowns:[]}});
  expect(forged).toEqual(generated);
});

test('date origins use the recorded evaluator day and confirm only ambiguous legacy dates',()=>{
  const record={framework_assessment_id:'dated-record',framework_key:'cis-ig1',definition_id:'1.1'},version=versionForSafeguard('1.1');
  const question=visibleQuestions('1.1',{inventory:'Yes'},version).find(question=>question.id==='last_review');
  const dateItems=draft=>generatedItems(record,draft).filter(item=>item.question_id==='last_review');
  for(const [answer,day,expected] of [['2026-04-12','2026-10-12',null],['2026-04-12','2026-10-13','gap'],
    ['2026-10-13','2026-10-12','gap'],['2026-10-13','2026-10-13',null]]){
    const draft={version,answers:{inventory:'Yes',last_review:answer},generated_at:'2026-10-13T00:30:00+00:00',result:{evaluation_date:day}};
    expect(dateItems(draft).map(item=>item.kind)).toEqual(expected?[expected]:[]);
    expect(dateItems({...draft,result:{signals:[{questionId:'last_review',kind:'gap',text:'Forged'}]}})).toMatchObject([{kind:'verification',text:question.unknown_template}]);
  }
  for(const [answer,expected] of [['2026-04-10','gap'],['2026-04-15',null],['invalid','gap']]){
    expect(dateItems({version,answers:{inventory:'Yes',last_review:answer},generated_at:'2026-10-13T00:30:00+00:00'}).map(item=>item.kind)).toEqual(expected?[expected]:[]);
  }
  for(const generated_at of ['invalid','2026-02-30T00:30:00Z','2026-10-13T24:00:00Z','2026-10-13T00:30:00']){
    const draft={version,answers:{inventory:'Yes',last_review:'2026-04-10'},generated_at};
    expect(dateItems(draft)).toMatchObject([{kind:'verification',text:question.unknown_template}]);
    expect(generatedItems(record,draft).some(item=>item.question_id==='attributes'&&item.kind==='verification')).toBe(true);
  }
  const draft={version,answers:{inventory:'Yes',last_review:'2026-04-10'},generated_at:'2026-10-13T00:30:00+00:00',result:{evaluation_date:'2026-10-12'}};
  const items=reconcileItems(record,draft,'reviewer','initial');items.forEach(item=>Object.assign(item,{state:'resolved',resolution:'Keep original note'}));
  expect(reconcileItems({...record,items_to_address:items},{...draft,result:{evaluation_date:'2026-10-13'}},'reviewer','later')).toEqual(items);
});
