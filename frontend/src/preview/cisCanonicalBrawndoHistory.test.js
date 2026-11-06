import {ids} from './store';
import {cisDemoFixtureDates, CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {establishBrawndoBaseline} from './cisCanonicalBrawndoBaseline';
import {seedBrawndoProgram} from './cisCanonicalBrawndoProgram';
import {seedBrawndoOperations} from './cisCanonicalBrawndoOperations';
import {seedBrawndoHistory} from './cisCanonicalBrawndoHistory';
import {canonicalReviewForecast} from './cisCanonicalReviewForecast';
import {reviewSchedule} from '../lib/reviewOccurrences';

const CID = 'demo_brawndo';
const CLOCK = '2026-11-02T12:00:00.000Z';
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(clock = CLOCK) {
  const dates = cisDemoFixtureDates(new Date(clock));
  const actor = {user_id: 'demo_admin', name: 'Demo Explorer', email: 'explorer@example.test', workspace_mode: 'demo',
    role: 'super_admin', status: 'active', client_ids: [CID, 'other']};
  const owner = {user_id: 'demo_provider_lead', name: 'Morgan Ellis', email: 'morgan@example.test', workspace_mode: 'demo',
    role: 'platform_admin', status: 'active', client_ids: [CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind, []])), user: actor, users: [actor, owner],
    logs: [], notifications: [], drafts: {}, baselines: {}, clients: [{client_id: CID, name: 'Brawndo', environment: 'Demo',
      status: 'active', primary_contact_id: CID + '_contact_0', assigned_owner_id: owner.user_id,
      profile: {organization: {legal_name: 'Brawndo'}}, framework_settings: {'cis-ig1': {implementation_group: 1}}}],
    contacts: [{client_id: CID, contact_id: CID + '_contact_0', name: 'Joe Bowers', status: 'active'},
      {client_id: CID, contact_id: CID + '_contact_1', name: 'President Camacho', status: 'active'}]};
  establishBrawndoBaseline(db, {dates});
  const program = seedBrawndoProgram(db, {dates, owner});
  const operations = seedBrawndoOperations(db, {dates, owner, frameworkReviews: program.reviews});
  return {db, dates, owner, program, operations};
}
const install = fixture => seedBrawndoHistory(fixture.db, fixture);

test('all native recurring parents retain every eligible past cycle across the full 18-month scenario', () => {
  const state = fixture();
  const result = install(state);
  expect(result.reviews).toHaveLength(62);
  expect(result.assessments).toHaveLength(56);
  expect(result.origin).toBe('2025-05-02');
  for (const review of result.reviews) {
    const source = state.operations.review_origins.find(row => row.review_id === review.review_id);
    const terminal = source?.terminal_at;
    let previous;
    for (const occurrence of review.occurrences) {
      expect(occurrence.status).toBe('completed');
      expect(occurrence.client_id).toBe(CID);
      expect(occurrence.review_id).toBe(review.review_id);
      expect(occurrence.completed_at < state.dates.anchor).toBe(true);
      expect(occurrence.created_at <= occurrence.started_at).toBe(true);
      expect(occurrence.started_at <= occurrence.completed_at).toBe(true);
      expect(occurrence.updated_at).toBe(occurrence.completed_at);
      expect(occurrence.due_date >= result.origin).toBe(true);
      if (terminal) expect(occurrence.completed_at <= terminal).toBe(true);
      if (previous) expect(previous.next_review_date.slice(0, 10)).toBe(occurrence.due_date);
      expect(occurrence.evidence).toEqual([]);
      expect(occurrence.fixture_history_provenance).toMatch(/not browser execution/);
      expect(occurrence.completed_by_name).not.toBe('');
      expect(occurrence.occurrences).toBeUndefined();
      expect(occurrence.cancelled_at).toBeUndefined();
      previous = occurrence;
    }
    if (review.recurrence === 'none') expect(review.occurrences).toEqual([]);
    if (!terminal && review.occurrences.length) expect(review.occurrences.at(-1).next_review_date.slice(0, 10)).toBe(review.due_date.slice(0, 10));
  }
  const software = result.reviews.find(row => row.framework_plan_key === 'software-support');
  expect(software.occurrences.length).toBeGreaterThanOrEqual(17);
  expect(software.occurrences[0].due_date.startsWith('2025-05')).toBe(true);
  expect(result.occurrence_count).toBe(result.reviews.reduce((sum, row) => sum + row.occurrences.length, 0));
});

