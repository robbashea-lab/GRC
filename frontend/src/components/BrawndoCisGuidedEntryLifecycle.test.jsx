import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {catalogForVersion,versionForSafeguard,visibleQuestions} from '@/lib/guidedAssessment';
import {omniCisSummary} from '@/lib/omniCisSummary';

let mockAuth,mockOrg;
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,API:'/api',
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));

const clientId='demo_brawndo';
const copy=value=>JSON.parse(JSON.stringify(value));
const today=()=>{const date=new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');};
let root,host,record,baseline,relatedBefore,base,version,putSpy,patchSpy,postSpy;
// The real native shell renders in a Radix portal, outside React's mount container.
const surface=()=>document.querySelector('[data-testid="brawndo-cis-assessment"]');
const guide=()=>surface().querySelector('[aria-label="CIS assessment interview"]');
const disclosure=()=>surface().querySelector('.assessment-summary');
const button=(scope,name)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
async function click(scope,name){const target=button(scope,name);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function edit(node,value){
  expect(node).toBeTruthy();
  const prototype=node.tagName==='SELECT'?HTMLSelectElement.prototype:node.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});
}
async function render(visualReference=true){await act(async()=>root.render(<FrameworkDrawer open visualReference={visualReference} record={record} clientId={clientId} onOpenChange={()=>{}}/>));}
async function remount(){await act(async()=>root.unmount());root=createRoot(host);record=(await api.get(base)).data;await render();}
async function openSavedInterview(){await act(async()=>{disclosure().open=true;disclosure().dispatchEvent(new Event('toggle'));});expect(guide().hidden).toBe(false);}
const groupNumber=()=>guide().querySelector('.omni-group-progress').getAttribute('aria-label');
const nativeWrites=()=>patchSpy.mock.calls.filter(([url])=>url===base);
async function choose(id,value){
  const question=catalogForVersion(version).safeguards[record.definition_id].find(item=>item.id===id);
  const title=record.definition_id==='1.1'?({inventory:'Does an enterprise asset inventory exist?',maintenance:'Is the inventory updated when assets change?'}[id]||question.prompt):question.prompt;
  const choices=[...guide().querySelectorAll('[role="group"]')].find(node=>node.getAttribute('aria-label')===title);
  expect(choices).toBeTruthy();await click(choices,value);
}
async function fillGroup(){
  for(const choices of guide().querySelectorAll('.omni-answer-choices')){
    const title=choices.getAttribute('aria-label');
    const optional=catalogForVersion(version).safeguards[record.definition_id].some(question=>question.optional&&question.prompt===title);
    await click(choices,optional?'No':'Yes');
  }
  for(const select of guide().querySelectorAll('select')){
    const options=[...select.options].map(option=>option.value);
    await edit(select,select.id==='omni-answer-frequency'?'Every six months':options.includes('One source')?'One source':options.includes('Yes')?'Yes':options.find(Boolean));
  }
  for(const date of guide().querySelectorAll('input[type="date"]'))await edit(date,today());
}
async function assertNativeUnchanged(){
  expect((await api.get(base)).data).toEqual(baseline);
  expect((await api.get(base+'/related')).data.findings).toEqual(relatedBefore.findings);
  expect(nativeWrites()).toHaveLength(0);
}
async function selectTab(name){const tab=[...surface().querySelectorAll('[role="tab"]')].find(node=>node.textContent.startsWith(name));expect(tab).toBeTruthy();await act(async()=>tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));}
async function loadSafeguard(id){
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:clientId}})).data;
  record=workspace.assessments.find(row=>row.definition_id===id);expect(record).toBeTruthy();
  base='/framework_assessments/'+record.framework_assessment_id;
  baseline=copy((await api.get(base)).data);relatedBefore=copy((await api.get(base+'/related')).data);
  const initial=(await api.get(base+'/guided-assessment')).data;
  version=initial.version;expect(version).toBe(versionForSafeguard(id,true));expect(initial).toMatchObject({revision:0,answers:{},completed:false});
  putSpy=jest.spyOn(api,'put');patchSpy=jest.spyOn(api,'patch');postSpy=jest.spyOn(api,'post');
  return initial;
}
async function checkpoint(answers,{completed=false,narrative='',result=null}={}){
  const initial=(await api.get(base+'/guided-assessment')).data;
  return (await api.put(base+'/guided-assessment',{version,answers,step:0,completed,narrative,result,expected_revision:initial.revision,
    base_assessment_token:initial.current_assessment_token,base_scope_fingerprint:initial.current_scope_fingerprint})).data;
}
function completedAnswers(){
  const rootId=record.definition_id==='1.1'?'inventory':'practice';
  return Object.fromEntries(visibleQuestions(record.definition_id,{[rootId]:'Yes',additional_gap:'No',additional_confirmation:'No'},version).map(question=>[
    question.id,question.optional?'No':question.type==='matrix'?Object.fromEntries(question.rows.map(row=>[row,'Yes'])):question.type==='date'?today():question.type==='text'?'':question.id==='frequency'?'Every six months':question.id==='sources'?'One source':'Yes',
  ]));
}
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  const user=(await api.post('/demo/enter')).data.user;
  mockAuth={user,workspaceMode:'demo',loading:false,error:null};
  const clients=(await api.get('/clients')).data,currentClient=clients.find(client=>client.client_id===clientId);
  expect(currentClient.status).toBe('active');mockOrg={currentClientId:clientId,currentClient,clients,loading:false,error:null};
  sessionStorage.setItem('grc_client_id',clientId);window.history.replaceState({},'', '/compliance/cis-ig1?client_id='+clientId);
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test.each([
  ['1.1','needs_attention','gap_identified',5,'coverage','Servers'],
  ['2.1','addressed','verified',6,'requirements_0','publisher'],
])('fresh personal %s exposes real groups and carries a reviewed result through the native save and Items history',async(id,status,verification,total,matrixId,rowText)=>{
  await loadSafeguard(id);
  // Fresh personal progress coexists with the native seeded manual judgment and linked work.
  expect(baseline).toMatchObject({status,verification});expect(baseline.implementation.trim()).not.toBe('');
  if(id==='1.1')expect(relatedBefore.findings.length).toBeGreaterThan(0);
  await render();expect(disclosure().open).toBe(true);expect(guide().hidden).toBe(false);
  expect(groupNumber()).toBe('Question group 1 of '+total);expect(guide().querySelector('fieldset').disabled).toBe(false);
  expect(putSpy).not.toHaveBeenCalled();expect(patchSpy).not.toHaveBeenCalled();expect(postSpy).not.toHaveBeenCalled();
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(baseline.implementation);
  await assertNativeUnchanged();

  await fillGroup();await click(guide(),'Save & next');expect(groupNumber()).toBe('Question group 2 of '+total);
  await fillGroup();
  const affected=[...guide().querySelectorAll('select')].find(select=>select.getAttribute('aria-label').toLowerCase().includes(rowText.toLowerCase()));expect(affected).toBeTruthy();
  const affectedLabel=affected.getAttribute('aria-label');await edit(affected,id==='2.1'?'':'Not sure');
  await edit(guide().querySelector('[aria-label="Known gaps or uncertainties"]'),'Retain this local matrix context.');
  await click(guide(),'Save & close');expect(disclosure().open).toBe(false);
  const partial=(await api.get(base+'/guided-assessment')).data;
  expect(partial.completed).toBe(false);expect(partial.answers[matrixId+'_detail']).toBe('Retain this local matrix context.');
  if(id==='2.1')expect(partial.answers[matrixId]).not.toHaveProperty(affectedLabel);else expect(partial.answers[matrixId][affectedLabel]).toBe('Not sure');
  await assertNativeUnchanged();
  await remount();expect(disclosure().open).toBe(false);await openSavedInterview();
  expect(groupNumber()).toBe('Question group 2 of '+total);
  const resumed=[...guide().querySelectorAll('select')].find(select=>select.getAttribute('aria-label')===affectedLabel);
  expect(resumed.value).toBe(id==='2.1'?'':'Not sure');expect(guide().querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe('Retain this local matrix context.');
  await edit(resumed,'Not sure');await click(guide(),'Save & next');
  for(let number=3;number<total;number++){
    expect(groupNumber()).toBe('Question group '+number+' of '+total);await fillGroup();await click(guide(),'Save & next');
  }
  expect(groupNumber()).toBe('Question group '+total+' of '+total);await fillGroup();await choose('additional_confirmation','Yes');
  const writeCount=putSpy.mock.calls.length;
  await click(guide(),'Save & next');expect(guide().textContent).toContain('Describe the additional reported work before reviewing the summary.');expect(putSpy).toHaveBeenCalledTimes(writeCount);
  await edit(guide().querySelector('#omni-answer-unknowns'),'   ');await click(guide(),'Save & next');expect(putSpy).toHaveBeenCalledTimes(writeCount);
  const confirmation='The named requirement needs confirmation by the owner in this owned local QA fixture.';
  await edit(guide().querySelector('#omni-answer-unknowns'),confirmation);await click(guide(),'Save & next');
  expect(guide().textContent).toContain('Review your assessment summary');expect(guide().textContent).toContain('Not Assessed');
  expect((await api.get(base+'/guided-assessment')).data).toMatchObject({completed:true,result:{status:'not_assessed'}});
  await assertNativeUnchanged();

  const summary=guide().querySelector('[aria-label="Omnibot implementation summary"]');
  const generated=summary.value,reviewed='Reviewed local QA summary.\n\nRetained native manual context:\n'+baseline.implementation+'\n\n'+confirmation;
  await edit(summary,reviewed);await click(guide(),'Update assessment');await click(document.body,'Cancel');
  expect(summary.value).toBe(reviewed);await assertNativeUnchanged();
  await click(guide(),'Update assessment');await click(document.body,'Yes, update assessment');
  expect(nativeWrites()).toHaveLength(1);expect(nativeWrites()[0][1]).toMatchObject({implementation:reviewed,status:'not_assessed',verification,expected_last_assessed:baseline.last_saved??baseline.last_assessed??null});
  const saved=(await api.get(base)).data,completed=(await api.get(base+'/guided-assessment')).data;
  expect(saved).toMatchObject({implementation:reviewed,status:'not_assessed',verification});
  expect(saved.guided_assessment_source).toMatchObject({version,revision:completed.revision,generated_at:completed.generated_at,by:mockAuth.user.user_id});
  expect(saved.assessment_history.slice(0,baseline.assessment_history.length)).toEqual(baseline.assessment_history);
  expect(saved.assessment_history).toHaveLength(baseline.assessment_history.length+1);
  expect(saved.assessment_history.at(-1)).toMatchObject({implementation:reviewed,status:'not_assessed',verification});
  expect((await api.get(base+'/related')).data.findings).toEqual(relatedBefore.findings);
  const items=saved.items_to_address.filter(item=>item.state==='open');
  expect(items.map(item=>item.question_id).sort()).toEqual([matrixId,'unknowns'].sort());
  expect(items.every(item=>item.kind==='verification'&&!item.finding_id)).toBe(true);
  expect(items.find(item=>item.question_id===matrixId).text).toContain(affectedLabel);
  expect(items.find(item=>item.question_id==='unknowns').text).toBe(confirmation);
  const history=(await api.get(base+'/guided-assessment/history')).data.items;
  expect(history.some(item=>item.completed&&item.narrative===generated)).toBe(true);

  await selectTab('Items to address');const itemSection=[...surface().querySelectorAll('.assessment-item')].find(section=>section.textContent.includes(affectedLabel));expect(itemSection).toBeTruthy();
  await edit(itemSection.querySelector('textarea'),'Owned local confirmation; judgment remains separately recorded.');
  await act(async()=>itemSection.querySelector('input[type="checkbox"]').click());
  const resolved=(await api.get(base)).data,resolvedItem=resolved.items_to_address.find(item=>item.item_id===items.find(item=>item.question_id===matrixId).item_id);
  expect(resolvedItem).toMatchObject({state:'resolved',resolution:'Owned local confirmation; judgment remains separately recorded.'});expect(resolvedItem.history.at(-1).event).toBe('resolved');
  for(const key of ['status','verification','implementation','last_saved','last_assessed','assessment_history'])expect(resolved[key]).toEqual(saved[key]);
  expect((await api.get(base+'/related')).data.findings).toEqual(relatedBefore.findings);
  await remount();expect(disclosure().open).toBe(false);expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(reviewed);
  expect((await api.get(base+'/guided-assessment')).data.narrative).toBe(reviewed);expect(nativeWrites()).toHaveLength(1);
});

test.each(['resume','completed','stale'])('%s personal interview retains its existing routing and native manual record on entry',async state=>{
  await loadSafeguard('1.1');
  if(state==='completed'){
    const answers=completedAnswers(),result=omniCisSummary('1.1',answers,version,'Brawndo',new Date()).result;
    expect(result.status).toBe('addressed');await checkpoint(answers,{completed:true,result,narrative:'Saved reviewed completion remains exact.'});
  }else await checkpoint({inventory:'Not sure',inventory_detail:'Retained personal checkpoint context.'});
  if(state==='stale'){
    await api.patch(base,{implementation:baseline.implementation+'\nA later owned native manual update.',expected_last_assessed:baseline.last_saved??baseline.last_assessed??null});
    baseline=copy((await api.get(base)).data);record=copy(baseline);
  }
  const before=(await api.get(base+'/guided-assessment')).data;
  putSpy.mockClear();patchSpy.mockClear();postSpy.mockClear();
  await render();expect(disclosure().open).toBe(false);expect(putSpy).not.toHaveBeenCalled();await assertNativeUnchanged();
  await openSavedInterview();expect((await api.get(base+'/guided-assessment')).data).toEqual(before);
  if(state==='completed')expect(guide().querySelector('[aria-label="Omnibot implementation summary"]').value).toBe('Saved reviewed completion remains exact.');
  else if(state==='stale')expect(guide().textContent).toContain('Compare & continue from saved assessment');
  else expect(button(guide(),'Not sure').getAttribute('aria-pressed')).toBe('true');
  expect(putSpy).not.toHaveBeenCalled();await assertNativeUnchanged();
});

test.each(['read-only','visual-disabled','unavailable'])('%s entry does not reveal a fresh editable guide or issue a write',async state=>{
  await loadSafeguard('1.1');
  if(state==='read-only')mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_viewer'}};
  if(state==='unavailable'){
    const get=api.get.bind(api);jest.spyOn(api,'get').mockImplementation((url,config)=>url===base+'/guided-assessment'?Promise.reject(new Error('Owned fixture interview unavailable')):get(url,config));
  }
  await render(state!=='visual-disabled');expect(disclosure().open).toBe(false);expect(putSpy).not.toHaveBeenCalled();expect(patchSpy).not.toHaveBeenCalled();expect(postSpy).not.toHaveBeenCalled();
  await assertNativeUnchanged();
  if(state==='read-only'){await openSavedInterview();expect(guide().querySelector('fieldset').disabled).toBe(true);}
  if(state==='unavailable'){await openSavedInterview();expect(guide().textContent).toContain('Owned fixture interview unavailable');expect(guide().querySelector('.omni-question-group')).toBeNull();}
});


test('a delayed fresh personal read cannot reopen an interview explicitly opened and closed while loading',async()=>{
  await loadSafeguard('1.1');
  const get=api.get.bind(api);let release,intercepted=false;
  const pending=new Promise(resolve=>{release=resolve;});
  jest.spyOn(api,'get').mockImplementation((url,config)=>{
    if(url===base+'/guided-assessment'&&!intercepted){intercepted=true;return pending;}
    return get(url,config);
  });
  await render();expect(intercepted).toBe(true);expect(disclosure().open).toBe(false);
  await act(async()=>disclosure().querySelector('summary').click());expect(disclosure().open).toBe(true);
  await act(async()=>disclosure().querySelector('summary').click());expect(disclosure().open).toBe(false);
  await act(async()=>release(await get(base+'/guided-assessment')));
  expect(disclosure().open).toBe(false);expect(guide().hidden).toBe(true);
  expect((await get(base+'/guided-assessment')).data).toMatchObject({revision:0,answers:{},completed:false});
  expect(putSpy).not.toHaveBeenCalled();expect(patchSpy).not.toHaveBeenCalled();expect(postSpy).not.toHaveBeenCalled();
  await assertNativeUnchanged();
});
