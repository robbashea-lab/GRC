import nativeCatalog from '@catalogs/soc2.json';
import socGuidedCatalog from '@catalogs/guidedSoc2.json';
import {socGuidedCatalog as activeSocGuidedCatalog, socRolloutCatalog, socProposalCatalog, socUsesIntentGates, socUsesInlineSentences, socUsesReportedWorkStatus, socGuidedEnabled, socQuestions, socGroups, validateSocAnswers, validateSocCompletion, socGuidedResult, socInlineSummary} from './socGuidedAssessment';

// Original V1/V2 characterization fixtures stay bound to their immutable V2 source.
const ids = Object.keys(socGuidedCatalog.definitions);
const version = 'soc2-omni-2';
const allQuestions = id => socGuidedCatalog.definitions[id].groups.flatMap(group => group.questions);
const complete = id => Object.fromEntries(allQuestions(id).map(question => [question.id, question.type === 'text' ? '' : question.type === 'context' ? 'Relevant' : 'Yes']));
const firstPractice = id => allQuestions(id).find(question => !['text', 'context'].includes(question.type));

test.each(ids)('%s retains explicit v1 uncertainty and context semantics', id => {
  const answers={...complete(id),[firstPractice(id).id]:'Not sure',gaps:'Historical optional context'};
  const output=socGuidedResult(id,answers,'soc2-omni-1');
  expect(output.status).toBe('in_progress');
  expect(output.narrative).toContain('Historical optional context');
  expect(output.signals.some(signal=>signal.questionId==='gaps')).toBe(false);
  expect(()=>validateSocCompletion(id,answers,'soc2-omni-1')).not.toThrow();
});

test('retained rollout-1 optional intent gates text and requires detail only for affirmative intent',()=>{
  const savedVersion=socRolloutCatalog.version;
  const answers={...complete('CC1.1'),gaps:'No outstanding gaps.',unknowns:'None'};
  for(const intent of [undefined,'No','Not sure']){
    const retained={...answers,...(intent?{additional_gap:intent,additional_confirmation:intent}:{})};
    validateSocCompletion('CC1.1',retained,savedVersion);
    expect(socGuidedResult('CC1.1',retained,savedVersion).signals).toEqual([]);
    expect(socGuidedResult('CC1.1',retained,savedVersion).status).toBe('addressed');
  }
  const affirmative={...answers,additional_gap:'Yes',additional_confirmation:'Yes',gaps:'A reported scoped exception remains.',unknowns:'Confirm the applicable coverage.'};
  validateSocCompletion('CC1.1',affirmative,savedVersion);
  const output=socGuidedResult('CC1.1',affirmative,savedVersion);
  expect(output.status).toBe('addressed');
  expect(output.signals.map(signal=>[signal.questionId,signal.kind])).toEqual([['gaps','gap'],['unknowns','verification']]);
  for(const key of ['gaps','unknowns'])expect(()=>validateSocCompletion('CC1.1',{...affirmative,[key]:' \n'},savedVersion)).toThrow(/Describe/);
});

test('all 61 supported criteria have versioned, bounded, native-category question definitions', () => {
  expect(socGuidedCatalog.version).toBe(version);
  expect(socGuidedCatalog.framework_id).toBe('soc-2');
  expect(ids.slice().sort()).toEqual(nativeCatalog.requirements.map(row => row.id).sort());
  expect(ids).toHaveLength(61);
  const categories = {};
  for (const id of ids) {
    const definition = socGuidedCatalog.definitions[id];
    expect(definition.category).toBe(nativeCatalog.requirements.find(row => row.id === id).category);
    categories[definition.category] = (categories[definition.category] || 0) + 1;
    expect(definition.groups.length).toBeGreaterThan(0);
    expect(definition.groups.length).toBeLessThanOrEqual(30);
    const questions = allQuestions(id), questionIds = questions.map(question => question.id);
    expect(new Set(questionIds).size).toBe(questionIds.length);
    expect(firstPractice(id)).toBeDefined();
    for (const question of questions) {
      expect(question.id.length).toBeLessThanOrEqual(100);
      expect(questionIds).not.toContain(question.id + '_detail');
      expect(['gaps', 'unknowns', 'evidence']).not.toContain(question.id);
      expect(question.prompt.length).toBeLessThanOrEqual(4000);
      if (question.condition) {
        expect(questionIds).toContain(question.condition.id);
        expect(question.condition.equals).toBe('Relevant');
        expect(questions.find(parent => parent.id === question.condition.id).type).toBe('context');
      }
    }
  }
  expect(categories).toEqual({security: 33, availability: 3, confidentiality: 2, processing_integrity: 5, privacy: 18});
});

