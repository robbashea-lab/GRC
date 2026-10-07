import {Link} from 'react-router-dom';
import Donut from './ProgramDonut';
import AssessmentMetrics from './AssessmentMetrics';
import {cisSummary} from '@/lib/cisVerification';
import {operatorStatuses,operatorVocabulary} from '@/lib/frameworkOperator';
import {CIS_ORDER} from './CisStatus';
import {SOC_STATUS_LABELS} from './PrestigeSocNavigator';
import {groupRequirements} from '@/lib/frameworkWorkspace';

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
const firstWord=s=>s.split(/[\s(]/)[0];

export default function FrameworkProgramCard({rows,program,workspacePilot=false}) {
  const key=program.key,name=shortName(program),labels=LABELS[key]||operatorStatuses(key),done=firstWord(labels.addressed);
  const summary=cisSummary(rows),to=program.to||`/compliance/${key}`;
  // Use the same applicability calculation for the segments and the percentage.
  const counts={addressed:summary.addressed,in_progress:summary.partial,needs_attention:summary.gap,not_assessed:summary.notAssessed,not_applicable:summary.na};
  const heading=key==='cis-ig1'?'bd-cis-heading':`bd-program-${key}-heading`;
  const Row=({view,className,children})=>LINKABLE.has(key)?<Link to={`${to}?${key==='iso-27001'?'dashboard=1&':''}view=${view}`} className={className}>{children}</Link>:<span className={`bd-static${className?` ${className}`:''}`}>{children}</span>;
  const gaps=[['unremediated','Gaps without a finding',summary.unremediated,'critical'],['needs_attention',labels.needs_attention,summary.gap,'critical'],['stale','Validation older than 12 months',summary.stale,'attention'],['unevidenced',`${done} without evidence`,summary.unevidenced,'attention']];
  const legend=<ul className="bd-legend">{CIS_ORDER.filter(s=>s!=='not_applicable'||counts[s]).map(s=><li key={s}><Row view={s}><span className={`bd-swatch bd-seg-${s}`} aria-hidden="true"/><span>{labels[s]}</span><strong>{counts[s]}</strong></Row></li>)}</ul>;
  if(workspacePilot)return <section className="bd-card bd-program bwp-program" aria-labelledby={heading}>
    <Donut counts={counts} summary={summary} name={name} labels={labels} caption/>
    <div className="bwp-program-content">
      <div className="bwp-program-heading"><div><p className="bd-eyebrow">Your active program</p><h2 id={heading}>{name}</h2><p className="bd-muted bd-small">{key==='cis-ig1'?`${groupRequirements(key,rows).length} controls · ${rows.length} safeguards`:program.name||program.label}</p></div>
        <dl className="bwp-program-counts"><div><dt>{done}</dt><dd>{summary.addressed} <span>of {summary.applicable}</span></dd></div><div><dt>Assessed</dt><dd>{summary.assessed} <span>of {summary.applicable}</span></dd></div></dl></div>
      <div className="bwp-program-bar" role="img" aria-label={`${name} assessment distribution: ${CIS_ORDER.filter(s=>s!=='not_applicable').map(s=>`${counts[s]} ${labels[s]}`).join(', ')}`}>
        {CIS_ORDER.filter(s=>s!=='not_applicable'&&counts[s]>0).map(s=><span key={s} className={`bd-seg-${s}`} style={{width:`${counts[s]/summary.applicable*100}%`}}/>)}
      </div>{legend}
      <details className="bwp-validation-details"><summary>Validation and remediation</summary><ul className="bd-gaps" aria-label={`${name.split(' ')[0]} verification gaps`}>{gaps.map(([view,label,n,tone])=><li key={view}><Row view={view} className={n?`is-${tone}`:'is-clear'}><span>{label}</span><strong>{n}</strong></Row></li>)}</ul></details>
      <div className="bwp-program-footer"><p className="bd-muted bd-small bd-program-note">Assessment progress, not a compliance determination.</p><Link to={to}>View program →</Link></div>
    </div>
  </section>;
  return <section className="bd-card bd-program" aria-labelledby={heading}>
    <div className="bd-card-head"><h2 id={heading}>{name}</h2><Link to={to}>Open workspace</Link></div>
    <p className="bd-muted bd-small">{program.name||program.label}</p>
    <div className="bd-program-body"><div className="bd-program-progress"><Donut counts={counts} summary={summary} name={name} labels={labels}/>
      {summary.applicable?<AssessmentMetrics summary={summary} implementedLabel={done}/>
      :<p className="bd-muted bd-small" data-testid="readiness-empty">No applicable {operatorVocabulary(key).items} yet: readiness not calculated.</p>}
    </div>
    {legend}
      <ul className="bd-gaps" aria-label={`${name.split(" ")[0]} verification gaps`}>{gaps.map(([view,label,n,tone])=><li key={view}><Row view={view} className={n?`is-${tone}`:'is-clear'}><span>{label}</span><strong>{n}</strong></Row></li>)}</ul>
    </div>
    <p className="bd-muted bd-small bd-program-note">{key==='soc-2'?'Internal readiness, not an auditor opinion.':'Assessment progress, not a compliance determination.'}</p>
  </section>;
}
