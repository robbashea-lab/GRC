import {AlertTriangle,Clock3,UserX,CheckCircle2} from 'lucide-react';
import {useAuth} from '@/context/AuthContext';
import {isBrawndoReference} from '@/lib/reference';
import StatusBadge from './StatusBadge';
import {assessedRisk} from '@/lib/grcWork';
import {actionStatus} from '@/lib/actionItems';
import {reviewDisplayValue} from '@/lib/reviewPresentation';
import './RecordSummary.css';

// Read-first record identity for the reference workspace: what this is, its state,
// who owns it, when it is due and what needs to happen. Editing stays below.
const DAY=86400000;
const day=v=>v?String(v).slice(0,10):null;
const until=(v,today)=>{const d=day(v);if(!d)return null;return Math.round((Date.parse(d+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/DAY);};
const closedStatus=s=>['completed','cancelled','closed','done','accepted','retired','terminated','inactive','validated'].includes(s);
function dueText(v,today,closed){
  const n=until(v,today);if(n==null)return {text:'Not scheduled',tone:'muted'};
  const date=new Date(day(v)+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  if(closed)return {text:date,tone:''};
  return n<0?{text:`${date} · ${-n}d overdue`,tone:'critical'}:n<=30?{text:`${date} · in ${n}d`,tone:'moderate'}:{text:date,tone:''};
}

export function summarize(kind,r,{related={},users=[],today=new Date().toISOString().slice(0,10)}={}){
  const who=id=>id?(users.find(u=>u.user_id===id)?.name||'Assigned user'):null;
  const closed=closedStatus(r.status);
  const facts=[],attention=[];
  const owner=(label,id)=>{facts.push({label,value:who(id)||'Unassigned',tone:id?'':'moderate'});if(!id&&!closed)attention.push({tone:'moderate',Icon:UserX,text:'No accountable owner assigned'});};
  const due=(label,v,late)=>{const d=dueText(v,today,closed);facts.push({label,value:d.text,tone:d.tone});if(d.tone==='critical')attention.push({tone:'critical',Icon:Clock3,text:late});};
  const open=(rows=[],done=['done','cancelled','closed','accepted'])=>rows.filter(x=>!done.includes(x.status));
  if(kind==='reviews'){
    facts.push({label:'Status',badge:r.status});owner('Owner',r.owner_id);due('Due',r.due_date,'Review is overdue');
    facts.push({label:'Cadence',value:reviewDisplayValue('recurrence',r.recurrence)||'One-time'});
    if(r.framework_key)facts.push({label:'Program',value:`${r.framework_key==='cis-ig1'?'CIS IG1':r.framework_key.toUpperCase()}${r.framework_safeguards?.length?` · ${r.framework_safeguards.join(', ')}`:''}`});
    const last=(r.occurrences||[]).map(o=>day(o.completed_at)).filter(Boolean).sort().at(-1);facts.push({label:'Last completed',value:last||'No completed occurrence'});
    const f=open(related.findings);if(f.length)attention.push({tone:'moderate',Icon:AlertTriangle,text:`${f.length} open Finding${f.length===1?'':'s'} from this Review`});
  }else if(kind==='findings'){
    facts.push({label:'Severity',badge:r.severity},{label:'Status',badge:r.status});owner('Owner',r.owner_id);due('Target date',r.due_date,'Finding target date has passed');
    if(r.source)facts.push({label:'Origin',value:r.source,wide:true});
    const t=related.tasks||[],active=open(t);
    facts.push({label:'Remediation',wide:true,value:t.length?t.map(x=>`${x.title} — ${actionStatus(x.status)}${x.assignee_id?` · ${who(x.assignee_id)}`:''}${x.due_date?` · due ${day(x.due_date)}`:''}`).join('\n'):'No Action Item'});
    if(!closed&&!t.length)attention.push({tone:'critical',Icon:AlertTriangle,text:'No Action Item tracks remediation of this Finding'});
    if(active.some(x=>until(x.due_date,today)<0))attention.push({tone:'critical',Icon:Clock3,text:'Remediation Action is overdue'});
    if(r.status==='remediated')attention.push({tone:'moderate',Icon:CheckCircle2,text:'Remediation complete — validate and close the Finding'});
  }else if(kind==='tasks'){
    facts.push({label:'Priority',badge:r.priority},{label:'Status',value:actionStatus(r.status)});owner('Assignee',r.assignee_id||r.owner_id);due('Due',r.due_date,'Action is overdue');
    const src=(related.findings||[])[0];if(src)facts.push({label:'Remediates',value:src.title,wide:true});
  }else if(kind==='risks'){
    const a=assessedRisk(r);facts.push({label:'Level',badge:a.risk_level||'not assessed'},{label:'Score',value:a.risk_score??'—'},{label:'Status',badge:r.status});
    owner('Owner',r.owner_id);facts.push({label:'Treatment',value:r.treatment?r.treatment[0].toUpperCase()+r.treatment.slice(1):'Not decided'});due('Next review',r.next_review,'Risk review is overdue');
    if(r.status==='accepted'&&r.acceptance_expires_at){const n=until(r.acceptance_expires_at,today);facts.push({label:'Acceptance expires',value:day(r.acceptance_expires_at),tone:n<=30?'moderate':''});if(n<=30)attention.push({tone:'moderate',Icon:Clock3,text:'Risk acceptance expires soon — reassess'});}
    if(['critical','high'].includes(a.risk_level)&&!closed&&!r.treatment_plan?.trim())attention.push({tone:'critical',Icon:AlertTriangle,text:'High exposure without a documented treatment plan'});
  }else if(kind==='vendors'){
    facts.push({label:'Criticality',badge:r.criticality},{label:'Status',badge:r.status});owner('Business owner',r.business_owner_id);due('Next review',r.next_review,'Vendor review is overdue');
    const n=until(r.contract_renewal,today);facts.push({label:'Contract renewal',value:day(r.contract_renewal)||'Not recorded',tone:n!=null&&n<=90?'moderate':''});
    const stale=(r.assurance_records||[]).filter(x=>x.required!==false&&until(x.refresh_due,today)<=30);
    facts.push({label:'Assurance',value:(r.assurance_records||[]).length?stale.length?`${stale.length} due or expired`:'Current':r.assurance_required?'Required, none recorded':'Not required',tone:stale.length||(r.assurance_required&&!(r.assurance_records||[]).length)?'moderate':''});
    if(stale.length)attention.push({tone:'moderate',Icon:Clock3,text:'Security assurance is due or expired'});
  }else if(kind==='policies'){
    facts.push({label:'Status',badge:r.status},{label:'Version',value:r.version||'—'});owner('Owner',r.owner_id);due('Next review',r.next_review_date,'Policy review is overdue');
    facts.push({label:'Last reviewed',value:day(r.last_reviewed_at)||'Not recorded'});
    if(r.status==='draft')attention.push({tone:'moderate',Icon:AlertTriangle,text:'Draft — not approved for use'});
  }else if(kind==='assets'){
    facts.push({label:'Criticality',badge:r.criticality},{label:'Type',value:r.asset_type||'—'},{label:'Status',badge:r.status});owner('Owner',r.owner_id);facts.push({label:'Location',value:r.location||'—'});
  }else return null;
  return {facts,attention};
}

export default function RecordSummary({kind,record,clientId,related,users}){
  const {user}=useAuth()||{};
  if(!record||!isBrawndoReference(clientId,user))return null;
  const s=summarize(kind,record,{related,users});
  if(!s)return null;
  return <section className="record-summary" aria-label="Record summary">
    {!!s.attention.length&&<ul className="record-attention">{s.attention.map(a=><li key={a.text} className={`is-${a.tone}`}><a.Icon className="h-4 w-4 shrink-0" aria-hidden="true"/>{a.text}</li>)}</ul>}
    <dl className="record-facts">{s.facts.map(f=><div key={f.label} className={f.wide?'is-wide':''}><dt>{f.label}</dt><dd className={f.tone?`is-${f.tone}`:''}>{f.badge!==undefined?(f.badge?<StatusBadge value={f.badge}/>:'—'):f.value}</dd></div>)}</dl>
  </section>;
}
