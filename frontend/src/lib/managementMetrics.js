import rules from './managementRules.json';
import {calendarDay,managementDay} from './managementDates';
import {assessedRisk,representedFinding} from './grcWork';

export const managementOwners=(r,kind)=>(rules.owners[kind]||['owner_id']).map(k=>r[k]).filter(Boolean);
const severity=value=>value==='immediate'?'critical':value;
const high=r=>['critical','high'].includes(r.severity);
const distinct=items=>[...new Map(items.map(r=>[`${r.kind}:${r.id}`,r])).values()];

// The arrays are the contract: headline counts and full drill-downs use these
// exact populations, before any attention-queue cap or presentation filtering.
export function managementMetrics(aggregation,{members=[],today=new Date()}={}) {
  const active=aggregation.activeRecords, day=managementDay(today);
  const names=new Map(members.map(u=>[u.user_id,u.name||u.email]));
  const recordRow=(record,kind,type,level)=>{
    const id=record[rules.kinds[kind]], owners=managementOwners(record,kind);
    const due=record.due_date||record.next_review||null;
    return {key:`${kind}:${id}:record`,id,kind,record,event:'record',type,title:record.title||record.name||type,
      owner_id:owners[0]||null,owner:names.get(owners[0])||(owners.length?'Assigned user':'Unassigned'),unassigned:!owners.length,
      due_date:calendarDay(due)===null?null:due,day:calendarDay(due),status:record.status,severity:severity(level),action:kind==='risks'?'View Risk':kind==='tasks'?'Open Action':'View Finding'};
  };
  const work=aggregation.obligations.filter(r=>r.event!=='next'
    && !(r.kind==='findings'&&representedFinding(r.record,active.tasks))
    && !(r.kind==='risks'&&r.event==='acceptance'&&aggregation.obligations.some(e=>e.kind==='exceptions'&&e.record.risk_id===r.id&&e.day===r.day)))
    .map(r=>({...r,owner_id:managementOwners(r.record,r.kind)[0]||null,severity:severity(r.severity)}));
  const materialFindings=active.findings.map(r=>recordRow(r,'findings','Finding',r.severity)).filter(high);
  const risks=active.risks.map(r=>recordRow(r,'risks','Risk',assessedRisk(r).risk_level));
  const significantRisks=risks.filter(high);
  const critical_high_open=[...materialFindings,...significantRisks,...active.tasks.filter(r=>!r.finding_id).map(r=>recordRow(r,'tasks','Action Item',r.priority)).filter(high)];
  const metrics={
    past_due:work.filter(r=>r.day!==null&&r.day<day),
    due_30d:work.filter(r=>r.day!==null&&r.day>=day&&r.day<=day+30),
    due_31_90d:work.filter(r=>r.day!==null&&r.day>=day+31&&r.day<=day+90),
    critical_high_open,
    unassigned:distinct([...work,...risks].filter(r=>r.unassigned)),
  };
  return {metrics,counts:Object.fromEntries(rules.metrics.map(k=>[k,metrics[k].length])),work,materialFindings,significantRisks,risks,as_of:new Date(day*86400000).toISOString().slice(0,10)};
}

export function managementProgramStatus(client,model) {
  if(['archived','inactive','onboarding'].includes(client.status)) return client.status;
  const c=model.counts;
  if(model.metrics.past_due.some(r=>r.severity==='critical')||c.past_due>=3||c.critical_high_open>=3) return 'action_required';
  const setup=model.work.some(r=>r.status==='remediated'||r.kind==='reviews'&&r.day===null)
    ||model.risks.some(r=>r.status!=='accepted'&&!r.severity);
  return c.past_due||c.due_30d||c.critical_high_open||c.unassigned||setup?'needs_attention':'healthy';
}

export function portfolioItem(item,client,today=new Date()) {
  const overdue=item.day!==null&&item.day<managementDay(today);
  return {key:item.key,entity_type:item.kind==='policies'?'policy':item.kind.slice(0,-1),entity_id:item.id,id:item.id,client_id:client.client_id,client_name:client.name,
    title:item.title,type:item.type,event:item.event,owner_id:item.owner_id,owner_name:item.unassigned?null:item.owner,
    due_date:item.due_date,status:item.status,severity:item.severity,overdue,
    priority:high(item)?item.severity:overdue?'overdue':'due_soon'};
}
