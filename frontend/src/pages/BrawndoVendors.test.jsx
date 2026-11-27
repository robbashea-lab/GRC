import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import VendorRegister,{vendorTiles} from './VendorRegister';
import RecordDrawer from '@/components/RecordDrawer';
import {SCHEMAS} from '@/lib/schemas';
import api from '@/lib/api';
import {cisClient as mockCisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';
import {vendorSignals} from '@/lib/vendorGovernance';
let mockClient='demo_brawndo',mockSearch='';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:'demo',loading:false})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>{const client=mockClient==='demo_brawndo'?{...mockCisClient(mockClient),name:'Test'}:{client_id:mockClient,name:'Test',status:'active'};return {currentClientId:mockClient,currentClient:client,clients:[client],loading:false};}}));
// These register assertions retain the legacy table; native drawers still use actual CIS capability.
jest.mock('@/lib/brawndoAdditionalScope',()=>({useAdditionalSectionsSurface:()=>false,useAdditionalSectionsPresentation:()=>false}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useLocation:()=>({pathname:'/vendors',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams(mockSearch))}),{virtual:true});
jest.mock('@/components/EvidencePanel',()=>()=> <div>Existing evidence panel</div>);
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=> 'test-request-identity'}));
let root,container;
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
const choose=(node,value)=>act(async()=>{node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));});
const vendorButton=label=>[...document.querySelectorAll('[data-testid="vendors-drawer"] button')].find(node=>node.textContent===label);
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;window.history.replaceState({},'','/vendors');mockClient='demo_brawndo';mockSearch='';sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.get.mockImplementation(async path=>({data:path==='/related'?{}:path==='/vendors'?[{vendor_id:'v',client_id:mockClient,name:'Cloud QA',service:'Hosting',criticality:'high',status:'active',assurance_records:[]}]:[]}));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('shared vendor summary and assurance columns preserve creation across clients',async()=>{
  await act(async()=>root.render(<VendorRegister/>));expect(container.querySelector('.bpage h1').textContent).toBe('Vendors');expect(container.textContent).toContain('Test · Third parties');expect(container.querySelector('[data-testid="tile-critical_high"]').textContent).toContain('Cloud QA');expect(container.querySelector('[data-testid="vendor-row-0"] .bpage-meta').textContent).toBe('Hosting');expect(container.querySelector('[data-testid="vendor-foot"]').textContent).toBe('Showing 1 of 1 active vendors');
  expect(container.querySelector('[data-testid="vendor-row-0"] .register-identity-logo')).toBeNull();
  expect(container.querySelector('[data-testid="vendor-row-0"] .register-record-link').textContent).toBe('Cloud QA');
  await click(container.querySelector('[data-testid="new-vendor"]'));
  const dialog=document.querySelector('[data-testid="vendors-drawer"]');expect(dialog.className).toContain('brawndo-cis-assessment');expect(dialog.querySelector('[aria-label="Category"]')).toBeTruthy();expect(dialog.textContent).toContain('Add to register');
  await click(vendorButton('Cancel'));
  mockClient='demo_dunder';rememberClient(mockClient);await act(async()=>root.render(<VendorRegister/>));expect(container.querySelector('.bpage h1').textContent).toBe('Vendors');
  await click(container.querySelector('[data-testid="new-vendor"]'));expect(document.querySelector('[data-testid="vendors-drawer"] [aria-label="Category"]')).toBeTruthy();expect(document.querySelector('[data-testid="vendors-drawer"] [aria-label="Security Assurance Required"]')).toBeTruthy();
});
test('shared styling retains another client vendor Category and required assurance in the create payload',async()=>{
  mockClient='demo_dunder';rememberClient(mockClient);api.post.mockResolvedValue({data:{vendor_id:'created',client_id:mockClient}});
  await act(async()=>root.render(<VendorRegister/>));await click(container.querySelector('[data-testid="new-vendor"]'));
  const dialog=document.querySelector('[data-testid="vendors-drawer"]');
  expect(dialog.textContent).toContain('Category');expect(dialog.textContent).toContain('SaaS');
  expect(dialog.querySelector('select[data-testid="field-category"]').value).toBe('SaaS');
  await input(dialog.querySelector('[data-testid="field-name"]'),'Dunder vendor');await input(dialog.querySelector('[data-testid="field-service"]'),'Hosted service');
  await click(dialog.querySelector('[aria-label="Security Assurance Required"]'));
  await click(vendorButton('+ SOC 2 Report'));
  expect(document.querySelector('[aria-label="SOC 2 Report Required"]').checked).toBe(true);
  await click(vendorButton('Add to register'));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][0]).toBe('/vendors');
  const payload=api.post.mock.calls[0][1];
  expect(payload).toMatchObject({client_id:'demo_dunder',name:'Dunder vendor',service:'Hosted service',category:'SaaS',assurance_required:true});
  expect(payload.assurance_records).toHaveLength(1);
  expect(payload.assurance_records[0]).toMatchObject({type:'SOC 2',required:true,evidence_ids:[]});
  expect(api.post.mock.calls[0][2]).toMatchObject({headers:{'Idempotency-Key':'test-request-identity'}});
});
test('a future client shared register preserves under-review vendors and expiration-only contract dates',async()=>{
  mockClient='future-client';rememberClient(mockClient);const original=api.get.getMockImplementation();
  const retained={vendor_id:'legacy',client_id:mockClient,name:'Legacy review vendor',service:'Recorded hosting',category:'Retained custom category',status:'under_review',criticality:'high',contract_expiration:'2027-04-01',assurance_records:[]};
  api.get.mockImplementation(async(path,...args)=>path==='/vendors'?{data:[retained]}:original(path,...args));
  await act(async()=>root.render(<VendorRegister/>));
  expect(container.querySelector('[data-testid="vendor-row-0"]').textContent).toContain('Legacy review vendor');
  expect(container.querySelector('[data-testid="vendor-row-0"]').textContent).toContain('No renewal date');
  expect(container.querySelector('[data-testid="vendor-foot"]').textContent).toBe('Showing 1 of 1 active vendors');
  expect(container.querySelector('button[aria-label="Service / Product: sort and filter"]')).toBeTruthy();
  expect(container.querySelector('button[aria-label="Status: sort and filter"]')).toBeTruthy();
  expect(container.querySelectorAll('thead th')).toHaveLength(7);
  expect(container.querySelector('[data-testid="tile-critical_high"]').textContent).toContain('Legacy review vendor');
  await click(container.querySelector('[data-testid="vendor-row-0"]'));
  expect(document.querySelector('[aria-label="Category"]').value).toBe('Retained custom category');
  expect(document.querySelector('[aria-label="Relationship status"]').value).toBe('under_review');
  await click(vendorButton('Contract'));
  expect(document.querySelector('[data-testid="field-contract_expiration"]').value).toBe('2027-04-01');
  expect(document.querySelector('[data-testid="field-contract_renewal"]').value).toBe('');
  expect(retained.contract_expiration).toBe('2027-04-01');
  expect(retained.contract_renewal).toBeUndefined();
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
test('new vendor draft is protected and failed create remains open',async()=>{
  const close=jest.fn();api.post.mockRejectedValue(Object.assign(new Error('Save unavailable'),{response:{headers:{'x-create-rejected':'true'}}}));
  await act(async()=>root.render(<RecordDrawer open onOpenChange={close} kind="vendors" schema={SCHEMAS.vendors.fields} clientId={mockClient}/>));
  await input(document.querySelector('[data-testid="field-name"]'),'Draft vendor');await input(document.querySelector('[data-testid="field-service"]'),'Service');
  await input(document.querySelector('[data-testid="field-next_review"]'),'2026-10-15');await input(document.querySelector('[data-testid="field-contract_renewal"]'),'2027-04-01');
  await click(vendorButton('Add to register'));expect(close).not.toHaveBeenCalled();expect(document.querySelector('[data-testid="field-name"]').value).toBe('Draft vendor');
  expect(api.post.mock.calls[0][1]).toMatchObject({next_review:'2026-10-15',contract_renewal:'2027-04-01'});
  await click(vendorButton('Cancel'));expect(document.body.textContent).toContain('Discard unsaved changes?');expect(close).not.toHaveBeenCalled();
});

test('an uncertain vendor create blocks discard and explicitly retries its original schedules and identity',async()=>{
  const close=jest.fn(),onSaved=jest.fn();api.post.mockReset();
  api.post.mockRejectedValueOnce(Object.assign(new Error('Response lost'),{response:{status:503,headers:{}}}))
    .mockResolvedValueOnce({data:{vendor_id:'synthetic-created-vendor',client_id:mockClient}});
  await act(async()=>root.render(<RecordDrawer open onOpenChange={close} onSaved={onSaved} kind="vendors" schema={SCHEMAS.vendors.fields} clientId={mockClient}/>));
  await input(document.querySelector('[data-testid="field-name"]'),'Original vendor');
  await input(document.querySelector('[data-testid="field-service"]'),'Original service');
  await input(document.querySelector('[data-testid="field-next_review"]'),'2026-10-15');
  await input(document.querySelector('[data-testid="field-contract_renewal"]'),'2027-04-01');
  await click(vendorButton('Add to register'));
  expect(api.post).toHaveBeenCalledTimes(1);
  const original=api.post.mock.calls[0];
  expect(original[0]).toBe('/vendors');
  expect(original[1]).toMatchObject({client_id:mockClient,name:'Original vendor',service:'Original service',next_review:'2026-10-15',contract_renewal:'2027-04-01'});
  expect(original[2]).toMatchObject({headers:{'Idempotency-Key':'test-request-identity'}});
  await click(vendorButton('Cancel'));
  expect(close).not.toHaveBeenCalled();expect(onSaved).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.querySelector('[data-testid="field-name"]').value).toBe('Original vendor');
  expect(document.querySelector('[data-testid="field-service"]').value).toBe('Original service');
  expect(document.querySelector('[data-testid="field-next_review"]').value).toBe('2026-10-15');
  expect(document.querySelector('[data-testid="field-contract_renewal"]').value).toBe('2027-04-01');
  expect(document.body.textContent).toContain('Create is unconfirmed. Retry its original request before closing.');
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.patch).not.toHaveBeenCalled();
  await input(document.querySelector('[data-testid="field-name"]'),'Newer unsaved vendor wording');
  await click(vendorButton('Add to register'));
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.patch).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();expect(onSaved).not.toHaveBeenCalled();
  expect(document.querySelector('[data-testid="field-name"]').value).toBe('Newer unsaved vendor wording');
  expect(document.querySelector('[data-testid="field-service"]').value).toBe('Original service');
  expect(document.querySelector('[data-testid="field-next_review"]').value).toBe('2026-10-15');
  expect(document.querySelector('[data-testid="field-contract_renewal"]').value).toBe('2027-04-01');
  await click(vendorButton('Retry unconfirmed create'));
  expect(api.post).toHaveBeenCalledTimes(2);
  const retried=api.post.mock.calls[1];
  expect(retried[0]).toBe(original[0]);expect(JSON.stringify(retried[1])).toBe(JSON.stringify(original[1]));
  expect(retried[2].headers).toEqual(original[2].headers);
  expect(retried[2].pendingCommandGeneration).toBe(original[2].pendingCommandGeneration);
  expect(api.patch).not.toHaveBeenCalled();expect(onSaved).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledWith(false);
});
test.each(['/vendors','/risks'])('native Vendor controls preserve legacy details from %s',async path=>{
  window.history.replaceState({},'',path);
  const legacy={assurance_id:'retained-legacy',type:'SOC 2',review_status:'requested',evidence_ids:['retained-evidence'],history:[{review_status:'received',notes:'Retained historical note'}]};
  const optional={assurance_id:'retained-optional',type:'ISO 27001',required:false,review_status:'requested',evidence_ids:[]};
  const record={vendor_id:'retained-vendor',client_id:mockClient,name:'SYNTHETIC retained vendor',service:'Recorded service',category:'Retained custom category',status:'active',criticality:'medium',contract_expiration:'2027-04-01',assurance_required:false,assurance_records:[legacy,optional],updated_at:'retained-version'};
  const before=JSON.parse(JSON.stringify(record));
  api.patch.mockImplementation(async(_url,body)=>({data:{...record,...body}}));
  await act(async()=>root.render(<RecordDrawer open onOpenChange={()=>{}} kind="vendors" record={record} schema={SCHEMAS.vendors.fields} clientId={mockClient} users={[]}/>));
  const drawer=document.querySelector('[data-testid="vendors-drawer"]');
  const status=drawer.querySelector('[aria-label="Relationship status"],[aria-label="Relationship Status"]');
  expect([...status.options].map(option=>option.value).filter(Boolean)).toEqual(['active','under_review','offboarding']);
  const category=drawer.querySelector('select[data-testid="field-category"]');
  expect(category.value).toBe('Retained custom category');
  expect(category.selectedOptions[0].textContent).toBe('Retained custom category (recorded)');
  expect(category.querySelector('option span')).toBeNull();
  await choose(drawer.querySelector('[aria-label="Category"]'),'Other');
  await choose(status,'under_review');
  await click([...drawer.querySelectorAll('button')].find(node=>node.textContent==='Security Assurance Reviews'||node.textContent.startsWith('Assurance')));
  const required=drawer.querySelector('[aria-label="Security Assurance Required"]');
  expect(required.checked).toBe(false);await click(required);
  if(path==='/vendors')await click([...drawer.querySelectorAll('button')].find(node=>node.textContent==='Document details'));
  const legacyRequired=drawer.querySelector('[aria-label="SOC 2 Report Required"],[aria-label="SOC 2 Required"]');
  expect(legacyRequired.checked).toBe(true);
  const assuranceStatus=drawer.querySelector('select[aria-label="SOC 2 Report Status"]');
  expect(assuranceStatus.value).toBe('requested');expect(assuranceStatus.querySelector('option span')).toBeNull();
  if(path==='/vendors'){
    const second=[...drawer.querySelectorAll('button')].filter(node=>node.textContent==='Document details');
    await click(second[0]);
  }
  const optionalRequired=drawer.querySelector('[aria-label="ISO/IEC 27001 Certificate Required"],[aria-label="ISO 27001 Required"]');
  expect(optionalRequired.checked).toBe(false);await click(optionalRequired);
  await click([...drawer.querySelectorAll('button')].find(node=>node.textContent==='Contract'));
  const expiration=drawer.querySelector('[data-testid="field-contract_expiration"]');
  expect(expiration.value).toBe('2027-04-01');
  expect(drawer.querySelector('[data-testid="field-contract_renewal"]').value).toBe('');
  await input(expiration,'2028-04-01');
  await click([...drawer.querySelectorAll('button')].find(node=>node.textContent==='Save changes'));
  expect(api.patch).toHaveBeenCalledTimes(1);
  const [url,payload,options]=api.patch.mock.calls[0];
  expect(url).toBe('/vendors/retained-vendor');
  expect(options).toMatchObject({headers:{'Idempotency-Key':'test-request-identity'}});
  expect(payload).toMatchObject({category:'Other',status:'under_review',assurance_required:true,contract_expiration:'2028-04-01',expected_updated_at:'retained-version'});
  expect(payload.contract_renewal).toBeFalsy();
  expect(payload.assurance_records[0]).toEqual(before.assurance_records[0]);
  expect(payload.assurance_records[0]).not.toHaveProperty('required');
  expect(payload.assurance_records[1]).toEqual({...before.assurance_records[1],required:true});
  expect(before.contract_expiration).toBe('2027-04-01');
  expect(api.post).not.toHaveBeenCalled();
});
test('tile context names vendors and falls back to next renewal',()=>{
  const now=new Date('2026-09-30T12:00:00');
  const rows=[{vendor_id:'a',name:'Sentinel',status:'active',criticality:'critical',next_review:'2026-10-18',contract_renewal:'2027-03-29',assurance_records:[{type:'SOC 2',next_follow_up:'2026-10-10'}]},
    {vendor_id:'b',name:'Northstar',status:'active',criticality:'medium',next_review:'2027-03-09',contract_renewal:'2026-11-24'},
    {vendor_id:'c',name:'Old Co',status:'inactive',criticality:'high',next_review:'2026-10-02',contract_renewal:'2026-10-05'}];
  const projected=rows.map(row=>vendorSignals({...row,client_id:'synthetic-tile-client'},[{review_id:'review-'+row.vendor_id,client_id:'synthetic-tile-client',vendor_id:row.vendor_id,status:'upcoming',due_date:row.next_review}],now));
  const t=Object.fromEntries(vendorTiles(projected,now).map(x=>[x.id,x]));
  expect(t.critical_high).toMatchObject({count:1,context:'Sentinel'});
  expect(t.review_due_30.count).toBe(1);expect(t.review_due_30.context).toMatch(/^Sentinel, Oct 18$/);
  expect(t.assurance_followup).toMatchObject({count:1,context:'Sentinel'});
  expect(t.contract_expiring.count).toBe(0);expect(t.contract_expiring.context).toBe('Next renewal: Northstar, Nov 24');
  expect(vendorTiles([],now).map(x=>x.count)).toEqual([0,0,0,0]);
});
test('tiles and chips drive the register views; row opens drawer',async()=>{
  await act(async()=>root.render(<VendorRegister/>));
  await click(container.querySelector('[data-testid="tile-critical_high"]'));
  expect(container.querySelector('[data-testid="vendor-view-critical_high"]').getAttribute('aria-pressed')).toBe('true');
  await click(container.querySelector('[data-testid="vendor-view-inactive"]'));expect(container.querySelector('[data-testid="vendor-row-0"]')).toBeNull();
  await click(container.querySelector('[data-testid="vendor-view-all_active"]'));
  await click(container.querySelector('[data-testid="vendor-row-0"]'));expect(document.querySelector('[data-testid="vendors-drawer"]')).not.toBeNull();
});

