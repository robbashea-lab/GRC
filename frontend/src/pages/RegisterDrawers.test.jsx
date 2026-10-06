import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister from './RiskRegister';
import VendorRegister from './VendorRegister';
import api from '@/lib/api';
import {ClientPresentationContext} from '@/components/ClientSurface';
jest.mock('@/context/OrgContext', () => ({useOrg:() => ({currentClientId:'a',currentClient:{name:'Client A'}})}));
jest.mock('@/context/AuthContext', () => ({useAuth:() => ({user:{user_id:'owner',name:'Owner',role:'super_admin'}})}));
jest.mock('@/lib/api', () => ({__esModule:true, default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom', () => ({useSearchParams:()=>[new URLSearchParams(),jest.fn()],Link:({children,to}) => <a href={to}>{children}</a>}), {virtual:true});
let root, container;
const requestOptions = {headers:{'Idempotency-Key':expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)}};
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container);
  api.get.mockImplementation(async path => ({data:path==='/users'?[{user_id:'owner',name:'Owner'}]:path==='/risks'?[{risk_id:'r',client_id:'a',title:'Risk record',status:'open',owner_id:'owner'}]:path==='/vendors'?[{vendor_id:'v',client_id:'a',name:'Vendor record',service:'Hosted business application',status:'active',criticality:'high',contact_email:'contact@example.test'}]:path==='/related'?{}:[]}));
  api.patch.mockResolvedValue({data:{}});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('default client dialog retains native Risk fields and save contract',async()=>{
  await act(async()=>root.render(<ClientPresentationContext.Provider value="Client A"><RiskRegister/></ClientPresentationContext.Provider>));
  await act(async()=>container.querySelector('[data-testid="risk-row-0"]').click());
  const dialog=document.querySelector('[data-testid="risks-drawer"]');
  expect(dialog.className).toContain('brawndo-cis-assessment');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  for(const name of ['title','status','owner_id','description'])expect(dialog.querySelector(`[data-testid="field-${name}"]`)).not.toBeNull();
  expect(dialog.querySelector('[aria-label="Risk category"]')).not.toBeNull();
  await act(async()=>{
    const title=dialog.querySelector('[data-testid="field-title"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Updated Risk');
    title.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async()=>dialog.querySelector('[data-testid="drawer-save"]').click());
  expect(api.patch).toHaveBeenCalledWith('/risks/r',{title:'Updated Risk',expected_updated_at:null},requestOptions);
});

test('new Risk requires intentional ratings instead of suggesting an assessment',async()=>{
  await act(async()=>root.render(<RiskRegister/>));
  await act(async()=>container.querySelector('[data-testid="new-risk"]').click());
  expect(document.querySelector('[data-testid="new-risk-level"]').textContent).toBe('Needs assessment');
  expect(document.querySelector('[data-testid="new-risk-likelihood"]').textContent).toBe('Select likelihood…');
  expect(document.querySelector('[data-testid="new-risk-impact"]').textContent).toBe('Select impact…');
  expect(document.querySelector('[aria-label="Risk category"]').textContent).toBe('Cybersecurity');
});

test('legacy Risk category is displayed without silently changing its stored value',async()=>{
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,...args)=>path==='/risks'?{data:[{risk_id:'r',client_id:'a',title:'Legacy Risk',category:'Cybersecurity',status:'assessed'}]}:original(path,...args));
  await act(async()=>root.render(<RiskRegister/>));
  await act(async()=>container.querySelector('[data-testid="risk-row-0"]').click());
  expect(document.querySelector('[aria-label="Risk category"]').textContent).toBe('Cybersecurity (recorded)');
  await act(async()=>document.querySelector('[data-testid="drawer-save"]').click());
  expect(api.patch).toHaveBeenCalledWith('/risks/r',expect.not.objectContaining({category:expect.anything()}),requestOptions);
});

test.each([[RiskRegister,'risk-row-0',['title','category','status','owner_id','description']], [VendorRegister,'vendor-row-0',['name','criticality','status','contact_email']]])('register opens its complete real drawer', async(Component,rowId,fields)=>{
  await act(async()=>root.render(<Component/>));
  const row=container.querySelector(`[data-testid="${rowId}"]`);
  expect(row).not.toBeNull();
  await act(async()=>row.click());
  for(const field of fields) expect(document.querySelector(Component===RiskRegister&&field==='category'?'[aria-label="Risk category"]':`[data-testid="field-${field}"]`)).not.toBeNull();
  await act(async()=>document.querySelector('[data-testid="drawer-save"]').click());
  expect(api.patch).toHaveBeenCalledWith(Component===RiskRegister?'/risks/r':'/vendors/v',expect.not.objectContaining({client_id:undefined}),requestOptions);
});
