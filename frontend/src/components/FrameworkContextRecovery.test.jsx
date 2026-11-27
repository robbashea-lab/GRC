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
    <textarea aria-label="Native implementation draft" disabled={!state.writable||state.busy||!state.ctx}
      value={state.form.implementation} onChange={event=>actions.put('implementation',event.target.value)}/>
    <button disabled={!state.writable||state.busy||!state.ctx} onClick={()=>actions.save()}>Native Save</button>
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
  expect(saved).toBe(true);expect(api.patch.mock.calls[0][2]).toEqual({assessmentAuthority:expect.any(Function)});
  expect(api.patch.mock.calls[0][2]).not.toHaveProperty('headers');
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


test('a temporarily unresolved record retains all assessment fields and unapplied context against its original service revision',async()=>{
  mockRealContext=true;
  const original=copy(native);
  await render({direct:true,url:'/reviews'});
  const editor=host.querySelector('[data-testid="actual-framework-controller"]');
  const edit=async(node,value)=>act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);
    node.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async()=>{
    mockActions.put('implementation','Retained implementation draft');
    mockActions.put('notes','Retained additional notes');
    mockActions.put('technology','Retained actual tools');
    mockActions.put('owner_id','synthetic-proposed-owner');
  });
  await edit(host.querySelector('[aria-label="Assessment setup notes"]'),'Unapplied recurring notes');
  const custom=host.querySelector('[aria-label="Client-specific interview tool"]');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(custom,'Unapplied client-specific tool');
    custom.dispatchEvent(new Event('input',{bubbles:true}));
  });
  const absent={...original,framework_assessment_id:AID+'-unresolved'};
  await render({direct:true,url:'/reviews',record:absent});
  expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBe(editor);
  expect(mockState.form).toMatchObject({implementation:'Retained implementation draft',notes:'Retained additional notes',technology:'Retained actual tools',owner_id:'synthetic-proposed-owner'});
  expect(button('Native Save').disabled).toBe(true);
  expect(api.patch).not.toHaveBeenCalled();
  contextVersion='different-server-service-revision';
  native={...native,implementation:'Concurrent server wording',last_saved:'concurrent-assessment-revision'};
  await render({direct:true,url:'/reviews',record:original});
  expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBe(editor);
  expect(mockState.form).toMatchObject({implementation:'Retained implementation draft',notes:'Retained additional notes',technology:'Retained actual tools',owner_id:'synthetic-proposed-owner',last_saved:'assessment-A'});
  expect(host.querySelector('[aria-label="Assessment setup notes"]').value).toBe('Unapplied recurring notes');
  expect(host.querySelector('[aria-label="Client-specific interview tool"]').value).toBe('Unapplied client-specific tool');
  expect(host.textContent).toContain('Saved service or activity context changed. Your draft is retained.');
  expect(button('Apply context to draft').disabled).toBe(true);
  expect(api.patch).not.toHaveBeenCalled();
});

test.each(['success','rejected'])('an ambiguous %s response across unresolved identity retains exact coordinated request and current retry sends its original key and revisions',async outcome=>{
  const original=copy(native);
  await render({direct:true,url:'/reviews'});await stage();
  const wire=deferred();api.patch.mockImplementationOnce(()=>wire.promise);
  let saving;await act(async()=>{saving=mockActions.save();});
  const first=api.patch.mock.calls[0],stored=retained();
  await render({direct:true,url:'/reviews',record:{...original,framework_assessment_id:AID+'-unresolved'}});
  await act(async()=>{
    if(outcome==='success')wire.resolve(confirm(first[1]));
    else wire.reject({response:{headers:{'x-create-rejected':'true'},data:{detail:'An ended epoch rejection'}}});
    await saving;
  });
  expect(retained()).toBe(stored);
  expect(onSaved).not.toHaveBeenCalled();
  await render({direct:true,url:'/reviews',record:original});
  expect(mockState.form.implementation).toBe('Exact accepted assessment A');
  expect(mockState.form.last_saved).toBe('assessment-A');
  expect(retry()).toBeTruthy();expect(retry().disabled).toBe(false);
  api.patch.mockRejectedValueOnce({response:{status:409,data:{detail:'Original assessment revision is stale'}}});
  await act(async()=>retry().click());
  const replay=api.patch.mock.calls.at(-1);
  expect(replay.slice(0,2)).toEqual(first.slice(0,2));
  expect(replay[2].headers['Idempotency-Key']).toBe(first[2].headers['Idempotency-Key']);
  expect(replay[1].expected_last_assessed).toBe('assessment-A');
  expect(replay[1].coordination).toEqual(coordination);
  expect(retained()).toBe(stored);
  expect(mockState.form.implementation).toBe('Exact accepted assessment A');
  expect(mockState.form.last_saved).toBe('assessment-A');
});

