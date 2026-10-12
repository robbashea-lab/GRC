import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';

let mockProps,mockRefresh,mockWorkspace,mockFail;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'fixture-actor',role:'super_admin',workspace_mode:'demo'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({clients:[]})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./BrawndoCisFindings',()=>({run})=>{mockRefresh=()=>run(async()=>{});return null;});
jest.mock('./IsoGuidedAssessor',()=>function Guide(props){
  mockProps=props;const [answer,setAnswer]=require('react').useState('');
  return <textarea data-testid="retained-guide-answer" value={answer} onChange={e=>setAnswer(e.target.value)}/>;
});
jest.mock('./SocGuidedAssessor',()=>function Guide(props){
  mockProps=props;const [answer,setAnswer]=require('react').useState('');
  return <textarea data-testid="retained-guide-answer" value={answer} onChange={e=>setAnswer(e.target.value)}/>;
});
jest.mock('./ui/dialog',()=>{
  const R=require('react');return {Dialog:({children})=><div>{children}</div>,DialogContent:R.forwardRef(({children},ref)=><div ref={ref}>{children}</div>),DialogTitle:R.forwardRef(({children},ref)=><h2 ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
});

let host,root,record;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockFail=false;mockProps=null;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  api.get.mockImplementation(async path=>{
    if(mockFail&&path.endsWith('/activity'))throw Error('Synthetic unavailable context');
    return {data:path.endsWith('/related')?{reviews:[],evidence:[],findings:[],tasks:[]}:path.startsWith('/frameworks/')?mockWorkspace:[]};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
async function render(){await act(async()=>root.render(<FrameworkDrawer open clientId={record.client_id} record={record} onOpenChange={()=>{}}/>));}
function configure(framework,id){
  record={framework_assessment_id:'fixture-assessment',client_id:'disposable-local',framework_key:framework,definition_id:id,title:id,status:'not_assessed',implementation:'Existing native text',soa_applicability:'included',soa_justification:'Fixture scope'};
  mockWorkspace={selected:true,configuration:{categories:['security']},assessments:[record],work:{},organizational_controls:[]};
}

test.each([['iso-27001','A.8.11'],['iso-27001','6.2'],['soc-2','CC1.1']])('%s %s retains same-identity guide work but rejects native writing when context refresh fails',async(framework,id)=>{
  configure(framework,id);await render();
  const answer=document.querySelector('[data-testid="retained-guide-answer"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(answer,'Retain exact unsaved answer');answer.dispatchEvent(new Event('input',{bubbles:true}));});
  mockFail=true;await act(async()=>mockRefresh());
  expect(document.querySelector('[data-testid="retained-guide-answer"]')).toBe(answer);
  expect(answer.value).toBe('Retain exact unsaved answer');expect(mockProps.disabled).toBe(true);
  let saved;await act(async()=>{saved=await mockProps.onSaveAssessment({implementation:'Must not write',status:'addressed'},JSON.stringify(record));});
  expect(saved).toBe(false);expect(api.patch).not.toHaveBeenCalled();
  mockFail=false;await act(async()=>mockRefresh());
  expect(document.querySelector('[data-testid="retained-guide-answer"]')).toBe(answer);expect(mockProps.disabled).toBe(false);
});

test('retained configuration never crosses client or assessment identity after a failed read',async()=>{
  configure('soc-2','CC1.1');await render();expect(mockProps.clientId).toBe('disposable-local');
  mockFail=true;record={...record,client_id:'different-local',framework_assessment_id:'different-assessment'};await render();
  expect(document.querySelector('[data-testid="retained-guide-answer"]')).toBeNull();expect(api.patch).not.toHaveBeenCalled();
});
