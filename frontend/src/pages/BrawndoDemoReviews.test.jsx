import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'fs';
import {join} from 'path';
import postcss from 'postcss';
import BrawndoDemoReviews,{BrawndoReviewRows} from './BrawndoDemoReviews';
let root,container;
const review={review_id:'review',client_id:'demo_brawndo',title:'Actual review',status:'in_progress',due_date:'2026-10-31',recurrence:'monthly',owner_id:'owner',occurrences:[{occurrence_id:'completed-original',status:'completed',completed_by:'actor',due_date:'2026-09-30',completed_at:'2026-10-01'}]};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('approved summary selects the native destination independently of quarter presentation',async()=>{
  const onView=jest.fn();await act(async()=>root.render(<BrawndoDemoReviews rows={[review]} view="all" onView={onView} theme="light"/>));
  const cards=[...container.querySelectorAll('.kpi')];expect(cards).toHaveLength(4);
  expect(cards[0].textContent).toContain('Active reviews');expect(cards[0].querySelector('strong').textContent).toBe('1');
  await act(async()=>cards[1].click());expect(onView).toHaveBeenCalledWith('overdue');
  expect(container.querySelector('.bdr-workload')).toBeNull();expect(container.textContent).toContain('Calendar quarter');
});
test('History opens the original review with exact persisted occurrence and actor',async()=>{
  const onOpen=jest.fn();await act(async()=>root.render(<BrawndoReviewRows rows={[review]} users={[{user_id:'actor',name:'Historical actor'}]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} history onOpen={onOpen} rowMenu={()=>null}/>));
  expect(container.textContent).toContain('Historical actor');expect(container.textContent).toContain('Actual review');
  await act(async()=>container.querySelector('.bdr-name').click());
  expect(onOpen.mock.calls[0][0]._review).toBe(review);expect(onOpen.mock.calls[0][0]._execution.occurrence_id).toBe('completed-original');
});

test.each([
  ['empty client people',[]],
  ['renamed current account',[{user_id:'actor',name:'Renamed current account'}]],
])('History retains the saved occurrence actor with %s',async(label,users)=>{
  const occurrence={...review.occurrences[0],completed_by_name:'Saved completion actor'};
  const row={...review,completed_by_name:'Latest parent actor',occurrences:[occurrence]};
  await act(async()=>root.render(<BrawndoReviewRows rows={[row]} users={users} checked={new Set()} history onOpen={()=>{}} rowMenu={()=>null}/>));
  expect(container.querySelector('.bdr-owner').textContent).toBe('SCSaved completion actor');
  expect(container.textContent).not.toContain('Latest parent actor');
  expect(container.textContent).not.toContain('Renamed current account');
  expect(container.textContent).not.toContain('Former user');
});

test('History keeps each saved actor and exact native opening identity without changing cancelled history or records',async()=>{
  const occurrences=[
    {occurrence_id:'first',status:'completed',completed_by:'first-actor',completed_by_name:'First reviewer',due_date:'2026-08-31',completed_at:'2026-09-01'},
    {occurrence_id:'second',status:'completed',completed_by:'second-actor',completed_by_name:'Second reviewer',due_date:'2026-09-30',completed_at:'2026-10-01'},
    {occurrence_id:'cancelled',status:'cancelled',due_date:'2026-10-31'},
  ];
  const row={...review,completed_by:'latest-parent',completed_by_name:'Latest parent actor',occurrences};
  const before=JSON.stringify(row),onOpen=jest.fn(),toggleOne=jest.fn(),toggleAll=jest.fn();
  await act(async()=>root.render(<BrawndoReviewRows rows={[row]} users={[]} checked={new Set()} history onOpen={onOpen} toggleOne={toggleOne} toggleAll={toggleAll} rowMenu={()=>null}/>));
  expect([...container.querySelectorAll('.bdr-owner > span:last-child')].map(node=>node.textContent)).toEqual(['First reviewer','Second reviewer','Actor not recorded']);
  expect(container.querySelectorAll('tbody input')).toHaveLength(0);
  const renderedRows=[...container.querySelectorAll('tbody tr')];
  expect(renderedRows[2].textContent).toContain('Cancelled');
  expect(renderedRows[2].querySelector('.bdr-c-cad').textContent).toBe('Cancelled');
  expect(renderedRows[0].querySelector('time').dateTime).toBe(occurrences[0].due_date);
  for(const renderedRow of renderedRows)await act(async()=>renderedRow.querySelector('.bdr-name').click());
  expect(onOpen).toHaveBeenCalledTimes(3);
  onOpen.mock.calls.forEach(([opened],index)=>{
    expect(opened._review).toBe(row);expect(opened._execution).toBe(occurrences[index]);
    expect(opened.review_id).toBe(row.review_id);expect(opened.occurrence_id).toBe(occurrences[index].occurrence_id);
  });
  expect(toggleOne).not.toHaveBeenCalled();expect(toggleAll).not.toHaveBeenCalled();
  expect(JSON.stringify(row)).toBe(before);
});

