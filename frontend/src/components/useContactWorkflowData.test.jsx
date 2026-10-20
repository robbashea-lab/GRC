import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import useContactWorkflowData from './useContactWorkflowData';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:error=>error.message}));
const user={user_id:'admin',role:'super_admin'};
let root,container,requests;
function Probe({clientId='a',actor=user}){
  const data=useContactWorkflowData({enabled:true,user:actor,clientId,contact:{contact_id:`contact-${clientId}`,linked_user_id:`account-${clientId}`},revision:0});
  return <div>{data.status}:{data.account?.name}:{data.owns?.total}:{data.error}</div>;
}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);requests=[];api.get.mockImplementation((path,options)=>new Promise(resolve=>requests.push({path,options,resolve})));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const fulfill=async(clientId,name)=>act(async()=>{
  for(const request of requests.filter(item=>!item.done)){
    request.done=true;
    request.resolve({data:request.path.startsWith('/clients/')?{client_id:clientId}:request.path==='/users'?[{user_id:`account-${clientId}`,name}]:request.path.includes('open_assignments')?{total:0,items:[]}:[]});
  }
});
test('switching clients immediately hides prior account context and ignores late old responses',async()=>{
  await act(async()=>root.render(<Probe/>));const old=requests.slice();
  await act(async()=>root.render(<Probe clientId="b"/>));expect(container.textContent).toBe('loading:::');
  await act(async()=>{for(const request of old){request.done=true;request.resolve({data:request.path.startsWith('/clients/')?{client_id:'a'}:request.path==='/users'?[{user_id:'account-a',name:'Earlier account'}]:request.path.includes('open_assignments')?{total:0,items:[]}:[]});}});
  expect(container.textContent).not.toContain('Earlier account');await fulfill('b','Current account');expect(container.textContent).toContain('ready:Current account:0');
});
test('a mismatched response is an error, never an empty verified ownership state',async()=>{
  await act(async()=>root.render(<Probe/>));await fulfill('other','Wrong account');expect(container.textContent).toContain('error:::Contact context could not be verified');
});
test('client readers do not request admin-only user or ownership endpoints',async()=>{
  await act(async()=>root.render(<Probe actor={{user_id:'reader',role:'client_readonly'}}/>));
  expect(requests.map(request=>request.path)).toEqual(['/clients/a','/contacts/contact-a/activity']);
  await fulfill('a','');expect(container.textContent).toBe('ready:::');
});
