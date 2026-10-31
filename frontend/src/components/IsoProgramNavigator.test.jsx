import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import IsoProgramNavigator from './IsoProgramNavigator';
import {frameworkCatalog} from '@/lib/frameworks';
import {matchesAssessment} from '@/lib/frameworkWorkspace';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),post:jest.fn(),patch:jest.fn(),delete:jest.fn()}}));

function fixture(clientId='synthetic-iso'){
  const saved={
    '4.1':{status:'addressed'},'4.2':{status:'in_progress'},'5.1':{status:'needs_attention'},
    'A.5.1':{status:'addressed',soa_applicability:'included',soa_justification:'Recorded risk treatment',work:{evidence_count:2,open_findings:1,finding_ids:['finding'],review_ids:['review']}},
    'A.5.2':{status:'not_assessed',soa_applicability:'excluded',soa_justification:''},
    'A.5.3':{status:'addressed',soa_applicability:'',soa_justification:''},
    'A.6.1':{status:'not_assessed'},'A.7.1':{status:'not_assessed',soa_applicability:'included',soa_justification:'Physical scope'},
    'A.8.1':{status:'in_progress',soa_applicability:'included',soa_justification:'Technology scope'},
  };
  return frameworkCatalog('iso-27001').requirements.filter(definition=>saved[definition.id]).map(definition=>Object.freeze({
    ...definition,definition_id:definition.id,framework_assessment_id:`${clientId}:${definition.id}`,client_id:clientId,framework_key:'iso-27001',
    last_assessed:'2026-10-01T12:00:00Z',work:{},...saved[definition.id],
  }));
}

function Controller({rows,view='soa',initialPath=[],selected,onOpen,onManage,onPath,onClear,visible:provided,filtered=false,filterLabel='Search results'}){
  const [path,setPath]=useState(initialPath),[search,setSearch]=useState('');
  const visible=provided||rows.filter(row=>matchesAssessment(row,'all',search));
  return <IsoProgramNavigator clientId={rows[0]?.client_id||'synthetic-iso'} {...{view,rows,visible,filterLabel,search,selected,onOpen,onManage}}
    filtered={filtered||!!search.trim()} path={path} onSearch={setSearch}
    onPath={next=>{setPath(next);onPath?.(next);}} onClear={()=>{setSearch('');onClear?.();}}/>;
}

let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);jest.clearAllMocks();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const click=element=>act(async()=>element.click());
const button=label=>[...container.querySelectorAll('button')].find(element=>element.textContent===label);
const group=key=>container.querySelector(`[data-iso-group="${key}"]`);
const row=id=>container.querySelector(`[data-testid="requirement-${id}"]`);
const ids=()=>[...container.querySelectorAll('[data-testid^="requirement-"]')].map(element=>element.dataset.testid.slice('requirement-'.length));
async function render(rows,options={}){
  const props={rows,onOpen:jest.fn(),onManage:jest.fn(),onPath:jest.fn(),onClear:jest.fn(),...options};
  await act(async()=>root.render(<Controller {...props}/>));return props;
}
async function chooseApplicability(value){await act(async()=>{const select=container.querySelector('[aria-label="Applicability filter"]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});}
const key=(element,value)=>act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));

test('clause groups expand in catalog order and open the exact native requirement without writes',async()=>{
  const rows=Object.freeze(fixture().filter(record=>record.specification==='isms_clause')),before=JSON.stringify(rows),props=await render(rows,{view:'isms_clause'});
  expect([...container.querySelectorAll('[data-iso-group]')].map(element=>element.dataset.isoGroup)).toEqual(['isms_clause/4','isms_clause/5']);
  expect(ids()).toEqual([]);await click(group('isms_clause/4'));expect(ids()).toEqual(['4.1','4.2']);
  await click(row('4.2').querySelector('.cis-results-open'));expect(props.onOpen).toHaveBeenCalledWith(rows[1]);
  await click(button('Expand all'));expect(ids()).toEqual(rows.map(record=>record.definition_id));
  await click(button('Collapse all'));expect(ids()).toEqual([]);expect(JSON.stringify(rows)).toBe(before);
  Object.values(api).forEach(method=>expect(method).not.toHaveBeenCalled());
});

test('one global SoA applicability filter retains decisions, warnings, supporting work and isolated Manage',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),before=JSON.stringify(rows),props=await render(rows);
  expect(container.querySelectorAll('[aria-label="Applicability filter"]')).toHaveLength(1);
  await click(button('Expand all'));
  expect(row('A.5.1').textContent).toContain('Necessary — Implemented');expect(row('A.5.1').textContent).toContain('2 Evidence · 1 open Findings');
  expect(row('A.5.2').textContent).toContain('Justification needed');
  await click(row('A.5.1').querySelector('[aria-label^="Manage "]'));
  expect(props.onManage).toHaveBeenCalledWith(rows.find(record=>record.definition_id==='A.5.1'));expect(props.onOpen).not.toHaveBeenCalled();
  await chooseApplicability('excluded');expect(ids()).toEqual(['A.5.2']);
  expect(group('annex_control/A.5').textContent).toContain('2 of 3 applicability decisions recorded');
  expect(group('annex_control/A.5').querySelector('[role="img"]').getAttribute('aria-label')).toBe('Necessary: 1, Not Necessary: 1, Decision needed: 1');
  expect(container.querySelectorAll('[aria-label="Applicability filter"]')).toHaveLength(1);
  await click(button('Clear search and filters'));
  expect(container.querySelector('[aria-label="Applicability filter"]').value).toBe('all');expect(ids()).toEqual([]);
  expect(props.onClear).toHaveBeenCalledTimes(1);expect(props.onPath).toHaveBeenLastCalledWith([]);expect(JSON.stringify(rows)).toBe(before);
});

