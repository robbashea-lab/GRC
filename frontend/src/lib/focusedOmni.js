import {brawndoWorkspacePilot} from './brawndoWorkspacePilot';
import {generateResult,visibleQuestions} from './guidedAssessment';
import {prioritizeGuidedLifecycle} from './guidedLifecycle';
import pilot from '@catalogs/omniWorkspacePilot.json';
const comparisonConflict=(id,answers)=>id==='1.2'&&answers.detection==='Yes'&&answers.inventory_dependency==='No';

export const focusedOmniEnabled=(clientId,user,framework,configuration,id)=>
  pilot.focusedControl1Enabled===true&&brawndoWorkspacePilot(clientId,user)&&framework==='cis-ig1'&&configuration?.implementation_group===1&&
  configuration?.guided_assessment_enabled!==false&&configuration?.focused_omni_enabled!==false&&(!id||['1.1','1.2'].includes(id));

export function focusedRecommendations(rows,drafts,contextComplete){
  const scoped=rows.filter(row=>['1.1','1.2'].includes(row.definition_id)&&row.in_active_scope!==false);
  const overview=prioritizeGuidedLifecycle(scoped,{drafts,contextComplete,limit:2});
  const resumable=new Set(overview.resume.map(row=>row.definition_id));
  const reasons={not_assessed:'The safeguard has no saved assessment position.',not_implemented:'The saved implementation identifies work still to address.',partial_or_unresolved:'Partial implementation or linked unresolved work is recorded.',verification_or_review:'The saved implementation needs verification or an existing scheduled review.',unfinished_interview:'Your saved interview has unresolved work to resume.'};
  const items=new Map([...overview.resume,...overview.recommendations.filter(row=>!resumable.has(row.definition_id))].map(row=>[row.definition_id,{...row,reason:reasons[row.reasonCode]}]));
  // A recorded inventory gap is a prerequisite, not a numerical ordering rule.
  const inventory=items.get('1.1'),handling=items.get('1.2');
  if(inventory&&handling&&inventory.status==='needs_attention'&&!resumable.has('1.2')){
    return [{...inventory,reason:inventory.reason+' This inventory foundation supports unauthorized-asset comparison in 1.2.'},handling];
  }
  return [...items.values()];
}

export function nextFocusedQuestion(id,answers,version){
  const questions=visibleQuestions(id,answers,version),result=focusedResult(id,answers,version);
  const root=id==='1.1'?'inventory':'process';
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
  const next={...answers,[question.id]:value};
  delete next[question.id+'_detail'];
  const root=id==='1.1'?'inventory':'process';
  if(question.id===root&&answers[root]!==value&&!['Yes','Partially'].includes(value)){
    // Earlier completed interviews remain in history, not current conclusions.
    for(const q of visibleQuestions(id,{[root]:'Yes'},version)){
      if(q.when?.[root]){delete next[q.id];delete next[q.id+'_detail'];}
    }
  }
  const visible=new Set(visibleQuestions(id,next,version).flatMap(q=>[q.id,q.id+'_detail']));
  return Object.fromEntries(Object.entries(next).filter(([key])=>visible.has(key)));
}

export function focusedNarrative(id,answers,version){
  const output=generateResult(id,answers,new Date(),version),questions=visibleQuestions(id,answers,version);
  const labels={inventory:'Inventory scope and method',coverage:'Asset coverage',attributes:'Inventory fields',maintenance:'Inventory maintenance',frequency:'Operating interval',last_review:'Inventory review',process:'Unauthorized-asset handling',detection:'Identification',actions:'Response',unresolved:'Remaining unauthorized assets'};
  const handlingLabels={inventory_dependency:'authorized inventory available for comparison',detection:'identification of unauthorized assets',disposition:'tracking of disposition decisions',confirmation:'confirmation that assets are no longer reachable or otherwise addressed',exceptions:'exception approval and tracking',reconciled:'reconciliation against authorized inventory',unresolved:'assets unresolved beyond the required response interval'};
  const handling=id==='1.2'?questions.filter(q=>handlingLabels[q.id]&&answers[q.id]).map(q=>`Reported ${handlingLabels[q.id]}: ${answers[q.id]==='Partially'?'Partly':answers[q.id]}.`):[];
  const explanations=questions.filter(q=>answers[q.id+'_detail']?.trim()).map(q=>`Reported ${labels[q.id]?.toLowerCase()||'supporting context'}: ${answers[q.id+'_detail'].trim()}`);
  return [output.narrative,...handling,...explanations,output.gaps.length&&`Reported gaps: ${output.gaps.join('; ')}.`,output.unknowns.length&&`Items still requiring confirmation: ${output.unknowns.join('; ')}.`,comparisonConflict(id,answers)?'The comparison basis remains unresolved: consistent identification is reported without a usable authorized inventory.':''].filter(Boolean).join(' ');
}

export function focusedResult(id,answers,version){
  const output=generateResult(id,answers,new Date(),version),questions=visibleQuestions(id,answers,version);
  if(comparisonConflict(id,answers)){
    output.unknowns.push('Consistent unauthorized-asset identification is reported, but no usable authorized inventory is reported. Clarify the comparison basis before proposing Implemented.');
    output.signals.push({questionId:'inventory_dependency',kind:'verification'});
    if(output.status==='addressed')output.status='in_progress';
    output.nextSteps.push('Clarify how authorized and unauthorized assets are distinguished, using the current recorded process.');
  }
  return {...output,narrative:focusedNarrative(id,answers,version),answers:output.answers.map((answer,index)=>({...answer,answer:answer.answer+(answers[questions[index].id+'_detail']?.trim()?`; Client-reported supporting explanation: ${answers[questions[index].id+'_detail'].trim()}`:'')}))};
}