test('an actually verified different control uses native Keep editing or Discard before replacing the whole draft owner',async()=>{
  const original=copy(native);
  await render({direct:true,url:'/reviews'});await stage('Private original control draft');
  const other={...original,framework_assessment_id:'synthetic-other-assessment',definition_id:'CC1.2',implementation:'Other native control',last_saved:'other-assessment-A'};
  const priorGet=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,...args)=>{
    if(path==='/frameworks/soc-2')return {data:{...workspace(),assessments:[copy(native),copy(other)]}};
    return priorGet(path,...args);
  });
  await render({direct:true,url:'/reviews',record:other});
  expect(document.body.textContent).toContain('Leave unsaved changes?');
  expect(mockState.record.framework_assessment_id).toBe(AID);
  expect(mockState.form.implementation).toBe('Private original control draft');
  const action=name=>[...document.body.querySelectorAll('button')].find(node=>node.textContent===name);
  await act(async()=>action('Keep editing').click());
  expect(mockState.record.framework_assessment_id).toBe(AID);
  expect(mockState.form.implementation).toBe('Private original control draft');
  // A subsequent deliberate request (after the original identity is presented)
  // uses the same native leave guard; B never receives A's form or command.
  await render({direct:true,url:'/reviews',record:original});
  await render({direct:true,url:'/reviews',record:other});
  await act(async()=>action('Discard changes').click());
  expect(mockState.record.framework_assessment_id).toBe(other.framework_assessment_id);
  expect(mockState.form.implementation).toBe('Other native control');
  expect(mockState.form.last_saved).toBe('other-assessment-A');
  expect(api.patch).not.toHaveBeenCalled();
});

test.each([['user_id','replacement-actor',true],['role','client_readonly',false],['status','disabled',true]])('a security %s switch fences old callbacks and preserves only the same private draft owner',async(field,value,retire)=>{
  const originalUser=copy(mockAuth.user);
  await render({direct:true,url:'/reviews'});await stage('Private ended-owner wording');
  const old=host.querySelector('[data-testid="actual-framework-controller"]'),oldActions=mockActions;
  mockAuth={...mockAuth,user:{...mockAuth.user,[field]:value}};
  await render({direct:true,url:'/reviews'});
  if(retire){
    expect(host.querySelector('[data-testid="actual-framework-controller"]')).not.toBe(old);
    expect(mockState.form.implementation).toBe('Saved native assessment');
  }else{
    expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBe(old);
    expect(mockState.form.implementation).toBe('Private ended-owner wording');
    expect(mockState.writable).toBe(false);
    expect(host.querySelector('[aria-label="Native implementation draft"]').disabled).toBe(true);
    expect(button('Native Save').disabled).toBe(true);
  }
  expect(mockState.form.last_saved).toBe('assessment-A');
  await act(async()=>oldActions.save());
  expect(api.patch).not.toHaveBeenCalled();
  mockAuth={...mockAuth,user:originalUser};
  await render({direct:true,url:'/reviews'});
  expect(mockState.form.implementation).toBe(retire?'Saved native assessment':'Private ended-owner wording');
  expect(mockState.form.last_saved).toBe('assessment-A');
  await act(async()=>oldActions.save());
  expect(api.patch).not.toHaveBeenCalled();
});