test.each([
  ['legacy occurrence without actor',{occurrence_id:'legacy',status:'completed'},[], 'Actor not recorded'],
  ['legacy occurrence with current scoped actor',{occurrence_id:'legacy-scoped',status:'completed',completed_by:'legacy-actor'},[{user_id:'legacy-actor',name:'Scoped historical actor'}],'Scoped historical actor'],
  ['unresolved opaque actor',{occurrence_id:'unknown',status:'completed',completed_by:'opaque-private-actor'},[],'Former user'],
])('History preserves the safe fallback for %s without inheriting the parent name',async(label,occurrence,users,expected)=>{
  const row={...review,completed_by:'latest-parent',completed_by_name:'Latest parent actor',occurrences:[occurrence]};
  await act(async()=>root.render(<BrawndoReviewRows rows={[row]} users={users} checked={new Set()} history onOpen={()=>{}} rowMenu={()=>null}/>));
  expect(container.querySelector('.bdr-owner > span:last-child').textContent).toBe(expected);
  expect(container.textContent).not.toContain('Latest parent actor');
  expect(container.textContent).not.toContain('opaque-private-actor');
});

test('History displays a saved name-only occurrence while Active keeps the current owner',async()=>{
  const occurrence={occurrence_id:'name-only',status:'completed',completed_by_name:'Name-only reviewer'};
  const row={...review,completed_by_name:'Latest parent actor',occurrences:[occurrence]};
  const users=[{user_id:'owner',name:'Current assigned owner'}];
  await act(async()=>root.render(<BrawndoReviewRows rows={[row]} users={users} checked={new Set()} history onOpen={()=>{}} rowMenu={()=>null}/>));
  expect(container.querySelector('.bdr-owner > span:last-child').textContent).toBe('Name-only reviewer');
  await act(async()=>root.render(<BrawndoReviewRows rows={[row]} users={users} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} onOpen={()=>{}} rowMenu={()=>null}/>));
  expect(container.querySelector('.bdr-owner > span:last-child').textContent).toBe('Current assigned owner');
  expect(container.textContent).not.toContain('Name-only reviewer');
  expect(container.textContent).not.toContain('Latest parent actor');
});

test('reference status labels preserve native values, unknown fallback and exact row opening',async()=>{
  const rows=['upcoming','in_progress','not_started','needs_scheduling','custom_status','__proto__','constructor','toString'].map((status,index)=>({...review,review_id:`status-${index}`,status}));
  const before=JSON.stringify(rows),onOpen=jest.fn();
  await act(async()=>root.render(<BrawndoReviewRows rows={rows} users={[]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} onOpen={onOpen} rowMenu={()=>null}/>));
  expect([...container.querySelectorAll('.bdr-st')].map(node=>node.textContent)).toEqual(['Upcoming','In progress','Not started','Needs scheduling','custom status','  proto  ','constructor','toString']);
  await act(async()=>container.querySelectorAll('.bdr-name')[1].click());
  expect(onOpen).toHaveBeenCalledWith(rows[1]);expect(JSON.stringify(rows)).toBe(before);
});
test('legacy missing historical dates and actor never inherit latest parent completion',async()=>{
  const row={...review,completed_by:'latest',completed_at:'2026-10-15',completion_date:'2026-10-15',occurrences:[{occurrence_id:'legacy',status:'completed'},{occurrence_id:'cancelled',status:'cancelled'}]};
  await act(async()=>root.render(<BrawndoReviewRows rows={[row]} users={[{user_id:'latest',name:'Latest actor'}]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} history onOpen={()=>{}} rowMenu={()=>null}/>));
  expect(container.textContent).not.toContain('Latest actor');expect(container.textContent).toContain('Actor not recorded');expect(container.textContent).toContain('Due date not recorded');expect(container.textContent).toContain('Date not recorded');expect(container.textContent).toContain('Cancelled');
});
test('unavailable summaries use unknown values and keep the chart frame without fabricated zero totals',async()=>{
  await act(async()=>root.render(<BrawndoDemoReviews rows={[]} available={false} view="all" onView={()=>{}} theme="light"/>));
  expect([...container.querySelectorAll('.kpi strong')].map(node=>node.textContent)).toEqual(['—','—','—','—']);
  expect([...container.querySelectorAll('.kpi')].every(node=>node.disabled)).toBe(true);expect(container.querySelector('.plot')).toBeTruthy();expect(container.querySelector('.review-dot')).toBeNull();
});

