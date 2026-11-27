import {recordUuid} from '../../lib/recordUuid';
import {assessedRisk} from '../../lib/grcWork';
import {reviewSchedule} from '../../lib/reviewOccurrences';
import {allocateRiskId} from '../riskIds';
import {riskSnapshot} from '../risks';
import {stable} from '../commandRequests';
import {PRESTIGE_EIGHT_YEAR_PLAN as plan} from './prestigeEightYear';
import {PRESTIGE_POLICY_DOCUMENT_FACTS, PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY} from './prestigeCurrentGovernance';
import {PRESTIGE_VENDOR_FACTS, PRESTIGE_RISK_FACTS, PRESTIGE_AI_FACTS} from './prestigeEightYearRegisters';

const CID = 'demo_prestige', START = '2018-11-02', ANCHOR = '2026-11-02';
const VERSION = 'prestige-eight-year-history-v1', MARKER = 'prestige_eight_year_history_fixture';
const MODEL = 'prestige_current_model_fixture', PROVENANCE = 'newly_authored_synthetic_history';
const ANCHOR_INSTANT = ANCHOR + 'T00:00:00.000Z';
const DALE = CID + '_user_0', ROBERT = CID + '_user_1', BRENNAN = CID + '_user_2';
const copy = value => JSON.parse(JSON.stringify(value));
const at = day => day === ANCHOR ? ANCHOR_INSTANT : day + 'T12:00:00.000Z';
const fail = message => { throw new Error('Private Prestige history: ' + message); };

// These are NEW fictional imported facts, not recovery of old records or file bytes.
const CHAINS = [
  {key: 'SHARED-ACCESS', risk: 'shared-delivery', criterion: 'CC6.1', title: 'Shared delivery credentials',
    failure: '2019-04-12', action_due: '2019-08-30', action_completed: '2019-09-20', validation: '2019-10-11', finding_closed: '2019-10-18',
    gap: 'A sample of customer delivery folders still accepted a shared credential after the named project owner changed.',
    correction: 'Replace shared grants with named project membership and expiring delivery links; reconcile the affected folders.',
    validation_note: 'Dale independently sampled the reconciled folders and tested that the former shared credential could no longer retrieve media.'},
  {key: 'CONTRACTOR-REMOVAL', risk: 'contractor-removal', criterion: 'CC6.2', title: 'Contractor removal lag',
    failure: '2020-04-17', action_due: '2020-09-04', action_completed: '2020-09-18', validation: '2020-10-09', finding_closed: '2020-10-23',
    gap: 'The contractor end-date register and one project membership disagreed; ending the engagement had not revoked the application session.',
    correction: 'Reconcile sponsorship and end dates, remove the stale membership and revoke the remaining application sessions.',
    validation_note: 'Dale checked the personnel event against identity disablement and attempted a new project session after revocation.'},
  {key: 'RECOVERY-DEPENDENCY', risk: 'historical-recovery-dependency', criterion: 'A1.2', title: 'Missing restoration dependency',
    failure: '2021-10-22', action_due: '2022-02-18', action_completed: '2022-03-04', validation: '2022-03-18', finding_closed: '2022-04-01',
    gap: 'An isolated restore recovered media objects but omitted a dependency needed to reconstruct the licensing service.',
    correction: 'Add the dependency and its configuration to the recovery inventory and repeat the complete service restore.',
    validation_note: 'Dale reviewed a fresh isolated reconstruction and compared a licensed delivery with its rights metadata; the failed first exercise remains retained.'},
  {key: 'MIGRATION-ROLE', risk: 'migration-role', criterion: 'CC6.1', title: 'Migration role crossed tenant boundaries',
    failure: '2023-11-17', action_due: '2024-08-30', action_completed: '2024-09-06', validation: '2024-10-04', finding_closed: '2024-10-18',
    gap: 'A platform migration role granted broader customer-project access than the intended tenant boundary.',
    correction: 'Narrow the role, remove temporary grants and reconcile every migrated tenant membership before lifting the export pause.',
    validation_note: 'Dale performed separate allowed and denied tenant-access samples after Brennan completed the correction.'},
  {key: 'RETENTION', risk: 'retention-tags', criterion: 'C1.1', title: 'Migrated retention tags incomplete',
    failure: '2023-11-17', action_due: '2024-09-06', action_completed: '2024-09-13', validation: '2024-10-11', finding_closed: '2024-10-18',
    gap: 'Migrated media and approval records did not consistently retain their customer retention classification.',
    correction: 'Reconcile the full affected population to agreed retention terms and correct the missing tags without deleting records.',
    validation_note: 'Dale and Nancy checked fresh classification samples against customer terms and retained the full-population reconciliation result.'},
  {key: 'INDEX-RECOVERY', risk: 'restore-index', criterion: 'A1.3', title: 'Platform index absent from restore',
    failure: '2023-11-17', action_due: '2024-09-13', action_completed: '2024-09-20', validation: '2024-10-11', finding_closed: '2024-10-18',
    gap: 'The platform restore returned objects and rights rows but omitted the metadata index needed for correct retrieval.',
    correction: 'Include the index and its reconstruction procedure in the platform recovery set; retain the failed exercise.',
    validation_note: 'Dale independently retrieved media through the restored application and reconciled rights and index results after the corrective restore.'},
];

