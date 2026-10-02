import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {isoProgramMetrics,isoAssessmentConflicts,auditProgrammeMetrics,auditProgrammeYears} from '@/lib/isoProgramMetrics';

const percent=(value,total)=>total?Math.round(value/total*100):0;
const Segments=({segments,total,label})=><div className="iso-program-bar" role="img" aria-label={label}>{segments.filter(s=>s.value).map(s=><span key={s.label} className={'is-'+s.tone} style={{width:`${s.value/Math.max(total,1)*100}%`}} title={`${s.label}: ${s.value}`}/>)}</div>;
const Card=({view,title,metric,complete,total,segments,items,onSelect})=><button type="button" className="iso-program-card" onClick={()=>onSelect(view)} aria-label={`Open ${title}. ${metric}`}>
  <span className="iso-program-title">{title}<span aria-hidden="true">›</span></span>
  <strong className="iso-program-metric">{metric}</strong>
  <span className="iso-program-progress">{total?`${percent(complete,total)}%`:'No planned records'}</span>
  <Segments segments={segments} total={total} label={`${title}: ${complete} of ${total}`}/>
  <span className="iso-program-breakdown">{items.map(item=><span key={item}>{item}</span>)}</span>
</button>;
const implementationSegments=c=>[{value:c.implemented,tone:'good',label:'Implemented'},{value:c.partial,tone:'attention',label:'Partially implemented'},{value:c.notImplemented,tone:'critical',label:'Not implemented'},{value:c.notAssessed,tone:'neutral',label:'Not assessed'}];
const implementationItems=c=>[`${c.implemented} implemented`,`${c.partial} partially implemented`,`${c.notImplemented} not implemented`,`${c.notAssessed} not assessed`];

export function IsoSoaSummary({rows}){
  const {soa}=isoProgramMetrics(rows);
  return <section className="bcis-card iso-workspace-summary" aria-label="Statement of Applicability status">
    <div><p className="bcis-measure-label">Applicability decisions</p><p className="iso-workspace-figure">{percent(soa.decided,soa.total)}%</p><p className="text-sm text-ink-secondary">{soa.decided} of {soa.total} decisions recorded</p></div>
    <Segments total={soa.total} label={`Statement of Applicability: ${soa.decided} of ${soa.total} decisions recorded`} segments={[{value:soa.applicable,tone:'good',label:'Applicable'},{value:soa.excluded,tone:'attention',label:'Excluded'},{value:soa.undetermined,tone:'neutral',label:'Not determined'}]}/>
    <div className="iso-workspace-breakdown"><span>Applicable <strong>{soa.applicable}</strong></span><span>Not applicable / excluded <strong>{soa.excluded}</strong></span><span>Not determined <strong>{soa.undetermined}</strong></span></div>
    <p className="bcis-note">Applicability decisions and implementation assessments are separate. Additional necessary controls may be documented through risk treatment and linked organization controls.</p>
  </section>;
}

export default function IsoProgramWorkspace({clientId,mode,rows,onSelect}){
  const [reviews,setReviews]=useState(null),[error,setError]=useState(''),[selectedYear,setSelectedYear]=useState('');
  useEffect(()=>{const c=new AbortController();setError('');setReviews(null);setSelectedYear('');api.get('/iso-audit',{params:{client_id:clientId},signal:c.signal}).then(({data})=>{if(!c.signal.aborted)setReviews(data.reviews||[]);}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[clientId]);
  const {soa,requirements,annex}=isoProgramMetrics(rows),years=auditProgrammeYears(reviews||[]);
  const now=String(new Date().getFullYear()),year=selectedYear||(years.includes(now)?now:years.at(-1)||now),audit=auditProgrammeMetrics(reviews||[],year);
  if(mode!=='overview')return null;
  return <section className="space-y-4" aria-label="ISMS Overview">
    <p className="text-sm text-ink-secondary">Figures show assessment and programme progress, not certification status or audit opinion.</p>
    {!!isoAssessmentConflicts(rows).length&&<p role="alert" className="text-sm text-semantic-critical">Legacy assessment conflicts require review: {isoAssessmentConflicts(rows).map(r=>r.definition_id).join(', ')}. A mandatory requirement or applicable control has a Not Applicable implementation status. Saved values are retained, not counted as implemented, and have not been migrated.</p>}
    <label className="block text-sm">Audit-program year <select aria-label="Audit-program year" value={year} onChange={e=>setSelectedYear(e.target.value)}>{(years.length?years:[now]).map(y=><option key={y}>{y}</option>)}</select></label>
    {error&&<p role="alert" className="text-sm text-semantic-critical">Audit programme could not be loaded. {error}</p>}
    <div className="iso-program-grid">
      <Card view="soa" title="Statement of Applicability" metric={`${soa.decided} of ${soa.total} applicability decisions completed`} complete={soa.decided} total={soa.total} onSelect={onSelect}
        segments={[{value:soa.applicable,tone:'good',label:'Applicable'},{value:soa.excluded,tone:'attention',label:'Excluded'},{value:soa.undetermined,tone:'neutral',label:'Not determined'}]}
        items={[`${soa.applicable} applicable`,`${soa.excluded} not applicable / excluded`,`${soa.undetermined} not determined`]}/>
      <Card view="isms_clause" title="ISMS Requirements" metric={`${requirements.implemented} of ${requirements.total} requirements implemented`} complete={requirements.implemented} total={requirements.total} segments={implementationSegments(requirements)} items={implementationItems(requirements)} onSelect={onSelect}/>
      <Card view="annex_control" title="Annex A Controls" metric={`${annex.implemented} of ${annex.total} applicable controls implemented`} complete={annex.implemented} total={annex.total} segments={implementationSegments(annex)} items={[...implementationItems(annex),`${soa.undetermined} applicability not determined · ${soa.excluded} excluded`]} onSelect={onSelect}/>
      {reviews&&!error?<Card view="audit" title="Internal Audit" metric={`${audit.complete} of ${audit.total} planned audit checks completed · ${year}`} complete={audit.complete} total={audit.total} onSelect={view=>onSelect(view,{audit_year:year})}
        segments={[{value:audit.complete,tone:'good',label:'Complete'},{value:audit.total-audit.complete,tone:'neutral',label:'Pending'}]}
        items={audit.quarters.map(q=>`Q${q.quarter}: ${q.total?`${q.complete} of ${q.total} · ${percent(q.complete,q.total)}%`:'Not scheduled'}`)}/>:<div className="iso-program-card" role="status">Internal Audit · {error?'Unavailable':'Loading programme…'}</div>}
    </div>
  </section>;
}
