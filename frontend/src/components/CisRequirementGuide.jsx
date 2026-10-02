import guide from '@catalogs/operatorGuidance/cisRequirementGuide.json';
import RequirementGuide from './RequirementGuide';
export {GUIDE_QUESTIONS} from './RequirementGuide';

export default function CisRequirementGuide({safeguardId}) {
  return <RequirementGuide answers={guide.requirements[safeguardId]} revision={guide.revision} intro={`Optional explanations for Safeguard ${safeguardId}`}/>;
}
