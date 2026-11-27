import React,{act,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AssessmentClientContextProvider,AssessmentClientContextSource,useAssessmentClientContext} from './AssessmentClientContext';
import AssessmentQuestionGuidance from './AssessmentQuestionGuidance';
import AssessmentToolField from './AssessmentToolField';
import AssessmentPolicyLinks from './AssessmentPolicyLinks';
import SocSequentialInterview from './SocSequentialInterview';
import IsoSequentialInterview from './IsoSequentialInterview';
import CisSequentialInterview from './CisSequentialInterview';
import {frameworkCatalog} from '@/lib/frameworks';
import {frameworkGuidanceReference} from '@/lib/frameworkGuidanceReference';
import {versionForSafeguard} from '@/lib/guidedAssessment';
import api from '@/lib/api';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),put:jest.fn()},formatError:error=>error.message}));
const record={client_id:'fresh-client',framework_assessment_id:'current-assessment',framework_key:'soc-2',definition_id:'CC6.1'};
const serviceData={client_id:record.client_id,catalog:[{tool_id:'native-tool',name:'Saved client platform',area_ids:['identity']}],
  services:{areas:{identity:{tool_ids:['native-tool']}}},candidates:[{activity_id:'current-native-activity',title:'Access Review',area_id:'identity',cadence:'quarterly',setup:{recurring_ticket_number:'CW-123'}}]};
function ServiceSource({data=serviceData,error}){
  const {publishServices}=useAssessmentClientContext();
  useEffect(()=>{publishServices({record,data:error?undefined:data,error});return()=>publishServices(null);},[data,error,publishServices]);return null;
}
let root,host;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
async function render(children){await act(async()=>root.render(children));}
function Context({children,data,error,related={policies:[{client_id:record.client_id,policy_id:'current-policy',title:'Current policy',version:'2',status:'draft'}]}}){
  return <AssessmentClientContextProvider record={record}><ServiceSource data={data} error={error}/><AssessmentClientContextSource record={record} related={related}/>{children}</AssessmentClientContextProvider>;
}
test('one accessible disclosure and interview tool choices project the same current client mapping without writes',async()=>{
  const onChange=jest.fn();await render(<Context><AssessmentQuestionGuidance guidance={{requirement:'Native criterion',context:'Native qualification'}}/><AssessmentToolField options={[{id:'original',label:'Existing option'}]} value="" onChange={onChange}/></Context>);
  const disclosure=host.querySelector('details.gn-control-guidance'),summary=disclosure.querySelector('summary');
  expect(summary.textContent).toBe('Control guidance & client context');
  expect(document.getElementById(summary.getAttribute('aria-controls'))).toBeTruthy();
  expect(disclosure.textContent).toContain('Relevant client records');expect(disclosure.textContent).toContain('Saved client platform');
  expect(disclosure.textContent).toContain('CW-123');expect(disclosure.textContent).toContain('Current policy');
  expect(disclosure.textContent).toContain('Version 2');expect(disclosure.textContent).toContain('Draft');
  expect([...host.querySelectorAll('select option')].map(option=>option.value)).toContain('Saved client platform');
  expect(host.querySelector('select').value).toBe('');expect(onChange).not.toHaveBeenCalled();
  for(const method of ['get','post','patch','put'])expect(api[method]).not.toHaveBeenCalled();
});
test('a failed verified read remains unavailable, never an empty or completed client state',async()=>{
  await render(<Context error="Current context denied"><AssessmentQuestionGuidance/></Context>);
  expect(host.textContent).toContain('Current context denied');expect(host.textContent).not.toContain('No matching client records');
});
test('policy changes stage an intentional empty list or replacement with no API mutation',async()=>{
  const onChange=jest.fn(),related=[{client_id:record.client_id,policy_id:'old',title:'Existing policy',status:'approved'}];
  function Form(){const [value,setValue]=useState(undefined);return <AssessmentPolicyLinks {...{record,related,value}} onChange={ids=>{setValue(ids);onChange(ids);}}/>;}
  await render(<Form/>);
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Clear policy relationships').click());
  expect(onChange).toHaveBeenLastCalledWith([]);expect(host.querySelector('input[type="checkbox"]').checked).toBe(false);
  await act(async()=>host.querySelector('input[type="checkbox"]').click());
  expect(onChange).toHaveBeenLastCalledWith(['old']);
  for(const method of ['post','patch','put'])expect(api[method]).not.toHaveBeenCalled();
});
test.each([['SOC',SocSequentialInterview],['ISO',IsoSequentialInterview]])('%s retained question versions retain combined context without rollout eligibility',async(_name,Interview)=>{
  const groups=[{id:'group',title:'Retained native group',questions:[{id:'native-question',prompt:'Retained native question',type:'text'}]}];
  await render(<Context><Interview id="legacy-item" version="retained-supported-version" assessmentRollout={false}
    groups={groups} extras={[]} answers={{}} step={0} setStep={jest.fn()} put={jest.fn()}/></Context>);
  expect(host.querySelector('summary').textContent).toBe('Control guidance & client context');
  expect(host.textContent).toContain('Saved client platform');
});

function NativeGuidance({frameworkKey,id,definition=frameworkCatalog(frameworkKey)?.requirements.find(item=>item.id===id),configuration,reference,frameworkVersion,children}) {
  const current={...record,framework_key:frameworkKey,definition_id:id,framework_version:frameworkVersion};
  return <AssessmentClientContextProvider record={current}>
    <AssessmentClientContextSource record={current} definition={definition} configuration={configuration}/>
    {children||<AssessmentQuestionGuidance reference={reference}/>}
  </AssessmentClientContextProvider>;
}

