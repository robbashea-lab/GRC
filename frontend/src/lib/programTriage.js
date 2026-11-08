import policy from '@catalogs/programTriage.json';
import cisCurrent from '@catalogs/guidedCisProgramV5.json';
import cisControl1 from '@catalogs/guidedControl1V5.json';
import socCurrent from '@catalogs/guidedSoc2.json';
import isoCurrent from '@catalogs/guidedIsoV2.json';
import {calendarDay} from './managementDates';
import {isOpen} from './grcWork';

// Internal application triage, not a customer risk rating or framework score.
export const normalizedPriority=value=>({critical:4,immediate:4,high:3,medium:2,moderate:2,low:1})[typeof value==='string'?value.toLowerCase():value]||null;
const tier=value=>Number.isInteger(value)&&value>=1&&value<=4?value:2;
const family=key=>/^cis-ig[123]$/.test(key||'')?'cis-ig1':key;
const closed=record=>!isOpen(record.kind,record);
const compareIds=(a,b)=>a.definition_id.localeCompare(b.definition_id,undefined,{numeric:true});
const supported={'cis-ig1':{...cisCurrent.definitions,...cisControl1.definitions},'soc-2':socCurrent.definitions,'iso-27001':isoCurrent.definitions};

function sourceFor(row,item){
  if(row.guided_assessment_source?.version===item.source_version)return row.guided_assessment_source;
  return [...(row.assessment_history||[])].reverse().find(snapshot=>snapshot.guided_assessment_source?.version===item.source_version&&snapshot.items_to_address?.some(saved=>saved.item_id===item.item_id&&saved.source_fingerprint===item.source_fingerprint))?.guided_assessment_source;
}

function gapPosition(row,item,mapping){
  const allRecords=row.work?.priority_records||[],records=allRecords.filter(record=>!closed(record));
  // An association with a broad criterion or Review is not proof of this gap.
  const finding=allRecords.find(record=>record.kind==='findings'&&record.id===item.finding_id&&record.assessment_item_id===item.item_id&&record.framework_assessment_id===row.framework_assessment_id&&record.client_id===row.client_id);
  const linked=finding?records.filter(record=>record===finding||record.kind==='risks'&&record.id===finding.risk_id&&record.client_id===row.client_id):[];
  const severities=linked.map(record=>normalizedPriority(record.kind==='risks'?record.risk_level:record.severity)).filter(Boolean);
  const question=mapping?.gaps?.[item.question_id];
  const value=sourceFor(row,item)?.answers?.[item.question_id];
  const rows=value&&typeof value==='object'&&!Array.isArray(value)?Object.entries(value).filter(([,answer])=>['No','Partially','None'].includes(answer)).map(([code])=>code):[];
  const defaults=rows.length?rows.map(code=>{
    const criterion=cisCurrent.definitions[row.definition_id]?.elements.find(element=>element.text===code)?.id;
    return question?.criteria?.[code]||question?.criteria?.[criterion]||(question?.criteria?null:question);
  }):[question?.criteria?null:question];
  const unmapped=defaults.some(entry=>!entry||!entry.rationale);
  const dates=[...linked,...records.filter(record=>record.kind==='tasks'&&finding&&record.finding_id===finding.id&&record.client_id===row.client_id)].map(record=>calendarDay(record.due_date)).filter(day=>day!==null);
  return {priority:severities.length?Math.max(...severities):Math.max(...defaults.map(entry=>tier(entry?.tier))),
    basis:severities.length?'linked_native_severity':'reviewed_default',deadline:dates.length?Math.min(...dates):Infinity,
    unmapped,gap_code:item.question_id,item_id:item.item_id};
}

