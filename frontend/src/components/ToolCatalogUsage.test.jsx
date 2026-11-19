import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation} from 'react-router-dom';
import ToolCatalog from './ToolCatalog';
import api from '@/lib/api';

let mockAuth;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
jest.mock('./ServicesTools',()=>({ToolDetails:()=>null,ToolSources:()=>null}));
const tools=[
  {tool_id:'tool-a',name:'Synthetic tool A',category:'org',area_ids:['endpoint'],updated_at:'tool-v1'},
  {tool_id:'tool-b',name:'Synthetic tool B',category:'org',area_ids:['endpoint'],updated_at:'tool-v2'}
];
const client=(id,name,status='active')=>({client_id:id,name,status,expected_updated_at:null,
  areas:[{area_id:'endpoint',name:'Endpoint inventory'},{area_id:'patch',name:'Patch management'}]});
const usage=(id='tool-a',clients=[client('client-a','Synthetic client A')])=>({tool_id:id,
  expected_updated_at:tools.find(tool=>tool.tool_id===id).updated_at,scope:'authorized_clients',
  client_count:clients.length,selection_count:clients.reduce((sum,row)=>sum+row.areas.length,0),clients});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const dialog=()=>[...document.querySelectorAll('[role="dialog"]')].at(-1);
const button=(scope,text)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===text);
const click=async node=>{expect(node).toBeTruthy();await act(async()=>node.click());};
function Location(){const location=useLocation();return <output data-testid="location">{location.pathname+location.search}</output>;}
let host,root,readUsage,ended;
const render=async()=>{await act(async()=>root.render(<MemoryRouter initialEntries={['/admin/tools']}><ToolCatalog/><Location/></MemoryRouter>));};
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();ended=false;
  mockAuth={user:{user_id:'owner-a',role:'super_admin',status:'active',client_ids:[]},workspaceMode:'standard'};
  readUsage=jest.fn(async path=>({data:usage(path.includes('tool-b')?'tool-b':'tool-a')}));
  api.get.mockReset();api.post.mockReset();
  api.get.mockImplementation((path,options)=>path==='/service-catalog'?Promise.resolve({data:{tools}}):readUsage(path,options));
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{if(!ended)await act(async()=>root.unmount());host.remove();sessionStorage.clear();});

test('real authorized usage counts, retained archived clients and native Services links appear before replacement',async()=>{
  readUsage.mockResolvedValue({data:usage('tool-a',[client('client-a','Synthetic client A'),client('client-old','Retained archived client','archived')])});
  await render();await click(button(host,'Synthetic tool A'));
  expect(readUsage).toHaveBeenCalledWith('/tool-catalog/tool-a/usage',expect.objectContaining({signal:expect.any(AbortSignal)}));
  expect(dialog().textContent).toContain('2 authorized clients');expect(dialog().textContent).toContain('4 service-area selections');
  expect(dialog().textContent).toContain('Endpoint inventory · Patch management');expect(dialog().textContent).toContain('Archived');
  const link=[...dialog().querySelectorAll('a')].find(node=>node.textContent==='Synthetic client A');
  expect(link.getAttribute('href')).toBe('/client-profile?tab=services&client_id=client-a');
  await click(button(dialog(),'Replace everywhere'));
  expect(dialog().textContent).toContain('2 authorized clients');expect(dialog().textContent).toContain('4 service-area selections');
  expect(dialog().textContent).toContain('Replacement requires access to every affected client');
  expect(api.post).not.toHaveBeenCalled();
  await click([...dialog().querySelectorAll('a')].find(node=>node.textContent==='Synthetic client A'));
  expect(host.querySelector('[data-testid="location"]').textContent).toBe('/client-profile?tab=services&client_id=client-a');
});

test('an explicit empty accessible population is zero, rather than an error or a global no-usage claim',async()=>{
  readUsage.mockResolvedValue({data:usage('tool-a',[])});
  await render();await click(button(host,'Synthetic tool A'));
  expect(dialog().textContent).toContain('0 authorized clients');expect(dialog().textContent).toContain('0 service-area selections');
  expect(dialog().textContent).toContain('Not currently selected by any client in your authorized scope');
  expect(dialog().querySelectorAll('a')).toHaveLength(0);expect(api.post).not.toHaveBeenCalled();
});

test.each([null,undefined])('legacy client name/status %s retain actual identity and honest unknown metadata',async value=>{
  const row=client('client-a','Synthetic client A');
  if(value===undefined){delete row.name;delete row.status;}else{row.name=value;row.status=value;}
  readUsage.mockResolvedValue({data:usage('tool-a',[row])});
  await render();await click(button(host,'Synthetic tool A'));
  expect(dialog().textContent).toContain('1 authorized client');expect(dialog().textContent).toContain('2 service-area selections');
  const link=dialog().querySelector('a');expect(link.textContent).toBe('client-a');
  expect(link.getAttribute('href')).toBe('/client-profile?tab=services&client_id=client-a');
  expect(dialog().textContent).toContain('Name not recorded');expect(dialog().textContent).toContain('Status not recorded');
  expect(dialog().textContent).not.toContain('Archived');expect(dialog().textContent).not.toContain('Current selections are unknown');
  expect(button(dialog(),'Replace everywhere').disabled).toBe(false);expect(api.post).not.toHaveBeenCalled();
});

