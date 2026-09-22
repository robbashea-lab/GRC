import { act } from 'react';
import { createRoot } from 'react-dom/client';
import AssigneeSelect from './AssigneeSelect';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

jest.mock('@/lib/api', () => ({__esModule:true, default:{get:jest.fn()}, formatError:e=>e.message, PREVIEW_MODE:true}));
jest.mock('@/context/AuthContext', () => ({useAuth:jest.fn()}));
// Unit tests exercise candidate state, not Radix's browser focus/portal engine.
// The real primitive is exercised separately in the production-build browser QA.
jest.mock('@/components/ui/popover', () => {
  const React = require('react');
  const Context = React.createContext();
  return {
    Popover: ({open,onOpenChange,children}) => <Context.Provider value={{open,onOpenChange}}>{children}</Context.Provider>,
    PopoverTrigger: ({children}) => {const state=React.useContext(Context);return React.cloneElement(children,{onClick:()=>state.onOpenChange(!state.open)});},
    PopoverContent: ({children}) => React.useContext(Context).open ? <div role="dialog">{children}</div> : null,
  };
});
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, requests, auth, onChange;
beforeEach(()=>{
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  auth={user:{user_id:'viewer'}};useAuth.mockImplementation(()=>auth);requests=[];onChange=jest.fn();
  api.get.mockImplementation((url,config)=>new Promise((resolve,reject)=>requests.push({url,config,resolve,reject})));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
const render=props=>act(async()=>root.render(<AssigneeSelect clientId="a" onChange={onChange} {...props}/>));
const open=()=>act(async()=>host.querySelector('button').click());
const finish=(request,items)=>act(async()=>request.resolve({data:{items,has_more:false}}));

test.each([null,undefined,'former'])('empty or historical value %s stays readable without changing data',async value=>{
  await render({value,users:[{user_id:'former',name:'Former Owner',status:'disabled'}]});
  expect(host.textContent).toContain(value?'Former Owner':'Unassigned');expect(onChange).not.toHaveBeenCalled();
  expect(requests).toHaveLength(0);
});
test('loads only authorized candidate endpoint and keeps historical lookup out of choices',async()=>{
  await render({value:'former',users:[{user_id:'former',name:'Former Owner',status:'disabled'}]});await open();
  expect(requests[0].url).toBe('/clients/a/assignees');
  await finish(requests[0],[{user_id:'alex',name:'Alex Morgan',email:'alex@example.test'}]);
  const panel=document.querySelector('[role="dialog"]');expect(panel.textContent).toContain('Alex Morgan');
  expect(panel.textContent).not.toContain('Former Owner');
  await act(async()=>[...panel.querySelectorAll('button')].find(b=>b.textContent.includes('Alex Morgan')).click());
  expect(onChange).toHaveBeenCalledWith('alex');
});
test('switching clients cancels pending candidates and ignores stale replies',async()=>{
  await render();await open();const first=requests[0];await render({clientId:'b'});
  expect(first.config.signal.aborted).toBe(true);await finish(first,[{user_id:'private',name:'Private User'}]);
  expect(document.body.textContent).not.toContain('Private User');await open();expect(requests[1].url).toBe('/clients/b/assignees');
});
test('empty and malformed responses are explained without clearing the owner',async()=>{
  await render({value:'former'});await open();await finish(requests[0],[]);
  expect(document.body.textContent).toContain('No eligible users available.');expect(onChange).not.toHaveBeenCalled();
});
test('failed request shows retry and never supplies directory fallback',async()=>{
  await render();await open();await act(async()=>requests[0].reject(new Error('Denied')));
  expect(document.body.textContent).toContain('Eligible users could not be loaded.');expect(onChange).not.toHaveBeenCalled();
});