function fallbackDeadline(row,bucket){
  const records=(row.work?.priority_records||[]).filter(record=>!closed(record)&&record.client_id===row.client_id&&(
    record.kind==='findings'&&(record.framework_assessment_id===row.framework_assessment_id||row.related_links?.some(link=>link.kind==='findings'&&link.id===record.id))||
    record.kind==='tasks'&&(row.work?.task_ids||row.work?.action_ids||[]).includes(record.id)||
    bucket===2&&record.kind==='reviews'&&(row.work?.review_ids||[]).includes(record.id)));
  const days=[...(bucket===2?[row.work?.next_review_due]:[]),...records.map(record=>record.due_date)].map(calendarDay).filter(day=>day!==null);
  return days.length?Math.min(...days):Infinity;
}

export function scopedProgramRows(rows=[],{frameworkKey,clientId}={}){
  const selectedFamily=family(frameworkKey||rows.find(row=>row.framework_key)?.framework_key||'cis-ig1');
  if(!['cis-ig1','soc-2','iso-27001'].includes(selectedFamily))return [];
  const selectedClient=clientId||rows.find(row=>row.client_id&&(!row.framework_key||family(row.framework_key)===selectedFamily))?.client_id;
  const unique=new Map();
  for(const row of rows){
    if(!row?.definition_id||!supported[selectedFamily]?.[row.definition_id]||row.in_active_scope===false||row.status==='not_applicable'||
       row.framework_key&&family(row.framework_key)!==selectedFamily||selectedClient&&row.client_id!==selectedClient||
       row.specification==='annex_control'&&(row.soa_applicability!=='included'||!row.soa_justification?.trim()))continue;
    if(!unique.has(row.definition_id))unique.set(row.definition_id,row);
  }
  return [...unique.values()];
}

export function rankProgramRows(rows=[],{frameworkKey,clientId,mapping=policy.frameworks,limit=5}={}){
  const scoped=scopedProgramRows(rows,{frameworkKey,clientId});
  const selectedFamily=family(frameworkKey||rows.find(row=>row.framework_key)?.framework_key||'cis-ig1');
  const ranked=[];
  for(const row of scoped){
    const definition=mapping?.[selectedFamily]?.[row.definition_id];
    const gaps=(row.items_to_address||[]).filter(item=>item.state==='open'&&item.kind==='gap'&&
      !(item.question_id==='gaps'&&item.source_version==='brawndo-cis-pilot-1')&&
      !(selectedFamily!=='cis-ig1'&&item.question_id==='gaps'&&sourceFor(row,item)?.answers?.additional_gap!=='Yes'));
    const positions=gaps.map(item=>gapPosition(row,item,definition)).sort((a,b)=>b.priority-a.priority||a.deadline-b.deadline||String(a.item_id).localeCompare(String(b.item_id)));
    let bucket;
    if(row.status==='not_assessed')bucket=0;
    else if(['needs_attention','in_progress'].includes(row.status)||row.status==='addressed'&&positions.length)bucket=1;
    else if(row.status==='addressed'&&(row.verification!=='verified'||row.work?.open_findings>0||row.work?.open_actions>0||row.work?.overdue_reviews>0||row.work?.next_review_due))bucket=2;
    else continue;
    const position=positions[0]||{priority:2,deadline:fallbackDeadline(row,bucket),unmapped:bucket===1,gap_code:'native_position',basis:'neutral_fallback'};
    const triage={...position,bucket,dependency:Number.isInteger(definition?.discovery?.dependency)?definition.discovery.dependency:100,
      importance:tier(definition?.discovery?.importance),discoveryUnmapped:!definition?.discovery?.rationale,
      statusOrder:{needs_attention:0,in_progress:1,addressed:2}[row.status]??0};
    ranked.push({...row,triage});
  }
  ranked.sort((a,b)=>a.triage.bucket-b.triage.bucket||
    (a.triage.bucket===0?a.triage.dependency-b.triage.dependency||b.triage.importance-a.triage.importance:
      b.triage.priority-a.triage.priority||a.triage.statusOrder-b.triage.statusOrder||a.triage.deadline-b.triage.deadline)||compareIds(a,b));
  return ranked.slice(0,limit);
}
