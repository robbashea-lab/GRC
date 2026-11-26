import scenario from '../../../shared/fixtures/approvedV3Scenario.json';
import {approvedV3Records,approvedV3IdentityMaps,overlayApprovedClientAssessments,statuses,frameworkKeys} from './approvedV3Records';
import {addMissingApprovedClients,freshApprovedDemo} from './approvedV3Demo';
import {readStore,saveStore,STORE_KEY} from './store';
import {validateProfile} from '../lib/clientProfile';
import axios from 'axios';
import {previewAdapter} from './adapter';
import {loadClientDashboard} from '../lib/loadClientDashboard';

const copy=v=>JSON.parse(JSON.stringify(v));
const previousFlag=process.env.REACT_APP_STANDARD_SIGN_IN;
beforeEach(()=>{process.env.REACT_APP_STANDARD_SIGN_IN='true';});
afterEach(()=>{
  if(previousFlag===undefined)delete process.env.REACT_APP_STANDARD_SIGN_IN;
  else process.env.REACT_APP_STANDARD_SIGN_IN=previousFlag;
  sessionStorage.clear();
});

test('every approved program, source assessment, actual tool assignment and source owner survives conversion',()=>{
  const source=scenario.source_state;
  const records=approvedV3Records(source);
  expect(JSON.parse(JSON.stringify(records))).toEqual(scenario.records);
  expect(records.clients.map(c=>c.name)).toEqual(source.clients.map(c=>c.name));
  expect(source.clients.flatMap(c=>c.progs)).toHaveLength(10);
  for(const client of source.clients) {
    const native=records.clients.find(row=>row.source_client_id===client.id);
    for(const group of ['scope','organization','technical','security'])
      expect(()=>validateProfile(group,native.profile[group])).not.toThrow();
    for(const [key,area] of Object.entries(source.services[client.id].areas))
      expect(native.profile.services.areas[key].tool_ids).toEqual(area.tools);
    for(const program of client.progs) {
      const fk=frameworkKeys[program.k];
      const assessments=records.framework_assessments.filter(r=>r.client_id===native.client_id&&r.framework_key===fk);
      const byId=new Map(assessments.map(a=>[a.definition_id.toLowerCase(),a]));
      expect(native.onboarding_baseline.requirements[fk]).toBe('applies');
      expect(assessments.filter(a=>a.source_reference)).toHaveLength(program.reg.items.length);
      for(const item of program.reg.items)
        expect(byId.get(item.id.toLowerCase())?.status).toBe(statuses[item.st]);
    }
  }
  const nativeOnly=records.framework_assessments.filter(r=>!r.source_reference);
  expect(nativeOnly.map(r=>r.definition_id).sort()).toEqual(['164.105','164.302','164.530']);
  expect(nativeOnly.every(r=>r.status==='not_assessed')).toBe(true);
  expect(records.evidence.every(e=>e.file_available===false)).toBe(true);
});

test('saved supplemental HIPAA assessments remain visible without changing the offline reference',()=>{
  const view=copy(scenario.source_state),records=freshApprovedDemo();
  overlayApprovedClientAssessments(view,records);
  const program=view.clients.find(c=>c.id==='ppth').progs.find(p=>p.k==='hipaa');
  expect(program.reg.items).toHaveLength(81);
  for(const id of ['164.302','164.105','164.530'])expect(program.reg.items.find(i=>i.id===id)).toMatchObject({st:'A',note:expect.stringContaining('Catalog guidance:')});
  expect(scenario.source_state.clients.find(c=>c.id==='ppth').progs.find(p=>p.k==='hipaa').reg.items).toHaveLength(78);
});

