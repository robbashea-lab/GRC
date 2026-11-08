import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CalendarView from './BrawndoDemoCalendar';
import {calendarPeriod,localCalendarDate} from '@/lib/calendarView';
import {THEME_KEY} from '@/lib/brawndoTheme';
test('pilot filters are read-only and open native items; month overflow navigates to Day',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const anchor=new Date(2026,9,16),period=calendarPeriod(anchor),openSchedule=jest.fn(),setView=jest.fn(),setAnchor=jest.fn();
 const entries=Array.from({length:4},(_,n)=>({key:`t${n}`,id:`t${n}`,kind:'task',title:`Task ${n}`,owner_id:'u',date:'2026-10-16',client_id:'demo_brawndo',historical:false,can_reschedule:true,status:'open'}));
 const props={clientName:'Brawndo',anchor,setAnchor,view:'month',setView,period,days:period.days,today:'2026-10-16',entries,summaryEntries:entries,openSchedule,ymd:localCalendarDate,members:[{user_id:'u',name:'Dana Evans'}],setDragging:jest.fn(),setDragOverDay:jest.fn(),onDragStart:jest.fn(),onDrop:jest.fn()};
 const previousTheme=localStorage.getItem(THEME_KEY);localStorage.removeItem(THEME_KEY);
 try {
 await act(async()=>root.render(<CalendarView {...props}/>));expect(container.querySelectorAll('.kcell')).toHaveLength(4);expect(container.querySelector('h1').textContent).toBe('Brawndo Calendar');
 const themeAction=container.querySelector('.surface-theme-action');expect(themeAction.textContent).toBe('Dark');await act(async()=>themeAction.click());expect(container.querySelector('.bdcal').dataset.theme).toBe('dark');expect(themeAction.textContent).toBe('Light');
 const viewButtons=[...container.querySelectorAll('[aria-label="Calendar view"] button')];expect(viewButtons.map(button=>button.textContent)).toEqual(['Day','Week','Month']);await act(async()=>viewButtons[1].click());expect(setView).toHaveBeenLastCalledWith('week');
 const owner=container.querySelector('.f-right > label select');expect(owner.value).toBe('all');expect(owner.closest('label').nextElementSibling.getAttribute('aria-label')).toBe('Calendar state');
 await act(async()=>container.querySelector('[data-testid="cal-item-t0"]').click());expect(openSchedule.mock.calls[0][0]).toBe(entries[0]);
 expect(container.querySelectorAll('.wk .ev')).toHaveLength(2);expect(container.querySelector('.more').textContent).toBe('+2 more');
 await act(async()=>container.querySelector('.more').click());expect(setView).toHaveBeenCalledWith('day');expect(localCalendarDate(setAnchor.mock.calls[0][0])).toBe('2026-10-16');
 await act(async()=>root.render(<CalendarView {...props} view="day"/>));expect(container.querySelectorAll('.drow')).toHaveLength(4);
 for(const item of entries)expect(container.querySelector(`[data-testid="cal-item-${item.key}"]`)).not.toBeNull();
 await act(async()=>root.render(<CalendarView {...props}/>));
 await act(async()=>{owner.value='';owner.dispatchEvent(new Event('change',{bubbles:true}));});expect(container.querySelector('[data-testid="cal-item-t0"]')).toBeNull();
 await act(async()=>{owner.value='u';owner.dispatchEvent(new Event('change',{bubbles:true}));});expect(container.querySelector('[data-testid="cal-item-t0"]')).not.toBeNull();
 await act(async()=>[...container.querySelectorAll('.tchip')].find(button=>button.textContent.includes('Action items')).click());expect(container.querySelector('[data-testid="cal-item-t0"]')).toBeNull();expect(openSchedule).toHaveBeenCalledTimes(1);
 } finally {await act(async()=>root.unmount());container.remove();if(previousTheme===null)localStorage.removeItem(THEME_KEY);else localStorage.setItem(THEME_KEY,previousTheme);}
});

