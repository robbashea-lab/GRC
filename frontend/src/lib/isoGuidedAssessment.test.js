import native from '@catalogs/iso27001.json';
import v2Catalog from '@catalogs/guidedIsoV2.json';
import {isoGuidedCatalog as activeIsoGuidedCatalog,isoGuidedRolloutCatalog,isoGuidedProspectiveCatalog,isoGuidedEnabled,isoQuestions,isoGroups,isoGuidedResult,isoInlineNarrative,validateIsoAnswers,validateIsoCompletion,isoUsesIntentGates,isoUsesInlineSentences,isoUsesConcernStatus} from './isoGuidedAssessment';
// Keep original historical fixtures on their exact question set; activation is checked separately below.
const isoGuidedCatalog=v2Catalog;
const answersFor=(id,version=isoGuidedCatalog.version)=>{
  const answers={};
  for(let pass=0;pass<30;pass++){
    const missing=isoQuestions(id,answers,version).filter(q=>!(q.id in answers));
    if(!missing.length)break;
    for(const q of missing)answers[q.id]=q.type==='text'?'':q.type==='context'?'Relevant':q.optional?'No':'Yes';
  }
  return answers;
};
test('all explicit ISO v1 readers retain historical uncertainty and context',()=>{
  for(const row of native.requirements){
    const answers=answersFor(row.id);
    delete answers.additional_gap;delete answers.additional_confirmation;
    const first=isoQuestions(row.id,answers,'iso27001-omni-1').find(question=>question.type==='select');
    const retained={...answers,[first.id]:'Not sure',gaps:'Historical optional context'};
    validateIsoCompletion(row.id,retained,'iso27001-omni-1');
    const output=isoGuidedResult(row.id,retained,'iso27001-omni-1');
    expect(output.status).toBe('in_progress');expect(output.narrative).toContain('Historical optional context');
    expect(output.signals.some(signal=>signal.questionId==='gaps')).toBe(false);
  }
});
test('current optional ISO intent cannot promote hidden negative context into work',()=>{
  const answers={...answersFor('4.1'),gaps:'No outstanding gaps.',unknowns:'None'};
  for(const intent of [undefined,'No','Not sure']){
    const retained={...answers};
    if(intent)Object.assign(retained,{additional_gap:intent,additional_confirmation:intent});
    else {delete retained.additional_gap;delete retained.additional_confirmation;}
    validateIsoCompletion('4.1',retained);
    expect(isoGuidedResult('4.1',retained).signals).toEqual([]);
    expect(isoGuidedResult('4.1',retained).status).toBe('addressed');
  }
  for(const [parent,detail] of [['additional_gap','gaps'],['additional_confirmation','unknowns']]){
    expect(()=>validateIsoCompletion('4.1',{...answers,[parent]:'Yes',[detail]:' \n'})).toThrow(/Describe/);
  }
});
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
    expect(isoGuidedResult(row.id,{...answers,[first]:'Not sure'}).status).toBe('not_assessed');
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
  expect(isoGuidedResult('A.5.3',{...answers,'ISO-A.5.3-exceptions':'Not sure'}).status).toBe('not_assessed');
});

