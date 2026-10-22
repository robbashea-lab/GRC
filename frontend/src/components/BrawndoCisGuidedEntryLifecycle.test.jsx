import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {catalogForVersion,versionForSafeguard,visibleQuestions} from '@/lib/guidedAssessment';
import {nativeCisQuestionTitle} from './RefinedOmniInterview';
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
let root,host,record,baseline,relatedBefore,base,version,getSpy,putSpy,patchSpy,postSpy;
// The real native shell renders in a Radix portal, outside React's mount container.
const surface=()=>document.querySelector('[data-testid="brawndo-cis-assessment"]');
const guide=()=>surface().querySelector('[aria-label="CIS assessment interview"]');
const disclosure=()=>({open:!guide().hidden,querySelector:()=>surface().querySelector('.cis-guided-launch button')});
const button=(scope,name)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
async function click(scope,name){
  const target=button(scope,name);expect(target).toBeTruthy();expect(target.disabled).toBe(false);
  const requests=[getSpy,putSpy,patchSpy,postSpy].filter(Boolean),starts=requests.map(spy=>spy.mock.results.length);
  await act(async()=>{
    target.click();
    // DOM click does not return the async handler. Wait for the actual native
    // writes started by this action before asserting its rendered outcome.
    while(true){
      const pending=requests.flatMap((spy,index)=>{const results=spy.mock.results.slice(starts[index]);starts[index]=spy.mock.results.length;return results.map(result=>result.value);});
      if(!pending.length)break;
      await Promise.allSettled(pending);
    }
  });
}
async function edit(node,value){
  expect(node).toBeTruthy();
  const prototype=node.tagName==='SELECT'?HTMLSelectElement.prototype:node.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});
}
async function render(visualReference=true){await act(async()=>root.render(<FrameworkDrawer open visualReference={visualReference} record={record} clientId={clientId} onOpenChange={()=>{}}/>));}
async function remount(){await act(async()=>root.unmount());root=createRoot(host);record=(await api.get(base)).data;await render();}
async function openSavedInterview(){if(guide().hidden)await click(surface(),button(surface(),'Resume guided assessment')?'Resume guided assessment':'Begin guided assessment');expect(guide().hidden).toBe(false);}
const questionId=()=>guide().querySelector('.cis-sequential-interview fieldset')?.dataset.questionId;
const nativeWrites=()=>patchSpy.mock.calls.filter(([url])=>url===base);
const matrixControl=label=>[...guide().querySelectorAll('select[aria-label],.sg11-matrix-options')].find(node=>node.getAttribute('aria-label').toLowerCase().includes(label.toLowerCase()));
const matrixValue=node=>node.tagName==='SELECT'?node.value:node.querySelector('[aria-pressed="true"]')?.dataset.answer||'';
async function matrixAnswer(node,value){
  if(node.tagName==='SELECT')return edit(node,value);
  const choice=[...node.querySelectorAll('button')].find(button=>button.dataset.answer===value);
  expect(choice).toBeTruthy();await act(async()=>choice.click());
}
async function choose(id,value){
  expect(questionId()).toBe(id);
  const question=catalogForVersion(version).safeguards[record.definition_id].find(item=>item.id===id);
  await edit(guide().querySelector(`select[aria-label="${nativeCisQuestionTitle(record.definition_id,question)}"]`),value);
}
async function fillQuestion(){
  const question=catalogForVersion(version).safeguards[record.definition_id].find(item=>item.id===questionId());
  for(const select of guide().querySelectorAll('select')){
    if(select.value)continue;
    const options=[...select.options].map(option=>option.value);
    await edit(select,question.optional?'No':question.id==='frequency'&&options.includes('Every six months')?'Every six months':options.includes('One source')?'One source':options.includes('Yes')?'Yes':options.find(Boolean));
  }
  for(const date of guide().querySelectorAll('input[type="date"]'))if(!date.value)await edit(date,today());
}
async function advanceTo(id,rowText){
  for(let count=0;count<120;count++){
    if(questionId()===id&&(!rowText||matrixControl(rowText)))return;
    await fillQuestion();await click(guide(),'Continue');
  }
  throw new Error(`Native sequential question ${id} was not reached`);
}
async function summaryReview(){
  if(button(guide(),'Review answers'))await click(guide(),'Review answers');
  await click(guide(),'Review summary');
}
async function editConfirmation(value){
  if(button(guide(),'Review summary')){
    const edits=[...guide().querySelectorAll('button')].filter(node=>/^Edit answer /.test(node.textContent));await click(guide(),edits.at(-1).textContent);
  }
  const question=catalogForVersion(version).safeguards[record.definition_id].find(item=>item.id==='unknowns');
  await edit(guide().querySelector(`textarea[aria-label="${question.prompt}"]`),value);
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
  getSpy=jest.spyOn(api,'get');putSpy=jest.spyOn(api,'put');patchSpy=jest.spyOn(api,'patch');postSpy=jest.spyOn(api,'post');
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
  ['1.1','needs_attention','gap_identified','coverage','Servers'],
  ['2.1','addressed','verified','requirements_0','publisher'],
])('fresh personal %s exposes sequential native questions and carries a reviewed result through the native save and Items history',async(id,status,verification,matrixId,rowText)=>{
  await loadSafeguard(id);
  // Fresh personal progress coexists with the native seeded manual judgment and linked work.
  expect(baseline).toMatchObject({status,verification});expect(baseline.implementation.trim()).not.toBe('');
  if(id==='1.1')expect(relatedBefore.findings.length).toBeGreaterThan(0);
  await render();expect(disclosure().open).toBe(false);expect(guide().hidden).toBe(true);await openSavedInterview();
  expect(questionId()).toBe(catalogForVersion(version).safeguards[id][0].id);expect(guide().querySelector('fieldset').disabled).toBe(false);
  expect(putSpy).not.toHaveBeenCalled();expect(patchSpy).not.toHaveBeenCalled();expect(postSpy).not.toHaveBeenCalled();
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(baseline.implementation);
  await assertNativeUnchanged();

  await advanceTo(matrixId,rowText);await fillQuestion();
  const affected=matrixControl(rowText);expect(affected).toBeTruthy();
  const affectedLabel=affected.getAttribute('aria-label');await matrixAnswer(affected,id==='2.1'?'':'Not sure');
  await edit(guide().querySelector('[aria-label="Known gaps or uncertainties"]'),'Retain this local matrix context.');
  await click(guide(),'Save & close');expect(disclosure().open).toBe(false);
  const partial=(await api.get(base+'/guided-assessment')).data;
  expect(partial.completed).toBe(false);expect(partial.answers[matrixId+'_detail']).toBe('Retain this local matrix context.');
  if(id==='2.1')expect(partial.answers[matrixId]).not.toHaveProperty(affectedLabel);else expect(partial.answers[matrixId][affectedLabel]).toBe('Not sure');
  await assertNativeUnchanged();
  await remount();expect(disclosure().open).toBe(false);await openSavedInterview();await advanceTo(matrixId,affectedLabel);
  const resumed=matrixControl(affectedLabel);
  expect(matrixValue(resumed)).toBe(id==='2.1'?'':'Not sure');expect(guide().querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe('Retain this local matrix context.');
  if(matrixValue(resumed)!=='Not sure')await matrixAnswer(resumed,'Not sure');
  await advanceTo('additional_confirmation');await choose('additional_confirmation','Yes');await click(guide(),'Continue');expect(questionId()).toBe('unknowns');
  const writeCount=putSpy.mock.calls.length;
  await summaryReview();expect(guide().textContent).toContain('Describe the additional reported work before reviewing the summary.');expect(putSpy).toHaveBeenCalledTimes(writeCount);
  await editConfirmation('   ');await summaryReview();expect(putSpy).toHaveBeenCalledTimes(writeCount);
  const confirmation='The named requirement needs confirmation by the owner in this owned local QA fixture.';
  await editConfirmation(confirmation);await summaryReview();
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
  await act(async()=>{const resolve=button(itemSection,'Mark done')||itemSection.querySelector('input[type="checkbox"]');expect(resolve).toBeTruthy();resolve.click();});
  const resolved=(await api.get(base)).data,resolvedItem=resolved.items_to_address.find(item=>item.item_id===items.find(item=>item.question_id===matrixId).item_id);
  expect(resolvedItem).toMatchObject({state:'resolved',resolution:'Owned local confirmation; judgment remains separately recorded.'});expect(resolvedItem.history.at(-1).event).toBe('resolved');
  for(const key of ['status','verification','implementation','last_saved','last_assessed','assessment_history'])expect(resolved[key]).toEqual(saved[key]);
  expect((await api.get(base+'/related')).data.findings).toEqual(relatedBefore.findings);
  await remount();expect(disclosure().open).toBe(false);expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(reviewed);
  expect((await api.get(base+'/guided-assessment')).data.narrative).toBe(reviewed);expect(nativeWrites()).toHaveLength(1);
});

test('pilot validation and failed group save retain the current answers and native assessment',async()=>{
  await loadSafeguard('1.1');await render();await openSavedInterview();
  await click(guide(),'Continue');
  expect(questionId()).toBe('inventory');
  expect(guide().textContent).toContain('Choose an answer before continuing.');
  expect(putSpy).not.toHaveBeenCalled();
  await advanceTo('owner');await fillQuestion();
  putSpy.mockRejectedValueOnce(new Error('Owned fixture group save failed'));
  await click(guide(),'Continue');
  expect(questionId()).toBe('owner');
  expect(guide().textContent).toContain('Owned fixture group save failed');
  expect((await api.get(base+'/guided-assessment')).data.answers).toEqual({});
  expect((await api.get(base+'/guided-assessment')).data).toMatchObject({revision:0,answers:{},completed:false});
  await assertNativeUnchanged();
  // A DOM click does not return the native async handler's promise. Await the actual retry.
  await act(async()=>{button(guide(),'Continue').click();await putSpy.mock.results[1].value;});
  const retry=putSpy.mock.calls[1][1],persisted=(await api.get(base+'/guided-assessment')).data;
  expect(retry.answers.inventory).toBe('Yes');expect(persisted).toMatchObject({step:retry.step,revision:1,answers:{inventory:'Yes'}});
  expect({question:questionId(),errors:[...guide().querySelectorAll('[role=alert]')].map(node=>node.textContent),calls:putSpy.mock.calls.length}).toEqual({question:visibleQuestions(record.definition_id,persisted.answers,version)[retry.step].id,errors:[],calls:2});
  expect((await api.get(base+'/guided-assessment')).data.answers.inventory).toBe('Yes');
  await assertNativeUnchanged();
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
  else expect(guide().querySelector('.cis-sequential-interview select').value).toBe('Not sure');
  expect(putSpy).not.toHaveBeenCalled();await assertNativeUnchanged();
});

test.each(['read-only','visual-disabled','unavailable'])('%s entry does not reveal a fresh editable guide or issue a write',async state=>{
  await loadSafeguard('1.1');
  if(state==='read-only')mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_viewer'}};
  if(state==='unavailable'){
    const get=getSpy.getMockImplementation().bind(api);getSpy.mockImplementation((url,config)=>url===base+'/guided-assessment'?Promise.reject(new Error('Owned fixture interview unavailable')):get(url,config));
  }
  await render(state!=='visual-disabled');expect(disclosure().open).toBe(false);expect(putSpy).not.toHaveBeenCalled();expect(patchSpy).not.toHaveBeenCalled();expect(postSpy).not.toHaveBeenCalled();
  await assertNativeUnchanged();
  if(state==='read-only'){await openSavedInterview();expect(guide().querySelector('fieldset').disabled).toBe(true);}
  if(state==='unavailable'){await openSavedInterview();expect(guide().textContent).toContain('Owned fixture interview unavailable');expect(guide().querySelector('.cis-sequential-interview fieldset')).toBeNull();}
});


test('a delayed fresh personal read cannot reopen an interview explicitly opened and closed while loading',async()=>{
  await loadSafeguard('1.1');
  const get=getSpy.getMockImplementation().bind(api);let release,intercepted=false;
  const pending=new Promise(resolve=>{release=resolve;});
  getSpy.mockImplementation((url,config)=>{
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