test('newly covered clients keep native month expansion and all saved overdue event populations',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const anchor=new Date(2026,9,16),period=calendarPeriod(anchor),openSchedule=jest.fn(),setView=jest.fn(),setAnchor=jest.fn();
 const tasks=Array.from({length:4},(_,n)=>({key:`native-${n}`,kind:'task',title:`Native task ${n}`,date:'2026-10-16',historical:false,status:'open'}));
 const entries=[...tasks,{key:'vendor-overdue',kind:'vendor_contract_notice',title:'Saved notice deadline',date:'2026-10-15',historical:false,status:'open'},
   {key:'represented-overdue',kind:'finding',title:'Represented Finding',date:'2026-10-15',historical:false,status:'open',represented:true}];
 const before=JSON.stringify(entries),props={anchor,setAnchor,view:'month',setView,period,days:period.days,today:'2026-10-16',entries,summaryEntries:entries,openSchedule,ymd:localCalendarDate};
 function NativeCalendar(){const [expanded,setExpanded]=React.useState({});return <CalendarView {...props} nativeBehavior expanded={expanded} setExpanded={setExpanded}/>;}
 try{
  await act(async()=>root.render(<NativeCalendar/>));
  const day=()=>container.querySelector('[data-testid="cal-day-2026-10-16"]');
  expect(day().querySelectorAll('.ev')).toHaveLength(3);expect(day().querySelector('.more').textContent).toBe('+1 more');
  await act(async()=>day().querySelector('.more').click());
  expect(day().querySelectorAll('.ev')).toHaveLength(4);expect(day().querySelector('.more').textContent).toBe('Show fewer');
  expect(setView).not.toHaveBeenCalled();expect(setAnchor).not.toHaveBeenCalled();
  await act(async()=>day().querySelector('[data-testid="cal-item-native-3"]').click());expect(openSchedule.mock.calls[0][0]).toBe(tasks[3]);
  await act(async()=>day().querySelector('.more').click());expect(day().querySelectorAll('.ev')).toHaveLength(3);
  const overdue=container.querySelectorAll('.kcell')[1];expect(overdue.querySelector('strong').textContent).toBe('2');
  expect(overdue.textContent).not.toContain('Nothing past due');await act(async()=>overdue.click());
  expect(container.querySelector('[data-testid="cal-attn-vendor-overdue"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="cal-attn-represented-overdue"]')).toBeTruthy();
  expect(JSON.stringify(entries)).toBe(before);
 }finally{await act(async()=>root.unmount());container.remove();}
});

test('Completed summary excludes accepted/cancelled records and retains their historical access',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const anchor=new Date(2026,9,16),period=calendarPeriod(anchor);
 const entries=['done','accepted','cancelled'].map((status,n)=>({key:`h${n}`,kind:'task',title:status,date:'2026-10-16',historical:true,status}));
 const props={anchor,period,days:period.days,view:'month',today:'2026-10-16',entries,summaryEntries:[],ymd:localCalendarDate,openSchedule:jest.fn(),setAnchor:jest.fn(),setView:jest.fn()};
 try {await act(async()=>root.render(<CalendarView {...props}/>));
 const tiles=container.querySelectorAll('.kcell');expect(tiles[3].querySelector('strong').textContent).toBe('1');expect(tiles[0].querySelector('small').textContent).toContain('0 open · 1 completed · 2 other historical');
 expect(container.textContent).toContain('Other historical items');
 expect(container.querySelector('[data-testid="cal-attn-h1"]')).not.toBeNull();expect(container.querySelector('[data-testid="cal-attn-h2"]')).not.toBeNull();
 await act(async()=>tiles[3].click());expect(container.querySelector('[data-testid="cal-attn-h0"]')).not.toBeNull();expect(container.querySelector('[data-testid="cal-attn-h1"]')).toBeNull();
 } finally {await act(async()=>root.unmount());container.remove();}
});

