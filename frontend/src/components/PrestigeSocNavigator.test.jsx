import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import PrestigeSocNavigator from './PrestigeSocNavigator';
import {frameworkCatalog} from '@/lib/frameworks';
import {matchesAssessment} from '@/lib/frameworkWorkspace';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),put:jest.fn(),delete:jest.fn()}}));

const criterionIds=['CC1.1','CC1.2','CC2.1','A1.1','C1.1','PI1.1','P1.1'];
function fixture(clientId='synthetic-soc-client'){
  return frameworkCatalog('soc-2').requirements.filter(definition=>criterionIds.includes(definition.id)).map((definition,index)=>Object.freeze({
    ...definition,client_id:clientId,framework_key:'soc-2',definition_id:definition.id,framework_assessment_id:`${clientId}:${definition.id}`,
    status:index===0?'addressed':index===1?'in_progress':'not_assessed',verification:index===0?'verified':index===1?'needs_validation':'not_verified',
    owner_id:index===0?'member':index===1?'departed':null,last_assessed:index<2?'2026-10-14T12:00:00Z':null,
    assessment_recorded_at:index===0?'2026-10-12T18:00:00Z':null,
  }));
}

function Controller({rows,clientId=rows[0].client_id,filter='all',initialPath=[],selected,onOpen,onManage,onPath,onClear}){
  const [path,setPath]=useState(initialPath),[search,setSearch]=useState('');
  const visible=rows.filter(row=>matchesAssessment(row,filter,search));
  return <PrestigeSocNavigator {...{clientId,rows,visible,search,selected,onOpen,onManage}} path={path}
    filtered={filter!=='all'||!!search.trim()} filterLabel={filter==='all'?'Search results':'Partially Addressed'} onSearch={setSearch}
    onPath={next=>{setPath(next);onPath?.(next);}} onClear={()=>{setSearch('');setPath([]);onClear?.();}}/>;
}

let root,container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  jest.clearAllMocks();
  api.get.mockResolvedValue({data:[{user_id:'member',name:'Current client owner'}]});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const click=element=>act(async()=>element.click());
