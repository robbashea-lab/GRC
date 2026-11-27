import {stable} from '../commandRequests';
import {authorizeDemo} from '../authorization';
import {guardEdit} from '../decisions';
import {write, now} from '../store';
import {action} from '../workflows';
import {occurrenceId} from '../../lib/reviewOccurrences';
import {eligible} from '../assignmentEligibility';
import {PRESTIGE_RISK_FACTS} from './prestigeEightYearRegisters';

const CID = 'demo_prestige', ANCHOR = '2026-11-02T00:00:00.000Z';
const VERSION = 'prestige-current-operational-work-v1', MARKER = 'prestige_current_operational_work_fixture';
const DALE = CID + '_user_0', ROBERT = CID + '_user_1', BRENNAN = CID + '_user_2';
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error('Prestige current work: ' + message); };
const TASKS = [
  {key: 'session-containment', risk: 'session-theft', title: 'Rehearse session-token containment and escalation', priority: 'critical', status: 'in_progress', assignee: BRENNAN, due: '2026-10-30',
    detail: 'Rehearse session revocation, project-access containment and named customer escalation using a controlled exercise. Existing MFA and monitored access remain in operation; this residual-risk exercise is not a new mandatory Control failure.'},
  {key: 'secondary-copy-sample', risk: 'secondary-copy-check', title: 'Extend the secondary-copy format sample', priority: 'high', status: 'open', assignee: BRENNAN, due: '2026-11-02',
    detail: 'Add unusual media formats to the next secondary-copy verification sample. Preserve the completed required media, rights-metadata and retrieval-index restoration tests; this is additional coverage.'},
  {key: 'customer-terms', risk: 'new-customer-terms', title: 'Reconcile new-customer confidentiality terms before use', priority: 'high', status: 'blocked', assignee: DALE, due: '2026-11-05',
    detail: 'Blocked awaiting proposed customer terms. Dale and Nancy must reconcile handling, retention, provider responsibilities and permitted project access before the affected use; proposed terms and proposed use are not already authorized.'},
  {key: 'renewal-cross-references', risk: 'renewal-navigation', title: 'Cross-reference supplier renewal evidence', priority: 'medium', status: 'in_progress', assignee: DALE, due: '2026-11-14',
    detail: 'Cross-reference the existing supplier notice, contract-renewal, annual operating-review and assurance-follow-up records. Keep their separate purposes, decisions and due dates; improving navigation does not complete an outstanding assurance request.'},
  {key: 'ai-brief-refresher', risk: 'ai-brief-training', title: 'Assign the contractor AI public-brief refresher', priority: 'medium', status: 'open', assignee: null, due: '2026-11-26',
    detail: 'Select an accountable owner for this optional contractor refresher, then rehearse approved public-brief examples and prohibited confidential inputs. The deliberate assignment gap does not remove mandatory Control or Policy ownership, approve an AI system, or close its linked Risk.'},
  {key: 'supplier-exit', risk: 'supplier-exit', title: 'Rehearse the supplier exit runbook', priority: 'medium', status: 'open', assignee: DALE, due: '2026-12-03',
    detail: 'Rehearse the documented analytics-provider export, access removal and retention responsibilities. Record exercise results separately from contract renewal or assurance review; this planned work is not completed offboarding.'},
  {key: 'travel-device', risk: 'device-response', title: 'Exercise travel-device handover', priority: 'low', status: 'open', assignee: BRENNAN, due: '2026-12-16',
    detail: 'Exercise alternate-device handover, credential response and custody reconciliation for a travelling creative workstation. Retain existing encryption, managed inventory and customer-media restrictions.'},
  {key: 'cloud-response-options', risk: 'cloud-concentration', title: 'Review the accepted cloud-concentration response options', priority: 'low', status: 'open', assignee: ROBERT, due: '2027-01-15',
    detail: 'Review proportionate response options and the existing recovery, secondary-copy and customer-communication arrangements. This planned Action neither revokes the current time-bound acceptance nor closes the accepted Risk.'},
];
const REVIEW_DATES = {'session-theft': '2026-10-30', 'ai-brief-training': '2026-11-14'};
const DRAFT = {title: 'AI public-brief contractor working instruction', version: '0.1', owner_id: DALE,
  summary: 'PROPOSED ONLY — supplemental working instruction, not an effective or approved Policy.\n\n'
    + 'The proposed contractor refresher would distinguish approved public marketing briefs from customer media, personal information, confidential contracts and credentials, all of which remain prohibited inputs. A named editor would check facts, rights, tone and publication suitability; no autonomous publication or customer decision is proposed.\n\n'
    + 'This proposed addendum supplements the existing approved security-awareness and information-handling documents. It does not replace any of the sixteen effective Policies, authorize a changed AI deployment, supply evidence for a completed SOC criterion, or assert training completion. Required owner, approval and review decisions remain separate.'};

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function unique(db, kind, field, id) {
  const rows = db[kind].filter(row => row[field] === id);
  if (!id || rows.length !== 1 || rows[0].client_id !== CID) fail('a unique same-client ' + kind + ' identity is required.');
  return rows[0];
}
function sourceRisk(db, key, manifest) {
  const fact = PRESTIGE_RISK_FACTS.find(row => row.key === key);
  if (manifest?.risk_ids) {
    const row = unique(db, 'risks', 'risk_id', manifest.risk_ids[key]);
    if (!fact || row.title !== fact.title) fail('the returned Risk map does not match its source fact: ' + key);
    return row;
  }
  const rows = fact && db.risks.filter(row => row.client_id === CID && row.title === fact.title);
  if (!rows || rows.length !== 1) fail('the actual source Risk is missing or ambiguous: ' + key);
  return unique(db, 'risks', 'risk_id', rows[0].risk_id);
}
function nativeWrite(db, kind, body, id) {
  authorizeDemo(db, id ? 'patch' : 'post', id ? [kind, id] : [kind], body);
  guardEdit(kind, body, id ? unique(db, kind, {tasks: 'task_id', policies: 'policy_id', risks: 'risk_id'}[kind], id) : {}, db.user, db);
  return write(db, kind, body, id);
}
function outputRecords(db, manifest) {
  const rows = (map, kind, field) => Object.keys(map).sort().map(key => unique(db, kind, field, map[key]));
  return {risks: rows(manifest.risk_ids, 'risks', 'risk_id'),
    reviews: rows(manifest.review_ids, 'reviews', 'review_id'), tasks: rows(manifest.task_ids, 'tasks', 'task_id'),
    draft: unique(db, 'policies', 'policy_id', manifest.draft_policy_id),
    audit: [...manifest.audit_ids].sort().map(id => unique(db, 'logs', 'audit_id', id))};
}