// Authored implementation facts, not percentages. Native status rows below carry the dated positions.
const IMPLEMENTED_FROM = {
  'CC1.1': '2018-11-02', 'CC1.2': '2018-11-02', 'CC1.3': '2018-11-02', 'CC2.1': '2018-11-02', 'CC2.2': '2018-11-02',
  'CC1.4': '2019-10-18', 'CC1.5': '2019-10-18', 'CC2.3': '2019-10-18', 'CC6.1': '2019-10-18',
  'CC6.3': '2019-10-18', 'CC7.2': '2019-10-18', 'CC9.2': '2019-10-18',
  'CC3.1': '2020-10-23', 'CC3.2': '2020-10-23', 'CC5.1': '2020-10-23', 'CC6.2': '2020-10-23',
  'CC6.4': '2020-10-23', 'CC6.5': '2020-10-23', 'CC6.6': '2020-10-23', 'CC7.3': '2020-10-23',
  'CC3.3': '2021-10-22', 'CC3.4': '2021-10-22', 'CC4.1': '2021-10-22', 'CC4.2': '2021-10-22',
  'CC5.2': '2021-10-22', 'CC5.3': '2021-10-22', 'CC6.7': '2021-10-22', 'CC6.8': '2021-10-22',
  'CC7.1': '2021-10-22', 'CC7.4': '2021-10-22', 'CC7.5': '2021-10-22', 'CC8.1': '2021-10-22',
  'A1.1': '2021-10-22', 'C1.1': '2021-10-22',
  'CC9.1': '2022-10-21', 'A1.2': '2022-10-21', 'A1.3': '2022-10-21', 'C1.2': '2022-10-21',
};
const PLATFORM_SETBACK = ['CC6.1', 'CC6.3', 'CC8.1', 'A1.2', 'A1.3', 'C1.1'];

// Period-specific authored ratings. None is read from the current 2026 Risk or acceptance decision.
const HISTORICAL_RISKS = {
  'shared-delivery': ['2019-04-12', 4, 4], 'contractor-removal': ['2020-04-17', 4, 4],
  'historical-recovery-dependency': ['2021-10-22', 4, 4],
  'migration-role': ['2023-11-17', 4, 5], 'retention-tags': ['2023-11-17', 4, 4],
  'restore-index': ['2023-11-17', 4, 5], 'retired-creative-review': ['2019-08-12', 3, 3],
  'cloud-concentration': ['2018-11-02', 3, 5], 'regional-network': ['2018-11-02', 3, 3],
  'authorized-download': ['2019-04-12', 3, 4], 'support-misdelivery': ['2019-07-15', 3, 3],
  'archive-retrieval': ['2020-10-23', 2, 3], 'session-theft': ['2020-04-06', 4, 5],
  'secondary-copy-check': ['2018-11-02', 3, 3], 'metadata-quality': ['2021-06-14', 3, 4],
  'supplier-exit': ['2021-06-14', 3, 3], 'device-response': ['2020-05-04', 3, 3],
  'ai-brief-training': ['2023-05-15', 3, 4], 'renewal-navigation': ['2019-11-01', 3, 2],
  'malicious-intake': ['2018-11-02', 3, 3], 'portable-media': ['2018-11-02', 3, 3],
  'new-customer-terms': ['2019-11-01', 3, 4], 'provider-quota': ['2019-11-01', 3, 2],
  'royalty-extract': ['2021-06-14', 3, 4], 'source-code': ['2018-11-02', 3, 3],
  'supplier-notice': ['2019-11-01', 3, 3], 'rights-substitution': ['2019-11-01', 3, 4],
  'ai-rights-extraction-error': ['2021-09-20', 3, 4], 'ai-marketing-disclosure': ['2023-05-15', 3, 4],
  'ai-insecure-code': ['2023-08-21', 3, 4], 'ai-creative-rights': ['2024-04-15', 3, 4],
};
const HISTORICAL_ACCEPTANCE = {
  'cloud-concentration': 'Recovery materials, secondary copies and customer escalation bound the one-year concentration tolerance.',
  'regional-network': 'Alternate communications and remote coverage bound the one-year regional interruption tolerance.',
  'authorized-download': 'Recipient verification, license terms and investigation remain required during the one-year tolerance.',
  'support-misdelivery': 'Recipient confirmation and restricted attachments remain required during the one-year handling tolerance.',
  'archive-retrieval': 'Authorized indexed custody and escalation bound the one-year retrieval-delay tolerance.',
};

