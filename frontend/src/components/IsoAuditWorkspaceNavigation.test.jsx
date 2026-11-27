import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';
import FrameworkWorkspace from '@/pages/FrameworkWorkspace';
import {frameworkCatalog} from '@/lib/frameworks';
import {initialAuditState,isoAuditCatalog,blankAuditItem} from '@/lib/isoAudit';
import api from '@/lib/api';

let mockUser,mockClientId,mockMode;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:mockMode})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClientId})}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:false,default:{get:jest.fn(),patch:jest.fn(),put:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./GuidedAssessor',()=>()=>null);
jest.mock('./SocGuidedAssessor',()=>()=>null);
jest.mock('./IsoGuidedAssessor',()=>()=>null);
// The real router, FrameworkWorkspace, audit controller, workpaper fields and native leave guard run.
// Only the dialog primitive is reduced so browser focus management does not obscure controller assertions.
jest.mock('./ui/alert-dialog',()=>{
  const React=require('react'),Change=React.createContext(null);
  const Close=({children,onClick})=>{const change=React.useContext(Change);return <button onClick={event=>{onClick?.(event);if(!event.defaultPrevented)change(false);}}>{children}</button>;};
  return {
    AlertDialog:({open,onOpenChange,children})=>open?<Change.Provider value={onOpenChange}>{children}</Change.Provider>:null,
    AlertDialogContent:({children})=><section role="alertdialog">{children}</section>,
    AlertDialogTitle:({children})=><h2>{children}</h2>,AlertDialogDescription:({children})=><p>{children}</p>,
    AlertDialogFooter:({children})=><div>{children}</div>,AlertDialogCancel:Close,AlertDialogAction:Close,
  };
});

let root,container,rawLocation,navigate,reviews,workspaces,entries,initialIndex;
const clientId='iso-audit-navigation-client',packageKey=isoAuditCatalog.packages[0].key,otherPackage=isoAuditCatalog.packages[1].key;
const workpaper=isoAuditCatalog.packages[0].items[0];
const button=name=>[...document.querySelectorAll('button')].find(element=>element.textContent===name);
const click=name=>act(async()=>button(name).click());
const shell=()=>document.querySelector('[data-testid="iso-audit-workpaper"]');
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const noWrites=()=>{for(const method of ['patch','put','post','delete'])expect(api[method]).not.toHaveBeenCalled();};
const source=()=>JSON.stringify({reviews,workspaces});
const route=params=>'/compliance/iso-27001?'+new URLSearchParams(params);
const currentRoute=()=>route({iso_view:'audit',package:packageKey,audit_year:'2030'});
const destination=kind=>kind==='package'?route({iso_view:'audit',package:otherPackage,audit_year:'2030'}):kind==='occurrence'?
  route({iso_view:'audit',package:packageKey,audit_occurrence:'frozen-audit-cycle',audit_year:'2029'}):route({iso_view:'overview',audit_year:'2030'});
function RoutedWorkspace(){rawLocation=useLocation();navigate=useNavigate();return <FrameworkWorkspace frameworkKey="iso-27001" clientId={mockClientId}/>;}
const render=()=>act(async()=>root.render(<MemoryRouter initialEntries={entries} initialIndex={initialIndex}><RoutedWorkspace/></MemoryRouter>));
async function mount(kind,direction=-1){
  entries=direction===-1?[destination(kind),currentRoute()]:[currentRoute(),destination(kind)];initialIndex=direction===-1?1:0;
  await render();await click('Expand all audit areas');
  await act(async()=>container.querySelector(`[data-audit-item="${workpaper.key}"]`).click());
  expect(shell()).not.toBeNull();
}
async function fill(label,value){
  await act(async()=>{const field=document.querySelector(`[aria-label="${label}"]`),prototype=field.tagName==='SELECT'?HTMLSelectElement.prototype:field.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,value);field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));});
}
async function makeDraft(kind){
  await fill('Auditor notes','Exact unsaved audit workpaper notes.');
  if(kind==='finding'){await click('Findings');await click('Raise Finding');await fill('Finding title','Exact unsaved audit Finding title');}
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;global.crypto=require('crypto').webcrypto;sessionStorage.clear();localStorage.clear();jest.clearAllMocks();
  mockClientId=clientId;mockMode='demo';mockUser={user_id:'audit-owner',role:'super_admin',workspace_mode:'demo'};
  reviews=[packageKey,otherPackage].map((key,index)=>({review_id:'audit-review-'+index,client_id:clientId,title:'Synthetic audit '+index,owner_id:mockUser.user_id,
    due_date:'2030-12-31',updated_at:'audit-version-'+index,current_occurrence_id:'audit-occurrence-'+index,recurrence:'annual',iso_audit:initialAuditState(key),occurrences:[]}));
  reviews[0].occurrences=[{...reviews[0],occurrence_id:'frozen-audit-cycle',current_occurrence_id:undefined,due_date:'2029-12-31',completed_at:'2029-12-30',iso_audit:initialAuditState(packageKey)}];
  workspaces={};for(const id of [clientId,'iso-audit-other-client']){
    const definitions=frameworkCatalog('iso-27001').requirements.filter(definition=>['4.1','4.2'].includes(definition.id));
    workspaces[id]={selected:true,configured:true,configuration:{},definitions,active_definition_ids:definitions.map(definition=>definition.id),work:{},
      assessments:definitions.map(definition=>({client_id:id,framework_key:'iso-27001',framework_assessment_id:id+':'+definition.id,definition_id:definition.id,status:'in_progress',implementation:'Saved ISO '+definition.id}))};
  }
  api.get.mockImplementation(async(path,options)=>({data:path==='/frameworks/iso-27001'?workspaces[options?.params?.client_id||mockClientId]:path==='/iso-audit'?
    {program:{status:'active',activated_at:'2030-10-01',configuration:{start_date:'2030-10-01'}},reviews:mockClientId===clientId?reviews:[]}:path==='/related'?
      {findings:[],tasks:[]}:path==='/evidence/catalog'?{items:[],total:0,page:1,page_size:25}:[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test.each(['package','occurrence','section'].flatMap(kind=>['native','finding'].map(draft=>[kind,draft])))('%s Back keeps the %s audit draft mounted until Keep editing or Discard resolves',async(kind,draft)=>{
  await mount(kind);const before=source(),editor=shell();await makeDraft(draft);
  await act(async()=>navigate(-1));
  expect(rawLocation.pathname+rawLocation.search).toBe(destination(kind));expect(shell()).toBe(editor);
  expect(document.querySelector('[aria-label="Auditor notes"]').value).toBe('Exact unsaved audit workpaper notes.');
  expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Leave unsaved changes?');
  await click('Keep editing');expect(rawLocation.pathname+rawLocation.search).toBe(currentRoute());expect(shell()).toBe(editor);
  if(draft==='finding')expect(document.querySelector('[aria-label="Finding title"]').value).toBe('Exact unsaved audit Finding title');
  await act(async()=>navigate(-1));const requestedKey=rawLocation.key;await click('Discard changes');
  expect(rawLocation.key).toBe(requestedKey);expect(rawLocation.pathname+rawLocation.search).toBe(destination(kind));expect(shell()).toBeNull();
  expect(source()).toBe(before);noWrites();
});

test('Forward to another audit package uses the same native confirmation without losing the current draft',async()=>{
  await mount('package',1);const before=source(),editor=shell();await makeDraft('native');await act(async()=>navigate(1));
  expect(shell()).toBe(editor);expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await click('Keep editing');expect(rawLocation.pathname+rawLocation.search).toBe(currentRoute());expect(shell()).toBe(editor);
  expect(source()).toBe(before);noWrites();
});

test.each([false,true])('a clean audit workpaper follows the requested destination once without writes; readonly=%s',async readonly=>{
  if(readonly)mockUser={...mockUser,role:'client_readonly'};
  await mount('section');const before=source();
  if(readonly){expect(button('Save assessment')).toBeUndefined();expect(document.querySelector('[aria-label="Auditor notes"]').closest('fieldset').disabled).toBe(true);}
  await act(async()=>navigate(-1));const requestedKey=rawLocation.key;
  expect(shell()).toBeNull();expect(document.querySelector('[role="alertdialog"]')).toBeNull();expect(rawLocation.key).toBe(requestedKey);
  expect(rawLocation.pathname+rawLocation.search).toBe(destination('section'));expect(source()).toBe(before);noWrites();
});

test.each(['package','occurrence','section'].flatMap(kind=>[false,true].map(failure=>[kind,failure])))('audit Save & next preserves a newer %s destination and the exact CAS payload; failure=%s',async(kind,failure)=>{
  await mount(kind);const before=source(),editor=shell(),write=deferred(),sourceReview=reviews[0];await makeDraft('native');
  api.patch.mockImplementation(async(path,body)=>{
    await write.promise;const {occurrence_id,expected_updated_at,...fields}=body;
    const saved={...sourceReview,updated_at:'audit-version-saved',iso_audit:{...sourceReview.iso_audit,items:{...sourceReview.iso_audit.items,[workpaper.key]:fields}}};
    reviews=reviews.map(record=>record.review_id===saved.review_id?saved:record);return {data:saved};
  });
  await click('Save & next');const busyAtNavigation=button('Save assessment').disabled;
  await act(async()=>navigate(-1));const requestedKey=rawLocation.key,heldDuringSave=shell()===editor,confirmationDuringSave=document.querySelector('[role="alertdialog"]');
  await act(async()=>{if(failure)write.reject(new Error('Native audit save failed'));else write.resolve();await write.promise.catch(()=>{});});
  expect(busyAtNavigation).toBe(true);expect(heldDuringSave).toBe(true);expect(confirmationDuringSave).toBeNull();
  expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch).toHaveBeenCalledWith('/reviews/'+sourceReview.review_id+'/iso-audit/'+workpaper.key,{
    ...blankAuditItem(),notes:'Exact unsaved audit workpaper notes.',occurrence_id:sourceReview.current_occurrence_id,expected_updated_at:sourceReview.updated_at,
  });
  for(const method of ['put','post','delete'])expect(api[method]).not.toHaveBeenCalled();
  if(failure){
    expect(source()).toBe(before);expect(shell()).toBe(editor);expect(document.querySelector('[role="alert"]').textContent).toBe('Native audit save failed');
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();await click('Keep editing');expect(rawLocation.pathname+rawLocation.search).toBe(currentRoute());
    expect(document.querySelector('[aria-label="Auditor notes"]').value).toBe('Exact unsaved audit workpaper notes.');
  }else{
    expect(rawLocation.key).toBe(requestedKey);expect(rawLocation.pathname+rawLocation.search).toBe(destination(kind));expect(shell()).toBeNull();
    expect(reviews[0].iso_audit.items[workpaper.key].notes).toBe('Exact unsaved audit workpaper notes.');
  }
});

test.each(['actor','role','client','mode'])('an authorized %s origin change withdraws the old mounted audit draft immediately without writes',async kind=>{
  await mount('package');const before=source();await makeDraft('native');
  if(kind==='actor')mockUser={...mockUser,user_id:'different-authorized-user'};
  if(kind==='role')mockUser={...mockUser,role:'client_readonly'};
  if(kind==='client')mockClientId='iso-audit-other-client';
  if(kind==='mode')mockMode='authenticated';
  await render();expect(shell()).toBeNull();expect(document.querySelector('[role="alertdialog"]')).toBeNull();expect(source()).toBe(before);noWrites();
});