test('pending and failed summaries never report a successful zero or empty-state claim',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const anchor=new Date(2026,9,16),period=calendarPeriod(anchor),props={anchor,period,days:period.days,view:'month',today:'2026-10-16',entries:[],ymd:localCalendarDate};
 try {await act(async()=>root.render(<CalendarView {...props}/>));
 for(const tile of [...container.querySelectorAll('.kcell')].slice(1,3)){expect(tile.querySelector('strong').textContent).toBe('—');expect(tile.querySelector('small').textContent).toBe('Loading…');expect(tile.disabled).toBe(true);}
 expect(container.textContent).not.toContain('Nothing past due');
 await act(async()=>root.render(<CalendarView {...props} summaryEntries={[]} summaryError="Unavailable read"/>));
 for(const tile of [...container.querySelectorAll('.kcell')].slice(1,3)){expect(tile.querySelector('strong').textContent).toBe('—');expect(tile.querySelector('small').textContent).toBe('Unavailable');}
 expect(container.querySelector('[role="alert"]').textContent).toContain('Unavailable read');
 } finally {await act(async()=>root.unmount());container.remove();}
});

test('event and agenda focus/pointer show the accessible native summary tooltip and truthful unknown owner',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const anchor=new Date(2026,9,16),period=calendarPeriod(anchor),item={key:'t',kind:'task',title:'Native ticket',date:'2026-10-16',historical:false,status:'open',owner_id:'missing'};
 const props={anchor,period,days:period.days,view:'month',today:'2026-10-16',entries:[item],summaryEntries:[item],ymd:localCalendarDate};
 try {await act(async()=>root.render(<CalendarView {...props}/>));
 const event=container.querySelector('[data-testid="cal-item-t"]');await act(async()=>event.focus());
 expect(event.getAttribute('aria-describedby')).toBe('bdcal-tip');expect(container.querySelector('[role="tooltip"]').textContent).toContain('Native ticket');expect(container.querySelector('[role="tooltip"]').textContent).toContain('Owner: Owner unavailable');
 await act(async()=>event.blur());expect(container.querySelector('[role="tooltip"]')).toBeNull();
 const agenda=container.querySelector('[data-testid="cal-attn-t"]');await act(async()=>agenda.dispatchEvent(new MouseEvent('pointerover',{bubbles:true})));
 expect(agenda.getAttribute('aria-describedby')).toBe('bdcal-tip');expect(container.querySelector('[role="tooltip"]').textContent).toContain('Native ticket');
 await act(async()=>agenda.dispatchEvent(new MouseEvent('pointerout',{bubbles:true})));expect(container.querySelector('[role="tooltip"]')).toBeNull();
 } finally {await act(async()=>root.unmount());container.remove();}
});

test.each([[2026,9,5],[2026,7,6],[2027,1,4]])('month grid uses complete in-month weeks (%s/%s: %s rows) without altering native period',async(year,month,weeks)=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const anchor=new Date(year,month,16),period=calendarPeriod(anchor),before=period.days.map(localCalendarDate);
 try {await act(async()=>root.render(<CalendarView anchor={anchor} period={period} days={period.days} view="month" today={localCalendarDate(anchor)} entries={[]} summaryEntries={[]} ymd={localCalendarDate}/>));
 expect(container.querySelectorAll('.wk')).toHaveLength(weeks);expect(container.querySelectorAll('.wk .day')).toHaveLength(weeks*7);
 expect(period.days.map(localCalendarDate)).toEqual(before);expect(period.days).toHaveLength(42);
 const shown=[...container.querySelectorAll('.wk .day')].map(day=>day.dataset.testid.replace('cal-day-',''));
 expect(shown.filter(date=>date.slice(0,7)===localCalendarDate(anchor).slice(0,7))).toHaveLength(new Date(year,month+1,0).getDate());
 } finally {await act(async()=>root.unmount());container.remove();}
});
