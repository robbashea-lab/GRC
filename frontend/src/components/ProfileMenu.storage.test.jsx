import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {ProfileMenu} from './BrawndoSidebar';
import api from '@/lib/api';
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{name:'QA',role:'super_admin'},logout:jest.fn()})}));
jest.mock('./NotificationBell',()=>()=>null);
jest.mock('@/lib/api',()=>({__esModule:true,get PREVIEW_MODE(){return mockPreview;},default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
let root,container;
let mockPreview=true;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);jest.clearAllMocks();mockPreview=true;api.get.mockResolvedValue({data:{records:3}});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const key=async(node,value)=>{await act(async()=>{node.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true}));await new Promise(resolve=>setTimeout(resolve,20));});};
const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent===label);
async function openStorage(){
 await act(async()=>root.render(<ProfileMenu compact storageTools/>));
 const trigger=container.querySelector('[data-testid="profile-menu-trigger"]');trigger.focus();
 await key(trigger,'ArrowDown');
 expect(document.activeElement.textContent).toContain('My Account');
 await key(document.activeElement,'ArrowDown');
 expect(document.activeElement.textContent).toBe('Demo storage & recovery');
 await key(document.activeElement,'Enter');
 expect(document.querySelector('[role="menu"]')).toBeNull();
 expect(document.querySelector('[role="dialog"]')).not.toBeNull();
 expect(api.get).toHaveBeenCalledWith('/demo/storage');
 return trigger;
}
test('real Radix keyboard menu opens storage outside the dismissed menu and returns focus',async()=>{
 const trigger=await openStorage();
 expect(api.post).not.toHaveBeenCalled();
 await key(document.activeElement,'Escape');
 expect(document.querySelector('[role="dialog"]')).toBeNull();
 expect(document.activeElement).toBe(trigger);
});
test('recovery requires confirmation and remains mounted while its request is busy',async()=>{
 await openStorage();
 await act(async()=>button('Reset Demo Data').click());
 expect(api.post).not.toHaveBeenCalled();
 let rejectRequest;api.post.mockImplementation(()=>new Promise((resolve,reject)=>{rejectRequest=reject;}));
 await act(async()=>button('Reset Demo Data').click());
 expect(api.post).toHaveBeenCalledWith('/demo/reset');
 await key(document.activeElement,'Escape');
 expect(document.querySelector('[role="dialog"]')).not.toBeNull();
 expect(button('Working…').disabled).toBe(true);
 await act(async()=>rejectRequest(new Error('Synthetic request failure')));
 expect(document.querySelector('[role="alert"]').textContent).toBe('Synthetic request failure');
 await act(async()=>button('Cancel').click());
 expect(document.querySelector('[role="dialog"]').textContent).toContain('Demo storage & recovery');
 expect(api.post).toHaveBeenCalledTimes(1);
});

test('standard mode retains account menu while excluding demo recovery',async()=>{
 mockPreview=false;
 await act(async()=>root.render(<ProfileMenu compact storageTools/>));
 const trigger=container.querySelector('[data-testid="profile-menu-trigger"]');
 await key(trigger,'ArrowDown');
 expect(document.querySelector('[data-testid="profile-menu-account"]')).not.toBeNull();
 expect(document.querySelector('[data-testid="profile-menu-storage"]')).toBeNull();
 expect(api.get).not.toHaveBeenCalled();
});
