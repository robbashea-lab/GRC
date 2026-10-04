import axios from 'axios';
import {previewAdapter} from './adapter';
import {unifiedActions,pilotActionMatches,pilotActionStatus} from '../lib/brawndoActions';
import {loadClientDashboard} from '../lib/loadClientDashboard';
import {readStore,saveStore} from './store';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
const load=async cid=>{const [f,t]=await Promise.all(['findings','tasks'].map(k=>api.get('/'+k,{params:{client_id:cid}})));return unifiedActions({findings:f.data,tasks:t.data},cid);};
test.each(['inactive','foreign'])('reopened work is unassigned when the historic owner is %s; completed Action stays intact',async reason=>{
  const cid='demo_brawndo',db=readStore(),owner=db.users.find(u=>u.client_ids?.includes(cid)&&u.role==='client_contributor');
  const {data:f}=await api.post('/findings',{client_id:cid,title:'Owner departed',owner_id:owner.user_id});
  const {data:t}=await api.post('/tasks',{client_id:cid,title:'Original correction',source_type:'finding',source_id:f.finding_id,assignee_id:owner.user_id});
  await api.patch('/tasks/'+t.task_id,{status:'done',resolution:'Prior resolution'});
  const ready=(await api.get('/findings/'+f.finding_id)).data;
  const {data:closed}=await api.post('/findings/'+f.finding_id+'/validate',{rationale:'Checked',request_id:'initial-validation',expected_updated_at:ready.updated_at});
  const changed=readStore(),before=JSON.parse(JSON.stringify(changed.tasks.find(x=>x.task_id===t.task_id))),account=changed.users.find(u=>u.user_id===owner.user_id);
  if(reason==='inactive')account.status='disabled';else account.client_ids=['demo_dunder'];saveStore(changed);
  const {data:reopened}=await api.post('/findings/'+f.finding_id+'/reopen',{request_id:'reopen-owner-departed',expected_updated_at:closed.updated_at});
  expect(readStore().tasks.find(x=>x.task_id===reopened.primary_task_id).assignee_id).toBeNull();
  expect(readStore().tasks.find(x=>x.task_id===t.task_id)).toEqual(before);
  expect(reopened.decision_history).toHaveLength(2);
});
test('contributor can replay only the exact unassignment, with current tenant membership',async()=>{
  const {data:task}=await api.post('/tasks',{client_id:'demo_brawndo',title:'Assigned work'});
  const db=readStore();db.user={user_id:'ticket_contributor',role:'client_contributor',client_ids:['demo_brawndo']};
  db.tasks.find(t=>t.task_id===task.task_id).assignee_id=db.user.user_id;saveStore(db);
  const path='/tasks/'+task.task_id,body={assignee_id:null,expected_updated_at:task.updated_at},config={headers:{'Idempotency-Key':'unassign-ticket-intent-001'}};
  const first=await api.patch(path,body,config);
  expect((await api.patch(path,body,config)).data).toEqual(first.data);
  await expect(api.patch(path,{...body,title:'Different'},config)).rejects.toMatchObject({response:{status:409}});
  await expect(api.patch(path,body,{headers:{'Idempotency-Key':'new-unassigned-intent-001'}})).rejects.toMatchObject({response:{status:403}});
  const lost=readStore();lost.user.client_ids=['demo_dunder'];saveStore(lost);
  await expect(api.patch(path,body,config)).rejects.toMatchObject({response:{status:403}});
});
// Prestige and Dunder follow Brawndo's consolidated Findings → Action Items workflow.
test.each(['demo_prestige','demo_dunder'])('%s: one row per piece of work; Pending Validation stays visible until validated',async cid=>{
  const {data:f}=await api.post('/findings',{client_id:cid,title:'Consolidation QA gap',severity:'high'});
  expect((await load(cid)).filter(r=>r.raw.finding_id===f.finding_id).map(r=>r.kind)).toEqual(['findings']);
  await api.post('/tasks',{client_id:cid,title:'Fix consolidation QA gap',source_type:'finding',source_id:f.finding_id});
  let rows=(await load(cid)).filter(r=>(r.finding||r.raw).finding_id===f.finding_id);
  // One stable Finding identity owns the ticket throughout its lifecycle.
  expect(rows.map(r=>r.kind)).toEqual(['findings']);
  expect(rows[0].ticketId).toBe('finding:'+f.finding_id);
  const task=rows[0].primary;
  await api.patch('/tasks/'+task.task_id,{status:'done'});
  expect((await api.get('/findings/'+f.finding_id)).data.status).toBe('remediated');
  rows=(await load(cid)).filter(r=>(r.finding||r.raw).finding_id===f.finding_id&&!['done','cancelled'].includes(r.raw.status));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({kind:'findings',hasAction:true});
  expect(pilotActionStatus(rows[0])).toBe('pending_validation');
  expect(pilotActionMatches(rows[0],'active')).toBe(true);
  // Every row stays inside its own client.
  expect((await load(cid)).every(r=>r.raw.client_id===cid)).toBe(true);
});
test.each(['demo_brawndo','demo_prestige','demo_dunder'])('%s: High / Critical Findings view reconciles with the Dashboard Finding count',async cid=>{
  const user=(await api.get('/auth/me')).data;
  const dash=await loadClientDashboard(api,{clientId:cid,user,scope:{kind:'org'},workQueue:true});
  const expected=dash.posture.totals?.materialFindings??dash.posture.materialFindings.length;
  const rows=(await load(cid)).filter(r=>pilotActionMatches(r,'high_critical'));
  expect(new Set(rows.map(r=>(r.finding||r.raw).finding_id)).size).toBe(expected);
});
