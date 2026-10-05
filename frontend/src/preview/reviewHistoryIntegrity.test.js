import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore} from './store';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
const occurrence=(rid,oid)=>readStore().reviews.find(r=>r.review_id===rid).occurrences.find(o=>o.occurrence_id===oid);
test('Calendar date saves replay once, retain the cycle and preserve moved completion history',async()=>{
  const {data:r}=await api.post('/reviews',{client_id:'demo_prestige',title:'Calendar synthetic review',review_type:'access',recurrence:'monthly',due_date:'2026-01-31'});
  const path='/reviews/'+r.review_id,body={due_date:'2026-03-05',calendar_move:true,expected_updated_at:r.updated_at,expected_occurrence_id:r.current_occurrence_id},config={headers:{'Idempotency-Key':'calendar-original-cycle'}};
  const {data:moved}=await api.patch(path,body,config);
  expect(moved.next_review_date.slice(0,10)).toBe('2026-02-28');
  expect((await api.patch(path,body,config)).data).toEqual(moved);
  await expect(api.patch(path,{...body,due_date:'2026-03-06'})).rejects.toThrow('Record changed');
  const {data:done}=await api.post(path+'/complete',{occurrence_id:r.current_occurrence_id});
  expect(done.occurrence).toMatchObject({due_date:'2026-03-05',recurrence_due_date:'2026-01-31'});
  expect(done.review.due_date.slice(0,10)).toBe('2026-02-28');
  expect(done.review.next_review_date.slice(0,10)).toBe('2026-03-31');
  expect(done.review.recurrence_due_date).toBeNull();
});
// Completed occurrences keep the owner and title recorded at completion, through storage
// compaction and many save/read cycles, after the definition and future occurrences change.
test.each(['demo_brawndo','demo_prestige','demo_dunder'])('%s: completed Review history is not rewritten by later definition changes',async cid=>{
  // Two owners already eligible for this client's Reviews.
  const [a,b]=[...new Set(readStore().reviews.filter(x=>x.client_id===cid&&x.owner_id).map(x=>x.owner_id))];
  expect(b).toBeTruthy();
  const {data:r}=await api.post('/reviews',{client_id:cid,title:'History QA review',review_type:'access',recurrence:'quarterly',due_date:'2026-09-30',owner_id:a});
  const first=r.current_occurrence_id;
  await api.post(`/reviews/${r.review_id}/complete`,{occurrence_id:first,completion_notes:'Completed by A'});
  const recorded=occurrence(r.review_id,first);
  expect(recorded).toMatchObject({owner_id:a,title:'History QA review',notes:'Completed by A'});
  // Change the recurring definition (owner and title), then touch the store repeatedly.
  const edit=async body=>{const cur=readStore().reviews.find(x=>x.review_id===r.review_id);await api.patch('/reviews/'+r.review_id,{...body,expected_updated_at:cur.updated_at,expected_occurrence_id:cur.current_occurrence_id});};
  await edit({owner_id:b,title:'History QA review (renamed)'});
  for(let i=0;i<3;i++)await edit({scope:'Pass '+i});
  const after=occurrence(r.review_id,first);
  expect(after).toMatchObject({owner_id:a,title:'History QA review',completed_at:recorded.completed_at});
  expect(after).toEqual(recorded);
  // The definition and its current occurrence carry the new values; the cadence anchor is unchanged.
  const review=readStore().reviews.find(x=>x.review_id===r.review_id);
  expect(review).toMatchObject({owner_id:b,title:'History QA review (renamed)',due_date:'2026-12-31T00:00:00.000Z'});
  // Quarterly from Sep 30 stays month-end (Dec 31): editing the definition does not shift the cadence.
});
