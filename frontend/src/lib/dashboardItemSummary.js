import {actionOrigin} from './brawndoActions';
import {taskSource} from './actionItems';

const ROUTES={reviews:'reviews',tasks:'action-items',findings:'action-items',risks:'risks',policies:'policies',vendors:'vendors',exceptions:'exceptions',requirements:'requirements'};
export const dashboardStatus=value=>value==='remediated'?'Pending Validation':value?value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()):'—';
export function dashboardRecordHref(kind,record,{occurrence}={}) {
  const id=record[`${kind==='policies'?'policy':kind==='tasks'?'task':kind==='findings'?'finding':kind==='reviews'?'review':kind==='vendors'?'vendor':kind==='risks'?'risk':kind==='exceptions'?'exception':'requirement'}_id`];
  if(kind==='framework_assessments')return `/compliance/${encodeURIComponent(record.framework_key)}?assessment=${encodeURIComponent(record.framework_assessment_id)}`;
  if(!ROUTES[kind]||!id)return null;
  const params=new URLSearchParams({[kind==='findings'?'finding_id':'id']:id,client_id:record.client_id});
  if(occurrence)params.set('occurrence',occurrence);
  return `/${ROUTES[kind]}?${params}`;
}

// Follow authoritative IDs through authorized GET routes. Never infer links from titles.
export async function loadDashboardItem(api,item,clientId,signal) {
  const records={};
  const read=async(kind,id)=>{
    const {data}=await api.get(`/${kind}/${encodeURIComponent(id)}`,{signal});
    if(data.client_id!==clientId)throw new Error('Record belongs to another client.');
    (records[kind]||=[]).push(data);return data;
  };
  const record=await read(item.kind,item.id);
  let finding=null;
  if(item.kind==='tasks'&&record.finding_id){try{finding=await read('findings',record.finding_id);}catch(e){if(signal?.aborted)throw e;}}
  const basis=finding||record;
  let source=actionOrigin(record,records,finding);
  if(item.kind!=='tasks'&&item.kind!=='findings') {
    const aid=record.framework_assessment_id;
    source=aid?{kind:'framework_assessments',id:aid}:record.policy_id&&item.kind!=='policies'?{kind:'policies',id:record.policy_id}
      :record.vendor_id&&item.kind!=='vendors'?{kind:'vendors',id:record.vendor_id}
      :record.risk_id&&item.kind!=='risks'?{kind:'risks',id:record.risk_id}:taskSource(record,records);
  }
  if(source.kind&&source.id){try{const target=await read(source.kind,source.id);
    source=item.kind==='tasks'||item.kind==='findings'?actionOrigin(record,records,finding):{...source,target};
  }catch(e){if(signal?.aborted)throw e;source={...source,target:null};}}
  const purpose=finding?.description||record.purpose||record.description||record.governance_context?.purpose||record.objective;
  const sourceHref=source.target?dashboardRecordHref(source.kind,source.target,{occurrence:basis.occurrence_id||record.occurrence_id}):null;
  return {...item,record,purpose,origin:source.target?.title||source.target?.name||record.source||(source.id||basis.source_type==='manual'?source.label:null)||null,
    sourceHref,sourceKind:source.kind,sourceId:source.id,
    recordHref:dashboardRecordHref(item.kind,record,{occurrence:item.kind==='reviews'?record.current_occurrence_id:undefined})};
}
