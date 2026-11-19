import axios from 'axios';
import {previewAdapter} from './adapter';
import {ids,readStore,saveStore,STORE_KEY} from './store';
import {completionPayload,validateCompletionGuide} from '../lib/r4ReviewCompletion';

const api=axios.create({adapter:previewAdapter});
const cid='synthetic-completion-replay-client';
const performed=[
  {step_id:'risk_rec:record:1',result:'Pass',reason:''},
  {step_id:'risk_rec:record:2',result:'Pass',reason:''},
  {step_id:'risk_rec:record:3',result:'N/A',reason:'SYNTHETIC: no treatment Action is recorded for this fixture.'},
  {step_id:'risk_rec:record:4',result:'N/A',reason:'SYNTHETIC: no acceptance or closure decision is being made.'},
  {step_id:'risk_rec:record:5',result:'Pass',reason:''},
];
let risk,review,body;
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(async()=>{
  localStorage.clear();sessionStorage.clear();
  const db=Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]]));
  db.clients=[{client_id:cid,name:'SYNTHETIC completion replay client',status:'active'},
    {client_id:'foreign-client',name:'SYNTHETIC other client',status:'active'}];
  db.user={user_id:'synthetic-completion-operator',name:'Synthetic operator',email:'operator@example.test',role:'platform_admin',status:'active',workspace_mode:'demo',client_ids:[cid]};
  db.users=[db.user];Object.assign(db,{logs:[],notifications:[],drafts:{},baselines:{}});saveStore(db,{resetFiles:true});
  await api.post('/demo/enter');
  risk=(await api.post('/risks',{client_id:cid,title:'SYNTHETIC retained Risk review',source_type:'manual',category:'operational',
    likelihood_score:2,impact_score:3,review_cadence:'annual',next_review:'2027-11-19'})).data;
  review=(await api.post('/risks/'+risk.risk_id+'/review')).data.review;
  const guide=(await api.get('/reviews/'+review.review_id+'/completion-guide')).data;
  expect(guide.steps.map(step=>step.step_id)).toEqual(performed.map(result=>result.step_id));
  const filled={...guide,results:performed,supporting_reference:'SYNTHETIC completed-result record RISK-REPLAY-001: performed checks; no acceptance or closure.'};
  validateCompletionGuide(filled);body={...completionPayload(filled),risk_assessment:{},risk_outcome:'Reviewed — No Change',completion_notes:'SYNTHETIC explicitly performed cycle'};
});
const complete=()=>api.post('/reviews/'+review.review_id+'/complete',body);

test('exact accepted full completion replays its retained occurrence without any saved bytes, notifications, audit or schedule changes',async()=>{
  const originalBody=JSON.stringify(body),first=(await complete()).data;
  expect(first.occurrence.occurrence_id).toBe(body.occurrence_id);
  expect(first.occurrence.checklist_results.map(({step_id,result,reason})=>({step_id,result,reason}))).toEqual(performed);
  expect(first.review.current_occurrence_id).not.toBe(body.occurrence_id);
  expect(first.review.updated_at).not.toBe(body.expected_updated_at);
  const before=sessionStorage.getItem(STORE_KEY),saved=readStore();
  const replay=(await complete()).data;
  expect(replay.occurrence).toEqual(first.occurrence);expect(replay.review).toEqual(first.review);
  expect(JSON.stringify(body)).toBe(originalBody);expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(readStore().reviews).toEqual(saved.reviews);expect(readStore().risks).toEqual(saved.risks);
  expect(readStore().logs).toEqual(saved.logs);expect(readStore().notifications).toEqual(saved.notifications);
  expect((await api.get('/reviews/'+review.review_id+'/history')).data).toEqual([first.occurrence]);
  expect((await api.get('/risks/'+risk.risk_id)).data.next_review.slice(0,10)).toBe('2028-11-19');
});

test('an unapplied current completion with an external stale version still fails409 without a checkpoint, history, or business write',async()=>{
  await api.patch('/reviews/'+review.review_id,{notes:'SYNTHETIC concurrent editor',expected_occurrence_id:body.occurrence_id,expected_updated_at:body.expected_updated_at});
  const before=sessionStorage.getItem(STORE_KEY);
  await expect(complete()).rejects.toMatchObject({response:{status:409}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect((await api.get('/reviews/'+review.review_id+'/history')).data).toEqual([]);
  expect((await api.get('/reviews/'+review.review_id)).data.current_occurrence_id).toBe(body.occurrence_id);
});

test.each(['revoked','foreign','read-only','disabled','invited'])('current %s permission refuses even an accepted full-body replay before any side effect',async mode=>{
  await complete();const db=readStore();
  db.user={...db.user,role:mode==='read-only'?'client_readonly':'platform_admin',all_clients:false,
    status:['disabled','invited'].includes(mode)?mode:'active',
    client_ids:mode==='revoked'?[]:mode==='foreign'?['foreign-client']:[cid]};saveStore(db);
  const before=sessionStorage.getItem(STORE_KEY);
  await expect(complete()).rejects.toMatchObject({response:{status:403}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('the generic revision guard for other actions still refuses stale Start without changing saved data',async()=>{
  const before=sessionStorage.getItem(STORE_KEY);
  await expect(api.post('/reviews/'+review.review_id+'/start',{occurrence_id:body.occurrence_id,expected_updated_at:'stale-unapplied-start'}))
    .rejects.toThrow('Record changed since it was opened; reload before saving');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
