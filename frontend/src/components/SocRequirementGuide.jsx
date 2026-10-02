import guide from '@catalogs/operatorGuidance/socRequirementGuide.json';
import RequirementGuide from './RequirementGuide';

export default function SocRequirementGuide({criterionId}) {
  return <RequirementGuide answers={guide.requirements[criterionId]} revision={guide.revision} intro={`Omnisciente explanations for SOC 2 criterion ${criterionId}; internal readiness, not an auditor opinion.`}/>;
}