test('eligibility follows configured categories, never client names or another framework', () => {
  const user = {user_id: 'synthetic-user'};
  for (const clientId of ['new-soc-client', 'existing-soc-client', 'arbitrary-client']) {
    expect(socGuidedEnabled(clientId, user, 'soc-2', {})).toBe(true);
    for (const id of ids) {
      const category = socGuidedCatalog.definitions[id].category;
      expect(socGuidedEnabled(clientId, user, 'soc-2', {categories: ['security']}, id)).toBe(category === 'security');
      expect(socGuidedEnabled(clientId, user, 'soc-2', {categories: ['security', category]}, id)).toBe(true);
    }
  }
  for (const [client, identity, framework, config, id] of [
    ['', user, 'soc-2', {}, 'CC1.1'], ['client', null, 'soc-2', {}, 'CC1.1'], ['client', {}, 'soc-2', {}, 'CC1.1'],
    ['client', user, 'soc2', {}, 'CC1.1'], ['client', user, 'cis-ig1', {}, 'CC1.1'],
    ['client', user, 'soc-2', {categories: []}, 'CC1.1'], ['client', user, 'soc-2', {categories: ['invented']}, 'CC1.1'],
    ['client', user, 'soc-2', {__program_active: false}, 'CC1.1'],
    ['client', user, 'soc-2', null, 'CC1.1'],
    ['client', user, 'soc-2', {}, 'CC999'], ['client', user, 'soc-2', {}, 'toString'],
  ]) expect(socGuidedEnabled(client, identity, framework, config, id)).toBe(false);
});

test.each(ids)('%s supports fresh, resumed, completed and revised answers without mutating records', id => {
  expect(socGuidedResult(id, {}).status).toBe('not_assessed');
  expect(() => validateSocCompletion(id, {})).toThrow(/Answer each/);
  const answers = complete(id), saved = JSON.stringify(answers);
  validateSocAnswers(id, answers); validateSocCompletion(id, answers);
  const output = socGuidedResult(id, answers, version, 'Synthetic SOC client');
  expect(output.status).toBe('addressed');
  expect(output.narrative).toMatch(/^OVERVIEW\nSynthetic SOC client reports/);
  expect(output.narrative.split('IMPLEMENTATION BREAKDOWN')).toHaveLength(2);
  expect(output.narrative.split('ITEMS TO ADDRESS')).toHaveLength(2);
  expect(output.narrative).not.toMatch(/Not recorded|SOC 2 certified|auditor sample/i);
  expect(output.narrative.length).toBeLessThanOrEqual(20000);
  expect(output.verification).toBeUndefined(); expect(output.history).toBeUndefined();
  expect(socGuidedResult(id, JSON.parse(saved), version, 'Different client').status).toBe(output.status);
  expect(JSON.stringify(answers)).toBe(saved);
  const revised = {...JSON.parse(saved), [firstPractice(id).id]: 'No'};
  expect(socGuidedResult(id, revised).status).toBe('needs_attention');
  expect(JSON.stringify(answers)).toBe(saved);
  for (const list of ['basis', 'gaps', 'unknowns', 'nextSteps', 'evidence']) {
    expect(output[list].length).toBeLessThanOrEqual(153);
    output[list].forEach(value => expect(value.length).toBeLessThanOrEqual(4000));
  }
});

