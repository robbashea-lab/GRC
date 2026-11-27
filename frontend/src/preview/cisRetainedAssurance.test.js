import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,saveStore} from './store';
import {isCisClient} from './cisCapability';

const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});

test('CIS deselection retains actual historical assurance Evidence and original Task provenance through native requests',async()=>{
  const cid=(await api.post('/clients',{name:'Synthetic retained assurance QA',status:'active'})).data.client_id;
  // Disposable committed fixture. Native onboarding generation is exercised separately.
  const initial=readStore(),client=initial.clients.find(row=>row.client_id===cid);
  client.framework_settings={'cis-ig1':{implementation_group:2}};
  initial.requirements.push({requirement_id:`${cid}:cis-enrollment`,client_id:cid,title:'CIS Controls',baseline_key:'cis-ig1',baseline_response:'applies'});
  saveStore(initial);
  expect(isCisClient(readStore(),cid)).toBe(true);
  const vendor=(await api.post('/vendors',{client_id:cid,name:'Synthetic provider',service:'Infrastructure',assurance_records:[{assurance_id:'document',type:'SOC 2',review_status:'requested'}]})).data;
  const evidence=(await api.post('/evidence',{client_id:cid,linked_type:'vendor',linked_id:vendor.vendor_id,filename:'retained-assurance.txt',content_base64:'aGlzdG9yeQ=='})).data;
  let current=(await api.get(`/vendors/${vendor.vendor_id}`)).data;
  await api.patch(`/vendors/${vendor.vendor_id}`,{assurance_records:current.assurance_records.map(row=>({...row,evidence_ids:[evidence.evidence_id]}))});
  current=(await api.get(`/vendors/${vendor.vendor_id}`)).data;
  await api.patch(`/vendors/${vendor.vendor_id}`,{assurance_records:current.assurance_records.map(row=>({...row,evidence_ids:[]}))});
  const task=(await api.post('/tasks',{client_id:cid,title:'Obtain renewal',priority:'informational',source_type:'vendor',source_id:vendor.vendor_id,vendor_id:vendor.vendor_id,assurance_id:'document'})).data;
  const before=(await api.get(`/vendors/${vendor.vendor_id}`)).data;
  expect(before.assurance_records[0].evidence_ids).toEqual([]);
  expect(before.assurance_records[0].history.some(row=>row.evidence_ids?.includes(evidence.evidence_id))).toBe(true);
  const retained=readStore();retained.requirements.find(row=>row.client_id===cid&&row.baseline_key==='cis-ig1').baseline_response='does_not_apply';saveStore(retained);
  expect(isCisClient(readStore(),cid)).toBe(false);
  await expect(api.delete(`/evidence/${evidence.evidence_id}`)).rejects.toThrow(/historical evidence must be retained/);
  await expect(api.patch(`/vendors/${vendor.vendor_id}`,{assurance_records:[]})).rejects.toThrow(/Assurance history must be retained/);
  await expect(api.patch(`/tasks/${task.task_id}`,{assurance_id:null})).rejects.toThrow(/Original assurance source/);
  expect((await api.get(`/vendors/${vendor.vendor_id}`)).data.assurance_records).toEqual(before.assurance_records);
  expect((await api.get(`/tasks/${task.task_id}`)).data.assurance_id).toBe('document');
  expect((await api.get(`/evidence/${evidence.evidence_id}`)).data.evidence_id).toBe(evidence.evidence_id);
});
