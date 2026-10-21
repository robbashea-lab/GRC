import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Calendar from './Calendar';
import api from '@/lib/api';
import {calendarBuckets,localCalendarDate} from '@/lib/calendarView';
const cid='demo_brawndo',user={role:'super_admin',user_id:'demo-user',workspace_mode:'demo'};
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/calendar',search:'?client_id=demo_brawndo'})}),{virtual:true});
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'demo_brawndo',currentClient:{client_id:'demo_brawndo',name:'Brawndo',status:'active'}})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({workspaceMode:'demo',user:{role:'super_admin',user_id:'demo-user',workspace_mode:'demo'}})}));
jest.mock('@/lib/clientSelection',()=>({selectedClient:()=> 'demo_brawndo'}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));
jest.mock('@/components/RecordDrawer',()=>()=>null);
test('canonical pilot opens fresh native Review occurrence, cancels draft, and saves the original versioned native date command',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;global.crypto=require('crypto').webcrypto;sessionStorage.clear();localStorage.clear();
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container),day=localCalendarDate(new Date());
 const record={review_id:'r',client_id:cid,title:'Native occurrence',status:'upcoming',due_date:day+'T14:30:00-04:00',updated_at:'version-a',current_occurrence_id:'occ-exact',recurrence:'quarterly'};
 let saved=false,resolveSummary;
 api.get.mockImplementation(async(path,{params}={})=>{
   if(path==='/calendar'&&saved&&Date.parse(params.end)-Date.parse(params.start)===7*86400000)return new Promise(resolve=>{resolveSummary=()=>resolve({data:calendarBuckets({reviews:[record]},user,params)});});
   return {data:path==='/calendar'?calendarBuckets({reviews:[record]},user,params):path.endsWith('/members')?[{user_id:'demo-user',name:'Dana Evans'}]:{...record}};
 });
 api.patch.mockImplementation(async(_,patch)=>{Object.assign(record,patch);saved=true;return {data:record};});
 const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent===text);
 const date=localCalendarDate(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()+8));
 const change=async()=>{const input=document.querySelector('input[type="date"]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,date);input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new Event('input',{bubbles:true}));});};
 try {
 await act(async()=>root.render(<Calendar/>));expect(container.querySelector('.bdcal')).not.toBeNull();expect(container.querySelectorAll('.kcell')[2].querySelector('strong').textContent).toBe('1');
 const chip=()=>container.querySelector('[data-testid="cal-item-review:r:occ-exact"]');
 await act(async()=>chip().click());await change();await act(async()=>button('Cancel').click());expect(api.patch).not.toHaveBeenCalled();
 record.updated_at='version-fresh';await act(async()=>chip().click());expect(document.querySelector('input[type="date"]').value).toBe(day);await change();
 await act(async()=>document.querySelector('[role="dialog"] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch).toHaveBeenCalledWith('/reviews/r',{due_date:date+'T14:30:00-04:00',expected_updated_at:'version-fresh',expected_occurrence_id:'occ-exact',calendar_move:true},{headers:{'Idempotency-Key':expect.any(String)},pendingCommandGeneration:expect.any(Number)});
 expect(api.get.mock.calls.filter(([path])=>path==='/reviews/r')).toHaveLength(2);expect(record.recurrence).toBe('quarterly');
 // The main period has refreshed, but the independent summary read is still pending.
 expect(container.querySelectorAll('.kcell')[0].disabled).toBe(false);expect(resolveSummary).toEqual(expect.any(Function));
 for(const tile of [...container.querySelectorAll('.kcell')].slice(1,3)){expect(tile.disabled).toBe(true);expect(tile.querySelector('strong').textContent).toBe('\u2014');expect(tile.querySelector('small').textContent).toBe('Loading\u2026');}
 await act(async()=>resolveSummary());
 const soon=container.querySelectorAll('.kcell')[2];expect(soon.disabled).toBe(false);expect(soon.querySelector('strong').textContent).toBe('0');expect(soon.querySelector('small').textContent).toBe('Nothing due in 7 days');
 } finally {await act(async()=>root.unmount());container.remove();}
});
