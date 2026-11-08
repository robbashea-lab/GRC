import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Reports from './Reports';
import api from '@/lib/api';

let mockOrg,mockUser;
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},PREVIEW_MODE:false,formatError:error=>error.response?.data?.detail||error.message}));
const cis={key:'cis-ig1',name:'CIS IG2',version:'8.1',scope:'Cumulative Implementation Group 2 · 130 safeguards'};
const soc={key:'soc-2',name:'SOC 2',version:'2017',scope:'Security, Availability'};
const iso={key:'iso-27001',name:'ISO/IEC 27001',version:'2022 + Amd 1:2024',scope:'Recorded ISMS scope'};
const pdf=()=>({data:new Blob(['%PDF-1.7\n'],{type:'application/pdf'}),headers:{'content-disposition':'attachment; filename="client-report.pdf"'}});
let root,node,downloads,click;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();
  mockOrg={currentClientId:'client-a',currentClient:{name:'Client A'}};
  mockUser={user_id:'viewer-a',role:'client_readonly'};
  require('@/lib/api').PREVIEW_MODE=false;api.get.mockReset();
  api.get.mockImplementation(async path=>path==='/reports/frameworks'?{data:{frameworks:[cis]}}:pdf());
  downloads=[];URL.createObjectURL=jest.fn(()=>'blob:framework-pdf');URL.revokeObjectURL=jest.fn();
  click=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(){downloads.push({href:this.href,filename:this.download});});
  node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();click.mockRestore();jest.runOnlyPendingTimers();jest.useRealTimers();});
const render=async()=>act(async()=>root.render(<Reports/>));
const submit=async()=>act(async()=>node.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
const change=async(id,value)=>act(async()=>{const select=node.querySelector(`#${id}`);Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,value);select.dispatchEvent(new Event('change',{bubbles:true}));});

test('one enabled program shows recorded scope without a redundant selector and downloads the default full six-month PDF',async()=>{
  await render();
  expect(node.querySelector('h1').textContent).toBe('Reports');
  expect(node.querySelector('[data-testid="report-framework"]').textContent).toBe('CIS IG2');
  expect(node.textContent).toContain(cis.scope);expect(node.textContent).toContain('Version 8.1');
  expect(node.querySelector('#reports-framework')).toBeNull();
  expect(node.querySelector('#reports-detail').value).toBe('full');expect(node.querySelector('#reports-trend').value).toBe('6m');
  await submit();
  expect(api.get).toHaveBeenLastCalledWith('/reports/framework',{params:{client_id:'client-a',framework_key:'cis-ig1',detail:'full',trend_period:'6m'},responseType:'blob',signal:expect.any(AbortSignal)});
  expect(downloads).toEqual([{href:'blob:framework-pdf',filename:'client-report.pdf'}]);
  expect(node.querySelector('[role="status"]').textContent).toBe('PDF download started.');
  act(()=>jest.advanceTimersByTime(1000));expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:framework-pdf');
});

test('only server-enabled frameworks are offered; labeled native selects submit executive and selected trend choices',async()=>{
  api.get.mockImplementation(async path=>path==='/reports/frameworks'?{data:{frameworks:[cis,soc,iso]}}:pdf());
  await render();
  expect([...node.querySelectorAll('#reports-framework option')].map(option=>option.textContent)).toEqual(['CIS IG2','SOC 2','ISO/IEC 27001']);
  for(const id of ['reports-framework','reports-detail','reports-trend'])expect(node.querySelector(`label[for="${id}"]`)).toBeTruthy();
  const select=node.querySelector('#reports-framework');select.focus();expect(document.activeElement).toBe(select);
  await change('reports-framework','soc-2');await change('reports-detail','executive');await change('reports-trend','30d');
  expect(node.textContent).toContain('Security, Availability');expect(node.textContent).not.toContain(cis.scope);
  await submit();expect(api.get.mock.calls.at(-1)[1].params).toEqual({client_id:'client-a',framework_key:'soc-2',detail:'executive',trend_period:'30d'});
  await change('reports-framework','iso-27001');await change('reports-trend','12m');await submit();
  expect(api.get.mock.calls.at(-1)[1].params.framework_key).toBe('iso-27001');expect(api.get.mock.calls.at(-1)[1].params.trend_period).toBe('12m');
});

test('loading, empty and failed options remain distinct; a denied read can be retried',async()=>{
  let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  await render();expect(node.querySelector('[role="status"]').textContent).toBe('Loading enabled frameworks…');expect(node.querySelector('form')).toBeNull();
  await act(async()=>finish({data:{frameworks:[]}}));
  expect(node.textContent).toContain('No supported framework is enabled for this client.');expect(node.querySelector('button[type="submit"]')).toBeNull();
  mockOrg={currentClientId:'client-b',currentClient:{name:'Client B'}};
  api.get.mockRejectedValueOnce({response:{status:403,data:{detail:'Forbidden for this client'}}});await render();
  expect(node.querySelector('[role="alert"]').textContent).toContain('Forbidden for this client');expect(node.querySelector('form')).toBeNull();
  await act(async()=>[...node.querySelectorAll('button')].find(button=>button.textContent.startsWith('Retry')).click());
  expect(node.querySelector('form')).toBeTruthy();expect(api.get.mock.calls.at(-1)[1].params.client_id).toBe('client-b');
});

