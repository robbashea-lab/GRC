import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CisBreadcrumb} from '@/components/BrawndoCisControls';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()}}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
// Drilling into a category replaces the activated row; focus must not fall to <body>.
function Nav(){const [path,setPath]=useState([]);
  return <><CisBreadcrumb label="loc" items={[{label:'All',onClick:()=>setPath([])},...path.map(p=>({label:p}))]}/>
    {!path.length&&<button data-testid="row" onClick={()=>setPath(['Control 1'])}>Control 1</button>}<button data-testid="other">Other</button></>;}
test('lost focus after drill-in moves to the current location; focus elsewhere is not stolen',async()=>{
  await act(async()=>root.render(<Nav/>));
  const row=container.querySelector('[data-testid="row"]');row.focus();
  await act(async()=>row.click());
  expect(document.activeElement.textContent).toBe('Control 1');
  expect(document.activeElement.getAttribute('aria-current')).toBe('page');
  // Going back via the crumb: the crumb button unmounts, focus moves to the new current crumb.
  await act(async()=>container.querySelector('nav button').click());
  expect(document.activeElement).not.toBe(document.body);
  container.querySelector('[data-testid="other"]').focus();
  await act(async()=>container.querySelector('[data-testid="row"]').click());
  // Clicking without the row having focus (pointer) — focus stayed on Other, so it is not moved.
  expect(document.activeElement.textContent).toBe('Other');
});
