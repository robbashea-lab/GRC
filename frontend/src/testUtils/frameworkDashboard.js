import {activeDefinitions, FRAMEWORKS, frameworkCatalog} from '../lib/frameworks';
import {captureDemoReporting,demoCurrentPositions} from '../preview/portfolioReporting';

// Disposable native-model fixture. Canonical Demo aggregation supplies the position under test.
export function frameworkDashboardFixture(frameworkKey='iso-27001', categories=['security','availability','confidentiality'], clientId='synthetic-dashboard-'+frameworkKey) {
  const client={client_id:clientId,name:'Synthetic framework client',status:'active',onboarding_baseline:{completed:true},
    framework_settings:frameworkKey==='soc-2'?{'soc-2':{categories}}:{}};
  const catalog=frameworkCatalog(frameworkKey),configuration=client.framework_settings[frameworkKey]||{};
  const definitions=activeDefinitions(frameworkKey,configuration);
  const assessments=definitions.map((definition,index)=>({client_id:clientId,framework_key:frameworkKey,framework_version:catalog.version,
    definition_id:definition.id,framework_assessment_id:clientId+':'+definition.id,
    status:['addressed','in_progress','needs_attention','not_assessed'][index%4],
    ...(definition.specification==='annex_control'?{soa_applicability:'included',soa_justification:'Synthetic risk-based selection'}:{}),
    created_at:'2026-10-01T00:00:00Z'}));
  const requirement={client_id:clientId,requirement_id:clientId+':enrollment',baseline_key:frameworkKey,baseline_response:'applies'};
  const db={clients:[client],requirements:[requirement],framework_assessments:assessments};
  const source={selected:true,configured:true,framework:FRAMEWORKS.find(row=>row.key===frameworkKey),configuration,
    definitions,assessments,active_definition_ids:definitions.map(row=>row.id)};
  let previous=null;
  const refresh=()=>{
    captureDemoReporting(db,previous,'2026-10-26T12:00:00Z');
    source.implementation_position=demoCurrentPositions(db,[client],'2026-10-26T12:00:00Z')[0].current;
    previous=JSON.parse(JSON.stringify(db));
  };
  refresh();
  return {client,source,db,refresh};
}
