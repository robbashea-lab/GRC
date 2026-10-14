import revised from '@catalogs/guidedControl1V3.json';
import handling from '@catalogs/guidedControl1V4.json';
import current from '@catalogs/guidedControl1V5.json';
import original from '@catalogs/guidedControl1.json';
import legacy from '@catalogs/guidedAssessmentPilot.json';
import cis from '@catalogs/cisIG1.json';
import changes from '@catalogs/guidedCisChanges.json';
import {catalogForVersion, generateResult, validateAnswers, versionForSafeguard} from './guidedAssessment';

const today = new Date(2026, 9, 7);
const complete = version => Object.fromEntries(catalogForVersion(version).safeguards['1.1'].map(q => [q.id,
  q.type === 'matrix' ? Object.fromEntries(q.rows.map(row => [row, 'Yes']))
    : q.type === 'text' ? ''
    : q.type === 'date' ? '2026-09-01'
    : q.id === 'frequency' ? 'Every six months'
    : q.id === 'sources' ? 'One source' : 'Yes']));

test('current Control 1 defaults use v5 while all historical catalogs remain readable', () => {
  expect(revised.version).toBe('cis-v8.1-control1-3');
  expect(Object.keys(revised.definitions)).toEqual(['1.1']);
  expect(Object.keys(revised.safeguards)).toEqual(['1.1']);
  expect(revised.definitions['1.1']).toEqual(original.definitions['1.1']);
  expect(versionForSafeguard('1.1')).toBe(current.version);
  expect(versionForSafeguard('1.1', false)).toBe(original.version);
  expect(versionForSafeguard('1.1', true)).toBe(current.version);
  expect(handling.version).toBe('cis-v8.1-control1-4');
  expect(versionForSafeguard('1.2')).toBe(current.version);
  expect(versionForSafeguard('1.2', true)).toBe(current.version);
  expect(versionForSafeguard('1.2', false)).toBe(original.version);
  for (const id of ['1.3', '1.4', '1.5']) {
    expect(versionForSafeguard(id)).toBe(current.version);
    expect(versionForSafeguard(id, true)).toBe(current.version);
    expect(versionForSafeguard(id, false)).toBe(original.version);
  }
  expect(cis.requirements.find(r => r.id === '1.1').implementation_group).toBe(1);
});

const completeCurrent = id => Object.fromEntries(current.safeguards[id].map(q => [q.id,
  q.optional ? 'No' : q.type === 'matrix' ? Object.fromEntries(q.rows.map(row => [row, 'Yes']))
    : q.type === 'text' ? '' : q.type === 'date' ? '2026-09-01'
    : q.type === 'multi' ? ['Quarantine or isolate']
    : q.id === 'frequency' ? (id === '1.1' ? 'Every six months' : id === '1.3' ? 'Daily' : 'Weekly')
    : q.id === 'sources' ? 'One source' : q.id === 'unresolved' ? 'No'
    : q.choices.includes('Yes') ? 'Yes' : q.choices[0]]));

test.each(['1.1', '1.2', '1.3', '1.4', '1.5'])('%s v5 distinguishes unknown mandatory cadence from known deficiencies and optional context', id => {
  const answers = completeCurrent(id), root = current.definitions[id].root;
  expect(generateResult(id, answers, today, current.version).status).toBe('addressed');
  const unknown = {...answers, frequency: 'Not sure'};
  expect(generateResult(id, unknown, today, current.version).status).toBe('not_assessed');
  expect(generateResult(id, {...unknown, [root]: 'No'}, today, current.version).status).toBe('needs_attention');
  expect(generateResult(id, {...unknown, [root]: 'Partially'}, today, current.version).status).toBe('in_progress');
  const knownPartial = id === '1.2' ? {...unknown, actions:['None']} : {...unknown, coverage: id === '1.1' ? {...unknown.coverage, Servers:'Partially'} : 'Partially'};
  expect(generateResult(id, knownPartial, today, current.version).status).toBe('in_progress');
  const staleOptional = {...answers, gaps: 'No gaps', unknowns: 'None', additional_gap: 'No', additional_confirmation: 'No'};
  const output = generateResult(id, staleOptional, today, current.version);
  expect(output.status).toBe('addressed');
  expect(output.gaps).toEqual([]); expect(output.unknowns).toEqual([]);
  expect(generateResult(id, {...staleOptional, additional_gap:'Not sure', additional_confirmation:'Not sure'}, today, current.version).status).toBe('addressed');
  const gap = 'A mandatory component is confirmed missing.';
  expect(generateResult(id, {...answers, additional_gap: 'Yes', gaps: gap}, today, current.version)).toMatchObject({status: 'in_progress'});
  expect(generateResult(id, {...answers, additional_confirmation: 'Yes', unknowns: 'Mandatory coverage is not confirmed.'}, today, current.version).status).toBe('not_assessed');
  const oldVersion = id === '1.1' ? revised.version : id === '1.2' ? handling.version : original.version;
  const oldAnswers = Object.fromEntries(Object.entries(unknown).filter(([key]) => !['additional_gap', 'additional_confirmation'].includes(key)));
  expect(generateResult(id, oldAnswers, today, oldVersion).status).toBe('in_progress');
});

