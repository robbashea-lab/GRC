import {frameworkKeys} from '../preview/approvedV3Records';
import {CATALOGS} from '../lib/frameworks';

const conflict=message=>{throw Object.assign(new Error(message),{status:409});};

// This catalog is a read-side descriptor, never part of the source's saved view.
export async function loadApprovedSetupCatalog({api,clientId}) {
  const {data}=await api.get('/clients/'+encodeURIComponent(clientId)+'/iv-setup');
  if(data?.client_id!==clientId||!Array.isArray(data.activities)||
      data.activities.some(row=>!row||typeof row.activity_id!=='string'||!row.activity_id||typeof row.title!=='string'||
        !Array.isArray(row.drivers)||!row.drivers.length||row.drivers.some(driver=>!driver||!driver.framework_key||
          !driver.framework_plan_key||!Array.isArray(driver.framework_safeguards))||
        !Array.isArray(row.area_ids)||!row.area_ids.length||!row.area_ids.includes(row.area_id)||
        !['todo','decide','done','removed'].includes(row.state))||
      new Set(data.activities.map(row=>row.activity_id)).size!==data.activities.length)
    conflict('The shared activity catalog does not match this client. Reopen the client.');
  return data;
}

export function approvedSetupActivities(catalog,records) {
  if(!catalog)return null;
  const cid=catalog.client_id,clients=(records.clients||[]).filter(row=>row.client_id===cid);
  if(clients.length!==1||(clients[0].updated_at??null)!==(catalog.expected_client_updated_at??null))
    conflict('The shared activity catalog changed. Reload the client.');
  const kinds=Object.fromEntries(Object.entries(frameworkKeys).map(([kind,key])=>[key,kind]));
  return catalog.activities.map(activity=>{
    const review=activity.review_id?(records.reviews||[]).find(row=>row.client_id===cid&&row.review_id===activity.review_id):null;
    if(activity.review_id&&(!review||(review.updated_at??null)!==(activity.expected_updated_at??null)))
      conflict('The shared Review changed. Reload the client before opening its setup.');
    const bindings=clients[0].profile?.services?.assessment_activities||{};
    return {...activity,client_id:cid,expected_client_updated_at:catalog.expected_client_updated_at,
      source_review_id:review?String(review.source_record_id??review.review_id):null,
      legacy_keys:[...(review?['review|'+String(review.source_record_id??review.review_id)]:[]),
        ...activity.drivers.flatMap(driver=>{
          const plan=CATALOGS[driver.framework_key]?.review_plans?.find(row=>row.key===driver.framework_plan_key);
          return plan?['plan:'+driver.framework_key+':'+plan.key,...(plan.baseline_key?['shared:'+plan.baseline_key]:[]),
            ...[plan.title,plan.ig3_title,plan.level_one_title].filter(Boolean).map(title=>'template|'+title)]:[];
        })],
      assessment_bindings:(records.framework_assessments||[]).filter(row=>row.client_id===cid&&bindings[row.framework_assessment_id]===activity.activity_id)
        .map(row=>({k:kinds[row.framework_key],id:row.definition_id})),
      source_mappings:activity.drivers.map(driver=>({k:kinds[driver.framework_key],
        supportIds:driver.framework_safeguards||[],explicit:true})).filter(mapping=>mapping.k)};
  });
}

export function requireSetupActivity(catalog,clientId,activityId,opened) {
  const activity=catalog?.activities?.find(row=>row.activity_id===activityId);
  if(catalog?.client_id!==clientId||!activity||opened?.client_id!==clientId||
      opened.activity_id!==activityId||opened.review_id!==activity.review_id||
      (opened.expected_updated_at??null)!==(activity.expected_updated_at??null)||
      opened.expected_client_updated_at!==catalog.expected_client_updated_at)
    conflict('The shared activity changed while this form was open. Reopen it before saving.');
  return activity;
}
