import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import PrestigeSocNavigator from './PrestigeSocNavigator';
import {frameworkCatalog} from '@/lib/frameworks';
import {SOC_PROGRAM_STATUS_LABELS,socProgramMatches} from '@/lib/socProgramPresentation';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),put:jest.fn(),delete:jest.fn()}}));
const NOW=new Date('2026-10-31T12:00:00Z'),DAY=86400000;
const criterionIds=['CC1.1','CC1.2','CC2.1','A1.1','C1.1','PI1.1','P1.1'];
function fixture(clientId='synthetic-soc-client',ids=criterionIds){
  return frameworkCatalog('soc-2').requirements.filter(definition=>ids.includes(definition.id)).map((definition,index)=>Object.freeze({
    ...definition,client_id:clientId,framework_key:'soc-2',definition_id:definition.id,framework_assessment_id:`${clientId}:${definition.id}`,
    status:index===0?'addressed':index===1?'in_progress':'not_assessed',verification:index===0?'verified':index===1?'needs_validation':'not_verified',
    owner_id:index===0?'member':index===1?'departed':null,last_assessed:index<2?'2026-10-14T12:00:00Z':null,
    assessment_recorded_at:index===0?'2026-10-12T18:00:00Z':null,
  }));
}

function Controller({rows,clientId=rows[0]?.client_id||'empty-client',filter='all',initialCategory='',categoryId,initialPath=[],selected,visible:providedVisible,available=true,retainedRows=[],onOpen,onManage,onCategory,onPath,onClear,onFilter}){
  const [category,setCategory]=useState(initialCategory),[path,setPath]=useState(initialPath),[search,setSearch]=useState(''),[activeFilter,setFilter]=useState(filter);
  const visible=providedVisible||rows.filter(row=>socProgramMatches(row,activeFilter,search));
  const filterLabel={all:'Search results',attention:'Needs attention',stale:'Needs reassessment',...SOC_PROGRAM_STATUS_LABELS}[activeFilter];
  return <PrestigeSocNavigator {...{clientId,rows,visible,search,selected,onOpen,onManage,available,retainedRows,filterLabel}} path={path} categoryId={categoryId??category}
    filtered={activeFilter!=='all'||!!search.trim()} filter={activeFilter} onFilter={next=>{setFilter(next);onFilter?.(next);}} onSearch={setSearch}
    onCategory={next=>{setCategory(next);onCategory?.(next);}} onPath={next=>{setPath(next);onPath?.(next);}}
    onClear={()=>{setSearch('');setFilter('all');onClear?.();}}/>;
}

