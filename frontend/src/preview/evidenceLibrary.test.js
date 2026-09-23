import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore} from './store';
const api=axios.create({adapter:previewAdapter});
let cid;
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'Evidence Library QA'})).data.client_id;});
const upload=async extra=>(await api.post('/evidence',{client_id:cid,filename:'proof.txt',mime_type:'text/plain',content_base64:'VEVTVA==',...extra})).data;
const link=async(e,kind,id,extra={})=>(await api.post(`/evidence-library/items/${e.evidence_id}/relationships`,{linked_type:kind,linked_id:id,expected_updated_at:e.updated_at||null,...extra})).data;

test('one file supports three records; unlink preserves bytes, provenance, and Activity',async()=>{
  const vendor=(await api.post('/vendors',{client_id:cid,name:'CloudCore',service:'Cloud hosting'})).data;
  const finding=(await api.post('/findings',{client_id:cid,title:'Access gap',severity:'high'})).data;
  const risk=(await api.post('/risks',{client_id:cid,title:'Exposure'})).data;
  let e=await upload({linked_type:'vendor',linked_id:vendor.vendor_id});e=await link(e,'findings',finding.finding_id);e=await link(e,'risks',risk.risk_id);
  expect(e.references).toHaveLength(3);expect(readStore().evidence.filter(r=>r.client_id===cid)).toHaveLength(1);
  e=await link(e,'findings',finding.finding_id,{remove:true});expect(e.references).toHaveLength(2);
  expect((await api.get(`/evidence/${e.evidence_id}/download`)).data.content_base64).toBe('VEVTVA==');
  expect((await api.get(`/evidence-library/items/${e.evidence_id}/activity`)).data.items.some(r=>r.action==='Evidence relationship removed')).toBe(true);
  await expect(link(e,'vendors',vendor.vendor_id,{remove:true})).rejects.toThrow('provenance');
});

test('Q1-Q4 sets survive 2028; linked Vendor file participates in immutable completion',async()=>{
  let r=(await api.post('/reviews',{client_id:cid,title:'User Access Review',review_type:'access',recurrence:'quarterly',due_date:'2027-03-31'})).data;
  const vendor=(await api.post('/vendors',{client_id:cid,name:'CloudCore',service:'Cloud hosting'})).data;
  let first=await upload({linked_type:'vendor',linked_id:vendor.vendor_id});
  for(let q=1;q<=4;q++){
    if(q===1)first=await link(first,'reviews',r.review_id,{occurrence_id:r.current_occurrence_id});else await upload({filename:`Q${q}.txt`,linked_type:'review',linked_id:r.review_id,occurrence_id:r.current_occurrence_id});
    const completed=(await api.post(`/reviews/${r.review_id}/complete`,{occurrence_id:r.current_occurrence_id})).data;
    expect(completed.occurrence.evidence).toHaveLength(1);r=completed.review;
  }
  const sets=(await api.get(`/evidence-library/reviews/${r.review_id}/sets`,{params:{year:'2027'}})).data;
  expect(sets.items.map(o=>o.period)).toEqual(['Q4 2027','Q3 2027','Q2 2027','Q1 2027']);
  expect((await api.get('/evidence/catalog',{params:{client_id:cid,entity_type:'reviews',entity_id:r.review_id}})).data.total).toBe(0);
  await expect(api.delete(`/evidence/${first.evidence_id}`)).rejects.toThrow('retained');
});

test('classification, filters, scoped sources and stale metadata match the server contract',async()=>{
  const e=await upload();
  const updated=(await api.patch(`/evidence-library/items/${e.evidence_id}`,{display_name:'Assurance report',evidence_type:'Report',expected_updated_at:e.updated_at||null,expiration_date:'2027-01-01'})).data;
  await expect(api.patch(`/evidence-library/items/${e.evidence_id}`,{display_name:'stale',expected_updated_at:null})).rejects.toThrow('changed');
  const catalog=(await api.get('/evidence/catalog',{params:{client_id:cid,q:'Assurance',today:'2027-02-01',state:JSON.stringify({filters:{program_areas:['Unassigned'],evidence_type:['Report'],refresh_status:['Expired / refresh overdue']}})}})).data;
  expect(catalog.total).toBe(1);expect(catalog.items[0].content_base64).toBeUndefined();
  const db=readStore(),foreign=db.clients.find(c=>c.client_id!==cid);db.user={...db.user,role:'client_contributor',client_ids:[cid]};saveStore(db);
  await expect(api.get('/evidence-library/sources',{params:{client_id:foreign.client_id,kind:'reviews'}})).rejects.toThrow('Forbidden');
  const db2=readStore();db2.user.role='client_readonly';saveStore(db2);
  await expect(api.patch(`/evidence-library/items/${e.evidence_id}`,{expected_updated_at:updated.updated_at,display_name:'forbidden'})).rejects.toThrow('Read-only');
});

test('module-owned framework links and archived Policy approval files remain authoritative',async()=>{
  const p=(await api.post('/policies',{client_id:cid,title:'Policy',version:'1.0'})).data;
  const e=await upload({linked_type:'policy',linked_id:p.policy_id});
  const db=readStore();db.policies.find(r=>r.policy_id===p.policy_id).approval_source={evidence_id:e.evidence_id};
  db.framework_assessments.push({framework_assessment_id:'library-assessment',client_id:cid,framework_key:'cis-ig1',definition_id:'6.3',related_links:[]});saveStore(db);
  await api.post('/framework_assessments/library-assessment/links',{kind:'evidence',id:e.evidence_id});
  let detail=(await api.get(`/evidence-library/items/${e.evidence_id}`)).data;
  expect(detail.references.find(r=>r.kind==='framework_assessments').origin).toBe('module');
  await api.delete('/framework_assessments/library-assessment/links',{data:{kind:'evidence',id:e.evidence_id}});
  detail=(await api.get(`/evidence-library/items/${e.evidence_id}`)).data;
  expect(detail.references.some(r=>r.kind==='framework_assessments')).toBe(false);
  expect((await api.get(`/evidence-library/items/${e.evidence_id}/activity`)).data.items.some(r=>r.action==='Framework Evidence unlinked')).toBe(true);
  await api.delete(`/evidence/${e.evidence_id}`);
  const catalog=(await api.get('/evidence/catalog',{params:{client_id:cid,entity_type:'policies',entity_id:p.policy_id}})).data;
  expect(catalog.items[0].references[0].document_context).toBe('Current approval document');
  expect((await api.get(`/evidence/${e.evidence_id}/download`)).data.content_base64).toBe('VEVTVA==');
});
