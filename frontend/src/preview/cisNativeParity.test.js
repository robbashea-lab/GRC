import {prepareTask} from './actionItems';
import {guardEdit} from './decisions';
import {ensureRiskReview,completeRiskReview} from './risks';
import {validateVendor,syncVendorReview} from './vendors';
import {aiRequest} from './aiGovernance';
import {actionOrigin} from '../lib/brawndoActions';
import {isCisClient,cisProgramProjection} from './cisCapability';
import {cisClientProgram} from '../lib/cisExperience';

function fixture(group=1) {
  const cid=`synthetic_native_ig${group}`;
  return {clients:[{client_id:cid,status:'active',name:'Independent client',
    framework_settings:{'cis-ig1':{implementation_group:group}},
    onboarding_baseline:{completed:true,requirements:{'cis-ig1':'applies'}}}],
    user:{user_id:'operator',role:'super_admin',name:'Synthetic operator',workspace_mode:'demo'},
    requirements:[{requirement_id:`${cid}:requirement`,client_id:cid,baseline_key:'cis-ig1',baseline_response:'applies'}],
    users:[],vendors:[],risks:[],reviews:[],ai_systems:[],evidence:[],assets:[],logs:[],baselines:{}};
}

test.each([1,2,3])('IG%i editable onboarding choices cannot disable or activate committed native enrollment',group=>{
  const db=fixture(group),client=db.clients[0],cid=client.client_id;
  const committed=JSON.stringify(db.requirements);
  client.onboarding_baseline={completed:false,requirements:{'cis-ig1':'does_not_apply'}};
  db.baselines[cid]={completed:false,requirements:{'cis-ig1':'does_not_apply'}};
  expect(isCisClient(db,cid)).toBe(true);
  expect(cisClientProgram({...client,cis_program:cisProgramProjection(db,client)})).toMatchObject({clientId:cid,implementationGroup:group});
  expect(()=>prepareTask(db,{client_id:cid,title:'Native committed work',priority:'informational',status:'open',source_type:'manual'})).not.toThrow();
  expect(JSON.stringify(db.requirements)).toBe(committed);

  db.requirements[0].baseline_response='does_not_apply';
  client.onboarding_baseline={completed:true,requirements:{'cis-ig1':'applies'}};
  db.baselines[cid]={completed:true,requirements:{'cis-ig1':'applies'}};
  expect(isCisClient(db,cid)).toBe(false);
  expect(cisClientProgram({...client,cis_program:cisProgramProjection(db,client)})).toBeNull();
  expect(()=>prepareTask(db,{client_id:cid,title:'Uncommitted draft choice',priority:'informational',status:'open',source_type:'manual'})).toThrow(/priority/);
  expect(()=>guardEdit('risks',{status:'monitoring'},{risk_id:'r',client_id:cid,status:'assessed'},db.user,db)).toThrow(/Invalid status/);
});

test.each(['deselected','malformed'])('saved assurance provenance remains protected after CIS is %s',condition=>{
  const db=fixture(2),cid=db.clients[0].client_id;
  const vendor={vendor_id:'retained-vendor',client_id:cid,name:'Retained provider',service:'Infrastructure',criticality:'medium',status:'active',
    assurance_records:[{assurance_id:'original',type:'SOC 2',review_status:'reviewed',reviewed_on:'2026-08-01',reviewed_by:'Original reviewer',superseded_by:'replacement',evidence_ids:[],history:[{evidence_ids:['historical-file'],recorded_by:'original-actor'}]},
      {assurance_id:'replacement',type:'SOC 2',review_status:'requested',history:[]}]};
  db.vendors.push(vendor);
  const task={task_id:'retained-task',client_id:cid,title:'Obtain renewal',priority:'informational',status:'open',source_type:'vendor',source_id:vendor.vendor_id,vendor_id:vendor.vendor_id,assurance_id:'original'};
  if(condition==='deselected')db.requirements[0].baseline_response='does_not_apply';
  else db.clients[0].framework_settings={'cis-ig1':{implementation_group:99}};
  expect(isCisClient(db,cid)).toBe(false);
  expect(()=>validateVendor(db,{...vendor,assurance_records:[]},vendor)).toThrow(/Assurance history must be retained/);
  const altered=JSON.parse(JSON.stringify(vendor));altered.assurance_records[0].reviewed_by='Replacement actor';
  expect(()=>validateVendor(db,altered,vendor)).toThrow(/Previous assurance documents are read-only/);
  const preserved=JSON.parse(JSON.stringify(vendor));preserved.assurance_records[0].history=[];
  validateVendor(db,preserved,vendor);
  expect(preserved.assurance_records[0].history).toEqual(vendor.assurance_records[0].history);
  expect(()=>prepareTask(db,{...task,assurance_id:null},task)).toThrow(/Original assurance source/);
  expect(()=>prepareTask(db,{...task,assurance_id:'replacement'},task)).toThrow(/Original assurance source/);
  expect(()=>prepareTask(db,{...task,notes:'Retained native work'},task)).not.toThrow();
  const documents=JSON.stringify(vendor.assurance_records);
  syncVendorReview(db,{client_id:cid,vendor_id:vendor.vendor_id,vendor_purpose:'assurance',status:'upcoming',due_date:'2027-10-13',occurrences:[{occurrence_id:'retained-review',completed_at:'2026-10-21T12:00:00Z'}]});
  expect(JSON.stringify(vendor.assurance_records)).toBe(documents);
  expect(vendor.assurance_last_reviewed).toBe('2026-10-21T12:00:00Z');
});