test.each([403,404,409,413])('usage refusal %s remains unknown and an explicit read Retry can recover',async status=>{
  readUsage.mockRejectedValueOnce(Object.assign(new Error('Synthetic scoped usage refusal '+status),{response:{status}}));
  await render();await click(button(host,'Synthetic tool A'));
  expect(dialog().textContent).toContain('Current selections are unknown');expect(dialog().textContent).not.toContain('0 authorized clients');
  expect(dialog().querySelectorAll('a')).toHaveLength(0);expect(button(dialog(),'Replace everywhere').disabled).toBe(true);
  expect(button(dialog(),'Save changes').disabled).toBe(false);
  await click(button(dialog(),'Retry usage'));
  expect(dialog().textContent).toContain('1 authorized client');expect(button(dialog(),'Replace everywhere').disabled).toBe(false);
  expect(api.post).not.toHaveBeenCalled();
});

test.each([
  ['wrong tool',data=>{data.tool_id='other-tool';}],
  ['changed tool version',data=>{data.expected_updated_at='different-version';}],
  ['wrong scope',data=>{data.scope='all_clients';}],
  ['truncated count',data=>{data.client_count=2;}],
  ['wrong selection count',data=>{data.selection_count=1;}],
  ['duplicate client',data=>{data.clients.push(data.clients[0]);data.client_count=2;data.selection_count=4;}],
  ['duplicate service area',data=>{data.clients[0].areas[1]={...data.clients[0].areas[0]};}],
  ['missing client version',data=>{delete data.clients[0].expected_updated_at;}],
  ['invalid client name type',data=>{data.clients[0].name={unverified:'name'};}],
  ['invalid client status type',data=>{data.clients[0].status=true;}],
  ['foreign client',data=>{data.clients[0].client_id='foreign-client';}]
])('unverified successful usage response is not presented as impact: %s',async(_name,damage)=>{
  mockAuth.user={...mockAuth.user,role:'platform_admin',client_ids:['client-a']};
  const data=usage();damage(data);readUsage.mockResolvedValue({data});
  await render();await click(button(host,'Synthetic tool A'));
  expect(dialog().textContent).toContain('Current selections are unknown');expect(dialog().querySelectorAll('a')).toHaveLength(0);
  expect(button(dialog(),'Replace everywhere').disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();
});

test('switching inspected tools clears old usage and ignores its late response even if transport ignores abort',async()=>{
  const old=deferred(),current=deferred();readUsage.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await render();await click(button(host,'Synthetic tool A'));
  expect(dialog().textContent).toContain('Loading current tool usage');expect(button(dialog(),'Replace everywhere').disabled).toBe(true);
  await click(button(dialog(),'Cancel'));await click(button(host,'Synthetic tool B'));
  expect(readUsage.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async()=>old.resolve({data:usage('tool-a',[client('old-client','Old tool client')])}));
  expect(dialog().textContent).not.toContain('Old tool client');expect(dialog().textContent).toContain('Loading current tool usage');
  await act(async()=>current.resolve({data:usage('tool-b',[client('new-client','Current tool client')])}));
  expect(dialog().textContent).toContain('Current tool client');expect(dialog().textContent).not.toContain('Old tool client');
});

test.each([
  ['actor',()=>{mockAuth.user={...mockAuth.user,user_id:'owner-b'};}],
  ['role',()=>{mockAuth.user={...mockAuth.user,role:'platform_admin',all_clients:true};}],
  ['client grants',()=>{mockAuth.user={...mockAuth.user,client_ids:['changed-grant']};}],
  ['all-client grant',()=>{mockAuth.user={...mockAuth.user,all_clients:true};}],
  ['workspace mode',()=>{mockAuth={...mockAuth,workspaceMode:'demo'};}]
])('a late usage receipt cannot survive a current %s change',async(_name,change)=>{
  const old=deferred(),current=deferred();readUsage.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await render();await click(button(host,'Synthetic tool A'));change();await render();
  expect(readUsage.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async()=>old.resolve({data:usage('tool-a',[client('old-client','Old identity client')])}));
  expect(dialog().textContent).not.toContain('Old identity client');expect(dialog().querySelectorAll('a')).toHaveLength(0);
  await act(async()=>current.resolve({data:usage('tool-a',[client('current-client','Current identity client')])}));
  expect(dialog().textContent).toContain('Current identity client');expect(api.post).not.toHaveBeenCalled();
});

test('unmount aborts and suppresses an ignored late usage response',async()=>{
  const late=deferred();readUsage.mockReturnValueOnce(late.promise);
  await render();await click(button(host,'Synthetic tool A'));await act(async()=>root.unmount());ended=true;
  expect(readUsage.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async()=>late.resolve({data:usage()}));expect(document.querySelector('[aria-label="Where this tool is used"]')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});