test('an equivalent-permission ordinary receipt settles before fresh context reads without unlocking another Save or rebasing its original request',async()=>{
  await render({direct:true,url:'/reviews'});
  await act(async()=>mockActions.put('implementation','Ordinary accepted request before fresh reads'));
  const wire=deferred(),reads=deferred(),priorGet=api.get.getMockImplementation();
  api.patch.mockImplementationOnce(async(_path,body)=>{await wire.promise;return confirm(body);});
  let saving;await act(async()=>{saving=mockActions.save();});
  const original=api.patch.mock.calls[0];
  api.get.mockImplementation((path,...args)=>path==='/frameworks/soc-2'?reads.promise:priorGet(path,...args));
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'platform_admin'}};
  await render({direct:true,url:'/reviews'});
  expect(mockState.busy).toBe(true);
  expect(button('Native Save').disabled).toBe(true);
  await act(async()=>{wire.resolve();await saving;});
  expect(mockState.form.implementation).toBe('Ordinary accepted request before fresh reads');
  expect(mockState.form.last_saved).toBe('confirmed-assessment-A');
  expect(button('Native Save').disabled).toBe(true);
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(original[1].expected_last_assessed).toBe('assessment-A');
  expect(original[1]).not.toHaveProperty('coordination');
  expect(retained()).toBeNull();
  await act(async()=>reads.resolve({data:workspace()}));
  expect(mockState.busy).toBe(false);
  expect(button('Native Save').disabled).toBe(false);
  expect(mockState.form.implementation).toBe('Ordinary accepted request before fresh reads');
  expect(api.patch).toHaveBeenCalledTimes(1);
});

test('a precommit workspace bundle released after an ordinary receipt cannot replace the confirmed current assessment or its fresh guidance context',async()=>{
  native={...native,status:'not_assessed'};
  await render({direct:true,url:'/reviews'});
  await act(async()=>{
    mockActions.put('implementation','Ordinary confirmed wording survives stale joined reads');
    mockActions.put('status','in_progress');
  });
  const precommit=copy(workspace()),wire=deferred(),stale=deferred(),priorGet=api.get.getMockImplementation();
  expect(precommit.assessments[0]).toMatchObject({last_saved:'assessment-A',status:'not_assessed',implementation:'Saved native assessment'});
  api.patch.mockImplementationOnce(async(_path,body)=>{await wire.promise;return confirm(body);});
  let saving;await act(async()=>{saving=mockActions.save();});
  const original=copy(api.patch.mock.calls[0][1]);
  let holdRefresh=true;
  api.get.mockImplementation((path,...args)=>{
    if(path==='/frameworks/soc-2'&&holdRefresh)return stale.promise;
    return priorGet(path,...args);
  });
  const readsBeforeRefresh=api.get.mock.calls.length;
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'platform_admin'}};
  await render({direct:true,url:'/reviews'});
  const heldRead=api.get.mock.calls.slice(readsBeforeRefresh)
    .filter(([path,config])=>path==='/frameworks/soc-2'&&config?.signal&&!config.signal.aborted).at(-1);
  expect(heldRead).toBeTruthy();expect(heldRead[1].signal.aborted).toBe(false);
  expect(mockState.busy).toBe(true);expect(button('Native Save').disabled).toBe(true);
  const programReadsBeforeReceipt=api.get.mock.calls.filter(([path])=>path==='/frameworks/soc-2').length;
  holdRefresh=false;
  await act(async()=>{wire.resolve();await saving;});
  expect(api.get.mock.calls.filter(([path])=>path==='/frameworks/soc-2').length).toBeGreaterThan(programReadsBeforeReceipt);
  expect(heldRead[1].signal.aborted).toBe(true);
  const confirmed={implementation:'Ordinary confirmed wording survives stale joined reads',status:'in_progress',last_saved:'confirmed-assessment-A'};
  expect(mockState.form).toMatchObject(confirmed);
  expect(mockState.current).toMatchObject(confirmed);expect(mockState.ctx.current).toMatchObject(confirmed);
  await act(async()=>stale.resolve({data:precommit}));
  expect(mockState.form).toMatchObject(confirmed);
  expect(mockState.current).toMatchObject(confirmed);expect(mockState.ctx.current).toMatchObject(confirmed);
  expect(mockState.dirty).toBe(false);expect(mockState.busy).toBe(false);
  expect(button('Native Save').disabled).toBe(false);
  expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch.mock.calls[0][1]).toEqual(original);
  expect(original.expected_last_assessed).toBe('assessment-A');expect(original).not.toHaveProperty('coordination');
  expect(onSaved).toHaveBeenCalledTimes(1);expect(onNext).not.toHaveBeenCalled();expect(retained()).toBeNull();
});

