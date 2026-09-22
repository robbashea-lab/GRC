import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Calendar from './Calendar';
import api from '@/lib/api';
import {calendarBuckets} from '@/lib/calendarView';
let mockCid='a',mockDrawer;
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockCid,currentClient:{name:mockCid}})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));
jest.mock('@/components/RecordDrawer',()=>props=>{mockDrawer=props;return <div data-testid="opened-record">{props.record.title}</div>;});
let root,container,records;
const day=new Date().toISOString().slice(0,10);
const button=text=>[...container.querySelectorAll('button')].find(b=>b.textContent===text);
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockCid='a';mockDrawer=null;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  records={tasks:[{task_id:'open',client_id:'a',title:'Current work',status:'open',due_date:day},{task_id:'done',client_id:'a',title:'Finished work',status:'done',due_date:day}],reviews:[],findings:[]};
  api.patch.mockReset();
  api.get.mockImplementation(async(path,{params}={})=>({data:path==='/calendar'?calendarBuckets(params.client_id==='a'?records:{},{role:'super_admin'},params):records.tasks.find(t=>path.endsWith('/'+t.task_id))}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('Active default, visible terminal text, no terminal drag, and authoritative record opening',async()=>{
  await act(async()=>root.render(<Calendar/>));
  expect(button('Active').getAttribute('aria-pressed')).toBe('true');
  expect(container.textContent).not.toContain('Finished work');
  expect(container.querySelector('[data-testid="cal-item-task:open:current"]').draggable).toBe(true);
  await act(async()=>button('Completed / Closed').click());
  const completed=container.querySelector('[data-testid="cal-item-task:done:current"]');
  expect(completed.textContent).toContain('Action Item · Completed');expect(completed.draggable).toBe(false);
  expect(completed.getAttribute('aria-label')).toContain('Completed');
  await act(async()=>completed.click());
  expect(mockDrawer.record.task_id).toBe('done');expect(mockDrawer.kind).toBe('tasks');
  expect(api.patch).not.toHaveBeenCalled();
});
test('client switch discards a delayed Calendar response and shows an accurate empty state',async()=>{
  let finish;
  api.get.mockImplementation((_,{params})=>params.client_id==='a'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:calendarBuckets({},{role:'super_admin'},params)}));
  await act(async()=>root.render(<Calendar/>));expect(container.textContent).toContain('Loading Calendar');
  mockCid='b';await act(async()=>root.render(<Calendar/>));
  await act(async()=>finish({data:calendarBuckets(records,{role:'super_admin'},{start:day,end:day})}));
  expect(container.textContent).not.toContain('Current work');expect(container.textContent).toContain('No active items scheduled');
});
test('errors are explicit and retryable, not rendered as successful empty calendars',async()=>{
  api.get.mockRejectedValueOnce(new Error('Calendar unavailable'));
  await act(async()=>root.render(<Calendar/>));
  expect(container.querySelector('[role="alert"]').textContent).toContain('Calendar unavailable');
  expect(container.textContent).not.toContain('No active items');
  await act(async()=>button('Retry Calendar').click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain('Current work');
});

function drop(key,target) {
  const event=new Event('drop',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'dataTransfer',{value:{getData:()=>JSON.stringify({key})}});
  container.querySelector(`[data-testid="cal-day-${target}"]`).dispatchEvent(event);
}
test('a stale active chip cannot reschedule work completed since the Calendar loaded',async()=>{
  await act(async()=>root.render(<Calendar/>));
  records.tasks[0].status='done';
  await act(async()=>drop('task:open:current',day));
  expect(api.patch).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain('Current work');
});
test('an eligible date move preserves its original time and offset via the authoritative update',async()=>{
  records.tasks[0].due_date=day+'T14:30:00-04:00';
  api.patch.mockImplementation(async(_,patch)=>{Object.assign(records.tasks[0],patch);return {data:records.tasks[0]};});
  await act(async()=>root.render(<Calendar/>));
  const target=[...container.querySelectorAll('[data-testid^="cal-day-"]')].map(e=>e.dataset.testid.slice(8)).find(d=>d!==day);
  await act(async()=>drop('task:open:current',target));
  expect(api.patch).toHaveBeenCalledWith('/tasks/open',{due_date:target+'T14:30:00-04:00'});
  expect(container.querySelector(`[data-testid="cal-day-${target}"]`).textContent).toContain('Current work');
});
