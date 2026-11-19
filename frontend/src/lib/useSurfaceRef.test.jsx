import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {ClientWorkspaceAvailability} from './useSurfaceRef';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription} from '@/components/ui/alert-dialog';

let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
const kinds=[['Dialog',Dialog,DialogContent,DialogTitle,DialogDescription],['Sheet',Sheet,SheetContent,SheetTitle,SheetDescription],['Alert',AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription]];

test.each(kinds)('%s portal keeps its actual draft DOM and protects dismissal while its owning client is unavailable',async(_name,Root,Content,Title,Description)=>{
  const change=jest.fn(),escape=jest.fn(),outside=jest.fn();
  const render=available=>act(async()=>root.render(<ClientWorkspaceAvailability.Provider value={available}>
    <Root open onOpenChange={change}><Content data-testid="owned-portal" onEscapeKeyDown={escape} onInteractOutside={outside}>
      <Title>Synthetic client editor</Title><Description>Isolated draft-preservation fixture.</Description><input data-testid="owned-draft" defaultValue="Retained native wording"/>
    </Content></Root>
  </ClientWorkspaceAvailability.Provider>));
  await render(true);const portal=document.querySelector('[data-testid="owned-portal"]'),draft=portal.querySelector('input');
  draft.value='Unsaved client wording';await render(false);
  expect(document.querySelector('[data-testid="owned-portal"]')).toBe(portal);expect(portal.querySelector('input')).toBe(draft);
  expect(portal.hidden).toBe(true);expect(portal.hasAttribute('inert')).toBe(true);
  expect(portal.style.getPropertyValue('display')).toBe('none');expect(portal.style.getPropertyPriority('display')).toBe('important');
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(escape).not.toHaveBeenCalled();expect(change).not.toHaveBeenCalled();expect(draft.value).toBe('Unsaved client wording');
  await render(true);
  expect(portal.hidden).toBe(false);expect(portal.hasAttribute('inert')).toBe(false);expect(portal.style.display).toBe('');
  expect(portal.querySelector('input')).toBe(draft);expect(draft.value).toBe('Unsaved client wording');
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(escape).toHaveBeenCalledTimes(1);
});

test('a portal outside client availability retains its existing default behavior while a sibling client is blocked',async()=>{
  const accountEscape=jest.fn();
  await act(async()=>root.render(<>
    <ClientWorkspaceAvailability.Provider value={false}><Dialog open><DialogContent data-testid="blocked-client"><DialogTitle>Client</DialogTitle><DialogDescription>Isolated unavailable-client fixture.</DialogDescription><input/></DialogContent></Dialog></ClientWorkspaceAvailability.Provider>
    <Dialog open><DialogContent data-testid="ordinary-account" onEscapeKeyDown={accountEscape}><DialogTitle>Account</DialogTitle><DialogDescription>Isolated ordinary account fixture.</DialogDescription><input defaultValue="Account draft"/></DialogContent></Dialog>
  </>));
  expect(document.querySelector('[data-testid="blocked-client"]').hidden).toBe(true);
  const account=document.querySelector('[data-testid="ordinary-account"]');expect(account.hidden).toBe(false);expect(account.hasAttribute('inert')).toBe(false);expect(account.style.display).toBe('');
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(accountEscape).toHaveBeenCalledTimes(1);expect(account.querySelector('input').value).toBe('Account draft');
});
