import {activeDefinitions} from '../lib/frameworks';
import {demoCurrentPositions} from './portfolioReporting';
import {stable} from './commandRequests';
import {buildBrawndoScenario,BRAWNDO_HISTORY_VERSION,canonicalScenarioStates,scenarioAssessmentId,validScenarioInstant} from './brawndoHistoryScenario';
import {validImplementationPosition} from '../lib/portfolioProgress';

const VERSION='brawndo-cis-ig1-history-v1',CLIENT='demo_brawndo',PROGRAM=CLIENT+':cis-ig1',DAY=86400000;
// Explicit synthetic Demo observations, not a reconstruction of today's records.
const POSITIONS=[[360,8,12,10],[300,12,14,10],[240,16,16,8],[180,20,16,8],[120,24,16,6],[75,26,16,6],[45,28,16,6],[21,29,16,6],[14,30,15,6],[7,30,16,6],[2,31,15,6]];

function enrichLegacyHistory(db,clock=new Date(),originalAnchor=null) {
  const history=db.portfolio_reporting||{};
  if(history.fixture_versions?.[VERSION])return false;
  const client=db.clients?.find(row=>row.client_id===CLIENT);
  if(db.user?.workspace_mode!=='demo'||!client||client.status!=='active'||client.archived||client.archived_at)return false;
  if(client.environment!=='Demo'||client.initial_program_baseline?.state?.version!==3
    ||!client.initial_program_baseline.state.completed||client.initial_program_baseline.completed_by!=='demo_provider_lead')return false;
  const current=demoCurrentPositions(db,[client],clock.toISOString()).find(row=>row.program_id===PROGRAM);
  const definitions=activeDefinitions('cis-ig1',{implementation_group:1});
  // Changed/invalid scope needs its own historical fixture; never infer old scope from it.
  if(current?.program_key!=='cis-ig1'||current.framework_version!=='8.1'||definitions.length!==56||current.current.availability!=='available'||current.current.denominator!==definitions.length
    ||current.current.total!==definitions.length||current.current.excluded||current.current.scope.configuration.implementation_group!==1)return false;
  const existing=history.snapshots||[];
  const first=existing.filter(row=>(row.program_id||row.client_id+':'+row.framework_key)===PROGRAM).map(row=>Date.parse(row.effective_at||row.captured_at)).filter(Number.isFinite);
  const anchor=originalAnchor===null?Math.min(+clock,...first):Date.parse(originalAnchor),anchorDate=new Date(anchor).toISOString();
  const sourceIds=new Set(current.current.provenance.source_references.map(row=>row.id));
  const rows=db.framework_assessments.filter(row=>row.client_id===CLIENT&&row.framework_key==='cis-ig1'&&sourceIds.has(row.framework_assessment_id));
  if(rows.some(row=>row.framework_assessment_id!==`fw_${CLIENT}_assessment_${row.definition_id}`))return false;
  const snapshots=POSITIONS.map(([days,addressed,inProgress,needsAttention],index)=>{
    const at=new Date(anchor-days*DAY).toISOString();
    const simulated=definitions.map((definition,i)=>({...rows.find(row=>row.definition_id===definition.id),
      status:i<addressed?'addressed':i<addressed+inProgress?'in_progress':i<addressed+inProgress+needsAttention?'needs_attention':'not_assessed',
      created_at:at,last_saved:at,last_assessed:at}));
    const projection={...db,portfolio_reporting:undefined,framework_assessments:simulated};
    const position=demoCurrentPositions(projection,[client],at).find(row=>row.program_id===PROGRAM);
    const snapshot_id=`demo-fixture:${VERSION}:${anchorDate}:${index}`,source_revision=snapshot_id;
    return {...position,snapshot_id,captured_at:at,effective_at:at,observation_sequence:index+1,observation_kind:'demo_fixture',source_revision,source_event:null,
      current:{...position.current,source_revision,observation_kind:'demo_fixture',provenance:{...position.current.provenance,kind:'demo_fixture',label:'Sample Demo program position',fixture_version:VERSION,fixture_anchor:anchorDate}}};
  });
  db.portfolio_reporting={...history,snapshots:[...snapshots,...existing],fixture_versions:{...history.fixture_versions,[VERSION]:{anchor:anchorDate,count:snapshots.length}}};
  return true;
}

