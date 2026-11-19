import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';

const api=axios.create({adapter:previewAdapter});
const cases=[['CIS IG1','cis-ig1',1],['CIS IG2','cis-ig1',2],['CIS IG3','cis-ig1',3],
  ['General GRC',null,null],['ISO 27001','iso-27001',null],['SOC 2','soc-2',null]];
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});

async function enroll(label,key,group){
  const {data:client}=await api.post('/clients',{name:'SYNTHETIC Vendor lifecycle '+label});
  const cid=client.client_id;
  const {data:intake}=await api.get('/onboarding/baseline',{params:{client_id:cid}});
  const state={...intake.state,version:3,step:3,
    policies:Object.fromEntries(intake.catalog.policies.map(item=>[item.key,'unsure'])),
    requirements:Object.fromEntries(intake.catalog.requirements.map(item=>[item.key,item.key===key?'applies':'does_not_apply'])),
    reviews:[],framework_reviews:{},framework_settings:key==='cis-ig1'?{'cis-ig1':{implementation_group:group}}:{}};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true,
    expected_updated_at:intake.state.updated_at??null,expected_records:intake.record_versions},
  {headers:{'Idempotency-Key':'synthetic-vendor-lifecycle-'+(key||'general')+'-'+(group||'none')}});
  if(key){
    const {data:workspace}=await api.get('/frameworks/'+key,{params:{client_id:cid}});
    expect(workspace.selected).toBe(true);
    if(group)expect(workspace.configuration.implementation_group).toBe(group);
  }else{
    const {data:requirements}=await api.get('/requirements',{params:{client_id:cid}});
    expect(requirements.filter(item=>item.baseline_response==='applies')).toHaveLength(0);
  }
  return cid;
}

test.each(cases)('%s raw Demo Vendor saves follow the native lifecycle and preserve retained records',async(label,key,group)=>{
  const cid=await enroll(label,key,group);
  const artifact={assurance_id:'synthetic-retained-document',type:'SOC 2',review_status:'requested',evidence_ids:[],history:[]};
  const {data:created}=await api.post('/vendors',{client_id:cid,name:'SYNTHETIC scoped provider',
    service:'SYNTHETIC managed CRM service',criticality:'medium',status:'onboarding',
    next_review:'2027-01-15',contract_renewal:'2027-06-30',assurance_records:[artifact]});
  const path='/vendors/'+created.vendor_id;
  const read=async()=>(await api.get(path)).data;
  const update=async patch=>{const current=await read();return (await api.patch(path,{...patch,expected_updated_at:current.updated_at??null})).data;};
  const original=await read();
  const originalReviews=(await api.get('/reviews',{params:{client_id:cid}})).data.filter(review=>review.vendor_id===created.vendor_id);
  const deniedBefore=sessionStorage.getItem(STORE_KEY);
  await expect(update({status:'active'})).rejects.toThrow(/next Vendor lifecycle/);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(deniedBefore);
  expect(await read()).toEqual(original);
  for(const status of ['under_review','active','under_review']){
    expect((await update({status})).status).toBe(status);
    const edited=await update({notes:'SYNTHETIC retained '+status+' business context'});
    expect(edited.status).toBe(status);
    expect(edited.assurance_records).toEqual(original.assurance_records);
    expect(edited.contract_renewal).toBe(original.contract_renewal);
  }
  const reviews=(await api.get('/reviews',{params:{client_id:cid}})).data.filter(review=>review.vendor_id===created.vendor_id);
  expect(reviews).toEqual(originalReviews);
  if(group){
    for(const invalid of [{contact_email:'invalid-address'},{contract_notice_deadline:'2026-02-30'}]){
      const before=sessionStorage.getItem(STORE_KEY);
      await expect(update(invalid)).rejects.toThrow(/valid/);
      expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
    }
  }
  for(const status of ['offboarding','inactive'])expect((await update({status})).status).toBe(status);
  const historical=await read(),before=sessionStorage.getItem(STORE_KEY);
  await expect(update({status:'active'})).rejects.toThrow(/historical/);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(historical.assurance_records).toEqual(original.assurance_records);
});
