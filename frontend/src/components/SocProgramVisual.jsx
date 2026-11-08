import {ArrowLeft} from 'lucide-react';
import {ProgramVisualHeader,ProgramVisualSnapshot} from './ProgramVisualPrimitives';
import {SOC_PROGRAM_STATUS_LABELS} from '@/lib/socProgramPresentation';
import './BrawndoCisVisual.css';
import './BrawndoCisVisualShell.css';
import './SixSurfaceAppearance.css';

export function SocProgramHeader({categories,summary,resume,onContinue,theme,onTheme,categoryLabel='',onOverview,edition='',sourceLabel='',asOf}){
  const count=Number.isInteger(summary.total)?`${summary.total} criteria${categoryLabel?' in this category':' in scope'}`:'Criterion count unavailable';
  const scope=categoryLabel||!Number.isInteger(summary.total)?count:`${categories.length} selected Trust Services ${categories.length===1?'Category':'Categories'} · ${count}`;
  const metadata=[sourceLabel,edition,scope,asOf?`As of ${asOf}`:null].filter(Boolean).join(' · ');
  const beforeTitle=categoryLabel&&onOverview?<button type="button" className="link soc-program-back" onClick={onOverview}><ArrowLeft size={14} aria-hidden="true"/>Back to SOC 2</button>:null;
  return <ProgramVisualHeader title={categoryLabel||'SOC 2'} metadata={metadata} className="soc-program-heading" focusHeading beforeTitle={beforeTitle}
    {...{resume,onContinue,theme,onTheme}}/>;
}

export function SocProgramSnapshot({summary,filter,onFilter,asOf}){
  return <ProgramVisualSnapshot summary={summary} filter={filter} onFilter={onFilter} asOf={asOf} noun="criteria" id="bcis-summary-heading"
    statusLabels={SOC_PROGRAM_STATUS_LABELS} onSegmentFilter={onFilter} onNotApplicable={onFilter}
    qualification="Assessment progress, not a compliance percentage, certification or audit opinion. Freshness is separate from saved verification."/>;
}
