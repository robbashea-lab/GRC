import {cis, FRAMEWORKS} from '../lib/frameworks';
export const cisClient = (clientId='demo_brawndo', group=1) => ({client_id:clientId, name:'Synthetic CIS client', status:'active',
  onboarding_baseline:{completed:true, requirements:{'cis-ig1':'applies'}}, framework_settings:{'cis-ig1':{implementation_group:group}}});
export function cisContext(clientId='demo_brawndo', group=1, mode='demo') {
  const client=cisClient(clientId,group);
  return {workspaceMode:mode,user:{user_id:'actor',role:'super_admin',...(mode==='demo'?{workspace_mode:'demo'}:{})},
    currentClientId:clientId,currentClient:client,clients:[client],selectedClientId:clientId};
}
export function cisWorkspace(clientId='demo_brawndo', group=1) {
  const definitions=cis.requirements.filter(row=>row.implementation_group<=group).map(row=>({...row}));
  const assessments=definitions.map(row=>({framework_assessment_id:`${clientId}:${row.id}`,client_id:clientId,definition_id:row.id,framework_key:'cis-ig1',framework_version:'8.1',status:'not_assessed'}));
  return {selected:true,configured:true,framework:{...FRAMEWORKS.find(row=>row.key==='cis-ig1')},configuration:{implementation_group:group},definitions,assessments,
    active_definition_ids:definitions.map(row=>row.id),implementation_position:{program_id:`${clientId}:cis-ig1`,availability:'available',total:definitions.length,denominator:definitions.length,implemented:0,excluded:0,
      counts:['addressed','in_progress','needs_attention','not_assessed'].map(key=>({key,count:key==='not_assessed'?definitions.length:0}))}};
}
