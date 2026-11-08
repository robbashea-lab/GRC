import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server.node';
import DeadlineClock from './DeadlineClock';
import {ActionConceptDue} from './CisActionItemsConcept';
import {EventBadge,VendorsEventList} from './VendorsConceptTimeline';
import CisReviewsConcept from './CisReviewsConcept';
import {BrawndoReviewRows} from '@/pages/BrawndoDemoReviews';
import CisRisksConcept from './CisRisksConcept';
import {riskMatches} from '@/lib/brawndoRisks';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));

const now=new Date('2026-10-29T12:00:00');
let container,root;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  jest.useFakeTimers();jest.setSystemTime(now);jest.clearAllMocks();
  api.get.mockResolvedValue({data:[]});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();localStorage.clear();jest.useRealTimers();});
function expectClock(label,present){
  const icons=label?.querySelectorAll('svg')||[];
  expect(icons).toHaveLength(present?1:0);
  if(!present)return;
  const icon=icons[0];
  expect(icon.getAttribute('width')).toBe('10');expect(icon.getAttribute('height')).toBe('10');
  expect(icon.getAttribute('aria-hidden')).toBe('true');expect(icon.getAttribute('focusable')).toBe('false');
  expect(icon.hasAttribute('tabindex')).toBe(false);
  expect(icon.style.pointerEvents).toBe('none');
  expect(icon.parentElement.style.gap).toBe('4px');
}

test('actual DeadlineClock authored markup inherits native typography and color without changing its outer badge',()=>{
  // This installed JSDOM drops valid inherit values in CSSOM. Check React's actual
  // authored declarations directly; this is not browser linebox or geometry proof.
  const markup=renderToStaticMarkup(<DeadlineClock>1 day overdue</DeadlineClock>);
  const openingTag=markup.match(/^<span\b[^>]*>/)?.[0];
  expect(openingTag).toBeDefined();expect(openingTag).toContain('class="deadline-clock-label"');
  const authoredStyle=openingTag.match(/\bstyle="([^"]*)"/)?.[1];
  expect(authoredStyle).toBeDefined();
  const declarations=new Map(authoredStyle.split(';').filter(Boolean).map(declaration=>declaration.split(':')));
  for(const property of ['font-family','font-size','font-weight','font-style','line-height','color'])
    expect(declarations.get(property)).toBe('inherit');
  expect(declarations.get('display')).toBe('inline-flex');expect(declarations.get('align-items')).toBe('center');
  expect(declarations.get('gap')).toBe('4px');expect(declarations.get('vertical-align')).toBe('top');
  expect(declarations.has('padding')).toBe(false);expect(declarations.has('margin')).toBe(false);
  expect(markup.replace(/<[^>]+>/g,'')).toBe('1 day overdue');
});

