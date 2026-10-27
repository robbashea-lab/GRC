import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Policies from './BrawndoAdditionalPolicies';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);Object.values(api).forEach(method=>method.mockReset());});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

const clientId='synthetic-policy-client';
const mapped={client_id:clientId,policy_id:'native-policy',title:'Saved native policy',baseline_key:'policy-information-security-policy',status:'approved',approved_at:'2026-10-01',version:'2'};
const unmapped={client_id:clientId,policy_id:'unmapped',title:'Information Security Policy',status:'draft'};
const annual={client_id:clientId,review_id:'native-annual-review',baseline_key:'policy-review',review_type:'policy',recurrence:'annual',status:'upcoming',due_date:'2027-10-01'};

test.each([
  ['iso-27001','ISO 27001','alignment','5.2'],
  ['soc-2','SOC 2','criteria','CC1.1'],
])('%s register shows its real mapping and preserves exact native record/Review/assessment opening',async(framework,label,unit,definitionId)=>{
  const rows=[mapped,unmapped],before=JSON.stringify({rows,annual});
  const onOpen=jest.fn(),onOpenReview=jest.fn(),onAlignment=jest.fn();
  const assessment={client_id:clientId,framework_key:framework,framework_assessment_id:'native-assessment',definition_id:definitionId,status:'not_assessed'};
  api.get.mockResolvedValue({data:{assessments:[{...assessment,client_id:'foreign',framework_assessment_id:'foreign'},assessment]}});
  await act(async()=>root.render(<Policies clientId={clientId} clientName="Synthetic" rows={rows} reviews={[annual]} programs={[framework]}
    onOpen={onOpen} onOpenReview={onOpenReview} onAlignment={onAlignment}/>));
  expect(host.querySelector('.pc-mapping').textContent).toBe(`Mapped to ${label}: 1 of 2`);
  expect(host.querySelectorAll('[role=columnheader]')[1].textContent).toBe(`${label} ${unit}`);
  expect(host.querySelector('.bap-alignment').textContent).toContain(`Supports ${label}`);
  expect(host.textContent).not.toContain('CIS');
  await act(async()=>host.querySelector('.bapv-name').click());expect(onOpen).toHaveBeenCalledWith(mapped);
  await act(async()=>host.querySelector('.bapv-link').click());expect(onOpenReview).toHaveBeenCalledWith(annual);
  const mapping=[...host.querySelectorAll('.bap-alignment button')].find(button=>button.textContent===definitionId);
  await act(async()=>mapping.click());
  expect(api.get).toHaveBeenCalledWith('/frameworks/'+framework,{params:{client_id:clientId}});
  expect(onAlignment).toHaveBeenCalledWith({kind:'framework_assessments',record:assessment});
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
  expect(JSON.stringify({rows,annual})).toBe(before);
});

test('mixed-framework mapped view counts a policy once while retaining each native program link',async()=>{
  const custom={...unmapped,policy_id:'linked-custom'};
  const assessment={client_id:clientId,framework_key:'soc-2',definition_id:'CC1.1',related_links:[{kind:'policies',id:custom.policy_id}]};
  await act(async()=>root.render(<Policies clientId={clientId} rows={[mapped,unmapped,custom]} programs={['cis-ig1','iso-27001','soc-2']}
    assessments={[assessment]} cisGroup={1} view="mapped"/>));
  expect(host.querySelector('.pc-mapping').textContent).toBe('Framework-mapped: 2 of 3');
  expect(host.querySelectorAll('[role=columnheader]')[1].textContent).toBe('Framework alignment');
  expect(host.querySelectorAll('.bap-row[data-testid]')).toHaveLength(2);
  const alignment=host.querySelector('.bap-alignment').textContent;
  expect(alignment).toContain('Supports CIS IG1');expect(alignment).toContain('Supports ISO 27001');expect(alignment).toContain('Supports SOC 2');
  expect(host.querySelector('.bapv-summary').textContent).toContain('Framework-mapped');
});

test.each(['iso-27001','soc-2'])('empty %s client retains native annual Review and reports healthy zero mapping',async framework=>{
  const onOpenReview=jest.fn();
  await act(async()=>root.render(<Policies clientId={clientId} rows={[]} programs={[framework]} reviews={[annual]} onOpenReview={onOpenReview}/>));
  expect(host.querySelector('.pc-mapping strong').textContent).toBe('0 of 0');
  expect(host.querySelector('.pc-mapping').disabled).toBe(false);
  await act(async()=>host.querySelector('.bapv-link').click());expect(onOpenReview).toHaveBeenCalledWith(annual);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

test('unavailable target alignment keeps the native framework label but never claims zero coverage',async()=>{
  await act(async()=>root.render(<Policies clientId={clientId} rows={[mapped]} programs={['iso-27001']} alignmentError="Alignment unavailable"/>));
  expect(host.querySelector('.pc-mapping').textContent).toBe('Mapped to ISO 27001: —');
  expect(host.querySelector('.pc-mapping').disabled).toBe(true);
  expect(host.querySelector('.bap-alignment').textContent).toBe('Alignment unavailable');
});

test.each(['iso-27001','soc-2'])('retained %s mapped filter with missing source reads is unknown, while other saved views remain usable',async framework=>{
  const custom={...unmapped,policy_id:'saved-link-only'},onClear=jest.fn();
  const props={clientId,rows:[mapped,custom],programs:[],frameworkKeys:[framework],alignmentError:'Alignment unavailable',onClear};
  await act(async()=>root.render(<Policies {...props} view="mapped"/>));
  expect(host.querySelector('.bapv-empty[role=alert]').textContent).toContain('Policy mappings unavailable');
  expect(host.querySelector('.bapv-summary [role=status]').textContent).toBe('Policy mapping counts unavailable.');
  expect(host.textContent).not.toContain('No policies match');expect(host.textContent).not.toContain('Showing 0');expect(host.textContent).not.toContain('CIS');
  expect(host.querySelector('.pc-mapping strong').textContent).toBe('—');
  expect(host.querySelector('[data-testid=additional-policy-metric-approved] strong').textContent).toBe('1');
  await act(async()=>host.querySelector('.bapv-empty button').click());expect(onClear).toHaveBeenCalledTimes(1);
  await act(async()=>root.render(<Policies {...props} view=""/>));
  expect(host.querySelectorAll('.bap-row[data-testid]')).toHaveLength(2);
  expect(host.querySelector('.bapv-summary [role=status]').textContent).toBe('Showing 2 of 2 policies');
  expect(host.querySelector('.bap-alignment').textContent).toBe('Alignment unavailable');
});
