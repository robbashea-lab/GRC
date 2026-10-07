import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ClientWorkDashboard from './ClientWorkDashboard';
jest.mock('react-router-dom',()=>({Link:({to,children,...rest})=><a href={to} {...rest}>{children}</a>}),{virtual:true});
jest.mock('@/lib/api',()=>({formatError:e=>e.message}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const items=Array.from({length:30},(_,i)=>({key:`tasks:${i}`,id:String(i),kind:'tasks',title:`Action ${i}`,type:'Action Item',status:'open',owner:'Unassigned',unassigned:true,source_label:'Manual / Internal',due_date:'2026-09-01'}));
const queue={as_of:'2026-09-27',groups:{all:{total:30,items:items.slice(0,9)},pastDue:{total:30,items:items.slice(0,9)},due30:{total:0,items:[]},unassigned:{total:30,items:items.slice(0,9)}}};
test('compact preview, selected filters, paging, authoritative row open and CIS denominator',async()=>{
  const onOpen=jest.fn(),onFilter=jest.fn(),loadDetail=jest.fn(async(key,offset)=>({items:key==='due30'?[]:items.slice(offset,offset+25),offset,limit:25,total:30,has_more:offset===0}));
  const props={queue,programs:[{key:'cis-ig1',name:'CIS Controls v8.1 IG1'}],cisRows:[{status:'addressed'},{status:'not_applicable'},{status:'not_assessed'}],filter:'all',onFilter,onOpen,loadDetail};
  await act(async()=>root.render(<ClientWorkDashboard {...props}/>));
  expect(container.querySelectorAll('tbody tr')).toHaveLength(9);
  expect(container.querySelector('.quick-filters button[aria-pressed=true]').textContent).toContain('All');
  expect(container.querySelector('.bd-tiles')).toBeNull();
  expect(container.textContent).toContain('1 of 2');expect(container.textContent).toContain('50%');
  expect(container.textContent).not.toContain('Program health');
  const click=async text=>act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click());
  await click('View all 30');expect(container.querySelectorAll('tbody tr')).toHaveLength(25);
  await click('Next page');expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  await click('Action 25');expect(onOpen).toHaveBeenCalledWith(items[25],expect.any(HTMLButtonElement));
  await click('Due in 30 days');expect(onFilter).toHaveBeenCalledWith('due30');
  await act(async()=>root.render(<ClientWorkDashboard {...props} filter="due30"/>));
  expect(container.textContent).toContain('No items match these filters.');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  expect(container.querySelector('a[href="/compliance/cis-ig1"]')).not.toBeNull();
});
test('failed detail request preserves preview and offers retry',async()=>{
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[]} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={async()=>{throw new Error('Unavailable');}}/>));
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes('View all')).click());
  expect(container.querySelector('[role=alert]').textContent).toContain('Unavailable');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(9);
});
test('retrying an expanded page retains its filters, offset and page size',async()=>{
  const loadDetail=jest.fn().mockResolvedValueOnce({items:items.slice(0,25),offset:0,limit:25,total:30,has_more:true})
    .mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({items:items.slice(25),offset:25,limit:25,total:30,has_more:false});
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[]} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={loadDetail}/>));
  const click=async text=>act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click());
  await click('View all');await click('Next page');await click('Retry');
  expect(loadDetail.mock.calls[2][3].limit).toBe(25);
  expect(loadDetail.mock.calls[2][1]).toBe(25);
  expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  expect(container.querySelector('.bd-pagination')).not.toBeNull();
});
test('retrying an initial failed View all preserves expansion intent',async()=>{
  const loadDetail=jest.fn().mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce({items:items.slice(0,25),offset:0,limit:25,total:30,has_more:true});
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[]} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={loadDetail}/>));
  const click=async text=>act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click());
  await click('View all');await click('Retry');
  expect(loadDetail.mock.calls[1][3].limit).toBe(25);
  expect(container.querySelectorAll('tbody tr')).toHaveLength(25);
  expect(container.querySelector('.bd-pagination')).not.toBeNull();
});
test('Back/Forward filter rerenders discard expanded pages and ignore superseded responses',async()=>{
  const makeRows=prefix=>Array.from({length:30},(_,i)=>({...items[i],key:`${prefix}:${i}`,id:`${prefix}-${i}`,title:`${prefix} work ${i}`}));
  const all=makeRows('All'),past=makeRows('Past'),due=makeRows('Due');
  const q={...queue,groups:{all:{total:30,items:all.slice(0,9)},pastDue:{total:30,items:past.slice(0,9)},
    due30:{total:30,items:due.slice(0,9)},unassigned:{total:0,items:[]}}};
  const requests=[];
  const loadDetail=jest.fn((key,offset,signal)=>new Promise((resolve,reject)=>requests.push({key,offset,signal,resolve,reject})));
  const props={queue:q,programs:[],onFilter:jest.fn(),onOpen:jest.fn(),loadDetail};
  const render=filter=>act(async()=>root.render(<ClientWorkDashboard {...props} filter={filter}/>));
  const titles=()=>[...container.querySelectorAll('.bd-item')].map(b=>b.textContent);
  const resolve=async(request,rows)=>act(async()=>request.resolve({items:rows.slice(request.offset,request.offset+25),
    offset:request.offset,limit:25,total:30,has_more:request.offset===0}));
  await render('all');
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes('View all')).click());
  await resolve(requests[0],all);
  expect(titles()).toEqual(all.slice(0,25).map(r=>r.title));
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes('Next page')).click());
  const oldPage=requests[1];
  await render('pastDue'); // URL navigation, not a tile click.
  expect(oldPage.signal.aborted).toBe(true);
  expect(titles()).toEqual(past.slice(0,9).map(r=>r.title));
  const pastRequest=requests[2];
  await render('due30');
  expect(pastRequest.signal.aborted).toBe(true);
  expect(titles()).toEqual(due.slice(0,9).map(r=>r.title));
  await resolve(requests[3],due);
  await resolve(oldPage,all);await resolve(pastRequest,past); // Transport may complete after abort.
  expect(titles()).toEqual(due.slice(0,25).map(r=>r.title));
  expect(container.querySelector('[role=alert]')).toBeNull();
  await render('all'); // Back to the previously expanded filter must start at its own first page.
  expect(titles()).toEqual(all.slice(0,9).map(r=>r.title));
  expect(requests[4].offset).toBe(0);
  await resolve(requests[4],all);
  expect(titles()).toEqual(all.slice(0,25).map(r=>r.title));
  expect(container.querySelector('.bd-pagination')).toBeNull();
});
test.each([['pastDue','No past-due items.'],['due30','No items due in the next 30 days.'],['all','No open priority work.'],['unassigned','All current work is assigned.']])('%s has a compact meaningful empty state',async(filter,message)=>{
  const empty={...queue,groups:Object.fromEntries(Object.keys(queue.groups).map(key=>[key,{total:0,items:[]}]))};
  await act(async()=>root.render(<ClientWorkDashboard queue={empty} programs={[]} filter={filter} onFilter={()=>{}} onOpen={()=>{}} loadDetail={()=>{}}/>));
  expect(container.textContent).toContain('No items match these filters.');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
});
test('tile context tolerates undated or untyped items and the theme choice persists',async()=>{
  const odd=[{key:'x',id:'x',kind:'tasks',title:'Undated work',status:'open',owner:'Unassigned',unassigned:true,due_date:null}];
  const q={as_of:'2026-09-27',groups:Object.fromEntries(['all','pastDue','due30','unassigned'].map(k=>[k,{total:1,items:odd}]))};
  await act(async()=>root.render(<ClientWorkDashboard queue={q} programs={[]} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={()=>{}}/>));
  expect(container.textContent).not.toMatch(/undefined|null|NaN|\d{4,}d late/);
  const toggle=container.querySelector('.bd-theme');
  await act(async()=>toggle.click());
  expect(container.querySelector('.bdash').dataset.theme).toBe('dark');
  expect(localStorage.getItem('omnisciente:brawndo-dashboard-theme')).toBe('dark');
  await act(async()=>toggle.click());localStorage.clear();
});
test('CIS card derives gaps from linked work and links each count to its filtered workspace',async()=>{
  const rows=[{status:'in_progress',work:{open_findings:1,direct_findings:0}},{status:'addressed',last_assessed:new Date().toISOString(),work:{evidence_count:0}},{status:'needs_attention',work:{direct_findings:1}}];
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[{key:'cis-ig1',name:'CIS Controls v8.1 IG1'}]} cisRows={rows} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={()=>{}}/>));
  const gap=container.querySelector('a[href="/compliance/cis-ig1?view=unremediated"]');
  expect(gap.textContent).toBe('Gaps without a finding1');
  expect(container.querySelector('a[href="/compliance/cis-ig1?view=unevidenced"]').textContent).toBe('Implemented without evidence1');
  expect(container.querySelector('.bd-donut').getAttribute('aria-label')).toContain('1 Implemented');
});