test('the partial service-provider inventory has valid dated history without an invented implemented milestone', () => {
  const state = fixture();
  const originalMonth = state.dates.month;
  state.dates.month = months => {
    if (!Number.isFinite(months)) throw new Error('Scenario month offset must be finite.');
    return originalMonth(months);
  };
  const result = install(state);
  expect(result.assessments).toHaveLength(56);
  expect(result.reviews).toHaveLength(62);
  for (const row of result.assessments) {
    for (const event of row.assessment_history) expect(Number.isFinite(Date.parse(event.at))).toBe(true);
  }
  const provider = result.assessments.find(row => row.definition_id === '15.1');
  expect(provider.status).toBe('in_progress');
  expect(provider.assessment_history.some(event => event.status === 'in_progress')).toBe(true);
  expect(provider.assessment_history.some(event => event.status === 'addressed')).toBe(false);
  expect(provider.assessment_history.at(-1).at).toBe(provider.last_saved);
  const review = result.reviews.find(row => row.framework_plan_key === 'provider-inventory');
  expect(review.occurrences).toHaveLength(1);
  expect(review.due_date.slice(0, 10) < state.dates.day(0)).toBe(true);
});

test('calendar-month anchoring survives month-end and clipped February without cadence drift', () => {
  const state = fixture('2026-10-22T12:00:00.000Z');
  const review = state.program.reviews.find(row => row.framework_plan_key === 'software-support');
  review.due_date = '2026-10-31';
  Object.assign(review, reviewSchedule(review, true));
  const result = install(state);
  const history = result.reviews.find(row => row.review_id === review.review_id).occurrences;
  expect(history.some(row => row.due_date === '2026-02-28')).toBe(true);
  expect(history.some(row => row.due_date === '2026-03-31')).toBe(true);
  expect(history.some(row => row.due_date === '2026-04-30')).toBe(true);
  for (const row of history) expect(row.next_review_date).toBe(reviewSchedule({...row, recurrence_due_date: null}).next_review_date);
});

test('the six known partial/failure safeguards have distinct owned remediation and native item-to-Finding links', () => {
  const state = fixture();
  const result = install(state);
  for (const id of ['1.1', '3.1', '4.1', '7.1', '7.2', '15.1']) {
    const assessment = result.assessments.find(row => row.definition_id === id);
    const findings = result.findings.filter(row => row.definition_id === id);
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    const task = result.tasks.find(row => row.task_id === finding.primary_task_id);
    expect(finding.status).toBe('in_remediation');
    expect(task.finding_id).toBe(finding.finding_id);
    expect(task.source_type).toBe('finding');
    expect(task.completed_at).toBeUndefined();
    expect(assessment.related_links).toContainEqual({kind: 'findings', id: finding.finding_id});
    expect(assessment.items_to_address.filter(item => item.state === 'open').every(item => item.finding_id === finding.finding_id)).toBe(true);
  }
  for (const id of ['7.2', '15.1']) {
    const finding = result.findings.find(row => row.definition_id === id);
    expect(finding.due_date < state.dates.day(0)).toBe(true);
    const review = result.reviews.find(row => row.framework_safeguards?.includes(id));
    expect(review.due_date.slice(0, 10) < state.dates.day(0)).toBe(true);
    expect(finding.created_at.slice(0,10) > review.due_date.slice(0,10)).toBe(true);
    const assessment=result.assessments.find(row=>row.definition_id===id);
    expect(assessment.last_saved >= finding.created_at).toBe(true);
  }
});

