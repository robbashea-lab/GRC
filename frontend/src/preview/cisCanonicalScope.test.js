import {snapshotCanonicalCisClient,prepareCanonicalCisOnboarding} from './cisCanonicalScope';
import {recordedBaseline} from '../lib/clientProfile';

const CID='demo_brawndo';
const OTHER_CLIENTS=['demo_initech','demo_krusty_krab','demo_dunder','demo_prestige','visitor_demo'];
const TABLE_IDS={framework_assessments:'framework_assessment_id',organizational_controls:'control_id',reviews:'review_id',
  findings:'finding_id',tasks:'task_id',risks:'risk_id',policies:'policy_id',vendors:'vendor_id',ai_systems:'ai_system_id',
  assets:'asset_id',exceptions:'exception_id',requirements:'requirement_id',evidence:'evidence_id',assessments:'assessment_id',
  comments:'comment_id',logs:'audit_id',notifications:'notification_id',contacts:'contact_id'};
const clone=value=>JSON.parse(JSON.stringify(value));
const receipt=(cid,key='request')=>JSON.stringify(['demo_actor',cid,key]);
const command=(cid)=>JSON.stringify(['demo_actor',cid,'/onboarding/baseline','complete']);
function fixture() {
  const clients=[CID,...OTHER_CLIENTS];
  const db={user:{user_id:'demo_actor',workspace_mode:'demo',role:'super_admin',client_ids:[...clients]},
    users:[{user_id:'shared_provider',client_ids:[...clients],status:'active'},
      {user_id:CID+'_former',client_ids:[CID],status:'disabled'}],
    clients:clients.map((client_id,index)=>({client_id,name:'Retained '+client_id,logo:'logo-'+index,status:'active',
      environment:'Demo',portfolio_order:index,assigned_owner_id:'shared_provider',primary_contact_id:client_id+'_contacts',
      profile:{organization:{legal_name:'Fictional retained business'}},
      framework_settings:{'cis-ig1':{implementation_group:client_id==='demo_initech'?2:client_id==='demo_krusty_krab'?3:1}},
      onboarding_baseline:{completed:true},initial_program_baseline:{state:{completed:true},completed_by:'shared_provider'}})),
    baselines:{},drafts:{},ai_intake:{},ai_counters:{},riskSequences:{},cis_demo_scenario_history:{},
    guided_assessment_pilot:{},guided_assessment_history:{},create_requests:{},vendor_action_requests:{},command_requests:{},
    unrelated_global:{notes:'Keep unknown global data'}};
  for(const [kind,idField] of Object.entries(TABLE_IDS))db[kind]=clients.map(client_id=>({client_id,[idField]:client_id+'_'+kind,
    ...(kind==='logs'?{action:'onboarding-complete'}:{}),
    ...(kind==='evidence'?{content_base64:'c3ludGhldGlj',filename:'synthetic.txt'}:{}),
    ...(kind==='reviews'?{occurrences:[{occurrence_id:client_id+'_historical',status:'completed'}]}:{})}));
  for(const client_id of clients) {
    for(const key of ['baselines','drafts','ai_intake','cis_demo_scenario_history'])db[key][client_id]={client_id,completed:true,notes:key+' retained'};
    db.ai_counters[client_id]=3;db.riskSequences[client_id]=29;
    const assessment_id=client_id+'_framework_assessments',draftKey=assessment_id+':demo_actor';
    db.guided_assessment_pilot[draftKey]={client_id,assessment_id,answers:{scope:'Synthetic answer'}};
    db.guided_assessment_history[draftKey+':1']={client_id,assessment_id,revision:1};
    db.create_requests[receipt(client_id)]={kind:'risks',record_id:client_id+'_risks'};
    db.vendor_action_requests[receipt(client_id,'vendor') ]={task_id:client_id+'_tasks'};
    db.command_requests[command(client_id)]={fingerprint:'original',result:{client_id}};
  }
  db.create_requests[JSON.stringify(['demo_actor',null,'new-client'])]={kind:'clients',record_id:'visitor_demo'};
  db.portfolio_reporting={storage_version:2,source_vectors:[[0]],source_records:[{id:'retained-pool'}],
    snapshots:clients.map(client_id=>({client_id,program_id:client_id+':cis-ig1',snapshot_id:client_id+'_point',
      current:{scope:{definition_ids:['1.1']},provenance:{source_references:[{id:client_id+'_framework_assessments'}]}}})),
    identities:clients.map(client_id=>({program_id:client_id+':cis-ig1',scopes:['decoded-scope'],head:null})),
    scope_events:clients.map(client_id=>({client_id,framework_key:'cis-ig1',before:null,after:{scope:{definition_ids:['1.1']}}})),
    source_refresh_proofs:clients.map(client_id=>({client_id,program_id:client_id+':cis-ig1',proof_id:client_id+'_refresh'})),
    activity_proofs:Object.fromEntries(clients.map(client_id=>[client_id+'_logs',{eligible:true}])),
    fixture_versions:{'brawndo-cis-ig1-history-v2':{anchor:'2026-10-01'},unrelated:{anchor:'2020-01-01'}}};
  for(const key of ['cis_demo_rollout','cis_demo_refresh'])db[key]={version:'retained-version',anchor:'2026-10-01',
    clients:Object.fromEntries(clients.map(client_id=>[client_id,{version:'retained-version',artifacts:{[client_id+'_evidence']:{source:'retained'}}}])),
    reconciliation_required:clients.map(client_id=>({client_id,reason:'Retained work'}))};
  return db;
}