function eligibleSource(db,clock=new Date()){
  if(!(clock instanceof Date)||!Number.isFinite(+clock))return null;
  const client=db.clients?.find(row=>row.client_id===CLIENT);
  if(db.user?.workspace_mode!=='demo'||client?.status!=='active'||client.archived||client.archived_at
    ||client.environment!=='Demo'||client.initial_program_baseline?.state?.version!==3
    ||!client.initial_program_baseline.state.completed||client.initial_program_baseline.completed_by!=='demo_provider_lead')return null;
  const current=demoCurrentPositions(db,[client],clock.toISOString()).find(row=>row.program_id===PROGRAM);
  const definitions=activeDefinitions('cis-ig1',{implementation_group:1}),terminal=canonicalScenarioStates();
  if(definitions.length!==56||definitions.some(row=>!Object.hasOwn(terminal,row.id))||current?.framework_version!=='8.1'
    ||current.program_key!=='cis-ig1'||current.current.availability!=='available'||current.current.denominator!==56
    ||current.current.total!==56||current.current.excluded||current.current.scope.configuration.implementation_group!==1)return null;
  const rows=db.framework_assessments.filter(row=>row.client_id===CLIENT&&row.framework_key==='cis-ig1');
  if(rows.length!==56||rows.some(row=>row.framework_assessment_id!==scenarioAssessmentId(row.definition_id)||!Object.hasOwn(terminal,row.definition_id))
    ||new Set(rows.map(row=>row.definition_id)).size!==56)return null;
  return {client,current,definitions,rows,terminal};
}

const terminalMatches=(references,terminal)=>Array.isArray(references)&&references.length===56
  &&new Set(references.map(row=>row.definition_id)).size===56
  &&references.every(row=>row.id===scenarioAssessmentId(row.definition_id)&&row.status===terminal[row.definition_id]);

const NATIVE_KINDS=['current_baseline','sampled','committed_event'];
const validInstant=validScenarioInstant;
function validNativePosition(snapshot,source,clock=new Date()){
  const current=snapshot?.current,scope=current?.scope,kind=snapshot?.observation_kind;
  // Reject unrelated history before reading its potentially pooled source payload.
  if(snapshot?.program_id!==PROGRAM||snapshot.client_id!==CLIENT||snapshot.framework_key!=='cis-ig1')return false;
  const references=current?.provenance?.source_references;
  return validInstant(snapshot.effective_at||snapshot.captured_at)&&validInstant(snapshot.captured_at)
    &&Date.parse(snapshot.effective_at||snapshot.captured_at)<=Date.parse(snapshot.captured_at)&&Date.parse(snapshot.captured_at)<=+clock
    &&NATIVE_KINDS.includes(kind)&&current?.observation_kind===kind&&current.provenance?.kind===kind
    &&typeof snapshot.snapshot_id==='string'&&snapshot.source_event===snapshot.snapshot_id
    &&current.source_event===snapshot.snapshot_id&&current.provenance.source_event===snapshot.snapshot_id
    &&typeof current.source_revision==='string'&&snapshot.source_revision===current.source_revision
    &&current.program_id===PROGRAM&&current.measure_version===source.current.current.measure_version
    &&validImplementationPosition(current)&&current.availability==='available'&&current.total===56&&current.denominator===56&&!current.excluded
    &&scope?.framework_key==='cis-ig1'&&scope.catalog_version==='8.1'&&scope.configuration?.implementation_group===1
    &&Array.isArray(scope.definition_ids)&&stable([...scope.definition_ids].sort())===stable(Object.keys(source.terminal).sort())
    &&Object.keys(scope.applicability||{}).length===56&&Object.entries(scope.applicability).every(([id,state])=>Object.hasOwn(source.terminal,id)&&state==='included')
    &&Array.isArray(references)&&references.length===56&&new Set(references.map(row=>row.definition_id)).size===56
    &&SCENARIO_NATIVE_STATUSES.every(status=>(current.included_counts||current.counts).find(row=>row.key===status)?.count===references.filter(row=>row.status===status).length)
    &&references.every(row=>row.kind==='framework_assessments'&&row.id===scenarioAssessmentId(row.definition_id)
      &&Object.hasOwn(source.terminal,row.definition_id)&&row.framework_version===source.rows.find(record=>record.definition_id===row.definition_id)?.framework_version
      &&SCENARIO_NATIVE_STATUSES.includes(row.status));
}

