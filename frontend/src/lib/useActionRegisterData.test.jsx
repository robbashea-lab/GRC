import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import api from './api';
import {useActionRegisterData} from './useActionRegisterData';

jest.mock('./api',()=>({__esModule:true,default:{get:jest.fn()},formatError:error=>error.message}));
let root,container,current;
function Probe({clientId}){current=useActionRegisterData(clientId);return <pre>{JSON.stringify(current)}</pre>;}
function response(path,options){
  const clientId=options?.params?.client_id||path.split('/')[2];
  return {data:path==='/onboarding/state'?{assessments:[{client_id:clientId,assessment_id:'assessment'}, {client_id:'foreign',assessment_id:'foreign'}]}:
    path.endsWith('/members')?[{user_id:clientId}]:[{client_id:clientId,title:clientId},{client_id:'foreign',title:'foreign'}]};
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async(path,options)=>response(path,options));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('tenant switch rejects delayed previous-client records and filters every source',async()=>{
  let resolveOld;
  api.get.mockImplementation((path,options)=>path==='/tasks'&&options.params.client_id==='old'?
    new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve(response(path,options)));
  await act(async()=>root.render(<Probe clientId="old"/>));
  await act(async()=>root.render(<Probe clientId="new"/>));
  expect(current.data.tasks).toEqual([{client_id:'new',title:'new'}]);
  expect(current.data.assessments).toEqual([{client_id:'new',assessment_id:'assessment'}]);
  await act(async()=>resolveOld({data:[{client_id:'old',title:'old'}]}));
  expect(current.data.tasks).toEqual([{client_id:'new',title:'new'}]);
  expect(current.users).toEqual([{user_id:'new'}]);
});

test('dependency failure clears stale results and the same controller can retry',async()=>{
  await act(async()=>root.render(<Probe clientId="client"/>));
  api.get.mockRejectedValueOnce(new Error('Connection interrupted'));
  await act(async()=>current.load());
  expect(current).toMatchObject({data:{},users:[],error:'Connection interrupted',loading:false});
  await act(async()=>current.load());
  expect(current.data.tasks).toEqual([{client_id:'client',title:'client'}]);
  expect(current.error).toBe('');
});

test.each([403,404,503])('historical source error %s is unavailable only for denied or missing records',async status=>{
  api.get.mockImplementation(async(path,options)=>{
    if(path==='/tasks')return {data:[{client_id:'client',framework_assessment_id:'source'}]};
    if(path==='/framework_assessments/source')throw Object.assign(new Error('Source unavailable'),{response:{status}});
    return response(path,options);
  });
  await act(async()=>root.render(<Probe clientId="client"/>));
  if(status===503)expect(current).toMatchObject({data:{},error:'Source unavailable'});
  else {expect(current.data.tasks).toHaveLength(1);expect(current.data.framework_assessments).toEqual([]);expect(current.error).toBe('');}
});

test('no selected client performs no request',async()=>{
  await act(async()=>root.render(<Probe clientId={null}/>));
  expect(api.get).not.toHaveBeenCalled();expect(current).toMatchObject({data:{},loading:false,error:''});
});
