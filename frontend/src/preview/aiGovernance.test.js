import axios from 'axios';
import {previewAdapter} from './adapter';
import {catalog,aiScreening} from '../lib/aiGovernance';
const api=axios.create({adapter:previewAdapter});
let cid;
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'AI governance QA'})).data.client_id;});
const create=async extra=>(await api.post('/ai_systems',{client_id:cid,name:'Microsoft Copilot',status:'active',provider:'Microsoft',...extra})).data;
const rows=async()=>(await api.get('/ai_systems',{params:{client_id:cid}})).data;

test('tenant sequential immutable identifiers and explicit screening',async()=>{
  const first=await create(),second=await create({name:'Resume Screening Assistant',purposes:['HR / Employment']});
  expect(first.display_id).toBe('AI-001');expect(first.risk_tier).toBe('moderate');expect(second.display_id).toBe('AI-002');expect(second.risk_tier).toBe('high');
  await expect(api.patch('/ai_systems/'+first.ai_system_id,{display_id:'AI-777'})).rejects.toThrow(/read-only/);
  await expect(api.delete('/ai_systems/'+first.ai_system_id)).rejects.toThrow(/retained/);
  const other=(await api.post('/clients',{name:'Other AI client'})).data.client_id;
  expect((await create({client_id:other})).display_id).toBe('AI-001');
  await expect(api.patch('/ai_systems/'+first.ai_system_id,{client_id:other})).rejects.toThrow(/move/);
  expect(await rows()).toHaveLength(2);
  expect(aiScreening({screening:{}}).risk_tier).toBeNull();
  expect(aiScreening({screening:Object.fromEntries(catalog.questions.map(q=>[q.key,q.key==='oversight']))})).toMatchObject({risk_tier:'low',screening_complete:true});
});

test('same Review, occurrence history, Finding, Action and evidence; retirement preserves history',async()=>{
  const ai=await create(),base='/ai_systems/'+ai.ai_system_id;
  const review=(await api.post(base+'/reviews',{due_date:'2026-09-30',recurrence:'annual'})).data;
  expect((await api.post(base+'/reviews',{due_date:'2026-09-30',recurrence:'annual'})).data.review_id).toBe(review.review_id);
  const action={occurrence_id:review.current_occurrence_id};
  await api.post('/reviews/'+review.review_id+'/start',action);
  const finding=(await api.post('/reviews/'+review.review_id+'/create-finding',{...action,title:'Human review is not consistently documented',remediation_title:'Implement human approval'})).data;
  await api.post('/evidence',{client_id:cid,linked_type:'review',linked_id:review.review_id,...action,filename:'assessment.txt',content_base64:'eA=='});
  await api.post('/reviews/'+review.review_id+'/complete',action);
  expect((await rows())[0]).toMatchObject({next_review:expect.stringContaining('2027-09-30'),last_review:expect.any(String)});
  const related=(await api.get('/related',{params:{entity_type:'ai_systems',entity_id:ai.ai_system_id}})).data;
  expect(related.findings[0].finding_id).toBe(finding.finding_id);expect(related.tasks).toHaveLength(1);expect(related.evidence).toHaveLength(1);
  await api.patch('/tasks/'+related.tasks[0].task_id,{status:'done'});
  expect((await api.get('/findings',{params:{client_id:cid}})).data[0].status).toBe('remediated');
  await api.patch(base,{status:'retired'});
  const history=(await api.get('/reviews/'+review.review_id+'/history')).data;
  expect(history).toHaveLength(1);expect((await rows())[0].next_review).toBeNull();
  await expect(api.post(base+'/reviews',{due_date:'2026-12-01',recurrence:'annual'})).rejects.toThrow(/historical/);
  expect((await api.get('/tasks',{params:{client_id:cid}})).data).toHaveLength(1);
});

test('health signals auto-resolve, relationships reject other tenants, no legal determination',async()=>{
  const ai=await create({purposes:['HR / Employment'],data_types:['Employee Data']}),base='/ai_systems/'+ai.ai_system_id;
  expect(ai.alerts.map(a=>a.key)).toEqual(expect.arrayContaining(['owner','schedule','risk','screening','oversight','vendor','sensitive']));
  await api.post(base+'/material-change',{note:'Customer-facing consequential recommendations'});
  expect((await rows())[0].alerts.map(a=>a.key)).toContain('change');
  const vendor=(await api.post('/vendors',{client_id:cid,name:'Microsoft',service:'AI productivity applications'})).data;
  await api.patch(base,{vendor_id:vendor.vendor_id,oversight_notes:'Human approval required before employment decisions'});
  expect((await rows())[0].alerts.map(a=>a.key)).not.toContain('vendor');
  expect((await rows())[0].alerts.map(a=>a.key)).not.toContain('oversight');
  const risk=(await api.post('/risks',{client_id:cid,title:'Employment bias exposure',likelihood_score:3,impact_score:4})).data;
  await api.post(base+'/links',{kind:'risks',id:risk.risk_id});
  expect((await rows())[0].alerts.map(a=>a.key)).not.toContain('risk');
  const reverse=(await api.get('/related',{params:{entity_type:'risks',entity_id:risk.risk_id}})).data;
  expect(reverse.ai_systems[0].ai_system_id).toBe(ai.ai_system_id);
  const other=(await api.post('/clients',{name:'Restricted'})).data.client_id;
  const foreign=(await api.post('/risks',{client_id:other,title:'Foreign'})).data;
  await expect(api.post(base+'/links',{kind:'risks',id:foreign.risk_id})).rejects.toThrow(/same client/);
  expect((await api.get('/findings',{params:{client_id:cid}})).data).toHaveLength(0);
});

test('intake creates no requirements, records or reviews and clears stale Yes indicators',async()=>{
  await api.post('/ai-intake',{client_id:cid,usage:'yes',indicators:['HR / Employment']});
  expect(await rows()).toHaveLength(0);
  expect((await api.get('/requirements',{params:{client_id:cid}})).data).toHaveLength(0);
  await api.post('/ai-intake',{client_id:cid,usage:'no',indicators:['HR / Employment']});
  expect((await api.get('/ai-intake',{params:{client_id:cid}})).data).toMatchObject({usage:'no',indicators:[]});
});
