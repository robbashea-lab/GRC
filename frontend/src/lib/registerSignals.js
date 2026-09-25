// Derived register views for the reference workspace. Each signal is a filter over
// existing records (no stored flags); counts and filtered rows use the same predicate.
const DAY=86400000;
const ymd=d=>d.toISOString().slice(0,10);
const due=(r,key)=>r[key]?String(r[key]).slice(0,10):null;
const done=['completed','cancelled','closed','done','accepted','retired','validated'];
const open=r=>!done.includes(r.status);
export function registerSignals(kind,today=new Date()){
  const t=ymd(today),soon=ymd(new Date(today.getTime()+14*DAY)),month=ymd(new Date(today.getTime()+30*DAY)),recent=ymd(new Date(today.getTime()-30*DAY));
  const owner=r=>r.owner_id||r.assignee_id||r.business_owner_id;
  if(kind==='reviews')return [
    {id:'due14',label:'Due in 14 days',tone:'moderate',test:r=>open(r)&&due(r,'due_date')>=t&&due(r,'due_date')<=soon},
    {id:'unowned',label:'No owner',tone:'moderate',test:r=>open(r)&&!owner(r)},
    {id:'recent',label:'Completed in last 30 days',tone:'success',test:r=>(r.occurrences||[]).some(o=>o.completed_at&&String(o.completed_at).slice(0,10)>=recent)},
  ];
  if(kind==='findings')return [
    {id:'material',label:'High / critical open',tone:'critical',test:r=>open(r)&&['high','critical'].includes(r.severity)},
    {id:'late',label:'Target date passed',tone:'critical',test:r=>open(r)&&r.status!=='remediated'&&due(r,'due_date')&&due(r,'due_date')<t},
    {id:'validate',label:'Awaiting validation',tone:'moderate',test:r=>r.status==='remediated'},
    {id:'unowned',label:'No owner',tone:'moderate',test:r=>open(r)&&!owner(r)},
  ];
  if(kind==='policies')return [
    {id:'review_overdue',label:'Review overdue',tone:'critical',test:r=>r.status!=='retired'&&due(r,'next_review_date')&&due(r,'next_review_date')<t},
    {id:'review_due',label:'Review due in 30 days',tone:'moderate',test:r=>r.status!=='retired'&&due(r,'next_review_date')>=t&&due(r,'next_review_date')<=month},
    {id:'unapproved',label:'Not approved',tone:'moderate',test:r=>['draft','pending_approval','in_review'].includes(r.status)},
  ];
  if(kind==='assets')return [
    {id:'critical',label:'Critical systems',tone:'critical',test:r=>r.criticality==='critical'&&r.status!=='retired'},
    {id:'unowned',label:'No owner',tone:'moderate',test:r=>r.status!=='retired'&&!owner(r)},
  ];
  return [];
}
