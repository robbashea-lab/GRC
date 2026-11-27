import {appendApprovedV3Registers,overlayApprovedV3Registers} from './approvedV3Registers';
import {assessedRisk} from '../lib/grcWork';
import {aiProjection, validateAI} from '../lib/aiGovernance';
import {policySupportsAssessment} from '../lib/frameworkPolicyLinks';
import {serviceArea} from '../lib/r4ServicesTools';

test.each([['Reported existing','reported_existing','yes'],['Needs confirmation','needs_confirmation','unsure'],
  ['Needs creation','reported_missing','no']])('onboarding policy %s preserves its presence and a genuinely missing version', (st,presence,baseline_response)=>{
  const {source,db,ctx}=inputs(),row=source.programs.brawndo.pols[0];
  Object.assign(row,{st,ver:'—',appr:'',onbAns:baseline_response});
  appendApprovedV3Registers(db,source,ctx);
  expect(db.policies[0]).toMatchObject({version:null,presence,baseline_response});
  overlayApprovedV3Registers(source,db,{...ctx,userName:id=>id});
  expect(source.programs.brawndo.pols[0]).toMatchObject({st,ver:'—'});
});

const recordId = (kind, id) => kind+'_'+id.replaceAll(':','_');
function inputs() {
  const clientId = 'v3_brawndo';
  const ctx = {clientId, sourceId:'brawndo', frameworkKey:'cis-ig1', recordId,
    userId:name=>name==='Owner'?'v3_owner':null,
    policyBaselineKey:title=>title==='Information Security Policy'?'policy-information-security-policy':null,
    assessmentId:id=>({'1.1':'asset','1.2':'unmapped'})[id] || null};
  const db = {clients:[{client_id:clientId,profile:{industry:'Beverages'}}], framework_assessments:[
    {client_id:clientId,framework_assessment_id:'asset',framework_key:'cis-ig1',definition_id:'1.1'},
    {client_id:clientId,framework_assessment_id:'unmapped',framework_key:'cis-ig1',definition_id:'1.2'},
    {client_id:'separate-client',framework_assessment_id:'foreign',framework_key:'cis-ig1',definition_id:'1.1'}]};
  const risk = {id:'RISK-007',wfId:'brawndo:risk:2',title:'Unverified procedure drafts',owner:'Owner',
    st:'In treatment',L:3,I:3,score:9,next:'2026-12-20T08:00:00.000Z',last:null};
  const vendor = {wfId:'brawndo:vendor:4',name:'iVenture Solutions',desc:'Managed services',crit:'Moderate',
    access:['Internal'],owner:'Owner',auto:'svc',critProvisional:true,asr:'Security questionnaire',
    asrSt:'Reviewed',follow:'2026-12-20T08:00:00.000Z'};
  const policy = {wfId:'brawndo:policy:1',name:'Information Security Policy',cat:'Core Governance',
    map:['1.1','outside scope'],extra:2,st:'Approved',ver:'2.0',appr:'Sep 17',owner:'Owner'};
  const ai = {name:'ChatGPT',wfId:'brawndo:ai:1',prov:'OpenAI',purpose:'Drafting',tier:'High',
    st:'Pending assessment',owner:'Owner',risk:'RISK-007',rev:{id:'r100',title:'AI Governance Review — AI-002 — ChatGPT'}};
  const source = {programs:{brawndo:{risks:[risk],vendors:[vendor],pols:[policy]}},records:{brawndo:{ai:[ai]}},
    work:{brawndo:{revs:[{id:'r-risk',link:{kind:'risk',id:risk.wfId,purpose:'review'},cad:'Q'},
      {id:'r-contract',link:{kind:'vendor',id:vendor.wfId,purpose:'renewal'},cad:'1'},
      {id:'r-vendor',link:{kind:'vendor',id:vendor.wfId,purpose:'review'},cad:'S'}]}},
    services:{brawndo:{preset:'full',areas:{
      endpoint:{resp:'iv',tools:['ninjaone','client_mdm'],ticket:'Inventory review',cad:'Every six months'}},
      custom:[{id:'client_mdm',n:'Client MDM',a:['endpoint']}]}}};
  return {db,source,ctx};
}

