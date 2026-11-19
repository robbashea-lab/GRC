import catalog from '@catalogs/r4FrameworkGuidance.json';
export const genericGuidedCatalog=catalog;
export const genericGuidedFramework=key=>catalog.frameworks.includes(key);
export const genericGuidedVersion=key=>catalog.version_prefix+key;
export const genericQuestions=answers=>catalog.questions.filter(question=>!question.when||Object.entries(question.when).every(([key,values])=>values.includes(answers[key])));
export function validateGenericAnswers(id,answers,version){
  if(!catalog.frameworks.some(key=>genericGuidedVersion(key)===version)||!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('Question set is unavailable');
  for(const [key,value] of Object.entries(answers)){
    const question=catalog.questions.find(question=>question.id===key);
    if(!question||typeof value!=='string'||value.length>2000||question.type==='select'&&!question.choices.includes(value))throw new Error('Invalid interview answer');
  }
}
export function validateGenericCompletion(id,answers,version){
  validateGenericAnswers(id,answers,version);
  if(genericQuestions(answers).some(question=>question.required&&!answers[question.id]?.trim()))throw new Error('Record each required answer and explanation before reviewing the draft');
}
export function genericSignals(answers){
  const signals=[];
  const add=(questionId,kind,text)=>signals.push({questionId,kind,text});
  if(['No','Partially'].includes(answers.practice))add('practice','gap','The practice is reported '+(answers.practice==='No'?'not in place.':'partially in place.'));
  else if(answers.practice!=='Yes')add('practice','verification','Confirm whether the practice is in place within the actual scope.');
  if(answers.gap==='Yes')add('gap_reason','gap',answers.gap_reason.trim());
  else if(answers.gap==='Not sure')add('gap','verification','Confirm whether a source-specific deficiency exists.');
  if(answers.unknown==='Yes')add('unknown_reason','verification',answers.unknown_reason.trim());
  else if(answers.unknown==='Not sure')add('unknown','verification','Confirm the substantive requirement information before concluding implementation.');
  return signals;
}
export function genericGuidedResult(id,answers,version){
  validateGenericCompletion(id,answers,version);
  const status=answers.practice==='No'?'needs_attention':answers.practice==='Not sure'?'not_assessed':answers.practice==='Partially'||answers.gap!=='No'||answers.unknown!=='No'?'in_progress':'addressed';
  const signals=genericSignals(answers),gaps=signals.filter(signal=>signal.kind==='gap').map(signal=>signal.text),unknowns=signals.filter(signal=>signal.kind==='verification').map(signal=>signal.text);
  const entries=genericQuestions(answers).filter(question=>answers[question.id]?.trim()).map(question=>({prompt:question.prompt,answer:answers[question.id]}));
  const narrative=[answers.implementation,answers.scope&&`Scope and applicability: ${answers.scope}`,answers.operation&&`Operating method and timing: ${answers.operation}`,answers.evidence&&`Reported supporting records, not independently verified: ${answers.evidence}`,gaps.length&&`Identified gaps\n${gaps.join('\n')}`,unknowns.length&&`Items requiring confirmation\n${unknowns.join('\n')}`].filter(Boolean).join('\n\n');
  return {version,status,narrative,basis:[],gaps,unknowns,nextSteps:[],evidence:answers.evidence?[answers.evidence]:[],answers:entries,signals};
}
