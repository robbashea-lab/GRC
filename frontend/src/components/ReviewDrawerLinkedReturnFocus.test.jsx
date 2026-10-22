import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import RemediationTicketDrawer from './RemediationTicketDrawer';
import api from '@/lib/api';
import {readStore} from '../preview/store';

let mockUser,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:'demo',loading:false})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>true}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:e=>e.response?.data?.detail||e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));

let root,container,background,record,linkedFinding,onOpenChange;
const drawer=()=>document.querySelector('[data-testid="reviews-drawer"]');
const ticket=()=>document.querySelector('[data-testid="remediation-ticket-drawer"]');
const heading=()=>drawer()?.querySelector('[data-review-title]');
const button=(scope,label)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===label);
// Allow the real native focus scopes to complete their deferred teardown.
const flushNativeFocus=()=>act(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
const click=async node=>{expect(node).toBeTruthy();await act(async()=>{node.focus();node.click();});};
const render=()=>act(async()=>root.render(<ReviewDrawer open record={record} clientId={record.client_id} onOpenChange={onOpenChange}/>));
async function openHistoryTicket(){
  await render();
  expect(drawer().classList.contains('brawndo-review-workflow')).toBe(true);
  await click(button(drawer(),'1 finding raised'));await flushNativeFocus();
  const popover=document.querySelector('[aria-label="Findings from this occurrence"]');
  expect(popover).toBeTruthy();
  await click(button(popover,'Restore reviewed access'));await flushNativeFocus();
  expect(ticket()).toBeTruthy();
}
beforeEach(async()=>{
  root=null;container=null;background=null;
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  mockUser=(await api.post('/demo/enter')).data.user;
  const clients=(await api.get('/clients')).data;
  mockOrg={currentClientId:'demo_brawndo',currentClient:clients.find(client=>client.client_id==='demo_brawndo'),clients,loading:false};
  record=(await api.post('/reviews',{client_id:'demo_brawndo',title:'Linked return focus review',review_type:'access',recurrence:'quarterly',due_date:'2099-09-30'})).data;
  linkedFinding=(await api.post(`/reviews/${record.review_id}/create-finding`,{request_id:crypto.randomUUID(),title:'Recorded access exception',remediation_title:'Restore reviewed access',occurrence_id:record.current_occurrence_id})).data;
  background=document.createElement('main');background.innerHTML='<h1 tabindex="-1">Brawndo Reviews</h1>';document.body.appendChild(background);
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);onOpenChange=jest.fn();
});
afterEach(async()=>{if(root)await act(async()=>root.unmount());container?.remove();background?.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test('Cancel from the native history-linked ticket returns focus to the still-open parent Review heading',async()=>{
  await openHistoryTicket();const parentHeading=heading();
  const patch=jest.spyOn(api,'patch'),post=jest.spyOn(api,'post');
  await click(button(ticket(),'Cancel'));await flushNativeFocus();
  expect(ticket()).toBeNull();expect(drawer()).toBeTruthy();
  expect(document.activeElement).toBe(parentHeading);
  expect(onOpenChange).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
});

test('dirty linked ticket keeps editing in the child and explicit Discard returns to the parent without saving',async()=>{
  await openHistoryTicket();const parentHeading=heading();
  const field=ticket().querySelector('[aria-label="Planned action"]');expect(field).toBeTruthy();
  const patch=jest.spyOn(api,'patch'),post=jest.spyOn(api,'post');
  await act(async()=>{field.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Unsaved native remediation draft');field.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(button(ticket(),'Cancel'));await flushNativeFocus();
  expect(document.body.textContent).toContain('Discard unsaved ticket changes?');
  await click(button(document,'Keep editing'));await flushNativeFocus();
  expect(ticket()).toBeTruthy();expect(ticket().contains(document.activeElement)).toBe(true);
  expect(field.value).toBe('Unsaved native remediation draft');expect(document.activeElement).not.toBe(parentHeading);
  await click(button(ticket(),'Cancel'));await flushNativeFocus();await click(button(document,'Discard changes'));await flushNativeFocus();
  expect(ticket()).toBeNull();expect(document.activeElement).toBe(parentHeading);
  expect(onOpenChange).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
});

test.each(['identity','role'])('linked return does not restore an earlier Review focus receipt after %s changes',async change=>{
  await openHistoryTicket();const parentHeading=heading();
  mockUser={...mockUser,...(change==='identity'?{user_id:'different-native-actor'}:{role:'client_viewer'})};
  await render();
  const patch=jest.spyOn(api,'patch'),post=jest.spyOn(api,'post');
  await click(button(ticket(),'Cancel'));await flushNativeFocus();
  expect(ticket()).toBeNull();expect(document.activeElement).not.toBe(parentHeading);
  expect(onOpenChange).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
});

test('native ticket without an explicit parent return still restores its connected opener',async()=>{
  const opener=document.createElement('button');opener.textContent='Open native ticket';background.appendChild(opener);opener.focus();
  function NativeTicket(){
    const [open,setOpen]=React.useState(true);
    return <RemediationTicketDrawer open={open} onOpenChange={setOpen} kind="findings" record={linkedFinding} clientId={record.client_id}/>;
  }
  await act(async()=>root.render(<NativeTicket/>));await flushNativeFocus();
  expect(ticket()).toBeTruthy();
  const patch=jest.spyOn(api,'patch'),post=jest.spyOn(api,'post');
  await click(button(ticket(),'Cancel'));await flushNativeFocus();
  expect(ticket()).toBeNull();expect(document.activeElement).toBe(opener);
  expect(patch).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
});
test('seeded Account Authorization & Access Review Q3 ticket Cancel returns to its open Q4 parent Review heading',async()=>{
  const historicalFinding=readStore().findings.find(row=>row.finding_id==='demo_brawndo_finding_0');
  expect(historicalFinding?.review_id).toBeTruthy();
  record=(await api.get('/reviews/'+historicalFinding.review_id)).data;
  expect(record.client_id).toBe('demo_brawndo');expect(record.title).toBe('Account Authorization & Access Review');
  await render();
  const history=drawer().querySelector('[data-testid="review-history"]');expect(history).toBeTruthy();
  expect(history.querySelector('.is-current td').textContent).toBe('Q4 2026');
  const q3=[...history.querySelectorAll('tbody tr')].find(row=>row.querySelector('td')?.textContent==='Q3 2026');
  expect(q3).toBeTruthy();
  await click(button(q3,'1 finding'));await flushNativeFocus();
  const popover=document.querySelector('[aria-label="Findings from this occurrence"]');expect(popover).toBeTruthy();
  const linked=popover.querySelector('[data-ticket-id="finding:demo_brawndo_finding_0"]');expect(linked).toBeTruthy();
  await click(linked.querySelector('button'));await flushNativeFocus();
  expect(ticket()).toBeTruthy();const parentHeading=heading();
  const patch=jest.spyOn(api,'patch'),post=jest.spyOn(api,'post');
  await click(button(ticket(),'Cancel'));await flushNativeFocus();
  expect(ticket()).toBeNull();expect(drawer()).toBeTruthy();expect(document.activeElement).toBe(parentHeading);
  expect(onOpenChange).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
});