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
  if(days===null)return {state:'unknown',days:null,label:'Assessment date unavailable'};
  return days>STALE_DAYS?{state:'stale',days,label:`Stale · ${Math.round(days/30)} months`}:days>AGING_DAYS?{state:'aging',days,label:`Aging · ${Math.round(days/30)} months`}:{state:'current',days,label:days<1?'Assessed today':`Assessed ${days}d ago`};
}
export const isStale=(row,today)=>freshness(row,today).state==='stale';
// Only Findings raised on or explicitly linked to this safeguard track its gap; inherited Review Findings do not.
export const directFindings=w=>w?.direct_findings??w?.open_findings??0;
export const gapUntracked=r=>['in_progress','needs_attention'].includes(r.status)&&!directFindings(r.work);
export const lacksEvidence=row=>row.status==='addressed'&&!(row.work?.evidence_count>0);
export const evidenceCurrent=(row,today)=>row.work?.evidence_count>0&&(ageDays(row.work.latest_evidence_at,today)??Infinity)<=STALE_DAYS;

/** Ordered verification ladder. Each step: done | partial | missing | gap. */
export function verificationLadder(row,{stack=[],today=new Date()}={}){
  const w=row.work||{},fresh=freshness(row,today),presumed=stackCapability(row.definition_id,stack);
  const reviews=w.review_ids?.length||0;
  const currentEvidence=evidenceCurrent(row,today);
  const datedAssessment=['current','aging'].includes(fresh.state);
  const evidenceDateKnown=ageDays(w.latest_evidence_at,today)!==null;
  let validationDetail='Assessment identified a gap';
  if(row.status==='addressed'){
    validationDetail=fresh.state==='stale'?'Concluded Implemented, but the assessment is stale'
      :!datedAssessment?'Concluded Implemented, but the assessment date is unavailable'
      :!w.evidence_count?'Concluded Implemented without linked evidence'
      :!currentEvidence?'Concluded Implemented, but current evidence has not been established'
      :`Verified ${row.last_assessed.slice(0,10)}`;
  }else if(row.status==='not_applicable')validationDetail='Not applicable';
  else if(row.status==='not_assessed')validationDetail='Not yet assessed';
  return [
    {key:'capability',label:'Capability exists',state:row.technology?.trim()?'done':presumed?'partial':'missing',
      detail:row.technology?.trim()?row.technology:presumed?`Presumed from service stack (${presumed}) — not verified`:'No delivering technology or process recorded'},
    {key:'documented',label:'Implementation documented',state:row.implementation?.trim()?'done':'missing',
      detail:row.implementation?.trim()?'Current-state narrative recorded':'No implementation narrative'},
    {key:'evidence',label:'Evidence current',state:!w.evidence_count?'missing':currentEvidence?'done':'partial',
      detail:!w.evidence_count?'No linked evidence':currentEvidence?`${w.evidence_count} linked · latest ${w.latest_evidence_at.slice(0,10)}`:!evidenceDateKnown?'Linked evidence has no usable collection date':`Latest evidence ${w.latest_evidence_at.slice(0,10)} is over 12 months old`},
    // A relationship and a future due date do not prove that a process operated.
    {key:'operating',label:'Governance linked',state:!reviews?'missing':w.overdue_reviews?'gap':'done',
      detail:!reviews?'No linked Review':w.overdue_reviews?`${w.overdue_reviews} linked Review overdue`:`${reviews} linked Review${reviews===1?'':'s'} · Inspect occurrence history to verify operation`},
    {key:'validated',label:'Implementation verified',state:row.status==='addressed'&&datedAssessment&&currentEvidence?'done':row.status==='addressed'?'partial':['in_progress','needs_attention'].includes(row.status)?'gap':'missing',
      detail:validationDetail},
    {key:'remediation',label:'Gaps tracked to remediation',state:directFindings(w)?(w.overdue_actions?'gap':'partial'):['in_progress','needs_attention'].includes(row.status)?'missing':'done',
      detail:directFindings(w)?`${directFindings(w)} open Finding${directFindings(w)===1?'':'s'} for this safeguard${w.overdue_actions?` · ${w.overdue_actions} overdue Action${w.overdue_actions===1?'':'s'}`:''}`:['in_progress','needs_attention'].includes(row.status)?(w.open_findings?'Gap not tracked: linked Findings come from related Reviews, not this safeguard':'Gap identified but no Finding raised'):'No open gaps'},
  ];
}

/** Workspace summary. Coverage (assessed) is deliberately separate from implementation. */
export function cisSummary(rows,today=new Date()){
  const applicable=rows.filter(r=>r.specification==='annex_control'?r.soa_applicability!=='excluded':r.status!=='not_applicable');
  const count=s=>applicable.filter(r=>r.status===s).length;
  const assessed=applicable.filter(r=>r.status!=='not_assessed').length;
  return {total:rows.length,applicable:applicable.length,assessed,
    addressed:count('addressed'),partial:count('in_progress'),gap:count('needs_attention'),na:rows.length-applicable.length,notAssessed:count('not_assessed'),
    coverage:applicable.length?Math.round(assessed/applicable.length*100):0,
    implemented:applicable.length?Math.round(count('addressed')/applicable.length*100):0,
    stale:rows.filter(r=>isStale(r,today)).length,
    unevidenced:rows.filter(lacksEvidence).length,
    findings:new Set(rows.flatMap(r=>r.work?.finding_ids||[])).size,
    // Safeguards with overdue linked remediation: the same population as the filtered view.
    // A Review Action inherited by several safeguards must not be multiplied into a larger number.
    overdueActions:rows.filter(r=>(r.work?.overdue_actions||0)>0).length,
    overdueReviews:rows.filter(r=>r.work?.overdue_reviews).length,
    unremediated:rows.filter(gapUntracked).length};
}
