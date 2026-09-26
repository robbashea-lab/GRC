import {AlertTriangle,Clock3,FileX2,FlagOff,ListChecks,SearchCheck,CircleDashed,PlayCircle} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Button} from './ui/button';
import {CIS_ORDER,CIS_TONE,CisStatusBar} from './CisStatus';
import {operatorVocabulary} from '@/lib/frameworkOperator';

const FIELD={addressed:'addressed',in_progress:'partial',needs_attention:'gap',not_assessed:'notAssessed',not_applicable:'na'};

const SIGNALS=v=>[
  ['needs_attention',v.statuses.needs_attention,'gap',AlertTriangle,'critical'],
  ['unremediated','Gaps without a Finding','unremediated',FlagOff,'critical'],
  ['overdue_actions','Overdue remediation','overdueActions',Clock3,'critical'],
  ['stale','Validation older than 12 months','stale',SearchCheck,'moderate'],
  ['unevidenced',`${v.statuses.addressed} without evidence`,'unevidenced',FileX2,'moderate'],
  ['in_progress',v.statuses.in_progress,'partial',ListChecks,'moderate'],
  ['not_assessed','Not yet assessed','notAssessed',CircleDashed,'neutral'],
];

// Operational summary: what has been evaluated, what it concluded, and what needs work.
export default function CisWorkspaceSummary({summary:s,filter,onFilter,resume,onContinue,framework='cis-ig1',scopeLabel,children}){
  const pick=key=>onFilter(filter===key?'all':key),v=operatorVocabulary(framework);
  return <section className="cis-summary" aria-labelledby="cis-summary-heading">
    <div className="cis-summary-head">
      <h2 id="cis-summary-heading">{scopeLabel ? `${scopeLabel} condition` : 'Program condition'}</h2>
      <Link className="cis-config-link" to="/client-profile?tab=program">Program configuration</Link>
      {resume&&<Button size="sm" onClick={onContinue} aria-label={`Continue assessment: ${resume.definition_id} ${resume.title}`}><PlayCircle className="h-4 w-4 mr-1.5" aria-hidden="true"/>Continue with {resume.definition_id}</Button>}
    </div>
    <div className="cis-summary-grid">
      <div className="cis-summary-measures">
        <div className="cis-measure-pair">
          <div><p className="cis-measure-label">Assessment coverage</p><p className="cis-measure-value">{s.coverage}%</p><p className="cis-measure-sub">{s.assessed} of {s.applicable} applicable {v.items} assessed</p></div>
          <div><p className="cis-measure-label">{v.statuses.addressed}</p><p className="cis-measure-value text-semantic-success">{s.implemented}%</p><p className="cis-measure-sub">{s.addressed} of {s.applicable} concluded {v.statuses.addressed}</p></div>
        </div>
        <CisStatusBar counts={Object.fromEntries(CIS_ORDER.map(k=>[k,s[FIELD[k]]]))} className="h-2.5"/>
        <div className="cis-legend" role="group" aria-label="Filter by assessment status">
          {CIS_ORDER.map(status=>{const n=s[FIELD[status]];
            return <button key={status} type="button" aria-pressed={filter===status} onClick={()=>pick(status)} className={`cis-legend-item cis-tone-${CIS_TONE[status]}`}><span className="cis-dot" aria-hidden="true"/>{v.statuses[status]}<strong>{n}</strong></button>;})}
        </div>
        <p className="cis-footnote">{scopeLabel ? `Coverage is limited to the ${scopeLabel} view, not the whole program.` : `Coverage shows how much of ${v.scope} has been evaluated.`} Neither measure is a compliance percentage, certification or audit opinion.</p>
        {children}
      </div>
      <div className="cis-signals" role="group" aria-label="Requires attention">
        <p className="cis-measure-label">Requires attention</p>
        {SIGNALS(v).map(([key,label,field,Icon,tone])=>{const n=s[field];return <button key={key} type="button" aria-pressed={filter===key} disabled={!n&&filter!==key} onClick={()=>pick(key)} className={`cis-signal ${n?`cis-tone-${tone}`:'is-clear'}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true"/><span className="flex-1 text-left">{label}</span><strong className="tabular-nums">{n}</strong></button>;})}
      </div>
    </div>
  </section>;
}