// Detached source authoring only. Dates below are explicit fictional plans; native recording clocks are unchanged.
export async function createPrestigeCurrentOperationalWork(candidate, {purpose} = {}) {
  if (purpose !== 'current_operational_work_source_qa' || candidate?.clientId !== CID || candidate.anchor !== ANCHOR
    || candidate.db?.user?.workspace_mode !== 'demo' || candidate.db.user.status !== 'active'
    || !['super_admin', 'platform_admin'].includes(candidate.db.user.role)) fail('the explicit purpose, canonical anchor and active native administrator are required.');
  const result = copy(candidate), db = result.db;
  const riskFor = key => sourceRisk(db, key, result.manifest);
  for (const kind of ['clients', 'users', 'risks', 'reviews', 'tasks', 'policies', 'logs', 'evidence', 'framework_assessments', 'organizational_controls'])
    if (!Array.isArray(db[kind])) fail('the native ' + kind + ' collection is required.');
  const clients = db.clients.filter(row => row.client_id === CID), actors = db.users.filter(row => row.user_id === db.user.user_id);
  if (clients.length !== 1 || clients[0].environment !== 'Demo' || clients[0].status !== 'active' || clients[0].archived_at
    || actors.length !== 1 || actors[0].role !== db.user.role || !eligible(actors[0], CID)) fail('retain the canonical Demo client and eligible recording actor.');
  const intent = await digest({version: VERSION, anchor: ANCHOR, tasks: TASKS, reviews: REVIEW_DATES, draft: DRAFT});
  const prior = db[MARKER] || result.currentWorkManifest;
  if (prior) {
    const {receipt_sha256: receipt, ...unsigned} = prior;
    if (prior.version !== VERSION || prior.client_id !== CID || prior.anchor !== ANCHOR || prior.intent_sha256 !== intent
      || receipt !== await digest(unsigned) || db[MARKER] && result.currentWorkManifest && stable(db[MARKER]) !== stable(result.currentWorkManifest)
      || prior.output_records_sha256 !== await digest(outputRecords(db, prior))) fail('current-work retry receipt, intent or native output records changed.');
    return {...result, currentWorkManifest: copy(prior)};
  }
  const own = kind => db[kind].filter(row => row.client_id === CID);
  if (own('framework_assessments').length !== 38 || own('framework_assessments').some(row => row.status !== 'addressed')
    || own('organizational_controls').length !== 25 || own('organizational_controls').reduce((n, row) => n + row.observations.length, 0) !== 31
    || own('evidence').length !== 14 || own('policies').length !== 16 || own('policies').some(row => row.status !== 'approved')
    || own('tasks').length !== 6 || own('tasks').some(row => row.status !== 'done')) fail('use the unchanged completed native cohort before appending current work.');
  const riskIds = Object.fromEntries(TASKS.map(fact => [fact.risk, riskFor(fact.risk).risk_id]));
  for (const fact of TASKS) {
    const risk = riskFor(fact.risk), original = PRESTIGE_RISK_FACTS.find(row => row.key === fact.risk);
    if (risk.status !== original.state || own('tasks').some(row => row.title === fact.title)) fail('preserve the original source Risk and avoid an unreceipted duplicate Action.');
  }
  if (own('policies').some(row => row.title === DRAFT.title)) fail('preserve an existing proposed instruction.');
  const reviewIds = {}, sourceRows = {risks: {}, reviews: {}, new_customer_risk: {
    risk_id: riskIds['new-customer-terms'], status: riskFor('new-customer-terms').status}};
  for (const key of Object.keys(REVIEW_DATES)) {
    const risk = riskFor(key), reviews = db.reviews.filter(row => row.risk_id === risk.risk_id && row.client_id === CID);
    if (reviews.length !== 1 || reviews[0].status !== 'upcoming' || reviews[0].review_type !== 'risk_assessment'
      || reviews[0].review_id !== risk.linked_review_id || !risk.review_cadence || risk.review_cadence === 'none'
      || reviews[0].recurrence !== risk.review_cadence) fail('preserve one scheduled existing native Risk Review.');
    unique(db, 'reviews', 'review_id', reviews[0].review_id);
    reviewIds[key] = reviews[0].review_id;
    sourceRows.risks[key] = copy(risk); sourceRows.reviews[key] = copy(reviews[0]);
  }
  const sourceHash = await digest(db), originalLogIds = new Set(db.logs.map(row => row.audit_id || row.log_id));
  const draft = nativeWrite(db, 'policies', {client_id: CID, ...DRAFT, status: 'draft'});
  const taskIds = {};
  for (const fact of TASKS) {
    const description = fact.detail + (fact.key === 'ai-brief-refresher'
      ? '\nProposed supplemental Policy: ' + draft.policy_id + ' — ' + DRAFT.title + ' (version 0.1; not approved or effective).' : '');
    let task = nativeWrite(db, 'tasks', {client_id: CID, title: fact.title, description, source_type: 'risk',
      source_id: riskIds[fact.risk], risk_id: riskIds[fact.risk], assignee_id: fact.assignee,
      priority: fact.priority, due_date: fact.due, status: 'open'});
    if (fact.status !== 'open') task = nativeWrite(db, 'tasks', {status: fact.status, expected_updated_at: task.updated_at}, task.task_id);
    taskIds[fact.key] = task.task_id;
  }
  for (const [key, due] of Object.entries(REVIEW_DATES)) {
    const risk = riskFor(key);
    nativeWrite(db, 'risks', {next_review: due, expected_updated_at: risk.updated_at}, risk.risk_id);
    const review = unique(db, 'reviews', 'review_id', reviewIds[key]), original = sourceRows.reviews[key];
    if (occurrenceId(review) !== occurrenceId(original) || review.recurrence !== original.recurrence
      || stable(review.occurrences || []) !== stable(original.occurrences || [])) fail('native planning changed retained occurrence or recurrence identity.');
  }
  const started = unique(db, 'reviews', 'review_id', reviewIds['session-theft']);
  const startBody = {occurrence_id: occurrenceId(started)};
  authorizeDemo(db, 'post', ['reviews', started.review_id, 'start'], startBody);
  action(db, 'reviews', started.review_id, 'start', startBody);
  const manifest = {version: VERSION, client_id: CID, anchor: ANCHOR, intent_sha256: intent,
    source_sha256: sourceHash, actor_id: db.user.user_id, recorded_at: now(), task_ids: taskIds,
    risk_ids: riskIds, review_ids: reviewIds, draft_policy_id: draft.policy_id, source_rows: sourceRows,
    audit_ids: db.logs.filter(row => !originalLogIds.has(row.audit_id || row.log_id)).map(row => row.audit_id),
    provenance: 'New fictional current planning facts through native writes; not recovered historical work or completed activity.',
    output_hash_scope: 'Eight source Risks, two existing Reviews, eight new Actions, one proposed draft and new native audit events.'};
  manifest.output_records_sha256 = await digest(outputRecords(db, manifest));
  manifest.receipt_sha256 = await digest(manifest);
  db[MARKER] = copy(manifest);
  return {...result, db, currentWorkManifest: copy(manifest)};
}