function exactOwnedScenario(expected,stored){
  const owned=stored.filter(row=>row.snapshot_id?.startsWith(`demo-fixture:${BRAWNDO_HISTORY_VERSION}:`)
    ||row.current?.scenario_version===BRAWNDO_HISTORY_VERSION||row.current?.provenance?.fixture_version===BRAWNDO_HISTORY_VERSION);
  return owned.length===expected.length&&new Set(owned.map(row=>row.snapshot_id)).size===expected.length
    &&expected.every(point=>owned.some(actual=>actual.snapshot_id===point.snapshot_id&&stable(actual)===stable(point)));
}

function earliestNativeAtAnchor(stored,anchor){
  const native=stored.filter(row=>(row.program_id||row.client_id+':'+row.framework_key)===PROGRAM&&row.observation_kind!=='demo_fixture');
  if(native.some(row=>!validInstant(row.effective_at||row.captured_at)||!validInstant(row.captured_at)))return {invalid:true,position:null};
  return {invalid:false,position:native.filter(row=>Date.parse(row.effective_at||row.captured_at)>=Date.parse(anchor))
    .sort((a,b)=>Date.parse(a.effective_at||a.captured_at)-Date.parse(b.effective_at||b.captured_at)||(a.observation_sequence||0)-(b.observation_sequence||0))[0]||null};
}

function acceptedSourceRefresh(db,proof,references,source,clock){
  const next=proof.source_references_after;
  if(proof.kind!=='accepted_source_refresh'||proof.client_id!==CLIENT||proof.program_id!==PROGRAM
    ||proof.scope_signature!==source.current.current.scope_signature||proof.measure_version!==source.current.current.measure_version
    ||proof.status_signature!==source.current.current.status_signature||!validInstant(proof.at,clock)
    ||stable(proof.source_references_before)!==stable(references)||!Array.isArray(next)||next.length!==56
    ||new Set(next.map(row=>row.id)).size!==56||!Array.isArray(proof.source_event_ids))return false;
  if(!references.every(old=>next.some(row=>row.id===old.id&&row.kind===old.kind&&row.definition_id===old.definition_id
    &&row.framework_version===old.framework_version&&row.status===old.status)))return false;
  const changed=next.filter(row=>references.find(old=>old.id===row.id)?.version!==row.version);
  return changed.length>0&&changed.every(reference=>validInstant(reference.version,clock)&&Date.parse(reference.version)>Date.parse(references.find(old=>old.id===reference.id).version)
    &&proof.source_event_ids.some(id=>{
      const log=db.logs?.find(row=>(row.audit_id||row.log_id)===id);
      return log?.client_id===CLIENT&&log.entity_type==='framework_assessments'&&log.entity_id===reference.id
        &&log.action==='Framework assessment updated'&&log.meta?.status===reference.status
        &&validInstant(log.at,clock)&&Date.parse(log.at)<=Date.parse(proof.at)
        &&Math.abs(Date.parse(log.at)-Date.parse(reference.version))<=1000
        &&db.portfolio_reporting.activity_proofs?.[id]?.eligible===true
        &&log.success!==false&&log.committed!==false&&(log.outcome==null||log.outcome==='success')
        &&!['denied','failed','error','cancelled','requested'].includes(log.meta?.outcome);
    }));
}

