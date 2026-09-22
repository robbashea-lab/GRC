import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore} from './store';
const api=axios.create({adapter:previewAdapter});
let p,cid;
beforeEach(async()=>{
  localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');
  cid=readStore().clients[0].client_id;p=(await api.post('/policies',{client_id:cid,title:'Policy'})).data.policy_id;
});
const source=version=>api.post('/policies/'+p+'/approval-subject',{version,external_reference:'https://documents.example.test/policy',external_version:'doc-v'+version});
const submit=async()=>({approval_request_id:(await api.post('/policies/'+p+'/submit-review')).data.approval_request_id});
const approve=async()=>api.post('/policies/'+p+'/approve',await submit());
test('v1 history immutable when title version document owner and actor change; v2 separate',async()=>{
  await expect(submit()).rejects.toBeTruthy();
  await source('1');const v1=(await approve()).data.approval_history.at(-1);
  const changed=(await api.patch('/policies/'+p,{title:'Changed policy',version:'2',summary:'Revised contents'})).data;
  expect(changed.status).toBe('draft');expect(changed.approved_at).toBeNull();
  await expect(submit()).rejects.toBeTruthy();await source('2');
  const v2=(await approve()).data.approval_history.filter(h=>h.action==='approved');
  expect(v2[0]).toEqual(v1);expect(v2.map(h=>h.subject.version)).toEqual(['1','2']);
  const db=readStore();db.user.name='New display name';saveStore(db);
  expect((await api.get('/policies/'+p+'/approval-context')).data.history.filter(h=>h.action==='approved')[0]).toEqual(v1);
  await expect(api.delete('/policies/'+p)).rejects.toBeTruthy();
  await expect(api.post('/bulk',{kind:'policies',ids:[p],action:'delete'})).rejects.toBeTruthy();
});
test('uploaded source snapshot retains checksum through archival; foreign source excluded',async()=>{
  const db=readStore();db.evidence.push({evidence_id:'document',client_id:cid,linked_type:'policy',linked_id:p,version:1,filename:'policy.txt',sha256:'f'.repeat(64)});
  db.evidence.push({evidence_id:'foreign-document',client_id:db.clients[1].client_id,linked_type:'policy',linked_id:p,version:1,filename:'private.txt',sha256:'a'.repeat(64)});saveStore(db);
  await expect(api.post('/policies/'+p+'/approval-subject',{version:'1',evidence_id:'foreign-document'})).rejects.toBeTruthy();
  await api.post('/policies/'+p+'/approval-subject',{version:'1',evidence_id:'document'});
  const old=(await approve()).data.approval_history.at(-1);
  await api.delete('/evidence/document');
  expect((await api.get('/policies/'+p+'/approval-context')).data.history.at(-1)).toEqual(old);
  await expect(api.post('/policies/'+p+'/approval-subject',{version:'2',evidence_id:'document'})).rejects.toBeTruthy();
});
test('rejected basis and legacy withdrawal remain distinct; external recording is not app approval',async()=>{
  await source('1');const round=await submit();
  await api.post('/policies/'+p+'/reject',{...round,comment:'Revise'});
  expect((await api.get('/policies/'+p+'/approval-context')).data.history.at(-1).subject.version).toBe('1');
  const external=(await api.post('/policies/'+p+'/verify',{version:'1',status:'approved',approved_at:'2026-09-01'})).data;
  expect(external.decision_history.at(-1).subject.version).toBe('1');
  expect(external.decision_history.at(-1).provenance).toContain('not an in-app approval');
  const db=readStore(),row=db.policies.find(r=>r.policy_id===p);row.status='in_review';delete row.approval_request_id;delete row.approval_subject;saveStore(db);
  await api.post('/policies/'+p+'/return-draft',{approval_request_id:'legacy'});
  expect((await api.get('/policies/'+p+'/approval-context')).data.status).toBe('draft');
});
