import {assessmentQuestionPresentation} from '@/lib/assessmentRolloutPresentation';

// Workflow guidance accompanies existing native controls; it is never an answer field.
export default function SoaFieldGuidance({definitionId,field}) {
  const presentation=assessmentQuestionPresentation('iso-27001',definitionId,`SOA-${definitionId}-${field}`,{module:'statement_of_applicability'});
  const guidance=presentation?.guidance;
  if(!guidance)return null;
  return <div className="space-y-1 text-xs text-ink-secondary" data-soa-guidance={field}>
    {presentation.prompt&&<p>{presentation.prompt}</p>}
    {guidance.requirement&&<p>{guidance.requirement}</p>}
    {guidance.context&&<p>{guidance.context}</p>}
    {guidance.sourceReference&&<p>{guidance.sourceReference}</p>}
  </div>;
}
