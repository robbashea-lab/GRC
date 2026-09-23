import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Sheet,SheetContent,SheetTitle,SheetDescription,SheetTrigger} from './sheet';

let root,container,warn;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);warn=jest.spyOn(console,'warn');});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();warn.mockRestore();});

test.each(['Review its evidence and activity.',null])('description API preserves Radix title/description relationships (%s)',async description=>{
  await act(async()=>root.render(<Sheet defaultOpen><SheetContent description={description}><SheetTitle>Access Review</SheetTitle>{!description&&<SheetDescription>Existing caller description.</SheetDescription>}<button>Save changes</button></SheetContent></Sheet>));
  const dialog=document.querySelector('[role="dialog"]');
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe('Access Review');
  expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe(description||'Existing caller description.');
  expect(warn.mock.calls.flat().join(' ')).not.toContain('Missing');
});

test('Escape dismisses and restores the trigger without changing focus primitives',async()=>{
  await act(async()=>root.render(<Sheet><SheetTrigger>Open Review</SheetTrigger><SheetContent description="Inspect the Review and supporting evidence."><SheetTitle>Review</SheetTitle><button>Save</button></SheetContent></Sheet>));
  const trigger=container.querySelector('button');trigger.focus();await act(async()=>trigger.click());
  expect(document.activeElement.closest('[role="dialog"]')).toBeTruthy();
  await act(async()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
  expect(document.activeElement).toBe(trigger);
});

test('a programmatically opened record drawer restores its external opener',async()=>{
  function Example(){const [open,setOpen]=React.useState(false);return <><button onClick={()=>setOpen(true)}>Open Finding</button><Sheet open={open} onOpenChange={setOpen}><SheetContent description="Inspect the gap and corrective work."><SheetTitle>Finding</SheetTitle><button>Save</button></SheetContent></Sheet></>;}
  await act(async()=>root.render(<Example/>));const trigger=container.querySelector('button');trigger.focus();
  await act(async()=>trigger.click());
  await act(async()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
  expect(document.activeElement).toBe(trigger);
});
