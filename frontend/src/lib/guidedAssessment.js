import legacy from '@catalogs/guidedAssessmentPilot.json';
import pack from '@catalogs/guidedControl1.json';
import additions from '@catalogs/guidedControl1Additional.json';
import program from '@catalogs/guidedCisProgram.json';
import programV1 from '@catalogs/guidedCisProgramV1.json';
import programV2 from '@catalogs/guidedCisProgramV2.json';
import control1V3 from '@catalogs/guidedControl1V3.json';
import control1V4 from '@catalogs/guidedControl1V4.json';
const contextOnly=new Set(['system','owner','sources','reconciled','inventory_dependency','disposition','confirmation','exceptions']);
const inherited=Object.fromEntries(Object.entries(legacy.safeguards).map(([id,questions])=>[id,[...questions.map(q=>({...q,critical:q.critical&&!contextOnly.has(q.id),question_set_version:pack.version,...(q.id==='gaps'?{prompt:'Describe any confirmed missing or incomplete requirement elements.',help:'Record known deficiencies here. Put uncertainty in Items requiring verification.'}:{}),unknown_template:`Confirm: ${q.prompt}`,next_step_template:q.help})),{id:'unknowns',prompt:'Which requirement elements still need confirmation, and who can verify them?',help:'Uncertainty is not a confirmed gap.',type:'text',choices:[],critical:false,element:'unknowns',status_impact:'Reported uncertainty prevents an unqualified recommendation',safeguard_id:id,question_set_version:pack.version,question_id:id+':unknowns',narrative_template:'',gap_template:'',unknown_template:'Reviewer-reported uncertainty',next_step_template:'Confirm the reported uncertainty with the responsible team',evidence_guidance:'Use relevant records and responsible-owner confirmation.'}]]));
export const control1Catalog={...pack,safeguards:{...inherited,...additions.safeguards}};
function programQuestions(id,definition,version){
  const current=version===program.version;
  const evidence=definition.evidence.join(' '),when={practice:['Yes','Partially']};
  const question=(key,prompt,type,critical,extra={})=>({id:key,prompt,type,critical,choices:type==='text'?[]:['Yes','Partially','No','Not sure'],help:definition.guidance,element:key,safeguard_id:id,question_id:id+':'+key,question_set_version:version,status_impact:critical?'Reported implementation only; unresolved gaps or unknowns prevent an unqualified recommendation':'Context only; not a mandatory artifact',evidence_guidance:evidence,...extra});
  const questions=[question('practice',`Is the practice “${definition.title}” in place and operating?`,'select',true),question('existing','What relevant practice or information exists, and who can confirm it?','text',false,{when:{practice:['No','Not sure']}})];
  // Every row is an authored, source-reviewed requirement element, not a tool checklist.
  for(const conditional of [false,true]){
    const elements=definition.elements.filter(e=>e.conditional===conditional);
    for(let offset=0;offset<elements.length;offset+=5){
      const chunk=elements.slice(offset,offset+5),key=(conditional?'conditional':'requirements')+'_'+offset;
      questions.push(question(key,'How fully are these safeguard requirements met?','matrix',true,{...(!current?{when}:{}),rows:chunk.map(e=>e.text),criterion_ids:chunk.map(e=>e.id),choices:['Yes','Partially','No','Not sure',...(conditional?['Not applicable']:[])],help:conditional?'Use Not applicable only when the stated source condition does not apply; explain why. Uncertainty is Not sure, not an exclusion.':'Confirm each statement against current operation. Yes means it is fully addressed, not merely planned.'}));
    }
  }
  questions.push(question('scope_reason','Explain any source-conditioned exclusions.','text',false,{...(!current?{when}:{}),condition:'not_applicable'}),question('system','Which systems or processes support this practice?','text',false,{when,help:'Optional context; name actual systems or processes, not proposed products.'}),question('owner','Who operates this practice?','text',false,{when,help:'Optional context; record the responsible business, IT, security or provider team.'}),question('operation','How is this safeguard implemented in day-to-day work?','text',false,{when,help:'Record the actual process and relevant timing. This is optional narrative context, not verification.'}),question('evidence','What records could substantiate the reported implementation?','text',false,{help:evidence}),question('gaps','Describe confirmed missing or incomplete requirement elements.','text',false,{help:'Confirmed gaps only. Record uncertainty separately.'}),question('unknowns','What still needs confirmation, and who can verify it?','text',false,{help:'Unknowns are not confirmed gaps.'}));
  return questions;
}
function programCatalog(source){
  return {...source,definitions:{...Object.fromEntries(Object.entries(pack.definitions).map(([id,d])=>[id,{...d,question_set_version:pack.version}])),...Object.fromEntries(Object.entries(source.definitions).map(([id,d])=>[id,{...d,question_set_version:source.version}]))},safeguards:{...control1Catalog.safeguards,...Object.fromEntries(Object.entries(source.definitions).map(([id,d])=>[id,programQuestions(id,d,source.version)]))}};
}
const program1Catalog=programCatalog(programV1);
const program2Base=programCatalog(programV2);
const program2Catalog={...program2Base,definitions:{...program2Base.definitions,...Object.fromEntries(Object.entries(control1V3.definitions).map(([id,d])=>[id,{...d,question_set_version:control1V3.version}]))},safeguards:{...program2Base.safeguards,...control1V3.safeguards}};
const currentProgram=programCatalog(program);
export const guidedCatalog={...currentProgram,definitions:{...currentProgram.definitions,...Object.fromEntries(Object.entries(control1V3.definitions).map(([id,d])=>[id,{...d,question_set_version:control1V3.version}])),...Object.fromEntries(Object.entries(control1V4.definitions).map(([id,d])=>[id,{...d,question_set_version:control1V4.version}]))},safeguards:{...currentProgram.safeguards,...control1V3.safeguards,...control1V4.safeguards}};
export const catalogForPilot=(upgraded=true)=>upgraded?guidedCatalog:program1Catalog;
export const legacyVersionForSafeguard=id=>program1Catalog.definitions[id]?.question_set_version;
export const versionForSafeguard=(id,upgraded=true)=>catalogForPilot(upgraded).definitions[id]?.question_set_version;
export const catalogForVersion=version=>version===legacy.version?legacy:version===pack.version?control1Catalog:version===programV1.version?program1Catalog:version===programV2.version?program2Catalog:version===control1V3.version?control1V3:version===control1V4.version?control1V4:version===program.version?guidedCatalog:null;
export const pilotEnabled=(client,framework,configuration,id)=>!!client&&framework===pack.framework_id&&[1,2,3].includes(configuration?.implementation_group??1)&&configuration?.guided_assessment_enabled!==false&&(!id||!!guidedCatalog.definitions[id]?.groups.includes(configuration?.implementation_group??1));
export function visibleQuestions(id,answers,version=versionForSafeguard(id)){
  return (catalogForVersion(version)?.safeguards[id]||[]).filter(q=>!q.when||Object.entries(q.when).every(([key,values])=>values.includes(answers[key]))).filter(q=>q.condition!=='not_applicable'||(catalogForVersion(version)?.safeguards[id]||[]).some(matrix=>matrix.type==='matrix'&&Object.values(answers[matrix.id]||{}).includes('Not applicable')));
}
export function validateAnswers(id,answers,version=versionForSafeguard(id)){
  if(!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('Invalid interview answers');
  const questions=catalogForVersion(version)?.safeguards[id];
  if(!questions)throw new Error('Unsupported pilot safeguard');
  for(const [key,value] of Object.entries(answers)){
    const detail=key.endsWith('_detail'),q=questions.find(q=>q.id===(detail?key.slice(0,-7):key));
    if(!q)throw new Error('Unknown question');
    if(detail||['text','date'].includes(q.type)){if(typeof value!=='string'||value.length>2000)throw new Error('Invalid answer text');}
    else if(q.type==='matrix'){if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([k,v])=>!q.rows.includes(k)||!(q.row_choices?.[k]||q.choices).includes(v)))throw new Error('Invalid matrix answer');}
    else if(q.type==='multi'){if(!Array.isArray(value)||value.length>q.choices.length||new Set(value).size!==value.length||value.some(v=>!q.choices.includes(v))||(version===control1V4.version&&value.length>1&&value.some(v=>['None','Not sure'].includes(v))))throw new Error('Invalid answer selection');}
    else if(!q.choices.includes(value))throw new Error('Invalid answer selection');
  }
  return answers;
}

