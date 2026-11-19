import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
import {OrgProvider,useOrg} from '@/context/OrgContext';
import {ComplianceProvider} from '@/context/ComplianceContext';
import ComplianceWorkspace from '@/pages/ComplianceWorkspace';
import FrameworkDrawer from './FrameworkDrawer';
import {clearPendingCommands,createIntent,syncPendingCommandIdentity} from '@/lib/createIntent';
import {frameworkContextScope} from '@/lib/frameworkContextIntent';
import {frameworkCatalog,FRAMEWORKS} from '@/lib/frameworks';
import api from '@/lib/api';

let mockAuth,mockState,mockActions,mockContext,mockRealContext;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:false,
  default:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),put:jest.fn(),delete:jest.fn()},
  formatError:error=>typeof error?.response?.data?.detail==='string'?error.response.data.detail:error.message}));
// Keep the actual controller, command hook, native router and both context providers.
// These presentation boundaries expose controller state without a second assessment implementation.
jest.mock('./BrawndoCisSafeguard',()=>props=>mockEditor(props));
jest.mock('./PrestigeSocAssessment',()=>props=>mockEditor(props));
jest.mock('./FrameworkAssessmentWorkspace',()=>props=>mockEditor(props));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./R4AssessmentContext',()=>props=>{
  if(mockRealContext){const Actual=jest.requireActual('./R4AssessmentContext').default;return <Actual {...props}/>;}
  mockContext=props;return <span>Native staged context</span>;
});

function mockEditor({state,actions}){
  mockState=state;mockActions=actions;
  return <section data-testid="actual-framework-controller">{state.contextEditor}
    <textarea aria-label="Native implementation draft" disabled={!state.writable||state.busy}
      value={state.form.implementation} onChange={event=>actions.put('implementation',event.target.value)}/>
    <button disabled={!state.writable||state.busy} onClick={()=>actions.save()}>Native Save</button>
    <button onClick={actions.close}>Native Close</button>
    {state.error&&<p role="alert">{state.error}</p>}<p>{state.feedback}</p>
  </section>;
}

const CID='synthetic-context-client',AID='synthetic-context-assessment',ACTOR='synthetic-context-owner';
const coordination={activity_id:'synthetic-activity',review_id:'synthetic-review',expected_updated_at:'review-A',
  expected_client_updated_at:'client-A',recurring_ticket_number:'42001'};
const identity=(overrides={})=>({mode:'standard',actorId:ACTOR,clientId:CID,frameworkKey:'soc-2',assessmentId:AID,...overrides});
const canonical=(overrides={})=>{
  const value=identity(overrides);
  return `/compliance/${value.frameworkKey}?client_id=${value.clientId}&assessment=${value.assessmentId}`;
};
const requestBody=()=>({implementation:'Exact accepted assessment A',status:'in_progress',expected_last_assessed:'assessment-A',coordination:{...coordination}});
const copy=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const securityError=status=>({response:{status,data:{detail:'Synthetic current authorization refused'}}});
let root,host,native,org,navigate,location,readBlock,mount=0,onSaved,onNext,contextVersion,contextNotes;
const button=name=>[...host.querySelectorAll('button')].find(node=>node.textContent===name);
const retry=()=>button('Retry unconfirmed assessment save');
function Probe(){org=useOrg();navigate=useNavigate();location=useLocation();return null;}
function workspace(){
  const definition=frameworkCatalog('soc-2').requirements.find(item=>item.id==='CC1.1');
  return {framework:FRAMEWORKS.find(item=>item.key==='soc-2'),selected:true,configured:true,
    definitions:[definition],assessments:[copy(native)],active_definition_ids:[definition.id],
    configuration:{categories:['security']},organizational_controls:[],guided_assessment_drafts:{},work:{}};
}
function confirm(body){
  const {expected_last_assessed,coordination:context,...fields}=body;
  native={...native,...fields,last_saved:'confirmed-assessment-A'};
  if(context){contextVersion='confirmed-context-A';contextNotes=context.notes||'';}
  readBlock={};
  return {data:copy(native)};
}
async function render({url=canonical(),direct=false,fresh=false,record=native,drawerKey='direct'}={}){
  if(fresh)mount++;
  await act(async()=>root.render(<MemoryRouter key={mount} initialEntries={[url]}><OrgProvider>
    {direct?<FrameworkDrawer key={drawerKey} open record={record} clientId={record.client_id}
      onSaved={onSaved} onNext={onNext} onOpenChange={()=>{}}/>:
      <ComplianceProvider><Routes><Route path="/compliance/:requirementKey" element={<ComplianceWorkspace/>}/>
        <Route path="/elsewhere" element={<p>Other native destination</p>}/></Routes></ComplianceProvider>}
    <Probe/>
  </OrgProvider></MemoryRouter>));
}
async function seed(body=requestBody(),scope=identity(),path='/framework_assessments/'+AID){
  api.patch.mockRejectedValueOnce(new Error('Synthetic accepted response A lost'));
  await expect(createIntent(api.patch,frameworkContextScope(scope))(path,body)).rejects.toThrow('response A lost');
  return api.patch.mock.calls.at(-1);
}
const retained=scope=>sessionStorage.getItem('grc_pending_command_v1:'+frameworkContextScope(scope||identity()));
async function stage(text='Exact accepted assessment A'){
  await act(async()=>{mockActions.put('implementation',text);mockContext.onApply({...coordination});});
}

beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();clearPendingCommands();
  mockAuth={user:{user_id:ACTOR,role:'super_admin',status:'active',client_ids:[CID]},workspaceMode:'standard',loading:false};
  syncPendingCommandIdentity(ACTOR,'standard');localStorage.setItem('grc_client_id',CID);
  native={client_id:CID,framework_key:'soc-2',framework_assessment_id:AID,definition_id:'CC1.1',
    title:'Synthetic native criterion',status:'in_progress',implementation:'Saved native assessment',
    owner_id:ACTOR,last_saved:'assessment-A',verification:'not_verified',soc_assessment_checks:[],assessment_history:[]};
  readBlock={};mockState=null;mockActions=null;mockContext=null;mockRealContext=false;onSaved=jest.fn();onNext=jest.fn();
  contextVersion='context-A';contextNotes='Saved setup notes';
  for(const method of ['get','patch','post','put','delete'])api[method].mockReset();
  api.get.mockImplementation(async path=>{
    if(path==='/clients'){
      if(readBlock.client)throw {response:{status:409,data:{detail:{code:'SHARED_CONTEXT_RECOVERY_REQUIRED',
        client_ids:[CID],message:'The original shared save needs recovery.'}}}};
      return {data:[{client_id:CID,name:'Verified synthetic client',status:'active'}]};
    }
    if(path==='/onboarding/baseline'){
      if(readBlock.baseline)throw new Error('Synthetic baseline needs recovery');
      return {data:{state:{completed:true}}};
    }
    if(path==='/requirements')return {data:[{client_id:CID,baseline_key:'soc-2',baseline_response:'applies'}]};
    if(path==='/frameworks/soc-2'){
      if(readBlock.program)throw new Error('Synthetic program needs recovery');
      return {data:workspace()};
    }
    if(path.startsWith('/frameworks/'))throw new Error('Synthetic other program unavailable');
    if(path.endsWith('/service-context'))return {data:{client_id:CID,expected_client_updated_at:contextVersion,
      selected_activity_id:'synthetic-activity',services:{areas:{endpoint:{responsibility:'iv',tool_ids:[]}},custom_tools:[]},catalog:[],
      candidates:[{activity_id:'synthetic-activity',review_id:'synthetic-review',title:'Actual recurring activity',area_id:'endpoint',
        expected_updated_at:contextVersion,cadence:'annual',first_next_due:'2099-01-01',setup:{notes:contextNotes,no_ticket:false}}]}};
    if(path.endsWith('/related'))return {data:{reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]}};
    return {data:[]};
  });
  api.patch.mockImplementation(async(_path,body)=>confirm(body));
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();clearPendingCommands();});

