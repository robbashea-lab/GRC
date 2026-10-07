import catalog from '@catalogs/guidedAssessmentPilot.json';
export {catalog as guidedCatalog};
export const pilotEnabled=(client,framework,configuration,id)=>client===catalog.pilot.client_id&&framework===catalog.pilot.framework_key&&(configuration?.implementation_group??1)===1&&(!id||Object.hasOwn(catalog.safeguards,id));
export function visibleQuestions(id,answers){
  return (catalog.safeguards[id]||[]).filter(q=>!q.when||Object.entries(q.when).every(([key,values])=>values.includes(answers[key]))).filter(q=>q.condition!=='not_applicable'||['coverage','attributes'].some(k=>Object.values(answers[k]||{}).includes('Not applicable')));
}
export function validateAnswers(id,answers){
  if(!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('Invalid interview answers');
  const questions=catalog.safeguards[id];
  if(!questions)throw new Error('Unsupported pilot safeguard');
  for(const [key,value] of Object.entries(answers)){
    const detail=key.endsWith('_detail'),q=questions.find(q=>q.id===(detail?key.slice(0,-7):key));
    if(!q)throw new Error('Unknown question');
    if(detail||['text','date'].includes(q.type)){if(typeof value!=='string'||value.length>2000)throw new Error('Invalid answer text');}
    else if(q.type==='matrix'){if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([k,v])=>!q.rows.includes(k)||!q.choices.includes(v)))throw new Error('Invalid matrix answer');}
    else if(q.type==='multi'){if(!Array.isArray(value)||value.length>q.choices.length||new Set(value).size!==value.length||value.some(v=>!q.choices.includes(v)))throw new Error('Invalid answer selection');}
    else if(!q.choices.includes(value))throw new Error('Invalid answer selection');
  }
  return answers;
}
const label=value=>Array.isArray(value)?value.join(', '):value&&typeof value==='object'?Object.entries(value).map(([k,v])=>`${k}: ${v}`).join('; '):String(value||'Not recorded');
export function generateResult(id,answers,today=new Date()){
  validateAnswers(id,answers);
  const active=new Set(visibleQuestions(id,answers).flatMap(q=>[q.id,q.id+'_detail']));
  answers=Object.fromEntries(Object.entries(answers).filter(([key])=>active.has(key)));
  const questions=visibleQuestions(id,answers),gaps=[],unknowns=[],basis=[],evidence=[],signals=[];
  const names={inventory:'Enterprise inventory',process:'Unauthorized-asset process',system:'System or source',owner:'Responsible owner/team',coverage:'Asset category coverage',attributes:'Required inventory attributes',sources:'Inventory sources',maintenance:'Asset maintenance',frequency:'Review/response frequency',last_review:'Last complete inventory review',reconciled:'Inventory reconciliation',inventory_dependency:'Usable authorized inventory',detection:'Unauthorized-asset detection',actions:'Permitted response actions',disposition:'Disposition tracking',confirmation:'Response confirmation',unresolved:'Unresolved unauthorized assets'};
  const root=id==='1.1'?'inventory':'process';
  for(const q of questions){
    const value=answers[q.id],values=q.type==='matrix'?q.rows.map(k=>value?.[k]):q.type==='multi'?value||[]:[value];
    const unknown=!values.length||values.some(v=>!v||v==='Not sure')||values.includes('Not applicable')&&!answers.scope_reason?.trim();
    let deficient=values.some(v=>v==='Partially'||v==='No'||v==='None');
    if(q.id==='unresolved')deficient=['Yes','Partially'].includes(value);
    if(q.id==='sources')deficient=value==='Multiple unreconciled sources';
    if(q.id==='frequency')deficient=id==='1.1'?['Annually','Ad hoc'].includes(value):['Every two weeks','Monthly','Ad hoc'].includes(value);
    if(q.type==='date'&&value){
      const parts=value.split('-').map(Number),last=new Date(parts[0],parts[1]-1,parts[2]);
      const cutoff=new Date(today.getFullYear(),today.getMonth()-6,1);
      cutoff.setDate(Math.min(today.getDate(),new Date(cutoff.getFullYear(),cutoff.getMonth()+1,0).getDate()));
      deficient=Number.isNaN(last.getTime())||last.getFullYear()!==parts[0]||last.getMonth()!==parts[1]-1||last.getDate()!==parts[2]||last<cutoff||last>today;
    }
    const issue=states=>q.type==='matrix'?q.rows.filter(k=>states.includes(value?.[k])).map(k=>k+': '+(value?.[k]||'Not recorded')).join('; '):label(value);
    if(q.critical&&unknown)unknowns.push(`${names[q.id]} — not confirmed: ${issue(['Not sure',undefined,'',...(!answers.scope_reason?.trim()?['Not applicable']:[])])}${answers[q.id+'_detail']?`; ${answers[q.id+'_detail']}`:''}`);
    if(q.critical&&deficient)gaps.push(`${names[q.id]} — ${issue(['Partially','No','None'])}${answers[q.id+'_detail']?`; ${answers[q.id+'_detail']}`:''}`);
    if(q.critical&&unknown)signals.push({questionId:q.id,kind:'verification'});
    if(q.critical&&deficient)signals.push({questionId:q.id,kind:'gap'});
    if(q.critical&&!unknown&&!deficient)basis.push(`${q.prompt} ${label(value)}`);
    if(q.id==='evidence')evidence.push(value||q.help);
  }
  if(answers.gaps?.trim())gaps.push(`Reviewer-reported follow-up: ${answers.gaps.trim()}`);
  const status=answers[root]==='No'?'needs_attention':!answers[root]||answers[root]==='Not sure'?'not_assessed':gaps.length||unknowns.length?'in_progress':'addressed';
  const intro=id==='1.1'?`Brawndo reports ${answers.inventory==='No'?'no enterprise asset inventory':answers.inventory==='Yes'?'an enterprise asset inventory':answers.inventory==='Partially'?'a partial enterprise asset inventory':'that enterprise asset inventory existence is not confirmed'}.`:`Brawndo reports ${answers.process==='No'?'no process for addressing unauthorized assets':answers.process==='Yes'?'a process for addressing unauthorized assets':answers.process==='Partially'?'a partial process for addressing unauthorized assets':'that the unauthorized-asset process is not confirmed'}.`;
  const matrixNarrative=(key,subject)=>{
    const rows=answers[key];if(!rows)return '';
    return ['Yes','Partially','No','Not sure','Not applicable'].map(state=>{
      const names=Object.entries(rows).filter(([,v])=>v===state).map(([k])=>k.toLowerCase());
      return names.length?`${subject} ${{Yes:'includes',Partially:'partially covers',No:'does not cover','Not sure':'has unconfirmed coverage of','Not applicable':'reports non-applicability for'}[state]} ${names.join(', ')}.`:'';
    }).filter(Boolean).join(' ');
  };
  const operation=id==='1.1'?answers.maintenance==='Yes'?'Newly acquired or discovered assets are added and retired or removed assets are updated consistently.':answers.maintenance?'Asset additions and removals are '+answers.maintenance.toLowerCase()+'.':'':answers.actions?.length?'Reported response actions: '+answers.actions.join(', ')+'.':'';
  const narrative=[intro,answers.system&&`The reported ${id==='1.1'?'inventory source':'detection system or process'} is ${answers.system}.`,answers.owner&&`Recorded responsibilities: ${answers.owner}.`,answers.frequency&&`The reported review/update frequency is ${answers.frequency.toLowerCase()}.`,answers.last_review&&`The last reported complete inventory review was ${answers.last_review}.`,matrixNarrative('coverage','Inventory coverage'),matrixNarrative('attributes','Inventory detail coverage'),answers.scope_reason&&`Applicability rationale: ${answers.scope_reason}.`,answers.sources&&`Inventory source arrangement: ${answers.sources.toLowerCase()}.`,operation,answers.maintenance_detail&&`Asset maintenance: ${answers.maintenance_detail}.`,answers.existing&&`Existing information or practice: ${answers.existing}.`,id==='1.2'&&['inventory_dependency','detection','disposition','confirmation','exceptions','reconciled','unresolved'].filter(k=>answers[k]).map(k=>`${{inventory_dependency:'Usable authorized inventory',detection:'Consistent detection',disposition:'Tracked disposition',confirmation:'Response confirmation',exceptions:'Exception approval and tracking',reconciled:'Inventory reconciliation',unresolved:'Unresolved assets beyond the response interval'}[k]}: ${answers[k]}.`).join(' '),unknowns.length&&`Still unconfirmed: ${unknowns.join(' ')}`,gaps.length&&`Follow-up: ${gaps.join(' ')}`].filter(Boolean).join(' ');
  return {status,narrative,basis,gaps,unknowns,nextSteps:[...gaps,...unknowns].map(x=>`Resolve and reassess: ${x}`),evidence,answers:questions.map(q=>({prompt:q.prompt,answer:label(answers[q.id])})),version:catalog.version,signals};
}
