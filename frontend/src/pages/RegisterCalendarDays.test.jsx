import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'admin',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'c',currentClient:{name:'Test client'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/policies',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>[new URLSearchParams(),jest.fn()]}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>()=>null);
// A viewer in America/Chicago is simulated for date formatting that names no timeZone (see managementDates.test.js).
const format=Date.prototype.toLocaleDateString;
const literal=(y,m,d)=>format.call(new Date(Date.UTC(y,m-1,d)),undefined,{timeZone:'UTC'});
let root,container;
beforeEach(()=>{
  jest.spyOn(Date.prototype,'toLocaleDateString').mockImplementation(function(locales,options){return format.call(this,locales,{timeZone:'America/Chicago',...options});});
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async path=>({data:path==='/policies'?[{policy_id:'p1',client_id:'c',title:'Risk Management Policy',presence:'verified_existing',status:'approved',last_reviewed_at:'2035-10-29',next_review_date:'2036-10-28'}]:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test('the Policies register shows the recorded review day in a US timezone',async()=>{
  await act(async()=>root.render(<RecordListPage kind="policies"/>));
  const row=container.querySelector('tr[data-testid="policies-row-0"]').textContent;
  expect(row).toContain(literal(2035,10,29));
  expect(row).not.toContain(literal(2035,10,28));
});
