import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {aiRequest} from './aiGovernance';
import {readStore,saveStore} from './store';

const api=axios.create({adapter:previewAdapter});
let clientId;
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();
  await api.post('/demo/enter');
  clientId=(await api.post('/clients',{name:'Synthetic catalog identity QA'})).data.client_id;
});

test.each([
  ['vendors','vendor_id','iventure-solutions'],
  ['ai_systems','ai_system_id','chatgpt'],
])('%s native create/save/storage reload preserves selected identity through rename',async(kind,idField,key)=>{
  const created=(await api.post('/'+kind,{client_id:clientId,name:'Synthetic catalog selection',catalog_key:key,...(kind==='vendors'?{service:'Synthetic service'}:{})})).data;
  expect(created.catalog_key).toBe(key);
  const path=`/${kind}/${created[idField]}`;
  await api.patch(path,{name:'Renamed custom display name',expected_updated_at:created.updated_at});
  // New adapter calls reload the serialized Demo store; no component selection state remains.
  const loaded=(await api.get('/'+kind,{params:{client_id:clientId}})).data.find(row=>row[idField]===created[idField]);
  expect(loaded).toMatchObject({[idField]:created[idField],name:'Renamed custom display name',catalog_key:key});
  expect(readStore()[kind].find(row=>row[idField]===created[idField]).catalog_key).toBe(key);
  expect((await api.get('/risks',{params:{client_id:clientId}})).data).toHaveLength(0);
  expect((await api.get('/reviews',{params:{client_id:clientId}})).data).toHaveLength(0);
});

test.each([
  ['vendors','vendor_id','salesforce','chatgpt','iVenture Solutions'],
  ['ai_systems','ai_system_id','chatgpt','iventure-solutions','ChatGPT'],
])('%s rejects unknown, markup and other-module identities without changing saved records',async(kind,idField,key,foreign,name)=>{
  const created=(await api.post('/'+kind,{client_id:clientId,name,catalog_key:key,...(kind==='vendors'?{service:'Synthetic service'}:{})})).data;
  const path=`/${kind}/${created[idField]}`;
  const before=readStore()[kind].find(row=>row[idField]===created[idField]);
  for(const bad of [foreign,'CHATGPT','chatgpt ','https://example.test/logo.svg','<svg/>',{},[],true,12,'']){
    await expect(api.patch(path,{catalog_key:bad,expected_updated_at:created.updated_at})).rejects.toThrow(/Invalid catalog key/);
  }
  expect(readStore()[kind].find(row=>row[idField]===created[idField])).toEqual(before);
  await expect(api.post('/'+kind,{client_id:clientId,name:'Invalid create',catalog_key:foreign,...(kind==='vendors'?{service:'Synthetic service'}:{})})).rejects.toThrow(/Invalid catalog key/);
  const custom=(await api.post('/'+kind,{client_id:clientId,name,...(kind==='vendors'?{service:'Synthetic service'}:{})})).data;
  expect(custom.catalog_key).toBeNull();
});

test('Vendor bulk validation also rejects AI catalog identity without persisting the patch',async()=>{
  const vendor=(await api.post('/vendors',{client_id:clientId,name:'Synthetic vendor',service:'Synthetic service',catalog_key:'salesforce'})).data;
  await expect(api.post('/bulk',{kind:'vendors',ids:[vendor.vendor_id],action:'update',payload:{catalog_key:'chatgpt'}})).rejects.toThrow(/Invalid catalog key/);
  expect(readStore().vendors.find(row=>row.vendor_id===vendor.vendor_id).catalog_key).toBe('salesforce');
});

test('distinct AI product keys persist and decoration alone preserves native approval and screening',()=>{
  // Keep this fixture isolated from real records while exercising the native AI command handler.
  const db=readStore();
  const rows=['m365','cstudio','ghcopilot'].map(catalog_key=>aiRequest(db,'/ai_systems','post',{},
    {client_id:clientId,name:'Synthetic Microsoft product',provider:'Microsoft',catalog_key}));
  expect(rows.map(row=>row.catalog_key)).toEqual(['m365','cstudio','ghcopilot']);
  saveStore(db);
  expect(readStore().ai_systems.filter(row=>row.client_id===clientId).map(row=>row.catalog_key)).toEqual(['m365','cstudio','ghcopilot']);
  const cid='demo_brawndo';
  let row=aiRequest(db,'/ai_systems','post',{}, {client_id:cid,name:'Synthetic approved AI',description:'Public drafting',environment:'QA',permitted_data_types:['Public']});
  row=aiRequest(db,`/ai_systems/${row.ai_system_id}/approval`,'post',{}, {status:'approved',note:'Synthetic approval',expected_updated_at:row.updated_at});
  const before={approval_history:row.approval_history,risk_tier:row.risk_tier,screening_complete:row.screening_complete};
  const decorated=aiRequest(db,`/ai_systems/${row.ai_system_id}`,'patch',{}, {catalog_key:'chatgpt',expected_updated_at:row.updated_at});
  expect(decorated).toMatchObject({...before,approval_status:'approved',catalog_key:'chatgpt'});
  expect(decorated.approval_history[0].scope).not.toHaveProperty('catalog_key');
});