test('completed work, pending Finding validation and independent closure retain separate dates and outcomes', () => {
  const state = fixture();
  const result = install(state);
  const pending = result.findings.find(row => row.definition_id === '2.3');
  const pendingTask = result.tasks.find(row => row.finding_id === pending.finding_id);
  expect(pending.status).toBe('remediated');
  expect(pendingTask.status).toBe('done');
  expect(pendingTask.resolution).toMatch(/validation is still pending/);
  expect(pending.validated_at).toBeUndefined();
  expect(pending.closed_at).toBeUndefined();
  expect(result.assessments.find(row => row.definition_id === '2.3')).toMatchObject({status: 'addressed', verification: 'needs_validation'});
  for (const finding of result.findings.filter(row => row.status === 'closed')) {
    const task = result.tasks.find(row => row.finding_id === finding.finding_id);
    expect(task.created_at <= task.completed_at).toBe(true);
    expect(task.completed_at < finding.validated_at).toBe(true);
    expect(finding.validated_at).toBe(finding.closed_at);
    expect(finding.decision_history.at(-1)).toMatchObject({action: 'validated', by: state.db.user.user_id, at: finding.closed_at});
    const occurrence = result.reviews.find(row => row.review_id === finding.review_id).occurrences.find(row => row.occurrence_id === finding.occurrence_id);
    expect(occurrence.finding_ids).toContain(finding.finding_id);
    expect(occurrence.outcome).toBe('findings_raised');
    expect(occurrence.completed_at).toBe(finding.created_at);
  }
});

test('Review requirement snapshots reconcile to the final as-of assessment history without clearing originating Findings', () => {
  const state = fixture();
  const result = install(state);
  for (const review of result.reviews) for (const occurrence of review.occurrences) {
    for (const requirement of occurrence.requirement_snapshot || []) {
      const assessment = result.assessments.find(row => row.definition_id === requirement.definition_id);
      const asOf = assessment.assessment_history.filter(event => event.at <= occurrence.completed_at).at(-1);
      expect(requirement.status).toBe(asOf?.status || 'not_assessed');
    }
  }
  const retained = result.findings.filter(row => row.review_id && row.occurrence_id);
  expect(retained).toHaveLength(3);
  for (const finding of retained) {
    const occurrence = result.reviews.find(row => row.review_id === finding.review_id).occurrences
      .find(row => row.occurrence_id === finding.occurrence_id);
    expect(occurrence.requirement_snapshot.find(row => row.definition_id === finding.definition_id).status).toBe('needs_attention');
    expect(occurrence.finding_ids).toContain(finding.finding_id);
    expect(occurrence.finding_count).toBe(occurrence.finding_ids.length);
    expect(occurrence.outcome).toBe('findings_raised');
  }
});

test('closed Risks and inactive Vendors retain history and completed treatment without future revival', () => {
  const state = fixture();
  const result = install(state);
  const closed = state.operations.risks.filter(row => row.status === 'closed');
  expect(closed).toHaveLength(10);
  for (const risk of closed) {
    expect(risk.next_review).toBeNull();
    const task = result.tasks.find(row => row.risk_id === risk.risk_id);
    expect(task.status).toBe('done');
    expect(task.completed_at < risk.closed_at).toBe(true);
    expect(risk.related_task_ids).toContain(task.task_id);
    const review = result.reviews.find(row => row.risk_id === risk.risk_id);
    expect(review.status).toBe('cancelled');
    expect(review.occurrences.length).toBeGreaterThan(0);
    expect(review.due_date).toBe(review.occurrences.at(-1).next_review_date);
    expect(review.schedule_anchor).toEqual(review.occurrences.at(-1).schedule_anchor);
    expect(review.current_occurrence_id).toBe('occ_' + review.review_id);
    expect(review.occurrences.every(row => row.completed_at <= risk.closed_at)).toBe(true);
    expect(review.occurrences.every(row => row.risk_after.status !== 'closed')).toBe(true);
  }
  for (const vendor of state.operations.vendors.filter(row => row.status === 'inactive')) {
    expect(vendor.next_review).toBeNull();
    const review = result.reviews.find(row => row.vendor_id === vendor.vendor_id);
    expect(review.status).toBe('cancelled');
    expect(review.occurrences.length).toBeGreaterThan(0);
    expect(review.due_date).toBe(review.occurrences.at(-1).next_review_date);
    expect(review.schedule_anchor).toEqual(review.occurrences.at(-1).schedule_anchor);
    expect(review.current_occurrence_id).toBe('occ_' + review.review_id);
    expect(review.occurrences.every(row => row.completed_at <= vendor.offboarded_at)).toBe(true);
  }
});

