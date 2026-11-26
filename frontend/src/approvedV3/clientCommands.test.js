import axios from 'axios';
import {previewAdapter} from '../preview/adapter';
import {freshApprovedDemo} from '../preview/approvedV3Demo';
import scenario from '../../../shared/fixtures/approvedV3Scenario.json';
import {overlayApprovedClientAssessments,approvedV3IdentityMaps,sourceHash} from '../preview/approvedV3Records';
import {applyClientChanges,approvedOnboardingPlan} from './clientCommands';
import {applyWorkChanges} from './workCommands';
import baselineCatalog from '@catalogs/onboardingCatalog.json';

const clone=v=>JSON.parse(JSON.stringify(v));
const cid='v3sample_brawndo',sourceId='brawndo';
function context() {
  const records=freshApprovedDemo(),identityMaps=approvedV3IdentityMaps(records);
  const before=overlayApprovedClientAssessments(clone(scenario.source_state),records),after=clone(before);
  return {records,before,after,sourceId,clientId:cid,identityMaps,userIds:{},api:{}};
}
const priorFlag=process.env.REACT_APP_STANDARD_SIGN_IN;
beforeEach(()=>{process.env.REACT_APP_STANDARD_SIGN_IN='true';});
afterEach(()=>{if(priorFlag===undefined)delete process.env.REACT_APP_STANDARD_SIGN_IN;else process.env.REACT_APP_STANDARD_SIGN_IN=priorFlag;sessionStorage.clear();});

test('native profile edit and independent control narrative survive fresh reads',async()=>{
  const ctx=context(),api=axios.create({adapter:previewAdapter});
  await api.post('/demo/enter');ctx.api=api;
  ctx.after.profile.brawndo.v2.emp=237;
  const key='brawndo|cis:8.1|1.1';
  ctx.after.itemCur[key]='The client reported reviewing the inventory twice a year.';
  const result=await applyClientChanges(ctx);
  expect(result.applied).toContain('profile:organization');
  const aid=result.applied.find(s=>s.startsWith('assessment:')).slice(11);
  expect((await api.get('/clients/'+cid+'/profile')).data.profile.organization.employees).toBe(237);
  expect((await api.get('/framework_assessments/'+aid)).data.implementation).toBe(ctx.after.itemCur[key]);
});

test('a new contact cannot alias a removed ordinal or a different client',async()=>{
  const ctx=context(),rows=ctx.after.records.brawndo.contacts;
  const old=rows[rows.length-1],key=old.sourceRecordId;
  const id=ctx.identityMaps.recordIds[cid].contacts[key];
  rows.splice(-1,1,{name:'New contact',email:'new@example.test',role:'Reviewer',primary:false,access:false});
  ctx.api.post=jest.fn(async(url,body)=>({data:{...body,contact_id:'saved-contact-7'}}));
  ctx.api.delete=jest.fn(async()=>({data:{ok:true}}));
  const result=await applyClientChanges(ctx);
  const alias=rows[rows.length-1].sourceRecordId;
  expect(alias).not.toBe(key);expect(result.identityMaps.recordIds[cid].contacts[alias]).toBe('saved-contact-7');
  expect(ctx.api.delete).toHaveBeenCalledWith('/contacts/'+id,{data:{expected_updated_at:null}});
  await expect(applyClientChanges({...ctx,clientId:'v3sample_prestige'})).rejects.toThrow('source client');
});

test('an ineligible lead fails ahead of any change and a native stale assessment save surfaces a conflict',async()=>{
  const ctx=context(),client=ctx.after.clients.find(c=>c.id===sourceId);
  client.lead='Former employee';
  ctx.api.patch=jest.fn().mockRejectedValue(Object.assign(new Error('Assessment changed'),{status:409}));
  await expect(applyClientChanges(ctx)).rejects.toThrow('current platform user');
  expect(ctx.api.patch).not.toHaveBeenCalled();
  client.lead=ctx.before.clients.find(c=>c.id===sourceId).lead;
  ctx.after.itemCur['brawndo|cis:8.1|1.1']='Proposed note';
  await expect(applyClientChanges(ctx)).rejects.toMatchObject({clientId:cid,status:409,applied:[]});
});