export function compatibleInterviewAnswers(id,answers,fromVersion,toVersion){
  const oldQuestions=visibleQuestions(id,answers,fromVersion),newQuestions=catalogForVersion(toVersion)?.safeguards[id]||[],mapped={};
  const stable12=new Set(['process','existing','inventory_dependency','detection','system','owner','frequency','actions','disposition','confirmation','exceptions','reconciled','unresolved','evidence',...(fromVersion==='cis-v8.1-control1-2'?['gaps','unknowns']:[])]);
  for(const next of newQuestions){
    const old=oldQuestions.find(q=>q.id===next.id&&q.type===next.type);
    if(next.type==='matrix'){
      const rows={};
      next.rows.forEach((text,index)=>{
        const criterion=next.criterion_ids?.[index];
        const source=oldQuestions.find(q=>q.type==='matrix'&&q.rows.some((row,rowIndex)=>row===text&&q.criterion_ids?.[rowIndex]===criterion)&&q.choices.includes('Not applicable')===next.choices.includes('Not applicable'));
        const value=source&&answers[source.id]?.[text];
        if(value&&(next.row_choices?.[text]||next.choices).includes(value))rows[text]=value;
      });
      if(Object.keys(rows).length)mapped[next.id]=rows;
    }else if(old&&(fromVersion===toVersion||id==='1.2'&&toVersion===control1V4.version&&stable12.has(next.id)||old.prompt===next.prompt&&(old.critical===next.critical||contextOnly.has(next.id)&&next.critical===false))&&answers[old.id]!==undefined){
      const value=answers[old.id];
      if(['text','date'].includes(next.type)||next.type==='multi'&&value.every(item=>next.choices.includes(item))&&!(toVersion===control1V4.version&&value.length>1&&value.some(item=>['None','Not sure'].includes(item)))||next.choices.includes(value))mapped[next.id]=value;
      if(mapped[next.id]!==undefined&&answers[old.id+'_detail']!==undefined)mapped[next.id+'_detail']=answers[old.id+'_detail'];
    }
  }
  validateAnswers(id,mapped,toVersion);
  return mapped;
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
export function generateResult(id,answers,today=new Date(),version=versionForSafeguard(id)){
  if(version===program.version||version===control1V4.version)return generateCurrentCisResult(id,answers,version);
  if(version===legacy.version)return generateLegacyResult(id,answers,today,version);
  validateAnswers(id,answers,version);
  const definition=catalogForVersion(version)?.definitions[id],questions=visibleQuestions(id,answers,version);
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
      const matrixDetail=predicate=>definition.root==='practice'&&q.type==='matrix'?` — ${q.rows.filter(k=>predicate(value?.[k])).map(k=>`${k} ${value?.[k]||'Not recorded'}`).join('; ')}`:'';
      if(unknown){unknowns.push((q.unknown_template||`Confirm: ${q.prompt}`)+matrixDetail(v=>!v||v==='Not sure'||v==='Not applicable'&&!answers.scope_reason?.trim())+detail);signals.push({questionId:q.id,kind:'verification'});}
      if(deficient){gaps.push((q.gap_template||`Address: ${q.prompt}`)+matrixDetail(v=>(q.deficient_values||['No','Partially','None']).includes(v))+detail);signals.push({questionId:q.id,kind:'gap'});}
      if(unknown||deficient)nextSteps.push(q.next_step_template||q.help);
      else basis.push(`${q.prompt} ${label(value)}`);
    }
    const root=answers[definition.root];
    output={status:root==='No'?'needs_attention':!root||root==='Not sure'?'not_assessed':gaps.length||unknowns.length?'in_progress':'addressed',gaps,unknowns,basis,signals,nextSteps,evidence:questions.filter(q=>q.id==='evidence').map(q=>answers[q.id]||q.evidence_guidance),answers:questions.map(q=>({prompt:q.prompt,answer:label(answers[q.id])})),version};
  }
  if(!['1.1','1.2'].includes(id)&&answers.gaps?.trim())output.gaps.push(`Reviewer-reported gap: ${answers.gaps.trim()}`);
  if(answers.unknowns?.trim())output.unknowns.push(`Reviewer-reported uncertainty: ${answers.unknowns.trim()}`);
  const requirementAnswers=questions.filter(q=>q.type==='matrix').flatMap(q=>q.rows.map(row=>answers[q.id]?.[row]));
  const excludedScope=version===programV2.version&&definition.elements?.length&&definition.elements.every(e=>e.conditional)&&requirementAnswers.length===definition.elements.length&&requirementAnswers.every(value=>value==='Not applicable');
  if(excludedScope){
    output.status='not_assessed';
    output.basis=[];
    output.unknowns.push('Applicability requires native assessment decision; excluded scope is not proof of implementation.');
    output.signals.push({questionId:'scope_reason',kind:'verification'});
  }
  if(output.status==='addressed'&&(output.gaps.length||output.unknowns.length))output.status='in_progress';
  output.nextSteps=[...new Set([...(['1.1','1.2'].includes(id)?[]:output.nextSteps),...output.gaps.map(v=>`Address and reassess: ${v}`),...output.unknowns.map(v=>`Confirm with the responsible team: ${v}`)])];
  const root=answers[definition.root];
  const facts=[excludedScope?`The organization reports exclusion of all source-conditioned requirements for “${definition.title}”; applicability requires a native assessment decision.`:root==='Yes'?(definition.root==='practice'?`The organization reports implementation of “${definition.title}”.`:`The organization reports ${id==='1.1'?'an enterprise asset inventory':id==='1.2'?'a process for addressing unauthorized assets':id==='1.4'?'DHCP logging or IP address management used for inventory updates':id==='1.3'?'an active asset discovery tool':'a passive asset discovery tool'}.`):root==='No'?`The organization reports that ${definition.title.toLowerCase()} is not currently in place.`:root==='Partially'?`The organization reports partial implementation of ${definition.title.toLowerCase()}.`:'Implementation has not yet been confirmed.'];
  if(definition.root==='practice'&&answers.operation?.trim())facts.push(`Reported operation: ${answers.operation.trim()}`);
  if(definition.root==='practice'&&answers.existing?.trim())facts.push(`Existing information: ${answers.existing.trim()}`);
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

