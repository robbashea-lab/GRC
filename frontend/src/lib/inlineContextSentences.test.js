import {inventorySummary} from './omniInventorySummary';
import {omniCisSummary} from './omniCisSummary';
import {visibleQuestions} from './guidedAssessment';
import {socGuidedCatalog,socQuestions,socInlineSummary} from './socGuidedAssessment';
import {isoGuidedCatalog,isoQuestions,isoInlineNarrative} from './isoGuidedAssessment';

const date='2026-10-13';

test('current inventory context separates reported fields into sentences without altering the supplied answers or existing punctuation',()=>{
  const answers={inventory:'Yes',sources:'One source',owner:'Synthetic QA asset operations team',maintenance_detail:'Synthetic QA reconciles additions, changes and retirements.',evidence:'Synthetic QA export?'};
  const original={...answers};
  const narrative=inventorySummary(answers,'cis-v8.1-control1-5','Synthetic QA',date).result.narrative;
  expect(narrative).toContain('Responsibility: '+answers.owner+'. Update process: '+answers.maintenance_detail+' Reported supporting records: '+answers.evidence);
  expect(narrative).not.toContain('retirements..');expect(narrative).not.toContain('export?.');
  expect(answers).toEqual(original);
  const historical=inventorySummary(answers,'cis-v8.1-control1-3','Synthetic QA',date).result.narrative;
  expect(historical).toContain('Responsibility: '+answers.owner+' Update process: '+answers.maintenance_detail);
});

test('current CIS approach and operating context use sentence boundaries, retaining the legacy writer',()=>{
  const answers={logging:'Yes',approach:'DHCP logging',context:'Synthetic QA reviews lease records!'};
  expect(omniCisSummary('1.4',answers,'cis-v8.1-control1-5','Synthetic QA',date).result.narrative).toContain('approach: DHCP logging. Reported context: '+answers.context);
  expect(omniCisSummary('1.4',answers,'cis-v8.1-control1-2','Synthetic QA',date).result.narrative).toContain('approach: DHCP logging Reported context: '+answers.context);
  const version='cis-v8.1-program-5',program={practice:'Yes',operation:'Synthetic QA annual exercise workflow',owner:'Synthetic QA response team'};
  for(const q of visibleQuestions('18.5',program,version))if(q.type==='matrix')program[q.id]=Object.fromEntries(q.rows.map(row=>[row,'Yes']));
  expect(omniCisSummary('18.5',program,version,'Synthetic QA',date).result.narrative).toContain('Reported operation: '+program.operation+'. Responsibility: '+program.owner+'.');
});

test.each([
  ['SOC',socGuidedCatalog,'CC1.1',socQuestions,(id,answers,version)=>socInlineSummary(id,answers,version,'Synthetic QA',date)],
  ['ISO',isoGuidedCatalog,'4.1',isoQuestions,(id,answers,version)=>isoInlineNarrative(id,answers,version,'Synthetic QA')],
])('%s current explicit reported notes have sentence separators without changing native status or legacy output',(_,catalog,id,questions,write)=>{
  const answers=Object.fromEntries(questions(id,{},catalog.version).filter(q=>!['gaps','unknowns','evidence','additional_gap','additional_confirmation'].includes(q.id)).map(q=>[q.id,q.type==='text'?'':q.type==='context'?'Relevant':'Yes']));
  Object.assign(answers,{additional_gap:'Yes',gaps:'Synthetic QA confirmed deficiency',additional_confirmation:'Yes',unknowns:'Synthetic QA unresolved information'});
  const original={...answers},narrative=write(id,answers,catalog.version);
  expect(narrative).toContain('Reported gap: '+answers.gaps+'. Requires confirmation: '+answers.unknowns+'. This assessment reflects practices reported on');
  if(catalog.framework_id==='iso-27001')expect(narrative).toContain('Additional reported context: '+answers.gaps+'. Additional reported context: '+answers.unknowns+'.');
  expect(answers).toEqual(original);
  const oldVersion=catalog.framework_id==='iso-27001'?'iso27001-omni-1':'soc2-omni-1';
  const historical={...answers};delete historical.additional_gap;delete historical.additional_confirmation;
  if(oldVersion==='iso27001-omni-1')expect(write(id,historical,oldVersion)).toContain('Additional reported context: '+answers.gaps+' Additional reported context: '+answers.unknowns+' The reported practices remain subject');
  else expect(write(id,historical,oldVersion)).not.toContain('Reported gap: '+answers.gaps);
});
