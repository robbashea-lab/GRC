import './AssessmentMetrics.css';

// The caller owns the calculation and framework vocabulary; this only presents the two measures.
export default function AssessmentMetrics({summary:s,implementedLabel='Implemented'}){
  return <dl className="assessment-metrics" aria-label="Assessment metrics">
    <div className="assessment-metric is-implemented"><dt>{implementedLabel}</dt><dd><strong>{s.available!==false&&s.applicable?`${s.implemented}%`:'—'}</strong><span>{s.available===false?'Counts unavailable':`${s.addressed} of ${s.applicable}`}</span></dd></div>
    <div className="assessment-metric"><dt>Assessed</dt><dd><strong>{s.available!==false&&s.applicable?`${s.coverage}%`:'—'}</strong><span>{s.available===false?'Counts unavailable':`${s.assessed} of ${s.applicable}`}</span></dd></div>
  </dl>;
}
