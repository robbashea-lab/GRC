import * as store from '../store';
import * as uuid from '../../lib/recordUuid';
import {stable} from '../commandRequests';
import {reviewSchedule} from '../../lib/reviewOccurrences';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {createPrestigeCurrentModel} from './prestigeCurrentModel';
import {createPrestigeEightYearHistory} from './prestigeEightYearHistory';
import {PRESTIGE_VENDOR_FACTS, PRESTIGE_AI_FACTS} from './prestigeEightYearRegisters';

const CID = 'demo_prestige', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const MARKER = 'prestige_eight_year_history_fixture';
const options = {clock: CLOCK, purpose: 'eight_year_history_source_qa'};
const copy = value => JSON.parse(JSON.stringify(value));
const own = (db, kind) => db[kind].filter(row => row.client_id === CID);
const row = (result, kind, key, id) => result.db[kind].find(item => item[key] === id);
async function digest(value) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
let current, history, before;
beforeAll(async () => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', {value: require('crypto').webcrypto, configurable: true});
  const source = store.buildLegacyDemoStore(CLOCK);
  source.logs.push({log_id: 'history-foreign-log', client_id: 'demo_dunder', action: 'retained', meta: {original: ['unchanged']}});
  source.riskSequences = {...source.riskSequences, demo_foreign: 83};
  const prepared = preparePrestigeNativeOnboarding(source, {clock: CLOCK, purpose: 'native_onboarding_qa'});
  current = await createPrestigeCurrentModel(prepared,
    {clock: CLOCK, purpose: 'current_model_source_qa', expected_source_sha256: await digest(prepared.backup)});
  before = JSON.stringify(current);
  history = await createPrestigeEightYearHistory(current, options);
});
afterEach(() => jest.restoreAllMocks());

test('isolates the transaction and preserves the complete original backup and upstream receipts', () => {
  expect(JSON.stringify(current)).toBe(before);
  expect(history.backup).toEqual(current.backup);
  expect(history.backup).not.toBe(current.backup);
  expect(history.manifest).toEqual(current.manifest);
  for (const marker of ['prestige_current_model_fixture', 'prestige_current_governance_fixture', 'prestige_current_register_fixture'])
    expect(history.db[marker]).toEqual(current.db[marker]);
  expect(history.historyManifest).toEqual(history.db[MARKER]);
  expect(history.historyManifest.provenance).toBe('newly_authored_synthetic_history');
});

test('preserves every unrelated database field and every foreign row without normalizing foreign risk IDs', () => {
  const changed = new Set(['reviews', 'policies', 'risks', 'framework_assessments', 'findings', 'tasks', 'logs', 'riskSequences', MARKER]);
  for (const key of Object.keys(current.db)) {
    if (!changed.has(key)) expect(history.db[key]).toEqual(current.db[key]);
    if (Array.isArray(current.db[key])) expect(history.db[key].filter(item => item?.client_id !== CID))
      .toEqual(current.db[key].filter(item => item?.client_id !== CID));
  }
  const foreignSequences = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== CID));
  expect(foreignSequences(history.db.riskSequences)).toEqual(foreignSequences(current.db.riskSequences));
});

test('retains current row fields and actual native command history verbatim', () => {
  for (const [kind, field, additions] of [['policies', 'policy_id', ['approval_history']],
    ['reviews', 'review_id', ['occurrences']], ['framework_assessments', 'framework_assessment_id', ['assessment_history']],
    ['risks', 'risk_id', ['related_links', 'decision_history', 'rating_history']]]) {
    for (const original of own(current.db, kind)) {
      const actual = row(history, kind, field, original[field]);
      for (const key of Object.keys(original).filter(key => !additions.includes(key))) expect(actual[key]).toEqual(original[key]);
      for (const key of additions) if (original[key]?.length) expect(actual[key].slice(-original[key].length)).toEqual(original[key]);
    }
  }
});

