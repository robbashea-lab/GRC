import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {useSocWorkspaceNavigation} from './useSocWorkspaceNavigation';

const rows=(...ids)=>ids.map(id=>({framework_assessment_id:id}));
let root,container,settings,current,navigate,rawLocation;
function Editor({id}){
  const [draft,setDraft]=useState('Initial '+id);
  return <input aria-label="Native draft" data-assessment={id} value={draft} onChange={event=>setDraft(event.target.value)}/>;
}
function Harness(){
  const [params,setParams]=useSearchParams();rawLocation=useLocation();navigate=useNavigate();
  current=useSocWorkspaceNavigation({...settings,params,setParams,location:rawLocation});
  const id=current.params.get('assessment'),available=settings.records.some(row=>row.framework_assessment_id===id);
  return <div>{available&&<Editor key={settings.origin+':'+id} id={id}/>}</div>;
}
const route=(id,category='security')=>'/compliance/soc-2?category='+category+(id?'&assessment='+id:'');
const render=()=>act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));
const mount=(entries=[route('a')],index=entries.length-1)=>act(async()=>root.render(<MemoryRouter initialEntries={entries} initialIndex={index}><Harness/></MemoryRouter>));
const travel=destination=>act(async()=>navigate(destination));
const field=()=>container.querySelector('[aria-label="Native draft"]');
async function typeDraft(value){
  await act(async()=>{const input=field();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
}
async function nativeParams(value,options){await act(async()=>current.setParams(value,options));}
async function accept(){let accepted;await act(async()=>{accepted=current.acceptPending();});return accepted;}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  settings={enabled:true,origin:'actor:client:soc-2',records:rows('a','b','c')};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('a direct criterion link mounts without visiting a category and same-ID refreshes retain its draft',async()=>{
  await mount(['/compliance/soc-2?assessment=a']);const editor=field();await typeDraft('Exact unsaved wording');
  settings={...settings,records:settings.records.map(row=>({...row,refreshed:true}))};await render();
  expect(field()).toBe(editor);expect(field().value).toBe('Exact unsaved wording');expect(current.closeRequest).toBe(0);
  await act(async()=>navigate('/compliance/soc-2?category=privacy&assessment=a',{state:{fromWorkspace:false,refreshed:true}}));
  expect(current.params.get('category')).toBe('privacy');expect(current.location.state).toEqual({fromWorkspace:false,refreshed:true});
  expect(field()).toBe(editor);expect(field().value).toBe('Exact unsaved wording');expect(current.closeRequest).toBe(0);
});

test('external target changes hold the native editor until discard accepts the latest destination',async()=>{
  await mount();const editor=field();await typeDraft('Retain until explicitly discarded');
  await travel(route('b','availability'));
  expect(rawLocation.search).toContain('assessment=b');expect(current.params.get('assessment')).toBe('a');
  expect(current.location.search).toContain('assessment=a');expect(field()).toBe(editor);expect(current.closeRequest).toBe(1);
  await travel(route('c','confidentiality'));
  expect(field()).toBe(editor);expect(field().value).toBe('Retain until explicitly discarded');expect(current.closeRequest).toBe(2);
  const requestedKey=rawLocation.key;expect(await accept()).toBe(true);
  expect(current.params.get('assessment')).toBe('c');expect(current.params.get('category')).toBe('confidentiality');
  expect(current.location.key).toBe(requestedKey);expect(rawLocation.key).toBe(requestedKey);expect(field()).not.toBe(editor);
  expect(await accept()).toBe(false);
});

test('actual Back and Forward queue identity changes and accept them without another history movement',async()=>{
  await mount([route('a'),route('b')]);expect(field().dataset.assessment).toBe('b');
  await travel(-1);expect(rawLocation.search).toContain('assessment=a');expect(field().dataset.assessment).toBe('b');expect(current.closeRequest).toBe(1);
  const backKey=rawLocation.key;expect(await accept()).toBe(true);expect(rawLocation.key).toBe(backKey);expect(field().dataset.assessment).toBe('a');
  await travel(1);expect(rawLocation.search).toContain('assessment=b');expect(field().dataset.assessment).toBe('a');expect(current.closeRequest).toBe(2);
  const forwardKey=rawLocation.key;expect(await accept()).toBe(true);expect(rawLocation.key).toBe(forwardKey);expect(field().dataset.assessment).toBe('b');
});

test('Keep editing restores a distinct current URL entry and repeated Back asks again without losing its draft',async()=>{
  await mount([route(null)]);
  await nativeParams(new URLSearchParams('category=security&assessment=a'),{state:{fromWorkspace:true}});
  const editor=field(),entryKey=rawLocation.key;await typeDraft('Keep this exact native draft');
  await travel(-1);expect(current.params.get('assessment')).toBe('a');expect(current.closeRequest).toBe(1);
  expect(current.location.state).toEqual({fromWorkspace:true});
  await act(async()=>current.keepEditing());
  expect(rawLocation.search).toContain('assessment=a');expect(rawLocation.key).not.toBe(entryKey);
  expect(rawLocation.state).toEqual({fromWorkspace:true});expect(field()).toBe(editor);expect(current.closeRequest).toBe(1);
  await travel(-1);expect(rawLocation.search).not.toContain('assessment=');expect(current.closeRequest).toBe(2);
  expect(field()).toBe(editor);expect(field().value).toBe('Keep this exact native draft');
  await act(async()=>current.keepEditing());expect(field()).toBe(editor);expect(current.closeRequest).toBe(2);
  await travel(-1);expect(current.closeRequest).toBe(3);expect(field()).toBe(editor);
  expect(await accept()).toBe(true);expect(field()).toBeNull();expect(current.params.get('assessment')).toBeNull();
});

test('already-approved native setParams supports functional updates and does not ask to close twice',async()=>{
  await mount();await typeDraft('Draft discarded by the native guard');
  await nativeParams(previous=>{previous.set('assessment','b');previous.set('category','availability');return previous;},{replace:true,state:{fromWorkspace:true}});
  expect(current.params.get('assessment')).toBe('b');expect(field().dataset.assessment).toBe('b');expect(current.closeRequest).toBe(0);
  expect(current.location.state).toEqual({fromWorkspace:true});expect(await accept()).toBe(false);
  await travel(route('c'));expect(current.closeRequest).toBe(1);expect(field().dataset.assessment).toBe('b');
});

test('one approved native Back is allowed and later external Back still uses the guard',async()=>{
  await mount([route(null)]);await nativeParams(new URLSearchParams('assessment=a'),{state:{fromWorkspace:true}});
  await act(async()=>{current.allowNextLocation();navigate(-1);});
  expect(field()).toBeNull();expect(current.closeRequest).toBe(0);expect(await accept()).toBe(false);
  await nativeParams(new URLSearchParams('assessment=b'),{state:{fromWorkspace:true}});
  await travel(-1);expect(field().dataset.assessment).toBe('b');expect(current.closeRequest).toBe(1);
});

test('an invalid target cannot replace a valid mounted editor before native closure, then remains unavailable',async()=>{
  await mount();const editor=field();await travel(route('missing'));
  expect(field()).toBe(editor);expect(current.closeRequest).toBe(1);expect(await accept()).toBe(true);
  expect(current.params.get('assessment')).toBe('missing');expect(field()).toBeNull();
  await travel(route('b'));expect(field().dataset.assessment).toBe('b');expect(current.closeRequest).toBe(1);
});

test('a missing current record withdraws its held context rather than retaining it indefinitely',async()=>{
  await mount();await travel(route('b'));expect(current.params.get('assessment')).toBe('a');
  settings={...settings,records:rows('b','c')};await render();
  expect(current.params.get('assessment')).toBe('b');expect(field().dataset.assessment).toBe('b');expect(await accept()).toBe(false);
  await act(async()=>current.keepEditing());expect(rawLocation.search).toContain('assessment=b');
  settings={...settings,records:[]};await render();expect(field()).toBeNull();
  settings={...settings,records:rows('a')};await render();expect(current.params.get('assessment')).toBe('b');expect(field()).toBeNull();
});

test.each(['origin','disabled','pathname'])('%s change withdraws the prior held editor and clears its pending request',async kind=>{
  await mount();await travel(route('b'));expect(current.params.get('assessment')).toBe('a');expect(current.closeRequest).toBe(1);
  if(kind==='origin'){settings={...settings,origin:'other-actor:other-client:soc-2'};await render();}
  if(kind==='disabled'){settings={...settings,enabled:false};await render();}
  if(kind==='pathname')await travel('/dashboard?assessment=b');
  expect(current.params.get('assessment')).toBe('b');expect(current.closeRequest).toBe(0);expect(await accept()).toBe(false);
  await act(async()=>current.keepEditing());expect(rawLocation.search).toContain('assessment=b');
  if(kind==='pathname')expect(current.location.pathname).toBe('/dashboard');
});

test('disabled consumers pass native parameter updates through without SOC interception',async()=>{
  settings={...settings,enabled:false};await mount();
  await nativeParams(previous=>{previous.set('assessment','b');return previous;});
  expect(current.params.get('assessment')).toBe('b');expect(current.closeRequest).toBe(0);
  await travel(route('c'));expect(current.params.get('assessment')).toBe('c');expect(current.closeRequest).toBe(0);
});
