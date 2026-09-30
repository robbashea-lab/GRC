import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {useBrawndoPortalTheme} from './brawndoTheme';
// Portaled drawers follow the page theme only while a themed Brawndo page is mounted.
function Page({enabled,theme}){useBrawndoPortalTheme(enabled,theme);return null;}
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);delete document.documentElement.dataset.brawndoPortal;});
afterEach(()=>container.remove());
test('publishes the theme while mounted, follows changes and clears on unmount',async()=>{
  await act(async()=>root.render(<Page enabled theme="dark"/>));
  expect(document.documentElement.dataset.brawndoPortal).toBe('dark');
  await act(async()=>root.render(<Page enabled theme="light"/>));
  expect(document.documentElement.dataset.brawndoPortal).toBe('light');
  await act(async()=>root.unmount());
  expect(document.documentElement.dataset.brawndoPortal).toBeUndefined();
});
test('unconverted pages (disabled) never publish a theme',async()=>{
  await act(async()=>root.render(<Page enabled={false} theme="dark"/>));
  expect(document.documentElement.dataset.brawndoPortal).toBeUndefined();
  await act(async()=>root.unmount());
});