test.each(ids)('%s evaluates material uncertainty separately from optional notes and evidence', id => {
  const answers = complete(id), key = firstPractice(id).id;
  for (const value of ['Partially', 'Not sure']) {
    const result = socGuidedResult(id, {...answers, [key]: value});
    expect(result.status).toBe(value === 'Partially' ? 'in_progress' : 'not_assessed');
    expect(value === 'Partially' ? result.gaps.length : result.unknowns.length).toBeGreaterThan(0);
  }
  const uncertain = Object.fromEntries(allQuestions(id).map(question => [question.id, question.type === 'text' ? '' : 'Not sure']));
  expect(socGuidedResult(id, uncertain).status).toBe('not_assessed');
  const optional = Object.fromEntries(allQuestions(id).filter(question => question.type === 'text').map(question => [question.id, 'Not sure who owns this optional note']));
  expect(socGuidedResult(id, {...answers, ...optional, evidence: 'Not sure where the supporting record is'}).status).toBe('addressed');
  expect(socGuidedResult(id, {...answers, gaps: 'Confirmed absence of a reported practice'}).status).toBe('addressed');
  expect(socGuidedResult(id, {...answers, unknowns: 'Coverage requires confirmation'}).status).toBe('addressed');
  expect(socGuidedResult(id, {unknowns: 'Coverage requires confirmation'}).status).toBe('not_assessed');
  expect(socGuidedResult(id, {...answers, gaps: '  ', unknowns: '\n ', evidence: ''}).status).toBe('addressed');
  expect(socGuidedResult(id, {...answers, gaps: '\ufeff', unknowns: '\ufeff'}).status).toBe('addressed');
});

test.each(ids)('%s ignores ungated retained freeform gaps and optional-name uncertainty', id => {
  const answers = complete(id), key = firstPractice(id).id;
  const variants = [
    {gaps: 'No outstanding gaps.'},
    {unknowns: 'All substantive items confirmed; optional document title not known.'},
    {gaps: 'Confirmed gap', unknowns: 'Material uncertainty'},
  ];
  for (const choice of ['Yes', 'No', 'Partially', 'Not sure']) {
    const structured = {...answers, [key]: choice}, baseline = socGuidedResult(id, structured);
    for (const context of variants) {
      const result = socGuidedResult(id, {...structured, ...context});
      for (const field of ['status', 'basis', 'gaps', 'unknowns', 'nextSteps', 'signals']) expect(result[field]).toEqual(baseline[field]);
      expect(result.narrative).not.toContain('Additional reported context');
      Object.values(context).forEach(prose => {
        expect(result.narrative).not.toContain(prose);
        expect(result.narrative.split('ITEMS TO ADDRESS\n')[1]).not.toContain(prose);
      });
      expect(result.narrative).not.toContain('Address the reported gap:');
    }
  }
});

test.each(ids)('%s rejects foreign keys, invalid choices, version substitution and oversized details', id => {
  const key = firstPractice(id).id;
  for (const answers of [null, [], {foreign: 'secret'}, {__proto__: null, constructor: 'secret'}, {[key]: 'Not applicable'}, {[key]: 'Other'}, {[key]: true}, {[key]: {Yes: true}}, {[key + '_detail']: 'x'.repeat(2001)}, {evidence: 'x'.repeat(2001)}, {[key]: 'x'.repeat(2001)}, {[key + '_detail']: '😀'.repeat(1001)}]) {
    expect(() => validateSocAnswers(id, answers)).toThrow(/Invalid SOC/);
  }
  expect(() => validateSocAnswers(id, {[key + '_detail']: 'x'.repeat(2000)})).not.toThrow();
  expect(() => validateSocAnswers(id, {[key + '_detail']: '😀'.repeat(1000)})).not.toThrow();
  expect(() => socGuidedResult(id, {}, 'cis-v8.1-program-4')).toThrow(/not available/);
});

