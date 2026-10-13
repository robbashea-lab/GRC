import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ClientDirectory from './ClientDirectory';
import api from '@/lib/api';

const mockNavigate=jest.fn(),mockSwitch=jest.fn();
jest.mock('react-router-dom',()=>({useNavigate:()=>mockNavigate,Link:({children})=>children}),{virtual:true});
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({switchClient:mockSwitch,refresh:jest.fn()})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'u',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:e=>e.message}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=jest.fn();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);jest.clearAllMocks();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const row=(id,frameworks,extra={})=>({client_id:id,name:id,client_status:'active',frameworks,significant_risks:2,...extra});

test('compact reporting uses the filtered cohort and preserves the native register and source routes',async()=>{
  api.get.mockImplementation(async(path,{params}={})=>({data:path==='/clients/directory'?{clients:[row('Alpha',[{key:'cis-ig1',label:'CIS IG1',to:'/compliance/cis-ig1'}],{open_actions:91,due_30d:82,last_activity:{at:'2026-10-12T12:00:00Z',label:'Completed review'}}),
    row('Beta',[{key:'cis-ig1',label:'CIS IG2'},{key:'soc-2',label:'SOC 2'}])]}:{total_clients:params.client_ids==='Alpha'?1:2,frameworks:params.client_ids==='Alpha'?[{key:'cis-ig1'}]:[{key:'cis-ig1'},{key:'cis-ig2'},{key:'soc-2'}],programs:[],recent_changes_count:params.client_ids==='Alpha'?1:5}}));
  await act(async()=>root.render(<ClientDirectory/>));
  const metrics=()=>Object.fromEntries([...container.querySelectorAll('.gp-metric')].filter(m=>m.querySelector('.gp-metric-value')).map(m=>[m.querySelector('.gp-metric-label').textContent,m.querySelector('.gp-metric-value').firstChild.textContent]));
  expect(metrics()).toEqual({'Total clients':'2','Active frameworks':'3','Recent changes':'5'});
  expect(container.querySelectorAll('.gp-metric')).toHaveLength(4);
  expect(container.textContent).toContain('Framework progress');
  expect(container.querySelector('.gp-hero')).toBeNull();
  expect(container.querySelector('[data-testid="portfolio-tiles"]')).toBeNull();
  expect([...container.querySelectorAll('.portfolio-table thead th')].map(n=>n.textContent.replace(/\s+/g,' ').trim())).toEqual(['Client','GRC Lead','Frameworks','Open Work','Priority Risks','Last Activity','Actions']);
  expect(container.querySelector('[data-client-id="Alpha"] [data-metric="significant_risks"]').textContent).toBe('2');
  const input=container.querySelector('[data-testid="client-directory-search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Alpha');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(metrics()['Total clients']).toBe('1');
  expect(metrics()['Recent changes']).toBe('1');
  expect(api.get).toHaveBeenCalledWith('/portfolio/reporting/overview',expect.objectContaining({params:expect.objectContaining({client_ids:'Alpha'})}));
  await act(async()=>container.querySelector('button[aria-label="Open Portal for Alpha"]').click());
  expect(mockSwitch).toHaveBeenCalledWith('Alpha');expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  await act(async()=>container.querySelector('button[aria-label="Open CIS IG1 for Alpha"]').click());
  expect(mockNavigate).toHaveBeenLastCalledWith('/compliance/cis-ig1');
  for(const method of ['post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('directory failures remain retryable without fabricated zero totals',async()=>{
  api.get.mockRejectedValue(new Error('Directory unavailable'));
  await act(async()=>root.render(<ClientDirectory/>));
  expect(container.querySelector('[role="alert"]').textContent).toContain('Directory unavailable');
  expect([...container.querySelectorAll('.gp-metric-value')].every(dd=>dd.firstChild.textContent==='—')).toBe(true);
  api.get.mockResolvedValue({data:{clients:[]}});
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Retry').click());
  expect(container.querySelector('.gp-metric-value').firstChild.textContent).toBe('0');
  expect(container.textContent).toContain('No clients are currently available to you.');
});