test('optional reported concerns remain visible without contradicting the selected-answer outcome',()=>{
  // Preserve the authored rollout-1 proposal and wording as an explicit historical reader.
  const result=isoGuidedResult('A.8.13',{...answersFor('A.8.13'),additional_gap:'Yes',additional_confirmation:'Yes',gaps:'Backup coverage is missing for the finance database.',unknowns:'Whether backups can be restored has not been confirmed.'},'iso27001-assessment-rollout-1');
  expect(result.status).toBe('addressed');expect(result.gaps).toEqual(['Backup coverage is missing for the finance database.']);expect(result.unknowns).toEqual(['Whether backups can be restored has not been confirmed.']);
  expect(result.narrative).toContain('Backup coverage is missing');expect(result.narrative).toContain('Whether backups can be restored');
  expect(result.nextSteps).toEqual(['Address the reported gap: Backup coverage is missing for the finance database.','Confirm the reported information: Whether backups can be restored has not been confirmed.']);
  expect(result.narrative).not.toContain('No confirmation or remediation items were reported in this interview.');
  expect(result.signals.map(signal=>[signal.questionId,signal.kind])).toEqual([['gaps','gap'],['unknowns','verification']]);
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
    const noBefore=JSON.stringify(noAnswers),noResult=isoGuidedResult(row.id,noAnswers);
    const deficient=isoInlineNarrative(row.id,noAnswers);expect(deficient).not.toContain('Controls in place');expect(deficient).not.toContain('\n• ');expect(deficient).toContain('Reported gap:');
    expect(noResult.status).toBe('needs_attention');expect(isoGuidedResult(row.id,noAnswers)).toEqual(noResult);expect(JSON.stringify(noAnswers)).toBe(noBefore);
    const uncertain={...answers};for(const q of isoQuestions(row.id,answers).filter(q=>q.type==='select'))uncertain[q.id]='Not sure';
    const uncertainBefore=JSON.stringify(uncertain),uncertainResult=isoGuidedResult(row.id,uncertain),uncertainInline=isoInlineNarrative(row.id,uncertain);
    expect(uncertainInline).not.toContain('Controls in place');expect(uncertainInline).not.toContain('\n• ');expect(uncertainInline).toContain('Requires confirmation:');
    expect(uncertainResult.status).toBe('not_assessed');expect(isoGuidedResult(row.id,uncertain)).toEqual(uncertainResult);expect(JSON.stringify(uncertain)).toBe(uncertainBefore);
  }
});

test('inline partial practice is a limitation rather than a control in place and explicit detail is retained',()=>{
  const answers=answersFor('A.8.13'),questions=isoQuestions('A.8.13',answers).filter(q=>q.type==='select'),[partial,supported]=questions;
  answers[partial.id]='Partially';answers[partial.id+'_detail']='Backup coverage is incomplete for the finance database.';answers[supported.id+'_detail']='Approved scoped procedure and operator responsibilities.';
  const narrative=isoInlineNarrative('A.8.13',answers,isoGuidedCatalog.version,'Synthetic ISO organization');
  expect(narrative.split('\n\nControls in place')[1]).not.toContain(partial.topic);expect(narrative).toContain('Approved scoped procedure and operator responsibilities.');expect(narrative).toContain('Reported gap:');
  expect(isoGuidedResult('A.8.13',answers).gaps.join(' ')).toContain('finance database');
});

const rolloutVersion='iso27001-assessment-rollout-1';
const prospectiveVersion='iso27001-assessment-rollout-2';
const optionalRegistrations=[
  ...['6.1.2','6.1.3','7.2','7.3','7.5.3','9.2.2','9.3.3','10.2'].map(id=>[id,`SPEC-ISO-${id}-tool-context`]),
  ...['A.5.9','A.5.12','A.5.13','A.5.15','A.5.16','A.5.17','A.5.18','A.5.19','A.5.20','A.5.21','A.5.22','A.5.23','A.5.24','A.5.25','A.5.26','A.5.27','A.5.28','A.5.29','A.5.30','A.5.34','A.6.3','A.6.7','A.6.8','A.8.1','A.8.2','A.8.3','A.8.4','A.8.5','A.8.7','A.8.8','A.8.9','A.8.12','A.8.13','A.8.15','A.8.16','A.8.18','A.8.19','A.8.20','A.8.21','A.8.22','A.8.23','A.8.25','A.8.26','A.8.27','A.8.28','A.8.29','A.8.30','A.8.31','A.8.32'].map(id=>[id,`ISO-${id}-tool-location-context`]),
];

