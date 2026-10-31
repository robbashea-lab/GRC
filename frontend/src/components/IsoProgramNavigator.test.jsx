import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import IsoProgramNavigator from './IsoProgramNavigator';
import IsoProgramApplicabilityBar from './IsoProgramApplicabilityBar';
import {frameworkCatalog} from '@/lib/frameworks';
import {matchesAssessment} from '@/lib/frameworkWorkspace';
import {isoSoaCounts} from '@/lib/isoProgramPresentation';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),post:jest.fn(),patch:jest.fn(),delete:jest.fn()}}));

function fixture(clientId='synthetic-iso'){
  const saved={
    '4.1':{status:'addressed'},'4.2':{status:'in_progress'},'5.1':{status:'needs_attention'},
    'A.5.1':{status:'addressed',soa_applicability:'included',soa_justification:'Recorded risk treatment',work:{context_complete:true,evidence_count:2,latest_evidence_at:'2026-10-01',open_findings:1,overdue_actions:0,overdue_reviews:0,finding_ids:['finding'],review_ids:['review']}},
    'A.5.2':{status:'not_assessed',soa_applicability:'excluded',soa_justification:''},
    'A.5.3':{status:'addressed',soa_applicability:'',soa_justification:''},
    'A.6.1':{status:'not_assessed'},'A.7.1':{status:'not_assessed',soa_applicability:'included',soa_justification:'Physical scope'},
    'A.8.1':{status:'in_progress',soa_applicability:'included',soa_justification:'Technology scope'},
  };
  return frameworkCatalog('iso-27001').requirements.filter(definition=>saved[definition.id]).map(definition=>Object.freeze({
    ...definition,definition_id:definition.id,framework_assessment_id:`${clientId}:${definition.id}`,client_id:clientId,framework_key:'iso-27001',
    last_assessed:'2026-10-01T12:00:00Z',work:{context_complete:true,evidence_count:0,open_findings:0,overdue_actions:0,overdue_reviews:0,finding_ids:[],review_ids:[]},...saved[definition.id],
  }));
}

function Controller({rows,view='soa',initialPath=[],initialFilter='all',selected,onOpen,onManage,onPath,onClear,onFilter,onApplicability,visible:provided,filtered=false,filterLabel='Search results',available=true,countsAvailable=true,controlled=false}){
  const [path,setPath]=useState(initialPath),[search,setSearch]=useState(''),[filter,setFilter]=useState(initialFilter),[applicability,setApplicability]=useState('all');
  const visible=provided||rows.filter(row=>(view!=='annex_control'||!['addressed','in_progress','needs_attention','not_assessed','assessed','gaps'].includes(filter)||row.soa_applicability==='included')&&matchesAssessment(row,filter,search));
  const changeApplicability=next=>{setApplicability(next);onApplicability?.(next);};
  return <>{controlled&&<div data-testid="summary-applicability"><IsoProgramApplicabilityBar counts={isoSoaCounts(rows)} filter={applicability} onFilter={changeApplicability}/></div>}
    <IsoProgramNavigator clientId={rows[0]?.client_id||'synthetic-iso'} {...{view,rows,visible,filter,filterLabel,search,selected,onOpen,onManage,available,countsAvailable}}
      filtered={filtered||filter!=='all'||!!search.trim()} path={path} onSearch={setSearch}
      onFilter={next=>{setFilter(next);onFilter?.(next);}}
      applicability={controlled?applicability:undefined} onApplicability={controlled?changeApplicability:onApplicability}
      onPath={next=>{setPath(next);onPath?.(next);}} onClear={()=>{setSearch('');setFilter('all');onClear?.();}}/>
  </>;
}

