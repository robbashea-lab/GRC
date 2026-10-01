import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore} from './store';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const post=(path,body,key)=>api.post(path,body,{headers:{'Idempotency-Key':key}});
test.each([
  ['/tasks',{client_id:cid,title:'Synthetic retry action'},'task_id','tasks'],
  ['/findings',{client_id:cid,title:'Synthetic retry finding',severity:'low'},'finding_id','findings'],
  ['/tasks',{client_id:cid,title:'Synthetic vendor action',vendor_id:null},'task_id','tasks'],
])('a retried create with the same key replays %s instead of duplicating',async(path,body,idField,kind)=>{
  if(body.vendor_id===null){body={...body,vendor_id:readStore().vendors.find(v=>v.client_id===cid).vendor_id};}
  const before=readStore()[kind].length;
  const first=(await post(path,body,'retry-1')).data,again=(await post(path,body,'retry-1')).data;
  expect(again[idField]).toBe(first[idField]);expect(readStore()[kind].length).toBe(before+1);
  await expect(post(path,{...body,title:'Changed'},'retry-1')).rejects.toBeTruthy();
  const other=(await post(path,body,'retry-2')).data;expect(other[idField]).not.toBe(first[idField]);
});
test('creates without a key keep their existing behaviour',async()=>{
  const a=(await api.post('/tasks',{client_id:cid,title:'No key'})).data,b=(await api.post('/tasks',{client_id:cid,title:'No key'})).data;
  expect(a.task_id).not.toBe(b.task_id);
});