let root,container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers().setSystemTime(NOW);
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  jest.clearAllMocks();api.get.mockResolvedValue({data:[{user_id:'member',name:'Current client owner'}]});
});
afterEach(async()=>{
  await act(async()=>root.unmount());container.remove();jest.useRealTimers();
  for(const method of ['post','patch','put','delete'])expect(api[method]).not.toHaveBeenCalled();
});
const click=element=>act(async()=>element.click());
const button=label=>[...container.querySelectorAll('button')].find(element=>element.textContent===label);
const row=id=>container.querySelector(`[data-testid="requirement-${id}"]`);
const category=id=>container.querySelector(`[data-testid="soc-category-${id}"]`);
const group=id=>container.querySelector(`[data-testid="soc-group-${id}"]`);
const input=()=>container.querySelector('input[type="search"]');
const clearFilter=()=>click(container.querySelector('button[aria-label="Clear search and filters"]'));
const displayedIds=()=>[...container.querySelectorAll('[data-testid^="requirement-"]')].map(element=>element.dataset.testid.slice('requirement-'.length));
const groupIds=()=>[...container.querySelectorAll('[data-testid^="soc-group-"]')].map(element=>element.dataset.testid.slice('soc-group-'.length));
async function render(rows,overrides={}){
  const props={rows,onOpen:jest.fn(),onManage:jest.fn(),onCategory:jest.fn(),onPath:jest.fn(),onClear:jest.fn(),onFilter:jest.fn(),...overrides};
  await act(async()=>root.render(<Controller {...props}/>));return props;
}
const key=(element,value)=>act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));
async function search(value){
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}));});
}
async function chooseOrder(value){
  await act(async()=>{const select=container.querySelector('.f-field select');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
}

test('category rows navigate to a category dashboard without expanding the overall register or changing records',async()=>{
  const rows=Object.freeze(fixture()),before=JSON.stringify(rows),props=await render(rows);
  expect([...container.querySelectorAll('[data-testid^="soc-category-"]')].map(element=>element.dataset.testid)).toEqual(['soc-category-security','soc-category-availability','soc-category-confidentiality','soc-category-processing_integrity','soc-category-privacy']);
  expect(category('security').hasAttribute('aria-expanded')).toBe(false);
  expect(container.querySelectorAll('[data-testid^="soc-group-"]')).toHaveLength(0);expect(displayedIds()).toEqual([]);expect(button('Expand all')).toBeUndefined();
  await click(category('security'));expect(props.onCategory).toHaveBeenLastCalledWith('security');expect(props.onPath).not.toHaveBeenCalled();
  expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(0);expect(groupIds()).toEqual(['CC1','CC2']);
  await click(group('CC1'));expect(displayedIds()).toEqual(['CC1.1','CC1.2']);
  await click(button('SOC 2'));expect(props.onCategory).toHaveBeenLastCalledWith('');
  await click(category('availability'));await click(group('A1'));expect(displayedIds()).toEqual(['A1.1']);expect(group('CC1')).toBeNull();
  await click(row('A1.1'));expect(props.onOpen).toHaveBeenCalledWith(rows.find(record=>record.definition_id==='A1.1'));
  expect(JSON.stringify(rows)).toBe(before);
});

test('all native category memberships and Security CC1–CC9 survive navigation and Expand all in catalog order',async()=>{
  const rows=fixture('all-native-soc',frameworkCatalog('soc-2').requirements.map(definition=>definition.id));await render(rows);
  for(const [id,count] of [['security',33],['availability',3],['confidentiality',2],['processing_integrity',5],['privacy',18]]){
    expect(category(id).textContent).toContain(`${count} criteria`);await click(category(id));
    if(id==='security')expect(groupIds()).toEqual(Array.from({length:9},(_,i)=>`CC${i+1}`));
    if(id==='availability')expect(groupIds()).toEqual(['A1']);if(id==='confidentiality')expect(groupIds()).toEqual(['C1']);
    await click(button('Expand all'));expect(displayedIds()).toEqual(rows.filter(record=>record.category===id).map(record=>record.definition_id));expect(displayedIds()).toHaveLength(count);
    await click(button('Collapse all'));expect(displayedIds()).toEqual([]);await click(button('SOC 2'));
  }
});

test('CIS toolbar uses real SOC scope counts, native filters and fixed grouping by view',async()=>{
  const props=await render(fixture());
  expect(container.querySelector('.card-head h2').textContent).toBe('SOC 2 criteria');
  expect(container.querySelector('.card-head p').textContent).toBe('All 7 criteria in 5 selected Trust Services Categories.');
  expect(input().closest('label').textContent).toBe('Search criteria');expect(input().placeholder).toBe('Search criteria…');
  expect(container.querySelector('[aria-label="Group by"]')).toBeNull();expect(button('Expand all')).toBeUndefined();
  expect(container.querySelector('[aria-label="Show criteria"]').textContent).toBe('All7Needs attention6Not assessed5Needs reassessment0');
  expect([...container.querySelector('.ghead').children].map(element=>element.textContent)).toEqual(['','Trust Services Category','Status mix','Implemented','Assessed']);
  await click(button('Not assessed5'));expect(props.onFilter).toHaveBeenLastCalledWith('not_assessed');
  expect(displayedIds()).toEqual(['CC2.1','A1.1','C1.1','PI1.1','P1.1']);expect(container.querySelector('[aria-label="Show criteria"] [aria-pressed="true"]').textContent).toBe('Not assessed5');
  await clearFilter();await click(category('security'));
  expect(container.querySelector('[aria-label="Show criteria"]').textContent).toBe('All3Needs attention2Not assessed1Needs reassessment0');
  expect(container.querySelector('[aria-label="Group by"]')).toBeNull();expect(button('Expand all').tagName).toBe('BUTTON');
  expect([...container.querySelector('.ghead').children].map(element=>element.textContent)).toEqual(['','Criteria group','Status mix','Implemented','Assessed']);
  expect(props.onOpen).not.toHaveBeenCalled();
});

test('implemented counts stay separate from assessed coverage and N/A in category and group rows',async()=>{
  const ids=frameworkCatalog('soc-2').requirements.filter(definition=>definition.control==='CC1').map(definition=>definition.id);
  const rows=fixture('implementation-soc',ids).map((record,index)=>({...record,status:['addressed','in_progress','needs_attention','not_assessed','not_applicable'][index]}));
  await render(rows);
  const check=element=>{
    expect(element.querySelector('.g-impl b').textContent).toBe('1 of 4');expect(element.querySelector('.g-impl > span').textContent).toBe('25.0%');
    expect(element.querySelector('.g-ass b').textContent).toBe('3 of 4');expect(element.textContent).toContain('1 not applicable');
    const mix=element.querySelector('.sbar');expect(mix.getAttribute('aria-label')).toContain('Implemented: 1');
    expect(mix.getAttribute('aria-label')).toContain('Implementation not established: 1');expect(mix.getAttribute('aria-label')).not.toContain('Not applicable');
    expect(mix.querySelectorAll('i')).toHaveLength(4);expect(element.querySelector('button')).toBeNull();
  };
  check(category('security'));await click(category('security'));check(group('CC1'));
});

test('no-applicable and unavailable rows never fabricate implementation or status mix',async()=>{
  const rows=fixture().filter(record=>record.category==='security').map(record=>({...record,status:'not_applicable'})),props=await render(rows);
  expect(category('security').querySelector('.g-impl').textContent).toBe('0 of 0—');expect(category('security').querySelector('.g-impl').textContent).not.toContain('%');
  expect(category('security').querySelectorAll('.sbar i')).toHaveLength(0);
  await act(async()=>root.render(<Controller {...props} available={false}/>));
  expect(category('security').textContent).toContain('Criterion data unavailable');
  expect(category('security').textContent).not.toContain('not applicable');
  expect(category('security').querySelector('.g-impl b').textContent).toBe('Unavailable');expect(category('security').querySelector('.g-ass b').textContent).toBe('—');
  expect(category('security').querySelector('.sbar').getAttribute('aria-label')).toBe('Status mix unavailable');expect(category('security').querySelectorAll('.sbar i')).toHaveLength(0);
  expect(container.querySelector('[aria-label="Show criteria"]').textContent).toBe('All—Needs attention—Not assessed—Needs reassessment—');
  await click(category('security'));expect(group('CC1').textContent).toContain('Unavailable');expect(group('CC1').textContent).not.toContain('0.0%');expect(group('CC1').textContent).not.toContain('not applicable');
});

test('empty active populations remain empty without manufacturing category rows',async()=>{
  await render([]);expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(0);
  expect(container.textContent).toContain('0 criteria across 0 Trust Services Categories');expect(container.querySelector('.empty h3').textContent).toBe('No criteria match');
});

test('root derived results render exact native hits including retained records without inventing category membership',async()=>{
  const all=fixture(),active=all.filter(record=>record.category==='security'),retained=all.find(record=>record.definition_id==='P1.1');
  const hits=[active[1],retained],props=await render(active,{filter:'attention',visible:hits});
  expect(displayedIds()).toEqual(hits.map(record=>record.definition_id));expect(groupIds()).toEqual([]);expect(category('privacy')).toBeNull();
  for(const hit of hits)expect(row(hit.definition_id).closest('.reg')).not.toBeNull();
  await click(row('P1.1').querySelector('button'));expect(props.onManage).toHaveBeenCalledWith(retained);expect(props.onOpen).not.toHaveBeenCalled();
  await click(row('P1.1'));expect(props.onOpen).toHaveBeenCalledWith(retained);
  expect(container.querySelector('[aria-label="SOC 2 location"]').textContent).toContain('Needs attention');
});

test('root search clear restores categories and focus without changing the category route or assessment state',async()=>{
  const props=await render(fixture());await search('CC2.1');expect(displayedIds()).toEqual(['CC2.1']);await clearFilter();
  expect(displayedIds()).toEqual([]);expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(5);expect(document.activeElement).toBe(input());
  expect(container.querySelector('[aria-label="SOC 2 location"]').textContent).toBe('SOC 2');expect(props.onCategory).not.toHaveBeenCalled();expect(props.onOpen).not.toHaveBeenCalled();
});

test('category search intersects status hits, keeps full group counts and clears within the category',async()=>{
  const props=await render(fixture(),{initialCategory:'security',filter:'in_progress'});await search('CC1');expect(displayedIds()).toEqual(['CC1.2']);
  expect(group('CC1').textContent).toContain('2 criteria');expect(group('CC1').querySelector('.g-impl b').textContent).toBe('1 of 2');
  expect(group('CC1').querySelector('.sbar').getAttribute('aria-label')).toContain('Partially implemented: 1');
  expect(group('CC2')).toBeNull();expect(group('CC1').disabled).toBe(true);
  expect(document.getElementById(group('CC1').getAttribute('aria-describedby')).textContent).toBe('Matching results stay expanded; clear filters to collapse.');
  await click(group('CC1'));expect(props.onPath).not.toHaveBeenCalled();expect(group('CC1').getAttribute('aria-expanded')).toBe('true');
  await search('A1.1');expect(displayedIds()).toEqual([]);expect(container.querySelector('.empty h3').textContent).toBe('No criteria match');
  await clearFilter();expect(props.onClear).toHaveBeenCalledTimes(1);expect(props.onCategory).not.toHaveBeenCalled();expect(input().value).toBe('');expect(document.activeElement).toBe(input());
  expect(group('CC1').disabled).toBe(false);expect(group('CC1').getAttribute('aria-expanded')).toBe('false');expect(group('A1')).toBeNull();
  expect(container.querySelector('[aria-label="SOC 2 location"]').textContent).toContain('Security');
  await click(group('CC1'));expect(group('CC1').getAttribute('aria-expanded')).toBe('true');await click(group('CC1'));expect(group('CC1').getAttribute('aria-expanded')).toBe('false');
});

test('ordering uses implementation share without changing category membership, native row order or records',async()=>{
  const rows=Object.freeze(fixture()),before=JSON.stringify(rows);await render(rows);
  await chooseOrder('gaps');
  expect([...container.querySelectorAll('[data-testid^="soc-category-"]')].map(element=>element.dataset.testid)).toEqual(['soc-category-availability','soc-category-confidentiality','soc-category-processing_integrity','soc-category-privacy','soc-category-security']);
  await click(category('security'));expect(groupIds()).toEqual(['CC2','CC1']);await chooseOrder('program');expect(groupIds()).toEqual(['CC1','CC2']);
  await click(button('Expand all'));expect(displayedIds()).toEqual(['CC1.1','CC1.2','CC2.1']);
  await search('CC');await chooseOrder('gaps');expect(groupIds()).toEqual(['CC2','CC1']);expect(displayedIds()).toEqual(['CC2.1','CC1.1','CC1.2']);
  await click(button('SOC 2'));await search('CC');expect(displayedIds()).toEqual(['CC1.2','CC2.1','CC1.1']);
  expect(JSON.stringify(rows)).toBe(before);
});

test('Needs reassessment counts actual judgments older than 365 days and excludes boundary, legacy and unknown dates',async()=>{
  const ids=frameworkCatalog('soc-2').requirements.filter(definition=>definition.control==='CC1').map(definition=>definition.id);
  const dates=[new Date(NOW.getTime()-366*DAY).toISOString(),new Date(NOW.getTime()-365*DAY).toISOString(),null,new Date(NOW.getTime()-400*DAY).toISOString(),'2026-11-01T12:00:00Z'];
  const rows=fixture('judgment-clock-soc',ids).map((record,index)=>Object.freeze({...record,status:index===3?'not_assessed':'addressed',assessment_recorded_at:dates[index],last_assessed:index===1?'2024-01-01T12:00:00Z':NOW.toISOString(),last_saved:NOW.toISOString()}));
  const props=await render(rows);
  expect(button('Needs reassessment1')).not.toBeUndefined();await click(button('Needs reassessment1'));
  expect(props.onFilter).toHaveBeenLastCalledWith('stale');expect(displayedIds()).toEqual(['CC1.1']);expect(row('CC1.1').querySelector('.ver small').textContent).toBe('Stale · 12 months');
  expect(row('CC1.2')).toBeNull();expect(row('CC1.3')).toBeNull();expect(row('CC1.4')).toBeNull();expect(row('CC1.5')).toBeNull();
  await clearFilter();await click(category('security'));await click(button('Needs reassessment1'));
  expect(displayedIds()).toEqual(['CC1.1']);expect(group('CC1').querySelector('.g-impl b').textContent).toBe('4 of 5');expect(group('CC1').querySelector('.g-ass b').textContent).toBe('4 of 5');
});

test('explicit categories and native preference paths reveal selected groups without navigating from the child',async()=>{
  const rows=fixture(),props=await render(rows,{categoryId:'security',initialPath:['security','CC2']});
  expect(group('CC2').getAttribute('aria-expanded')).toBe('true');expect(row('CC2.1')).not.toBeNull();
  const selected=rows.find(record=>record.definition_id==='PI1.1');await act(async()=>root.render(<Controller {...props} categoryId="processing_integrity" selected={selected}/>));
  expect(group('CC2')).toBeNull();expect(group('PI1').getAttribute('aria-expanded')).toBe('true');expect(container.querySelector('[aria-label="SOC 2 location"]').textContent).toContain('Processing Integrity');
  const criterion=row('PI1.1');criterion.focus();expect(document.activeElement).toBe(criterion);await key(criterion,'Enter');expect(props.onOpen).toHaveBeenLastCalledWith(selected);
  expect(criterion.getAttribute('role')).toBe('link');expect(criterion.tabIndex).toBe(0);expect(props.onCategory).not.toHaveBeenCalled();
});

test('native category/group buttons preserve focus targets and keep navigation separate from preference-only paths',async()=>{
  const props=await render(fixture()),categoryButton=category('security');
  expect(categoryButton.tagName).toBe('BUTTON');expect(categoryButton.type).toBe('button');expect(categoryButton.tabIndex).toBe(0);
  categoryButton.focus();expect(document.activeElement).toBe(categoryButton);await click(categoryButton);expect(props.onCategory).toHaveBeenLastCalledWith('security');
  const groupButton=group('CC1');expect(groupButton.tagName).toBe('BUTTON');expect(groupButton.type).toBe('button');expect(groupButton.tabIndex).toBe(0);
  groupButton.focus();expect(document.activeElement).toBe(groupButton);await click(groupButton);expect(props.onPath).toHaveBeenLastCalledWith(['security','CC1']);
  expect(document.getElementById(group('CC1').getAttribute('aria-controls'))).not.toBeNull();await click(group('CC1'));expect(props.onPath).toHaveBeenLastCalledWith(['security']);
  expect(group('CC1').getAttribute('aria-expanded')).toBe('false');expect(row('CC1.1')).toBeNull();
});

test('shared expanded rows preserve native owner, judgment freshness and verification; Manage never opens the criterion',async()=>{
  const rows=fixture(),props=await render(rows,{initialCategory:'security'});await click(button('Expand all'));
  expect(row('CC1.1').querySelector('.sg-secondary-info').textContent).toBe('Linked work unavailable · Owner: Current client owner · Manage');
  expect(row('CC1.1').querySelector('.ver small').textContent).toBe('Assessed 18d ago');expect(row('CC1.1').textContent).not.toContain('Assessed 17d ago');
  expect(row('CC1.1').textContent).not.toContain('2026-10-14');expect(row('CC1.1').textContent).toContain('Verified');expect(row('CC1.1').querySelector('.st').textContent).toBe('Implemented');
  expect(row('CC1.2').textContent).toContain('Owner unavailable');expect(row('CC1.2').querySelector('.ver small').textContent).toBe('Legacy date unconfirmed');expect(row('CC1.2').textContent).toContain('Needs validation');
  expect(row('CC2.1').textContent).toContain('Unassigned');expect(row('CC2.1').querySelector('.ver small').textContent).toBe('Not assessed');
  expect([...row('CC1.1').children].map(element=>element.className)).toEqual(['sg-id','sg-t','st','ver v-verified','chev']);
  expect(row('CC1.1').querySelector('.ver svg').getAttribute('width')).toBe('14');expect(row('CC1.1').getAttribute('aria-label')).toBe(`Open criterion CC1.1 ${rows[0].title}`);
  const manage=row('CC1.1').querySelector('button');manage.focus();await key(manage,'Enter');expect(props.onOpen).not.toHaveBeenCalled();
  await click(manage);expect(props.onManage).toHaveBeenCalledWith(rows[0]);expect(props.onOpen).not.toHaveBeenCalled();expect(container.querySelector('button button')).toBeNull();
});

test('real linked-work summaries remain under the criterion title and never replace its opening target',async()=>{
  const rows=fixture().map((record,index)=>Object.freeze({...record,work:Object.freeze({context_complete:true,open_findings:index===0?2:0,overdue_actions:index===0?1:0,overdue_reviews:0})})),props=await render(rows,{initialCategory:'security'});
  await click(button('Expand all'));
  expect(row('CC1.1').querySelector('.sg-t small').textContent).toBe('Linked work: 2 open Findings · 1 overdue Action Item · Owner: Current client owner · Manage');
  expect(row('CC1.2').querySelectorAll('.sg-t small')).toHaveLength(1);expect(row('CC1.2').querySelector('.sg-t small').textContent).toBe('Owner: Owner unavailable · Manage');
  await click(row('CC1.1'));expect(props.onOpen).toHaveBeenCalledWith(rows[0]);
});

test('changing clients never reuses old member names while the new authorized member read is pending',async()=>{
  const first=fixture('existing-demo-soc'),props=await render(first,{initialCategory:'security'});await click(button('Expand all'));expect(row('CC1.1').textContent).toContain('Current client owner');
  let resolveMembers;api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveMembers=resolve;}));const next=fixture('later-enabled-authenticated-soc');
  await act(async()=>root.render(<Controller {...props} rows={next} clientId="later-enabled-authenticated-soc"/>));await click(button('Expand all'));
  expect(row('CC1.1').textContent).toContain('Owner unavailable');expect(row('CC1.1').textContent).not.toContain('Current client owner');
  await act(async()=>resolveMembers({data:[{user_id:'member',name:'New client owner'}]}));expect(row('CC1.1').textContent).toContain('New client owner');
  await click(row('CC1.1'));expect(props.onOpen).toHaveBeenLastCalledWith(next[0]);
  expect(api.get).toHaveBeenLastCalledWith('/clients/later-enabled-authenticated-soc/members',expect.objectContaining({signal:expect.any(AbortSignal)}));
});