test('rollout reader adds exactly 57 optional text keys while V2 remains immutable',()=>{
  expect(isoGuidedCatalog).toEqual(v2Catalog);
  expect(isoGuidedCatalog.version).toBe('iso27001-omni-2');
  expect(activeIsoGuidedCatalog).toBe(isoGuidedProspectiveCatalog);
  expect(isoGuidedRolloutCatalog.version).toBe(rolloutVersion);
  expect(Object.keys(isoGuidedRolloutCatalog.definitions)).toEqual(Object.keys(v2Catalog.definitions));
  expect(isoGuidedRolloutCatalog.extra_questions).toEqual(v2Catalog.extra_questions);
  expect(optionalRegistrations).toHaveLength(57);
  const expected=new Map(optionalRegistrations);
  for(const [id,definition] of Object.entries(v2Catalog.definitions)){
    const rollout=isoGuidedRolloutCatalog.definitions[id],newGroups=rollout.groups.slice(definition.groups.length);
    expect({...rollout,groups:rollout.groups.slice(0,definition.groups.length)}).toEqual(definition);
    if(!expected.has(id)){expect(newGroups).toEqual([]);continue;}
    expect(newGroups).toHaveLength(1);expect(newGroups[0].id).toBe('implementation_context');
    expect(newGroups[0].questions).toHaveLength(1);
    expect(newGroups[0].questions[0]).toMatchObject({id:expected.get(id),type:'text',optional:true});
    expect(newGroups[0].questions[0].condition??null).toBeNull();
  }
  const existing=isoQuestions('A.8.24',{},rolloutVersion).filter(q=>q.id==='ISO-A.8.24-arrangement-note');
  expect(existing).toHaveLength(1);expect(existing[0]).toMatchObject({type:'text',prompt:'Which cryptographic arrangement is used? (Optional)'});
});

test('the unmodified ISO default completes all 123 definitions and exposes all 57 optional context fields',()=>{
  expect(activeIsoGuidedCatalog.version).toBe(prospectiveVersion);
  let optionalCount=0;
  for(const row of native.requirements){
    const answers=answersFor(row.id,activeIsoGuidedCatalog.version);
    const context=isoGroups(row.id,answers).find(group=>group.id==='implementation_context');
    for(const question of context?.questions||[]){optionalCount++;answers[question.id]='Exact current optional context: '+question.id;}
    expect(()=>validateIsoCompletion(row.id,answers)).not.toThrow();
    const result=isoGuidedResult(row.id,answers);
    expect(result.version).toBe(prospectiveVersion);expect(result.status).toBe('addressed');
    for(const question of context?.questions||[])expect(result.narrative).toContain(answers[question.id]);
  }
  expect(optionalCount).toBe(57);
});

test('saved ISO wording and intent policies identify versions independently of the current default',()=>{
  for(const policy of [isoUsesIntentGates,isoUsesInlineSentences]){
    expect(policy()).toBe(true);expect(policy('iso27001-omni-1')).toBe(false);
    expect(policy('iso27001-omni-2')).toBe(true);expect(policy(rolloutVersion)).toBe(true);
    expect(policy(prospectiveVersion)).toBe(true);
    expect(policy('iso27001-unknown')).toBe(false);
  }
});

test('prospective ISO catalog changes only the version and gates concern status only for new reviews',()=>{
  expect(isoGuidedProspectiveCatalog).toEqual({...isoGuidedRolloutCatalog,version:prospectiveVersion});
  expect(isoUsesConcernStatus()).toBe(true);expect(isoUsesConcernStatus(prospectiveVersion)).toBe(true);
  for(const version of ['iso27001-omni-1',v2Catalog.version,rolloutVersion,'iso27001-unknown'])expect(isoUsesConcernStatus(version)).toBe(false);
  const answers={...answersFor('A.8.13',rolloutVersion),additional_gap:'Yes',gaps:'Exact retained R1 gap.'},before=JSON.stringify(answers);
  const historical=isoGuidedResult('A.8.13',answers,rolloutVersion);
  expect(historical.status).toBe('addressed');expect(historical.narrative).toContain('it does not change the proposed status');
  expect(isoGuidedResult('A.8.13',answers,prospectiveVersion).status).toBe('needs_attention');expect(JSON.stringify(answers)).toBe(before);
});

test('rollout optional context is version-scoped, optional, length-bounded and non-scoring',()=>{
  for(const [id,key] of optionalRegistrations){
    const answers=answersFor(id,rolloutVersion),baseline=isoGuidedResult(id,answers,rolloutVersion);
    delete answers[key];const before=JSON.stringify(answers);expect(()=>validateIsoCompletion(id,answers,rolloutVersion)).not.toThrow();
    expect(isoGuidedResult(id,answers,rolloutVersion)).toEqual(baseline);
    for(const value of ['','Not sure','Custom location — retained exactly','😀'.repeat(1000)]){
      const reported={...answers,[key]:value},snapshot=JSON.stringify(reported);
      validateIsoCompletion(id,reported,rolloutVersion);
      expect(isoGuidedResult(id,reported,rolloutVersion).status).toBe(baseline.status);
      expect(JSON.stringify(reported)).toBe(snapshot);
      expect(()=>validateIsoAnswers(id,{[key]:value},'iso27001-omni-1')).toThrow();
      expect(()=>validateIsoAnswers(id,{[key]:value},v2Catalog.version)).toThrow();
    }
    for(const value of ['x'.repeat(2001),'😀'.repeat(1001),{},true])expect(()=>validateIsoAnswers(id,{[key]:value},rolloutVersion)).toThrow();
    expect(()=>validateIsoAnswers('4.1',{[key]:'Cross-record value'},rolloutVersion)).toThrow();
    expect(JSON.stringify(answers)).toBe(before);
  }
});

