import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OrganizationalControls from './OrganizationalControls';
import api from '@/lib/api';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'demo_admin',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
let root,container;
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const click=async text=>act(async()=>button(text).click());
async function fill(label,value){await act(async()=>{const el=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(async()=>{global.IS_REACT_ACT_ENVIRONMENT=true;global.crypto=require('crypto').webcrypto;sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('create, save, reopen, guard draft and retain an independent criterion assessment',async()=>{
  const cid='demo_prestige',w=(await api.get('/frameworks/soc-2',{params:{client_id:cid}})).data,a=w.assessments[0],onDraft=jest.fn();
  await act(async()=>root.render(<OrganizationalControls clientId={cid} assessmentId={a.framework_assessment_id} onDraftChange={onDraft}/>));
  await click('Create organizational Control');await fill('Organizational Control name','Browser-equivalent control');await fill('Organizational Control design','Synthetic operating design');
  await click('Close Control');expect(document.body.textContent).toContain('Leave unsaved Control work?');await click('Keep editing');
  await click('Save Control');expect(document.body.textContent).toContain('Criterion assessments are unchanged.');await click('Close Control');
  await click('Browser-equivalent control');expect(document.querySelector('[aria-label="Organizational Control design"]').value).toBe('Synthetic operating design');
  expect((await api.get('/framework_assessments/'+a.framework_assessment_id)).data.status).toBe(a.status);
  expect(onDraft).toHaveBeenCalledWith(true);expect(document.querySelector('[role="dialog"]').getAttribute('aria-describedby')).toBeTruthy();
});

test('conflicting source designs require an explicit decision and remain visible after reconciliation',async()=>{
  const cid='demo_prestige',w=(await api.get('/frameworks/soc-2',{params:{client_id:cid}})).data;
  for(const [i,a] of w.assessments.slice(0,2).entries())await api.patch('/framework_assessments/'+a.framework_assessment_id,{management_controls:[{control_id:'conflict-test',name:'Reconcile supplier access',description:i?'Supplier scope':'Workforce scope',frequency:'Quarterly',design:'adequate'}]});
  await api.post('/organizational-controls/migrate',{client_id:cid});
  await act(async()=>root.render(<OrganizationalControls clientId={cid} assessmentId={w.assessments[0].framework_assessment_id}/>));
  await click('Reconcile supplier access');
  expect(document.body.textContent).toContain('Reconciliation required');
  expect(document.querySelector('[aria-label="Organizational Control design"]').value).toBe('');
  expect(button('Record period observation').disabled).toBe(true);
  await fill('Organizational Control design','Workforce and supplier scope');
  await act(async()=>[...document.querySelectorAll('label')].find(e=>e.textContent==='Resolve documented conflicts with this design').querySelector('input').click());
  await fill('Control reconciliation decision','Both owners agreed to cover both populations');
  await click('Save Control');
  expect(document.body.textContent).not.toContain('Reconciliation required');
  expect(document.body.textContent).toContain('Supplier scope');
  expect(document.body.textContent).toContain('Workforce scope');
  expect(button('Record period observation').disabled).toBe(false);
});

test('failed save retains draft and never reports success',async()=>{
  await act(async()=>root.render(<OrganizationalControls clientId="demo_prestige"/>));
  await click('Create organizational Control');await fill('Organizational Control name','Unsaved control');
  const fail=jest.spyOn(api,'post').mockRejectedValueOnce(new Error('Synthetic write failure'));
  await click('Save Control');expect(document.querySelector('[role="alert"]').textContent).toContain('Synthetic write failure');
  expect(document.querySelector('[aria-label="Organizational Control name"]').value).toBe('Unsaved control');
  expect(document.body.textContent).not.toContain('Control saved.');fail.mockRestore();
  await click('Close Control');expect(document.body.textContent).toContain('Leave unsaved Control work?');
});
