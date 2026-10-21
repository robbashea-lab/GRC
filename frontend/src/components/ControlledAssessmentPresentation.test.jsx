import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkAssessmentWorkspace from './FrameworkAssessmentWorkspace';
import PrestigeSocAssessment from './PrestigeSocAssessment';
import FrameworkProgramCard from './FrameworkProgramCard';
import {AssessmentOverview} from './BrawndoCisOverview';
import {frameworkDefinition} from '@/lib/frameworks';
import {cisSummary} from '@/lib/cisVerification';

jest.mock('react-router-dom',()=>({Link:({to,children,...props})=><a href={to} {...props}>{children}</a>}),{virtual:true});
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClient:null})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(async()=>({data:[]}))},formatError:e=>e.message}));
jest.mock('./BrawndoCisFindings',()=>()=> <textarea aria-label="Finding draft" defaultValue="Retained Finding draft"/>);
jest.mock('./IsoGuidedAssessor',()=>function Guide({disabled,configuration}){
  return <div className="guided-in-assessment" data-testid="guide-boundary" data-active={configuration?.__program_active}><textarea aria-label="Guide draft" defaultValue="Retained guide draft" disabled={disabled}/></div>;
});
jest.mock('./SocGuidedAssessor',()=>require('./IsoGuidedAssessor'));

const SOC_LABELS={addressed:'Addressed (Readiness)',in_progress:'Partially Addressed',needs_attention:'Needs Remediation / Validation',not_assessed:'Not Assessed',not_applicable:'Not Applicable'};
const SOC_SEGMENTS={addressed:SOC_LABELS.addressed,partial:SOC_LABELS.in_progress,gap:SOC_LABELS.needs_attention,notAssessed:SOC_LABELS.not_assessed,notApplicable:SOC_LABELS.not_applicable};
const configuration={__program_active:true,categories:['security']};
let host,root,callbacks;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  callbacks={put:jest.fn(),save:jest.fn(),saveAndNext:jest.fn(),close:jest.fn(),run:jest.fn(),setFinding:jest.fn(),setNested:jest.fn(),setFeedback:jest.fn(),setGuidedDraft:jest.fn(),saveGuidedAssessment:jest.fn()};
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
const render=async element=>act(async()=>root.render(element));
const button=name=>[...document.querySelectorAll('button')].find(el=>el.textContent===name);
async function fill(label,value){
  const el=document.querySelector(`[aria-label="${label}"]`);
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
}
async function tab(name){await act(async()=>button(name).dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));}
function recordFor(framework,id){
  return {client_id:'local-presentation-fixture',framework_key:framework,framework_assessment_id:framework+':'+id,definition_id:id,status:'in_progress',verification:'needs_validation',implementation:'Exact native wording\nwith a second line.',soa_applicability:'included',soa_justification:'Retained scoped justification',iso_assessment_checks:['retained-iso-id'],soc_assessment_checks:['retained-soc-id'],assessment_history:[{status:'needs_attention',implementation:'Historical wording'}],last_assessed:'2026-10-01T12:00:00Z'};
}
function Native({record,context=true,retainedConfiguration,writable=true}){
  const [form,setForm]=useState(record),framework=record.framework_key;
  const state={open:true,record,current:record,definition:frameworkDefinition(framework,record.definition_id),form,ctx:context?{configuration}:null,guidedConfiguration:retainedConfiguration,related:{},writable,busy:false,dirty:JSON.stringify(form)!==JSON.stringify(record)};
  const actions={...callbacks,put:(key,value)=>{callbacks.put(key,value);setForm(previous=>({...previous,[key]:value}));}};
  return framework==='soc-2'?<PrestigeSocAssessment state={state} actions={actions}/>:<FrameworkAssessmentWorkspace state={state} actions={actions}/>;
}

