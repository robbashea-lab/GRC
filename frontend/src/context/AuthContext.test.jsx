import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider, useAuth} from './AuthContext';
import * as api from '@/lib/api';
import {toast} from 'sonner';
jest.mock('sonner',()=>({toast:{error:jest.fn(),dismiss:jest.fn()}}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,STANDARD_AUTH_ENABLED:true,
  default:{get:jest.fn(),post:jest.fn()},setWorkspaceMode:jest.fn(),setAccessToken:jest.fn(),formatError:e=>e.message}));
const mockClear=jest.fn();
jest.mock('@tanstack/react-query',()=>({useQueryClient:()=>({clear:mockClear})}));
let root,host,auth;
function Probe(){auth=useAuth();return null;}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');root=createRoot(host);
  localStorage.clear();sessionStorage.clear();jest.clearAllMocks();api.PREVIEW_MODE=true;
  api.default.get.mockResolvedValue({data:{name:'Demo Explorer'}});
  api.default.post.mockResolvedValue({data:{user:{name:'New synthetic user'}}});
  api.setWorkspaceMode.mockImplementation(mode=>{api.PREVIEW_MODE=mode==='demo';});
});

test('successful logout clears local identity only after the server acknowledges logout',async()=>{
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  let resolve;
  api.default.post.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  let pending;
  await act(async()=>{pending=auth.logout();});
  expect(auth.user).toEqual({name:'Demo Explorer'});
  expect(mockClear).not.toHaveBeenCalled();
  await act(async()=>{resolve({data:{ok:true}});expect(await pending).toBe(true);});
  expect(api.default.post).toHaveBeenCalledWith('/auth/logout');
  expect(auth.user).toBeNull();
  expect(mockClear).toHaveBeenCalledTimes(1);
  expect(api.setWorkspaceMode).toHaveBeenCalledWith('standard');
  expect(toast.dismiss).toHaveBeenCalledWith('logout-incomplete');
});

test.each([new Error('Network Error'),Object.assign(new Error('Service unavailable'),{response:{status:503}})])(
  'failed logout preserves identity, warns of an active session and provides a working retry: %s',async error=>{
    await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
    api.default.post.mockRejectedValueOnce(error);
    await act(async()=>{expect(await auth.logout()).toBe(false);});
    expect(auth.user).toEqual({name:'Demo Explorer'});
    expect(mockClear).not.toHaveBeenCalled();
    expect(api.setWorkspaceMode).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('server session may still be active'),
      expect.objectContaining({duration:Infinity,action:expect.objectContaining({label:'Retry sign-out'})}));
    await act(async()=>auth.refresh());
    expect(auth.user).toEqual({name:'Demo Explorer'});
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
  expect(auth.user).toEqual(status==='ended'?null:{name:'Demo Explorer'});
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
