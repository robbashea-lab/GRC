// Read-only Demo projections. Same obligation selection as the client Dashboard.
import {list,now} from './store';
import {aggregateClientDashboard,DASHBOARD_KINDS} from '../lib/clientDashboard';
import {managementMetrics,managementProgramStatus,portfolioItem} from '../lib/managementMetrics';
import rules from '../lib/managementRules.json';
import {managementDay} from '../lib/managementDates';
import {representedFinding} from '../lib/grcWork';
import {clientProjection} from './clientRelationships';
import {portfolioPopulations,portfolioFrameworks,portfolioOrder,latestPortfolioActivity} from '../lib/portfolioOverview';
import {evidenceAccess} from './evidence';
import {dashboardPosture} from '../lib/dashboardPosture';
import {COMPLIANCE_SECTIONS} from '../lib/complianceNavigation';

const sources=(db,cid)=>Object.fromEntries(DASHBOARD_KINDS.map(k=>[k,list(db,k,cid)]));
const model=(db,cid,today,scope={kind:'org'})=>{
  const aggregation=aggregateClientDashboard(sources(db,cid),{clientId:cid,members:db.users,user:db.user,today,scope});
  return {...managementMetrics(aggregation,{members:db.users,today}),activeRecords:aggregation.activeRecords};
};
const emptyMetrics=()=>Object.fromEntries(rules.metrics.map(k=>[k,[]]));

