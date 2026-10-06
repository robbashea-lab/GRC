import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
let mockClient='a',mockSearch='',mockDrawer,mockCommitNavigation;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'viewer',role:'client_viewer'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Client'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/reviews'}),useNavigate:()=>jest.fn(),useSearchParams:()=>{
 const React=require('react'),[params,setParams]=React.useState(new URLSearchParams(mockSearch));
 // Control the deferred BrowserRouter 7.18.4 navigation boundary without sleeps.
 return [params,next=>{mockCommitNavigation=()=>React.startTransition(()=>setParams(next));}];
}}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>props=>{mockDrawer=props;return props.open?<div data-testid="opened">{props.record.title}</div>:null;});
let root,container,record;
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='a';mockSearch='id=r&client_id=a';mockDrawer=null;mockCommitNavigation=null;
 record={review_id:'r',client_id:'a',title:'Exact Review',status:'upcoming',current_occurrence_id:'now',occurrences:[{occurrence_id:'old',status:'completed'}]};
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 api.get.mockImplementation(async path=>({data:path==='/reviews/r'?record:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const render=()=>act(async()=>root.render(<RecordListPage kind="reviews"/>));
test('opens exact authorized ID and stays closed while deep-link removal is deferred',async()=>{
 await render();expect(container.querySelector('[data-testid="opened"]').textContent).toBe('Exact Review');
 expect(api.get).toHaveBeenCalledWith('/reviews/r',expect.objectContaining({signal:expect.any(AbortSignal)}));
 await act(async()=>mockDrawer.onOpenChange(false));expect(container.querySelector('[data-testid="opened"]')).toBeNull();
 await act(async()=>mockCommitNavigation());expect(container.querySelector('[data-testid="opened"]')).toBeNull();
});
test('resolves historical occurrence through existing helper',async()=>{
 mockSearch+='&occurrence=old';await render();expect(mockDrawer.initialValues).toEqual({occurrence:record.occurrences[0]});
});
test('rejects unavailable historical occurrence rather than opening current execution',async()=>{
 mockSearch+='&occurrence=missing';await render();expect(mockDrawer.open).toBe(false);expect(container.textContent).toContain('requested Review occurrence is unavailable');
});
test('rejects linked client mismatch before exact record fetch',async()=>{
 mockSearch='id=r&client_id=b';await render();expect(api.get.mock.calls.some(([path])=>path==='/reviews/r')).toBe(false);expect(mockDrawer.open).toBe(false);
});
test('rejects a foreign record returned by endpoint',async()=>{
 record.client_id='b';await render();expect(mockDrawer.open).toBe(false);expect(container.textContent).toContain('another client');
});
test('ignores stale exact-ID response after client change',async()=>{
 let resolve;api.get.mockImplementation(path=>path==='/reviews/r'?new Promise(r=>{resolve=r;}):Promise.resolve({data:[]}));
 await render();mockClient='b';await render();await act(async()=>resolve({data:record}));expect(mockDrawer.open).toBe(false);
});

test('a pending linked response cannot replace another explicitly opened Review',async()=>{
 let resolve;const other={...record,review_id:'other',title:'Other Review'};
 api.get.mockImplementation(path=>path==='/reviews/r'?new Promise(r=>{resolve=r;}):Promise.resolve({data:[other]}));
 await render();
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Other Review').click());
 expect(container.querySelector('[data-testid="opened"]').textContent).toBe('Other Review');
 await act(async()=>resolve({data:record}));
 expect(container.querySelector('[data-testid="opened"]').textContent).toBe('Other Review');
});
