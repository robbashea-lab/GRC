import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import VendorRegister from './VendorRegister';
import {vendorQuarterlyTimelineEvents} from '@/components/BrawndoAdditionalVendors';
import {savedDate} from '@/components/BrawndoAdditionalPolicyVendorCells';
import {managementDay} from '@/lib/managementDates';
import {cisClient} from '@/testUtils/cisExperience';
import api from '@/lib/api';

let mockAuth,mockOrg,mockParams,root,host,records,reviews,sequence=0;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/clientSelection',()=>({selectedClient:()=>mockOrg.currentClientId}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message,PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn(),useLocation:()=>({pathname:'/vendors',search:''}),useSearchParams:()=>{
  const [params,setParams]=require('react').useState(new URLSearchParams(mockParams));
  return [params,next=>{mockParams=String(next);setParams(next);}];
}}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>props=>props.open?<aside data-testid="native-vendor-record">{props.record?.vendor_id}</aside>:null);

const id='arbitrary-native-vendor-client';
const day=offset=>new Date((managementDay()+offset)*86400000).toISOString().slice(0,10);
const vendor=(vendor_id,name,extra={})=>({vendor_id,client_id:id,name,status:'active',criticality:'low',business_owner_id:'native-owner',assurance_records:[],...extra});
const noWrites=()=>{expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();};
const names=()=>[...host.querySelectorAll('[data-testid^="vendor-row-"] .bapv-name')].map(node=>node.textContent).sort();
const click=node=>act(async()=>node.click());
const select=(node,value)=>act(async()=>{node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));});
function context(mode,framework){
  mockAuth={workspaceMode:mode,user:{user_id:`native-vendor-reader-${++sequence}`,role:'super_admin',...(mode==='demo'?{workspace_mode:'demo'}:{})}};
  const client=framework==='cis-ig1'?cisClient(id,1):{client_id:id,name:'Arbitrary native organization',status:framework?'active':'onboarding',cis_program:null,shared_programs:[],onboarding_baseline:{completed:!!framework,requirements:framework&&framework!=='general'?{[framework]:'applies'}:{}}};
  mockOrg={currentClientId:id,currentClient:client,clients:[client],loading:false};
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockParams='';localStorage.clear();sessionStorage.clear();
  context('standard',null);
  records=[vendor('linked60','Linked Review in 60 days',{business_owner_id:null}),vendor('linkedPast','Linked past Review'),vendor('unlinked','Saved date without Review',{next_review:day(10)}),vendor('linked91','Linked Review outside window'),vendor('assurance','Required assurance missing',{assurance_required:true,assurance_records:[{type:'SOC 2',required:true}]}),vendor('inactive','Inactive retained vendor',{status:'inactive',business_owner_id:null})];
  reviews=[['linked60',60],['linkedPast',-5],['linked91',91]].map(([vendor_id,offset])=>({review_id:`review-${vendor_id}`,client_id:id,vendor_id,vendor_purpose:'vendor',status:'upcoming',due_date:day(offset)}));
  api.get.mockImplementation(async path=>({data:path==='/vendors'?records:path==='/reviews'?reviews:[]}));
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});

test.each(['demo','standard'].flatMap(mode=>[null,'general','hipaa','nist-csf-2','cmmc'].map(framework=>[mode,framework])))('%s %s Vendor counts and rows preserve the linked native 90-day and assurance populations',async(mode,framework)=>{
  context(mode,framework);const before=JSON.stringify([records,reviews]);
  await act(async()=>root.render(<VendorRegister/>));
  expect(host.querySelector('[data-testid=vendor-view-review_due] span').textContent).toBe('2');
  expect(host.querySelector('[data-testid=vendor-view-review_overdue] span').textContent).toBe('1');
  expect(host.querySelector('[data-testid=vendor-view-assurance] span').textContent).toBe('1');
  await click(host.querySelector('[data-testid=vendor-view-review_due]'));
  expect(names()).toEqual(['Linked Review in 60 days','Linked past Review']);
  expect(host.querySelector('.bapv-summary').textContent).toContain('Showing 2 of 2 vendors');
  await click(host.querySelector('[data-testid=vendor-view-assurance]'));
  expect(names()).toEqual(['Required assurance missing']);
  expect(JSON.stringify([records,reviews])).toBe(before);noWrites();
});

