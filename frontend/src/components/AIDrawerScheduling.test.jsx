import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AIDrawer from './AIDrawer';
import api from '@/lib/api';
import {AI_DEFAULTS} from '@/lib/aiGovernance';
import {AI_PILOT_DEFAULTS} from '@/lib/brawndoAI';

let mockRole='super_admin',mockConcept=false,mockClient='synthetic-nordic-client',mockReviews=[];
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'admin',role:mockRole}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClient:{client_id:mockClient,status:'active'}})}));
jest.mock('@/lib/reference',()=>({isReferencePresentation:()=>true,isReferenceWorkflow:()=>true}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>true}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('@/lib/evidenceContext',()=>({useEvidenceDownload:()=>jest.fn()}));
jest.mock('./AssigneeSelect',()=>({label,value,onChange,required})=><select aria-label={label} value={value||''} required={required} onChange={event=>onChange(event.target.value||null)}><option value="">Choose eligible user</option><option value="review-owner">Eligible Review owner</option></select>);
jest.mock('./RecordDrawer',()=>({kind,record})=><div data-testid="opened-record">{kind}:{record.review_id}</div>);
jest.mock('./ui/dialog',()=>{
  const {forwardRef}=require('react');
  return {Dialog:({open,children})=>open?<>{children}</>:null,DialogContent:({children})=><section>{children}</section>,DialogTitle:forwardRef(({children,...props},ref)=><h2 {...props} ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
});

let node,root,record;
const button=text=>[...node.querySelectorAll('button')].find(element=>element.textContent===text);
const fill=async(label,value)=>act(async()=>{const target=node.querySelector(`[aria-label="${label}"]`);const prototype=target.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(target,value);target.dispatchEvent(new Event(target.tagName==='SELECT'?'change':'input',{bubbles:true}));});
async function render(){await act(async()=>root.render(<AIDrawer open conceptPresentation={mockConcept} record={record} clientId={mockClient} onOpenChange={()=>{}}/>));}
async function scheduleDraft(){await act(async()=>button('Not scheduled · Schedule review').click());await fill('Review due date','2028-02-29');await fill('Review cadence','quarterly');await fill('Review owner','review-owner');}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();mockRole='super_admin';mockConcept=false;mockClient='synthetic-nordic-client';mockReviews=[];
  record={...AI_DEFAULTS,...AI_PILOT_DEFAULTS,ai_system_id:'new-native-ai',client_id:mockClient,display_id:'AI-001',name:'Synthetic Nordic AI',status:'draft',approval_status:'pending_assessment',updated_at:'loaded-ai-revision'};
  node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);
  api.get.mockImplementation(async path=>({data:path==='/ai_systems'?[record]:path==='/related'?{reviews:mockReviews}:[]}));
  api.post.mockImplementation(async()=>{const review={review_id:'canonical-review',ai_system_id:record.ai_system_id,client_id:mockClient,ai_review_purpose:'periodic',status:'upcoming',due_date:'2028-02-29'};mockReviews=[review];return {data:review};});
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});

test.each([false,true])('new saved Draft exposes explicit Next Review scheduling (concept: %s)',async concept=>{
  mockConcept=concept;await render();
  expect(button('Not scheduled · Schedule review')).toBeDefined();
  await act(async()=>button('Not scheduled · Schedule review').click());
  expect(node.querySelector('[aria-label="Review cadence"]').value).toBe('');
  expect(node.querySelector('[aria-label="Review owner"]').value).toBe('');
  expect(button('Schedule Review').disabled).toBe(true);
  await fill('Review due date','2028-02-29');await fill('Review cadence','quarterly');await fill('Review owner','review-owner');
  await act(async()=>button('Schedule Review').click());
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/ai_systems/new-native-ai/reviews',{due_date:'2028-02-29',recurrence:'quarterly',custom_recurrence_days:90,owner_id:'review-owner',expected_updated_at:'loaded-ai-revision'},expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)}}));
  expect(button('2028-02-29')).toBeDefined();expect(record.approval_status).toBe('pending_assessment');
});

