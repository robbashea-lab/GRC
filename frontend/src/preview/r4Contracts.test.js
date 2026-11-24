import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {buildReviewContract,completionPayload,validateCompletionGuide,parseReviewCompletionGuide} from '../lib/r4ReviewCompletion';
import {commonToolDefinitions,serviceCatalog} from '../lib/r4ServicesTools';
import {CATALOGS,activePlans} from '../lib/frameworks';
import {r4ServicesRequest,r4Catalog,setupActivities,readServiceContext,prepareServiceContext,commitServiceContext} from './r4ServicesTools';
import {prepareR4Completion,r4ReviewCompletionRequest,validateDemoCompletion} from './r4ReviewCompletion';

const snapshot=value=>JSON.stringify(value);
function fixture(){
  const user={user_id:'admin',role:'super_admin',status:'active',name:'Test administrator',email:'test@example.test'};
  return {user,users:[user],clients:[{client_id:'c',name:'Unfamiliar client',status:'active',updated_at:'c1',profile:{services:{areas:{endpoint:{responsibility:'iv',tool_ids:['ninjaone']}},custom_tools:[],exclusions:{}}}}],
    reviews:[{review_id:'r',client_id:'c',review_type:'asset',framework_key:'cis-ig1',framework_plan_key:'asset-inventory',current_occurrence_id:'o1',updated_at:'v1',recurrence:'semiannual',due_date:'2026-12-01',title:'Renamed inventory work',owner_id:null}],
    requirements:[{requirement_id:'p',client_id:'c',baseline_key:'cis-ig1',baseline_response:'applies'}],framework_assessments:[],findings:[],tasks:[],risks:[],policies:[],vendors:[],evidence:[],logs:[],notifications:[],contacts:[],assets:[],ai_systems:[]};
}
beforeAll(()=>{Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});globalThis.TextEncoder=TextEncoder;});

test('Guide DTO rejects malformed responses while explicit empty custom and native gates remain valid',async()=>{
  const db=fixture();await prepareR4Completion(db,'/reviews/r/completion-guide','get');
  const guide=r4ReviewCompletionRequest(db,'/reviews/r/completion-guide','get');
  expect(parseReviewCompletionGuide(guide)).toBe(guide);
  const broken=[null,{}, {...guide,steps:null},{...guide,results:{}},{...guide,service_context:[{}]},
    {...guide,service_context:[{...guide.service_context[0],tools:null}]},{...guide,required_support:null},
    {...guide,contract_token:'bad'},{...guide,occurrence_id:''},{...guide,template_version:null},
    {...guide,steps:[]},{...guide,steps:[guide.steps[0],guide.steps[0]]},
    {...guide,results:[{step_id:'unknown',result:'Pass',reason:''}]}];
  for(const value of broken){
    expect(()=>parseReviewCompletionGuide(value)).toThrow(/could not be read/);
    expect(()=>completionPayload(value)).toThrow(/could not be read/);
  }
  for(const kind of ['custom','native_only'])expect(parseReviewCompletionGuide({...guide,template_id:kind,
    custom:kind==='custom',native_gate:kind==='native_only',steps:[],results:[],service_context:[],required_support:[]})).toMatchObject({template_id:kind});
  const accepted={request:{occurrence_id:guide.occurrence_id,completion_notes:'Original retained result'},
    completed_at:'2026-10-21T12:00:00+00:00',completed_by:'original-actor'};
  expect(parseReviewCompletionGuide({...guide,accepted_completion_retry:accepted}).accepted_completion_retry).toBe(accepted);
  for(const descriptor of [{...accepted,request:{...accepted.request,occurrence_id:'other'}},
    {...accepted,request:{...accepted.request,injected:'bad'}},{...accepted,completed_by:null},
    {...accepted,request:{...accepted.request,checklist:{contract_token:'bad',results:[]}}}])
    expect(()=>parseReviewCompletionGuide({...guide,accepted_completion_retry:descriptor})).toThrow(/could not be read/);
});

test('the shared catalogs contain exactly the approved service/tool populations and picker-only common options',()=>{
  expect(serviceCatalog.areas).toHaveLength(23);expect(serviceCatalog.tools).toHaveLength(29);
  expect(new Set(serviceCatalog.tools.map(t=>t.tool_id)).size).toBe(29);
  expect(commonToolDefinitions().every(t=>t.category==='custom')).toBe(true);
  expect(serviceCatalog.tools.some(t=>t.tool_id.startsWith('common_'))).toBe(false);
});

