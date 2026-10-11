import nativeCatalog from '@catalogs/soc2.json';
import {socGuidedCatalog, socGuidedEnabled, socQuestions, socGroups, validateSocAnswers, validateSocCompletion, socGuidedResult} from './socGuidedAssessment';

const ids = Object.keys(socGuidedCatalog.definitions);
const version = 'soc2-omni-1';
const allQuestions = id => socGuidedCatalog.definitions[id].groups.flatMap(group => group.questions);
const complete = id => Object.fromEntries(allQuestions(id).map(question => [question.id, question.type === 'text' ? '' : question.type === 'context' ? 'Relevant' : 'Yes']));
const firstPractice = id => allQuestions(id).find(question => !['text', 'context'].includes(question.type));

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
    expect(result.status).toBe('in_progress');
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

test.each(ids)('%s treats neutral freeform gaps and optional-name uncertainty as reported context only', id => {
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
      expect(result.narrative).toContain('Additional reported context');
      Object.values(context).forEach(prose => {
        expect(result.narrative).toContain(prose);
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
  expect(result.status).toBe(context === 'Not sure' ? 'in_progress' : 'addressed');
  expect(result.narrative).not.toContain('Retained conditional consent gap');
  expect(result.signals.some(signal => signal.questionId === 'P6.1-consent')).toBe(false);
  expect(JSON.stringify(answers)).toBe(before);
  expect(socGroups('P6.1', {...answers, 'P6.1-disclosure-context': 'Relevant'}).some(group => group.id === 'consent')).toBe(true);
  expect(socGuidedResult('P6.1', {...answers, 'P6.1-disclosure-context': 'Relevant'}).status).toBe('needs_attention');
});