test('a personal checkpoint uses the approved interview version and never changes control status',async()=>{
  const ctx=context(),key='brawndo|cis:8.1|1.1',aid=ctx.identityMaps.recordIds[cid].framework_assessments['cis-ig1|1.1'];
  ctx.after.guideSaved[key]={stage:'q',idx:2,ans:{freq:'Every six months'},draft:null};
  ctx.api.put=jest.fn(async()=>({data:{version:sourceHash,revision:1,digest:'c'.repeat(64)}}));
  ctx.api.patch=jest.fn();
  const result=await applyClientChanges(ctx);
  expect(result.applied).toEqual(['guided:'+aid]);
  expect(ctx.api.put).toHaveBeenCalledWith('/framework_assessments/'+aid+'/approved-guide',expect.objectContaining({
    version:sourceHash,expected_revision:0,reviewed:false,checkpoint:{stage:'q',idx:2,ans:{freq:'Every six months'},draft:null}}));
  expect(ctx.api.patch).not.toHaveBeenCalled();
});

test('the signed-in new-client form uses the native client create with its durable source alias',async()=>{
  const ctx=context();
  ctx.sourceId='new-client';ctx.clientId=null;
  ctx.after.clients.push({id:ctx.sourceId,name:'New client',env:'Production',status:'Onboarding',lead:null,isNew:true});
  ctx.after.records[ctx.sourceId]={contacts:[],systems:[]};
  ctx.api.post=jest.fn(async()=>({data:{client_id:'cli_874',source_client_id:ctx.sourceId}}));
  const result=await applyClientChanges(ctx);
  expect(result.clientId).toBe('cli_874');expect(result.identityMaps.clientIds[ctx.sourceId]).toBe('cli_874');
  expect(ctx.api.post).toHaveBeenCalledWith('/v3/approved-portfolio/clients',expect.objectContaining({source_id:ctx.sourceId,
    client:expect.objectContaining({name:'New client',status:'onboarding'})}));
});

