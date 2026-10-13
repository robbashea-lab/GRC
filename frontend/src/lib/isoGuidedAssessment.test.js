import native from '@catalogs/iso27001.json';
import {isoGuidedCatalog,isoGuidedEnabled,isoQuestions,isoGroups,isoGuidedResult,isoInlineNarrative,validateIsoAnswers,validateIsoCompletion} from './isoGuidedAssessment';
const answersFor=id=>{
  const answers={};
  for(let pass=0;pass<30;pass++){
    const missing=isoQuestions(id,answers).filter(q=>!(q.id in answers));
    if(!missing.length)break;
    for(const q of missing)answers[q.id]=q.type==='text'?'':q.type==='context'?'Relevant':'Yes';
  }
  return answers;
};
test('exact native 30/93 catalog coverage, stable grouped questions, no legacy generic fallback',()=>{
  expect(Object.keys(isoGuidedCatalog.definitions).sort()).toEqual(native.requirements.map(r=>r.id).sort());
  expect(native.requirements.filter(r=>r.specification==='isms_clause')).toHaveLength(30);
  expect(native.requirements.filter(r=>r.specification==='annex_control')).toHaveLength(93);
  for(const row of native.requirements){
    const definition=isoGuidedCatalog.definitions[row.id];expect(definition.title).toBe(row.title);
    expect(definition.groups.length).toBeGreaterThan(0);
    const questions=definition.groups.flatMap(g=>g.questions);expect(new Set(questions.map(q=>q.id)).size).toBe(questions.length);
    for(const q of questions){expect(q.prompt.trim()).toBeTruthy();expect(q.topic.trim()).toBeTruthy();}
  }
  expect(()=>isoGroups('CC1.1')).toThrow();expect(()=>isoGroups('4.1',{},'cis-control1-4')).toThrow();
});
for(const row of native.requirements){
  test(`${row.id}: fresh, all addressed, partial, confirmed gap, unknown and optional-context invariance`,()=>{
    expect(isoGuidedResult(row.id,{}).status).toBe('not_assessed');
    const answers=answersFor(row.id);expect(()=>validateIsoCompletion(row.id,answers)).not.toThrow();
    const result=isoGuidedResult(row.id,answers,isoGuidedCatalog.version,'Synthetic ISO client');
    expect(result.status).toBe('addressed');expect(result.narrative).toMatch(/^OVERVIEW\n/);expect(result.narrative).toContain('\n\nIMPLEMENTATION BREAKDOWN\n');expect(result.narrative).toContain('\n\nITEMS TO ADDRESS\n');
    const substantive=isoQuestions(row.id,answers).filter(q=>q.type==='select');expect(substantive.length).toBeGreaterThan(0);
    const first=substantive[0].id;
    expect(isoGuidedResult(row.id,{...answers,[first]:'Partially'}).status).toBe('in_progress');
    expect(isoGuidedResult(row.id,{...answers,[first]:'No'}).status).toBe('needs_attention');
    expect(isoGuidedResult(row.id,{...answers,[first]:'Not sure'}).status).toBe('in_progress');
    expect(isoGuidedResult(row.id,{...answers,gaps:'Optional note not a status judgment',unknowns:'Tool name unknown'}).status).toBe('addressed');
    for(const q of isoQuestions(row.id,answers).filter(q=>q.type==='text'))expect(isoGuidedResult(row.id,{...answers,[q.id]:'Not sure'}).status).toBe('addressed');
    expect(()=>validateIsoAnswers(row.id,{...answers,role:'platform_owner'})).toThrow();
  });
}
test('configuration based defaults, not a Dunder exception; inactive and wrong framework denied',()=>{
  const user={user_id:'synthetic'};
  for(const clientId of ['demo_dunder','new-client','add-iso-client'])expect(isoGuidedEnabled(clientId,user,'iso-27001',{__program_active:true},'A.5.1')).toBe(true);
  expect(isoGuidedEnabled('client',user,'iso-27001',{},'A.5.1')).toBe(false);
  expect(isoGuidedEnabled('client',user,'soc-2',{__program_active:true},'A.5.1')).toBe(false);
});

test('A.5.3 explicitly assesses evaluated compensating arrangements without treating any exception as implementation',()=>{
  const answers=answersFor('A.5.3'),question=isoQuestions('A.5.3',answers).find(q=>q.id==='ISO-A.5.3-separation');
  expect(question.prompt).toContain('justified alternative');
  answers[question.id+'_detail']='Independent transaction review addresses the identified conflict; effectiveness was evaluated.';
  expect(isoGuidedResult('A.5.3',answers).status).toBe('addressed');
  expect(isoGuidedResult('A.5.3',{...answers,'ISO-A.5.3-exceptions':'No'}).status).toBe('needs_attention');
  expect(isoGuidedResult('A.5.3',{...answers,'ISO-A.5.3-exceptions':'Not sure'}).status).toBe('in_progress');
});

