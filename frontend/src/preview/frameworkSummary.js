import {FRAMEWORKS, ASSESSMENT_STATUSES, activeDefinitions, frameworkDefinition} from '../lib/frameworks';
import {reviewedProgress,ongoingProgram} from '../lib/programProgress';
import {socConfiguration} from '../lib/socReadiness';
import rules from '../lib/grcRules.json';
import {frameworkScope} from './frameworks';

export function frameworkSummary(db, cid, params={}) {
  frameworkScope(db,cid);
  const programs=FRAMEWORKS.filter(f=>db.baselines?.[cid]?.completed && db.requirements.some(r=>r.client_id===cid && r.baseline_key===f.key && r.baseline_response==='applies'));
  const bounded=rows=>{if(rows.length>20000)throw new Error('Framework summary exceeds its supported size; no partial totals are shown.');return rows;};
  let detailRows;
  const items=programs.map(f=>{
    const item={key:f.key,tracking_available:f.implemented,total:null,status_counts:null,unrecognized_status_count:null,last_assessed:null,open_findings:null,open_actions:null};
    if(!f.implemented)return item;
    const active=new Set(activeDefinitions(f.key,socConfiguration(db.clients.find(c=>c.client_id===cid))).map(d=>d.id));
    const rows=bounded((db.framework_assessments||[]).filter(a=>a.client_id===cid&&a.framework_key===f.key&&active.has(a.definition_id)));
    const aids=new Set(rows.map(a=>a.framework_assessment_id)),definitions=new Set(rows.map(a=>a.definition_id));
    const direct=kind=>new Set(rows.flatMap(a=>(a.related_links||[]).filter(l=>l.kind===kind).map(l=>l.id)));
    const reviewLinks=direct('reviews'),findingLinks=direct('findings'),actionLinks=direct('tasks');
    const rids=new Set(bounded(db.reviews.filter(r=>r.client_id===cid&&(reviewLinks.has(r.review_id)||aids.has(r.framework_assessment_id)||r.framework_key===f.key&&r.framework_safeguards?.some(id=>definitions.has(id))))).map(r=>r.review_id));
    const health=ongoingProgram(db.reviews.filter(r=>r.client_id===cid&&rids.has(r.review_id)));
    if(params.program===f.key&&params.detail){
      if(params.detail==='all'||Object.hasOwn(ASSESSMENT_STATUSES,params.detail))detailRows=rows.filter(r=>params.detail==='all'||r.status===params.detail).sort((a,b)=>a.definition_id.localeCompare(b.definition_id)).map(r=>({id:r.framework_assessment_id,definition_id:r.definition_id,title:frameworkDefinition(f.key,r.definition_id)?.title||r.definition_id,status:r.status,kind:'framework_assessments'}));
      else if(Object.hasOwn(health.groups,params.detail))detailRows=health.groups[params.detail];
      else throw new Error('Unknown program detail');
    }
    const findings=bounded(db.findings.filter(r=>r.client_id===cid&&(findingLinks.has(r.finding_id)||aids.has(r.framework_assessment_id)||rids.has(r.review_id))));
    const fids=new Set(findings.map(r=>r.finding_id));
    const actions=bounded(db.tasks.filter(r=>r.client_id===cid&&(actionLinks.has(r.task_id)||aids.has(r.framework_assessment_id)||rids.has(r.review_id)||fids.has(r.finding_id))));
    return {...item,assessment_progress:reviewedProgress(rows,f.key),ongoing:health.summary,total:rows.length,status_counts:Object.fromEntries(Object.keys(ASSESSMENT_STATUSES).map(s=>[s,rows.filter(a=>a.status===s).length])),
      unrecognized_status_count:rows.filter(a=>!ASSESSMENT_STATUSES[a.status]).length,
      last_assessed:rows.map(a=>a.last_assessed).filter(Boolean).sort().at(-1)||null,
      open_findings:findings.filter(r=>!rules.closed.findings.includes(r.status)).length,
      open_actions:actions.filter(r=>!rules.closed.tasks.includes(r.status)).length};
  });
  if(params.detail){
    if(!detailRows)throw new Error('Applicable program not found');
    const offset=Number(params.offset||0),limit=Number(params.limit||25);
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid pagination');
    return {client_id:cid,items:detailRows.slice(offset,offset+limit),total:detailRows.length,offset};
  }
  return {client_id:cid,items};
}
