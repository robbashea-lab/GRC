import {resolveReviewPresentationSource} from '@/lib/reviewPresentationSource';
import {SourceReference} from './RequirementBasis';

const cadenceLabel=value=>value==='No fixed review cadence'?'No fixed cadence':value==='After 45 days of inactivity, where supported'?'45 days inactive':value==='Immediately at termination, revocation or role change'?'At termination':value||'Not recorded';

export default function BrawndoReviewRequirementCards({record,client,source:resolved,related={},loading=false,error,onOpen}) {
  const source=resolved||resolveReviewPresentationSource({record,client,related});
  const {primary,classification,comparison}=source;
  const organizationDefined=classification==='organizational'&&source.context.category==='organizational';
  const supportCount=source.supports.reduce((total,group)=>total+group.requirements.length,0);
  return <section className="review-source-cards" aria-label="Review source and cadence summary">
    {loading&&<p role="status">Loading linked requirements…</p>}
    {error&&<p role="alert">Requirement relationships could not be loaded. {error}</p>}
    <section className={`review-source-card is-${classification}`}>
      <header><h3><small>Why this review exists</small>{source.heading}</h3><span className={`review-workflow-chip is-${classification==='required'?'success':'info'}`}>{classification==='required'?'Required by framework':classification==='organizational'?source.label:'Source unresolved'}</span></header>
      <div className="review-source-purpose">
        {primary?<><blockquote>{primary.quoteSegments.map((part,index)=>part.highlight?<mark key={index}>{part.text}</mark>:part.text)}</blockquote><div className="review-source-cite"><span>{primary.sourceCitation} · verbatim</span><SourceReference url={primary.sourceUrl}>Official reference ↗</SourceReference></div></>
          : source.purpose.length?source.purpose.map((text,index)=><p key={index} className="whitespace-pre-wrap">{text}</p>):<p>{classification==='organizational'?'Review purpose not recorded.':'Review source could not be resolved.'}</p>}
        {!primary&&(source.context.citation||source.context.reference_url)&&<div className="review-source-cite"><SourceReference url={source.context.reference_url}>{source.context.citation||source.context.reference_url}</SourceReference></div>}
      </div>
      <div className="review-source-frequency">
        <div><span className="review-workflow-label">Required frequency</span><div className="review-source-value">{primary?.frequencyLabel||source.minimumCadence||'Not recorded'}</div></div>
        <div><span className="review-workflow-label">Brawndo's recurrence</span><div className="review-source-value">{source.configuredCadence}</div></div>
        <div><span className="review-workflow-label">{classification==='organizational'?'Set by':'Check'}</span><div className="review-source-value">{classification==='organizational'?(organizationDefined?'Brawndo management':source.label):<span className={`review-workflow-chip is-${comparison.state==='meets'?'success':comparison.state==='below'?'warning':'plain'}`}>{comparison.state==='meets'?'✓ ':''}{comparison.label}</span>}</div></div>
      </div>
    </section>
    {!!supportCount&&<section className="review-source-supports" aria-label="Supporting framework references">
      <h3>{classification==='required'?'Also supports':'Supports'} <span>· {supportCount} {classification==='required'?'related ':''}{source.supports.length===1&&source.supports[0].key==='cis-ig1'?'CIS safeguards':'framework requirements'}</span></h3>
      {source.supports.flatMap(group=>group.requirements.map(({definition,assessment})=><details key={`${group.key}:${definition.id}`} className="review-source-support">
        <summary><span className="review-source-id">{definition.id}</span><span className="review-source-title">{definition.title}<small>{definition.guidance}</small></span><span className="review-workflow-chip is-plain">{cadenceLabel(definition.source_cadence)}</span><span className="review-source-chevron" aria-hidden="true">›</span></summary>
        <div className="review-source-support-body"><blockquote>{definition.official_text||definition.description||'Source text not recorded.'}</blockquote><div className="review-source-cite"><span>{definition.source_citation||`${group.label} · ${group.version} · ${definition.id}`}</span><SourceReference url={definition.source}>Official reference ↗</SourceReference>{assessment&&onOpen&&<button type="button" onClick={()=>onOpen({kind:'framework_assessments',record:assessment})}>Open {definition.id} assessment</button>}</div></div>
      </details>))}
    </section>}
  </section>;
}