test('creates six real same-client chains with distinct failure, correction, validation and closure', () => {
  expect(Object.keys(history.historyManifest.chains)).toEqual([
    'SHARED-ACCESS', 'CONTRACTOR-REMOVAL', 'RECOVERY-DEPENDENCY', 'MIGRATION-ROLE', 'RETENTION', 'INDEX-RECOVERY']);
  const generated = [];
  for (const [key, chain] of Object.entries(history.historyManifest.chains)) {
    const finding = row(history, 'findings', 'finding_id', chain.finding_id);
    const task = row(history, 'tasks', 'task_id', chain.task_id);
    const review = row(history, 'reviews', 'review_id', chain.review_id);
    const occurrence = review.occurrences.find(item => item.occurrence_id === chain.occurrence_id);
    const validation = row(history, 'reviews', 'review_id', chain.validation_review_id);
    for (const record of [finding, task, review, validation, row(history, 'risks', 'risk_id', chain.risk_id),
      row(history, 'framework_assessments', 'framework_assessment_id', chain.framework_assessment_id)]) expect(record.client_id).toBe(CID);
    expect(task.finding_id).toBe(finding.finding_id);
    expect(finding.primary_task_id).toBe(task.task_id);
    expect(task.risk_id).toBe(chain.risk_id);
    expect(occurrence.outcome).toBe('findings_raised');
    expect(occurrence.conclusion).toMatch(/^Failed:/);
    expect(occurrence.notes).toBe(finding.description);
    expect(occurrence.finding_count).toBe(1);
    expect(chain.failure < chain.action_due).toBe(true);
    expect(chain.action_due <= chain.action_completed).toBe(true);
    expect(chain.action_completed < chain.validation).toBe(true);
    expect(chain.validation < chain.finding_closed).toBe(true);
    expect(task.completed_at).toBe(chain.action_completed);
    expect(finding.validated_at).toBe(chain.validation);
    expect(finding.closed_at).toBe(chain.finding_closed);
    expect(validation.occurrences[0].completed_at).toBe(chain.validation);
    expect(finding.recorded_at).toBe(chain.recorded_at);
    const risk = row(history, 'risks', 'risk_id', chain.risk_id);
    const impact = ['MIGRATION-ROLE', 'INDEX-RECOVERY'].includes(key) ? 5 : 4;
    expect(risk.rating_history[0]).toMatchObject({at: chain.failure, new_likelihood: 4, new_impact: impact});
    expect(risk.rating_history[1]).toMatchObject({at: chain.validation, new_likelihood: 2, new_impact: impact, prev_score: 4 * impact});
    expect(occurrence.risk_before).toMatchObject({likelihood_score: 4, impact_score: impact, risk_score: 4 * impact,
      acceptance_date: null, acceptance_rationale: null, accepted_by: null, acceptance_expires_at: null});
    expect(validation.occurrences[0].risk_before.likelihood_score).toBe(4);
    expect(validation.occurrences[0].risk_after.likelihood_score).toBe(2);
    expect(review.historical_risk_id).toBe(chain.risk_id);
    expect(review).not.toHaveProperty('risk_id');
    generated.push(chain.finding_id, chain.task_id, chain.review_id, chain.occurrence_id,
      chain.validation_review_id, chain.validation_occurrence_id);
  }
  expect(new Set(generated).size).toBe(generated.length);
});

test('keeps the 2021 recovery failure separate from the 2023 platform index failure and preserves the native risk counter', () => {
  const chains = history.historyManifest.chains;
  const historical = row(history, 'risks', 'risk_id', chains['RECOVERY-DEPENDENCY'].risk_id);
  expect(historical.risk_id).not.toBe(chains['INDEX-RECOVERY'].risk_id);
  expect(historical.created_at).toBe(chains['RECOVERY-DEPENDENCY'].failure);
  expect(historical.closed_at).toBe(chains['RECOVERY-DEPENDENCY'].finding_closed);
  expect(own(history.db, 'risks')).toHaveLength(31);
  const displayIds = own(history.db, 'risks').map(item => item.display_id);
  expect(new Set(displayIds).size).toBe(displayIds.length);
  expect(Number(historical.display_id.slice(5))).toBe(history.db.riskSequences[CID]);
  expect(history.db.riskSequences[CID]).toBe(current.db.riskSequences[CID] + 1);
  expect(history.historyManifest.milestones['recovery-discipline'].outcome).toContain('2022');
  expect(historical.closure_reason).toBe('remediated');
});

