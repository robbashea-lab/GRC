import legacy from '@catalogs/guidedAssessmentPilot.json';
import pack from '@catalogs/guidedControl1.json';
import additions from '@catalogs/guidedControl1Additional.json';
const contextOnly=new Set(['system','owner','sources','reconciled','inventory_dependency','disposition','confirmation','exceptions']);
const inherited=Object.fromEntries(Object.entries(legacy.safeguards).map(([id,questions])=>[id,[...questions.map(q=>({...q,critical:q.critical&&!contextOnly.has(q.id),question_set_version:pack.version,...(q.id==='gaps'?{prompt:'Describe any confirmed missing or incomplete requirement elements.',help:'Record known deficiencies here. Put uncertainty in Items requiring verification.'}:{}),unknown_template:`Confirm: ${q.prompt}`,next_step_template:q.help})),{id:'unknowns',prompt:'Which requirement elements still need confirmation, and who can verify them?',help:'Uncertainty is not a confirmed gap.',type:'text',choices:[],critical:false,element:'unknowns',status_impact:'Reported uncertainty prevents an unqualified recommendation',safeguard_id:id,question_set_version:pack.version,question_id:id+':unknowns',narrative_template:'',gap_template:'',unknown_template:'Reviewer-reported uncertainty',next_step_template:'Confirm the reported uncertainty with the responsible team',evidence_guidance:'Use relevant records and responsible-owner confirmation.'}]]));
export const guidedCatalog={...pack,safeguards:{...inherited,...additions.safeguards}};
export const catalogForVersion=version=>version===legacy.version?legacy:version===guidedCatalog.version?guidedCatalog:null;
export const pilotEnabled=(client,framework,configuration,id)=>!!client&&framework===pack.framework_id&&[1,2,3].includes(configuration?.implementation_group??1)&&configuration?.guided_assessment_enabled!==false&&(!id||!!pack.definitions[id]?.groups.includes(configuration?.implementation_group??1));
export function visibleQuestions(id,answers,version=guidedCatalog.version){
  return (catalogForVersion(version)?.safeguards[id]||[]).filter(q=>!q.when||Object.entries(q.when).every(([key,values])=>values.includes(answers[key]))).filter(q=>q.condition!=='not_applicable'||['coverage','attributes'].some(k=>Object.values(answers[k]||{}).includes('Not applicable')));
}
export function validateAnswers(id,answers,version=guidedCatalog.version){
  if(!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('Invalid interview answers');
  const questions=catalogForVersion(version)?.safeguards[id];
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
function generateLegacyResult(id,answers,today=new Date(),version=guidedCatalog.version){
  const catalog=catalogForVersion(version);
  validateAnswers(id,answers,version);
  const active=new Set(visibleQuestions(id,answers,version).flatMap(q=>[q.id,q.id+'_detail']));
  answers=Object.fromEntries(Object.entries(answers).filter(([key])=>active.has(key)));
  const questions=visibleQuestions(id,answers,version),gaps=[],unknowns=[],basis=[],evidence=[],signals=[];
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

// One canonical requirement definition is inherited by applicable implementation groups.
export function generateResult(id,answers,today=new Date(),version=guidedCatalog.version){
  if(version===legacy.version)return generateLegacyResult(id,answers,today,version);
  validateAnswers(id,answers,version);
  const definition=guidedCatalog.definitions[id],questions=visibleQuestions(id,answers,version);
  const active=new Set(questions.flatMap(q=>[q.id,q.id+'_detail']));
  answers=Object.fromEntries(Object.entries(answers).filter(([key])=>active.has(key)));
  let output;
  if(['1.1','1.2'].includes(id))output=generateLegacyResult(id,answers,today,version);
  else {
    const gaps=[],unknowns=[],basis=[],signals=[],nextSteps=[];
    for(const q of questions.filter(q=>q.critical)){
      const value=answers[q.id],values=q.type==='matrix'?q.rows.map(k=>value?.[k]):q.type==='multi'?value||[]:[value];
      const unknown=!values.length||values.some(v=>!v||v==='Not sure'||v==='Not applicable'&&!answers.scope_reason?.trim());
      const deficient=values.some(v=>(q.deficient_values||['No','Partially','None']).includes(v));
      const detail=answers[q.id+'_detail']?` — ${answers[q.id+'_detail']}`:'';
      if(unknown){unknowns.push((q.unknown_template||`Confirm: ${q.prompt}`)+detail);signals.push({questionId:q.id,kind:'verification'});}
      if(deficient){gaps.push((q.gap_template||`Address: ${q.prompt}`)+detail);signals.push({questionId:q.id,kind:'gap'});}
      if(unknown||deficient)nextSteps.push(q.next_step_template||q.help);
      else basis.push(`${q.prompt} ${label(value)}`);
    }
    const root=answers[definition.root];
    output={status:root==='No'?'needs_attention':!root||root==='Not sure'?'not_assessed':gaps.length||unknowns.length?'in_progress':'addressed',gaps,unknowns,basis,signals,nextSteps,evidence:questions.filter(q=>q.id==='evidence').map(q=>answers[q.id]||q.evidence_guidance),answers:questions.map(q=>({prompt:q.prompt,answer:label(answers[q.id])})),version};
  }
  if(!['1.1','1.2'].includes(id)&&answers.gaps?.trim())output.gaps.push(`Reviewer-reported gap: ${answers.gaps.trim()}`);
  if(answers.unknowns?.trim())output.unknowns.push(`Reviewer-reported uncertainty: ${answers.unknowns.trim()}`);
  if(output.status==='addressed'&&(output.gaps.length||output.unknowns.length))output.status='in_progress';
  output.nextSteps=[...new Set([...(['1.1','1.2'].includes(id)?[]:output.nextSteps),...output.gaps.map(v=>`Address and reassess: ${v}`),...output.unknowns.map(v=>`Confirm with the responsible team: ${v}`)])];
  const root=answers[definition.root];
  const facts=[root==='Yes'?`The organization reports ${id==='1.1'?'an enterprise asset inventory':id==='1.2'?'a process for addressing unauthorized assets':id==='1.4'?'DHCP logging or IP address management used for inventory updates':id==='1.3'?'an active asset discovery tool':'a passive asset discovery tool'}.`:root==='No'?`The organization reports that ${definition.title.toLowerCase()} is not currently in place.`:root==='Partially'?`The organization reports partial implementation of ${definition.title.toLowerCase()}.`:'Implementation has not yet been confirmed.'];
  for(const [key,prefix] of [['system','Maintained using'],['owner','Responsible team'],['frequency','Reported operating frequency'],['last_review','Last reported inventory review']])if(answers[key]&&answers[key]!=='Not sure')facts.push(`${prefix}: ${answers[key]}.`);
  for(const key of ['coverage','attributes']){
    const confirmed=Object.entries(answers[key]||{}).filter(([,v])=>v==='Yes').map(([name])=>name.toLowerCase());
    if(confirmed.length)facts.push(`${key==='coverage'?'Reported coverage':'Reported inventory details'}: ${confirmed.join(', ')}.`);
  }
  if(answers.maintenance==='Yes')facts.push('Asset additions and removals are maintained consistently.');
  if(answers.inventory_update==='Yes')facts.push('Discovery or address-assignment records are used to update the asset inventory.');
  if(answers.actions?.length)facts.push(`Reported response actions: ${answers.actions.join(', ')}.`);
  const missing=['coverage','attributes'].flatMap(key=>Object.entries(answers[key]||{}).filter(([,v])=>['No','Partially'].includes(v)).map(([name])=>name.toLowerCase()));
  const uncertain=['coverage','attributes'].flatMap(key=>Object.entries(answers[key]||{}).filter(([,v])=>v==='Not sure').map(([name])=>name.toLowerCase()));
  if(missing.length)facts.push(`Missing or incomplete: ${missing.join(', ')}.`);
  if(uncertain.length)facts.push(`Not yet verified: ${uncertain.join(', ')}.`);
  if(answers.scope_reason?.trim())facts.push(`Reported applicability rationale: ${answers.scope_reason}.`);
  if((output.gaps.length||output.unknowns.length)&&!missing.length&&!uncertain.length)facts.push('Material limitations remain; review the confirmed gaps and items requiring verification.');
  return {...output,narrative:facts.join(' ')};
}

export function prioritizeGuidedRows(rows,drafts={}){
  const rank=r=>drafts[r.definition_id]?.revision&&!drafts[r.definition_id]?.completed?0:r.work?.overdue_reviews?1:r.status==='not_assessed'?2:r.status==='needs_attention'&&r.work?.open_actions?3:r.status==='in_progress'?4:r.status==='addressed'&&r.verification!=='verified'?5:r.work?.next_review_due?6:7;
  return rows.filter(r=>guidedCatalog.definitions[r.definition_id]).slice().sort((a,b)=>rank(a)-rank(b)||(rank(a)===6?(a.work.next_review_due.localeCompare(b.work.next_review_due)):0)||Number(a.definition_id)-Number(b.definition_id)).slice(0,3);
}