test('a changed assessment and scoped owner project into its source program and back to the same native identity',()=>{
  const view=copy(scenario.source_state), records=freshApprovedDemo();
  const match=records.framework_assessments.find(r=>r.client_id==='v3sample_brawndo'&&r.definition_id==='1.1');
  expect(match.last_assessed).toBe('2026-11-14');
  const owner=records.users.find(u=>u.name==='Joe Bowers');
  Object.assign(match,{status:'addressed',verification:'verified',implementation:'Updated inventory process',owner_id:owner.user_id});
  overlayApprovedClientAssessments(view,records);
  const item=view.reg.brawndo.items.find(i=>i.id==='1.1');
  expect(item).toMatchObject({st:'I',ver:'V',owner:'Joe Bowers',age:'3'});
  overlayApprovedClientAssessments(view,records,{asOfDate:new Date(2026,10,25,23,45)});
  expect(view.reg.brawndo.items.find(i=>i.id==='1.1').age).toBe('11');
  expect(view.itemCur['brawndo|cis:8.1|1.1']).toBe('Updated inventory process');
  const result=approvedV3Records(view).framework_assessments.find(r=>r.framework_assessment_id===match.framework_assessment_id);
  expect(result).toMatchObject({implementation:match.implementation,owner_id:owner.user_id,status:'addressed',verification:'verified'});
  expect(view.reg.initech.items.find(i=>i.id==='1.1').st).toBe('P');
  const asset=records.assets.find(a=>a.client_id===match.client_id&&a.source_owner_name);
  const soa=records.framework_assessments.find(a=>a.soa_applicability==='included');
  asset.owner_id=null;match.owner_id=null;match.last_assessed=null;soa.soa_applicability='undetermined';
  overlayApprovedClientAssessments(view,records);
  expect(view.reg.brawndo.items.find(i=>i.id==='1.1')).toMatchObject({age:'-',owner:null});
  expect(view.records.brawndo.systems.find(s=>s.name===asset.name).owner).toBeNull();
  expect(view.clients.find(c=>c.id==='dunder').progs.find(p=>p.k==='iso').reg.items.find(i=>i.id.toLowerCase()===soa.definition_id.toLowerCase()).soa).toBe('Decision needed');
});

test('saved assessment history, current follow-ups, and the returned actor’s private checkpoint project independently',()=>{
  const view=copy(scenario.source_state),records=freshApprovedDemo(),key='brawndo|cis:8.1|1.1';
  const row=records.framework_assessments.find(a=>a.client_id==='v3sample_brawndo'&&a.definition_id==='1.1');
  const actor=records.users.find(p=>p.name==='Joe Bowers');
  row.assessment_history.push({at:'2026-11-25T10:00:00Z',by:actor.user_id,status:'in_progress',approved_v3_guide:{revision:2}});
  row.items_to_address=[{item_id:'real',request_id:'approved_v3_item_ita224',item_type:'confirmation',
    state:'resolved',origin:'manual',text:'Check inventory source',resolution:'The owner confirmed it.'}];
  view.guideSaved[key]={stage:'q',ans:{old:'Other tab'}};
  records.approved_v3_guidance=[];
  overlayApprovedClientAssessments(view,records);
  expect(view.guideSaved[key]).toBeUndefined();
  expect(view.itemHist[key][0]).toMatchObject({who:actor.name,t:new Date('2026-11-25T10:00:00Z')});
  expect(view.ita[key][0]).toMatchObject({id:'ita224',st:'Resolved',resolution:'The owner confirmed it.'});
  records.approved_v3_guidance=[{client_id:row.client_id,version:scenario.source_sha256,framework_key:row.framework_key,
    definition_id:row.definition_id,revision:2,digest:'a'.repeat(64),saved_at:'2026-11-25T11:00:00Z',checkpoint:{stage:'q',idx:2,ans:{freq:'Six months'}}}];
  overlayApprovedClientAssessments(view,records);
  expect(view.guideSaved[key]).toMatchObject({nativeRevision:2,ans:{freq:'Six months'},savedAt:new Date('2026-11-25T11:00:00Z')});
});

test('new native client identities and reordered system/contact rows survive the round trip',()=>{
  const view=copy(scenario.source_state);
  const key='new-source-client',cid='native-client-117';
  view.clients.push({id:key,name:'New QA client',status:'Onboarding',isNew:true,onboarded:false,env:'Production'});
  view.profile[key]={empty:true};view.own[key]={};view.records[key]={contacts:[],systems:[],ai:[]};
  view.programs[key]={risks:[],vendors:[],pols:[]};view.work[key]={revs:[],hist:[],acts:[],done:[],ven:[]};
  const loaded=approvedV3Records(view,{clientIds:{[key]:cid}});
  expect(loaded.clients.find(c=>c.client_id===cid)).toMatchObject({environment:'Production',onboarding_baseline:{completed:false}});
  expect(loaded.framework_assessments.some(a=>a.client_id===cid)).toBe(false);
  const target=loaded.clients.find(c=>c.source_client_id==='brawndo');
  target.profile.organization.employees=215;target.profile.organization.parent='Holding company';
  target.profile.scope={statement:'Revised saved scope',systems:'Two systems'};
  const system=loaded.assets.find(a=>a.client_id===target.client_id);
  system.asset_id='native-assigned-system-id';system.name='Renamed saved system';system.location='Dallas';
  const contact=loaded.contacts.find(c=>c.client_id===target.client_id);
  target.primary_contact_id=contact.contact_id;contact.email='revised@example.test';
  const options=approvedV3IdentityMaps(loaded);
  overlayApprovedClientAssessments(view,loaded,options);
  view.records.brawndo.systems.reverse();view.records.brawndo.contacts.reverse();
  const roundTrip=approvedV3Records(view,options);
  expect(roundTrip.assets.find(a=>a.asset_id===system.asset_id)).toMatchObject({name:system.name,location:'Dallas'});
  expect(roundTrip.contacts.find(c=>c.contact_id===contact.contact_id)?.email).toBe(contact.email);
  expect(roundTrip.clients.find(c=>c.client_id===target.client_id)).toMatchObject({
    primary_contact_id:contact.contact_id,profile:{organization:{employees:215,parent:'Holding company'},scope:target.profile.scope}});
  expect(roundTrip.clients.find(c=>c.source_client_id===key)?.client_id).toBe(cid);
});

