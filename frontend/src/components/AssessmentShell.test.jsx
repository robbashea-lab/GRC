import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentShell from './AssessmentShell';

let root,container;
const button=name=>[...document.querySelectorAll('button')].find(el=>el.textContent===name);
const flushClose=async()=>{await act(async()=>jest.runAllTimers());};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  // jsdom has no layout; model rendered boxes while retaining the actual modal/hidden attributes.
  jest.spyOn(HTMLElement.prototype,'getClientRects').mockImplementation(function(){return this.closest('[hidden]')?[]:[{}];});
});
afterEach(async()=>{await act(async()=>root.unmount());await flushClose();container.remove();jest.restoreAllMocks();jest.useRealTimers();});
function Example({removeOpener=false,hiddenHeader=false,closeInNavigation=false,returnOpenerState,openerDialog=false,onNativeClose=()=>{}}){
  const [open,setOpen]=useState(false),[step,setStep]=useState(1),[closed,setClosed]=useState(false);
  const opener=<fieldset disabled={closed&&returnOpenerState==='disabled-fieldset'}>
    <button hidden={closed&&returnOpenerState==='hidden'} aria-hidden={closed&&returnOpenerState==='aria-hidden'?true:undefined}
      inert={closed&&returnOpenerState==='inert'} onClick={()=>setOpen(true)}>Open assessment</button>
  </fieldset>;
  return <main>{hiddenHeader&&<header hidden><h1>Hidden generic header</h1></header>}<h1>Framework workspace</h1>
    {(!removeOpener||!open)&&(openerDialog?<section role="dialog" aria-label="Surviving ticket">{opener}<button>Other ticket control</button></section>:opener)}
    {open&&<AssessmentShell key={step} title={'Assessment '+step} description="Review the recorded implementation."
      close={()=>{onNativeClose();setClosed(true);setOpen(false);}} closeInNavigation={closeInNavigation} next={()=>setStep(step+1)} position={step+' of 2'}
      footer={<button onClick={()=>{setClosed(true);setOpen(false);}}>Close assessment</button>}>Assessment content</AssessmentShell>}</main>;
}
async function openExample(props){await act(async()=>root.render(<Example {...props}/>));const opener=button('Open assessment');opener.focus();await act(async()=>opener.click());return opener;}
async function close(){await act(async()=>button('Close assessment').click());await flushClose();}

test('closing an assessment returns to its connected page opener',async()=>{
  const opener=await openExample();await close();expect(document.activeElement).toBe(opener);
});
test.each([false,true])('with navigation Close=%s, Escape still closes the native dialog and restores its connected opener',async closeInNavigation=>{
  const opener=await openExample({closeInNavigation});await act(async()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await flushClose();
  expect(document.querySelector('[data-assessment-shell]')).toBeNull();expect(document.activeElement).toBe(opener);
});
test('a removed opener falls back to the page heading without creating a tab stop',async()=>{
  await openExample({removeOpener:true});await close();
  expect(document.activeElement).toBe(container.querySelector('h1'));
  expect(document.activeElement.tabIndex).toBe(-1);
});
test.each(['hidden','aria-hidden','inert','disabled-fieldset'])('closing never restores a %s opener',async returnOpenerState=>{
  const opener=await openExample({returnOpenerState});await close();
  if(returnOpenerState==='inert')expect(opener.hasAttribute('inert')).toBe(true);
  expect(opener.isConnected).toBe(true);expect(document.activeElement).not.toBe(opener);
  expect(document.activeElement).toBe(container.querySelector('h1'));
});
test.each(['hidden','aria-hidden','inert','disabled-fieldset'])('a surviving ticket never restores its %s opener or focuses the background page',async returnOpenerState=>{
  const opener=await openExample({openerDialog:true,returnOpenerState});await close();
  if(returnOpenerState==='inert')expect(opener.hasAttribute('inert')).toBe(true);
  expect(container.querySelector('[aria-label="Surviving ticket"]').closest('[aria-hidden="true"]')).toBeNull();
  expect(document.activeElement).not.toBe(opener);expect(document.activeElement).not.toBe(container.querySelector('h1'));
});
test('closing retains focus already placed in a surviving ticket control',async()=>{
  await openExample({openerDialog:true});await act(async()=>button('Close assessment').click());
  const control=button('Other ticket control');control.focus();expect(document.activeElement).toBe(control);
  await flushClose();expect(document.activeElement).toBe(control);
});
test('closing does not restore an old ticket opener when an exposed sibling dialog makes ownership ambiguous',async()=>{
  const opener=await openExample({openerDialog:true});await act(async()=>button('Close assessment').click());
  const sibling=document.createElement('section');sibling.setAttribute('role','dialog');document.body.appendChild(sibling);
  try{
    await flushClose();expect(opener.closest('[aria-hidden="true"],[hidden],[inert]')).toBeNull();
    expect(sibling.closest('[aria-hidden="true"],[hidden],[inert]')).toBeNull();
    expect(document.activeElement).not.toBe(opener);expect(document.activeElement).not.toBe(container.querySelector('h1'));
  }finally{sibling.remove();}
});
test('closing does not fall back to the page while another exposed dialog owns focus',async()=>{
  const opener=await openExample();await act(async()=>button('Close assessment').click());
  const survivingDialog=document.createElement('section');survivingDialog.setAttribute('role','dialog');
  document.body.appendChild(survivingDialog);
  try{
    await flushClose();expect(document.activeElement).not.toBe(opener);
    expect(document.activeElement).not.toBe(container.querySelector('h1'));
  }finally{survivingDialog.remove();}
});
test('Next remounts do not retain a drawer control as the page opener',async()=>{
  await openExample();const next=button('Next');next.focus();await act(async()=>next.click());await flushClose();
  expect(document.activeElement.textContent).toBe('Assessment 2');
  await close();expect(document.activeElement).toBe(container.querySelector('h1'));
});
test('Next then close falls back to the visible workspace heading, not an earlier hidden header',async()=>{
  await openExample({hiddenHeader:true});const next=button('Next');next.focus();await act(async()=>next.click());await flushClose();
  await close();expect(document.activeElement).toBe(container.querySelector('main > h1'));
  expect(container.querySelector('header h1').hasAttribute('tabindex')).toBe(false);
});


test.each([false,true])('navigation Close=%s retains one native Close and the original opener return',async closeInNavigation=>{
  const onNativeClose=jest.fn(),opener=await openExample({closeInNavigation,onNativeClose});
  const surface=document.querySelector('[data-assessment-shell]'),nav=surface.querySelector('[aria-label="Assessment navigation"]');
  const closes=[...surface.querySelectorAll('button')].filter(element=>element.textContent==='Close');
  expect(closes).toHaveLength(1);
  expect(closes[0].parentElement).toBe(closeInNavigation?nav:surface);
  expect([...nav.children].map(element=>element.textContent)).toEqual(closeInNavigation?['Previous','1 of 2','Next','Close']:['Previous','1 of 2','Next']);
  expect(surface.querySelector('h2').textContent).toBe('Assessment 1');
  expect(surface.hasAttribute('showCloseButton')).toBe(false);
  closes[0].focus();await act(async()=>closes[0].click());await flushClose();
  expect(onNativeClose).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-assessment-shell]')).toBeNull();
  expect(document.activeElement).toBe(opener);
});