test.each(['super_admin','platform_admin','client_grc_manager','client_contributor','client_readonly','client_viewer'])('existing recognized %s role reaches server-scoped report options',async role=>{
  mockUser={...mockUser,role};await render();expect(node.querySelector('form')).toBeTruthy();expect(api.get.mock.calls[0][1].params.client_id).toBe('client-a');
});

test('unknown role, no client and Explore Demo show meaningful unavailable states without export requests',async()=>{
  mockUser={...mockUser,role:'unknown'};await render();expect(node.querySelector('[role="alert"]').textContent).toBe('You do not have access to reports.');
  mockUser={...mockUser,role:'client_readonly',password_change_required:true};await render();expect(node.querySelector('form')).toBeNull();
  mockUser={...mockUser,role:'client_readonly',password_change_required:false};mockOrg={currentClientId:'',currentClient:null};await render();expect(node.textContent).toContain('Select a client');
  mockOrg={currentClientId:'demo_client',currentClient:{name:'Demo'}};require('@/lib/api').PREVIEW_MODE=true;await render();
  expect(node.textContent).toContain('PDF reports are unavailable in Explore Demo');expect(api.get).not.toHaveBeenCalled();
});

test('malformed enabled-program data fails visibly rather than offering unverifiable exports',async()=>{
  api.get.mockResolvedValueOnce({data:{frameworks:[{}]}});await render();
  expect(node.querySelector('[role="alert"]').textContent).toContain('Enabled frameworks could not be verified.');expect(node.querySelector('form')).toBeNull();
});

test('a pending old-client options request is cancelled and cannot become the new-client selection',async()=>{
  let oldOptions;api.get.mockImplementationOnce(()=>new Promise(resolve=>{oldOptions=resolve;}));
  await render();const signal=api.get.mock.calls[0][1].signal;
  mockOrg={currentClientId:'client-b',currentClient:{name:'Client B'}};
  api.get.mockResolvedValueOnce({data:{frameworks:[iso]}});await render();expect(signal.aborted).toBe(true);
  await act(async()=>oldOptions({data:{frameworks:[cis]}}));expect(node.textContent).toContain(iso.scope);expect(node.textContent).not.toContain(cis.scope);
});

test('switching clients cancels generation, resets choices and never downloads the old-client PDF',async()=>{
  await render();await change('reports-detail','executive');await change('reports-trend','12m');
  let oldReport;api.get.mockImplementationOnce(()=>new Promise(resolve=>{oldReport=resolve;}));await submit();
  const signal=api.get.mock.calls.at(-1)[1].signal;
  expect(node.querySelector('fieldset').disabled).toBe(true);expect(node.querySelector('button[type="submit"]').disabled).toBe(true);
  mockOrg={currentClientId:'client-b',currentClient:{name:'Client B'}};await render();
  expect(signal.aborted).toBe(true);expect(node.querySelector('#reports-detail').value).toBe('full');expect(node.querySelector('#reports-trend').value).toBe('6m');
  await act(async()=>oldReport(pdf()));expect(downloads).toEqual([]);
  await submit();expect(api.get.mock.calls.at(-1)[1].params.client_id).toBe('client-b');expect(downloads).toHaveLength(1);
});

test('losing report permission while a download is pending cancels it',async()=>{
  await render();let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await submit();
  const signal=api.get.mock.calls.at(-1)[1].signal;mockUser={...mockUser,role:'unknown'};await render();
  await act(async()=>finish(pdf()));expect(signal.aborted).toBe(true);expect(downloads).toEqual([]);expect(node.querySelector('form')).toBeNull();
});

test('duplicate submit events start only one generation request while the first is pending',async()=>{
  await render();let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  await act(async()=>{const form=node.querySelector('form');for(let i=0;i<2;i++)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(api.get.mock.calls.filter(([path])=>path==='/reports/framework')).toHaveLength(1);
  await act(async()=>finish(pdf()));expect(downloads).toHaveLength(1);
});

test('an authorization-membership change cancels a pending export even when the user and role stay the same',async()=>{
  mockUser={...mockUser,client_ids:['client-a']};await render();let finish;
  api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await submit();const signal=api.get.mock.calls.at(-1)[1].signal;
  mockUser={...mockUser,client_ids:['client-b']};await render();await act(async()=>finish(pdf()));
  expect(signal.aborted).toBe(true);expect(downloads).toEqual([]);
});

test('generation errors remain visible and retry creates a real PDF download',async()=>{
  await render();const errorBody=new Blob(['{"detail":"The assessment snapshot changed. Please retry."}'],{type:'application/json'});
  errorBody.text=async()=>' {"detail":"The assessment snapshot changed. Please retry."}';
  api.get.mockRejectedValueOnce({message:'Request failed with status code 409',response:{status:409,data:errorBody}});
  await submit();expect(node.querySelector('[role="alert"]').textContent).toBe('The assessment snapshot changed. Please retry.');expect(downloads).toEqual([]);
  expect(node.querySelector('button[type="submit"]').disabled).toBe(false);await submit();expect(downloads).toHaveLength(1);expect(node.querySelector('[role="alert"]')).toBeNull();
});

test('a non-PDF success response is reported as an error and never downloaded',async()=>{
  await render();api.get.mockResolvedValueOnce({data:new Blob(['{}'],{type:'application/json'}),headers:{}});await submit();
  expect(node.querySelector('[role="alert"]').textContent).toContain('did not return a PDF');expect(downloads).toEqual([]);
});
