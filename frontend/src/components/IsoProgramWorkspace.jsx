import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import IsoGuidedAssessor from './IsoGuidedAssessor';
import IsoGuidedProgram from './IsoGuidedProgram';
import {isoProgramMetrics,isoAssessmentConflicts,auditProgrammeMetrics,auditProgrammeYears} from '@/lib/isoProgramMetrics';
import {operatorStatuses} from '@/lib/frameworkOperator';
import './IsoProgramVisual.css';

const percent=(value,total)=>total?Math.round(value/total*100):0;
const Segments=({segments,total,label})=><div className="iso-program-bar" role="img" aria-label={label}>{segments.filter(s=>s.value).map(s=><span key={s.label} className={'is-'+s.tone} style={{width:`${s.value/Math.max(total,1)*100}%`}} title={`${s.label}: ${s.value}`}/>)}</div>;
const Card=({view,title,metric,complete,total,segments,items,onSelect})=><button type="button" className="iso-program-card" onClick={()=>onSelect(view)} aria-label={`Open ${title}. ${metric}`}>
  <span className="iso-program-title">{title}<span aria-hidden="true">›</span></span>
  <span className="iso-card-snapshot">
    <span className="iso-card-current"><strong className="iso-card-value">{total?<>{percent(complete,total)}<small>%</small></>:'—'}</strong>
      <span className="iso-program-metric">{metric}</span>{!total&&<span className="iso-program-progress">No planned records</span>}</span>
    <span className="iso-card-distribution"><Segments segments={segments} total={total} label={`${title}: ${complete} of ${total}`}/>
      <span className="iso-program-breakdown">{items.map(item=><span key={item}>{item}</span>)}</span></span>
  </span>
</button>;
const implementationSegments=c=>[{value:c.implemented,tone:'good',label:'Implemented'},{value:c.partial,tone:'attention',label:'Partially implemented'},{value:c.notImplemented,tone:'critical',label:'Not implemented'},{value:c.notAssessed,tone:'neutral',label:'Not assessed'}];
const implementationItems=c=>[`${c.implemented} implemented`,`${c.partial} partially implemented`,`${c.notImplemented} not implemented`,`${c.notAssessed} not assessed`];
const implementationStatuses=[['addressed','implemented','good'],['in_progress','partial','attention'],['needs_attention','notImplemented','critical'],['not_assessed','notAssessed','neutral']];

export function IsoImplementationSummary({rows,view,filter,onFilter}){
  const metrics=isoProgramMetrics(rows),clauses=view==='isms_clause',counts=clauses?metrics.requirements:metrics.annex;
  const noun=clauses?'ISMS requirements':'applicable controls',labels=operatorStatuses('iso-27001');
  const conflicts=isoAssessmentConflicts(rows),savedNA=rows.filter(row=>row.status==='not_applicable').length;
  const pick=status=>onFilter(filter===status?'all':status);
  return <section className="bcis-card iso-implementation-summary" aria-labelledby="bcis-summary-heading">
    <h2 id="bcis-summary-heading" className="sr-only">{clauses?'ISMS':'Annex A'} implementation snapshot</h2>
    <div className="iso-summary-layout"><div className="iso-summary-current"><span>Current implementation</span>
      <strong>{counts.total?<>{percent(counts.implemented,counts.total)}<small>%</small></>:'—'}</strong>
      <p className="bwp-program-counts">{counts.implemented} of {counts.total} {noun} implemented</p>
      {!clauses&&<p>{metrics.soa.undetermined} applicability not determined · {metrics.soa.excluded} excluded</p>}
    </div><div className="iso-summary-distribution"><p>Status of {counts.total} {noun}</p>
      <div className="bcis-bar" role="group" aria-label="Implementation status distribution">{implementationStatuses.map(([status,key,tone])=>counts[key]>0&&<span key={status} className={`is-${tone}`} style={{width:`${counts[key]/counts.total*100}%`}} tabIndex={0} role="img" aria-label={`${labels[status]}: ${counts[key]} of ${counts.total}`}>
        <span className="bcis-tip" aria-hidden="true"><strong>{labels[status]}</strong><span>{counts[key]} of {counts.total} {noun}</span><span>{percent(counts[key],counts.total)}%</span></span>
      </span>)}</div>
      <div className="bcis-legend iso-summary-legend" role="group" aria-label="Filter implementation status">{implementationStatuses.map(([status,key,tone])=><button type="button" key={status} className={`is-${tone}`} aria-pressed={filter===status} onClick={()=>pick(status)}>
        <span aria-hidden="true"/>{labels[status]}<strong>{counts[key]}</strong><small>{counts.total?`${percent(counts[key],counts.total)}%`:'—'}</small>
      </button>)}</div>
    </div></div>
    <div className="iso-summary-qualification"><p>Assessment and implementation progress, not certification status or an audit opinion. Saved verification and applicability decisions are separate.</p>
      {savedNA>0&&<span className="bcis-legend-na">{labels.not_applicable} <strong>{savedNA}</strong> · saved status</span>}
      {conflicts.length>0&&<p role="alert">Legacy assessment conflicts require review: {conflicts.map(row=>row.definition_id).join(', ')}. Saved values and history are retained; these records are not counted as implemented.</p>}
    </div>
  </section>;
}