test('converts the recorded exposure, linked work, policy scope and selected service tools',()=>{
  const {db,source,ctx} = inputs();
  appendApprovedV3Registers(db,source,ctx);
  const risk=db.risks[0], policy=db.policies[0], vendor=db.vendors[0], ai=db.ai_systems[0];
  expect(risk).toMatchObject({source_record_id:'brawndo:risk:2',risk_score:9,risk_level:'moderate',
    status:'in_progress',review_cadence:'quarterly',linked_review_id:recordId('reviews','r-risk')});
  expect(assessedRisk(risk)).toEqual(risk);
  expect(ai).toMatchObject({display_id:'AI-002',approval_status:'pending_assessment',source_screening_tier:'High',
    related_links:[{kind:'risks',id:risk.risk_id}],linked_review_id:recordId('reviews','r100')});
  expect(()=>validateAI(db,ai)).not.toThrow();
  expect(aiProjection(ai).screening_complete).toBe(false);
  expect(policy).toMatchObject({baseline_key:'policy-information-security-policy',approved_at:'2026-09-17',
    source_framework_references:['1.1','outside scope'],source_additional_mapping_count:2});
  expect(policySupportsAssessment(db.framework_assessments[0],policy)).toBe(true);
  expect(policySupportsAssessment(db.framework_assessments[1],policy)).toBe(false);
  expect(db.framework_assessments[2]).not.toHaveProperty('policy_link_ids');
  expect(vendor.review_frequency).toBe('semiannual');
  expect(vendor.assurance_records[0]).toMatchObject({source_review_status:'Reviewed',next_follow_up:'2026-12-20',evidence_ids:[]});
  expect(vendor.assurance_records[0]).not.toHaveProperty('reviewed_by');
  expect(policy).not.toHaveProperty('approval_subject');
  const profile=db.clients[0].profile;
  expect(profile.industry).toBe('Beverages');
  expect(serviceArea(profile.services,'endpoint')).toEqual({responsibility:'iv',tool_ids:['ninjaone','client_mdm']});
  expect(profile.services).toMatchObject({provider_vendor_id:vendor.vendor_id,custom_tools:[{tool_id:'client_mdm'}],
    source_area_ticket_references:{endpoint:{summary:'Inventory review',cadence:'Every six months'}}});
});

test('keeps independent approval and lifecycle state and allocates only missing AI identifiers',()=>{
  const {db,source,ctx}=inputs();
  const [first] = source.records.brawndo.ai;
  source.records.brawndo.ai.unshift({...first,name:'Other AI',wfId:'brawndo:ai:3',st:'Approval not recorded',rev:null});
  Object.assign(source.programs.brawndo.pols[0],{st:'Needs creation',appr:'',ver:''});
  appendApprovedV3Registers(db,source,ctx);
  expect(db.ai_systems.map(a=>a.display_id)).toEqual(['AI-003','AI-002']);
  expect(db.ai_systems[0]).toMatchObject({status:'active',approval_status:null});
  expect(db.policies[0]).toMatchObject({status:'needs_creation',baseline_response:'no',presence:'reported_missing',approved_at:null,version:null});
});

test('rejects an unresolved Risk link inside this client and refuses to overwrite a native register',()=>{
  const {db,source,ctx}=inputs();
  db.risks=[{client_id:'foreign-client',risk_id:'foreign',display_id:'RISK-100'}];
  source.records.brawndo.ai[0].risk='RISK-100';
  expect(()=>appendApprovedV3Registers(db,source,ctx)).toThrow('Unresolved AI Risk');
  expect(db.risks).toHaveLength(1);
  expect(db.clients[0].profile).not.toHaveProperty('services');
  source.records.brawndo.ai[0].risk='RISK-007';
  db.vendors=[{client_id:ctx.clientId,vendor_id:'saved-native'}];
  expect(()=>appendApprovedV3Registers(db,source,ctx)).toThrow('already present');
  expect(db.vendors).toEqual([{client_id:ctx.clientId,vendor_id:'saved-native'}]);
  expect(db.risks).toHaveLength(1);
});

