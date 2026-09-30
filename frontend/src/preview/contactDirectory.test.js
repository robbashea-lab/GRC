import axios from 'axios';
import {previewAdapter} from './adapter';
import {directoryAccess} from '@/lib/contactDirectory';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
test('contact-only creation, later invitation, duplicate prevention, edit/archive preserve links and legacy data',async()=>{
  let row=(await api.post('/contacts',{client_id:cid,name:'Synthetic Contact',email:'directory@example.test',status:'active',role:'Retained role',grc_roles:['Retained responsibility'],notes:'Historical note'})).data;
  const state=async r=>directoryAccess(r,cid,{clientId:cid,status:'ready',members:(await api.get(`/clients/${cid}/contact-accounts`)).data});
  expect((await state(row)).key).toBe('none');
  const invited=(await api.post(`/contacts/${row.contact_id}/invite`,{role:'client_readonly',client_id:cid,confirmed:true})).data;
  expect(invited.simulated).toBe(true);row=(await api.get(`/contacts/${row.contact_id}`)).data;expect((await state(row)).key).toBe('pending');
  await expect(api.post(`/contacts/${row.contact_id}/invite`,{role:'client_readonly',client_id:cid,confirmed:true})).rejects.toThrow(/already linked/);
  await api.patch(`/users/${invited.user.user_id}`,{status:'disabled'});expect((await state(row)).key).toBe('disabled');
  row=(await api.patch(`/contacts/${row.contact_id}`,{title:'Updated job',status:'inactive',expected_updated_at:row.updated_at})).data;
  const loaded=(await api.get(`/contacts/${row.contact_id}`)).data;expect(loaded).toMatchObject({linked_user_id:invited.user.user_id,role:'Retained role',grc_roles:['Retained responsibility'],notes:'Historical note',status:'inactive',title:'Updated job'});
  expect((await api.get('/users')).data.filter(u=>u.email==='directory@example.test')).toHaveLength(1);
});
