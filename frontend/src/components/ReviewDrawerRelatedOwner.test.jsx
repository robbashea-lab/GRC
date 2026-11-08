import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import {ids,saveStore} from '@/preview/store';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=>require('crypto').randomUUID()}));
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));

const clientsByFramework=Object.fromEntries(['iso-27001','cis-ig1'].map(key=>[key,'synthetic-qa006-'+key]));
let root,host,cid;
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  const db=Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]]));
  db.clients=Object.values(clientsByFramework).map(client_id=>({client_id,name:'Synthetic vendor owner QA',status:'active'}));
  db.requirements=Object.entries(clientsByFramework).map(([baseline_key,client_id])=>({requirement_id:client_id+'-enrollment',client_id,baseline_key,baseline_response:'applies'}));
  db.user={user_id:'synthetic-qa006-admin',name:'Synthetic administrator',email:'admin@example.test',role:'platform_admin',status:'active',workspace_mode:'demo',client_ids:Object.values(clientsByFramework)};
  db.users=[db.user,...[['business','Vendor business owner'],['reviewer','Different Review owner'],['assignee','Task assignee'],['risk-owner','Risk owner']].map(([user_id,name])=>({user_id,name,email:user_id+'@example.test',role:'client_contributor',status:'active',client_ids:Object.values(clientsByFramework)}))];
  Object.assign(db,{logs:[],notifications:[],drafts:{},baselines:{}});saveStore(db,{resetFiles:true});
  mockAuth={user:(await api.post('/demo/enter')).data.user,workspaceMode:'demo',loading:false,error:''};
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();});
async function fixture(framework='iso-27001',business_owner_id='business'){
  cid=clientsByFramework[framework];rememberClient(cid);window.history.replaceState({},'',`/reviews?client_id=${cid}`);
  const clients=(await api.get('/clients')).data,client=clients.find(row=>row.client_id===cid);
  mockOrg={currentClientId:cid,currentClient:client,clients,loading:false,error:''};
  const vendor=(await api.post('/vendors',{client_id:cid,name:'Synthetic service provider',service:'Disposable owner display QA',business_owner_id,next_review:'2099-10-27',review_frequency:'annual'})).data;
  const review=(await api.post('/vendors/'+vendor.vendor_id+'/schedule-review',{})).data.review;
  const saved=(await api.patch('/reviews/'+review.review_id,{owner_id:'reviewer',expected_occurrence_id:review.current_occurrence_id,expected_updated_at:review.updated_at??null})).data;
  // Native schedule/Review configuration may refresh Vendor metadata; capture after setup writes.
  return {vendor:(await api.get('/vendors/'+vendor.vendor_id)).data,review:saved};
}
async function related({review}){
  await act(async()=>root.render(<ReviewDrawer open record={review} clientId={cid} onOpenChange={()=>{}}/>));
  const tab=[...document.querySelectorAll('button')].find(value=>value.textContent==='Related');expect(tab).toBeTruthy();await act(async()=>tab.click());
}
const row=id=>[...document.querySelectorAll('tbody tr')].find(value=>[...value.querySelectorAll('button')].some(button=>button.textContent===id));
const owner=id=>{expect(row(id)).toBeTruthy();return row(id).querySelectorAll('td')[2].textContent;};

test.each(['iso-27001','cis-ig1'])('%s Related Vendor uses the business owner, independently of its Review owner',async framework=>{
  const target=await fixture(framework),post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');await related(target);
  expect(owner(target.vendor.vendor_id)).toBe('Vendor business owner');expect(owner(target.vendor.vendor_id)).not.toBe('Different Review owner');
  expect((await api.get('/vendors/'+target.vendor.vendor_id)).data).toEqual(target.vendor);
  expect((await api.get('/reviews/'+target.review.review_id)).data.owner_id).toBe('reviewer');
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});

test('a Vendor with no business owner remains Unassigned rather than borrowing its Review owner',async()=>{
  const target=await fixture('iso-27001',null),post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');await related(target);
  expect(owner(target.vendor.vendor_id)).toBe('Unassigned');expect((await api.get('/vendors/'+target.vendor.vendor_id)).data.business_owner_id).toBeNull();
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});

test('other Related record kinds retain native assignee and owner bindings',async()=>{
  const target=await fixture();
  const task=(await api.post('/tasks',{client_id:cid,title:'Synthetic assigned task',source_type:'review',source_id:target.review.review_id,assignee_id:'assignee'})).data;
  const risk=(await api.post('/risks',{client_id:cid,title:'Synthetic owned Risk',source_type:'review',source_id:target.review.review_id,owner_id:'risk-owner'})).data;
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');await related(target);
  expect(owner(target.vendor.vendor_id)).toBe('Vendor business owner');expect(owner(task.task_id)).toBe('Task assignee');expect(owner(risk.risk_id)).toBe('Risk owner');
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});
