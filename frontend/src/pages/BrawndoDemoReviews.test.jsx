import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoDemoReviews,{BrawndoReviewRows} from './BrawndoDemoReviews';
let root,container;
const review={review_id:'review',client_id:'demo_brawndo',title:'Actual review',status:'in_progress',due_date:'2026-10-31',recurrence:'monthly',owner_id:'owner',occurrences:[{occurrence_id:'completed-original',status:'completed',completed_by:'actor',due_date:'2026-09-30',completed_at:'2026-10-01'}]};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('target workload supports data, hide, keyboard and native summary selection without writes',async()=>{
  const onView=jest.fn();await act(async()=>root.render(<BrawndoDemoReviews rows={[review]} view="all" onView={onView} theme="light"/>));
  const svg=container.querySelector('svg');expect(svg.getAttribute('viewBox')).toBe('0 0 1000 172');
  await act(async()=>svg.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(container.querySelector('.bdr-tip')).toBeTruthy();
  const click=async text=>act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent===text).click());
  await click('View data');expect(container.querySelectorAll('.bdr-data tbody tr')).toHaveLength(12);
  await act(async()=>container.querySelectorAll('.bdr-kcell')[1].click());expect(onView).toHaveBeenCalledWith('overdue');
  await click('Hide chart');expect(container.querySelector('svg')).toBeNull();
});
test('History opens the original review with exact persisted occurrence and actor',async()=>{
  const onOpen=jest.fn();await act(async()=>root.render(<BrawndoReviewRows rows={[review]} users={[{user_id:'actor',name:'Historical actor'}]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} history onOpen={onOpen} rowMenu={()=>null}/>));
  expect(container.textContent).toContain('Historical actor');expect(container.textContent).toContain('Actual review');
  await act(async()=>container.querySelector('.bdr-name').click());
  expect(onOpen.mock.calls[0][0]._review).toBe(review);expect(onOpen.mock.calls[0][0]._execution.occurrence_id).toBe('completed-original');
});
test('legacy missing historical dates and actor never inherit latest parent completion',async()=>{
  const row={...review,completed_by:'latest',completed_at:'2026-10-15',completion_date:'2026-10-15',occurrences:[{occurrence_id:'legacy',status:'completed'},{occurrence_id:'cancelled',status:'cancelled'}]};
  await act(async()=>root.render(<BrawndoReviewRows rows={[row]} users={[{user_id:'latest',name:'Latest actor'}]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} history onOpen={()=>{}} rowMenu={()=>null}/>));
  expect(container.textContent).not.toContain('Latest actor');expect(container.textContent).toContain('Actor not recorded');expect(container.textContent).toContain('Due date not recorded');expect(container.textContent).toContain('Date not recorded');expect(container.textContent).toContain('Cancelled');
});
test('unavailable summaries use unknown values and keep the chart frame without fabricated zero totals',async()=>{
  await act(async()=>root.render(<BrawndoDemoReviews rows={[]} available={false} view="all" onView={()=>{}} theme="light"/>));
  expect([...container.querySelectorAll('.bdr-kcell strong')].map(node=>node.textContent)).toEqual(['—','—','—','—']);
  expect([...container.querySelectorAll('.bdr-kcell')].every(node=>node.disabled)).toBe(true);expect(container.querySelector('svg')).toBeTruthy();expect(container.querySelector('.bdr-value')).toBeNull();
});

test('genuine native controls remain reachable in the compact result-row disclosure',async()=>{
 const filter=jest.fn();await act(async()=>root.render(<BrawndoReviewRows rows={[review]} users={[]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} onOpen={()=>{}} rowMenu={()=>null} controls={<button onClick={filter}>Native status filter</button>}/>));
 const details=container.querySelector('.bdr-more');expect(details.parentElement.className).toBe('bdr-summary');expect(details.open).toBe(false);
 await act(async()=>details.querySelector('summary').click());expect(details.open).toBe(true);
 const control=details.querySelector('button');control.focus();expect(document.activeElement).toBe(control);
 await act(async()=>control.click());expect(filter).toHaveBeenCalledTimes(1);
 expect(container.querySelector('.bdr-name').textContent).toBe('Actual review');
});