test.each(ids)('%s produces a bounded write-up without discarding maximum-length interview responses', id => {
  const answers = complete(id);
  for (const question of allQuestions(id)) {
    if (question.type === 'text') answers[question.id] = 'x'.repeat(2000);
    else answers[question.id + '_detail'] = 'x'.repeat(2000);
  }
  answers.gaps = 'g'.repeat(2000); answers.unknowns = 'u'.repeat(2000); answers.evidence = 'e'.repeat(2000);
  const before = JSON.stringify(answers), result = socGuidedResult(id, answers);
  expect(result.narrative.length).toBeLessThanOrEqual(20000);
  expect(result.narrative).toContain('full response retained in the interview');
  expect(result.answers.find(answer => answer.prompt === firstPractice(id).prompt).answer).toContain('x'.repeat(2000));
  expect(JSON.stringify(answers)).toBe(before);
  result.answers.forEach(answer => expect(answer.answer.length).toBeLessThanOrEqual(12000));
});

test('outside context needs explanation; inactive retained answers cannot change the current result', () => {
  const contextIds = ids.filter(id => allQuestions(id).some(question => question.type === 'context'));
  expect(contextIds.length).toBeGreaterThan(0);
  for (const id of contextIds) for (const context of allQuestions(id).filter(question => question.type === 'context')) {
    const answers = {...complete(id), [context.id]: 'Outside the selected system'};
    expect(() => validateSocCompletion(id, answers)).toThrow(/Explain why/);
    answers[context.id + '_detail'] = 'Confirmed against the selected system boundary and commitments.';
    validateSocCompletion(id, answers);
    const hidden = allQuestions(id).filter(question => question.condition?.id === context.id);
    hidden.forEach(question => { answers[question.id] = 'No'; answers[question.id + '_detail'] = 'Retained historical deficiency'; });
    const result = socGuidedResult(id, answers);
    expect(result.status).not.toBe('not_applicable');
    expect(result.narrative).not.toContain('Retained historical deficiency');
    expect(socQuestions(id, answers).some(question => hidden.some(child => child.id === question.id))).toBe(false);
    for (const group of socGroups(id, answers)) expect(group.title).toBeTruthy();
    answers[context.id] = 'Relevant';
    expect(socGuidedResult(id, answers).status).toBe('needs_attention');
    answers[context.id] = 'Not sure';
    expect(socGuidedResult(id, answers).unknowns.length).toBeGreaterThan(0);
  }
});

test('unavailable criteria fail closed rather than receiving generic fallback questions', () => {
  for (const id of ['CC999', 'toString']) {
    expect(() => socQuestions(id)).toThrow(/not available/);
    expect(() => socGroups(id)).toThrow(/not available/);
    expect(() => socGuidedResult(id, {})).toThrow(/not available/);
  }
});

test.each(['Outside the selected system', 'Not sure'])('P6.1 skips empty consent groups for %s without changing retained answers', context => {
  const answers = {...complete('P6.1'), 'P6.1-disclosure-context': context,
    'P6.1-disclosure-context_detail': 'Confirmed against the selected system boundary.',
    'P6.1-consent': 'No', 'P6.1-consent_detail': 'Retained conditional consent gap'};
  const before = JSON.stringify(answers), groups = socGroups('P6.1', answers);
  expect(groups.every(group => group.questions.length > 0)).toBe(true);
  expect(groups.some(group => group.id === 'consent')).toBe(false);
  expect(groups.flatMap(group => group.questions).some(question => question.id === 'P6.1-consent')).toBe(false);
  validateSocCompletion('P6.1', answers);
  const result = socGuidedResult('P6.1', answers);
  expect(result.status).toBe(context === 'Not sure' ? 'not_assessed' : 'addressed');
  expect(result.narrative).not.toContain('Retained conditional consent gap');
  expect(result.signals.some(signal => signal.questionId === 'P6.1-consent')).toBe(false);
  expect(JSON.stringify(answers)).toBe(before);
  expect(socGroups('P6.1', {...answers, 'P6.1-disclosure-context': 'Relevant'}).some(group => group.id === 'consent')).toBe(true);
  expect(socGuidedResult('P6.1', {...answers, 'P6.1-disclosure-context': 'Relevant'}).status).toBe('needs_attention');
});


