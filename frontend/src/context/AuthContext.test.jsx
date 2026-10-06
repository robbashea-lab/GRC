import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider, useAuth} from './AuthContext';
import * as api from '@/lib/api';
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,STANDARD_AUTH_ENABLED:true,
  default:{get:jest.fn(),post:jest.fn()},setWorkspaceMode:jest.fn(),setAccessToken:jest.fn(),formatError:e=>e.message}));
jest.mock('@tanstack/react-query',()=>({useQueryClient:()=>({clear:jest.fn()})}));
let root,host,auth;
function Probe(){auth=useAuth();return null;}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');root=createRoot(host);
  localStorage.clear();sessionStorage.clear();jest.clearAllMocks();api.PREVIEW_MODE=true;
  api.default.get.mockResolvedValue({data:{name:'Demo Explorer'}});
  api.default.post.mockResolvedValue({data:{user:{name:'New synthetic user'}}});
  api.setWorkspaceMode.mockImplementation(mode=>{api.PREVIEW_MODE=mode==='demo';});
});
afterEach(async()=>{await act(async()=>root.unmount());localStorage.clear();sessionStorage.clear();});
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
