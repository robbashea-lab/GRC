import {activeDefinitions} from '../lib/frameworks';
import {validImplementationPosition} from '../lib/portfolioProgress';
import {CIS_DEMO_REVISION,CIS_DEMO_SCENARIOS} from './cisDemoSelection';

// Synthetic change detection, not cryptographic evidence or authorization.
export function fixtureFingerprint(value){
  const text=JSON.stringify(value);let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return `${text.length}:${hash>>>0}`;
}

export function getCisDemoScenarioContext(db,clientId,at=new Date().toISOString()){
  const scenario=CIS_DEMO_SCENARIOS.find(row=>row.client_id===clientId&&row.implementation_group>1);
  const client=db.clients?.find(row=>row.client_id===clientId),state=db.baselines?.[clientId],context=db.cis_demo_scenario_history?.[clientId];
  if(!scenario||db.user?.workspace_mode!=='demo'||!(db.user.client_ids||[]).includes(clientId)
    ||client?.environment!=='Demo'||client.status!=='active'||client.archived||client.archived_at
    ||!state?.completed||state.requirements?.['cis-ig1']!=='applies'
    ||client.framework_settings?.['cis-ig1']?.implementation_group!==scenario.implementation_group
    ||!context||context.version!==CIS_DEMO_REVISION||context.client_id!==clientId||context.program_id!==clientId+':cis-ig1'
    ||context.implementation_group!==scenario.implementation_group||!Number.isFinite(Date.parse(at))||!Number.isFinite(Date.parse(context.anchor))||context.anchor>at
    ||!Array.isArray(context.source_rows)||fixtureFingerprint(context.source_rows)!==context.fingerprint
    ||!Array.isArray(context.point_ids)||context.point_ids.length!==5||new Set(context.point_ids).size!==5)return null;
  const expected=activeDefinitions('cis-ig1',{implementation_group:scenario.implementation_group}).map(row=>row.id);
  if(context.source_rows.length!==expected.length||new Set(context.source_rows.map(row=>row[0])).size!==expected.length
    ||new Set(context.source_rows.map(row=>row[1])).size!==expected.length||expected.some(id=>!context.source_rows.some(row=>row[1]===id)))return null;
  const rows=db.framework_assessments?.filter(row=>row.client_id===clientId&&row.framework_key==='cis-ig1')||[];
  for(const [id,definition,,,_events] of context.source_rows){
    const matches=rows.filter(row=>row.framework_assessment_id===id&&row.definition_id===definition&&row.framework_version==='8.1');
    if(matches.length!==1||!Array.isArray(_events)||_events.some(([date,status])=>!(matches[0].assessment_history||[]).some(event=>event.at===date&&event.status===status)))return null;
  }
  const snapshots=db.portfolio_reporting?.snapshots||[],points=[];
  for(const [index,id] of context.point_ids.entries()){
    const matches=snapshots.filter(row=>row.snapshot_id===id);if(matches.length!==1)return null;
    const point=matches[0],value=point.current,refs=value?.provenance?.source_references;
    if(point.client_id!==clientId||point.program_id!==context.program_id||point.framework_key!=='cis-ig1'
      ||point.observation_kind!=='demo_fixture'||value?.observation_kind!=='demo_fixture'||value.provenance?.kind!=='demo_fixture'
      ||value.scenario_version!==context.version||value.scenario_anchor!==context.anchor||value.scenario_fingerprint!==context.fingerprint
      ||!validImplementationPosition(point)||value.denominator!==expected.length||value.excluded!==0
      ||value.scope?.configuration?.implementation_group!==scenario.implementation_group
      ||!Array.isArray(refs)||refs.length!==expected.length||new Set(refs.map(row=>row.id)).size!==expected.length)return null;
    const date=point.effective_at||point.captured_at;
    if(!Number.isFinite(Date.parse(date))||date>context.anchor||index&&date<=(points[index-1].effective_at||points[index-1].captured_at))return null;
    for(const [rid,definition,status,,events] of context.source_rows){
      const reference=refs.find(row=>row.id===rid&&row.definition_id===definition);
      const prior=events.filter(([eventAt])=>eventAt<=date).sort((a,b)=>a[0].localeCompare(b[0])).at(-1);
      if(!reference||reference.framework_version!=='8.1'||reference.status!==(index===4?status:prior?.[1]||'not_assessed'))return null;
    }
    points.push(point);
  }
  if(points.some((point,index)=>point.current.modeled_until!==(points[index+1]?.effective_at||context.anchor)))return null;
  return {...context};
}