test('a late guided Item receipt across an equivalent-role refresh retains newer wording and the original assessment and Item draft revisions',async()=>{
  const {socGuidedCatalog,socQuestionSet,validateSocCompletion}=jest.requireActual('@/lib/socGuidedAssessment');
  native={...native,items_revision:7,items_to_address:[],item_controls:{}};
  await render({direct:true,url:'/reviews'});
  const source={version:socGuidedCatalog.version,revision:2,generated_at:'2099-01-01T00:00:00.000Z'};
  const answers=Object.fromEntries(socQuestionSet('CC1.1',{},source.version).map(question=>[question.id,
    question.type==='text'?'Synthetic reported context':question.choices.includes('Not sure')?'Not sure':question.choices[0]]));
  expect(()=>validateSocCompletion('CC1.1',answers,source.version)).not.toThrow();
  const wording='Guided native wording A with original pending Item operations';
  let staged;await act(async()=>{staged=mockActions.stageGuidedImplementation(wording,'Saved native assessment',{
    ...source,client_id:CID,assessment_id:AID,actor_id:ACTOR,completed:true,narrative:wording,answers});});
  expect(staged).toBe(true);expect(mockState.guidedItemsDraft.length).toBeGreaterThan(0);
  const item=mockState.guidedItemsDraft[0],operation={operation:'resolve',target:{question_id:item.question_id,kind:item.kind},
    state:'resolved',resolution:'Exact pending Item resolution A'};
  let applied;await act(async()=>{applied=mockState.itemControls.onOperation(operation);});
  expect(applied).toBe(true);
  const proposedItems=copy(mockState.guidedItemsDraft),wire=deferred();
  api.patch.mockImplementationOnce(async(_path,body)=>{await wire.promise;return confirm(body);});
  let saving;await act(async()=>{saving=mockActions.saveAndNext();});
  expect(api.patch).toHaveBeenCalledTimes(1);
  const original=copy(api.patch.mock.calls[0][1]);
  expect(original).toEqual({implementation:wording,guided_assessment_source:source,expected_last_assessed:'assessment-A',
    item_draft:{expected_revision:7,operations:[operation]}});
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'platform_admin'}};
  await render({direct:true,url:'/reviews'});
  expect(mockState.busy).toBe(false);expect(button('Native Save').disabled).toBe(false);
  await act(async()=>mockActions.put('implementation','Newer native wording B after the guided request'));
  await act(async()=>{wire.resolve();await saving;});
  expect(mockState.form).toMatchObject({implementation:'Newer native wording B after the guided request',last_saved:'assessment-A'});
  expect(mockState.current).toMatchObject({implementation:'Saved native assessment',last_saved:'assessment-A'});
  expect(mockState.guidedItemsDraft).toEqual(proposedItems);
  expect(mockState.itemControls.operations).toEqual([operation]);expect(mockState.itemControls.answers).toEqual(answers);
  expect(mockState.dirty).toBe(true);expect(mockState.busy).toBe(false);
  expect(onSaved).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(retained()).toBeNull();
  let saved;await act(async()=>{saved=await mockActions.save();});
  expect(saved).toBe(false);expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch.mock.calls[0][1]).toEqual(original);expect(mockState.itemControls.operations).toEqual([operation]);
  expect(mockState.form.last_saved).toBe('assessment-A');
});

