// Read-only Demo projections. Same obligation selection as the client Dashboard.
import {list,now} from './store';
import {aggregateClientDashboard,DASHBOARD_KINDS} from '../lib/clientDashboard';
import {managementMetrics,managementProgramStatus,portfolioItem} from '../lib/managementMetrics';
import rules from '../lib/managementRules.json';
import {managementDay} from '../lib/managementDates';
import {representedFinding} from '../lib/grcWork';
import {clientProjection} from './clientRelationships';

const sources=(db,cid)=>Object.fromEntries(DASHBOARD_KINDS.map(k=>[k,list(db,k,cid)]));
const model=(db,cid,today,scope={kind:'org'})=>{
  const aggregation=aggregateClientDashboard(sources(db,cid),{clientId:cid,members:db.users,user:db.user,today,scope});
  return {...managementMetrics(aggregation,{members:db.users,today}),activeRecords:aggregation.activeRecords};
};
const emptyMetrics=()=>Object.fromEntries(rules.metrics.map(k=>[k,[]]));

export function portfolio(db,includeArchived,today=new Date()) {
  const day=managementDay(today), allMetrics=emptyMetrics(), attention=[];
  const rows=db.clients.filter(c=>includeArchived||c.status!=='archived').map(c=>{
    const m=model(db,c.client_id,today), active=!['archived','inactive'].includes(c.status);
    const metric_items=Object.fromEntries(rules.metrics.map(k=>[k,m.metrics[k].map(r=>portfolioItem(r,c,today))]));
    if(active) {
      for(const k of rules.metrics) allMetrics[k].push(...metric_items[k]);
      const issues=m.metrics.critical_high_open.filter(r=>r.kind!=='findings'||!representedFinding(r.record,m.activeRecords.tasks));
      const current=[...m.work.filter(r=>r.day!==null&&r.day<=day+30||r.unassigned||r.status==='remediated'||r.kind==='reviews'&&r.day===null),...issues,...m.metrics.unassigned,...m.risks.filter(r=>r.status!=='accepted'&&!r.severity)];
      attention.push(...new Map(current.map(r=>[r.kind+':'+r.id,portfolioItem(r,c,today)])).values());
    }
    const major=m.work.filter(r=>r.kind==='reviews'&&r.day>=day&&['risk','risk_assessment','vendor','policy','access','penetration_test','bcp_dr','incident_response','awareness'].includes(r.record.review_type)).sort((a,b)=>a.day-b.day)[0];
    const activity=db.logs.find(l=>l.client_id===c.client_id);
    return {...clientProjection(db,c),client_status:c.status,program_status:managementProgramStatus(c,m),...m.counts,metric_items,
      next_major_item:major?{...portfolioItem(major,c,today),review_id:major.id,review_type:major.record.review_type}:null,
      open_actions:m.counts.past_due+m.counts.due_30d,open_findings:m.activeRecords.findings.length,
      significant_risks:m.significantRisks.length,critical_high_findings:m.materialFindings.length,
      overdue_reviews:m.metrics.past_due.filter(r=>r.kind==='reviews').length,upcoming_reviews:m.metrics.due_30d.filter(r=>r.kind==='reviews').length,
      last_activity:activity?{...activity,actor:activity.user_name}:null};
  });
  const active=rows.filter(c=>!['archived','inactive'].includes(c.client_status));
  const action_required=active.filter(c=>c.program_status==='action_required').length, needs_attention=active.filter(c=>c.program_status==='needs_attention').length;
  const rank=r=>r.priority==='critical'?(r.overdue?0:1):r.priority==='high'&&r.overdue?2:r.overdue?3:r.priority==='high'?4:5;
  const order=['action_required','needs_attention','onboarding','healthy','inactive','archived'];
  rows.sort((a,b)=>order.indexOf(a.program_status)-order.indexOf(b.program_status)||a.name.localeCompare(b.name));
  return {clients:rows,portfolio:{...Object.fromEntries(rules.metrics.map(k=>[k,allMetrics[k].length])),total_clients:rows.length,
    action_required,needs_attention,clients_requiring_attention:action_required+needs_attention,generated_at:now(),as_of:new Date(day*86400000).toISOString().slice(0,10)},
    metric_items:allMetrics,attention_queue:attention.sort((a,b)=>rank(a)-rank(b)||(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.key.localeCompare(b.key)).slice(0,15),team_workload:[]};
}

export function dashboard(db,params) {
  const today=new Date(), scope={kind:params.scope||'org',user_id:params.user_id};
  const m=model(db,params.client_id,today,scope);
  return {
    kpis:{...m.counts,overdue_reviews:m.metrics.past_due.filter(r=>r.kind==='reviews').length,
      overdue_actions:m.metrics.past_due.filter(r=>r.kind==='tasks').length,open_findings:m.activeRecords.findings.length,
      critical_findings:m.materialFindings.length,critical_high_findings:m.materialFindings.length,significant_risks:m.significantRisks.length,
      due_next_30:m.counts.due_30d},
    management:{as_of:m.as_of,counts:m.counts,records:sources(db,params.client_id)},
    scope:scope.kind,scope_label:scope.kind==='mine'?'Your assigned work':scope.kind==='unassigned'?'Unassigned records':null,
    needs_attention:[],priority_findings:[],your_actions:[],watch_items:[],program_status:[],
    recent_activity:db.logs.filter(l=>l.client_id===params.client_id).slice(0,10)
  };
}
