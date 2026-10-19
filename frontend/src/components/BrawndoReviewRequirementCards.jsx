import {BUSINESS_BASIS,requirementBasis,cadenceBasis} from '@/lib/requirementBasis';
import {cadenceDays,reviewDrivers} from '@/lib/frameworks';
import {reviewDisplayValue} from '@/lib/reviewPresentation';
import {SourceReference} from './RequirementBasis';

export default function BrawndoReviewRequirementCards({record,related={},historical=false,loading=false,error,onOpen}) {
  if (!record) return null;
  const groups=requirementBasis('reviews',record,related),cadence=cadenceBasis(record,groups),drivers=reviewDrivers(record);
  const context=record.governance_context||{};
  const purpose=[context.rationale,record.framework_purpose,record.scope].filter((value,index,values)=>value&&values.indexOf(value)===index);
  const configuredDays=record.recurrence==='custom'
    ? (Number.isFinite(record.custom_recurrence_days)&&record.custom_recurrence_days>0?record.custom_recurrence_days:null)
    : ['monthly','quarterly','semiannual','annual'].includes(record.recurrence)?cadenceDays(record.recurrence):null;
  const configured=record.recurrence==='custom'?cadence.current:reviewDisplayValue('recurrence',record.recurrence)||'Not recorded';
  return <section className="review-source-cards" aria-label="Review source and cadence summary">
    {loading&&<p role="status">Loading linked requirements…</p>}
    {error&&<p role="alert">Requirement relationships could not be loaded. {error}</p>}
    {historical&&<p className="review-source-notice">Occurrence context is preserved; linked records and catalog references show their current state.</p>}
    <section className="review-source-card">
      <header><p className="review-workflow-eyebrow">Why this review exists</p><h3>{context.category?BUSINESS_BASIS[context.category]||'Business basis not recorded':'Business basis not recorded'}</h3></header>
      <div className="review-source-purpose">
        {purpose.length?purpose.map((text,index)=><p key={index} className="whitespace-pre-wrap">{text}</p>):<p>Review purpose and scope not recorded.</p>}
        {(context.citation||context.reference_url)&&<p>Organization-entered reference: <SourceReference url={context.reference_url}>{context.citation||context.reference_url}</SourceReference></p>}
        <p className="review-source-notice">Supporting links alone do not establish that a framework requires this standalone Review.</p>
      </div>
      {cadence.sources.length?cadence.sources.map((source,index)=>{
        const active=source.active===true||source.active===undefined&&drivers.some(driver=>driver.framework_plan_key===source.key&&driver.framework_driver_active===true);
        const sourceDays=cadenceDays(source.minimum);
        // Compare only native, explicit intervals; event triggers and unknown schedules remain incomparable.
        const comparable=active&&!!source.minimum&&source.refs.length>0&&Number.isFinite(sourceDays)&&sourceDays>0&&configuredDays!==null;
        const comparison=!source.minimum?'Source interval not recorded':!comparable?'Not directly comparable':configuredDays>sourceDays?'Less frequent than source interval':'Cadence aligned';
        return <dl className="review-source-cadence" key={index}>
          <div><dt>Source activity / interval</dt><dd>{source.framework}{source.active===false?' · Historical driver (inactive)':''}</dd><dd>{source.source||'Source activity or trigger not recorded.'}</dd>
            {source.minimum&&<dd>Explicit source interval: {source.minimum} · applies to the cited activity.</dd>}
            {source.refs.map((reference,refIndex)=><dd key={refIndex}><SourceReference url={reference.source}>{reference.definition_id} · {reference.interval}</SourceReference></dd>)}
          </div>
          <div><dt>Configured recurrence</dt><dd>{configured}</dd><dd>{cadence.classification}</dd>{cadence.rationale&&<dd className="whitespace-pre-wrap">{cadence.rationale}</dd>}</div>
          <div><dt>Cadence check</dt><dd className="review-source-comparison">{comparison}</dd><dd className="review-source-notice">Schedule alignment does not establish timely completion, evidence sufficiency, safeguard implementation or compliance.</dd></div>
        </dl>;
      }):<dl className="review-source-cadence">
        <div><dt>Source activity / interval</dt><dd>Source interval not recorded.</dd></div>
        <div><dt>Configured recurrence</dt><dd>{configured}</dd><dd>{cadence.classification}</dd>{cadence.rationale&&<dd>{cadence.rationale}</dd>}</div>
        <div><dt>Cadence check</dt><dd>Not directly comparable</dd></div>
      </dl>}
    </section>
    <section aria-label="Supporting framework references">
      <h3>Also supports</h3>
      {!groups.length&&<p>No framework support references recorded.</p>}
      {groups.map(group=><div key={group.key} className="review-source-framework">
        <h4>{group.label} · {group.version}</h4>
        {group.requirements.map(({definition,classification,assessment})=><details key={definition.id} className="review-source-support">
          <summary>{definition.id} · {definition.title} · {classification}</summary>
          {(definition.official_text||definition.description||definition.guidance)&&<p className="whitespace-pre-wrap">{definition.official_text||definition.description||definition.guidance}</p>}
          <p><SourceReference url={definition.source}>{definition.source?'Official reference':'Reference unavailable'}</SourceReference></p>
          {assessment&&onOpen&&<p><button type="button" className="text-link underline text-left" onClick={()=>onOpen({kind:'framework_assessments',record:assessment})}>Open {definition.id} assessment</button></p>}
        </details>)}
      </div>)}
    </section>
  </section>;
}