test('an alternate strict Save remains fenced when its unchanged saved guided source is omitted from the native payload',async()=>{
  const {socGuidedCatalog}=jest.requireActual('@/lib/socGuidedAssessment');
  const savedSource={version:socGuidedCatalog.version,revision:1,generated_at:'2098-12-01T00:00:00.000Z'};
  native={...native,guided_assessment_source:savedSource};
  await render({direct:true,url:'/reviews'});
  const alternate={...copy(mockState.form),implementation:'Alternate strict assessment A'},wire=deferred();
  api.patch.mockImplementationOnce(async(_path,body)=>{await wire.promise;return confirm(body);});
  let saving;await act(async()=>{saving=mockActions.save({assessment:alternate});});
  const original=copy(api.patch.mock.calls[0][1]);
  expect(original).toMatchObject({implementation:'Alternate strict assessment A',expected_last_assessed:'assessment-A'});
  expect(original).not.toHaveProperty('guided_assessment_source');expect(original).not.toHaveProperty('coordination');
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'platform_admin'}};
  await render({direct:true,url:'/reviews'});
  expect(mockState.busy).toBe(false);
  await act(async()=>mockActions.put('implementation','Newer alternate-path draft B'));
  await act(async()=>{wire.resolve();await saving;});
  expect(mockState.form).toMatchObject({implementation:'Newer alternate-path draft B',last_saved:'assessment-A'});
  expect(mockState.current).toMatchObject({implementation:'Saved native assessment',last_saved:'assessment-A',guided_assessment_source:savedSource});
  expect(mockState.dirty).toBe(true);expect(mockState.busy).toBe(false);
  expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch.mock.calls[0][1]).toEqual(original);
  expect(onSaved).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(retained()).toBeNull();
});

