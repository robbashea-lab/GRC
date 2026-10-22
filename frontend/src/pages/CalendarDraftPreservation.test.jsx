import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Calendar from './Calendar';
import api from '@/lib/api';
import {calendarBuckets,localCalendarDate} from '@/lib/calendarView';
let mockOrgLoading=false,mockActor='demo-user',mockMounts=0;
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/calendar',search:'?client_id=demo_brawndo'})}),{virtual:true});
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({loading:mockOrgLoading,currentClientId:'demo_brawndo',currentClient:{...require('@/testUtils/cisExperience').cisClient('demo_brawndo',1),name:'Brawndo'},clients:[require('@/testUtils/cisExperience').cisClient('demo_brawndo',1)]})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({workspaceMode:'demo',user:{role:'super_admin',user_id:mockActor,workspace_mode:'demo'}})}));
jest.mock('@/lib/clientSelection',()=>({selectedClient:()=> 'demo_brawndo'}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));
// Stateful native-editor stand-in exposes remounts without replacing Calendar's opener flow.
jest.mock('@/components/RecordDrawer',()=>{
 const React=require('react');
 return function Drawer(){const [draft,setDraft]=React.useState('Saved title');React.useEffect(()=>{mockMounts++;},[]);return <textarea aria-label="Native record draft" value={draft} onChange={event=>setDraft(event.target.value)}/>;};
});
let root,container;
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;mockOrgLoading=false;mockActor='demo-user';mockMounts=0;sessionStorage.clear();localStorage.clear();jest.clearAllMocks();
 const record={task_id:'task',client_id:'demo_brawndo',title:'Saved title',status:'open',due_date:localCalendarDate(new Date()),updated_at:'version'};
 api.get.mockImplementation(async(path,{params}={})=>({data:path==='/calendar'?calendarBuckets({tasks:[record]}, {role:'super_admin'},params):path.endsWith('/members')?[]:{...record}}));
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('same-client appearance rechecks preserve popup and full native draft, actor changes discard it',async()=>{
 await act(async()=>root.render(<Calendar/>));
 const item=container.querySelector('[data-testid^="cal-item-task:task"]');
 await act(async()=>item.click());
 const popupInput=document.querySelector('input[type="date"]');
 mockOrgLoading=true;await act(async()=>root.render(<Calendar/>));
 expect(document.querySelector('input[type="date"]')).toBe(popupInput);
 mockOrgLoading=false;await act(async()=>root.render(<Calendar/>));
 expect(document.querySelector('input[type="date"]')).toBe(popupInput);
 await act(async()=>document.querySelector('[role="dialog"] a').click());
 const draft=container.querySelector('[aria-label="Native record draft"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(draft,'Unsaved native change');draft.dispatchEvent(new Event('input',{bubbles:true}));});
 const mounts=mockMounts;
 mockOrgLoading=true;await act(async()=>root.render(<Calendar/>));
 mockOrgLoading=false;await act(async()=>root.render(<Calendar/>));
 expect(container.querySelector('[aria-label="Native record draft"]')).toBe(draft);
 expect(draft.value).toBe('Unsaved native change');expect(mockMounts).toBe(mounts);
 expect(api.patch).not.toHaveBeenCalled();
 mockActor='different-actor';await act(async()=>root.render(<Calendar/>));
 expect(container.querySelector('[aria-label="Native record draft"]')).toBeNull();
});
