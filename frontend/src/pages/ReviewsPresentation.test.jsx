import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
let mockRole='super_admin';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'admin',role:mockRole}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'visual-test',currentClient:{name:'Test client'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/reviews',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>props=>props.open?<div data-testid="opened-record">{props.record?.title||'New record'}</div>:null);
let root, container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockRole='super_admin';
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async path=>({data:path==='/users'?[{user_id:'owner',name:'Alicia Rivera'}]:path==='/reviews'?[
    {review_id:'r',client_id:'visual-test',title:'Quarterly access check',review_type:'access',status:'upcoming',due_date:'2020-09-30',recurrence:'quarterly',owner_id:'owner'},
    {review_id:'future',client_id:'visual-test',title:'Future check',review_type:'backup',status:'upcoming',due_date:'2099-01-01',recurrence:'annual'},
    {review_id:'closed',client_id:'visual-test',title:'Historical check',review_type:'access',status:'completed',due_date:'2020-01-01',recurrence:'none'}
  ]:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('pilot preserves rows, columns, status, selection and authoritative record opening',async()=>{
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('.register-surface[data-layout="reviews"]')).toBeTruthy();
  expect(container.querySelectorAll('thead th')).toHaveLength(10);
  expect(container.querySelector('th[data-column="basis"]').textContent).toContain('Basis');
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]')).toHaveLength(2);
  expect(container.querySelector('[data-testid="reviews-row-0"]').textContent).toContain('Quarterly');
  expect(container.querySelector('[data-testid="reviews-status-0"]').textContent).toBe('overdue');
  expect(container.querySelector('[data-testid="reviews-unassigned-1"]').textContent).toBe('Unassigned');
  await act(async()=>container.querySelector('[data-testid="reviews-select-0"]').click());
  expect(container.querySelector('[data-testid="reviews-row-0"]').dataset.selected).toBe('true');
  expect(container.querySelector('[data-testid="bulk-selected-count"]').textContent).toBe('1');
  await act(async()=>container.querySelector('.register-record-link').click());
  expect(container.querySelector('[data-testid="opened-record"]').textContent).toBe('Quarterly access check');
});
test('quick-filter and history constraints remain unchanged',async()=>{
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  await act(async()=>container.querySelector('[data-testid="reviews-tab-overdue"]').click());
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]')).toHaveLength(1);
  expect(container.querySelector('[data-testid="reviews-tab-overdue"]').getAttribute('aria-pressed')).toBe('true');
  await act(async()=>container.querySelector('[data-testid="reviews-history-link"]').click());
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]')).toHaveLength(1);
  expect(container.querySelector('[data-testid="reviews-row-0"]').textContent).toContain('Historical check');
});
test('other registers share the surface without inheriting Reviews column geometry',async()=>{
  await act(async()=>root.render(<RecordListPage kind="findings"/>));
  expect(container.querySelector('.register-surface')).toBeTruthy();
  expect(container.querySelector('colgroup')).toBeNull();
});
test('visual treatment does not grant write actions to a viewer',async()=>{
  mockRole='client_viewer';
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[data-testid="create-reviews-button"]')).toBeNull();
  expect(container.querySelector('[data-testid="reviews-delete-0"]')).toBeNull();
});