test('retained criteria preserve native judgment clocks and exact Manage targets outside active category counts',async()=>{
  const all=fixture(),rows=Object.freeze(all.filter(record=>record.category==='security'));
  const retainedRows=Object.freeze([
    Object.freeze({...all.find(record=>record.definition_id==='P1.1'),status:'not_assessed',owner_id:'member',last_assessed:NOW.toISOString(),last_saved:NOW.toISOString(),assessment_recorded_at:null}),
    Object.freeze({...all.find(record=>record.definition_id==='A1.1'),status:'addressed',last_assessed:'2026-10-30T12:00:00Z',assessment_recorded_at:'2026-08-10T12:00:00Z'}),
    Object.freeze({...all.find(record=>record.definition_id==='C1.1'),status:'addressed',last_assessed:'2026-10-29T12:00:00Z',assessment_recorded_at:null}),
  ]);
  const before=JSON.stringify({rows,retainedRows}),props=await render(rows,{retainedRows});
  expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(1);expect(category('security').textContent).toContain('3 criteria');expect(category('privacy')).toBeNull();expect(category('availability')).toBeNull();
  expect(container.querySelector('.soc-register-result-count').textContent).toBe('3 criteria across 1 Trust Services Category');
  expect(container.querySelector('[aria-label="Retained out-of-scope criteria"]').textContent).toContain('excluded from implementation totals');
  for(const retained of retainedRows)expect(row(retained.definition_id).closest('.reg')).not.toBeNull();
  expect(row('P1.1').querySelector('.ver small').textContent).toBe('Not assessed');expect(row('P1.1').textContent).not.toContain('2026-10-31');expect(row('P1.1').textContent).toContain('Current client owner');
  expect(row('A1.1').querySelector('.ver small').textContent).toBe('Assessed 82d ago');expect(row('A1.1').textContent).not.toContain('2026-10-30');
  expect(row('C1.1').querySelector('.ver small').textContent).toBe('Legacy date unconfirmed');
  await click(row('P1.1').querySelector('button'));expect(props.onManage).toHaveBeenCalledWith(retainedRows[0]);expect(props.onOpen).not.toHaveBeenCalled();
  await click(category('security'));await click(button('Expand all'));expect(displayedIds()).toHaveLength(6);expect(new Set(displayedIds()).size).toBe(6);
  expect(container.querySelector('[aria-label="Retained out-of-scope criteria"]').querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(3);
  expect(group('CC1').textContent).toContain('2 criteria');expect(group('CC2').textContent).toContain('1 criteria');expect(JSON.stringify({rows,retainedRows})).toBe(before);
});
