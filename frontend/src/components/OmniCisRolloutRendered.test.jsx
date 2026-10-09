import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import cis from '@catalogs/cisIG1.json';
import GuidedAssessor from './GuidedAssessor';
import {guidedCatalog,versionForSafeguard,visibleQuestions} from '@/lib/guidedAssessment';
import {omniCisSummary} from '@/lib/omniCisSummary';
import api from '@/lib/api';

let mockClient,mockName;
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'render-operator',role:'client_grc_manager'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClient:{client_id:mockClient,name:mockName},clients:[{client_id:mockClient,name:mockName}]})}));
let root,container,stored,props;
const copy=value=>JSON.parse(JSON.stringify(value)),fingerprint='d'.repeat(64);
const button=name=>[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===name);
const complete=id=>Object.fromEntries(guidedCatalog.safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'':q.type==='date'?new Date().toISOString().slice(0,10):q.type==='multi'?['Quarantine or isolate']:q.id==='frequency'?(id==='1.1'?'Every six months':id==='1.3'?'Daily':'Weekly'):q.id==='sources'?'One source':q.id==='unresolved'?'No':q.choices.includes('Yes')?'Yes':q.choices[0]]));
async function render(){await act(async()=>root.render(<GuidedAssessor {...props}/>));}
async function click(name){const element=button(name);expect(element).toBeTruthy();expect(element.disabled).toBe(false);await act(async()=>element.click());}
async function open(){await act(async()=>document.querySelector('[aria-label="Open Omnibot guide"]').click());}
async function edit(text){const element=document.querySelector('[aria-label="Omnibot implementation summary"]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(element,text);element.dispatchEvent(new Event('input',{bubbles:true}));});}
function setup(group,id,name='Synthetic client'){
  mockClient='configured-client-'+group;mockName=name;
  const record={client_id:mockClient,framework_key:'cis-ig1',framework_assessment_id:mockClient+'-'+id,definition_id:id,title:cis.requirements.find(row=>row.id===id).title,status:'not_assessed',implementation:'',verification:'not_verified',last_saved:null,assessment_history:[],work:{context_complete:true,open_findings:0,open_actions:0,overdue_reviews:0,priority_records:[]}};
  const version=versionForSafeguard(id),answers=complete(id),result=omniCisSummary(id,answers,version,name).result;
  stored={client_id:mockClient,assessment_id:record.framework_assessment_id,user_id:'render-operator',version,answers,result,narrative:result.narrative,completed:true,step:0,revision:1,base_assessment_token:null,current_assessment_token:null,base_scope_fingerprint:fingerprint,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:false};
  props={clientId:mockClient,framework:'cis-ig1',configuration:{implementation_group:group},record,current:record,form:copy(record),contextComplete:true,onDraftChange:jest.fn(),onSaveAssessment:jest.fn(async()=>true)};
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();window.history.replaceState({},'', '/');
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async()=>({data:copy(stored)}));
  api.put.mockImplementation(async(_path,body)=>({data:stored={...stored,...copy(body),revision:stored.revision+1,generated_at:'2026-10-09T12:00:00Z'}}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

const placements=[1,2,3].flatMap(group=>cis.requirements.filter(row=>row.implementation_group<=group).map(row=>[group,row.id]));
test.each(placements)('configured IG%s safeguard %s renders the approved window, actual header and one complete field',async(group,id)=>{
  setup(group,id,'Showcase IG'+group);await render();await open();
  expect(document.querySelectorAll('.omni-workspace-window')).toHaveLength(1);expect(document.querySelectorAll('.omni-approved')).toHaveLength(2);
  expect(document.body.textContent).toContain('Safeguard '+id+' — '+props.record.title);
  expect(document.querySelectorAll('[aria-label="Omnibot implementation summary"]')).toHaveLength(1);
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toContain('Showcase IG'+group);
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toContain('\n\nITEMS TO ADDRESS\n\n');
  expect(button('Apply to Assessment')).toBeUndefined();expect(button('Use this summary')).toBeUndefined();
  await click('Back to questions');expect(document.querySelector('.omni-question-group')).toBeTruthy();
  const visible=visibleQuestions(id,stored.answers,stored.version);expect(visible.length).toBeGreaterThan(0);expect(document.querySelector('.omni-group-progress')).toBeTruthy();
  expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test.each([[1,'2.1'],[2,'12.2'],[3,'16.13']])('IG%s %s summary Save & close confirms replacement, preserves cancel and exact edits, retries failure before closing',async(group,id)=>{
  setup(group,id);const current={...props.current,implementation:'Existing operator narrative'};props={...props,current,record:current,form:copy(current)};
  await render();await open();const reviewed=stored.narrative+'\n\nOperator notes\n- Keep this exact line\n';await edit(reviewed);
  await click('Save & close');await click('Cancel');expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(reviewed);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  props.onSaveAssessment.mockResolvedValueOnce(false);await click('Save & close');await click('Yes, update assessment');expect(document.querySelector('.omni-workspace-window')).toBeTruthy();expect(document.body.textContent).toContain('The assessment was not saved');
  await click('Save & close');await click('Yes, update assessment');expect(document.querySelector('.omni-workspace-window')).toBeNull();
  expect(props.onSaveAssessment).toHaveBeenLastCalledWith(expect.objectContaining({implementation:reviewed,status:'addressed'}),JSON.stringify(current));expect(stored.narrative).toBe(reviewed);
});

test('read-only CIS guides preserve answers and block native writes',async()=>{
  setup(3,'16.13');props.disabled=true;await render();await open();expect(button('Save assessment').disabled).toBe(true);expect(button('Save & close').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});
