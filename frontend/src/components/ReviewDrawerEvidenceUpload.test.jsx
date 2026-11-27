import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import {readEvidenceFile} from '@/lib/evidenceFile';
import {ids,readStore,saveStore} from '@/preview/store';
import {rememberClient} from '@/lib/clientSelection';
import {toast} from 'sonner';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message,API:'/api'}));
jest.mock('@/lib/evidenceFile',()=>({readEvidenceFile:jest.fn()}));
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=>require('crypto').randomUUID()}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
// Keep the actual owning Drawer, upload request and native Demo storage. The panel's
// own catalog/file validation is covered separately; this fixture observes its refresh signal.
jest.mock('./EvidencePanel',()=>({__esModule:true,default:({renderHeader,refreshKey})=><section data-testid="upload-panel" data-refresh={refreshKey}>{renderHeader?.(null)}</section>}));
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{configurable:true,value:require('crypto').webcrypto}));
const originalScroll=Element.prototype.scrollIntoView;
beforeAll(()=>{if(!originalScroll)Element.prototype.scrollIntoView=jest.fn();});
afterAll(()=>{if(!originalScroll)delete Element.prototype.scrollIntoView;});

const cid='synthetic-review-upload-client';
const content='data:text/plain;base64,U1lOVEhFVElDIGV2aWRlbmNlIGJ5dGVz';
const node=id=>document.querySelector(`[data-testid="${id}"]`);
const file=name=>new File(['SYNTHETIC evidence bytes'],name,{type:'text/plain'});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
let root,host,review,onSaved,nativePost,nativeGet,post,get,reads;
async function render(props={}){
  const start=reads.length;
  await act(async()=>root.render(<ReviewDrawer open record={review} clientId={cid} onOpenChange={()=>{}} onSaved={onSaved} {...props}/>));
  await act(async()=>{await Promise.allSettled(reads.slice(start));});
}
function choose(files){
  const input=node('drawer-evidence-input');expect(input).toBeTruthy();expect(input.disabled).toBe(false);
  Object.defineProperty(input,'files',{configurable:true,value:files});
  input.dispatchEvent(new Event('change',{bubbles:true}));
}
function feedback(){
  const done=deferred();toast.success.mockImplementation(value=>done.resolve({type:'success',value}));
  toast.error.mockImplementation(value=>done.resolve({type:'error',value}));return done.promise;
}
async function upload(files){const done=feedback();let result;await act(async()=>{choose(files);result=await done;});return result;}
async function note(value){await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node('field-notes'),value);
  node('field-notes').dispatchEvent(new Event('input',{bubbles:true}));
});}
async function evidenceTab(){await act(async()=>node('tab-evidence').click());}
const evidence=()=>readStore().evidence;
const uploadCalls=()=>post.mock.calls.filter(([path])=>path==='/evidence');
function replaceOwner(mode){
  if(mode==='actor')mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'synthetic-replacement-actor'}};
  if(mode==='mode')mockAuth={...mockAuth,workspaceMode:'standard',user:{...mockAuth.user,workspace_mode:'standard'}};
  if(mode==='client')mockOrg={...mockOrg,currentClientId:'synthetic-replacement-client',currentClient:{client_id:'synthetic-replacement-client',name:'SYNTHETIC replacement client',status:'active'}};
}
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();
  const db=Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]]));
  db.clients=[{client_id:cid,name:'SYNTHETIC upload client',status:'active'}];
  db.user={user_id:'synthetic-upload-admin',name:'Synthetic operator',email:'operator@example.test',role:'platform_admin',status:'active',workspace_mode:'demo',client_ids:[cid]};
  db.users=[db.user];Object.assign(db,{logs:[],notifications:[],drafts:{},baselines:{}});saveStore(db,{resetFiles:true});
  mockAuth={user:(await api.post('/demo/enter')).data.user,workspaceMode:'demo',error:''};
  rememberClient(cid);window.history.replaceState({},'',`/reviews?client_id=${cid}`);
  const clients=(await api.get('/clients')).data;mockOrg={currentClientId:cid,currentClient:clients[0],clients,loading:false,error:''};
  review=(await api.post('/reviews',{client_id:cid,title:'SYNTHETIC upload Review',review_type:'access',recurrence:'annual',due_date:'2027-11-19'})).data;
  nativePost=api.post.bind(api);nativeGet=api.get.bind(api);reads=[];
  post=jest.spyOn(api,'post');get=jest.spyOn(api,'get').mockImplementation((...args)=>{const response=nativeGet(...args);reads.push(response);return response;});
  readEvidenceFile.mockResolvedValue(content);onSaved=jest.fn();
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  await render();await evidenceTab();post.mockClear();get.mockClear();toast.error.mockReset();toast.success.mockReset();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();jest.clearAllMocks();readEvidenceFile.mockReset();});

test('an empty FileList is a no-op and never reports a successful upload or reload',async()=>{
  const before=JSON.stringify(readStore()),refresh=node('upload-panel').dataset.refresh;
  await act(async()=>choose([]));
  expect(readEvidenceFile).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();expect(toast.error).not.toHaveBeenCalled();
  expect(JSON.stringify(readStore())).toBe(before);expect(node('upload-panel').dataset.refresh).toBe(refresh);
});

