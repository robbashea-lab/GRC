import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore} from './store';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const cal=async(client=cid)=>(await api.get('/calendar',{params:{client_id:client,start:'2026-10-01',end:'2027-09-30',scope:'active'}})).data;
const vendorEvents=data=>Object.values(data.vendor_dates||{}).flat();
test('Brawndo Calendar projects vendor dates from the Vendor record and follows its edits',async()=>{
  const vendor=readStore().vendors.find(v=>v.client_id===cid&&v.status!=='inactive');
  await api.patch('/vendors/'+vendor.vendor_id,{contract_renewal:'2027-04-15',contract_notice_deadline:'2027-01-15'});
  let events=vendorEvents(await cal()).filter(e=>e.vendor_id===vendor.vendor_id);
  expect(events.filter(e=>e.kind==='vendor_contract_renewal').map(e=>e.due_date_iso)).toEqual(['2027-04-15']);
  expect(events.filter(e=>e.kind==='vendor_contract_notice').map(e=>e.due_date_iso)).toEqual(['2027-01-15']);
  await api.patch('/vendors/'+vendor.vendor_id,{contract_notice_deadline:'2027-02-01'});
  events=vendorEvents(await cal()).filter(e=>e.vendor_id===vendor.vendor_id);
  expect(events.filter(e=>e.kind==='vendor_contract_notice').map(e=>e.due_date_iso)).toEqual(['2027-02-01']);
  const all=vendorEvents(await cal());expect(new Set(all.map(e=>e.key)).size).toBe(all.length);
  expect(readStore().reviews.filter(r=>r.vendor_id===vendor.vendor_id&&r.vendor_purpose==='contract')).toHaveLength(0);
});
test('other clients get no vendor-date bucket',async()=>{
  const other=readStore().clients.find(c=>c.client_id!==cid).client_id;
  expect((await cal(other)).vendor_dates).toBeUndefined();
});
