import {Moon,Sun} from 'lucide-react';
import {Button} from './ui/button';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import './BrawndoCisOverview.css';

// Brawndo CIS IG1 overview: where the program stands, what to do next, then the controls.
const SEGMENTS=[['addressed','Implemented','good'],['partial','Partial','attention'],['gap','Not implemented','critical'],['notAssessed','Not assessed','neutral']];
const FILTER={addressed:'addressed',partial:'in_progress',gap:'needs_attention',notAssessed:'not_assessed'};
export function BrawndoCisHeader({resume,onContinue}){
  const [theme,setTheme]=useBrawndoTheme();
  return <header className="bcis-head">
    <div><p className="bcis-eyebrow">CIS Controls v8.1 IG1</p><h1>CIS IG1</h1></div>
    <div className="bcis-actions">
      <button type="button" className="bcis-theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-pressed={theme==='dark'} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>{theme==='dark'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}<span>{theme==='dark'?'Light':'Dark'}</span></button>
      {resume&&<Button className="bcis-primary" onClick={onContinue} aria-label={`Continue assessment: ${resume.definition_id} ${resume.title}`}>Continue with {resume.definition_id}</Button>}
    </div>
  </header>;
}
// Share of applicable safeguards for a segment; assessment progress only, never a compliance score.
export function segmentShare(n,applicable){return applicable?Math.round(n/applicable*100):0;}
export function AssessmentOverview({summary:s,filter,onFilter,resume,itemNoun='safeguards',continueNoun='safeguard',testIdPrefix='bcis',segmentLabels={}}){
  const pick=key=>onFilter(filter===key?'all':key);
  return <section className="bcis-card bcis-summary" aria-labelledby="bcis-summary-heading">
      <h2 id="bcis-summary-heading" className="sr-only">Program condition</h2>
      <div className="bcis-figures">
        <div><p className="bcis-figure">{s.implemented}%</p><p className="bcis-figure-label">Implemented</p><p className="bcis-figure-sub">{s.addressed} of {s.applicable} {itemNoun}</p></div>
        <div><p className="bcis-figure">{s.coverage}%</p><p className="bcis-figure-label">Assessed</p><p className="bcis-figure-sub">{s.assessed} of {s.applicable} {itemNoun}</p></div>
        <div><p className="bcis-figure">{s.notAssessed}</p><p className="bcis-figure-label">Still to assess</p><p className="bcis-figure-sub">{resume?`Continue with ${continueNoun} ${resume.definition_id}`:`Every ${continueNoun} has been assessed`}</p></div>
      </div>
      <div className="bcis-bar" role="group" aria-label="Assessment progress by status">{SEGMENTS.map(([k,defaultLabel,tone])=>s[k]>0&&(()=>{const label=segmentLabels[k]||defaultLabel,pct=segmentShare(s[k],s.applicable),text=`${label}: ${s[k]} of ${s.applicable} ${itemNoun}, ${pct}%`;
        return <span key={k} className={`is-${tone}`} style={{width:`${s[k]/Math.max(1,s.applicable)*100}%`}} tabIndex={0} role="img" aria-label={text} data-testid={`${testIdPrefix}-seg-${k}`}>
          <span className="bcis-tip" aria-hidden="true"><strong>{label}</strong><span>{s[k]} of {s.applicable} {itemNoun}</span><span>{pct}%</span></span></span>;})())}</div>
      <div className="bcis-legend" role="group" aria-label="Filter by assessment status">
        {SEGMENTS.map(([k,defaultLabel,tone])=>{const label=segmentLabels[k]||defaultLabel;return <button key={k} type="button" aria-pressed={filter===FILTER[k]} onClick={()=>pick(FILTER[k])} className={`is-${tone}`}><span aria-hidden="true"/>{label}<strong>{s[k]}</strong></button>;})}
        {s.na>0&&<span className="bcis-legend-na">Not applicable <strong>{s.na}</strong></span>}
      </div>
      <p className="bcis-note">These figures show assessment progress, not a compliance percentage, certification or audit opinion.</p>
    </section>;
}
export default function BrawndoCisOverview(props){return <AssessmentOverview {...props}/>;}