test('old V1 and V2 wording and native outcomes survive explicit rollout reads',()=>{
  for(const row of native.requirements){
    const answers=answersFor(row.id,v2Catalog.version),v2=isoGuidedResult(row.id,answers,v2Catalog.version),next=isoGuidedResult(row.id,answers,rolloutVersion);
    expect({...next,version:v2Catalog.version}).toEqual(v2);
    expect(isoInlineNarrative(row.id,answers,rolloutVersion)).toBe(isoInlineNarrative(row.id,answers,v2Catalog.version));
  }
  const answers=answersFor('4.1'),first=isoQuestions('4.1',answers).find(q=>q.type==='select');
  answers[first.id+'_detail']='Exact saved sentence.';
  const legacy={...answers};delete legacy.additional_gap;delete legacy.additional_confirmation;
  expect(isoGuidedResult('4.1',legacy,'iso27001-omni-1').basis[0]).toContain('Exact saved sentence..');
  expect(isoGuidedResult('4.1',answers,v2Catalog.version).basis[0]).toContain('Exact saved sentence.');
  expect(isoGuidedResult('4.1',answers,v2Catalog.version).basis[0]).not.toContain('Exact saved sentence..');
});

test('prospective ISO preserves every core-only outcome and write-up when no extra concern is affirmed',()=>{
  for(const row of native.requirements){
    const baseline=answersFor(row.id,rolloutVersion),first=isoQuestions(row.id,baseline,rolloutVersion).find(question=>question.type==='select');
    for(const value of ['Yes','Partially','No','Not sure']){
      const answers={...baseline,[first.id]:value},before=JSON.stringify(answers);
      const historical=isoGuidedResult(row.id,answers,rolloutVersion),current=isoGuidedResult(row.id,answers,prospectiveVersion);
      expect({...current,version:rolloutVersion}).toEqual(historical);
      expect(isoInlineNarrative(row.id,answers,prospectiveVersion)).toBe(isoInlineNarrative(row.id,answers,rolloutVersion));
      expect(JSON.stringify(answers)).toBe(before);
    }
  }
});

for(const [scenario,parent,detail,kind] of [['NATIVE01','additional_gap','gaps','gap'],['NATIVE02','additional_confirmation','unknowns','verification']]){
  test(`${scenario}: preserve native proposal and reported signals separately from a reviewer Apply decision`,()=>{
    for(const version of [v2Catalog.version,rolloutVersion]){
      const answers={...answersFor('A.8.13',version),[parent]:'Yes',[detail]:'Specific reported work remains unresolved.'},before=JSON.stringify(answers);
      validateIsoCompletion('A.8.13',answers,version);
      const result=isoGuidedResult('A.8.13',answers,version);
      expect(result.status).toBe('addressed');
      expect(result.signals).toEqual([{questionId:detail,kind,text:answers[detail]}]);
      expect(result[detail]).toEqual([answers[detail]]);
      expect(result.narrative).toContain(answers[detail]);
      expect(result.nextSteps).toEqual([(kind==='gap'?'Address the reported gap: ':'Confirm the reported information: ')+answers[detail]]);
      expect(JSON.stringify(answers)).toBe(before);
    }
  });
}

