import {visibleQuestions,catalogForVersion} from './guidedAssessment';
import {focusedResult} from './focusedOmni';

// Presentation groups retain the production IDs, conditions and evaluator.
export const OMNI_GROUPS={
  '1.1':[
    {name:'Inventory',ids:['inventory','existing','system','sources','owner'],note:'inventory'},
    {name:'Asset coverage',ids:['coverage','scope_reason'],note:'coverage'},
    {name:'Inventory details',ids:['attributes'],note:'attributes'},
    {name:'Keeping it current',ids:['maintenance','maintenance_detail'],note:'maintenance_detail'},
    {name:'Review and reconciliation',ids:['frequency','last_review','reconciled','evidence','gaps','unknowns'],note:'evidence'}
  ],
  '1.2':[
    {name:'Current process',ids:['process','existing','system','owner'],note:'process'},
    {name:'Identification',ids:['inventory_dependency','detection'],note:'detection'},
    {name:'Response',ids:['frequency','actions','disposition','confirmation'],note:'actions'},
    {name:'Exceptions and reconciliation',ids:['exceptions','reconciled','unresolved'],note:'exceptions'},
    {name:'Review and confirmation',ids:['evidence','gaps','unknowns'],note:'evidence'}
  ]
};
export function omniGroups(id,answers,version){
  const questions=visibleQuestions(id,answers,version);
  const definition=catalogForVersion(version)?.definitions?.[id],root=definition?.root;
  const groups=catalogForVersion(version)?.groups?.[id]||OMNI_GROUPS[id]||[
    {name:'Current practice',ids:[root,'existing','system','owner'],note:root},
    ...questions.filter(q=>q.critical&&q.id!==root).map((q,index)=>({name:q.topic||`Safeguard requirements${index?' · '+(index+1):''}`,ids:[q.id],note:q.id})),
    {name:'Review and confirmation',ids:questions.filter(q=>!q.critical&&![root,'existing','system','owner'].includes(q.id)).map(q=>q.id),note:'evidence'}
  ];
  return groups.map(group=>({...group,questions:questions.filter(q=>group.ids.includes(q.id))}));
}
export const multipleOmniSources=answers=>['Multiple reconciled sources','Multiple unreconciled sources'].includes(answers.sources)&&['Yes','Partially'].includes(answers.inventory);

export function refinedSummary(id,answers,version){
  const result=focusedResult(id,answers,version),active=visibleQuestions(id,answers,version);
  const a=Object.fromEntries(Object.entries(answers).filter(([key])=>active.some(q=>key===q.id||key===q.id+'_detail')));
  const root=a[id==='1.1'?'inventory':'process'];
  const subject=id==='1.1'?'an enterprise asset inventory':'a process for addressing unauthorized assets';
  const opening=[root==='Yes'?`The organization reports ${subject}.`:root==='Partially'?`The organization reports a partially established ${subject.replace(/^a[n]? /,'')}.`:root==='No'?`The organization reports that ${subject} is not currently in place.`:`The current ${id==='1.1'?'inventory':'unauthorized-asset handling'} process is not confirmed.`];
  if(a.system?.trim())opening.push(`The reported ${id==='1.1'?'inventory source':'detection system or process'} is ${a.system.trim()}.`);
  if(a.owner?.trim())opening.push(`Reported responsibilities are held by ${a.owner.trim()}.`);
  if(a.frequency&&a.frequency!=='Not sure')opening.push(`The reported ${id==='1.1'?'complete inventory review':'response'} frequency is ${a.frequency.toLowerCase()}.`);
  if(a.last_review)opening.push(`The last reported complete inventory review was ${a.last_review}.`);
  if(result.gaps.length||result.unknowns.length)opening.push('Recorded deficiencies or uncertainties remain for review below.');
  const sections=[['Recorded implementation',[
    a.existing&&`Existing practice, as reported: ${a.existing}`,
    a.system&&`Reported system or source: ${a.system}.`,a.owner&&`Reported responsible team: ${a.owner}.`,
    a.sources&&`Source arrangement: ${a.sources}.`,multipleOmniSources(a)&&a.sources_detail&&`Sources and coverage, as reported: ${a.sources_detail}`,
    a.maintenance&&({Yes:'Assets are added, retired and removed consistently, as reported.',Partially:'Asset changes are only partly reflected in the inventory.',No:'Asset changes are not consistently reflected in the inventory.','Not sure':'The asset-update process needs confirmation.'}[a.maintenance]),
    a.maintenance_detail&&`Reported update process: ${a.maintenance_detail}`,
    a.frequency&&`Reported operating frequency: ${a.frequency}.`,a.last_review&&`Last reported complete review: ${a.last_review}.`,
    a.actions?.length&&`Reported response actions: ${a.actions.join(', ')}.`,
    id==='1.1'&&a.reconciled&&({Yes:'The inventory is compared with other device records, as reported.',Partially:'The inventory is only partly compared with other device records.',No:'The inventory is not compared with other device records.','Not sure':'Comparison with other device records requires confirmation.'}[a.reconciled])
  ].filter(Boolean)]];
  const describe=(row,value,details=false)=>value==='Yes'?`${row} ${details?'is recorded':'are included'}, as reported.`:value==='Partially'?`${row} ${details?'is only partly recorded':'are only partially inventoried'}; confirm and address the missing ${details?'details':'assets in scope'}.`:value==='No'?`${row} ${details?'is not recorded':'are not included'}; address the missing ${details?'detail':'assets in scope'}.`:value==='Not applicable'?`${row} is reported outside the applicable scope; review the recorded explanation.`:`${row} ${details?'is not confirmed':'coverage is not confirmed'}; check the current ${details?'asset records':'inventory'}.`;
  if(a.coverage)sections.push(['Asset coverage',Object.entries(a.coverage).map(([row,value])=>describe(row,value))]);
  if(a.attributes)sections.push(['Required asset details',Object.entries(a.attributes).map(([row,value])=>describe(row,value,true))]);
  if(id==='1.2'){
    const labels={inventory_dependency:'Authorized-inventory comparison',detection:'Unauthorized-asset identification',disposition:'Asset disposition',confirmation:'Response confirmation',exceptions:'Approved exceptions',reconciled:'Comparison and reconciliation',unresolved:'Unresolved unauthorized assets'};
    sections.push(['Handling and confirmation',active.filter(q=>labels[q.id]&&a[q.id]).map(q=>`${labels[q.id]}: ${a[q.id]}, as reported.`)]);
  }
  if(a.scope_reason?.trim())sections.push(['Scope explanations',[`Client-reported explanation: ${a.scope_reason}`]]);
  const notes=active.filter(q=>a[q.id+'_detail']?.trim()&&q.id!=='sources'&&!active.some(other=>other.id===q.id+'_detail')).map(q=>`Reported context for ${OMNI_GROUPS[id].find(group=>group.note===q.id)?.name||q.prompt}: ${a[q.id+'_detail']}`);
  const items=[...result.gaps.map(v=>'Recorded deficiency: '+v),...result.unknowns.map(v=>'Requires confirmation: '+v),...notes,a.evidence&&`Reported supporting records: ${a.evidence}`].filter(Boolean);
  sections.push(['Items to address or confirm',items.length?items:['No unresolved criteria were identified in the recorded answers. Evidence verification remains separate.']]);
  return {...result,narrative:[opening.join(' '),...sections.map(([title,items])=>title+'\n'+(items.length?items.map(v=>'• '+v).join('\n'):'No additional details recorded.'))].join('\n\n')};
}

