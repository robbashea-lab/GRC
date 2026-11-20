import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AssigneeSelect from './AssigneeSelect';
import api, * as apiModule from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

jest.mock('@/lib/api', () => ({__esModule:true, default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),put:jest.fn(),delete:jest.fn()}, formatError:e=>e.message, PREVIEW_MODE:true}));
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

test('assessment presentation can omit guidance without changing eligible assignment',async()=>{
  await render({showGuidance:false});
  expect(host.textContent).not.toContain('Only active platform users');
  expect(host.querySelector('a[href="/contacts?client_id=a"]')).toBeNull();
  expect(host.querySelector('button').getAttribute('aria-describedby')).toBeNull();
  await open();await finish(requests[0],[{user_id:'eligible',name:'Eligible Owner'}]);
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('Eligible Owner')).click());
  expect(onChange).toHaveBeenCalledWith('eligible');
  await render();expect(host.textContent).toContain('Only active platform users');
  expect(host.querySelector('a[href="/contacts?client_id=a"]')).not.toBeNull();
});

test('record forms omit the people link while retaining assignment guidance and eligible choices',async()=>{
  await render({showManagePeople:false});
  expect(host.textContent).toContain('Only active platform users');
  expect(host.querySelector('a[href="/contacts?client_id=a"]')).toBeNull();
  await open();await finish(requests[0],[{user_id:'eligible',name:'Eligible Owner'}]);
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('Eligible Owner')).click());
  expect(onChange).toHaveBeenCalledWith('eligible');
});

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
test('Demo Contacts uses its tab selection without changing the normal client',async()=>{
  localStorage.setItem('grc_client_id','normal-client');sessionStorage.setItem('grc_client_id','a');
  const tab={opener:{},location:{replace:jest.fn()}},openTab=jest.spyOn(window,'open').mockReturnValue(tab);
  try {
    await render();await act(async()=>host.querySelector('a[href="/contacts?client_id=a"]').click());
    expect(openTab).toHaveBeenCalledWith('about:blank','_blank');
    expect(tab.opener).toBeNull();expect(tab.location.replace).toHaveBeenCalledWith(new URL('/contacts?client_id=a',window.location.origin).href);
    expect(localStorage.getItem('grc_client_id')).toBe('normal-client');expect(sessionStorage.getItem('grc_client_id')).toBe('a');expect(onChange).not.toHaveBeenCalled();
  } finally {openTab.mockRestore();localStorage.clear();sessionStorage.clear();}
});

function UnsavedOwnerForm({clientId='a'}) {
  const [note,setNote]=useState('');
  return <form onSubmit={event=>event.preventDefault()}>
    <input aria-label="Unsaved record note" value={note} onChange={event=>setNote(event.target.value)}/>
    <AssigneeSelect clientId={clientId} value="retained-owner" users={[{user_id:'retained-owner',name:'Retained owner',status:'active'}]} onChange={onChange}/>
  </form>;
}
async function withPeopleRoute({preview,path,stored,tab,clientId='a'},check) {
  const original={preview:apiModule.PREVIEW_MODE,url:window.location.pathname+window.location.search+window.location.hash,
    normal:localStorage.getItem('grc_client_id'),demo:sessionStorage.getItem('grc_client_id')};
  const openTab=jest.spyOn(window,'open').mockReturnValue(tab);
  apiModule.PREVIEW_MODE=preview;
  localStorage.setItem('grc_client_id',preview?'normal-client':stored);
  sessionStorage.setItem('grc_client_id',preview?stored:'demo-client');
  window.history.replaceState({},'',path);
  const selections=[localStorage.getItem('grc_client_id'),sessionStorage.getItem('grc_client_id')];
  try {
    await act(async()=>root.render(<UnsavedOwnerForm clientId={clientId}/>));
    const note=host.querySelector('[aria-label="Unsaved record note"]');
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(note,'SYNTHETIC unsaved note Ω');
      note.dispatchEvent(new Event('input',{bubbles:true}));
    });
    expect(note.value).toBe('SYNTHETIC unsaved note Ω');
    expect(host.querySelector('button').textContent).toContain('Retained owner');
    await check({openTab,note,link:host.querySelector('[aria-label="Manage people in a new tab"]')});
    expect(note.isConnected).toBe(true);expect(note.value).toBe('SYNTHETIC unsaved note Ω');
    expect(host.querySelector('button').textContent).toContain('Retained owner');
    expect(onChange).not.toHaveBeenCalled();
    for(const method of ['get','post','patch','put','delete'])expect(api[method]).not.toHaveBeenCalled();
    expect([localStorage.getItem('grc_client_id'),sessionStorage.getItem('grc_client_id')]).toEqual(selections);
  } finally {
    openTab.mockRestore();apiModule.PREVIEW_MODE=original.preview;
    window.history.replaceState({},'',original.url);
    for(const [storage,value] of [[localStorage,original.normal],[sessionStorage,original.demo]]) {
      if(value===null)storage.removeItem('grc_client_id');else storage.setItem('grc_client_id',value);
    }
  }
}

test.each([false,true])('a pinned client opens its exact Contacts destination despite another preference (Demo=%s)',async preview=>{
  const events=[];let opener={};
  const tab={get opener(){return opener;},set opener(value){opener=value;events.push(['opener',value]);},
    location:{replace:jest.fn(url=>events.push(['navigate',url]))}};
  await withPeopleRoute({preview,path:'/reviews?client_id=a&view=active#review',stored:'other-authorized-client',tab},async({openTab,link})=>{
    expect(link.getAttribute('href')).toBe('/contacts?client_id=a');
    await act(async()=>link.click());
    const destination=new URL('/contacts?client_id=a',window.location.origin).href;
    expect(openTab).toHaveBeenCalledTimes(1);expect(openTab).toHaveBeenCalledWith('about:blank','_blank');
    expect(tab.opener).toBeNull();expect(tab.location.replace).toHaveBeenCalledTimes(1);
    expect(tab.location.replace).toHaveBeenCalledWith(destination);
    expect(events).toEqual([['opener',null],['navigate',destination]]);
    expect(host.textContent).not.toContain('Open Contacts from this client');
  });
});

test.each([
  ['foreign pinned route','/reviews?client_id=foreign','a'],
  ['other authorized pinned route','/reviews?client_id=other-authorized-client','a'],
  ['unpinned changed preference','/reviews?view=active','other-authorized-client'],
])('%s refuses navigation without changing the current form',async(name,path,stored)=>{
  await withPeopleRoute({preview:false,path,stored,tab:{opener:{},location:{replace:jest.fn()}}},async({openTab,link})=>{
    expect(link.getAttribute('href')).toBe('/contacts?client_id=a');
    await act(async()=>link.click());
    expect(openTab).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Open Contacts from this client after saving your changes.');
  });
});

test('a blocked new tab reports the existing safe failure while retaining the form',async()=>{
  await withPeopleRoute({preview:false,path:'/reviews?client_id=a',stored:'other-authorized-client',tab:null},async({openTab,link})=>{
    await act(async()=>link.click());
    expect(openTab).toHaveBeenCalledWith('about:blank','_blank');
    expect(host.textContent).toContain('Allow this tab to open Contacts. Your form is unchanged.');
  });
});

test('a missing record client has no unscoped Contacts target and never opens a tab',async()=>{
  await withPeopleRoute({preview:false,path:'/reviews?client_id=a',stored:'a',tab:null,clientId:''},async({openTab,link})=>{
    expect(link.getAttribute('href')).toBeNull();
    await act(async()=>link.click());
    expect(openTab).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Open Contacts from this client after saving your changes.');
  });
});
