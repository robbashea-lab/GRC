import {AlertTriangle,Clock3,FileX2,FlagOff,ListChecks,SearchCheck,CircleDashed,PlayCircle} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Button} from './ui/button';
import {CIS_ORDER,CIS_TONE,CisStatusBar,cisLabel} from './CisStatus';

const FIELD={addressed:'addressed',in_progress:'partial',needs_attention:'gap',not_assessed:'notAssessed',not_applicable:'na'};

const SIGNALS=[
  ['needs_attention','Not implemented / needs validation','gap',AlertTriangle,'critical'],
  ['unremediated','Gaps without a Finding','unremediated',FlagOff,'critical'],
  ['overdue_actions','Overdue remediation actions','overdueActions',Clock3,'critical'],
  ['stale','Validation older than 12 months','stale',SearchCheck,'moderate'],
  ['unevidenced','Implemented without evidence','unevidenced',FileX2,'moderate'],
  ['in_progress','Partially implemented','partial',ListChecks,'moderate'],
  ['not_assessed','Not yet assessed','notAssessed',CircleDashed,'neutral'],
];

// Operational summary: what has been evaluated, what it concluded, and what needs work.
export default function CisWorkspaceSummary({summary:s,filter,onFilter,resume,onContinue}){
  const pick=key=>onFilter(filter===key?'all':key);
  return <section className="cis-summary" aria-labelledby="cis-summary-heading">
    <div className="cis-summary-head">
      <h2 id="cis-summary-heading">Program condition</h2>
      <Link className="cis-config-link" to="/client-profile?tab=program">Program configuration</Link>
      {resume&&<Button size="sm" onClick={onContinue} aria-label={`Continue assessment: ${resume.definition_id} ${resume.title}`}><PlayCircle className="h-4 w-4 mr-1.5" aria-hidden="true"/>Continue with {resume.definition_id}</Button>}
    </div>
    <div className="cis-summary-grid">
      <div className="cis-summary-measures">
        <div className="cis-measure-pair">
          <div><p className="cis-measure-label">Assessment coverage</p><p className="cis-measure-value">{s.coverage}%</p><p className="cis-measure-sub">{s.assessed} of {s.applicable} applicable safeguards assessed</p></div>
          <div><p className="cis-measure-label">Implemented</p><p className="cis-measure-value text-semantic-success">{s.implemented}%</p><p className="cis-measure-sub">{s.addressed} of {s.applicable} concluded Implemented</p></div>
        </div>
        <CisStatusBar counts={Object.fromEntries(CIS_ORDER.map(k=>[k,s[FIELD[k]]]))} className="h-2.5"/>
        <div className="cis-legend" role="group" aria-label="Filter by assessment status">
          {CIS_ORDER.map(status=>{const n=s[FIELD[status]];
            return <button key={status} type="button" aria-pressed={filter===status} onClick={()=>pick(status)} className={`cis-legend-item cis-tone-${CIS_TONE[status]}`}><span className="cis-dot" aria-hidden="true"/>{cisLabel(status)}<strong>{n}</strong></button>;})}
        </div>
        <p className="cis-footnote">Coverage shows how much of IG1 has been evaluated. Neither measure is a compliance percentage or certification.</p>
      </div>
      <div className="cis-signals" role="group" aria-label="Requires attention">
        <p className="cis-measure-label">Requires attention</p>
        {SIGNALS.map(([key,label,field,Icon,tone])=>{const n=s[field];return <button key={key} type="button" aria-pressed={filter===key} disabled={!n&&filter!==key} onClick={()=>pick(key)} className={`cis-signal ${n?`cis-tone-${tone}`:'is-clear'}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true"/><span className="flex-1 text-left">{label}</span><strong className="tabular-nums">{n}</strong></button>;})}
      </div>
    </div>
  </section>;
}
