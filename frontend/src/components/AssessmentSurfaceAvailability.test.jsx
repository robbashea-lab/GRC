import React,{act,useEffect,useLayoutEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {AssessmentSurfaceAvailability} from '@/lib/assessmentSurfaceAvailability';
import {ClientWorkspaceAvailability} from '@/lib/useSurfaceRef';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from './ui/sheet';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogCancel} from './ui/alert-dialog';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './ui/select';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './ui/dropdown-menu';
import {Popover,PopoverTrigger,PopoverContent} from './ui/popover';
import OmniWindow from './OmniWindow';

let root,host,scrollIntoView;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  scrollIntoView=HTMLElement.prototype.scrollIntoView;HTMLElement.prototype.scrollIntoView=jest.fn();
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();
  if(scrollIntoView)HTMLElement.prototype.scrollIntoView=scrollIntoView;else delete HTMLElement.prototype.scrollIntoView;
});
const render=element=>act(async()=>root.render(element));
const availability=(available,children)=><AssessmentSurfaceAvailability.Provider value={available}>{children}</AssessmentSurfaceAvailability.Provider>;
const nativeShells=[['Dialog',Dialog,DialogContent,DialogTitle,DialogDescription],['Sheet',Sheet,SheetContent,SheetTitle,SheetDescription],['Alert',AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription]];

test.each(nativeShells)('%s retains the dirty child and native shell while status and Close own suspended focus',async(_name,Root,Content,Title,Description)=>{
  const mounted=jest.fn(),close=jest.fn();
  function Draft(){useEffect(()=>{mounted();},[mounted]);return <textarea data-testid="retained-draft" defaultValue="Saved wording"/>;}
  const view=available=>availability(available,<Root open onOpenChange={close}><Content data-testid="retained-shell">
    <Title>Isolated assessment</Title><Description>Synthetic retained draft.</Description><Draft/>
  </Content></Root>);
  await render(view(true));const shell=document.querySelector('[data-testid="retained-shell"]'),draft=shell.querySelector('textarea');
  draft.value='Unsaved native wording';draft.focus();
  await render(view(false));
  expect(document.querySelector('[data-testid="retained-shell"]')).toBe(shell);
  expect(shell.querySelector('textarea')).toBe(draft);expect(mounted).toHaveBeenCalledTimes(1);
  expect(draft.hidden).toBe(true);expect(draft.hasAttribute('inert')).toBe(true);expect(shell.hidden).toBe(false);
  expect(shell.hasAttribute('inert')).toBe(false);expect(shell.style.display).not.toBe('none');
  const status=shell.querySelector('[data-assessment-suspension-status]'),nativeClose=shell.querySelector('[data-assessment-suspension-close]');
  expect(status.hidden).toBe(false);expect(document.activeElement).toBe(status);expect(nativeClose.hidden).toBe(false);
  await act(async()=>nativeClose.click());expect(close).toHaveBeenLastCalledWith(false);
  await render(view(true));
  expect(shell.querySelector('textarea')).toBe(draft);expect(draft.value).toBe('Unsaved native wording');expect(draft.hidden).toBe(false);
  expect(document.activeElement).toBe(draft);expect(mounted).toHaveBeenCalledTimes(1);
});

test('resumption preserves the latest React hidden/display/text changes, including pending layout changes and new children',async()=>{
  function Draft({changed}){
    const marker=useRef(null);
    useLayoutEffect(()=>{marker.current.previousSibling.nodeValue=changed?'':'Latest React text';},[changed]);
    return <><div data-testid="react-child" hidden={changed} style={{display:changed?'flex':'block'}}>React-owned visibility</div>
      {'Initial text'}<span ref={marker} data-testid="text-marker"/>{changed&&<button data-testid="new-child">New action</button>}</>;
  }
  const view=(available,changed)=>availability(available,<Dialog open><DialogContent><DialogTitle>Isolated draft</DialogTitle>
    <DialogDescription>Latest React properties remain authoritative.</DialogDescription><Draft changed={changed}/></DialogContent></Dialog>);
  await render(view(true,false));const child=document.querySelector('[data-testid="react-child"]'),text=document.querySelector('[data-testid="text-marker"]').previousSibling;
  await render(view(false,false));await render(view(false,true));
  expect(document.querySelector('[data-testid="new-child"]').hidden).toBe(true);
  await render(view(true,true));expect(child.hidden).toBe(true);expect(child.style.display).toBe('flex');expect(text.nodeValue).toBe('');
  expect(document.querySelector('[data-testid="new-child"]').hidden).toBe(false);
  await render(view(false,false));
  // The child layout effect changes the text in the same commit that resumes its owner.
  await render(view(true,true));expect(child.hidden).toBe(true);expect(child.style.display).toBe('flex');expect(text.nodeValue).toBe('');
});