test('the cancelled November 28 Risk Review retains its next native slot without a future completion or forecast', () => {
  const state = fixture('2026-11-28T12:00:00.000Z');
  const riskId = CID + '_canonical_risk_old-vpn', reviewId = 'risk_review_' + riskId;
  const originalRisk = copy(state.operations.risks.find(row => row.risk_id === riskId));
  const originalReview = copy(state.operations.reviews.find(row => row.review_id === reviewId));
  expect(originalReview).toMatchObject({due_date: '2025-11-28', status: 'cancelled',
    current_occurrence_id: 'occ_' + reviewId, cancelled_at: '2026-02-01T00:00:00.000Z'});
  const result = install(state), review = result.reviews.find(row => row.review_id === reviewId);
  const risk = state.db.risks.find(row => row.risk_id === riskId), last = review.occurrences.at(-1);
  expect(review.occurrences).toHaveLength(1);
  expect(last).toMatchObject({occurrence_id: reviewId + '_2025-11-28', current_occurrence_id: reviewId + '_2025-11-28',
    due_date: '2025-11-28', status: 'completed', completed_at: '2025-11-28T00:00:00.000Z',
    next_review_date: '2026-11-28T00:00:00.000Z'});
  expect(last.risk_after.status).not.toBe('closed');
  expect(last.cancelled_at).toBeUndefined();
  expect(review).toMatchObject({due_date: last.next_review_date, status: 'cancelled', period: '2026',
    current_occurrence_id: originalReview.current_occurrence_id,
    cancelled_at: originalReview.cancelled_at, cancelled_by: originalReview.cancelled_by,
    recurrence_due_date: null, next_review_date: '2027-11-28T00:00:00.000Z'});
  expect(review.schedule_anchor).toEqual(originalReview.schedule_anchor);
  expect(review.current_occurrence_id).not.toBe(last.occurrence_id);
  expect(risk).toMatchObject({status: 'closed', closed_at: originalRisk.closed_at, closed_by: originalRisk.closed_by,
    next_review: null, decision_history: originalRisk.decision_history});
  expect(review.occurrences.every(row => row.completed_at <= review.cancelled_at && row.completed_at < state.dates.anchor)).toBe(true);
  const beforeForecast = copy(review), forecast = canonicalReviewForecast([review], {client_id: CID, anchor: state.dates.anchor});
  expect(forecast.summary).toMatchObject({active_parents: 0, excluded_terminal_parents: 1, total_dates: 0});
  expect(forecast.items).toEqual([]);
  expect(review).toEqual(beforeForecast);
});