test.each([1,2,3])('IG%i native Action/Risk/Vendor behaviors follow saved configuration, preserving history and relationships',group=>{
  const db=fixture(group),cid=db.clients[0].client_id;
  const task={client_id:cid,title:'Obtain document',priority:'informational',status:'open',source_type:'manual'};
  expect(()=>prepareTask(db,task)).not.toThrow();
  const vendor={vendor_id:'vendor',client_id:cid,name:'Service provider',service:'Managed infrastructure',criticality:'medium',status:'onboarding',assurance_records:[{assurance_id:'assurance',type:'SOC 2',review_status:'requested',history:[]}]};
  db.vendors.push(vendor);
  expect(()=>prepareTask(db,{...task,source_type:'vendor',source_id:'vendor',vendor_id:'vendor',assurance_id:'foreign'})).toThrow(/Assurance source/);
  expect(()=>prepareTask(db,{...task,source_type:'vendor',source_id:'vendor',vendor_id:'vendor',assurance_id:'assurance'})).not.toThrow();
  expect(()=>prepareTask(db,{...task,assurance_id:'new'}, {...task,assurance_id:'original'})).toThrow(/Original assurance source/);
  expect(()=>validateVendor(db,{...vendor,status:'active'},vendor)).not.toThrow();
  expect(()=>validateVendor(db,{...vendor,assurance_records:[]},vendor)).toThrow(/Assurance history/);
  const last={occurrence_id:'completed-assurance',completed_at:'2026-10-21T12:00:00Z'};
  syncVendorReview(db,{client_id:cid,vendor_id:'vendor',vendor_purpose:'assurance',occurrences:[last],status:'upcoming',due_date:'2027-10-13'});
  expect(vendor.assurance_records[0]).toEqual({assurance_id:'assurance',type:'SOC 2',review_status:'requested',history:[]});
  expect(vendor.assurance_last_reviewed).toBe(last.completed_at);
  expect(()=>guardEdit('risks',{status:'monitoring'},{risk_id:'risk',client_id:cid,status:'assessed'},db.user,db)).not.toThrow();
  expect(()=>guardEdit('risks',{created_at:'2026-10-21'},{risk_id:'risk',client_id:cid,status:'assessed'},db.user,db)).toThrow(/history fields/);
  const risk={risk_id:'risk',client_id:cid,title:'Service dependency',status:'assessed',source_type:'other',display_id:'RISK-001',review_cadence:'annual',next_review:'2026-10-13'};
  db.risks.push(risk);
  const review=ensureRiskReview(db,risk);
  expect(review.risk_id).toBe(risk.risk_id);
  const completed={occurrence_id:'risk-done',completed_at:'2026-10-21T12:00:00Z'};
  completeRiskReview(db,review,completed,{risk_outcome:'Reviewed — No Change'});
  expect(risk.status).toBe('assessed');
  expect(completed.next_review_override).toBeNull();
  expect(completed.next_review_date).toBe('2027-10-13T00:00:00.000Z');
});

test.each([1,2,3])('IG%i AI approval retains explicit human decision, stale-write and tenant guards',group=>{
  const db=fixture(group),cid=db.clients[0].client_id;
  const row=aiRequest(db,'/ai_systems','post',{}, {client_id:cid,name:'Synthetic scheduling assistant',description:'Draft internal schedules for human review',environment:'Isolated evaluation',permitted_data_types:['Public']});
  const original=db.ai_systems[0];
  expect(original.approval_status).toBe('pending_assessment');
  const decide={status:'approved',note:'Human review required; public data only',expected_updated_at:original.updated_at};
  aiRequest(db,`/ai_systems/${row.ai_system_id}/approval`,'post',{},decide);
  expect(original.approval_history).toHaveLength(1);
  expect(original.approval_history[0]).toMatchObject({by:'operator',status:'approved',scope:{environment:'Isolated evaluation',permitted_data_types:['Public']}});
  expect(()=>aiRequest(db,`/ai_systems/${row.ai_system_id}/approval`,'post',{},decide)).toThrow(/changed since/);
  db.risks.push({risk_id:'foreign-risk',client_id:'foreign'});
  expect(()=>aiRequest(db,`/ai_systems/${row.ai_system_id}/links`,'post',{}, {kind:'risks',id:'foreign-risk'})).toThrow(/same client/);
  db.user={...db.user,role:'client_readonly',client_ids:[cid]};
  expect(()=>aiRequest(db,`/ai_systems/${row.ai_system_id}/approval`,'post',{}, {...decide,expected_updated_at:original.updated_at})).toThrow(/Read-only/);
  expect(original.approval_history).toHaveLength(1);
});