test.each(ids)('%s inline wording retains only confirmed controls and the canonical conclusion', id => {
  const answers=complete(id),question=firstPractice(id);answers[question.id]='No';
  const before=JSON.stringify(answers),result=socGuidedResult(id,answers,version,'Synthetic SOC client');
  const narrative=socInlineSummary(id,answers,version,'Synthetic SOC client','2026-10-13');
  expect(narrative).toContain('Synthetic SOC client reports confirmed deficiencies affecting '+id);
  expect(narrative).toContain('\n\nControls in place\n');
  expect(narrative).not.toMatch(/OVERVIEW|IMPLEMENTATION BREAKDOWN|ITEMS TO ADDRESS/);
  expect(narrative.split('\n\nControls in place')[1]).not.toContain(question.topic+': reported not in place');
  for(const control of result.basis)expect(narrative).toContain(control);
  expect(narrative).toContain('2026-10-13');expect(JSON.stringify(answers)).toBe(before);
  expect(socGuidedResult(id,answers,version,'Synthetic SOC client')).toEqual(result);
});


test.each(['Partially','No','Not sure'])('%s practices are excluded from controls in place without changing their evaluator result', value => {
  const id='CC1.1',answers=complete(id),question=firstPractice(id);answers[question.id]=value;
  const result=socGuidedResult(id,answers),narrative=socInlineSummary(id,answers,version,'Synthetic client','2026-10-13');
  const controls=narrative.split('\n\nControls in place')[1];
  expect(controls).not.toContain(question.topic+':');
  for(const gap of [...result.gaps,...result.unknowns])expect(controls).not.toContain(gap);
  expect(narrative).toContain(value==='Not sure'?'Requires confirmation:':'Reported gap:');
  expect(result.status).toBe(value==='No'?'needs_attention':value==='Partially'?'in_progress':'not_assessed');
});

test('unconfirmed inline reports do not invent any controls in place',()=>{
  const narrative=socInlineSummary('CC1.1',{},version,'Synthetic client','2026-10-13');
  expect(narrative).not.toContain('Controls in place');
  expect(narrative).not.toContain('•');expect(narrative).toContain('unconfirmed implementation position');
});


test('inline supported-control summaries stay bounded while full answers remain retained',()=>{
  const id='CC1.1',answers=complete(id);for(const question of allQuestions(id))answers[question.id+'_detail']='A'.repeat(2000);
  const text=socInlineSummary(id,answers,version,'Synthetic client','2026-10-13');
  expect(text.length).toBeLessThanOrEqual(20000);expect(text).toContain('full response retained in the interview');
  for(const question of allQuestions(id))expect(answers[question.id+'_detail']).toHaveLength(2000);
});

test('rollout activation retains the immutable historical catalog and feature semantics', () => {
  expect(socGuidedCatalog.version).toBe('soc2-omni-2');
  expect(activeSocGuidedCatalog).toBe(socProposalCatalog);
  expect(socRolloutCatalog.version).toBe('soc2-assessment-rollout-1');
  expect(Object.keys(socRolloutCatalog.definitions)).toEqual(ids);
  expect(socRolloutCatalog.extra_questions).toEqual(socGuidedCatalog.extra_questions);
  expect(Object.values(socRolloutCatalog.definitions).reduce((count, definition) =>
    count + definition.groups.at(-1).questions.length, 0)).toBe(220);
  for (const savedVersion of ['soc2-omni-2', 'soc2-assessment-rollout-1']) {
    expect(socUsesIntentGates(savedVersion)).toBe(true);
    expect(socUsesInlineSentences(savedVersion)).toBe(true);
  }
  for (const savedVersion of ['soc2-omni-1', 'foreign-version']) {
    expect(socUsesIntentGates(savedVersion)).toBe(false);
    expect(socUsesInlineSentences(savedVersion)).toBe(false);
  }
});