function currentSourceHeld(db,snapshot,source,clock){
  if(!snapshot||snapshot.current.status_signature!==source.current.current.status_signature)return false;
  let revision=snapshot.current.source_revision,references=snapshot.current.provenance.source_references;
  // Legacy stores without the interned source registry can assign a different
  // revision alias to the same complete accepted source vector. Exact identity,
  // status, framework and saved-version equality proves this is no source edit.
  if(stable(references)===stable(source.current.current.provenance.source_references))return true;
  const target=source.current.current.source_revision,proofs=db.portfolio_reporting.source_refresh_proofs||[];
  const seen=new Set();
  while(revision!==target){
    if(seen.has(revision))return false;seen.add(revision);
    const proof=proofs.find(row=>row.from_source_revision===revision&&acceptedSourceRefresh(db,row,references,source,clock));
    if(!proof||proof.to_source_revision===revision)return false;
    revision=proof.to_source_revision;references=proof.source_references_after;
  }
  return stable(references)===stable(source.current.current.provenance.source_references);
}

function scenarioSnapshots(db,source,scenario){
  return scenario.positions.map((point,index)=>{
    const simulated=source.rows.map(row=>({...row,status:point.states[row.definition_id],created_at:point.at,last_saved:point.at,last_assessed:point.at}));
    const position=demoCurrentPositions({...db,portfolio_reporting:undefined,framework_assessments:simulated},[source.client],point.at).find(row=>row.program_id===PROGRAM);
    const metadata={scenario_version:scenario.version,scenario_anchor:scenario.anchor,scenario_fingerprint:scenario.fingerprint,modeled_until:point.modeled_until};
    return {...position,snapshot_id:point.id,captured_at:point.at,effective_at:point.at,observation_sequence:index+1,
      observation_kind:'demo_fixture',source_revision:point.id,source_event:null,
      current:{...position.current,...metadata,source_revision:point.id,observation_kind:'demo_fixture',
        provenance:{...position.current.provenance,kind:'demo_fixture',label:'Illustrative initial demo scenario',fixture_version:scenario.version,fixture_anchor:scenario.anchor}}};
  });
}

export function enrichBrawndoReportingHistory(db,clock=new Date()){
  const history=db.portfolio_reporting||{};
  const installed=history.fixture_versions?.[BRAWNDO_HISTORY_VERSION];
  // A joined fixture has no migration work. Reporting admission still validates
  // its complete payload in getBrawndoScenarioContext on each reporting request.
  if(installed?.join_snapshot_id)return false;
  const source=eligibleSource(db,clock);if(!source)return false;
  if(installed){
    const scenario=buildBrawndoScenario(installed.anchor,clock);
    if(!scenario||installed.fingerprint!==scenario.fingerprint||stable(installed.terminal)!==stable(scenario.terminal)
      ||stable(installed.events)!==stable(scenario.events)
      ||!exactOwnedScenario(scenarioSnapshots(db,source,scenario),history.snapshots||[]))return false;
    const earliest=earliestNativeAtAnchor(history.snapshots||[],installed.anchor),join=earliest.position;
    if(earliest.invalid||!validNativePosition(join,source,clock)||!terminalMatches(join.current.provenance.source_references,source.terminal))return false;
    db.portfolio_reporting={...history,fixture_versions:{...history.fixture_versions,
      [BRAWNDO_HISTORY_VERSION]:{...installed,join_snapshot_id:join.snapshot_id}}};
    return true;
  }
  const existing=history.snapshots||[],legacy=history.fixture_versions?.[VERSION];
  let anchor=clock.toISOString(),owned=[];
  if(legacy){
    if(legacy.count!==POSITIONS.length||!validInstant(legacy.anchor,clock))return false;
    anchor=new Date(legacy.anchor).toISOString();
    // Reconstruct the complete expected old payload, using its original anchor.
    // A namespace alone never authorizes deletion of user-modified fixture data.
    const expectedDb={...db,portfolio_reporting:undefined};
    if(!enrichLegacyHistory(expectedDb,clock,anchor))return false;
    const expected=expectedDb.portfolio_reporting.snapshots.slice(0,POSITIONS.length);
    owned=existing.filter(row=>row.snapshot_id?.startsWith(`demo-fixture:${VERSION}:`));
    if(owned.length!==expected.length||expected.some(row=>!owned.some(actual=>stable(actual)===stable(row))))return false;
  }else if(existing.some(row=>row.observation_kind==='demo_fixture'&&(row.program_id||row.client_id+':'+row.framework_key)===PROGRAM))return false;
  const native=existing.filter(row=>(row.program_id||row.client_id+':'+row.framework_key)===PROGRAM&&row.observation_kind!=='demo_fixture')
    .sort((a,b)=>Date.parse(a.effective_at||a.captured_at)-Date.parse(b.effective_at||b.captured_at));
  if(!legacy&&native.length)anchor=native[0].effective_at||native[0].captured_at;
  const earliest=earliestNativeAtAnchor(existing,anchor),join=earliest.position;
  if(earliest.invalid||join&&(!validNativePosition(join,source,clock)||!terminalMatches(join.current.provenance.source_references,source.terminal)))return false;
  const unchanged=source.rows.every(row=>row.status===source.terminal[row.definition_id]&&!row.last_saved);
  if(!join&&!unchanged)return false;
  const scenario=buildBrawndoScenario(anchor,clock);if(!scenario)return false;
  const snapshots=scenarioSnapshots(db,source,scenario),ownedIds=new Set(owned.map(row=>row.snapshot_id));
  const marker={version:scenario.version,anchor:scenario.anchor,fingerprint:scenario.fingerprint,count:snapshots.length,
    join_snapshot_id:join?.snapshot_id||null,terminal:scenario.terminal,events:scenario.events};
  db.portfolio_reporting={...history,snapshots:[...snapshots,...existing.filter(row=>!ownedIds.has(row.snapshot_id))],
    fixture_versions:{...history.fixture_versions,[BRAWNDO_HISTORY_VERSION]:marker}};
  return true;
}