let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers().setSystemTime(new Date('2026-10-31T12:00:00Z'));container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);jest.clearAllMocks();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});
const click=element=>act(async()=>element.click());
const button=label=>[...container.querySelectorAll('button')].find(element=>element.textContent===label);
const group=key=>container.querySelector(`[data-control="${key}"]`);
const groupKeys=()=>[...container.querySelectorAll('[data-control]')].map(element=>element.dataset.control);
const row=id=>container.querySelector(`[data-testid="requirement-${id}"]`);
const ids=()=>[...container.querySelectorAll('[data-testid^="requirement-"]')].map(element=>element.dataset.testid.slice('requirement-'.length));
const searchInput=()=>container.querySelector('.iso-program-register input[type="search"]');
async function render(rows,options={}){
  const props={rows,onOpen:jest.fn(),onManage:jest.fn(),onPath:jest.fn(),onClear:jest.fn(),onFilter:jest.fn(),onApplicability:jest.fn(),...options};
  await act(async()=>root.render(<Controller {...props}/>));return props;
}
async function chooseApplicability(value){await act(async()=>{const select=container.querySelector('[aria-label="Applicability filter"]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});}
async function type(value){await act(async()=>{const input=searchInput();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function order(value){await act(async()=>{const select=container.querySelector('.f-field select:not([aria-label="Applicability filter"])');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});}
const key=(element,value)=>act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));

test('clause groups expand in native catalog order and full rows open the exact requirement without writes',async()=>{
  const rows=Object.freeze(fixture().filter(record=>record.specification==='isms_clause')),before=JSON.stringify(rows),props=await render(rows,{view:'isms_clause'});
  expect(groupKeys()).toEqual(['isms_clause/4','isms_clause/5']);expect(ids()).toEqual([]);
  const toggle=group('isms_clause/4');expect(toggle.tagName).toBe('BUTTON');expect(toggle.type).toBe('button');toggle.focus();expect(document.activeElement).toBe(toggle);
  await click(toggle);expect(ids()).toEqual(['4.1','4.2']);expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(toggle.getAttribute('aria-controls')).className).toBe('sgs');
  await click(row('4.2'));expect(props.onOpen).toHaveBeenCalledWith(rows[1]);
  await click(button('Expand all'));expect(ids()).toEqual(rows.map(record=>record.definition_id));
  await click(button('Collapse all'));expect(ids()).toEqual([]);expect(JSON.stringify(rows)).toBe(before);
  Object.values(api).forEach(method=>expect(method).not.toHaveBeenCalled());
});

test('one native SoA applicability filter preserves saved decisions, documentation gaps, supporting work and isolated Manage',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),before=JSON.stringify(rows),props=await render(rows);
  expect(container.querySelectorAll('[aria-label="Applicability filter"]')).toHaveLength(1);
  expect(container.querySelector('[aria-label="Show requirements"]')).toBeNull();expect(container.querySelector('[aria-label="Group by"]')).toBeNull();
  await click(button('Expand all'));
  expect(row('A.5.1').querySelector('.st').textContent).toBe('Necessary');
  expect(row('A.5.1').textContent).toContain('Saved implementation: Implemented');expect(row('A.5.1').textContent).toContain('2 Evidence');expect(row('A.5.1').textContent).toContain('1 open Finding');
  expect(row('A.5.2').textContent).toContain('Justification needed');expect(row('A.5.2').textContent).toContain('Saved implementation: Not Assessed');
  await click(row('A.5.1').querySelector('[aria-label^="Manage "]'));
  expect(props.onManage).toHaveBeenCalledWith(rows.find(record=>record.definition_id==='A.5.1'));expect(props.onOpen).not.toHaveBeenCalled();
  await chooseApplicability('excluded');expect(ids()).toEqual(['A.5.2']);
  const theme=group('annex_control/A.5');expect(theme.querySelector('.g-impl').textContent).toBe('1 of 333.3%');expect(theme.querySelector('.g-ass').textContent).toBe('2 of 3');
  expect(theme.querySelector('[role="img"]').getAttribute('aria-label')).toBe('Necessary: 1, Not Necessary: 1, Decision needed: 1');
  expect(theme.querySelector('button')).toBeNull();expect(container.querySelectorAll('[aria-label="Applicability filter"]')).toHaveLength(1);
  await click(container.querySelector('[aria-label="Clear search and filters"]'));
  expect(container.querySelector('[aria-label="Applicability filter"]').value).toBe('all');expect(ids()).toEqual([]);
  expect(props.onClear).toHaveBeenCalledTimes(1);expect(props.onPath).toHaveBeenLastCalledWith([]);expect(JSON.stringify(rows)).toBe(before);
});

test('Annex bars count only included-control implementation while excluded and undetermined records stay reachable',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control');await render(rows,{view:'annex_control'});
  const theme=group('annex_control/A.5');expect(theme.querySelector('.g-impl').textContent).toBe('1 of 1100.0%');expect(theme.querySelector('.g-ass').textContent).toBe('1 of 1');
  expect(theme.textContent).toContain('1 excluded · 1 applicability not determined');
  expect(theme.querySelector('[role="img"]').getAttribute('aria-label')).toBe('Implemented: 1, Partially Implemented: 0, Not Implemented / Needs Validation: 0, Not Assessed: 0');
  await click(theme);expect(ids()).toEqual(['A.5.1','A.5.2','A.5.3']);
  expect(row('A.5.2').querySelector('[aria-label^="Manage "]')).not.toBeNull();
  expect([...container.querySelector('.ghead').children].map(element=>element.textContent)).toEqual(['','Theme','Status mix','Implemented','Assessed']);
});

test('parent filter intersections reveal exact hits without changing the full group denominator or forced-open path',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),matching=rows.filter(record=>record.definition_id==='A.5.1');
  const props=await render(rows,{view:'annex_control',visible:matching,filtered:true,filterLabel:'Implemented'});
  expect(ids()).toEqual(['A.5.1']);expect(group('annex_control/A.6')).toBeNull();
  const toggle=group('annex_control/A.5');expect(toggle.disabled).toBe(true);
  expect(document.getElementById(toggle.getAttribute('aria-describedby')).textContent).toBe('Matching results stay expanded; clear filters to collapse.');
  await click(toggle);expect(props.onPath).not.toHaveBeenCalled();expect(ids()).toEqual(['A.5.1']);
  expect(toggle.querySelector('.g-impl').textContent).toBe('1 of 1100.0%');expect(row('A.5.1').closest('.reg')).not.toBeNull();
});

