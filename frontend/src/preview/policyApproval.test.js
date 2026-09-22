import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore} from './store';
const api=axios.create({adapter:previewAdapter});
let cid,admin;
function actor(id){const db=readStore();db.user=db.users.find(u=>u.user_id===id);saveStore(db);}
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  const db=readStore();cid=db.clients[0].client_id;admin=db.user.user_id;
  db.users.push(...['executive','foreign','disabled'].map(id=>({user_id:id,name:id,email:id+'@example.test',status:id==='disabled'?'disabled':'active',role:'client_readonly',client_ids:[id==='foreign'?db.clients[1].client_id:cid]})));
  db.contacts.push({contact_id:'business',client_id:cid,name:'Business Contact',linked_user_id:'executive'});
  db.policies.push({policy_id:'p',client_id:cid,title:'Policy',status:'draft',approver_id:'historical'});
  saveStore(db);
});
const authority=account=>api.post('/policies/p/approval-authority',{approver_contact_id:'business',approval_account_id:account});
const submit=async()=>({approval_request_id:(await api.post('/policies/p/submit-review')).data.approval_request_id});
test('linked business identity is distinct from narrow explicit authority',async()=>{
  await authority(null);actor('executive');
  expect((await api.get('/policies/p/approval-context')).data).toMatchObject({can_decide:false,linked_account:{eligible:true}});
  await expect(authority('executive')).rejects.toBeTruthy();
  actor(admin);await authority('executive');const decision=await submit();actor('executive');
  expect((await api.get('/policies/pending-decisions',{params:{client_id:cid}})).data).toHaveLength(1);
  await expect(api.patch('/policies/p',{title:'Unauthorized edit'})).rejects.toBeTruthy();
  const approved=(await api.post('/policies/p/approve',decision)).data;
  expect(approved.approver_id).toBe('historical');expect(approved.approval_history.at(-1).authority).toBe('delegated_policy');
  await expect(api.post('/policies/p/approve',decision)).rejects.toBeTruthy();
});
test('cross-client disabled contact and forged authority denied',async()=>{
  for(const id of ['foreign','disabled','business'])await expect(authority(id)).rejects.toBeTruthy();
  await expect(api.patch('/policies/p',{approval_account_id:'executive'})).rejects.toBeTruthy();
  await authority('executive');const decision=await submit();
  for(const id of ['foreign','disabled']){actor(id);await expect(api.post('/policies/p/approve',decision)).rejects.toBeTruthy();await expect(api.get('/policies/p/approval-context')).rejects.toBeTruthy();}
});
test('pending edits blocked; return reason, stale round and history retained',async()=>{
  const decision=await submit();
  await expect(api.patch('/policies/p',{title:'Changed'})).rejects.toBeTruthy();
  await expect(authority('executive')).rejects.toBeTruthy();
  await expect(api.post('/policies/p/reject',decision)).rejects.toBeTruthy();
  await api.post('/policies/p/reject',{...decision,comment:'Clarify scope'});
  const next=await submit();await expect(api.post('/policies/p/approve',decision)).rejects.toBeTruthy();
  await api.post('/policies/p/approve',next);
  expect((await api.get('/policies/p/approval-context')).data.history.map(h=>h.action)).toEqual(['submitted','rejected','submitted','approved']);
});