async function digest(value) {
  const bytes = new TextEncoder().encode(stable(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
function withoutMarker(db) { const result = {...db}; delete result[MARKER]; return result; }
function uniqueRow(db, kind, field, id) {
  const rows = (db[kind] || []).filter(row => row[field] === id);
  if (typeof id !== 'string' || !id || rows.length !== 1 || rows[0].client_id !== CID)
    fail('a unique same-client ' + kind + ' ID is required.');
  return rows[0];
}
function verifyMaps(db, manifest) {
  const maps = {policy_ids: ['policies', 'policy_id'], review_ids: ['reviews', 'review_id'],
    vendor_ids: ['vendors', 'vendor_id'], risk_ids: ['risks', 'risk_id'],
    ai_ids: ['ai_systems', 'ai_system_id'], assessment_ids: ['framework_assessments', 'framework_assessment_id']};
  for (const [key, [kind, field]] of Object.entries(maps)) {
    const values = Object.values(manifest[key] || {});
    if (!values.length || new Set(values).size !== values.length) fail('missing or repeated native map: ' + key);
    for (const id of values) uniqueRow(db, kind, field, id);
  }
  if (Object.keys(manifest.assessment_ids).length !== 38) fail('all 38 current criteria are required.');
}
function allocator(db) {
  // Record IDs only: no traversal of assessment/portfolio observation content.
  const used = new Set();
  for (const collection of ['policies', 'reviews', 'vendors', 'risks', 'ai_systems', 'framework_assessments', 'findings', 'tasks', 'logs']) {
    for (const row of db[collection] || []) {
      for (const [key, value] of Object.entries(row)) if (key.endsWith('_id') && typeof value === 'string') used.add(value);
      if (collection === 'reviews') for (const occurrence of row.occurrences || []) used.add(occurrence.occurrence_id);
    }
  }
  return () => {
    const id = recordUuid();
    if (!id || used.has(id)) fail('generated record ID collided; transaction discarded.');
    used.add(id); return id;
  };
}
function provenance(context, effectiveAt) {
  return {provenance: PROVENANCE, recorded_at: context.recordedAt, recorded_by: context.actor,
    effective_at: effectiveAt, source_boundary: 'New fictional import; no recovered record or historical file bytes asserted.',
    source_context: {criteria: '2017 Trust Services Criteria', criteria_version: '2017',
      points_of_focus_revision: effectiveAt.slice(0, 10) >= '2023-01-16' ? '2022' : null,
      points_of_focus_adopted: effectiveAt.slice(0, 10) >= '2023-01-16',
      points_of_focus_adopted_at: effectiveAt.slice(0, 10) >= '2023-01-16' ? '2023-01-16T00:00:00.000Z' : null,
      questionnaire_version: null, current_guided_answers_copied: false}};
}
function historicalRiskState(key, day) {
  const fact = HISTORICAL_RISKS[key];
  if (!fact || typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < fact[0])
    fail('Risk snapshot requires an authored fact at this historical date: ' + key);
  const chain = CHAINS.find(item => item.risk === key);
  const validated = chain && day >= chain.validation;
  const accepted = !!HISTORICAL_ACCEPTANCE[key] && day >= '2022-10-21' && day < '2023-10-21';
  const expired = !!HISTORICAL_ACCEPTANCE[key] && day >= '2023-10-21';
  return riskSnapshot(assessedRisk({likelihood_score: validated ? 2 : fact[1], impact_score: fact[2],
    assessment_rationale: 'New fictional historical exposure: ' + key + '. ' + (validated ? 'Separate validation supports the reduced likelihood.' : 'The dated exposure remains under review.'),
    likelihood_rationale: validated ? 'Fresh validation supports likelihood 2/5; no current 2026 rating is substituted.' : 'Authored period likelihood ' + fact[1] + '/5; later controls are not presumed.',
    impact_rationale: 'Authored period impact ' + fact[2] + '/5 on customer media, rights or service operation.',
    treatment: accepted ? 'accept' : 'mitigate',
    notes: 'Synthetic imported Risk position. ' + (expired ? 'The separate 2022 one-year tolerance has expired; this position does not carry it forward.' : 'Treatment work, validation and acceptance remain separate decisions.'),
    status: accepted ? 'accepted' : validated ? 'assessed' : 'in_progress',
    acceptance_rationale: accepted ? HISTORICAL_ACCEPTANCE[key] : null,
    acceptance_expires_at: accepted ? at('2023-10-21') : null,
    accepted_by: accepted ? ROBERT : null, acceptance_date: accepted ? at('2022-10-21') : null}));
}
function riskExecution(context, parent, day) {
  const id = parent.risk_id || parent.historical_risk_id;
  if (!id) return {};
  const key = context.riskKeys[id];
  const chain = CHAINS.find(item => item.risk === key);
  const beforeDay = parent.historical_phase === 'validation' ? chain?.failure : day;
  const before = historicalRiskState(key, beforeDay), after = historicalRiskState(key, day);
  return {risk_before: before, risk_after: after,
    risk_review_recommendation: parent.historical_phase === 'validation' ? 'Closure Recommended'
      : after.status === 'in_progress' ? 'Additional Action Required' : 'Reviewed — No Change'};
}
function log(db, context, kind, id, day, action, meta = {}) {
  const timestamp = at(day);
  const actor = db.users.find(user => user.user_id === context.actor);
  db.logs.push({audit_id: context.id(), client_id: CID, entity_type: kind, entity_id: id,
    action, at: timestamp, user_id: context.actor, user_name: actor.name, user_email: actor.email,
    meta: {simulated: true, ...meta, ...provenance(context, timestamp)}});
}
function completedOccurrence(context, parent, due, completed, narrative, extra = {}) {
  if (due < START || at(completed) < due + 'T00:00:00.000Z' || at(completed) > ANCHOR_INSTANT)
    fail('historical completion is outside its original obligation.');
  const schedule = reviewSchedule({...parent, due_date: due, recurrence_due_date: null});
  const links = Object.fromEntries(['policy_id', 'vendor_id', 'risk_id', 'ai_system_id', 'framework_assessment_id']
    .filter(key => parent[key]).map(key => [key, parent[key]]));
  // An explicit execution snapshot: never spread the current 2026 parent/answers into a past completion.
  const risk = riskExecution(context, parent, completed);
  return {occurrence_id: context.id(), review_id: parent.review_id, client_id: CID,
    title: parent.title, owner_id: parent.owner_id, review_type: parent.review_type,
    ...(parent.governance_context ? {governance_context: copy(parent.governance_context)} : {}),
    recurrence: parent.recurrence || 'none', ...links,
    ...(parent.historical_risk_id ? {historical_risk_id: parent.historical_risk_id, related_links: copy(parent.related_links || [])} : {}),
    due_date: due, status: 'completed', ...schedule, completed_at: at(completed), completion_date: at(completed), updated_at: at(completed),
    completed_by: DALE, completed_by_name: 'Dale Doback', notes: narrative, conclusion: narrative,
    no_evidence_reason: 'New fictional imported history; original historical file bytes are unavailable and current files are not attached to old completions.',
    outcome: parent.review_type === 'risk_assessment' ? risk.risk_review_recommendation || 'Reviewed — No Change' : 'no_findings', ...risk,
    finding_count: extra.finding_count || 0, evidence: [],
    ...(parent.policy_subject ? {policy_subject: copy(parent.policy_subject)} : {}),
    ...extra, ...provenance(context, at(completed))};
}
function archivedReview(db, context, title, due, completed, narrative, extra = {}) {
  const review = {review_id: context.id(), client_id: CID, title, review_type: 'requirements',
    owner_id: DALE, recurrence: 'none', due_date: due, status: 'completed',
    governance_context: {category: 'organizational', cadence_source: 'organization_defined',
      rationale: 'New fictional historical exercise for the licensing service, not recovered source activity.',
      cadence_rationale: 'Management selected this dated exercise; it is not a universal SOC mandate.'},
    created_at: at(due), updated_at: at(completed), ...provenance(context, at(due)), ...extra};
  const occurrence = completedOccurrence(context, review, due, completed, narrative);
  review.occurrences = [occurrence]; review.current_occurrence_id = occurrence.occurrence_id;
  review.completion_date = occurrence.completion_date; review.next_review_date = null;
  db.reviews.push(review);
  log(db, context, 'reviews', review.review_id, completed, 'Review completed', {occurrence_id: occurrence.occurrence_id});
  return {review, occurrence};
}
function addMilestones(db, context) {
  return Object.fromEntries(plan.milestones.map(milestone => {
    const outcome = milestone.key === 'recovery-discipline'
      ? 'The first exercise exposes a missing dependency. Remediation and independent retest follow as separate 2022 events; this 2021 completion does not close the issue.'
      : milestone.outcome;
    const {review, occurrence} = archivedReview(db, context, milestone.title, milestone.date, milestone.date,
      milestone.narrative + ' ' + outcome);
    return [milestone.key, {review_id: review.review_id, occurrence_id: occurrence.occurrence_id,
      effective_at: at(milestone.date), narrative: milestone.narrative, outcome}];
  }));
}
function addPolicyHistory(db, manifest, context) {
  const subjects = {};
  for (const fact of PRESTIGE_POLICY_DOCUMENT_FACTS) {
    const policy = uniqueRow(db, 'policies', 'policy_id', manifest.policy_ids[fact.key]);
    const security = fact.key === 'policy-information-security-policy';
    const versions = security ? [['2018-11-02', '1'], ['2020-10-16', 'synthetic-2020'], ['2024-10-11', 'synthetic-2024']]
      : [['2019-11-01', 'synthetic-2019'], ['2024-10-11', 'synthetic-2024']];
    const historical = versions.map(([day, version], index) => {
      const summary = security && index === 0
        ? 'Initial service boundary, named responsibilities and customer-media confidentiality; shared accounts and supplier review gaps remain open.'
        : day < '2023-01-16'
          ? 'Initial organization-selected ' + policy.title + ' procedure for the licensing service; manual registers and owner checks, without later platform or AI capabilities.'
          : 'Revised ' + policy.title + ' procedure after tenant-access, retention and complete-service recovery lessons; correction and independent validation remain separate.';
      const subject = {subject_id: context.id(), client_id: CID, policy_id: policy.policy_id, title: policy.title,
        version, summary, owner_id: policy.owner_id, named_approver: {name: 'Robert Doback'},
        captured_at: context.recordedAt, basis: {type: 'external', reference: 'New fictional historical subject; original bytes unavailable',
          document_version: version, verification: 'No historical file bytes verified'}, ...provenance(context, at(day))};
      const event = {action: 'approved', at: at(day), by: ROBERT, by_name: 'Robert Doback', subject,
        ...provenance(context, at(day))};
      const reviewed = new Date(at(day)); reviewed.setUTCDate(reviewed.getUTCDate() + 7);
      archivedReview(db, context, policy.title + ' — retained ' + version + ' review', reviewed.toISOString().slice(0, 10),
        reviewed.toISOString().slice(0, 10), 'Dale reviewed this retained subject after Robert approved it. Review completion does not approve a Policy or verify missing document bytes.',
        {policy_id: policy.policy_id, policy_subject: copy(subject)});
      return event;
    });
    policy.approval_history = [...historical, ...(policy.approval_history || [])];
    subjects[fact.key] = historical.map(event => copy(event.subject));
  }
  return subjects;
}
function adoptionFor(review, manifest) {
  if (review.ai_system_id) {
    const fact = PRESTIGE_AI_FACTS.find(item => manifest.ai_ids[item.key] === review.ai_system_id);
    if (!fact || fact.adopted < fact.availableSince) fail('AI history requires a known available adoption.');
    return {start: fact.adopted, end: ANCHOR, description: fact.restrictions};
  }
  if (review.vendor_id) {
    const fact = PRESTIGE_VENDOR_FACTS.find(item => manifest.vendor_ids[item.key] === review.vendor_id);
    if (!fact) fail('Vendor Review has no adoption fact.');
    return {start: fact.adopted, end: fact.inactiveSince || ANCHOR,
      description: 'Relationship operation and requested assurance are separate; no received supplier report is asserted.'};
  }
  if (review.risk_id) {
    const ai = PRESTIGE_AI_FACTS.find(item => manifest.risk_ids[item.riskKey] === review.risk_id);
    if (ai) return {start: ai.adopted, end: ANCHOR, description: ai.restrictions};
    const key = Object.keys(manifest.risk_ids).find(item => manifest.risk_ids[item] === review.risk_id);
    const chain = CHAINS.find(item => item.risk === key);
    const risk = PRESTIGE_RISK_FACTS.find(item => item.key === key);
    const vendor = PRESTIGE_VENDOR_FACTS.find(item => item.key === risk?.vendorKey);
    const introduced = HISTORICAL_RISKS[key]?.[0];
    if (!introduced) fail('Risk Review has no authored historical introduction.');
    return {start: [introduced, vendor?.adopted || START].sort().pop(), end: chain?.finding_closed || vendor?.inactiveSince || ANCHOR,
      description: 'Review likelihood, impact and response separately from treatment work and acceptance or closure decisions.'};
  }
  return {start: START, end: ANCHOR,
    description: 'Management-selected review of the licensing service against the 2017 Trust Services Criteria; no external attestation.'};
}
function addRecurringHistory(db, manifest, context) {
  const ids = [];
  // Only the supplied current parents, before any new historical parent is added.
  const parents = db.reviews.filter(row => row.client_id === CID && !row.provenance);
  const riskAssessment = manifest.review_ids['soc-risk-assessment'];
  for (const parent of parents) {
    if (!['monthly', 'quarterly', 'semiannual', 'annual', 'custom'].includes(parent.recurrence)) continue;
    const range = adoptionFor(parent, manifest);
    const currentDue = (parent.recurrence_due_date || parent.due_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(currentDue)) fail('current Review has no valid due date.');
    let due = '2018' + currentDue.slice(4), cycles = 0;
    const occurrences = [];
    while (due <= range.end && due < currentDue) {
      if (++cycles > 120) fail('historical recurrence exceeded its finite bound.');
      const schedule = reviewSchedule({...parent, due_date: due, recurrence_due_date: null});
      const next = schedule.next_review_date?.slice(0, 10);
      if (!next || next <= due) fail('native recurrence did not advance.');
      if (due >= range.start && due >= START) {
        const completed = parent.review_id === riskAssessment && due === '2023-10-22' ? '2024-01-19' : due;
        if (completed <= range.end && at(completed) <= ANCHOR_INSTANT) {
          const narrative = due < '2023-01-16'
            ? 'Historical operating review: ' + range.description + ' Manual ownership, access and restoration samples reflect the service at this date; later questionnaires and revised 2022 Points of Focus are not backdated.'
            : 'Historical operating review: ' + range.description + ' Revised 2022 Points of Focus were considered from 2023-01-16; the 2023 platform setback and later validation remain separately retained.';
          const occurrence = completedOccurrence(context, parent, due, completed, narrative);
          occurrences.push(occurrence); ids.push(occurrence.occurrence_id);
          log(db, context, 'reviews', parent.review_id, completed, 'Review completed', {occurrence_id: occurrence.occurrence_id, original_due_date: due});
        }
      }
      due = next;
    }
    parent.occurrences = [...occurrences, ...(parent.occurrences || [])];
  }
  return ids;
}
function recoveryRisk(db, context) {
  // The native allocator normalizes all input tenants: pass an isolated owned slice.
  const owned = {risks: copy(db.risks.filter(row => row.client_id === CID)),
    riskSequences: {[CID]: db.riskSequences?.[CID] || 0}};
  const displayId = allocateRiskId(owned, CID);
  db.riskSequences = {...db.riskSequences, [CID]: owned.riskSequences[CID]};
  const row = assessedRisk({risk_id: context.id(), display_id: displayId, client_id: CID,
    title: 'Historical complete-service restoration dependency',
    description: 'Separate 2021 recovery dependency omitted from an isolated licensing-service restore; not the later 2023 metadata-index failure.',
    category: 'operational', source_type: 'manual', owner_id: BRENNAN, status: 'closed',
    likelihood_score: 2, impact_score: 4, treatment: 'mitigate', treatment_plan: 'Include and independently retest the complete dependency set.',
    created_at: at('2021-10-22'), updated_at: context.recordedAt, closed_at: at('2022-04-01'), closed_by: DALE,
    closure_reason: 'remediated', closure_note: 'The separate corrected dependency was independently validated before historical closure.',
    next_review: null, review_cadence: 'none', related_links: [],
    ...provenance(context, at('2021-10-22'))});
  db.risks.push(row); context.riskKeys[row.risk_id] = 'historical-recovery-dependency'; return row.risk_id;
}
function addChains(db, manifest, context) {
  const chains = {}, historicalRisk = recoveryRisk(db, context);
  for (const fact of CHAINS) {
    const stages = Object.fromEntries(['failure', 'action_due', 'action_completed', 'validation', 'finding_closed'].map(key => [key, at(fact[key])]));
    if (!(stages.failure < stages.action_due && stages.action_due <= stages.action_completed
      && stages.action_completed < stages.validation && stages.validation < stages.finding_closed)) fail('chain stages must remain distinct and ordered.');
    const riskId = fact.risk === 'historical-recovery-dependency' ? historicalRisk : manifest.risk_ids[fact.risk];
    const risk = uniqueRow(db, 'risks', 'risk_id', riskId);
    const assessmentId = manifest.assessment_ids[fact.criterion];
    uniqueRow(db, 'framework_assessments', 'framework_assessment_id', assessmentId);
    const {review, occurrence} = archivedReview(db, context, fact.title + ' — retained failed test', fact.failure, fact.failure,
      fact.gap, {framework_assessment_id: assessmentId, historical_risk_id: riskId, historical_phase: 'failure',
        related_links: [{kind: 'risks', id: riskId}]});
    occurrence.finding_count = 1; occurrence.outcome = 'findings_raised'; occurrence.conclusion = 'Failed: ' + fact.gap;
    const findingId = context.id(), taskId = context.id();
    const refs = {review_id: review.review_id, occurrence_id: occurrence.occurrence_id,
      framework_assessment_id: assessmentId, risk_id: riskId};
    db.findings.push({finding_id: findingId, client_id: CID, title: fact.title, description: fact.gap,
      severity: 'high', status: 'closed', owner_id: DALE, created_by: context.actor, created_at: stages.failure,
      updated_at: context.recordedAt, due_date: fact.action_due, remediation_plan: fact.correction,
      primary_task_id: taskId, ...refs, validated_at: stages.validation, validated_by: DALE,
      closed_at: stages.finding_closed, closed_by: DALE, related_links: [{kind: 'risks', id: riskId}],
      decision_history: [{action: 'validated', at: stages.validation, by: DALE, rationale: fact.validation_note,
        ...provenance(context, stages.validation)}, {action: 'closed', at: stages.finding_closed, by: DALE,
        rationale: 'Closure follows separate successful validation.', ...provenance(context, stages.finding_closed)}],
      ...provenance(context, stages.failure)});
    db.tasks.push({task_id: taskId, client_id: CID, title: fact.correction, description: fact.gap,
      source: 'Finding remediation', source_type: 'finding', source_id: findingId, finding_id: findingId,
      ...refs, status: 'done', priority: 'high', assignee_id: BRENNAN, due_date: fact.action_due,
      created_at: stages.failure, created_by: context.actor, updated_at: context.recordedAt,
      completed_at: stages.action_completed, completion_date: stages.action_completed, completed_by: BRENNAN,
      resolution: fact.correction, ...provenance(context, stages.action_completed)});
    risk.related_links = [...(risk.related_links || []), {kind: 'findings', id: findingId}, {kind: 'tasks', id: taskId}];
    const initialRating = historicalRiskState(fact.risk, fact.failure);
    const validatedRating = historicalRiskState(fact.risk, fact.validation);
    risk.rating_history = [{at: stages.failure, by: BRENNAN, by_name: 'Brennan Huff',
      prev_likelihood: null, prev_impact: null, new_likelihood: initialRating.likelihood_score, new_impact: initialRating.impact_score, prev_score: null,
      rationale: 'New fictional initial exposure while the failed condition remained present: ' + fact.gap,
      ...provenance(context, stages.failure)}, {at: stages.validation, by: DALE, by_name: 'Dale Doback',
      prev_likelihood: initialRating.likelihood_score, prev_impact: initialRating.impact_score,
      new_likelihood: validatedRating.likelihood_score, new_impact: validatedRating.impact_score, prev_score: initialRating.risk_score,
      rationale: 'New fictional post-correction position following the separate validation; impact remains material.',
      ...provenance(context, stages.validation)}, ...(risk.rating_history || [])];
    risk.decision_history = [{action: 'assessed', at: stages.failure, by: BRENNAN, rationale: fact.gap,
      ...provenance(context, stages.failure)}, {action: 'closed', at: stages.finding_closed, by: DALE,
      reason: 'remediated', note: fact.validation_note, ...provenance(context, stages.finding_closed)}, ...(risk.decision_history || [])];
    for (const [stage, kind, id] of [['failure', 'findings', findingId], ['action_due', 'tasks', taskId],
      ['action_completed', 'tasks', taskId], ['validation', 'findings', findingId], ['finding_closed', 'findings', findingId]])
      log(db, context, kind, id, fact[stage], 'Synthetic imported ' + stage, {finding_id: findingId, task_id: taskId});
    const validation = archivedReview(db, context, fact.title + ' — independent validation', fact.validation, fact.validation,
      fact.validation_note, {framework_assessment_id: assessmentId, historical_risk_id: riskId, historical_phase: 'validation',
        related_links: [{kind: 'risks', id: riskId}]});
    chains[fact.key] = {finding_id: findingId, task_id: taskId, risk_id: riskId, ...refs,
      validation_review_id: validation.review.review_id, validation_occurrence_id: validation.occurrence.occurrence_id,
      ...stages, recorded_at: context.recordedAt, recorded_by: context.actor, provenance: PROVENANCE};
  }
  return chains;
}
function addHistoricalAcceptances(db, manifest, context) {
  for (const [key, rationale] of Object.entries(HISTORICAL_ACCEPTANCE)) {
    const risk = uniqueRow(db, 'risks', 'risk_id', manifest.risk_ids[key]);
    risk.decision_history = [{action: 'accepted', by: ROBERT, at: at('2022-10-21'), rationale,
      expires_at: at('2023-10-21'), ...provenance(context, at('2022-10-21'))},
    {action: 'acceptance_expired', by: DALE, at: at('2023-10-21'),
      rationale: 'The one-year synthetic historical tolerance expired; later reviews do not inherit it or a future current decision.',
      ...provenance(context, at('2023-10-21'))}, ...(risk.decision_history || [])];
    log(db, context, 'risks', risk.risk_id, '2022-10-21', 'Synthetic historical Risk accepted', {rationale, expires_at: at('2023-10-21')});
    log(db, context, 'risks', risk.risk_id, '2023-10-21', 'Synthetic historical Risk acceptance expired');
  }
}
function addAssessmentPositions(db, manifest, context) {
  for (const [definition, id] of Object.entries(manifest.assessment_ids)) {
    const row = uniqueRow(db, 'framework_assessments', 'framework_assessment_id', id);
    const positions = plan.milestones.filter(item => item.key !== 'anchor').map(milestone => {
      const implementedFrom = IMPLEMENTED_FROM[definition];
      if (!implementedFrom) fail('criterion has no authored historical implementation fact.');
      const affected = (definition === 'CC6.1' && milestone.key === 'foundation')
        || (definition === 'CC6.2' && milestone.key === 'remote-contractors' && milestone.date < implementedFrom)
        || (['A1.2', 'A1.3'].includes(definition) && milestone.key === 'recovery-discipline')
        || (PLATFORM_SETBACK.includes(definition) && milestone.key === 'customer-platform-setback');
      const status = affected ? 'needs_attention' : milestone.date >= implementedFrom ? 'addressed' : 'in_progress';
      const outcome = milestone.key === 'recovery-discipline'
        ? 'The missing dependency remains open at this position; corrective work and separate validation follow in 2022.' : milestone.outcome;
      return {at: at(milestone.date), by: DALE, status, implemented_from: at(implementedFrom),
        implementation: definition + ' — ' + (status === 'addressed'
          ? 'Implemented at this historical position; the authored initial implementation date is ' + implementedFrom + '. '
          : status === 'needs_attention' ? 'An adverse test or gap requires attention at this position. '
            : 'The practice remains incomplete at this position; the later implementation date is not backdated. ')
          + historicalPractice(definition, milestone.date) + ' ' + milestone.narrative + ' Position: ' + outcome,
        notes: 'Synthetic historical position against the 2017 Trust Services Criteria. '
          + (milestone.date < '2023-01-16' ? 'No revised 2022 Points of Focus or current guided questionnaire asserted.' : 'Revised 2022 Points of Focus considered from 2023-01-16.'),
        historical_position: true, ...provenance(context, at(milestone.date))};
    });
    row.assessment_history = [...positions, ...(row.assessment_history || [])];
  }
}
function historicalPractice(definition, date) {
  const later = date >= '2024-10-18';
  const practices = {
    CC1: ['Robert assigns service responsibilities and escalation; Dale records ownership and Nancy records customer promises.',
      'Robert reviews accountability and resourcing separately from Dale’s operating checks; management retains responsibility for unresolved exceptions.'],
    CC2: ['Owners maintain a service/account register and communicate media-handling expectations through project briefings.',
      'Dale reconciles source records and named owners; Nancy checks customer notifications and rights restrictions before operational changes.'],
    CC3: ['Dale records access, supplier and service-recovery exposures with likelihood and impact; coverage remains incomplete.',
      'Dale includes platform, supplier and approved AI-use changes; Robert records residual acceptance separately from treatment completion.'],
    CC4: ['Dale begins owner checks and retains exceptions rather than treating a procedure as proof of operation.',
      'Dale samples corrected operation independently, retaining adverse tests and later validations instead of replacing the first result.'],
    CC5: ['Owners document manual authorization and review steps for the small licensing service; implementation remains uneven.',
      'Owners reconcile preventive configuration, operating checks and escalation to the service boundary; supplier controls remain delegated.'],
    CC6: ['Project sponsors check customer media rights and begin named-account and contractor-end-date registers; inherited shared accounts remain a visible gap.',
      'Brennan reconciles workforce and tenant-project grants; Alice supplies personnel events and Nancy checks permitted customer access.'],
    CC7: ['Engineering reviews operational alerts and exercises response and isolated restoration; a backup copy alone is insufficient.',
      'Brennan triages events and recovers the service; Dale checks response and restoration results while Nancy assesses customer communications.'],
    CC8: ['GitHub peer review and rollback notes begin to replace informal deployment; migration exceptions remain separately tracked.',
      'Engineering reviews tests, authorization and rollback against the actual tenant-access and retention effects before release.'],
    CC9: ['Management records supplier dependency and interruption exposure; requested assurance is distinct from received evidence.',
      'Nancy separates commercial renewal from supplier operation and assurance; Robert decides time-bound residual tolerance.'],
    A1: ['Engineering inventories media, database and restoration dependencies; backup existence has not yet established complete-service recoverability.',
      'The recovery procedure covers media, rights records and retrieval index, with independent service-level validation after correction.'],
    C1: ['Nancy identifies confidential media and contractual restrictions; retention and disposal checks remain manual and incomplete.',
      'Nancy reconciles customer classification, retention and holds while Brennan checks authorized versions and copies; deletion is not presumed irreversible.'],
  };
  const practice = practices[definition.split('.')[0]];
  if (!practice) fail('historical criterion has no authored practice.');
  return practice[later ? 1 : 0];
}
function addAdoptions(db, manifest, context) {
  for (const fact of PRESTIGE_VENDOR_FACTS) {
    log(db, context, 'vendors', manifest.vendor_ids[fact.key], fact.adopted, 'Synthetic relationship adopted',
      {status: 'active', description: fact.service});
    if (fact.inactiveSince) log(db, context, 'vendors', manifest.vendor_ids[fact.key], fact.inactiveSince,
      'Synthetic relationship retired', {status: 'inactive', current_disposition_recorded_separately: true});
  }
  for (const fact of PRESTIGE_AI_FACTS) {
    if (fact.adopted < fact.availableSince || fact.adopted > ANCHOR) fail('AI adoption precedes availability or exceeds the anchor.');
    log(db, context, 'ai_systems', manifest.ai_ids[fact.key], fact.adopted, 'Synthetic AI use adopted',
      {available_since: fact.availableSince, restrictions: fact.restrictions, current_screening_not_backdated: true});
  }
}

// Detached, copied transaction only. Installation, Evidence and portfolio trend materialization are separate owners.
export async function createPrestigeEightYearHistory(currentModel, {clock, purpose} = {}) {
  const parsedClock = new Date(clock);
  if (purpose !== 'eight_year_history_source_qa' || !Number.isFinite(+parsedClock) || parsedClock.toISOString().slice(0, 10) !== ANCHOR)
    fail('an explicit anchor clock and source-only purpose are required.');
  if (!currentModel?.db || !currentModel.backup || currentModel.manifest?.client_id !== CID
    || currentModel.manifest.anchor?.slice(0, 10) !== ANCHOR) fail('the actual current-model envelope is required.');
  const input = copy(currentModel), db = input.db, model = input.manifest;
  const {receipt_sha256: modelHash, ...modelReceipt} = model;
  if (modelHash !== await digest(modelReceipt) || stable(db[MODEL]) !== stable(model)
    || model.source_sha256 !== await digest(input.backup)) fail('current-model source or receipt binding changed.');
  verifyMaps(db, model);
  const intentHash = await digest({version: VERSION, plan, chains: CHAINS,
    policies: PRESTIGE_POLICY_DOCUMENT_FACTS, boundary: PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY,
    vendors: PRESTIGE_VENDOR_FACTS, risks: PRESTIGE_RISK_FACTS, ai: PRESTIGE_AI_FACTS,
    implemented_from: IMPLEMENTED_FROM, platform_setback: PLATFORM_SETBACK,
    historical_risks: HISTORICAL_RISKS, historical_acceptance: HISTORICAL_ACCEPTANCE});
  const prior = db[MARKER];
  if (prior) {
    const {receipt_sha256: receipt, ...unsigned} = prior;
    if (receipt !== await digest(unsigned) || prior.model_receipt_sha256 !== modelHash || prior.intent_sha256 !== intentHash
      || prior.state_sha256 !== await digest(withoutMarker(db))
      || stable(input.historyManifest) !== stable(prior)) fail('history retry state, intent or provenance changed.');
    return input;
  }
  const currentState = {...db}; delete currentState[MODEL];
  if (input.historyManifest || model.state_sha256 !== await digest(currentState)) fail('history must start from the unchanged current-model result.');
  return buildHistory(input, modelHash, intentHash);
}

async function buildHistory(input, modelHash, intentHash) {
  const db = input.db;
  const context = {id: allocator(db), actor: db.user?.user_id, recordedAt: new Date().toISOString(),
    riskKeys: Object.fromEntries(Object.entries(input.manifest.risk_ids).map(([key, id]) => [id, key]))};
  if (!context.actor || !Array.isArray(db.users) || db.users.filter(user => user.user_id === context.actor).length !== 1)
    fail('the actual retained import actor is required.');
  for (const collection of ['reviews', 'findings', 'tasks', 'risks', 'logs']) if (!Array.isArray(db[collection])) fail('native collection missing: ' + collection);
  const occurrenceIds = addRecurringHistory(db, input.manifest, context);
  const milestones = addMilestones(db, context);
  const policySubjects = addPolicyHistory(db, input.manifest, context);
  const chains = addChains(db, input.manifest, context);
  addHistoricalAcceptances(db, input.manifest, context);
  addAssessmentPositions(db, input.manifest, context);
  addAdoptions(db, input.manifest, context);
  const manifest = {version: VERSION, client_id: CID, start: START + 'T00:00:00.000Z', anchor: ANCHOR_INSTANT,
    provenance: PROVENANCE, recorded_at: context.recordedAt, recorded_by: context.actor,
    model_receipt_sha256: modelHash, source_sha256: input.manifest.source_sha256, intent_sha256: intentHash,
    milestones, chains, recurring_occurrence_ids: occurrenceIds, policy_subjects: policySubjects,
    implemented_from: copy(IMPLEMENTED_FROM), platform_setback_criteria: [...PLATFORM_SETBACK],
    unknown_historical_policy_details: copy(PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY),
    historical_risk_ids: {'historical-recovery-dependency': chains['RECOVERY-DEPENDENCY'].risk_id},
    limitations: ['New fictional history, not recovery of old protected records.', 'No historical document bytes or Evidence created.',
      'No current guided answers backdated.', 'Current native command timestamps and actors retained.',
      'No Control observations or portfolio reporting observations modified.', 'No installation, native persistence, browser or release proof.'],
    state_sha256: await digest(db)};
  manifest.receipt_sha256 = await digest(manifest);
  db[MARKER] = copy(manifest);
  return {...input, db, historyManifest: copy(manifest)};
}
