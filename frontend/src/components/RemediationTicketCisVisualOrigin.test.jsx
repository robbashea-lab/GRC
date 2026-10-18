import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {visibleQuestions} from '@/lib/guidedAssessment';
import {omniCisSummary} from '@/lib/omniCisSummary';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,API:'/api',
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));

const clientId='demo_brawndo';
let root,host,record,task,finding,base,putSpy,patchSpy,postSpy;
const assessments=()=>[...document.querySelectorAll('[data-testid="brawndo-cis-assessment"]')];
const ticket=()=>document.querySelector('[data-testid="remediation-ticket-drawer"]');
const button=(scope,label)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
async function click(scope,label){const target=button(scope,label);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function edit(node,value){
  expect(node).toBeTruthy();expect(node.disabled).toBe(false);
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
}
async function render(visualReference=true){await act(async()=>root.render(<FrameworkDrawer open visualReference={visualReference} record={record} clientId={clientId} onOpenChange={()=>{}}/>));}
async function openTicket(outer){
  const tab=[...outer.querySelectorAll('[role="tab"]')].find(node=>node.textContent.startsWith('Findings'));
  expect(tab).toBeTruthy();await act(async()=>tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
  const opener=outer.querySelector('[data-ticket-id="finding:'+finding.finding_id+'"] button');
  expect(opener).toBeTruthy();await act(async()=>opener.click());expect(ticket()).toBeTruthy();
}
async function openSource(){
  const prior=assessments();await click(ticket(),'CIS Controls v8.1 Assessment → Safeguard 1.1');
  const added=assessments().filter(node=>!prior.includes(node));expect(added).toHaveLength(1);return added[0];
}
async function revealInterview(surface){
  const disclosure=surface.querySelector('.assessment-summary');expect(disclosure.open).toBe(false);
  await act(async()=>{disclosure.open=true;disclosure.dispatchEvent(new Event('toggle'));});
  const guide=surface.querySelector('[aria-label="CIS assessment interview"]');expect(guide.hidden).toBe(false);return guide;
}
async function snapshot(){
  const paths=[base,base+'/guided-assessment',base+'/guided-assessment/history','/tasks/'+task.task_id,'/findings/'+finding.finding_id];
  const reads=await Promise.all(paths.map(path=>api.get(path)));
  return {records:reads.map(response=>response.data),evidence:(await api.get('/evidence',{params:{client_id:clientId}})).data};
}
function observeWrites(){putSpy=jest.spyOn(api,'put');patchSpy=jest.spyOn(api,'patch');postSpy=jest.spyOn(api,'post');}
function expectNoWrites(){expect(putSpy).not.toHaveBeenCalled();expect(patchSpy).not.toHaveBeenCalled();expect(postSpy).not.toHaveBeenCalled();}
async function savePersonalProgress(completed=false){
  const initial=(await api.get(base+'/guided-assessment')).data,version=initial.version;
  const today=new Date(),date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  const answers=completed?Object.fromEntries(visibleQuestions('1.1',{inventory:'Yes',additional_gap:'No',additional_confirmation:'No'},version).map(question=>[
    question.id,question.optional?'No':question.type==='matrix'?Object.fromEntries(question.rows.map(row=>[row,'Yes'])):question.type==='date'?date:question.type==='text'?'':question.id==='frequency'?'Every six months':question.id==='sources'?'One source':'Yes',
  ])):{inventory:'Not sure',inventory_detail:'Retained exact personal checkpoint.'};
  const result=completed?omniCisSummary('1.1',answers,version,'Brawndo',today).result:null;
  await api.put(base+'/guided-assessment',{version,answers,step:0,completed,result,narrative:completed?'Retained exact reviewed completion.':'',expected_revision:initial.revision,
    base_assessment_token:initial.current_assessment_token,base_scope_fingerprint:initial.current_scope_fingerprint});
}

beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  const user=(await api.post('/demo/enter')).data.user;mockAuth={user,workspaceMode:'demo',loading:false,error:null};
  const clients=(await api.get('/clients')).data;mockOrg={currentClientId:clientId,currentClient:clients.find(row=>row.client_id===clientId),clients,loading:false,error:null};
  sessionStorage.setItem('grc_client_id',clientId);window.history.replaceState({},'','/compliance/cis-ig1?client_id='+clientId);
  task=(await api.get('/tasks',{params:{client_id:clientId}})).data.find(row=>row.task_id==='demo_brawndo_cis_action_1.1');expect(task).toBeTruthy();
  finding=(await api.get('/findings/'+task.finding_id)).data;
  base='/framework_assessments/'+finding.framework_assessment_id;record=(await api.get(base)).data;
  expect(record).toMatchObject({client_id:clientId,framework_key:'cis-ig1',definition_id:'1.1'});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test('the completed ticket opens its exact native CIS source with verified appearance and preserves completed personal progress',async()=>{
  await savePersonalProgress(true);await render();const outer=assessments()[0];await openTicket(outer);
  const work=ticket().querySelector('[data-ticket-task="'+task.task_id+'"]');
  await edit(work.querySelector('[aria-label="Actual resolution"]'),'Synthetic completed work retained through source browsing.');
  await click(work,'Complete work');expect(ticket().textContent).toContain('Pending validation');
  await edit(ticket().querySelector('[aria-label="Validation rationale"]'),'Synthetic validation retained through source browsing.');
  await click(ticket(),'Validate and complete');expect(ticket().textContent).toContain('Completed');
  const before=await snapshot();expect(before.records[3]).toMatchObject({status:'done',resolution:'Synthetic completed work retained through source browsing.'});
  expect(before.records[4].status).toBe('closed');observeWrites();
  const nested=await openSource();expect(nested.classList.contains('brawndo-cis-visual-safeguard')).toBe(true);
  expect(nested.querySelector('[aria-label="Current implementation"]').value).toBe(record.implementation);
  expect(nested.querySelector('[aria-label="Saved implementation status"]').textContent).toBe(outer.querySelector('[aria-label="Saved implementation status"]').textContent);
  expect(nested.querySelector('[aria-label="Saved verification"]').textContent).toBe(outer.querySelector('[aria-label="Saved verification"]').textContent);
  expect(button(nested,'Previous').disabled).toBe(true);expect(button(nested,'Next').disabled).toBe(true);
  expect(nested.querySelector('[aria-label$="location"]')).toBeNull();
  const guide=await revealInterview(nested);
  expect(guide.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe('Retained exact reviewed completion.');
  await click(nested,'Close');expect(nested.isConnected).toBe(false);expect(ticket().textContent).toContain('Completed');
  await click(ticket(),'Close');expect(ticket()).toBeNull();expect(outer.isConnected).toBe(true);
  expect(outer.classList.contains('brawndo-cis-visual-safeguard')).toBe(true);expect(await snapshot()).toEqual(before);expectNoWrites();
});

test('nested assessment and ticket drafts retain their independent close guards and saved personal checkpoint',async()=>{
  await savePersonalProgress();const before=await snapshot();observeWrites();await render();const outer=assessments()[0];await openTicket(outer);
  await edit(ticket().querySelector('[aria-label="Planned action"]'),'Retained unsaved ticket plan.');
  const nested=await openSource();expect(nested.classList.contains('brawndo-cis-visual-safeguard')).toBe(true);
  const guide=await revealInterview(nested);expect(button(guide,'Not sure').getAttribute('aria-pressed')).toBe('true');
  await edit(nested.querySelector('[aria-label="Current implementation"]'),'Retained unsaved source wording.');
  await click(nested,'Close');await click(document.body,'Keep editing');expect(nested.isConnected).toBe(true);
  expect(nested.querySelector('[aria-label="Current implementation"]').value).toBe('Retained unsaved source wording.');
  await click(nested,'Close');await click(document.body,'Discard changes');expect(nested.isConnected).toBe(false);
  expect(ticket().querySelector('[aria-label="Planned action"]').value).toBe('Retained unsaved ticket plan.');
  await click(ticket(),'Close');await click(document.body,'Keep editing');expect(ticket()).toBeTruthy();
  expect(ticket().querySelector('[aria-label="Planned action"]').value).toBe('Retained unsaved ticket plan.');
  await click(ticket(),'Close');await click(document.body,'Discard changes');expect(ticket()).toBeNull();expect(outer.isConnected).toBe(true);
  expect(await snapshot()).toEqual(before);expectNoWrites();
});

test('a default parent keeps the same source native without creating a presentation receipt',async()=>{
  await savePersonalProgress();const before=await snapshot();observeWrites();await render(false);const outer=assessments()[0];await openTicket(outer);
  const nested=await openSource();expect(nested.classList.contains('brawndo-cis-visual-safeguard')).toBe(false);
  expect(nested.querySelector('.assessment-summary summary').textContent).toBe('Requirement summary');
  await click(nested,'Close');expect(ticket()).toBeTruthy();expect(outer.isConnected).toBe(true);
  expect(await snapshot()).toEqual(before);expectNoWrites();
});

test('revoking the live parent origin removes nested appearance without losing its unsaved native draft',async()=>{
  await savePersonalProgress();const before=await snapshot();observeWrites();await render();const outer=assessments()[0];await openTicket(outer);
  const nested=await openSource();expect(nested.classList.contains('brawndo-cis-visual-safeguard')).toBe(true);
  await edit(nested.querySelector('[aria-label="Current implementation"]'),'Retained draft after origin withdrawal.');
  await render(false);expect(nested.isConnected).toBe(true);expect(outer.isConnected).toBe(true);
  expect(nested.classList.contains('brawndo-cis-visual-safeguard')).toBe(false);
  expect(nested.querySelector('[aria-label="Current implementation"]').value).toBe('Retained draft after origin withdrawal.');
  expect(ticket()).toBeTruthy();expect(await snapshot()).toEqual(before);expectNoWrites();
});

test('losing the current resolved ticket source withdraws appearance and preserves a newer unsaved source draft',async()=>{
  await savePersonalProgress();const before=await snapshot();observeWrites();await render();await openTicket(assessments()[0]);
  const nested=await openSource();expect(nested.classList.contains('brawndo-cis-visual-safeguard')).toBe(true);
  const read=api.get.bind(api);let rejectSource;
  const unavailable=new Promise((_resolve,reject)=>{rejectSource=reject;});
  const reads=jest.spyOn(api,'get').mockImplementation((path,...args)=>path===base?unavailable:read(path,...args));
  await edit(nested.querySelector('[aria-label="Current implementation"]'),'One explicitly saved native source update.');
  await click(nested,'Save assessment');expect(patchSpy).toHaveBeenCalledTimes(1);
  expect(reads.mock.calls.some(([path])=>path===base)).toBe(true);
  await edit(nested.querySelector('[aria-label="Current implementation"]'),'A newer unsaved draft during source refresh.');
  await act(async()=>rejectSource({response:{status:404},message:'Source unavailable for this ticket refresh'}));
  expect(nested.isConnected).toBe(true);expect(nested.classList.contains('brawndo-cis-visual-safeguard')).toBe(false);
  expect(nested.querySelector('[aria-label="Current implementation"]').value).toBe('A newer unsaved draft during source refresh.');
  expect(ticket().textContent).toContain('Assessment unavailable');reads.mockRestore();
  const after=await snapshot();expect(after.records[0].implementation).toBe('One explicitly saved native source update.');
  for(const field of ['status','verification','owner_id','process_owner_id','items_to_address','items_revision'])expect(after.records[0][field]).toEqual(before.records[0][field]);
  for(const field of ['version','answers','step','completed','narrative','result','revision','base_assessment_token','base_scope_fingerprint'])expect(after.records[1][field]).toEqual(before.records[1][field]);
  expect(after.records.slice(2)).toEqual(before.records.slice(2));expect(after.evidence).toEqual(before.evidence);
  expect(patchSpy).toHaveBeenCalledTimes(1);expect(putSpy).not.toHaveBeenCalled();expect(postSpy).not.toHaveBeenCalled();
});

test('source refresh loss preserves an unsaved supported interview answer and note through presentation withdrawal',async()=>{
  await savePersonalProgress();const before=await snapshot(),write=api.patch.bind(api);observeWrites();await render();await openTicket(assessments()[0]);
  let completeAction;
  patchSpy.mockImplementationOnce((...args)=>new Promise((resolve,reject)=>{completeAction=()=>write(...args).then(resolve,reject);}));
  await click(ticket().querySelector('[data-ticket-task="'+task.task_id+'"]'),'Complete work');
  const nested=await openSource(),pilot=nested.querySelector('[data-testid="guided-pilot"]'),guide=await revealInterview(nested);
  const question=()=>guide.querySelector('[role="group"][aria-label="Does an enterprise asset inventory exist?"]');
  await click(question(),'Yes');await edit(guide.querySelector('[aria-label="Known gaps or uncertainties"]'),'Retain this exact unsaved interview note.');
  const read=api.get.bind(api),reads=jest.spyOn(api,'get').mockImplementation((path,...args)=>path===base?Promise.reject({response:{status:404},message:'Source unavailable for this ticket refresh'}):read(path,...args));
  await act(async()=>completeAction());
  expect(nested.isConnected).toBe(true);expect(nested.classList.contains('brawndo-cis-visual-safeguard')).toBe(false);
  expect(nested.querySelector('[data-testid="guided-pilot"]')).toBe(pilot);
  expect(button(question(),'Yes').getAttribute('aria-pressed')).toBe('true');
  expect(guide.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe('Retain this exact unsaved interview note.');
  await click(nested,'Close');await click(document.body,'Keep editing');
  expect(nested.isConnected).toBe(true);expect(button(question(),'Yes').getAttribute('aria-pressed')).toBe('true');
  expect(guide.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe('Retain this exact unsaved interview note.');
  reads.mockRestore();const after=await snapshot();expect(after.records[0]).toEqual(before.records[0]);
  for(const field of ['version','answers','step','completed','narrative','result','revision','base_assessment_token','base_scope_fingerprint'])expect(after.records[1][field]).toEqual(before.records[1][field]);
  expect(after.records[2]).toEqual(before.records[2]);expect(after.evidence).toEqual(before.evidence);
  expect(after.records[3].status).toBe('done');expect(after.records[4].status).toBe('remediated');
  expect(patchSpy).toHaveBeenCalledTimes(1);expect(patchSpy.mock.calls[0][0]).toBe('/tasks/'+task.task_id);
  expect(putSpy).not.toHaveBeenCalled();expect(postSpy).not.toHaveBeenCalled();
});