function generateCurrentCisResult(id,answers,version){
  validateAnswers(id,answers,version);
  const definition=catalogForVersion(version).definitions[id],questions=visibleQuestions(id,answers,version);
  const active=Object.fromEntries(Object.entries(answers).filter(([key])=>questions.some(q=>key===q.id||key===q.id+'_detail')));
  const root=active[definition.root],gaps=[],unknowns=[],basis=[],signals=[],requirements=[];
  const criteria=questions.filter(q=>q.critical&&(definition.root!=='practice'||q.id!==definition.root));
  for(const q of criteria){
    const rows=q.type==='matrix'?q.rows.map(row=>({name:row,value:active[q.id]?.[row]})):[{name:q.summary_topic||q.narrative_template?.split(':')[0]||q.element||q.id,value:active[q.id]}];
    for(const row of rows){
      const values=q.type==='multi'?row.value||[]:[row.value],excluded=q.type==='matrix'&&row.value==='Not applicable'&&q.choices.includes('Not applicable')&&!!active.scope_reason?.trim();
      const unknown=!values.length||values.some(value=>!value||value==='Not sure'||value==='Not applicable'&&!excluded);
      const deficient=values.some(value=>(q.deficient_values||['No','Partially','None']).includes(value));
      const absent=values.length>0&&values.every(value=>['No','None','Never'].includes(value));
      const state=excluded?'excluded':unknown?'unknown':deficient?absent?'absent':'partial':'met';
      requirements.push({state,questionId:q.id,name:row.name});
      const detail=active[q.id+'_detail']?.trim()?` — ${active[q.id+'_detail'].trim()}`:'';
      if(unknown){unknowns.push(`Confirm ${row.name}${detail}`);signals.push({questionId:q.id,kind:'verification'});}
      if(deficient){gaps.push(`Missing or incomplete: ${row.name}${detail}`);signals.push({questionId:q.id,kind:'gap'});}
      if(!unknown&&!deficient&&!excluded)basis.push(`${row.name}: ${label(row.value)}`);
    }
  }
  const applicable=requirements.filter(row=>row.state!=='excluded'),meaningful=applicable.filter(row=>row.state!=='unknown');
  const allExcluded=!!requirements.length&&!applicable.length;
  const supported=meaningful.some(row=>['met','partial'].includes(row.state));
  let status=root==='No'&&!supported?'needs_attention':!supported?meaningful.length===applicable.length&&!!meaningful.length?'needs_attention':'not_assessed':applicable.every(row=>row.state==='met')?'addressed':'in_progress';
  if(root==='No'&&meaningful.some(row=>['met','partial'].includes(row.state))||root==='Partially'&&status==='addressed'){
    status='in_progress';unknowns.push('The overall practice answer conflicts with the reported requirement details; confirm the actual implementation.');signals.push({questionId:definition.root,kind:'verification'});
  }
  if(['Yes','Partially'].includes(root)&&status==='needs_attention')unknowns.push('The overall practice answer conflicts with the reported absence of every substantive requirement; confirm the overall answer.');
  if(active.gaps?.trim())gaps.push(`Reviewer-reported gap: ${active.gaps.trim()}`);
  if(active.unknowns?.trim())unknowns.push(`Reviewer-reported uncertainty: ${active.unknowns.trim()}`);
  if(allExcluded){status='not_assessed';basis.length=0;unknowns.push('Applicability requires native assessment decision; excluded scope is not proof of implementation.');signals.push({questionId:'scope_reason',kind:'verification'});}
  else if(status==='addressed'&&(gaps.length||unknowns.length))status='in_progress';
  const unique=values=>[...new Set(values)];
  const narrative=(allExcluded?`The organization reports exclusion of all source-conditioned requirements for “${definition.title}”; applicability requires a native assessment decision.${active.scope_reason?' Reported applicability rationale: '+active.scope_reason:''}`:`The organization reports ${status==='addressed'?'implementation':status==='needs_attention'?'absence':status==='in_progress'?'partial or unresolved implementation':'an unconfirmed implementation position'} of “${definition.title}”.`)+[active.system&&`Maintained using: ${active.system}.`,active.owner&&`Responsible team: ${active.owner}.`,active.operation&&`Reported operation: ${active.operation}.`].filter(Boolean).map(value=>' '+value).join('');
  return {status,narrative,basis:unique(basis),gaps:unique(gaps),unknowns:unique(unknowns),nextSteps:unique([...gaps.map(value=>'Address and reassess: '+value),...unknowns.map(value=>'Confirm with the responsible team: '+value)]),evidence:questions.filter(q=>q.id==='evidence').map(q=>active[q.id]||q.evidence_guidance||q.help),answers:questions.map(q=>({prompt:q.prompt,answer:label(active[q.id])})),version,signals:signals.filter((signal,index)=>signals.findIndex(other=>other.questionId===signal.questionId&&other.kind===signal.kind)===index)};
}

export function prioritizeGuidedRows(rows,drafts={}){
  const rank=r=>drafts[r.definition_id]?.revision&&!drafts[r.definition_id]?.completed?0:r.work?.overdue_reviews?1:r.status==='not_assessed'?2:r.status==='needs_attention'&&r.work?.open_actions?3:r.status==='in_progress'?4:r.status==='addressed'&&r.verification!=='verified'?5:r.work?.next_review_due?6:7;
  return rows.filter(r=>guidedCatalog.definitions[r.definition_id]).slice().sort((a,b)=>rank(a)-rank(b)||(rank(a)===6?(a.work.next_review_due.localeCompare(b.work.next_review_due)):0)||Number(a.definition_id.split('.')[0])-Number(b.definition_id.split('.')[0])||Number(a.definition_id.split('.')[1])-Number(b.definition_id.split('.')[1])).slice(0,3);
}