test('optional reported concerns remain visible without contradicting the selected-answer outcome',()=>{
  const result=isoGuidedResult('A.8.13',{...answersFor('A.8.13'),gaps:'Backup coverage is missing for the finance database.',unknowns:'Whether backups can be restored has not been confirmed.'});
  expect(result.status).toBe('addressed');expect(result.gaps).toEqual([]);expect(result.unknowns).toEqual([]);
  expect(result.narrative).toContain('Backup coverage is missing');expect(result.narrative).toContain('Whether backups can be restored');
  expect(result.narrative).toContain('derived from the selected substantive answers');
  expect(result.narrative).not.toContain('No confirmation or remediation items were reported in this interview.');
  expect(result.answers.filter(q=>q.prompt.includes('context')).every(q=>q.prompt.includes('optional'))).toBe(true);
});
test('conditional context exclusion needs its own reason and cannot erase a mandatory requirement',()=>{
  for(const [id,definition] of Object.entries(isoGuidedCatalog.definitions)){
    for(const q of definition.groups.flatMap(g=>g.questions).filter(q=>q.type==='context')){
      const answers={...answersFor(id),[q.id]:'Not relevant here'};
      expect(()=>validateIsoCompletion(id,answers)).toThrow();
      answers[q.id+'_detail']='Specific conditional activity is not performed in this scope';
      expect(()=>validateIsoCompletion(id,answers)).not.toThrow();
      expect(isoQuestions(id,answers).some(child=>child.condition?.id===q.id&&child.condition?.equals==='Relevant')).toBe(false);
      expect(isoGuidedResult(id,answers).status).not.toBe('not_applicable');
    }
  }
});

test('all 30 clauses and 93 controls have inline summaries built only from supported practices without changing canonical results',()=>{
  for(const row of native.requirements){
    const answers=answersFor(row.id),before=isoGuidedResult(row.id,answers),inline=isoInlineNarrative(row.id,answers,isoGuidedCatalog.version,'Synthetic scoped organization');
    expect(inline).toContain(row.id);expect(inline).toContain('\n\nControls in place\n• ');expect(inline).not.toContain('IMPLEMENTATION BREAKDOWN');expect(inline).not.toContain('\n\nITEMS TO ADDRESS');
    expect(inline).toMatch(/reported on \d{4}-\d{2}-\d{2}/);expect(inline).toContain('not independent verification or certification');
    expect(inline.split('\n\nControls in place\n')[1].split('\n').map(line=>line.slice(2))).toEqual(before.basis);
    expect(isoGuidedResult(row.id,answers)).toEqual(before);
    const noAnswers={...answers};for(const q of isoQuestions(row.id,answers).filter(q=>q.type==='select'))noAnswers[q.id]='No';
    const deficient=isoInlineNarrative(row.id,noAnswers);expect(deficient).toContain('Controls in place');expect(deficient).not.toContain('\n• ');expect(deficient).toContain('incomplete or not in place');
    const uncertain={...answers};for(const q of isoQuestions(row.id,answers).filter(q=>q.type==='select'))uncertain[q.id]='Not sure';
    expect(isoInlineNarrative(row.id,uncertain)).not.toContain('\n• ');expect(isoInlineNarrative(row.id,uncertain)).toContain('facts that need confirmation');
  }
});

test('inline partial practice is a limitation rather than a control in place and explicit detail is retained',()=>{
  const answers=answersFor('A.8.13'),questions=isoQuestions('A.8.13',answers).filter(q=>q.type==='select'),[partial,supported]=questions;
  answers[partial.id]='Partially';answers[partial.id+'_detail']='Backup coverage is incomplete for the finance database.';answers[supported.id+'_detail']='Approved scoped procedure and operator responsibilities.';
  const narrative=isoInlineNarrative('A.8.13',answers,isoGuidedCatalog.version,'Synthetic ISO organization');
  expect(narrative.split('\n\nControls in place')[1]).not.toContain(partial.topic);expect(narrative).toContain('Approved scoped procedure and operator responsibilities.');expect(narrative).toContain('incomplete or not in place');
  expect(isoGuidedResult('A.8.13',answers).gaps.join(' ')).toContain('finance database');
});
