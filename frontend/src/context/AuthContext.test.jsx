import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider, useAuth} from './AuthContext';
import * as api from '@/lib/api';
import {toast} from 'sonner';
import {createIntent} from '@/lib/createIntent';
jest.mock('sonner',()=>({toast:{error:jest.fn(),dismiss:jest.fn()}}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,STANDARD_AUTH_ENABLED:true,
  default:{get:jest.fn(),post:jest.fn()},setWorkspaceMode:jest.fn(),setAccessToken:jest.fn(),formatError:e=>e.message}));
const mockClear=jest.fn();
const mockQueryClient={clear:mockClear};
jest.mock('@tanstack/react-query',()=>({useQueryClient:()=>mockQueryClient}));
let root,host,auth;
function Probe(){auth=useAuth();return null;}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');root=createRoot(host);
  localStorage.clear();sessionStorage.clear();jest.clearAllMocks();api.PREVIEW_MODE=true;
  api.default.get.mockResolvedValue({data:{user_id:'synthetic-user-a',name:'Demo Explorer'}});
  api.default.post.mockResolvedValue({data:{user:{name:'New synthetic user'}}});
  api.setWorkspaceMode.mockImplementation(mode=>{api.PREVIEW_MODE=mode==='demo';});
});

test('successful logout clears local identity only after the server acknowledges logout',async()=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  let resolve;
  api.default.post.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  let pending;
  await act(async()=>{pending=auth.logout();});
  expect(auth.user).toEqual({user_id:'synthetic-user-a',name:'Demo Explorer'});
  expect(mockClear).not.toHaveBeenCalled();
  await act(async()=>{resolve({data:{ok:true}});expect(await pending).toBe(true);});
  expect(api.default.post).toHaveBeenCalledWith('/auth/logout');
  expect(auth.user).toBeNull();
  expect(mockClear).toHaveBeenCalledTimes(1);
  expect(api.setWorkspaceMode).toHaveBeenCalledWith('standard');
  expect(toast.dismiss).toHaveBeenCalledWith('logout-incomplete');
});

test('confirmed logout removes prior synthetic business bodies and blocks retained callbacks under the next identity',async()=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  const post=jest.fn().mockRejectedValueOnce(new Error('Synthetic response lost')).mockResolvedValue({});
  const scope='synthetic-user-a:client-a:contacts:contact-a:update';
  const old=createIntent(post,scope);
  await expect(old('/contacts/contact-a',{notes:'SYNTHETIC PRIOR ACTOR',expected_updated_at:'v1'})).rejects.toThrow();
  const key='grc_pending_command_v1:'+scope;
  expect(sessionStorage.getItem(key)).toContain('SYNTHETIC PRIOR ACTOR');
  await act(async()=>{expect(await auth.logout()).toBe(true);});
  expect(sessionStorage.getItem(key)).toBeNull();
  await act(async()=>auth.setUser({user_id:'synthetic-user-b',name:'Synthetic User B'}));
  await expect(old.retry()).rejects.toThrow();
  await expect(old('/contacts/contact-a',{notes:'SYNTHETIC PRIOR ACTOR',expected_updated_at:'v1'})).rejects.toThrow();
  expect(post).toHaveBeenCalledTimes(1);
});

test.each([new Error('Network Error'),Object.assign(new Error('Service unavailable'),{response:{status:503}})])(
  'failed logout preserves identity, warns of an active session and provides a working retry: %s',async error=>{
    await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
    api.default.post.mockRejectedValueOnce(error);
    await act(async()=>{expect(await auth.logout()).toBe(false);});
    expect(auth.user).toEqual({user_id:'synthetic-user-a',name:'Demo Explorer'});
    expect(mockClear).not.toHaveBeenCalled();
    expect(api.setWorkspaceMode).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('server session may still be active'),
      expect.objectContaining({duration:Infinity,action:expect.objectContaining({label:'Retry sign-out'})}));
    await act(async()=>auth.refresh());
    expect(auth.user).toEqual({user_id:'synthetic-user-a',name:'Demo Explorer'});
    const retry=toast.error.mock.calls[0][1].action.onClick;
    const event={preventDefault:jest.fn()};
    await act(async()=>{expect(await retry(event)).toBe(true);});
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(auth.user).toBeNull();
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(api.default.post).toHaveBeenCalledTimes(2);
  });
afterEach(async()=>{await act(async()=>root.unmount());localStorage.clear();sessionStorage.clear();});
test.each(['ended','active','network','server'])('a retry denied after possible response loss verifies the cookie session: %s',async status=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  const denied=Object.assign(new Error('Not authenticated'),{response:{status:401}});
  api.default.post.mockRejectedValueOnce(denied);
  if(status==='active')api.default.get.mockResolvedValueOnce({data:{name:'Still authenticated'}});
  else api.default.get.mockRejectedValueOnce(status==='ended'?denied:
    Object.assign(new Error('Verification unavailable'),status==='server'?{response:{status:503}}:{}));
  await act(async()=>{expect(await auth.logout()).toBe(status==='ended');});
  expect(api.default.get).toHaveBeenLastCalledWith('/auth/me',{cookieAuthOnly:true});
  expect(auth.user).toEqual(status==='ended'?null:{user_id:'synthetic-user-a',name:'Demo Explorer'});
  expect(mockClear).toHaveBeenCalledTimes(status==='ended'?1:0);
  expect(toast.error).toHaveBeenCalledTimes(status==='ended'?0:1);
});
test.each(['login','register'])('%s directly from Demo clears previous real-user selection',async method=>{
  localStorage.setItem('grc_client_id','previous-real-user-client');
  sessionStorage.setItem('grc_client_id','demo_initech');
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  await act(async()=>auth[method]('synthetic@example.test','synthetic-test-password','Synthetic User'));
  expect(api.setWorkspaceMode).toHaveBeenCalledWith('standard');
  expect(localStorage.getItem('grc_client_id')).toBeNull();
  expect(api.default.post).toHaveBeenCalledWith(`/auth/${method}`,
    method==='login'?{email:'synthetic@example.test',password:'synthetic-test-password'}:
      {email:'synthetic@example.test',password:'synthetic-test-password',name:'Synthetic User'});
});