test('the unmodified active default completes every SOC criterion and exposes all 220 optional context fields', () => {
  expect(activeSocGuidedCatalog.version).toBe('soc2-assessment-rollout-2');
  let optionalCount=0;
  for(const id of ids){
    const answers={};
    for(let pass=0;pass<30;pass++){
      const missing=socQuestions(id,answers).filter(question=>!(question.id in answers));
      if(!missing.length)break;
      for(const question of missing)answers[question.id]=question.type==='text'?'':question.type==='context'?'Relevant':question.optional?'No':'Yes';
    }
    const context=socGroups(id,answers).find(group=>group.id==='implementation_context');
    expect(context).toBeTruthy();
    optionalCount+=context.questions.length;
    for(const question of context.questions)answers[question.id]='Exact current optional context: '+question.id;
    expect(()=>validateSocCompletion(id,answers)).not.toThrow();
    const result=socGuidedResult(id,answers);
    expect(result.version).toBe(activeSocGuidedCatalog.version);expect(result.status).toBe('addressed');
    for(const question of context.questions)expect(result.narrative).toContain(answers[question.id]);
  }
  expect(optionalCount).toBe(220);
});

test.each(ids)('%s rollout preserves native groups and appends only optional text context before shared extras', id => {
  const prior = socGuidedCatalog.definitions[id], current = socRolloutCatalog.definitions[id];
  expect(current.groups.slice(0, -1)).toEqual(prior.groups);
  for (const field of ['title', 'category', 'objective', 'source_page']) expect(current[field]).toEqual(prior[field]);
  const context = current.groups.at(-1);
  expect(context.id).toBe('implementation_context');
  expect(context.title).toBe('Implementation context');
  expect(context.questions.slice(0, 3).map(question => question.id)).toEqual([
    id + '-implementation-method', id + '-responsible-owner', id + '-operating-schedule',
  ]);
  for (const question of context.questions) {
    expect(question.type).toBe('text');
    expect(question.optional).toBe(true);
    expect(question.condition).toBeUndefined();
    expect(question.default).toBeUndefined();
  }
  const questions = socQuestions(id, {}, socRolloutCatalog.version), keys = questions.map(question => question.id);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys.indexOf(context.questions[0].id)).toBeGreaterThan(keys.indexOf(prior.groups[0].questions[0].id));
  expect(keys.indexOf(context.questions.at(-1).id)).toBeLessThan(keys.indexOf('additional_gap'));
});

test.each(ids)('%s rollout optional context stays blank, strictly bounded and neutral to readiness', id => {
  const rolloutVersion = socRolloutCatalog.version, answers = complete(id);
  const optional = socRolloutCatalog.definitions[id].groups.at(-1).questions;
  const supplied = Object.fromEntries(optional.map(question => [question.id, 'Other source — scope unconfirmed; reported by the owner.']));
  const combined = {...answers, ...supplied}, before = JSON.stringify(combined);
  expect(() => validateSocCompletion(id, answers, rolloutVersion)).not.toThrow();
  expect(() => validateSocCompletion(id, combined, rolloutVersion)).not.toThrow();
  const baseline = socGuidedResult(id, answers, version), output = socGuidedResult(id, combined, rolloutVersion);
  for (const field of ['status', 'basis', 'gaps', 'unknowns', 'nextSteps', 'signals']) expect(output[field]).toEqual(baseline[field]);
  expect(output.narrative).toContain(supplied[optional[0].id]);
  expect(output.answers.some(answer => answer.answer === supplied[optional[0].id])).toBe(true);
  expect(JSON.stringify(combined)).toBe(before);
  expect(socGuidedResult(id, supplied, rolloutVersion).status).toBe('not_assessed');
  expect(() => validateSocCompletion(id, supplied, rolloutVersion)).toThrow(/Answer each/);
  for (const question of optional) {
    expect(() => validateSocAnswers(id, {[question.id]: ''}, rolloutVersion)).not.toThrow();
    expect(() => validateSocAnswers(id, {[question.id]: '😀'.repeat(1000)}, rolloutVersion)).not.toThrow();
    for (const value of [true, [], {}, 'x'.repeat(2001), '😀'.repeat(1001)]) {
      expect(() => validateSocAnswers(id, {[question.id]: value}, rolloutVersion)).toThrow(/Invalid SOC/);
    }
    for (const priorVersion of ['soc2-omni-1', 'soc2-omni-2']) {
      expect(() => validateSocAnswers(id, {[question.id]: 'Retained custom source'}, priorVersion)).toThrow(/Invalid SOC/);
    }
  }
  expect(() => validateSocAnswers(id, {[id + '-unregistered-context']: 'Unknown'}, rolloutVersion)).toThrow(/Invalid SOC/);
});