test('confirmed sequential uploads use the exact current occurrence and retain an unsaved native note',async()=>{
  await act(async()=>node('tab-overview').click());await note('SYNTHETIC unsaved note — café Ω');await evidenceTab();
  const files=[file('résultat Ω.txt'),file('second.txt')],refresh=Number(node('upload-panel').dataset.refresh);
  expect(await upload(files)).toEqual({type:'success',value:'Evidence attached'});
  expect(uploadCalls().map(([,body])=>body)).toEqual(files.map(item=>({client_id:cid,linked_type:'review',linked_id:review.review_id,
    occurrence_id:review.current_occurrence_id,filename:item.name,mime_type:'text/plain',content_base64:content})));
  expect(readEvidenceFile.mock.calls.map(([item])=>item)).toEqual(files);
  // Native storage prepends accepted files; request order is asserted above.
  const byFilename=(left,right)=>left[0].localeCompare(right[0]);
  expect(evidence().map(item=>[item.filename,item.linked_id,item.occurrence_id]).sort(byFilename)).toEqual(files.map(item=>[item.name,review.review_id,review.current_occurrence_id]).sort(byFilename));
  expect(Number(node('upload-panel').dataset.refresh)).toBe(refresh+1);expect(toast.error).not.toHaveBeenCalled();expect(onSaved).not.toHaveBeenCalled();
  await act(async()=>node('tab-overview').click());expect(node('field-notes').value).toBe('SYNTHETIC unsaved note — café Ω');
  expect(readStore().reviews[0].notes||'').toBe('');
});

test('a lost later response reports only acknowledged files, preserves accepted bytes and never retries the upload',async()=>{
  post.mockImplementationOnce((...args)=>nativePost(...args)).mockImplementationOnce(async(...args)=>{
    await nativePost(...args);throw new Error('SYNTHETIC upload response was lost');
  });
  const result=await upload([file('first.txt'),file('uncertain.txt'),file('never-sent.txt')]);
  expect(result.type).toBe('error');expect(result.value).toContain('1 file uploaded. The remaining upload could not be confirmed.');
  expect(result.value).toContain('Check this occurrence’s Evidence list before uploading again.');
  expect(result.value).toContain('SYNTHETIC upload response was lost');
  expect(uploadCalls()).toHaveLength(2);expect(readEvidenceFile).toHaveBeenCalledTimes(2);
  expect(evidence().map(item=>item.filename).sort()).toEqual(['first.txt','uncertain.txt']);
  expect(get).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();expect(onSaved).not.toHaveBeenCalled();
});

test('confirmed files remain saved when the occurrence refresh fails, with explicit refresh feedback instead of success',async()=>{
  const refresh=node('upload-panel').dataset.refresh;
  get.mockImplementation((path,...args)=>path.endsWith('/history')?Promise.reject(new Error('SYNTHETIC occurrence read unavailable')):nativeGet(path,...args));
  const result=await upload([file('confirmed.txt')]);
  expect(result.type).toBe('error');expect(result.value).toContain('1 file uploaded, but this occurrence’s Evidence list could not be refreshed.');
  expect(result.value).toContain('Check the list before uploading again.');expect(result.value).toContain('SYNTHETIC occurrence read unavailable');
  expect(evidence().map(item=>item.filename)).toEqual(['confirmed.txt']);expect(uploadCalls()).toHaveLength(1);
  expect(node('upload-panel').dataset.refresh).toBe(refresh);expect(toast.error).toHaveBeenCalledTimes(1);expect(toast.success).not.toHaveBeenCalled();
});

test('a file read failure sends no upload and gives no false success',async()=>{
  readEvidenceFile.mockRejectedValueOnce(new Error('SYNTHETIC file read failed'));
  const before=JSON.stringify(readStore()),result=await upload([file('unreadable.txt')]);
  expect(result.type).toBe('error');expect(result.value).toContain('SYNTHETIC file read failed');expect(result.value).not.toContain('file uploaded.');
  expect(post).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();expect(JSON.stringify(readStore())).toBe(before);
});

test.each(['actor','mode','client','unmount'])('a file read finishing after %s ownership ends cannot dispatch an upload',async mode=>{
  const read=deferred();readEvidenceFile.mockReturnValueOnce(read.promise);
  await act(async()=>choose([file('late-read.txt')]));expect(readEvidenceFile).toHaveBeenCalledTimes(1);
  if(mode==='unmount')await act(async()=>root.render(<div>Closed synthetic Review</div>));
  else{replaceOwner(mode);await render();}
  const before=JSON.stringify(readStore()),gets=get.mock.calls.length,errors=toast.error.mock.calls.length;
  await act(async()=>{read.resolve(content);await read.promise;});
  expect(uploadCalls()).toHaveLength(0);expect(get).toHaveBeenCalledTimes(gets);expect(toast.error).toHaveBeenCalledTimes(errors);
  expect(toast.success).not.toHaveBeenCalled();expect(JSON.stringify(readStore())).toBe(before);expect(onSaved).not.toHaveBeenCalled();
});

test.each(['actor','client','unmount'])('an upload acknowledgment after %s ownership ends cannot send the next file or publish old success',async mode=>{
  const receipt=deferred(),saved=deferred();
  post.mockImplementationOnce(async(...args)=>{const response=await nativePost(...args);saved.resolve();await receipt.promise;return response;});
  await act(async()=>{choose([file('already-dispatched.txt'),file('never-dispatched.txt')]);await saved.promise;});
  expect(evidence().map(item=>item.filename)).toEqual(['already-dispatched.txt']);
  if(mode==='unmount')await act(async()=>root.render(<div>Closed synthetic Review</div>));
  else{replaceOwner(mode);await render();}
  const before=JSON.stringify(readStore()),gets=get.mock.calls.length,errors=toast.error.mock.calls.length;
  await act(async()=>receipt.resolve());
  expect(uploadCalls()).toHaveLength(1);expect(readEvidenceFile).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledTimes(gets);expect(toast.error).toHaveBeenCalledTimes(errors);expect(toast.success).not.toHaveBeenCalled();
  expect(JSON.stringify(readStore())).toBe(before);expect(onSaved).not.toHaveBeenCalled();
});