test('the inactive November 28 Vendor retains its cancelled next slot and original offboarding record', () => {
  const state = fixture('2026-11-28T12:00:00.000Z');
  const vendorId = CID + '_canonical_vendor_retired', reviewId = 'vendor_review_' + vendorId + '_vendor';
  const originalVendor = copy(state.operations.vendors.find(row => row.vendor_id === vendorId));
  const originalReview = copy(state.operations.reviews.find(row => row.review_id === reviewId));
  expect(originalVendor).toMatchObject({status: 'inactive', offboarded_at: '2026-06-01T00:00:00.000Z', next_review: null});
  expect(originalReview).toMatchObject({due_date: '2026-05-22', status: 'cancelled', vendor_purpose: 'vendor',
    current_occurrence_id: 'occ_' + reviewId, cancelled_at: originalVendor.offboarded_at});
  const result = install(state), review = result.reviews.find(row => row.review_id === reviewId);
  const vendor = state.db.vendors.find(row => row.vendor_id === vendorId), last = review.occurrences.at(-1);
  expect(review.occurrences).toHaveLength(1);
  expect(last).toMatchObject({occurrence_id: reviewId + '_2026-05-22', current_occurrence_id: reviewId + '_2026-05-22',
    due_date: '2026-05-22', status: 'completed', completed_at: '2026-05-22T00:00:00.000Z',
    next_review_date: '2027-05-22T00:00:00.000Z'});
  expect(last.source_snapshot).toMatchObject({vendor_id: vendorId, status: 'active', review_purpose: 'vendor'});
  expect(last.cancelled_at).toBeUndefined();
  expect(review).toMatchObject({due_date: last.next_review_date, status: 'cancelled', period: '2027',
    current_occurrence_id: originalReview.current_occurrence_id,
    cancelled_at: originalReview.cancelled_at, cancelled_by: originalReview.cancelled_by,
    recurrence_due_date: null, next_review_date: '2028-05-22T00:00:00.000Z'});
  expect(review.schedule_anchor).toEqual(originalReview.schedule_anchor);
  expect(review.current_occurrence_id).not.toBe(last.occurrence_id);
  // Existing native synchronization records the last completion; all other Vendor fields stay unchanged.
  expect(vendor).toEqual({...originalVendor, last_review: last.completed_at,
    custom_recurrence_days: originalReview.custom_recurrence_days});
  expect(review.occurrences.every(row => row.completed_at <= vendor.offboarded_at && row.completed_at < state.dates.anchor)).toBe(true);
  const beforeForecast = copy(review), forecast = canonicalReviewForecast([review], {client_id: CID, anchor: state.dates.anchor});
  expect(forecast.summary).toMatchObject({active_parents: 0, excluded_terminal_parents: 1, total_dates: 0});
  expect(forecast.items).toEqual([]);
  expect(review).toEqual(beforeForecast);
});

test('historical snapshots do not backdate later AI approvals, Risk acceptance or current document versions', () => {
  const state = fixture();
  const result = install(state);
  for (const review of result.reviews.filter(row => row.ai_system_id)) {
    const system = state.operations.ai_systems.find(row => row.ai_system_id === review.ai_system_id);
    for (const occurrence of review.occurrences) if (occurrence.completed_at < system.onboarding_screening.recorded_at) {
      expect(occurrence.source_snapshot.screening_recorded).toBe(false);
      expect(occurrence.source_snapshot.approval_status).toBe('pending_assessment');
    }
  }
  for (const risk of state.operations.risks.filter(row => row.status === 'accepted')) {
    const review = result.reviews.find(row => row.risk_id === risk.risk_id);
    for (const occurrence of review.occurrences.filter(row => row.completed_at < risk.acceptance_date)) {
      expect(occurrence.risk_after.status).toBe('assessed');
      expect(occurrence.risk_after.acceptance_date).toBeNull();
      expect(occurrence.risk_after.accepted_by).toBeNull();
    }
  }
  const dataReview = result.reviews.find(row => row.framework_plan_key === 'data-governance');
  expect(dataReview.occurrences[0].policy_coverage[0].version).toBe('1.0');
  expect(dataReview.occurrences[0].policy_coverage[0].subject.summary).toMatch(/remain outside this approved version/i);
});

test('genuinely unassessed safeguards acquire neither completed assessment events nor remediation conclusions', () => {
  const state = fixture();
  const result = install(state);
  for (const id of ['11.4', '14.8']) {
    const row = result.assessments.find(item => item.definition_id === id);
    expect(row.assessment_history).toEqual([]);
    expect(row.last_saved).toBeNull();
    expect(row.verification).toBeNull();
    expect(result.findings.some(finding => finding.framework_assessment_id === row.framework_assessment_id)).toBe(false);
    const snapshots = result.reviews.flatMap(review => review.occurrences.flatMap(occurrence => occurrence.requirement_snapshot || []));
    expect(snapshots.filter(item => item.definition_id === id).every(item => item.status === 'not_assessed')).toBe(true);
  }
});

