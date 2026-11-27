import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoProgramWorkspace from './IsoProgramWorkspace';
import {auditPackage,initialAuditState} from '@/lib/isoAudit';
import {isoProgramPresentation} from '@/lib/isoProgramPresentation';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
jest.mock('./IsoGuidedAssessor',()=>()=>null);

let root,container,baseFixture;
function fixture(clientId='qa-a'){
  const result=frameworkDashboardFixture('iso-27001',undefined,clientId);
  result.source.assessments.forEach(row=>{
    row.status='not_assessed';
    if(row.definition_id.startsWith('A.')){row.soa_applicability='';row.soa_justification='';}
  });
  const changes={
    '4.1':{status:'addressed'},'5.1':{status:'in_progress'},'6.1.1':{status:'needs_attention'},
    'A.5.1':{status:'addressed',soa_applicability:'included',soa_justification:'Synthetic saved treatment basis'},
    'A.5.2':{status:'in_progress',soa_applicability:'included',soa_justification:'Synthetic saved treatment basis'},
    'A.5.3':{status:'needs_attention',soa_applicability:'included',soa_justification:'Synthetic saved treatment basis'},
    'A.5.4':{status:'not_assessed',soa_applicability:'included',soa_justification:'Synthetic saved treatment basis'},
    'A.6.1':{status:'addressed',soa_applicability:'excluded',soa_justification:'Synthetic documented exclusion'},
    'A.7.1':{status:'addressed',soa_applicability:'',soa_justification:''},
  };
  result.source.assessments.forEach(row=>Object.assign(row,changes[row.definition_id]||{}));
  result.refresh();return result;
}
const joinedRows=source=>source.source.definitions.map(definition=>({...definition,...source.source.assessments.find(row=>row.definition_id===definition.id),work:{}}));
function audit(year,complete,clientId='qa-a'){
  const state=initialAuditState('governance-risk');
  state.items=Object.fromEntries(auditPackage(state.package_key).items.slice(0,complete).map(item=>[item.key,{status:'reviewed',result:'conforming'}]));
  return {client_id:clientId,review_id:'qa-audit-'+year,due_date:year+'-03-31',iso_audit:state};
}
const cards=()=>[...container.querySelectorAll('button.iso-program-card')];
const auditCard=()=>cards().find(card=>card.getAttribute('aria-label').startsWith('Open Internal Audit.'));
const noWrites=()=>{expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();};
async function mount({fixture:source=baseFixture,...props}={}){
  const clientId=props.clientId||source.client.client_id;
  await act(async()=>root.render(<div className="bcis iso-cis-program-visual" data-theme="light"><IsoProgramWorkspace clientId={clientId} mode="overview" rows={joinedRows(source)} presentation={isoProgramPresentation(source.source,clientId)} onSelect={()=>{}} onRecommend={()=>{}} configuration={{}} {...props}/></div>));
}
async function selectYear(value){
  await act(async()=>{
    const field=container.querySelector('[aria-label="Audit-program year"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(field,value);
    field.dispatchEvent(new Event('change',{bubbles:true}));
  });
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  jest.useFakeTimers().setSystemTime(new Date('2026-10-31T10:00:00Z'));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockReset();api.patch.mockReset();api.post.mockReset();api.get.mockResolvedValue({data:{reviews:[audit('2026',1)]}});
  baseFixture=fixture();
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});

test('four cards retain independent native totals and exact destinations without nested controls or writes',async()=>{
  const before=JSON.stringify(baseFixture.source),onSelect=jest.fn();
  await mount({onSelect});
  expect(cards()).toHaveLength(4);
  expect(cards().map(card=>card.querySelector('.iso-program-metric').textContent)).toEqual([
    '5 of 93 Annex A decisions documented','1 of 30 requirements implemented','1 of 4 applicable controls implemented',
    `1 of ${auditPackage('governance-risk').items.length} planned audit checks completed · 2026`,
  ]);
  expect(cards().slice(0,3).map(card=>card.querySelector('.iso-card-value').textContent)).toEqual(['5.4%','3.3%','25.0%']);
  for(const card of cards()){
    expect(card.querySelector('button,input,select,textarea,[tabindex]')).toBeNull();
    await act(async()=>card.click());
  }
  expect(onSelect.mock.calls).toEqual([['soa'],['isms_clause'],['annex_control'],['audit',{audit_year:'2026'}]]);
  expect(JSON.stringify(baseFixture.source)).toBe(before);noWrites();
});

test('historical audit selection uses retained occurrence totals and survives controlled remount',async()=>{
  const current=audit('2026',1),historical={...audit('2025',3),occurrence_id:'qa-historical',completed_at:'2025-04-01T12:00:00Z'};
  current.occurrences=[historical];const before=JSON.stringify(current),onAuditYearChange=jest.fn();
  api.get.mockResolvedValue({data:{reviews:[current]}});
  await mount({onAuditYearChange});await selectYear('2025');
  expect(onAuditYearChange).toHaveBeenLastCalledWith('2025');
  expect(auditCard().textContent).toContain(`3 of ${auditPackage('governance-risk').items.length} planned audit checks completed · 2025`);
  await act(async()=>root.unmount());root=createRoot(container);
  await mount({auditYear:'2025',onAuditYearChange});
  expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2025');
  expect(auditCard().textContent).toContain('3 of');expect(JSON.stringify(current)).toBe(before);noWrites();
});

