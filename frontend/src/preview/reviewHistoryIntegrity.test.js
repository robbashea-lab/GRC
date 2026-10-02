import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore} from './store';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
const occurrence=(rid,oid)=>readStore().reviews.find(r=>r.review_id===rid).occurrences.find(o=>o.occurrence_id===oid);
// Completed occurrences keep the owner and title recorded at completion, through storage
// compaction and many save/read cycles, after the definition and future occurrences change.
test.each(['demo_brawndo','demo_prestige','demo_dunder'])('%s: completed Review history is not rewritten by later definition changes',async cid=>{
  // Two owners already eligible for this client's Reviews.
  const [a,b]=[...new Set(readStore().reviews.filter(x=>x.client_id===cid&&x.owner_id).map(x=>x.owner_id))];
  expect(b).toBeTruthy();
  const {data:r}=await api.post('/reviews',{client_id:cid,title:'History QA review',review_type:'access',recurrence:'quarterly',due_date:'2026-09-30',owner_id:a});
  const first=r.current_occurrence_id;
  await api.post(`/reviews/${r.review_id}/complete`,{occurrence_id:first,notes:'Completed by A'});
  const recorded=occurrence(r.review_id,first);
  expect(recorded).toMatchObject({owner_id:a,title:'History QA review'});
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