test('changing the active tab on a multi-framework client preserves the saved policy associations',()=>{
  const view=copy(scenario.source_state);
  view.clients.find(c=>c.id==='prestige').activeProg='iso';
  const rows=approvedV3Records(view).framework_assessments;
  expect(rows.map(r=>r.policy_link_ids)).toEqual(scenario.records.framework_assessments.map(r=>r.policy_link_ids));
});

test('fresh native Demo survives a save and a normal reload with all eight clients',()=>{
  sessionStorage.removeItem(STORE_KEY);
  const db=readStore();
  expect(db.clients).toHaveLength(8);
  expect(db.user.workspace_mode).toBe('demo');
  expect(db.reviews.flatMap(r=>r.occurrences)).toHaveLength(89);
  db.clients.find(c=>c.source_client_id==='cyberdyne').name='Edited sample client';
  saveStore(db);
  const retained=readStore();
  expect(retained.clients).toHaveLength(8);
  expect(retained.clients.find(c=>c.source_client_id==='cyberdyne').name).toBe('Edited sample client');
  expect(retained.framework_assessments).toHaveLength(1026);
  sessionStorage.removeItem(STORE_KEY);
});

test('regular native Demo entry, portfolio totals, dashboards and per-program assessment routes read the same eight clients',async()=>{
  const api=axios.create({adapter:previewAdapter});
  const {data:{user}}=await api.post('/demo/enter');
  const {data:directory}=await api.get('/clients/directory',{params:{include_archived:'false'}});
  expect(directory.clients.map(c=>c.client_id).sort()).toEqual(Object.values(scenario.source_client_ids).sort());
  for(const metric of ['past_due','due_30d','due_31_90d','critical_high_open','unassigned'])
    expect(directory.portfolio[metric]).toBe(directory.clients.reduce((sum,c)=>sum+c[metric],0));
  for(const client of scenario.source_state.clients) {
    const cid=scenario.source_client_ids[client.id];
    const dashboard=await loadClientDashboard(api,{clientId:cid,user,scope:{kind:'org'}});
    expect(dashboard.contract_version).toBe(2);
    expect(dashboard.members.length).toBeGreaterThan(0);
    for(const program of client.progs) {
      const fk=frameworkKeys[program.k],{data}=await api.get('/frameworks/'+fk,{params:{client_id:cid}});
      expect(data.assessments.filter(a=>a.source_reference)).toHaveLength(program.reg.items.length);
      expect(data.assessments.every(a=>a.client_id===cid)).toBe(true);
    }
  }
},30000);

test('retained native Demo adds missing organizations once, leaving existing accounts, edits and explicit enrollments alone',()=>{
  const oldClient={client_id:'demo_brawndo',name:'Edited',framework_settings:{'cis-ig1':{implementation_group:2}}};
  const oldOwner={user_id:'demo_admin',email:'explorer@omnisciente.example',name:'Edited name',role:'super_admin',status:'active',client_ids:[]};
  const db={clients:[copy(oldClient),{client_id:'retained-sample',name:'Monsters, Inc.'}],users:[copy(oldOwner)],logs:[],baselines:{}};
  expect(addMissingApprovedClients(db)).toBe(true);
  expect(db.clients.map(c=>c.client_id)).toEqual(['demo_brawndo','retained-sample','v3sample_ppth','v3sample_cyberdyne']);
  expect(db.clients[0]).toEqual(oldClient);
  expect(db.users[0]).toEqual(oldOwner);
  const saved=JSON.stringify(db);
  expect(addMissingApprovedClients(db)).toBe(false);
  expect(JSON.stringify(db)).toBe(saved);
});
