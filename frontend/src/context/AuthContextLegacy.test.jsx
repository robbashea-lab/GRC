import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider,useAuth} from './AuthContext';
import * as api from '@/lib/api';
import {toast} from 'sonner';
import {clearPendingCommands} from '@/lib/createIntent';
jest.mock('sonner',()=>({toast:{error:jest.fn(),dismiss:jest.fn()}}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:false,STANDARD_AUTH_ENABLED:true,
  default:{get:jest.fn(),post:jest.fn()},setWorkspaceMode:jest.fn(),setAccessToken:jest.fn(),formatError:e=>e.message}));
const mockQuery={clear:jest.fn()};
jest.mock('@tanstack/react-query',()=>({useQueryClient:()=>mockQuery}));
const actor='user_012345abcdef';
let root,auth,host;
function Probe(){auth=useAuth();return null;}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;clearPendingCommands();sessionStorage.clear();localStorage.clear();jest.clearAllMocks();
  api.default.get.mockResolvedValue({data:{user_id:actor,name:'Synthetic current actor'}});
  host=document.createElement('div');root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());clearPendingCommands();sessionStorage.clear();localStorage.clear();});
const store=scope=>{
  const key='grc_pending_command_v1:'+scope, raw=JSON.stringify({key:'synthetic-legacy-key',snapshot:JSON.stringify([
    '/contacts/contact',{notes:'SYNTHETIC QA ONLY',expected_updated_at:'original-cas'}])});
  sessionStorage.setItem(key,raw);return {key,raw};
};

test('initial confirmed actor cannot retain a different actor legacy business body',async()=>{
  const {key}=store('synthetic-legacy-a:synthetic-client:contacts:contact:update');
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  expect(auth.user.user_id).toBe(actor);expect(sessionStorage.getItem(key)).toBeNull();
});

test('initial confirmed same actor keeps its original standard command unchanged',async()=>{
  const {key,raw}=store(`${actor}:synthetic-client:contacts:contact:update`);
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  expect(auth.user.user_id).toBe(actor);expect(sessionStorage.getItem(key)).toBe(raw);
  expect(toast.error).not.toHaveBeenCalled();
});

test('unattributable legacy recovery visibly blocks handoff without claiming removal failed',async()=>{
  const {key,raw}=store('unbound-scope');
  await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
  expect(auth.user).toBeNull();expect(auth.loading).toBe(false);
  expect(sessionStorage.getItem(key)).toBe(raw);expect(sessionStorage.getItem('grc_pending_command_identity_v1')).toBeNull();
  expect(api.setAccessToken).toHaveBeenCalledWith(null);
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('recovery ownership requires reconciliation'),expect.objectContaining({duration:Infinity}));
});
