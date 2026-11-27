import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {CisVisualHeader,CisVisualSnapshot} from './BrawndoCisVisualRegister';
import {ProgramVisualHeader,ProgramVisualSnapshot,ProgramVisualToolbar,ProgramVisualColumns,ProgramVisualGroup,ProgramVisualRow} from './ProgramVisualPrimitives';
import {FrameworkRecordButton} from './FrameworkRecordAccess';
import {cis} from '@/lib/frameworks';
import {cisSummary} from '@/lib/cisVerification';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()}));
let root,container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{
  await act(async()=>root.unmount());container.remove();
  Object.values(api).forEach(method=>expect(method).not.toHaveBeenCalled());
});
const render=element=>act(async()=>root.render(element));
const click=element=>act(async()=>element.click());
const key=(element,value)=>act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));
const button=text=>[...container.querySelectorAll('button')].find(element=>element.textContent===text);
const summary=()=>cisSummary(['addressed','in_progress','needs_attention','not_assessed','not_applicable'].map(status=>({status})));
const row=overrides=>Object.freeze({framework_assessment_id:'native-record',client_id:'native-client',definition_id:'CC1.1',title:'Complete native criterion title',
  status:'addressed',verification:'needs_validation',last_assessed:new Date().toISOString(),
  work:Object.freeze({context_complete:true,open_findings:2,overdue_actions:1,overdue_reviews:0}),...overrides});

test.each([[1,56,15],[2,130,18],[3,153,18]])('CIS IG%s header defaults retain exact native title, metadata, actions and attributes',async(implementationGroup,count,controls)=>{
  const rows=cis.requirements.filter(record=>record.implementation_group<=implementationGroup),resume={...rows[0],definition_id:rows[0].id},onContinue=jest.fn(),onTheme=jest.fn();
  await render(<CisVisualHeader {...{rows,implementationGroup,resume,onContinue,onTheme}} summary={{total:rows.length}} asOf="Native saved date" theme="light"/>);
  expect(container.querySelector('header').className).toBe('dash-head v3-workspace-head page-head');
  expect(container.querySelector('h1').textContent).toBe(`CIS IG${implementationGroup}`);
  expect(container.querySelector('h1').hasAttribute('tabindex')).toBe(false);
  expect(container.querySelector('.page-head p').textContent).toBe(`CIS Controls v8.1 · Implementation Group ${implementationGroup} · ${controls} controls · ${count} safeguards · As of Native saved date`);
  expect(container.querySelector('.head-actions .primary').textContent).toBe(`Continue with ${resume.definition_id} ${resume.title}`);
  await click(container.querySelector('.head-actions .primary'));expect(onContinue).toHaveBeenCalledTimes(1);
  await click(container.querySelector('.head-actions .ghost'));expect(onTheme).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.head-actions .ghost').getAttribute('aria-label')).toBe('Switch to dark theme');
  expect(container.querySelectorAll('.head-actions svg .ic')).toHaveLength(2);
});

test('CIS snapshot defaults keep the approved structure, accessible ring graphics and status filter callbacks',async()=>{
  const onFilter=jest.fn(),s=summary();
  await render(<CisVisualSnapshot summary={s} filter="all" onFilter={onFilter} asOf="Native assessment date"/>);
  expect(container.querySelector('section').classList.contains('gn-cis-snapshot')).toBe(true);
  expect(container.querySelector('section').getAttribute('aria-labelledby')).toBe('cis-visual-snapshot');
  expect(container.querySelector('.gn-ring-label').textContent).toBe('Implemented');
  expect(container.querySelector('.gn-ring-value').textContent).toBe('25%');
  expect(container.querySelector('.gn-ring-copy').textContent).toBe('1 of 4 safeguards');
  expect(container.querySelector('.sgmap-asof').textContent).toBe('As of Native assessment date');
  expect(container.querySelector('.gn-map-metrics').textContent).toBe('Assessment coverage3 of 4 assessed75%');
  expect(container.querySelector('.gn-ring-cards').getAttribute('role')).toBe('group');
  expect([...container.querySelectorAll('.gn-ring-label')].map(element=>element.textContent)).toEqual(['Implemented','Partially implemented','Not implemented','Not assessed']);
  expect(container.querySelectorAll('.gn-ring-arc')).toHaveLength(4);
  for(const graphic of container.querySelectorAll('.gn-ring-figure svg')){
    expect(graphic.getAttribute('aria-hidden')).toBe('true');expect(graphic.getAttribute('focusable')).toBe('false');
  }
  expect(onFilter).not.toHaveBeenCalled();
  await click(container.querySelector('.gn-ring-card'));expect(onFilter).toHaveBeenLastCalledWith('addressed');
  await render(<CisVisualSnapshot summary={s} filter="addressed" onFilter={onFilter}/>);
  await click(container.querySelector('.gn-ring-card'));expect(onFilter).toHaveBeenLastCalledWith('all');
  expect(container.querySelector('.gn-cis-snapshot .note').textContent).toBe('Assessment progress, not a compliance percentage or certification. Freshness is separate from saved verification. 1 not applicable, excluded from implementation totals.');
  expect(container.querySelector('.gn-cis-snapshot .note button')).toBeNull();
});

