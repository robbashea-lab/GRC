import {visibleQuestions} from './guidedAssessment';
import {focusedOmniEnabled,focusedResult} from './focusedOmni';

// The correction belongs to this record only; the existing 1.2 pilot is independent.
export const inventorySummaryEnabled=(clientId,user,framework,configuration,record)=>
  record?.client_id===clientId&&record?.framework_key===framework&&record?.definition_id==='1.1'&&
  focusedOmniEnabled(clientId,user,framework,configuration,'1.1');

export function inventorySummary(answers,version){
  const questions=visibleQuestions('1.1',answers,version),result=focusedResult('1.1',answers,version);
  const active=Object.fromEntries(Object.entries(answers).filter(([key])=>questions.some(q=>key===q.id||key===q.id+'_detail')));
  const prose=[active.inventory==='Yes'?'Brawndo reports an established enterprise asset inventory.':active.inventory==='Partially'?'Brawndo reports a partially established enterprise asset inventory.':active.inventory==='No'?'Brawndo reports that an enterprise asset inventory is not currently in place.':'Brawndo’s enterprise asset inventory position needs confirmation.'];
  if(active.existing?.trim())prose.push(`Current practice, as reported: ${active.existing.trim()}`);
  if(active.system?.trim())prose.push(`The inventory uses ${active.system.trim()}.`);
  if(active.owner?.trim())prose.push(`Responsibility is held by ${active.owner.trim()}.`);
  if(active.sources)prose.push(`The reported source arrangement is ${active.sources.toLowerCase()}.`);
  if(active.sources?.startsWith('Multiple')&&active.sources_detail?.trim())prose.push(`Reported sources and coverage: ${active.sources_detail.trim()}`);
  for(const [key,subject] of [['coverage','The inventory'],['attributes','The asset records']]){
    const question=questions.find(q=>q.id===key);
    for(const [value,verb] of [['Yes','include'],['Partially','only partly include'],['No','do not include'],['Not sure','have unconfirmed information for']]){
      const rows=question?.rows.filter(row=>active[key]?.[row]===value)||[];
      if(rows.length)prose.push(`${subject} ${verb} ${rows.join(', ')}, as reported.`);
    }
  }
  const operations={Yes:'Asset additions, retirements and removals are consistently reflected in the inventory, as reported.',Partially:'Asset additions, retirements and removals are only partly reflected in the inventory.',No:'Asset additions, retirements and removals are not consistently reflected in the inventory.','Not sure':'The process for updating asset records needs confirmation.'};
  if(active.maintenance)prose.push(operations[active.maintenance]);
  if(active.maintenance_detail?.trim())prose.push(`Reported update process: ${active.maintenance_detail.trim()}`);
  if(active.frequency&&active.frequency!=='Not sure')prose.push(`The reported complete inventory review frequency is ${active.frequency.toLowerCase()}.`);
  if(active.last_review)prose.push(`The last reported complete inventory review was ${active.last_review}.`);
  if(active.reconciled)prose.push(active.reconciled==='Yes'?'The inventory is compared with other device records, as reported.':active.reconciled==='Partially'?'Comparison with other device records is incomplete.':active.reconciled==='No'?'The inventory is not compared with other device records.':'Comparison with other device records needs confirmation.');
  if(active.scope_reason?.trim())prose.push(`Reported scope explanation: ${active.scope_reason.trim()}`);
  const breakdown=[];
  for(const q of questions.filter(q=>q.critical)){
    const rows=q.type==='matrix'?q.rows.map(row=>[row,active[q.id]?.[row]]):[[q.prompt,active[q.id]]];
    for(const [area,value] of rows){
      const signals=result.signals.filter(s=>s.questionId===q.id);
      const state=q.type==='matrix'?(value==='Yes'?'In place':['No','Partially'].includes(value)?'Incomplete or missing':value==='Not applicable'&&active.scope_reason?.trim()?'Reported outside scope':'Needs confirmation'):signals.some(s=>s.kind==='gap')?'Incomplete or missing':signals.some(s=>s.kind==='verification')?'Needs confirmation':'In place';
      breakdown.push({area,state,answer:value||'Not recorded'});
    }
  }
  const unique=items=>[...new Set(items.map(item=>item.trim()).filter(Boolean))];
  const deficiencies=unique(result.gaps),confirmations=unique(result.unknowns);
  if(deficiencies.length)prose.push(`Reported limitations: ${deficiencies.join('; ')}`);
  if(confirmations.length)prose.push(`Information still requiring confirmation: ${confirmations.join('; ')}`);
  return {result:{...result,narrative:prose.filter(Boolean).join(' ')},breakdown,deficiencies,confirmations};
}
