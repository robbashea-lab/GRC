import {CIS_DEMO_SCENARIOS} from './cisDemoSelection';

const TABLE_IDS = {
  framework_assessments:'framework_assessment_id', organizational_controls:'control_id',
  reviews:'review_id', findings:'finding_id', tasks:'task_id', risks:'risk_id',
  policies:'policy_id', vendors:'vendor_id', ai_systems:'ai_system_id', assets:'asset_id', exceptions:'exception_id',
  requirements:'requirement_id', evidence:'evidence_id', assessments:'assessment_id',
  comments:'comment_id', logs:'audit_id', notifications:'notification_id', contacts:'contact_id'
};
const CLIENT_MAPS = ['baselines','drafts','ai_intake','ai_counters','riskSequences','cis_demo_scenario_history'];
const GUIDED_MAPS = ['guided_assessment_pilot','guided_assessment_history'];
const RECEIPT_LENGTHS = {create_requests:3, vendor_action_requests:3, command_requests:4};
const MARKERS = ['cis_demo_rollout','cis_demo_refresh'];
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => {throw new Error('Canonical CIS preparation: '+message);};
function object(value,label) {if(!plain(value))fail(label+' must be a decoded object.');}
function rows(value,label) {
  if(!Array.isArray(value)||value.some(row=>!plain(row)))fail(label+' must contain decoded records.');
}
function matchingClient(value,cid,label) {
  if(value?.client_id!==undefined&&value.client_id!==cid)fail(label+' has conflicting client ownership.');
}
function programOwned(row,cid,label) {
  const byClient=row.client_id===cid,byProgram=typeof row.program_id==='string'&&row.program_id.startsWith(cid+':');
  if(byClient&&row.program_id!==undefined&&!byProgram||byProgram&&row.client_id!==undefined&&!byClient)
    fail(label+' has conflicting program ownership.');
  return byClient||byProgram;
}
function expandedCurrent(current) {
  if(!current)return;
  object(current,'reporting observation');
  if(own(current,'_portfolio_scope_index')||own(current.provenance||{},'_portfolio_source_index'))
    fail('restore Portfolio reporting before preparing a client.');
}
function selectedEntries(db,key,predicate) {
  if(!own(db,key))return {present:false,entries:{}};
  object(db[key],key);
  return {present:true,entries:Object.fromEntries(Object.entries(db[key]).filter(predicate))};
}

// This is an explicit fixture/QA operation, never a readStore migration. Contacts
// and all accounts remain in place so normal onboarding can reuse their identities.
export function snapshotCanonicalCisClient(db,cid) {
  object(db,'Demo data');
  const scenario=CIS_DEMO_SCENARIOS.find(row=>row.client_id===cid);
  if(!scenario)fail('client is outside the three authorized canonical identities.');
  if(db.user?.workspace_mode!=='demo'||typeof db.user.user_id!=='string'||!db.user.user_id)
    fail('an identified Demo actor is required.');
  rows(db.clients,'clients');
  const clients=db.clients.filter(client=>client.client_id===cid);
  if(clients.length!==1||clients[0].environment!=='Demo')fail('one matching canonical Demo client is required.');
  const client=clients[0],records={},maps={},markers={};
  for(const [kind,idField] of Object.entries(TABLE_IDS)) {
    if(own(db,kind))rows(db[kind],kind);
    records[kind]=(db[kind]||[]).filter(row=>row.client_id===cid);
    const targetIds=new Set();
    for(const row of records[kind]) {
      const id=row[idField]||(kind==='logs'?row.log_id:null);
      if(id!==undefined&&id!==null) {
        if(typeof id!=='string'||!id||targetIds.has(id))fail(kind+' has an invalid or duplicate target identity.');
        targetIds.add(id);
      } else if(!['logs','notifications'].includes(kind))fail(kind+' has a target record without an identity.');
    }
    if((db[kind]||[]).some(row=>row.client_id!==cid&&targetIds.has(row[idField]||(kind==='logs'?row.log_id:null))))
      fail(kind+' shares a target identity with another client.');
  }
  const assessmentIds=records.framework_assessments.map(row=>row.framework_assessment_id);
  for(const key of CLIENT_MAPS)maps[key]=selectedEntries(db,key,([id,value])=>{
    if(id!==cid)return false;
    matchingClient(value,cid,key);
    return true;
  });
  for(const key of GUIDED_MAPS)maps[key]=selectedEntries(db,key,([id,value])=>{
    object(value,key+' entry');
    const byAssessment=assessmentIds.some(assessmentId=>id.startsWith(assessmentId+':'));
    const selected=byAssessment||value.client_id===cid;
    if(selected) {
      matchingClient(value,cid,key);
      if((db.framework_assessments||[]).some(row=>row.client_id!==cid&&id.startsWith(row.framework_assessment_id+':')))
        fail(key+' uses another client assessment key.');
      if(value.assessment_id!==undefined&&!assessmentIds.includes(value.assessment_id))
        fail(key+' references an assessment outside this client.');
    }
    return selected;
  });
  for(const [key,length] of Object.entries(RECEIPT_LENGTHS))maps[key]=selectedEntries(db,key,([scope,value])=>{
    let parts;try{parts=JSON.parse(scope);}catch{fail(key+' has an unreadable replay scope.');}
    object(value,key+' receipt');
    // Client creation receipts have no prior client scope; preserve those receipts.
    if(!Array.isArray(parts)||parts.length!==length||parts.some((part,index)=>
      !(index===1&&part===null&&key==='create_requests'&&value.kind==='clients')&&(typeof part!=='string'||!part)))
      fail(key+' has an invalid replay scope.');
    if(parts[1]===cid)matchingClient(value,cid,key);
    return parts[1]===cid;
  });
  for(const key of MARKERS)if(own(db,key)) {
    const marker=db[key];object(marker,key);
    if(marker.clients!==undefined)object(marker.clients,key+'.clients');
    if(marker.reconciliation_required!==undefined)rows(marker.reconciliation_required,key+'.reconciliation_required');
    const entry=marker.clients?.[cid];
    if(entry!==undefined){object(entry,key+' client marker');matchingClient(entry,cid,key);}
    markers[key]={clients:entry===undefined?{}:{[cid]:entry},
      reconciliation_required:(marker.reconciliation_required||[]).filter(row=>row.client_id===cid)};
  }
  let reporting=null;
  if(own(db,'portfolio_reporting')) {
    const history=db.portfolio_reporting;object(history,'portfolio_reporting');reporting={};
    for(const key of ['snapshots','identities','scope_events','source_refresh_proofs']) {
      if(history[key]!==undefined)rows(history[key],'portfolio_reporting.'+key);
      for(const row of history[key]||[]) {
        expandedCurrent(row.current);expandedCurrent(row.before);expandedCurrent(row.after);
      }
      reporting[key]=(history[key]||[]).filter(row=>programOwned(row,cid,'portfolio_reporting.'+key));
    }
    const auditIds=new Set(records.logs.map(row=>row.audit_id||row.log_id).filter(Boolean));
    if(history.activity_proofs!==undefined)object(history.activity_proofs,'activity_proofs');
    reporting.activity_proofs=Object.fromEntries(Object.entries(history.activity_proofs||{}).filter(([id])=>auditIds.has(id)));
    if(history.fixture_versions!==undefined)object(history.fixture_versions,'fixture_versions');
    const legacyKey='brawndo-cis-ig1-history-v2';
    reporting.fixture_versions=cid==='demo_brawndo'&&own(history.fixture_versions||{},legacyKey)
      ? {[legacyKey]:history.fixture_versions[legacyKey]}:{};
  }
  const inventory={records:Object.fromEntries(Object.entries(records).filter(([kind])=>kind!=='contacts')
    .map(([kind,values])=>[kind,values.map(row=>row[TABLE_IDS[kind]]||row.log_id||null)])),
    retained_contact_ids:records.contacts.map(row=>row.contact_id),
    client_fields:['initial_program_baseline','onboarding_baseline','framework_settings'],
    maps:Object.fromEntries(Object.entries(maps).map(([key,value])=>[key,Object.keys(value.entries)])),
    markers:Object.fromEntries(Object.entries(markers).map(([key,value])=>[key,
      {client_ids:Object.keys(value.clients),reconciliation_entries:value.reconciliation_required.length}])),
    reporting:reporting?Object.fromEntries(Object.entries(reporting).map(([key,value])=>[key,Array.isArray(value)?value.length:Object.keys(value)])):null};
  // Clone everything before any caller can mutate: serialization failures leave
  // the original data intact and the returned artifact is independently recoverable.
  return copy({schema_version:1,client_id:cid,implementation_group:scenario.implementation_group,
    client,records,maps,markers,reporting,inventory});
}

