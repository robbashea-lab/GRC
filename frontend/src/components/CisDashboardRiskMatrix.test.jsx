import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation} from 'react-router-dom';
import api from '@/lib/api';
import CisDashboardRiskMatrix,{dashboardActiveRisks} from './CisDashboardRiskMatrix';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.response?.data?.detail||error.message}));
const risk=(id,overrides={})=>({risk_id:id,display_id:`RISK-${id}`,client_id:'client-a',title:`Risk ${id}`,status:'assessed',likelihood_score:2,impact_score:3,...overrides});
let host,root,props,originalObserver;
function Location(){const location=useLocation();return <output data-testid="route">{location.pathname}{location.search}</output>;}
async function render(next={}){props={...props,...next};await act(async()=>root.render(<MemoryRouter><CisDashboardRiskMatrix {...props}/><Location/></MemoryRouter>));}
const route=()=>host.querySelector('output').textContent;
const cell=(l=2,i=3)=>host.querySelector(`[aria-label^="Likelihood ${l}, impact ${i},"]`);
const dialog=()=>document.querySelector('[role="dialog"]');
const rowButton=title=>[...dialog().querySelectorAll('button')].find(button=>button.textContent.includes(title));
async function click(button){await act(async()=>button.click());}
beforeEach(()=>{
  jest.clearAllMocks();global.IS_REACT_ACT_ENVIRONMENT=true;
  originalObserver=global.ResizeObserver;
  global.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  props={clientId:'client-a',contextKey:'standard:u1:cis-ig1',refreshToken:0};
  api.get.mockResolvedValue({data:[]});
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();global.ResizeObserver=originalObserver;
  for(const verb of ['post','put','patch','delete'])expect(api[verb]).not.toHaveBeenCalled();
});

test('uses native active inclusion and current assessed model, retaining unrated records without mutation',()=>{
  const rows=[risk('2',{risk_score:25,risk_level:'critical'}),risk('1'),risk('unrated',{likelihood_score:null}),risk('closed',{status:'closed'}),risk('retired',{status:'retired'}),risk('accepted',{status:'accepted',acceptance_expires_at:'2020-01-01'})];
  const before=JSON.stringify(rows),active=dashboardActiveRisks(rows,'client-a');
  expect(active.map(row=>row.risk_id)).toEqual(['1','2','accepted','unrated']);
  expect(active.find(row=>row.risk_id==='2')).toMatchObject({risk_score:6,risk_level:'moderate'});
  expect(active.find(row=>row.risk_id==='unrated').risk_score).toBeNull();
  expect(JSON.stringify(rows)).toBe(before);
  expect(()=>dashboardActiveRisks([risk('foreign',{client_id:'other'})],'client-a')).toThrow('unavailable for this client');
  expect(()=>dashboardActiveRisks(null,'client-a')).toThrow('unavailable for this client');
  expect(dashboardActiveRisks(Array.from({length:1000},(_,index)=>risk(String(index))),'client-a')).toHaveLength(1000);
  expect(()=>dashboardActiveRisks(Array.from({length:1001},(_,index)=>risk(String(index))),'client-a')).toThrow('exceeds its supported limit');
});

test('all client risks load without CIS narrowing; equal-score tuples stay distinct and native score stays prominent',async()=>{
  api.get.mockResolvedValue({data:[risk('1'),risk('2'),risk('3',{likelihood_score:3,impact_score:2}),risk('4',{likelihood_score:null}),risk('closed',{status:'closed'})]});
  await render();
  expect(api.get.mock.calls[0][1].params).toEqual({client_id:'client-a'});
  expect(host.querySelectorAll('.bdr-cell')).toHaveLength(25);
  const grid=host.querySelector('.bdr-matrix');
  expect([...grid.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim())).toHaveLength(0);
  expect([...host.querySelectorAll('.bdr-matrix-y span')].map(node=>node.textContent)).toEqual(['5','4','3','2','1']);
  expect([...host.querySelectorAll('.bdr-matrix-x span')].map(node=>node.textContent)).toEqual(['1','2','3','4','5']);
  expect(cell().querySelector('strong').textContent).toBe('6');
  expect(cell().querySelector('small').textContent).toBe('2 risks');
  expect(cell(3,2).querySelector('small').textContent).toBe('1 risk');
  expect(cell(5,5).textContent).toBe('25');expect(cell(5,5).disabled).toBe(true);
  expect(host.textContent).toContain('4 risks · 1 unrated');
  await act(async()=>cell().focus());
  expect(document.querySelector('[role="tooltip"]').textContent).toContain('RISK-1 · Risk 1');
  expect(document.querySelector('[role="tooltip"]').textContent).not.toContain('RISK-3 · Risk 3');
});