test('a new multi-program client goes through native onboarding and receives actual assessment IDs',async()=>{
  const ctx=context(),api=axios.create({adapter:previewAdapter,headers:{'Idempotency-Key':'approved-v3-onboarding-test'}});
  await api.post('/demo/enter');ctx.api=api;
  const created=(await api.post('/clients',{name:'Fresh multi-program client',status:'onboarding',environment:'Demo'})).data;
  const id='new-onboarding',client={name:created.name,env:'Demo',id,status:'Onboarding',isNew:true,onboarded:false,progs:[]};
  ctx.clientId=created.client_id;ctx.sourceId=id;ctx.records.clients.push({...created,source_client_id:id});ctx.identityMaps.clientIds[id]=created.client_id;
  for(const state of [ctx.before,ctx.after]){
    state.clients.push(clone(client));state.records[id]={contacts:[],systems:[],ai:[]};state.profile[id]={empty:true};state.own[id]={};
    state.programs[id]={risks:[],vendors:[],pols:[]};state.work[id]={revs:[],acts:[],done:[],hist:[]};
  }
  ctx.after.clients.at(-1).onboarded=true;
  ctx.after.onboarding[id]={step:4,prog:{cis:'applies',nist:'applies',iso:'applies',soc:'applies',hipaa:'applies',cmmc:'applies'},
    ig:3,cmmc:2,pol:Object.fromEntries(baselineCatalog.policies.map(policy=>[policy.name,{inc:true,ans:'unsure'}])),
    rev:{'Account Authorization & Access Review':{inc:true,cad:'quarterly',due:'2027-02-01'},
      'Vulnerability & Remediation Process Review':{inc:true,cad:'monthly',due:''},
      'Vulnerability Governance Review':{inc:true,cad:'quarterly',due:''},
      'Vulnerability scan and remediation review':{inc:true,cad:'monthly',due:''}},gen:{}};
  ctx.after.work[id].revs=[
    {id:'source-access-a',title:'Account Authorization & Access Review',supportTemplate:'Account Authorization & Access Review',cad:'Q',due:'2027-02-01',onb:true,kind:'rev'},
    {id:'source-access-b',title:'Access Rights Review',supportTemplate:'Access Rights Review',cad:'Q',due:'2027-02-01',onb:true,kind:'rev'},
    {id:'source-vulnerability',title:'Vulnerability Governance Review',supportTemplate:'Vulnerability Governance Review',cad:'M',due:null,onb:true,kind:'rev'},
  ];
  // Each approved form submission carries its own transport receipt.
  api.defaults.headers.common['Idempotency-Key']='approved-v3-onboarding-finalize';
  api.defaults.headers['Idempotency-Key']='approved-v3-onboarding-finalize';
  const post=jest.spyOn(api,'post');
  const result=await applyClientChanges(ctx);
  expect(result.applied).toContain('onboarding:complete');
  const handoff=(await api.get('/onboarding/handoff',{params:{client_id:ctx.clientId}})).data;
  expect(handoff.completed).toBe(true);
  expect(new Set(handoff.records.framework_assessments.map(a=>a.framework_key))).toEqual(new Set(['cis-ig1','nist-csf-2','iso-27001','soc-2','hipaa','cmmc']));
  expect(handoff.records.framework_assessments.every(a=>a.client_id===ctx.clientId&&a.status==='not_assessed')).toBe(true);
  const savedReviews=(await api.get('/reviews',{params:{client_id:ctx.clientId}})).data;
  const access=savedReviews.filter(review=>review.framework_drivers?.some(driver=>driver.framework_plan_key==='account-authorization'));
  expect(access).toHaveLength(1);
  expect(access[0]).toMatchObject({recurrence:'quarterly',due_date:'2027-02-01'});
  expect(new Set(access[0].framework_drivers.map(driver=>driver.framework_key))).toEqual(new Set(['cis-ig1','nist-csf-2','iso-27001','soc-2','cmmc','hipaa']));
  const vulnerability=savedReviews.filter(review=>review.framework_drivers?.some(driver=>driver.framework_plan_key==='vulnerability-remediation'));
  expect(vulnerability).toHaveLength(1);expect(vulnerability[0]).toMatchObject({recurrence:'monthly',due_date:null});
  expect(new Set(vulnerability[0].framework_drivers.map(driver=>driver.framework_key))).toEqual(new Set(['cis-ig1','nist-csf-2','soc-2','cmmc']));
  expect(ctx.after.onboarding[id].rev['Vulnerability Governance Review']).toMatchObject({cad:'monthly',_auto:false});
  expect(result.handled.reviews).toEqual(expect.arrayContaining(['source-access-a','source-access-b','source-vulnerability']));
  expect(result.identityMaps.recordIds[ctx.clientId].reviews['source-access-a']).toBe(access[0].review_id);
  expect(result.identityMaps.recordIds[ctx.clientId].reviews['source-access-b']).toBe(access[0].review_id);
  await applyWorkChanges({...ctx,identityMaps:result.identityMaps,handled:result.handled});
  expect(post.mock.calls.filter(([route])=>route==='/reviews')).toEqual([]);
},20000);

