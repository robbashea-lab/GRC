import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {Toaster, toast} from 'sonner';
import {AuthProvider, useAuth} from './AuthContext';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:false,STANDARD_AUTH_ENABLED:true,
  default:{get:jest.fn(),post:jest.fn()},setWorkspaceMode:jest.fn(),setAccessToken:jest.fn(),formatError:e=>e.message}));
jest.mock('@tanstack/react-query',()=>({useQueryClient:()=>({clear:jest.fn()})}));

test('real sign-out warning survives failed Retry and disappears after successful Retry',async()=>{
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const previousMatchMedia=window.matchMedia;
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  const host=document.createElement('div');document.body.appendChild(host);
  const root=createRoot(host);
  let auth;
  function Probe(){auth=useAuth();return <span>{auth.user?'Signed in':'Signed out'}</span>;}
  api.get.mockResolvedValue({data:{name:'Synthetic User'}});
  api.post.mockRejectedValueOnce(new Error('Network Error'))
    .mockRejectedValueOnce(Object.assign(new Error('Server unavailable'),{response:{status:503}}))
    .mockResolvedValueOnce({data:{ok:true}});
  try {
    await act(async()=>root.render(<AuthProvider><Probe/><Toaster/></AuthProvider>));
    await act(async()=>{expect(await auth.logout()).toBe(false);});
    await act(async()=>jest.advanceTimersByTime(20));
    const retry=()=>document.querySelector('[data-sonner-toast] [data-action]');
    expect(retry().textContent).toBe('Retry sign-out');
    await act(async()=>retry().click());
    // Sonner removes an action toast after 200ms unless the action prevents it.
    await act(async()=>jest.advanceTimersByTime(300));
    expect(retry()).not.toBeNull();
    expect(document.querySelector('[data-sonner-toast]').textContent).toContain('Sign-out incomplete');
    expect(host.textContent).toContain('Signed in');
    await act(async()=>retry().click());
    await act(async()=>jest.advanceTimersByTime(300));
    await act(async()=>jest.advanceTimersByTime(200));
    expect(document.querySelector('[data-sonner-toast]')).toBeNull();
    expect(host.textContent).toContain('Signed out');
    expect(api.post).toHaveBeenCalledTimes(3);
  } finally {
    await act(async()=>{toast.dismiss();root.unmount();});
    host.remove();window.matchMedia=previousMatchMedia;jest.useRealTimers();
  }
});
