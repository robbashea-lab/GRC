import React,{act,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import nativeApi from './api';
import {createIntent} from './createIntent';
import {AssessmentCommandApi,useAssessmentApi,useAssessmentCreateIntent,useScopedAssessmentApi} from './assessmentCommandScope';

jest.mock('./api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),put:jest.fn(),delete:jest.fn()}}));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
let root,host,api,command;
const scope='synthetic-actor:synthetic-client:assessment-command';
const body={expected_last_assessed:'original-assessment-revision',coordination:{expected_client_updated_at:'original-client-revision',expected_updated_at:'original-activity-revision'},implementation:'original unsaved wording'};
function Commands(){
  const transport=useAssessmentApi();api=transport;
  command=useAssessmentCreateIntent((...args)=>transport.patch(...args),scope,true);
  // Capture the actual render-bound facade, as a file/read continuation does.
  const captured=api;
  command.fileThenPost=async file=>{const data=await file;return captured.post('/evidence',data);};
  return null;
}
function Owner({epoch,available=true,children}){
  const authority=useRef(null);authority.current={owner:epoch,readable:available,available};
  const value=useScopedAssessmentApi(authority,epoch);
  return <AssessmentCommandApi.Provider value={value}>{children||<Commands/>}</AssessmentCommandApi.Provider>;
}
function render(epoch,available=true){act(()=>root.render(<Owner epoch={epoch} available={available}/>));}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();jest.clearAllMocks();
  Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  nativeApi.patch.mockResolvedValue({data:{saved:true}});nativeApi.post.mockResolvedValue({data:{saved:true}});
});
afterEach(()=>{act(()=>root.unmount());host.remove();});
test('a queued old create cannot acquire restored authority, while fresh retry retains original key, bytes and CAS',async()=>{
  render({id:'A0'});const original=command;
  const result=original('/framework_assessments/synthetic-A',body).catch(error=>error);
  const retained=JSON.parse(sessionStorage.getItem('grc_pending_command_v1:'+scope));
  render({id:'missing'},false);render({id:'A1'});
  expect((await result).message).toMatch(/unavailable|changed/);
  expect(nativeApi.patch).not.toHaveBeenCalled();
  expect(command.unconfirmed()).toBe(true);expect(command.pendingRequest()).toEqual(['/framework_assessments/synthetic-A',body]);
  await command.retry();
  expect(nativeApi.patch).toHaveBeenCalledTimes(1);
  expect(nativeApi.patch.mock.calls[0].slice(0,2)).toEqual(['/framework_assessments/synthetic-A',body]);
  expect(nativeApi.patch.mock.calls[0][2].headers['Idempotency-Key']).toBe(retained.key);
  expect(command.unconfirmed()).toBe(false);
});
test.each(['success','server-rejection'])('an ended %s response cannot acknowledge the command or discard its original revisions',async outcome=>{
  const wire=deferred();nativeApi.patch.mockReturnValueOnce(wire.promise);
  render({id:'A0'});const original=command;
  const result=original('/framework_assessments/synthetic-A',body).catch(error=>error);
  await Promise.resolve();
  expect(nativeApi.patch).toHaveBeenCalledTimes(1);
  const key=nativeApi.patch.mock.calls[0][2].headers['Idempotency-Key'];
  render({id:'missing'},false);render({id:'A1'});
  if(outcome==='success')wire.resolve({data:{saved:true}});
  else wire.reject({response:{headers:{'x-create-rejected':'true'},data:{detail:'original epoch rejection'}}});
  expect((await result).message).toMatch(/unavailable|changed/);
  expect(command.unconfirmed()).toBe(true);expect(command.pendingRequest()[1]).toEqual(body);
  await command.retry();
  expect(nativeApi.patch.mock.calls[1][2].headers['Idempotency-Key']).toBe(key);
  expect(nativeApi.patch.mock.calls[1][1]).toEqual(body);
});
test('a pre-await file handler permanently keeps its old epoch after A-missing-A',async()=>{
  render({id:'A0'});const file=deferred(),oldHandler=command.fileThenPost;
  const result=oldHandler(file.promise).catch(error=>error);
  render({id:'missing'},false);render({id:'A1'});
  file.resolve({filename:'synthetic.txt',content_base64:'c3ludGhldGlj'});
  expect((await result).message).toMatch(/unavailable|changed/);
  expect(nativeApi.post).not.toHaveBeenCalled();
});
test('a nested assessment cannot replace an unavailable ancestor fence',async()=>{
  const parent={id:'parent'},child={id:'child'};
  act(()=>root.render(<Owner epoch={parent}><Owner epoch={child}/></Owner>));
  const captured=api;
  act(()=>root.render(<Owner epoch={parent} available={false}><Owner epoch={child}/></Owner>));
  await expect(captured.post('/comments',{body:'synthetic'})).rejects.toThrow(/unavailable|changed/);
  expect(nativeApi.post).not.toHaveBeenCalled();
});


test('the final acknowledgement microtask cannot clear a strict command whose captured epoch just ended',async()=>{
  let live=true;
  const post=jest.fn(()=>{queueMicrotask(()=>{live=false;});return {data:{saved:true}};});
  post.assertCommandCurrent=()=>{if(!live)throw new Error('Ended acknowledgement epoch');};
  const original=createIntent(post,scope);
  const result=original('/framework_assessments/synthetic-A',body);
  const retained=JSON.parse(sessionStorage.getItem('grc_pending_command_v1:'+scope));
  await expect(result).rejects.toThrow('Ended acknowledgement epoch');
  expect(original.unconfirmed()).toBe(true);
  expect(original.pendingRequest()).toEqual(['/framework_assessments/synthetic-A',body]);
  const current=jest.fn(async()=>({data:{saved:true}}));current.assertCommandCurrent=()=>{};
  await original.withPost(current).retry();
  expect(current.mock.calls[0].slice(0,2)).toEqual(['/framework_assessments/synthetic-A',body]);
  expect(current.mock.calls[0][2].headers['Idempotency-Key']).toBe(retained.key);
  expect(original.unconfirmed()).toBe(false);
});
