import {cisDemoFixtureDates} from '../cisDemoFixtureDates';

const CID='demo_dunder';
const ANCHOR='2026-11-02T00:00:00.000Z';
const copy=value=>JSON.parse(JSON.stringify(value));
const fail=message=>{throw new Error('Private Dunder onboarding fixture: '+message);};
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const programOwned=row=>row.client_id===CID||typeof row.program_id==='string'&&row.program_id.startsWith(CID+':');
const ID_FIELDS={framework_assessments:'framework_assessment_id',ai_systems:'ai_system_id',organizational_controls:'control_id',
  reviews:'review_id',findings:'finding_id',risks:'risk_id',policies:'policy_id',vendors:'vendor_id',
  assets:'asset_id',tasks:'task_id',exceptions:'exception_id',requirements:'requirement_id',
  evidence:'evidence_id',assessments:'assessment_id',comments:'comment_id',logs:'audit_id',notifications:'notification_id'};

// Inspect native relationship shapes, including saved nested snapshots, rather
// than matching incidental IDs mentioned in prose.
function referencesOwnedRecord(value,ownedIds) {
  if(Array.isArray(value))return value.some(item=>referencesOwnedRecord(item,ownedIds));
  if(!object(value))return false;
  if(typeof value.kind==='string'&&ownedIds.has(value.id))return true;
  return Object.entries(value).some(([key,item])=>
    key.endsWith('_id')&&typeof item==='string'&&ownedIds.has(item)
    ||key.endsWith('_ids')&&Array.isArray(item)&&item.some(id=>ownedIds.has(id))
    ||referencesOwnedRecord(item,ownedIds));
}

// Fresh canonical construction or explicit onboarding QA only. Returns a new store
// and its complete source backup; never called by retained reads or authenticated startup.
export function prepareDunderNativeOnboarding(source,{clock,purpose}={}) {
  if(purpose!=='native_onboarding_qa')fail('an explicit native-onboarding QA purpose is required.');
  if(!object(source)||source.user?.workspace_mode!=='demo'||source.user?.role!=='super_admin'
    ||!source.user.user_id||source.user.status!=='active')fail('the original Demo seed actor is required.');
  if(!clock||cisDemoFixtureDates(clock).anchor!==ANCHOR)fail('use the backed-up frozen scenario day.');
  const clients=source.clients?.filter(row=>row.client_id===CID)||[];
  if(clients.length!==1||clients[0].environment!=='Demo'||clients[0].status!=='active'
    ||source.baselines?.[CID]?.completed!==true
    ||source.baselines[CID].requirements?.['iso-27001']!=='applies')fail('one completed canonical ISO Demo client is required.');

  const ownedIds=new Set();
  const assessmentIds=new Set();
  for(const [kind,rows] of Object.entries(source))if(Array.isArray(rows)) {
    if(rows.some(row=>!object(row)))fail(kind+' must contain decoded records.');
    for(const row of rows.filter(row=>row.client_id===CID)) {
      // Only a row's own native ID, never an owner or linked record, defines this boundary.
      if(typeof row[ID_FIELDS[kind]]==='string')ownedIds.add(row[ID_FIELDS[kind]]);
      if(kind==='framework_assessments')assessmentIds.add(row.framework_assessment_id);
    }
  }
  for(const [kind,rows] of Object.entries(source))if(Array.isArray(rows)&&!['clients','users','contacts'].includes(kind)) {
    for(const row of rows.filter(row=>row.client_id&&row.client_id!==CID)) {
      if(referencesOwnedRecord(row,ownedIds))fail('another client references a Dunder-owned record; reconcile before replacement.');
    }
  }

  const backup=copy(source),db=copy(source);
  const inventory={};
  for(const [kind,rows] of Object.entries(db))if(Array.isArray(rows)&&!['clients','users','contacts'].includes(kind)) {
    inventory[kind]=rows.filter(row=>row.client_id===CID).length;
    db[kind]=rows.filter(row=>row.client_id!==CID);
  }
  for(const key of ['drafts','ai_intake','ai_counters','riskSequences'])if(db[key])delete db[key][CID];
  for(const key of ['guided_assessment_pilot','guided_assessment_history'])if(db[key]) {
    db[key]=Object.fromEntries(Object.entries(db[key]).filter(([id,row])=>{
      const byId=[...assessmentIds].some(assessmentId=>id.startsWith(assessmentId+':'));
      if(byId&&row.client_id&&row.client_id!==CID)fail(key+' has conflicting ownership.');
      if(row.client_id===CID&&row.assessment_id&&!assessmentIds.has(row.assessment_id))fail(key+' has a foreign assessment.');
      return !byId&&row.client_id!==CID;
    }));
  }
  for(const key of ['create_requests','vendor_action_requests','command_requests'])if(db[key]) {
    db[key]=Object.fromEntries(Object.entries(db[key]).filter(([scope,row])=>{
      let parts;try{parts=JSON.parse(scope);}catch{fail('unreadable '+key+' scope.');}
      if(!Array.isArray(parts))fail('invalid '+key+' scope.');
      if(parts[1]===CID&&row.client_id&&row.client_id!==CID)fail('conflicting '+key+' scope.');
      return parts[1]!==CID;
    }));
  }
  if(db.portfolio_reporting) {
    for(const key of ['snapshots','identities','scope_events','source_refresh_proofs'])if(db.portfolio_reporting[key]) {
      for(const row of db.portfolio_reporting[key])if(programOwned(row)
        && (row.client_id&&row.client_id!==CID||row.program_id&&!row.program_id.startsWith(CID+':')))
          fail('conflicting Portfolio program ownership.');
      db.portfolio_reporting[key]=db.portfolio_reporting[key].filter(row=>!programOwned(row));
    }
    if(db.portfolio_reporting.activity_proofs)for(const id of ownedIds)delete db.portfolio_reporting.activity_proofs[id];
  }
  const baseline={version:3,step:0,completed:false,updated_at:null,policies:{},selected_policy_keys:[],requirements:{},reviews:[],framework_reviews:{}};
  db.baselines={...db.baselines,[CID]:baseline};
  const client=db.clients.find(row=>row.client_id===CID);
  delete client.initial_program_baseline;
  delete client.iso_audit_program;
  client.onboarding_baseline=copy(baseline);
  return {db,backup,clientId:CID,anchor:ANCHOR,inventory};
}
