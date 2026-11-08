import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import IsoGuidedAssessor from './IsoGuidedAssessor';
import IsoGuidedProgram from './IsoGuidedProgram';
import {isoAssessmentConflicts,auditProgrammeMetrics,auditProgrammeYears} from '@/lib/isoProgramMetrics';
import {ISO_PROGRAM_STATUS_LABELS} from './IsoProgramVisual';
import './IsoProgramVisual.css';

const percent=(value,total)=>total>0?(value/total*100).toFixed(1):null;
const TONES={good:'impl',attention:'part',critical:'not',neutral:'none'};
const Segments=({segments,total,label})=><span className="sbar" role="img" aria-label={label}>{segments.filter(segment=>segment.value>0).map(segment=><i key={segment.label} className={'s-'+TONES[segment.tone]} style={{flex:segment.value}} title={`${segment.label}: ${segment.value} of ${total}`}/>)}</span>;
const Card=({view,title,metric,complete,total,segments,items,onSelect,available=true,emptyLabel='No applicable records'})=><button type="button" className="iso-program-card" onClick={()=>onSelect(view)} aria-label={`Open ${title}. ${metric}`}>
  <span className="iso-program-title">{title}<span aria-hidden="true">›</span></span>
  <span className="iso-card-snapshot"><span className="iso-card-current"><strong className="now-value iso-card-value">{available&&total>0?<>{percent(complete,total)}<span className="unit">%</span></>:'—'}</strong>
    <span className="iso-program-metric">{metric}</span>{available&&total===0&&<span className="iso-program-progress">{emptyLabel}</span>}</span>
    <span className="iso-card-distribution"><Segments segments={available?segments:[]} total={total} label={available?`${title}: ${complete} of ${total}`:`${title}: source unavailable`}/>
      <span className="iso-program-breakdown">{items.map(item=><span key={item}>{item}</span>)}</span></span></span>
</button>;
const implementationSegments=count=>[{value:count.addressed,tone:'good',label:'Implemented'},{value:count.partial,tone:'attention',label:'Partially implemented'},{value:count.gap,tone:'critical',label:ISO_PROGRAM_STATUS_LABELS.needs_attention},{value:count.notAssessed,tone:'neutral',label:'Not assessed'}];
const implementationItems=count=>count.available?[`${count.addressed} implemented`,`${count.partial} partially implemented`,`${count.gap} ${ISO_PROGRAM_STATUS_LABELS.needs_attention.toLowerCase()}`,`${count.notAssessed} not assessed`,`${count.assessed} of ${count.applicable} assessed`]:['Implementation source unavailable'];

export default function IsoProgramWorkspace({clientId,mode,rows,onSelect,onRecommend,configuration,presentation,draftSummaries,auditYear='',onAuditYearChange}){
  const [reviewContext,setReviewContext]=useState({clientId:null,reviews:null,error:''}),[selectedYear,setSelectedYear]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setReviewContext({clientId,reviews:null,error:''});setSelectedYear('');
    api.get('/iso-audit',{params:{client_id:clientId},signal:controller.signal}).then(({data})=>{
      if(!Array.isArray(data?.reviews))throw new Error('Audit program records could not be loaded.');
      if(!controller.signal.aborted)setReviewContext({clientId,reviews:data.reviews,error:''});
    }).catch(error=>{if(!controller.signal.aborted)setReviewContext({clientId,reviews:null,error:formatError(error)});});
    return()=>controller.abort();
  },[clientId]);
  // A client change cannot briefly present the previous client's audit history.
  const {reviews,error}=reviewContext.clientId===clientId?reviewContext:{reviews:null,error:''};
  const {soa,requirements,annex}=presentation,years=auditProgrammeYears(reviews||[]);
  const now=String(new Date().getFullYear()),year=auditYear||selectedYear||(years.includes(now)?now:years.at(-1)||now),audit=auditProgrammeMetrics(reviews||[],year);
  const yearOptions=[...new Set([...years,year])].sort();
  if(mode!=='overview')return null;
  return <section className="iso-program-overview" aria-label="ISMS Overview">
    <IsoGuidedAssessor clientId={clientId} configuration={configuration} programContent={({close})=><IsoGuidedProgram rows={rows} reviews={error?null:reviews} drafts={draftSummaries} onSelect={item=>{close();onRecommend(item);}} onViewAll={()=>{close();onSelect('overview');}}/>}/>
    {!!isoAssessmentConflicts(rows).length&&<p role="alert" className="text-sm text-semantic-critical">Legacy assessment conflicts require review: {isoAssessmentConflicts(rows).map(row=>row.definition_id).join(', ')}. A mandatory requirement or applicable control has a Not Applicable implementation status. Saved values are retained, not counted as implemented, and have not been migrated.</p>}
    <label className="f-field">Audit-program year <select aria-label="Audit-program year" value={year} onChange={event=>{setSelectedYear(event.target.value);onAuditYearChange?.(event.target.value);}}>{yearOptions.map(value=><option key={value}>{value}</option>)}</select></label>
    {error&&<p role="alert" className="text-sm text-semantic-critical">Audit program could not be loaded. {error}</p>}
    <div className="iso-program-grid">
      <Card view="soa" title="Statement of Applicability" metric={soa.countsAvailable?`${soa.documented} of ${soa.total} Annex A decisions documented`:'Applicability source unavailable'} complete={soa.documented} total={soa.total} available={soa.countsAvailable} onSelect={onSelect}
        segments={[{value:soa.applicable,tone:'good',label:'Necessary'},{value:soa.excluded,tone:'attention',label:'Not necessary'},{value:soa.undetermined,tone:'neutral',label:'Decision needed'}]}
        items={soa.countsAvailable?[`${soa.decided} decisions recorded`,`${soa.missingJustification} justifications outstanding`,`${soa.undetermined} decisions unresolved`]:['Annex A decision counts unavailable']}/>
      <Card view="isms_clause" title="ISMS Requirements" metric={requirements.available?`${requirements.addressed} of ${requirements.applicable} requirements implemented`:'Implementation source unavailable'} complete={requirements.addressed} total={requirements.applicable} available={requirements.available} segments={implementationSegments(requirements)} items={implementationItems(requirements)} onSelect={onSelect}/>
      <Card view="annex_control" title="Annex A Controls" metric={annex.available?`${annex.addressed} of ${annex.applicable} applicable controls implemented`:'Implementation source unavailable'} complete={annex.addressed} total={annex.applicable} available={annex.available} segments={implementationSegments(annex)} items={[...implementationItems(annex),soa.countsAvailable?`${soa.undetermined} applicability unresolved · ${soa.excluded} excluded`:'Applicability source unavailable']} onSelect={onSelect}/>
      {reviews&&!error?<Card view="audit" title="Internal Audit" metric={audit.total?`${audit.complete} of ${audit.total} planned audit checks completed · ${year}`:`Not scheduled · ${year}`} complete={audit.complete} total={audit.total} emptyLabel="Not scheduled" onSelect={view=>onSelect(view,{audit_year:year})}
        segments={[{value:audit.complete,tone:'good',label:'Complete'},{value:audit.total-audit.complete,tone:'neutral',label:'Pending'}]}
        items={audit.quarters.map(quarter=>`Q${quarter.quarter}: ${quarter.total?`${quarter.complete} of ${quarter.total} · ${percent(quarter.complete,quarter.total)}%`:'Not scheduled'}`)}/>:<div className="iso-program-card" role="status">Internal Audit · {error?'Unavailable':'Loading program…'}</div>}
    </div>
  </section>;
}
