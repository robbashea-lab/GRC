import {useEffect,useMemo,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {auditProgress} from '@/lib/isoAudit';

const soaState=row=>row.soa_applicability==='excluded'?'notNecessary':row.soa_applicability!=='included'?'undetermined':row.status==='addressed'?'implemented':row.status==='not_assessed'?'notImplemented':'partial';
const percent=(value,total)=>total?Math.round(value/total*100):0;
const Segments=({segments,total,label})=><div className="iso-program-bar" role="img" aria-label={label}>{segments.filter(s=>s.value).map(s=><span key={s.label} className={'is-'+s.tone} style={{width:`${s.value/Math.max(total,1)*100}%`}} title={`${s.label}: ${s.value}`}/>)}</div>;
const Card=({view,title,subtitle,metric,progress,segments,total,items,onSelect,tone=''})=><button type="button" className={`iso-program-card ${tone?'is-'+tone:''}`} onClick={()=>onSelect(view)} aria-label={`Open ${title}. ${metric}`}>
  <span className="iso-program-title">{title}<span aria-hidden="true">›</span></span>
  <span className="iso-program-subtitle">{subtitle}</span>
  <strong className="iso-program-metric">{metric}</strong>
  <span className="iso-program-progress">{progress}%</span>
  <Segments segments={segments} total={total} label={`${title}: ${progress}% progress`}/>
  <span className="iso-program-breakdown">{items.map(item=><span key={item}>{item}</span>)}</span>
</button>;

export function IsoSoaSummary({rows}){
  const counts=rows.reduce((a,row)=>{a[soaState(row)]++;return a;},{implemented:0,partial:0,notImplemented:0,notNecessary:0,undetermined:0});
  const necessary=counts.implemented+counts.partial+counts.notImplemented,reviewed=rows.length-counts.undetermined;
  return <section className="bcis-card iso-workspace-summary" aria-label="Statement of Applicability status">
    <div><p className="bcis-measure-label">Annex A controls reviewed</p><p className="iso-workspace-figure">{percent(reviewed,rows.length)}%</p><p className="text-sm text-ink-secondary">{reviewed} of {rows.length} necessity decisions recorded</p></div>
    <Segments total={rows.length} label={`Statement of Applicability: ${reviewed} of ${rows.length} controls reviewed`} segments={[{value:necessary,tone:'good',label:'Necessary'},{value:counts.notNecessary,tone:'attention',label:'Not Necessary'},{value:counts.undetermined,tone:'neutral',label:'Not yet determined'}]}/>
    <div className="iso-workspace-breakdown"><span>Necessary <strong>{necessary}</strong></span><span>Not Necessary <strong>{counts.notNecessary}</strong></span><span>Not yet determined <strong>{counts.undetermined}</strong></span><span>Implementation gaps <strong>{counts.partial+counts.notImplemented}</strong></span></div>
    <p className="bcis-note">Necessity decisions and implementation status are separate. All {rows.length} Annex A reference controls remain in scope for consideration.</p>
  </section>;
}

export default function IsoProgramWorkspace({clientId,mode,rows,onSelect}){
  const [data,setData]=useState({reviews:[],findings:[]}),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();setError('');Promise.all(['reviews','findings'].map(kind=>api.get('/'+kind,{params:{client_id:clientId},signal:c.signal}))).then(result=>{if(!c.signal.aborted)setData({reviews:Array.isArray(result[0].data)?result[0].data:[],findings:Array.isArray(result[1].data)?result[1].data:[]});}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[clientId]);
  const clauses=rows.filter(r=>r.specification==='isms_clause'),annex=rows.filter(r=>r.specification==='annex_control'),audits=data.reviews.filter(r=>r.iso_audit);
  const clauseCounts=useMemo(()=>({implemented:clauses.filter(r=>r.status==='addressed').length,partial:clauses.filter(r=>r.status==='in_progress').length,notImplemented:clauses.filter(r=>r.status==='needs_attention').length,notAssessed:clauses.filter(r=>r.status==='not_assessed').length}),[clauses]);
  const soa=useMemo(()=>annex.reduce((a,row)=>{a[soaState(row)]++;return a;},{implemented:0,partial:0,notImplemented:0,notNecessary:0,undetermined:0}),[annex]);
  const assessed=clauses.length-clauseCounts.notAssessed,soaReviewed=annex.length-soa.undetermined,necessary=soa.implemented+soa.partial+soa.notImplemented;
  const auditComplete=audits.filter(r=>{const p=auditProgress(r.iso_audit);return p.total>0&&p.complete===p.total;}).length,auditFindings=data.findings.filter(f=>audits.some(r=>r.review_id===f.review_id)&&!['closed','accepted'].includes(f.status)).length;
  if(error)return <p role="alert" className="text-sm text-semantic-critical">ISO programme details could not be loaded. {error}</p>;
  if(mode!=='overview')return null;
  return <section className="space-y-4" aria-label="ISMS Overview">
    <div><h2 className="font-semibold">ISO 27001 programme overview</h2><p className="text-sm text-ink-secondary">Four connected views of the operating ISMS. Figures show assessment and programme progress, not certification status or audit opinion.</p></div>
    <div className="iso-program-grid">
      <Card view="isms_clause" title="ISMS Requirements" subtitle="Clauses 4–10" metric={`${percent(assessed,clauses.length)}% assessed`} progress={percent(assessed,clauses.length)} total={clauses.length} onSelect={onSelect}
        segments={[{value:clauseCounts.implemented,tone:'good',label:'Implemented'},{value:clauseCounts.partial,tone:'attention',label:'Partial'},{value:clauseCounts.notImplemented,tone:'critical',label:'Not implemented'},{value:clauseCounts.notAssessed,tone:'neutral',label:'Not assessed'}]}
        items={[`${assessed} of ${clauses.length} assessed`,`${clauseCounts.implemented} implemented`,`${clauseCounts.partial} partial · ${clauseCounts.notImplemented} not implemented`,`${clauseCounts.notAssessed} not assessed`]}/>
      <Card view="soa" title="Statement of Applicability" subtitle="Necessity and justification" metric={`${soaReviewed} of ${annex.length} reviewed`} progress={percent(soaReviewed,annex.length)} total={annex.length} onSelect={onSelect} tone={soa.undetermined?'attention':''}
        segments={[{value:necessary,tone:'good',label:'Necessary'},{value:soa.notNecessary,tone:'attention',label:'Not Necessary'},{value:soa.undetermined,tone:'neutral',label:'Not yet determined'}]}
        items={[`${necessary} Necessary`,`${soa.notNecessary} Not Necessary`,`${soa.undetermined} not yet determined`,`${soa.partial+soa.notImplemented} implementation gaps`]}/>
      <Card view="annex_control" title="Annex A Controls" subtitle="Implementation of necessary controls" metric={`${percent(soa.implemented,necessary)}% implemented`} progress={percent(soa.implemented,necessary)} total={necessary} onSelect={onSelect}
        segments={[{value:soa.implemented,tone:'good',label:'Implemented'},{value:soa.partial,tone:'attention',label:'Partial'},{value:soa.notImplemented,tone:'critical',label:'Not implemented'}]}
        items={[`${annex.length} reference controls`,`${necessary} Necessary`,`${soa.implemented} implemented`,`${soa.partial} partial · ${soa.notImplemented} not implemented`]}/>
      <Card view="audit" title="Internal Audit Programme" subtitle={`Current programme · ${audits[0]?.due_date?.slice(0,4)||'year not set'}`} metric={`${auditComplete} of ${audits.length} planned audits complete`} progress={percent(auditComplete,audits.length)} total={audits.length} onSelect={onSelect} tone={auditFindings?'attention':''}
        segments={[{value:auditComplete,tone:'good',label:'Complete'},{value:audits.length-auditComplete,tone:'neutral',label:'Planned or in progress'}]}
        items={[`${percent(auditComplete,audits.length)}% programme coverage`,`${auditFindings} open audit Finding${auditFindings===1?'':'s'}`]}/>
    </div>
  </section>;
}
