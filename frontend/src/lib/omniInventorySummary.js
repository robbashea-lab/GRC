import {visibleQuestions} from './guidedAssessment';
import {focusedOmniEnabled,focusedResult} from './focusedOmni';

// The correction belongs to this record only; the existing 1.2 pilot is independent.
export const inventorySummaryEnabled=(clientId,user,framework,configuration,record)=>
  record?.client_id===clientId&&record?.framework_key===framework&&record?.definition_id==='1.1'&&
  focusedOmniEnabled(clientId,user,framework,configuration,'1.1');

export function inventorySummary(answers,version){
  const questions=visibleQuestions('1.1',answers,version),result=focusedResult('1.1',answers,version);
  const active=Object.fromEntries(Object.entries(answers).filter(([key])=>questions.some(q=>key===q.id||key===q.id+'_detail')));
  const overview=[active.inventory==='Yes'?'Brawndo reports maintaining an enterprise asset inventory.':active.inventory==='Partially'?'Brawndo reports a partially established enterprise asset inventory.':active.inventory==='No'?'Brawndo reports that an enterprise asset inventory is not currently in place.':'Brawndo’s enterprise asset inventory position needs confirmation.'];
  if(active.system?.trim())overview.push(`The inventory uses ${active.system.trim()}.`);
  if(active.sources&&active.sources!=='Not sure')overview.push(`The reported source arrangement is ${active.sources.toLowerCase()}.`);
  const breakdown=[];
  for(const q of questions.filter(q=>q.critical)){
    const rows=q.type==='matrix'?q.rows.map(row=>[row,active[q.id]?.[row]]):[[q.prompt,active[q.id]]];
    for(const [area,value] of rows){
      const signals=result.signals.filter(s=>s.questionId===q.id);
      const state=q.type==='matrix'?(value==='Yes'?'In place':['No','Partially'].includes(value)?'Incomplete or missing':value==='Not applicable'&&active.scope_reason?.trim()?'Reported outside scope':'Needs confirmation'):signals.some(s=>s.kind==='gap')?'Incomplete or missing':signals.some(s=>s.kind==='verification')?'Needs confirmation':'In place';
      breakdown.push({questionId:q.id,area,state,answer:value||'Not recorded'});
    }
  }
  const unique=items=>[...new Set(items.map(item=>item.trim()).filter(Boolean))];
  const deficiencies=unique(result.gaps),confirmations=unique(result.unknowns);
  const sections={'In place':[],'Needs confirmation':[],'Incomplete or missing':[],'Reported outside scope':[]},actions={confirmation:[],remediation:[]};
  const statements={
    inventory:{yes:'An enterprise asset inventory is maintained.',gap:active.inventory==='No'?'An enterprise asset inventory is not currently in place.':'The enterprise asset inventory is only partly established.',unknown:'Inventory: Whether an enterprise asset inventory is maintained.',confirm:'Confirm the current enterprise asset inventory position.',remedy:'Establish or complete the enterprise asset inventory.'},
    maintenance:{yes:'Asset additions, changes and retirements are reflected in the inventory.',gap:'Asset additions, changes and retirements are not consistently reflected in the inventory.',unknown:'Maintenance: How asset additions, changes and retirements are reflected in the inventory.',confirm:'Confirm the inventory update process.',remedy:'Address the reported gaps in inventory updates for asset additions, changes and retirements.'},
    frequency:{yes:`Periodic review: The complete inventory is reviewed ${active.frequency?.toLowerCase()}.`,gap:`Periodic review: The reported ${active.frequency?.toLowerCase()} interval does not meet the existing review requirement.`,unknown:'Periodic review: The complete inventory review frequency.',confirm:'Confirm the complete inventory review frequency.',remedy:'Bring the complete inventory review interval into line with the existing requirement.'},
    last_review:{yes:`Periodic review: The last reported complete review was ${active.last_review}.`,gap:`Periodic review: The reported review date ${active.last_review} does not meet the existing date criterion.`,unknown:'Periodic review: The most recent complete inventory review date.',confirm:'Confirm and record the most recent complete inventory review date when known.',remedy:'Review the inventory and record a valid complete review date under the existing requirement.'}
  };
  for(const q of questions.filter(q=>q.critical)){
    const rows=breakdown.filter(row=>row.questionId===q.id);
    if(q.type==='matrix'){
      const topic=q.id==='coverage'?'Asset coverage':'Inventory details';
      for(const state of Object.keys(sections)){
        const selected=rows.filter(row=>row.state===state);if(!selected.length)continue;
        sections[state].push(`${topic}: ${selected.map(row=>row.area).join(', ')}${state==='In place'?(q.id==='coverage'?' are included.':' are recorded.'):state==='Incomplete or missing'?' are missing or incomplete.':state==='Reported outside scope'?' are reported outside the applicable scope.':'.'}`);
        if(state==='Needs confirmation')actions.confirmation.push(q.id==='coverage'?`Confirm coverage for ${selected.map(row=>row.area).join(', ')}.`:`Confirm recording of ${selected.map(row=>row.area).join(', ')}.`);
        if(state==='Incomplete or missing')actions.remediation.push(q.id==='coverage'?`Add or complete inventory coverage for ${selected.map(row=>row.area).join(', ')}.`:`Record or complete the missing inventory details for ${selected.map(row=>row.area).join(', ')}.`);
      }
    }else{
      const row=rows[0],text=statements[q.id];
      if(text){sections[row.state].push(row.state==='In place'?text.yes:row.state==='Needs confirmation'?text.unknown:text.gap);if(row.state==='Needs confirmation')actions.confirmation.push(text.confirm);if(row.state==='Incomplete or missing')actions.remediation.push(text.remedy);}
    }
  }
  if(active.sources==='Not sure'){sections['Needs confirmation'].push('Inventory sources: The source arrangement.');actions.confirmation.push('Confirm how the inventory sources relate to one another.');}
  if(active.sources==='Multiple unreconciled sources'){sections['Incomplete or missing'].push('Inventory sources: Multiple sources are reported as unreconciled.');actions.remediation.push('Reconcile the reported inventory sources and their coverage.');}
  if(['One source','Multiple reconciled sources'].includes(active.sources))sections['In place'].push(active.sources==='One source'?'One inventory source is reported.':'Multiple inventory sources are reported as reconciled.');
  if(active.reconciled==='Yes')sections['In place'].push('The inventory is compared with other device records.');
  else if(['No','Partially'].includes(active.reconciled)){sections['Incomplete or missing'].push('Comparison with other device records is absent or incomplete.');actions.remediation.push('Address the reported gaps in comparison with other device records.');}
  else if(active.reconciled==='Not sure'){sections['Needs confirmation'].push('Comparison: Whether the inventory is compared with other device records.');actions.confirmation.push('Confirm the comparison process for other device records.');}
  if(active.gaps?.trim()){sections['Incomplete or missing'].push(`Reviewer-reported deficiencies: ${active.gaps.trim()}`);actions.remediation.push(`Address the reported deficiencies: ${active.gaps.trim()}`);}
  if(active.unknowns?.trim()){sections['Needs confirmation'].push(`Reviewer-reported uncertainty: ${active.unknowns.trim()}`);actions.confirmation.push(`Confirm with the responsible team: ${active.unknowns.trim()}`);}
  const context=[];
  for(const [key,label] of [['existing','Current practice'],['owner','Responsibility'],['maintenance_detail','Update process'],['scope_reason','Scope explanation'],['evidence','Reported supporting records']])if(active[key]?.trim())context.push(`${label}: ${active[key].trim()}`);
  if(active.sources?.startsWith('Multiple')&&active.sources_detail?.trim())context.push(`Sources and coverage: ${active.sources_detail.trim()}`);
  for(const q of questions)if(active[q.id+'_detail']?.trim()&&!['sources','maintenance'].includes(q.id))context.push(`Reported ${q.id==='coverage'?'coverage':q.id==='attributes'?'inventory details':q.id==='inventory'?'inventory':q.id==='evidence'?'review':q.id.replaceAll('_',' ')} context: ${active[q.id+'_detail'].trim()}`);
  const bullets=items=>unique(items).map(item=>'- '+item).join('\n');
  const grouped=Object.entries(sections).filter(([name,items])=>items.length||name==='Incomplete or missing').map(([name,items])=>name+'\n'+bullets(items.length?items:['No confirmed deficiencies were identified from the reported answers. Any confirmation items remain unresolved.']));
  if(context.length)grouped.push('Reported operating context\n'+bullets(context));
  const next=[actions.confirmation.length&&'Confirmation work\n'+bullets(actions.confirmation),actions.remediation.length&&'Remediation\n'+bullets(actions.remediation)].filter(Boolean);
  const narrative=['OVERVIEW',overview.join(' '),'IMPLEMENTATION BREAKDOWN',grouped.join('\n\n'),'ITEMS TO ADDRESS',next.length?next.join('\n\n'):'- No outstanding next steps were identified from the reported answers. Evidence verification remains separate.'].join('\n\n');
  return {result:{...result,narrative},breakdown,deficiencies,confirmations};
}