test('switching clients withdraws old audit totals while the new client read is pending',async()=>{
  await mount();expect(auditCard().textContent).toContain('1 of');
  let finish;api.get.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await mount({fixture:fixture('qa-b')});
  expect(auditCard()).toBeUndefined();expect(container.querySelector('.iso-program-grid [role="status"]').textContent).toContain('Loading program');
  await act(async()=>finish({data:{reviews:[audit('2026',4,'qa-b')]}}));
  expect(auditCard().textContent).toContain('4 of');
  expect(api.get).toHaveBeenLastCalledWith('/iso-audit',expect.objectContaining({params:{client_id:'qa-b'}}));noWrites();
});

test('an aborted previous-client response cannot replace the new client audit history',async()=>{
  let finishA;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finishA=resolve;}));
  await mount();api.get.mockResolvedValue({data:{reviews:[audit('2026',4,'qa-b')]}});
  await mount({fixture:fixture('qa-b')});expect(auditCard().textContent).toContain('4 of');
  await act(async()=>finishA({data:{reviews:[audit('2026',1)]}}));
  expect(auditCard().textContent).toContain('4 of');noWrites();
});

test.each(['network','malformed'])('audit %s failure remains unavailable rather than zero or successful progress',async kind=>{
  if(kind==='network')api.get.mockRejectedValue(new Error('Synthetic read failed'));
  else api.get.mockResolvedValue({data:{reviews:null}});
  const legacy=baseFixture.source.assessments.find(row=>row.definition_id==='8.1');legacy.status='not_applicable';baseFixture.refresh();
  const before=JSON.stringify(baseFixture.source);
  await mount();expect(auditCard()).toBeUndefined();
  expect(container.querySelector('.iso-program-grid [role="status"]').textContent).toContain('Unavailable');
  const alerts=[...container.querySelectorAll('[role="alert"]')].map(alert=>alert.textContent);
  expect(alerts).toEqual(expect.arrayContaining([expect.stringContaining('Audit program could not be loaded'),expect.stringContaining('Legacy assessment conflicts require review')]));
  expect(JSON.stringify(baseFixture.source)).toBe(before);noWrites();
});

test('mandatory legacy N/A conflicts stay retained and cannot become a guessed valid implementation percentage',async()=>{
  const legacy=baseFixture.source.assessments.find(row=>row.definition_id==='8.1');
  legacy.status='not_applicable';legacy.implementation='Retain native narrative';legacy.assessment_history=[{status:'not_applicable',at:'2026-09-01T12:00:00Z'}];
  baseFixture.refresh();const before=JSON.stringify(baseFixture.source);
  await mount();
  expect(container.querySelector('[role="alert"]').textContent).toContain('8.1');
  expect(cards().slice(1,3).map(card=>card.querySelector('.iso-program-metric').textContent)).toEqual(['Implementation source unavailable','Implementation source unavailable']);
  expect(cards().slice(1,3).map(card=>card.querySelector('.iso-card-value').textContent)).toEqual(['—','—']);
  expect(cards()[0].querySelector('.iso-program-metric').textContent).toBe('5 of 93 Annex A decisions documented');
  expect(JSON.stringify(baseFixture.source)).toBe(before);noWrites();
});

test('Annex card counts only Included implementation and keeps exclusions, unresolved decisions and documentation separate',async()=>{
  const before=JSON.stringify(baseFixture.source);await mount();
  const card=cards()[2],soa=cards()[0];
  expect(card.querySelector('.iso-program-metric').textContent).toBe('1 of 4 applicable controls implemented');
  expect(card.textContent).toContain('88 applicability unresolved · 1 excluded');
  expect(card.textContent).toContain('3 of 4 assessed');
  expect(soa.textContent).toContain('5 decisions recorded');expect(soa.textContent).toContain('0 justifications outstanding');
  expect(soa.textContent).toContain('88 decisions unresolved');
  expect(JSON.stringify(baseFixture.source)).toBe(before);noWrites();
});

test('missing native identities suppress card percentages rather than certifying partial raw rows',async()=>{
  baseFixture.source.assessments.pop();const before=JSON.stringify(baseFixture.source);
  await mount();
  expect(cards().slice(0,3).map(card=>card.querySelector('.iso-card-value').textContent)).toEqual(['—','—','—']);
  expect(cards()[0].textContent).toContain('Applicability source unavailable');expect(cards()[1].textContent).toContain('Implementation source unavailable');
  expect(auditCard().textContent).toContain('1 of');expect(JSON.stringify(baseFixture.source)).toBe(before);noWrites();
});

test('an unplanned selected audit year is Not scheduled without invented 100-percent completion',async()=>{
  await mount({auditYear:'2027'});
  expect(auditCard().querySelector('.iso-card-value').textContent).toBe('—');
  expect(auditCard().querySelector('.iso-program-metric').textContent).toBe('Not scheduled · 2027');
  expect(auditCard().textContent).toContain('Q1: Not scheduled');expect(auditCard().textContent).toContain('Q4: Not scheduled');
  expect(auditCard().textContent).not.toContain('100');noWrites();
});

test('future planned audit work stays pending in its actual selected year without implementation or overdue claims',async()=>{
  const future=audit('2027',0),before=JSON.stringify(future);api.get.mockResolvedValue({data:{reviews:[future]}});
  await mount({auditYear:'2027'});
  expect(auditCard().querySelector('.iso-card-value').textContent).toBe('0.0%');
  expect(auditCard().textContent).toContain(`0 of ${auditPackage('governance-risk').items.length} planned audit checks completed · 2027`);
  expect(auditCard().textContent).not.toMatch(/overdue|not implemented/i);
  expect(JSON.stringify(future)).toBe(before);noWrites();
});
