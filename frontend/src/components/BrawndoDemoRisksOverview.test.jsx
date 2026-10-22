import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import api from '@/lib/api';
import {riskMatches} from '@/lib/brawndoRisks';
import BrawndoDemoRisksOverview from './BrawndoDemoRisksOverview';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()}}));
const base={client_id:'demo_brawndo',status:'open',likelihood_score:3,impact_score:5,risk_score:15};
let container,root;
beforeEach(()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-16T00:30:00Z'));
  jest.clearAllMocks();api.get.mockResolvedValue({data:{tasks:[]}});
  global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());jest.useRealTimers();});
const button=text=>Array.from(container.querySelectorAll('button')).find(el=>el.textContent.includes(text));
const render=async props=>{await act(async()=>root.render(<BrawndoDemoRisksOverview {...props}/>));};

test('matrix and summary drills use saved ratings and native predicates without write requests',async()=>{
  const rows=[{...base,risk_id:'r1',next_review:'2026-10-16'},{...base,risk_id:'r2',likelihood_score:null,impact_score:null,next_review:'2026-11-15'},{...base,risk_id:'r3',status:'closed'},{...base,risk_id:'r4',status:'accepted',accepted_by:'u',acceptance_date:'2026-01-01',acceptance_rationale:'Authorized',acceptance_expires_at:'2026-12-01'}];
  const onSelect=jest.fn(),onView=jest.fn(),onOpen=jest.fn(),matches=jest.fn(riskMatches);
  const props={rows,matrixRows:rows.slice(0,2),selected:null,onSelect,view:'all_active',onView,matches,onOpen,scope:'demo_brawndo'};
  await render(props);
  expect(container.querySelectorAll('.bdr-cell')).toHaveLength(25);
  expect(container.textContent).toContain('2 risks · 1 unrated');
  const rated=container.querySelector('[aria-label="Likelihood 3, impact 5, score 15, band critical: 1 risk"]');
  await act(async()=>rated.click());expect(onSelect).toHaveBeenLastCalledWith('3:5');
  await render({...props,selected:'3:5'});
  await act(async()=>button('Clear matrix selection').click());expect(onSelect).toHaveBeenLastCalledWith(null);
  await act(async()=>button('View unrated risks').click());expect(onSelect).toHaveBeenLastCalledWith('unrated');
  await render({...props,selected:'unrated'});
  await act(async()=>button('View unrated risks').click());expect(onSelect).toHaveBeenLastCalledWith(null);
  for(const [label,view,count] of [['Active risks','all_active',3],['High or critical','significant',2],['Accepted','accepted',1],['Review due in 30 days','upcoming',1]]){
    expect(button(label).querySelector('strong').textContent).toBe(String(count));
    await act(async()=>button(label).click());expect(onView).toHaveBeenLastCalledWith(view);
    expect(matches.mock.calls.some(([,key])=>key===view)).toBe(true);
  }
  expect(api.get).toHaveBeenCalledTimes(3);
  for(const verb of ['post','put','patch','delete'])expect(api[verb]).not.toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
});

test('all matrix coordinates distinguish score from count and empty cells still select and clear without writes',async()=>{
  const rows=[];
  for(let likelihood=1;likelihood<=5;likelihood++)for(let impact=1;impact<=5;impact++){
    for(let n=0;n<(likelihood+impact)%3;n++)rows.push({...base,risk_id:`r-${likelihood}-${impact}-${n}`,likelihood_score:likelihood,impact_score:impact,risk_score:likelihood*impact});
  }
  const before=JSON.stringify(rows),onSelect=jest.fn();
  const props={rows,matrixRows:rows,selected:null,onSelect,view:'all_active',onView:jest.fn(),matches:riskMatches,onOpen:jest.fn(),scope:'demo_brawndo'};
  await render(props);
  expect([...container.querySelectorAll('.bdr-matrix-y span')].map(el=>el.textContent)).toEqual(['5','4','3','2','1']);
  expect([...container.querySelectorAll('.bdr-matrix-x span')].map(el=>el.textContent)).toEqual(['1','2','3','4','5']);
  const cells=[...container.querySelectorAll('.bdr-cell')];
  expect(cells).toHaveLength(25);
  for(let likelihood=1;likelihood<=5;likelihood++)for(let impact=1;impact<=5;impact++){
    const score=likelihood*impact,count=(likelihood+impact)%3;
    const band=score>=15?'critical':score>=10?'high':score>=5?'moderate':'low';
    const countLabel=`${count} ${count===1?'risk':'risks'}`;
    const cell=cells.find(el=>el.getAttribute('aria-label')===`Likelihood ${likelihood}, impact ${impact}, score ${score}, band ${band}: ${countLabel}`);
    expect(cell).toBeDefined();expect(cell.disabled).toBe(false);
    if(count){expect(cell.querySelector('strong').textContent).toBe(String(score));expect(cell.querySelector('small').textContent).toBe(countLabel);}
    else{expect(cell.querySelector('strong')).toBeNull();expect(cell.querySelector('small')).toBeNull();expect(cell.textContent).toBe(String(score));}
  }
  // L3/I4 is score 12 with one risk; L2/I3 is score 6 with two risks.
  expect(cells.find(el=>el.getAttribute('aria-label').startsWith('Likelihood 3, impact 4,')).textContent).toBe('121 risk');
  expect(cells.find(el=>el.getAttribute('aria-label').startsWith('Likelihood 2, impact 3,')).textContent).toBe('62 risks');
  const emptyLabel='Likelihood 5, impact 1, score 5, band moderate: 0 risks';
  await act(async()=>cells.find(el=>el.getAttribute('aria-label')===emptyLabel).click());
  expect(onSelect).toHaveBeenLastCalledWith('5:1');
  await render({...props,selected:'5:1'});
  const selected=container.querySelector(`[aria-label="${emptyLabel}"]`);expect(selected.getAttribute('aria-pressed')).toBe('true');
  await act(async()=>selected.click());expect(onSelect).toHaveBeenLastCalledWith(null);
  await act(async()=>button('Clear matrix selection').click());expect(onSelect).toHaveBeenLastCalledWith(null);
  expect(JSON.stringify(rows)).toBe(before);
  for(const verb of ['post','put','patch','delete'])expect(api[verb]).not.toHaveBeenCalled();
  expect(props.onView).not.toHaveBeenCalled();expect(props.onOpen).not.toHaveBeenCalled();
});

