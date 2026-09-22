import {act} from 'react';
import {createRoot} from 'react-dom/client';
import api from '@/lib/api';
import PolicyPendingDecisions from './PolicyPendingDecisions';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,requests,onOpen;
const rows=[];
const policy={policy_id:'p',client_id:'a',title:'Security policy',version:'3',summary:'Current authoritative content',status:'in_review'};
beforeEach(()=>{
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);requests=[];onOpen=jest.fn();
  api.get.mockImplementation((url,config)=>new Promise((resolve,reject)=>requests.push({url,config,resolve,reject})));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
const render=(clientId='a')=>act(async()=>root.render(<PolicyPendingDecisions clientId={clientId} rows={rows} onOpen={onOpen}/>));
const resolve=(r,data)=>act(async()=>r.resolve({data}));
async function open(){await render();await resolve(requests[0],[{policy_id:'p',title:'Security policy'}]);await act(async()=>host.querySelector('button').click());}

test('pending item outside loaded register opens a freshly authorized full Policy, never the summary',async()=>{
  await open();expect(onOpen).not.toHaveBeenCalled();expect(requests[1].url).toBe('/policies/p');
  expect(host.querySelector('button').disabled).toBe(true);await resolve(requests[1],policy);expect(onOpen).toHaveBeenCalledWith(policy);
});
test('failed retrieval leaves the pending list and an actionable error instead of opening partial content',async()=>{
  await open();await act(async()=>requests[1].reject(new Error('Access unavailable')));
  expect(onOpen).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]').textContent).toContain('Access unavailable');
  expect(host.querySelector('button').disabled).toBe(false);
  await act(async()=>host.querySelector('button').click());await resolve(requests[2],policy);expect(onOpen).toHaveBeenCalledWith(policy);
});
test('client switch aborts detail and prevents late old-client drawer opening',async()=>{
  await open();const detail=requests[1];await render('b');expect(detail.config.signal.aborted).toBe(true);
  await resolve(detail,policy);expect(onOpen).not.toHaveBeenCalled();expect(host.textContent).not.toContain('Security policy');
});
test('unexpected tenant or record response fails closed',async()=>{
  await open();await resolve(requests[1],{...policy,client_id:'b'});expect(onOpen).not.toHaveBeenCalled();
  expect(host.querySelector('[role=alert]').textContent).toContain('unavailable');
});