test.each(ids)('%s rollout retains V2 wording and native NATIVE01/02 proposal/signals without overriding status', id => {
  const answers = complete(id), detailKey = firstPractice(id).id + '_detail';
  answers[detailKey] = 'A reported practice with punctuation.';
  expect(socGuidedResult(id, answers, socRolloutCatalog.version).narrative).toBe(socGuidedResult(id, answers, version).narrative);
  for (const savedVersion of [version, socRolloutCatalog.version]) {
    for (const extra of [
      {additional_gap: 'Yes', gaps: 'A substantive scoped practice is missing.'},
      {additional_confirmation: 'Yes', unknowns: 'Confirm the unresolved coverage.'},
      {additional_gap: 'Yes', gaps: 'A substantive scoped practice is missing.', additional_confirmation: 'Yes', unknowns: 'Confirm the unresolved coverage.'},
    ]) {
      const supplied = {...answers, ...extra}, before = JSON.stringify(supplied);
      validateSocCompletion(id, supplied, savedVersion);
      const result = socGuidedResult(id, supplied, savedVersion);
      // Characterize the held native concern; presentation must not silently repair scoring.
      expect(result.status).toBe('addressed');
      expect(result.signals.map(signal => [signal.questionId, signal.kind])).toEqual([
        ...(extra.gaps ? [['gaps', 'gap']] : []), ...(extra.unknowns ? [['unknowns', 'verification']] : []),
      ]);
      for (const key of ['gaps', 'unknowns'].filter(key => extra[key])) {
        expect(result[key]).toContain(extra[key]);
        expect(result.narrative).toContain(extra[key]);
        expect(() => validateSocCompletion(id, {...supplied, [key]: ' \n'}, savedVersion)).toThrow(/Describe/);
      }
      expect(JSON.stringify(supplied)).toBe(before);
    }
  }
});

test.each([
  ['affirmative gap', {additional_gap: 'Yes', gaps: 'A scoped practice is confirmed missing.'}, 'needs_attention'],
  ['affirmative confirmation', {additional_confirmation: 'Yes', unknowns: 'Confirm the unresolved scoped practice.'}, 'not_assessed'],
  ['gap before confirmation', {additional_gap: 'Yes', gaps: 'A scoped practice is confirmed missing.', additional_confirmation: 'Yes', unknowns: 'Confirm the unresolved scoped practice.'}, 'needs_attention'],
  ['partial practice with confirmation', {additional_confirmation: 'Yes', unknowns: 'Confirm the unresolved scoped practice.', partialPractice: true}, 'in_progress'],
])('prospective proposal: active SOC default includes %s in native status precedence', (_label, supplied, expected) => {
  const {partialPractice, ...extra} = supplied;
  const answers = {...complete('CC1.1'), ...extra};
  if (partialPractice) answers[firstPractice('CC1.1').id] = 'Partially';
  const before = JSON.stringify(answers);
  expect(() => validateSocCompletion('CC1.1', answers)).not.toThrow();
  const result = socGuidedResult('CC1.1', answers);
  expect(result.status).toBe(expected);
  for (const key of ['gaps', 'unknowns'].filter(key => extra[key])) expect(result.narrative).toContain(extra[key]);
  expect(JSON.stringify(answers)).toBe(before);
});

test('prospective proposal version changes only the catalog identity and explicitly opts into reported-work status', () => {
  expect(socProposalCatalog.version).toBe('soc2-assessment-rollout-2');
  expect({...socProposalCatalog, version: socRolloutCatalog.version}).toEqual(socRolloutCatalog);
  expect(socUsesReportedWorkStatus(socProposalCatalog.version)).toBe(true);
  expect(socUsesIntentGates(socProposalCatalog.version)).toBe(true);
  expect(socUsesInlineSentences(socProposalCatalog.version)).toBe(true);
  for (const savedVersion of ['soc2-omni-1', 'soc2-omni-2', socRolloutCatalog.version, 'foreign-version']) {
    expect(socUsesReportedWorkStatus(savedVersion)).toBe(false);
  }
});