test('company names and draft payloads do not enable CIS behavior; common AI metadata retains native field, role and tenant denials',()=>{
  const db=fixture(),cid=db.clients[0].client_id;
  db.clients[0]={client_id:cid,name:'Brawndo',status:'active',onboarding_baseline:{completed:true,requirements:{'cis-ig1':'does_not_apply'}},framework_settings:{'cis-ig1':{implementation_group:3}}};
  db.requirements[0].baseline_response='does_not_apply';
  const task={client_id:cid,title:'Task',priority:'informational',status:'open',source_type:'manual'};
  expect(()=>prepareTask(db,task)).toThrow(/priority/);
  expect(()=>guardEdit('risks',{status:'monitoring',client_id:cid,framework_settings:{'cis-ig1':{implementation_group:3}}},{},db.user,db)).toThrow();
  expect(()=>guardEdit('risks',{status:'monitoring'},{risk_id:'unconfigured',client_id:'demo_brawndo',status:'assessed'},db.user,db)).toThrow(/Invalid status/);
  const vendor={vendor_id:'v',client_id:cid,name:'Non-CIS provider',service:'Service',criticality:'medium',status:'onboarding',assurance_records:[]};
  expect(()=>validateVendor(db,{...vendor,status:'active'},vendor)).toThrow(/next Vendor lifecycle/);
  expect(()=>validateVendor(db,{...vendor,status:'under_review'},vendor)).not.toThrow();
  db.vendors.push({...vendor,assurance_records:[{type:'SOC 2',required:true}]});
  syncVendorReview(db,{client_id:cid,vendor_id:'v',vendor_purpose:'assurance',occurrences:[{occurrence_id:'old-native',completed_at:'2026-10-21'}],due_date:'2027-10-13'});
  expect(db.vendors[0].assurance_records[0]).toMatchObject({last_reviewed:'2026-10-21',review_occurrence_id:'old-native'});
  const ai=aiRequest(db,'/ai_systems','post',{}, {client_id:cid,name:'Non-CIS AI',environment:'Synthetic evaluation'});
  expect(db.ai_systems).toHaveLength(1);
  expect(db.ai_systems[0]).toMatchObject({ai_system_id:ai.ai_system_id,client_id:cid,environment:'Synthetic evaluation',status:'draft'});
  expect(isCisClient(db,cid)).toBe(false);
  expect(db.ai_systems[0].approval_status).toBeUndefined();
  const saved=JSON.stringify(db.ai_systems);
  expect(()=>aiRequest(db,`/ai_systems/${ai.ai_system_id}`,'patch',{}, {approval_status:'approved',expected_updated_at:ai.updated_at})).toThrow(/read-only AI fields/);
  expect(JSON.stringify(db.ai_systems)).toBe(saved);
  db.user={...db.user,role:'client_readonly',client_ids:[cid]};
  expect(()=>aiRequest(db,`/ai_systems/${ai.ai_system_id}`,'patch',{}, {environment:'Unpermitted edit',expected_updated_at:ai.updated_at})).toThrow(/Read-only/);
  db.user={...db.user,role:'client_contributor',client_ids:['unrelated-client']};
  expect(()=>aiRequest(db,`/ai_systems/${ai.ai_system_id}`,'patch',{}, {environment:'Foreign edit',expected_updated_at:ai.updated_at})).toThrow(/Forbidden/);
  expect(JSON.stringify(db.ai_systems)).toBe(saved);
});

test('assurance origin follows an actual same-client document identity, without borrowing another client or inventing a missing document',()=>{
  const row={client_id:'synthetic_ig3',source_type:'vendor',source_id:'v',vendor_id:'v',assurance_id:'a'};
  const vendor={client_id:row.client_id,vendor_id:'v',name:'Service provider',assurance_records:[{assurance_id:'a',type:'SOC 2'}]};
  expect(actionOrigin(row,{vendors:[vendor]})).toMatchObject({detail:'Linked assurance document',initialValues:{vendorTab:'assurance',assuranceId:'a'}});
  expect(actionOrigin(row,{vendors:[{...vendor,client_id:'foreign'}]}).initialValues).toBeUndefined();
  expect(actionOrigin(row,{vendors:[{...vendor,assurance_records:[]}]}).initialValues).toBeUndefined();
});