export function getBrawndoScenarioContext(db,clock=new Date()){
  const source=eligibleSource(db,clock),marker=db.portfolio_reporting?.fixture_versions?.[BRAWNDO_HISTORY_VERSION];
  if(!source||!marker)return null;
  const scenario=buildBrawndoScenario(marker.anchor,clock);
  if(!scenario||marker.count!==scenario.positions.length||marker.fingerprint!==scenario.fingerprint||stable(marker.terminal)!==stable(scenario.terminal)||stable(marker.events)!==stable(scenario.events))return null;
  const expected=scenarioSnapshots(db,source,scenario),stored=db.portfolio_reporting.snapshots||[];
  if(marker.join_snapshot_id){
    const join=stored.find(row=>row.snapshot_id===marker.join_snapshot_id);
    const earliest=earliestNativeAtAnchor(stored,scenario.anchor);
    if(earliest.invalid||earliest.position?.snapshot_id!==marker.join_snapshot_id||!validNativePosition(join,source,clock)
      ||Date.parse(join.effective_at||join.captured_at)<Date.parse(scenario.anchor)
      ||!terminalMatches(join.current?.provenance?.source_references,scenario.terminal))return null;
    const joinAt=Date.parse(join.effective_at||join.captured_at);
    if(stored.some(row=>row.program_id===PROGRAM&&row.observation_kind!=='demo_fixture'
      &&Date.parse(row.effective_at||row.captured_at)>=joinAt&&!validNativePosition(row,source,clock)))return null;
  }else if(!source.rows.every(row=>row.status===scenario.terminal[row.definition_id]&&!row.last_saved))return null;
  if(!exactOwnedScenario(expected,stored))return null;
  const latestNative=stored.filter(row=>validNativePosition(row,source,clock)
    &&Date.parse(row.effective_at||row.captured_at)<=+clock)
    .sort((a,b)=>Date.parse(a.effective_at||a.captured_at)-Date.parse(b.effective_at||b.captured_at)||(a.observation_sequence||0)-(b.observation_sequence||0)).at(-1);
  const held=currentSourceHeld(db,latestNative,source,clock);
  if(latestNative&&!held)return null;
  return {version:scenario.version,client_id:CLIENT,program_id:PROGRAM,anchor:scenario.anchor,as_of:clock.toISOString(),fingerprint:scenario.fingerprint,
    point_ids:scenario.positions.map(point=>point.id),join_snapshot_id:marker.join_snapshot_id,
    ...(held?{held_snapshot_id:latestNative.snapshot_id,held_until:clock.toISOString(),
      held_source_revision:latestNative.current.source_revision,
      current_source_revision:source.current.current.source_revision,current_status_signature:source.current.current.status_signature}:{})};
}

