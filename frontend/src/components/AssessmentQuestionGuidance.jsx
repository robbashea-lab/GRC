import {useId} from 'react';
import {BookOpen,ChevronDown} from 'lucide-react';
import {assessmentClientRecords} from '@/lib/assessmentClientContext';
import {r4FrameworkSource} from '@/lib/r4FrameworkSource';
import {frameworkGuidanceReference} from '@/lib/frameworkGuidanceReference';
import {useAssessmentClientContext} from './AssessmentClientContext';
import './AssessmentClientContext.css';

function requirementText(guidance) {
  const {requirement, highlight, after} = guidance;
  if (!highlight) return requirement;
  // The existing 1.1 helper supplies three fragments; package callouts supply full text.
  if (after !== undefined) return <>{requirement}<mark>{highlight}</mark>{after}</>;
  const at = requirement.indexOf(highlight);
  return at < 0 ? requirement : <>{requirement.slice(0, at)}<mark>{highlight}</mark>{requirement.slice(at + highlight.length)}</>;
}

export default function AssessmentQuestionGuidance({guidance, reference, descriptionId}) {
  const context=useAssessmentClientContext(),bodyId=useId();
  const source=context?.source;
  const fallback=source?.definition?r4FrameworkSource(context.record.framework_key,source.definition,source.configuration):null;
  const sourceReference=frameworkGuidanceReference(reference,{frameworkKey:context?.record?.framework_key,definition:source?.definition,configuration:source?.configuration});
  const advice=guidance|| (fallback?{requirement:fallback.text,context:fallback.qualification}:null);
  if (!advice && !context) return null;
  const requirement=advice&&(advice.requirement||advice.context)?<aside className="brawndo-pilot-guidance gn-inline-requirement"
    aria-label={advice.requirement ? 'Framework requirement' : 'Implementation context'}>
    <div className="gn-rule-heading"><BookOpen size={16} aria-hidden="true"/>
      <span>{advice.requirement ? 'Framework requirement' : 'Implementation context'}</span>
      {sourceReference && <span className="gn-rule-reference">{sourceReference}</span>}
    </div>
    {advice.requirement && <p id={descriptionId} className="gn-rule-copy">{requirementText(advice)}</p>}
    {advice.context && <p id={advice.requirement ? undefined : descriptionId} className="gn-rule-context">
      {advice.requirement && <strong>Implementation context: </strong>}{advice.context}
    </p>}
  </aside>:null;
  if(!context)return requirement;
  const rows=assessmentClientRecords(context.record,source,context.services?.data);
  const evidence=source?.definition?.evidence_guidance;
  const examples=Array.isArray(evidence)?evidence:typeof evidence==='string'&&evidence?[evidence]:[];
  return <details className="gn-control-guidance">
    <summary aria-controls={bodyId}><BookOpen size={19} aria-hidden="true"/><span>Control guidance &amp; client context</span><ChevronDown className="gn-guidance-chevron" size={17} aria-hidden="true"/></summary>
    <div className="gn-guidance-body" id={bodyId}>
      {requirement&&<section className="gn-guidance-verify"><h4>What to verify</h4>{requirement}</section>}
      {!!examples.length&&<section className="gn-guidance-evidence"><h4>Evidence to look for</h4><ul>{examples.map((example,index)=><li key={index}>{example}</li>)}</ul></section>}
      <section className="gn-guidance-records"><h4>Relevant client records</h4>
        {!source||!context.services?.data?<p className="gn-guidance-empty" role="status">{context.services?.error||'Loading verified client context.'}</p>:rows.length?<ul className="gn-guidance-list">{rows.map(row=><li className="gn-guidance-record" data-kind={row.kind.toLowerCase().replaceAll(' ','-')} key={row.key}>
          <div className="gn-guidance-record-content"><small className="gn-guidance-kind">{row.kind}</small><strong className="gn-guidance-title">{row.title}</strong>{row.metadata&&<span className="gn-guidance-meta">{row.metadata}</span>}</div>
          {row.status&&<span className="gn-guidance-status" data-status={row.status.toLowerCase().replace(/[^a-z0-9]+/g,'-')}>{row.status}</span>}
        </li>)}</ul>:<p className="gn-guidance-empty">No matching client records found for this item.</p>}
        <p className="gn-guidance-meta">Configured tools, planned dates and reported policies provide context; they do not establish implementation, approval or completed work.</p>
      </section>
    </div>
  </details>;
}