test('mounted uncertainty retains exact A, refuses ordinary B, and explicit Retry preserves B and native Cancel',async()=>{
  await render({direct:true,url:'/reviews'});await stage();
  api.patch.mockRejectedValueOnce(new Error('Synthetic accepted response A lost'));
  let saved;await act(async()=>{saved=await mockActions.save();});
  expect(saved).toBe(false);expect(retry()).toBeTruthy();
  const original=api.patch.mock.calls[0],stored=retained();
  expect(JSON.parse(stored).snapshot).toBe(JSON.stringify(original.slice(0,2)));
  const recoveryLink=new URL(host.querySelector('a').href);
  expect(recoveryLink.pathname).toBe('/compliance/soc-2');
  expect(recoveryLink.searchParams.get('client_id')).toBe(CID);expect(recoveryLink.searchParams.get('assessment')).toBe(AID);
  await act(async()=>mockActions.put('implementation','Newer unsaved B'));
  await act(async()=>{saved=await mockActions.save();});
  expect(saved).toBe(false);expect(api.patch).toHaveBeenCalledTimes(1);expect(retained()).toBe(stored);
  await act(async()=>retry().click());
  expect(api.patch.mock.calls[1]).toEqual(original);expect(retained()).toBeNull();
  expect(mockState.form.implementation).toBe('Newer unsaved B');expect(mockState.dirty).toBe(true);
  expect(mockState.current.implementation).toBe('Exact accepted assessment A');
  expect(mockState.form.last_saved).toBe('confirmed-assessment-A');expect(onNext).not.toHaveBeenCalled();
  await act(async()=>mockActions.close());expect(document.body.textContent).toContain('Leave unsaved changes?');
  await act(async()=>[...document.body.querySelectorAll('button')].find(node=>node.textContent==='Keep editing').click());
  expect(mockState.form.implementation).toBe('Newer unsaved B');expect(api.patch).toHaveBeenCalledTimes(2);
});

test('a queued native proposal cannot advance Save & next over newer B after a late A acknowledgment',async()=>{
  await render({direct:true,url:'/reviews'});await stage();
  const pending=deferred();api.patch.mockImplementationOnce(async(_path,body)=>{await pending.promise;return confirm(body);});
  let saving;await act(async()=>{saving=mockActions.saveAndNext();});
  // Exercise a queued proposal callback arriving after Save started, independent of disabled controls.
  await act(async()=>mockActions.put('implementation','Queued newer B'));
  await act(async()=>{pending.resolve();await saving;});
  expect(onNext).not.toHaveBeenCalled();expect(mockState.dirty).toBe(true);
  expect(mockState.form.implementation).toBe('Queued newer B');
  expect(api.patch).toHaveBeenCalledTimes(1);
});

test('the real context editor locks every business trigger through uncertainty and reloads authoritative tokens after A',async()=>{
  mockRealContext=true;await render({direct:true,url:'/reviews'});
  const context=()=>host.querySelector('[aria-label="Services and recurring activity"]');
  const fields=()=>[...context().querySelectorAll('input,select,textarea,button')];
  const edit=async(node,value)=>act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);
    node.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async()=>mockActions.put('implementation','Exact accepted assessment A'));
  await edit(context().querySelector('[aria-label="Assessment setup notes"]'),'Explicit setup A');
  await act(async()=>button('Apply context to draft').click());
  const pending=deferred();api.patch.mockImplementationOnce(()=>pending.promise);
  let saving;await act(async()=>{saving=mockActions.save();});
  expect(fields().length).toBeGreaterThan(10);for(const field of fields())expect(field.matches(':disabled')).toBe(true);
  await act(async()=>{pending.reject(new Error('Synthetic accepted response A lost'));await saving;});
  const original=api.patch.mock.calls[0];
  for(const field of fields())expect(field.matches(':disabled')).toBe(true);
  expect(retry().disabled).toBe(false);
  await edit(host.querySelector('[aria-label="Native implementation draft"]'),'Native assessment B remains editable');
  await act(async()=>retry().click());
  expect(api.patch.mock.calls[1]).toEqual(original);expect(retained()).toBeNull();
  for(const field of fields())if(!field.textContent.includes('Add to draft'))expect(field.matches(':disabled')).toBe(false);
  expect(context().querySelector('[aria-label="Assessment setup notes"]').value).toBe('Explicit setup A');
  expect(mockState.form.implementation).toBe('Native assessment B remains editable');
  await edit(context().querySelector('[aria-label="Assessment setup notes"]'),'Explicit later setup B');
  await act(async()=>button('Apply context to draft').click());
  expect(api.patch).toHaveBeenCalledTimes(2);
  await act(async()=>mockActions.save());
  expect(api.patch.mock.calls[2][1]).toMatchObject({expected_last_assessed:'confirmed-assessment-A',
    implementation:'Native assessment B remains editable',coordination:{notes:'Explicit later setup B',
      expected_client_updated_at:'confirmed-context-A',expected_updated_at:'confirmed-context-A'}});
  expect(api.patch.mock.calls[2][2].headers['Idempotency-Key']).not.toBe(original[2].headers['Idempotency-Key']);
});

