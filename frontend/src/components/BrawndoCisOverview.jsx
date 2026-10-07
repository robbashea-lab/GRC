import AssessmentMetrics from './AssessmentMetrics';
import {Moon,Sun} from 'lucide-react';
import {Button} from './ui/button';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import './BrawndoCisOverview.css';
import Donut from './ProgramDonut';

// Brawndo CIS IG1 overview: where the program stands, what to do next, then the controls.
const SEGMENTS=[['addressed','Implemented','good'],['partial','Partial','attention'],['gap','Not implemented','critical'],['notAssessed','Not assessed','neutral']];
const FILTER={addressed:'addressed',partial:'in_progress',gap:'needs_attention',notAssessed:'not_assessed'};
// Shared framework workspace header from the approved cross-client visual work.
export function FrameworkHeader({eyebrow,title,subtitle,resume,onContinue}){
  const [theme,setTheme]=useBrawndoTheme();
  return <header className="bcis-head">
    <div><p className="bcis-eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle&&<p className="text-sm text-ink-secondary">{subtitle}</p>}</div>
    <div className="bcis-actions">
      <button type="button" className="bcis-theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-pressed={theme==='dark'} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>{theme==='dark'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}<span>{theme==='dark'?'Light':'Dark'}</span></button>
      {resume&&<Button className="bcis-primary" onClick={onContinue} aria-label={`Continue assessment: ${resume.definition_id} ${resume.title}`}>Continue with {resume.definition_id}</Button>}
    </div>
  </header>;
}
export const BrawndoCisHeader=({implementationGroup=1,...props})=><FrameworkHeader eyebrow={`CIS Controls v8.1 IG${implementationGroup}`} title={`CIS IG${implementationGroup}`} {...props}/>;
// Share of applicable safeguards for a segment; assessment progress only, never a compliance score.
export function segmentShare(n,applicable){return applicable?Math.round(n/applicable*100):0;}
export function AssessmentOverview({summary:s,filter,onFilter,resume,itemNoun='safeguards',continueNoun='safeguard',testIdPrefix='bcis',segmentLabels={},showNext=true,workspacePilot=false,controlCount,implementationGroup=1,programName=`CIS IG${implementationGroup}`,scopeLabel,implementedLabel='Implemented'}){
  const pick=key=>onFilter(filter===key?'all':key);
  const counts={addressed:s.addressed,in_progress:s.partial,needs_attention:s.gap,not_assessed:s.notAssessed};
  return <section className={`bcis-card bcis-summary${workspacePilot?' bwp-cis-snapshot':''}`} aria-labelledby="bcis-summary-heading">
      {workspacePilot&&<Donut counts={counts} summary={s} name={programName} itemNoun={itemNoun} labels={{addressed:implementedLabel,in_progress:segmentLabels.partial||'Partially implemented',needs_attention:segmentLabels.gap||'Not implemented',not_assessed:segmentLabels.notAssessed||'Not assessed'}} caption={implementedLabel}/>}
      <div className={workspacePilot?'bwp-program-content':undefined}>
      {workspacePilot?<div className="bwp-program-heading"><div><p className="bcis-eyebrow">Program snapshot</p><h2 id="bcis-summary-heading">Assessment progress</h2><p className="bcis-note">{scopeLabel||`${controlCount} controls · ${s.total} IG${implementationGroup} safeguards`}</p></div><dl className="bwp-program-counts"><div><dt>{implementedLabel}</dt><dd>{s.addressed} <span>of {s.applicable}</span></dd></div><div><dt>Assessed</dt><dd>{s.assessed} <span>of {s.applicable}</span></dd></div></dl></div>:<><h2 id="bcis-summary-heading" className="sr-only">Program condition</h2><AssessmentMetrics summary={s}/></>}
      {showNext&&<p className="bcis-assessment-next"><strong>{s.notAssessed}</strong> still to assess{resume?` · Continue with ${continueNoun} ${resume.definition_id}`:''}</p>}
      <div className="bcis-bar" role="group" aria-label="Assessment progress by status">{SEGMENTS.map(([k,defaultLabel,tone])=>s[k]>0&&(()=>{const label=segmentLabels[k]||defaultLabel,pct=segmentShare(s[k],s.applicable),text=`${label}: ${s[k]} of ${s.applicable} ${itemNoun}, ${pct}%`;
        return <span key={k} className={`is-${tone}`} style={{width:`${s[k]/Math.max(1,s.applicable)*100}%`}} tabIndex={0} role="img" aria-label={text} data-testid={`${testIdPrefix}-seg-${k}`}>
          <span className="bcis-tip" aria-hidden="true"><strong>{label}</strong><span>{s[k]} of {s.applicable} {itemNoun}</span><span>{pct}%</span></span></span>;})())}</div>
      <div className="bcis-legend" role="group" aria-label="Filter by assessment status">
        {SEGMENTS.map(([k,defaultLabel,tone])=>{const label=segmentLabels[k]||defaultLabel;return <button key={k} type="button" aria-pressed={filter===FILTER[k]} onClick={()=>pick(FILTER[k])} className={`is-${tone}`}><span aria-hidden="true"/>{label}<strong>{s[k]}</strong></button>;})}
        {s.na>0&&<span className="bcis-legend-na">Not applicable <strong>{s.na}</strong></span>}
      </div>
      <p className="bcis-note">These figures show assessment progress, not a compliance percentage, certification or audit opinion.</p>
      </div>
    </section>;
}
export default function BrawndoCisOverview(props){return <AssessmentOverview {...props} showNext={false}/>;}
