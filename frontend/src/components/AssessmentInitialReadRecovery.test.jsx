import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GenericGuidedAssessor from './GenericGuidedAssessor';
import {OrganizationalControlDrawer} from './OrganizationalControls';
import api from '@/lib/api';
import {AssessmentCommandApi,useScopedAssessmentApi} from '@/lib/assessmentCommandScope';
import {AssessmentSurfaceAvailability} from '@/lib/assessmentSurfaceAvailability';
import {genericGuidedVersion} from '@/lib/genericGuidedAssessment';

const mockUser={user_id:'synthetic-initial-load-operator',role:'super_admin',workspace_mode:'standard'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:'standard'})}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:false,API:'/api',
  default:{get:jest.fn(),put:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},
  formatError:error=>error.message}));
// These drawers are never opened; the guide, Control editor and scoped API stay native.
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./EvidenceItemDrawer',()=>()=>null);

let root,host,heldReads;
function held(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const read={promise,resolve,reject};heldReads.push(read);return read;
}
function Epoch({owner,available=true,children}){
  const authority=React.useRef(null);
  authority.current={owner,readable:available,available};
  const scoped=useScopedAssessmentApi(authority,owner);
  return <AssessmentCommandApi.Provider value={scoped}>
    <AssessmentSurfaceAvailability.Provider value={available}>{children}</AssessmentSurfaceAvailability.Provider>
  </AssessmentCommandApi.Provider>;
}
async function render(children,owner,available=true){
  await act(async()=>root.render(<Epoch owner={owner} available={available}>{children}</Epoch>));
}
async function resolve(read,data){
  await act(async()=>{read.resolve({data});await read.promise;});
}
function button(name){
  return [...document.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
}
async function click(name){
  const node=button(name);expect(node).toBeTruthy();expect(node.disabled).toBe(false);
  await act(async()=>node.click());
}
async function fill(node,value){
  expect(node).toBeTruthy();
  await act(async()=>{
    const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
    node.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
beforeEach(()=>{
  jest.resetAllMocks();heldReads=[];global.IS_REACT_ACT_ENVIRONMENT=true;
  global.crypto=require('crypto').webcrypto;
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  await act(async()=>{heldReads.forEach(read=>read.resolve({data:[]}));await Promise.allSettled(heldReads.map(read=>read.promise));});
  host.remove();
});

test('an interrupted first Generic load recovers in a fresh epoch without later re-adopting dirty answers or revision bases',async()=>{
  const record={client_id:'synthetic-first-load-client',framework_key:'nist-csf-2',definition_id:'GV.OC-01',framework_assessment_id:'synthetic-first-load-assessment'};
  const path='/framework_assessments/'+record.framework_assessment_id+'/guided-assessment';
  const current={version:genericGuidedVersion(record.framework_key),answers:{practice:'Not sure',implementation:'SYNTHETIC fresh initial wording'},
    step:1,revision:6,completed:false,base_assessment_token:'SYNTHETIC assessment version 6',base_scope_fingerprint:'a'.repeat(64)};
  const old=held(),fresh=held(),onDraftChange=jest.fn();
  let reads=0;
  api.get.mockImplementation(route=>{
    if(route!==path)return Promise.reject(new Error('Unexpected Generic read: '+route));
    if(++reads===1)return old.promise;
    if(reads===2)return fresh.promise;
    return Promise.resolve({data:{...current,revision:99,answers:{...current.answers,implementation:'SYNTHETIC unwanted re-adoption'}}});
  });
  const draw=(owner,available=true)=>render(<GenericGuidedAssessor inline record={record} disabled={!available} onDraftChange={onDraftChange}/>,owner,available);
  await draw('A0');
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(button('Begin guided assessment').disabled).toBe(true);
  const oldSignal=api.get.mock.calls[0][1].signal;
  await draw('suspended',false);
  expect(oldSignal.aborted).toBe(true);
  expect(api.get).toHaveBeenCalledTimes(1);
  await draw('A1');
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(button('Begin guided assessment').disabled).toBe(true);
  await resolve(fresh,current);
  expect(button('Resume guided assessment').disabled).toBe(false);
  await click('Resume guided assessment');
  expect(host.querySelector('textarea').value).toBe(current.answers.implementation);

  await resolve(old,{...current,revision:90,answers:{practice:'Not sure',implementation:'SYNTHETIC retired A0 private wording'}});
  expect(host.querySelector('textarea').value).toBe(current.answers.implementation);
  expect(host.textContent).not.toContain('SYNTHETIC retired A0 private wording');
  expect(host.querySelector('[role="alert"]')).toBeNull();

  const edited='SYNTHETIC dirty wording retained across another epoch';
  await fill(host.querySelector('textarea'),edited);
  expect(onDraftChange).toHaveBeenLastCalledWith(true);
  await draw('suspended-again',false);
  await draw('A2');
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(host.querySelector('textarea').value).toBe(edited);
  expect(onDraftChange).toHaveBeenLastCalledWith(true);
  api.put.mockResolvedValue({data:{...current,answers:{...current.answers,implementation:edited},revision:7}});
  await click('Save progress');
  expect(api.put).toHaveBeenCalledTimes(1);
  expect(api.put.mock.calls[0][0]).toBe(path);
  expect(api.put.mock.calls[0][1]).toEqual({
    version:current.version,answers:{...current.answers,implementation:edited},step:1,completed:false,narrative:'',
    expected_revision:6,base_assessment_token:current.base_assessment_token,base_scope_fingerprint:current.base_scope_fingerprint
  });
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

test('an interrupted multi-read Control initialization recovers atomically and preserves a dirty design and its original CAS version',async()=>{
  const clientId='synthetic-control-load-client',record={client_id:clientId,control_id:'synthetic-shared-control'};
  const detail='/organizational-controls/'+record.control_id,assessments='/organizational-controls/assessments',members='/clients/'+clientId+'/members';
  const paths=[detail,assessments,members],old=Object.fromEntries(paths.map(path=>[path,held()])),fresh=Object.fromEntries(paths.map(path=>[path,held()]));
  const criterion={framework_assessment_id:'synthetic-supported-assessment',framework_key:'cis-ig1',definition_id:'5.1',title:'SYNTHETIC current account inventory'};
  const current={...record,name:'SYNTHETIC current Control',description:'SYNTHETIC saved design',frequency:'Quarterly',design:'adequate',owner_id:null,
    assessment_ids:[criterion.framework_assessment_id],related_links:[],linked_records:{},conflicts:[],observations:[],legacy_sources:[],history:[],updated_at:'SYNTHETIC Control version 4'};
  const counts={},onSaved=jest.fn(),onOpenChange=jest.fn();
  let saved=null;
  api.get.mockImplementation(path=>{
    if(path==='/organizational-controls/candidates')return Promise.resolve({data:{items:[],has_more:false}});
    if(saved&&path===detail)return Promise.resolve({data:saved});
    if(!paths.includes(path))return Promise.reject(new Error('Unexpected Control read: '+path));
    counts[path]=(counts[path]||0)+1;
    if(counts[path]===1)return old[path].promise;
    if(counts[path]===2)return fresh[path].promise;
    return Promise.resolve({data:path===detail?{...current,description:'SYNTHETIC unwanted fresh adoption',updated_at:'SYNTHETIC wrong later CAS'}:[]});
  });
  const contextReads=()=>api.get.mock.calls.filter(([path])=>paths.includes(path));
  const design=()=>document.querySelector('[aria-label="Organizational Control design"]');
  const draw=(owner,available=true)=>render(<OrganizationalControlDrawer open record={record} clientId={clientId} onOpenChange={onOpenChange} onSaved={onSaved}/>,owner,available);
  await draw('A0');
  expect(contextReads().map(([path])=>path)).toEqual(paths);
  const oldSignal=contextReads()[0][1].signal;
  expect(contextReads().every(([,config])=>config.signal===oldSignal)).toBe(true);
  await resolve(old[detail],{...current,name:'SYNTHETIC old partial Control',updated_at:'SYNTHETIC old CAS'});
  expect(button('Save Control').disabled).toBe(true);
  expect(design().value).toBe('');
  await draw('suspended',false);
  expect(oldSignal.aborted).toBe(true);
  await draw('A1');
  expect(contextReads().map(([path])=>path)).toEqual([...paths,...paths]);
  await resolve(fresh[assessments],[criterion]);
  await resolve(fresh[members],[]);
  expect(button('Save Control').disabled).toBe(true);
  await resolve(fresh[detail],current);
  expect(button('Save Control').disabled).toBe(false);
  expect(design().value).toBe(current.description);
  expect(document.querySelector('[aria-label="Supports cis-ig1 5.1"]').checked).toBe(true);

  await resolve(old[assessments],[{...criterion,definition_id:'SYNTHETIC retired criterion'}]);
  await resolve(old[members],[{user_id:'synthetic-retired-owner',name:'SYNTHETIC retired account'}]);
  expect(design().value).toBe(current.description);
  expect(document.body.textContent).not.toContain('SYNTHETIC old partial Control');
  expect(document.body.textContent).not.toContain('SYNTHETIC retired criterion');
  expect(document.querySelector('[role="alert"]')).toBeNull();

  const edited='SYNTHETIC unsaved design after authoritative recovery';
  await fill(design(),edited);
  await draw('suspended-again',false);
  await draw('A2');
  expect(contextReads()).toHaveLength(6);
  expect(design().value).toBe(edited);
  expect(document.querySelector('[aria-label="Supports cis-ig1 5.1"]').checked).toBe(true);
  api.patch.mockImplementation(async(path,body)=>{
    saved={...current,...body,updated_at:'SYNTHETIC confirmed saved Control version 5'};
    return {data:saved};
  });
  await click('Save Control');
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch.mock.calls[0][0]).toBe(detail);
  expect(api.patch.mock.calls[0][1]).toEqual({
    name:current.name,description:edited,frequency:current.frequency,design:current.design,owner_id:null,
    assessment_ids:current.assessment_ids,related_links:[],expected_updated_at:current.updated_at,resolve_conflicts:false,reconciliation_note:''
  });
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(api.post).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});