test('SOC snapshot extensions reuse the same structure and explicit labels without changing native counts',async()=>{
  const s=Object.freeze(summary()),before=JSON.stringify(s),onFilter=jest.fn(),onNotApplicable=jest.fn();
  const statusLabels={needs_attention:'Implementation not established'};
  const view=filter=><ProgramVisualSnapshot summary={s} noun="criteria" id="soc-native-summary" {...{filter,onFilter,onNotApplicable,statusLabels}}/>;
  await render(view('all'));
  expect(container.querySelector('section').getAttribute('aria-labelledby')).toBe('soc-native-summary');
  expect(container.querySelector('.gn-ring-copy').textContent).toBe('1 of 4 criteria');
  expect(container.querySelector('.gn-ring-cards').getAttribute('role')).toBe('group');
  const negative=container.querySelector('.gn-ring-card[data-status=N]');
  expect(negative.getAttribute('aria-label')).toBe('Implementation not established: 1 of 4 criteria, 25%');
  expect(negative.tagName).toBe('BUTTON');expect(negative.type).toBe('button');expect(negative.tabIndex).toBe(0);
  negative.focus();expect(document.activeElement).toBe(negative);
  await click(negative);expect(onFilter).toHaveBeenLastCalledWith('needs_attention');
  await render(view('needs_attention'));
  await click(container.querySelector('.gn-ring-card[data-status=N]'));expect(onFilter).toHaveBeenLastCalledWith('all');
  await click(container.querySelector('.gn-ring-card[data-status=I]'));expect(onFilter).toHaveBeenLastCalledWith('addressed');
  await click(container.querySelector('.gn-ring-card'));expect(onFilter).toHaveBeenLastCalledWith('addressed');
  await click(container.querySelector('.gn-cis-snapshot .note button'));expect(onNotApplicable).toHaveBeenLastCalledWith('not_applicable');
  expect(JSON.stringify(s)).toBe(before);
});

test('ISO may omit the exclusion footer without changing native totals or the default CIS and SOC presentation',async()=>{
  const s=Object.freeze(summary()),before=JSON.stringify(s);
  await render(<ProgramVisualSnapshot summary={s} filter="all" onFilter={()=>{}} showExcludedNote={false}/>);
  expect(container.querySelector('.gn-cis-snapshot .note').textContent).toBe('Assessment progress, not a compliance percentage or certification. Freshness is separate from saved verification.');
  expect(container.querySelector('.gn-ring-copy').textContent).toBe('1 of 4 safeguards');
  expect(container.querySelector('.gn-map-metrics').textContent).toContain('3 of 4 assessed');
  expect(s.na).toBe(1);expect(JSON.stringify(s)).toBe(before);
  await render(<ProgramVisualSnapshot summary={s} filter="all" onFilter={()=>{}}/>);
  expect(container.querySelector('.gn-cis-snapshot .note').textContent).toContain('1 not applicable, excluded from implementation totals.');
});

