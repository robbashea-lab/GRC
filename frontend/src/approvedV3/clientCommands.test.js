import axios from 'axios';
import {previewAdapter} from '../preview/adapter';
import {freshApprovedDemo} from '../preview/approvedV3Demo';
import scenario from '../../../shared/fixtures/approvedV3Scenario.json';
import {overlayApprovedClientAssessments,approvedV3IdentityMaps,sourceHash} from '../preview/approvedV3Records';
import {applyClientChanges} from './clientCommands';

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
    ig:1,cmmc:1,pol:{},rev:{},gen:{}};
  // Each approved form submission carries its own transport receipt.
  api.defaults.headers.common['Idempotency-Key']='approved-v3-onboarding-finalize';
  api.defaults.headers['Idempotency-Key']='approved-v3-onboarding-finalize';
  const result=await applyClientChanges(ctx);
  expect(result.applied).toContain('onboarding:complete');
  const handoff=(await api.get('/onboarding/handoff',{params:{client_id:ctx.clientId}})).data;
  expect(handoff.completed).toBe(true);
  expect(new Set(handoff.records.framework_assessments.map(a=>a.framework_key))).toEqual(new Set(['cis-ig1','nist-csf-2','iso-27001','soc-2','hipaa','cmmc']));
  expect(handoff.records.framework_assessments.every(a=>a.client_id===ctx.clientId&&a.status==='not_assessed')).toBe(true);
},20000);

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
