import onboardingCatalog from '@catalogs/onboardingCatalog.json';
import {activeDefinitions, CATALOGS} from '../../lib/frameworks';
import socGuidedCatalog from '@catalogs/guidedSoc2.json';
import {socQuestions, validateSocAnswers, validateSocCompletion, socGuidedResult} from '../../lib/socGuidedAssessment';
import {reviewedProgress} from '../../lib/programProgress';
import {eligible} from '../assignmentEligibility';
import {buildLegacyDemoStore, ids as recordIds} from '../store';
import {baselineRecordVersions, saveBaseline} from '../baseline';
import {frameworkRequest, prepareGuidedContext} from '../frameworks';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {PRESTIGE_CURRENT_AS_OF, PRESTIGE_CURRENT_QUESTION_VERSION, PRESTIGE_CURRENT_CATEGORIES,
  PRESTIGE_CURRENT_ASSESSMENTS, preparePrestigeCurrentAssessment} from './prestigeEightYearContent';

// This immutable authored-V2 fixture also qualifies its original V2 native-onboarding
// contract. Keep that historical current-version context scoped to this test module;
// unpatched rollout defaults and routes are covered by assessmentRolloutVersions.test.js.
jest.mock('../../lib/socGuidedAssessment',()=>({
  ...jest.requireActual('../../lib/socGuidedAssessment'),
  socGuidedCatalog:jest.requireActual('@catalogs/guidedSoc2.json'),
}));

const CLIENT_ID = 'demo_prestige';
const selected = activeDefinitions('soc-2', {categories: PRESTIGE_CURRENT_CATEGORIES});
const ids = selected.map(row => row.id);
const copy = value => JSON.parse(JSON.stringify(value));

test('current content covers exactly the unchanged enrolled 33 Security, 3 Availability and 2 Confidentiality criteria', () => {
  expect(PRESTIGE_CURRENT_CATEGORIES).toEqual(['security', 'availability', 'confidentiality']);
  expect(Object.keys(PRESTIGE_CURRENT_ASSESSMENTS)).toEqual(ids);
  expect(ids).toHaveLength(38);
  expect(Object.fromEntries(PRESTIGE_CURRENT_CATEGORIES.map(category => [category, selected.filter(row => row.category === category).length])))
    .toEqual({security: 33, availability: 3, confidentiality: 2});
  expect(PRESTIGE_CURRENT_QUESTION_VERSION).toBe(socGuidedCatalog.version);
  expect(PRESTIGE_CURRENT_AS_OF).toBe('2026-11-02');
  expect(CATALOGS['soc-2'].requirements).toHaveLength(61);
});

test.each(ids)('%s has explicit supported answers, current ownership and a native result without unresolved signals', id => {
  const facts = PRESTIGE_CURRENT_ASSESSMENTS[id], before = JSON.stringify(facts);
  const prepared = preparePrestigeCurrentAssessment(id);
  const questions = socGuidedCatalog.definitions[id].groups.flatMap(group => group.questions);
  expect(Object.keys(facts.responses)).toEqual(questions.map(question => question.id));
  expect(prepared).toMatchObject({definition_id: id, as_of: PRESTIGE_CURRENT_AS_OF, version: PRESTIGE_CURRENT_QUESTION_VERSION,
    ownership: {owner_id: facts.owner_id, process_owner_id: facts.process_owner_id}, technology: facts.technology});
  for (const question of questions) {
    const response = facts.responses[question.id];
    expect(typeof response.answer).toBe('string');
    if (question.type !== 'text') {
      expect(response.detail.trim().length).toBeGreaterThan(50);
      expect(prepared.answers[question.id + '_detail']).toBe(response.detail);
    }
  }
  for (const answer of Object.values(prepared.answers)) {
    expect(typeof answer).toBe('string');
    expect(answer.length).toBeLessThanOrEqual(2000);
  }
  expect(() => validateSocAnswers(id, prepared.answers, prepared.version)).not.toThrow();
  expect(() => validateSocCompletion(id, prepared.answers, prepared.version)).not.toThrow();
  expect(prepared.answers.additional_gap).toBe('No');
  expect(prepared.answers.additional_confirmation).toBe('No');
  expect(prepared.answers).not.toHaveProperty('gaps');
  expect(prepared.answers).not.toHaveProperty('unknowns');
  expect(prepared.result).toEqual(socGuidedResult(id, prepared.answers, prepared.version, 'Prestige Worldwide'));
  expect(prepared.result).toMatchObject({status: 'addressed', gaps: [], unknowns: [], signals: [], nextSteps: []});
  expect(prepared.result.narrative.length).toBeLessThanOrEqual(20000);
  expect(prepared.result.narrative).toContain('not evidence verification or an auditor opinion');
  expect(prepared.result.answers.map(answer => answer.prompt)).toEqual(socQuestions(id, prepared.answers, prepared.version)
    .filter(question => prepared.answers[question.id]?.trim()).map(question => question.prompt));
  expect(prepared.reported_evidence_subjects.length).toBeGreaterThanOrEqual(2);
  expect(prepared.answers.evidence).toContain('not uploaded or verified Evidence records');
  for (const field of ['framework_assessment_id', 'related_links', 'assessment_history', 'guided_assessment_source',
    'generated_at', 'revision', 'by', 'assessment_recorded_at', 'verification', 'soc_assessment_checks', 'management_controls'])
    expect(prepared).not.toHaveProperty(field);
  expect(JSON.stringify(facts)).toBe(before);
});

