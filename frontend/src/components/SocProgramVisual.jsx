import {Moon,Sun} from 'lucide-react';
import {Button} from './ui/button';
import {socCategoryLabel,SOC_STATUS_LABELS} from './PrestigeSocNavigator';
import {segmentShare} from './BrawndoCisOverview';
import './SocProgramVisual.css';

const SEGMENTS=[
  ['addressed','addressed','good'],['in_progress','partial','attention'],
  ['needs_attention','gap','critical'],['not_assessed','notAssessed','neutral'],
];

export function SocProgramHeader({categories,summary,resume,onContinue,theme,onTheme}){
  return <header className="soc-program-heading">
    <div><h1>SOC 2</h1><p>{categories.map(category=>socCategoryLabel(category.id)).join(' · ')}</p>
      <p>{categories.length} selected Trust Services {categories.length===1?'Category':'Categories'} · {summary.total} criteria in scope</p></div>
    <div className="soc-program-heading-actions">
      <button type="button" className="bcis-theme" aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} aria-pressed={theme==='dark'} onClick={onTheme}>
        {theme==='dark'?<Sun size={15} aria-hidden="true"/>:<Moon size={15} aria-hidden="true"/>}{theme==='dark'?'Light':'Dark'}</button>
      {resume&&<Button className="bcis-primary" onClick={onContinue} aria-label={`Continue assessment: ${resume.definition_id} ${resume.title}`}>Continue with {resume.definition_id}</Button>}
    </div>
  </header>;
}

// Counts and conclusions remain owned by the native SOC workspace/canonical position.
export function SocProgramSnapshot({summary:s,filter,onFilter,resume}){
  const available=s.available!==false;
  // Match the existing SOC donut's display precision without changing the calculation.
  const percentage=available&&s.applicable>0?(s.addressed/s.applicable*100).toFixed(1):null;
  const pick=key=>onFilter(filter===key?'all':key);
  return <section className="bcis-card soc-program-snapshot" aria-labelledby="bcis-summary-heading">
    <h2 id="bcis-summary-heading" className="sr-only">SOC 2 readiness snapshot</h2>
    <div className="soc-program-snapshot-body">
      <div className="soc-readiness-current"><span>Addressed (Readiness)</span>
        <strong data-testid="soc-readiness-percentage">{percentage??'—'}{percentage!==null&&<small>%</small>}</strong>
        <p>{available?`${s.addressed} of ${s.applicable} applicable criteria addressed`:'Implementation source unavailable'}</p>
        <p>{available?`${s.notAssessed} still to assess${resume?` · Continue with criterion ${resume.definition_id}`:''}`:s.reason||'Implementation counts are unavailable.'}</p>
      </div>
      <div className="soc-readiness-distribution">
        <div className="soc-readiness-distribution-heading"><span>Status of {available?s.applicable:'—'} applicable criteria</span>
          <span>Assessed {available?s.assessed:'—'} of {available?s.applicable:'—'}</span></div>
        <div className="bcis-bar" role="group" aria-label={available?'Assessment progress by status':'Assessment distribution unavailable'}>
          {available&&SEGMENTS.map(([status,count,tone])=>s[count]>0&&<span key={status} className={`is-${tone}`} style={{width:`${s[count]/s.applicable*100}%`}}
            tabIndex={0} role="img" data-testid={`psoc-seg-${count}`} aria-label={`${SOC_STATUS_LABELS[status]}: ${s[count]} of ${s.applicable} criteria, ${segmentShare(s[count],s.applicable)}%`}>
            <span className="bcis-tip" aria-hidden="true"><strong>{SOC_STATUS_LABELS[status]}</strong><span>{s[count]} of {s.applicable} criteria</span><span>{segmentShare(s[count],s.applicable)}%</span></span>
          </span>)}
        </div>
        <div className="bcis-legend soc-readiness-legend" role="group" aria-label="Filter by assessment status">
          {SEGMENTS.map(([status,count,tone])=><button type="button" key={status} className={`is-${tone}`} aria-pressed={filter===status} onClick={()=>pick(status)}>
            <span aria-hidden="true"/>{SOC_STATUS_LABELS[status]}<strong>{available?s[count]:'—'}</strong>
            <small>{available?`${segmentShare(s[count],s.applicable)}% of applicable criteria`:'Counts unavailable'}</small>
          </button>)}
        </div>
      </div>
    </div>
    <div className="soc-readiness-qualification">
      <p>These figures show assessment progress, not a compliance percentage, certification or audit opinion. Saved verification is separate from readiness.</p>
      {available&&s.na>0&&<button type="button" className="bcis-legend-na" aria-pressed={filter==='not_applicable'} onClick={()=>pick('not_applicable')}>{SOC_STATUS_LABELS.not_applicable} <strong>{s.na}</strong> · excluded from applicable totals</button>}
    </div>
  </section>;
}