const prospectiveConcernCases=[
  ['affirmative gap overrides otherwise Yes core','Yes',{additional_gap:'Yes',gaps:'A confirmed scoped backup gap remains.'},'needs_attention'],
  ['affirmative confirmation constrains otherwise Yes core','Yes',{additional_confirmation:'Yes',unknowns:'Restore coverage remains unconfirmed.'},'not_assessed'],
  ['affirmative gap takes precedence over confirmation','Yes',{additional_gap:'Yes',gaps:'A confirmed scoped backup gap remains.',additional_confirmation:'Yes',unknowns:'Restore coverage remains unconfirmed.'},'needs_attention'],
  ['partial core retains its existing precedence over confirmation','Partially',{additional_confirmation:'Yes',unknowns:'Restore coverage remains unconfirmed.'},'in_progress'],
  ['core No retains precedence over confirmation','No',{additional_confirmation:'Yes',unknowns:'Restore coverage remains unconfirmed.'},'needs_attention'],
  ['affirmative gap overrides core uncertainty','Not sure',{additional_gap:'Yes',gaps:'A confirmed scoped backup gap remains.'},'needs_attention'],
  ['affirmative gap constrains partial core','Partially',{additional_gap:'Yes',gaps:'A confirmed scoped backup gap remains.'},'needs_attention'],
];

test.each(prospectiveConcernCases)('prospective ISO proposal: %s',(_scenario,core,concern,expected)=>{
  const id='A.8.13',answers=answersFor(id,activeIsoGuidedCatalog.version);
  const first=isoQuestions(id,answers,activeIsoGuidedCatalog.version).find(question=>question.type==='select'&&!question.optional);
  const reported={...answers,[first.id]:core,...concern},before=JSON.stringify(reported);
  validateIsoCompletion(id,reported);
  const result=isoGuidedResult(id,reported);
  expect(result.status).toBe(expected);
  for(const [parent,detail,kind] of [['additional_gap','gaps','gap'],['additional_confirmation','unknowns','verification']])if(reported[parent]==='Yes'){
    expect(result.signals).toContainEqual({questionId:detail,kind,text:reported[detail]});
    expect(result[detail]).toContain(reported[detail]);expect(result.narrative).toContain(reported[detail]);
  }
  expect(JSON.stringify(reported)).toBe(before);
});

test('prospective ISO proposal ignores absent, negative and uncertain concern intents and Unicode-blank draft detail',()=>{
  const id='A.8.13',answers=answersFor(id,activeIsoGuidedCatalog.version);
  for(const intent of [undefined,'No','Not sure']){
    const reported={...answers,gaps:'Retained hidden gap text.',unknowns:'Retained hidden confirmation text.'};
    if(intent)Object.assign(reported,{additional_gap:intent,additional_confirmation:intent});else{delete reported.additional_gap;delete reported.additional_confirmation;}
    const before=JSON.stringify(reported);validateIsoCompletion(id,reported);expect(isoGuidedResult(id,reported).status).toBe('addressed');expect(JSON.stringify(reported)).toBe(before);
  }
  const blank='\t\n\u00a0\u2003\ufeff ';
  for(const [parent,detail] of [['additional_gap','gaps'],['additional_confirmation','unknowns']]){
    const reported={...answers,[parent]:'Yes',[detail]:blank},before=JSON.stringify(reported);
    expect(isoGuidedResult(id,reported).status).toBe('addressed');expect(()=>validateIsoCompletion(id,reported)).toThrow(/Describe/);expect(JSON.stringify(reported)).toBe(before);
  }
});

test('prospective ISO proposal wording does not deny the effect of affirmative populated concerns',()=>{
  const id='A.8.13',answers={...answersFor(id,activeIsoGuidedCatalog.version),additional_gap:'Yes',gaps:'A confirmed scoped backup gap remains.'};
  const result=isoGuidedResult(id,answers);expect(result.narrative).not.toContain('it does not change the proposed status');
});

test('prospective ISO proposal uses the existing JavaScript trim boundary for populated Unicode concern detail',()=>{
  for(const value of [' \u0085 ',' \u200b ','\u00a0Confirmed scoped gap.\ufeff']){
    const answers={...answersFor('A.8.13',activeIsoGuidedCatalog.version),additional_gap:'Yes',gaps:value},before=JSON.stringify(answers);
    validateIsoCompletion('A.8.13',answers);const result=isoGuidedResult('A.8.13',answers);
    expect(result.status).toBe('needs_attention');expect(result.signals).toContainEqual({questionId:'gaps',kind:'gap',text:value.trim()});expect(JSON.stringify(answers)).toBe(before);
  }
});
