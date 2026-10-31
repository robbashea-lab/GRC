import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoProgramRow from './IsoProgramRow';

const TODAY=new Date('2026-10-31T12:00:00Z');
const record=overrides=>({definition_id:'A.5.1',framework_assessment_id:'synthetic-iso:A.5.1',client_id:'synthetic-iso',framework_key:'iso-27001',specification:'annex_control',title:'Policies for information security',status:'addressed',last_assessed:'2026-10-01T12:00:00Z',soa_applicability:'included',soa_justification:'Recorded scope rationale',work:{context_complete:true,evidence_count:2,latest_evidence_at:'2026-10-01T12:00:00Z',open_findings:1,overdue_actions:0,overdue_reviews:0},...overrides});
let container,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(row,options={}){const props={row,onOpen:jest.fn(),today:TODAY,...options};await act(async()=>root.render(<IsoProgramRow {...props}/>));return props;}
const opener=()=>container.querySelector('.sg');
const click=element=>act(async()=>element.click());
const key=(element,value)=>act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));

test('ISO row derives verification from native dated assessment and evidence rather than a saved verification flag',async()=>{
  const row=Object.freeze(record({verification:'not_verified'})),before=JSON.stringify(row);await render(row);
  expect(opener().querySelector('.st').textContent).toBe('Implemented');
  expect(opener().querySelector('[aria-label="Derived verification: Verified"]')).not.toBeNull();
  expect(opener().querySelector('.ver small').textContent).toBe('Assessed 30d ago');
  expect(opener().querySelector('.ver svg').getAttribute('width')).toBe('14');
  expect(opener().textContent).toContain('2 Evidence');expect(opener().textContent).toContain('Linked work: 1 open Finding');
  await render({...row,verification:'verified',work:{...row.work,evidence_count:0,latest_evidence_at:null}});
  expect(opener().querySelector('[aria-label="Derived verification: Not verified"]')).not.toBeNull();
  expect(opener().querySelector('.st').textContent).toBe('Implemented');expect(JSON.stringify(row)).toBe(before);
});

test.each([
  [{last_assessed:'2025-10-30T12:00:00Z',last_saved:'2026-10-31T12:00:00Z',assessment_recorded_at:'2026-10-31T12:00:00Z'},'Stale · 12 months','Not verified'],
  [{last_assessed:null,last_saved:'2026-10-31T12:00:00Z',assessment_recorded_at:'2026-10-31T12:00:00Z'},'Never assessed','Not verified'],
  [{last_assessed:'invalid',assessment_recorded_at:'2026-10-31T12:00:00Z'},'Assessment date unavailable','Not verified'],
  [{status:'not_assessed',verification:'verified',last_assessed:'2026-10-31T12:00:00Z'},'Never assessed','Not established'],
])('ISO freshness remains separate from narrative-save and SOC judgment clocks (%j)',async(overrides,label,verification)=>{
  await render(record(overrides));expect(opener().querySelector('.ver small').textContent).toBe(label);
  expect(opener().querySelector(`[aria-label="Derived verification: ${verification}"]`)).not.toBeNull();
});

test.each([
  ['not_assessed','Not Assessed','Not established'],
  ['in_progress','Partially Implemented','Gap identified'],
  ['needs_attention','Not Implemented / Needs Validation','Gap identified'],
  ['not_applicable','Not Applicable','Not applicable'],
])('native ISO implementation terminology and independent verification are preserved for %s',async(status,label,verification)=>{
  await render(record({status}));expect(opener().querySelector('.st').textContent).toBe(label);
  expect(opener().querySelector(`[aria-label="Derived verification: ${verification}"]`)).not.toBeNull();
});

test('SoA decisions and saved implementation stay distinct, including unassessed necessary controls',async()=>{
  await render(record({status:'not_assessed'}),{soa:true});
  expect(opener().querySelector('.st').textContent).toBe('Necessary');expect(opener().textContent).toContain('Saved implementation: Not Assessed');
  expect(opener().textContent).not.toContain('Not Implemented');expect(opener().textContent).not.toContain('Justification needed');
  await render(record({status:'needs_attention',soa_justification:'  '}),{soa:true});
  expect(opener().querySelector('.st').textContent).toBe('Necessary');expect(opener().textContent).toContain('Saved implementation: Not Implemented / Needs Validation');
  expect(opener().textContent).toContain('Justification needed');expect(opener().textContent).not.toContain('Saved implementation: Partially Implemented');
});

test.each([
  ['excluded','Not Necessary','Excluded for recorded reason',false],
  ['excluded','Not Necessary',null,true],
  ['included','Necessary',42,true],
  ['undetermined','Decision needed','',false],
  [undefined,'Decision needed',undefined,false],
  ['toString','Decision needed','',false],
])('SoA applicability %s retains its own decision and documentation state',async(applicability,label,justification,warning)=>{
  await render(record({soa_applicability:applicability,soa_justification:justification}),{soa:true});
  expect(opener().querySelector('.st').textContent).toBe(label);expect(opener().textContent.includes('Justification needed')).toBe(warning);
  expect(opener().textContent).toContain('Saved implementation: Implemented');
});

test.each([undefined,null,-1,1.5,'2'])('missing or invalid evidence count %p is not fabricated as zero evidence',async count=>{
  await render(record({work:{context_complete:false,evidence_count:count}}));
  expect(opener().textContent).toContain('Evidence unavailable');expect(opener().textContent).toContain('Linked work unavailable');
  expect(opener().textContent).not.toContain('0 Evidence');
});

test('every native linked-work count is shown without replacing it with record-array lengths',async()=>{
  await render(record({work:{context_complete:true,evidence_count:0,open_findings:2,overdue_actions:1,overdue_reviews:3,finding_ids:[],review_ids:[]}}));
  expect(opener().textContent).toContain('Linked work: 2 open Findings · 1 overdue Action Item · 3 overdue Reviews');
  expect(opener().textContent).toContain('0 Evidence');
});

test('row activation passes the original record while Manage stays isolated for clicks and keyboard input',async()=>{
  const row=Object.freeze(record()),before=JSON.stringify(row),props=await render(row,{onManage:jest.fn()});
  const open=opener(),manage=open.querySelector('[aria-label^="Manage "]');
  expect(open.tagName).toBe('DIV');expect(open.getAttribute('role')).toBe('link');expect(open.tabIndex).toBe(0);
  expect(open.getAttribute('aria-label')).toBe('Open ISO record A.5.1 Policies for information security');
  await click(open);await key(open,'Enter');await key(open,' ');expect(props.onOpen.mock.calls).toEqual([[row],[row],[row]]);
  await key(manage,'Enter');await key(manage,' ');await click(manage);
  expect(props.onOpen).toHaveBeenCalledTimes(3);expect(props.onManage.mock.calls).toEqual([[row]]);
  expect(open.querySelectorAll('button')).toHaveLength(1);expect(manage.type).toBe('button');expect(JSON.stringify(row)).toBe(before);
});

test('without record management, the whole row is one native button and unknown saved states are honest',async()=>{
  const row=record({status:'toString'}),props=await render(row,{soa:true});
  expect(opener().tagName).toBe('BUTTON');expect(opener().type).toBe('button');expect(opener().querySelector('button')).toBeNull();
  expect(opener().textContent).toContain('Saved implementation: Status unavailable');await click(opener());expect(props.onOpen).toHaveBeenCalledWith(row);
});
