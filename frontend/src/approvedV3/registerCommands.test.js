import {applyRegisterChanges} from './registerCommands';

const copy=value=>JSON.parse(JSON.stringify(value));
function scenario(){
  const before={programs:{sample:{risks:[{id:'RISK-001',wfId:'R',st:'Open',title:'Inventory'}],
    vendors:[{wfId:'V',name:'Provider'}],pols:[{wfId:'P',name:'Recovery',st:'Pending approval'}]}},
    records:{sample:{ai:[{wfId:'A',name:'Assistant',owner:'Taylor',st:'Pending assessment',tier:'Moderate'}]}},
    work:{sample:{revs:[{id:'Q',link:{kind:'risk',id:'R',purpose:'review'}}]}}};
  const clientId='native-client';
  const row=(idField,id,key,rest)=>({client_id:clientId,[idField]:id,source_record_id:key,updated_at:'read',...rest});
  const records={clients:[{source_client_id:'sample',client_id:clientId,updated_at:'client-read'}],
    risks:[row('risk_id','risk1','R',{status:'open'})],vendors:[row('vendor_id','vendor1','V',{status:'active',notes:'Original'})],
    policies:[row('policy_id','policy1','P',{status:'in_review',approval_request_id:'request1'})],
    ai_systems:[row('ai_system_id','ai1','A',{status:'active'})],reviews:[row('review_id','review1','Q',{risk_id:'risk1'})]};
  let n=0;
  function save(path,body){
    const [,table,id,operation]=path.split('/');
    if(!records[table])throw Error('Unexpected request '+path);
    const key={risks:'risk_id',vendors:'vendor_id',policies:'policy_id',ai_systems:'ai_system_id'}[table];
    const stamp='ack'+(++n),record=records[table].find(r=>r[key]===id);
    if(operation==='reviews')return Promise.resolve({data:{review_id:'ai-review',client_id:clientId,ai_system_id:id,updated_at:stamp}});
    return Promise.resolve({data:{...record,...body,client_id:clientId,[key]:id||'created',updated_at:stamp}});
  }
  return {sourceId:'sample',before,after:copy(before),clientId,records,api:{patch:jest.fn(save),post:jest.fn(save),get:jest.fn()},
    identityMaps:{clientIds:{sample:clientId},recordIds:{}},userIds:{Taylor:'real-user'},commands:[],pendingRequests:new Map()};
}
test('a source-internal risk display ID resolves within the client and native closure owns its linked review',async()=>{
  const p=scenario();p.after.programs.sample.risks[0].st='Closed';p.after.work.sample.revs=[];
  p.commands=[{name:'closeRisk',args:['sample','RISK-001',{reason:'System was decommissioned',by:'Sample user'}]}];
  const result=await applyRegisterChanges(p);
  expect(p.api.patch).not.toHaveBeenCalled();
  expect(p.api.post).toHaveBeenCalledWith('/risks/risk1/close',{reason:'other',note:'System was decommissioned',expected_updated_at:'read'});
  expect(result.handled.reviews).toEqual(['Q','review1']);
  expect(p.records.risks[0].updated_at).toBe('ack1');
});
test('risk acceptance records the signed-in decision and the expiry independently of the review date',async()=>{
  const p=scenario();
  Object.assign(p.after.programs.sample.risks[0],{st:'Accepted',strategy:'Accept',acceptance:{by:'Taylor',exp:{$date:'2027-08-01T08:00:00Z'},why:'Contract approved'}});
  await applyRegisterChanges(p);
  expect(p.api.post).toHaveBeenCalledWith('/risks/risk1/accept',{rationale:'Contract approved',expiry_date:'2027-08-01',expected_updated_at:'read'});
  expect(p.api.patch).not.toHaveBeenCalled();
});
test.each([['Approved','approve'],['Rejected','reject'],['Pending approval','submit-review']])('policy %s uses its documented request and never patches its status',async(decision,endpoint)=>{
  const p=scenario();p.commands=[{name:'savePolicyApproval',args:['sample','Recovery',{decision,reason:'Reviewed the current version'}]}];
  await applyRegisterChanges(p);
  expect(p.api.post).toHaveBeenCalledWith('/policies/policy1/'+endpoint,endpoint==='submit-review'?{expected_updated_at:'read'}:{approval_request_id:'request1',comment:'Reviewed the current version'});
  expect(p.api.patch).not.toHaveBeenCalled();
});
test('missing approval basis, read-only backend rejection, and a stale target do not report success',async()=>{
  const p=scenario();p.commands=[{name:'savePolicyApproval',args:['sample','P',{decision:'Approved',reason:'Reviewed'}]}];
  delete p.records.policies[0].approval_request_id;
  await expect(applyRegisterChanges(p)).rejects.toThrow('approval document');expect(p.api.post).not.toHaveBeenCalled();
  p.records.policies[0].approval_request_id='real-request';p.api.post.mockRejectedValueOnce(Error('This account cannot decide'));
  await expect(applyRegisterChanges(p)).rejects.toThrow('cannot decide');
  p.records.policies[0].client_id='another-client';
  await expect(applyRegisterChanges(p)).rejects.toThrow('unavailable');
});
test('offboarding follows the native transitions and uses the acknowledged version for its second write',async()=>{
  const p=scenario();p.commands=[{name:'offboardVendor',args:['sample','V',{reason:'Contract ended'}]}];
  await applyRegisterChanges(p);
  expect(p.api.patch.mock.calls).toEqual([['/vendors/vendor1',{status:'offboarding',notes:'Original\nContract ended',expected_updated_at:'read'}],
    ['/vendors/vendor1',{status:'inactive',expected_updated_at:'ack1'}]]);
});
test('records the selected AI review owner and binds the native review ID without changing the AI system owner',async()=>{
  const p=scenario();p.after.work.sample.revs.push({id:'new-ai-review',cad:'S',link:{kind:'ai',id:'A',purpose:'review'}});
  p.commands=[{name:'saveRecordSchedule',args:['sample','ai','A',{next:'2027-01-01',cad:'S',owner:'Taylor'}]}];
  const r=await applyRegisterChanges(p);
  expect(p.api.patch).not.toHaveBeenCalled();
  expect(p.api.post).toHaveBeenCalledWith('/ai_systems/ai1/reviews',{owner_id:'real-user',recurrence:'semiannual',due_date:'2027-01-01',expected_updated_at:'read'});
  expect(r.identityMaps.recordIds[p.clientId].reviews['new-ai-review']).toBe('ai-review');
  expect(r.handled.reviews).toEqual(expect.arrayContaining(['new-ai-review','ai-review']));
});
test('AI retirement, actual material changes and policy/AI decision permissions stay in their native endpoints',async()=>{
  const p=scenario();p.commands=[{name:'materialAIChange',args:['sample','A',{note:'Provider changed model'}]},{name:'retireAI',args:['sample','A',{reason:'Ceased use'}]}];
  await applyRegisterChanges(p);
  expect(p.api.post).toHaveBeenCalledWith('/ai_systems/ai1/material-change',{note:'Provider changed model',expected_updated_at:'read'});
  expect(p.api.patch).toHaveBeenCalledWith('/ai_systems/ai1',{status:'retired',governance_notes:'Ceased use',expected_updated_at:'ack1'});
});
test('button-based risk score edits persist only the two input ratings while reviewed ratings are owned by Review completion',async()=>{
  const p=scenario();Object.assign(p.after.programs.sample.risks[0],{L:4,I:5,score:20});
  await applyRegisterChanges(p);
  expect(p.api.patch).toHaveBeenCalledWith('/risks/risk1',{likelihood_score:4,impact_score:5,expected_updated_at:'read'});
  p.api.patch.mockClear();p.commands=[{name:'completeReview',args:['sample','Q',{}]}];
  expect((await applyRegisterChanges(p)).didWrite).toBe(false);
  expect(p.api.patch).not.toHaveBeenCalled();
});
test('services preserve native-only custom tool attributes, send a stable intent and take their new revision from the server',async()=>{
  const p=scenario(),key=p.clientId;
  const tool={id:'custom-1',a:['endpoint'],n:'Scanner'};
  p.before.services={sample:{preset:'full',areas:{endpoint:{resp:'cl',tools:[]}},custom:[tool]}};
  p.after.services=copy(p.before.services);p.after.services.sample.areas.endpoint.tools=['custom-1'];
  p.after.services.sample.custom[0].n='Updated scanner';
  p.records.clients[0].profile={services:{preset:'full',custom_tools:[{tool_id:'custom-1',product_reference:'https://docs.example',retired:false}]}};
  p.api.post.mockResolvedValue({data:{ok:true}});
  p.api.get.mockImplementation(()=>Promise.resolve({data:{client_id:key,updated_at:'new-service',
    services:{...p.api.post.mock.calls[0][1]}}}));
  expect((await applyRegisterChanges(p)).didWrite).toBe(true);
  const [url,body,options]=p.api.post.mock.calls[0];
  expect(url).toBe('/clients/native-client/services');expect(body).toMatchObject({expected_updated_at:'client-read',areas:{endpoint:{responsibility:'cl',tool_ids:['custom-1']}},
    custom_tools:[{tool_id:'custom-1',product_reference:'https://docs.example'}]});
  expect(options.headers['Idempotency-Key']).toMatch(/^[\w-]{16,128}$/);expect(p.records.clients[0].updated_at).toBe('new-service');
});
test('reuses the same create intent after uncertain transport and retains the returned identity',async()=>{
  const p=scenario();
  p.after.records.sample.ai.push({wfId:'new-ai',name:'New AI',purpose:'Documentation',prov:'Provider',owner:'Unassigned',st:'Pending assessment'});
  p.api.post.mockRejectedValueOnce(Error('Transport interrupted'));
  await expect(applyRegisterChanges(p)).rejects.toThrow('Transport');
  const r=await applyRegisterChanges(p);
  expect(p.api.post.mock.calls[0]).toEqual(p.api.post.mock.calls[1]);
  expect(r.identityMaps.recordIds[p.clientId].ai_systems['new-ai']).toBe('created');
  expect(p.api.post.mock.calls[1][1]).toEqual({client_id:'native-client',name:'New AI',description:'Documentation',provider:'Provider',owner_id:null});
});
test('cross-client command args cannot write the selected row',async()=>{
  const p=scenario();p.commands=[{name:'closeRisk',args:['another-client','R',{reason:'Closed'}]}];
  await expect(applyRegisterChanges(p)).rejects.toThrow('unavailable');
  expect(p.api.post).not.toHaveBeenCalled();expect(p.api.patch).not.toHaveBeenCalled();
});
test('a new mitigated risk uses the native lifecycle and maps its generated review by client and parent',async()=>{
  const p=scenario();
  p.after.programs.sample.risks.push({wfId:'new-risk',id:'RISK-009',st:'In treatment',title:'New risk',L:2,I:4,next:'2027-01-01'});
  p.after.work.sample.revs.push({id:'new-risk-review',due:'2027-01-01',link:{kind:'risk',id:'new-risk',purpose:'review'}});
  p.api.get.mockResolvedValue({data:[{client_id:'native-client',review_id:'correct',risk_id:'created',status:'upcoming'},
    {client_id:'another-client',risk_id:'created',review_id:'foreign',status:'upcoming'},
    {client_id:'native-client',risk_id:'risk1',review_id:'other',status:'upcoming'}]});
  const result=await applyRegisterChanges(p);
  expect(p.api.post.mock.calls[0][1]).toEqual({client_id:'native-client',title:'New risk',impact_score:4,likelihood_score:2,next_review:'2027-01-01'});
  expect(p.api.patch).toHaveBeenCalledWith('/risks/created',{status:'in_progress',treatment:'mitigate',expected_updated_at:'ack1'});
  expect(result.identityMaps.recordIds[p.clientId].reviews['new-risk-review']).toBe('correct');
});
test('policy description edits save through the native summary field',async()=>{
  const p=scenario();p.after.programs.sample.pols[0].description='Recovery policy scope';
  await applyRegisterChanges(p);
  expect(p.api.patch).toHaveBeenCalledWith('/policies/policy1',{summary:'Recovery policy scope',expected_updated_at:'read'});
});
test('the AI risk selector links the exact native risk belonging to the current client',async()=>{
  const p=scenario();
  p.records.risks[0].display_id='RISK-001';
  p.records.risks.unshift({...p.records.risks[0],risk_id:'other-risk',client_id:'other'});
  p.after.records.sample.ai[0].risk='RISK-001';
  await applyRegisterChanges(p);
  expect(p.api.post).toHaveBeenCalledWith('/ai_systems/ai1/links',{kind:'risks',id:'risk1',classification:'Context'});
});
test('native assurance requires its actual metadata and a calculated AI tier requires screening answers',async()=>{
  const p=scenario();p.after.programs.sample.vendors[0].asrSt='Reviewed';
  await expect(applyRegisterChanges(p)).rejects.toThrow('actual receipt or review date');
  p.after=copy(p.before);p.after.records.sample.ai[0].tier='High';
  await expect(applyRegisterChanges(p)).rejects.toThrow('screening questions');
  expect(p.api.patch).not.toHaveBeenCalled();
});
