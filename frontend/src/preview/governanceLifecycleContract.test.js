import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,STORE_KEY} from './store';
import {reviewSchedule} from '../lib/reviewOccurrences';
import contract from '@contracts/governance-lifecycle.json';

const api=axios.create({adapter:previewAdapter});
let clientId;
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  clientId=(await api.post('/clients',{name:'Lifecycle contract client'})).data.client_id;
});
afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});

test('shared recurrence boundaries retain their original anchors',()=>{
  for(const scenario of contract.recurrence_cases){
    let review={...scenario.review};
    for(const expected of scenario.next_dates){
      const result=reviewSchedule(review);
      expect({scenario:scenario.name,date:result.next_review_date?.slice(0,10)||null}).toEqual({scenario:scenario.name,date:expected});
      review={...review,...result,due_date:result.next_review_date};
    }
  }
});

test('late completion and definition edits preserve the original history',async()=>{
  const scenario=contract.review_history,owner=readStore().user.user_id;
  const review=(await api.post('/reviews',{client_id:clientId,owner_id:owner,...scenario.initial})).data;
  const path='/reviews/'+review.review_id,selected={occurrence_id:review.current_occurrence_id};
  jest.useFakeTimers('modern');jest.setSystemTime(new Date(scenario.completed_at));
  const done=(await api.post(path+'/complete',selected)).data;
  expect(done.review.due_date.slice(0,10)).toBe(scenario.next_due);
  const history=done.occurrence;
  expect(history).toMatchObject({owner_id:owner,title:scenario.initial.title,completed_at:scenario.completed_at});
  const updated=(await api.patch(path,{...scenario.edited,owner_id:null,expected_updated_at:done.review.updated_at,expected_occurrence_id:done.review.current_occurrence_id})).data;
  expect(updated.next_review_date.slice(0,10)).toBe(scenario.next_after_edit);
  const retry=(await api.post(path+'/complete',selected)).data;
  expect(retry.occurrence).toEqual(history);
  expect((await api.get(path)).data.occurrences).toEqual([history]);
});

test('shared Policy Risk and Vendor schedule projections follow completed Reviews',async()=>{
  for(const scenario of contract.schedule_projections){
    const row=(await api.post('/'+scenario.kind,{client_id:clientId,...scenario.create})).data;
    const review=scenario.kind==='policies'?
      (await api.post('/reviews',{client_id:clientId,title:'Projection review',review_type:'policy',policy_id:row.policy_id,due_date:scenario.due_date,recurrence:scenario.recurrence})).data:
      (await api.get('/reviews',{params:{client_id:clientId}})).data.find(r=>r[scenario.key]===row[scenario.key]&&(r.vendor_purpose||'vendor')==='vendor');
    jest.useFakeTimers('modern');jest.setSystemTime(new Date(contract.projection_completed_at));
    const done=(await api.post('/reviews/'+review.review_id+'/complete',{occurrence_id:review.current_occurrence_id})).data;
    const saved=(await api.get('/'+scenario.kind+'/'+row[scenario.key])).data;
    expect({kind:scenario.kind,next:saved[scenario.next_field].slice(0,10)}).toEqual({kind:scenario.kind,next:scenario.next_due});
    expect(saved[scenario.last_field]).toBe(done.occurrence.completed_at);
    expect(done.occurrence.due_date.slice(0,10)).toBe(scenario.due_date);
    expect(done.review.due_date.slice(0,10)).toBe(scenario.next_due);
    for(const field of ['status','risk_score'])if(field in scenario)expect(saved[field]).toBe(scenario[field]);
  }
});

test('failed persistence reports failure and the original intent recovers once',async()=>{
  const scenario=contract.persistence_failure,body={client_id:clientId,title:scenario.title};
  const config={headers:{'Idempotency-Key':scenario.request_id}},before=sessionStorage.getItem(STORE_KEY);
  const failure=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('injected unavailable storage');});
  try {
    await expect(api.post('/findings',body,config)).rejects.toThrow('Changes were not saved');
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  } finally {failure.mockRestore();}
  const rows=()=>readStore().findings.filter(row=>row.client_id===clientId);
  expect(rows()).toHaveLength(scenario.after_failure_count);
  const first=(await api.post('/findings',body,config)).data,retry=(await api.post('/findings',body,config)).data;
  expect(retry.finding_id).toBe(first.finding_id);expect(rows()).toHaveLength(scenario.after_retry_count);
});

test('stale writes and foreign-tenant reads reject without replacing saved state',async()=>{
  const scenario=contract.stale_write;
  const row=(await api.post('/findings',{client_id:clientId,title:scenario.initial_title})).data;
  const path='/findings/'+row.finding_id;
  await api.patch(path,{title:scenario.new_title,expected_updated_at:row.updated_at});
  await expect(api.patch(path,{title:scenario.stale_title,expected_updated_at:row.updated_at})).rejects.toMatchObject({response:{status:scenario.status}});
  expect((await api.get(path)).data.title).toBe(scenario.new_title);
  const db=readStore();db.user.role='client_contributor';db.user.client_ids=['another-client'];sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  await expect(api.get(path)).rejects.toMatchObject({response:{status:contract.tenant_denied_status}});
});