test.each([
  ['2026-10-28',false,'1 day overdue',true],
  ['2026-10-29',false,'Due today',false],
  ['2026-11-05',false,'In 7 days',false],
  [null,false,'Unscheduled',false],
  ['2026-10-28',true,null,false],
])('actual Action deadline %s completed=%s keeps its native label and overdue-only clock',async(date,completed,text,clock)=>{
  const onOpen=jest.fn();
  await act(async()=>root.render(<button type="button" onClick={onOpen}><ActionConceptDue date={date} completed={completed} now={now}/></button>));
  const badge=container.querySelector('.due-badge');
  expect(badge?.textContent??null).toBe(text);expectClock(badge,clock);
  expect(container.querySelector('time').getAttribute('datetime')).toBe(date);
  await act(async()=>(badge?.querySelector('svg')||container.querySelector('button')).dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test.each([
  [true,'2026-10-28','1 day overdue',true],
  [true,'2026-10-29','Due today',false],
  [true,'2026-11-05','In 7 days',false],
  [false,'2026-10-28','Recorded date',false],
])('actual Vendor outstanding=%s date=%s retains native eligibility and overdue-only clock',async(outstanding,date,text,clock)=>{
  const event={id:'qa-vendor-deadline',outstanding,date},before={...event};
  await act(async()=>root.render(<EventBadge event={event} now={now}/>));
  const badge=container.querySelector('.cv-due');
  expect(badge.textContent).toBe(text);expectClock(badge,clock);expect(event).toEqual(before);
});

test('actual Review register preserves active/closed/history guards, exact dates and native opening',async()=>{
  const review=(id,status,due_date)=>({client_id:'qa-client',review_id:id,current_occurrence_id:`occ-${id}`,title:`QA Review ${id}`,status,due_date,recurrence:'annual'});
  const rows=[review('late','upcoming','2026-10-28'),review('future','upcoming','2026-10-30'),
    review('complete','completed','2026-10-27'),review('cancelled','cancelled','2026-10-26'),review('unknown','upcoming',null)];
  const before=JSON.stringify(rows),onOpen=jest.fn();
  const props={rows,users:[],checked:new Set(),toggleOne:jest.fn(),toggleAll:jest.fn(),allChecked:false,onOpen,rowMenu:()=>null,nativeParentRows:true};
  await act(async()=>root.render(<BrawndoReviewRows {...props}/>));
  const byTitle=new Map([...container.querySelectorAll('tbody tr')].map(row=>[row.querySelector('.bdr-name').textContent,row]));
  const late=byTitle.get(rows[0].title),badge=late.querySelector('.due-badge');
  expect(badge.tagName).toBe('SMALL');expect(badge.textContent).toBe('1 day overdue');expectClock(badge,true);
  expect(late.querySelector('time').getAttribute('datetime')).toBe('2026-10-28');
  expect(byTitle.get(rows[1].title).querySelector('.due-badge').textContent).toBe('In 1 day');
  expectClock(byTitle.get(rows[1].title),false);
  expect(byTitle.get(rows[2].title).querySelector('.due-badge')).toBeNull();
  expect(byTitle.get(rows[3].title).querySelector('.due-badge')).toBeNull();
  expect(byTitle.get(rows[4].title).querySelector('.due-badge').textContent).toBe('Set a due date');
  await act(async()=>badge.querySelector('svg').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(onOpen).toHaveBeenCalledTimes(1);expect(onOpen).toHaveBeenCalledWith(rows[0]);
  const completed={...rows[2],completed_at:'2026-10-28T18:00:00Z'};
  await act(async()=>root.render(<BrawndoReviewRows {...props} rows={[completed]} history/>));
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(container.querySelector('.due-badge')).toBeNull();expect(container.querySelector('.deadline-clock-label')).toBeNull();
  expect(container.querySelector('tbody time').getAttribute('datetime')).toBe('2026-10-27');
  expect(JSON.stringify(rows)).toBe(before);
});

test('actual Review overdue agenda keeps occurrence counts, completed exclusion and exact native callback',async()=>{
  const rows=[{client_id:'qa-client',review_id:'late',current_occurrence_id:'occ-late',title:'QA overdue Review',status:'upcoming',due_date:'2026-10-28',recurrence:'annual'},
    {client_id:'qa-client',review_id:'future',current_occurrence_id:'occ-future',title:'QA future Review',status:'upcoming',due_date:'2026-10-30',recurrence:'annual'},
    {client_id:'qa-client',review_id:'complete',current_occurrence_id:'occ-complete',title:'QA completed Review',status:'completed',due_date:'2026-10-27',recurrence:'annual'}];
  const before=JSON.stringify(rows),onOpenReview=jest.fn();
  await act(async()=>root.render(<CisReviewsConcept rows={rows} scopeKey="qa-clock-review" onOpenReview={onOpenReview}/>));
  expect(container.querySelectorAll('.review-dot')).toHaveLength(2);
  const overdue=container.querySelector('.agenda-switch [data-mode="overdue"]');
  expect(overdue.textContent).toBe('Overdue 1');
  await act(async()=>overdue.click());
  const badge=container.querySelector('.agenda .due-badge.overdue');
  expect(badge.textContent).toBe('1 day overdue');expectClock(badge,true);
  await act(async()=>badge.querySelector('svg').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(onOpenReview).toHaveBeenCalledTimes(1);expect(onOpenReview).toHaveBeenCalledWith(rows[0]);
  expect(JSON.stringify(rows)).toBe(before);
});

test('actual Risk register and overdue timeline retain labels, severity, dates and native Risk destination',async()=>{
  const rows=[{client_id:'qa-client',risk_id:'risk-late',display_id:'RISK-QA-1',title:'QA overdue Risk review',status:'assessed',likelihood_score:2,impact_score:3,next_review:'2026-10-28'},
    {client_id:'qa-client',risk_id:'risk-future',display_id:'RISK-QA-2',title:'QA future Risk review',status:'assessed',likelihood_score:3,impact_score:4,next_review:'2026-10-30'}];
  const before=JSON.stringify(rows),onOpenRisk=jest.fn();
  await act(async()=>root.render(<CisRisksConcept rows={rows} filtered={rows} users={[]} matches={riskMatches} view="all_active" onView={jest.fn()} search="" onSearch={jest.fn()} table={{state:{filters:{}},setSort:jest.fn()}} filters={null} onOpenRisk={onOpenRisk} onOpenEvent={jest.fn()} onNewRisk={jest.fn()} onRiskScale={jest.fn()} onExport={jest.fn()} canWrite clientId="qa-client" clientName="QA client" scope="qa-clock-risk" now={now}/>));
  const late=container.querySelector('[data-risk-row="risk-late"]'),relative=late.querySelector('.review-relative');
  expect(relative.textContent).toBe('1 day overdue · Last Never reviewed');expectClock(relative,true);
  expect(late.querySelector('time').getAttribute('datetime')).toBe('2026-10-28');
  expectClock(container.querySelector('[data-risk-row="risk-future"] .review-relative'),false);
  expect(container.querySelector('.score-badge').textContent).toBe('6 · Moderate');
  expect(container.querySelector('.score-badge svg')).toBeNull();
  await act(async()=>container.querySelector('.agenda-switch [data-mode="overdue"]').click());
  const eventBadge=container.querySelector('.agenda .due-badge.overdue');
  expect(eventBadge.textContent).toBe('1 day overdue');expectClock(eventBadge,true);
  await act(async()=>relative.querySelector('svg').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(onOpenRisk).toHaveBeenCalledTimes(1);expect(onOpenRisk).toHaveBeenCalledWith(rows[0]);
  for(const method of ['post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
  expect(JSON.stringify(rows)).toBe(before);
});

test('actual Vendor event list keeps its exact event callback and historical legal date informational',async()=>{
  const events=[{id:'qa-outstanding-review',title:'QA vendor Review',label:'Vendor review',kind:'rev',date:'2026-10-28',outstanding:true,vendor:{vendor_id:'qa-vendor'}},
    {id:'qa-recorded-legal-date',title:'QA recorded renewal',label:'Contract renewal',kind:'ren',date:'2026-10-27',outstanding:false,vendor:{vendor_id:'qa-vendor'}}];
  const before=JSON.stringify(events),onOpen=jest.fn();
  await act(async()=>root.render(<VendorsEventList selection={{ids:events.map(event=>event.id),title:'QA saved vendor events'}} events={events} available users={[]} theme="light" onClose={jest.fn()} onOpen={onOpen} now={now}/>));
  const list=document.querySelector('[role="dialog"].cv-event-list');
  expect(list).not.toBeNull();expect(list.querySelectorAll('.cv-list-items>button')).toHaveLength(2);
  const late=list.querySelector('[data-event-id="qa-outstanding-review"]'),recorded=list.querySelector('[data-event-id="qa-recorded-legal-date"]');
  expect(late).not.toBeNull();expect(recorded).not.toBeNull();
  expectClock(late,true);expect(late.querySelector('.cv-due').textContent).toBe('1 day overdue');
  expectClock(recorded,false);expect(recorded.querySelector('.cv-due').textContent).toBe('Recorded date');
  await act(async()=>late.querySelector('svg').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(onOpen).toHaveBeenCalledTimes(1);expect(onOpen).toHaveBeenCalledWith(events[0]);
  expect(JSON.stringify(events)).toBe(before);
});