test('legacy full-key preferences, native button focus and selected deep links reveal the correct group',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),props=await render(rows,{view:'annex_control',initialPath:['annex_control/A.8']});
  expect(row('A.8.1')).not.toBeNull();const toggle=group('annex_control/A.8');toggle.focus();expect(document.activeElement).toBe(toggle);
  expect(toggle.tagName).toBe('BUTTON');await click(toggle);expect(props.onPath).toHaveBeenLastCalledWith([]);expect(row('A.8.1')).toBeNull();
  await click(toggle);expect(props.onPath).toHaveBeenLastCalledWith(['annex_control/A.8']);
  expect(document.getElementById(toggle.getAttribute('aria-controls'))).not.toBeNull();
  const selected=rows.find(record=>record.definition_id==='A.7.1');await act(async()=>root.render(<Controller {...props} selected={selected}/>));
  expect(group('annex_control/A.7').getAttribute('aria-expanded')).toBe('true');
  const opener=row('A.7.1');opener.focus();await key(opener,'Enter');await key(opener,' ');
  expect(props.onOpen).toHaveBeenLastCalledWith(selected);expect(props.onOpen).toHaveBeenCalledTimes(2);
});

test('mixed Dashboard-derived results use native leaf clauses/themes without fake nesting or duplicate record opening',async()=>{
  const rows=fixture(),props=await render(rows,{view:'overview'});
  expect(groupKeys()).toEqual(['isms_clause/4','isms_clause/5','annex_control/A.5','annex_control/A.6','annex_control/A.7','annex_control/A.8']);
  await click(button('Expand all'));expect(ids()).toEqual(rows.map(record=>record.definition_id));expect(new Set(ids()).size).toBe(rows.length);
  expect(container.querySelector('[aria-label="Applicability filter"]')).toBeNull();
  await click(row('4.1'));await click(row('A.5.1'));
  expect(props.onOpen.mock.calls.map(([record])=>record)).toEqual([rows[0],rows.find(record=>record.definition_id==='A.5.1')]);
});

test('search clear restores ordinary disclosure, the native dropdown and search focus without writes',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control');await render(rows);
  const input=searchInput();expect(input.placeholder).toBe('Search requirements…');await type('A.6.1');
  expect(ids()).toEqual(['A.6.1']);expect(group('annex_control/A.6').disabled).toBe(true);
  await click(container.querySelector('[aria-label="Clear search and filters"]'));expect(input.value).toBe('');expect(document.activeElement).toBe(input);expect(group('annex_control/A.6').disabled).toBe(false);
  await click(group('annex_control/A.6'));expect(ids()).toEqual(['A.6.1']);await click(group('annex_control/A.6'));expect(ids()).toEqual([]);
});

test('Annex filter chip counts match native included-scope status results',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),props=await render(rows,{view:'annex_control'});
  const chips=container.querySelector('[aria-label="Show requirements"]');
  expect(chips.textContent).toBe('All6Needs attention5Not Assessed1Needs reassessment0');
  const notAssessed=[...chips.querySelectorAll('button')].find(element=>element.textContent.startsWith('Not Assessed'));
  await click(notAssessed);expect(props.onFilter).toHaveBeenCalledWith('not_assessed');expect(ids()).toEqual(['A.7.1']);
});

test('SoA least-documented ordering is display-only and keeps each native group denominator',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),before=JSON.stringify(rows);await render(rows);
  expect(container.querySelector('option[value="gaps"]').textContent).toBe('Least documented first');await order('gaps');
  expect(groupKeys()).toEqual(['annex_control/A.6','annex_control/A.5','annex_control/A.7','annex_control/A.8']);
  await click(button('Expand all'));expect(ids()).toEqual(['A.6.1','A.5.1','A.5.2','A.5.3','A.7.1','A.8.1']);
  expect(group('annex_control/A.5').querySelector('.g-impl').textContent).toBe('1 of 333.3%');expect(JSON.stringify(rows)).toBe(before);
});

test('implementation order preserves native tie order and never treats no-applicable groups as zero percent',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),before=JSON.stringify(rows);await render(rows,{view:'annex_control'});await order('gaps');
  expect(groupKeys()).toEqual(['annex_control/A.7','annex_control/A.8','annex_control/A.5','annex_control/A.6']);
  expect(group('annex_control/A.6').querySelector('.g-impl').textContent).toBe('0 of 0—');expect(JSON.stringify(rows)).toBe(before);
});