test('keeps original due dates and native calendar recurrence even when completion is late', () => {
  const riskReview = row(history, 'reviews', 'review_id', current.manifest.review_ids['soc-risk-assessment']);
  const late = riskReview.occurrences.find(item => item.due_date === '2023-10-22');
  expect(late.completed_at).toBe('2024-01-19T12:00:00.000Z');
  expect(late.next_review_date.slice(0, 10)).toBe('2024-10-22');
  expect(late.next_review_date).toBe(reviewSchedule({...riskReview, due_date: late.due_date, recurrence_due_date: null}).next_review_date);
  for (const parent of own(history.db, 'reviews')) for (const occurrence of parent.occurrences || []) {
    if (occurrence.provenance !== 'newly_authored_synthetic_history') continue;
    expect(occurrence.due_date >= '2018-11-02').toBe(true);
    expect(occurrence.completed_at.slice(0, 10) >= occurrence.due_date).toBe(true);
    expect(occurrence.completed_at.slice(0, 10) <= '2026-11-02').toBe(true);
    expect(occurrence.completed_at <= history.historyManifest.anchor).toBe(true);
    expect(occurrence.evidence).toEqual([]);
  }
});

test('does not complete a supplier or AI review before adoption, after retirement, or before product availability', () => {
  for (const original of own(current.db, 'reviews')) {
    const actual = row(history, 'reviews', 'review_id', original.review_id);
    const vendor = PRESTIGE_VENDOR_FACTS.find(fact => current.manifest.vendor_ids[fact.key] === original.vendor_id);
    const ai = PRESTIGE_AI_FACTS.find(fact => current.manifest.ai_ids[fact.key] === original.ai_system_id
      || current.manifest.risk_ids[fact.riskKey] === original.risk_id);
    for (const occurrence of (actual.occurrences || []).filter(item => item.provenance === 'newly_authored_synthetic_history')) {
      if (vendor) {
        expect(occurrence.due_date >= vendor.adopted).toBe(true);
        if (vendor.inactiveSince) expect(occurrence.completed_at.slice(0, 10) <= vendor.inactiveSince).toBe(true);
      }
      if (ai) {
        expect(occurrence.due_date >= ai.adopted).toBe(true);
        expect(occurrence.due_date >= ai.availableSince).toBe(true);
      }
    }
  }
  expect(history.db.ai_systems).toEqual(current.db.ai_systems);
  expect(history.db.vendors).toEqual(current.db.vendors);
});

test('retains immutable historical subjects, separate approval and review, and unknown 2022 versions', () => {
  const subjects = history.historyManifest.policy_subjects;
  expect(subjects['policy-information-security-policy'][0].version).toBe('1');
  expect(subjects['policy-information-security-policy'][0].effective_at).toBe('2018-11-02T12:00:00.000Z');
  for (const versions of Object.values(subjects)) {
    expect(new Set(versions.map(item => item.version)).size).toBe(versions.length);
    for (const subject of versions) {
      expect(subject.basis).not.toHaveProperty('evidence_id');
      const review = own(history.db, 'reviews').find(item => item.policy_subject?.subject_id === subject.subject_id);
      expect(review.completion_date > subject.effective_at).toBe(true);
      expect(review.policy_subject).toEqual(subject);
    }
  }
  expect(history.historyManifest.unknown_historical_policy_details.find(item => item.year === 2022))
    .toMatchObject({version: null, date: null, document_reference: null});
  const mutable = copy(history), first = mutable.historyManifest.policy_subjects['policy-information-security-policy'][0];
  const snapshot = JSON.stringify(first);
  row(mutable, 'policies', 'policy_id', first.policy_id).summary = 'Later current edit';
  expect(JSON.stringify(first)).toBe(snapshot);
});

test('adds era-labelled assessment positions without copying current guided answers or modifying current fields', () => {
  for (const original of own(current.db, 'framework_assessments')) {
    const actual = row(history, 'framework_assessments', 'framework_assessment_id', original.framework_assessment_id);
    const positions = actual.assessment_history.filter(item => item.historical_position);
    expect(positions).toHaveLength(8);
    expect(positions.map(item => item.at)).toEqual([...positions.map(item => item.at)].sort());
    expect(actual.assessment_history.slice(-original.assessment_history.length)).toEqual(original.assessment_history);
    for (const position of positions) {
      expect(position).not.toHaveProperty('guided_assessment_source');
      expect(position).not.toHaveProperty('answers');
      expect(position.notes).toContain('2017 Trust Services Criteria');
      expect(position.recorded_at).toBe(history.historyManifest.recorded_at);
    }
    expect(actual.guided_assessment_source).toEqual(original.guided_assessment_source);
    expect(actual.assessment_recorded_at).toBe(original.assessment_recorded_at);
    expect(actual.assessment_recorded_by).toBe(original.assessment_recorded_by);
  }
});

