import {Link} from 'react-router-dom';
import {useId,useState} from 'react';
import AssessmentMetrics from './AssessmentMetrics';
import {cisSummary} from '@/lib/cisVerification';
import {operatorStatuses,operatorVocabulary} from '@/lib/frameworkOperator';
import {CIS_ORDER} from './CisStatus';
import {SOC_STATUS_LABELS} from './PrestigeSocNavigator';

// Shared client-dashboard programme card (Brawndo CIS IG1 is the approved shell).
// Same layout, colours and measures for every framework; only the vocabulary and data differ.
const SHORT={'cis-ig1':'CIS IG1','soc-2':'SOC 2','iso-27001':'ISO 27001'};
// Dashboard wording for the not-implemented conclusion, where it is shorter than the workspace label.
// The card speaks the vocabulary of the workspace it links to.
const LABELS={'soc-2':SOC_STATUS_LABELS};
// ISO dashboard links use the existing Overview result table across both assessment sections.
const LINKABLE=new Set(['cis-ig1','soc-2','iso-27001']);
// Conclusion labels each workspace uses (SOC 2 reference workspace has its own map).
export const readinessLabels=key=>LABELS[key]||operatorStatuses(key);
export const shortName=program=>(program.key==='cis-ig1'&&program.implementation_group?`CIS IG${program.implementation_group}`:SHORT[program.key])||program.label||program.name||program.key;
const keyNoun=name=>name.startsWith('CIS')?'safeguards':name==='SOC 2'?'criteria':'requirements and controls';
const firstWord=s=>s.split(/[\s(]/)[0];

function Donut({counts,summary,name,labels}) {
  const [active,setActive]=useState(null),tipId=useId();
  const segments=CIS_ORDER.filter(s=>s!=='not_applicable');
  const total=summary.applicable||1;
  let offset=25;
  return <span className="bd-donut-wrap" onMouseLeave={()=>setActive(null)}><svg className="bd-donut" viewBox="0 0 42 42" role="group" aria-label={`${name}: ${segments.map(s=>`${counts[s]} ${labels[s]} (${(counts[s]/total*100).toFixed(1)}%, ${counts[s]} of ${summary.applicable})`).join(', ')}`}>
    <circle cx="21" cy="21" r="15.9" className="bd-donut-track"/>
    {segments.map(s=>{const len=counts[s]/total*100,description=`${labels[s]} · ${len.toFixed(1)}% · ${counts[s]} of ${summary.applicable} ${keyNoun(name)}`,el=len?<circle key={s} cx="21" cy="21" r="15.9" tabIndex={0} role="img" aria-label={description} aria-describedby={active===s?tipId:undefined} onMouseEnter={()=>setActive(s)} onFocus={()=>setActive(s)} onBlur={()=>setActive(null)} onKeyDown={e=>{if(e.key==='Escape')setActive(null);}} className={`bd-seg-${s}`} strokeDasharray={`${len} ${100-len}`} strokeDashoffset={offset}/>:null;offset-=len;return el;})}
    <text x="21" y="23.7" className="bd-donut-value">{summary.applicable?`${summary.implemented}%`:'—'}</text>
  </svg>{active&&<span id={tipId} role="tooltip" className="bd-donut-tooltip"><strong>{labels[active]}</strong><span>{(counts[active]/total*100).toFixed(1)}% · {counts[active]} of {summary.applicable} {keyNoun(name)}</span></span>}</span>;
}

export default function FrameworkProgramCard({rows,program}) {
  const key=program.key,name=shortName(program),labels=LABELS[key]||operatorStatuses(key),done=firstWord(labels.addressed);
  const summary=cisSummary(rows),to=program.to||`/compliance/${key}`;
  // Use the same applicability calculation for the segments and the percentage.
  const counts={addressed:summary.addressed,in_progress:summary.partial,needs_attention:summary.gap,not_assessed:summary.notAssessed,not_applicable:summary.na};
  const heading=key==='cis-ig1'?'bd-cis-heading':`bd-program-${key}-heading`;
  const Row=({view,className,children})=>LINKABLE.has(key)?<Link to={`${to}?${key==='iso-27001'?'dashboard=1&':''}view=${view}`} className={className}>{children}</Link>:<span className={`bd-static${className?` ${className}`:''}`}>{children}</span>;
  const gaps=[['unremediated','Gaps without a finding',summary.unremediated,'critical'],['needs_attention',labels.needs_attention,summary.gap,'critical'],['stale','Validation older than 12 months',summary.stale,'attention'],['unevidenced',`${done} without evidence`,summary.unevidenced,'attention']];
  return <section className="bd-card bd-program" aria-labelledby={heading}>
    <div className="bd-card-head"><h2 id={heading}>{name}</h2><Link to={to}>Open workspace</Link></div>
    <p className="bd-muted bd-small">{program.name||program.label}</p>
    <div className="bd-program-body"><div className="bd-program-progress"><Donut counts={counts} summary={summary} name={name} labels={labels}/>
      {summary.applicable?<AssessmentMetrics summary={summary} implementedLabel={done}/>
      :<p className="bd-muted bd-small" data-testid="readiness-empty">No applicable {operatorVocabulary(key).items} yet: readiness not calculated.</p>}
    </div>
      <ul className="bd-legend">{CIS_ORDER.filter(s=>s!=='not_applicable'||counts[s]).map(s=><li key={s}><Row view={s}><span className={`bd-swatch bd-seg-${s}`} aria-hidden="true"/><span>{labels[s]}</span><strong>{counts[s]}</strong></Row></li>)}</ul>
      <ul className="bd-gaps" aria-label={`${name.split(" ")[0]} verification gaps`}>{gaps.map(([view,label,n,tone])=><li key={view}><Row view={view} className={n?`is-${tone}`:'is-clear'}><span>{label}</span><strong>{n}</strong></Row></li>)}</ul>
    </div>
    <p className="bd-muted bd-small bd-program-note">{key==='soc-2'?'Internal readiness, not an auditor opinion.':'Assessment progress, not a compliance determination.'}</p>
  </section>;
}