test('snapshot is detached and recovers target data, bytes, maps, history and contacts without changing the source',()=>{
  const db=fixture(),before=clone(db),snapshot=snapshotCanonicalCisClient(db,CID);
  expect(db).toEqual(before);
  expect(snapshot.client).toEqual(before.clients[0]);
  expect(snapshot.records.evidence[0].content_base64).toBe('c3ludGhldGlj');
  expect(snapshot.records.reviews[0].occurrences[0].status).toBe('completed');
  expect(snapshot.maps.command_requests.entries[command(CID)]).toBeTruthy();
  expect(snapshot.reporting.activity_proofs[CID+'_logs']).toEqual({eligible:true});
  expect(snapshot.markers.cis_demo_refresh.clients[CID].artifacts).toEqual(before.cis_demo_refresh.clients[CID].artifacts);
  expect(snapshot.inventory.retained_contact_ids).toEqual([CID+'_contacts']);
  snapshot.records.evidence[0].content_base64='changed';
  snapshot.client.profile.organization.legal_name='changed';
  expect(db).toEqual(before);
});

test.each([[CID,1],['demo_initech',2],['demo_krusty_krab',3]])('%s preparation creates a blank native onboarding baseline and preserves identity/accounts/contacts', (cid,group)=>{
  const db=fixture(),before=clone(db),client=db.clients.find(row=>row.client_id===cid),users=db.users,actor=db.user,clients=db.clients,contacts=db.contacts;
  const result=prepareCanonicalCisOnboarding(db,cid,{purpose:'onboarding_qa'});
  expect(result.snapshot.client).toEqual(before.clients.find(row=>row.client_id===cid));
  expect(db.users).toBe(users);expect(db.user).toBe(actor);expect(db.clients).toBe(clients);expect(db.contacts).toBe(contacts);
  expect(db.users).toEqual(before.users);expect(db.user).toEqual(before.user);
  const identity=clone(client),oldIdentity=clone(before.clients.find(row=>row.client_id===cid));
  for(const key of ['initial_program_baseline','onboarding_baseline','framework_settings']){delete identity[key];delete oldIdentity[key];}
  expect(identity).toEqual(oldIdentity);
  expect(client.initial_program_baseline).toBeUndefined();
  expect(db.baselines[cid]).toMatchObject({version:3,step:0,completed:false,updated_at:null,requirements:{},
    policies:{},selected_policy_keys:[],reviews:[],framework_reviews:{},framework_settings:{'cis-ig1':{implementation_group:group}}});
  expect(recordedBaseline(client,db.baselines[cid],db.logs)).toBeNull();
  for(const kind of Object.keys(TABLE_IDS))if(kind!=='contacts')expect(db[kind].filter(row=>row.client_id===cid)).toEqual([]);
  for(const kind of Object.keys(TABLE_IDS))expect(db[kind].filter(row=>row.client_id!==cid)).toEqual(before[kind].filter(row=>row.client_id!==cid));
});

