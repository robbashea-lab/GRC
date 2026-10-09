import ig1 from '../../../docs/omni-cis-rollout/ig1-status-cases.json';
import ig2 from '../../../docs/omni-cis-rollout/ig2-status-cases.json';
import ig3 from '../../../docs/omni-cis-rollout/ig3-status-cases.json';
import ig2Review from '../../../docs/omni-cis-rollout/ig2-review.json';
import ig3Review from '../../../docs/omni-cis-rollout/ig3-review.json';
import {catalogForVersion, generateResult, validateAnswers, versionForSafeguard} from './guidedAssessment';
import {omniCisSummary} from './omniCisSummary';

// Expectations are authored from the source/question reviews, not computed by
// the evaluator under test. Hosted writes and browser coverage are separate.
const copy = value => JSON.parse(JSON.stringify(value));
function encodeSourceCase(row) {
  const version = versionForSafeguard(row.safeguard_id), catalog = catalogForVersion(version);
  const questions = catalog.safeguards[row.safeguard_id], definition = catalog.definitions[row.safeguard_id];
  const review = [...ig2Review.rows, ...ig3Review.rows].find(item => item.id === row.safeguard_id);
  const answers = {};
  for (const [criterionId, value] of Object.entries(row.criterion_answers)) {
    const atomic = review.atomic_requirements.find(item => item.requirement_id === criterionId);
    if (!atomic) throw new Error('Unmapped source criterion: ' + criterionId);
    const mapping = atomic.answer_mapping;
    if (mapping.type === 'matrix') {
      const question = questions.find(item => item.criterion_ids?.includes(criterionId));
      if (!question) throw new Error('Missing current criterion question: ' + criterionId);
      const text = question.rows[question.criterion_ids.indexOf(criterionId)];
      answers[question.id] = {...answers[question.id], [text]: value};
    } else {
      const question = questions.find(item => item.id === mapping.field);
      if (!question) throw new Error('Missing current question: ' + mapping.field);
      answers[question.id] = question.choices.includes(value) ? value : value === 'Yes'
        ? mapping.accepted[0] : ['No', 'Partially'].includes(value) ? mapping.affirmed_deficient[0] : value;
    }
  }
  if (definition.root === 'practice' && Object.keys(row.criterion_answers).length) answers.practice = 'Yes';
  if (row.aggregate_answer != null) answers[definition.root] = row.aggregate_answer;
  if (row.root_answer != null) answers[definition.root] = row.root_answer;
  for (const [key, value] of Object.entries(row.optional_context || {})) {
    const field = key === 'context' && !questions.some(item => item.id === key) ? 'operation' : key;
    if (!questions.some(item => item.id === field)) throw new Error('Missing optional field: ' + field);
    answers[field] = value;
  }
  if (row.scope_rationale) answers.scope_reason = row.scope_rationale;
  if (row.reported_gap) answers.gaps = row.reported_gap;
  if (row.reported_unknown) answers.unknowns = row.reported_unknown;
  return {...row, answers, version, today:'2026-10-09', expected_status:row.expected_native_state,
    expected_error:row.expected_status === 'rejected' ? 'Invalid selection' : undefined,
    source:review.source.cas, justification:row.source_reason};
}
const cases = [...ig1.cases, ...ig2.cases.map(encodeSourceCase), ...ig3.cases.map(encodeSourceCase)];
beforeAll(() => {jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-09T12:00:00'));});
afterAll(() => jest.useRealTimers());

test('the reviewed fixtures cover each unique CIS safeguard without group copies', () => {
  expect(new Set(cases.map(row => row.safeguard_id)).size).toBe(153);
  expect(new Set(cases.map(row => row.id)).size).toBe(cases.length);
  for (const row of cases) {
    expect(row.source).toMatch(/^https:\/\/(www\.cisecurity\.org|cas\.docs\.cisecurity\.org)\//);
    expect(row.justification).toBeTruthy();
  }
});

test.each(cases)('$id: source-derived status and complete client-specific write-up', row => {
  const answers = copy(row.answers), before = JSON.stringify(answers);
  if (row.expected_error) {
    expect(() => validateAnswers(row.safeguard_id, answers, row.version)).toThrow();
    return;
  }
  validateAnswers(row.safeguard_id, answers, row.version);
  const result = generateResult(row.safeguard_id, answers, new Date(row.today + 'T12:00:00'), row.version);
  expect(result.status).toBe(row.expected_status);
  expect(result.verification).toBeUndefined();
  if (row.expected_gap) expect(result.gaps.length).toBeGreaterThan(0);
  if (row.expected_confirmation) expect(result.unknowns.length).toBeGreaterThan(0);
  if (row.expected_gap_from_affected_answer === false) expect(result.gaps).toEqual([]);
  const summary = omniCisSummary(row.safeguard_id, answers, row.version, 'Source-review fixture client');
  expect(summary.result.narrative).toContain('Source-review fixture client');
  for (const heading of ['OVERVIEW', 'IMPLEMENTATION BREAKDOWN', 'ITEMS TO ADDRESS']) {
    expect(summary.result.narrative.split(heading)).toHaveLength(2);
  }
  expect(summary.result.narrative).toContain('\n\n');
  expect(summary.result.narrative).not.toContain('Brawndo');
  expect(summary.result.narrative).not.toContain('Not recorded');
  expect(JSON.stringify(answers)).toBe(before);
});
