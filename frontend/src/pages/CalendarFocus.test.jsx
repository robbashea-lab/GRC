import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Calendar from './Calendar';
import api from '@/lib/api';
import {calendarBuckets} from '@/lib/calendarView';
// Regression: closing a record opened from Needs attention must not unmount the list while the
// Calendar refreshes, so focus can return to the row that opened it.
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'demo_brawndo',currentClient:{name:'Brawndo'}})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{role:'super_admin',workspace_mode:'demo'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));
// Mirrors the dialog contract the real drawer (Radix) provides: focus moves into the dialog on open
// and returns on close to the element that had focus, if that element is still in the document.
jest.mock('@/components/RecordDrawer',()=>{
  const React=require('react');
  return function MockDrawer(props){
    const opener=React.useRef(global.document.activeElement),close=React.useRef(null);
    React.useEffect(()=>{close.current.focus();const from=opener.current;return()=>{if(from&&from.isConnected)from.focus();};},[]);
    return <div role="dialog"><button ref={close} onClick={()=>props.onOpenChange(false)}>Close record</button></div>;
  };
});
let root,container,refresh;
const iso=d=>d.toISOString().slice(0,10);
const late=new Date();late.setDate(late.getDate()-5);
const tasks=[{task_id:'t1',client_id:'demo_brawndo',title:'Overdue work',status:'open',due_date:iso(late)}];
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;refresh=null;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  let attentionCalls=0;
  api.get.mockImplementation((path,{params}={})=>{
    if(path==='/tasks/t1')return Promise.resolve({data:tasks[0]});
    const data=calendarBuckets({tasks,reviews:[],findings:[]},{role:'super_admin'},params);
    // The second Needs-attention request (the refresh after closing) is held open to observe the in-between state.
    // The Needs-attention window starts ~11 months back; the month grid starts at most ~6 weeks back.
    if((Date.now()-new Date(params.start))/86400000>60&&++attentionCalls>1)return new Promise(resolve=>{refresh=()=>resolve({data});});
    return Promise.resolve({data});
  });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('closing a record keeps the Needs attention row mounted and returns focus to it',async()=>{
  await act(async()=>root.render(<Calendar/>));
  const row=container.querySelector('[data-testid^="cal-attn-task:t1"]');
  expect(row).toBeTruthy();
  row.focus();
  await act(async()=>row.click());
  const close=[...container.querySelectorAll('button')].find(b=>b.textContent==='Close record');
  expect(document.activeElement).toBe(close);
  await act(async()=>close.click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  // While the refresh is still pending the list stays on screen (no Loading placeholder) ...
  expect(refresh).toEqual(expect.any(Function));
  expect(container.querySelector('[aria-labelledby="bcal-attn-h"]').textContent).not.toContain('Loading…');
  // ... it is the same element that opened the record, and focus is back on it.
  expect(container.querySelector('[data-testid^="cal-attn-task:t1"]')).toBe(row);
  expect(document.activeElement).toBe(row);
  await act(async()=>refresh());
  expect(container.querySelector('[data-testid^="cal-attn-task:t1"]')).toBe(row);
});
