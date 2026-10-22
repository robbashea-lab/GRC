import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AIDrawer from './AIDrawer';
import api from '@/lib/api';
import {AI_DEFAULTS} from '@/lib/aiGovernance';
import {AI_PILOT_DEFAULTS} from '@/lib/brawndoAI';
import {downloadEvidence} from '@/lib/evidenceContext';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'admin',role:'super_admin',workspace_mode:'demo'}})}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>true}));
jest.mock('@/lib/createIntent',()=>({useCreateIntent:()=>jest.fn()}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('@/lib/evidenceContext',()=>({downloadEvidence:jest.fn()}));
jest.mock('./AssigneeSelect',()=>()=> <span>Native owner picker</span>);
jest.mock('./RecordDrawer',()=>({kind,record,onSaved,onOpenChange,aiRiskCreation})=>kind==='policies'?<button type="button" data-testid="save-nested-policy" onClick={()=>{mockPolicySaveCount++;void onSaved({policy_id:'native-created-policy',client_id:'demo_brawndo',title:'Saved native Policy'});}}>Save native Policy</button>:record?<button type="button" data-testid="open-saved-risk" data-ai-risk-creation={!!aiRiskCreation} onClick={()=>onOpenChange(false)}>{record.risk_id}</button>:<button type="button" data-testid="save-nested-risk" data-ai-risk-creation={!!aiRiskCreation} onClick={()=>{mockRiskCreated=true;mockRiskSaveCount++;void onSaved({risk_id:'native-created-risk',display_id:'RISK-20',title:'Saved native Risk',client_id:'demo_brawndo'});onOpenChange(false);}}>Save native Risk</button>);
jest.mock('./ui/dialog',()=>{
  const {forwardRef}=require('react');
  return {Dialog:({open,children})=>open?<>{children}</>:null,DialogContent:({children})=><section>{children}</section>,DialogTitle:forwardRef(({children,...props},ref)=><h2 {...props} ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
});
let node,root,mockRiskCreated,mockRiskSaveCount,mockPolicySaveCount;
const record={...AI_DEFAULTS,...AI_PILOT_DEFAULTS,ai_system_id:'saved-ai',client_id:'demo_brawndo',display_id:'AI-10',name:'Saved AI',updated_at:'ai-v1'};
beforeEach(()=>{mockRiskCreated=false;mockRiskSaveCount=0;mockPolicySaveCount=0;global.IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);api.get.mockImplementation(async path=>({data:path==='/ai_systems'?[record]:path==='/related'?{}:path==='/risks'&&mockRiskCreated?[{risk_id:'native-created-risk',display_id:'RISK-20',title:'Saved native Risk',client_id:'demo_brawndo'}]:[]}));api.post.mockResolvedValue({data:{ok:true}});});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});
const button=text=>[...node.querySelectorAll('button')].find(element=>element.textContent===text);
async function createWithNote(){
  await act(async()=>root.render(<AIDrawer open conceptPresentation record={record} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  const note=node.querySelector('[aria-label="Note for the risk owner"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(note,'Risk owner context');note.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Create a new risk for this AI system').click());
  expect(node.querySelector('[data-testid="save-nested-risk"]').getAttribute('data-ai-risk-creation')).toBe('true');
  expect(api.post).not.toHaveBeenCalled();
  await act(async()=>button('Save native Risk').click());
}
test('native Risk creation links the returned concrete ID and saved relationship rationale',async()=>{
  await createWithNote();
  expect(api.post).toHaveBeenCalledWith('/ai_systems/saved-ai/links',{kind:'risks',id:'native-created-risk',classification:'Context',rationale:'Risk owner context'});
  expect(node.querySelector('[aria-label="Note for the risk owner"]').value).toBe('');
  expect(api.patch).not.toHaveBeenCalled();
});
test('ordinary AI Risk creation does not request the scoped concept assessment panel',async()=>{
  await act(async()=>root.render(<AIDrawer open record={record} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  await act(async()=>button('Related').click());
  await act(async()=>button('Create Risk').click());
  expect(node.querySelector('[data-testid="save-nested-risk"]').getAttribute('data-ai-risk-creation')).toBe('false');
  expect(api.post).not.toHaveBeenCalled();
});
test('accepted concept Policy closes its creation form before the relationship completes and retains link failures',async()=>{
  let rejectLink;api.post.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectLink=reject;}));
  await act(async()=>root.render(<AIDrawer open conceptPresentation record={record} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  await act(async()=>node.querySelector('.aic-governance summary').click());
  await act(async()=>button('Create recommended AI Policy').click());
  await act(async()=>button('Save native Policy').click());
  expect(node.querySelector('[data-testid="save-nested-policy"]')).toBeNull();expect(mockPolicySaveCount).toBe(1);
  expect(api.post).toHaveBeenCalledWith('/ai_systems/saved-ai/links',{kind:'policies',id:'native-created-policy',classification:'Recommended governance practice'});
  await act(async()=>rejectLink(Error('Policy link unavailable')));
  expect(node.textContent).toContain('Record saved, but linking failed: Policy link unavailable');
  expect(node.querySelector('[data-testid="save-nested-policy"]')).toBeNull();expect(mockPolicySaveCount).toBe(1);
});
test('ordinary AI caller retains its native accepted Policy creation form behavior',async()=>{
  await act(async()=>root.render(<AIDrawer open record={record} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  await act(async()=>button('Related').click());await act(async()=>button('Create recommended AI Policy').click());
  await act(async()=>button('Save native Policy').click());
  expect(node.querySelector('[data-testid="save-nested-policy"]')).not.toBeNull();expect(mockPolicySaveCount).toBe(1);
});
test('saved Risk plus failed link preserves the relationship note and reports partial failure',async()=>{
  api.post.mockRejectedValueOnce(new Error('Link unavailable'));
  await createWithNote();
  expect(node.textContent).toContain('Record saved, but linking failed: Link unavailable');
  expect(node.querySelector('[aria-label="Note for the risk owner"]').value).toBe('Risk owner context');
  const savedOption=node.querySelector('option[value="native-created-risk"]');expect(savedOption).not.toBeNull();expect(savedOption.parentElement.value).toBe('native-created-risk');
  const recordOption=node.querySelector('.aic-governance option[value="native-created-risk"]');
  expect(recordOption.textContent).toBe('RISK-20 · Saved native Risk');expect(recordOption.children).toHaveLength(0);
  expect(node.querySelector('[data-testid="save-nested-risk"]')).toBeNull();
  await act(async()=>button('Open saved Risk').click());expect(node.querySelector('[data-testid="open-saved-risk"]').textContent).toBe('native-created-risk');
  await act(async()=>node.querySelector('[data-testid="open-saved-risk"]').click());
  expect(node.textContent).toContain('Record saved, but linking failed: Link unavailable');
  await act(async()=>button('Create a new risk for this AI system').click());expect(node.querySelector('[data-testid="save-nested-risk"]')).toBeNull();expect(mockRiskSaveCount).toBe(1);
  await act(async()=>button('Link Risk').click());
  expect(api.post).toHaveBeenLastCalledWith('/ai_systems/saved-ai/links',{kind:'risks',id:'native-created-risk',classification:'Context',source:'',rationale:'Risk owner context'});
  expect(node.textContent).not.toContain('Retry Link Risk to finish its relationship.');expect(mockRiskSaveCount).toBe(1);
  expect(api.patch).not.toHaveBeenCalled();
});

test('concept primary Vendor uses same-client options and saves through native CAS',async()=>{
  const originalGet=api.get.getMockImplementation(),closed=jest.fn();
  api.get.mockImplementation((path,...args)=>path==='/vendors'?Promise.resolve({data:[{vendor_id:'vendor-native',client_id:'demo_brawndo',name:'Native provider'},{vendor_id:'foreign-vendor',client_id:'demo_dunder',name:'Other tenant'}]}):originalGet(path,...args));
  api.patch.mockResolvedValue({data:{...record,vendor_id:'vendor-native'}});
  await act(async()=>root.render(<AIDrawer open conceptPresentation record={record} clientId="demo_brawndo" onOpenChange={closed}/>));
  const picker=node.querySelector('[aria-label="Vendor record"]');
  expect(picker.querySelector('option[value="foreign-vendor"]')).toBeNull();
  await act(async()=>{picker.value='vendor-native';picker.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
  await act(async()=>button('Save changes').click());
  expect(api.patch).toHaveBeenCalledWith('/ai_systems/saved-ai',expect.objectContaining({client_id:'demo_brawndo',vendor_id:'vendor-native',expected_updated_at:'ai-v1'}));
  expect(closed).toHaveBeenCalledWith(false);
});

test.each([false,true])('AI Evidence delegates to the shared downloader and retains native error handling (failure: %s)',async failure=>{
  const evidence={evidence_id:'native-file',client_id:'demo_brawndo',filename:'Native evidence.txt'};
  const originalGet=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/related'?Promise.resolve({data:{evidence:[evidence]}}):originalGet(path,...args));
  if(failure)downloadEvidence.mockRejectedValueOnce(Error('Evidence unavailable'));
  else downloadEvidence.mockResolvedValueOnce();
  await act(async()=>root.render(<AIDrawer open conceptPresentation record={record} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  await act(async()=>button('Native evidence.txt').click());
  expect(downloadEvidence).toHaveBeenCalledWith(evidence);
  if(failure)expect(node.querySelector('[role="alert"]').textContent).toContain('Evidence unavailable');
  else expect(node.querySelector('[role="alert"]')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
