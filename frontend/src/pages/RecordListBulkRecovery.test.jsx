import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
import {clearPendingCommands,syncPendingCommandIdentity} from '@/lib/createIntent';
import {toast} from 'sonner';

let mockClient='synthetic-client-a';
let mockUser={user_id:'synthetic-admin-a',role:'super_admin'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Synthetic QA client'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message,API:'/api',PREVIEW_MODE:false}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/assets',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>[new URLSearchParams(),jest.fn()]}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>()=>null);
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));

let root,container,rows;
const mount=()=>act(async()=>root.render(<RecordListPage kind="assets"/>));
const node=id=>container.querySelector(`[data-testid="${id}"]`);
const click=id=>act(async()=>node(id).click());
const selectBoth=async()=>{await click('assets-select-0');await click('assets-select-1');};
const result=(outcomes,count)=>({data:{count,results:outcomes.map(([id,outcome,detail])=>({id,outcome,detail})),retry_supported:true}});
const remount=async()=>{
  await act(async()=>root.unmount());
  root=createRoot(container);
  await mount();
};

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  sessionStorage.clear();localStorage.clear();clearPendingCommands();
  mockClient='synthetic-client-a';mockUser={user_id:'synthetic-admin-a',role:'super_admin'};
  syncPendingCommandIdentity(mockUser.user_id,'standard');
  rows=[{asset_id:'synthetic-asset-a',client_id:mockClient,name:'Synthetic asset A',status:'active',updated_at:'original-a'},
    {asset_id:'synthetic-asset-b',client_id:mockClient,name:'Synthetic asset B',status:'active',updated_at:'original-b'}];
  api.get.mockImplementation(async(path,options)=>({data:path==='/assets'?rows.filter(row=>row.client_id===options?.params?.client_id):[]}));
  api.post.mockResolvedValue(result([['synthetic-asset-a','applied'],['synthetic-asset-b','applied']],2));
  jest.spyOn(window,'confirm').mockReturnValue(true);
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{
  await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();jest.clearAllMocks();
  sessionStorage.clear();localStorage.clear();clearPendingCommands();
});

test('partial receipts report honest applied counts and retain only unresolved selected records',async()=>{
  api.post.mockResolvedValueOnce(result([['synthetic-asset-a','applied'],['synthetic-asset-b','rejected','Record changed; reload before saving']],1));
  await mount();await selectBoth();await click('bulk-close');
  expect(toast.error).toHaveBeenCalledWith('1 applied; 1 unresolved. Review the per-record outcomes.');
  expect(toast.success).not.toHaveBeenCalled();
  expect(node('bulk-operation-report').textContent).toContain('Synthetic asset B: rejected');
  expect(node('bulk-operation-report').textContent).toContain('Record changed; reload before saving');
  expect(node('bulk-selected-count').textContent).toBe('1');
  expect(node('assets-row-0').getAttribute('data-selected')).toBeNull();
  expect(node('assets-row-1').getAttribute('data-selected')).toBe('true');
  expect(node('bulk-recover')).toBeNull();
});

test('server uncertain receipt survives remount and retries its exact original body, versions and command key',async()=>{
  const receipt=result([['synthetic-asset-a','applied'],['synthetic-asset-b','uncertain','Save outcome requires recovery']],1).data;
  api.post.mockRejectedValueOnce(Object.assign(new Error('Synthetic save needs recovery'), {
    response:{status:503,headers:{},data:{detail:{message:'Bulk save needs recovery or reconciliation',bulk_receipt:receipt}}}
  }));
  await mount();await selectBoth();await click('bulk-close');
  expect(node('bulk-operation-report').textContent).toContain('Synthetic asset B: uncertain');
  expect(node('bulk-selected-count').textContent).toBe('1');
  const original=api.post.mock.calls[0];
  expect(original[1]).toEqual({kind:'assets',ids:['synthetic-asset-a','synthetic-asset-b'],action:'close',expected_versions:{'synthetic-asset-a':'original-a','synthetic-asset-b':'original-b'},expected_occurrences:{}});
  rows=rows.map(row=>({...row,updated_at:'newer-loaded-version'}));
  await remount();
  expect(node('bulk-operation-report').textContent).toContain('original records, values and edit versions are retained');
  expect(node('bulk-recover')).not.toBeNull();
  await click('bulk-recover');
  expect(api.post.mock.calls[1]).toEqual(original);
  expect(node('bulk-recover')).toBeNull();
  expect(node('bulk-action-bar')).toBeNull();
});

