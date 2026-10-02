import axios from 'axios';
import {previewAdapter} from './adapter';
import {normalizeRecordWrite} from '../lib/recordContracts';
import {readStore,saveStore} from './store';
import scenarios from '@catalogs/../contracts/record-aliases.json';

const api=axios.create({adapter:previewAdapter});
test.each(scenarios)('shared alias matrix: $name',row=>{
  if(row.error)expect(()=>normalizeRecordWrite(row.kind,row.body)).toThrow('Conflicting values');
  else expect(normalizeRecordWrite(row.kind,row.body,row.existing)).toEqual(row.expected);
});
test('Demo canonicalizes legacy Vendor writes and rejects contradictory values',async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  const client=(await api.post('/clients',{name:'Alias contract'})).data;
  const vendor=(await api.post('/vendors',{client_id:client.client_id,name:'Retained integration',services:'CRM',contract_end:'2028-02-29'})).data;
  expect(vendor).toMatchObject({service:'CRM',contract_expiration:'2028-02-29'});
  await expect(api.patch(`/vendors/${vendor.vendor_id}`,{expected_updated_at:vendor.updated_at,services:'Other',service:'CRM'})).rejects.toMatchObject({response:{status:422}});
  expect((await api.get(`/vendors/${vendor.vendor_id}`)).data.service).toBe('CRM');
  const db=readStore();
  Object.assign(db.vendors.find(row=>row.vendor_id===vendor.vendor_id),{contract_end:'2028-02-29',contract_expiration:null});
  saveStore(db);
  const cleared=(await api.patch(`/vendors/${vendor.vendor_id}`,{expected_updated_at:vendor.updated_at,contract_expiration:null})).data;
  expect(cleared.contract_expiration).toBeNull();
  expect(readStore().vendors.find(row=>row.vendor_id===vendor.vendor_id).contract_end).toBeNull();
});
