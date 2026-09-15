import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import Evidence from '../pages/Evidence';
import api from '@/lib/api';
import {readStore,saveStore} from '../preview/store';
import {resolveEvidenceSource} from '../lib/evidenceContext';

let mockClient;
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient?.client_id,currentClient:mockClient})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'demo_admin',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
jest.mock('@/components/ui/sheet',()=>({Sheet:({open,children})=>open?<div>{children}</div>:null,SheetContent:({children,...props})=><section {...props}>{children}</section>,SheetHeader:({children})=><header>{children}</header>,SheetTitle:({children})=><h2>{children}</h2>}));
let root,container,review,finding,task;
const button=text=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text);
const click=async text=>act(async()=>button(text).click());
const catalog=async extra=>(await api.get('/evidence/catalog',{params:{client_id:mockClient.client_id,...extra}})).data;
const upload=async(type,id,filename,extra={})=>(await api.post('/evidence',{client_id:mockClient.client_id,linked_type:type,linked_id:id,filename,mime_type:'application/pdf',content_base64:'VEVTVA==',...extra})).data;
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await api.post('/demo/enter');mockClient=(await api.post('/clients',{name:'Phase 3 test client'})).data;
  review=(await api.post('/reviews',{client_id:mockClient.client_id,title:'Policy Review and Approval',review_type:'policy',recurrence:'quarterly',due_date:'2026-09-30'})).data;
  finding=(await api.post(`/reviews/${review.review_id}/create-finding`,{title:'NO ISP',remediation_title:'MAKE AN ISP',occurrence_id:review.current_occurrence_id})).data;
  task=(await api.get('/tasks',{params:{client_id:mockClient.client_id}})).data[0];
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('Finding shows direct vs related proof and validation never copies or auto-approves it',async()=>{
  const evidence=await upload('task',task.task_id,'ISP-v1.0.pdf');
  await upload('review',review.review_id,'policy-review-checklist.pdf',{occurrence_id:review.current_occurrence_id});
  await act(async()=>root.render(<RecordDrawer open kind="findings" record={finding} clientId={mockClient.client_id} onOpenChange={()=>{}}/>));
  await click('Evidence');
  expect(container.textContent).toContain('No Evidence is directly attached to this Finding.');
  expect(container.querySelector('[aria-label="Evidence from Corrective Actions"]').textContent).toContain('ISP-v1.0.pdf');
  expect(container.querySelector('[aria-label="Evidence from Source Review"]').textContent).toContain('policy-review-checklist.pdf');
  const source=container.querySelector('button[aria-label="Open Action Item: MAKE AN ISP"]');
  await act(async()=>source.click());expect(container.textContent).toContain('Why this action exists');
  await api.patch('/tasks/'+task.task_id,{status:'done'});
  finding=(await api.get('/findings/'+finding.finding_id)).data;
  await act(async()=>root.render(<RecordDrawer open kind="findings" record={finding} clientId={mockClient.client_id} onOpenChange={()=>{}}/>));
  await click('Validate and close');
  expect(container.querySelector('[aria-label="Validation context"]')).toBeTruthy();
  expect(container.textContent).toContain('ISP-v1.0.pdf');
  expect(container.querySelectorAll('button[aria-label="Delete ISP-v1.0.pdf"]')).toHaveLength(0);
  expect((await api.get('/findings/'+finding.finding_id)).data.status).toBe('remediated');
  const db=readStore();expect(db.evidence.find(e=>e.evidence_id===evidence.evidence_id).linked_id).toBe(task.task_id);
  expect(db.evidence.filter(e=>e.linked_id===finding.finding_id)).toHaveLength(0);
});

test('three Actions and direct Finding Evidence remain distinct with explicit pagination',async()=>{
  await upload('finding',finding.finding_id,'direct.pdf');
  for(const name of ['Enable privileged MFA','Disable legacy auth','Document exceptions']){
    const action=(await api.post('/tasks',{client_id:mockClient.client_id,title:name,source_type:'finding',source_id:finding.finding_id})).data;
    await upload('task',action.task_id,name+'.pdf');
  }
  const params={entity_type:'findings',entity_id:finding.finding_id,page_size:2};
  const a=await catalog(params),b=await catalog({...params,page:2});
  expect(a.total).toBe(4);expect(a.counts).toEqual({direct:1,actions:3});
  expect(new Set([...a.items,...b.items].map(e=>e.evidence_id)).size).toBe(4);
  expect([...a.items,...b.items].filter(e=>e.category==='actions').map(e=>e.context.source.title).sort()).toEqual(['Disable legacy auth','Document exceptions','Enable privileged MFA']);
});

test('Q3 and Q4 source links select the original occurrence and search combines with filters',async()=>{
  await upload('review',review.review_id,'q3-access-export.csv',{occurrence_id:review.current_occurrence_id});
  const q4=(await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:review.current_occurrence_id})).data.review;
  await upload('review',review.review_id,'q4-access-export.csv',{occurrence_id:q4.current_occurrence_id});
  const found=await catalog({q:'Q3 2026',state:JSON.stringify({filters:{mime_type:['application/pdf']}})});
  expect(found.total).toBe(1);expect(found.items[0].filename).toBe('q3-access-export.csv');
  const target=await resolveEvidenceSource(found.items[0].context.source,mockClient.client_id);
  expect(target.initialValues.occurrence.occurrence_id).toBe(review.current_occurrence_id);
  expect((await catalog({entity_type:'findings',entity_id:finding.finding_id})).items.map(e=>e.filename)).toEqual(['q3-access-export.csv']);
  expect((await catalog({q:'q4-access'})).total).toBe(1);
  expect((await catalog({q:'NO ISP'})).total).toBe(0);
});

