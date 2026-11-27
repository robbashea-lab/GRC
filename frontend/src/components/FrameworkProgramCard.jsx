import {Link} from 'react-router-dom';
import {clientDestination} from '@/lib/clientSelection';
import DashboardStatusComparison from './DashboardStatusComparison';
import {cisSummary} from '@/lib/cisVerification';
import {operatorStatuses,operatorVocabulary} from '@/lib/frameworkOperator';
import {SOC_STATUS_LABELS} from './PrestigeSocNavigator';

// Shared client-dashboard programme card (Brawndo CIS IG1 is the approved shell).
// Same layout, colours and measures for every framework; only the vocabulary and data differ.
const SHORT={'cis-ig1':'CIS IG1','soc-2':'SOC 2','iso-27001':'ISO 27001'};
// Dashboard wording for the not-implemented conclusion, where it is shorter than the workspace label.
// The card speaks the vocabulary of the workspace it links to.
const LABELS={'soc-2':SOC_STATUS_LABELS};
// Conclusion labels each workspace uses (SOC 2 reference workspace has its own map).
export const readinessLabels=key=>LABELS[key]||operatorStatuses(key);
export const shortName=program=>(program.key==='cis-ig1'&&program.implementation_group?`CIS IG${program.implementation_group}`:SHORT[program.key])||program.label||program.name||program.key;
const firstWord=s=>s.split(/[\s(]/)[0];

export default function FrameworkProgramCard({clientId,rows,program,workspacePilot=false}) {
  const key=program.key,name=shortName(program),labels=LABELS[key]||operatorStatuses(key),done=firstWord(labels.addressed);
  const summary=cisSummary(rows,new Date(),program.implementation_position),to=program.to||`/compliance/${key}`;
  const scopeTo=destination=>clientId?clientDestination(clientId,destination):destination;
  // Use the same applicability calculation for the segments and the percentage.
  const counts={addressed:summary.addressed,in_progress:summary.partial,needs_attention:summary.gap,not_assessed:summary.notAssessed,not_applicable:summary.na};
  const heading=key==='cis-ig1'?'bd-cis-heading':`bd-program-${key}-heading`;
  const viewTo=view=>{
    const target=new URL(to,window.location.origin);
    if(key==='iso-27001')target.searchParams.set('dashboard','1');
    target.searchParams.set('view',view);
    return scopeTo(target.pathname+target.search+target.hash);
  };

  const gaps=[['unremediated','Gaps without a finding',summary.unremediated,'critical'],['needs_attention',labels.needs_attention,summary.gap,'critical'],['stale','Validation older than 12 months',summary.stale,'attention'],['unevidenced',`${done} without evidence`,summary.unevidenced,'attention']];
  const statusRows = ['addressed','in_progress','needs_attention','not_assessed'].map(status => ({
    key:status, label:labels[status], count:counts[status],
  }));
  const unit = program.unit_label || operatorVocabulary(key).items;
  return <section className="bd-card bd-program v3-program-status" aria-labelledby={heading}>
    <div className="bd-card-head"><div><h2 id={heading}>{name} Status</h2><p className="bd-muted bd-small">{program.name || program.label}</p></div>
      <Link to={scopeTo(to)}>{workspacePilot ? 'View program →' : 'Open workspace'}</Link>
    </div>
    {summary.available === false ? <p role="status" className="bd-muted">{summary.reason || 'Implementation counts are unavailable.'}</p>
      : <DashboardStatusComparison counts={statusRows} total={summary.applicable} unit={unit} verb={done.toLowerCase()} hrefForStatus={viewTo}/>}
    {summary.available !== false && !summary.applicable && <p className="bd-muted bd-small" data-testid="readiness-empty">No applicable {unit} yet: readiness not calculated.</p>}
    {summary.na > 0 && <Link className="bd-muted bd-small" to={viewTo('not_applicable')}>{summary.na} excluded / not applicable</Link>}
    <details className="bwp-validation-details"><summary>Validation and remediation</summary>
      <ul className="bd-gaps" aria-label={name.split(' ')[0] + ' verification gaps'}>{gaps.map(([view,label,n,tone]) => <li key={view}>
        <Link to={viewTo(view)} className={n ? 'is-' + tone : 'is-clear'}><span>{label}</span><strong>{n}</strong></Link>
      </li>)}</ul>
    </details>
    <p className="bd-muted bd-small bd-program-note">{key === 'soc-2' ? 'Internal readiness, not an auditor opinion.' : 'Assessment progress, not a compliance determination.'}</p>
  </section>;
}