test('canonical emitted steps retain only actual support and stable identity after rename',()=>{
  const db=fixture(),review=db.reviews[0],contract=buildReviewContract(review,db.clients[0].profile.services,CATALOGS);
  expect(contract.steps.map(s=>s.step_id)).toEqual(['asset:operation:ticket','asset:operation:due','asset:operation:results','asset:operation:exceptions','asset:operation:next','asset:client:1']);
  expect(contract.required_support).toEqual(['Results for this review period']);
  expect(contract.required_support).not.toContain('Dated inventory export');
  expect(buildReviewContract({...review,title:'Another rename'},db.clients[0].profile.services,CATALOGS)).toEqual(contract);
});

test('Setup Done requires a valid native recurring schedule and indexing never repairs records',()=>{
  const db=fixture();db.reviews[0].activity_setup={recurring_ticket_number:'123'};
  const entry=()=>setupActivities(db,db.clients[0]).find(row=>row.review_id==='r');
  expect(entry().state).toBe('done');
  for(const change of [{due_date:'invalid'},{recurrence:'unknown'},
    {recurrence:'custom',custom_recurrence_days:0},{recurrence:'custom',custom_recurrence_days:3661}]){
    Object.assign(db.reviews[0],{due_date:'2026-12-01',recurrence:'annual'},change);
    const before=snapshot(db);expect(entry().state).toBe('todo');expect(snapshot(db)).toBe(before);
  }
});

test('every active plan in all six framework catalogs has an explicit mapping and unknown native plans fail closed',()=>{
  expect(Object.keys(CATALOGS).sort()).toEqual(['cis-ig1','cmmc','hipaa','iso-27001','nist-csf-2','soc-2']);
  for(const key of Object.keys(CATALOGS))for(const plan of activePlans(key,key==='cis-ig1'?{implementation_group:3}:key==='cmmc'?{level:2}:{})){
    const contract=buildReviewContract({review_id:'mapped',client_id:'c',framework_key:key,framework_plan_key:plan.key,recurrence:'annual'}, {},CATALOGS);
    expect(contract.custom).toBe(false);
  }
  expect(()=>buildReviewContract({review_id:'unknown',framework_key:'cis-ig1',framework_plan_key:'unknown-source'}, {},CATALOGS)).toThrow(/mapping/);
});

test('source qualification appends context to a supplied step without adding a completion mandate',()=>{
  const review={review_id:'aw',client_id:'c',review_template_id:'awareness',framework_key:'hipaa',recurrence:'annual'};
  const contract=buildReviewContract(review,{},CATALOGS);
  expect(contract.steps).toHaveLength(9);
  expect(contract.steps.filter(s=>s.text.includes('HIPAA source context'))).toHaveLength(1);
  expect(contract.steps.some(s=>s.step_id.endsWith('source-context'))).toBe(false);
});

test('read-only Guide GET is inert and completion validates missing, stale, non-Pass and support cases before mutation',async()=>{
  const db=fixture(),before=snapshot(db);
  await prepareR4Completion(db,'/reviews/r/completion-guide','get');
  const guide=r4ReviewCompletionRequest(db,'/reviews/r/completion-guide','get');
  expect(snapshot(db)).toBe(before);
  expect(()=>validateCompletionGuide(guide)).toThrow(/every checklist/);
  const filled={...guide,results:guide.steps.map(s=>({step_id:s.step_id,result:'Pass',reason:''})),supporting_reference:'Completed result record ABC'};
  const body=completionPayload(filled);
  await prepareR4Completion(db,'/reviews/r/complete','post',body);
  const retained=validateDemoCompletion(db,db.reviews[0],body,[]);
  expect(retained.checklist_results).toHaveLength(6);
  expect(retained.checklist_outcome).toBe('No exceptions noted');
  expect(retained).not.toHaveProperty('outcome');
  expect(()=>validateDemoCompletion(db,db.reviews[0],{...body,expected_updated_at:'old'},[])).toThrow(/changed/);
  expect(()=>validateDemoCompletion(db,db.reviews[0],{...body,supporting_reference:''},[])).toThrow(/support/);
  const nonpass=JSON.parse(JSON.stringify(body));nonpass.checklist.results[0]={...nonpass.checklist.results[0],result:'NMI',reason:'  '};
  expect(()=>validateDemoCompletion(db,db.reviews[0],nonpass,[])).toThrow(/non-Pass/);
  expect(snapshot(db)).toBe(before);
});

