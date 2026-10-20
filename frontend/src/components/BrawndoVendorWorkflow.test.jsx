import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import Workflow, {toggleVendorWorkflowData} from './BrawndoVendorWorkflow';
import api from '@/lib/api';

const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('./AssigneeSelect',()=>props=><select aria-label={props.label} value={props.value||''} onChange={event=>props.onChange(event.target.value||null)}><option value="">Unassigned</option></select>);

let root,container,form,openRecord;
const record={vendor_id:'vendor-1',client_id:'demo_brawndo',name:'Vendor',service:'Service',criticality:'medium',status:'active'};
const render=async (overrides={})=>{
  function Harness(){const [draft,setDraft]=React.useState(form);form=draft;return <Workflow tab="overview" record={record} canWrite isAdmin users={[]} form={draft} setForm={setDraft} openRecord={openRecord} {...overrides}/>;}
  await act(async()=>root.render(<Harness/>));
};
const click=async text=>{const button=[...container.querySelectorAll('button')].find(node=>node.textContent===text);expect(button).toBeDefined();await act(async()=>button.click());};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);form={...record,review_frequency:'annual',next_review:'2027-03-31',data_types:[],assurance_records:[]};openRecord=jest.fn();api.get.mockResolvedValue({data:[]});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('template selection changes only an editable draft without creating records or scheduling work',async()=>{
  await render({record:null});
  await click('Microsoft 365Email, files, Teams and identity (Entra ID)');
  expect(form.name).toBe('Microsoft 365');
  expect(form.data_types).toContain('Customer Data');
  expect(form.assurance_records.map(item=>item.type)).toEqual(['SOC 2','ISO 27001']);
  expect(form.next_review).toBe('2027-03-31');
  expect(form.assurance_records.every(item=>item.review_status==='requested'&&!item.received_at&&!item.reviewed_on)).toBe(true);
  expect(api.patch).not.toHaveBeenCalled();expect(api.get).not.toHaveBeenCalled();
  await click('Start blank');expect(form.name).toBe('');expect(form.assurance_records).toEqual([]);expect(form.next_review).toBe('2027-03-31');
});

test('No sensitive data is exclusive while other recorded data survives ordinary tag toggles',()=>{
  expect(toggleVendorWorkflowData(['No Sensitive Data'],'PII')).toEqual(['PII']);
  expect(toggleVendorWorkflowData(['PII','Internal'],'No Sensitive Data')).toEqual(['No Sensitive Data']);
  expect(toggleVendorWorkflowData(['PII','Recorded legacy value'],'Internal')).toEqual(['PII','Recorded legacy value','Internal']);
});

test('assurance opens native fields without inventing receipt, review, outcome or required notes',async()=>{
  form.assurance_records=[{assurance_id:'doc-1',type:'SOC 2',review_status:'received',received_at:'2026-10-01',evidence_ids:[]}];
  await render({tab:'assurance'});await click('Review document');
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(container.querySelector('input[aria-label="SOC 2 Report Reviewed on"]').value).toBe('');
  expect(container.querySelector('input[aria-label="SOC 2 Report Reviewed by (recorded name)"]').value).toBe('');
  expect(container.querySelector('textarea').required).toBe(false);
  expect(container.textContent).not.toContain('Acceptable');expect(form.assurance_records[0].review_status).toBe('received');expect(api.patch).not.toHaveBeenCalled();
});

test('linked actions use actual vendor identity and native record kinds',async()=>{
  await render({tab:'linked'});await click('Create Risk');await click('Create Action Item');
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(openRecord).toHaveBeenNthCalledWith(1,{kind:'risks',record:null,initialValues:{source_type:'vendor',source_id:'vendor-1',vendor_id:'vendor-1'}});
  expect(openRecord).toHaveBeenNthCalledWith(2,{kind:'tasks',record:null,initialValues:{source_type:'vendor',source_id:'vendor-1',vendor_id:'vendor-1'}});
});

