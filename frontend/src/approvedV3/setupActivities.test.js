/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import native from './__fixtures__/sixProgramReview.json';
import {approvedSetupActivities,loadApprovedSetupCatalog,requireSetupActivity} from './setupActivities';
import {overlayApprovedClientAssessments,approvedV3IdentityMaps} from '../preview/approvedV3Records';
import {overlayApprovedV3Work} from '../preview/approvedV3Work';
import {overlayApprovedV3Registers} from '../preview/approvedV3Registers';
import {applyClientChanges} from './clientCommands';

const clone=value=>JSON.parse(JSON.stringify(value,function(key,item){
  return Object.prototype.toString.call(this[key])==='[object Date]'?{$date:this[key].toISOString()}:item;
}));
const cid=native.records.clients[0].client_id,sourceId=native.client.id;
let dom,page,inspect,document,base,records,catalog,commands;
beforeAll(()=>{
  const root=path.join(__dirname,'../../..');
  const html=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  const expose=`window.inspectSetup={
    entries:function(kind){var c=byId('${sourceId}');activateProg(c,kind);S.clientId=c.id;return ivsItemsAll(c);},
    open:function(key){ivsItemDlg(byId('${sourceId}'),key);},
    restore:function(key){ivsRestore(byId('${sourceId}'),key);},
    guidance:function(key,legacy){var c=byId('${sourceId}'),x=coordEntry(c,key),id=x.ids[0],it=regFor(c).items.find(function(r){return r.id===id;});
      var g=gState(c,it);g.ans={exist:'Yes',reviewTarget:legacy||key,ticket:'876543',ticketUrl:'https://tickets.example.test/876543',ticketTitle:'Synthetic setup',reviewCadence:'Every six months',nextReview:'2026-12-01',tool:['ninjaone']};
      var before=buildWork(c.id).revs.length,plan=coordStageAssessment(c,it,g.ans);coordSaveAssessment(c,it,{coordination:plan});GUIDE_SAVED[itemKey(c,it.id)].stage='applied';
      return {itemKey:itemKey(c,it.id),ref:id,before:before,after:buildWork(c.id).revs.length,plan:plan};},
    select:function(key,legacy){var c=byId('${sourceId}'),x=coordEntry(c,key),it=regFor(c).items.find(function(r){return r.id===x.ids[0];});return coordSelection(c,it,{reviewTarget:legacy})?.key||null;}
  };`;
  dom=new JSDOM(html.replace('p16Initialize();\nif (!location.hash)','p16Initialize();\n'+hook+'\n'+expose+'\nif (!location.hash)'),{
    url:'https://governara.example.test/#portfolio',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
  page=dom.window.GoverNaraNativePage;inspect=dom.window.inspectSetup;document=dom.window.document;base=page.snapshot();
});
afterAll(()=>dom.window.close());
beforeEach(()=>{
  records=clone(native.records);catalog=clone(native.setup);commands=[];
  const state=clone(base);state.clients=[clone(native.client)];
  page.prepareClient(state,sourceId,records);
  overlayApprovedClientAssessments(state,records);
  overlayApprovedV3Work(state,records,{clientId:cid,sourceId});
  overlayApprovedV3Registers(state,records,{clientId:cid,sourceId});
  page.configure({busy:()=>false,setupActivities:()=>approvedSetupActivities(catalog,records),
    command:(name,args)=>commands.push({name,args:clone(args)}),persist:()=>true});
  page.apply(state);page.actor(native.actor,[sourceId]);
});

test('all six framework switches show the same unique native provider activities and exact outstanding count',()=>{
  expect(catalog.activities).toHaveLength(38);expect(records.reviews).toHaveLength(33);
  const expected=catalog.activities.filter(row=>row.provider_relevant&&!row.internal),keys=expected.map(row=>row.activity_id).sort();
  for(const kind of ['cis','soc','iso','nist','hipaa','cmmc']){
    const listed=inspect.entries(kind);expect(listed.items.map(row=>row.key).sort()).toEqual(keys);
    expect(listed.items.filter(row=>['todo','decide'].includes(row.st))).toHaveLength(catalog.outstanding_count);
    expect(new Set(listed.items.map(row=>row.key)).size).toBe(listed.items.length);
    for(const row of listed.items){
      const actual=expected.find(entry=>entry.activity_id===row.key);
      expect(row.nativeActivity.review_id).toBe(actual.review_id);
      expect(row.nativeActivity.drivers).toEqual(actual.drivers);
      if(actual.review_id)expect(row.r.id).toBe(String(records.reviews.find(review=>review.review_id===actual.review_id).source_record_id??actual.review_id));
    }
  }
  expect(commands).toEqual([]);
});

test('explicit unresolved legacy guidance intent is retained and cannot fall back to another saved binding',()=>{
  const saved=inspect.entries('cis').items.find(row=>row.r&&row.ids.length);
  const state=page.snapshot(),key=sourceId+'|cis:8.1|'+saved.ids[0];
  state.services[sourceId].assessmentReviews={[key]:saved.key};page.apply(state);inspect.entries('cis');
  expect(inspect.select(saved.key,'template|Unresolved legacy intention')).toBeNull();
  expect(commands).toEqual([]);
});

test('a declared plan selection survives native promotion to its real Review identity',()=>{
  const proposal=inspect.entries('cis').items.find(row=>!row.r&&row.ids.length),oldKey=proposal.key;
  const activity=catalog.activities.find(row=>row.activity_id===oldKey),rid='synthetic-promoted-plan';
  activity.activity_id='review:'+rid;activity.review_id=rid;activity.expected_updated_at='promoted-version';
  records.reviews.push({client_id:cid,review_id:rid,source_record_id:'imported-source-review',
    title:activity.title,updated_at:activity.expected_updated_at,framework_key:activity.framework_key,
    framework_plan_key:activity.plan_key,framework_drivers:activity.drivers,status:'open',recurrence:activity.cadence});
  const state=page.snapshot();overlayApprovedV3Work(state,records,{clientId:cid,sourceId});page.apply(state);inspect.entries('cis');
  expect(inspect.select(activity.activity_id,oldKey)).toBe(activity.activity_id);
  expect(inspect.select(activity.activity_id,'review|imported-source-review')).toBe(activity.activity_id);
  expect(commands).toEqual([]);
});

test.each(native.setup.activities.filter(row=>row.provider_relevant&&!row.internal).map(row=>[row.activity_id]))(
  'setup form %s sends its exact captured native identity without making a source Review',key=>{
    const row=inspect.entries('cis').items.find(row=>row.key===key),initial=page.snapshot().work[sourceId].revs.length;
    inspect.open(row.key);
    expect([...document.querySelector('#dlg').children].map(node=>node.className)).toEqual(['m-head','m-body','m-foot']);
    const responsibility=document.getElementById('ivs-d-resp');if(responsibility)responsibility.value='iv';
    for(const [id,value] of [['no','876543'],['url','https://tickets.example.test/876543'],['sum','Synthetic setup'],['cad','S'],['due','2026-12-01']])document.getElementById('ivs-d-'+id).value=value;
    document.getElementById('ivs-d-notes').value='N'.repeat(2100);
    document.querySelector('[data-action="ivs-save"]').click();
    expect(document.getElementById('ivs-d-err').textContent).toBe('');
    const command=commands.at(-1);expect(command.name).toBe('saveSetupActivity');
    expect(command.args.slice(0,2)).toEqual([sourceId,row.key]);
    expect(command.args[2].opened).toMatchObject({client_id:cid,activity_id:row.key,review_id:row.nativeActivity.review_id,
      expected_updated_at:row.nativeActivity.expected_updated_at,expected_client_updated_at:catalog.expected_client_updated_at});
    expect(command.args[2].plan).toMatchObject({ticket:'876543',cadence:'S',next:'2026-12-01'});
    expect(command.args[2].plan.notes).toBe('N'.repeat(2000));
    expect(document.getElementById('toast-msg').textContent).toBe('Recurring activity setup saved. Assessments and Reviews now use the same ticket and schedule.');
    expect(page.snapshot().work[sourceId].revs).toHaveLength(initial);
    expect(commands).toHaveLength(1);
});

test('saved source Review aliases remain resolvable and stale native catalog versions cannot authorize old defaults',()=>{
  const saved=inspect.entries('cis').items.find(row=>row.r&&row.ids.length);
  expect(inspect.select(saved.key,'review|'+saved.r.id)).toBe(saved.key);
  const descriptors=approvedSetupActivities(catalog,records),opened=descriptors.find(row=>row.review_id===saved.nativeActivity.review_id);
  inspect.open(saved.key);
  const current=catalog.activities.find(row=>row.activity_id===saved.key);current.expected_updated_at='concurrent-review-version';
  expect(()=>approvedSetupActivities(catalog,records)).toThrow('shared Review changed');
  expect(()=>requireSetupActivity(catalog,cid,saved.key,opened)).toThrow('changed while this form was open');
  expect(commands).toEqual([]);
});

test('an uncreated guidance activity is adopted only at native assessment Save, with exact ticket, schedule and tools',async()=>{
  const proposal=inspect.entries('cis').items.find(row=>!row.r&&row.ids.length),before=clone(page.snapshot());
  const result=inspect.guidance(proposal.key),after=clone(page.snapshot());
  expect(result.after).toBe(result.before);expect(commands).toEqual([]);
  expect(Object.keys(after.guideSaved[result.itemKey].ans._coord.nativeActivity.opened).sort()).toEqual([
    'client_id','activity_id','review_id','source_review_id','expected_updated_at','expected_client_updated_at'].sort());
  const aid='synthetic-proposal-assessment';
  records.framework_assessments.push({client_id:cid,framework_assessment_id:aid,framework_key:'cis-ig1',definition_id:result.ref,status:'not_assessed'});
  const activity=catalog.activities.find(row=>row.activity_id===proposal.key),newRid='synthetic-adopted-review',newActivity={...activity,
    activity_id:'review:'+newRid,review_id:newRid,expected_updated_at:'adopted-version',setup:{recurring_ticket_number:'876543'}};
  let saved=false;
  const api={put:jest.fn(async(route,body)=>{
    expect(route).toBe('/framework_assessments/'+aid+'/approved-guide');
    return {data:{version:body.version,revision:body.expected_revision+1,digest:'synthetic-guide-digest'}};
  }),get:jest.fn(async route=>{
    expect(route).toBe('/framework_assessments/'+aid+'/service-context');
    return {data:{client_id:cid,expected_client_updated_at:saved?'next-client-version':catalog.expected_client_updated_at,
      candidates:[saved?newActivity:activity],selected_activity_id:saved?newActivity.activity_id:activity.activity_id,
      catalog:[{tool_id:'ninjaone'}],services:{custom_tools:[]}}};
  }),patch:jest.fn(async(route,body)=>{
    expect(route).toBe('/framework_assessments/'+aid);
    expect(body.coordination).toMatchObject({activity_id:proposal.key,review_id:null,expected_updated_at:null,
      expected_client_updated_at:catalog.expected_client_updated_at,recurring_ticket_number:'876543',
      recurring_ticket_url:'https://tickets.example.test/876543',cadence:'semiannual',first_next_due:'2026-12-01',tool_ids:['ninjaone']});
    saved=true;return {data:{...records.framework_assessments.find(row=>row.framework_assessment_id===aid),...body}};
  }),post:jest.fn(()=>{throw Error('Guidance must use the existing atomic assessment save, without a separate Review create.');})};
  const response=await applyClientChanges({before,after,records,clientId:cid,sourceId,api,identityMaps:approvedV3IdentityMaps(records)});
  expect(api.patch).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();
  expect(response.handled.reviews).toContain(proposal.key);expect(response.identityMaps.recordIds[cid].reviews[proposal.key]).toBe(newRid);
  expect(after.work[sourceId].revs).toHaveLength(before.work[sourceId].revs.length);
});

test('catalog loader rejects cross-client and duplicate identities without a write',async()=>{
  const api={get:jest.fn().mockResolvedValue({data:{...catalog,client_id:'another-client'}})};
  await expect(loadApprovedSetupCatalog({api,clientId:cid})).rejects.toMatchObject({status:409});
  api.get.mockResolvedValue({data:{...catalog,activities:[catalog.activities[0],catalog.activities[0]]}});
  await expect(loadApprovedSetupCatalog({api,clientId:cid})).rejects.toMatchObject({status:409});
  api.get.mockResolvedValue({data:{...catalog,activities:[{...catalog.activities[0],drivers:null}]}});
  await expect(loadApprovedSetupCatalog({api,clientId:cid})).rejects.toMatchObject({status:409});
});

test.each([true,false])('native exclusion Restore survives a fresh bootstrap for saved=%s',async saved=>{
  const activity=catalog.activities.find(row=>row.provider_relevant&&!row.internal&&!!row.review_id===saved);
  activity.exclusion={kind:'na',reason:'Synthetic scoped exclusion'};activity.state='removed';
  const before=clone(page.snapshot());inspect.entries('cis');inspect.restore(activity.activity_id);
  expect(commands).toHaveLength(1);expect(commands[0].name).toBe('saveSetupExclusion');
  const api={get:jest.fn(async()=>({data:clone(catalog)})),post:jest.fn(async(route,body)=>{
    expect(route).toBe('/clients/'+cid+'/iv-setup/exclusion/'+encodeURIComponent(activity.activity_id));
    expect(body).toEqual({excluded:false,expected_updated_at:activity.expected_updated_at??null,
      expected_client_updated_at:catalog.expected_client_updated_at});
    activity.exclusion=null;activity.state='todo';return {data:{ok:true}};
  })};
  await applyClientChanges({before,after:clone(page.snapshot()),records,clientId:cid,sourceId,api,
    identityMaps:approvedV3IdentityMaps(records),commands});
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(inspect.entries('cis').items.find(row=>row.key===activity.activity_id).rem).toBeNull();
});

test('typed setup creates one native Review and verifies promotion by exact drivers, rejecting stale opened versions',async()=>{
  const before=clone(page.snapshot()),activity=catalog.activities.find(row=>row.provider_relevant&&!row.internal&&!row.review_id);
  const opened=approvedSetupActivities(catalog,records).find(row=>row.activity_id===activity.activity_id),plan={
    responsibility:'iv',area_id:activity.area_id,ticket:'876543',url:'https://tickets.example.test/876543',title:'Synthetic setup',
    cadence:'D:45',next:'2026-12-01',notes:'Synthetic setup only'};
  const command={name:'saveSetupActivity',args:[sourceId,activity.activity_id,{opened,plan}]};
  const api={get:jest.fn(async()=>({data:clone(catalog)})),post:jest.fn(async(route,body)=>{
    expect(route).toBe('/clients/'+cid+'/iv-setup');
    expect(body).toMatchObject({activity_id:activity.activity_id,review_id:null,expected_updated_at:null,
      expected_client_updated_at:catalog.expected_client_updated_at,cadence:'custom',custom_days:45,
      first_next_due:'2026-12-01',recurring_ticket_number:'876543',responsibility:'iv'});
    activity.activity_id='review:synthetic-adopted';activity.review_id='synthetic-adopted';activity.setup={recurring_ticket_number:'876543'};
    return {data:{ok:true}};
  })};
  const ctx={before,after:clone(before),records,clientId:cid,sourceId,api,identityMaps:approvedV3IdentityMaps(records),commands:[command]};
  const result=await applyClientChanges(ctx);
  expect(result.applied).toContain('setup:review:synthetic-adopted');expect(api.post).toHaveBeenCalledTimes(1);
  expect(ctx.after.work[sourceId].revs).toHaveLength(before.work[sourceId].revs.length);
  await expect(applyClientChanges(ctx)).rejects.toMatchObject({status:409});
  expect(api.post).toHaveBeenCalledTimes(1);
});
