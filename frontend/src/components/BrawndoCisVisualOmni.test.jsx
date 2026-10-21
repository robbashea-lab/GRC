import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import {focusedRecommendations} from '@/lib/focusedOmni';
import {versionForSafeguard} from '@/lib/guidedAssessment';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'cis-visual-actor',workspace_mode:'demo'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({clients:[{client_id:'demo_brawndo',name:'Brawndo'}]})}));

const fingerprint='a'.repeat(64),token='2026-10-01T12:00:00Z';
const copy=value=>JSON.parse(JSON.stringify(value));
const record=id=>({client_id:'demo_brawndo',framework_key:'cis-ig1',framework_assessment_id:'visual-'+id,definition_id:id,title:'Synthetic safeguard '+id,status:'not_assessed',implementation:'',verification:'not_verified',last_saved:token,assessment_history:[],work:{context_complete:true,finding_ids:[],review_ids:[],task_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,overdue_actions:0,priority_records:[]}});
let root,host,props,stored;
const button=name=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
async function render(extra={}){props={...props,...extra};await act(async()=>root.render(<GuidedAssessor {...props}/>));}
async function click(name){const node=button(name);expect(node).toBeTruthy();expect(node.disabled).toBe(false);await act(async()=>node.click());}
async function open(){await act(async()=>document.querySelector('[aria-label="Open Omnibot guide"]').click());}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();window.history.replaceState({},'', '/');
  document.body.dataset.brawndoCisVisual='true';
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  const current=record('1.1');
  stored={client_id:'demo_brawndo',assessment_id:current.framework_assessment_id,user_id:'cis-visual-actor',version:versionForSafeguard('1.1',true),revision:0,answers:{},step:0,completed:false,narrative:'',result:null,base_assessment_token:token,current_assessment_token:token,base_scope_fingerprint:fingerprint,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:false};
  props={clientId:'demo_brawndo',framework:'cis-ig1',configuration:{implementation_group:1},visualReference:true,record:current,current,form:copy(current),contextComplete:true,onApply:jest.fn(),onSaveAssessment:jest.fn(async()=>true),onDraftChange:jest.fn()};
  api.get.mockImplementation(async()=>({data:copy(stored)}));
  api.put.mockImplementation(async(_path,body)=>({data:stored={...stored,...copy(body),revision:stored.revision+1}}));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();delete document.body.dataset.brawndoCisVisual;jest.clearAllMocks();});

test('target popup preserves the native recommendation population, order and resume opener',async()=>{
  const rows=['1.1','1.2','2.1','3.1','3.2','4.1'].map(record),drafts={'1.2':{revision:2,completed:false}},onSelect=jest.fn();
  const expected=focusedRecommendations(rows,drafts,true);
  expect(expected).toHaveLength(5);
  await render({record:undefined,current:undefined,rows,draftSummaries:drafts,onSelect});
  expect(document.querySelectorAll('.cis-omni-owl')).toHaveLength(1);
  expect(button('Show next steps')).toBeTruthy();await click('Show next steps');
  expect([...document.querySelectorAll('.omni-recommendation h4')].map(node=>node.textContent)).toEqual(expected.map(row=>row.title));
  expect(document.querySelector('.cis-omni-program-window').style.width).toBe('360px');
  await click('Resume safeguard 1.2');
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({framework_assessment_id:'visual-1.2',action:'resume'}));
  expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('visual group saves the native checkpoint, retains failure and resumes saved answers after remount',async()=>{
  await render({inline:true,inlineOpen:true,onInlineClose:jest.fn()});
  expect(document.querySelector('.cis-omni-question-card')).toBeTruthy();
  await click('No');api.put.mockRejectedValueOnce(new Error('Synthetic checkpoint failure'));
  await click('Save & next');
  expect(document.body.textContent).toContain('Synthetic checkpoint failure');
  expect(document.querySelector('[aria-label="Question group 1 of 5"]')).toBeTruthy();expect(stored.revision).toBe(0);
  await click('Save & close');
  expect(api.put.mock.calls.at(-1)[0]).toBe('/framework_assessments/visual-1.1/guided-assessment');
  expect(api.put.mock.calls.at(-1)[1]).toEqual(expect.objectContaining({version:versionForSafeguard('1.1',true),answers:{inventory:'No'},step:0,completed:false,expected_revision:0}));
  expect(props.onInlineClose).toHaveBeenCalledTimes(1);expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.onApply).not.toHaveBeenCalled();
  await act(async()=>root.unmount());root=createRoot(host);await render();
  expect(button('No').getAttribute('aria-pressed')).toBe('true');expect(api.put).toHaveBeenCalledTimes(2);
});

test('target launcher retains the native saved position and arrow-key preference contract',async()=>{
  const preferenceKey='guided-pilot-ui:cis-visual-actor:demo_brawndo:free-position';
  localStorage.setItem(preferenceKey,JSON.stringify({x:200,y:300}));
  await render({record:undefined,current:undefined,rows:[record('1.1')]});
  const launcher=document.querySelector('[aria-label="Open Omnibot guide"]');
  expect(document.querySelector('.omni-free-dock').style.left).toBe('200px');
  await act(async()=>launcher.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  expect(JSON.parse(localStorage.getItem(preferenceKey))).toEqual({x:210,y:300});
  expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test.each([
  {visualReference:false},
  {clientId:'other-client',record:undefined,current:undefined},
])('appearance stays native outside the explicit canonical IG1 variant: %j',async extra=>{
  await render(extra);await open();
  expect(document.querySelector('.brawndo-cis-visual-omni')).toBeNull();expect(document.querySelector('.cis-omni-owl')).toBeNull();expect(document.querySelector('.cis-omni-question-card')).toBeNull();
  expect(document.querySelector('.omni-approved')).toBeTruthy();expect(api.put).not.toHaveBeenCalled();
});


test('unsupported group does not mount an interview or issue native writes',async()=>{
  await render({configuration:{implementation_group:4}});
  expect(document.querySelector('[data-testid="guided-pilot"]')).toBeNull();
  expect(api.put).not.toHaveBeenCalled();
});


test.each([2,3])('approved interview appearance follows the verified IG%i record without changing native answers',async group=>{
  await render({configuration:{implementation_group:group}});await open();
  expect(document.querySelector('.brawndo-cis-visual-omni')).toBeTruthy();
  expect(api.put).not.toHaveBeenCalled();
});
