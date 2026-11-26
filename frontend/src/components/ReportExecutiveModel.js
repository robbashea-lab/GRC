import {snapshotTime} from '../lib/portfolioProgress';

const dayString=value=>String(value || '').slice(0,10);
export const summaries=[
  ['work','Work completed this period','Recorded client activity in the selected period.'],
  ['attention','Needs your attention','Decisions and overdue items for leadership.'],
  ['upcoming','Coming up in the next 90 days','Upcoming work on the client dashboard.'],
  ['readiness','Readiness by area','Progress against each framework area.'],
  ['trend','Progress over time','Requires saved assessment history.'],
  ['risks','Top risks','Highest-rated open risks.'],
  ['support','How iVenture supports this program','Engagement type and managed services in place.']
];
export function startFor(end,period='90') {
  const day=new Date(end+'T12:00:00Z');
  if(period==='q') day.setUTCMonth(Math.floor(day.getUTCMonth()/3)*3-3,1);
  else if(period==='ytd') day.setUTCMonth(0,1);
  else if(period==='12') day.setUTCFullYear(day.getUTCFullYear()-1);
  else day.setUTCDate(day.getUTCDate()-89);
  return day.toISOString().slice(0,10);
}
export function endFor(today,period) {
  if(period!=='q')return today;
  const date=new Date(today+'T12:00:00Z');date.setUTCMonth(Math.floor(date.getUTCMonth()/3)*3,0);return date.toISOString().slice(0,10);
}

export function executiveModel({materials,client,framework,actor,today,from,through,recipient,note,sections,context,positionsHistory=[]}) {
  const exec=materials.reports.executive,assessment=materials.reports.assessment;
  const positions=exec.sections.find(item=>item.title==='Position')?.rows || [];
  const risks=exec.sections.find(item=>item.title==='Significant risks')?.rows || [];
  const work=exec.sections.find(item=>item.title==='Overdue work')?.rows || [];
  const readinessRows=assessment.sections.find(item=>item.title==='Results by domain')?.rows || [];
  const logs=(context?.recent_activity || []).filter(item=>{const date=dayString(item.created_at || item.timestamp || item.at);return date>=from&&date<=through;});
  const next=new Date(today+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+90);
  const upcoming=(context?.upcoming_reviews || []).filter(item=>{const due=dayString(item.due_date || item.date);return due>=today&&due<=next.toISOString().slice(0,10);});
  const trend=positionsHistory.map(item=>({date:new Date(snapshotTime(item)),impl:item.implemented ?? item.implementation_position?.implemented,denominator:item.denominator ?? item.implementation_position?.denominator})).filter(item=>Number.isFinite(item.date.valueOf())&&Number.isInteger(item.impl)&&Number.isInteger(item.denominator)&&item.denominator>0&&item.date.toISOString().slice(0,10)>=from&&item.date.toISOString().slice(0,10)<=through).sort((a,b)=>a.date-b.date);
  const trendValid=trend.length>1&&trend.every(point=>point.denominator===trend[0].denominator);
  const support=[client?.engagement_type,client?.service_description].filter(value=>typeof value==='string'&&value.trim());
  const available={work:Array.isArray(context?.recent_activity),attention:true,upcoming:Array.isArray(context?.upcoming_reviews),readiness:true,trend:trendValid,risks:true,support:support.length>0};
  const enabled=Object.fromEntries(summaries.map(([key])=>[key,sections[key]&&available[key]]));
  const model={clientName:exec.header.client.name,framework:framework.name,period:from+' – '+through,generated:today,preparedBy:exec.header.prepared_by?.name||actor,preparedFor:recipient,
    note,headline:positions[0]?.[0] || 'Saved program position',status:'Program snapshot',tone:'neutral',sections:enabled,asOf:exec.header.as_of,
    kpis:exec.stats.slice(0,4).map(stat=>[String(stat.value??'—'),stat.label,stat.detail||'']),metrics:[[String(logs.length),'Recorded activity entries']],highlights:logs.map(row=>row.summary || row.action || row.event).filter(Boolean).slice(0,4),
    attention:work.map(row=>row.filter(value=>value!=null).join(' · ')),upcoming:upcoming.map(row=>[row.title,dayString(row.due_date||row.date)].filter(Boolean).join(' · ')),
    readiness:readinessRows.map(([name,done,total])=>[name,[Number(done)||0,Number(total)||0]]),trend,count:trend[0]?.denominator||0,risks:risks.map(row=>['',row[0],String(row[1]??''),'',row[3]||'','']),support};
  return {model,available,enabled};
}