test('event links hand complete saved records to native opening and partial errors are visible',async()=>{
  const risk={...base,risk_id:'r1',title:'Native risk',next_review:'2026-10-16'};
  const action={task_id:'a1',client_id:'demo_brawndo',status:'open',title:'Native action',due_date:'2026-10-16',description:'Full native data'};
  api.get.mockImplementation((url,{params})=>params.entity_id==='r1'?Promise.resolve({data:{tasks:[action]}}):Promise.reject(new Error('unavailable')));
  const onOpen=jest.fn();
  await render({rows:[risk,{...base,risk_id:'r2'}],matrixRows:[risk],onSelect:jest.fn(),onView:jest.fn(),matches:riskMatches,onOpen,scope:'demo_brawndo'});
  expect(container.textContent).toContain('Linked Action deadlines unavailable for 1 risk.');
  await act(async()=>button('Native risk').click());expect(onOpen).toHaveBeenLastCalledWith('risks',risk);
  await act(async()=>button('Native action').click());expect(onOpen).toHaveBeenLastCalledWith('tasks',action);
  for(const verb of ['post','put','patch','delete'])expect(api[verb]).not.toHaveBeenCalled();
});

test('scope change aborts pending reads and never shows their stale linked Actions',async()=>{
  let resolveOld;api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
  const props={rows:[{...base,risk_id:'old'}],matrixRows:[],onSelect:jest.fn(),onView:jest.fn(),matches:riskMatches,onOpen:jest.fn(),scope:'old'};
  await render(props);expect(container.textContent).toContain('Loading linked Action deadlines');
  const signal=api.get.mock.calls[0][1].signal;
  await render({...props,rows:[],scope:'new'});expect(signal.aborted).toBe(true);
  await act(async()=>resolveOld({data:{tasks:[{task_id:'stale',client_id:'demo_brawndo',status:'open',title:'Stale action',due_date:'2026-10-16'}]}}));
  expect(container.textContent).not.toContain('Stale action');
  expect(container.textContent).toContain('No linked Action deadlines.');
});

test('same-day visual grouping keeps every distinct Action and Risk opener',async()=>{
  const risks=[{...base,risk_id:'r1',display_id:'RISK-001',title:'First risk',next_review:'2026-10-16'},
    {...base,risk_id:'r2',display_id:'RISK-002',title:'Second risk',next_review:'2026-10-16'}];
  const actions=[{task_id:'a1',client_id:'demo_brawndo',title:'First saved Action',status:'open',due_date:'2026-10-16'},
    {task_id:'a2',client_id:'demo_brawndo',title:'Second saved Action',status:'open',due_date:'2026-10-16'}];
  api.get.mockImplementation((url,{params})=>Promise.resolve({data:{tasks:params.entity_id==='r1'?actions:[]}}));
  const onOpen=jest.fn();
  await render({rows:risks,matrixRows:risks,view:'all_active',onSelect:jest.fn(),onView:jest.fn(),matches:riskMatches,onOpen,scope:'demo_brawndo'});
  expect(container.querySelectorAll('.bdr-event')).toHaveLength(2);
  expect(container.textContent).toContain('2 risk reviews');
  expect(container.querySelectorAll('.bdr-event-source button')).toHaveLength(4);
  for(const risk of risks){const link=[...container.querySelectorAll('.bdr-event-source button')].find(el=>el.getAttribute('aria-label').includes(risk.title));await act(async()=>link.click());expect(onOpen).toHaveBeenLastCalledWith('risks',risk);}
  for(const action of actions){await act(async()=>button(action.title).click());expect(onOpen).toHaveBeenLastCalledWith('tasks',action);}
  for(const verb of ['post','put','patch','delete'])expect(api[verb]).not.toHaveBeenCalled();
});