// Prepare one immutable read projection per response. Reusing this work across
// the 56 workspace rows avoids rebuilding the native program and replaying the
// same history for every footer. Never retain a selector across Demo commands.
export function createBrawndoScenarioDateSelector(db,context,clock){
  if(clock===undefined)clock=new Date(context?.as_of||Date.now());
  if(context===undefined)context=getBrawndoScenarioContext(db,clock);
  if(!context||!validInstant(context.anchor,clock))return ()=>null;
  const marker=db.portfolio_reporting?.fixture_versions?.[BRAWNDO_HISTORY_VERSION];
  const source=eligibleSource(db,clock);if(!source||!marker)return ()=>null;
  const states=new Map(source.rows.map(record=>[record.definition_id,{assessment_id:record.framework_assessment_id,
    saved_status:record.status,status:marker.terminal[record.definition_id],event:null,invalid:false}]));
  for(const event of marker.events){
    const state=states.get(event.definition_id);
    if(state&&event.status===state.status)state.event={...event};
  }
  // Reporting positions are appended in the same atomic persistence operation
  // as accepted native writes. Draft/interview history and last_assessed alone
  // are deliberately not evidence of an accepted implementation transition.
  const join=(db.portfolio_reporting.snapshots||[]).find(row=>row.snapshot_id===context.join_snapshot_id);
  const joinAt=join?Date.parse(join.effective_at||join.captured_at):Date.parse(context.anchor);
  const entries=(db.portfolio_reporting.snapshots||[]).filter(row=>validNativePosition(row,source,clock)
    &&Date.parse(row.effective_at||row.captured_at)>=joinAt
    &&(Date.parse(row.effective_at||row.captured_at)!==joinAt||!join||(row.observation_sequence||0)>=(join.observation_sequence||0)))
    .sort((a,b)=>Date.parse(a.effective_at||a.captured_at)-Date.parse(b.effective_at||b.captured_at)||(a.observation_sequence||0)-(b.observation_sequence||0));
  for(const entry of entries){
    for(const reference of entry.current.provenance.source_references){
      const state=states.get(reference.definition_id);if(!state)continue;
      if(reference.id!==state.assessment_id||!SCENARIO_NATIVE_STATUSES.includes(reference.status)){state.invalid=true;continue;}
      if(reference.status!==state.status){
        if(entry.observation_kind!=='committed_event'){state.invalid=true;continue;}
        const at=entry.effective_at||entry.captured_at;
        state.event=reference.status==='addressed'?{kind:'implementation_transition',before_status:state.status,status:reference.status,
          effective_date:at.slice(0,10),event_id:entry.snapshot_id,provenance:'accepted_native',
          assessment_id:reference.id,definition_id:reference.definition_id,client_id:CLIENT,framework_key:'cis-ig1',
          scenario_version:context.version,scenario_anchor:context.anchor}:null;
        state.status=reference.status;
      }
    }
  }
  return record=>{
    if(record?.client_id!==CLIENT||record.framework_key!=='cis-ig1'||record.framework_assessment_id!==scenarioAssessmentId(record.definition_id))return null;
    const state=states.get(record.definition_id);
    return state&&!state.invalid&&state.assessment_id===record.framework_assessment_id&&state.saved_status===record.status
      &&state.status===record.status&&state.event?.status===record.status?{...state.event}:null;
  };
}

export function getBrawndoScenarioDateMetadata(db,record,context,clock){
  return createBrawndoScenarioDateSelector(db,context,clock)(record);
}
const SCENARIO_NATIVE_STATUSES=['addressed','in_progress','needs_attention','not_assessed'];