test.each(ids)('%s keeps negative and uncertain answers subject to the native evaluator', id => {
  const {answers, version} = preparePrestigeCurrentAssessment(id);
  const question = socQuestions(id, answers, version).find(row => row.type === 'select' && !row.optional);
  for (const [answer, expected] of [['No', 'needs_attention'], ['Partially', 'in_progress'], ['Not sure', 'not_assessed']]) {
    const changed = {...answers, [question.id]: answer};
    validateSocCompletion(id, changed, version);
    const result = socGuidedResult(id, changed, version);
    expect(result.status).toBe(expected);
    expect(result.signals.some(signal => signal.questionId === question.id)).toBe(true);
  }
  const missing = {...answers}; delete missing[question.id];
  expect(() => validateSocCompletion(id, missing, version)).toThrow(/Answer each applicable/);
  expect(() => validateSocAnswers(id, {...answers, [question.id]: 'Not applicable'}, version)).toThrow(/Invalid SOC interview answer/);
});

test('a reported extra gap can coexist with native addressed status and must not be mistaken for clean current facts', () => {
  const {answers, version} = preparePrestigeCurrentAssessment('CC1.1');
  const changed = {...answers, additional_gap: 'Yes', gaps: 'A current material conduct-handling gap remains.'};
  validateSocCompletion('CC1.1', changed, version);
  const result = socGuidedResult('CC1.1', changed, version);
  expect(result.status).toBe('addressed');
  expect(result.gaps).toContain(changed.gaps);
  expect(result.signals).toContainEqual({questionId: 'gaps', kind: 'gap', text: changed.gaps});
  expect(() => validateSocCompletion('CC1.1', {...changed, gaps: ''}, version)).toThrow(/Describe the additional/);
});

test.each(['PI1.1', 'P1.1', 'CC0.0', '__proto__', 'toString', '', null, undefined])('rejects out-of-scope or invalid content lookup %s', id => {
  expect(() => preparePrestigeCurrentAssessment(id)).toThrow(/38 selected SOC criteria/);
});

test('preparation has independent return values and does not create records, approvals, dates or application state', () => {
  const before = JSON.stringify(PRESTIGE_CURRENT_ASSESSMENTS);
  const prepared = preparePrestigeCurrentAssessment('CC8.1');
  prepared.answers['CC8.1-approve'] = 'No';
  prepared.ownership.owner_id = 'unrelated';
  prepared.reported_evidence_subjects.push('uninstalled subject');
  prepared.result.answers[0].answer = 'Changed copy';
  expect(JSON.stringify(PRESTIGE_CURRENT_ASSESSMENTS)).toBe(before);
  const again = preparePrestigeCurrentAssessment('CC8.1');
  expect(again.answers['CC8.1-approve']).toBe('Yes');
  expect(again.ownership.owner_id).toBe('demo_prestige_user_2');
  expect(again.reported_evidence_subjects).not.toContain('uninstalled subject');
  expect(again.result.answers[0].answer).not.toBe('Changed copy');
});

test('native reviewed progress derives 100 percent from the 38 evaluated results, without an N/A or denominator override', () => {
  const rows = ids.map(id => ({definition_id: id, status: preparePrestigeCurrentAssessment(id).result.status}));
  expect(reviewedProgress(rows, 'soc-2')).toEqual({total: 38, resolved: 38, valid_na: 0, invalid_na: 0, percent: 100});
  rows[0].status = 'in_progress';
  expect(reviewedProgress(rows, 'soc-2')).toMatchObject({total: 38, resolved: 37, percent: 97});
});