test('expanding the item map opens the saved applicable record and omits excluded records',async()=>{
  const included=row({definition_id:'A.5.1',specification:'annex_control',soa_applicability:'included'}),onOpen=jest.fn();
  const excluded=row({definition_id:'A.5.2',framework_assessment_id:'excluded-record',specification:'annex_control',soa_applicability:'excluded'});
  const records=[included,excluded];
  await render(<ProgramVisualSnapshot summary={cisSummary(records)} rows={records} filter="all" onFilter={jest.fn()} onOpen={onOpen} noun="controls" mapName="control"/>);
  const toggle=container.querySelector('.gn-map-toggle'),snapshot=container.querySelector('.gn-cis-heading');
  expect(container.querySelectorAll('.sgmap-cell')).toHaveLength(0);
  await click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelectorAll('.sgmap-cell')).toHaveLength(1);
  const control=container.querySelector('.sgmap-cell');
  expect(control.getAttribute('aria-label')).toContain('A.5.1');
  await click(control);expect(onOpen).toHaveBeenCalledWith(included);
  await click(snapshot);expect(document.getElementById(snapshot.getAttribute('aria-controls')).hidden).toBe(true);
});

test('zero applicable and unavailable snapshots do not invent percentages or dates and unavailable cards disable filtering',async()=>{
  const onFilter=jest.fn();
  await render(<ProgramVisualSnapshot summary={cisSummary([{status:'not_applicable'}])} filter="all" onFilter={onFilter}/>);
  expect(container.querySelector('.gn-ring-value').textContent).toBe('—');expect(container.querySelector('.gn-ring-value .unit')).toBeNull();
  expect(container.querySelector('.sgmap-asof').textContent).toBe('Assessment date unavailable');
  await render(<ProgramVisualSnapshot summary={{...summary(),available:false,reason:'Native source incomplete'}} filter="all" onFilter={onFilter} onNotApplicable={jest.fn()}/>);
  expect(container.querySelector('.gn-ring-cards').getAttribute('aria-label')).toBe('Status mix unavailable');
  expect(container.querySelectorAll('.gn-ring-arc')).toHaveLength(0);
  expect(container.querySelectorAll('.gn-ring-card:enabled')).toHaveLength(0);
  expect(container.querySelector('.gn-cis-snapshot .note button')).toBeNull();
  expect(container.querySelector('.gn-cis-snapshot .note').textContent).toContain('Native source incomplete');
  expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  expect(onFilter).not.toHaveBeenCalled();
});

test('SOC header can supply native category metadata, focus and a back action without another header layout',async()=>{
  const onBack=jest.fn();
  await render(<ProgramVisualHeader title="Security — Common Criteria" metadata="Native SOC edition · 33 criteria" className="soc-program-heading" focusHeading
    beforeTitle={<button type="button" onClick={onBack}>Back to SOC 2</button>}/>);
  expect(container.querySelectorAll('h1')).toHaveLength(1);
  expect(container.querySelector('header').className).toBe('dash-head v3-workspace-head page-head soc-program-heading');
  expect(container.querySelector('p').textContent).toBe('Native SOC edition · 33 criteria');
  container.querySelector('h1').focus();expect(document.activeElement).toBe(container.querySelector('h1'));
  await click(button('Back to SOC 2'));expect(onBack).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.head-actions .primary')).toBeNull();
});

