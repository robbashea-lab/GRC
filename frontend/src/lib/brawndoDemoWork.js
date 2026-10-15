import {calendarDay,displayDay} from './managementDates';

export const DEMO_WORK_PAGE_SIZE=8;
const STATUS_ORDER=['overdue','in_progress','pending_validation','remediated','open','upcoming'];
export const DEMO_WORK_FILTERS=[['all','Open items'],['pastDue','Overdue'],['due30','Due in 30 days'],['unassigned','Unassigned']];

// Collect the authoritative cohort before local sorting/searching; never sort a preview.
export async function loadCompleteDemoWork(loadDetail,signal,options={}) {
  const items=[],keys=new Set();let total=null;
  for(let offset=0;offset<100000;){
    const page=await loadDetail('all',offset,signal,{...options,limit:100});
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    if(!Array.isArray(page.items)||!Number.isInteger(page.total)||page.total<0||page.offset!==offset||!Number.isInteger(page.limit)||page.limit<1||page.limit>100||page.items.length>page.limit||total!==null&&total!==page.total)throw new Error('Work changed while loading. Refresh the dashboard.');
    total=page.total;
    for(const item of page.items){if(!item.key||keys.has(item.key))throw new Error('Work queue contains duplicate or missing identities.');keys.add(item.key);items.push(item);}
    if(items.length>total)throw new Error('Work queue total does not match its records.');
    if(items.length===total){if(page.has_more)throw new Error('Work queue pagination is inconsistent.');return items;}
    if(!page.items.length||!page.has_more)throw new Error('Work queue is incomplete. Refresh the dashboard.');
    offset+=page.items.length;
  }
  throw new Error('Work queue exceeds the supported dashboard size.');
}
export function matchesDemoWorkFilter(item,filter,asOf){
  const day=calendarDay(item.due_date),today=calendarDay(asOf);
  return filter==='unassigned'?item.unassigned:filter==='pastDue'?day!==null&&today!==null&&day<today:filter==='due30'?day!==null&&today!==null&&day>=today&&day<=today+30:true;
}
const textCompare=(a,b)=>String(a||'').localeCompare(String(b||''),undefined,{sensitivity:'base',numeric:true});
const missingLast=(a,b,compare)=>a===null?(b===null?0:1):b===null?-1:compare(a,b);
export function selectDemoWork(items,{filter='all',asOf,search='',sort='due',frameworkKeys=null}={}){
  const query=search.trim().toLowerCase();
  const rows=items.filter(item=>matchesDemoWorkFilter(item,filter,asOf)&&(!frameworkKeys||frameworkKeys.has(item.key))&&(!query||[item.title,item.owner,item.type,item.source_label,item.safeguard_label,...(item.safeguard_labels||[]),...(item.safeguard_ids||[]),...(item.framework_keys||[])].join(' ').toLowerCase().includes(query)));
  const due=(a,b,reverse=false)=>missingLast(calendarDay(a.due_date),calendarDay(b.due_date),(x,y)=>reverse?y-x:x-y);
  return rows.sort((a,b)=>{
    let order=0;
    if(sort==='title')order=missingLast(a.title||null,b.title||null,textCompare);
    else if(sort==='owner')order=missingLast(a.unassigned?null:a.owner||null,b.unassigned?null:b.owner||null,textCompare);
    else if(sort==='status'){const rank=item=>{const index=STATUS_ORDER.indexOf(item.status);return index<0?null:index;};order=missingLast(rank(a),rank(b),(x,y)=>x-y);}
    else order=due(a,b,sort==='due-desc');
    return order||due(a,b)||textCompare(a.title,b.title)||textCompare(a.key,b.key);
  });
}
export function demoWorkSummary(items,asOf){
  const today=calendarDay(asOf),due=rows=>rows.map(r=>calendarDay(r.due_date)).filter(d=>d!==null).sort((a,b)=>a-b);
  const late=due(items.filter(r=>matchesDemoWorkFilter(r,'pastDue',asOf))),soon=due(items.filter(r=>matchesDemoWorkFilter(r,'due30',asOf))),unassigned=items.filter(r=>r.unassigned),orphan=due(unassigned);
  const iso=day=>displayDay(new Date(day*86400000).toISOString().slice(0,10));
  return {all:`${items.filter(r=>r.status==='in_progress').length} in progress · ${items.filter(r=>['remediated','pending_validation'].includes(r.status)).length} awaiting validation`,pastDue:late.length?`Oldest ${today-late[0]} days past due`:'Nothing past due',due30:soon.length?`Next due ${iso(soon[0])}`:'Nothing due in 30 days',unassigned:!unassigned.length?'Every item has an owner':orphan.length?`Earliest due ${iso(orphan[0])}`:'No known due dates'};
}
