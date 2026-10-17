import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';

let mockAuth,mockGuideProps;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,default:{get:jest.fn(),patch:jest.fn(),put:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('./GuidedAssessor',()=>props=>{mockGuideProps=props;return null;});
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./RecordDrawer',()=>()=>null);
// Keep the real drawer, safeguard, shell, native fields and save handler; tab/guidance rendering is covered separately.
jest.mock('./AssessmentLayout',()=>({__esModule:true,default:({children,interview})=><div>{children}{interview?.({open:true,close:()=>{}})}</div>,AssessmentChecklist:()=>null,AssessmentRequirement:()=>null}));
jest.mock('./ui/dialog',()=>{
  const React=require('react'),CloseContext=React.createContext(null);
  // Model only the primitive's root close request; real Radix/focus behavior is covered by AssessmentShell.test.
  const NativeClose=React.forwardRef(({children,onClick,...props},ref)=>{
    const change=React.useContext(CloseContext);
    return <button {...props} ref={ref} onClick={event=>{onClick?.(event);if(!event.defaultPrevented)change(false);}}>{children}</button>;
  });
  return {Dialog:({open,children,onOpenChange})=>open?<CloseContext.Provider value={onOpenChange}><div>{children}</div></CloseContext.Provider>:null,
    DialogClose:NativeClose,
    DialogContent:React.forwardRef(({children,showCloseButton=true,onOpenAutoFocus,onCloseAutoFocus,onPointerDownOutside,onEscapeKeyDown,...props},ref)=><div {...props} ref={ref}>{children}{showCloseButton&&<NativeClose>Close</NativeClose>}</div>),
    DialogTitle:React.forwardRef(({children,...props},ref)=><h2 {...props} ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
});

const token='2026-10-01T12:00:00Z',savedToken='2026-10-02T12:00:00Z';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
let host,root,record,native,frameworkRead,onClose;
const work={context_complete:true,evidence_count:0,finding_ids:[],review_ids:[],task_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,overdue_actions:0,priority_records:[]};
const workspace=()=>({selected:true,configured:true,framework:{key:'cis-ig1',version:'8.1'},configuration:{implementation_group:1},
  implementation_position:{program_id:'demo_brawndo:cis-ig1'},assessments:[native],work:{[native.framework_assessment_id]:work}});
const render=(visualReference=true)=>act(async()=>root.render(<FrameworkDrawer open visualReference={visualReference} record={record} clientId="demo_brawndo" onOpenChange={onClose}/>));
const visual=()=>host.querySelector('.brawndo-cis-visual-safeguard');

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();
  onClose=jest.fn();mockGuideProps=null;
  mockAuth={user:{user_id:'native-visual-actor',role:'super_admin',workspace_mode:'demo'},workspaceMode:'demo'};
  native={framework_assessment_id:'native-visual-1.1',definition_id:'1.1',client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',
    status:'not_assessed',verification:'needs_validation',implementation:'Saved native implementation',technology:'Retained native platform',notes:'Retained native notes',
    owner_id:null,process_owner_id:null,na_rationale:'',last_saved:token,assessment_history:[],items_to_address:[],items_revision:0,cis_assessment_criteria:[]};
  record={...native};frameworkRead=()=>Promise.resolve({data:workspace()});
  api.get.mockImplementation(path=>path==='/frameworks/cis-ig1'?frameworkRead():Promise.resolve({data:path.endsWith('/related')?{reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]}:[]}));
  api.patch.mockImplementation(async(_path,body)=>{const {expected_last_assessed,...fields}=body;native={...native,...fields,last_saved:savedToken};return {data:native};});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});

