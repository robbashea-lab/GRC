import axios from 'axios';
import {previewAdapter} from './adapter';
import {unifiedActions,pilotActionMatches,pilotActionStatus} from '../lib/brawndoActions';
import {loadClientDashboard} from '../lib/loadClientDashboard';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
const load=async cid=>{const [f,t]=await Promise.all(['findings','tasks'].map(k=>api.get('/'+k,{params:{client_id:cid}})));return unifiedActions({findings:f.data,tasks:t.data},cid);};
// Prestige and Dunder follow Brawndo's consolidated Findings → Action Items workflow.
test.each(['demo_prestige','demo_dunder'])('%s: one row per piece of work; Pending Validation stays visible until validated',async cid=>{
  const {data:f}=await api.post('/findings',{client_id:cid,title:'Consolidation QA gap',severity:'high'});
  expect((await load(cid)).filter(r=>r.raw.finding_id===f.finding_id).map(r=>r.kind)).toEqual(['findings']);
  await api.post('/tasks',{client_id:cid,title:'Fix consolidation QA gap',source_type:'finding',source_id:f.finding_id});
  let rows=(await load(cid)).filter(r=>(r.finding||r.raw).finding_id===f.finding_id);
  // The Finding is represented by its active Action only: no duplicate Finding row.
  expect(rows.map(r=>r.kind)).toEqual(['tasks']);
  const task=rows[0].raw;
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