const button=label=>[...container.querySelectorAll('button')].find(element=>element.textContent===label);
const row=id=>container.querySelector(`[data-testid="requirement-${id}"]`);
const category=id=>container.querySelector(`[data-testid="soc-category-${id}"]`);
const group=id=>container.querySelector(`[data-testid="soc-group-${id}"]`);
const displayedIds=()=>[...container.querySelectorAll('[data-testid^="requirement-"]')].map(element=>element.dataset.testid.slice('requirement-'.length));
async function render(rows,overrides={}){
  const props={rows,onOpen:jest.fn(),onManage:jest.fn(),onPath:jest.fn(),onClear:jest.fn(),...overrides};
  await act(async()=>root.render(<Controller {...props}/>));
  return props;
}
const key=(element,value)=>act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));
async function search(value){
  await act(async()=>{
    const input=container.querySelector('[aria-label="Search criteria"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
}

test('native categories and groups expand in place, keep program order and open exact client records',async()=>{
  const rows=Object.freeze(fixture()),before=JSON.stringify(rows),props=await render(rows);
  expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(5);
  expect(displayedIds()).toEqual([]);
  await click(category('security'));await click(group('CC1'));
  expect(displayedIds()).toEqual(['CC1.1','CC1.2']);
  await click(category('availability'));await click(group('A1'));
  expect(displayedIds()).toEqual(['CC1.1','CC1.2','A1.1']);
  expect(category('security').getAttribute('aria-expanded')).toBe('true');
  expect(category('availability').getAttribute('aria-expanded')).toBe('true');
  await click(row('A1.1'));
  expect(props.onOpen).toHaveBeenCalledWith(rows.find(record=>record.definition_id==='A1.1'));
  await click(button('Expand all'));expect(displayedIds()).toEqual(rows.map(record=>record.definition_id));
  await click(button('Collapse all'));expect(displayedIds()).toEqual([]);
  expect(JSON.stringify(rows)).toBe(before);
  for(const method of ['post','patch','put','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('search intersects the controller filter, reveals matches and retains full native group counts',async()=>{
  const rows=fixture(),props=await render(rows,{filter:'in_progress'});
  await search('CC1');
  expect(displayedIds()).toEqual(['CC1.2']);
  expect(group('CC1').textContent).toContain('2 criteria');
  expect(group('CC1').querySelector('[role="img"]').getAttribute('aria-label')).toContain('Addressed (Readiness): 1');
  expect(group('CC1').querySelector('[role="img"]').getAttribute('aria-label')).toContain('Partially Addressed: 1');
  expect(group('CC2')).toBeNull();
  await search('no matching criterion');
  expect(displayedIds()).toEqual([]);expect(container.textContent).toContain('No criteria match this view.');
  await click(button('Clear filter'));
  expect(props.onClear).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[aria-label="Search criteria"]').value).toBe('');
  expect(container.querySelector('[aria-label="SOC 2 location"]').textContent).toContain('SOC 2');
});

test('search clear restores the complete collapsed register and the native root breadcrumb',async()=>{
  const rows=fixture();await render(rows);
  await search('CC2.1');expect(displayedIds()).toEqual(['CC2.1']);
  await click(button('Clear filter'));
  expect(displayedIds()).toEqual([]);
  expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(5);
  expect(container.querySelector('[aria-label="SOC 2 location"]').textContent).toBe('SOC 2');
});

test('matching filter results stay expanded without inactive toggle callbacks; clear restores normal toggles',async()=>{
  const props=await render(fixture());
  await search('CC1.1');
  expect(category('security').disabled).toBe(true);expect(group('CC1').disabled).toBe(true);
  expect(group('CC1').getAttribute('aria-label')).toContain('Matching results stay expanded; clear filters to collapse.');
  await click(category('security'));await key(group('CC1'),'Enter');
  expect(props.onPath).not.toHaveBeenCalled();
  expect(group('CC1').getAttribute('aria-expanded')).toBe('true');expect(displayedIds()).toEqual(['CC1.1']);
  await click(button('Clear filter'));
  expect(category('security').disabled).toBe(false);expect(category('security').getAttribute('aria-expanded')).toBe('false');
  await click(category('security'));expect(props.onPath).toHaveBeenLastCalledWith(['security']);
  expect(group('CC1').disabled).toBe(false);
  await click(group('CC1'));expect(group('CC1').getAttribute('aria-expanded')).toBe('true');
  await click(group('CC1'));expect(group('CC1').getAttribute('aria-expanded')).toBe('false');
});

test('external native paths and selected deep links reveal records, with keyboard access and focus targets',async()=>{
  const rows=fixture(),props=await render(rows,{initialPath:['security','CC2']});
  expect(group('CC2').getAttribute('aria-expanded')).toBe('true');expect(row('CC2.1')).not.toBeNull();
  const selected=rows.find(record=>record.definition_id==='PI1.1');
  await act(async()=>root.render(<Controller {...props} selected={selected}/>));
  expect(category('processing_integrity').getAttribute('aria-expanded')).toBe('true');
  expect(group('PI1').getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('[aria-label="SOC 2 location"]').textContent).toContain('Processing Integrity');
  const criterion=row('PI1.1');criterion.focus();expect(document.activeElement).toBe(criterion);
  await key(criterion,'Enter');expect(props.onOpen).toHaveBeenLastCalledWith(selected);
  expect(criterion.getAttribute('role')).toBe('link');expect(criterion.tabIndex).toBe(0);
});

test('category/group keyboard toggles retain controller paths and accessible expansion relationships',async()=>{
  const props=await render(fixture());
  await key(category('security'),'Enter');
  expect(props.onPath).toHaveBeenLastCalledWith(['security']);
  expect(document.getElementById(category('security').getAttribute('aria-controls'))).not.toBeNull();
  await key(group('CC1'),' ');expect(props.onPath).toHaveBeenLastCalledWith(['security','CC1']);
  expect(document.getElementById(group('CC1').getAttribute('aria-controls'))).not.toBeNull();
  await key(group('CC1'),'Enter');expect(props.onPath).toHaveBeenLastCalledWith(['security']);
  expect(group('CC1').getAttribute('aria-expanded')).toBe('false');expect(row('CC1.1')).toBeNull();
});

test('native owner, judgment date and saved verification remain visible; Manage never opens the criterion',async()=>{
  const rows=fixture(),props=await render(rows);await click(button('Expand all'));
  expect(row('CC1.1').textContent).toContain('Current client owner');expect(row('CC1.1').textContent).toContain('2026-10-12');
  expect(row('CC1.1').textContent).not.toContain('2026-10-14');expect(row('CC1.1').textContent).toContain('Verified');
  expect(row('CC1.2').textContent).toContain('Owner unavailable');expect(row('CC1.2').textContent).toContain('Legacy date unconfirmed');
  expect(row('CC1.2').textContent).toContain('Needs validation');expect(row('CC2.1').textContent).toContain('Unassigned');
  expect(row('CC2.1').textContent).toContain('Not assessed');
  expect([...row('CC1.1').querySelectorAll('td[data-label]')].map(cell=>cell.dataset.label)).toEqual(['Implementation status','Verification','Owner','Last assessed']);
  const manage=row('CC1.1').querySelector('button');
  manage.focus();await key(manage,'Enter');expect(props.onOpen).not.toHaveBeenCalled();
  await click(manage);expect(props.onManage).toHaveBeenCalledWith(rows[0]);expect(props.onOpen).not.toHaveBeenCalled();
});

test('changing clients never reuses old member names while the new authorized member read is pending',async()=>{
  const first=fixture('existing-demo-soc'),props=await render(first);await click(button('Expand all'));
  expect(row('CC1.1').textContent).toContain('Current client owner');
  let resolveMembers;api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveMembers=resolve;}));
  const next=fixture('later-enabled-authenticated-soc');
  await act(async()=>root.render(<Controller {...props} rows={next} clientId="later-enabled-authenticated-soc"/>));
  await click(button('Expand all'));
  expect(row('CC1.1').textContent).toContain('Owner unavailable');expect(row('CC1.1').textContent).not.toContain('Current client owner');
  await act(async()=>resolveMembers({data:[{user_id:'member',name:'New client owner'}]}));
  expect(row('CC1.1').textContent).toContain('New client owner');
  await click(row('CC1.1'));expect(props.onOpen).toHaveBeenLastCalledWith(next[0]);
  expect(api.get).toHaveBeenLastCalledWith('/clients/later-enabled-authenticated-soc/members',expect.objectContaining({signal:expect.any(AbortSignal)}));
});
