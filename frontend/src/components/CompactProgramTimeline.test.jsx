import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CompactProgramTimeline,{timelineAxisVisibleLabels} from './CompactProgramTimeline';
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);jest.useFakeTimers();jest.setSystemTime(new Date('2026-12-15T12:00:00Z'));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});
test('dense compact chart exposes all exact members and opens selected native record without writes',async()=>{
 const events=Array.from({length:9},(_,index)=>({id:`saved-${index}`,title:`Saved ${index}`,label:'Review due',kind:'review',date:'2027-01-31',record:{review_id:`r-${index}`}})),before=JSON.stringify(events),onOpen=jest.fn();
 await act(async()=>root.render(<CompactProgramTimeline events={events} onOpen={onOpen} legend={[{kind:'review',label:'Review'}]}/>));
 expect(container.querySelectorAll('.cpt-lane')).toHaveLength(3);expect(container.querySelectorAll('.compact-program-coming button')).toHaveLength(3);expect(container.textContent).toContain('Jan 2027');
 await act(async()=>container.querySelector('.cpt-event').click());
 const preview=document.querySelector('.cpt-member-list');expect(preview.querySelectorAll('[data-event-id]')).toHaveLength(9);
 await act(async()=>preview.querySelector('[data-event-id="saved-7"] button').click());expect(onOpen).toHaveBeenCalledWith(events[7]);expect(JSON.stringify(events)).toBe(before);
 await act(async()=>[...container.querySelectorAll('button')].find(node=>node.textContent==='View data').click());expect(container.querySelectorAll('tbody tr')).toHaveLength(9);
});
test('Risk variant adds exactly one row and one upcoming entry; empty/unknown are distinct',async()=>{
 const events=Array.from({length:6},(_,i)=>({id:`r-${i}`,title:`Risk ${i}`,label:'Risk review',date:'2027-01-01'}));
 await act(async()=>root.render(<CompactProgramTimeline events={events} rows={4} upcomingLimit={4}/>));expect(container.querySelectorAll('.cpt-lane')).toHaveLength(4);expect(container.querySelectorAll('.compact-program-coming button')).toHaveLength(4);
 await act(async()=>root.render(<CompactProgramTimeline events={events} available={false}/>));expect(container.textContent).toContain('Dates unavailable');expect(container.querySelectorAll('.cpt-event')).toHaveLength(0);
});

test('measured axis collisions retain January year without shrinking fonts or dropping noncolliding labels',()=>{
 const labels=[{id:'Nov',left:915,right:937},{id:'Dec',left:952.85,right:974.44},{id:'Jan2027',left:961.13,right:1014.31,year:true},{id:'Feb',left:1001.75,right:1021.83},{id:'Mar',left:1041,right:1064}];
 expect(timelineAxisVisibleLabels(labels)).toEqual(['Jan2027','Mar','Nov']);
 const wide=labels.map((label,index)=>({...label,left:index*100,right:index*100+(label.right-label.left)}));
 expect(timelineAxisVisibleLabels(wide)).toEqual(['Dec','Feb','Jan2027','Mar','Nov']);
 expect(timelineAxisVisibleLabels(labels)).toEqual(timelineAxisVisibleLabels([...labels].reverse()));
});

test('rendered axis applies measured collision visibility and restores labels after a wider resize',async()=>{
 let spacing=30;
 const original=Element.prototype.getBoundingClientRect;
 const bounds=jest.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){
   if(this.dataset?.monthKey){const month=new Date(this.dataset.monthKey).getUTCMonth(),left=100+month*spacing,width=month===0?54:22;return {left,right:left+width,top:0,bottom:20,width,height:20};}
   return original.call(this);
 });
 try{
  await act(async()=>root.render(<CompactProgramTimeline/>));
  const january=container.querySelector('[data-year="true"]'),february=container.querySelector('[data-month-key="2027-02-01T00:00:00.000Z"]');
  expect(january.style.visibility).not.toBe('hidden');expect(february.style.visibility).toBe('hidden');
  spacing=100;await act(async()=>window.dispatchEvent(new Event('resize')));
  expect(february.style.visibility).not.toBe('hidden');expect(january.textContent).toContain('2027');
 }finally{bounds.mockRestore();}
});


