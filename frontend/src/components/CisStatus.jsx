import {operatorStatuses} from '@/lib/frameworkOperator';

// Assessment-conclusion presentation. Color always pairs with text, never alone.
export const CIS_ORDER=['addressed','in_progress','needs_attention','not_assessed','not_applicable'];
export const CIS_TONE={addressed:'success',in_progress:'moderate',needs_attention:'critical',not_assessed:'neutral',not_applicable:'info'};
export const cisLabel=status=>operatorStatuses('cis-ig1')[status]||'Not Assessed';

export function CisStatusPill({status}){
  return <span className={`cis-pill cis-tone-${CIS_TONE[status]||'neutral'}`}><span className="cis-dot" aria-hidden="true"/>{cisLabel(status)}</span>;
}

export const statusCounts=rows=>Object.fromEntries(CIS_ORDER.map(s=>[s,rows.filter(r=>r.status===s).length]));
/** Proportional status bar. aria-hidden: counts are always rendered as text beside it. */
export function CisStatusBar({counts,className=''}){
  const total=Object.values(counts).reduce((a,b)=>a+b,0)||1;
  return <div className={`cis-bar ${className}`} aria-hidden="true">{CIS_ORDER.map(s=>counts[s]?<span key={s} className={`cis-fill-${CIS_TONE[s]}`} style={{width:`${counts[s]/total*100}%`}}/>:null)}</div>;
}
