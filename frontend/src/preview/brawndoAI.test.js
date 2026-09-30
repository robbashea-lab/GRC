import axios from 'axios';
import {previewAdapter} from './adapter';
import {aiRequest} from './aiGovernance';
import {aiMatches,aiApproval,aiUseLabel,aiThirdParty} from '../lib/brawndoAI';
const api=axios.create({adapter:previewAdapter});
const cid='demo_brawndo';
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
const create=async(extra={})=>(await api.post('/ai_systems',{client_id:cid,name:'Synthetic AI',description:'Draft public material',environment:'Managed QA workspace',permitted_data_types:['Public'],...extra})).data;
const decide=async(row,status='approved')=>(await api.post(`/ai_systems/${row.ai_system_id}/approval`,{status,note:'Synthetic decision for QA only',expected_updated_at:row.updated_at})).data;

test('scoped approval snapshots survive reassessment and reload; no blanket permissions',async()=>{
  let row=await create();expect(row.approval_status).toBe('pending_assessment');expect(row.risk_tier).toBeNull();
  row=await decide(row);expect(row.approval_status).toBe('approved');expect(row.approval_history[0].scope.environment).toBe('Managed QA workspace');
  expect(row.last_review).toBeNull();expect(row.status).toBe('draft');
  await expect(api.patch(`/ai_systems/${row.ai_system_id}`,{approval_status:'approved'})).rejects.toThrow(/read-only/);
  row=(await api.patch(`/ai_systems/${row.ai_system_id}`,{description:'Different use',expected_updated_at:row.updated_at})).data;
  expect(row.approval_status).toBe('pending_assessment');expect(row.approval_history).toHaveLength(1);expect(row.approval_history[0].scope.description).toBe('Draft public material');
  const loaded=(await api.get('/ai_systems',{params:{client_id:cid}})).data.find(r=>r.ai_system_id===row.ai_system_id);
  expect(loaded.approval_history).toEqual(row.approval_history);expect(loaded.material_change_note).toContain('reassessment');
});
test('decision validation, stale writes, explicit conditions and client isolation',async()=>{
  const missing=await create({environment:''});await expect(decide(missing)).rejects.toThrow(/environment/);
  let row=await create();await expect(decide(row,'approved_with_conditions')).rejects.toThrow(/conditions/);
  await expect(decide(row,'constructor')).rejects.toThrow(/decision/);
  row=(await api.patch(`/ai_systems/${row.ai_system_id}`,{restrictions:'Human review before publication',expected_updated_at:row.updated_at})).data;
  const approved=await decide(row,'approved_with_conditions');await expect(decide(row)).rejects.toThrow(/changed/);
  expect(approved.approval_history).toHaveLength(1);
  const other=(await api.post('/clients',{name:'Other AI client'})).data.client_id;
  await expect(create({client_id:other})).rejects.toThrow(/read-only/);
  const foreign=(await api.post('/ai_systems',{client_id:other,name:'Other'})).data;
  expect(foreign.approval_status).toBeUndefined();await expect(decide(foreign)).rejects.toThrow(/Brawndo/);
});
test('non-administrator cannot decide; legacy lifecycle is never interpreted as approval',()=>{
  const row={ai_system_id:'a',client_id:cid,status:'active',updated_at:'2026-01-01'};
  const db={user:{role:'client_contributor',client_ids:[cid]},clients:[{client_id:cid}],ai_systems:[row]};
  expect(()=>aiRequest(db,'/ai_systems/a/approval','post',{},{})).toThrow(/administrators/);
  expect(aiApproval(row)).toBe('Approval not recorded');expect(aiUseLabel(row)).toBe('Intended Use');
  expect(aiThirdParty({provider:'Internal lab',screening:{third_party:false}})).toBe(false);
});
test('filters distinguish due today, unscheduled, archived, critical and pending',()=>{
  const today=Date.UTC(2026,8,30)/86400000;
  expect(aiMatches({next_review:'2026-09-30'},'due',false,today)).toBe(true);
  expect(aiMatches({},'due',false,today)).toBe(false);
  expect(aiMatches({next_review:'2026-10-01'},'due',false,today)).toBe(false);
  expect(aiMatches({status:'retired'},'active')).toBe(false);
  expect(aiMatches({status:'retired'},'active',true)).toBe(true);
  expect(aiMatches({risk_tier:'critical'},'high')).toBe(true);
  expect(aiMatches({approval_status:'pending_assessment'},'pending')).toBe(true);
  expect(aiMatches({status:'active'},'pending')).toBe(false);
});
test('legacy missing version requires an explicit snapshot and produces a valid decision timestamp',()=>{
  const row={ai_system_id:'legacy',client_id:cid,status:'draft',environment:'QA',description:'Synthetic use',permitted_data_types:['Public']};
  const db={user:{role:'super_admin',user_id:'admin'},clients:[{client_id:cid}],ai_systems:[row],logs:[],reviews:[],risks:[]};
  expect(()=>aiRequest(db,'/ai_systems/legacy/approval','post',{}, {status:'approved',note:'Synthetic QA'})).toThrow(/changed/);
  const saved=aiRequest(db,'/ai_systems/legacy/approval','post',{}, {status:'approved',note:'Synthetic QA',expected_updated_at:null});
  expect(Number.isFinite(Date.parse(saved.updated_at))).toBe(true);expect(saved.approval_history).toHaveLength(1);
});
test('review and evidence operations do not approve; owner-neutral edits preserve decision, material change retires its scope',async()=>{
  let row=await create();const path=`/ai_systems/${row.ai_system_id}`;
  await api.post(path+'/reviews',{due_date:'2026-09-30',recurrence:'annual'});
  await api.post('/evidence',{client_id:cid,linked_type:'ai_system',linked_id:row.ai_system_id,filename:'DEMO-SYNTHETIC.txt',content_base64:'REVNTw=='});
  let loaded=(await api.get('/ai_systems',{params:{client_id:cid}})).data.find(r=>r.ai_system_id===row.ai_system_id);
  expect(loaded.approval_status).toBe('pending_assessment');expect(loaded.last_review).toBeNull();
  row=await decide(loaded);
  row=(await api.patch(path,{governance_notes:'Administrative follow-up',expected_updated_at:row.updated_at})).data;
  expect(row.approval_status).toBe('approved');
  await api.post(path+'/material-change',{note:'New account boundary needs reassessment'});
  loaded=(await api.get('/ai_systems',{params:{client_id:cid}})).data.find(r=>r.ai_system_id===row.ai_system_id);
  expect(loaded.approval_status).toBe('pending_assessment');expect(loaded.approval_history).toHaveLength(1);
  const related=(await api.get('/related',{params:{entity_type:'ai_systems',entity_id:row.ai_system_id}})).data;
  expect(related.reviews).toHaveLength(1);expect(related.evidence).toHaveLength(1);
});
