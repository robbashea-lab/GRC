import React,{act,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AssessmentClientContextProvider,AssessmentClientContextSource,useAssessmentClientContext} from './AssessmentClientContext';
import AssessmentQuestionGuidance from './AssessmentQuestionGuidance';
import AssessmentToolField from './AssessmentToolField';
import AssessmentPolicyLinks from './AssessmentPolicyLinks';
import SocSequentialInterview from './SocSequentialInterview';
import IsoSequentialInterview from './IsoSequentialInterview';
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