test('contradictory source schedules for the same shared review fail before native writes',async()=>{
  const ctx=context();ctx.before.clients.find(client=>client.id===sourceId).onboarded=false;
  ctx.after.clients.find(client=>client.id===sourceId).onboarded=true;
  ctx.after.onboarding[sourceId]={step:4,prog:{cis:'applies',nist:'applies',iso:'applies',soc:'applies',hipaa:'applies',cmmc:'applies'},
    ig:3,cmmc:2,pol:{},rev:{
      'Account Authorization & Access Review':{inc:true,cad:'quarterly',due:'2027-02-01',_auto:false},
      'Access Entitlement Review':{inc:true,cad:'annual',due:'2027-03-01',_auto:false},
    },gen:{}};
  ctx.api={get:jest.fn(async()=>({data:{state:ctx.records.clients.find(client=>client.client_id===cid).onboarding_baseline,record_versions:{}}})),
    post:jest.fn(),patch:jest.fn()};
  await expect(applyClientChanges(ctx)).rejects.toThrow('Choose one cadence and first due date for shared Review');
  expect(ctx.api.post).not.toHaveBeenCalled();expect(ctx.api.patch).not.toHaveBeenCalled();
});

test.each([{cad:'custom',days:45,due:'2027-06-01',code:'D:45',writes:1},
  {cad:'annual',days:30,due:'',code:'A',writes:0}])('generic onboarding preserves $cad scheduling without extra default writes',async selection=>{
  const ctx=context(),api=axios.create({adapter:previewAdapter,headers:{'Idempotency-Key':'generic-create-'+selection.cad}});
  await api.post('/demo/enter');ctx.api=api;
  const created=(await api.post('/clients',{name:'Generic onboarding client',status:'onboarding',environment:'Demo'})).data;
  const id='generic-onboarding',client={id,name:created.name,status:'Onboarding',isNew:true,onboarded:false,progs:[]};
  ctx.clientId=created.client_id;ctx.sourceId=id;ctx.records.clients.push({...created,source_client_id:id});ctx.identityMaps.clientIds[id]=created.client_id;
  for(const state of [ctx.before,ctx.after]){
    state.clients.push(clone(client));state.records[id]={contacts:[],systems:[],ai:[]};state.profile[id]={empty:true};state.own[id]={};
    state.programs[id]={risks:[],vendors:[],pols:[]};state.work[id]={revs:[],acts:[],done:[],hist:[]};
  }
  ctx.after.clients.at(-1).onboarded=true;
  ctx.after.onboarding[id]={step:4,prog:{},pol:{},rev:{},gen:{'Risk Assessment':{inc:true,...selection}}};
  ctx.after.work[id].revs=[{id:'source-generic-review',title:'Risk Assessment',supportTemplate:'Risk Assessment',type:'General GRC',
    cad:selection.code,due:selection.due||null,onb:true,kind:'rev'}];
  api.defaults.headers.common['Idempotency-Key']='generic-finalize-'+selection.cad;
  api.defaults.headers['Idempotency-Key']='generic-finalize-'+selection.cad;
  const patch=jest.spyOn(api,'patch'),result=await applyClientChanges(ctx);
  const reviewId=result.identityMaps.recordIds[ctx.clientId].reviews['source-generic-review'];
  const saved=(await api.get('/reviews/'+reviewId)).data;
  expect(saved.due_date).toBe(selection.due||null);
  expect(saved.recurrence).toBe(selection.writes?selection.cad:null);
  if(selection.writes)expect(saved.custom_recurrence_days).toBe(45);
  expect(patch).toHaveBeenCalledTimes(selection.writes);
  if(selection.writes)expect(patch.mock.calls[0][1]).toMatchObject({expected_updated_at:expect.any(String),
    expected_occurrence_id:saved.current_occurrence_id});
  await applyWorkChanges({...ctx,identityMaps:result.identityMaps,handled:result.handled});
  expect((await api.get('/reviews',{params:{client_id:ctx.clientId}})).data).toHaveLength(1);
},20000);