describe('native workload tooltip',()=>{
  let bounds,originalObserver,observers,viewport,chartBounds,tipSize;
  const rectangle=({left=0,top=0,width=0,height=0})=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top});
  const key=async(svg,value)=>act(async()=>svg.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true})));
  const click=async text=>act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent===text).click());
  const render=async props=>act(async()=>root.render(<BrawndoDemoReviews rows={[review]} view="all" onView={()=>{}} theme="light" {...props}/>));
  const cohort=()=>Object.freeze([
    {review_id:'complete',title:'Completed evidence review',status:'completed',recurrence:'none',due_date:'2026-10-03',completed_at:'2026-10-03'},
    {review_id:'late',title:'Overdue monthly review',status:'in_progress',recurrence:'monthly',due_date:'2026-09-30'},
    {review_id:'monthly',title:'Upcoming monthly review',status:'upcoming',recurrence:'monthly',due_date:'2026-10-31'},
    ...[20,21,22,23].map(day=>({review_id:'due-'+day,title:'Due review '+day,status:'upcoming',recurrence:'none',due_date:'2026-10-'+day})),
  ].map(Object.freeze));

  beforeEach(()=>{
    jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    viewport={width:Object.getOwnPropertyDescriptor(window,'innerWidth'),height:Object.getOwnPropertyDescriptor(window,'innerHeight')};
    Object.defineProperty(window,'innerWidth',{configurable:true,value:1180});
    Object.defineProperty(window,'innerHeight',{configurable:true,value:875});
    chartBounds={left:100,top:180,width:1000,height:172};tipSize={width:280,height:260};
    const originalBounds=Element.prototype.getBoundingClientRect;
    bounds=jest.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){
      if(this.matches('.bdr-chart,.bdr-chart svg'))return rectangle(chartBounds);
      if(this.matches('.bdr-tip'))return rectangle(tipSize);
      return originalBounds.call(this);
    });
    originalObserver=global.ResizeObserver;observers=[];
    global.ResizeObserver=class{
      constructor(callback){this.callback=callback;this.targets=new Set();this.disconnected=false;observers.push(this);}
      observe(target){this.targets.add(target);}
      disconnect(){this.disconnected=true;this.targets.clear();}
    };
  });

  afterEach(()=>{
    bounds.mockRestore();global.ResizeObserver=originalObserver;
    Object.defineProperty(window,'innerWidth',viewport.width);
    Object.defineProperty(window,'innerHeight',viewport.height);
    jest.useRealTimers();
  });

  test('grouped counts and five dated previews retain actual occurrences, native projections and the exact remainder without writing rows',async()=>{
    const rows=cohort(),before=JSON.stringify(rows),onView=jest.fn();await render({rows,onView});
    const figures=[...container.querySelectorAll('.bdr-kcell')];
    expect(figures.map(figure=>figure.querySelector('strong').textContent)).toEqual(['6','1','5','1']);
    const shortDay=day=>new Date(day+'T00:00:00Z').toLocaleDateString(undefined,{timeZone:'UTC'});
    expect(figures.map(figure=>figure.querySelector('small').textContent)).toEqual([
      '5 due in the next 90 days','Oldest 18 days past due','Next due '+shortDay('2026-10-20'),'Latest '+shortDay('2026-10-03'),
    ]);
    const svg=container.querySelector('.bdr-chart svg');await act(async()=>svg.focus());await key(svg,'Home');
    let tip=container.querySelector('.bdr-tip');
    expect(tip.getAttribute('role')).toBe('status');expect(svg.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.querySelector('.v').textContent).toBe('8 occurrences');
    expect([...tip.querySelectorAll('.r')].map(row=>[row.querySelector('span').textContent,row.querySelector('b').textContent])).toEqual([['Completed','1'],['Due','6'],['Overdue','1']]);
    expect(tip.querySelectorAll('.r .bdr-key')).toHaveLength(3);expect(tip.textContent).toContain('1 projected future cycles');
    const previews=[...tip.querySelectorAll('.rows .li')];expect(previews).toHaveLength(5);
    expect(previews.map(row=>row.querySelector('time').getAttribute('dateTime'))).toEqual(['2026-10-03','2026-09-30','2026-10-31T00:00:00.000Z','2026-10-31','2026-10-20']);
    expect(previews.map(row=>row.querySelector('.bdr-tip-title').textContent)).toEqual(['Completed evidence review','Overdue monthly review','Overdue monthly review','Upcoming monthly review','Due review 20']);
    expect(previews.map(row=>row.querySelector('.bdr-tip-kind').textContent)).toEqual(['Completed','Overdue','Projected','Due','Due']);
    expect(tip.querySelector('.bdr-tip-more').textContent).toBe('+3 more');
    await click('View data');const firstDataRow=container.querySelector('.bdr-data tbody tr');
    expect([...firstDataRow.querySelectorAll('td')].slice(1).map(cell=>cell.textContent)).toEqual(['1','6','1','1']);
    await key(svg,'ArrowRight');tip=container.querySelector('.bdr-tip');
    expect(tip.textContent).toContain('November 2026');expect(tip.querySelector('.v').textContent).toBe('2 occurrences');
    expect(tip.textContent).toContain('2 projected future cycles');expect(tip.querySelector('.bdr-tip-more')).toBeNull();
    await act(async()=>figures[1].click());expect(onView).toHaveBeenCalledWith('overdue');
    expect(JSON.stringify(rows)).toBe(before);
  });

  test('empty and unavailable summary context does not invent overdue dates or completions',async()=>{
    await render({rows:[]});
    expect([...container.querySelectorAll('.bdr-kcell small')].map(node=>node.textContent)).toEqual(['0 due in the next 90 days','Nothing past due','Nothing due in 30 days','None in 90 days']);
    await render({rows:cohort(),available:false});
    expect([...container.querySelectorAll('.bdr-kcell small')].map(node=>node.textContent)).toEqual(['—','—','—','—']);
    expect(container.querySelector('.bdr-workload .bdr-card-head p').textContent).toContain('unavailable');
  });

  test('first and last keyboard months use measured viewport bounds and remain readable after a narrow resize',async()=>{
    await render();const svg=container.querySelector('.bdr-chart svg');
    await act(async()=>svg.focus());await key(svg,'Home');
    let tip=container.querySelector('.bdr-tip');expect(tip.textContent).toContain('October 2026');
    const firstLeft=parseFloat(tip.style.left);
    await key(svg,'End');tip=container.querySelector('.bdr-tip');
    expect(tip.textContent).toContain('September 2027');expect(parseFloat(tip.style.left)).toBeGreaterThan(firstLeft);
    expect(parseFloat(tip.style.left)+tipSize.width).toBeLessThanOrEqual(window.innerWidth-8);

    Object.defineProperty(window,'innerWidth',{configurable:true,value:390});
    Object.defineProperty(window,'innerHeight',{configurable:true,value:550});
    chartBounds={left:16,top:180,width:358,height:172};tipSize={width:280,height:400};
    await act(async()=>window.dispatchEvent(new Event('resize')));
    tip=container.querySelector('.bdr-tip');const left=parseFloat(tip.style.left),top=parseFloat(tip.style.top);
    expect(left).toBeGreaterThanOrEqual(8);expect(left+tipSize.width).toBeLessThanOrEqual(382);
    expect(top).toBeGreaterThanOrEqual(8);expect(top+tipSize.height).toBeLessThanOrEqual(542);
    expect(document.activeElement).toBe(svg);expect(tip.textContent).toContain('September 2027');
  });

  test('Escape, blur, hidden or unavailable charts and an open native record suppress the tooltip',async()=>{
    await render();let svg=container.querySelector('.bdr-chart svg');
    const show=async()=>{await act(async()=>svg.focus());await key(svg,'Home');expect(container.querySelector('.bdr-tip')).not.toBeNull();};
    await show();let tip=container.querySelector('.bdr-tip');
    await act(async()=>tip.focus());expect(document.activeElement).toBe(tip);expect(container.querySelector('.bdr-tip')).toBe(tip);
    await key(tip,'Escape');expect(document.activeElement).toBe(svg);expect(container.querySelector('.bdr-tip')).toBeNull();
    await show();await key(svg,'Escape');expect(container.querySelector('.bdr-tip')).toBeNull();
    await show();await act(async()=>container.querySelector('.bdr-links button').focus());expect(container.querySelector('.bdr-tip')).toBeNull();
    await show();await click('Hide chart');expect(container.querySelector('.bdr-tip')).toBeNull();expect(container.querySelector('.bdr-chart svg')).toBeNull();
    await click('Show chart');svg=container.querySelector('.bdr-chart svg');await show();
    await render({available:false});expect(container.querySelector('.bdr-tip')).toBeNull();
    await key(svg,'End');expect(container.querySelector('.bdr-tip')).toBeNull();
    await render({available:true,recordOpen:true});svg=container.querySelector('.bdr-chart svg');
    await act(async()=>svg.focus());await key(svg,'Home');expect(container.querySelector('.bdr-tip')).toBeNull();
    await render({recordOpen:false});await show();
  });

  test('unmount removes measured-tooltip observers and global reposition listeners',async()=>{
    const targets=[window,document],spies=targets.map(target=>({target,add:jest.spyOn(target,'addEventListener'),remove:jest.spyOn(target,'removeEventListener')}));
    try{
      await render();const svg=container.querySelector('.bdr-chart svg');
      await act(async()=>svg.focus());await key(svg,'Home');expect(container.querySelector('.bdr-tip')).not.toBeNull();
      const listeners=spies.flatMap(({target,add})=>add.mock.calls.filter(([type])=>['resize','scroll'].includes(type)).map(([type,listener])=>({target,type,listener})));
      expect(listeners.some(({type})=>type==='resize')).toBe(true);
      expect(listeners.some(({type})=>type==='scroll')).toBe(true);
      expect(observers.some(observer=>observer.targets.size)).toBe(true);
      await act(async()=>root.render(null));
      expect(container.querySelector('.bdr-tip')).toBeNull();expect(observers.every(observer=>observer.disconnected)).toBe(true);
      for(const {target,type,listener} of listeners){
        const removals=spies.find(spy=>spy.target===target).remove.mock.calls;
        expect(removals.some(([removedType,removedListener])=>removedType===type&&removedListener===listener)).toBe(true);
      }
      await act(async()=>{window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('scroll'));});
      expect(container.querySelector('.bdr-tip')).toBeNull();
    }finally{for(const {add,remove} of spies){add.mockRestore();remove.mockRestore();}}
  });
});
