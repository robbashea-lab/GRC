import {socGuidedCatalog,socQuestions,socGuidedResult,validateSocCompletion} from './socGuidedAssessment';
import {isoGuidedCatalog,isoQuestions,isoExtraQuestions,isoGuidedResult,validateIsoCompletion} from './isoGuidedAssessment';
import {generatedItems} from '../preview/assessmentItems';
import {catalogForVersion,compatibleInterviewAnswers,visibleQuestions,generateResult} from './guidedAssessment';

test('required current ISO conditional details use accurate labels while the original optional context labels remain available',()=>{
  const answers={additional_gap:'Yes',additional_confirmation:'Yes'};
  expect(isoExtraQuestions(answers).filter(q=>['gaps','unknowns'].includes(q.id)).map(q=>q.prompt)).toEqual(['Additional gap context','Additional confirmation context']);
  expect(isoExtraQuestions(answers,'iso27001-omni-1').filter(q=>['gaps','unknowns'].includes(q.id)).map(q=>q.prompt)).toEqual(['Additional gap context (optional; not a status decision)','Additional confirmation context (optional; not a status decision)']);
});

test('original CIS pilot follow-up remains readable and produces confirmation work without guessing its mixed intent',()=>{
  const version='brawndo-cis-pilot-1';
  for(const [id,root] of [['1.1','inventory'],['1.2','process']]){
    const answers={[root]:'Not sure',gaps:'A recorded scope exclusion and an unresolved owner confirmation.'};
    const original={...answers},row={framework_key:'cis-ig1',framework_assessment_id:'isolated:'+id,definition_id:id};
    expect(generateResult(id,answers,new Date(2026,9,13),version).status).toBe('not_assessed');
    const items=generatedItems(row,{answers,version});
    expect(items).toContainEqual(expect.objectContaining({question_id:'gaps',kind:'verification',text:answers.gaps}));
    expect(items.some(item=>item.kind==='gap')).toBe(false);expect(answers).toEqual(original);
  }
});

test('each current Control 1 practice preserves its explicit partial implementation beside unknown cadence and native Items agree',()=>{
  const version='cis-v8.1-control1-5',catalog=catalogForVersion(version);
  for(const id of Object.keys(catalog.definitions)){
    const answers={};
    for(let pass=0;pass<5;pass++)for(const q of visibleQuestions(id,answers,version))if(!(q.id in answers))answers[q.id]=q.id.startsWith('additional_')?'No':q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='multi'?[q.choices.find(choice=>!['None','Not sure'].includes(choice))]:q.type==='date'?'2026-10-13':q.type==='text'?'':q.choices.includes('Yes')?'Yes':q.choices.find(choice=>!(q.deficient_values||[]).includes(choice)&&!['No','Partially','Not sure','None'].includes(choice));
    const root=catalog.definitions[id].root,row={framework_key:'cis-ig1',definition_id:id,framework_assessment_id:'isolated:'+id};
    answers[root]='Partially';answers.frequency='Not sure';
    const output=generateResult(id,answers,new Date(2026,9,13),version);
    expect({id,status:output.status}).toEqual({id,status:'in_progress'});
    expect(output.signals).toEqual(expect.arrayContaining([{questionId:root,kind:'gap'},{questionId:'frequency',kind:'verification'}]));
    const items=generatedItems(row,{answers,version,result:output});
    expect(items).toEqual(expect.arrayContaining([expect.objectContaining({question_id:root,kind:'gap'}),expect.objectContaining({question_id:'frequency',kind:'verification'})]));
    expect(generateResult(id,{...answers,[root]:'Yes'},new Date(2026,9,13),version).status).toBe('not_assessed');
  }
});

test.each([
  ['soc-2',socGuidedCatalog,socQuestions,socGuidedResult],
  ['iso-27001',isoGuidedCatalog,isoQuestions,isoGuidedResult],
])('%s mandatory uncertainty preserves only supported implementation conclusions', (framework,catalog,questions,result)=>{
  for(const id of Object.keys(catalog.definitions)){
    const answers=Object.fromEntries(questions(id,{}).map(q=>[q.id,q.optional?'No':q.type==='text'?'':q.type==='context'?'Relevant':'Yes']));
    // Activate conditional branches before choosing two actual practice questions.
    for(const q of questions(id,answers))if(!(q.id in answers))answers[q.id]=q.type==='text'?'':q.type==='context'?'Relevant':'Yes';
    const practices=questions(id,answers).filter(q=>q.type==='select');
    if(practices.length<2)throw new Error(`${id} needs a representative multi-question definition`);
    const [uncertain,known]=practices;
    const mixed={...answers,[uncertain.id]:'Not sure'};
    expect({id,status:result(id,mixed).status}).toEqual({id,status:'not_assessed'});
    expect(result(id,{...mixed,[known.id]:'Partially'}).status).toBe('in_progress');
    expect(result(id,{...mixed,[known.id]:'No'}).status).toBe('needs_attention');
  }
});