test.each([
  ['cis-ig1','1.1',{},'CIS Controls v8.1 · Safeguard 1.1'],
  ['hipaa','164.302',{},'HIPAA 45 CFR 164 · 2026-09-18 · 164.302'],
  ['iso-27001','4.1',{},'ISO/IEC 27001:2022 + Amd 1:2024 · 4.1'],
  ['nist-csf-2','GV.OC-01',{},'NIST CSF 2.0 · GV.OC-01'],
  ['soc-2','CC1.1',{},'SOC 2 2017 TSC · revised points of focus 2022 · CC1.1'],
  ['cmmc','3.1.1',{level:1},'CMMC Level 1 · FAR (i) · AC.L1-b.1.i'],
  ['cmmc','3.1.1',{level:2},'CMMC Level 2 · NIST SP 800-171 Rev 2 · 3.1.1 · AC.L2-3.1.1'],
  ['cmmc','3.1.3',{level:1},'CMMC Level 2 · NIST SP 800-171 Rev 2 · 3.1.3 · AC.L2-3.1.3'],
])('%s %s identifies the actual native source for missing and bare references',async(frameworkKey,id,configuration,expected)=>{
  for(const reference of [undefined,id]){
    await render(<NativeGuidance {...{frameworkKey,id,configuration,reference}}/>);
    expect(host.querySelector('.gn-rule-reference').textContent).toBe(expected);
  }
});

test.each(['CIS v8.1 · 1.1','Custom published source 2024 · retained item'])('an explicit qualified reference stays unchanged with or without source context: %s',async reference=>{
  await render(<AssessmentQuestionGuidance reference={reference} guidance={{requirement:'Retained native guidance'}}/>);
  expect(host.querySelector('.gn-rule-reference').textContent).toBe(reference);
  await render(<NativeGuidance frameworkKey="cis-ig1" id="1.1" reference={reference}/>);
  expect(host.querySelector('.gn-rule-reference').textContent).toBe(reference);
});

test('the displayed source edition takes precedence over the saved assessment version',async()=>{
  const definition=frameworkCatalog('hipaa').requirements[0];
  await render(<NativeGuidance frameworkKey="hipaa" id={definition.id} definition={definition} frameworkVersion="45 CFR 164 · 2025-01-01"/>);
  expect(host.querySelector('.gn-rule-reference').textContent).toBe('HIPAA 45 CFR 164 · 2026-09-18 · 164.302');
});

test.each([undefined,'8.0'])('the retained CIS short citation outranks the bare rollout reference and interview version (source %s)',async sourceVersion=>{
  const definition={...frameworkCatalog('cis-ig1').requirements[0],...(sourceVersion?{version:sourceVersion}:{}),source_citation:undefined};
  const interview=<CisSequentialInterview id="1.1" answers={{}} version={versionForSafeguard('1.1',true)}
    step="inventory" setStep={jest.fn()} put={jest.fn()} detail={jest.fn()} assessmentConcept assessmentRollout/>;
  if(sourceVersion)await render(<NativeGuidance frameworkKey="cis-ig1" id="1.1" definition={definition} frameworkVersion="misleading-record-version">{interview}</NativeGuidance>);
  else await render(interview);
  expect(host.querySelector('.gn-rule-reference').textContent).toBe(`CIS v${sourceVersion||'8.1'} · 1.1`);
});

test('only a qualified native citation supersedes a source edition, and unknown metadata cannot invent one',()=>{
  const definition={...frameworkCatalog('cis-ig1').requirements[0],version:'8.0'};
  expect(frameworkGuidanceReference('1.1',{frameworkKey:'cis-ig1',definition})).toBe('CIS Controls v8.1 · Safeguard 1.1');
  expect(frameworkGuidanceReference('1.1',{frameworkKey:'cis-ig1',definition:{...definition,source_citation:'1.1'}})).toBe('CIS v8.0 · 1.1');
  expect(frameworkGuidanceReference(undefined,{frameworkKey:'nist-csf-2',definition:{...frameworkCatalog('nist-csf-2').requirements[0],source_citation:'NIST CSF 2.0 · Subcategory GV.OC-01'}})).toBe('NIST CSF 2.0 · Subcategory GV.OC-01');
  expect(frameworkGuidanceReference('1.1')).toBe('1.1');
  expect(frameworkGuidanceReference(undefined,{frameworkKey:'custom',definition:{id:'X.1',version:'2025'}})).toBe('X.1');
  expect(frameworkGuidanceReference(undefined,{frameworkKey:'cis-ig1',definition:{id:'unknown-native-item'}})).toBe('unknown-native-item');
  expect(frameworkGuidanceReference(undefined,{frameworkKey:'custom'})).toBeNull();
});

test('a CIS rollout without client source context still qualifies its known bare catalog reference',async()=>{
  await render(<CisSequentialInterview id="1.1" answers={{}} version={versionForSafeguard('1.1',true)}
    step="inventory" setStep={jest.fn()} put={jest.fn()} detail={jest.fn()} assessmentRollout/>);
  expect(host.querySelector('.gn-rule-reference').textContent).toBe('CIS Controls v8.1 · Safeguard 1.1');
});