test('the Dashboard assurance link opens the matching Vendors view, not All active',async()=>{
  mockSearch='view=assurance_attention';
  await act(async()=>root.render(<VendorRegister/>));
  expect(container.querySelector('[data-testid="vendor-view-all_active"]').getAttribute('aria-pressed')).toBe('false');
});

test.each(['current', 'closed', 'different client'])('native Vendor document delivery respects its %s download owner',async ending=>{
  const previousUrl=window.location.href;
  window.history.replaceState({},'', '/vendors?client_id=demo_brawndo');
  const evidence={evidence_id:'synthetic-vendor-evidence',client_id:'demo_brawndo',filename:'SYNTHETIC-vendor.bin',version:1};
  const record={vendor_id:'synthetic-download-vendor',client_id:'demo_brawndo',name:'SYNTHETIC byte delivery',service:'Synthetic hosting',status:'active',criticality:'low',assurance_records:[],contract_evidence_ids:[evidence.evidence_id]};
  let finish;
  api.get.mockImplementation(async path=>{
    if(path==='/evidence/'+evidence.evidence_id+'/download')return new Promise(resolve=>{finish=resolve;});
    return {data:path==='/related'?{evidence:[evidence]}:path==='/evidence'?[evidence]:[]};
  });
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  URL.createObjectURL=jest.fn(()=> 'blob:synthetic-vendor-download');URL.revokeObjectURL=jest.fn();
  const anchor=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const render=async open=>act(async()=>root.render(<RecordDrawer open={open} onOpenChange={()=>{}} kind="vendors" record={record} clientId="demo_brawndo" initialValues={{vendorTab:'contract'}}/>));
  try{
    await render(true);
    const documentButton=[...document.querySelectorAll('button')].find(node=>node.textContent===evidence.filename);
    expect(documentButton).toBeTruthy();await click(documentButton);
    const request=api.get.mock.calls.find(([path])=>path==='/evidence/'+evidence.evidence_id+'/download');
    expect(request[1].signal).toBeInstanceOf(AbortSignal);expect(request[1].signal.aborted).toBe(false);
    if(ending==='closed')await render(false);
    if(ending==='different client'){mockClient='synthetic-other-client';await render(true);}
    await act(async()=>finish({data:{filename:evidence.filename,content_base64:'AP9BCg=='}}));
    if(ending==='current'){
      expect(anchor).toHaveBeenCalledTimes(1);expect(anchor.mock.instances[0].download).toBe(evidence.filename);
      const blob=URL.createObjectURL.mock.calls[0][0];expect(blob.type).toBe('application/octet-stream');
      const bytes=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result));reader.onerror=reject;reader.readAsArrayBuffer(blob);});
      expect([...bytes]).toEqual([0,255,65,10]);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-vendor-download');
    }else{
      expect(request[1].signal.aborted).toBe(true);expect(URL.createObjectURL).not.toHaveBeenCalled();expect(anchor).not.toHaveBeenCalled();
    }
    expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  }finally{
    await act(async()=>root.render(null));anchor.mockRestore();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;
    window.history.replaceState({},'',previousUrl);
  }
});
