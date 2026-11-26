import {overlayNativeAudit} from './auditProjection';

test('native audit events reconcile by client and never reuse repeated drawer IDs across clients',()=>{
  const state={audit:[{client:'a',t:new Date('2026-01-01'),title:'Approved reference history'}],
    activity:{'a|risk|RISK-001':[{txt:'Local unconfirmed event'}],'b|risk|RISK-001':[{txt:'Other client'}]}};
  const records={risks:[{client_id:'na',risk_id:'ra',display_id:'RISK-001'}],
    audit_logs:[{client_id:'na',log_id:'l1',at:'2026-11-24',user_id:'u',action:'close',entity_type:'risk',entity_id:'ra',entity_name:'Inventory risk'},
      {client_id:'nb',log_id:'foreign',entity_id:'ra',at:'2026-11-25'}]};
  const context={clientId:'na',sourceId:'a',userName:()=> 'Actual user'};
  overlayNativeAudit(state,records,context);overlayNativeAudit(state,records,context);
  expect(state.audit).toHaveLength(2);expect(state.audit[0]).toMatchObject({nativeLogId:'l1',user:'Actual user',entity:'Risks'});
  expect(state.activity['a|risk|RISK-001']).toEqual([expect.objectContaining({nativeLogId:'l1'})]);
  expect(state.activity['b|risk|RISK-001']).toEqual([{txt:'Other client'}]);
});