test('even a single risk opens the selection first, then fresh exact native ID navigation',async()=>{
  const record=risk('id /?');api.get.mockImplementation(url=>Promise.resolve({data:url==='/risks'?[record]:record}));
  await render();await click(cell());
  expect(dialog()).not.toBeNull();expect(dialog().textContent).toContain('1 risk in this cell.');
  expect(api.get).toHaveBeenCalledTimes(1);expect(route()).toBe('/');
  await click(rowButton(record.title));
  expect(api.get.mock.calls[1][0]).toBe('/risks/id%20%2F%3F');
  expect(api.get.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  expect(route()).toBe('/risks?id=id%20%2F%3F&client_id=client-a');
  expect(dialog()).toBeNull();
});

test('multi-risk popup uses stable native identifying information and current score',async()=>{
  api.get.mockResolvedValue({data:[risk('10'),risk('2')]});await render();await click(cell());
  const choices=[...dialog().querySelectorAll('.cis-dashboard-risk-list button')];
  expect(choices.map(button=>button.querySelector('b').textContent)).toEqual(['RISK-2','RISK-10']);
  for(const choice of choices){expect(choice.textContent).toContain('Score 6');expect(choice.textContent).toContain('L2 × I3');}
});

test.each([
  ['changed tuple',()=>Promise.resolve({data:risk('1',{likelihood_score:3,impact_score:2})}),'This risk has changed'],
  ['closed record',()=>Promise.resolve({data:risk('1',{status:'closed'})}),'This risk has changed'],
  ['different client',()=>Promise.resolve({data:risk('1',{client_id:'other'})}),'unavailable for the selected client'],
  ['different identity',()=>Promise.resolve({data:risk('2')}),'unavailable for the selected client'],
  ['denied',()=>Promise.reject({response:{status:403,data:{detail:'Permission denied'}}}),'Permission denied'],
  ['missing',()=>Promise.reject({response:{status:404,data:{detail:'Risk not found'}}}),'Risk not found'],
])('fresh %s cannot open a stale risk',async(_label,response,message)=>{
  api.get.mockImplementation(url=>url==='/risks'?Promise.resolve({data:[risk('1')]}):response());
  await render();await click(cell());await click(rowButton('Risk 1'));
  expect(route()).toBe('/');expect(dialog().querySelector('[role="alert"]').textContent).toContain(message);
});

test('scope change immediately hides old cells/dialog and discards late list or open responses',async()=>{
  let resolveList,resolveRecord;
  api.get.mockImplementation(url=>url==='/risks'?Promise.resolve({data:[risk('1')]}):new Promise(resolve=>{resolveRecord=resolve;}));
  await render();await click(cell());await click(rowButton('Risk 1'));
  const openSignal=api.get.mock.calls[1][1].signal;
  api.get.mockImplementation(()=>new Promise(resolve=>{resolveList=resolve;}));
  await render({clientId:'client-b',contextKey:'demo:u2:cis-ig2'});
  expect(openSignal.aborted).toBe(true);expect(dialog()).toBeNull();expect(cell().disabled).toBe(true);
  expect(host.textContent).toContain('Loading risks');
  await act(async()=>resolveRecord({data:risk('1')}));expect(route()).toBe('/');
  const listSignal=api.get.mock.calls[2][1].signal;
  api.get.mockResolvedValue({data:[]});await render({clientId:'client-c'});
  expect(listSignal.aborted).toBe(true);
  await act(async()=>resolveList({data:[risk('old',{client_id:'client-b'})]}));
  expect(host.textContent).toContain('0 risks · 0 unrated');expect(host.textContent).not.toContain('Risk old');
});

test('refresh reconciles a selection with its current cohort rather than retaining a moved record',async()=>{
  api.get.mockResolvedValue({data:[risk('1'),risk('2')]});await render();await click(cell());
  api.get.mockResolvedValue({data:[risk('1',{likelihood_score:3,impact_score:2}),risk('2',{status:'closed'})]});
  await render({refreshToken:1});
  expect(dialog().textContent).toContain('No active risks remain in this cell.');
  expect(dialog().querySelectorAll('.cis-dashboard-risk-list button')).toHaveLength(0);
  expect(cell(3,2).textContent).toBe('61 risk');
});

test('Escape returns focus to the connected cell; direct register link stays direct',async()=>{
  api.get.mockResolvedValue({data:[risk('1')]});await render();const trigger=cell();await click(trigger);
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  expect(dialog()).toBeNull();expect(document.activeElement).toBe(trigger);
  const link=host.querySelector('a');expect(link.getAttribute('href')).toBe('/risks');await click(link);
  expect(route()).toBe('/risks');expect(api.get).toHaveBeenCalledTimes(1);
});

test('opening and closing selection retains one controlled tooltip lifetime without state warnings',async()=>{
 const warning=jest.spyOn(console,'warn');
 try{
  api.get.mockResolvedValue({data:[risk('1')]});await render();await click(cell());
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(warning.mock.calls.some(args=>String(args[0]).includes('Tooltip is changing'))).toBe(false);
 }finally{warning.mockRestore();}
});

test('permission failure stays unavailable instead of displaying a false empty cohort, with safe retry',async()=>{
  api.get.mockRejectedValue({response:{status:403,data:{detail:'Permission denied'}}});await render();
  expect(host.querySelector('[role="alert"]').textContent).toContain('Permission denied');
  expect(host.textContent).not.toContain('0 risks · 0 unrated');expect(cell().getAttribute('aria-label')).toContain('count unavailable');
  api.get.mockResolvedValue({data:[risk('1')]});await click(host.querySelector('[role="alert"] button'));
  expect(cell().textContent).toBe('61 risk');expect(host.querySelector('[role="alert"]')).toBeNull();
});
