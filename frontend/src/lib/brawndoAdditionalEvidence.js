import {calendarDay,managementDay} from './managementDates';

// Metadata is paged through the existing authorized APIs, never through a capped recent-files list.
export async function collectEvidencePages(loadPage,{signal,maxItems=10000}={}){
  let page=1,total=null,items=[];
  do {
    if(signal?.aborted)throw new Error('Evidence request cancelled');
    const data=await loadPage(page);
    if(!Array.isArray(data.items)||!Number.isInteger(data.total)||!Number.isInteger(data.page_size)||data.page_size<1)throw new Error('Evidence response is incomplete');
    if(data.total>maxItems)throw new Error('The evidence overview is unavailable for this library size. Search and paged files remain available.');
    if(total!==null&&total!==data.total)throw new Error('Evidence changed while loading the overview. Reload to refresh it.');
    total=data.total;items.push(...data.items);
    if(items.length<total&&!data.items.length)throw new Error('Evidence response ended before all records were loaded');
    page++;
  }while(items.length<total);
  if(items.length!==total)throw new Error('Evidence response count did not match its records');
  return items;
}

export function evidenceOverview(files,framework,reviewSets,today=managementDay()){
  const activeDefinitions=new Set(framework.selected&&framework.configured?framework.active_definition_ids:[]);
  const cutoff=today-90,safeguards=framework.assessments.filter(r=>r.framework_key==='cis-ig1'&&activeDefinitions.has(r.definition_id));
  const ids=new Set(safeguards.map(r=>r.framework_assessment_id)),linked=new Set();
  for(const file of files)for(const ref of file.references||[])if(ref.available&&ref.kind==='framework_assessments'&&ids.has(ref.id))linked.add(ref.id);
  const periods=reviewSets.flatMap(r=>r.periods).filter(p=>p.status==='completed'&&Number.isInteger(p.evidence_count)&&p.evidence_count>=0);
  return {files:files.length,recent:files.filter(f=>{const day=calendarDay(f.created_at);return day!==null&&day>=cutoff&&day<=today;}).length,safeguards:linked.size,safeguardTotal:activeDefinitions.size,periods:periods.filter(p=>p.evidence_count>0).length,periodTotal:periods.length};
}

export function evidenceCoverage(reviewSets,today=managementDay()){
  const end=new Date(today*86400000),year=end.getUTCFullYear()-1,month=end.getUTCMonth();
  const start=new Date(Date.UTC(year,month,Math.min(end.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate())));
  const firstDay=calendarDay(start.toISOString()),months=Array.from({length:13},(_,index)=>{
    const date=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+index,1));
    return {key:date.toISOString().slice(0,7),label:date.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}),year:date.getUTCFullYear()};
  });
  const rows=reviewSets.map(review=>{
    // Only an actual completed native occurrence with a retained numeric count proves a gap.
    const periods=review.periods.filter(p=>{const due=calendarDay(p.due_date);return p.status==='completed'&&Number.isInteger(p.evidence_count)&&p.evidence_count>=0&&due!==null&&due>=firstDay&&due<=today;});
    return {...review,periods,withEvidence:periods.filter(p=>p.evidence_count>0).length,missing:periods.some(p=>p.evidence_count===0)};
  });
  return {months,rows};
}

export function evidenceFileSize(row){
  const size=row.size_bytes??row.file_size??row.size;
  if(!Number.isFinite(size)||size<0)return null;
  return size<1024?`${size} B`:size<1048576?`${(size/1024).toFixed(1)} KB`:`${(size/1048576).toFixed(1)} MB`;
}
