import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore} from './store';
import {controlMigrationPlan} from './organizationalControls';
import {resolveEvidenceSource} from '../lib/evidenceContext';
jest.mock('../lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('./adapter').previewAdapter})}));
const api=axios.create({adapter:previewAdapter}),base='/organizational-controls';
let cid,aids,original;
const get=async path=>(await api.get(path,{params:{client_id:cid}})).data;
const design=c=>Object.fromEntries(['name','description','frequency','design','owner_id','assessment_ids','related_links'].map(k=>[k,c[k]]));
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');const db=readStore();cid='demo_prestige';
  const rows=db.framework_assessments.filter(a=>a.client_id===cid);aids=rows.slice(0,2).map(a=>a.framework_assessment_id);
  rows.forEach(a=>{a.management_controls=[];a.assessment_history=[];});
  rows.slice(0,2).forEach((a,i)=>{a.management_controls=[{control_id:'shared',name:'Access review',description:i?'Supplier-inclusive design':'Workforce design',frequency:'Quarterly',design:'adequate',operating:'gap',period_start:'2025-01-01',period_end:'2025-12-31',expected_instances:4,collected_instances:3}];a.assessment_history=[{at:'2025-01-01',by:db.user.user_id,management_controls:[{...a.management_controls[0],description:'Historical design'}]}];});
  original=JSON.parse(JSON.stringify(rows));saveStore(db);
});
test('migration preserves sources, flags conflicts and is idempotent without changing assessments',async()=>{
  expect((await get(base)).migration_pending).toBe(1);
  expect((await api.post(base+'/migrate',{client_id:cid})).data.created).toBe(1);
  const c=(await get(base)).items[0],detail=await get(base+'/'+encodeURIComponent(c.control_id));
  expect(detail).toMatchObject({description:'',conflicts:['description'],assessment_ids:aids});
  expect(detail.legacy_sources).toHaveLength(4);
  expect((await api.post(base+'/migrate',{client_id:cid})).data.created).toBe(0);
  expect(readStore().framework_assessments.filter(a=>a.client_id===cid)).toEqual(original.map(a=>({...a,controls_migrated:true})));
  await expect(api.patch('/framework_assessments/'+aids[0],{management_controls:[]})).rejects.toThrow('shared organizational Control');
});
test('reconciliation and subsequent design changes preserve observation history and original evidence',async()=>{
  await api.post(base+'/migrate',{client_id:cid});let c=(await get(base)).items[0];const p=base+'/'+encodeURIComponent(c.control_id);
  const e=(await api.get('/evidence/catalog',{params:{client_id:cid}})).data.items[0];
  c=(await api.patch(p,{...design(c),description:'Agreed supplier and workforce review',expected_updated_at:c.updated_at,resolve_conflicts:true,reconciliation_note:'Design owners reconciled the two scopes',related_links:[{kind:'evidence',id:e.evidence_id}]})).data;
  const body={request_id:'annual',period_start:'2026-01-01',period_end:'2026-12-31',operating:'gap',notes:'Missing fourth review',expected_instances:4,collected_instances:3,expected_updated_at:c.updated_at};
  c=(await api.post(p+'/observations',body)).data;const history=JSON.parse(JSON.stringify(c.observations));
  expect((await api.post(p+'/observations',body)).data.observations).toHaveLength(1);
  const old=c.updated_at;c=(await api.patch(p,{...design(c),description:'Next year design',expected_updated_at:old})).data;
  expect(c.observations).toEqual(history);expect(c.observations[0].design_snapshot.description).toBe('Agreed supplier and workforce review');
  await expect(api.patch(p,{...design(c),expected_updated_at:old})).rejects.toThrow('changed since');
  expect(readStore().evidence.filter(x=>x.evidence_id===e.evidence_id)).toHaveLength(1);
  expect(readStore().framework_assessments.filter(a=>a.client_id===cid)).toEqual(original.map(a=>({...a,controls_migrated:true})));
  const refreshed=await get(p);expect(refreshed.observations).toEqual(history);expect(refreshed.linked_records.evidence[0].created_at).toBe(e.created_at);
  let detail=await get('/evidence-library/items/'+e.evidence_id);
  let ref=detail.references.find(r=>r.kind==='organizational_controls');
  expect(ref).toMatchObject({id:c.control_id,available:true,document_context:'Current Control relationship'});
  expect((await resolveEvidenceSource(ref,cid)).record.control_id).toBe(c.control_id);
  c=(await api.patch(p,{...design(c),expected_updated_at:c.updated_at,related_links:[]})).data;
  detail=await get('/evidence-library/items/'+e.evidence_id);
  expect(detail.references.find(r=>r.kind==='organizational_controls').document_context).toBe('Historical Control relationship');
  await expect(api.delete('/evidence/'+e.evidence_id)).rejects.toThrow('retained');
  expect((await get(p)).linked_records.evidence).toHaveLength(1);
});
test('Control APIs reject client escalation, foreign mappings, unknown properties and stale writes',async()=>{
  const body={client_id:cid,request_id:'create',name:'Independent Control',assessment_ids:aids};
  let c=(await api.post(base,body)).data;
  expect((await api.post(base,body)).data.control_id).toBe(c.control_id);
  await expect(api.post(base,{...body,name:'Changed intent'})).rejects.toThrow();
  const p=base+'/'+encodeURIComponent(c.control_id),db=readStore(),foreign=db.framework_assessments.find(a=>a.client_id!==cid).framework_assessment_id;
  for(const bad of [{assessment_ids:[foreign]},{client_id:'demo_brawndo'},{owner_id:'absent'},{history:[]}])await expect(api.patch(p,{...design(c),expected_updated_at:c.updated_at,...bad})).rejects.toThrow();
  for(const role of ['client_readonly','client_contributor','client_grc_manager','platform_admin']){
    const state=readStore();state.user={...state.user,role,client_ids:role==='platform_admin'?['demo_brawndo']:[cid]};saveStore(state);
    await expect(api.post(base+'/migrate',{client_id:cid})).rejects.toThrow();
    if(role!=='platform_admin')expect((await get(p)).control_id).toBe(c.control_id);else await expect(get(p)).rejects.toThrow();
  }
});
test('missing legacy identity is isolated and contradictory design fields remain unset',()=>{
  const rows=original.slice(0,2).map(a=>({...a,management_controls:[{name:'Same'}],assessment_history:[]}));
  expect(controlMigrationPlan(rows,cid,'now','actor')).toHaveLength(2);
});