test.each(ids)('%s prospective proposal combines reported-work concerns with the existing core precedence', id => {
  const baseline = complete(id), practice = firstPractice(id).id;
  for (const [extra, expected] of [
    [{additional_gap: 'Yes', gaps: 'A confirmed scoped deficiency.'}, 'needs_attention'],
    [{additional_confirmation: 'Yes', unknowns: 'The scoped practice needs confirmation.'}, 'not_assessed'],
    [{additional_gap: 'Yes', gaps: 'A confirmed scoped deficiency.', additional_confirmation: 'Yes', unknowns: 'The scoped practice needs confirmation.'}, 'needs_attention'],
    [{[practice]: 'Partially', additional_confirmation: 'Yes', unknowns: 'The scoped practice needs confirmation.'}, 'in_progress'],
    [{[practice]: 'No', additional_confirmation: 'Yes', unknowns: 'The scoped practice needs confirmation.'}, 'needs_attention'],
  ]) {
    const answers = {...baseline, ...extra}, before = JSON.stringify(answers);
    expect(() => validateSocCompletion(id, answers)).not.toThrow();
    expect(socGuidedResult(id, answers).status).toBe(expected);
    expect(JSON.stringify(answers)).toBe(before);
  }
});

test.each(['gaps', 'unknowns'])('prospective proposal requires affirmative populated %s and preserves exact input text', field => {
  const intent = field === 'gaps' ? 'additional_gap' : 'additional_confirmation';
  const expected = field === 'gaps' ? 'needs_attention' : 'not_assessed';
  for (const invalid of [true, 'yes', 'Maybe', {}]) {
    expect(() => validateSocAnswers('CC1.1', {[intent]: invalid})).toThrow(/Invalid SOC/);
  }
  for (const value of [undefined, 'No', 'Not sure']) {
    const answers = {...complete('CC1.1'), [field]: 'Retained text without affirmative intent.', ...(value ? {[intent]: value} : {})};
    expect(() => validateSocCompletion('CC1.1', answers)).not.toThrow();
    const result = socGuidedResult('CC1.1', answers);
    expect(result.status).toBe('addressed');expect(result.signals).toEqual([]);
  }
  for (const blank of ['', ' \n\t', '\ufeff', '\u00a0\u2028\u3000']) {
    const answers = {...complete('CC1.1'), [intent]: 'Yes', [field]: blank};
    expect(() => validateSocCompletion('CC1.1', answers)).toThrow(/Describe/);
    expect(socGuidedResult('CC1.1', answers).status).toBe('addressed');
    expect(socGuidedResult('CC1.1', answers).signals).toEqual([]);
  }
  expect(() => validateSocCompletion('CC1.1', {...complete('CC1.1'), [intent]: 'Yes'})).toThrow(/Describe/);
  for (const detail of ['\ufeff Reconcile café / 核对 😀 \u00a0', '\u0085', '\u001c']) {
    const answers = {...complete('CC1.1'), [intent]: 'Yes', [field]: detail}, before = JSON.stringify(answers);
    expect(() => validateSocCompletion('CC1.1', answers)).not.toThrow();
    const result = socGuidedResult('CC1.1', answers);
    expect(result.status).toBe(expected);
    expect(result.signals).toEqual([{questionId: field, kind: field === 'gaps' ? 'gap' : 'verification', text: detail.trim()}]);
    expect(JSON.stringify(answers)).toBe(before);
  }
});

test.each(ids)('%s retained V2 and rollout-1 results remain exact when reported work is affirmative', id => {
  const answers = {...complete(id), additional_gap: 'Yes', gaps: 'Exact retained gap — café.',
    additional_confirmation: 'Yes', unknowns: 'Exact retained confirmation.'};
  const v2 = socGuidedResult(id, answers, version), r1 = socGuidedResult(id, answers, socRolloutCatalog.version);
  expect(v2.status).toBe('addressed');expect(r1.status).toBe('addressed');
  expect({...r1, version: v2.version}).toEqual(v2);
});