test('Exception requires real current follow-up, accepts open corrective work, and rejects even an empty captured rating payload',async()=>{
  const db=fixture();await prepareR4Completion(db,'/reviews/r/completion-guide','get');
  const guide=r4ReviewCompletionRequest(db,'/reviews/r/completion-guide','get'),body=completionPayload({...guide,results:guide.steps.map((s,i)=>({step_id:s.step_id,result:i?'Pass':'Exception',reason:i?'':'Unexpected device'})),supporting_reference:'Completed result record ABC'});
  expect(()=>validateDemoCompletion(db,db.reviews[0],body,[])).toThrow(/Raise finding/);
  expect(db.findings).toHaveLength(0);
  db.findings.push({finding_id:'f',client_id:'c',review_id:'r',occurrence_id:'o1',status:'in_remediation'});db.tasks.push({task_id:'t',client_id:'c',finding_id:'f',status:'open'});
  expect(validateDemoCompletion(db,db.reviews[0],body,[]).checklist_results[0].result).toBe('Exception');
  expect(()=>validateDemoCompletion(db,db.reviews[0],{...body,risk_assessment:{}},[])).toThrow(/risk rating/);
  expect(db.tasks[0].status).toBe('open');
});

test('Guide checkpoints retain partial answers idempotently and freeze context only for their own occurrence',async()=>{
  const db=fixture(),path='/reviews/r/completion-guide';
  await prepareR4Completion(db,path,'get');
  const guide=r4ReviewCompletionRequest(db,path,'get'),body={occurrence_id:'o1',expected_updated_at:'v1',checklist:{contract_token:guide.contract_token,results:[{step_id:'asset:operation:ticket',result:'NMI',reason:''}]},supporting_reference:''};
  await prepareR4Completion(db,path,'put',body);
  const saved=r4ReviewCompletionRequest(db,path,'put',body,'progress-intent'),after=snapshot(db);
  expect(saved.results).toEqual(body.checklist.results);
  expect(r4ReviewCompletionRequest(db,path,'put',body,'progress-intent')).toEqual(saved);
  expect(snapshot(db)).toBe(after);
  db.clients[0].profile.services.areas.endpoint.responsibility='cl';
  expect(buildReviewContract(db.reviews[0],db.clients[0].profile.services,CATALOGS).steps).toHaveLength(6);
  db.reviews[0].current_occurrence_id='o2';
  await prepareR4Completion(db,path,'get');
  const next=r4ReviewCompletionRequest(db,path,'get');
  expect(next.steps).toHaveLength(3);expect(next.results).toEqual([]);expect(next.supporting_reference).toBe('');
});

test('a direct genuinely custom Review retains explicit-outcome fallback without a checklist or universal support mandate',()=>{
  const db=fixture();delete db.reviews[0].framework_key;delete db.reviews[0].framework_plan_key;
  const result=validateDemoCompletion(db,db.reviews[0],{occurrence_id:'o1',outcome:'No exceptions noted'},[]);
  expect(result.review_template_id).toBe('custom');expect(result.checklist_results).toEqual([]);expect(result.checklist.required_support).toEqual([]);
});

test('Services saves and same-intent retries preserve one provider linkage and never infer access or assurance',()=>{
  const db=fixture(),body={expected_updated_at:'c1',areas:{endpoint:{responsibility:'iv',tool_ids:['ninjaone']}},custom_tools:[],preset:null};
  r4ServicesRequest(db,'/clients/c/services','post',body,'services-intent');
  expect(db.clients[0].profile.services.areas.endpoint.tool_ids).toEqual(['ninjaone']);
  expect(db.vendors).toHaveLength(1);expect(db.vendors[0]).toMatchObject({criticality_provisional:true,data_relationship:[],business_owner_id:null,assurance_required:false,status:'onboarding'});
  const saved=snapshot(db);r4ServicesRequest(db,'/clients/c/services','post',body,'services-intent');expect(snapshot(db)).toBe(saved);
});

test('Catalog replacement checks every tenant before mutation and preserves old occurrence snapshots',()=>{
  const db=fixture();db.clients.push({client_id:'other',name:'Other authorized test client',status:'active',updated_at:'x',profile:{services:{areas:{endpoint:{responsibility:'iv',tool_ids:['ninjaone']}}}}});
  db.reviews[0].occurrences=[{occurrence_id:'historical',service_context:[{tool_id:'ninjaone',name:'Recorded name'}]}];
  db.user={...db.user,role:'platform_admin',client_ids:['c']};const before=snapshot(db),body={replacement_id:'intune',expected_updated_at:null,retire:true};
  expect(()=>r4ServicesRequest(db,'/tool-catalog/ninjaone/replace','post',body,'replacement-intent')).toThrow(/Forbidden/);expect(snapshot(db)).toBe(before);
  db.user.all_clients=true;r4ServicesRequest(db,'/tool-catalog/ninjaone/replace','post',body,'replacement-intent');
  expect(db.clients.every(c=>c.profile.services.areas.endpoint.tool_ids.includes('intune'))).toBe(true);
  expect(r4Catalog(db).find(t=>t.tool_id==='ninjaone').retired).toBe(true);
  expect(db.reviews[0].occurrences[0].service_context[0].tool_id).toBe('ninjaone');
});

