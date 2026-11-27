import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {useClientPeople} from './people';
import {OwnerCell} from '@/components/RegisterCells';
import RecordSummary from '@/components/RecordSummary';
import api from './api';

jest.mock('./api', () => ({__esModule:true, default:{get:jest.fn()}}));

const owner = {user_id:'synthetic-global-owner',name:'Synthetic Global Owner',status:'active'};
let root,host,requests;
function Labels({clientId='synthetic-a',refreshKey,ownerId=owner.user_id}) {
  const people=useClientPeople(clientId,refreshKey);
  return <><OwnerCell people={people} id={ownerId}/><RecordSummary kind="assets" record={{asset_id:'synthetic-system',client_id:clientId,name:'Synthetic System',owner_id:ownerId,status:'active'}} users={people}/></>;
}
const render=props=>act(async()=>root.render(<Labels {...props}/>));
const finish=(index,people)=>act(async()=>requests[index].resolve({data:people}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);requests=[];
  api.get.mockImplementation((path,options)=>new Promise((resolve,reject)=>requests.push({path,options,resolve,reject})));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});

test('a same-client accepted-record refresh resolves its newly referenced owner in the native cell and summary',async()=>{
  const initialRows=[],savedRows=[{asset_id:'synthetic-system',owner_id:owner.user_id}];
  await render({refreshKey:initialRows});await finish(0,[]);
  expect(host.querySelector('.register-owner').textContent).toBe('Former user');
  await render({refreshKey:savedRows});
  expect(requests).toHaveLength(2);
  expect(requests[1].path).toBe('/clients/synthetic-a/members');
  await finish(1,[owner]);
  expect(host.querySelector('.register-owner').textContent).toBe(owner.name);
  expect(host.querySelector('[aria-label="Record summary"]').textContent).toContain(owner.name);
  expect(host.textContent).not.toContain(owner.user_id);
  await render({refreshKey:savedRows});expect(requests).toHaveLength(2);
});

test('a late older same-client response cannot replace the refreshed owner labels',async()=>{
  await render({refreshKey:0});
  await render({refreshKey:1});
  expect(requests[0].options.signal.aborted).toBe(true);
  await finish(1,[owner]);await finish(0,[{...owner,name:'Stale owner name'}]);
  expect(host.textContent).toContain(owner.name);expect(host.textContent).not.toContain('Stale owner name');
});

test('switching clients rejects an old response and a denied new-client read supplies no names',async()=>{
  await render({clientId:'synthetic-a',refreshKey:0});
  await render({clientId:'synthetic-b',refreshKey:0});
  expect(requests[0].options.signal.aborted).toBe(true);
  expect(requests[1].path).toBe('/clients/synthetic-b/members');
  await act(async()=>requests[1].reject(new Error('Forbidden')));
  await finish(0,[owner]);
  expect(host.textContent).not.toContain(owner.name);expect(host.textContent).not.toContain(owner.user_id);
  expect(host.querySelector('.register-owner').textContent).toBe('Former user');
  expect(requests.map(r=>r.path)).toEqual(['/clients/synthetic-a/members','/clients/synthetic-b/members']);
});

test('a failed refresh retains the recorded assignment but clears names that could no longer be verified',async()=>{
  await render({refreshKey:0});await finish(0,[owner]);
  await render({refreshKey:1});expect(requests).toHaveLength(2);
  await act(async()=>requests[1].reject(new Error('Unauthorized')));
  expect(host.querySelector('.register-owner').textContent).toBe('Former user');
  expect(host.querySelector('[aria-label="Record summary"]').textContent).toContain('Former user');
  expect(host.textContent).not.toContain(owner.name);expect(host.textContent).not.toContain(owner.user_id);
});

test('unchanged default callers load once and unknown or empty owners retain their protected labels',async()=>{
  await render({});await finish(0,[]);await render({});
  expect(requests).toHaveLength(1);expect(host.querySelector('.register-owner').textContent).toBe('Former user');
  await render({ownerId:null});expect(host.querySelector('.register-owner').textContent).toBe('Unassigned');
  await render({clientId:'',ownerId:null});expect(requests).toHaveLength(1);
});
