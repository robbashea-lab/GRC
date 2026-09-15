import {SOURCE_TYPES, taskSource} from '@/lib/actionItems';
import {relatedReviewInitialValues} from '@/lib/reviewOccurrences';
import {remediationOrigin} from '@/lib/remediation';

export default function ActionSourceChain({record,related={},onOpen}) {
  const scoped=Object.fromEntries(Object.entries(related).map(([k,rows])=>[k,(rows||[]).filter(r=>r.client_id===record.client_id)]));
  const finding=scoped.findings?.find(r=>r.finding_id===record.finding_id);
  const review=scoped.reviews?.find(r=>r.review_id===(record.review_id||finding?.review_id));
  const source=taskSource(record,scoped);
  const link=(label,kind,target,initialValues={})=><div key={label}><dt className="text-ink-secondary">{label}</dt><dd>{target?<button type="button" className="underline text-left font-medium" onClick={()=>onOpen({kind,record:target,initialValues})}>{target.title||target.name}</button>:<span className="text-ink-help">Linked record unavailable</span>}</dd></div>;
  return <section aria-label="Action context" className="border border-line rounded-md p-3 space-y-2 text-sm">
    <h3 className="font-medium">Why this action exists</h3>
    <dl className="space-y-2">
      {record.review_id&&<div>{link('Originating Review','reviews',review,review?relatedReviewInitialValues(review,record):{})}{review&&<p className="text-xs text-ink-secondary">Origin: {remediationOrigin(record,review)}</p>}</div>}
      {record.finding_id&&link('Finding','findings',finding)}
      {!record.finding_id&&source.type!=='review'&&source.kind&&link(SOURCE_TYPES[source.type]||'Source',source.kind,source.target)}
      {!record.finding_id&&!source.kind&&<div><dt className="text-ink-secondary">Source</dt><dd>{SOURCE_TYPES[source.type]||record.source||source.label}</dd></div>}
      <div><dt className="text-ink-secondary">{record.finding_id?'Corrective Action':'Action Item'}</dt><dd>{record.title}</dd></div>
    </dl>
  </section>;
}
