import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AIRecordView from './AIRecordView';
import api from '@/lib/api';

let mockRole='super_admin',mockReviews=[];
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'actor',role:mockRole}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
jest.mock('./EvidencePanel',()=>()=>null);
jest.mock('./AssigneeSelect',()=>({label,value,onChange,required})=><select aria-label={label} value={value||''} required={required} onChange={event=>onChange(event.target.value||null)}><option value="">Choose eligible user</option><option value="review-owner">Eligible Review owner</option></select>);

let node,root,record,onRelated;
const button=text=>[...document.querySelectorAll('button')].find(element=>element.textContent===text);
const fill=async(label,value)=>act(async()=>{const target=document.querySelector(`[aria-label="${label}"]`),prototype=target.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(target,value);target.dispatchEvent(new Event(target.tagName==='SELECT'?'change':'input',{bubbles:true}));});
async function render(canWrite=true){await act(async()=>root.render(<AIRecordView record={record} clientId={record.client_id} users={[]} canWrite={canWrite} onClose={()=>{}} onEdit={()=>{}} onRelated={onRelated}/>));}
async function fillSchedule(){await act(async()=>button('Not scheduled · Schedule review').click());await fill('Review due date','2028-02-29');await fill('Review cadence','quarterly');await fill('Review owner','review-owner');}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();mockRole='super_admin';mockReviews=[];onRelated=jest.fn();record={ai_system_id:'ai-one',client_id:'new-client',name:'Synthetic Nordic AI',status:'draft',approval_status:'pending_assessment',updated_at:'ai-opened-revision'};
  node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);
  api.get.mockImplementation(async path=>({data:path==='/related'?{reviews:mockReviews}:[]}));
  api.post.mockImplementation(async()=>{const review={review_id:'canonical-review',ai_system_id:record.ai_system_id,client_id:record.client_id,ai_review_purpose:'periodic',status:'upcoming',due_date:'2028-02-29'};mockReviews=[review];return {data:review};});
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});

test('active record view schedules a new saved Draft through its Next review cell with explicit inputs',async()=>{
  await render();await act(async()=>button('Not scheduled · Schedule review').click());
  expect(document.querySelector('[aria-label="Review cadence"]').value).toBe('');expect(document.querySelector('[aria-label="Review owner"]').value).toBe('');expect(button('Schedule Review').disabled).toBe(true);
  await fill('Review due date','2028-02-29');await fill('Review cadence','quarterly');await fill('Review owner','review-owner');
  await act(async()=>{button('Schedule Review').click();button('Schedule Review').click();});
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/ai_systems/ai-one/reviews',{due_date:'2028-02-29',recurrence:'quarterly',owner_id:'review-owner',custom_recurrence_days:90,expected_updated_at:'ai-opened-revision'},expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)}}));
  expect(record.approval_status).toBe('pending_assessment');
  await act(async()=>button('Feb 29, 2028').click());expect(onRelated).toHaveBeenCalledWith('reviews','canonical-review');
});

test('existing linked Review opens its canonical identity without scheduling another',async()=>{
  mockReviews=[{review_id:'existing-native-review',ai_system_id:record.ai_system_id,client_id:record.client_id,ai_review_purpose:'periodic',status:'upcoming',due_date:'2028-02-29'}];
  await render();expect(button('Not scheduled · Schedule review')).toBeUndefined();await act(async()=>button('Feb 29, 2028').click());expect(onRelated).toHaveBeenCalledWith('reviews','existing-native-review');expect(api.post).not.toHaveBeenCalled();
});

test('stale scheduling keeps the explicit draft for recovery',async()=>{
  api.post.mockRejectedValueOnce(Error('Record changed since it was opened'));
  await render();await fillSchedule();await act(async()=>button('Schedule Review').click());
  expect(document.querySelector('[role="alert"]').textContent).toContain('Record changed');expect(document.querySelector('[aria-label="Review owner"]').value).toBe('review-owner');expect(document.querySelector('[aria-label="Review due date"]').value).toBe('2028-02-29');
});

test.each(['client_contributor','client_readonly'])('record view role %s cannot schedule',async role=>{
  mockRole=role;await render();expect(button('Not scheduled · Schedule review')).toBeUndefined();expect(api.post).not.toHaveBeenCalled();
});

test('subject changes clear unfinished scheduling before another client is shown',async()=>{
  await render();await fillSchedule();record={...record,client_id:'other-client',ai_system_id:'other-ai'};await render();await act(async()=>button('Not scheduled · Schedule review').click());expect(document.querySelector('[aria-label="Review due date"]').value).toBe('');expect(document.querySelector('[aria-label="Review cadence"]').value).toBe('');expect(document.querySelector('[aria-label="Review owner"]').value).toBe('');expect(api.post).not.toHaveBeenCalled();
});


test('uncertain schedule remains retryable after record reopen even when its canonical Review is visible',async()=>{
  api.post.mockRejectedValueOnce(Object.assign(Error('Save is pending recovery'),{response:{status:503,headers:{}}}));
  await render();await fillSchedule();await act(async()=>button('Schedule Review').click());
  const original=api.post.mock.calls[0];mockReviews=[{review_id:'canonical-review',ai_system_id:record.ai_system_id,client_id:record.client_id,ai_review_purpose:'periodic',status:'upcoming',due_date:'2028-02-29'}];
  await act(async()=>root.render(null));record={...record,updated_at:'newer-revision'};await render();
  expect(button('Retry original schedule')).toBeDefined();expect(document.querySelector('[aria-label="Review due date"]').value).toBe('2028-02-29');
  expect(document.querySelector('[aria-label="Review cadence"]').closest('fieldset').disabled).toBe(true);
  await act(async()=>button('Retry original schedule').click());
  expect(api.post.mock.calls[1]).toEqual(original);expect(button('Retry original schedule')).toBeUndefined();
});

test('legacy canonical Review with no due date remains honestly unscheduled and opens the same identity',async()=>{
  mockReviews=[{review_id:'legacy-needs-date',ai_system_id:record.ai_system_id,client_id:record.client_id,ai_review_purpose:'periodic',status:'needs_scheduling',due_date:null}];
  await render();expect(button('Open scheduled Review')).toBeUndefined();expect(document.querySelector('[aria-controls="ai-record-review-schedule"]')).toBeNull();
  await act(async()=>button('Open existing Review').click());expect(onRelated).toHaveBeenCalledWith('reviews','legacy-needs-date');expect(api.post).not.toHaveBeenCalled();
});