test.each([['iso-27001','4.1'],['iso-27001','A.8.11'],['soc-2','CC1.1']])('%s %s starts with native content and embeds the guide in summary, adds Items and retains native data and drafts',async(framework,id)=>{
  const record=recordFor(framework,id),saved=JSON.stringify(record);await render(<Native record={record}/>);
  const main=document.querySelector('.brawndo-assessment-main'),layout=main.querySelector('.assessment-layout'),guide=main.querySelector('[data-testid="guide-boundary"]');
  expect(main.firstElementChild).toBe(layout);expect(guide.closest('.assessment-summary')).toBeTruthy();
  expect([...document.querySelectorAll('[role=tab]')].map(el=>el.textContent)).toEqual(['Requirement & implementation','Items to address','Findings']);
  const disclosure=document.querySelector('.assessment-summary');expect(disclosure.open).toBe(false);
  await act(async()=>{disclosure.open=true;disclosure.dispatchEvent(new Event('toggle'));});expect(disclosure.open).toBe(true);
  expect(document.querySelector('.assessment-inline-criteria')).toBeNull();
  expect(record[framework==='soc-2'?'soc_assessment_checks':'iso_assessment_checks']).toEqual([framework==='soc-2'?'retained-soc-id':'retained-iso-id']);
  await fill('Current implementation','Unsaved native wording\nkept through guidance and Findings');
  await tab('Findings');await fill('Finding draft','Unsaved Finding text');await tab('Requirement & implementation');
  expect(document.querySelector('[aria-label="Current implementation"]').value).toBe('Unsaved native wording\nkept through guidance and Findings');
  expect(document.querySelector('[aria-label="Finding draft"]').value).toBe('Unsaved Finding text');
  expect(callbacks.save).not.toHaveBeenCalled();expect(JSON.stringify(record)).toBe(saved);
  if(id==='A.8.11'){
    expect(document.querySelector('[aria-label="SoA applicability"]').value).toBe('included');
    expect(document.querySelector('[aria-label="SoA justification"]').value).toBe(record.soa_justification);
  }
  if(framework==='iso-27001')expect(document.querySelector('[aria-label="Saved verification"]')).toBeNull();
});

test('SOC native status labels use readiness vocabulary while callbacks retain raw status keys and separate verification',async()=>{
  const record=recordFor('soc-2','CC1.1');await render(<Native record={record}/>);
  const radios=[...document.querySelectorAll('input[name="psoc-status"]')];
  expect(radios.map(el=>el.value)).toEqual(['addressed','in_progress','needs_attention','not_assessed','not_applicable']);
  expect(radios.map(el=>el.parentElement.textContent)).toEqual(radios.map(el=>SOC_LABELS[el.value]));
  expect(document.querySelector('[aria-label="Saved implementation status"]').textContent).toBe('Partially Addressed');
  expect(document.querySelector('[aria-label="Saved verification"]').textContent).toBe('Needs validation');
  await act(async()=>radios[0].click());expect(callbacks.put).toHaveBeenCalledWith('status','addressed');
  expect(record.status).toBe('in_progress');expect(record.verification).toBe('needs_validation');expect(callbacks.save).not.toHaveBeenCalled();
});

test.each([['iso-27001','A.8.11'],['soc-2','CC1.1']])('%s retained configuration keeps same guide node and work disabled during context failure',async(framework,id)=>{
  const record=recordFor(framework,id);await render(<Native record={record}/>);
  const guide=document.querySelector('[data-testid="guide-boundary"]');await fill('Guide draft','Exact unsaved guide work');
  await render(<Native record={record} context={false} retainedConfiguration={configuration}/>);
  expect(document.querySelector('[data-testid="guide-boundary"]')).toBe(guide);
  expect(document.querySelector('[aria-label="Guide draft"]').value).toBe('Exact unsaved guide work');expect(document.querySelector('[aria-label="Guide draft"]').disabled).toBe(true);
  expect(button('Save assessment').disabled).toBe(true);expect(callbacks.saveGuidedAssessment).not.toHaveBeenCalled();
});

test.each([['iso-27001','4.1'],['soc-2','CC1.1']])('%s read-only native guidance remains available without write controls',async(framework,id)=>{
  await render(<Native record={recordFor(framework,id)} writable={false}/>);
  await act(async()=>{const summary=document.querySelector('.assessment-summary');summary.open=true;summary.dispatchEvent(new Event('toggle'));});
  expect(button('Save assessment')).toBeUndefined();expect([...document.querySelectorAll('.assessment-check input')].every(el=>el.matches(':disabled'))).toBe(true);
  expect(document.querySelector('[aria-label="Current implementation"]').matches(':disabled')).toBe(true);expect(callbacks.put).not.toHaveBeenCalled();
});

