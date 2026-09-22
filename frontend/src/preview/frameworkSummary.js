import {FRAMEWORKS, ASSESSMENT_STATUSES} from '../lib/frameworks';
import rules from '../lib/grcRules.json';
import {frameworkScope} from './frameworks';

export function frameworkSummary(db, cid) {
  frameworkScope(db,cid);
  const programs=FRAMEWORKS.filter(f=>db.baselines?.[cid]?.completed && db.requirements.some(r=>r.client_id===cid && r.baseline_key===f.key && r.baseline_response==='applies'));
  const bounded=rows=>{if(rows.length>20000)throw new Error('Framework summary exceeds its supported size; no partial totals are shown.');return rows;};
  return {client_id:cid,items:programs.map(f=>{
    const item={key:f.key,tracking_available:f.implemented,total:null,status_counts:null,unrecognized_status_count:null,last_assessed:null,open_findings:null,open_actions:null};
    if(!f.implemented)return item;
    const rows=bounded((db.framework_assessments||[]).filter(a=>a.client_id===cid&&a.framework_key===f.key));
    const aids=new Set(rows.map(a=>a.framework_assessment_id)),definitions=new Set(rows.map(a=>a.definition_id));
    const direct=kind=>new Set(rows.flatMap(a=>(a.related_links||[]).filter(l=>l.kind===kind).map(l=>l.id)));
    const reviewLinks=direct('reviews'),findingLinks=direct('findings'),actionLinks=direct('tasks');
    const rids=new Set(bounded(db.reviews.filter(r=>r.client_id===cid&&(reviewLinks.has(r.review_id)||aids.has(r.framework_assessment_id)||r.framework_key===f.key&&r.framework_safeguards?.some(id=>definitions.has(id))))).map(r=>r.review_id));
    const findings=bounded(db.findings.filter(r=>r.client_id===cid&&(findingLinks.has(r.finding_id)||aids.has(r.framework_assessment_id)||rids.has(r.review_id))));
    const fids=new Set(findings.map(r=>r.finding_id));
    const actions=bounded(db.tasks.filter(r=>r.client_id===cid&&(actionLinks.has(r.task_id)||aids.has(r.framework_assessment_id)||rids.has(r.review_id)||fids.has(r.finding_id))));
    return {...item,total:rows.length,status_counts:Object.fromEntries(Object.keys(ASSESSMENT_STATUSES).map(s=>[s,rows.filter(a=>a.status===s).length])),
      unrecognized_status_count:rows.filter(a=>!ASSESSMENT_STATUSES[a.status]).length,
      last_assessed:rows.map(a=>a.last_assessed).filter(Boolean).sort().at(-1)||null,
      open_findings:findings.filter(r=>!rules.closed.findings.includes(r.status)).length,
      open_actions:actions.filter(r=>!rules.closed.tasks.includes(r.status)).length};
  })};
}