test('scoped reset retains every unrelated client, replay receipt, artifact descriptor and reporting proof on retry',()=>{
  const db=fixture(),before=clone(db),pool=db.portfolio_reporting.source_records;
  prepareCanonicalCisOnboarding(db,CID,{purpose:'canonical_fixture_build'});
  for(const cid of OTHER_CLIENTS) {
    expect(db.clients.find(row=>row.client_id===cid)).toEqual(before.clients.find(row=>row.client_id===cid));
    for(const key of ['baselines','drafts','ai_intake','ai_counters','riskSequences','cis_demo_scenario_history'])expect(db[key][cid]).toEqual(before[key][cid]);
    for(const key of ['cis_demo_rollout','cis_demo_refresh'])expect(db[key].clients[cid]).toEqual(before[key].clients[cid]);
    expect(db.create_requests[receipt(cid)]).toEqual(before.create_requests[receipt(cid)]);
    expect(db.command_requests[command(cid)]).toEqual(before.command_requests[command(cid)]);
    expect(db.portfolio_reporting.activity_proofs[cid+'_logs']).toEqual(before.portfolio_reporting.activity_proofs[cid+'_logs']);
  }
  expect(db.create_requests[receipt(CID)]).toBeUndefined();
  expect(db.vendor_action_requests[receipt(CID,'vendor')]).toBeUndefined();
  expect(db.command_requests[command(CID)]).toBeUndefined();
  expect(Object.keys(db.guided_assessment_pilot).some(key=>key.startsWith(CID+'_framework_assessments:'))).toBe(false);
  expect(db.portfolio_reporting.source_records).toBe(pool);
  expect(db.portfolio_reporting.snapshots).toEqual(before.portfolio_reporting.snapshots.filter(row=>row.client_id!==CID));
  expect(db.portfolio_reporting.identities).toEqual(before.portfolio_reporting.identities.filter(row=>row.program_id!==CID+':cis-ig1'));
  expect(db.portfolio_reporting.scope_events).toEqual(before.portfolio_reporting.scope_events.filter(row=>row.client_id!==CID));
  expect(db.portfolio_reporting.source_refresh_proofs).toEqual(before.portfolio_reporting.source_refresh_proofs.filter(row=>row.client_id!==CID));
  expect(db.portfolio_reporting.activity_proofs[CID+'_logs']).toBeUndefined();
  expect(db.portfolio_reporting.fixture_versions).toEqual({unrelated:{anchor:'2020-01-01'}});
  for(const key of ['cis_demo_rollout','cis_demo_refresh']) {
    expect(db[key].version).toBe(before[key].version);expect(db[key].anchor).toBe(before[key].anchor);
    expect(db[key].clients[CID]).toBeUndefined();
  }
  expect(db.unrelated_global).toEqual(before.unrelated_global);
  expect(db.create_requests[JSON.stringify(['demo_actor',null,'new-client'])]).toEqual({kind:'clients',record_id:'visitor_demo'});
  const prepared=clone(db);
  prepareCanonicalCisOnboarding(db,CID,{purpose:'canonical_fixture_build'});
  expect(db).toEqual(prepared);
});

test.each([
  ['wrong canonical ID',db=>{},'demo_dunder','onboarding_qa'],
  ['standard actor',db=>{db.user.workspace_mode='standard';},CID,'onboarding_qa'],
  ['wrong environment',db=>{db.clients[0].environment='Production';},CID,'onboarding_qa'],
  ['duplicate identity',db=>{db.clients.push({...db.clients[0]});},CID,'onboarding_qa'],
  ['missing purpose',db=>{},CID,undefined],
  ['invalid purpose',db=>{},CID,'normal_reload'],
  ['malformed table',db=>{db.findings={};},CID,'onboarding_qa'],
  ['foreign ID collision',db=>{db.evidence[1].evidence_id=db.evidence[0].evidence_id;},CID,'onboarding_qa'],
  ['conflicting client map',db=>{db.drafts[CID].client_id='demo_dunder';},CID,'onboarding_qa'],
  ['malformed replay scope',db=>{db.create_requests.unknown={kind:'risks'};},CID,'onboarding_qa'],
  ['foreign guided ownership',db=>{db.guided_assessment_pilot[CID+'_framework_assessments:demo_actor'].client_id='demo_dunder';},CID,'onboarding_qa'],
  ['foreign guided assessment',db=>{db.guided_assessment_pilot[CID+'_framework_assessments:demo_actor'].assessment_id='demo_dunder_framework_assessments';},CID,'onboarding_qa'],
  ['conflicting program',db=>{db.portfolio_reporting.snapshots[0].program_id='demo_dunder:cis-ig1';},CID,'onboarding_qa'],
  ['packed observation',db=>{db.portfolio_reporting.snapshots[0].current={_portfolio_scope_index:0};},CID,'onboarding_qa']
])('%s rejects before any source mutation',(_label,change,cid,purpose)=>{
  const db=fixture();change(db);const before=clone(db);
  expect(()=>prepareCanonicalCisOnboarding(db,cid,{purpose})).toThrow('Canonical CIS preparation:');
  expect(db).toEqual(before);
});
