import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import WorkspaceTabs from './WorkspaceTabs';
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const TABS=[['overview','ISMS Overview'],['isms_clause','Clauses 4–10'],['soa','Statement of Applicability']];
function Harness({onSelect}){const [sel,setSel]=useState('overview');return <><WorkspaceTabs label="ISO workspace sections" tabs={TABS} selected={sel} onSelect={k=>{setSel(k);onSelect(k);}} idPrefix="t" panelId="p"/><div role="tabpanel" id="p" aria-labelledby={`t-${sel}`}/></>;}
const key=async(el,k)=>act(async()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true})));
test('tablist semantics, one tab stop, Arrow/Home/End move focus and select',async()=>{
  const onSelect=jest.fn();await act(async()=>root.render(<Harness onSelect={onSelect}/>));
  const tabs=()=>[...container.querySelectorAll('[role="tab"]')];
  expect(container.querySelector('[role="tablist"]').getAttribute('aria-label')).toBe('ISO workspace sections');
  expect(tabs().map(t=>[t.getAttribute('aria-selected'),t.tabIndex])).toEqual([['true',0],['false',-1],['false',-1]]);
  expect(tabs().every(t=>t.getAttribute('aria-controls')==='p')).toBe(true);
  tabs()[0].focus();
  await key(tabs()[0],'ArrowRight');expect(document.activeElement).toBe(tabs()[1]);expect(onSelect).toHaveBeenLastCalledWith('isms_clause');
  expect(tabs()[1].getAttribute('aria-selected')).toBe('true');expect(tabs()[1].tabIndex).toBe(0);
  await key(tabs()[1],'End');expect(document.activeElement).toBe(tabs()[2]);
  await key(tabs()[2],'ArrowRight');expect(document.activeElement).toBe(tabs()[0]);
  await key(tabs()[0],'ArrowLeft');expect(document.activeElement).toBe(tabs()[2]);
  await key(tabs()[2],'Home');expect(document.activeElement).toBe(tabs()[0]);
  expect(container.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('t-overview');
  await act(async()=>tabs()[2].click());expect(onSelect).toHaveBeenLastCalledWith('soa');
});