test('library displays readable sources and refreshed authoritative names',async()=>{
  await upload('task',task.task_id,'ISP-v1.0.pdf');
  await act(async()=>root.render(<Evidence/>));
  expect(container.textContent).toContain('MAKE AN ISP');expect(container.textContent).toContain('NO ISP');
  expect(container.textContent).not.toContain(task.task_id);
  expect(container.querySelector('[aria-label="Search Evidence"]')).toBeTruthy();
  await act(async()=>container.querySelector('[aria-label="Open Action Item: MAKE AN ISP"]').click());
  expect(container.textContent).toContain('Why this action exists');
  await api.patch('/tasks/'+task.task_id,{title:'Approve the ISP'});
  expect((await catalog({q:'Approve the ISP'})).total).toBe(1);
});

test('source navigation resolves Risk, Vendor, Policy and Finding records without registers',async()=>{
  const db=readStore();
  for(const [kind,key] of [['risks','risk_id'],['vendors','vendor_id'],['policies','policy_id']]){
    db[kind].push({[key]:'source-'+kind,client_id:mockClient.client_id,title:'Source '+kind,name:'Source '+kind,status:'open'});
  }
  saveStore(db);
  for(const kind of ['risks','vendors','policies'])await upload(kind,'source-'+kind,kind+'.pdf');
  await upload('finding',finding.finding_id,'finding.pdf');
  for(const row of (await catalog()).items){const target=await resolveEvidenceSource(row.context.source,mockClient.client_id);expect(target.kind).toBe(row.context.source.kind);expect(target.record.client_id).toBe(mockClient.client_id);}
});

test('Risk Related shows each file once and keeps treatment provenance separate',async()=>{
  const db=readStore(),risk={risk_id:'phase3-risk',client_id:mockClient.client_id,title:'Dispatch exposure',status:'identified',source_type:'manual',related_task_ids:[task.task_id]};
  db.risks.push(risk);db.tasks.find(t=>t.task_id===task.task_id).risk_id=risk.risk_id;saveStore(db);
  await upload('risk',risk.risk_id,'risk-direct.pdf');await upload('task',task.task_id,'treatment-proof.pdf');
  await act(async()=>root.render(<RecordDrawer open kind="risks" record={risk} clientId={mockClient.client_id} onOpenChange={()=>{}}/>));
  await click('Related');
  expect(container.querySelectorAll('[data-testid="related-evidence-item"]')).toHaveLength(0);
  expect(container.querySelector('[aria-label="Direct Evidence"]').textContent).toContain('risk-direct.pdf');
  expect(container.querySelector('[aria-label="Related Treatment Evidence"]').textContent).toContain('treatment-proof.pdf');
  expect(container.querySelectorAll('[data-testid="context-evidence-file"]')).toHaveLength(2);
});

test('orphan source fallback, uploader parity, and role/client authorization remain explicit',async()=>{
  const file=await upload('task',task.task_id,'proof.pdf');expect(file.uploaded_by_email).toBe(readStore().user.email);
  let db=readStore();const other=db.clients.find(c=>c.client_id!==mockClient.client_id);
  db.evidence.push({evidence_id:'orphan',client_id:mockClient.client_id,filename:'legacy.pdf',linked_type:'task',linked_id:db.tasks.find(t=>t.client_id===other.client_id).task_id});saveStore(db);
  const orphan=(await catalog({q:'legacy.pdf'})).items[0];expect(orphan.context.source.available).toBe(false);expect(orphan.uploader).toBe('Unknown uploader');
  db=readStore();db.user={...db.user,role:'client_readonly',client_ids:[mockClient.client_id]};saveStore(db);
  expect((await catalog()).total).toBe(2);
  await expect(api.get('/evidence/catalog',{params:{client_id:other.client_id}})).rejects.toBeTruthy();
  await expect(upload('task',task.task_id,'no-write.pdf')).rejects.toBeTruthy();
  await expect(api.delete('/evidence/'+file.evidence_id)).rejects.toBeTruthy();
  expect((await api.get('/evidence/'+file.evidence_id+'/download')).data.filename).toBe('proof.pdf');
});

test('library is not silently capped and deleted inventory retains authorized bytes',async()=>{
  const file=await upload('finding',finding.finding_id,'archive.pdf');
  await api.delete('/evidence/'+file.evidence_id);expect((await catalog()).total).toBe(0);
  expect((await api.get('/evidence/'+file.evidence_id+'/download')).data.filename).toBe('archive.pdf');
  const db=readStore();db.evidence.push(...Array.from({length:1005},(_,i)=>({client_id:mockClient.client_id,evidence_id:'bulk-'+i,filename:'bulk-'+i,linked_type:'task',linked_id:task.task_id,created_at:'2026-09-01'})));saveStore(db);
  const page=await catalog({q:'bulk-',page:11,page_size:100});expect(page.total).toBe(1005);expect(page.items).toHaveLength(5);
});