const pendingBody=()=>{
  const key='grc_pending_command_v1:synthetic-user-a:client:contact:update';
  sessionStorage.setItem(key,JSON.stringify({key:'synthetic-command',snapshot:JSON.stringify(['/contacts/contact',{notes:'SYNTHETIC PRIOR ACTOR'}])}));
  return key;
};

test.each([undefined,503])('unconfirmed logout preserves original pending body (%s)',async status=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  const key=pendingBody();
  api.default.post.mockRejectedValueOnce(Object.assign(new Error('Synthetic unavailable'),status?{response:{status}}:{}));
  await act(async()=>{expect(await auth.logout()).toBe(false);});
  expect(sessionStorage.getItem(key)).toContain('SYNTHETIC PRIOR ACTOR');
  expect(auth.user.user_id).toBe('synthetic-user-a');
});

test.each(['same','network','server','different','denied'])('identity refresh only clears on established boundary: %s',async scenario=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  const key=pendingBody();
  if(scenario==='same')api.default.get.mockResolvedValueOnce({data:{user_id:'synthetic-user-a',name:'Refreshed A'}});
  else if(scenario==='different')api.default.get.mockResolvedValueOnce({data:{user_id:'synthetic-user-b',name:'Synthetic B'}});
  else api.default.get.mockRejectedValueOnce(Object.assign(new Error('Synthetic unavailable'),scenario==='network'?{}:{response:{status:scenario==='denied'?401:503}}));
  await act(async()=>auth.refresh());
  if(['different','denied'].includes(scenario))expect(sessionStorage.getItem(key)).toBeNull();
  else {
    expect(sessionStorage.getItem(key)).toContain('SYNTHETIC PRIOR ACTOR');
    expect(auth.user.user_id).toBe('synthetic-user-a');
  }
});

test.each(['login','register','exploreDemo'])('intentional %s attempt clears prior command even if authentication fails',async method=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  const key=pendingBody();
  api.default.post.mockRejectedValueOnce(new Error('Synthetic sign-in unavailable'));
  await act(async()=>{await expect(auth[method]('synthetic@example.test','synthetic-only')).rejects.toThrow();});
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(auth.user).toBeNull();
});

test('confirmed server logout with storage failure is not reported as successful local cleanup',async()=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  const key=pendingBody();
  const remove=jest.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('Storage unavailable');});
  try {
    await act(async()=>{expect(await auth.logout()).toBe(false);});
    expect(auth.user).toBeNull();
    expect(api.setAccessToken).toHaveBeenCalledWith(null);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Server sign-out is confirmed'),expect.objectContaining({id:'pending-cleanup-incomplete'}));
    expect(sessionStorage.getItem(key)).toContain('SYNTHETIC PRIOR ACTOR');
    api.default.post.mockClear();
    await act(async()=>{await expect(auth.login('synthetic-b@example.test','synthetic-only')).rejects.toThrow('Storage unavailable');});
    expect(api.default.post).not.toHaveBeenCalled();
    expect(auth.user).toBeNull();
  } finally {remove.mockRestore();}
});

test('initial authenticated refresh recognizes a different prior document identity',async()=>{
  sessionStorage.setItem('grc_pending_command_identity_v1',JSON.stringify(['demo','synthetic-other']));
  const key=pendingBody();
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  expect(sessionStorage.getItem(key)).toBeNull();
});

test('Google callback uses the same cleanup boundary and validated identity handoff',async()=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  const key=pendingBody();
  api.default.post.mockResolvedValueOnce({data:{session_token:'synthetic-google-token',user:{user_id:'synthetic-user-b',role:'client_read_only',name:'Synthetic B'}}});
  await act(async()=>auth.signInWithGoogleSession('synthetic-callback-id'));
  expect(api.default.post).toHaveBeenLastCalledWith('/auth/google/session',{session_id:'synthetic-callback-id'});
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(auth.user.user_id).toBe('synthetic-user-b');
  expect(api.setAccessToken).toHaveBeenLastCalledWith('synthetic-google-token');
});

test('a delayed prior authentication response cannot replace the newer actor or restore its token',async()=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  let resolve;
  api.default.post.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  let old;
  await act(async()=>{old=auth.login('synthetic-a@example.test','synthetic-only');});
  api.default.post.mockResolvedValueOnce({data:{access_token:'synthetic-current-token',user:{user_id:'synthetic-user-b',name:'Synthetic B'}}});
  await act(async()=>auth.login('synthetic-b@example.test','synthetic-only'));
  await act(async()=>{
    resolve({data:{access_token:'synthetic-old-token',user:{user_id:'synthetic-user-a'}}});
    await expect(old).rejects.toMatchObject({code:'AUTH_ATTEMPT_SUPERSEDED'});
  });
  expect(auth.user.user_id).toBe('synthetic-user-b');
  expect(api.setAccessToken).toHaveBeenLastCalledWith('synthetic-current-token');
});
