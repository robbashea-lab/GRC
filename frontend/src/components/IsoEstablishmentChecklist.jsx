import {Link} from 'react-router-dom';

// Discovery only: the linked clause records remain authoritative. Supporting
// information is not a setup confirmation, implementation or effectiveness judgment.
export const ISO_ESTABLISHMENT = [
  {title:'Scope and context',refs:['4.1','4.2','4.3'],prompt:'Record boundaries, interfaces, relevant issues and interested-party requirements, including consideration of climate relevance.',links:[['Client Profile','/client-profile']]},
  {title:'Responsibilities',refs:['5.3'],prompt:'Identify business responsibilities, decision authority and who coordinates the ISMS. Contacts and platform access are not a responsibility matrix.',links:[['Contacts','/contacts']]},
  {title:'Risk criteria and business approval',refs:['6.1.2','6.1.3'],prompt:'Record the assessment method, acceptance criteria and treatment basis. Identify the business owner who approved the decision, separately from the platform user recording it; retain the decision and evidence version. Contributor permissions do not change.',links:[['Risks','/risks']]},
  {title:'Objectives and their measures',refs:['6.2','9.1'],prompt:'Link objective definitions, targets, owners, resources, timeframe and measurement method; retain successive results in the existing Reviews or a controlled objective register.',links:[['Objective Reviews and results','/reviews']]},
  {title:'Document-handling rules',refs:['7.5.1','7.5.2','7.5.3'],prompt:'Identify approval, access, version, external-document and retention responsibilities. A controlled external reference is valid; a separate upload is not required.',links:[['Policies','/policies'],['Evidence Library','/evidence']]},
  {title:'Operational processes and change triggers',refs:['6.3','8.1','8.2','8.3'],prompt:'Define operating scope, evaluation criteria and significant-change triggers. Reuse existing Reviews and provider records; preserve owners, dates and cadence provenance. Do not create a Review per control.',links:[['Reviews','/reviews'],['Action Items','/action-items']]},
];

export function establishmentRows(rows,clientId){
  return ISO_ESTABLISHMENT.map(item=>({...item,requirements:item.refs.map(ref=>{
    const row=rows.find(r=>r.client_id===clientId&&r.framework_key==='iso-27001'&&r.definition_id===ref);
    const recorded=!!row&&(row.iso_establishment_information_recorded===true||['implementation','notes'].some(k=>typeof row[k]==='string'&&!!row[k].trim())||!!row.related_links?.length);
    return {ref,row,recorded};
  })}));
}

export default function IsoEstablishmentChecklist({rows=[],clientId}){
  const items=establishmentRows(rows,clientId),missing=items.filter(i=>i.requirements.some(r=>!r.recorded)).length;
  return <section className="border border-line rounded-lg bg-surface-card p-4 space-y-3" aria-labelledby="iso-establishment-title" data-testid="iso-establishment-checklist">
    <h2 id="iso-establishment-title" className="font-semibold text-base">ISO establishment checklist</h2>
    <p className="text-sm text-ink-secondary">{missing} of {items.length} areas still have requirements without recorded supporting information. Use the linked clause's current implementation, Notes or related records to record the basis and any unresolved work. Controlled external references are welcome.</p>
    <p className="text-xs text-ink-secondary">Omnisciente guidance, not official ISO wording or a complete normative checklist. Supporting information recorded is not establishment confirmed, Implemented, Verified or compliant. Assessment conclusions remain separate. Unfinished work does not prevent onboarding.</p>
    <ul className="divide-y divide-line">{items.map(item=>{
      const recorded=item.requirements.filter(r=>r.recorded).length;
      return <li key={item.title} className="py-3 space-y-2 text-sm">
        <h3 className="font-medium">{item.title}</h3>
        <p>{recorded===0?'Unresolved — no supporting information recorded':`${recorded} of ${item.requirements.length} clause records have supporting information; establishment still to assess`}</p>
        <p className="text-ink-secondary">{item.prompt}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">{item.requirements.map(({ref,row,recorded})=>row?
          <Link className="text-link underline" key={ref} to={`/compliance/iso-27001?iso_view=isms_clause&assessment=${encodeURIComponent(row.framework_assessment_id)}`} aria-label={`Open ISO ${ref}${recorded?' supporting information':' unresolved work'}`}>{ref} · {recorded?'Information recorded':'Unresolved'}</Link>:
          <span key={ref}>{ref} · Record unavailable</span>)}{item.links.map(([label,to])=><Link key={to} className="text-link underline" to={to}>{label}</Link>)}</div>
        <p className="text-xs text-ink-secondary">Assessment conclusions: {item.requirements.map(({ref,row})=>`${ref}: ${row?.status||'record unavailable'}`).join(' · ')}. Open the record for its current owner, dates and history; this checklist changes none of them.</p>
      </li>;
    })}</ul>
  </section>;
}