test('controlled SoA summary filtering and dropdown share one existing applicability selection',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),props=await render(rows,{controlled:true});
  const summary=container.querySelector('[data-testid="summary-applicability"]');
  const necessary=summary.querySelector('button[aria-label^="Necessary:"]');expect(necessary.type).toBe('button');
  await click(necessary);expect(props.onApplicability.mock.calls).toEqual([['included']]);
  expect(container.querySelector('[aria-label="Applicability filter"]').value).toBe('included');expect(ids()).toEqual(['A.5.1','A.7.1','A.8.1']);expect(props.onApplicability).toHaveBeenLastCalledWith('included');
  await chooseApplicability('excluded');expect(summary.querySelector('button[aria-label^="Not Necessary:"]').getAttribute('aria-pressed')).toBe('true');expect(ids()).toEqual(['A.5.2']);
  await click(container.querySelector('[aria-label="Clear search and filters"]'));
  expect(container.querySelector('[aria-label="Applicability filter"]').value).toBe('all');expect(props.onApplicability).toHaveBeenLastCalledWith('all');
});

test('SoA keeps an incoming implementation URL view as context without adding implementation controls',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control');await render(rows,{initialFilter:'addressed',filterLabel:'Implemented'});
  expect(container.querySelector('[aria-label="Show requirements"]')).toBeNull();expect(ids()).toEqual(['A.5.1','A.5.3']);
  expect(container.querySelector('.chip-x').textContent).toContain('Implemented');
  await chooseApplicability('included');expect(ids()).toEqual(['A.5.1']);
});

test('unavailable implementation figures cannot certify percentages while safe SoA diagnostics remain visible',async()=>{
  const rows=fixture().filter(record=>record.specification==='annex_control'),props=await render(rows,{view:'annex_control',available:false,countsAvailable:true});
  expect(group('annex_control/A.5').querySelector('.g-impl').textContent).toBe('Unavailable—');
  expect(group('annex_control/A.5').querySelector('.sbar').getAttribute('aria-label')).toBe('Status mix unavailable');expect(group('annex_control/A.5').querySelectorAll('.sbar i')).toHaveLength(0);
  await act(async()=>root.render(<Controller {...props} view="soa" available={false} countsAvailable={true}/>));
  expect(group('annex_control/A.5').querySelector('.g-impl').textContent).toBe('1 of 333.3%');expect(group('annex_control/A.5').querySelector('.g-ass').textContent).toBe('2 of 3');
  await act(async()=>root.render(<Controller {...props} view="soa" available={false} countsAvailable={false}/>));
  expect(group('annex_control/A.5').querySelector('.g-impl').textContent).toBe('Unavailable—');expect(group('annex_control/A.5').querySelector('.sbar').getAttribute('aria-label')).toBe('Applicability counts unavailable');
  expect(container.querySelector('.iso-register-result-count').textContent).toBe('Record counts unavailable');
});

test.each(['isms_clause','annex_control','soa','overview'])('all native %s records remain reachable exactly once in catalog grouping',async view=>{
  const rows=frameworkCatalog('iso-27001').requirements.filter(definition=>view==='overview'||(view==='isms_clause'?definition.specification==='isms_clause':definition.specification==='annex_control')).map(definition=>Object.freeze({...definition,definition_id:definition.id,framework_assessment_id:'full-native:'+definition.id,client_id:'full-native',framework_key:'iso-27001',status:'not_assessed',soa_applicability:definition.specification==='annex_control'?'included':undefined,soa_justification:definition.specification==='annex_control'?'Synthetic saved scope':undefined,work:{context_complete:true,evidence_count:0,open_findings:0,overdue_actions:0,overdue_reviews:0}}));
  const before=JSON.stringify(rows);await render(rows,{view});await click(button('Expand all'));
  expect(ids()).toEqual(rows.map(record=>record.definition_id));expect(new Set(ids()).size).toBe(rows.length);
  const clauses=groupKeys().filter(value=>value.startsWith('isms_clause/'));
  if(view==='isms_clause'||view==='overview')expect(clauses).toEqual(['isms_clause/4','isms_clause/5','isms_clause/6','isms_clause/7','isms_clause/8','isms_clause/9','isms_clause/10']);
  if(view!=='isms_clause')expect(groupKeys().filter(value=>value.startsWith('annex_control/'))).toEqual(['annex_control/A.5','annex_control/A.6','annex_control/A.7','annex_control/A.8']);
  for(const record of rows)expect(row(record.definition_id).closest('.reg')).not.toBeNull();expect(JSON.stringify(rows)).toBe(before);
});