export function IsoSoaSummary({rows}){
  const {soa}=isoProgramMetrics(rows);
  return <section className="bcis-card iso-workspace-summary" aria-label="Statement of Applicability status">
    <div><p className="bcis-measure-label">Annex A applicability decisions</p><p className="iso-workspace-figure">{percent(soa.decided,soa.total)}%</p><p className="text-sm text-ink-secondary">{soa.decided} of {soa.total} decisions recorded</p></div>
    <Segments total={soa.total} label={`Statement of Applicability: ${soa.decided} of ${soa.total} decisions recorded`} segments={[{value:soa.applicable,tone:'good',label:'Applicable'},{value:soa.excluded,tone:'attention',label:'Excluded'},{value:soa.undetermined,tone:'neutral',label:'Not determined'}]}/>
    <div className="iso-workspace-breakdown"><span>Applicable <strong>{soa.applicable}</strong></span><span>Not applicable / excluded <strong>{soa.excluded}</strong></span><span>Not determined <strong>{soa.undetermined}</strong></span></div>
    <p className="bcis-note">Annex A reference scope only, not the complete necessary-control universe. Applicability decisions and implementation assessments are separate. Open Necessary organization-specific Controls below to connect additional controls and retain a controlled complete SoA through the existing SoA Review. A link does not establish completeness.</p>
  </section>;
}

export default function IsoProgramWorkspace({clientId,mode,rows,onSelect,onRecommend,configuration,draftSummaries,auditYear='',onAuditYearChange}){
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
  const {soa,requirements,annex}=isoProgramMetrics(rows),years=auditProgrammeYears(reviews||[]);
  const now=String(new Date().getFullYear()),year=auditYear||selectedYear||(years.includes(now)?now:years.at(-1)||now),audit=auditProgrammeMetrics(reviews||[],year);
  const yearOptions=[...new Set([...years,year])].sort();
  if(mode!=='overview')return null;
  return <section className="iso-program-overview" aria-label="ISMS Overview">
    <IsoGuidedAssessor clientId={clientId} configuration={configuration} programContent={({close})=><IsoGuidedProgram rows={rows} reviews={error?null:reviews} drafts={draftSummaries} onSelect={item=>{close();onRecommend(item);}} onViewAll={()=>{close();onSelect('overview');}}/>}/>
    <p className="text-sm text-ink-secondary">Figures show assessment and program progress, not certification status or audit opinion.</p>
    {!!isoAssessmentConflicts(rows).length&&<p role="alert" className="text-sm text-semantic-critical">Legacy assessment conflicts require review: {isoAssessmentConflicts(rows).map(r=>r.definition_id).join(', ')}. A mandatory requirement or applicable control has a Not Applicable implementation status. Saved values are retained, not counted as implemented, and have not been migrated.</p>}
    <label className="block text-sm">Audit-program year <select aria-label="Audit-program year" value={year} onChange={e=>{setSelectedYear(e.target.value);onAuditYearChange?.(e.target.value);}}>{yearOptions.map(y=><option key={y}>{y}</option>)}</select></label>
    {error&&<p role="alert" className="text-sm text-semantic-critical">Audit program could not be loaded. {error}</p>}
    <div className="iso-program-grid">
      <Card view="soa" title="Statement of Applicability" metric={`${soa.decided} of ${soa.total} applicability decisions completed`} complete={soa.decided} total={soa.total} onSelect={onSelect}
        segments={[{value:soa.applicable,tone:'good',label:'Applicable'},{value:soa.excluded,tone:'attention',label:'Excluded'},{value:soa.undetermined,tone:'neutral',label:'Not determined'}]}
        items={[`${soa.applicable} applicable`,`${soa.excluded} not applicable / excluded`,`${soa.undetermined} not determined`]}/>
      <Card view="isms_clause" title="ISMS Requirements" metric={`${requirements.implemented} of ${requirements.total} requirements implemented`} complete={requirements.implemented} total={requirements.total} segments={implementationSegments(requirements)} items={implementationItems(requirements)} onSelect={onSelect}/>
      <Card view="annex_control" title="Annex A Controls" metric={`${annex.implemented} of ${annex.total} applicable controls implemented`} complete={annex.implemented} total={annex.total} segments={implementationSegments(annex)} items={[...implementationItems(annex),`${soa.undetermined} applicability not determined · ${soa.excluded} excluded`]} onSelect={onSelect}/>
      {reviews&&!error?<Card view="audit" title="Internal Audit" metric={`${audit.complete} of ${audit.total} planned audit checks completed · ${year}`} complete={audit.complete} total={audit.total} onSelect={view=>onSelect(view,{audit_year:year})}
        segments={[{value:audit.complete,tone:'good',label:'Complete'},{value:audit.total-audit.complete,tone:'neutral',label:'Pending'}]}
        items={audit.quarters.map(q=>`Q${q.quarter}: ${q.total?`${q.complete} of ${q.total} · ${percent(q.complete,q.total)}%`:'Not scheduled'}`)}/>:<div className="iso-program-card" role="status">Internal Audit · {error?'Unavailable':'Loading program…'}</div>}
    </div>
  </section>;
}