test('genuine native controls remain reachable in the compact result-row disclosure',async()=>{
 const filter=jest.fn();await act(async()=>root.render(<BrawndoReviewRows rows={[review]} users={[]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} onOpen={()=>{}} rowMenu={()=>null} controls={<button onClick={filter}>Native status filter</button>}/>));
 const details=container.querySelector('.bdr-more');expect(details.parentElement.className).toBe('bdr-summary');expect(details.open).toBe(false);
 await act(async()=>details.querySelector('summary').click());expect(details.open).toBe(true);
 const control=details.querySelector('button');control.focus();expect(document.activeElement).toBe(control);
 await act(async()=>control.click());expect(filter).toHaveBeenCalledTimes(1);
 expect(container.querySelector('.bdr-name').textContent).toBe('Actual review');
});

test('Recently completed orders actual saved executions rather than the recurring parent completion',async()=>{
 const older={occurrence_id:'older',status:'completed',due_date:'2026-10-01',completed_at:'2026-10-02T12:00:00Z'};
 const newer={occurrence_id:'newer',status:'completed',due_date:'2026-09-01',completed_at:'2026-10-20T12:00:00Z'};
 const row={...review,completed_at:'2099-01-01',occurrences:[older,newer]};
 const onOpen=jest.fn();await act(async()=>root.render(<BrawndoReviewRows rows={[row]} users={[]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} history sortBy="completed_at" sortDir="desc" onOpen={onOpen} rowMenu={()=>null}/>));
 await act(async()=>container.querySelector('.bdr-name').click());
 expect(onOpen.mock.calls[0][0]._execution).toBe(newer);
 expect(onOpen.mock.calls[0][0]._review).toBe(row);
 expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
});

test('reference header typography is confined to the eligible landing table, including under native page chrome',async()=>{
 container.className='bpage';
 await act(async()=>root.render(<BrawndoDemoReviews rows={[review]} view="all" onView={()=>{}}><BrawndoReviewRows rows={[review]} users={[]} checked={new Set()} toggleAll={()=>{}} toggleOne={()=>{}} onOpen={()=>{}} rowMenu={()=>null}/></BrawndoDemoReviews>));
 const styles=postcss.parse(readFileSync(join(__dirname,'../components/CisReviewsConcept.css'),'utf8'));
 const selector=':root .crr-root[data-visual-surface="reviews"] .bdr-table th';
 const rule=styles.nodes.find(node=>node.type==='rule'&&node.selector===selector);
 expect(rule).toBeDefined();
 const declarations=Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
 expect(declarations).toMatchObject({'font-size':'9px','font-weight':'500',color:'var(--muted)',background:'var(--subtle)','text-transform':'none','letter-spacing':'normal'});
 const statusRules=[];styles.walkRules('.crr-root .bdr-st',node=>statusRules.push(node));
 const baseStatus=statusRules.find(node=>node.parent.type==='root');
 const wideStatus=statusRules.find(node=>node.parent.name==='media'&&node.parent.params==='(min-width:1700px)');
 expect(baseStatus.nodes.find(node=>node.prop==='font-size').value).toBe('9px');
 expect(wideStatus.nodes.find(node=>node.prop==='font-size').value).toBe('10px');
 // Equal-specificity rules must apply the wide size after the default, without a later reset.
 expect(statusRules.filter(node=>node.nodes.some(declaration=>declaration.prop==='font-size'))).toEqual([baseStatus,wideStatus]);
 expect(container.querySelector('.bdr-st').matches(wideStatus.selector)).toBe(true);
 const header=container.querySelector('.bdr-table th');
 expect(header.matches(selector)).toBe(true);
 // Native dialogs are body portals; even a similarly named table must stay native.
 const portal=document.createElement('div');portal.className='ui-dialog brawndo-full-record';
 portal.innerHTML='<table class="bdr-table"><thead><tr><th>Native field</th></tr></thead></table><span class="bdr-st">Native status</span>';
 document.body.appendChild(portal);
 try{
   expect(portal.querySelector('th').matches(selector)).toBe(false);
   expect(portal.querySelector('.bdr-st').matches(wideStatus.selector)).toBe(false);
   container.querySelector('.crr-root').removeAttribute('data-visual-surface');
   expect(header.matches(selector)).toBe(false);
 }finally{portal.remove();}
});