test('native Next discards the whole dirty assessment once before a controlled parent selects the next verified record',async()=>{
  const original=copy(native),other={...copy(native),framework_assessment_id:'synthetic-next-assessment',definition_id:'CC1.2',
    implementation:'Next verified native assessment B',last_saved:'next-assessment-B'};
  const priorGet=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/frameworks/soc-2'?Promise.resolve({data:{...workspace(),
    assessments:[copy(native),copy(other)]}}):priorGet(path,...args));
  function NextParent(){
    const [selected,setSelected]=React.useState(original);
    return <FrameworkDrawer open record={selected} clientId={CID} onSaved={onSaved} onOpenChange={()=>{}}
      onNext={()=>{onNext();setSelected(other);}}/>;
  }
  await act(async()=>root.render(<MemoryRouter initialEntries={['/reviews']}><OrgProvider><NextParent/><Probe/></OrgProvider></MemoryRouter>));
  await stage('Private unsaved native assessment A before Next');
  await act(async()=>mockActions.next());
  expect(onNext).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Leave unsaved changes?');
  const discard=[...document.body.querySelectorAll('button')].find(node=>node.textContent==='Discard changes');
  expect(discard).toBeTruthy();await act(async()=>discard.click());
  expect(onNext).toHaveBeenCalledTimes(1);expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  expect(mockState.record.framework_assessment_id).toBe(other.framework_assessment_id);
  expect(mockState.form).toMatchObject({implementation:'Next verified native assessment B',last_saved:'next-assessment-B'});
  expect(mockState.current).toMatchObject({framework_assessment_id:other.framework_assessment_id,implementation:'Next verified native assessment B'});
  expect(mockState.dirty).toBe(false);expect(mockContext.value).toBeNull();
  for(const method of ['patch','post','put','delete'])expect(api[method]).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test('native Next with a no-op parent leaves a clean latest saved assessment after whole-draft Discard',async()=>{
  await render({direct:true,url:'/reviews'});await stage('Private unsaved A before no-op Next');
  native={...native,implementation:'Latest reread native A',last_saved:'latest-native-A',status:'needs_attention'};
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'platform_admin'}};
  await render({direct:true,url:'/reviews'});
  expect(mockState.current).toMatchObject({implementation:'Latest reread native A',last_saved:'latest-native-A'});
  expect(mockState.form).toMatchObject({implementation:'Private unsaved A before no-op Next',last_saved:'assessment-A'});
  await act(async()=>mockActions.next());
  expect(onNext).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Leave unsaved changes?');
  await act(async()=>[...document.body.querySelectorAll('button')].find(node=>node.textContent==='Discard changes').click());
  expect(onNext).toHaveBeenCalledTimes(1);expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  const latest={implementation:'Latest reread native A',last_saved:'latest-native-A',status:'needs_attention'};
  expect(mockState.form).toMatchObject(latest);expect(mockState.current).toMatchObject(latest);
  expect(mockState.dirty).toBe(false);expect(mockContext.value).toBeNull();
  await act(async()=>mockActions.next());
  expect(onNext).toHaveBeenCalledTimes(2);expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  for(const method of ['patch','post','put','delete'])expect(api[method]).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test('whole-draft Discard uses a same-owner native refresh that settles after the Next prompt opens',async()=>{
  await render({direct:true,url:'/reviews'});await stage('Private A while Next awaits a decision');
  const editor=host.querySelector('[data-testid="actual-framework-controller"]');
  await act(async()=>mockActions.next());
  expect(document.body.textContent).toContain('Leave unsaved changes?');expect(onNext).not.toHaveBeenCalled();
  native={...native,implementation:'Latest A delivered while the leave prompt is open',last_saved:'latest-A-after-prompt',
    status:'needs_attention',technology:'Latest saved native tools',notes:'Latest saved native notes'};
  await act(async()=>mockActions.retry());
  const latest={implementation:'Latest A delivered while the leave prompt is open',last_saved:'latest-A-after-prompt',
    status:'needs_attention',technology:'Latest saved native tools',notes:'Latest saved native notes'};
  expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBe(editor);
  expect(mockState.current).toMatchObject(latest);expect(mockState.ctx.current).toMatchObject(latest);
  expect(mockState.form).toMatchObject({implementation:'Private A while Next awaits a decision',last_saved:'assessment-A'});
  expect(mockContext.value).toEqual(coordination);expect(mockState.dirty).toBe(true);
  expect(document.body.textContent).toContain('Leave unsaved changes?');expect(onNext).not.toHaveBeenCalled();
  await act(async()=>[...document.body.querySelectorAll('button')].find(node=>node.textContent==='Discard changes').click());
  expect(onNext).toHaveBeenCalledTimes(1);expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  expect(mockState.form).toMatchObject(latest);expect(mockState.current).toMatchObject(latest);
  expect(mockState.dirty).toBe(false);expect(mockContext.value).toBeNull();
  for(const method of ['patch','post','put','delete'])expect(api[method]).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test('a queued whole-draft Discard cannot reset private work after a same-actor readonly role round trip',async()=>{
  await render({direct:true,url:'/reviews'});await stage('Private A survives an ended leave confirmation');
  const editor=host.querySelector('[data-testid="actual-framework-controller"]');
  await act(async()=>mockActions.next());
  const capturedDiscard=[...document.body.querySelectorAll('button')].find(node=>node.textContent==='Discard changes');
  expect(capturedDiscard).toBeTruthy();expect(onNext).not.toHaveBeenCalled();
  const originalUser=copy(mockAuth.user),draft=copy(mockState.form);
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_readonly'}};
  await render({direct:true,url:'/reviews'});
  expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBe(editor);
  expect(mockState.form).toEqual(draft);expect(mockState.writable).toBe(false);
  mockAuth={...mockAuth,user:originalUser};
  await render({direct:true,url:'/reviews'});
  expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBe(editor);
  expect(mockState.form).toEqual(draft);expect(mockState.writable).toBe(true);
  expect(capturedDiscard.isConnected).toBe(true);
  await act(async()=>capturedDiscard.click());
  expect(host.querySelector('[data-testid="actual-framework-controller"]')).toBe(editor);
  expect(mockState.form).toEqual(draft);expect(mockState.form.last_saved).toBe('assessment-A');
  expect(mockContext.value).toEqual(coordination);expect(mockState.dirty).toBe(true);
  expect(onNext).not.toHaveBeenCalled();expect(onSaved).not.toHaveBeenCalled();
  for(const method of ['patch','post','put','delete'])expect(api[method]).not.toHaveBeenCalled();
});