test('definitive fresh rejection clears pending intent and allows the refreshed versions in a new operation',async()=>{
  api.post.mockImplementationOnce(async()=>{
    rows=rows.map(row=>({...row,updated_at:'refreshed-version'}));
    throw Object.assign(new Error('Record changed; reload before saving'),{
      response:{status:409,headers:{'x-create-rejected':'true'},data:{detail:'Record changed; reload before saving'}}
    });
  });
  await mount();await selectBoth();await click('bulk-close');
  const original=api.post.mock.calls[0];
  expect(node('bulk-recover')).toBeNull();
  expect(node('bulk-selected-count').textContent).toBe('2');
  expect([...Array(sessionStorage.length)].map((_,index)=>sessionStorage.key(index)).filter(key=>key.startsWith('grc_pending_command_v1:'))).toEqual([]);
  await remount();await selectBoth();await click('bulk-close');
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(api.post.mock.calls[1][1].expected_versions).toEqual({'synthetic-asset-a':'refreshed-version','synthetic-asset-b':'refreshed-version'});
  expect(api.post.mock.calls[1][2].headers['Idempotency-Key']).not.toBe(original[2].headers['Idempotency-Key']);
  expect(toast.success).toHaveBeenCalledWith('2 record(s) updated');
});

test('duplicate clicks dispatch one bulk command while the first response is pending',async()=>{
  let resolve;
  api.post.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  await mount();await selectBoth();
  await act(async()=>{node('bulk-close').click();node('bulk-close').click();});
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async()=>resolve(result([['synthetic-asset-a','applied'],['synthetic-asset-b','applied']],2)));
  expect(api.post).toHaveBeenCalledTimes(1);
});

test('client switching does not expose or replay another client recovery; returning preserves the same actor intent',async()=>{
  api.post.mockRejectedValueOnce(new Error('Synthetic response lost'));
  await mount();await selectBoth();await click('bulk-close');
  const original=api.post.mock.calls[0];
  mockClient='synthetic-client-b';
  await mount();
  expect(node('bulk-operation-report')).toBeNull();
  expect(node('bulk-recover')).toBeNull();
  expect(api.post).toHaveBeenCalledTimes(1);
  mockClient='synthetic-client-a';
  await mount();
  expect(node('bulk-recover')).not.toBeNull();
  await click('bulk-recover');
  expect(api.post.mock.calls[1]).toEqual(original);
});

test('confirmed identity boundary removes prior recovery and cannot dispatch it as the next actor',async()=>{
  api.post.mockRejectedValueOnce(new Error('Synthetic response lost'));
  await mount();await selectBoth();await click('bulk-close');
  const oldButton=node('bulk-recover');
  mockUser={user_id:'synthetic-admin-b',role:'super_admin'};
  syncPendingCommandIdentity(mockUser.user_id,'standard');
  await mount();
  expect(node('bulk-operation-report')).toBeNull();
  expect(node('bulk-recover')).toBeNull();
  await act(async()=>oldButton.click());
  expect(api.post).toHaveBeenCalledTimes(1);
  expect([...Array(sessionStorage.length)].map((_,index)=>sessionStorage.key(index)).filter(key=>key.startsWith('grc_pending_command_v1:'))).toEqual([]);
});

test.each(['lost-response','receipt'])('uncertain deletion exposes reconciliation guidance and prohibits blind automatic retry after remount: %s',async scenario=>{
  if(scenario==='lost-response')api.post.mockRejectedValueOnce(new Error('Synthetic deletion response lost'));
  else api.post.mockResolvedValueOnce({data:{...result([['synthetic-asset-a','applied'],['synthetic-asset-b','uncertain','Delete outcome unknown']],1).data,retry_supported:false}});
  await mount();await selectBoth();await click('bulk-delete');
  expect(api.post.mock.calls[0][1].action).toBe('delete');
  expect(node('bulk-operation-report').textContent).toContain('Deletion outcome is unconfirmed');
  expect(node('bulk-recover')).toBeNull();
  await remount();
  expect(node('bulk-operation-report').textContent).toContain('do not retry the batch');
  expect(node('bulk-recover')).toBeNull();
  expect(api.post).toHaveBeenCalledTimes(1);
});

test('a late prior-client receipt cannot replace the current client selection or report',async()=>{
  let resolve;
  api.post.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  await mount();await selectBoth();
  await click('bulk-close');
  expect(api.post).toHaveBeenCalledTimes(1);
  mockClient='synthetic-client-b';
  await mount();
  await act(async()=>resolve(result([['synthetic-asset-a','applied'],['synthetic-asset-b','rejected','SYNTHETIC PRIOR CLIENT']],1)));
  expect(node('bulk-operation-report')).toBeNull();
  expect(node('bulk-action-bar')).toBeNull();
  expect(container.textContent).not.toContain('SYNTHETIC PRIOR CLIENT');
  expect(toast.error).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});
