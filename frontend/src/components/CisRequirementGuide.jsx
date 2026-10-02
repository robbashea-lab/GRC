import {useId,useState} from 'react';
import guide from '@catalogs/operatorGuidance/cisRequirementGuide.json';

export const GUIDE_QUESTIONS=[
  ['plain','Explain this in plain language.'],
  ['start','Where should I start?'],
  ['evidence','What evidence could help?'],
  ['ask','What should I ask IT or our provider?'],
  ['gaps','What common gaps should I look for?'],
];

// Local question selection only: this component has no assessment or persistence API.
export default function CisRequirementGuide({safeguardId}) {
  const [selected,setSelected]=useState('plain');
  const prefix=useId(),answers=guide.requirements[safeguardId];
  if(!answers)return null;
  const question=GUIDE_QUESTIONS.find(([key])=>key===selected)[1];
  return <aside className="cis-requirement-guide" aria-labelledby={`${prefix}-title`} data-guide-revision={guide.revision}>
    <h3 id={`${prefix}-title`}>Requirement guide</h3>
    <p className="cis-guide-intro">Optional explanations for Safeguard {safeguardId}</p>
    <div className="cis-guide-questions" role="group" aria-label="Requirement guide questions">
      {GUIDE_QUESTIONS.map(([key,label])=><button key={key} type="button" aria-pressed={selected===key}
        aria-controls={`${prefix}-answer`} onClick={()=>setSelected(key)}>{label}</button>)}
    </div>
    <div id={`${prefix}-answer`} className="cis-guide-answer" aria-live="polite" aria-atomic="true">
      <h4>{question}</h4><p>{answers[selected]}</p>
    </div>
  </aside>;
}