test('native reporting points derive from actual dated assessment events, including the earlier 18-month origin', () => {
  const state = fixture();
  const result = install(state);
  const context = state.db.cis_demo_scenario_history[CID];
  expect(context.version).toBe(CIS_SHOWCASE_VERSION);
  expect(context.point_ids).toHaveLength(6);
  expect(result.reporting_seeded).toBe(true);
  for (const row of result.assessments.filter(item => item.status !== 'not_assessed')) {
    expect(row.assessment_history[0].at).toBe('2025-05-02T00:00:00.000Z');
    expect(row.assessment_history.some(event => event.at === state.dates.instant(-75))).toBe(true);
    expect(row.assessment_history.every(event => event.at >= '2024-06-25T00:00:00.000Z' && event.at <= state.dates.anchor)).toBe(true);
  }
  const points = state.db.portfolio_reporting.snapshots.filter(row => context.point_ids.includes(row.snapshot_id));
  for (const point of points) {
    const actual = result.assessments.filter(row => row.assessment_history.filter(event => event.at <= point.effective_at).at(-1)?.status === 'addressed').length;
    expect(point.current.implemented).toBe(actual);
    expect(point.current.denominator).toBe(56);
  }
  expect(points.at(-1).current.implemented).toBe(48);
  expect(points[0].current.implemented).toBeLessThan(48);
});

test('repeat installation preserves visitor edits and immutable completed history; invalid scope fails without mutation', () => {
  const state = fixture();
  const result = install(state);
  const review = result.reviews[0];
  review.notes = 'A visitor changed the current review notes.';
  const saved = copy(state.db);
  install(state);
  expect(state.db).toEqual(saved);
  expect(state.program.assessments[0]).toBe(state.db.framework_assessments.find(row => row.definition_id === '1.1'));
  const invalid = fixture();
  invalid.operations.reviews[0].client_id = 'other';
  const before = copy(invalid.db);
  expect(() => install(invalid)).toThrow('same-client');
  expect(invalid.db).toEqual(before);
});

test('all history evidence specifications resolve to native records and occurrences without claiming uploaded files', () => {
  const state = fixture();
  const result = install(state);
  for (const spec of result.evidence_specs) {
    expect(spec.content_outline.join(' ')).toMatch(/synthetic Brawndo history/);
    if (spec.history_occurrence_ids) {
      const review = result.reviews.find(row => row.review_id === spec.linked_id);
      expect(spec.history_occurrence_ids).toEqual(review.occurrences.map(row => row.occurrence_id));
      expect(spec.relationships.length).toBeLessThanOrEqual(100);
    }
    expect(spec.content_base64).toBeUndefined();
  }
  expect(state.db.evidence).toEqual([]);
});

test('fictional current verification uses native criterion IDs and keeps pending validation separate from implementation', () => {
  const state = fixture();
  const result = install(state);
  expect(result.verification_basis).toHaveLength(54);
  for (const basis of result.verification_basis) {
    const row = result.assessments.find(item => item.framework_assessment_id === basis.assessment_id);
    const current = row.assessment_history.filter(event => event.at === row.last_saved).at(-1);
    expect(current.verification).toBe(row.verification);
    expect(current.cis_assessment_criteria).toEqual(row.cis_assessment_criteria);
    expect(current.notes).toMatch(/authored Demo observation, not external assurance or browser execution/);
    expect(basis.question_version).toBe(row.guided_assessment_source.version);
    expect(basis.evidence_check).not.toBe('');
    expect(row.verification_checklist).toBeNull();
    if (row.verification === 'verified') expect(current.notes).toMatch(/inspected that synthetic sample/);
  }
  for (const id of ['9.1', '2.3']) {
    const row = result.assessments.find(item => item.definition_id === id);
    expect(row.status).toBe('addressed');
    expect(row.verification).toBe('needs_validation');
  }
  expect(result.assessments.find(row => row.definition_id === '7.1').cis_assessment_criteria).toEqual([]);
});