test('derives a rising historical implementation path and a real platform setback from native criterion records', () => {
  const positionsAt = day => own(history.db, 'framework_assessments').map(item =>
    item.assessment_history.find(position => position.historical_position && position.at.slice(0, 10) === day));
  const implementedAt = day => positionsAt(day).filter(item => item.status === 'addressed').length;
  const days = ['2018-11-02', '2019-10-18', '2020-10-23', '2021-10-22', '2022-10-21'];
  const counts = days.map(implementedAt);
  expect(counts[0]).toBeGreaterThan(0);
  for (let index = 1; index < counts.length; index++) expect(counts[index]).toBeGreaterThan(counts[index - 1]);
  expect(counts[counts.length - 1]).toBe(own(current.db, 'framework_assessments').length);
  expect(implementedAt('2023-11-17')).toBeLessThan(implementedAt('2022-10-21'));
  for (const definition of history.historyManifest.platform_setback_criteria) {
    const assessment = row(history, 'framework_assessments', 'framework_assessment_id', current.manifest.assessment_ids[definition]);
    expect(assessment.assessment_history.find(item => item.at.slice(0, 10) === '2023-11-17'))
      .toMatchObject({historical_position: true, status: 'needs_attention'});
    expect(assessment.assessment_history.find(item => item.at.slice(0, 10) === '2024-10-18'))
      .toMatchObject({historical_position: true, status: 'addressed'});
  }
  expect(implementedAt('2024-10-18')).toBe(38);
  expect(implementedAt('2025-10-17')).toBe(38);
});

test('keeps the unchanged 2017 criteria distinct from later Points of Focus adoption and current questions', () => {
  for (const assessment of own(history.db, 'framework_assessments')) for (const position of assessment.assessment_history) {
    if (!position.historical_position) continue;
    expect(position.source_context).toMatchObject({criteria_version: '2017', criteria: '2017 Trust Services Criteria',
      questionnaire_version: null, current_guided_answers_copied: false});
    const adopted = position.at.slice(0, 10) >= '2023-01-16';
    expect(position.source_context.points_of_focus_revision).toBe(adopted ? '2022' : null);
    expect(position.source_context.points_of_focus_adopted).toBe(adopted);
    expect(position.source_context.points_of_focus_adopted_at).toBe(adopted ? '2023-01-16T00:00:00.000Z' : null);
  }
});

test('uses native Review outcome tokens and copies organizational context into archived execution snapshots', () => {
  const archived = own(history.db, 'reviews').filter(item => item.provenance === 'newly_authored_synthetic_history');
  expect(archived.length).toBeGreaterThan(0);
  for (const review of archived) {
    expect(review.review_type).toBe('requirements');
    expect(review.governance_context).toMatchObject({category: 'organizational', cadence_source: 'organization_defined'});
    expect(review.governance_context.rationale).toMatch(/fictional historical/);
    for (const occurrence of review.occurrences) {
      expect(occurrence.review_type).toBe('requirements');
      expect(occurrence.governance_context).toEqual(review.governance_context);
      expect(['no_findings', 'findings_raised']).toContain(occurrence.outcome);
      expect(occurrence.conclusion).toBeTruthy();
      expect(occurrence.notes).toBeTruthy();
    }
  }
  const anchor = row(history, 'reviews', 'review_id', history.historyManifest.milestones.anchor.review_id);
  expect(anchor.occurrences[0].completed_at).toBe('2026-11-02T00:00:00.000Z');
});

