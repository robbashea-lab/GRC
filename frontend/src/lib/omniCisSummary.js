import {catalogForVersion,visibleQuestions} from './guidedAssessment';
import {focusedResult} from './focusedOmni';
import {inventorySummary} from './omniInventorySummary';

const unique=items=>[...new Set(items.map(item=>item.trim()).filter(Boolean))];
const bullets=items=>unique(items).map(item=>'- '+item).join('\n');
const labels={process:'Unauthorized-asset process',tool:'Discovery capability',coverage:'Coverage',frequency:'Operating frequency',inventory_update:'Inventory updates',detection:'Unauthorized-asset identification',actions:'Response actions',unresolved:'Unresolved unauthorized assets',inventory_dependency:'Inventory comparison context',disposition:'Disposition tracking',confirmation:'Response confirmation',exceptions:'Approved exception context',reconciled:'Reconciliation context',practice:'Reported practice'};
const contextLabels={existing:'Current practice',system:'Systems or processes',owner:'Responsibility',operation:'Day-to-day operation',context:'Reported context',scope_reason:'Scope explanation',evidence:'Reported supporting records'};

export function omniCisSummary(id,answers,version,clientName='The organization'){
  if(id==='1.1')return inventorySummary(answers,version,clientName);
  const definition=catalogForVersion(version)?.definitions?.[id],questions=visibleQuestions(id,answers,version),result=focusedResult(id,answers,version);
  const active=Object.fromEntries(Object.entries(answers).filter(([key])=>questions.some(q=>key===q.id||key===q.id+'_detail')));
  const root=active[definition.root],subject=definition.title.toLowerCase();
  const overview=[root==='Yes'?`${clientName} reports the practice to ${subject} is in place.`:root==='Partially'?`${clientName} reports partial implementation of the practice to ${subject}.`:root==='No'?`${clientName} reports the practice to ${subject} is not currently in place.`:`${clientName}’s implementation of the practice to ${subject} needs confirmation.`];
  if(active.operation?.trim())overview.push(`Reported operation: ${active.operation.trim()}`);
  else if(active.system?.trim())overview.push(`The reported system or process is ${active.system.trim()}.`);
  const sections={'In place':[],'Needs confirmation':[],'Incomplete or missing':[],'Reported outside scope':[]},actions={confirmation:[],remediation:[]},breakdown=[];
  for(const q of questions.filter(q=>q.critical)){
    const value=active[q.id],signals=result.signals.filter(signal=>signal.questionId===q.id);
    if(q.type==='matrix'){
      for(const row of q.rows){
        const response=value?.[row],state=response==='Not applicable'&&q.choices.includes('Not applicable')&&active.scope_reason?.trim()?'Reported outside scope':response==='Yes'?'In place':['No','Partially'].includes(response)?'Incomplete or missing':'Needs confirmation';
        sections[state].push(row+(state==='In place'?' Reported as met.':state==='Incomplete or missing'?response==='No'?' Reported as absent.':' Reported as incomplete.':state==='Reported outside scope'?' Reported outside the stated source condition.':' Requires confirmation.'));
        if(state==='Needs confirmation')actions.confirmation.push('Confirm: '+row);
        if(state==='Incomplete or missing')actions.remediation.push('Address the reported deficiency: '+row);
        breakdown.push({questionId:q.id,area:row,state,answer:response||'Not recorded'});
      }
    }else{
      const topic=q.summary_topic||labels[q.id]||q.element?.replaceAll('_',' ')||'Safeguard requirement';
      const state=signals.some(signal=>signal.kind==='gap')?'Incomplete or missing':signals.some(signal=>signal.kind==='verification')?'Needs confirmation':'In place';
      const reported=Array.isArray(value)?value.join(', '):value;
      const text=q.narrative_template?.includes('{recorded_answer}')?q.narrative_template.replaceAll('{recorded_answer}',reported||'requires confirmation'):`${topic}: ${reported||'requires confirmation'}.`;
      sections[state].push(text);
      if(state==='Needs confirmation')actions.confirmation.push(`Confirm ${topic.toLowerCase()} against the safeguard requirement.`);
      if(state==='Incomplete or missing')actions.remediation.push(q.remediation_template||`Address the reported ${topic.toLowerCase()} deficiency: ${q.help||definition.guidance}`);
      breakdown.push({questionId:q.id,area:topic,state,answer:reported||'Not recorded'});
    }
  }
  if(active.gaps?.trim()){sections['Incomplete or missing'].push('Reviewer-reported deficiencies: '+active.gaps.trim());actions.remediation.push('Address the reported deficiencies: '+active.gaps.trim());}
  if(active.unknowns?.trim()){sections['Needs confirmation'].push('Reviewer-reported uncertainty: '+active.unknowns.trim());actions.confirmation.push('Confirm with the responsible team: '+active.unknowns.trim());}
  for(const issue of result.unknowns.filter(value=>/^(Applicability requires|The overall practice answer)/.test(value))){sections['Needs confirmation'].push(issue);actions.confirmation.push(issue);}
  const context=[];
  for(const q of questions){
    if(!q.critical&&!['gaps','unknowns'].includes(q.id)&&active[q.id]){const value=Array.isArray(active[q.id])?active[q.id].join(', '):active[q.id];context.push(`${contextLabels[q.id]||labels[q.id]||q.id.replaceAll('_',' ')}: ${value}`);}
    if(active[q.id+'_detail']?.trim())context.push(`Reported ${labels[q.id]?.toLowerCase()||q.id.replaceAll('_',' ')} context: ${active[q.id+'_detail'].trim()}`);
  }
  const grouped=Object.entries(sections).filter(([name,items])=>items.length||name==='Incomplete or missing').map(([name,items])=>name+'\n'+bullets(items.length?items:['No confirmed deficiencies were identified from the reported answers. Any confirmation items remain unresolved.']));
  if(context.length)grouped.push('Reported operating context\n'+bullets(context));
  const next=[actions.confirmation.length&&'Confirmation work\n'+bullets(actions.confirmation),actions.remediation.length&&'Remediation\n'+bullets(actions.remediation)].filter(Boolean);
  const narrative=['OVERVIEW',overview.join(' '),'IMPLEMENTATION BREAKDOWN',grouped.join('\n\n'),'ITEMS TO ADDRESS',next.length?next.join('\n\n'):'- No outstanding next steps were identified from the reported answers. Evidence verification remains separate.'].join('\n\n');
  return {result:{...result,narrative},breakdown,deficiencies:unique(result.gaps),confirmations:unique(result.unknowns)};
}