test('successive Risk links use the last accepted Vendor IDs and version without replacing other drafts',async()=>{
  const vendor={...record,related_risk_ids:['risk-existing'],updated_at:'version-1'};
  form.name='Unsaved vendor name';
  api.get.mockResolvedValue({data:[{risk_id:'risk-a',client_id:'demo_brawndo',title:'A'},{risk_id:'risk-b',client_id:'demo_brawndo',title:'B'}]});
  api.patch.mockResolvedValueOnce({data:{...vendor,related_risk_ids:['risk-existing','risk-a'],updated_at:'version-2'}}).mockResolvedValueOnce({data:{...vendor,related_risk_ids:['risk-existing','risk-a','risk-b'],updated_at:'version-3'}});
  const accept=jest.fn(data=>Object.assign(vendor,data));
  await render({tab:'linked',record:vendor,onRecordChanged:accept});
  const select=async value=>act(async()=>{const picker=container.querySelector('[aria-label="Link existing Risk"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(picker,value);picker.dispatchEvent(new Event('change',{bubbles:true}));});
  await select('risk-a');await select('risk-b');
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.patch).toHaveBeenNthCalledWith(1,'/vendors/vendor-1',{related_risk_ids:['risk-existing','risk-a'],expected_updated_at:'version-1'});
  expect(api.patch).toHaveBeenNthCalledWith(2,'/vendors/vendor-1',{related_risk_ids:['risk-existing','risk-a','risk-b'],expected_updated_at:'version-2'});
  expect(accept).toHaveBeenCalledTimes(2);expect(form.name).toBe('Unsaved vendor name');
});

test('legacy received assurance follow-up appears in the overview strip and Coming up',async()=>{
  form.assurance_records=[{assurance_id:'legacy-doc',type:'Security Questionnaire',review_status:'received',received_at:'2026-01-01',refresh_due:'2026-11-07',evidence_ids:[]}];
  await render();
  expect(container.querySelector('.strip').textContent).toContain('Received · follow-up Nov 7, 2026');
  expect(container.querySelector('.two .card').textContent).toContain('Assurance follow-up · Security Questionnaire');
  expect(container.querySelector('.two .card').textContent).toContain('Nov 7, 2026');
  expect(form.assurance_records[0].next_follow_up).toBeUndefined();
});

test('legacy follow-up editor updates its actual recorded field and permits an intentional clear',async()=>{
  form.assurance_records=[{assurance_id:'legacy-doc',type:'Security Questionnaire',review_status:'received',received_at:'2026-01-01',refresh_due:'2026-11-07',evidence_ids:[]}];
  await render({tab:'assurance'});await click('Review document');
  const input=container.querySelector('[aria-label="Security Questionnaire Next follow-up"]');
  expect(input.value).toBe('2026-11-07');
  expect(container.querySelector('.asr-h .chip').textContent).toBe('Follow-up Nov 7, 2026');
  const change=async value=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
  await change('2026-11-09');expect(form.assurance_records[0].refresh_due).toBe('2026-11-09');
  expect(form.assurance_records[0].next_follow_up).toBeUndefined();
  await change('');expect(input.value).toBe('');expect(form.assurance_records[0].refresh_due).toBe('');
  expect(container.querySelector('.asr-h .chip')).toBeNull();expect(api.patch).not.toHaveBeenCalled();
});

test('clearing an explicit modern follow-up does not resurrect its input or erase a separate retained legacy date',async()=>{
  form.assurance_records=[{assurance_id:'both-dates',type:'Security Questionnaire',review_status:'received',received_at:'2026-01-01',next_follow_up:'2026-11-09',refresh_due:'2026-11-07',evidence_ids:[]}];
  await render({tab:'assurance'});await click('Review document');
  const input=container.querySelector('[aria-label="Security Questionnaire Next follow-up"]');
  expect(input.value).toBe('2026-11-09');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(input.value).toBe('');expect(form.assurance_records[0].next_follow_up).toBe('');
  expect(form.assurance_records[0].refresh_due).toBe('2026-11-07');
  expect(container.querySelector('.asr-h .chip').textContent).toBe('Follow-up Nov 7, 2026');
  expect(container.textContent).toContain('retained; used when no next follow-up is recorded');
});

const downloadEvidence={evidence_id:'native-evidence',client_id:'demo_brawndo',filename:'Native assurance.pdf',created_at:'2026-10-01T12:00:00Z'};
async function openDownloadRoute(route,downloadEv,overrides={}){
  if(route!=='contract')form.assurance_records=[{
    assurance_id:'current-document',type:'SOC 2',review_status:'received',evidence_ids:[],
    ...(route==='history'?{history:[{review_status:'reviewed',reviewed_on:'2026-09-01',notes:'Retained native review',evidence_ids:[downloadEvidence.evidence_id]}]}:{})
  }];
  await render({tab:route==='contract'?'contract':'assurance',evidence:[downloadEvidence],downloadEv,...overrides});
  if(route==='contract')return container.querySelector('.files .file button');
  await click('Review document');
  if(route==='assurance')return container.querySelector('.assurance-details .file button');
  const history=[...container.querySelectorAll('details')].find(details=>details.querySelector('summary')?.textContent.startsWith('Earlier recorded states'));
  expect(history).toBeDefined();await act(async()=>history.querySelector('summary').click());
  return history.querySelector('button');
}

test.each(['contract','assurance','history'])('%s download reports native permission and unavailable-content errors and permits retry without changing records',async route=>{
  const download=jest.fn()
    .mockRejectedValueOnce(Error('You do not have access to this evidence.'))
    .mockRejectedValueOnce(Error('This Demo file is unavailable after reload.'))
    .mockResolvedValueOnce();
  const saved=jest.fn(),target=await openDownloadRoute(route,download,{onSaved:saved});
  expect(target).not.toBeNull();
  const before=JSON.stringify({record,form});
  await act(async()=>target.click());
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
  expect(container.querySelector('[role="alert"]').textContent).toBe('You do not have access to this evidence.');
  await act(async()=>target.click());
  expect(container.querySelector('[role="alert"]').textContent).toBe('This Demo file is unavailable after reload.');
  await act(async()=>target.click());
  expect(container.querySelector('[role="alert"]')).toBeNull();expect(download).toHaveBeenCalledTimes(3);
  expect(download.mock.calls).toEqual([[downloadEvidence],[downloadEvidence],[downloadEvidence]]);
  expect(JSON.stringify({record,form})).toBe(before);expect(saved).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('a read-only Contract download delegates the unchanged native evidence identity without a record write',async()=>{
  const download=jest.fn().mockResolvedValue(),saved=jest.fn();
  const target=await openDownloadRoute('contract',download,{canWrite:false,isAdmin:false,onSaved:saved});
  const before=JSON.stringify({record,form});
  await act(async()=>target.click());
  expect(download).toHaveBeenCalledWith(downloadEvidence);expect(download).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')).toBeNull();expect(JSON.stringify({record,form})).toBe(before);
  expect(saved).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