export function prepareCanonicalCisOnboarding(db,cid,{purpose}={}) {
  if(!['canonical_fixture_build','onboarding_qa'].includes(purpose))fail('an explicit fixture-build or onboarding-QA purpose is required.');
  const snapshot=snapshotCanonicalCisClient(db,cid),updates={};
  for(const kind of Object.keys(TABLE_IDS))if(kind!=='contacts'&&own(db,kind))
    updates[kind]=db[kind].filter(row=>row.client_id!==cid);
  for(const [key,{present,entries}] of Object.entries(snapshot.maps))if(present) {
    const removed=new Set(Object.keys(entries));
    updates[key]=Object.fromEntries(Object.entries(db[key]).filter(([id])=>!removed.has(id)));
  }
  for(const key of Object.keys(snapshot.markers)) {
    const marker=db[key],next={...marker};
    if(marker.clients!==undefined){next.clients={...marker.clients};delete next.clients[cid];}
    if(marker.reconciliation_required!==undefined)next.reconciliation_required=marker.reconciliation_required.filter(row=>row.client_id!==cid);
    updates[key]=next;
  }
  if(snapshot.reporting) {
    const history=db.portfolio_reporting,next={...history};
    for(const key of ['snapshots','identities','scope_events','source_refresh_proofs'])if(history[key]!==undefined)
      next[key]=history[key].filter(row=>!programOwned(row,cid,'portfolio_reporting.'+key));
    for(const key of ['activity_proofs','fixture_versions'])if(history[key]!==undefined) {
      const removed=new Set(Object.keys(snapshot.reporting[key]));
      next[key]=Object.fromEntries(Object.entries(history[key]).filter(([id])=>!removed.has(id)));
    }
    // Decoded observations are filtered; existing pooled serialization metadata is
    // untouched and the normal Portfolio serializer rebuilds it on the next save.
    updates.portfolio_reporting=next;
  }
  const state={version:3,step:0,completed:false,updated_at:null,policies:{},selected_policy_keys:[],
    requirements:{},reviews:[],framework_reviews:{},
    framework_settings:{'cis-ig1':{implementation_group:snapshot.implementation_group}}};
  updates.baselines={...(updates.baselines||db.baselines||{}),[cid]:state};
  const client=db.clients.find(row=>row.client_id===cid);
  Object.assign(db,updates);
  delete client.initial_program_baseline;
  client.onboarding_baseline=copy(state);
  client.framework_settings={...client.framework_settings,...state.framework_settings};
  return {snapshot,inventory:snapshot.inventory,client_id:cid,purpose};
}
