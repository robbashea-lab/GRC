import {activeDefinitions} from '../lib/frameworks';
import {reviewSchedule, reviewView, scheduledDate} from '../lib/reviewOccurrences';
import {visibleQuestions} from '../lib/guidedAssessment';
import criteriaCatalog from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import {eligible, validateAssignment} from './assignmentEligibility';
import {prepareTask} from './actionItems';
import {riskSnapshot} from './risks';
import {syncVendorReview} from './vendors';
import {syncPolicyReview} from './policyReviews';
import {effectivePolicySubject} from './policyReviewCoverage';
import {linkItemFinding} from './assessmentItems';
import {seedCisScenarioHistory} from './cisDemoHistory';
import {CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {BRAWNDO_SCENARIO_PROFILE, brawndoSafeguardContent} from './cisCanonicalBrawndoContent';

const CID = 'demo_brawndo';
const PREFIX = CID + '_canonical_history_';
const VERSION = 'brawndo-native-history-v1';
const RELEASE = '2024-06-25';
const SOURCE = 'Fictional Demo import';
const PROVENANCE = 'Explicit synthetic Brawndo history, generated from dated scenario records; not browser execution or real customer evidence.';
const copy = value => JSON.parse(JSON.stringify(value));
const instant = day => day.slice(0, 10) + 'T00:00:00.000Z';
const dayOf = value => String(value || '').slice(0, 10);
const later = (...values) => values.filter(Boolean).sort().at(-1);
const earlier = (...values) => values.filter(Boolean).sort()[0];
const MONTHS = {monthly: 1, quarterly: 3, semiannual: 6, annual: 12};
const ID_FIELDS = {framework_assessments: 'framework_assessment_id', reviews: 'review_id', findings: 'finding_id',
  tasks: 'task_id', risks: 'risk_id', vendors: 'vendor_id', ai_systems: 'ai_system_id', policies: 'policy_id', logs: 'audit_id'};

const CURRENT_GAPS = [
  {id: '1.1', key: 'kiosk-inventory', title: 'Six packaging kiosks lack complete inventory attributes', found: -150, due: 20, status: 'in_progress', severity: 'medium'},
  {id: '3.1', key: 'production-data-process', title: 'Production data-handling appendix remains incomplete', found: -90, due: 15, status: 'in_progress', severity: 'medium'},
  {id: '4.1', key: 'configuration-process', title: 'Endpoint and server configuration process is missing', found: -120, due: 30, status: 'open', severity: 'high'},
  {id: '7.1', key: 'vulnerability-process', title: 'Vulnerability-management lifecycle is undocumented', found: -150, due: 21, status: 'in_progress', severity: 'high'},
  {id: '7.2', key: 'remediation-review', title: 'Monthly remediation-process review is overdue', found: -6, due: -4, status: 'in_progress', severity: 'medium'},
  {id: '15.1', key: 'provider-inventory', title: 'Annual provider inventory reconciliation is overdue', found: -10, due: -3, status: 'blocked', severity: 'medium'}
];
const RETAINED_CHAINS = [
  {id: '2.2', key: 'label-utility', plan: 'software-support', before: -180, completed: -150, validated: -140,
    title: 'Unsupported label utility was retired', work: 'Replace the unsupported label utility and reconcile packaging installations',
    result: 'The supported replacement was deployed, the old package removed and the installed-version list reconciled.',
    validation: 'An independent follow-up sample found only the supported replacement and confirmed the retired exception was no longer needed.'},
  {id: '6.2', key: 'leaver-trail', plan: 'account-authorization', before: -300, completed: -270, validated: -260,
    title: 'Leaver revocation confirmation was incomplete', work: 'Reconcile the temporary-driver revocation trail and verify denied access',
    result: 'The identity, ERP and remote-session records were reconciled and a controlled denied-access result retained.',
    validation: 'The reviewer checked the authorized departure, completed revocation records and denied-access sample before closing the Finding.'},
  {id: '2.3', key: 'sales-toolbar', plan: 'software-support', before: -45, completed: -10, validated: null,
    title: 'Removed sales toolbar awaits Finding validation', work: 'Remove the unapproved sales toolbar and retain the clean software sample',
    result: 'The toolbar was removed and a later installed-software export shows it absent. Independent Finding validation is still pending.'}
];

function shiftedDay(value, days) {
  const date = scheduledDate(dayOf(value));
  if (!date) throw new Error('Brawndo history requires valid calendar dates.');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Always calculate from the original native anchor: February clipping must not drift later cycles.
function precedingDue(review, step) {
  const date = scheduledDate(dayOf(review.due_date));
  if (!date) throw new Error('Brawndo history requires scheduled Review parents.');
  const months = MONTHS[review.recurrence];
  if (months) {
    const anchor = review.schedule_anchor || reviewSchedule(review).schedule_anchor;
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months * step);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(anchor.month_end ? last : Math.min(anchor.day, last));
    return date.toISOString().slice(0, 10);
  }
  if (review.recurrence === 'custom' && Number.isInteger(review.custom_recurrence_days) && review.custom_recurrence_days > 0)
    return shiftedDay(review.due_date, -review.custom_recurrence_days * step);
  return null;
}

function addLink(row, kind, id) {
  row.related_links ||= [];
  if (!row.related_links.some(link => link.kind === kind && link.id === id)) row.related_links.push({kind, id});
}

function actorFor(db, userId, fallback) {
  return db.users.find(user => user.user_id === userId && eligible(user, CID)) || fallback;
}

function log(db, kind, row, at, actor, action, meta = {}) {
  const id = row[ID_FIELDS[kind]];
  db.logs.push({audit_id: PREFIX + 'log_' + kind + '_' + id + '_' + at + '_' + action.replaceAll(' ', '_'),
    entity_type: kind, entity_id: id, client_id: CID, at, user_id: actor.user_id, user_name: actor.name,
    user_email: actor.email, action, meta: {simulated: true, title: row.title, provenance: PROVENANCE, ...meta}});
}

function rolloutDay(id, dates) {
  if (id.startsWith('17.')) return dates.day(-20);
  if (id === '4.2') return dates.month(-14);
  if (id === '14.1') return dates.month(-13);
  const months = {1: 16, 2: 15, 3: 12, 4: 10, 5: 16, 6: 14, 7: 13, 8: 11, 9: 5, 10: 15, 11: 3, 12: 4, 14: 2};
  return dates.month(-months[id.split('.')[0]]);
}

function assessmentProgress(db, assessments, dates, origin, owner) {
  for (const row of assessments) {
    if (row.status === 'not_assessed') {
      row.assessment_history = [];
      continue;
    }
    const content = brawndoSafeguardContent(row.definition_id, row.status);
    const currentAt = row.last_saved || row.updated_at;
    if (!scheduledDate(currentAt) || currentAt > dates.anchor || dayOf(currentAt) < origin)
      throw new Error('Brawndo current assessment date is outside its scenario history.');
    const gap = CURRENT_GAPS.find(item => item.id === row.definition_id);
    const first = gap ? later(origin, dates.day(gap.found)) : later(origin, shiftedDay(origin, 7));
    // A current gap has no implemented milestone; do not invent one from its control number.
    const implemented = gap ? null : later(origin, rolloutDay(row.definition_id, dates));
    const points = new Set([origin, first, ...[12, 6, 3, 1].map(months => dates.month(-months)), dates.day(-75), dayOf(currentAt)]);
    if (!gap) points.add(implemented);
    row.fixture_history_origin_at = instant(origin);
    row.assessment_history = [...points].filter(day => day >= origin && day <= dayOf(currentAt)).sort().map(day => {
      const status = day < first ? 'not_assessed' : gap ? row.status : day < implemented ? 'in_progress' : 'addressed';
      return {at: day === dayOf(currentAt) ? currentAt : instant(day), by: owner.user_id, status,
        implementation: status === 'not_assessed' ? '' : status === 'addressed' || gap ? content.current_implementation
          : 'Fictional staged rollout for ' + content.scope + ' Coverage and operating records are not yet complete.',
        notes: status === 'not_assessed' ? 'Fictional program intake; no implementation assessment is claimed at this observation.'
          : 'Fictional dated assessment observation. ' + (status === 'in_progress' && !gap ? 'The rollout remains incomplete.' : content.assessment_notes),
        source: SOURCE};
    });
  }
}

function riskAsOf(risk, at, lifecycle) {
  const snapshot = copy(riskSnapshot(risk));
  if (risk.acceptance_date && risk.acceptance_date > at) {
    Object.assign(snapshot, {status: 'assessed', treatment: 'monitor', acceptance_rationale: null, acceptance_expires_at: null,
      accepted_by: null, acceptance_date: null});
  }
  if (risk.closed_at && risk.closed_at > at) snapshot.status = dayOf(at) < shiftedDay(risk.closed_at, -60) ? 'assessed' : 'in_progress';
  if (risk.status === 'in_progress' && lifecycle?.treatment_started_at && lifecycle.treatment_started_at > at) snapshot.status = 'assessed';
  return snapshot;
}

function sourceSnapshot(db, review, at, operations) {
  if (review.risk_id) {
    const row = db.risks.find(risk => risk.risk_id === review.risk_id);
    const lifecycle = operations.risk_lifecycles?.find(item => item.risk_id === row.risk_id);
    const snapshot = riskAsOf(row, at, lifecycle);
    return {risk_before: copy(snapshot), risk_after: copy(snapshot), risk_review_recommendation: 'Reviewed — No Change',
      outcome: 'Reviewed — No Change', source_snapshot: {risk_id: row.risk_id, title: row.title, owner_id: row.owner_id,
        treatment_plan: row.closed_at && row.closed_at > at ? 'Planned treatment of ' + row.title + '; the later closure result had not yet occurred.' : row.treatment_plan, ...snapshot}};
  }
  if (review.vendor_id) {
    const row = db.vendors.find(vendor => vendor.vendor_id === review.vendor_id);
    return {source_snapshot: {vendor_id: row.vendor_id, name: row.name, service: row.service, owner_id: row.business_owner_id,
      criticality: row.criticality, status: row.offboarded_at && row.offboarded_at <= at ? 'inactive' : 'active',
      review_purpose: review.vendor_purpose || 'vendor', assurance_scope: 'The fictional periodic review does not assert receipt of the current requested assurance response.'}};
  }
  if (review.ai_system_id) {
    const row = db.ai_systems.find(ai => ai.ai_system_id === review.ai_system_id);
    const approval = [...(row.approval_history || [])].filter(item => item.at <= at).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    return {source_snapshot: {ai_system_id: row.ai_system_id, name: row.name, owner_id: row.owner_id,
      description: row.description, permitted_data_types: copy(row.permitted_data_types || []), approval_status: approval?.status || 'pending_assessment',
      screening_recorded: !!row.onboarding_screening?.recorded_at && row.onboarding_screening.recorded_at <= at,
      linked_risk_ids: (row.related_links || []).filter(link => link.kind === 'risks').map(link => link.id)},
      conclusion: approval ? 'Fictional annual review of the then-recorded approved use and linked Risk; no automatic approval or Risk closure.'
        : 'Fictional annual review of proposed use and the linked Risk. The later approval and screening had not yet been recorded; no operational use was approved by this occurrence.'};
  }
  return {};
}

function reviewHistory(db, reviews, assessments, operations, dates, origin, owner) {
  const definitions = activeDefinitions('cis-ig1', {implementation_group: 1});
  for (const review of reviews) {
    const source = operations.review_origins?.find(item => item.review_id === review.review_id);
    const terminal = source?.terminal_at || review.cancelled_at || null;
    const start = later(origin, dayOf(review.created_at), source?.origin && dayOf(source.origin));
    const end = earlier(dates.day(-1), terminal && dayOf(terminal));
    const actor = actorFor(db, review.reviewer_id || review.owner_id, owner);
    const datesToComplete = [];
    if (MONTHS[review.recurrence] || review.recurrence === 'custom') {
      for (let step = terminal ? 0 : 1; step <= 1000; step++) {
        const due = precedingDue(review, step);
        if (!due || due < start) break;
        if (due <= end) datesToComplete.push(due);
        if (step === 1000) throw new Error('Brawndo Review history exceeds the bounded scenario range.');
      }
    }
    review.occurrences = datesToComplete.sort().map((due, index) => {
      const completedDay = earlier(shiftedDay(due, index % 4 === 1 ? 2 : 0), end);
      const completed = instant(completedDay);
      const {occurrences, ...parent} = review;
      const snapshot = {...copy(parent), ...reviewSchedule({...review, due_date: due, recurrence_due_date: null}),
        occurrence_id: review.review_id + '_' + due, current_occurrence_id: review.review_id + '_' + due,
        due_date: due, status: 'completed', started_at: instant(due), started_by: actor.user_id,
        completed_at: completed, completion_date: completed, updated_at: completed, completed_by: actor.user_id,
        completed_by_name: actor.name, outcome: 'no_findings', finding_count: 0, finding_ids: [], evidence: [],
        tested_period: due + ' scheduled cycle', tested_scope: review.scope || review.title, checklist_confirmed: true,
        notes: 'Fictional completed cycle, retaining its original scheduled date and then-current scope.',
        conclusion: 'Fictional review completed; established gaps and follow-up remain separately tracked rather than automatically closed.',
        no_evidence_reason: 'Synthetic historical summary; the linked history artifact must be attached before this is described as uploaded evidence.',
        fixture_history_provenance: PROVENANCE, ...sourceSnapshot(db, review, completed, operations)};
      delete snapshot.cancelled_at;
      delete snapshot.cancelled_by;
      if (review.framework_safeguards) snapshot.requirement_snapshot = review.framework_safeguards.map(id => {
        const definition = definitions.find(item => item.id === id);
        const assessment = assessments.find(item => item.definition_id === id);
        const event = assessment?.assessment_history?.filter(item => item.at <= completed).at(-1);
        return {definition_id: id, title: definition?.title, framework_version: '8.1', source_cadence: definition?.source_cadence,
          status: event?.status || 'not_assessed', owner_id: assessment?.owner_id, process_owner_id: assessment?.process_owner_id};
      });
      if (review.policy_id) {
        const policy = db.policies.find(item => item.policy_id === review.policy_id);
        const subject = policy && effectivePolicySubject(policy, completed);
        snapshot.policy_coverage = subject ? [subject] : [];
      }
      return snapshot;
    });
    review.fixture_history_version = VERSION;
    review.fixture_history_anchor = dates.anchor;
    review.fixture_history_origin_at = instant(start);
    if (review.risk_id) {
      const risk = db.risks.find(row => row.risk_id === review.risk_id);
      risk.last_reviewed = review.occurrences.at(-1)?.completed_at || null;
      if (terminal) risk.next_review = null;
    }
    if (review.vendor_id) syncVendorReview(db, review);
    if (review.policy_id) syncPolicyReview(db, review);
  }
}

function findingAndTask(db, {key, assessment, title, description, remediation, created, due, status, completed, validated, resolution, validation,
  review, occurrence}, owner, actor) {
  const finding = {finding_id: PREFIX + 'finding_' + key, client_id: CID, framework_assessment_id: assessment.framework_assessment_id,
    definition_id: assessment.definition_id, source: 'CIS Controls v8.1 ' + assessment.definition_id, title, description,
    remediation_title: remediation, remediation_plan: remediation, severity: 'medium', status: completed ? validated ? 'closed' : 'remediated' : 'in_remediation',
    owner_id: owner.user_id, created_at: created, identified_at: created, created_by: actor.user_id, updated_at: validated || completed || created,
    due_date: due, decision_history: [], related_links: [{kind: 'framework_assessments', id: assessment.framework_assessment_id}]};
  if (review && occurrence) Object.assign(finding, {review_id: review.review_id, occurrence_id: occurrence.occurrence_id});
  validateAssignment(db, 'findings', finding);
  db.findings.push(finding);
  const task = {task_id: PREFIX + 'task_' + key, client_id: CID, title: remediation, description,
    source_type: 'finding', source_id: finding.finding_id, finding_id: finding.finding_id,
    framework_assessment_id: assessment.framework_assessment_id, assignee_id: owner.user_id, priority: 'medium', status: 'open',
    created_at: created, created_by: actor.user_id, updated_at: completed || created, due_date: due, resolution: resolution || ''};
  prepareTask(db, task);
  task.status = status;
  if (status !== 'open') Object.assign(task, {started_at: created, started_by: owner.user_id});
  if (completed) Object.assign(task, {status: 'done', completed_at: completed, completed_by: owner.user_id});
  if (validated) {
    Object.assign(finding, {validated_at: validated, validated_by: actor.user_id, closed_at: validated, closed_by: actor.user_id});
    finding.decision_history.push({action: 'validated', by: actor.user_id, at: validated, rationale: validation});
  }
  finding.primary_task_id = task.task_id;
  db.tasks.push(task);
  addLink(assessment, 'findings', finding.finding_id);
  addLink(assessment, 'tasks', task.task_id);
  if (review) {addLink(finding, 'reviews', review.review_id); addLink(task, 'reviews', review.review_id);}
  if (occurrence) {
    occurrence.finding_ids.push(finding.finding_id);
    occurrence.finding_count = occurrence.finding_ids.length;
    occurrence.outcome = 'findings_raised';
    occurrence.conclusion = 'Fictional review identified: ' + title + '. Remediation and independent validation are retained separately.';
  }
  return {finding, task};
}

function remediationHistory(db, assessments, reviews, dates, origin, owner, actor) {
  for (const spec of CURRENT_GAPS) {
    const assessment = assessments.find(row => row.definition_id === spec.id);
    const content = brawndoSafeguardContent(spec.id, assessment.status);
    const review = reviews.find(row => row.framework_safeguards?.includes(spec.id));
    const created = instant(later(origin, dates.day(spec.found)));
    const {finding, task} = findingAndTask(db, {key: spec.key, assessment, title: spec.title,
      description: content.current_implementation, remediation: content.remediation, created, due: dates.day(spec.due),
      status: spec.status, review}, owner, actor);
    finding.severity = spec.severity;
    task.priority = spec.severity;
    if (spec.status === 'blocked') task.resolution = 'Waiting for procurement and department owners to reconcile the provider list; no completion or validation is asserted.';
    for (const item of assessment.items_to_address || []) if (item.state === 'open' && !item.finding_id)
      linkItemFinding(assessment, item.item_id, finding.finding_id, actor.user_id, assessment.last_saved);
    assessment.verification = 'gap_identified';
  }
  for (const spec of RETAINED_CHAINS) {
    const assessment = assessments.find(row => row.definition_id === spec.id);
    const review = reviews.find(row => row.framework_plan_key === spec.plan);
    const occurrence = review?.occurrences.filter(row => dayOf(row.completed_at) <= dates.day(spec.before)).at(-1);
    if (!occurrence) throw new Error('Brawndo retained remediation requires an eligible originating Review occurrence.');
    const completed = dates.instant(spec.completed);
    if (completed < occurrence.completed_at) throw new Error('Brawndo remediation cannot precede its originating Finding.');
    findingAndTask(db, {key: spec.key, assessment, title: spec.title, description: 'Fictional historical exception: ' + spec.title + '.',
      remediation: spec.work, created: occurrence.completed_at, due: shiftedDay(dayOf(completed), -3), status: 'done', completed,
      validated: spec.validated === null ? null : dates.instant(spec.validated), resolution: spec.result, validation: spec.validation, review, occurrence}, owner, actor);
    const recovered = {at: completed, by: owner.user_id, status: 'addressed', implementation: brawndoSafeguardContent(spec.id, 'addressed').current_implementation,
      notes: 'Fictional remediation work completed. ' + spec.result, source: SOURCE};
    assessment.assessment_history.push({at: occurrence.completed_at, by: owner.user_id, status: 'needs_attention',
      implementation: 'Fictional observed exception: ' + spec.title + '.', notes: 'The originating review raised a Finding with owned remediation.', source: SOURCE}, recovered);
    // Observations during the defect must not silently revert to the current implemented narrative.
    for (const event of assessment.assessment_history) if (event.at > occurrence.completed_at && event.at < completed)
      Object.assign(event, {status: 'in_progress', implementation: 'Fictional remediation remained in progress: ' + spec.work + '.', notes: 'The historical Finding remained unresolved at this observation.'});
    assessment.assessment_history.sort((a, b) => a.at.localeCompare(b.at));
    if (spec.validated === null) assessment.verification = 'needs_validation';
  }
}

function closedRiskWork(db, operations, dates, origin, owner, actor) {
  for (const risk of operations.risks) risk.rating_history = [{at: risk.created_at, by: actor.user_id, by_name: actor.name,
    prev_likelihood: null, prev_impact: null, prev_score: null, new_likelihood: risk.likelihood_score, new_impact: risk.impact_score}];
  for (const risk of operations.risks.filter(row => row.status === 'closed')) {
    const created = instant(later(origin, shiftedDay(risk.closed_at, -60)));
    const completed = instant(shiftedDay(risk.closed_at, -5));
    if (completed < created) throw new Error('Brawndo Risk treatment cannot precede identification.');
    const task = {task_id: PREFIX + 'task_close_' + risk.risk_id, client_id: CID, risk_id: risk.risk_id,
      source_type: 'risk', source_id: risk.risk_id, title: 'Complete treatment — ' + risk.title,
      description: risk.treatment_plan, priority: 'medium', status: 'open', assignee_id: risk.owner_id || owner.user_id,
      due_date: dayOf(risk.closed_at), created_at: created, created_by: actor.user_id, updated_at: completed,
      resolution: risk.closure_note};
    prepareTask(db, task);
    Object.assign(task, {status: 'done', started_at: created, started_by: task.assignee_id, completed_at: completed, completed_by: task.assignee_id});
    db.tasks.push(task);
    risk.related_task_ids = [...(risk.related_task_ids || []), task.task_id];
    addLink(risk, 'tasks', task.task_id);
  }
}

function verificationBasis(assessments) {
  for (const row of assessments.filter(item => item.status !== 'not_assessed')) {
    const source = row.guided_assessment_source;
    if (!source?.version || !source.answers) throw new Error('Brawndo verification requires its actual completed native interview source.');
    const criteria = criteriaCatalog.requirements[row.definition_id]?.criteria || [];
    const valid = new Set(criteria.map(item => item.id));
    const questions = visibleQuestions(row.definition_id, source.answers, source.version);
    const matrices = questions.filter(question => question.type === 'matrix');
    const affirmed = matrices.flatMap(question => (question.criterion_ids || []).filter((id, index) =>
      valid.has(id) && source.answers[question.id]?.[question.rows[index]] === 'Yes'));
    row.cis_assessment_criteria = matrices.length ? [...new Set(affirmed)] : row.status === 'addressed' ? [...valid] : [];
    const content = brawndoSafeguardContent(row.definition_id, row.status);
    const current = row.assessment_history.filter(event => event.at === row.last_saved).at(-1);
    if (!current) throw new Error('Brawndo verification requires a dated current assessment observation.');
    Object.assign(current, {verification: row.verification, verification_checklist: row.verification_checklist,
      cis_assessment_criteria: copy(row.cis_assessment_criteria), technology: row.technology,
      owner_id: row.owner_id, process_owner_id: row.process_owner_id, guided_assessment_source: copy(source)});
    current.notes += '\nFictional verification basis: ' + content.evidence_check
      + (row.verification === 'verified' ? ' The scenario owner inspected that synthetic sample and recorded verification.'
        : row.verification === 'needs_validation' ? ' Implementation is reported, while independent validation remains outstanding.' : ' The sample confirms the stated implementation gap; it does not close the Finding.')
      + ' This is an authored Demo observation, not external assurance or browser execution.';
  }
}

function evidenceSpecs(reviews, findings, tasks) {
  return [...reviews.filter(row => row.occurrences.length).map(review => ({key: 'history_' + review.review_id,
    title: review.title + ' — retained occurrence history', linked_type: 'review', linked_id: review.review_id,
    history_occurrence_ids: review.occurrences.map(row => row.occurrence_id),
    relationships: review.occurrences.map(row => ({kind: 'reviews', id: review.review_id, occurrence_id: row.occurrence_id})),
    content_outline: [PROVENANCE, ...review.occurrences.map(row => `${row.due_date} | completed ${dayOf(row.completed_at)} | ${row.completed_by_name} | ${row.outcome} | ${row.conclusion}`)]})),
  ...findings.map(finding => ({key: 'history_' + finding.finding_id, title: finding.title + ' — remediation and validation trail',
    linked_type: 'finding', linked_id: finding.finding_id, relationships: [{kind: 'tasks', id: finding.primary_task_id},
      {kind: 'framework_assessments', id: finding.framework_assessment_id}],
    content_outline: [PROVENANCE, finding.description, 'Identified: ' + finding.created_at, finding.remediation_plan,
      tasks.find(task => task.task_id === finding.primary_task_id)?.resolution || 'Work remains unfinished.',
      finding.validated_at ? 'Validated: ' + finding.validated_at + '. ' + finding.decision_history.at(-1).rationale : 'Independent Finding validation has not completed.']})),
  ...tasks.filter(task => task.risk_id && task.status === 'done').map(task => ({key: 'history_' + task.task_id,
    title: task.title + ' — completed treatment result', linked_type: 'task', linked_id: task.task_id,
    relationships: [{kind: 'risks', id: task.risk_id}], content_outline: [PROVENANCE, task.description, task.resolution,
      'Work completed: ' + task.completed_at + '. Risk closure is a separate retained owner decision.']}))];
}

function result(db, reviewIds, assessmentIds, origin) {
  const reviews = db.reviews.filter(row => reviewIds.has(row.review_id));
  const assessments = db.framework_assessments.filter(row => assessmentIds.has(row.framework_assessment_id));
  const findings = db.findings.filter(row => row.client_id === CID && row.finding_id.startsWith(PREFIX));
  const tasks = db.tasks.filter(row => row.client_id === CID && row.task_id.startsWith(PREFIX));
  return {reviews, assessments, findings, tasks, origin, occurrence_count: reviews.reduce((sum, row) => sum + row.occurrences.length, 0),
    evidence_specs: evidenceSpecs(reviews, findings, tasks), reporting_seeded: !!db.cis_demo_scenario_history?.[CID],
    verification_basis: assessments.filter(row => row.status !== 'not_assessed').map(row => ({definition_id: row.definition_id,
      assessment_id: row.framework_assessment_id, at: row.last_saved, by: row.assessed_by, verification: row.verification,
      criteria_ids: copy(row.cis_assessment_criteria || []), question_version: row.guided_assessment_source.version,
      scope: brawndoSafeguardContent(row.definition_id, row.status).scope,
      evidence_check: brawndoSafeguardContent(row.definition_id, row.status).evidence_check, provenance: PROVENANCE}))};
}

export function seedBrawndoHistory(db, {dates, owner, program, operations} = {}) {
  const client = db.clients?.find(row => row.client_id === CID);
  const actor = db.user;
  const workOwner = actorFor(db, typeof owner === 'string' ? owner : owner?.user_id, null);
  if (actor?.workspace_mode !== 'demo' || !['super_admin', 'platform_admin'].includes(actor.role) || !eligible(actor, CID)
    || !workOwner || client?.environment !== 'Demo' || client.status !== 'active' || client.archived || client.archived_at
    || client.framework_settings?.['cis-ig1']?.implementation_group !== 1) throw new Error('Brawndo history requires the active canonical IG1 Demo and existing eligible actors.');
  if (!dates?.anchor || !scheduledDate(dates.anchor) || dates.anchor < instant(RELEASE)
    || !['day', 'instant', 'month'].every(key => typeof dates[key] === 'function')) throw new Error('Brawndo history requires a frozen post-v8.1 scenario clock.');
  if (!program?.assessments?.length || !Array.isArray(program.reviews) || !Array.isArray(operations?.reviews)
    || !Array.isArray(operations.risks)) throw new Error('Build the Brawndo program and operations before history.');
  const allReviews = [...program.reviews, ...operations.reviews];
  const definitions = activeDefinitions('cis-ig1', {implementation_group: 1});
  if (allReviews.some(row => row.client_id !== CID) || program.assessments.some(row => row.client_id !== CID)
    || program.assessments.length !== definitions.length || definitions.some(definition => !program.assessments.some(row => row.definition_id === definition.id))
    || new Set(allReviews.map(row => row.review_id)).size !== allReviews.length) throw new Error('Brawndo history inputs must contain one native IG1 population and distinct same-client parents.');
  const reviewIds = new Set(allReviews.map(row => row.review_id));
  const assessmentIds = new Set(program.assessments.map(row => row.framework_assessment_id));
  if (allReviews.some(row => !db.reviews?.some(saved => saved.client_id === CID && saved.review_id === row.review_id))
    || program.assessments.some(row => !db.framework_assessments?.some(saved => saved.client_id === CID && saved.framework_assessment_id === row.framework_assessment_id)))
    throw new Error('Brawndo history inputs must resolve to their native same-client records.');
  const origin = later(RELEASE, dates.month(-BRAWNDO_SCENARIO_PROFILE.history_months));
  if (allReviews.every(row => row.fixture_history_version === VERSION && row.fixture_history_anchor === dates.anchor))
    return result(db, reviewIds, assessmentIds, origin);
  if (allReviews.some(row => row.occurrences?.length || row.fixture_history_version)
    || db.findings?.some(row => row.client_id === CID && row.finding_id.startsWith(PREFIX)))
    throw new Error('Replace prior Brawndo fixture history explicitly; visitor history must not be overwritten.');
  const staged = {...db};
  for (const kind of Object.keys(ID_FIELDS)) staged[kind] = (db[kind] || []).map(row => row.client_id === CID ? copy(row) : row);
  staged.cis_demo_scenario_history = copy(db.cis_demo_scenario_history || {});
  const assessments = staged.framework_assessments.filter(row => assessmentIds.has(row.framework_assessment_id));
  const reviews = staged.reviews.filter(row => reviewIds.has(row.review_id));
  const stagedOperations = {...operations, risks: staged.risks.filter(row => operations.risks.some(risk => risk.risk_id === row.risk_id))};
  assessmentProgress(staged, assessments, dates, origin, workOwner);
  reviewHistory(staged, reviews, assessments, stagedOperations, dates, origin, workOwner);
  remediationHistory(staged, assessments, reviews, dates, origin, workOwner, actor);
  closedRiskWork(staged, stagedOperations, dates, origin, workOwner, actor);
  verificationBasis(assessments);
  // Refresh the dated requirement status after retained defect/recovery events have been inserted.
  for (const review of reviews) for (const occurrence of review.occurrences) {
    for (const requirement of occurrence.requirement_snapshot || []) {
      const assessment = assessments.find(row => row.definition_id === requirement.definition_id);
      requirement.status = assessment.assessment_history.filter(event => event.at <= occurrence.completed_at).at(-1)?.status || 'not_assessed';
    }
    log(staged, 'reviews', review, occurrence.completed_at, actorFor(staged, occurrence.completed_by, workOwner), 'Review completed',
      {occurrence_id: occurrence.occurrence_id, outcome: occurrence.outcome, finding_count: occurrence.finding_count});
  }
  for (const assessment of assessments) {
    let previous;
    for (const event of assessment.assessment_history) {
      if (event.status !== previous && event.status !== 'not_assessed') log(staged, 'framework_assessments', assessment, event.at, workOwner, 'Framework assessment updated', {status: event.status});
      previous = event.status;
    }
  }
  for (const finding of staged.findings.filter(row => row.client_id === CID && row.finding_id.startsWith(PREFIX))) {
    log(staged, 'findings', finding, finding.created_at, actor, 'Finding raised');
    if (finding.validated_at) log(staged, 'findings', finding, finding.validated_at, actor, 'Finding validated and closed');
  }
  for (const task of staged.tasks.filter(row => row.client_id === CID && row.task_id.startsWith(PREFIX))) {
    log(staged, 'tasks', task, task.created_at, actor, 'Action Item created');
    if (task.started_at) log(staged, 'tasks', task, task.started_at, workOwner, 'Work started');
    if (task.completed_at) log(staged, 'tasks', task, task.completed_at, workOwner, 'Action Item completed');
  }
  seedCisScenarioHistory(staged, staged.clients.find(row => row.client_id === CID), new Date(dates.anchor), {version: CIS_SHOWCASE_VERSION});
  for (const [kind, field] of Object.entries(ID_FIELDS)) {
    const targetIds = new Set(staged[kind].filter(row => row.client_id === CID).map(row => row[field]));
    if ((db[kind] || []).some(row => row.client_id !== CID && targetIds.has(row[field])))
      throw new Error('Brawndo history identity collides with another client.');
  }
  // Commit only after every source/relationship check succeeds, preserving the caller's existing object references.
  for (const [kind, field] of Object.entries(ID_FIELDS)) {
    const existing = new Map((db[kind] || []).map(row => [row[field], row]));
    for (const row of staged[kind].filter(item => item.client_id === CID)) {
      if (existing.has(row[field])) Object.assign(existing.get(row[field]), row);
      else {db[kind] ||= []; db[kind].push(row);}
    }
  }
  db.portfolio_reporting = staged.portfolio_reporting;
  db.cis_demo_scenario_history = staged.cis_demo_scenario_history;
  return result(db, reviewIds, assessmentIds, origin);
}