test('all authored answers pass the actual native interview and assessment services using retained identities and trusted lineage', async () => {
  // Controlled source fixture only: no visitor storage or actual Browser onboarding.
  const clock = new Date('2026-11-02T12:00:00.000Z');
  const source = buildLegacyDemoStore(clock), sourceBefore = JSON.stringify(source);
  const {db} = preparePrestigeNativeOnboarding(source, {clock, purpose: 'native_onboarding_qa'});
  const baseline = {version: 3, step: 3, selected_policy_keys: [], policies: {}, reviews: [], framework_reviews: {},
    requirements: Object.fromEntries(onboardingCatalog.requirements.map(item => [item.key, item.key === 'soc-2' ? 'applies' : 'does_not_apply']))};
  saveBaseline(db, CLIENT_ID, baseline, true, {expected_updated_at: null, expected_records: baselineRecordVersions(db, CLIENT_ID)});
  db.user = db.users.find(user => user.user_id === 'demo_prestige_user_0');
  const usersBefore = copy(db.users), contactsBefore = copy(db.contacts);
  const foreignBefore = copy(db.framework_assessments.filter(row => row.client_id !== CLIENT_ID));
  const rows = db.framework_assessments.filter(row => row.client_id === CLIENT_ID);
  expect(rows.map(row => row.definition_id)).toEqual(ids);
  const nativeIds = rows.map(row => row.framework_assessment_id);
  for (const row of rows) {
    const prepared = preparePrestigeCurrentAssessment(row.definition_id), path = '/framework_assessments/' + row.framework_assessment_id;
    const owner = db.users.find(user => user.user_id === prepared.ownership.owner_id);
    expect(eligible(owner, CLIENT_ID)).toBe(true);
    expect(db.contacts.some(contact => contact.contact_id === prepared.ownership.process_owner_id && contact.client_id === CLIENT_ID)).toBe(true);
    frameworkRequest(db, path, 'patch', {}, {...prepared.ownership, technology: prepared.technology, notes: prepared.notes,
      expected_last_assessed: row.last_saved ?? row.last_assessed ?? null});
    const context = await prepareGuidedContext(db, path + '/guided-assessment', 'get', {});
    const initial = frameworkRequest(db, path + '/guided-assessment', 'get', {}, {}, context);
    expect(initial.version).toBe(prepared.version);
    const draft = frameworkRequest(db, path + '/guided-assessment', 'put', {}, {version: prepared.version,
      answers: prepared.answers, narrative: prepared.result.narrative, result: prepared.result,
      summary_review: {version: prepared.version, answers: prepared.answers}, completed: true, step: 0,
      expected_revision: initial.revision, base_assessment_token: initial.current_assessment_token,
      base_scope_fingerprint: initial.current_scope_fingerprint}, context);
    expect(row.status).toBe('not_assessed');
    const saved = frameworkRequest(db, path, 'patch', {}, {implementation: draft.narrative, status: draft.result.status,
      record_assessment: true, expected_last_assessed: row.last_saved ?? row.last_assessed ?? null,
      guided_assessment_source: {version: draft.version, revision: draft.revision, generated_at: draft.generated_at}}, context);
    expect(saved).toMatchObject({status: 'addressed', implementation: prepared.result.narrative,
      owner_id: prepared.ownership.owner_id, process_owner_id: prepared.ownership.process_owner_id,
      assessment_recorded_by: 'demo_prestige_user_0'});
    expect(saved.guided_assessment_source.answers).toEqual(prepared.answers);
    expect(saved.guided_assessment_source.by).toBe('demo_prestige_user_0');
    expect(saved.assessment_history.at(-1).guided_assessment_source.answers).toEqual(prepared.answers);
    expect(saved.related_links.every(link => db[link.kind]?.some(target => target[recordIds[link.kind]] === link.id))).toBe(true);
    expect(saved).not.toHaveProperty('soc_assessment_checks');
    expect(saved).not.toHaveProperty('verification');
  }
  expect(rows.map(row => row.framework_assessment_id)).toEqual(nativeIds);
  expect(reviewedProgress(rows, 'soc-2')).toEqual({total: 38, resolved: 38, valid_na: 0, invalid_na: 0, percent: 100});
  expect(db.framework_assessments.filter(row => row.client_id !== CLIENT_ID)).toEqual(foreignBefore);
  expect(db.users).toEqual(usersBefore);
  expect(db.contacts).toEqual(contactsBefore);
  expect(db.users.some(user => ['Derek Huff', 'Alice Huff'].includes(user.name))).toBe(false);
  expect(JSON.stringify(source)).toBe(sourceBefore);
});