test('ordinary noncoordinated PATCH remains direct and creates no persistent context command',async()=>{
  await render({direct:true,url:'/reviews'});
  await act(async()=>mockActions.put('implementation','Ordinary native save'));
  let saved;await act(async()=>{saved=await mockActions.save();});
  expect(saved).toBe(true);expect(api.patch.mock.calls[0][2]).toBeUndefined();
  expect(api.patch.mock.calls[0][1]).not.toHaveProperty('coordination');expect(retained()).toBeNull();
  expect(mockState.dirty).toBe(false);expect(mockState.form.implementation).toBe('Ordinary native save');
});

test('a role refresh does not unlock an ordinary native PATCH while its original request is still pending',async()=>{
  await render({direct:true,url:'/reviews'});
  await act(async()=>mockActions.put('implementation','Ordinary native request A'));
  const pending=deferred();api.patch.mockImplementationOnce(async(_path,body)=>{await pending.promise;return confirm(body);});
  let saving;await act(async()=>{saving=mockActions.save();});
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'platform_admin'}};
  await render({direct:true,url:'/reviews'});
  expect(mockState.busy).toBe(true);expect(host.querySelector('[aria-label="Native implementation draft"]').disabled).toBe(true);
  expect(retained()).toBeNull();await act(async()=>{pending.resolve();await saving;});
  expect(mockState.form.implementation).toBe('Ordinary native request A');expect(mockState.busy).toBe(false);
});

test.each(['client','baseline','program'])('reload exposes only exact explicit recovery before the blocked %s read',async blocked=>{
  const original=await seed();readBlock[blocked]=true;
  await render({fresh:true});
  expect(retry()).toBeTruthy();expect(retry().disabled).toBe(false);expect(api.patch).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBeNull();
  expect(host.textContent).not.toContain('Exact accepted assessment A');
  if(blocked==='client'){expect(org.currentClient).toBeNull();expect(org.currentClientId).toBe('');expect(org.recoveryClientId).toBe(CID);}
  await act(async()=>retry().click());
  expect(api.patch.mock.calls[1]).toEqual(original);expect(retained()).toBeNull();expect(org.currentClientId).toBe(CID);
  expect(org.currentClient.name).toBe('Verified synthetic client');
  expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBeTruthy();
  expect(mockState.current.implementation).toBe('Exact accepted assessment A');
});

test.each(['assessment','framework','client','actor','mode','read-only'])('a different %s cannot dispatch the retained command',async mismatch=>{
  await seed();const stored=retained();let url=canonical();readBlock.program=true;
  if(mismatch==='assessment')url=canonical({assessmentId:'other-assessment'});
  if(mismatch==='framework')url=canonical({frameworkKey:'iso-27001'});
  if(mismatch==='client')url=canonical({clientId:'foreign'});
  if(mismatch==='actor')mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'another-actor'}};
  if(mismatch==='mode')mockAuth={...mockAuth,workspaceMode:'demo'};
  if(mismatch==='read-only')mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_readonly'}};
  await render({fresh:true,url});
  expect(retry()).toBeUndefined();expect(api.patch).toHaveBeenCalledTimes(1);expect(retained()).toBe(stored);
  expect(host.textContent).not.toContain('Exact accepted assessment A');
});

test.each(['path','coordination','version','client-id'])('invalid retained %s is neither reconstructed nor retried',async mismatch=>{
  const body=requestBody();let path='/framework_assessments/'+AID;
  if(mismatch==='path')path='/framework_assessments/other-assessment';
  if(mismatch==='coordination')delete body.coordination;
  if(mismatch==='version')delete body.expected_last_assessed;
  if(mismatch==='client-id')body.client_id='foreign';
  await seed(body,identity(),path);const stored=retained();readBlock.baseline=true;
  await render({fresh:true});expect(retry()).toBeUndefined();expect(api.patch).toHaveBeenCalledTimes(1);expect(retained()).toBe(stored);
});

test('wrong acknowledgment and current authorization denial keep exact recovery available',async()=>{
  const original=await seed();const stored=retained();readBlock.client=true;
  await render({fresh:true});
  api.patch.mockResolvedValueOnce({data:{...native,client_id:'foreign'}});
  await act(async()=>retry().click());
  expect(host.textContent).toContain('could not be verified');expect(retained()).toBe(stored);
  api.patch.mockRejectedValueOnce(securityError(403));await act(async()=>retry().click());
  expect(host.textContent).toContain('current authorization refused');expect(retained()).toBe(stored);
  expect(org.currentClient).toBeNull();expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBeNull();
  await act(async()=>retry().click());
  for(const call of api.patch.mock.calls.slice(1))expect(call).toEqual(original);
  expect(retained()).toBeNull();
});