export function recordedOmniReasons(row,complete){
  if(row.status==='not_assessed')return ['This safeguard has not been assessed yet.'];
  if(!complete||row.work?.context_complete===false)return ['Some authorized assessment context is unavailable. Reopen the safeguard to check the saved record.'];
  const source=row.guided_assessment_source,reasons=[];
  // These are the answers attached to the saved native record, never an unfinished or unapplied interview.
  if(source?.answers&&catalogForVersion(source.version)){
    try{
      const output=focusedResult(row.definition_id,source.answers,source.version);
      for(const signal of output.signals){
        const q=visibleQuestions(row.definition_id,source.answers,source.version).find(q=>q.id===signal.questionId),value=source.answers[signal.questionId];
        if(q?.type==='matrix'){
          for(const name of q.rows){
            const response=value?.[name];
            if(signal.kind==='gap'&&['No','Partially'].includes(response))reasons.push(row.definition_id==='1.1'?`${name} ${q.id==='attributes'?'details are incomplete':'are not fully included in the inventory'}.`:`Reported requirement is incomplete: ${name}`);
            if(signal.kind==='verification'&&(!response||response==='Not sure'||response==='Not applicable'&&!source.answers.scope_reason?.trim()))reasons.push(row.definition_id==='1.1'?`${name} ${q.id==='attributes'?'details need confirmation':'coverage needs confirmation'}.`:`Requirement needs confirmation: ${name}`);
          }
        }else if(q){
          const names={inventory:'The inventory position',process:'The unauthorized-asset process',frequency:'The recorded operating frequency',maintenance:'The asset-update process',detection:'Unauthorized-asset identification',inventory_dependency:'The authorized-inventory comparison basis',actions:'The response actions',unresolved:'The handling of unresolved assets'};
          reasons.push((names[q.id]||q.prompt)+(signal.kind==='verification'?' needs confirmation.':' has a recorded deficiency.'));
        }
      }
      if(source.answers.gaps?.trim())reasons.push('Reported deficiency: '+source.answers.gaps.trim());
      if(source.answers.unknowns?.trim())reasons.push('Needs confirmation: '+source.answers.unknowns.trim());
    }catch{reasons.push('Saved interview details are unavailable or incompatible. Review the native assessment.');}
  }
  for(const item of row.work?.priority_records||[])if(item.open_gap===true&&item.title)reasons.push('Open linked work: '+item.title);
  if(row.work?.open_findings>0)reasons.push('Open findings remain to be reviewed.');
  if(row.work?.open_actions>0)reasons.push('Open action items remain to be reviewed.');
  if(row.work?.overdue_reviews>0)reasons.push('An existing scheduled review is overdue.');
  if(row.status==='addressed'&&row.verification!=='verified')reasons.push('Evidence verification remains outstanding.');
  const unique=[...new Set(reasons.map(v=>v.trim()))].slice(0,5);
  return unique.length?unique:['Detailed gaps are not available in the saved context. Review the current assessment to confirm the remaining work.'];
}