test('calendar due dates stay on their chosen day and genuine recorded instants keep their original time',()=>{
  const {db,source,ctx}=inputs();appendApprovedV3Registers(db,source,ctx);
  db.risks[0].next_review='2026-12-20T00:00:00Z';
  db.risks[0].closed_at='2026-12-20T00:00:00Z';
  db.policies[0].next_review_date='2026-12-20';
  db.vendors[0].contract_renewal='2026-12-20T08:00:00.000Z';
  overlayApprovedV3Registers(source,db,{...ctx,userName:id=>id});
  const group=source.programs.brawndo;
  for(const d of [group.risks[0].next,group.pols[0].next])expect([d.getMonth()+1,d.getDate(),d.getHours()]).toEqual([12,20,0]);
  expect(group.risks[0].closedOn.toISOString()).toBe('2026-12-20T00:00:00.000Z');
  expect(group.vendors[0].renew.toISOString()).toBe('2026-12-20T08:00:00.000Z');
});

test('a newly-created client stays unconfigured without an onboarding services selection',()=>{
  const {db,source,ctx}=inputs();
  source.programs.brawndo={pols:[],risks:[],vendors:[]};
  source.records.brawndo.ai=[];
  delete source.services.brawndo;
  appendApprovedV3Registers(db,source,ctx);
  expect(db.clients[0].profile).not.toHaveProperty('services');
  expect(db.risks).toEqual([]);
  expect(db.policies).toEqual([]);
  expect(db.vendors).toEqual([]);
  expect(db.ai_systems).toEqual([]);
});

test('refreshes committed native state without losing visual-only metadata or treating a cleared field as an old value',()=>{
  const {db,source,ctx}=inputs();
  source.clients=[{id:'brawndo',activeProg:'cis'}];
  source.programs.brawndo.risks[0].visualTag='retain';
  source.records.brawndo.ai[0].catalogLogo='retain-logo';
  appendApprovedV3Registers(db,source,ctx);
  const risk = db.risks[0], policy=db.policies[0], vendor=db.vendors[0], ai=db.ai_systems[0];
  Object.assign(risk,{status:'closed',title:'Authoritative closed risk',owner_id:null,updated_at:'2026-11-24T19:00:00Z',
    next_review:null,closed_at:'2026-11-24T19:00:00Z',closure_note:'Exposure removed'});
  Object.assign(policy,{status:'draft',approved_at:null,version:'3.0',next_review_date:'2027-02-01'});
  Object.assign(vendor,{contract_renewal:null,status:'inactive',criticality:'critical',assurance_records:[]});
  Object.assign(ai,{approval_status:'approved',name:'Saved native name',related_links:[]});
  db.framework_assessments[0].policy_link_ids=[];
  db.framework_assessments[1].policy_link_ids=[policy.policy_id];
  db.clients[0].profile.services.areas.endpoint.tool_ids=[];
  db.risks.push({risk_id:'fresh-id',client_id:ctx.clientId,title:'Created in native',display_id:'RISK-008',status:'open'});
  db.risks.push({risk_id:'foreign-id',client_id:'another-client',title:'Foreign title',display_id:'RISK-009'});
  overlayApprovedV3Registers(source,db,{...ctx,userName:id=>id==='v3_owner'?'Owner':null});
  const group=source.programs.brawndo;
  expect(group.risks).toHaveLength(2);
  expect(group.risks[0]).toMatchObject({title:'Authoritative closed risk',owner:'Unassigned',st:'Closed',
    next:null,closeWhy:'Exposure removed',visualTag:'retain',wfId:risk.source_record_id});
  expect(group.risks[1]).toMatchObject({wfId:'fresh-id',id:'RISK-008'});
  expect(group.pols[0]).toMatchObject({st:'Draft',appr:'',ver:'3.0',map:['outside scope','1.2']});
  expect([group.pols[0].next.getFullYear(),group.pols[0].next.getMonth(),group.pols[0].next.getDate()]).toEqual([2027,1,1]);
  expect(group.vendors[0]).toMatchObject({st:'Offboarded',renew:null,asr:'',crit:'Critical'});
  expect(source.records.brawndo.ai[0]).toMatchObject({name:'Saved native name',st:'Approved',risk:null,catalogLogo:'retain-logo'});
  expect(source.services.brawndo.areas.endpoint.tools).toEqual([]);
  expect(()=>overlayApprovedV3Registers(source,db,{...ctx,clientId:'elsewhere'})).toThrow('does not belong');
});