test.each([false,true])('real native drawer retains the original manual save contract with appearance=%s',async variant=>{
  await render(variant);
  expect(!!visual()).toBe(variant);
  const input=host.querySelector('[aria-label="Current implementation"]');
  expect(input.disabled).toBe(false);expect(api.patch).not.toHaveBeenCalled();
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Reviewed native inventory wording');input.dispatchEvent(new Event('input',{bubbles:true}));});
  const save=[...host.querySelectorAll('button')].find(button=>button.textContent==='Save assessment');
  await act(async()=>save.click());
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch).toHaveBeenCalledWith('/framework_assessments/native-visual-1.1',expect.objectContaining({
    implementation:'Reviewed native inventory wording',status:'not_assessed',verification:'needs_validation',
    technology:'Retained native platform',notes:'Retained native notes',expected_last_assessed:token,
  }));
  expect(host.querySelector('[aria-label="Current implementation"]').value).toBe('Reviewed native inventory wording');
  expect(!!visual()).toBe(variant);expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('visual drawer rejects the prior role context and a late prior response during an origin round trip',async()=>{
  await render();expect(visual()).toBeTruthy();
  const originalRole=mockAuth.user.role,away=deferred(),back=deferred();
  let requested=0;frameworkRead=()=>++requested===1?away.promise:back.promise;
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_grc_manager'}};await render();
  expect(visual()).toBeNull();
  mockAuth={...mockAuth,user:{...mockAuth.user,role:originalRole}};await render();
  expect(visual()).toBeNull();
  await act(async()=>away.resolve({data:workspace()}));expect(visual()).toBeNull();
  await act(async()=>back.resolve({data:workspace()}));expect(visual()).toBeTruthy();
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('a true to false to true appearance transition requires a fresh matching joined read',async()=>{
  await render(true);expect(visual()).toBeTruthy();
  const away=deferred(),back=deferred();
  let requested=0;frameworkRead=()=>++requested===1?away.promise:back.promise;
  await render(false);expect(visual()).toBeNull();
  await render(true);expect(visual()).toBeNull();
  await act(async()=>away.resolve({data:workspace()}));expect(visual()).toBeNull();
  await act(async()=>back.resolve({data:workspace()}));expect(visual()).toBeTruthy();
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});


const nativeButton=name=>[...document.querySelectorAll('button')].find(element=>element.textContent===name);
const clickNative=element=>act(async()=>element.click());
async function editNativeImplementation(text){
  const input=host.querySelector('[aria-label="Current implementation"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));});
}
const inlineClose=()=>host.querySelector('[aria-label="Assessment navigation"] .brawndo-assessment-navigation-close');

test('gated inline Close preserves the native dirty guard and exact draft until explicit discard',async()=>{
  await render();const text='Retain this exact unsaved native wording.';await editNativeImplementation(text);
  expect([...host.querySelectorAll('button')].filter(element=>element.textContent==='Close')).toHaveLength(1);
  await clickNative(inlineClose());
  expect(document.body.textContent).toContain('Leave unsaved changes?');
  expect(onClose).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  await clickNative(nativeButton('Keep editing'));
  expect(host.querySelector('[aria-label="Current implementation"]').value).toBe(text);
  expect(native.implementation).toBe('Saved native implementation');
  await clickNative(inlineClose());await clickNative(nativeButton('Discard changes'));
  expect(onClose).toHaveBeenCalledTimes(1);expect(onClose).toHaveBeenCalledWith(false);
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('gated inline Close cannot dismiss or open discard while the native save is busy',async()=>{
  await render();const text='One pending native save.';await editNativeImplementation(text);
  const pending=deferred();api.patch.mockImplementationOnce(()=>pending.promise);
  await clickNative(nativeButton('Save assessment'));
  expect(api.patch).toHaveBeenCalledTimes(1);
  await clickNative(inlineClose());
  expect(onClose).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('Leave unsaved changes?');
  expect(host.querySelector('[aria-label="Current implementation"]').value).toBe(text);
  await act(async()=>{native={...native,implementation:text,last_saved:savedToken};pending.resolve({data:native});});
  await clickNative(inlineClose());
  expect(onClose).toHaveBeenCalledTimes(1);expect(onClose).toHaveBeenCalledWith(false);
  expect(api.patch).toHaveBeenCalledTimes(1);expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('a clean assessment with an unsaved child interview still uses the existing inline Close guard',async()=>{
  await render();expect(mockGuideProps.onDraftChange).toEqual(expect.any(Function));
  await act(async()=>mockGuideProps.onDraftChange(true));
  expect(host.querySelector('[aria-label="Current implementation"]').value).toBe(native.implementation);
  expect(host.querySelector('.brawndo-assessment-footer [role="status"]').textContent).not.toContain('Unsaved assessment changes');
  await clickNative(inlineClose());
  expect(document.body.textContent).toContain('Leave unsaved changes?');expect(onClose).not.toHaveBeenCalled();
  await clickNative(nativeButton('Keep editing'));
  await clickNative(inlineClose());expect(document.body.textContent).toContain('Leave unsaved changes?');
  await clickNative(nativeButton('Discard changes'));
  expect(onClose).toHaveBeenCalledTimes(1);expect(onClose).toHaveBeenCalledWith(false);
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
