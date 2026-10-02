import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentShell from './AssessmentShell';

let root,container;
const button=name=>[...document.querySelectorAll('button')].find(el=>el.textContent===name);
const flushClose=async()=>{await act(async()=>jest.runAllTimers());};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());await flushClose();container.remove();jest.useRealTimers();});
function Example({removeOpener=false}){
  const [open,setOpen]=useState(false),[step,setStep]=useState(1);
  return <main><h1>Framework workspace</h1>{(!removeOpener||!open)&&<button onClick={()=>setOpen(true)}>Open assessment</button>}
    {open&&<AssessmentShell key={step} title={'Assessment '+step} description="Review the recorded implementation."
      close={()=>setOpen(false)} next={()=>setStep(step+1)} position={step+' of 2'}
      footer={<button onClick={()=>setOpen(false)}>Close assessment</button>}>Assessment content</AssessmentShell>}</main>;
}
async function openExample(props){await act(async()=>root.render(<Example {...props}/>));const opener=button('Open assessment');opener.focus();await act(async()=>opener.click());return opener;}
async function close(){await act(async()=>button('Close assessment').click());await flushClose();}

test('closing an assessment returns to its connected page opener',async()=>{
  const opener=await openExample();await close();expect(document.activeElement).toBe(opener);
});
test('a removed opener falls back to the page heading without creating a tab stop',async()=>{
  await openExample({removeOpener:true});await close();
  expect(document.activeElement).toBe(container.querySelector('h1'));
  expect(document.activeElement.tabIndex).toBe(-1);
});
test('Next remounts do not retain a drawer control as the page opener',async()=>{
  await openExample();const next=button('Next');next.focus();await act(async()=>next.click());await flushClose();
  expect(document.activeElement.textContent).toBe('Assessment 2');
  await close();expect(document.activeElement).toBe(container.querySelector('h1'));
});
