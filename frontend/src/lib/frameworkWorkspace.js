import {isStale,lacksEvidence,gapUntracked} from './cisVerification';
import {assessmentProgress} from './frameworkOperator';

// Native hierarchy adapters; catalog order remains authoritative (never lexical ID sorting).
const HIERARCHY = {
  'cis-ig1': d => [{id:String(d.control),label:`Control ${d.control} — ${d.control_name}`}],
  'nist-csf-2': d => [{id:d.function,label:d.function_name},{id:d.category,label:`${d.category} — ${d.control_name}`}],
  hipaa: d => [{id:d.control,label:d.control_name}],
  'iso-27001': d => [{id:d.specification,label:d.specification==='annex_control'?'Annex A / Statement of Applicability':'ISMS requirements'},{id:d.control,label:d.control_name}],
  'soc-2': d => [{id:d.category,label:d.category==='security'?'Security / Common Criteria':d.category?.replace(/^./,s=>s.toUpperCase())},{id:d.control,label:`${d.control} — ${d.control_name}`}],
};
export const hierarchyPath=(key,row)=>(HIERARCHY[key]|| (d=>[{id:d.control||'requirements',label:d.control_name||'Requirements'}]))(row);
export function visibleSections(nodes,expanded,depth=0){
  return nodes.flatMap(node=>[{...node,depth},...(expanded.includes(node.key)?visibleSections(node.children,expanded,depth+1):[])]);
}
export function groupRequirements(key,rows){
  const roots=[];
  for(const row of rows){let children=roots;for(const [index,part] of hierarchyPath(key,row).entries()){
    let node=children.find(n=>n.id===part.id);
    if(!node){node={...part,key:hierarchyPath(key,row).slice(0,index+1).map(p=>p.id).join('/'),rows:[],children:[]};children.push(node);}
    node.rows.push(row);children=node.children;
  }}
  return roots;
}
export const incomplete=r=>!['addressed','not_applicable'].includes(r.status);
export const needsAttention=r=>incomplete(r)||(r.work?.overdue_reviews||0)>0||(r.work?.open_findings||0)>0||(r.work?.overdue_actions||0)>0;
export const nextAssessment=(rows,lastId)=>rows.find(r=>r.framework_assessment_id===lastId&&incomplete(r))||rows.find(incomplete)||rows.find(needsAttention)||null;
// Derived operational views (reference workspace). They never alter assessment conclusions.
const VIEWS={
  attention:needsAttention,assessed:r=>r.status!=='not_assessed',gaps:r=>['in_progress','needs_attention'].includes(r.status),
  stale:r=>isStale(r),unevidenced:lacksEvidence,
  unremediated:gapUntracked,
  overdue_actions:r=>(r.work?.overdue_actions||0)>0,
};
export function matchesAssessment(row,filter,search=''){
  const status=filter==='all'||(VIEWS[filter]?VIEWS[filter](row):row.status===filter);
  return status&&`${row.definition_id} ${row.title} ${row.control_name} ${row.function_name||''}`.toLowerCase().includes(search.trim().toLowerCase());
}
export function sectionSummary(rows){
  return {...assessmentProgress(rows),attention:rows.filter(needsAttention).length,
    reviews:new Set(rows.flatMap(r=>r.work?.review_ids||[])).size,
    findings:new Set(rows.flatMap(r=>r.work?.finding_ids||[])).size};
}
export function sourcePresentation(definition){
  const explicit=['OFFICIAL_TEXT','LICENSED_TEXT'].includes(definition.official_text_mode)&&definition.official_text;
  const mode=explicit?definition.official_text_mode:definition.source_type==='regulatory_text'?'OFFICIAL_TEXT':'REFERENCE_ONLY';
  let url=null;try{const u=new URL(definition.source_url||definition.source);if(u.protocol==='https:')url=u.href;}catch{}
  return {mode,url,text:explicit?definition.official_text:mode==='OFFICIAL_TEXT'?definition.guidance:null,citation:definition.source_citation||definition.id};
}
export function recurrencePresentation(definition,catalog){
  const plans=(catalog.review_plans||[]).filter(p=>p.safeguards.includes(definition.id));
  // A grouped plan's interval must not be attributed to all of its requirements.
  const explicit=plans.flatMap(p=>p.cadence_references||[]).filter(r=>r.definition_id===definition.id);
  const organizationDefined=definition.cadence_basis==='REQUIRED_ORG_DEFINED'||(definition.type==='recurring'&&['regulatory_text','standard_reference'].includes(definition.source_type));
  return {plans,basis:explicit.length?'REQUIRED_EXPLICIT':organizationDefined?'REQUIRED_ORG_DEFINED':plans.length?'RECOMMENDED':'NONE',explicit};
}

// Used by the Demo read model. Backend builds the same small operational projection.
export function assessmentWork(row,{reviews=[],findings=[],tasks=[],evidence=[]},today=new Date().toISOString().slice(0,10)){
  const linked=(kind,id)=>(row.related_links||[]).some(l=>l.kind===kind&&l.id===id);
  const rs=reviews.filter(r=>r.client_id===row.client_id&&(linked('reviews',r.review_id)||(r.framework_key===row.framework_key&&r.framework_safeguards?.includes(row.definition_id))));
  const rids=new Set(rs.map(r=>r.review_id));
  const fs=findings.filter(f=>f.client_id===row.client_id&&!['closed','accepted'].includes(f.status)&&(linked('findings',f.finding_id)||f.framework_assessment_id===row.framework_assessment_id||rids.has(f.review_id)));
  const fids=new Set(fs.map(f=>f.finding_id));
  const overdue=(r,closed)=>!closed.includes(r.status)&&!!r.due_date&&r.due_date.slice(0,10)<today;
  const ts=tasks.filter(t=>t.client_id===row.client_id&&(linked('tasks',t.task_id)||t.framework_assessment_id===row.framework_assessment_id||rids.has(t.review_id)||fids.has(t.finding_id)));
  // Evidence directly supporting this assessment (uploaded to it or linked); dates only, never content.
  const es=evidence.filter(e=>e.client_id===row.client_id&&(linked('evidence',e.evidence_id)||(['framework_assessment','framework_assessments'].includes(e.linked_type)&&e.linked_id===row.framework_assessment_id)));
  const dates=es.map(e=>(e.evidence_date||e.created_at||'').slice(0,10)).filter(Boolean).sort();
  const direct=fs.filter(f=>linked('findings',f.finding_id)||f.framework_assessment_id===row.framework_assessment_id);
  return {review_ids:[...rids],finding_ids:[...fids],open_findings:fs.length,direct_findings:direct.length,overdue_reviews:rs.filter(r=>overdue(r,['completed','cancelled'])).length,
    overdue_actions:ts.filter(t=>overdue(t,['done','cancelled'])).length,open_actions:ts.filter(t=>!['done','cancelled'].includes(t.status)).length,
    evidence_count:es.length,latest_evidence_at:dates.at(-1)||null};
}