test('Annex group bars use included-control implementation and retain excluded/undetermined records separately',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control');await render(rows,{view:'annex_control'});
  const theme=group('annex_control/A.5');expect(theme.textContent).toContain('1 of 1 applicable controls implemented');
  expect(theme.textContent).toContain('1 excluded · 1 applicability not determined');
  expect(theme.querySelector('[role="img"]').getAttribute('aria-label')).toBe('Implemented: 1, Partially implemented: 0, Not implemented: 0, Not assessed: 0');
  await click(theme);expect(ids()).toEqual(['A.5.1','A.5.2','A.5.3']);
  expect(row('A.5.2').querySelector('[aria-label^="Manage "]')).not.toBeNull();
});

test('parent filter intersections reveal only matching records and cannot change paths while forced open',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),matching=rows.filter(record=>record.definition_id==='A.5.1');
  const props=await render(rows,{view:'annex_control',visible:matching,filtered:true,filterLabel:'Implemented'});
  expect(ids()).toEqual(['A.5.1']);expect(group('annex_control/A.6')).toBeNull();
  expect(group('annex_control/A.5').disabled).toBe(true);await click(group('annex_control/A.5'));await key(group('annex_control/A.5'),'Enter');
  expect(props.onPath).not.toHaveBeenCalled();expect(ids()).toEqual(['A.5.1']);
  expect(group('annex_control/A.5').textContent).toContain('1 of 1 applicable controls implemented');
});

test('legacy full-key preferences, keyboard toggles and selected deep links reveal the correct native theme',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),props=await render(rows,{view:'annex_control',initialPath:['annex_control/A.8']});
  expect(row('A.8.1')).not.toBeNull();const toggle=group('annex_control/A.8');toggle.focus();expect(document.activeElement).toBe(toggle);
  await key(toggle,'Enter');expect(props.onPath).toHaveBeenLastCalledWith([]);expect(row('A.8.1')).toBeNull();
  await key(toggle,' ');expect(props.onPath).toHaveBeenLastCalledWith(['annex_control/A.8']);
  expect(document.getElementById(toggle.getAttribute('aria-controls'))).not.toBeNull();
  const selected=rows.find(record=>record.definition_id==='A.7.1');await act(async()=>root.render(<Controller {...props} selected={selected}/>));
  expect(group('annex_control/A.7').getAttribute('aria-expanded')).toBe('true');
  await click(row('A.7.1').querySelector('.cis-results-open'));expect(props.onOpen).toHaveBeenLastCalledWith(selected);
});

test('mixed dashboard populations keep separate native clause and Annex roots and all record identities',async()=>{
  const rows=fixture(),props=await render(rows,{view:'overview'});
  expect([...container.querySelectorAll('[data-iso-group]')].map(element=>element.dataset.isoGroup)).toEqual(['isms_clause','annex_control']);
  await click(button('Expand all'));expect(ids()).toEqual(rows.map(record=>record.definition_id));
  expect(container.querySelector('[aria-label="Applicability filter"]')).toBeNull();
  await click(row('4.1').querySelector('.cis-results-open'));await click(row('A.5.1').querySelector('.cis-results-open'));
  expect(props.onOpen.mock.calls.map(([record])=>record)).toEqual([rows[0],rows.find(record=>record.definition_id==='A.5.1')]);
});

test('search clear restores ordinary expansion without changing saved rows or filter controls',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control');await render(rows);
  const input=container.querySelector('[aria-label="Search requirements"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'A.6.1');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(ids()).toEqual(['A.6.1']);expect(group('annex_control/A.6').disabled).toBe(true);
  await click(button('Clear search and filters'));expect(input.value).toBe('');expect(group('annex_control/A.6').disabled).toBe(false);
  await click(group('annex_control/A.6'));expect(ids()).toEqual(['A.6.1']);await click(group('annex_control/A.6'));expect(ids()).toEqual([]);
});
