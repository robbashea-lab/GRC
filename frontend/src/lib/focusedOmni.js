import {generateResult,visibleQuestions,pilotEnabled,catalogForVersion} from './guidedAssessment';
import {prioritizeGuidedLifecycle} from './guidedLifecycle';
const comparisonConflict=(id,answers,version)=>id==='1.2'&&!['cis-v8.1-control1-4','cis-v8.1-control1-5'].includes(version)&&answers.detection==='Yes'&&answers.inventory_dependency==='No';

export const focusedOmniEnabled=(clientId,user,framework,configuration,id)=>
  !!user&&pilotEnabled(clientId,framework,configuration,id);

export function focusedRecommendations(rows,drafts,contextComplete){
  const scoped=rows.filter(row=>row.framework_key==='cis-ig1'&&row.in_active_scope!==false);
  const overview=prioritizeGuidedLifecycle(scoped,{drafts,contextComplete,limit:5});
  const resumable=new Set(overview.resume.map(row=>row.definition_id));
  const reasons={not_assessed:'The safeguard has no saved assessment position.',not_implemented:'The saved implementation identifies work still to address.',partial_or_unresolved:'Partial implementation or linked unresolved work is recorded.',verification_or_review:'The saved implementation needs verification or an existing scheduled review.',unfinished_interview:'Your saved interview has unresolved work to resume.'};
  const items=new Map([...overview.recommendations,...overview.resume.filter(row=>!overview.recommendations.some(item=>item.definition_id===row.definition_id))].map(row=>[row.definition_id,{...row,reason:reasons[row.reasonCode],...(resumable.has(row.definition_id)?{action:'resume'}:{})}]));
  return [...items.values()].slice(0,5);
}

export function nextFocusedQuestion(id,answers,version){
  const questions=visibleQuestions(id,answers,version),result=focusedResult(id,answers,version);
  const root=catalogForVersion(version)?.definitions?.[id]?.root||(id==='1.1'?'inventory':'process');
  if(answers[root]!=='Yes'&&answers[root]!=='Partially')return Math.max(0,questions.findIndex(q=>q.id===root));
  const unresolved=new Set(result.signals.map(signal=>signal.questionId).filter(questionId=>questionId!==root));
  const critical=questions.findIndex(q=>unresolved.has(q.id));
  if(critical>=0)return critical;
  if(result.signals.some(signal=>signal.questionId===root))return questions.findIndex(q=>q.id===root);
  const reported=questions.findIndex(q=>['gaps','unknowns'].includes(q.id)&&answers[q.id]?.trim());
  if(reported>=0)return reported;
  // Optional explanations are useful after requirements, never implementation criteria.
  const context=questions.findIndex(q=>answers[q.id]===undefined);
  return context>=0?context:questions.length-1;
}

export function correctFocusedAnswer(id,answers,question,value,version){
  // Inactive facts stay in the versioned interview; evaluators and summaries only use visible answers.
  return {...answers,[question.id]:value};
}

// A recorded calendar day is local to the evaluator, not a UTC midnight instant.
export function focusedEvaluationDate(value){
  if(value instanceof Date)return value;
  return value?new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00':value):new Date();
}

export function focusedNarrative(id,answers,version,today=new Date()){
  const output=generateResult(id,answers,today,version),questions=visibleQuestions(id,answers,version);
  const labels={inventory:'Inventory scope and method',coverage:'Asset coverage',attributes:'Inventory fields',maintenance:'Inventory maintenance',frequency:'Operating interval',last_review:'Inventory review',process:'Unauthorized-asset handling',detection:'Identification',actions:'Response',unresolved:'Remaining unauthorized assets'};
  const handlingLabels={inventory_dependency:'authorized inventory available for comparison',detection:'identification of unauthorized assets',disposition:'tracking of disposition decisions',confirmation:'confirmation that assets are no longer reachable or otherwise addressed',exceptions:'exception approval and tracking',reconciled:'reconciliation against authorized inventory',unresolved:'assets unresolved beyond the required response interval'};
  const handling=id==='1.2'?questions.filter(q=>handlingLabels[q.id]&&answers[q.id]).map(q=>`Reported ${handlingLabels[q.id]}: ${answers[q.id]==='Partially'?'Partly':answers[q.id]}.`):[];
  const explanations=questions.filter(q=>answers[q.id+'_detail']?.trim()).map(q=>`Reported ${labels[q.id]?.toLowerCase()||'supporting context'}: ${answers[q.id+'_detail'].trim()}`);
  return [output.narrative,...handling,...explanations,output.gaps.length&&`Reported gaps: ${output.gaps.join('; ')}.`,output.unknowns.length&&`Items still requiring confirmation: ${output.unknowns.join('; ')}.`,comparisonConflict(id,answers,version)?'The comparison basis remains unresolved: consistent identification is reported without a usable authorized inventory.':''].filter(Boolean).join(' ');
}

export function focusedResult(id,answers,version,today=new Date()){
  const output=generateResult(id,answers,today,version),questions=visibleQuestions(id,answers,version);
  if(comparisonConflict(id,answers,version)){
    output.unknowns.push('Consistent unauthorized-asset identification is reported, but no usable authorized inventory is reported. Clarify the comparison basis before proposing Implemented.');
    output.signals.push({questionId:'inventory_dependency',kind:'verification'});
    if(output.status==='addressed')output.status='in_progress';
    output.nextSteps.push('Clarify how authorized and unauthorized assets are distinguished, using the current recorded process.');
  }
  return {...output,...(id==='1.1'&&questions.some(question=>question.type==='date')?{evaluation_date:[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-')}:{}),narrative:focusedNarrative(id,answers,version,today),answers:output.answers.map((answer,index)=>({...answer,answer:answer.answer+(answers[questions[index].id+'_detail']?.trim()?`; Client-reported supporting explanation: ${answers[questions[index].id+'_detail'].trim()}`:'')}))};
}
