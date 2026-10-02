import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {STORE_KEY} from './store';
import baseline from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS} from '../lib/frameworks';
import {auditPackage,auditActivationPlan,auditProgress,blankAuditItem} from '../lib/isoAudit';

const api=axios.create({adapter:previewAdapter});
let cid;
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  cid=(await api.post('/clients',{name:'Synthetic ISO audit regression'})).data.client_id;
  await api.post('/onboarding/baseline',{client_id:cid,finalize:true,state:{version:3,step:3,
    policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),
    requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='iso-27001'?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}}});
});
const get=async(path)=> (await api.get(path,{params:{client_id:cid}})).data;
async function activate(){
  const user=(await get('/auth/me'));
  const body={client_id:cid,start_date:new Date().toISOString().slice(0,10),first_package:'governance-risk',
    auditor_id:user.user_id,scope:'Synthetic ISMS',independence:'Independent reviewers; auditor does not assess their own program'};
  return {body,data:(await api.post('/iso-audit/activate',body)).data};
}
const token=r=>({occurrence_id:r.current_occurrence_id,expected_updated_at:r.updated_at??null});
test('prospective rotation is deterministic and does not turn workbook quarters into historical dates',()=>{
  expect(auditActivationPlan('2031-07-01','people-access-suppliers').map(r=>r.due_date)).toEqual(['2031-09-30','2031-12-31','2032-03-31','2032-06-30']);
  expect(auditActivationPlan('2031-02-31','governance-risk')).toEqual([]);
});
test('activation preserves existing Reviews, creates only four, and survives reload/replay',async()=>{
  const old=await get('/reviews'),{body,data}=await activate();
  expect(data.reviews).toHaveLength(4);
  expect((await get('/reviews')).filter(r=>!r.iso_audit)).toEqual(old);
  await api.post('/iso-audit/activate',body);
  expect((await get('/iso-audit')).reviews).toHaveLength(4);
  expect(JSON.parse(sessionStorage.getItem(STORE_KEY)).clients.find(c=>c.client_id===cid).iso_audit_program.status).toBe('active');
});
test('audit progress is independent of result; links, CAS, closure and historical evidence are preserved',async()=>{
  let r=(await activate()).data.reviews[0];
  const items=auditPackage(r.iso_audit.package_key).items, key=items[0].key;
  const patch=async(k,fields)=>{const result=await api.patch('/reviews/'+r.review_id+'/iso-audit/'+k,{...blankAuditItem(),...fields,...token(r)});r=result.data;};
  await patch(key,{status:'reviewed'});
  expect(auditProgress(r.iso_audit).complete).toBe(0);
  await expect(api.post('/reviews/'+r.review_id+'/complete',{occurrence_id:r.current_occurrence_id})).rejects.toThrow();
  const stale={...token(r)};await patch(key,{status:'in_progress',notes:'Draft retained'});
  await expect(api.patch('/reviews/'+r.review_id+'/iso-audit/'+key,{...blankAuditItem(),...stale})).rejects.toThrow('changed');
  const e=(await api.post('/evidence',{client_id:cid,filename:'DEMO synthetic audit report.txt',mime_type:'text/plain',content_base64:'REVNTw==',linked_type:'review',linked_id:r.review_id,occurrence_id:r.current_occurrence_id})).data;
  for(const i of items)await patch(i.key,{status:'reviewed',result:'conforming',evidence_ids:[e.evidence_id]});
  const f=(await api.post('/reviews/'+r.review_id+'/create-finding',{occurrence_id:r.current_occurrence_id,title:'Synthetic exception',remediation_title:'Resolve synthetic exception',request_id:'audit-test'})).data;
  await patch(key,{status:'reviewed',result:'observation',finding_ids:[f.finding_id],evidence_ids:[e.evidence_id]});
  r=(await api.patch('/reviews/'+r.review_id+'/iso-audit',{...token(r),report_evidence_id:e.evidence_id})).data;
  const oid=r.current_occurrence_id,closed=(await api.post('/reviews/'+r.review_id+'/complete',{occurrence_id:oid})).data;
  expect(closed.occurrence.iso_audit.progress.complete).toBe(items.length);
  expect(closed.review.iso_audit.items).toEqual({});
  expect(closed.review.iso_audit.cycle).toBe(2);
  expect((await get('/tasks')).filter(t=>t.finding_id===f.finding_id)).toHaveLength(1);
  expect((await get('/reviews/'+r.review_id+'/history'))[0].iso_audit.items[key].result).toBe('observation');
  expect((await api.get('/evidence/catalog',{params:{client_id:cid,entity_type:'reviews',entity_id:r.review_id,occurrence_id:oid}})).data.total).toBe(1);
});
test('SoA completion pins applicability and implementation independently without rewriting history',async()=>{
  const w=await get('/frameworks/iso-27001'),a=w.assessments.find(a=>a.definition_id==='A.8.30');
  await api.patch('/framework_assessments/'+a.framework_assessment_id,{status:'in_progress',soa_applicability:'excluded',soa_justification:'No outsourced development in this synthetic scope'});
  let r=(await get('/reviews')).find(r=>r.framework_drivers?.some(d=>d.framework_plan_key==='iso-soa-review'));
  r=(await api.patch('/reviews/'+r.review_id,{due_date:new Date().toISOString().slice(0,10),expected_occurrence_id:r.current_occurrence_id,expected_updated_at:r.updated_at??null})).data;
  const result=(await api.post('/reviews/'+r.review_id+'/complete',{occurrence_id:r.current_occurrence_id})).data;
  expect(result.occurrence.iso_soa_snapshot.assessments).toHaveLength(93);
  await api.patch('/framework_assessments/'+a.framework_assessment_id,{soa_applicability:'included',soa_justification:'Supplier added to scope'});
  const old=(await get('/reviews/'+r.review_id+'/history'))[0].iso_soa_snapshot.assessments.find(x=>x.definition_id===a.definition_id);
  expect(old).toMatchObject({status:'in_progress',soa_applicability:'excluded'});
  expect(old.assessment_history).toBeUndefined();
});