test('toolbar delegates search, native filters, ordering, grouping and expansion while preserving CIS controls',async()=>{
  const onSearch=jest.fn(),onFilter=jest.fn(),onOrder=jest.fn(),onGrouping=jest.fn(),onExpand=jest.fn(),onClear=jest.fn();
  const props={id:'native-register',title:'Safeguards',description:'All native safeguards in one register.',search:'',filter:'all',order:'program',counts:{all:5,attention:3,not_assessed:1,stale:2},
    grouping:{value:'domain',options:[['domain','Security domain'],['control','CIS control']],onChange:onGrouping},expand:{allOpen:false,onToggle:onExpand},summary:'5 safeguards in 2 domains',onSearch,onFilter,onOrder,onClear};
  await render(<ProgramVisualToolbar {...props}/>);
  expect([...container.children].map(element=>element.className)).toEqual(['panel-head card-head','filters','summary']);
  expect(container.querySelector('h2').id).toBe('native-register');
  expect(container.querySelector('input').placeholder).toBe('Search safeguards…');
  expect(container.querySelector('[aria-label="Show safeguards"]').textContent).toBe('All5Needs attention3Not assessed1Needs reassessment2');
  await click(button('CIS control'));expect(onGrouping).toHaveBeenCalledWith('control');
  await click(button('Needs attention3'));expect(onFilter).toHaveBeenCalledWith('attention');
  await act(async()=>{const input=container.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'native query');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(onSearch).toHaveBeenCalledWith('native query');
  await act(async()=>{const select=container.querySelector('select');select.value='gaps';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(onOrder).toHaveBeenCalledWith('gaps');await click(button('Expand all'));expect(onExpand).toHaveBeenCalledTimes(1);
  await render(<ProgramVisualToolbar {...props} search="native query" filter="attention"/>);
  expect(button('Expand all')).toBeUndefined();
  expect(container.querySelector('.chip-x').textContent).toBe('Needs attention · native query×');
  await click(container.querySelector('.chip-x button'));expect(onClear).toHaveBeenCalledTimes(1);
});

test('fixed hierarchy toolbars can omit unsupported grouping and expansion while retaining search, filter and order',async()=>{
  await render(<ProgramVisualToolbar id="soc-register" title="SOC 2 criteria" description="Native SOC scope." searchLabel="Search criteria" search="" filter="all" counts={{all:38,attention:5,not_assessed:2,stale:1}} order="program" summary="38 criteria"/>);
  expect(container.querySelector('[aria-label="Group by"]')).toBeNull();expect(button('Expand all')).toBeUndefined();
  expect(container.querySelector('input').placeholder).toBe('Search criteria…');
  expect(container.querySelector('[aria-label="Show criteria"]')).not.toBeNull();
  expect(container.querySelector('select option[value="gaps"]').textContent).toBe('Least implemented first');
});

test('group presentation retains native counts, expansion relationships and exact column headings',async()=>{
  const native=row(),onActivate=jest.fn(),group=Object.freeze({key:'security/CC1',name:'CC1 — Governance',sub:'Native group',rows:[native],available:true,summary:cisSummary([native])});
  await render(<><ProgramVisualColumns groupingLabel="Criteria group"/><ProgramVisualGroup {...{group,onActivate}} open panelId="native-panel" filter="all" dataControl="1"><span>Exact native child</span></ProgramVisualGroup></>);
  expect([...container.querySelector('.ghead').children].map(element=>element.textContent)).toEqual(['','Criteria group','Status mix','Implemented','Assessed']);
  const toggle=container.querySelector('.grow');expect(toggle.getAttribute('data-control')).toBe('1');
  expect(toggle.querySelector('button')).toBeNull();
  expect(toggle.getAttribute('aria-controls')).toBe('native-panel');expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById('native-panel').className).toBe('sgs');expect(container.querySelector('.gname small').textContent).toBe('1 safeguards · Native group');
  expect(container.querySelector('.g-impl').textContent).toBe('1 of 1100.0%');expect(container.querySelector('.g-ass').textContent).toBe('1 of 1');
  await click(toggle);expect(onActivate).toHaveBeenCalledTimes(1);
  await render(<ProgramVisualGroup group={{...group,available:false,summary:{...group.summary,available:false}}} panelId="native-panel" onActivate={onActivate}/>);
  expect(container.querySelector('.g-impl b').textContent).toBe('Unavailable');expect(container.querySelector('.sgs')).toBeNull();
  expect(container.querySelector('.sbar').getAttribute('aria-label')).toBe('Status mix unavailable');
});

test('category navigation rows do not advertise unsupported expansion',async()=>{
  const native=row(),onActivate=jest.fn();
  await render(<ProgramVisualGroup group={{name:'Security',rows:[native],summary:cisSummary([native]),available:true}} noun="criteria" onActivate={onActivate} testId="soc-category-security"/>);
  expect(container.querySelector('.grow').hasAttribute('aria-expanded')).toBe(false);
  expect(container.querySelector('.grow').hasAttribute('aria-controls')).toBe(false);
  await click(container.querySelector('.grow'));expect(onActivate).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.sgs')).toBeNull();
});

test('default expanded rows remain native buttons with linked-work summary, status and independent verification',async()=>{
  const native=row(),before=JSON.stringify(native),onOpen=jest.fn();
  await render(<ProgramVisualRow row={native} onOpen={onOpen}/>);
  const opener=container.querySelector('.sg');expect(opener.tagName).toBe('BUTTON');expect(opener.type).toBe('button');
  expect(opener.hasAttribute('role')).toBe(false);expect(opener.hasAttribute('tabindex')).toBe(false);
  expect([...opener.children].map(element=>element.className)).toEqual(['sg-id','sg-t','st','ver v-needs_validation','chev']);
  expect(opener.querySelector('.sg-t small').textContent).toBe('Linked work: 2 open Findings · 1 overdue Action Item');
  expect(opener.querySelector('.st').textContent).toBe('Implemented');
  expect(opener.querySelector('.ver').textContent).toBe('Needs validationAssessed today');
  expect(opener.querySelector('.ver svg').getAttribute('width')).toBe('14');
  await click(opener);expect(onOpen).toHaveBeenCalledWith(native);expect(JSON.stringify(native)).toBe(before);
});

test.each([undefined,{context_complete:false,open_findings:2,overdue_actions:0,overdue_reviews:0},{context_complete:true,open_findings:-1,overdue_actions:0,overdue_reviews:0}])('incomplete linked work remains unavailable rather than a fabricated zero: %p',async work=>{
  await render(<ProgramVisualRow row={row({work})}/>);
  expect(container.querySelector('.sg-t small').textContent).toBe('Linked work unavailable');
  expect(container.querySelector('.sg-t').textContent).not.toContain('0 open');
});

test('SOC management stays reachable without nested buttons or opening the criterion; supplied date never uses save tokens',async()=>{
  const native=row({owner_id:'native-owner',assessment_recorded_at:null,last_saved:'2026-10-31T12:00:00Z'}),before=JSON.stringify(native),onOpen=jest.fn(),onManage=jest.fn();
  await render(<ProgramVisualRow row={native} onOpen={onOpen} freshness={{label:'Legacy date unconfirmed'}} secondaryInfo="Owner: Native owner"
    statusLabels={{addressed:'Native implementation label'}} management={<FrameworkRecordButton record={native} onManage={onManage}/>}/>);
  const opener=container.querySelector('.sg'),manage=container.querySelector('.sg-management button');
  expect(opener.tagName).toBe('DIV');expect(opener.getAttribute('role')).toBe('link');expect(opener.tabIndex).toBe(0);
  expect(container.querySelector('button button')).toBeNull();expect(opener.querySelector('.sg-secondary-info').textContent).toBe('Linked work: 2 open Findings · 1 overdue Action Item · Owner: Native owner · Manage');
  expect(opener.querySelector('.st').textContent).toBe('Native implementation label');
  expect(opener.querySelector('.ver small').textContent).toBe('Legacy date unconfirmed');expect(opener.textContent).not.toContain('2026-10-31');
  manage.focus();await key(manage,'Enter');await key(manage,' ');expect(onOpen).not.toHaveBeenCalled();
  await click(manage);expect(onManage).toHaveBeenCalledWith(native);expect(onOpen).not.toHaveBeenCalled();
  opener.focus();await key(opener,'Enter');await key(opener,' ');expect(onOpen).toHaveBeenCalledTimes(2);
  await click(opener);expect(onOpen).toHaveBeenLastCalledWith(native);expect(JSON.stringify(native)).toBe(before);
});

test('compact management only omits an empty leading separator; default rows and nested action behavior remain native',async()=>{
  const native=row({work:{context_complete:true,open_findings:0,overdue_actions:0,overdue_reviews:0}}),onOpen=jest.fn(),onManage=jest.fn();
  const view=compactManagement=><ProgramVisualRow row={native} onOpen={onOpen} {...{compactManagement}} management={<FrameworkRecordButton record={native} onManage={onManage}/>}/>;
  await render(view(undefined));expect(container.querySelector('.sg-secondary-info').textContent).toBe(' · Manage');
  await render(view(true));expect(container.querySelector('.sg-secondary-info').textContent).toBe('Manage');
  await click(container.querySelector('.sg-management button'));expect(onManage).toHaveBeenCalledWith(native);expect(onOpen).not.toHaveBeenCalled();
  await key(container.querySelector('.sg'),'Enter');expect(onOpen).toHaveBeenCalledTimes(1);
});
