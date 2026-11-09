import {BookOpen} from 'lucide-react';

function requirementText(guidance) {
  const {requirement, highlight, after} = guidance;
  if (!highlight) return requirement;
  // The existing 1.1 helper supplies three fragments; package callouts supply full text.
  if (after !== undefined) return <>{requirement}<mark>{highlight}</mark>{after}</>;
  const at = requirement.indexOf(highlight);
  return at < 0 ? requirement : <>{requirement.slice(0, at)}<mark>{highlight}</mark>{requirement.slice(at + highlight.length)}</>;
}

export default function AssessmentQuestionGuidance({guidance, reference, descriptionId}) {
  if (!guidance || (!guidance.requirement && !guidance.context)) return null;
  return <aside className="brawndo-pilot-guidance gn-inline-requirement"
    aria-label={guidance.requirement ? 'Framework requirement' : 'Implementation context'}>
    <div className="gn-rule-heading"><BookOpen size={16} aria-hidden="true"/>
      <span>{guidance.requirement ? 'Framework requirement' : 'Implementation context'}</span>
      {reference && <span className="gn-rule-reference">{reference}</span>}
    </div>
    {guidance.requirement && <p id={descriptionId} className="gn-rule-copy">{requirementText(guidance)}</p>}
    {guidance.context && <p id={guidance.requirement ? undefined : descriptionId} className="gn-rule-context">
      {guidance.requirement && <strong>Implementation context: </strong>}{guidance.context}
    </p>}
  </aside>;
}