test('the new 1.1 attribute schema rejects exclusions of every mandatory attribute', () => {
  const question = revised.safeguards['1.1'].find(q => q.id === 'attributes');
  const answers = complete(revised.version);
  expect(generateResult('1.1', answers, today, revised.version).status).toBe('addressed');
  for (const row of ['Hardware address', 'Machine name', 'Asset owner', 'Department', 'Approved to connect']) {
    expect(question.row_choices[row]).not.toContain('Not applicable');
    const invalid = {...answers, attributes: {...answers.attributes, [row]: 'Not applicable'}, scope_reason: 'A general exclusion cannot waive this required field.'};
    expect(() => validateAnswers('1.1', invalid, revised.version)).toThrow();
  }
});

test('static-address exclusions still require rationale and never verify implementation', () => {
  const answers = complete(revised.version);
  answers.attributes['Static network address where applicable'] = 'Not applicable';
  expect(validateAnswers('1.1', answers, revised.version)).toBe(answers);
  expect(generateResult('1.1', answers, today, revised.version).status).toBe('in_progress');
  answers.scope_reason = 'The scoped devices have no static addresses, confirmed against current configuration.';
  const result = generateResult('1.1', answers, today, revised.version);
  expect(result.status).toBe('addressed');
  expect(result.verification).toBeUndefined();
});

test.each([legacy.version, original.version])('historical %s keeps its exact attribute answers and original choices', version => {
  const oldQuestion = catalogForVersion(version).safeguards['1.1'].find(q => q.id === 'attributes');
  expect(oldQuestion.prompt).toBe('Confirm the inventory records these details for applicable assets.');
  expect(oldQuestion).not.toHaveProperty('row_choices');
  expect(oldQuestion.choices).toContain('Not applicable');
  const answers = complete(version);
  answers.attributes['Asset owner'] = 'Not applicable';
  answers.scope_reason = 'Historical answer retained under its original question version.';
  const before = JSON.stringify(answers);
  expect(validateAnswers('1.1', answers, version)).toBe(answers);
  expect(generateResult('1.1', answers, today, version).version).toBe(version);
  expect(JSON.stringify(answers)).toBe(before);
});

test('all 153 canonical safeguards have distinct reviewed change questions with stable references', () => {
  expect(Object.keys(changes.safeguards)).toEqual(cis.requirements.map(r => r.id));
  expect(new Set(Object.values(changes.safeguards).map(q => q.prompt)).size).toBe(153);
  for (const requirement of cis.requirements) {
    const question = changes.safeguards[requirement.id];
    expect(question.question_id).toBe(requirement.id + ':change_review');
    expect(question.prompt.endsWith('?')).toBe(true);
    expect(question).not.toHaveProperty('groups');
  }
  expect(changes.safeguards['1.3'].prompt).toContain('daily execution schedule');
  expect(changes.safeguards['1.4'].prompt).toContain('weekly review-and-update timing');
  expect(changes.safeguards['7.5'].prompt).toContain('authenticated/unauthenticated coverage');
  expect(changes.choices).toEqual(['No changes reported', 'Changes to review', 'Not sure']);
});
