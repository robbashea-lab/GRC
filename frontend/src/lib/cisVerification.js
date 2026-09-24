import verify from './operatorGuidance/cisVerify.json';

// Derived, read-only verification view. Nothing here writes or changes an
// assessment conclusion: it separates "we were told / the stack suggests" from
// "we verified, recently, with evidence" using records that already exist.
export const STALE_DAYS=365, AGING_DAYS=270;
const DAY=86400000;
export const verificationChecks=id=>verify.safeguards[id]?.checks||[];
export const stackCapability=(id,stack=[])=>{const need=verify.safeguards[id]?.stack;return need&&stack.includes(need)?need:null;};
export function ageDays(iso,today=new Date()){const t=Date.parse(iso);return Number.isFinite(t)?Math.max(0,Math.floor((today.getTime()-t)/DAY)):null;}
export function freshness(row,today=new Date()){
  if(!row.last_assessed||row.status==='not_assessed')return {state:'never',days:null,label:'Never assessed'};
  const days=ageDays(row.last_assessed,today);
  return days>STALE_DAYS?{state:'stale',days,label:`Stale · ${Math.round(days/30)} months`}:days>AGING_DAYS?{state:'aging',days,label:`Aging · ${Math.round(days/30)} months`}:{state:'current',days,label:days<1?'Assessed today':`Assessed ${days}d ago`};
}
export const isStale=(row,today)=>freshness(row,today).state==='stale';
export const lacksEvidence=row=>row.status==='addressed'&&!(row.work?.evidence_count>0);
export const evidenceCurrent=(row,today)=>row.work?.evidence_count>0&&(ageDays(row.work.latest_evidence_at,today)??Infinity)<=STALE_DAYS;

/** Ordered verification ladder. Each step: done | partial | missing | gap. */
export function verificationLadder(row,{stack=[],today=new Date()}={}){
  const w=row.work||{},fresh=freshness(row,today),presumed=stackCapability(row.definition_id,stack);
  const reviews=w.review_ids?.length||0;
  return [
    {key:'capability',label:'Capability exists',state:row.technology?.trim()?'done':presumed?'partial':'missing',
      detail:row.technology?.trim()?row.technology:presumed?`Presumed from service stack (${presumed}) — not verified`:'No delivering technology or process recorded'},
    {key:'documented',label:'Implementation documented',state:row.implementation?.trim()?'done':'missing',
      detail:row.implementation?.trim()?'Current-state narrative recorded':'No implementation narrative'},
    {key:'evidence',label:'Evidence current',state:!w.evidence_count?'missing':evidenceCurrent(row,today)?'done':'partial',
      detail:!w.evidence_count?'No linked evidence':evidenceCurrent(row,today)?`${w.evidence_count} linked · latest ${w.latest_evidence_at.slice(0,10)}`:`Latest evidence ${w.latest_evidence_at?.slice(0,10)} is over 12 months old`},
    {key:'operating',label:'Recurring process operating',state:!reviews?'missing':w.overdue_reviews?'gap':'done',
      detail:!reviews?'No linked recurring Review':w.overdue_reviews?`${w.overdue_reviews} linked Review overdue`:`${reviews} linked Review${reviews===1?'':'s'} on schedule`},
    {key:'validated',label:'Implementation verified',state:row.status==='addressed'&&fresh.state!=='stale'&&w.evidence_count?'done':row.status==='addressed'?'partial':['in_progress','needs_attention'].includes(row.status)?'gap':'missing',
      detail:row.status==='addressed'?(fresh.state==='stale'?'Concluded Implemented, but the assessment is stale':!w.evidence_count?'Concluded Implemented without linked evidence':`Verified ${row.last_assessed.slice(0,10)}`):row.status==='not_applicable'?'Not applicable':row.status==='not_assessed'?'Not yet assessed':'Assessment identified a gap'},
    {key:'remediation',label:'Gaps tracked to remediation',state:w.open_findings?(w.overdue_actions?'gap':'partial'):['in_progress','needs_attention'].includes(row.status)?'missing':'done',
      detail:w.open_findings?`${w.open_findings} open Finding${w.open_findings===1?'':'s'}${w.overdue_actions?` · ${w.overdue_actions} overdue Action${w.overdue_actions===1?'':'s'}`:''}`:['in_progress','needs_attention'].includes(row.status)?'Gap identified but no Finding raised':'No open gaps'},
  ];
}

/** Workspace summary. Coverage (assessed) is deliberately separate from implementation. */
export function cisSummary(rows,today=new Date()){
  const count=s=>rows.filter(r=>r.status===s).length;
  const applicable=rows.filter(r=>r.status!=='not_applicable');
  const assessed=applicable.filter(r=>r.status!=='not_assessed').length;
  return {total:rows.length,applicable:applicable.length,assessed,
    addressed:count('addressed'),partial:count('in_progress'),gap:count('needs_attention'),na:count('not_applicable'),notAssessed:count('not_assessed'),
    coverage:applicable.length?Math.round(assessed/applicable.length*100):0,
    implemented:applicable.length?Math.round(count('addressed')/applicable.length*100):0,
    stale:rows.filter(r=>isStale(r,today)).length,
    unevidenced:rows.filter(lacksEvidence).length,
    findings:new Set(rows.flatMap(r=>r.work?.finding_ids||[])).size,
    overdueActions:rows.reduce((n,r)=>n+(r.work?.overdue_actions||0),0),
    overdueReviews:rows.filter(r=>r.work?.overdue_reviews).length,
    unremediated:rows.filter(r=>['in_progress','needs_attention'].includes(r.status)&&!r.work?.open_findings).length};
}