test('onboarding preview merges declared aliases without changing source choices or unrelated activities',()=>{
  const draft={prog:{cis:'applies',nist:'applies',iso:'applies',soc:'applies',hipaa:'applies',cmmc:'applies'},ig:3,cmmc:2,
    rev:{'Account Authorization & Access Review':{inc:true,cad:'quarterly',due:'2027-02-01'},
      'Access Rights Review':{inc:true,cad:'quarterly',due:''},
      'Vulnerability & Remediation Process Review':{inc:true,cad:'monthly',due:''},
      'Vulnerability Governance Review':{inc:true,cad:'quarterly',due:''}}};
  const rows=Object.entries(draft.rev).map(([t,entry],index)=>({t,templateKey:t,cad:entry.cad,due:entry.due,days:30,
    from:[index%2?'NIST CSF 2.0':'CIS IG3'],maps:[{k:index%2?'nist':'cis',ids:String(index)}],gen:false}));
  rows.push({t:'Independent general review',cad:'annual',due:'2027-05-01',gen:true},
    {t:'Unrecognized source activity',cad:'semiannual',due:'',gen:false});
  const original=clone({rows,draft}),plan=approvedOnboardingPlan(rows,draft);
  expect(plan).toHaveLength(4);
  expect(plan[0]).toMatchObject({t:'Account Authorization & Access Review',cad:'quarterly',due:'2027-02-01',
    from:['CIS IG3','NIST CSF 2.0'],maps:[{k:'cis',ids:'0'},{k:'nist',ids:'1'}]});
  expect(plan[1]).toMatchObject({t:'Vulnerability & Remediation Process Review',cad:'monthly',due:''});
  expect(plan.slice(2)).toEqual(rows.slice(4));
  expect({rows,draft}).toEqual(original);
});

test('a single latest operator schedule updates every shared alias in the onboarding preview',()=>{
  const previous={prog:{cis:'applies',nist:'applies'},ig:3,rev:{
    'Account Authorization & Access Review':{inc:true,cad:'quarterly',due:'2027-02-01',_auto:false},
    'Access Rights Review':{inc:true,cad:'quarterly',due:'2027-02-01',_auto:false}}};
  const draft=clone(previous);Object.assign(draft.rev['Access Rights Review'],{cad:'custom',days:21,due:'2027-06-01'});
  const rows=Object.entries(draft.rev).map(([t,entry])=>({t,templateKey:t,cad:entry.cad,due:entry.due,days:entry.days,gen:false}));
  const plan=approvedOnboardingPlan(rows,draft,previous);
  expect(plan).toHaveLength(1);expect(plan[0]).toMatchObject({cad:'custom',days:21,due:'2027-06-01'});
  expect(draft.rev['Account Authorization & Access Review'].cad).toBe('quarterly');
});

test('an adopted interview preserves the source revision, implementation, item and selected recurring ticket in one assessment command',async()=>{
  const ctx=context(),key='brawndo|cis:8.1|1.1',aid=ctx.identityMaps.recordIds[cid].framework_assessments['cis-ig1|1.1'];
  const rev=ctx.after.work.brawndo.revs.find(r=>r.title==='Enterprise Asset Inventory Review');
  const native=ctx.records.reviews.find(r=>r.client_id===cid&&r.source_record_id===rev.id);
  const activity={activity_id:'record:'+native.review_id,review_id:native.review_id,title:rev.title,area_id:'inventory',expected_updated_at:null,setup:{}};
  ctx.after.itemCur[key]='A six-month check is scheduled.';
  ctx.after.guideSaved[key]={stage:'applied',idx:7,draft:ctx.after.itemCur[key],ans:{ticket:'59834',reviewTarget:'review|'+rev.id}};
  ctx.after.services.brawndo.assessmentReviews={[key]:rev.id};
  Object.assign(rev,{cwRec:'59834',cad:'S',ivsSetup:{source:'Saved assessment 1.1'}});
  ctx.after.ita[key]=[...(ctx.before.ita[key]||[]),{id:'ita4001',st:'Open',kind:'Confirm',txt:'Confirm the first completed review.'}];
  ctx.api.put=jest.fn(async()=>({data:{version:sourceHash,revision:1,digest:'e'.repeat(64)}}));
  ctx.api.get=jest.fn(async()=>({data:{client_id:cid,expected_client_updated_at:null,candidates:[activity],selected_activity_id:activity.activity_id}}));
  ctx.api.patch=jest.fn(async()=>({data:{...ctx.records.framework_assessments.find(a=>a.framework_assessment_id===aid),implementation:ctx.after.itemCur[key]}}));
  const result=await applyClientChanges(ctx);
  expect(ctx.api.patch).toHaveBeenCalledTimes(1);
  expect(ctx.api.patch.mock.calls[0][1]).toMatchObject({implementation:ctx.after.itemCur[key],approved_v3_guide:{digest:'e'.repeat(64)},
    coordination:{review_id:native.review_id,recurring_ticket_number:'59834',cadence:'semiannual'},
    item_draft:{operations:[{operation:'add',item_type:'confirmation'}]}});
  expect(result.handled.reviews).toContain(rev.id);
});

