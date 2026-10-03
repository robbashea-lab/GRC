import {Link} from 'react-router-dom';
import {cis} from '@/lib/frameworks';
import {operationGaps} from '@/lib/cisOperations';

export default function CisSetupHandoff({rows=[],onOpen}){
  const cisRows=rows.filter(r=>r.framework_key==='cis-ig1'),pending=cisRows.filter(r=>operationGaps(r).length);
  if(!cisRows.length)return null;
  return <details className="border border-line bg-surface-card rounded-lg p-4 text-sm" data-testid="cis-setup-handoff">
    <summary className="cursor-pointer font-medium">CIS operating setup · {pending.length} arrangements unconfirmed</summary>
    <p className="text-xs text-ink-secondary mt-3">Shared Reviews evaluate operation. Separately establish recurring/automated work, personnel events and significant-change procedures with an accountable client person and any provider. This is setup tracking, not assessment progress.</p>
    <p className="text-xs text-ink-secondary mt-2">Open a safeguard to record Operational responsibility and the method/procedure in Current implementation. Existing Tasks, Reviews or external service records can support the work; automated runs do not need individual manual tasks.</p>
    {!pending.length?<p className="mt-3">Arrangements recorded. Implementation and verification remain separate judgments.</p>:<ul className="divide-y divide-line mt-3">{pending.map(row=>{const d=cis.requirements.find(d=>d.id===row.definition_id);return <li key={row.framework_assessment_id} className="py-3">
      {onOpen?<button className="text-link text-left" onClick={()=>onOpen(row)}>{d.id} · {d.title}</button>:<Link className="text-link underline" to={`/compliance/cis-ig1?assessment=${encodeURIComponent(row.framework_assessment_id)}`}>{d.id} · {d.title}</Link>}
      <p className="text-xs text-ink-secondary mt-1">Operation / trigger: {d.source_cadence}</p><p className="text-xs text-ink-secondary">Unconfirmed: {operationGaps(row).join(' · ')}</p>
    </li>;})}</ul>}
  </details>;
}