test('a nested native leave confirmation overrides assessment suspension and retains highest focus',async()=>{
  let portal;
  const capturePortal=node=>{portal=node;};
  function Owner({available,confirm}){
    return availability(available,<Dialog open><DialogContent ref={capturePortal} data-testid="outer-shell">
      <DialogTitle>Isolated editor</DialogTitle><DialogDescription>Dirty original editor.</DialogDescription><input defaultValue="Unsaved wording"/>
      {confirm&&availability(true,<AlertDialog open><AlertDialogContent portalContainer={portal} data-testid="leave-shell">
        <AlertDialogTitle>Leave unsaved changes?</AlertDialogTitle><AlertDialogDescription>Review the retained draft before leaving.</AlertDialogDescription>
        <AlertDialogCancel>Continue editing</AlertDialogCancel>
      </AlertDialogContent></AlertDialog>)}
    </DialogContent></Dialog>);
  }
  await render(<Owner available confirm={false}/>);const outer=document.querySelector('[data-testid="outer-shell"]'),draft=outer.querySelector('input');draft.focus();
  await render(<Owner available={false} confirm/>);
  const confirmation=document.querySelector('[data-testid="leave-shell"]');expect(confirmation.parentElement).toBe(outer);
  expect(confirmation.hidden).toBe(false);expect(confirmation.hasAttribute('inert')).toBe(false);expect(confirmation.style.display).not.toBe('none');
  expect(confirmation.contains(document.activeElement)).toBe(true);
  await render(<Owner available confirm/>);expect(confirmation.contains(document.activeElement)).toBe(true);expect(draft.value).toBe('Unsaved wording');
});

test('outer client unavailability still conceals the entire assessment shell',async()=>{
  await render(<ClientWorkspaceAvailability.Provider value={false}>{availability(false,<Dialog open><DialogContent data-testid="client-shell">
    <DialogTitle>Isolated client</DialogTitle><DialogDescription>Client scope takes precedence.</DialogDescription><input defaultValue="Retained draft"/>
  </DialogContent></Dialog>)}</ClientWorkspaceAvailability.Provider>);
  const shell=document.querySelector('[data-testid="client-shell"]');expect(shell.hidden).toBe(true);expect(shell.hasAttribute('inert')).toBe(true);
  expect(shell.style.getPropertyValue('display')).toBe('none');expect(shell.style.getPropertyPriority('display')).toBe('important');
});