const rows=Object.entries({addressed:27,in_progress:7,needs_attention:2,not_assessed:2}).flatMap(([status,count])=>Array.from({length:count},()=>({status})));
test.each([true,false])('explicit SOC overview labels retain 27/7/2/2 counts, tooltip/aria labels and raw filter values (pilot=%s)',async workspacePilot=>{
  const onFilter=jest.fn(),summary=cisSummary(rows);
  await render(<AssessmentOverview workspacePilot={workspacePilot} programName="SOC 2" summary={summary} itemNoun="criteria" filter="all" onFilter={onFilter} testIdPrefix="psoc" implementedLabel={SOC_LABELS.addressed} segmentLabels={SOC_SEGMENTS}/>);
  expect([...document.querySelectorAll('.bcis-legend button')].map(el=>el.textContent)).toEqual(['Addressed (Readiness)27','Partially Addressed7','Needs Remediation / Validation2','Not Assessed2']);
  for(const [key,label] of Object.entries(SOC_SEGMENTS).filter(([key])=>key!=='notApplicable')){
    const segment=document.querySelector(`[data-testid="psoc-seg-${key}"]`);expect(segment.getAttribute('aria-label')).toContain(label+':');expect(segment.querySelector('.bcis-tip strong').textContent).toBe(label);
  }
  expect(document.querySelector(workspacePilot?'.bwp-program-counts dt':'.assessment-metric dt').textContent).toBe('Addressed (Readiness)');
  await act(async()=>[...document.querySelectorAll('.bcis-legend button')].find(el=>el.textContent==='Partially Addressed7').click());expect(onFilter).toHaveBeenCalledWith('in_progress');
  expect(rows.filter(row=>row.status==='addressed')).toHaveLength(27);expect(summary.total).toBe(38);
});

test.each([true,false])('SOC dashboard card inherits canonical labels and unchanged counts/destinations (pilot=%s)',async workspacePilot=>{
  await render(<FrameworkProgramCard workspacePilot={workspacePilot} program={{key:'soc-2',label:'SOC 2'}} rows={rows}/>);
  expect([...document.querySelectorAll('.bd-legend li')].map(el=>el.textContent)).toEqual(['Addressed (Readiness)27','Partially Addressed7','Needs Remediation / Validation2','Not Assessed2']);
  expect(document.querySelector('.bd-donut').getAttribute('aria-label')).toContain('27 Addressed (Readiness)');
  expect(document.querySelector('.bd-legend a[href="/compliance/soc-2?view=in_progress"]').textContent).toBe('Partially Addressed7');
  expect(document.querySelector('.bd-program-note').textContent).toBe('Internal readiness, not an auditor opinion.');
});

test('CIS overview defaults retain approved wording while supplied N/A label stays presentation-only',async()=>{
  await render(<AssessmentOverview summary={cisSummary(rows)} filter="all" onFilter={()=>{}}/>);
  expect([...document.querySelectorAll('.bcis-legend button')].map(el=>el.textContent)).toEqual(['Implemented27','Partial7','Not implemented2','Not assessed2']);
  expect(document.querySelector('.assessment-metric dt').textContent).toBe('Implemented');
  const naRows=[{status:'not_applicable'}];await render(<AssessmentOverview programName="SOC 2" summary={cisSummary(naRows)} filter="all" onFilter={()=>{}} implementedLabel={SOC_LABELS.addressed} segmentLabels={SOC_SEGMENTS}/>);
  expect(document.querySelector('.bcis-legend-na').textContent).toBe('Not Applicable 1');expect(naRows[0].status).toBe('not_applicable');
});

test('native CIS/SOC overview never presents missing source records as zero posture',async()=>{
  const canonical={availability:'partial',denominator:0,implemented:0,assessed:0,total:56,missing_records:56,
    reason:'Native source records are missing.',included_counts:['addressed','in_progress','needs_attention','not_assessed'].map(key=>({key,count:0}))};
  await render(<AssessmentOverview workspacePilot summary={cisSummary([],new Date(),canonical)} filter="all" onFilter={()=>{}}/>);
  expect(document.querySelector('.bcis-summary').textContent).toContain('Native source records are missing.');
  expect(document.querySelector('.bwp-program-counts').textContent).toContain('Unavailable');
  expect(document.querySelector('.bcis-summary').textContent).not.toMatch(/0 of 0|0 safeguards|0 still to assess/);
  expect(document.querySelectorAll('.bcis-bar [role="img"]')).toHaveLength(0);
});
