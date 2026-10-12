import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentShell from './AssessmentShell';
import OmniWindow from './OmniWindow';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';

let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const escape=async element=>act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));

function Fixture({dirty=false,busy=false,onNativeClose=()=>{}}){
  const [guide,setGuide]=useState(true),[confirm,setConfirm]=useState(false);
  return <AssessmentShell title="Native requirement" description="Existing assessment" close={onNativeClose} busy={busy}>
    <button data-testid="opener" onClick={()=>setGuide(true)}>Open guide</button>
    {guide&&<OmniWindow id="guide" onClose={()=>{if(busy)return;if(dirty)setConfirm(true);else setGuide(false);}} onCloseAutoFocus={()=>document.querySelector('[data-testid="opener"]')?.focus()}>
      <h2 id="guide-title" tabIndex={-1}>Guide</h2><p id="guide-description">Retained interview</p><textarea aria-label="Answer" defaultValue="Unsaved answer"/>
      <button onClick={()=>setConfirm(true)}>Confirm change</button>
    </OmniWindow>}
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogTitle>Keep editing?</DialogTitle><DialogDescription>Retain your work.</DialogDescription><button onClick={()=>setConfirm(false)}>Keep editing</button></DialogContent></Dialog>
  </AssessmentShell>;
}

test('capture-phase Escape closes only the focused guide and restores focus inside the native requirement',async()=>{
  const close=jest.fn();await act(async()=>root.render(<Fixture onNativeClose={close}/>));
  const heading=document.querySelector('#guide-title');heading.focus();await escape(heading);
  expect(close).not.toHaveBeenCalled();expect(document.querySelector('#guide')).toBeNull();
  expect(document.querySelector('[data-assessment-shell]')).not.toBeNull();
  expect(document.activeElement.textContent).toBe('Open guide');
  await escape(document.activeElement);expect(close).toHaveBeenCalledTimes(1);
});

test('dirty guide Escape opens its existing guard without dismissing native or discarding answers',async()=>{
  const close=jest.fn();await act(async()=>root.render(<Fixture dirty onNativeClose={close}/>));
  const answer=document.querySelector('[aria-label="Answer"]');answer.focus();await escape(answer);
  expect(close).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Answer"]').value).toBe('Unsaved answer');
  expect([...document.querySelectorAll('h2')].some(el=>el.textContent==='Keep editing?')).toBe(true);
  await escape(document.activeElement);expect(document.querySelector('#guide')).not.toBeNull();expect(close).not.toHaveBeenCalled();
});

test('topmost confirmation handles one Escape before the guide; busy guide remains protected',async()=>{
  const close=jest.fn();await act(async()=>root.render(<Fixture busy onNativeClose={close}/>));
  await act(async()=>[...document.querySelectorAll('#guide button')].find(button=>button.textContent==='Confirm change').click());
  expect(close).not.toHaveBeenCalled();
  expect(document.activeElement.closest('[role="dialog"]').textContent).toContain('Keep editing?');
  await escape(document.activeElement);
  expect([...document.querySelectorAll('h2')].some(el=>el.textContent==='Keep editing?')).toBe(false);
  expect(document.querySelector('#guide')).not.toBeNull();expect(close).not.toHaveBeenCalled();
  document.querySelector('#guide-title').focus();await escape(document.activeElement);
  expect(document.querySelector('#guide')).not.toBeNull();expect(close).not.toHaveBeenCalled();
});