test('Omni retains its guide draft, permits guarded Close and lets a newer native modal handle its own controls',async()=>{
  const close=jest.fn(),minimize=jest.fn(),continueEditing=jest.fn(),higherClose=jest.fn();
  const view=(available,confirm=false)=>availability(available,<OmniWindow id="isolated-guide" onClose={close} onMinimize={minimize}>
    <header className="omni-panel-header"><h2 id="isolated-guide-title">Isolated guide</h2><p id="isolated-guide-description">Synthetic guide draft.</p></header>
    <div><textarea data-testid="guide-draft" defaultValue="Saved answer"/></div>
    {availability(true,<Dialog open={confirm} onOpenChange={higherClose}><DialogContent aria-modal="true" data-testid="higher-guide-modal"><DialogTitle>Keep editing?</DialogTitle>
      <DialogDescription>A separate native confirmation owns these controls.</DialogDescription><button onClick={continueEditing}>Continue editing</button>
    </DialogContent></Dialog>)}
  </OmniWindow>);
  await render(view(true));const draft=document.querySelector('[data-testid="guide-draft"]');draft.value='Unsaved guide answer';draft.focus();
  await render(view(false));const guide=document.getElementById('isolated-guide');
  expect(document.querySelector('[data-testid="guide-draft"]')).toBe(draft);expect(draft.parentElement.hidden).toBe(true);
  expect(document.activeElement).toBe(guide.querySelector('[data-assessment-suspension-status]'));
  const minimizeButton=guide.querySelector('[aria-label="Minimize Omni Guide"]');expect(minimizeButton.hidden).toBe(true);
  await act(async()=>minimizeButton.click());expect(minimize).not.toHaveBeenCalled();
  await act(async()=>guide.querySelector('[data-assessment-suspension-close]').click());expect(close).toHaveBeenCalledTimes(1);
  await act(async()=>guide.querySelector('[data-assessment-suspension-status]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(close).toHaveBeenCalledTimes(2);close.mockClear();
  await render(view(false,true));await act(async()=>document.querySelector('[data-testid="higher-guide-modal"] button').click());
  await act(async()=>document.querySelector('[data-testid="higher-guide-modal"] button').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(higherClose).toHaveBeenLastCalledWith(false);expect(close).not.toHaveBeenCalled();
  expect(continueEditing).toHaveBeenCalledTimes(1);expect(draft.value).toBe('Unsaved guide answer');
});

const popupKinds=['select','dropdown','popover'];
function PopupDraft({kind,controlled,defaultOpen=true,onOpenChange,onValueChange,portalContainer}){
  const visibility=controlled===undefined?{defaultOpen}:{open:controlled};
  if(kind==='select')return <Select defaultValue="retained" {...visibility} onOpenChange={onOpenChange} onValueChange={onValueChange}>
    <SelectTrigger data-testid="popup-trigger"><SelectValue/></SelectTrigger><SelectContent data-testid="ephemeral-popup"><SelectItem value="retained">Retained selection</SelectItem><SelectItem value="other">Other selection</SelectItem></SelectContent>
  </Select>;
  if(kind==='dropdown')return <DropdownMenu {...visibility} onOpenChange={onOpenChange}><DropdownMenuTrigger data-testid="popup-trigger">Assessment details</DropdownMenuTrigger>
    <DropdownMenuContent portalContainer={portalContainer} data-testid="ephemeral-popup"><DropdownMenuItem onSelect={onValueChange}>Open details</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
  return <Popover modal {...visibility} onOpenChange={onOpenChange}><PopoverTrigger data-testid="popup-trigger">Context guidance</PopoverTrigger>
    <PopoverContent data-testid="ephemeral-popup">Ephemeral guidance.</PopoverContent></Popover>;
}

test.each(popupKinds)('%s releases its native popup layer and keeps the selected and typed draft after suspension',async kind=>{
  const changed=jest.fn(),opened=jest.fn();
  let ownerPortal;const captureOwner=node=>{ownerPortal=node;};
  const view=(available,popup=true)=>availability(available,<Dialog open><DialogContent ref={captureOwner}><DialogTitle>Isolated popup owner</DialogTitle><DialogDescription>Native popup cleanup.</DialogDescription>
    <input data-testid="typed-draft" defaultValue="Saved text"/>{popup&&<PopupDraft kind={kind} portalContainer={ownerPortal} onOpenChange={opened} onValueChange={changed}/>}
  </DialogContent></Dialog>);
  await render(view(true,false));const draft=document.querySelector('[data-testid="typed-draft"]');draft.value='Unsaved typed text';draft.focus();
  await render(view(true));const trigger=document.querySelector('[data-testid="popup-trigger"]');expect(document.querySelector('[data-testid="ephemeral-popup"]')).not.toBeNull();
  await render(view(false));expect(document.querySelector('[data-testid="ephemeral-popup"]')).toBeNull();expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(ownerPortal.style.pointerEvents).toBe('auto');
  expect(opened).toHaveBeenCalledWith(false);expect(changed).not.toHaveBeenCalled();
  const close=document.querySelector('[data-assessment-suspension-close]');close.focus();expect(document.activeElement).toBe(close);
  await render(view(true));expect(document.querySelector('[data-testid="ephemeral-popup"]')).toBeNull();expect(draft.value).toBe('Unsaved typed text');
  expect(document.querySelector('[data-testid="typed-draft"]')).toBe(draft);expect(changed).not.toHaveBeenCalled();
  if(kind==='select')expect(trigger.textContent).toContain('Retained selection');
});

test('a controlled popup requests native closure and resumes only when its owner still requests open',async()=>{
  const opened=jest.fn();
  const view=(available,open)=>availability(available,<PopupDraft kind="popover" controlled={open} onOpenChange={opened}/>);
  await render(view(true,true));expect(document.querySelector('[data-testid="ephemeral-popup"]')).not.toBeNull();
  await render(view(false,true));expect(opened).toHaveBeenLastCalledWith(false);expect(document.querySelector('[data-testid="ephemeral-popup"]')).toBeNull();
  await render(view(true,true));expect(document.querySelector('[data-testid="ephemeral-popup"]')).not.toBeNull();
  await render(view(false,true));
  await render(view(true,false));expect(document.querySelector('[data-testid="ephemeral-popup"]')).toBeNull();
});

test('an unavailable uncontrolled popup ignores native open requests and remains closed on restoration',async()=>{
  const view=available=>availability(available,<PopupDraft kind="popover" defaultOpen={false}/>);
  await render(view(false));const trigger=document.querySelector('[data-testid="popup-trigger"]');
  await act(async()=>trigger.click());expect(document.querySelector('[data-testid="ephemeral-popup"]')).toBeNull();
  await render(view(true));expect(document.querySelector('[data-testid="ephemeral-popup"]')).toBeNull();
  await act(async()=>trigger.click());expect(document.querySelector('[data-testid="ephemeral-popup"]')).not.toBeNull();
});
