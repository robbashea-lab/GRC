import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoAuditGuide from './IsoAuditGuide';

let root,container;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(props={}){await act(async()=>root.render(<IsoAuditGuide today="2026-10-11" {...props}/>));}

test.each([
  ['2026-10-31','Upcoming'],['2027-03-31','Upcoming'],['2026-10-10','Overdue'],['2026-10-11','Due today'],[null,'Needs scheduling'],['2026-02-30','Needs scheduling'],
])('uses the actual deadline %s for %s without quarter inference',async(deadline,label)=>{
  await render({deadline});expect(container.querySelector('[role="status"]').textContent).toContain(label);
  expect(container.textContent).not.toContain('Automatically');expect(container.querySelector('input,textarea,select')).toBeNull();
});

test('date-only and timestamp deadlines follow the established UTC management calendar',async()=>{
  await render({deadline:'2026-10-11T23:30:00-04:00',today:new Date('2026-10-12T01:00:00Z')});
  expect(container.querySelector('[role="status"]').textContent).toContain('Overdue');
});

test('programme guidance maps to 9.2.2 and opens the existing Review',async()=>{
  const review={review_id:'iso-audit',due_date:'2026-12-31'},onOpen=jest.fn();
  await render({review,onOpen});expect(container.textContent).toContain('9.2.2');expect(container.textContent).toContain('Upcoming');
  await act(async()=>container.querySelector('button').click());expect(onOpen).toHaveBeenCalledWith(review);
  expect(container.querySelectorAll('[data-testid="iso-audit-guide"]').length).toBe(1);
});

test('unselected programme preparation is distinct from an unscheduled existing activity',async()=>{
  await render();expect(container.querySelector('[role="status"]').textContent).toContain('no activity selected');
  await render({review:{review_id:'unscheduled'}});expect(container.querySelector('[role="status"]').textContent).toContain('Needs scheduling');
});

test('selected activity shows its actual preparation content and does not invent an audit result',async()=>{
  const item={reference:'A.5.1',title:'Policy workpaper',intent:'Examine the approved scoped policy.',verify:'Ask how approval is retained.',inspect:'Inspect the controlled policy.',questions:'Who receives policy changes?'};
  await render({item});for(const text of Object.values(item))expect(container.textContent).toContain(text);
  expect(container.textContent).not.toContain('Prepare the internal-audit programme');expect(container.textContent).toContain('does not verify evidence');
});

test('completed and historical work retains its deadline without becoming overdue',async()=>{
  await render({review:{status:'completed',due_date:'2026-09-30'}});expect(container.textContent).toContain('Recorded deadline');expect(container.textContent).not.toContain('Overdue');
  await render({deadline:'2026-09-30',historical:true});expect(container.textContent).toContain('Recorded deadline');
});

test.each(['2026-08-01',null])('cancelled audit %s retains its terminal state without an active scheduling instruction',async due_date=>{
  await render({review:{status:'cancelled',due_date}});
  expect(container.querySelector('[role="status"]').textContent).toContain('Cancelled');
  expect(container.querySelector('[role="status"]').textContent).not.toMatch(/Overdue|Needs scheduling|Record an agreed deadline/);
});

test('a supplied missing deadline stays unscheduled and a disabled Review cannot be opened',async()=>{
  const onOpen=jest.fn();await render({review:{due_date:'2026-09-01'},deadline:null,onOpen,disabled:true});
  expect(container.textContent).toContain('Needs scheduling');expect(container.querySelector('button').disabled).toBe(true);expect(onOpen).not.toHaveBeenCalled();
});
