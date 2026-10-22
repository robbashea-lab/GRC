import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Evidence from './Evidence';
import api from '@/lib/api';

let mockAuth,mockOrg,mockRealEvidence,node,root;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/context/ComplianceContext',()=>({useCompliance:()=>({items:[],loading:false,error:''})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@/lib/brawndoAdditionalScope',()=>({useAdditionalSectionsSurface:(surface,loadedClientId)=>!mockOrg.loading&&loadedClientId==='demo_brawndo'}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useLocation:()=>({pathname:'/evidence',search:''}),useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('@/components/AdditionalEvidence',()=>{
  const actual=jest.requireActual('@/components/AdditionalEvidence');
  return {...actual,__esModule:true,default:props=>mockRealEvidence?<div data-testid="additional-evidence-view"><actual.default {...props}/></div>:<div data-testid="additional-evidence-view"><button type="button" onClick={()=>props.onUpload('')}>Open upload</button><button type="button" onClick={()=>props.onOpenItem('evidence-one')}>Open item</button></div>};
});
jest.mock('@/components/RecordDrawer',()=>()=>null);
// Keep the native editors/forms; only the unrelated Radix portal container is inline.
jest.mock('@/components/ui/sheet',()=>({Sheet:({children})=><>{children}</>,SheetContent:({children})=><section data-testid="native-evidence-sheet">{children}</section>,SheetHeader:({children})=><header>{children}</header>,SheetTitle:({children})=><h2>{children}</h2>,SheetDescription:({children})=><p>{children}</p>}));

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockRealEvidence=false;
  mockOrg={currentClientId:'demo_brawndo',currentClient:{client_id:'demo_brawndo',name:'Brawndo',status:'active'},loading:false};
  mockAuth={workspaceMode:'demo',user:{user_id:'actor-one',workspace_mode:'demo',role:'super_admin'}};
  const item={client_id:'demo_brawndo',evidence_id:'evidence-one',filename:'Evidence.txt',display_name:'Original evidence',updated_at:'version-one',references:[],program_areas:['Unassigned']};
  api.get.mockImplementation(async path=>({data:path==='/evidence/catalog'?{items:[item],total:1,page_size:5,program_counts:{},folder_counts:[]}:path==='/evidence-library/items/evidence-one'?item:[]}));
  node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});

const button=text=>[...node.querySelectorAll('button')].find(element=>element.textContent===text);
function enter(input,value){act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
function refreshAppearance(loading){mockOrg={...mockOrg,loading};act(()=>root.render(<Evidence/>));expect(!!node.querySelector('[data-testid="additional-evidence-view"]')).toBe(!loading);}

test('selected native upload file survives appearance withdrawal and restoration',async()=>{
  await act(async()=>root.render(<Evidence/>));act(()=>button('Open upload').click());
  const input=node.querySelector('[data-testid="evidence-file-input"]'),file=new File(['unsaved upload'],'Draft.txt',{type:'text/plain'});
  act(()=>{Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new Event('change',{bubbles:true}));});
  for(const loading of [true,false]){
    refreshAppearance(loading);
    expect(node.querySelector('[data-testid="evidence-file-input"]')).toBe(input);expect(input.files[0]).toBe(file);expect(button('Upload Evidence').disabled).toBe(false);
  }
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('actual actor changes still reset the open native upload editor',async()=>{
  await act(async()=>root.render(<Evidence/>));act(()=>button('Open upload').click());
  expect(node.querySelector('[data-testid="evidence-file-input"]')).not.toBeNull();
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'actor-two'}};await act(async()=>root.render(<Evidence/>));
  expect(node.querySelector('[data-testid="evidence-file-input"]')).toBeNull();
});

test('native classification draft survives organization loading without refetching or remounting the item',async()=>{
  await act(async()=>root.render(<Evidence/>));await act(async()=>button('Open item').click());act(()=>button('Edit classification').click());
  const name=[...node.querySelectorAll('label')].find(label=>label.textContent.startsWith('Display name')).querySelector('input'),form=name.closest('form');
  enter(name,'Unsaved classification');
  for(const loading of [true,false]){
    refreshAppearance(loading);
    expect(node.querySelector('form')).toBe(form);expect(name.value).toBe('Unsaved classification');expect(button('Save classification')).toBeDefined();
  }
  expect(api.get.mock.calls.filter(([path])=>path==='/evidence-library/items/evidence-one')).toHaveLength(1);
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('native catalog search, facets, recent selection and page survive appearance withdrawal, then reset for a new actor',async()=>{
  mockRealEvidence=true;
  const files=Array.from({length:26},(_,index)=>({client_id:'demo_brawndo',evidence_id:`file-${index}`,filename:`Check ${index}.pdf`,evidence_type:'Report',created_at:'2026-10-01',program_areas:['Unassigned'],references:[]}));
  api.get.mockImplementation(async(path,{params}={})=>({data:path==='/evidence/catalog'?{items:files.slice((params.page-1)*params.page_size,params.page*params.page_size),total:files.length,page_size:params.page_size,program_counts:{Unassigned:26},facets:{evidence_type:['Report'],years:['2026']},folder_counts:[]}:path==='/frameworks/cis-ig1'?{assessments:[],active_definition_ids:[],selected:false,configured:false}:[]}));
  await act(async()=>root.render(<Evidence/>));
  const request=()=>api.get.mock.calls.filter(([path,{params}={}])=>path==='/evidence/catalog'&&params.page_size===25).at(-1)[1].params;
  const search=node.querySelector('[data-testid="evidence-search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Check');search.dispatchEvent(new Event('input',{bubbles:true}));});
  for(const [label,value] of [['Evidence type','Report'],['Evidence year','2026']]){
    const select=node.querySelector(`[aria-label="${label}"]`);
    await act(async()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
  }
  await act(async()=>node.querySelector('[data-testid="evidence-figure-recent"]').click());
  await act(async()=>[...node.querySelectorAll('[aria-label="Evidence pagination"] button')].find(element=>element.textContent==='Next').click());
  const before=request();expect(before.page).toBe(2);expect(before.q).toBe('Check');expect(JSON.parse(before.state).filters).toEqual({created_at:['last90'],evidence_type:['Report'],years:['2026']});
  refreshAppearance(true);expect(node.querySelector('.brawndo-additional')).toBeNull();
  mockOrg={...mockOrg,loading:false};await act(async()=>root.render(<Evidence/>));
  expect(request()).toEqual(before);expect(node.querySelector('[data-testid="evidence-search"]').value).toBe('Check');expect(node.querySelector('[aria-label="Evidence type"]').value).toBe('Report');expect(node.querySelector('[aria-label="Evidence year"]').value).toBe('2026');expect(node.querySelector('[data-testid="evidence-figure-recent"]').getAttribute('aria-pressed')).toBe('true');expect(node.querySelector('[aria-label="Evidence pagination"]').textContent).toContain('26–26 of 26 files');
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'actor-two'}};await act(async()=>root.render(<Evidence/>));
  expect(request().page).toBe(1);expect(request().q).toBe('');expect(JSON.parse(request().state).filters).toEqual({});
});