test('freezes era-specific Risk snapshots and expires old tolerance without borrowing a future current decision', () => {
  const keys = ['likelihood_score', 'impact_score', 'risk_score', 'risk_level', 'assessment_rationale',
    'likelihood_rationale', 'impact_rationale', 'treatment', 'notes', 'status', 'acceptance_rationale',
    'acceptance_expires_at', 'accepted_by', 'acceptance_date'].sort();
  let accepted = 0;
  for (const original of own(current.db, 'reviews').filter(item => item.risk_id)) {
    const review = row(history, 'reviews', 'review_id', original.review_id);
    for (const occurrence of (review.occurrences || []).filter(item => item.provenance === 'newly_authored_synthetic_history')) {
      for (const state of [occurrence.risk_before, occurrence.risk_after]) {
        expect(Object.keys(state).sort()).toEqual(keys);
        expect(state.risk_score).toBe(state.likelihood_score * state.impact_score);
        if (state.acceptance_date) {
          accepted++;
          expect(state.status).toBe('accepted');
          expect(state.treatment).toBe('accept');
          expect(state.acceptance_date <= occurrence.completed_at).toBe(true);
          expect(state.acceptance_expires_at > occurrence.completed_at).toBe(true);
          expect(state.acceptance_date).toBe('2022-10-21T12:00:00.000Z');
        } else expect(state).toMatchObject({acceptance_rationale: null, acceptance_expires_at: null, accepted_by: null});
      }
    }
  }
  expect(accepted).toBeGreaterThan(0);
  for (const risk of own(current.db, 'risks')) {
    const parentIds = db => db.reviews.filter(item => item.risk_id === risk.risk_id).map(item => item.review_id);
    expect(parentIds(history.db)).toEqual(parentIds(current.db));
  }
  const mutable = copy(history);
  const review = own(mutable.db, 'reviews').find(item => item.risk_id && item.occurrences?.some(event => event.risk_after));
  const occurrence = review.occurrences.find(event => event.risk_after), snapshot = JSON.stringify(occurrence.risk_after);
  Object.assign(row(mutable, 'risks', 'risk_id', review.risk_id), {likelihood_score: 5, status: 'accepted', acceptance_date: '2026-11-02T00:00:00.000Z'});
  expect(JSON.stringify(occurrence.risk_after)).toBe(snapshot);
});

test('retries return identical IDs and snapshots without allocating records', async () => {
  const allocate = jest.spyOn(uuid, 'recordUuid').mockImplementation(() => { throw new Error('retry allocated'); });
  const retried = await createPrestigeEightYearHistory(history, options);
  expect(retried).toEqual(history);
  expect(retried).not.toBe(history);
  expect(allocate).not.toHaveBeenCalled();
});

test('rejects changed current state, foreign maps and tampered retry receipts before allocating', async () => {
  const allocate = jest.spyOn(uuid, 'recordUuid');
  const changed = copy(current); changed.db.policies[0].title += ' changed';
  await expect(createPrestigeEightYearHistory(changed, options)).rejects.toThrow(/unchanged current-model/);
  const foreign = copy(current);
  foreign.manifest.risk_ids['shared-delivery'] = current.db.risks.find(item => item.client_id !== CID).risk_id;
  await expect(createPrestigeEightYearHistory(foreign, options)).rejects.toThrow(/receipt binding changed/);
  const retry = copy(history); retry.db[MARKER].chains['SHARED-ACCESS'].task_id = 'tampered';
  await expect(createPrestigeEightYearHistory(retry, options)).rejects.toThrow(/retry state, intent or provenance/);
  expect(allocate).not.toHaveBeenCalled();
});

test('discards partial generated history after a later allocation failure without mutating the input or backup', async () => {
  const originalUuid = uuid.recordUuid;
  let calls = 0;
  jest.spyOn(uuid, 'recordUuid').mockImplementation(() => {
    if (++calls === 45) throw new Error('controlled allocation failure');
    return originalUuid();
  });
  await expect(createPrestigeEightYearHistory(current, options)).rejects.toThrow('controlled allocation failure');
  expect(calls).toBe(45);
  expect(JSON.stringify(current)).toBe(before);
  expect(current.db).not.toHaveProperty(MARKER);
});

test('rejects UUID collisions rather than retrying or publishing duplicate records', async () => {
  const existing = current.db.policies[0].policy_id;
  const allocate = jest.spyOn(uuid, 'recordUuid').mockReturnValue(existing);
  await expect(createPrestigeEightYearHistory(current, options)).rejects.toThrow(/collided/);
  expect(allocate).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(current)).toBe(before);
});

test.each([
  {clock: CLOCK, purpose: 'runtime'},
  {clock: new Date('2026-11-03T00:00:00.000Z'), purpose: options.purpose},
  {purpose: options.purpose},
])('requires the explicit source-only purpose and exact anchor', async invalid => {
  await expect(createPrestigeEightYearHistory(current, invalid)).rejects.toThrow(/explicit anchor clock/);
  expect(JSON.stringify(current)).toBe(before);
});
