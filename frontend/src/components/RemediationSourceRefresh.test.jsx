import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'demo_admin',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/commandTestAdapter').previewAdapter}),formatError:error=>error.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
jest.mock('./ui/dialog',()=>{
  const React=require('react'),Close=React.createContext(()=>{});
  return {
    Dialog:({open,children,onOpenChange})=>open?<Close.Provider value={onOpenChange}>{children}</Close.Provider>:null,
    DialogContent:React.forwardRef(({children,onOpenAutoFocus,onCloseAutoFocus,onEscapeKeyDown,onPointerDownOutside,...props},ref)=>{
      const change=React.useContext(Close);
      return <section ref={ref} {...props}>{children}<button aria-label="Close drawer" onClick={()=>change(false)}>Close</button></section>;
    }),
    DialogTitle:React.forwardRef(({children,...props},ref)=><h2 ref={ref} {...props}>{children}</h2>),
    DialogDescription:({children})=><p>{children}</p>,
  };
});

let container,root,task,finding,assessment,evidence;
const button=(surface,text)=>[...surface.querySelectorAll('button')].find(node=>node.textContent===text);
const click=(surface,text)=>act(async()=>button(surface,text).click());
const close=surface=>act(async()=>surface.querySelector('[aria-label="Close drawer"]').click());
const text=async(surface,label,value)=>act(async()=>{
  const node=surface.querySelector('[aria-label="'+label+'"]');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});

beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  await api.post('/demo/enter');
  task=(await api.get('/tasks',{params:{client_id:'demo_brawndo'}})).data.find(row=>row.task_id==='demo_brawndo_cis_action_1.1');
  await api.patch('/tasks/'+task.task_id,{status:'done',description:'Synthetic saved corrective plan.',resolution:'Synthetic completed work retained on reopen.'});
  await api.post('/findings/'+task.finding_id+'/validate',{rationale:'Synthetic verified corrective work'});
  task=(await api.get('/tasks/'+task.task_id)).data;
  finding=(await api.get('/findings/'+task.finding_id)).data;
  assessment=(await api.get('/framework_assessments/'+finding.framework_assessment_id)).data;
  evidence=(await api.get('/evidence',{params:{client_id:task.client_id}})).data;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();sessionStorage.clear();localStorage.clear();});

test.each([false,true])('returning from the same source ticket reopen refreshes its Action Items view and preserves parent drafts (%s)',async withDraft=>{
  const onSaved=jest.fn(),onClose=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={task} clientId={task.client_id} onSaved={onSaved} onOpenChange={onClose}/>));
  const original=container.querySelector('[data-testid="remediation-ticket-drawer"]');
  expect(original.textContent).toContain('Completed');
  const planned=original.querySelector('[aria-label="Planned action"]'),savedPlan=planned.value;
  if(withDraft)await text(original,'Planned action','Unsaved parent action draft stays here.');
  await click(original,'CIS Controls v8.1 Assessment → Safeguard 1.1');
  const source=container.querySelector('[data-testid="brawndo-cis-assessment"]');
  await click(source,'Findings');
  const sourceTicket=source.querySelector('[data-ticket-id="finding:'+finding.finding_id+'"]');
  await act(async()=>sourceTicket.querySelector('button').click());
  const nested=[...container.querySelectorAll('[data-testid="remediation-ticket-drawer"]')].at(-1);
  expect(onSaved).not.toHaveBeenCalled();
  await click(nested,'Reopen ticket');
  expect(nested.textContent).toContain('Ticket reopened. Previous completed work and decisions are retained.');
  const currentFinding=(await api.get('/findings/'+finding.finding_id)).data;
  const currentTasks=(await api.get('/tasks',{params:{client_id:task.client_id}})).data.filter(row=>row.finding_id===finding.finding_id);
  expect(currentFinding.finding_id).toBe(finding.finding_id);expect(currentFinding.status).toBe('in_remediation');
  expect(currentTasks).toHaveLength(2);expect(currentTasks.find(row=>row.task_id===task.task_id)).toMatchObject({status:'done',resolution:task.resolution});
  await close(nested);await close(source);
  expect(container.querySelectorAll('[data-testid="remediation-ticket-drawer"]')).toHaveLength(1);
  const returned=container.querySelector('[data-testid="remediation-ticket-drawer"]');
  expect(returned.querySelector('h2').nextElementSibling.textContent).toBe('finding:'+finding.finding_id);
  expect(returned.querySelectorAll('[data-ticket-task]')).toHaveLength(2);
  expect(returned.querySelector('[data-ticket-task="'+currentFinding.primary_task_id+'"] [aria-label="Work status"]').value).toBe('open');
  expect(button(returned,'Reopen ticket')).toBeUndefined();expect(onSaved).toHaveBeenCalled();
  expect(returned.querySelector('[data-ticket-task="'+task.task_id+'"] [aria-label="Planned action"]').value).toBe(withDraft?'Unsaved parent action draft stays here.':savedPlan);
  if(withDraft){
    const leaving=new Event('beforeunload',{cancelable:true});window.dispatchEvent(leaving);expect(leaving.defaultPrevented).toBe(true);
  }
  expect(onClose).not.toHaveBeenCalled();
  const after=(await api.get('/framework_assessments/'+finding.framework_assessment_id)).data;
  for(const field of ['status','implementation','verification','last_saved','assessment_history'])expect(after[field]).toEqual(assessment[field]);
  expect((await api.get('/evidence',{params:{client_id:task.client_id}})).data).toEqual(evidence);
  expect(currentTasks.find(row=>row.task_id===task.task_id).description).toBe(savedPlan);
},30000); // Includes the native Source drawer's related-record and return refreshes.
