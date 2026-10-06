import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Calendar from './Calendar';
import api from '@/lib/api';
import {calendarBuckets,localCalendarDate} from '@/lib/calendarView';
let mockCid='a',mockDrawer,mockUser={role:'super_admin',user_id:'admin'};
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockCid,currentClient:{name:mockCid}})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));
jest.mock('@/components/RecordDrawer',()=>props=>{mockDrawer=props;return <div data-testid="opened-record">{props.record.title}</div>;});
let root,container,records;
const day=localCalendarDate(new Date());
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockCid='a';mockDrawer=null;
  mockUser={role:'super_admin',user_id:'admin'};
  sessionStorage.clear();localStorage.clear();
  global.crypto=require('crypto').webcrypto;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  records={tasks:[{task_id:'open',client_id:'a',title:'Current work',status:'open',due_date:day},{task_id:'done',client_id:'a',title:'Finished work',status:'done',due_date:day}],reviews:[],findings:[]};
  api.patch.mockReset();
  api.get.mockImplementation(async(path,{params}={})=>({data:path==='/calendar'?calendarBuckets(params.client_id==='a'?records:{},{role:'super_admin'},params):records.tasks.find(t=>path.endsWith('/'+t.task_id))}));
});
test('same-client identity switch cancels old reads and cannot install a delayed popup',async()=>{
  let finish;
  await act(async()=>root.render(<Calendar/>));
  const original=api.get.getMockImplementation();
  api.get.mockImplementation((path,options)=>path==='/tasks/open'?new Promise(resolve=>{finish=resolve;}):original(path,options));
  await act(async()=>container.querySelector('[data-testid="cal-item-task:open:current"]').click());
  mockUser={role:'client_reader',user_id:'reader'};
  await act(async()=>root.render(<Calendar/>));
  await act(async()=>finish({data:records.tasks[0]}));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(api.get.mock.calls.filter(([path])=>path==='/calendar')).toHaveLength(2);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('Month default includes completed records, no terminal drag, scheduling popup opens the exact operational ticket',async()=>{
  await act(async()=>root.render(<Calendar/>));
  expect(button('Month').getAttribute('aria-pressed')).toBe('true');
  expect(button('Active')).toBeUndefined();expect(button('Completed / Closed')).toBeUndefined();
  expect(container.textContent).toContain('Finished work');
  expect(container.querySelector('[data-testid="cal-item-task:open:current"]').draggable).toBe(true);
  const completed=container.querySelector('[data-testid="cal-item-task:done:current"]');
  expect(completed.textContent).toContain('Action item · Completed');expect(completed.draggable).toBe(false);
  expect(completed.getAttribute('aria-label')).toContain('Completed');
  await act(async()=>completed.click());
  expect(mockDrawer).toBeNull();expect(document.querySelector('input[type="date"]').disabled).toBe(true);
  await act(async()=>document.querySelector('[role="dialog"] a').click());
  expect(mockDrawer.record.task_id).toBe('done');expect(mockDrawer.kind).toBe('tasks');
  expect(api.patch).not.toHaveBeenCalled();
});
test('client switch discards a delayed Calendar response and shows an accurate empty state',async()=>{
  let finish;
  api.get.mockImplementation((_,{params})=>params.client_id==='a'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:calendarBuckets({},{role:'super_admin'},params)}));
  await act(async()=>root.render(<Calendar/>));expect(container.textContent).toContain('Loading Calendar');
  mockCid='b';await act(async()=>root.render(<Calendar/>));
  await act(async()=>finish({data:calendarBuckets(records,{role:'super_admin'},{start:day,end:day})}));
  expect(container.textContent).not.toContain('Current work');expect(container.textContent).toContain('No dated items');
});
test('errors are explicit and retryable, not rendered as successful empty calendars',async()=>{
  api.get.mockRejectedValueOnce(new Error('Calendar unavailable'));
  await act(async()=>root.render(<Calendar/>));
  expect(container.querySelector('[role="alert"]').textContent).toContain('Calendar unavailable');
  expect(container.textContent).not.toContain('No dated items');
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
  const target=container.querySelector('[data-testid^="cal-day-"]').dataset.testid.slice(8);
  await act(async()=>drop('task:open:current',target===day?localCalendarDate(new Date(Date.now()+86400000)):target));
  expect(api.patch).not.toHaveBeenCalled();
  expect(container.querySelector('[data-testid="cal-item-task:open:current"]').draggable).toBe(false);
  expect(container.querySelector('[data-testid="cal-item-task:open:current"]').textContent).toContain('Completed');
});
test('an eligible date move preserves its original time and offset via the authoritative update',async()=>{
  records.tasks[0].due_date=day+'T14:30:00-04:00';
  api.patch.mockImplementation(async(_,patch)=>{Object.assign(records.tasks[0],patch);return {data:records.tasks[0]};});
  await act(async()=>root.render(<Calendar/>));
  const target=[...container.querySelectorAll('[data-testid^="cal-day-"]')].map(e=>e.dataset.testid.slice(8)).find(d=>d!==day);
  await act(async()=>drop('task:open:current',target));
  expect(api.patch).toHaveBeenCalledWith('/tasks/open',{due_date:target+'T14:30:00-04:00',expected_updated_at:null},{headers:{'Idempotency-Key':expect.any(String)}});
  expect(container.querySelector(`[data-testid="cal-day-${target}"]`).textContent).toContain('Current work');
});