test.each(['demo','standard'])('%s generic All records and Unassigned reuse valid native views and the Owner empty filter',async mode=>{
  context(mode,'general');await act(async()=>root.render(<VendorRegister/>));
  await select(host.querySelector('[aria-label="Other vendor views"]'),'all');
  expect(names()).toHaveLength(6);expect(mockParams).toContain('view=all');
  mockOrg={...mockOrg,loading:true};await act(async()=>root.render(<VendorRegister/>));
  mockOrg={...mockOrg,loading:false};await act(async()=>root.render(<VendorRegister/>));
  expect(names()).toHaveLength(6);expect(host.querySelector('[aria-label="Other vendor views"]').value).toBe('all');
  await select(host.querySelector('[aria-label="Other vendor views"]'),'unassigned');
  expect(names()).toEqual(['Linked Review in 60 days']);
  expect(host.querySelector('[aria-label="Remove Business Owner: Unassigned"]')).not.toBeNull();
  await click(host.querySelector('[aria-label="Remove Business Owner: Unassigned"]'));
  expect(names()).toHaveLength(5);noWrites();
});

test('retained generic Unassigned URL resolves through the native empty-owner filter without writes',async()=>{
  mockParams='view=unassigned';await act(async()=>root.render(<VendorRegister/>));
  expect(names()).toEqual(['Linked Review in 60 days']);
  expect(host.querySelector('[aria-label="Remove Business Owner: Unassigned"]')).not.toBeNull();
  expect(mockParams).not.toContain('view=unassigned');noWrites();
});

test('generic contract expiration/end values display without becoming renewal events or mutating records',async()=>{
  records=[vendor('expiration','Expiration only',{contract_expiration:day(15)}),vendor('end','Historical end only',{contract_end:day(21)}),vendor('renewal','Actual renewal',{contract_renewal:day(9),contract_expiration:day(18)})];reviews=[];
  const before=JSON.stringify(records);await act(async()=>root.render(<VendorRegister/>));
  const row=name=>[...host.querySelectorAll('[data-testid^="vendor-row-"]')].find(node=>node.querySelector('.bapv-name').textContent===name);
  expect(row('Expiration only').querySelector('.bav-renewal').textContent).toContain(savedDate(day(15)));
  expect(row('Historical end only').querySelector('.bav-renewal').textContent).toContain(savedDate(day(21)));
  expect(row('Actual renewal').querySelector('.bav-renewal').textContent).toContain(savedDate(day(9)));
  expect(row('Expiration only').querySelector('.bav-renewal').textContent).toContain('Expiration / end');
  expect(row('Historical end only').querySelector('.bav-renewal').textContent).toContain('Expiration / end');
  expect(vendorQuarterlyTimelineEvents(records,[]).filter(event=>event.kind==='ren').map(event=>event.vendor.vendor_id)).toEqual(['renewal']);
  await click(row('Expiration only').querySelector('.bapv-name'));
  expect(host.querySelector('[data-testid=native-vendor-record]').textContent).toBe('expiration');
  expect(JSON.stringify(records)).toBe(before);noWrites();
});

test('generic headers do not fabricate an interactive column, while enrolled assurance and renewal meaning remain native',async()=>{
  await act(async()=>root.render(<VendorRegister/>));
  expect(host.querySelector('[aria-label="Security assurance: sort and filter"], [aria-label="Security assurance: filter"]')).toBeNull();
  expect(host.querySelector('.bav-header').textContent).toContain('Security assurance');
  await act(async()=>root.unmount());root=createRoot(host);context('standard','cis-ig1');
  records=[vendor('cis-expiration','Enrolled expiration only',{contract_expiration:day(15)}),vendor('cis-no-linked','Enrolled saved date',{next_review:day(10)})];reviews=[];
  await act(async()=>root.render(<VendorRegister/>));
  expect(host.querySelector('[aria-label="Security assurance: filter"]')).not.toBeNull();
  expect(host.querySelector('[data-testid=vendor-view-review_due] span').textContent).toBe('1');
  const expiration=[...host.querySelectorAll('[data-testid^="vendor-row-"]')].find(node=>node.textContent.includes('Enrolled expiration only'));
  expect(expiration.querySelector('.bav-renewal').textContent).toContain('No renewal date');noWrites();
});
