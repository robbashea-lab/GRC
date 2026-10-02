import guide from '@catalogs/operatorGuidance/isoRequirementGuide.json';
import RequirementGuide from './RequirementGuide';

export const isoGuideEntry=id=>guide.entries[id];
export const ISO_AUDIT_QUESTIONS=[
  ['plain','Explain this audit requirement in plain language.'],
  ['start','Where should I start?'],
  ['evidence','What should I examine or sample?'],
  ['ask','Who should I speak with, and what should I ask?'],
  ['gaps','What common gaps should I look for?']
];

export default function IsoRequirementGuide({id,auditItem}) {
  const entry=isoGuideEntry(id);
  const answers=auditItem?{
    plain:`Examine ${auditItem.reference} against the agreed audit criteria and record an independent conclusion. ${auditItem.intent}`,
    start:`Confirm scope, criteria, the responsible auditor and arrangements for objectivity before examining ${auditItem.title}. ${auditItem.verify}`,
    evidence:`Sample relevant records and actual operation: ${auditItem.inspect} ${auditItem.evidence}`,
    ask:`Speak with the people performing and overseeing this activity. ${auditItem.questions}`,
    gaps:`Look for differences between criteria and sampled operation. ${entry?.gaps||auditItem.verify} Record the basis for any observation or nonconformity; an implementation gap alone is not an audit conclusion.`
  }:entry;
  return <RequirementGuide answers={answers} revision={guide.version} questions={auditItem?ISO_AUDIT_QUESTIONS:undefined} intro="Omnisciente original guidance; ISO references are distinct from implementation recommendations."/>;
}
