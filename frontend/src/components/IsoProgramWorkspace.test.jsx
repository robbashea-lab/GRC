import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoProgramWorkspace,{IsoImplementationSummary} from './IsoProgramWorkspace';
import {auditPackage,initialAuditState} from '@/lib/isoAudit';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
jest.mock('./IsoGuidedAssessor',()=>()=>null);

let root,container;
const assessment=(id,status,extra={})=>({client_id:'qa-a',framework_key:'iso-27001',framework_assessment_id:'qa-'+id,definition_id:id,title:'Synthetic '+id,specification:id.startsWith('A.')?'annex_control':'isms_clause',status,...extra});
const rows=()=>[
  assessment('4.1','addressed'),assessment('5.1','in_progress'),assessment('6.1','needs_attention'),assessment('7.1','not_assessed'),assessment('8.1','not_applicable'),
  ...['addressed','in_progress','needs_attention','not_assessed'].map((status,index)=>assessment('A.5.'+(index+1),status,{soa_applicability:'included'})),
  assessment('A.6.1','addressed',{soa_applicability:'excluded'}),assessment('A.7.1','addressed'),
];
function audit(year,complete,clientId='qa-a'){
  const state=initialAuditState('governance-risk');
  state.items=Object.fromEntries(auditPackage(state.package_key).items.slice(0,complete).map(item=>[item.key,{status:'reviewed',result:'conforming'}]));
  return {client_id:clientId,review_id:'qa-audit-'+year,due_date:year+'-03-31',iso_audit:state};
}
const cards=()=>[...container.querySelectorAll('button.iso-program-card')];
const auditCard=()=>cards().find(card=>card.getAttribute('aria-label').startsWith('Open Internal Audit.'));
async function mount(props={}){
  await act(async()=>root.render(<div className="iso-program-visual"><IsoProgramWorkspace clientId="qa-a" mode="overview" rows={rows()} onSelect={()=>{}} onRecommend={()=>{}} configuration={{}} {...props}/></div>));
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
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});

test('four cards retain independent native totals and exact destinations without nested controls or writes',async()=>{
  const source=rows(),before=JSON.stringify(source),onSelect=jest.fn();
  await mount({rows:source,onSelect});
  expect(cards()).toHaveLength(4);
  expect(cards().map(card=>card.querySelector('.iso-program-metric').textContent)).toEqual([
    '5 of 6 applicability decisions completed','1 of 5 requirements implemented','1 of 4 applicable controls implemented',
    `1 of ${auditPackage('governance-risk').items.length} planned audit checks completed · 2026`,
  ]);
  expect(cards().slice(0,3).map(card=>card.querySelector('.iso-card-value').textContent)).toEqual(['83%','20%','25%']);
  for(const card of cards()){
    expect(card.querySelector('button,input,select,textarea,[tabindex]')).toBeNull();
    await act(async()=>card.click());
  }
  expect(onSelect.mock.calls).toEqual([['soa'],['isms_clause'],['annex_control'],['audit',{audit_year:'2026'}]]);
  expect(JSON.stringify(source)).toBe(before);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
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
  expect(auditCard().textContent).toContain('3 of');expect(JSON.stringify(current)).toBe(before);
});

test('switching clients withdraws old audit totals while the new client read is pending',async()=>{
  await mount();expect(auditCard().textContent).toContain('1 of');
  let finish;api.get.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await mount({clientId:'qa-b',rows:[]});
  expect(auditCard()).toBeUndefined();expect(container.querySelector('.iso-program-grid [role="status"]').textContent).toContain('Loading program');
  await act(async()=>finish({data:{reviews:[audit('2026',4,'qa-b')]}}));
  expect(auditCard().textContent).toContain('4 of');
  expect(api.get).toHaveBeenLastCalledWith('/iso-audit',expect.objectContaining({params:{client_id:'qa-b'}}));
});

test('an aborted previous-client response cannot replace the new client audit history',async()=>{
  let finishA;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finishA=resolve;}));
  await mount();api.get.mockResolvedValue({data:{reviews:[audit('2026',4,'qa-b')]}});
  await mount({clientId:'qa-b',rows:[]});expect(auditCard().textContent).toContain('4 of');
  await act(async()=>finishA({data:{reviews:[audit('2026',1)]}}));
  expect(auditCard().textContent).toContain('4 of');
});

test.each(['network','malformed'])('audit %s failure remains unavailable rather than zero or successful progress',async kind=>{
  if(kind==='network')api.get.mockRejectedValue(new Error('Synthetic read failed'));
  else api.get.mockResolvedValue({data:{reviews:null}});
  await mount();expect(auditCard()).toBeUndefined();
  expect(container.querySelector('.iso-program-grid [role="status"]').textContent).toContain('Unavailable');
  const alerts=[...container.querySelectorAll('[role="alert"]')].map(alert=>alert.textContent);
  expect(alerts).toEqual(expect.arrayContaining([expect.stringContaining('Audit program could not be loaded'),expect.stringContaining('Legacy assessment conflicts require review')]));
});

test('ISMS summary keeps mandatory legacy conflicts in its native denominator and filters without editing records',async()=>{
  const source=rows().filter(row=>row.specification==='isms_clause'),before=JSON.stringify(source),onFilter=jest.fn();
  await act(async()=>root.render(<IsoImplementationSummary rows={source} view="isms_clause" filter="all" onFilter={onFilter}/>));
  expect(container.querySelector('.bwp-program-counts').textContent).toBe('1 of 5 ISMS requirements implemented');
  expect(container.querySelector('[role="alert"]').textContent).toContain('8.1');
  await act(async()=>container.querySelector('button.is-good').click());expect(onFilter).toHaveBeenCalledWith('addressed');
  expect(container.querySelector('.bcis-legend-na').tagName).toBe('SPAN');expect(container.querySelector('.bcis-legend-na').textContent).toContain('1');
  expect(JSON.stringify(source)).toBe(before);
});

test('Annex implementation summary includes only saved Included controls and keeps exclusions and undecided separate',async()=>{
  const source=rows().filter(row=>row.specification==='annex_control');
  await act(async()=>root.render(<IsoImplementationSummary rows={source} view="annex_control" filter="addressed" onFilter={()=>{}}/>));
  expect(container.querySelector('.bwp-program-counts').textContent).toBe('1 of 4 applicable controls implemented');
  expect(container.textContent).toContain('1 applicability not determined · 1 excluded');
  expect(container.querySelector('button.is-good').getAttribute('aria-pressed')).toBe('true');
});