test('an assigned contributor can explicitly recover an unchanged assessment-only plan subject to server authorization',async()=>{
  const body={...requestBody(),coordination:{expected_client_updated_at:'client-A'}};
  const original=await seed(body);mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_contributor'}};
  readBlock.program=true;await render({fresh:true});expect(retry()).toBeTruthy();
  await act(async()=>retry().click());expect(api.patch.mock.calls[1]).toEqual(original);expect(retained()).toBeNull();
  expect(mockState.current.owner_id).toBe(ACTOR);
});

test('exact URL selection never consumes another assessment intent or automatically retries on navigation',async()=>{
  const original=await seed();const other=identity({assessmentId:'another-retained-assessment'});
  await seed({...requestBody(),implementation:'Another exact retained command'},other,'/framework_assessments/'+other.assessmentId);
  const otherStored=retained(other);readBlock.program=true;await render({fresh:true});
  expect(api.patch).toHaveBeenCalledTimes(2);
  await act(async()=>navigate('/elsewhere'));expect(retry()).toBeUndefined();
  await act(async()=>navigate(canonical()));expect(retry()).toBeTruthy();expect(api.patch).toHaveBeenCalledTimes(2);
  await act(async()=>retry().click());expect(api.patch.mock.calls[2]).toEqual(original);
  expect(retained()).toBeNull();expect(retained(other)).toBe(otherStored);
});

test('a receipt for an unmounted coordinated editor cannot consume the replacement draft or invoke its saved callback',async()=>{
  await render({direct:true,url:'/reviews'});await stage();
  const pending=deferred();api.patch.mockImplementationOnce(async(_path,body)=>{await pending.promise;return confirm(body);});
  let saving;await act(async()=>{saving=mockActions.save();});
  const replacement={...native,framework_assessment_id:'replacement-assessment',definition_id:'CC1.2',implementation:'Replacement saved row'};
  await render({direct:true,url:'/reviews',record:replacement,drawerKey:'replacement'});
  await act(async()=>mockActions.put('implementation','Replacement unsaved B'));
  await act(async()=>{pending.resolve();await saving;});
  expect(mockState.form.implementation).toBe('Replacement unsaved B');expect(mockState.error).toBe('');
  expect(onSaved).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();
});

test('a same-instance authority change releases the old busy state without consuming a newer draft',async()=>{
  await render({direct:true,url:'/reviews'});await stage();
  const pending=deferred();api.patch.mockImplementationOnce(async(_path,body)=>{await pending.promise;return confirm(body);});
  let saving;await act(async()=>{saving=mockActions.save();});expect(mockState.busy).toBe(true);
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'platform_admin'}};
  await render({direct:true,url:'/reviews'});expect(mockState.busy).toBe(false);
  expect(host.querySelector('[aria-label="Native implementation draft"]').disabled).toBe(false);
  await act(async()=>mockActions.put('implementation','New authority draft B'));
  await act(async()=>{pending.resolve();await saving;});
  expect(mockState.form.implementation).toBe('New authority draft B');expect(mockState.busy).toBe(false);
  expect(mockState.error).toBe('');expect(onSaved).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();
});

test('the actual FrameworkDrawer suppresses evidence bytes delivered after its owner unmounts',async()=>{
  const pending=deferred(),get=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/evidence/synthetic-file/download'?pending.promise:get(path,...args));
  URL.createObjectURL=jest.fn();URL.revokeObjectURL=jest.fn();
  const click=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  await render({direct:true,url:'/reviews'});let downloading;
  await act(async()=>{downloading=mockActions.download({evidence_id:'synthetic-file'});});
  const options=api.get.mock.calls.find(([path])=>path==='/evidence/synthetic-file/download')[1];
  await act(async()=>root.render(<p>Closed native drawer</p>));expect(options.signal.aborted).toBe(true);
  await act(async()=>{pending.resolve({data:{content_base64:'AAECAw==',filename:'synthetic.bin'}});await downloading;});
  expect(URL.createObjectURL).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();
});
