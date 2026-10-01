import {Link} from 'react-router-dom';
import {cisSummary} from '@/lib/cisVerification';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {CIS_ORDER,statusCounts} from './CisStatus';
import {SOC_STATUS_LABELS} from './PrestigeSocNavigator';

// Shared client-dashboard programme card (Brawndo CIS IG1 is the approved shell).
// Same layout, colours and measures for every framework; only the vocabulary and data differ.
const SHORT={'cis-ig1':'CIS IG1','soc-2':'SOC 2','iso-27001':'ISO 27001'};
// Dashboard wording for the not-implemented conclusion, where it is shorter than the workspace label.
const GAP={'cis-ig1':'Not implemented','soc-2':'Not implemented'};
// The card speaks the vocabulary of the workspace it links to.
const LABELS={'soc-2':SOC_STATUS_LABELS};
const NOTE={'soc-2':'Internal readiness, not an auditor opinion.'};
// Workspaces whose ?view= filter covers the whole framework population. ISO views are scoped to a
// workspace tab (Clauses / Annex A), so its rows are shown as counts without a filtered link.
const LINKABLE=new Set(['cis-ig1','soc-2']);
export const shortName=program=>SHORT[program.key]||program.label||program.name||program.key;
const sentence=s=>s.charAt(0)+s.slice(1).toLowerCase();
const firstWord=s=>s.split(/[\s(]/)[0];

function Donut({counts,summary,name,labels}) {
  const segments=CIS_ORDER.filter(s=>s!=='not_applicable');
  const total=segments.reduce((n,s)=>n+counts[s],0)||1;
  let offset=25;
  return <svg className="bd-donut" viewBox="0 0 42 42" role="img" aria-label={`${name}: ${segments.map(s=>`${counts[s]} ${labels[s]}`).join(', ')}`}>
    <circle cx="21" cy="21" r="15.9" className="bd-donut-track"/>
    {segments.map(s=>{const len=counts[s]/total*100,el=len?<circle key={s} cx="21" cy="21" r="15.9" className={`bd-seg-${s}`} strokeDasharray={`${len} ${100-len}`} strokeDashoffset={offset}/>:null;offset-=len;return el;})}
    <text x="21" y="22.4" className="bd-donut-value">{summary.implemented}%</text>
    <text x="21" y="27.6" className="bd-donut-label">{firstWord(labels.addressed).toLowerCase()}</text>
  </svg>;
}

export default function FrameworkProgramCard({rows,program}) {
  const key=program.key,name=shortName(program),labels=LABELS[key]||operatorStatuses(key),done=firstWord(labels.addressed);
  const summary=cisSummary(rows),counts=statusCounts(rows),to=program.to||`/compliance/${key}`;
  const heading=key==='cis-ig1'?'bd-cis-heading':`bd-program-${key}-heading`;
  const Row=({view,className,children})=>LINKABLE.has(key)?<Link to={`${to}?view=${view}`} className={className}>{children}</Link>:<span className={`bd-static${className?` ${className}`:''}`}>{children}</span>;
  const gaps=[['unremediated','Gaps without a Finding',summary.unremediated,'critical'],['needs_attention',GAP[key]||sentence(labels.needs_attention),summary.gap,'critical'],['stale','Validation older than 12 months',summary.stale,'attention'],['unevidenced',`${done} without evidence`,summary.unevidenced,'attention']];
  return <section className="bd-card" aria-labelledby={heading}>
    <div className="bd-card-head"><h2 id={heading}>{name}</h2><Link to={to}>Open workspace</Link></div>
    <p className="bd-muted bd-small">{program.name||program.label}</p>
    <div className="bd-cis-chart"><Donut counts={counts} summary={summary} name={name} labels={labels}/>
      <ul className="bd-legend">{CIS_ORDER.filter(s=>s!=='not_applicable'||counts[s]).map(s=><li key={s}><Row view={s}><span className={`bd-swatch bd-seg-${s}`} aria-hidden="true"/><span>{labels[s]}</span><strong>{counts[s]}</strong></Row></li>)}</ul>
    </div>
    <div className="bd-cis-measures"><span>{done} {summary.addressed} of {summary.applicable}</span><span><strong>{summary.coverage}%</strong> Assessed · {summary.assessed} of {summary.applicable}</span></div>
    {summary.na>0&&<p className="bd-muted bd-small">{summary.na} N/A excluded from progress denominators.</p>}
    <ul className="bd-gaps" aria-label={`${name.split(" ")[0]} verification gaps`}>{gaps.map(([view,label,n,tone])=><li key={view}><Row view={view} className={n?`is-${tone}`:'is-clear'}><span>{label}</span><strong>{n}</strong></Row></li>)}</ul>
    <p className="bd-muted bd-small">{NOTE[key]||'Assessment progress, not a compliance determination.'}</p>
  </section>;
}
