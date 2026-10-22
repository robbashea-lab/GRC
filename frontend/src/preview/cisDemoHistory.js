import {captureDemoReporting,demoCurrentPositions} from './portfolioReporting';
import {CIS_DEMO_REVISION} from './cisDemoSelection';
import {fixtureFingerprint} from './cisDemoHistoryContext';

const clone=value=>JSON.parse(JSON.stringify(value));
function monthBefore(clock,months){
  if(!months)return new Date(clock).toISOString();
  const date=new Date(clock),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-months);
  date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));
  date.setUTCHours(12,0,0,0);return date.toISOString();
}

// Imported fictional observations derive from actual fixture assessment histories,
// not hardcoded percentages or invented scope-change explanations.
export function seedCisScenarioHistory(db,client,clock){
  const cid=client.client_id,original=db.framework_assessments.filter(row=>row.client_id===cid),before=db.portfolio_reporting||{};
  if((before.snapshots||[]).some(row=>row.client_id===cid))return false;
  const projection={...db,clients:[client],portfolio_reporting:undefined};
  let previous=null;
  for(const months of [12,6,3,1,0]){
    const at=monthBefore(clock,months);
    projection.framework_assessments=original.map(row=>{
      if(!months)return clone(row);
      const event=[...(row.assessment_history||[])].filter(event=>event.at<=at).sort((a,b)=>a.at.localeCompare(b.at)).at(-1);
      return {...row,status:event?.status||'not_assessed',implementation:event?.implementation||'',notes:event?.notes||'',
        created_at:row.fixture_history_origin_at||row.created_at,
        last_assessed:event?.at?.slice(0,10)||null,last_saved:event?.at||null,updated_at:event?.at||row.created_at};
    });
    const count=projection.portfolio_reporting?.snapshots?.length||0;
    captureDemoReporting(projection,previous,at);
    // An unchanged terminal observation is still an explicit fictional import
    // point. The native change-capture helper correctly omits duplicate changes.
    if(!months&&projection.portfolio_reporting.snapshots.length===count){
      const point=demoCurrentPositions(projection,[client],at)[0];
      projection.portfolio_reporting.snapshots.push({...point,snapshot_id:`fixture:${CIS_DEMO_REVISION}:${cid}:${at}`,
        captured_at:at,effective_at:at,observation_sequence:count+1,source_revision:point.current.source_revision});
    }
    previous=clone(projection);
  }
  const history=projection.portfolio_reporting;
  const source_rows=original.map(row=>[row.framework_assessment_id,row.definition_id,row.status,row.last_saved,
    (row.assessment_history||[]).map(event=>[event.at,event.status])]);
  const fingerprint=fixtureFingerprint(source_rows),anchor=monthBefore(clock,0);
  const snapshots=history.snapshots.map((row,index)=>({...row,observation_kind:'demo_fixture',
    current:{...row.current,observation_kind:'demo_fixture',scenario_version:CIS_DEMO_REVISION,scenario_anchor:anchor,
      scenario_fingerprint:fingerprint,modeled_until:history.snapshots[index+1]?.effective_at||anchor,
      provenance:{...row.current.provenance,kind:'demo_fixture',fixture_revision:CIS_DEMO_REVISION,
        label:'Explicit fictional Demo assessment-history projection'}}}));
  db.cis_demo_scenario_history||={};
  db.cis_demo_scenario_history[cid]={version:CIS_DEMO_REVISION,client_id:cid,program_id:cid+':cis-ig1',anchor,
    fingerprint,point_ids:snapshots.map(row=>row.snapshot_id),source:'Explicit fictional assessment_history events',
    source_rows,implementation_group:client.framework_settings['cis-ig1'].implementation_group};
  db.portfolio_reporting={...before,identities:[...(before.identities||[]),...(history.identities||[])],
    snapshots:[...(before.snapshots||[]),...snapshots],scope_events:before.scope_events||[],
    activity_proofs:before.activity_proofs||{},started_at:before.started_at||history.started_at};
  return true;
}