export function portfolio(db,includeArchived,today=new Date()) {
  if(!['super_admin','platform_admin'].includes(db.user.role))throw new Error('Client directory is restricted to internal admins');
  const day=managementDay(today), allMetrics=emptyMetrics(), attention=[];
  const latest=latestPortfolioActivity(db.logs,today);
  const rows=db.clients.filter(c=>evidenceAccess(db.user,c.client_id)&&(includeArchived||c.status!=='archived')).map(c=>{
    const m=model(db,c.client_id,today), active=!['archived','inactive'].includes(c.status);
    const metric_items=Object.fromEntries(rules.metrics.map(k=>[k,m.metrics[k].map(r=>portfolioItem(r,c,today))]));
    const extra=portfolioPopulations(m);
    for(const [key,values] of Object.entries(extra))metric_items[key]=values.map(r=>portfolioItem(r,c,today));
    if(active) {
      for(const k of rules.metrics) allMetrics[k].push(...metric_items[k]);
      const issues=m.metrics.critical_high_open.filter(r=>r.kind!=='findings'||!representedFinding(r.record,m.activeRecords.tasks));
      const current=[...m.work.filter(r=>r.day!==null&&r.day<=day+30||r.unassigned||r.status==='remediated'||r.kind==='reviews'&&r.day===null),...issues,...m.metrics.unassigned,...m.risks.filter(r=>r.status!=='accepted'&&!r.severity)];
      attention.push(...new Map(current.map(r=>[r.kind+':'+r.id,portfolioItem(r,c,today)])).values());
    }
    const major=m.work.filter(r=>r.kind==='reviews'&&r.day>=day&&['risk','risk_assessment','vendor','policy','access','penetration_test','bcp_dr','incident_response','awareness'].includes(r.record.review_type)).sort((a,b)=>a.day-b.day)[0];
    return {...clientProjection(db,c),client_status:c.status,program_status:managementProgramStatus(c,m),...m.counts,metric_items,
      critical_high_issues:extra.critical_high_issues.length,frameworks:portfolioFrameworks(c.client_id,db.baselines?.[c.client_id],list(db,'requirements',c.client_id)),
      next_major_item:major?{...portfolioItem(major,c,today),review_id:major.id,review_type:major.record.review_type}:null,
      open_actions:m.counts.past_due+m.counts.due_30d,open_findings:m.activeRecords.findings.length,
      significant_risks:m.significantRisks.length,critical_high_findings:m.materialFindings.length,
      overdue_reviews:m.metrics.past_due.filter(r=>r.kind==='reviews').length,upcoming_reviews:m.metrics.due_30d.filter(r=>r.kind==='reviews').length,
      last_activity:latest.get(c.client_id)||null};
  });
  const active=rows.filter(c=>!['archived','inactive'].includes(c.client_status));
  const action_required=active.filter(c=>c.program_status==='action_required').length, needs_attention=active.filter(c=>c.program_status==='needs_attention').length;
  const rank=r=>r.priority==='critical'?(r.overdue?0:1):r.priority==='high'&&r.overdue?2:r.overdue?3:r.priority==='high'?4:5;
  rows.sort(portfolioOrder);
  return {clients:rows,portfolio:{...Object.fromEntries(rules.metrics.map(k=>[k,allMetrics[k].length])),total_clients:rows.length,
    action_required,needs_attention,clients_requiring_attention:action_required+needs_attention,generated_at:now(),as_of:new Date(day*86400000).toISOString().slice(0,10)},
    metric_items:allMetrics,attention_queue:attention.sort((a,b)=>rank(a)-rank(b)||(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.key.localeCompare(b.key)).slice(0,15),team_workload:[]};
}

export function dashboard(db,params) {
  const today=new Date(), scope={kind:params.scope||'org',user_id:params.user_id};
  const records=sources(db,params.client_id);
  const aggregation=aggregateClientDashboard(records,{clientId:params.client_id,members:db.users,user:db.user,today,scope});
  const full=dashboardPosture(aggregation,{members:db.users,today}),m=full.management;
  m.activeRecords=aggregation.activeRecords;
  const groups=Object.fromEntries(['pastDue','due30','due3190','materialFindings','significantRisks','priority'].map(key=>[key,full[key]]));
  const buckets=full.buckets.map(group=>({...group,key:group.key==='due30'?'otherDue30':group.key}));
  const riskLevels=full.riskLevels.map(group=>({...group,key:'risk-'+group.key}));
  for(const group of [...buckets,...riskLevels,...full.vendorHealth])groups[group.key]=group.items;
  for(const [key,rows] of Object.entries(groups))if(key!=='priority')groups[key]=[...rows].sort((a,b)=>(a.day??Infinity)-(b.day??Infinity)||a.key.localeCompare(b.key));
  const brief=row=>({...Object.fromEntries(['key','id','kind','event','type','due_date','owner_id','unassigned','status','severity','priority_label','action'].map(key=>[key,row[key]])),
    title:String(row.title||'').slice(0,240),owner:String(row.owner||'Assigned user').slice(0,200),record:{client_id:row.record.client_id,[rules.kinds[row.kind]]:row.id}});
  if(params.detail) {
    const offset=Number(params.offset||0),limit=Number(params.limit||25),rows=groups[params.detail];
    if(!rows||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid dashboard detail page');
    return {client_id:params.client_id,as_of:m.as_of,items:rows.slice(offset,offset+limit).map(brief),total:rows.length,offset,limit,has_more:offset+limit<rows.length};
  }
  const totals=Object.fromEntries(Object.entries(groups).map(([key,rows])=>[key,rows.length]));
  const distribution=values=>values.map(group=>({...group,total:group.items.length,items:groups[group.key].slice(0,25).map(brief)}));
  const posture={...Object.fromEntries(Object.entries(groups).map(([key,rows])=>[key,rows.slice(0,25).map(brief)])),totals,preview_limit:25,
    buckets:distribution(buckets),riskLevels:distribution(riskLevels),vendorHealth:distribution(full.vendorHealth)};
  return {
    contract_version:2,client_id:params.client_id,posture,
    applicable_requirements:COMPLIANCE_SECTIONS.filter(section=>records.requirements.some(r=>r.baseline_key===section.key&&r.baseline_response==='applies'))
      .map(section=>({client_id:params.client_id,baseline_key:section.key,baseline_response:'applies'})),
    kpis:{...m.counts,overdue_reviews:m.metrics.past_due.filter(r=>r.kind==='reviews').length,
      overdue_actions:m.metrics.past_due.filter(r=>r.kind==='tasks').length,open_findings:m.activeRecords.findings.length,
      critical_findings:m.materialFindings.length,critical_high_findings:m.materialFindings.length,significant_risks:m.significantRisks.length,
      due_next_30:m.counts.due_30d},
    management:{as_of:m.as_of,counts:m.counts,preview_limit:25,metric_items:Object.fromEntries(Object.entries(m.metrics).map(([key,rows])=>[key,rows.slice(0,25).map(brief)]))},
    scope:scope.kind,scope_label:scope.kind==='mine'?'Your assigned work':scope.kind==='unassigned'?'Unassigned records':null,
    needs_attention:[],priority_findings:[],your_actions:[],watch_items:[],program_status:[],
    recent_activity:db.logs.filter(l=>l.client_id===params.client_id).slice(0,10)
  };
}