const focusEvents=()=>[{id:'review:one:occurrence',title:'Exact Review',label:'Review due',date:'2027-01-31',record:{client_id:'client-one',review_id:'one'}}];
const flushFocusFrame=()=>act(async()=>jest.advanceTimersByTime(20));
async function openClusterMember(){
 await act(async()=>container.querySelector('.cpt-event').click());
 await act(async()=>document.querySelector('.cpt-member-list [data-event-id] button').click());
}
test('cluster member native editor close restores its stable trigger across recreated event arrays',async()=>{
 const scopeKey='actor-one:standard:client-one',onOpen=jest.fn();
 const render=recordOpen=>act(async()=>root.render(<CompactProgramTimeline events={focusEvents()} scopeKey={scopeKey} recordOpen={recordOpen} onOpen={onOpen}/>));
 await render(false);const trigger=container.querySelector('.cpt-event');await openClusterMember();
 expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({id:'review:one:occurrence'}));
 await render(true);
 const nativeControl=document.createElement('button');document.body.appendChild(nativeControl);await act(async()=>{nativeControl.focus();nativeControl.remove();});
 await render(false);await flushFocusFrame();expect(document.activeElement).toBe(trigger);
});
test.each(['actor-two:standard:client-one','actor-one:standard:client-two'])('cluster return target never crosses changed actor/client scope %s',async nextScope=>{
 const onOpen=jest.fn(),render=(recordOpen,scopeKey)=>act(async()=>root.render(<CompactProgramTimeline events={focusEvents()} scopeKey={scopeKey} recordOpen={recordOpen} onOpen={onOpen}/>));
 await render(false,'actor-one:standard:client-one');const nativeCapturedTrigger=container.querySelector('.cpt-event');await openClusterMember();await render(true,'actor-one:standard:client-one');
 const other=document.createElement('button');document.body.appendChild(other);await act(async()=>other.focus());
 await render(false,nextScope);await flushFocusFrame();expect(nativeCapturedTrigger.isConnected).toBe(false);expect(container.querySelector('.cpt-event')).not.toBe(nativeCapturedTrigger);expect(document.activeElement).toBe(other);other.remove();
});
test('same-scope native save removing the opened event returns to current View data instead of a stale bucket',async()=>{
 const scopeKey='actor:standard:client-one',render=(recordOpen,events)=>act(async()=>root.render(<CompactProgramTimeline events={events} scopeKey={scopeKey} recordOpen={recordOpen} onOpen={()=>{}}/>));
 await render(false,focusEvents());await openClusterMember();await render(true,focusEvents());
 await render(false,[]);await flushFocusFrame();expect(document.activeElement).toBe([...container.querySelectorAll('button')].find(node=>node.textContent==='View data'));
});
test('Coming up and refused cluster opens do not leave a focus target for another native editor',async()=>{
 const scopeKey='actor:standard:client-one',render=recordOpen=>act(async()=>root.render(<CompactProgramTimeline events={focusEvents()} scopeKey={scopeKey} recordOpen={recordOpen} onOpen={()=>{}}/>));
 await render(false);await openClusterMember();await flushFocusFrame();
 await act(async()=>container.querySelector('.compact-program-coming button').click());await render(true);
 const other=document.createElement('button');document.body.appendChild(other);await act(async()=>other.focus());
 await render(false);await flushFocusFrame();expect(document.activeElement).toBe(other);other.remove();
});

test('delayed native record fetch retains cluster return target until its Promise and editor finish',async()=>{
 let finishOpen;const opening=new Promise(resolve=>{finishOpen=resolve;}),scopeKey='actor:standard:client-one';
 const render=recordOpen=>act(async()=>root.render(<CompactProgramTimeline events={focusEvents()} scopeKey={scopeKey} recordOpen={recordOpen} onOpen={()=>opening}/>));
 await render(false);const trigger=container.querySelector('.cpt-event');await openClusterMember();
 await flushFocusFrame();await flushFocusFrame();
 await render(true);await act(async()=>finishOpen());await flushFocusFrame();
 const nativeControl=document.createElement('button');document.body.appendChild(nativeControl);await act(async()=>{nativeControl.focus();nativeControl.remove();});
 await render(false);await flushFocusFrame();expect(document.activeElement).toBe(trigger);
});
test('native close during same-scope refresh focuses the stable heading while View data is disabled',async()=>{
 const scopeKey='actor:standard:client-one',render=(recordOpen,available)=>act(async()=>root.render(<CompactProgramTimeline events={focusEvents()} scopeKey={scopeKey} recordOpen={recordOpen} available={available} onOpen={()=>{}}/>));
 await render(false,true);await openClusterMember();await render(true,true);
 await render(false,false);await flushFocusFrame();
 expect(document.activeElement).toBe(container.querySelector('.cpt-head h3'));expect(document.activeElement.textContent).toBe('Next 12 months');
 expect([...container.querySelectorAll('button')].find(node=>node.textContent==='View data').disabled).toBe(true);
});

test('a refused native open returns focus immediately to its same-scope stable cluster trigger',async()=>{
 const scopeKey='actor:standard:client-one',onOpen=jest.fn(async()=>undefined);
 await act(async()=>root.render(<CompactProgramTimeline events={focusEvents()} scopeKey={scopeKey} onOpen={onOpen}/>));
 const trigger=container.querySelector('.cpt-event');await act(async()=>trigger.focus());await openClusterMember();
 await flushFocusFrame();expect(onOpen).toHaveBeenCalledTimes(1);expect(document.activeElement).toBe(trigger);
 expect(document.querySelector('.cpt-member-list')).toBeNull();
});

test('native record entry captures the stable cluster trigger instead of its transient preview member',async()=>{
 let nativeInvoker;const onOpen=jest.fn(()=>{nativeInvoker=document.activeElement;});
 await act(async()=>root.render(<CompactProgramTimeline events={focusEvents()} scopeKey="actor:standard:client-one" onOpen={onOpen}/>));
 const trigger=container.querySelector('.cpt-event');await openClusterMember();
 expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({id:'review:one:occurrence'}));
 expect(nativeInvoker).toBe(trigger);expect(nativeInvoker.isConnected).toBe(true);
 expect(nativeInvoker.closest('.cpt-member-list')).toBeNull();
});