test('current linked work opens the same canonical Review',async()=>{
  mockReviews=[{review_id:'existing-review',ai_system_id:record.ai_system_id,client_id:mockClient,ai_review_purpose:'periodic',status:'upcoming',due_date:'2028-02-29'}];
  await render();expect(button('Not scheduled · Schedule review')).toBeUndefined();
  await act(async()=>button('2028-02-29').click());
  expect(node.querySelector('[data-testid="opened-record"]').textContent).toBe('reviews:existing-review');expect(api.post).not.toHaveBeenCalled();
});

test('rejected stale scheduling retains the operator draft and honest error',async()=>{
  api.post.mockRejectedValueOnce(Error('Record changed since it was opened; reload before saving'));
  await render();await scheduleDraft();await act(async()=>button('Schedule Review').click());
  expect(node.querySelector('[role="alert"]').textContent).toContain('Record changed');
  expect(node.querySelector('[aria-label="Review due date"]').value).toBe('2028-02-29');
  expect(node.querySelector('[aria-label="Review cadence"]').value).toBe('quarterly');
  expect(node.querySelector('[aria-label="Review owner"]').value).toBe('review-owner');
});

test('changing client and subject clears unfinished scheduling without sending it',async()=>{
  await render();await scheduleDraft();mockClient='other-native-client';record={...record,client_id:mockClient,ai_system_id:'other-ai',updated_at:'other-revision'};await render();
  await act(async()=>button('Not scheduled · Schedule review').click());
  expect(node.querySelector('[aria-label="Review due date"]').value).toBe('');
  expect(node.querySelector('[aria-label="Review cadence"]').value).toBe('');
  expect(node.querySelector('[aria-label="Review owner"]').value).toBe('');expect(api.post).not.toHaveBeenCalled();
});

test.each(['client_contributor','client_readonly'])('role %s cannot start AI scheduling',async role=>{
  mockRole=role;await render();expect(button('Not scheduled · Schedule review')).toBeUndefined();expect(node.querySelector('#ai-review-schedule')).toBeNull();expect(api.post).not.toHaveBeenCalled();
});


test.each([false,true])('uncertain schedule retains its original command across drawer reopen (concept: %s)',async concept=>{
  mockConcept=concept;api.post.mockRejectedValueOnce(Object.assign(Error('Save is pending recovery'),{response:{status:503,headers:{}}}));
  await render();await scheduleDraft();await act(async()=>button('Schedule Review').click());
  const original=api.post.mock.calls[0];
  mockReviews=[{review_id:'canonical-review',ai_system_id:record.ai_system_id,client_id:mockClient,ai_review_purpose:'periodic',status:'upcoming',due_date:'2028-02-29'}];
  await act(async()=>root.render(null));record={...record,updated_at:'newer-ai-revision'};await render();
  expect(button('Retry original schedule')).toBeDefined();
  expect(node.querySelector('[aria-label="Review due date"]').value).toBe('2028-02-29');
  expect(node.querySelector('[aria-label="Review cadence"]').closest('fieldset').disabled).toBe(true);
  await act(async()=>button('Retry original schedule').click());
  expect(api.post.mock.calls[1]).toEqual(original);
  expect(button('Retry original schedule')).toBeUndefined();expect(button('2028-02-29')).toBeDefined();
});

test.each([false,true])('undated canonical Review opens existing work without implying a schedule (concept: %s)',async concept=>{
  mockConcept=concept;mockReviews=[{review_id:'undated-native-review',ai_system_id:record.ai_system_id,client_id:mockClient,ai_review_purpose:'periodic',status:'needs_scheduling',due_date:null}];
  await render();expect(button('Open scheduled Review')).toBeUndefined();
  await act(async()=>button('Open existing Review').click());
  expect(node.querySelector('[data-testid="opened-record"]').textContent).toBe('reviews:undated-native-review');expect(api.post).not.toHaveBeenCalled();
});
