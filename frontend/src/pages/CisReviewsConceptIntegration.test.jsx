import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
import {cisClient as mockCisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';

const mockUser={user_id:'concept-history',role:'super_admin',workspace_mode:'demo'};
const mockClient={...mockCisClient('concept-client'),name:'Concept fixture'};
let mockOpened;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:'demo',loading:false})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient.client_id,currentClient:mockClient,clients:[mockClient],loading:false})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/reviews',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>props=>{mockOpened=props;return props.open?<div data-testid="native-editor"/>:null;});

let root,container;
const records=[
  {client_id:'concept-client',review_id:'alpha',title:'Alpha saved review',status:'completed',review_type:'ad_hoc',due_date:'2026-10-01',recurrence:'none',occurrences:[{occurrence_id:'old-alpha',status:'completed',due_date:'2026-10-01',completed_at:'2026-10-02'}]},
  {client_id:'concept-client',review_id:'zulu',title:'Zulu saved review',status:'completed',review_type:'ad_hoc',due_date:'2026-10-01',recurrence:'none',occurrences:[{occurrence_id:'new-zulu',status:'completed',due_date:'2026-10-01',completed_at:'2026-10-20'}]},
];
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;rememberClient(mockClient.client_id);
  api.get.mockImplementation(async path=>({data:path==='/reviews'?records:[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const click=node=>act(async()=>node.click());

test('History completion ordering yields to native column sorting and opens the exact saved occurrence',async()=>{
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  await click([...container.querySelectorAll('.register-heading button')].find(button=>button.textContent==='History'));
  expect(container.querySelector('.bdr-name').textContent).toBe('Zulu saved review');
  expect(container.querySelector('[aria-label="Sort reviews"]').value).toBe('completed_at:desc');
  await click(container.querySelector('.bdr-more summary'));
  const titleControl=container.querySelector('.bdr-more .column-control');
  await act(async()=>titleControl.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const ascending=[...document.querySelectorAll('[role="menuitemcheckbox"]')].find(item=>item.textContent==='A → Z');
  expect(ascending).toBeTruthy();await click(ascending);
  expect(container.querySelector('.bdr-name').textContent).toBe('Alpha saved review');
  expect(container.querySelector('[aria-label="Sort reviews"]').value).toBe('title:asc');
  await click(container.querySelector('.bdr-name'));
  expect(mockOpened.record.review_id).toBe('alpha');
  expect(mockOpened.initialValues.occurrence.occurrence_id).toBe('old-alpha');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