test('Setup and assessment context reads preserve all activities without creating records or applying drafts',()=>{
  const db=fixture(),before=snapshot(db),assessment={framework_assessment_id:'a',client_id:'c',framework_key:'cis-ig1',definition_id:'1.1'};
  const entries=setupActivities(db,db.clients[0]);expect(entries.some(a=>a.review_id==='r')).toBe(true);
  const context=readServiceContext(db,assessment),candidate=context.candidates.find(a=>a.review_id==='r');
  expect(candidate).toBeDefined();expect(snapshot(db)).toBe(before);
  const plan=prepareServiceContext(db,assessment,{activity_id:candidate.activity_id,review_id:'r',expected_updated_at:'v1',expected_client_updated_at:'c1',area_id:'endpoint',tool_ids:['intune'],recurring_ticket_number:'12',recurring_ticket_url:'https://tickets.example.test/12',cadence:'semiannual',first_next_due:'2027-03-01'});
  expect(plan.review.activity_setup.recurring_ticket_number).toBe('12');expect(snapshot(db)).toBe(before);
  expect(plan.services.areas.endpoint.tool_ids).toEqual(['ninjaone','intune']);
});

test('a confirmed interview setup reaches Demo Services and iVenture Setup for an unfamiliar client',()=>{
  const db=fixture(),client=db.clients[0],assessment={framework_assessment_id:'new',client_id:'c',framework_key:'cis-ig1',definition_id:'1.1'};
  client.profile.services.areas.endpoint={responsibility:'un',tool_ids:[]};
  const activity=readServiceContext(db,assessment).candidates.find(row=>row.review_id==='r');
  const plan=prepareServiceContext(db,assessment,{activity_id:activity.activity_id,review_id:'r',expected_updated_at:'v1',expected_client_updated_at:'c1',
    responsibility:'co',area_id:activity.area_id,tool_ids:['ninjaone'],recurring_ticket_number:'34567',cadence:'semiannual',first_next_due:'2027-02-15'});
  commitServiceContext(db,assessment,plan);
  const reloaded=readServiceContext(db,assessment);
  expect(reloaded.services.areas[activity.area_id]).toMatchObject({responsibility:'co',tool_ids:['ninjaone']});
  expect(setupActivities(db,db.clients[0]).find(row=>row.review_id==='r')).toMatchObject({state:'done',first_next_due:'2027-02-15',setup:{recurring_ticket_number:'34567'}});
});

test('Guide PUT without an explicit request key replays its exact payload and refuses a stale changed payload without side effects',async()=>{
  const db=fixture(),path='/reviews/r/completion-guide';
  await prepareR4Completion(db,path,'get');
  const guide=r4ReviewCompletionRequest(db,path,'get');
  const body={occurrence_id:guide.occurrence_id,expected_updated_at:guide.expected_updated_at,
    checklist:{contract_token:guide.contract_token,results:[{step_id:guide.steps[0].step_id,result:'NMI',reason:'SYNTHETIC retained partial checkpoint'}]},
    supporting_reference:'SYNTHETIC checkpoint reference'};
  await prepareR4Completion(db,path,'put',body);
  const saved=r4ReviewCompletionRequest(db,path,'put',body),after=snapshot(db);
  expect(saved.results).toEqual(body.checklist.results);
  expect(Object.keys(db.command_requests)).toHaveLength(1);
  expect(db.logs.filter(row=>row.action==='Review checklist saved')).toHaveLength(1);
  await prepareR4Completion(db,path,'put',body);
  expect(r4ReviewCompletionRequest(db,path,'put',body)).toEqual(saved);
  expect(snapshot(db)).toBe(after);
  const changed={...body,supporting_reference:'SYNTHETIC changed checkpoint with the old revision'};
  await prepareR4Completion(db,path,'put',changed);
  expect(()=>r4ReviewCompletionRequest(db,path,'put',changed)).toThrow(/changed/);
  expect(snapshot(db)).toBe(after);
});
