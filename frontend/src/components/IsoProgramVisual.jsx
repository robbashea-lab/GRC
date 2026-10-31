import {ArrowLeft} from 'lucide-react';
import {frameworkCatalog} from '@/lib/frameworks';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {ProgramVisualHeader,ProgramVisualSnapshot,ProgramVisualSummary} from './ProgramVisualPrimitives';
import IsoProgramApplicabilityBar from './IsoProgramApplicabilityBar';
import './BrawndoCisVisual.css';
import './BrawndoCisVisualShell.css';
import './SixSurfaceAppearance.css';
import './IsoProgramVisual.css';

export const ISO_PROGRAM_STATUS_LABELS=operatorStatuses('iso-27001');
export const ISO_SECTION_TITLES={overview:'ISO 27001',soa:'Statement of Applicability',isms_clause:'ISMS Requirements',annex_control:'Annex A Controls',audit:'Internal Audit'};
const percentage=(count,total)=>total>0?(count/total*100).toFixed(1):null;
export const isoSourceDate=value=>value?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):null;

export function IsoProgramHeader({view,presentation,resume,onContinue,onOverview,theme,onTheme}){
  const catalog=frameworkCatalog('iso-27001'),summary=view==='isms_clause'?presentation.requirements:view==='annex_control'?presentation.annex:presentation.overall;
  const noun=view==='isms_clause'?'ISMS requirements':view==='annex_control'?'Annex A reference controls':'requirements and controls';
  const count=summary.available?`${summary.total} ${noun}`:'Implementation source unavailable';
  const asOf=view==='audit'?null:isoSourceDate(presentation.sourceAsOf);
  const beforeTitle=view!=='overview'?<button type="button" className="link" onClick={onOverview}><ArrowLeft size={14} aria-hidden="true"/>Back to ISO overview</button>:null;
  return <ProgramVisualHeader title={ISO_SECTION_TITLES[view]} metadata={[catalog.version,view==='audit'?'Planned audit work':view==='soa'?'Annex A reference decisions':count,asOf?`Record state as of ${asOf}`:null].filter(Boolean).join(' · ')}
    beforeTitle={beforeTitle} className="iso-program-heading" focusHeading {...{resume,onContinue,theme,onTheme}}/>;
}

export function IsoProgramSnapshot({summary,presentation,filter,onFilter,noun='requirements and controls',id='bcis-summary-heading'}){
  const scope=presentation.soa;
  return <ProgramVisualSnapshot {...{summary,filter,onFilter,noun,id}} asOf={isoSourceDate(presentation.sourceAsOf)} asOfLabel="Record state as of" missingAsOfLabel="Record-state date unavailable"
    statusLabels={ISO_PROGRAM_STATUS_LABELS} onSegmentFilter={onFilter}
    qualification={<>Implementation and assessment progress, not certification or complete program readiness. Verification and applicability decisions remain separate.
      {scope.countsAvailable&&<> {scope.undetermined} Annex A applicability decisions unresolved; {scope.excluded} excluded.</>}</>}/>;
}

const APPLICABILITY=[['included','Necessary','impl','applicable'],['excluded','Not necessary','part','excluded'],['undetermined','Decision needed','none','undetermined']];
export function IsoSoaSnapshot({presentation,applicability='all',onApplicability}){
  const s=presentation.soa,available=s.countsAvailable,asOf=isoSourceDate(presentation.sourceAsOf);
  const pick=key=>onApplicability(applicability===key?'all':key);
  return <ProgramVisualSummary id="iso-soa-summary" label="Statement of Applicability status" footer={<>Annex A reference decisions only. Necessary organization-specific controls and complete-SoA evidence remain in the existing SoA workflow. Applicability and implementation are separate.
    {!available&&<> {s.reason}</>}</>}>
    <div className="now-head"><span className="now-label">Annex A decisions documented</span><strong className="now-value">{available&&s.total?percentage(s.documented,s.total):'—'}{available&&s.total>0&&<span className="unit">%</span>}</strong>
      <p>{available?`${s.documented} of ${s.total} decisions documented`:'Applicability source unavailable'}</p><small>{asOf?`Record state as of ${asOf}`:'Record-state date unavailable'}</small></div>
    <div className="now-detail"><div className="bd-head"><span className="bd-title">Applicability of {available?s.total:'—'} Annex A controls</span><span>{available?`${s.decided} decisions recorded · ${s.outstanding} documentation outstanding`:'Decision counts unavailable'}</span></div>
      <IsoProgramApplicabilityBar counts={s} available={available} filter={applicability} onFilter={pick}/>
      <div className="lg iso-soa-legend" role="group" aria-label="Filter applicability">{APPLICABILITY.map(([key,label,tone,count])=><button type="button" className="lg-cell" key={key} aria-pressed={applicability===key} onClick={()=>pick(key)}>
        <span className="lg-label"><i className={`key s-${tone}`}/>{label}</span><span className="lg-val"><b>{available&&s.total?`${percentage(s[count],s.total)}%`:'—'}</b><span>{available?`${s[count]} of ${s.total}`:'Unavailable'}</span></span></button>)}</div>
      {available&&s.missingJustification>0&&<p role="status">{s.missingJustification} recorded decisions still need their native justification.</p>}
    </div>
  </ProgramVisualSummary>;
}