test('iVenture setup changes the existing inventory review and the native CIS 1.1 context reads its saved ticket',async()=>{
  const ctx=context(),api=axios.create({adapter:previewAdapter,headers:{'Idempotency-Key':'approved-v3-setup-receipt-0001'}});
  await api.post('/demo/enter');ctx.api=api;
  const review=ctx.after.work.brawndo.revs.find(r=>r.title==='Enterprise Asset Inventory Review');
  Object.assign(review,{cwRec:'716824',cwUrl:'https://ticket.example.test/716824',cwTitle:'Inventory review',cad:'S',
    ivsSetup:{notes:'Coordinate with the inventory owner',source:'iVenture Setup'}});
  const result=await applyClientChanges(ctx);
  const id=ctx.identityMaps.recordIds[cid].reviews[review.id],aid=ctx.identityMaps.recordIds[cid].framework_assessments['cis-ig1|1.1'];
  expect(result.handled.reviews).toContain(review.id);
  const saved=(await api.get('/reviews/'+id)).data;
  expect(saved.activity_setup.recurring_ticket_number).toBe('716824');
  const contextRead=(await api.get('/framework_assessments/'+aid+'/service-context')).data;
  expect(contextRead.candidates.find(a=>a.review_id===id)).toMatchObject({cadence:'semiannual',setup:{recurring_ticket_number:'716824'}});
});

test.each([true,false])('the inline NoTicket decision=%s uses the native SPM exclusion/restore without altering technical responsibility',async decision=>{
  const ctx=context(),before=ctx.before.work.brawndo.revs.find(row=>row.title==='Enterprise Asset Inventory Review');
  const review=ctx.after.work.brawndo.revs.find(row=>row.id===before.id);
  before.noTicket=!decision;review.noTicket=decision;
  const native=ctx.records.reviews.find(row=>row.review_id===ctx.identityMaps.recordIds[cid].reviews[review.id]);
  native.updated_at='review-v1';
  let saved=false;
  const activity={activity_id:'review:'+native.review_id,review_id:native.review_id,title:review.title,area_id:'endpoint',
    responsibility:'iv',expected_updated_at:'review-v1',setup:{no_ticket:!decision}};
  ctx.api.get=jest.fn(async()=>({data:{client_id:cid,expected_client_updated_at:saved?'client-v2':null,
    activities:[{...activity,setup:{no_ticket:saved?decision:!decision},exclusion:decision&&saved?{kind:'spm'}:null}]}}));
  ctx.api.post=jest.fn(async()=>{saved=true;return {data:{ok:true}};});ctx.api.patch=jest.fn();
  const sourceServices=clone(ctx.after.services.brawndo);
  const result=await applyClientChanges(ctx);
  expect(ctx.api.post.mock.calls).toEqual([['/clients/'+cid+'/iv-setup/exclusion/'+encodeURIComponent(activity.activity_id),{
    expected_updated_at:'review-v1',expected_client_updated_at:null,excluded:decision,kind:decision?'spm':null,note:''}]]);
  expect(ctx.api.patch).not.toHaveBeenCalled();
  expect(ctx.after.services.brawndo).toEqual(sourceServices);
  expect(result.handled.reviews).toContain(review.id);
});
