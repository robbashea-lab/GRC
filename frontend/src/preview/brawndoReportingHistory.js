import {activeDefinitions} from '../lib/frameworks';
import {demoCurrentPositions} from './portfolioReporting';

const VERSION='brawndo-cis-ig1-history-v1',CLIENT='demo_brawndo',PROGRAM=CLIENT+':cis-ig1',DAY=86400000;
// Explicit synthetic Demo observations, not a reconstruction of today's records.
const POSITIONS=[[360,8,12,10],[300,12,14,10],[240,16,16,8],[180,20,16,8],[120,24,16,6],[75,26,16,6],[45,28,16,6],[21,29,16,6],[14,30,15,6],[7,30,16,6],[2,31,15,6]];

export function enrichBrawndoReportingHistory(db,clock=new Date()) {
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
  const anchor=Math.min(+clock,...first),anchorDate=new Date(anchor).toISOString();
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
