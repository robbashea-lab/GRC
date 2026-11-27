import ig1 from '../../../docs/omni-cis-rollout/ig1-status-cases.json';
import ig2 from '../../../docs/omni-cis-rollout/ig2-status-cases.json';
import ig3 from '../../../docs/omni-cis-rollout/ig3-status-cases.json';
import ig2Review from '../../../docs/omni-cis-rollout/ig2-review.json';
import ig3Review from '../../../docs/omni-cis-rollout/ig3-review.json';
import {catalogForVersion, compatibleInterviewAnswers, generateResult, validateAnswers, versionForSafeguard, visibleQuestions} from './guidedAssessment';
import {omniCisSummary} from './omniCisSummary';

// Expectations are authored from the source/question reviews, not computed by
// the evaluator under test. Hosted writes and browser coverage are separate.
const copy = value => JSON.parse(JSON.stringify(value));
function encodeSourceCase(row) {
  const review = [...ig2Review.rows, ...ig3Review.rows].find(item => item.id === row.safeguard_id);
  // Authored expectations belong to the exact questionnaire reviewed then.
  // V5's different uncertainty and intent contract is checked separately below.
  const version = review.current_question_set_version;
  if (!['cis-v8.1-control1-2','cis-v8.1-program-3'].includes(version)) throw new Error('Unsupported historical review version: ' + version);
  const catalog = catalogForVersion(version), questions = catalog.safeguards[row.safeguard_id], definition = catalog.definitions[row.safeguard_id];
  const answers = {};
  for (const [criterionId, value] of Object.entries(row.criterion_answers)) {
    const atomic = review.atomic_requirements.find(item => item.requirement_id === criterionId);
    if (!atomic) throw new Error('Unmapped source criterion: ' + criterionId);
    const mapping = atomic.answer_mapping;
    if (mapping.type === 'matrix') {
      const question = questions.find(item => item.criterion_ids?.includes(criterionId));
      if (!question) throw new Error('Missing historical criterion question: ' + criterionId);
      const text = question.rows[question.criterion_ids.indexOf(criterionId)];
      answers[question.id] = {...answers[question.id], [text]: value};
    } else {
      const question = questions.find(item => item.id === mapping.field);
      if (!question) throw new Error('Missing historical question: ' + mapping.field);
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
  expect(cases).toHaveLength(4267);
  expect(new Set(cases.map(row => row.safeguard_id)).size).toBe(153);
  expect(new Set(cases.map(row => row.id)).size).toBe(cases.length);
  for (const row of cases) {
    expect(row.source).toMatch(/^https:\/\/(www\.cisecurity\.org|cas\.docs\.cisecurity\.org)\//);
    expect(row.justification).toBeTruthy();
  }
});

// These two source clauses are separately assessable when possible. V5 must
// distinguish genuine partial/absent practice from an unknown remainder.
test.each([
  ['Yes','Yes','addressed',false,false],
  ['Yes','Not sure','not_assessed',false,true],
  ['Partially','Not sure','in_progress',true,true],
  ['No','Not sure','needs_attention',true,true],
  ['No','No','needs_attention',true,true],
])('current 2.4 source clauses %s / %s produce %s without rewriting historical outcomes', (discovery,documentation,status,hasGap,hasUnknown) => {
  const id='2.4',version=versionForSafeguard(id),questions=catalogForVersion(version).safeguards[id],criteria={'2.4-c3':discovery,'2.4-c4':documentation};
  expect(version).toBe('cis-v8.1-program-5');
  expect(questions.filter(q=>q.type==='matrix').flatMap(q=>q.criterion_ids)).toEqual(['2.4-c3','2.4-c4']);
  const answers={practice:'Yes',additional_gap:'No',additional_confirmation:'No'};
  for(const q of questions.filter(q=>q.type==='matrix'))answers[q.id]=Object.fromEntries(q.rows.map((row,index)=>[row,criteria[q.criterion_ids[index]]]));
  const original=copy(answers),result=generateResult(id,answers,new Date('2026-10-09T12:00:00'),version);
  expect(result.status).toBe(status);expect(result.gaps.length>0).toBe(hasGap);
  if(hasUnknown)expect(result.unknowns.length).toBeGreaterThan(0);
  else expect(result.unknowns).toEqual([]);
  if(!hasGap)expect(result.gaps).toEqual([]);
  expect(answers).toEqual(original);
});

test('current optional follow-up text requires explicit intent and preserves known operating facts',()=>{
  const id='8.10',version='cis-v8.1-program-5',question=catalogForVersion(version).safeguards[id].find(q=>q.type==='matrix');
  expect(question.criterion_ids).toEqual(['8.10-c6']);
  const answers={practice:'Yes',[question.id]:Object.fromEntries(question.rows.map(row=>[row,'Yes'])),owner:'Optional owner name is still being checked.',additional_gap:'No',additional_confirmation:'No',gaps:'RETAINED old gap text',unknowns:'RETAINED old confirmation text'};
  expect(generateResult(id,answers,new Date(),version).status).toBe('addressed');
  expect(visibleQuestions(id,answers,version).some(q=>['gaps','unknowns'].includes(q.id))).toBe(false);
  expect(omniCisSummary(id,answers,version,'Current fixture client').result.narrative).not.toContain('RETAINED');
  const gap=generateResult(id,{...answers,additional_gap:'Yes'},new Date(),version);
  expect(gap.status).toBe('in_progress');expect(gap.gaps).toContain('Reviewer-reported gap: '+answers.gaps);
  const unknown=generateResult(id,{...answers,additional_confirmation:'Yes'},new Date(),version);
  expect(unknown.status).toBe('not_assessed');expect(unknown.gaps).toEqual([]);
  expect(unknown.unknowns).toContain('Reviewer-reported uncertainty: '+answers.unknowns);
  expect(answers.gaps).toBe('RETAINED old gap text');expect(answers.unknowns).toBe('RETAINED old confirmation text');
});

test('current 11.1 retires only the unsupported authored backup-procedures supplement and leaves its old record readable',()=>{
  const id='11.1',old='cis-v8.1-program-3',current='cis-v8.1-program-5',criterion='11.1-guided-backup-procedures';
  const oldPack=catalogForVersion(old),nextPack=catalogForVersion(current),oldQuestions=oldPack.safeguards[id];
  const oldQuestion=oldQuestions.find(q=>q.criterion_ids?.includes(criterion));
  expect(oldQuestion.rows).toEqual(['The documented recovery process includes detailed backup procedures.']);
  const answers={practice:'Yes',...Object.fromEntries(oldQuestions.filter(q=>q.type==='matrix').map(q=>[q.id,Object.fromEntries(q.rows.map(row=>[row,'Yes']))]))};
  answers[oldQuestion.id][oldQuestion.rows[0]]='No';
  const original=copy(answers),mapped=compatibleInterviewAnswers(id,answers,old,current);
  expect(oldPack.definitions[id].elements.map(e=>e.id)).toEqual(['11.1-c3','11.1-c4','11.1-c5','11.1-c6','11.1-c7',criterion]);
  expect(nextPack.definitions[id].elements.map(e=>e.id)).toEqual(['11.1-c3','11.1-c4','11.1-c5','11.1-c6','11.1-c7']);
  expect(mapped.requirements_5).toBeUndefined();
  expect(generateResult(id,answers,new Date(),old).status).toBe('in_progress');
  expect(generateResult(id,mapped,new Date(),current).status).toBe('addressed');
  expect(answers).toEqual(original);
  expect(()=>validateAnswers(id,answers,current)).toThrow('Unknown question');
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