test('CIS v5 explicit reuse retains supported practice and inactive context without importing contradictory choices or inferring intent',()=>{
  const migrated=compatibleInterviewAnswers('1.2',{process:'Yes',actions:['None','Quarantine or isolate'],gaps:'No gaps',unknowns:'None'},'cis-v8.1-control1-2','cis-v8.1-control1-5');
  expect(migrated.process).toBe('Yes');expect(migrated.actions).toBeUndefined();
  expect(migrated.gaps).toBe('No gaps');expect(migrated.unknowns).toBe('None');
  expect(migrated.additional_gap).toBeUndefined();expect(migrated.additional_confirmation).toBeUndefined();
  expect(visibleQuestions('1.2',migrated,'cis-v8.1-control1-5').map(q=>q.id)).not.toEqual(expect.arrayContaining(['gaps','unknowns']));
  const old={};for(const q of catalogForVersion('cis-v8.1-program-3').safeguards['2.1'])old[q.id]=q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'':'Yes';
  old.unknowns='Review a substantive coverage uncertainty with the team.';
  const current=compatibleInterviewAnswers('2.1',old,'cis-v8.1-program-3','cis-v8.1-program-5');
  expect(current.unknowns).toBe(old.unknowns);expect(current.additional_confirmation).toBeUndefined();
  const row={framework_key:'cis-ig1',definition_id:'2.1',framework_assessment_id:'isolated:2.1'};
  expect(generatedItems(row,{answers:current,version:'cis-v8.1-program-5'})).toEqual([]);
  expect(generatedItems(row,{answers:{...current,additional_confirmation:'Yes'},version:'cis-v8.1-program-5'}).some(item=>item.question_id==='unknowns'&&item.kind==='verification')).toBe(true);
  expect(compatibleInterviewAnswers('2.1',{...current,additional_confirmation:'Yes'},'cis-v8.1-program-5','cis-v8.1-program-5').additional_confirmation).toBe('Yes');
  expect(compatibleInterviewAnswers('2.1',{...current,additional_confirmation:'Yes',unknowns:''},'cis-v8.1-program-5','cis-v8.1-program-5').additional_confirmation).toBeUndefined();
});

test.each([
  ['soc-2',socGuidedCatalog,socQuestions,socGuidedResult,validateSocCompletion],
  ['iso-27001',isoGuidedCatalog,isoQuestions,isoGuidedResult,validateIsoCompletion],
])('%s additional work requires explicit intent, agrees with Items and preserves historical outcomes', (framework,catalog,questions,result,validate)=>{
  const id=Object.keys(catalog.definitions)[0],answers={};
  for(let pass=0;pass<30;pass++)for(const q of questions(id,answers))if(!(q.id in answers))answers[q.id]=q.optional?'No':q.type==='text'?'':q.type==='context'?'Relevant':'Yes';
  const row={framework_key:framework,framework_assessment_id:'isolated:'+id,definition_id:id},notes={...answers,gaps:'No outstanding gaps.',unknowns:'The optional document title is not recorded.'};
  for(const choice of [undefined,'No','Not sure']){
    const hidden={...notes,additional_gap:choice,additional_confirmation:choice};if(choice===undefined){delete hidden.additional_gap;delete hidden.additional_confirmation;}
    expect(result(id,hidden).status).toBe('addressed');expect(generatedItems(row,{answers:hidden,version:catalog.version})).toEqual([]);
    expect(result(id,hidden).narrative).not.toContain(notes.gaps);expect(result(id,hidden).narrative).not.toContain(notes.unknowns);
  }
  const actual={...answers,additional_gap:'Yes',gaps:'The selected service has a reported coverage gap.',additional_confirmation:'Yes',unknowns:'Confirm the location of supporting records.'};
  validate(id,actual);const output=result(id,actual);expect(output.status).toBe('addressed');
  expect(output.signals).toEqual([{questionId:'gaps',kind:'gap',text:actual.gaps},{questionId:'unknowns',kind:'verification',text:actual.unknowns}]);
  expect(generatedItems(row,{answers:actual,version:catalog.version}).map(item=>({questionId:item.question_id,kind:item.kind,text:item.text}))).toEqual(output.signals);
  expect(()=>validate(id,{...actual,gaps:''})).toThrow('Describe the additional reported work');
  const legacy=framework==='soc-2'?'soc2-omni-1':'iso27001-omni-1',old={...answers};delete old.additional_gap;delete old.additional_confirmation;
  const practice=questions(id,old,legacy).find(q=>q.type==='select');old[practice.id]='Not sure';
  expect(result(id,old,legacy).status).toBe('in_progress');
});
