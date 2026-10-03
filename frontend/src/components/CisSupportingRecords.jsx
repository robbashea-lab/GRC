import {useState} from 'react';
import {Button} from './ui/button';
import {EvidenceCatalogPicker} from './EvidencePanel';
import FrameworkReviewSetup from './FrameworkReviewSetup';
import api,{formatError} from '@/lib/api';
import {downloadEvidence,EvidenceSource,sourceReference,resolveEvidenceSource} from '@/lib/evidenceContext';
import {frameworkCatalog} from '@/lib/frameworks';

function ReviewHistory({review,busy,onOpen}){
  const [history,setHistory]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function load(){setLoading(true);setError('');try{const {data}=await api.get(`/reviews/${review.review_id}/history`);setHistory(data);}catch(e){setError(formatError(e));}finally{setLoading(false);}}
  return <div className="text-xs mb-3">
    <Button size="sm" variant="ghost" disabled={busy||loading} aria-expanded={history!==null} onClick={()=>history!==null?setHistory(null):load()}>{loading?'Loading occurrences…':history!==null?'Hide completed occurrences':'Completed occurrences'}</Button>
    {error&&<p role="alert">History unavailable: {error}</p>}
    {history&&<ul>{history.map(o=><li key={o.occurrence_id}><button className="text-link text-left py-1" onClick={()=>onOpen({kind:'reviews',record:review,initialValues:{occurrence:o}})}>{o.period||o.due_date?.slice(0,10)||'Recorded occurrence'} · Completed {o.completed_at?.slice(0,10)||'Date not recorded'}</button></li>)}</ul>}
    {history?.length===0&&<p>No completed occurrences.</p>}
  </div>;
}
export default function CisSupportingRecords({record,current,definition,ctx,related,writable,busy,run,setNested,setReviewDraft,reviewSaved}){
  const [linking,setLinking]=useState(false),aid=record.framework_assessment_id;
  const evidence=(related.evidence||[]).filter(e=>!e.archived_at);
  const direct=e=>current.related_links?.some(l=>l.kind==='evidence'&&l.id===e.evidence_id)||['framework_assessment','framework_assessments'].includes(e.linked_type)&&e.linked_id===aid;
  const groups=[['Direct Evidence',evidence.filter(direct)],['Evidence through linked Reviews',evidence.filter(e=>!direct(e))]];
  function reviewSources(e){
    const refs=[...(e.relationships||[]),...(['review','reviews'].includes(e.linked_type)?[{kind:'reviews',id:e.linked_id,occurrence_id:e.occurrence_id}]:[])].filter(ref=>ref.kind==='reviews');
    return [...new Map(refs.map(ref=>[`${ref.id}:${ref.occurrence_id||''}`,sourceReference('reviews',related.reviews?.find(r=>r.review_id===ref.id),ref.id,ref.occurrence_id)])).values()];
  }
  return <details className="brawndo-disclosure" data-testid="cis-supporting-records">
    <summary>Supporting records · {evidence.length} Evidence · {related.reviews?.length||0} Reviews</summary>
    <div className="space-y-4 mt-3 text-sm">
      <p className="text-xs text-ink-secondary">Relationships save immediately; assessment text saves separately. A linked file or completed Review is not proof of effectiveness. Opening linked records keeps this assessment draft in place.</p>
      <section aria-label="Linked Reviews"><h4 className="font-medium mb-2">Reviews</h4>
        <FrameworkReviewSetup record={current} definition={definition} catalog={frameworkCatalog('cis-ig1')} reviews={ctx?.options.reviews||[]} users={ctx?.users||[]} clientId={record.client_id} writable={writable&&!busy&&!!ctx} onDraftChange={setReviewDraft} onOpen={r=>setNested({kind:'reviews',record:r})} onSaved={reviewSaved}/>
        {(related.reviews||[]).map(r=><ReviewHistory key={r.review_id} review={r} busy={busy} onOpen={setNested}/>)}
        {ctx&&!related.reviews?.length&&<p className="text-xs text-ink-secondary">No Review linked. Link an existing activity or configure one when useful.</p>}
      </section>
      <section aria-label="Linked Evidence"><h4 className="font-medium">Evidence</h4>
        {groups.map(([label,rows])=>rows.length>0&&<div key={label} className="mt-2"><p className="text-xs text-ink-secondary">{label}</p><ul>{rows.map(e=><li className="brawndo-linked-row" key={e.evidence_id}>
          <div className="min-w-0"><button className="text-link text-left break-words" disabled={busy} onClick={()=>run(()=>downloadEvidence(e))}>{e.display_name||e.filename}</button><p className="text-xs text-ink-secondary">{[e.display_name&&e.display_name!==e.filename&&e.filename,e.evidence_type,(e.evidence_date||e.created_at)?.slice(0,10)].filter(Boolean).join(' · ')}</p>
          {!direct(e)&&reviewSources(e).map(ref=><EvidenceSource key={`${ref.id}:${ref.occurrence_id}`} source={ref} onOpen={source=>run(async()=>setNested(await resolveEvidenceSource(source,record.client_id)))}/>)}</div>
          {direct(e)&&writable&&<Button variant="ghost" size="sm" disabled={busy} onClick={()=>run(()=>api.delete(`/framework_assessments/${aid}/links`,{data:{kind:'evidence',id:e.evidence_id}}))}>Unlink</Button>}
        </li>)}</ul></div>)}
        {ctx&&!evidence.length&&<p className="text-xs text-ink-secondary">No supporting Evidence linked. Existing records or external references may be appropriate.</p>}
        {writable&&<Button variant="outline" size="sm" disabled={busy||!ctx} aria-expanded={linking} onClick={()=>setLinking(!linking)}>{linking?'Close Evidence picker':'Link Evidence'}</Button>}
        {linking&&writable&&<div className="mt-3"><EvidenceCatalogPicker clientId={record.client_id} linkedIds={evidence.filter(direct).map(e=>e.evidence_id)} disabled={busy} onLink={id=>run(()=>api.post(`/framework_assessments/${aid}/links`,{kind:'evidence',id}))}/></div>}
      </section>
    </div>
  </details>;
}