test('Today retains Day and Week views, arrows advance the selected unit',async()=>{
  await act(async()=>root.render(<Calendar/>));
  await act(async()=>button('Day').click());
  expect(container.querySelectorAll('[data-testid^="cal-day-"]')).toHaveLength(1);
  await act(async()=>container.querySelector('[data-testid="cal-next"]').click());
  expect(api.get.mock.calls.filter(([p])=>p==='/calendar').at(-1)[1].params.start).toBe(localCalendarDate(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()+1)));
  await act(async()=>button('Today').click());expect(button('Day').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('[data-testid="cal-day-'+day+'"]').textContent).toContain('Current work');
  await act(async()=>button('Week').click());expect(container.querySelectorAll('[data-testid^="cal-day-"]')).toHaveLength(7);
  const first=api.get.mock.calls.filter(([p])=>p==='/calendar').at(-1)[1].params.start;
  await act(async()=>container.querySelector('[data-testid="cal-next"]').click());
  const next=api.get.mock.calls.filter(([p])=>p==='/calendar').at(-1)[1].params.start;
  expect((Date.parse(next)-Date.parse(first))/86400000).toBe(7);
  await act(async()=>button('Today').click());expect(button('Week').getAttribute('aria-pressed')).toBe('true');
});

test('an uncertain drag retains the same command for recovery rather than inventing another save',async()=>{
  api.patch.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({data:{}});
  await act(async()=>root.render(<Calendar/>));
  const target=[...container.querySelectorAll('[data-testid^="cal-day-"]')].map(e=>e.dataset.testid.slice(8)).find(d=>d!==day);
  await act(async()=>drop('task:open:current',target));
  expect(container.textContent).toContain('Response lost');
  await act(async()=>button('Retry save').click());
  expect(api.patch.mock.calls[1]).toEqual(api.patch.mock.calls[0]);
  expect(sessionStorage.length).toBe(0);
});

test('Cancel discards an unsaved date draft and reopening reads the current source',async()=>{
  await act(async()=>root.render(<Calendar/>));
  const chip=()=>container.querySelector('[data-testid="cal-item-task:open:current"]');
  await act(async()=>chip().click());
  const input=document.querySelector('input[type="date"]');
  const target=localCalendarDate(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()+1));
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,target);
    input.dispatchEvent(new Event('change',{bubbles:true}));
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(document.querySelector('input[type="date"]').value).toBe(target);
  expect(button('Save date').disabled).toBe(false);
  await act(async()=>button('Cancel').click());
  await act(async()=>chip().click());
  expect(document.querySelector('input[type="date"]').value).toBe(day);
  expect(api.patch).not.toHaveBeenCalled();
});
