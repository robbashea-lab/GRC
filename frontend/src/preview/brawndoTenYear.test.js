/* DEMO - SYNTHETIC DATA. Ten-year Brawndo operating validation.
 *
 * Operates the Brawndo reference client for ten simulated years through the same
 * Demo adapter request paths the UI uses. A Security Program Manager works the
 * program weekly: Reviews on time, late, missed and caught up; Findings, Actions
 * and validation; CIS IG1 reassessment; Evidence; Risk, Vendor and Policy cycles;
 * people and scope changes. Quarterly checkpoints verify that Dashboard numbers
 * equal their drill-downs, registers and source records, that history is never
 * rewritten, that references stay intact and that Brawndo stays Brawndo-only.
 *
 * The browser demo keeps its store in sessionStorage. Ten years of history exceed
 * that quota, so this harness substitutes an unbounded Storage and records the
 * simulated date on which a real browser would begin rejecting saves.
 */
import axios from 'axios';
import {performance} from 'perf_hooks';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import {registerSignals} from '../lib/registerSignals';
import {riskMatchesView} from '../lib/riskRegister';
import {vendorSignals} from '../lib/vendorGovernance';
import {matchesAssessment} from '../lib/frameworkWorkspace';
import {cisSummary} from '../lib/cisVerification';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
  chars() { let n = 0; for (const [k, v] of this.map) n += k.length + v.length; return n; }
}
const storage = new MemoryStorage();
Object.defineProperty(window, 'sessionStorage', {configurable: true, value: storage});
// Measured Chromium 141 per-origin Web Storage quota (UTF-16 code units).
const BROWSER_QUOTA_CHARS = 5242880;

const START = '2026-09-28', END = process.env.SIM_END || '2036-09-29';
const CID = 'demo_brawndo', JOE = 'demo_owner_brawndo', CAMACHO = 'demo_brawndo_user_1', FRITO = 'demo_brawndo_user_2', ADMIN = 'demo_admin';
const OTHER_CLIENT = 'demo_initech';
const DAY = 86400000;
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const day = v => (v ? String(v).slice(0, 10) : null);
const clone = v => JSON.parse(JSON.stringify(v));
const OPEN_FINDING = ['open', 'in_remediation', 'remediated'];
const TASK_DONE = ['done', 'cancelled'];
let today = START;
function setClock(d) { today = d; jest.setSystemTime(new Date(d + 'T14:00:00Z')); }
const yearIndex = d => Math.min(9, Math.floor((Date.parse(d) - Date.parse(START)) / (365.2425 * DAY)));

// Deterministic program behaviour (mulberry32).
function mulberry32(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20260928);
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
// Year-by-year operating discipline: stabilizing, strong, degraded (turnover),
// recovery, scope growth, operational failure, audit year, vendor gap, policy lapses, mature.
const DISCIPLINE = [0.8, 0.9, 0.55, 0.72, 0.88, 0.7, 0.92, 0.8, 0.66, 0.9];
const SLOW = [1, 0.9, 1.7, 1.3, 1, 1.4, 0.9, 1.1, 1.3, 1];
const LAG = [[1, 3], [1, 2], [3, 10], [2, 5], [1, 3], [2, 6], [1, 2], [1, 4], [2, 7], [1, 3]];
const EVIDENCE_RATE = [0.6, 0.75, 0.35, 0.55, 0.7, 0.6, 0.85, 0.7, 0.5, 0.75];

// ---------------------------------------------------------------- API boundary
const api = axios.create({adapter: previewAdapter});
const timings = new Map();
const rejections = [];
const expectedRejections = [];
const template = url => { const [, kind, id, action] = url.split('/'); return '/' + kind + (id ? '/:id' : '') + (action ? '/' + action : ''); };
async function call(method, url, data, params, {expectFailure = false, label} = {}) {
  const started = performance.now();
  const key = method.toUpperCase() + ' ' + template(url);
  try {
    const res = method === 'get' ? await api.get(url, {params}) : method === 'delete' ? await api.delete(url, {data}) : await api[method](url, data);
    if (expectFailure) rejections.push({today, method, url, label, detail: 'UNEXPECTED SUCCESS'});
    return res.data;
  } catch (error) {
    const detail = error.response?.data?.detail || error.message;
    if (expectFailure) { expectedRejections.push({today, label, detail}); return {rejected: true, detail}; }
    rejections.push({today, method, url, label, detail});
    return null;
  } finally {
    const ms = performance.now() - started, t = timings.get(key) || {n: 0, ms: 0, max: 0};
    t.n++; t.ms += ms; t.max = Math.max(t.max, ms); timings.set(key, t);
  }
}
const get = (url, params) => call('get', url, null, params);
const raw = () => JSON.parse(storage.getItem(STORE_KEY));
let evidenceSeq = 0;
async function upload(linked_type, linked_id, title, extra = {}) {
  const text = `DEMO - SYNTHETIC DATA\nBrawndo\n${title}\nCollected ${today}\nItem ${++evidenceSeq}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const row = await call('post', '/evidence', {client_id: CID, linked_type, linked_id, filename: `${slug}-${today}.txt`, mime_type: 'text/plain', content_base64: btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))), ...extra});
  if (row) { report.evidence.uploaded++; ledger.evidence.set(row.evidence_id, {linked_type, linked_id, created_at: row.created_at, occurrence_id: extra.occurrence_id || null, year: yearIndex(today)}); }
  return row;
}

// ------------------------------------------------------------------ ledgers
const ledger = {occurrences: new Map(), assessments: new Map(), findingDecisions: new Map(), policyApprovals: new Map(), riskDecisions: new Map(), evidence: new Map(), expectedDue: new Map(), year1: null};
const report = {
  reviews: {completions: 0, onTime: 0, late: 0, maxLateDays: 0, lateByYear: Array(10).fill(0), completionsByYear: Array(10).fill(0), boundarySequences: {}, catchUps: 0, reassigned: 0, oneTime: 0},
  findings: {raisedReview: 0, raisedCis: 0, raisedIndependent: 0, validated: 0, reopened: 0, representation: []},
  tasks: {done: 0, started: 0, dueExtensions: 0, reassigned: 0, stalledWeeks: 0},
  evidence: {uploaded: 0},
  cis: {timeline: {}, checkpoints: []},
  risks: {events: []}, vendors: {events: []}, policies: {events: []}, people: {events: []}, systems: {events: []},
  checkpoints: [], discrepancies: [], observations: [], volume: [], quotaExceededOn: null, isolation: {}, integrity: [], history: {},
};
const discrepancy = (area, detail) => report.discrepancies.push({today, area, ...detail});
const observe = (area, detail) => report.observations.push({today, area, ...detail});
function ledgerOccurrence(reviewId, occurrence) {
  const map = ledger.occurrences.get(reviewId) || new Map();
  if (map.has(occurrence.occurrence_id)) discrepancy('reviews', {issue: 'duplicate occurrence id returned', reviewId, occurrence: occurrence.occurrence_id});
  map.set(occurrence.occurrence_id, clone(occurrence));
  ledger.occurrences.set(reviewId, map);
}
function ledgerAssessment(row) { ledger.assessments.set(row.framework_assessment_id, clone(row.assessment_history)); }

// ------------------------------------------------------------- operator state
const departed = new Set();
const reviewPlans = new Map(), taskPlans = new Map(), validationPlans = new Map(), catchUp = new Set();
const riskPlan = new Map(); // risk_id -> [{after, change, outcome}]
const vendorPlan = {skipAssurance: new Map()}; // vendor_id -> until date
const createdIds = {};

function planReview(r) {
  const p = DISCIPLINE[yearIndex(today)], u = rnd();
  if (catchUp.has(r.review_id) || u < p) return today;
  if (u < p + (1 - p) * 0.7) return addDays(today, 7 * between(1, 5));
  return addDays(today, 7 * between(6, 16));
}
function findingRate(r) {
  const base = ['access', 'vendor', 'backup', 'bcp_dr', 'vulnerability'].includes(r.review_type) ? 0.16 : 0.08;
  return base * ([2, 5, 8].includes(yearIndex(today)) ? 1.8 : 1);
}
const SLA = {critical: 30, high: 60, medium: 90, low: 120};
function severityDraw() { const u = rnd(); return u < 0.35 ? 'low' : u < 0.75 ? 'medium' : u < 0.95 ? 'high' : 'critical'; }

async function raiseReviewFinding(r, scripted) {
  const severity = scripted?.severity || severityDraw();
  const due = addDays(today, SLA[severity]);
  const f = await call('post', `/reviews/${r.review_id}/create-finding`, {
    occurrence_id: r.current_occurrence_id, request_id: `sim-${r.review_id}-${today}`,
    title: scripted?.title || `${r.title}: exception identified ${today}`, description: 'Recorded during the Review occurrence.',
    remediation_title: scripted?.remediation || `Remediate ${r.title.toLowerCase()} exception (${today})`, severity, due_date: due,
    owner_id: departed.has(r.owner_id) ? null : r.owner_id || null,
  }, null, {label: 'create review finding'});
  if (f) report.findings.raisedReview++;
  return f;
}

function riskReviewBody(r) {
  const plans = riskPlan.get(r.risk_id) || [];
  const next = plans.find(p => !p.used && p.after <= today);
  if (!next) return {risk_assessment: {}, risk_outcome: 'Reviewed — No Change'};
  next.used = true;
  report.risks.events.push({today, risk: r.risk_id, change: next.change, via: 'Risk Review completion'});
  return {risk_assessment: next.change, risk_outcome: next.outcome || 'Additional Action Required'};
}

async function executeReview(r) {
  const id = r.review_id, oid = r.current_occurrence_id;
  if (r.status !== 'in_progress') {
    const started = await call('post', `/reviews/${id}/start`, {occurrence_id: oid}, null, {label: 'start review ' + r.title});
    if (!started) return null;
  }
  if (rnd() < EVIDENCE_RATE[yearIndex(today)]) await upload('review', id, `${r.title} - ${r.period}`, {occurrence_id: oid});
  const scripted = reviewFindingScripts.find(s => !s.used && s.review(r) && s.after <= today);
  if (scripted) scripted.used = true;
  if (scripted || rnd() < findingRate(r)) await raiseReviewFinding(r, scripted);
  const body = {occurrence_id: oid, ...(r.risk_id ? riskReviewBody(r) : {})};
  const result = await call('post', `/reviews/${id}/complete`, body, null, {label: 'complete review ' + r.title});
  if (!result) return null;
  const o = result.occurrence, y = yearIndex(today);
  ledgerOccurrence(id, o);
  report.reviews.completions++; report.reviews.completionsByYear[y]++;
  const lateDays = (Date.parse(today) - Date.parse(day(o.due_date))) / DAY;
  if (lateDays > 0) { report.reviews.late++; report.reviews.lateByYear[y]++; report.reviews.maxLateDays = Math.max(report.reviews.maxLateDays, lateDays); catchUp.add(id); }
  else { report.reviews.onTime++; catchUp.delete(id); }
  if (o.period === undefined || o.status !== 'completed') discrepancy('reviews', {issue: 'occurrence snapshot incomplete', id});
  const expected = ledger.expectedDue.get(id);
  if (expected) {
    const seq = report.reviews.boundarySequences[id] ||= {title: r.title, recurrence: r.recurrence, due: [], mismatches: []};
    seq.due.push(day(o.due_date));
    if (day(o.due_date) !== expected.next) seq.mismatches.push({expected: expected.next, actual: day(o.due_date)});
    expected.next = nextExpected(expected.next, r.recurrence, expected.anchor);
    if (result.review.status !== 'completed' && day(result.review.due_date) !== expected.next) seq.mismatches.push({nextExpected: expected.next, nextActual: day(result.review.due_date)});
  }
  if (r.vendor_id && (r.vendor_purpose || 'vendor') === 'vendor') { await refreshAssurance(r.vendor_id); await activateVendor(r.vendor_id); }
  if (r.recurrence === 'none' || !r.recurrence) report.reviews.oneTime++;
  return result.review;
}

async function workReviews() {
  const reviews = await get('/reviews', {client_id: CID});
  for (const first of reviews || []) {
    let r = first, guard = 0;
    while (r && ['upcoming', 'in_progress'].includes(r.status) && day(r.due_date) && day(r.due_date) <= addDays(today, 6) && guard++ < 4) {
      if (departed.has(r.owner_id)) break;
      const key = r.review_id + '|' + r.current_occurrence_id;
      if (!reviewPlans.has(key)) reviewPlans.set(key, planReview(r));
      if (reviewPlans.get(key) > today) break;
      if (catchUp.has(r.review_id) && guard > 1) report.reviews.catchUps++;
      r = await executeReview(r);
    }
  }
}

function planTask(t) {
  const base = {critical: [2, 5], high: [3, 9], medium: [5, 14], low: [8, 22]}[t.priority] || [5, 14];
  const weeks = Math.max(1, Math.round(between(...base) * SLOW[yearIndex(today)]));
  return {start: addDays(today, 7 * Math.floor(weeks / 3)), done: addDays(today, 7 * weeks), extend: rnd() < 0.15 ? between(30, 90) : 0};
}
async function workTasks() {
  const tasks = await get('/tasks', {client_id: CID});
  for (const t of tasks || []) {
    if (TASK_DONE.includes(t.status)) continue;
    if (departed.has(t.assignee_id || t.owner_id)) { report.tasks.stalledWeeks++; continue; }
    if (!taskPlans.has(t.task_id)) taskPlans.set(t.task_id, planTask(t));
    const plan = taskPlans.get(t.task_id);
    let version = t.updated_at;
    if (plan.extend && !plan.extended && day(t.due_date) && day(t.due_date) <= today && plan.done > today) {
      const changed = await call('patch', `/tasks/${t.task_id}`, {due_date: addDays(today, plan.extend), expected_updated_at: version}, null, {label: 'extend action'});
      plan.extended = true;
      if (changed) { version = changed.updated_at; report.tasks.dueExtensions++; }
    }
    if (t.status === 'open' && plan.start <= today) {
      const started = await call('patch', `/tasks/${t.task_id}`, {status: 'in_progress', expected_updated_at: version}, null, {label: 'start action'});
      if (started) { version = started.updated_at; report.tasks.started++; t.status = 'in_progress'; }
    }
    if (['in_progress', 'blocked'].includes(t.status) && plan.done <= today) {
      if (rnd() < 0.35) await upload('task', t.task_id, `Remediation evidence - ${t.title}`);
      const done = await call('patch', `/tasks/${t.task_id}`, {status: 'done', expected_updated_at: version}, null, {label: 'complete action'});
      if (done) report.tasks.done++;
    }
  }
}
// Contract renewals and expired Risk acceptances are re-decided with the program's usual discipline.
const upkeepPlans = new Map();
async function governanceUpkeep() {
  for (const v of (await get('/vendors', {client_id: CID})) || []) {
    if (v.status === 'inactive' || !v.contract_renewal || day(v.contract_renewal) > addDays(today, 21)) continue;
    const key = 'contract|' + v.vendor_id + '|' + day(v.contract_renewal);
    if (!upkeepPlans.has(key)) upkeepPlans.set(key, planReview({review_id: key}));
    if (upkeepPlans.get(key) > today) continue;
    const term = v.criticality === 'critical' ? 730 : 365;
    const saved = await call('patch', `/vendors/${v.vendor_id}`, {contract_renewal: addDays(day(v.contract_renewal) < today ? today : day(v.contract_renewal), term), expected_updated_at: v.updated_at}, null, {label: 'renew contract'});
    if (saved) report.vendors.events.push({today, vendor: v.name, event: 'contract renewed', late: day(v.contract_renewal) < today});
  }
  for (const r of (await get('/risks', {client_id: CID})) || []) {
    if (r.status !== 'accepted' || !r.acceptance_expires_at || day(r.acceptance_expires_at) > today) continue;
    const key = 'acceptance|' + r.risk_id + '|' + day(r.acceptance_expires_at);
    if (!upkeepPlans.has(key)) upkeepPlans.set(key, planReview({review_id: key}));
    if (upkeepPlans.get(key) > today) continue;
    await acceptRisk(r.risk_id, addDays(today, 365), 'Acceptance re-evaluated at expiry; compensating controls confirmed.');
  }
}
async function validateFindings() {
  const findings = await get('/findings', {client_id: CID});
  for (const f of (findings || []).filter(f => f.status === 'remediated')) {
    if (!validationPlans.has(f.finding_id)) validationPlans.set(f.finding_id, addDays(today, 7 * between(...LAG[yearIndex(today)])));
    if (validationPlans.get(f.finding_id) > today) continue;
    const r = await call('post', `/findings/${f.finding_id}/validate`, {rationale: `Validated ${today}: corrective evidence inspected.`, spawn_next: true, expected_updated_at: f.updated_at}, null, {label: 'validate finding'});
    if (r) { report.findings.validated++; ledger.findingDecisions.set(f.finding_id, clone(r.decision_history)); validationPlans.delete(f.finding_id); }
  }
}

// --------------------------------------------------------------- vendors
async function refreshAssurance(vendorId) {
  const v = await get(`/vendors/${vendorId}`);
  if (!v || v.status === 'inactive' || !v.assurance_required) return;
  const hold = vendorPlan.skipAssurance.get(vendorId);
  if (hold && hold > today) { report.vendors.events.push({today, vendor: v.name, event: 'assurance refresh skipped (program lapse)'}); return; }
  const records = [];
  for (const a of v.assurance_records || []) {
    if (a.required === false) { records.push(a); continue; }
    const e = await upload('vendor', vendorId, `${v.name} ${a.type} ${today.slice(0, 4)}`);
    records.push({...a, received_at: today, refresh_due: addDays(today, 365), evidence_ids: e ? [e.evidence_id] : a.evidence_ids});
  }
  const saved = await call('patch', `/vendors/${vendorId}`, {assurance_records: records, expected_updated_at: v.updated_at}, null, {label: 'refresh assurance ' + v.name});
  if (saved) report.vendors.events.push({today, vendor: v.name, event: 'assurance refreshed', types: records.map(a => a.type)});
}

// ----------------------------------------------------------- CIS helpers
const AID = id => `fw_${CID}_assessment_${id}`;
async function assess(id, patch, {evidence = false, label} = {}) {
  const row = await get(`/framework_assessments/${AID(id)}`);
  if (!row) return null;
  if (evidence) await upload('framework_assessment', AID(id), `CIS ${id} validation record`);
  const saved = await call('patch', `/framework_assessments/${AID(id)}`, {...patch, expected_last_assessed: row.last_assessed ?? null}, null, {label: label || 'assess ' + id});
  if (saved) {
    ledgerAssessment(saved);
    (report.cis.timeline[id] ||= []).push({today, status: saved.status, evidence});
  }
  return saved;
}
async function cisFinding(id, {title, severity, remediation, due, assignee, syncFindingDue = false, delay}) {
  const f = await call('post', `/framework_assessments/${AID(id)}/findings`, {title, severity, remediation_title: remediation, request_id: `sim-${id}-${today}`, description: title}, null, {label: 'raise CIS finding ' + id});
  if (!f) return null;
  report.findings.raisedCis++;
  (report.cis.timeline[id] ||= []).push({today, finding: f.finding_id, severity});
  const task = (await get('/tasks', {client_id: CID})).find(t => t.finding_id === f.finding_id);
  const patch = {due_date: due, ...(assignee ? {assignee_id: assignee} : {})};
  const saved = await call('patch', `/tasks/${task.task_id}`, {...patch, expected_updated_at: task.updated_at}, null, {label: 'plan CIS action ' + id});
  if (syncFindingDue) {
    const current = await get(`/findings/${f.finding_id}`);
    await call('patch', `/findings/${f.finding_id}`, {due_date: due, expected_updated_at: current.updated_at}, null, {label: 'set CIS finding target ' + id});
  }
  if (delay) taskPlans.set(task.task_id, delay);
  return {finding: f, task: saved || task};
}
const narrative = (id, text) => `${text} Verified ${today}.`;

// ---------------------------------------------------------- boundary Reviews
function nextExpected(d, recurrence, anchor) {
  const months = {monthly: 1, quarterly: 3, semiannual: 6, annual: 12}[recurrence];
  if (!months) return null;
  const [y, m] = d.split('-').map(Number), total = m - 1 + months, year = y + Math.floor(total / 12), month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(anchor.month_end ? last : Math.min(anchor.day, last)).padStart(2, '0')}`;
}
const BOUNDARY = [
  {title: 'Monthly Firewall Rule Review', review_type: 'configuration', recurrence: 'monthly', due: '2026-10-31', owner: FRITO},
  {title: 'Monthly Privileged Access Check', review_type: 'access', recurrence: 'monthly', due: '2027-01-29', owner: CAMACHO},
  {title: 'Monthly Backup Job Exception Review', review_type: 'backup', recurrence: 'monthly', due: '2026-10-30', owner: JOE},
  {title: 'Semiannual ERP Access Recertification', review_type: 'access', recurrence: 'semiannual', due: '2027-02-28', owner: CAMACHO},
  {title: 'Quarterly Security Metrics Report', review_type: 'management', recurrence: 'quarterly', due: '2026-12-31', owner: JOE},
  {title: 'Annual Leap-Day Key Rotation Attestation', review_type: 'configuration', recurrence: 'annual', due: '2028-02-29', owner: FRITO},
  {title: 'Annual Penetration Test Readout', review_type: 'penetration_test', recurrence: 'annual', due: '2026-11-15', owner: JOE},
  {title: '2027 Cyber Insurance Renewal Questionnaire', review_type: 'management', recurrence: 'none', due: '2027-04-30', owner: JOE},
];
async function createBoundaryReviews() {
  for (const b of BOUNDARY) {
    const row = await call('post', '/reviews', {client_id: CID, title: b.title, review_type: b.review_type, recurrence: b.recurrence, due_date: b.due, owner_id: b.owner,
      governance_context: {category: 'organizational', rationale: 'Ten-year validation boundary schedule.', cadence_source: 'organization_defined', cadence_rationale: 'Selected to exercise calendar boundaries.'}}, null, {label: 'create boundary review'});
    if (!row) continue;
    createdIds[b.title] = row.review_id;
    if (b.recurrence !== 'none') {
      const last = new Date(Date.UTC(+b.due.slice(0, 4), +b.due.slice(5, 7), 0)).getUTCDate();
      ledger.expectedDue.set(row.review_id, {next: b.due, anchor: {day: +b.due.slice(8, 10), month_end: +b.due.slice(8, 10) === last}});
    }
  }
}

// ------------------------------------------------------------ scripted events
const reviewFindingScripts = [
  {after: '2029-10-01', review: r => r.vendor_id === 'demo_brawndo_vendor_0' && (r.vendor_purpose || 'vendor') === 'vendor', title: 'Sentinel Recovery security assurance expired and was not renewed', severity: 'high', remediation: 'Obtain current Sentinel Recovery security assurance'},
  {after: '2032-01-26', review: r => r.baseline_key === 'restore', title: 'Restore test failed: immutable backup copy unavailable', severity: 'critical', remediation: 'Restore immutable copy and repeat restore test'},
];
async function reassign(kind, id, field, to) {
  const row = await get(`/${kind}/${id}`);
  if (!row) return null;
  const saved = await call('patch', `/${kind}/${id}`, {[field]: to, expected_updated_at: row.updated_at, ...(kind === 'reviews' ? {expected_occurrence_id: row.current_occurrence_id} : {})}, null, {label: `reassign ${kind}`});
  if (saved) report.people.events.push({today, event: 'reassigned', kind, id, field, to});
  return saved;
}
async function reassignFrom(user, to, share = 1) {
  const open = await get(`/users/${user}/open_assignments`, {client_id: CID});
  let moved = 0;
  for (const item of open?.items || []) {
    if (rnd() > share) continue;
    const field = {reviews: 'owner_id', tasks: 'assignee_id', findings: 'owner_id', risks: 'owner_id', vendors: 'business_owner_id', policies: 'owner_id', assets: 'owner_id', framework_assessments: 'owner_id', requirements: 'owner_id'}[item.kind];
    if (!field) continue;
    if (item.kind === 'framework_assessments') {
      const row = await get(`/framework_assessments/${item.id}`);
      const saved = await call('patch', `/framework_assessments/${item.id}`, {owner_id: to, expected_last_assessed: row.last_assessed ?? null}, null, {label: 'reassign safeguard'});
      if (saved) { ledgerAssessment(saved); moved++; }
      continue;
    }
    if (await reassign(item.kind, item.id, field, to)) { moved++; if (item.kind === 'tasks') report.tasks.reassigned++; if (item.kind === 'reviews') report.reviews.reassigned++; }
  }
  return {before: open?.total, moved};
}

const EVENTS = [
  {on: START, name: 'boundary reviews', run: createBoundaryReviews},
  // Year 0: stabilizing. CIS gaps without Findings are tracked; Risk acceptance lapses briefly.
  {on: '2026-10-05', name: 'CIS 3.5 assessed partial, no Finding yet', run: () => assess('3.5', {status: 'in_progress', technology: 'Disposal vendor (no certificates)', implementation: narrative('3.5', 'Retired laptops collected by a recycling vendor. No certificates of destruction retained.')})},
  {on: '2027-01-04', name: 'Acceptable Use Policy revised and approved', run: () => revisePolicy('demo_brawndo_policy-acceptable-use-policy', '2.1')},
  {on: '2027-01-11', name: 'linked annual Policy Reviews established', run: establishPolicyReviews},
  {on: '2027-02-01', name: 'CIS 17.2 Finding raised', run: () => cisFinding('17.2', {title: 'Incident contact list names former insurer and MSP numbers', severity: 'medium', remediation: 'Update incident contact list and publish', due: '2027-03-01', syncFindingDue: true})},
  {on: '2027-02-22', name: 'RISK-003 acceptance lapsed checkpoint', run: () => checkpoint('acceptance lapsed')},
  {on: '2027-03-01', name: 'RISK-003 re-accepted', run: () => acceptRisk('demo_brawndo_risk_2', '2028-03-01', 'Alternate recovery provider still under evaluation; quarterly monitoring continues.')},
  {on: '2027-03-01', name: 'CIS 17.2 addressed', run: () => assess('17.2', {status: 'addressed', implementation: narrative('17.2', 'Contact list updated with current insurer and MSP escalation numbers; published on the intranet.')}, {evidence: true})},
  {on: '2027-04-05', name: 'CIS 1.1 partial after remediation', run: () => assess('1.1', {status: 'in_progress', implementation: narrative('1.1', 'Plant-floor tablets enrolled in Intune. Network gear and BYOD not yet inventoried.')})},
  {on: '2027-05-03', name: 'CIS 3.5 Finding raised', run: () => cisFinding('3.5', {title: 'Secure disposal lacks certificates of destruction', severity: 'medium', remediation: 'Require certificates of destruction from the disposal vendor', due: '2027-07-30'})},
  {on: '2027-06-07', name: 'CIS 11.4 immutable copy implemented', run: () => assess('11.4', {status: 'addressed', implementation: narrative('11.4', 'Immutable, isolated backup copy configured with retention lock; restore from isolated copy tested.')}, {evidence: true})},
  {on: '2027-06-07', name: 'Plant OT network enters scope', run: () => createAsset({name: 'Plant OT network (HMI/SCADA)', asset_type: 'network', criticality: 'critical', owner_id: FRITO, location: 'Plant floor', description: 'Production line controllers and HMI workstations; newly in scope.'})},
  {on: '2027-09-06', name: 'CIS 4.2 Finding raised (long remediation)', run: () => cisFinding('4.2', {title: 'No documented network device configuration standard or backups', severity: 'high', remediation: 'Document network configuration standard and automate backups', due: '2027-12-01', assignee: FRITO, delay: {start: '2027-10-04', done: '2031-03-03', extend: 120}})},
  {on: '2027-10-04', name: 'annual CIS sweep', run: () => cisSweep({include: ['14.5', '14.7', '14.8', '8.1', '10.3', '4.7']})},
  {on: '2027-11-01', name: 'CIS 1.1 implemented with evidence', run: () => assess('1.1', {status: 'addressed', implementation: narrative('1.1', 'All asset classes inventoried; monthly reconciliation against EDR and DHCP.')}, {evidence: true})},
  {on: '2027-12-06', name: 'year-1 snapshot', run: snapshotYearOne},
  // Year 1: strong. Independent Finding; new critical Risk left untreated.
  {on: '2028-01-10', name: 'CIS 3.5 implemented', run: () => assess('3.5', {status: 'addressed', implementation: narrative('3.5', 'Certificates of destruction retained for every disposal batch.')}, {evidence: true})},
  {on: '2028-02-07', name: 'CIS 5.3 Finding raised', run: () => cisFinding('5.3', {title: 'No process disables dormant accounts after 45 days', severity: 'medium', remediation: 'Automate dormant account disablement', due: '2028-05-01', syncFindingDue: true})},
  {on: '2028-03-06', name: 'leap-year checkpoint', run: () => checkpoint('leap year February')},
  {on: '2028-04-03', name: 'new critical OT Risk identified', run: () => createRisk('ot', {title: 'Plant OT network is flat and unsegmented', description: 'Ransomware could spread from office to production controllers.', likelihood_score: 4, impact_score: 5, owner_id: FRITO, treatment: 'mitigate', review_cadence: 'quarterly', next_review: '2028-07-03'})},
  {on: '2028-05-01', name: 'independent Finding (management observation)', run: independentFinding},
  {on: '2028-06-05', name: 'RISK-001 closed after treatment', run: () => closeRisk('demo_brawndo_risk_0', 'remediated', 'Recovery dependencies validated in two consecutive restore tests.')},
  {on: '2028-09-04', name: 'CIS 5.3 implemented', run: () => assess('5.3', {status: 'addressed', implementation: narrative('5.3', 'Dormant accounts disabled automatically at 45 days; weekly report reviewed.')}, {evidence: true})},
  // Year 2: degraded. Turnover; missed Reviews; stale validation; assurance lapse; RISK-002 worsens.
  {on: '2028-10-02', name: 'annual CIS sweep skipped (degraded year)', run: async () => observe('cis', {event: 'annual sweep skipped'})},
  {on: '2029-01-15', name: 'IT Lead departs', run: fritoDeparts},
  {on: '2029-02-12', name: 'partial reassignment', run: async () => report.people.events.push({today, event: 'partial reassignment', ...(await reassignFrom(FRITO, JOE, 0.6))})},
  {on: '2029-03-04', name: 'RISK-002 worsens at next review', run: async () => riskPlan.set('demo_brawndo_risk_1', [{after: today, change: {likelihood_score: 4, impact_score: 4, assessment_rationale: 'Standing vendor Global Administrator plus staff turnover increased exposure.'}}])},
  {on: '2029-03-11', name: 'new IT Lead Contact (no platform account)', run: () => createContact({name: 'Upgrayedd', role: 'IT Lead', title: 'IT Manager', email: 'upgrayedd@brawndo.example.test'})},
  {on: '2029-04-02', name: 'degraded checkpoint', run: () => checkpoint('degraded peak')},
  {on: '2029-04-09', name: 'raise Finding on safeguard still owned by departed IT Lead', run: departedOwnerFinding},
  {on: '2029-06-03', name: 'remaining reassignment', run: async () => report.people.events.push({today, event: 'remaining reassignment', ...(await reassignFrom(FRITO, CAMACHO, 1))})},
  {on: '2029-07-02', name: 'Sentinel assurance lapse begins', run: async () => vendorPlan.skipAssurance.set('demo_brawndo_vendor_0', '2030-03-02')},
  {on: '2029-09-10', name: 'OT Risk treatment finally started', run: () => riskAction('ot', 'Segment plant OT network from office VLANs', '2030-03-02')},
  // Year 3: recovery. Re-verification of stale safeguards; reopened Finding.
  {on: '2029-10-01', name: 'annual CIS sweep (recovery)', run: () => cisSweep({})},
  {on: '2029-12-03', name: 'CIS 1.1 re-verified with new evidence', run: () => assess('1.1', {implementation: narrative('1.1', 'Inventory reconciled monthly; 212 of 212 managed devices matched to EDR.')}, {evidence: true})},
  {on: '2030-01-06', name: 'wrong Evidence unlinked from CIS 9.2', run: () => wrongEvidence('9.2', 'unlink')},
  {on: '2030-03-02', name: 'Sentinel assurance restored', run: () => refreshAssurance('demo_brawndo_vendor_0')},
  {on: '2030-05-06', name: 'closed Finding reopened', run: reopenFinding},
  {on: '2030-06-02', name: 'OT Risk reduced at next review', run: async () => riskPlan.set(createdIds.risk_ot, [{after: today, change: {likelihood_score: 3, impact_score: 4, assessment_rationale: 'Office-to-OT traffic now filtered; flat segments remain on line 2.'}}])},
  // Year 4: scope growth. New system, new vendor, vendor offboarding, OT failure on CIS 1.1.
  {on: '2030-10-07', name: 'annual CIS sweep', run: () => cisSweep({})},
  {on: '2030-10-07', name: 'ERP enters scope', run: () => createAsset({name: 'ERP (cloud)', asset_type: 'application', criticality: 'critical', owner_id: CAMACHO, location: 'SaaS', description: 'Cloud ERP replacing on-premises finance system.'})},
  {on: '2030-11-04', name: 'new vendor onboarded', run: onboardVendor},
  {on: '2030-11-04', name: 'CIS 1.1 operational failure', run: async () => {
    await assess('1.1', {status: 'needs_attention', implementation: narrative('1.1', 'Unmanaged OT devices discovered on plant VLAN 40 during incident review; not in inventory.')});
    await cisFinding('1.1', {title: 'Unmanaged OT devices discovered on plant VLAN', severity: 'high', remediation: 'Inventory and enroll or isolate unmanaged OT devices', due: '2031-01-05', delay: {start: '2030-12-07', done: '2031-06-02', extend: 60}});
  }},
  {on: '2031-02-03', name: 'duplicate Evidence deleted from CIS 10.2', run: () => wrongEvidence('10.2', 'delete')},
  {on: '2031-04-06', name: 'ERP scope metadata updated', run: async () => { const id = createdIds.asset_erp; const row = await get(`/assets/${id}`); const saved = await call('patch', `/assets/${id}`, {location: 'Azure US-East (vendor hosted)', description: 'Cloud ERP; finance, inventory and payroll modules in scope.', expected_updated_at: row.updated_at}); if (saved) report.systems.events.push({today, event: 'scope metadata changed', id}); }},
  {on: '2031-05-05', name: 'Finance Contact leaves; Legal/Privacy designated', run: contactTurnover},
  {on: '2031-06-01', name: 'Harbor offboarding begins', run: () => vendorStage('demo_brawndo_vendor_2', 'offboarding')},
  {on: '2031-08-04', name: 'CIS 1.1 restored after remediation', run: () => assess('1.1', {status: 'addressed', implementation: narrative('1.1', 'OT devices enrolled or isolated; inventory reconciled weekly during recovery.')}, {evidence: true})},
  {on: '2031-09-01', name: 'Harbor inactive', run: () => vendorStage('demo_brawndo_vendor_2', 'inactive')},
  // Year 5: operational failure (backup). Critical Finding, Risk raised from Finding.
  {on: '2031-10-06', name: 'annual CIS sweep', run: () => cisSweep({})},
  {on: '2031-10-06', name: 'RISK-002 accepted with expiry', run: () => acceptRisk('demo_brawndo_risk_1', '2032-10-04', 'Vendor privileged account constrained by PIM; residual accepted for one year.')},
  {on: '2032-01-05', name: 'Sentinel ownership change', run: () => reassign('vendors', 'demo_brawndo_vendor_0', 'business_owner_id', CAMACHO)},
  {on: '2032-02-02', name: 'backup failure: CIS 11.4 gap and Risk from Finding', run: backupFailure},
  {on: '2032-03-01', name: 'incident checkpoint', run: () => checkpoint('backup incident')},
  {on: '2032-06-07', name: 'CIS 11.4 restored', run: () => assess('11.4', {status: 'addressed', implementation: narrative('11.4', 'Retention lock re-enabled and monitored; restore from immutable copy passed.')}, {evidence: true})},
  {on: '2032-09-06', name: 'OT Risk reduced again', run: async () => riskPlan.set(createdIds.risk_ot, [{after: today, change: {likelihood_score: 2, impact_score: 3, assessment_rationale: 'Full segmentation deployed; monitoring in place.'}}])},
  // Year 6: audit year. Long-running CIS 4.2 finally closes.
  {on: '2032-10-04', name: 'annual CIS sweep', run: () => cisSweep({evidence: 0.9})},
  {on: '2032-12-06', name: 'RISK-002 acceptance renewed after lapse', run: () => acceptRisk('demo_brawndo_risk_1', '2033-12-05', 'Re-accepted after review; compensating controls unchanged.')},
  {on: '2033-02-07', name: 'CIS 4.2 implemented', run: () => assess('4.2', {status: 'addressed', implementation: narrative('4.2', 'Network configuration standard approved; nightly automated backups of all switch and firewall configurations.')}, {evidence: true})},
  {on: '2033-03-06', name: 'Camacho platform role changes', run: async () => { const users = await get('/users'); const u = users.find(x => x.user_id === CAMACHO); const saved = await call('patch', `/users/${CAMACHO}`, {role: 'client_grc_manager', expected_updated_at: u.updated_at ?? null}, null, {label: 'change user role'}); report.people.events.push({today, event: 'role changed', user: CAMACHO, ok: !!saved}); }},
  {on: '2033-07-04', name: 'Core service application leaves scope', run: async () => { const row = await get('/assets/demo_brawndo_asset_3'); const saved = await call('patch', '/assets/demo_brawndo_asset_3', {status: 'retired', expected_updated_at: row.updated_at}); if (saved) report.systems.events.push({today, event: 'retired from scope', id: row.asset_id}); }},
  // Year 7: vendor gap.
  {on: '2033-10-03', name: 'annual CIS sweep', run: () => cisSweep({})},
  {on: '2034-05-01', name: 'RISK-003 closed', run: () => closeRisk('demo_brawndo_risk_2', 'condition_removed', 'Second recovery provider contracted; concentration removed.')},
  {on: '2034-06-05', name: 'attempt to reopen closed Risk, then successor', run: reopenRiskAttempt},
  {on: '2034-10-02', name: 'Northstar SOC 2 now required (missing)', run: requireSoc2},
  // Year 8: policy lapses (handled by lower discipline). Year 9: mature.
  {on: '2034-10-09', name: 'annual CIS sweep (partial)', run: () => cisSweep({share: 0.4})},
  {on: '2035-01-09', name: 'Northstar SOC 2 received', run: () => refreshAssurance('demo_brawndo_vendor_1')},
  {on: '2035-03-05', name: 'OT Risk closed', run: () => closeRisk(createdIds.risk_ot, 'condition_removed', 'Segmentation verified by penetration test.')},
  {on: '2035-10-01', name: 'annual CIS sweep', run: () => cisSweep({evidence: 0.8})},
  {on: '2036-03-03', name: 'AI assistant enters scope', run: () => createAsset({name: 'AI meeting assistant (SaaS)', asset_type: 'saas', criticality: 'medium', owner_id: JOE, location: 'SaaS', description: 'Transcribes internal meetings; data handling reviewed.'})},
];

async function snapshotYearOne() {
  const db = raw();
  const mine = k => db[k].filter(r => r.client_id === CID);
  ledger.year1 = {
    at: today,
    occurrences: mine('reviews').flatMap(r => (r.occurrences || []).filter(o => day(o.completed_at) >= START && day(o.completed_at) <= today).map(o => ({parent: r.review_id, snapshot: clone(o)}))),
    closedFindings: mine('findings').filter(f => f.status === 'closed').map(clone),
    doneTasks: mine('tasks').filter(t => t.status === 'done').map(clone),
    evidence: mine('evidence').map(({content_base64, ...e}) => clone(e)),
    assessmentHistory: Object.fromEntries(mine('framework_assessments').map(a => [a.framework_assessment_id, clone(a.assessment_history)])),
    risks: mine('risks').map(r => ({risk_id: r.risk_id, decision_history: clone(r.decision_history || []), rating_history: clone(r.rating_history || [])})),
    policies: mine('policies').map(p => ({policy_id: p.policy_id, approval_history: clone(p.approval_history || []), decision_history: clone(p.decision_history || [])})),
    vendorOccurrences: mine('reviews').filter(r => r.vendor_id).flatMap(r => (r.occurrences || []).map(o => ({review_id: r.review_id, occurrence_id: o.occurrence_id, completed_at: o.completed_at, evidence: clone(o.evidence)}))),
    fritoCompleted: mine('reviews').flatMap(r => (r.occurrences || []).filter(o => o.completed_by === FRITO).map(o => o.occurrence_id)),
  };
}
async function revisePolicy(id, version) {
  const p = await get(`/policies/${id}`);
  const subject = await call('post', `/policies/${id}/approval-subject`, {version, external_reference: `Brawndo controlled policy register / ${p.title}`, external_version: `Revision ${version}`, expected_updated_at: p.updated_at}, null, {label: 'policy approval basis'});
  if (!subject) return;
  const submitted = await call('post', `/policies/${id}/submit-review`, {expected_updated_at: subject.updated_at}, null, {label: 'policy submit'});
  if (!submitted) return;
  const approved = await call('post', `/policies/${id}/approve`, {approval_request_id: submitted.approval_request_id, comment: `Approved ${today}`}, null, {label: 'policy approve'});
  if (approved) { ledger.policyApprovals.set(id, clone(approved.approval_history)); report.policies.events.push({today, policy: p.title, event: 'revised and approved', version}); }
}
const KEY_POLICIES = ['information-security-policy', 'access-control-identity-management-policy', 'incident-response-policy', 'backup-restoration-policy', 'vendor-third-party-risk-management-policy', 'acceptable-use-policy'];
async function establishPolicyReviews() {
  for (const key of KEY_POLICIES) {
    const p = await get(`/policies/demo_brawndo_policy-${key}`);
    const due = day(p.next_review_date) > today ? day(p.next_review_date) : addDays(today, 30);
    const r = await call('post', '/reviews', {client_id: CID, title: `Annual Policy Review — ${p.title}`, review_type: 'policy', policy_id: p.policy_id, recurrence: 'annual', due_date: due, owner_id: p.owner_id,
      governance_context: {category: 'organizational', rationale: 'Annual policy review with retained occurrence history.', cadence_source: 'organization_defined', cadence_rationale: 'Annual governance review.'}}, null, {label: 'establish policy review'});
    if (r) report.policies.events.push({today, policy: p.title, event: 'linked annual Review established', review_id: r.review_id});
  }
}
async function policyCycle() {
  // Policies without a linked Review: owner reviews and updates dates directly (history only in the audit log).
  const policies = await get('/policies', {client_id: CID});
  for (const p of policies || []) {
    if (p.schedule_from_reviews || ['retired', 'in_review'].includes(p.status) || !p.next_review_date || day(p.next_review_date) > addDays(today, 14)) continue;
    const key = 'policy|' + p.policy_id + '|' + day(p.next_review_date);
    if (!reviewPlans.has(key)) reviewPlans.set(key, planReview({review_id: key}));
    if (reviewPlans.get(key) > today) continue;
    if (p.status === 'approved' && rnd() < 0.3) await revisePolicy(p.policy_id, `${parseInt(p.version, 10) + 1}.0`);
    const fresh = await get(`/policies/${p.policy_id}`);
    const saved = await call('patch', `/policies/${p.policy_id}`, {last_reviewed_at: today, next_review_date: addDays(today, 365), expected_updated_at: fresh.updated_at}, null, {label: 'policy review dates'});
    if (saved) report.policies.events.push({today, policy: p.title, event: 'reviewed (date update)', late: day(p.next_review_date) < today});
  }
}
async function acceptRisk(id, expiry, rationale) {
  const r = await get(`/risks/${id}`);
  const saved = await call('post', `/risks/${id}/accept`, {rationale, expiry_date: expiry, expected_updated_at: r.updated_at}, null, {label: 'accept risk'});
  if (saved) { report.risks.events.push({today, risk: id, event: 'accepted', expiry}); ledger.riskDecisions.set(id, clone(saved.decision_history)); }
}
async function closeRisk(id, reason, note) {
  const r = await get(`/risks/${id}`);
  const saved = await call('post', `/risks/${id}/close`, {reason, note, expected_updated_at: r.updated_at}, null, {label: 'close risk'});
  if (saved) { report.risks.events.push({today, risk: id, event: 'closed', reason}); ledger.riskDecisions.set(id, clone(saved.decision_history)); }
}
async function createRisk(key, body) {
  const r = await call('post', '/risks', {client_id: CID, category: 'operational', source_type: 'manual', ...body}, null, {label: 'create risk'});
  if (r) { createdIds['risk_' + key] = r.risk_id; report.risks.events.push({today, risk: r.risk_id, event: 'identified', score: r.risk_score, level: r.risk_level}); }
}
async function riskAction(key, title, due) {
  const risk = createdIds['risk_' + key];
  const t = await call('post', '/tasks', {client_id: CID, title, source_type: 'risk', source_id: risk, assignee_id: JOE, due_date: due, priority: 'high'}, null, {label: 'risk treatment action'});
  if (t) { await call('post', `/risks/${risk}/link-action-item`, {task_id: t.task_id}); report.risks.events.push({today, risk, event: 'treatment action', task: t.task_id}); }
}
async function reopenRiskAttempt() {
  const r = await get('/risks/demo_brawndo_risk_2');
  const attempt = await call('patch', '/risks/demo_brawndo_risk_2', {status: 'assessed', expected_updated_at: r.updated_at}, null, {expectFailure: true, label: 'reopen closed risk'});
  report.risks.events.push({today, risk: r.risk_id, event: 'reopen attempt', rejected: !!attempt?.rejected, detail: attempt?.detail});
  await createRisk('successor', {title: 'Supplier recovery concentration (recurrence of RISK-003)', description: `Successor to ${r.display_id}; second provider contract lapsed.`, likelihood_score: 2, impact_score: 4, owner_id: CAMACHO, treatment: 'mitigate', review_cadence: 'annual', next_review: '2035-06-04'});
}
async function createAsset(body) {
  const a = await call('post', '/assets', {client_id: CID, status: 'active', ...body}, null, {label: 'create system'});
  if (a) { createdIds['asset_' + (body.name.startsWith('ERP') ? 'erp' : body.name.startsWith('Plant') ? 'ot' : 'ai')] = a.asset_id; report.systems.events.push({today, event: 'entered scope', id: a.asset_id, name: a.name}); }
}
async function createContact(body) {
  const c = await call('post', '/contacts', {client_id: CID, status: 'active', ...body}, null, {label: 'create contact'});
  if (c) report.people.events.push({today, event: 'contact added', name: c.name, role: c.role, linked_user_id: c.linked_user_id || null});
  return c;
}
async function contactTurnover() {
  const rita = await get('/contacts/demo_brawndo_contact_3');
  await call('patch', '/contacts/demo_brawndo_contact_3', {status: 'inactive', expected_updated_at: rita.updated_at}, null, {label: 'contact leaves'});
  await createContact({name: 'Beef Supreme', role: 'Finance Contact', title: 'Controller', email: 'finance@brawndo.example.test'});
  await createContact({name: 'Dr. Lexus', role: 'Legal / Privacy Contact', title: 'General Counsel', email: 'legal@brawndo.example.test'});
  report.people.events.push({today, event: 'Finance Contact replaced; Legal / Privacy designated'});
}
async function fritoDeparts() {
  const before = await get(`/users/${FRITO}/open_assignments`, {client_id: CID});
  const users = await get('/users');
  const u = users.find(x => x.user_id === FRITO);
  const saved = await call('patch', `/users/${FRITO}`, {status: 'disabled', expected_updated_at: u.updated_at ?? null}, null, {label: 'disable departing user'});
  const contact = await get('/contacts/demo_brawndo_contact_2');
  await call('patch', '/contacts/demo_brawndo_contact_2', {status: 'inactive', expected_updated_at: contact.updated_at}, null, {label: 'departing contact'});
  departed.add(FRITO);
  report.people.events.push({today, event: 'IT Lead departed (account disabled, membership retained)', ok: !!saved, openAssignments: before?.total, byKind: Object.fromEntries(Object.entries(before || {}).filter(([k, v]) => typeof v === 'number' && k !== 'total'))});
}
async function departedOwnerFinding() {
  const rows = (await get('/frameworks/cis-ig1', {client_id: CID}))?.assessments || [];
  const owned = rows.find(a => a.owner_id === FRITO && ['in_progress', 'needs_attention', 'addressed'].includes(a.status));
  if (!owned) { observe('people', {event: 'no safeguard still owned by departed user at probe time'}); return; }
  const result = await call('post', `/framework_assessments/${owned.framework_assessment_id}/findings`, {title: `${owned.definition_id} coverage exception found during turnover review`, severity: 'medium', remediation_title: `Restore ${owned.definition_id} coverage`, request_id: `sim-departed-${today}`, description: 'Raised while the safeguard owner account is disabled.'}, null, {label: 'raise CIS finding on safeguard owned by departed user'});
  report.people.events.push({today, event: 'CIS Finding on safeguard owned by departed user', safeguard: owned.definition_id, created: !!result, finding_owner: result?.owner_id ?? null});
  if (result) { report.findings.raisedCis++; report.people.departedOwnerFinding = {owner: result.owner_id ?? null, safeguardOwner: owned.owner_id}; }
}
async function independentFinding() {
  const f = await call('post', '/findings', {client_id: CID, title: 'Phishing simulations paused since training vendor change', severity: 'medium', owner_id: CAMACHO, due_date: '2028-07-31', source: 'Management observation', description: 'Observed during quarterly program meeting.'}, null, {label: 'independent finding'});
  if (!f) return;
  report.findings.raisedIndependent++;
  const t = await call('post', `/findings/${f.finding_id}/create-task`, {title: 'Resume quarterly phishing simulations'}, null, {label: 'independent finding action'});
  createdIds.independentFinding = f.finding_id; createdIds.independentTask = t?.task_id;
}
async function reopenFinding() {
  const findings = await get('/findings', {client_id: CID});
  const target = findings.find(f => f.status === 'closed' && f.review_id && day(f.closed_at) >= '2029-01-01' && day(f.closed_at) <= '2030-04-30') || findings.find(f => f.status === 'closed' && f.review_id);
  if (!target) { observe('findings', {event: 'no closed Finding available to reopen'}); return; }
  const before = clone(target);
  const saved = await call('patch', `/findings/${target.finding_id}`, {status: 'open', expected_updated_at: target.updated_at}, null, {label: 'reopen finding'});
  if (!saved) return;
  report.findings.reopened++;
  const t = await call('post', '/tasks', {client_id: CID, title: `Re-remediate: ${target.title}`, source_type: 'finding', source_id: target.finding_id, assignee_id: JOE, due_date: addDays(today, 60), priority: 'medium'}, null, {label: 'reopened finding action'});
  createdIds.reopened = {finding: target.finding_id, before, task: t?.task_id, reopenedAt: today};
}
async function onboardVendor() {
  const v = await call('post', '/vendors', {client_id: CID, name: 'Plant OT Maintenance Co', service: 'Controller maintenance and remote support', criticality: 'high', status: 'onboarding', business_owner_id: JOE,
    review_frequency: 'annual', next_review: addDays(today, 21), contract_renewal: addDays(today, 365), assurance_required: true,
    assurance_records: [{type: 'Penetration Test Summary', required: true, evidence_ids: []}, {type: 'Cyber Insurance', required: true, evidence_ids: []}]}, null, {label: 'onboard vendor'});
  if (v) { createdIds.vendor_ot = v.vendor_id; report.vendors.events.push({today, vendor: v.name, event: 'onboarded', status: v.status}); }
}
async function activateVendor(id) {
  const v = await get(`/vendors/${id}`);
  if (v?.status !== 'under_review') return;
  const saved = await call('patch', `/vendors/${id}`, {status: 'active', expected_updated_at: v.updated_at}, null, {label: 'activate vendor'});
  if (saved) report.vendors.events.push({today, vendor: v.name, event: 'due diligence complete; active'});
}
async function wrongEvidence(id, mode) {
  const e = await upload('framework_assessment', AID(id), `Wrong file attached to CIS ${id}`);
  if (!e) return;
  const result = mode === 'unlink'
    ? await call('delete', `/framework_assessments/${AID(id)}/links`, {kind: 'evidence', id: e.evidence_id}, null, {label: 'unlink wrong evidence'})
    : await call('delete', `/evidence/${e.evidence_id}`, {}, null, {label: 'delete wrong evidence'});
  report.cis.checkpoints.push({today, event: 'wrong evidence ' + mode, safeguard: id, evidence: e.evidence_id, ok: !!result});
}
async function vendorStage(id, status) {
  const v = await get(`/vendors/${id}`);
  const saved = await call('patch', `/vendors/${id}`, {status, expected_updated_at: v.updated_at}, null, {label: 'vendor stage ' + status});
  if (saved) report.vendors.events.push({today, vendor: v.name, event: 'stage ' + status});
}
async function requireSoc2() {
  const v = await get('/vendors/demo_brawndo_vendor_1');
  const saved = await call('patch', '/vendors/demo_brawndo_vendor_1', {assurance_records: [...v.assurance_records, {type: 'SOC 2', required: true, evidence_ids: []}], expected_updated_at: v.updated_at}, null, {label: 'require SOC 2'});
  if (saved) report.vendors.events.push({today, vendor: v.name, event: 'SOC 2 required; not yet received'});
}
async function backupFailure() {
  await assess('11.4', {status: 'needs_attention', implementation: narrative('11.4', 'Retention lock disabled during platform migration; immutable copy unavailable for 19 days.')});
  const created = await cisFinding('11.4', {title: 'Immutable backup retention lock disabled during migration', severity: 'critical', remediation: 'Re-enable retention lock and add configuration monitoring', due: '2032-03-02', assignee: JOE, syncFindingDue: true, delay: {start: '2032-02-09', done: '2032-05-03', extend: 45}});
  if (created) {
    const r = await call('post', `/findings/${created.finding.finding_id}/raise-risk`, {}, null, {label: 'raise risk from finding'});
    if (r) { createdIds.risk_backup = r.risk.risk_id; report.risks.events.push({today, risk: r.risk.risk_id, event: 'raised from Finding (unassessed)'}); }
  }
  const post = await call('post', '/reviews', {client_id: CID, title: 'Incident Post-Mortem: Backup Retention Failure', review_type: 'incident', recurrence: 'none', due_date: '2032-03-15', owner_id: JOE,
    governance_context: {category: 'organizational', rationale: 'One-time incident review.', cadence_source: 'organization_defined', cadence_rationale: 'Event-driven.'}}, null, {label: 'one-time incident review'});
  if (post) createdIds.postMortem = post.review_id;
}
async function cisSweep({include = [], share = 0.65, evidence = 0.5}) {
  const rows = (await get('/frameworks/cis-ig1', {client_id: CID}))?.assessments || [];
  const scripted = new Set(['1.1', '11.4', '4.2', '3.5', '17.2', '5.3']);
  let touched = 0;
  for (const a of rows) {
    const id = a.definition_id;
    if (scripted.has(id) && !include.includes(id)) continue;
    if (include.includes(id) && a.status === 'not_assessed') {
      const status = id === '4.7' ? 'needs_attention' : id === '8.1' ? 'in_progress' : 'addressed';
      await assess(id, {status, implementation: narrative(id, `Initial assessment of ${id}: ${status === 'addressed' ? 'operating as documented' : 'gaps remain'}.`)}, {evidence: status === 'addressed'});
      if (id === '4.7') await cisFinding('4.7', {title: 'Default accounts remain on plant switches', severity: 'medium', remediation: 'Disable or rename default accounts on plant switches', due: addDays(today, 90)});
      touched++; continue;
    }
    if (a.status === 'addressed' && rnd() < share) { await assess(id, {implementation: narrative(id, (a.implementation || '').replace(/ Verified \d{4}-\d{2}-\d{2}\./g, ''))}, {evidence: rnd() < evidence}); touched++; }
    else if (a.status === 'in_progress' && rnd() < 0.3) { await assess(id, {status: 'addressed', implementation: narrative(id, (a.implementation || 'Implemented.').replace(/ Verified \d{4}-\d{2}-\d{2}\./g, '') + ' Remaining scope completed.')}, {evidence: true}); touched++; }
  }
  report.cis.checkpoints.push({today, event: 'annual sweep', touched});
}

// ---------------------------------------------------------------- checkpoints
async function pages(key) {
  const items = [];
  let offset = 0, total = null;
  for (;;) {
    const page = await get('/dashboard', {client_id: CID, scope: 'org', detail: key, offset, limit: 100});
    if (!page) break;
    total = page.total; items.push(...page.items);
    if (!page.has_more) break;
    offset += 100;
  }
  return {items, total};
}
const inWindow = (d, from, to) => d && d >= from && d <= to;
async function checkpoint(label) {
  const t0 = performance.now();
  const [dash, reviews, findings, tasks, risks, vendors, policies, assets, fw] = await Promise.all([
    get('/dashboard', {client_id: CID, scope: 'org'}), get('/reviews', {client_id: CID}), get('/findings', {client_id: CID}), get('/tasks', {client_id: CID}),
    get('/risks', {client_id: CID}), get('/vendors', {client_id: CID}), get('/policies', {client_id: CID}), get('/assets', {client_id: CID}), get('/frameworks/cis-ig1', {client_id: CID})]);
  const totals = dash.posture.totals, c = {label, today, totals: clone(totals), kpis: clone(dash.kpis)};
  const now = new Date(today + 'T14:00:00Z');
  // 1. Every headline equals its complete drill-down population, without duplicates.
  for (const key of Object.keys(totals)) {
    const {items, total} = await pages(key);
    if (total !== totals[key] || items.length !== totals[key]) discrepancy('dashboard', {issue: 'total != drill-down', key, headline: totals[key], total, items: items.length});
    if (new Set(items.map(i => i.key)).size !== items.length) discrepancy('dashboard', {issue: 'duplicate drill-down rows', key});
    if (['pastDue', 'due30', 'due3190'].includes(key)) c[key + 'Items'] = items;
    if (key === 'priority') c.priorityItems = items;
  }
  // 2. Source records behind the due buckets are real, current and correctly dated.
  const byKind = {reviews: reviews, findings, tasks, risks, vendors, policies};
  const ids = {reviews: 'review_id', findings: 'finding_id', tasks: 'task_id', risks: 'risk_id', vendors: 'vendor_id', policies: 'policy_id'};
  const windows = {pastDue: ['0000-01-01', addDays(today, -1)], due30: [today, addDays(today, 30)], due3190: [addDays(today, 31), addDays(today, 90)]};
  for (const [bucket, [from, to]] of Object.entries(windows)) for (const item of c[bucket + 'Items']) {
    const source = byKind[item.kind]?.find(r => r[ids[item.kind]] === item.id);
    if (!source) { discrepancy('dashboard', {issue: 'drill-down item has no source record', bucket, key: item.key}); continue; }
    if (source.client_id !== CID) discrepancy('isolation', {issue: 'foreign record in dashboard', key: item.key});
    if (!inWindow(day(item.due_date), from, to)) discrepancy('dashboard', {issue: 'item outside bucket window', bucket, key: item.key, due: item.due_date});
    if (['completed', 'cancelled', 'done', 'closed', 'retired', 'inactive'].includes(source.status)) discrepancy('dashboard', {issue: 'terminal record counted as current', bucket, key: item.key, status: source.status});
  }
  // 3. Completeness: every open, dated Review/Action whose date falls in a bucket is in it.
  for (const [bucket, [from, to]] of Object.entries(windows)) {
    const listed = new Set(c[bucket + 'Items'].map(i => i.kind + ':' + i.id));
    for (const r of reviews.filter(r => ['upcoming', 'in_progress', 'needs_scheduling'].includes(r.status) && inWindow(day(r.due_date), from, to))) if (!listed.has('reviews:' + r.review_id)) discrepancy('dashboard', {issue: 'open Review missing from bucket', bucket, id: r.review_id, due: day(r.due_date)});
    for (const t of tasks.filter(t => !TASK_DONE.includes(t.status) && inWindow(day(t.due_date), from, to))) if (!listed.has('tasks:' + t.task_id)) discrepancy('dashboard', {issue: 'open Action missing from bucket', bucket, id: t.task_id});
  }
  // 4. Headline tiles equal what their register links show.
  const material = findings.filter(registerSignals('findings', now).find(s => s.id === 'material').test).length;
  if (material !== totals.materialFindings) discrepancy('reconciliation', {issue: 'High/critical findings tile != /findings?signal=material', tile: totals.materialFindings, register: material});
  const significant = risks.filter(r => riskMatchesView(r, 'significant', now)).length;
  if (significant !== totals.significantRisks) discrepancy('reconciliation', {issue: 'Significant risks tile != /risks?view=significant', tile: totals.significantRisks, register: significant});
  const enriched = vendors.map(v => vendorSignals(v, reviews, now));
  const vendorView = {vendorReviewsPast: enriched.filter(v => v._reviewOverdue).length, assurance: enriched.filter(v => v._assuranceIssue).length};
  const vendorTileKey = totals.vendorReviewsPast ? 'vendorReviewsPast' : 'assurance';
  if (vendorView[vendorTileKey] !== totals[vendorTileKey]) discrepancy('reconciliation', {issue: `Vendor tile (${vendorTileKey}) != /vendors?view=${vendorTileKey === 'assurance' ? 'assurance' : 'review_overdue'}`, tile: totals[vendorTileKey], register: vendorView[vendorTileKey]});
  const cisGapTile = (fw.assessments || []).filter(a => ['in_progress', 'needs_attention'].includes(a.status)).length;
  const cisRows = (fw.definitions || []).map(d => ({...d, ...fw.assessments.find(a => a.definition_id === d.id), work: fw.work[fw.assessments.find(a => a.definition_id === d.id)?.framework_assessment_id]}));
  const gapsView = cisRows.filter(r => matchesAssessment(r, 'gaps')).length;
  if (gapsView !== cisGapTile) discrepancy('reconciliation', {issue: 'CIS gaps tile != /compliance/cis-ig1?view=gaps', tile: cisGapTile, workspace: gapsView});
  // 5. KPIs agree with posture and with registers.
  const activeFindings = findings.filter(f => OPEN_FINDING.includes(f.status)).length;
  if (dash.kpis.open_findings !== activeFindings) discrepancy('reconciliation', {issue: 'open_findings KPI != Findings register', kpi: dash.kpis.open_findings, register: activeFindings});
  if (dash.kpis.past_due !== totals.pastDue) discrepancy('reconciliation', {issue: 'past_due KPI != Past Due tile', kpi: dash.kpis.past_due, tile: totals.pastDue});
  const overdueReviews = reviews.filter(r => ['upcoming', 'in_progress', 'needs_scheduling'].includes(r.status) && day(r.due_date) && day(r.due_date) < today).length;
  if (dash.kpis.overdue_reviews !== overdueReviews) discrepancy('reconciliation', {issue: 'overdue_reviews KPI != Reviews register', kpi: dash.kpis.overdue_reviews, register: overdueReviews});
  // 6. Priority list never shows a Finding beside its own open Action.
  const listedActions = new Set(c.priorityItems.filter(i => i.kind === 'tasks').map(i => i.id));
  for (const i of c.priorityItems.filter(i => i.kind === 'findings')) {
    const own = tasks.filter(t => t.finding_id === i.id && !TASK_DONE.includes(t.status));
    if (own.some(t => listedActions.has(t.task_id))) discrepancy('dashboard', {issue: 'Finding listed with its own open Action in priority', finding: i.id});
  }
  // Documented representation rule: distinct deadlines/owners remain distinct obligations. Quantify.
  const doubled = c.pastDueItems.filter(i => i.kind === 'findings' && tasks.some(t => t.finding_id === i.id && !TASK_DONE.includes(t.status) && c.pastDueItems.some(p => p.kind === 'tasks' && p.id === t.task_id))).length;
  report.findings.representation.push({today, pastDue: totals.pastDue, findingAndOwnActionBothPastDue: doubled});
  // 7. CIS views: UI predicates versus independent source-record computation.
  c.cis = cisCheck(cisRows, findings, tasks, reviews);
  // 8. Register signals versus independent predicates.
  c.signals = signalCheck({reviews, findings, policies, assets}, now);
  // 9. Calendar for the current month agrees with registers.
  c.calendar = await calendarCheck(reviews, findings, tasks);
  c.ms = Math.round(performance.now() - t0);
  report.checkpoints.push(c);
  delete c.pastDueItems; delete c.due30Items; delete c.due3190Items; delete c.priorityItems;
  volumeSample(label);
}
function cisCheck(rows, findings, tasks, reviews) {
  const views = ['addressed', 'in_progress', 'needs_attention', 'not_assessed', 'stale', 'unevidenced', 'unremediated', 'overdue_actions', 'gaps'];
  const ui = Object.fromEntries(views.map(v => [v, rows.filter(r => matchesAssessment(r, v)).length]));
  const db = raw(), evidence = db.evidence.filter(e => e.client_id === CID && !e.archived_at);
  const now = Date.parse(today + 'T14:00:00Z');
  const aged = r => r.last_assessed && r.status !== 'not_assessed' && Math.floor((now - Date.parse(r.last_assessed)) / DAY) > 365;
  const direct = r => findings.filter(f => OPEN_FINDING.includes(f.status) && (f.framework_assessment_id === r.framework_assessment_id || r.related_links?.some(l => l.kind === 'findings' && l.id === f.finding_id)));
  // Evidence the operator unlinked from this safeguard, or deleted, is not current support.
  const ownEvidence = r => evidence.filter(e => !r.unlinked_evidence_ids?.includes(e.evidence_id) && ((['framework_assessment', 'framework_assessments'].includes(e.linked_type) && e.linked_id === r.framework_assessment_id) || r.related_links?.some(l => l.kind === 'evidence' && l.id === e.evidence_id)));
  const linkedReviews = r => reviews.filter(v => r.related_links?.some(l => l.kind === 'reviews' && l.id === v.review_id) || (v.framework_key === 'cis-ig1' && v.framework_safeguards?.includes(r.definition_id)));
  const overdue = x => x.due_date && day(x.due_date) < today && !TASK_DONE.includes(x.status);
  const actionsFor = r => { const fids = new Set([...direct(r).map(f => f.finding_id), ...findings.filter(f => OPEN_FINDING.includes(f.status) && linkedReviews(r).some(v => v.review_id === f.review_id)).map(f => f.finding_id)]); const rids = new Set(linkedReviews(r).map(v => v.review_id)); return tasks.filter(t => fids.has(t.finding_id) || rids.has(t.review_id) || t.framework_assessment_id === r.framework_assessment_id || r.related_links?.some(l => l.kind === 'tasks' && l.id === t.task_id)); };
  const oracle = {
    addressed: rows.filter(r => r.status === 'addressed').length, in_progress: rows.filter(r => r.status === 'in_progress').length,
    needs_attention: rows.filter(r => r.status === 'needs_attention').length, not_assessed: rows.filter(r => r.status === 'not_assessed').length,
    stale: rows.filter(aged).length, unevidenced: rows.filter(r => r.status === 'addressed' && !ownEvidence(r).length).length,
    unremediated: rows.filter(r => ['in_progress', 'needs_attention'].includes(r.status) && !direct(r).length).length,
    overdue_actions: rows.filter(r => actionsFor(r).some(overdue)).length, gaps: rows.filter(r => ['in_progress', 'needs_attention'].includes(r.status)).length,
  };
  for (const v of views) if (ui[v] !== oracle[v]) discrepancy('cis', {issue: `CIS view ${v}: workspace != source records`, workspace: ui[v], oracle: oracle[v]});
  for (const r of rows) if ((r.work?.evidence_count || 0) !== ownEvidence(r).length) discrepancy('cis', {issue: 'CIS safeguard evidence count != current supporting Evidence', safeguard: r.definition_id, workspace: r.work?.evidence_count || 0, oracle: ownEvidence(r).length});
  const summary = cisSummary(rows, new Date(today + 'T14:00:00Z'));
  const distinctOverdueActions = new Set(rows.flatMap(r => actionsFor(r).filter(overdue).map(t => t.task_id))).size;
  if (summary.overdueActions !== ui.overdue_actions) discrepancy('cis', {issue: 'CIS Overdue remediation signal != its filtered view', summary: summary.overdueActions, view: ui.overdue_actions});
  for (const key of ['stale', 'unevidenced', 'unremediated']) if (summary[key] !== ui[key]) discrepancy('cis', {issue: `CIS ${key} signal != its filtered view`, summary: summary[key], view: ui[key]});
  return {ui, oracle, summary: {overdueActions: summary.overdueActions, distinctOverdueActions, stale: summary.stale, unevidenced: summary.unevidenced, unremediated: summary.unremediated}};
}
function signalCheck(registers, now) {
  const out = {};
  const openRow = r => !['completed', 'cancelled', 'closed', 'done', 'accepted', 'retired', 'validated'].includes(r.status);
  const oracle = {
    reviews: {due14: r => openRow(r) && inWindow(day(r.due_date), today, addDays(today, 14)), unowned: r => openRow(r) && !(r.owner_id || r.assignee_id || r.business_owner_id), recent: r => (r.occurrences || []).some(o => day(o.completed_at) >= addDays(today, -30))},
    findings: {material: r => openRow(r) && ['high', 'critical'].includes(r.severity), late: r => openRow(r) && r.status !== 'remediated' && day(r.due_date) && day(r.due_date) < today, validate: r => r.status === 'remediated', unowned: r => openRow(r) && !r.owner_id},
    policies: {review_overdue: r => r.status !== 'retired' && day(r.next_review_date) && day(r.next_review_date) < today, review_due: r => r.status !== 'retired' && inWindow(day(r.next_review_date), today, addDays(today, 30)), unapproved: r => ['draft', 'pending_approval', 'in_review'].includes(r.status)},
    assets: {critical: r => r.criticality === 'critical' && r.status !== 'retired', unowned: r => r.status !== 'retired' && !r.owner_id},
  };
  for (const kind of Object.keys(oracle)) for (const s of registerSignals(kind, now)) {
    const ui = registers[kind].filter(s.test).length, expected = registers[kind].filter(oracle[kind][s.id]).length;
    (out[kind] ||= {})[s.id] = ui;
    if (ui !== expected) discrepancy('signals', {issue: `${kind} signal ${s.id}`, ui, expected});
  }
  return out;
}
async function calendarCheck(reviews, findings, tasks) {
  const start = today.slice(0, 8) + '01', end = addDays(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 1)).toISOString().slice(0, 10), -1);
  const cal = await get('/calendar', {client_id: CID, start, end, scope: 'active'});
  const entries = Object.values(cal || {}).flatMap(group => Object.values(group).flat());
  const keys = new Set(entries.map(e => e.kind + ':' + e.id));
  const expect = [...reviews.filter(r => ['upcoming', 'in_progress', 'needs_scheduling'].includes(r.status)).map(r => ['review', r.review_id, r.due_date]),
    ...findings.filter(f => OPEN_FINDING.includes(f.status)).map(f => ['finding', f.finding_id, f.due_date]), ...tasks.filter(t => !TASK_DONE.includes(t.status)).map(t => ['task', t.task_id, t.due_date])]
    .filter(([, , d]) => inWindow(day(d), start, end));
  for (const [kind, id] of expect) if (!keys.has(kind + ':' + id)) discrepancy('calendar', {issue: 'open record missing from Calendar month', kind, id});
  if (entries.length !== expect.length) discrepancy('calendar', {issue: 'Calendar entry count != open dated records', calendar: entries.length, expected: expect.length});
  if (entries.some(e => e.historical)) discrepancy('calendar', {issue: 'historical entry shown in Active scope'});
  if (new Set(entries.map(e => e.key)).size !== entries.length) discrepancy('calendar', {issue: 'duplicate Calendar entries'});
  return {start, end, entries: entries.length, overdue: entries.filter(e => day(e.due_date_iso) < today).length};
}
function volumeSample(label) {
  const db = raw(), chars = storage.chars();
  if (!report.quotaExceededOn && chars > BROWSER_QUOTA_CHARS) report.quotaExceededOn = today;
  const mine = k => (db[k] || []).filter(r => r.client_id === CID);
  report.volume.push({today, label, storeChars: chars, logs: db.logs.length, brawndoLogs: db.logs.filter(l => l.client_id === CID).length,
    reviews: mine('reviews').length, occurrences: mine('reviews').reduce((n, r) => n + (r.occurrences || []).length, 0), maxOccurrences: Math.max(...mine('reviews').map(r => (r.occurrences || []).length)),
    findings: mine('findings').length, tasks: mine('tasks').length, evidence: mine('evidence').length, risks: mine('risks').length, assessmentHistory: mine('framework_assessments').reduce((n, a) => n + (a.assessment_history || []).length, 0)});
}

// ------------------------------------------------------------ integrity scans
function integrityScan() {
  const db = raw(), issues = [];
  const idOf = {reviews: 'review_id', findings: 'finding_id', tasks: 'task_id', risks: 'risk_id', vendors: 'vendor_id', policies: 'policy_id', evidence: 'evidence_id', framework_assessments: 'framework_assessment_id', assets: 'asset_id', contacts: 'contact_id', requirements: 'requirement_id', assessments: 'assessment_id'};
  const index = {};
  for (const [kind, key] of Object.entries(idOf)) { index[kind] = new Map(); for (const r of db[kind] || []) { if (index[kind].has(r[key])) issues.push({issue: 'duplicate id', kind, id: r[key]}); index[kind].set(r[key], r); } }
  const users = new Set(db.users.map(u => u.user_id));
  const ref = (kind, id, from, field) => {
    if (!id) return;
    const target = index[kind]?.get(id);
    if (!target) issues.push({issue: 'orphaned reference', from, field, kind, id});
    else if (target.client_id && from.client_id && target.client_id !== from.client_id) issues.push({issue: 'cross-client reference', from: from[idOf[from.__kind]] , field, kind, id});
  };
  const kinds = {review: 'reviews', reviews: 'reviews', task: 'tasks', tasks: 'tasks', finding: 'findings', findings: 'findings', risk: 'risks', risks: 'risks', vendor: 'vendors', vendors: 'vendors', policy: 'policies', policies: 'policies', framework_assessment: 'framework_assessments', framework_assessments: 'framework_assessments', ai_system: 'ai_systems', ai_systems: 'ai_systems'};
  for (const kind of Object.keys(idOf)) for (const r of (db[kind] || []).filter(r => r.client_id === CID)) {
    r.__kind = kind;
    for (const [field, target] of [['review_id', 'reviews'], ['finding_id', 'findings'], ['risk_id', 'risks'], ['vendor_id', 'vendors'], ['policy_id', 'policies'], ['framework_assessment_id', 'framework_assessments']]) if (field !== idOf[kind]) ref(target, r[field], r, field);
    for (const field of ['owner_id', 'assignee_id', 'reviewer_id', 'business_owner_id', 'completed_by', 'created_by']) if (r[field] && !users.has(r[field])) issues.push({issue: 'unknown user reference', kind, field, value: r[field]});
    if (kind === 'reviews') {
      const occ = (r.occurrences || []).map(o => o.occurrence_id);
      if (new Set(occ).size !== occ.length) issues.push({issue: 'duplicate occurrence ids', id: r.review_id});
      if (occ.includes(r.current_occurrence_id) && !['completed', 'cancelled'].includes(r.status)) issues.push({issue: 'active occurrence already completed', id: r.review_id});
      for (const o of r.occurrences || []) for (const e of o.evidence || []) if (!index.evidence.has(e.evidence_id)) issues.push({issue: 'occurrence evidence missing', review: r.review_id, evidence: e.evidence_id});
    }
    if (kind === 'findings' && r.review_id && r.occurrence_id) {
      const review = index.reviews.get(r.review_id);
      const known = new Set([...(review?.occurrences || []).map(o => o.occurrence_id), review?.current_occurrence_id, 'occ_' + r.review_id]);
      if (!known.has(r.occurrence_id)) issues.push({issue: 'Finding occurrence not in Review history', finding: r.finding_id, occurrence: r.occurrence_id});
    }
    if (kind === 'tasks' && r.finding_id) {
      const f = index.findings.get(r.finding_id);
      if (f && f.review_id && r.review_id !== f.review_id) issues.push({issue: 'Action review provenance differs from Finding', task: r.task_id});
    }
    if (kind === 'evidence') {
      if (r.linked_type) ref(kinds[r.linked_type], r.linked_id, r, 'linked_id');
      for (const rel of r.relationships || []) ref(kinds[rel.kind], rel.id, r, 'relationship');
    }
    if (kind === 'framework_assessments') {
      const links = (r.related_links || []).map(l => l.kind + ':' + l.id);
      if (new Set(links).size !== links.length) issues.push({issue: 'duplicate assessment links', id: r.definition_id});
      for (const l of r.related_links || []) ref(l.kind, l.id, r, 'related_link');
      const at = (r.assessment_history || []).map(h => h.at);
      if (at.some((v, i) => i && v < at[i - 1])) issues.push({issue: 'assessment history out of order', id: r.definition_id});
    }
    if (kind === 'vendors') { for (const a of r.assurance_records || []) for (const e of a.evidence_ids || []) ref('evidence', e, r, 'assurance'); for (const x of r.related_risk_ids || []) ref('risks', x, r, 'related_risk'); }
    if (kind === 'risks') for (const x of r.related_task_ids || []) ref('tasks', x, r, 'related_task');
  }
  const live = (db.reviews || []).filter(r => r.client_id === CID && !['completed', 'cancelled'].includes(r.status));
  const governance = new Map();
  for (const r of live) for (const key of [r.risk_id && 'risk:' + r.risk_id, r.vendor_id && 'vendor:' + r.vendor_id + ':' + (r.vendor_purpose || 'vendor'), r.policy_id && 'policy:' + r.policy_id].filter(Boolean)) { if (governance.has(key)) issues.push({issue: 'duplicate active governance Review', key}); governance.set(key, r.review_id); }
  const perFinding = new Map();
  for (const t of (db.tasks || []).filter(t => t.client_id === CID && t.finding_id && !TASK_DONE.includes(t.status))) perFinding.set(t.finding_id, (perFinding.get(t.finding_id) || 0) + 1);
  for (const [fid, n] of perFinding) if (n > 1) issues.push({issue: 'multiple open remediation Actions for one Finding', fid, n});
  return issues;
}
function historyCheck() {
  const db = raw(), out = {occurrencesChecked: 0, occurrenceMismatches: [], assessmentChecked: 0, assessmentMismatches: [], decisionMismatches: []};
  const fields = ['occurrence_id', 'due_date', 'period', 'completed_at', 'completed_by', 'completed_by_name', 'outcome', 'finding_count', 'notes', 'owner_id', 'title'];
  for (const [rid, map] of ledger.occurrences) {
    const r = db.reviews.find(x => x.review_id === rid);
    for (const [oid, snap] of map) {
      out.occurrencesChecked++;
      const stored = r?.occurrences?.find(o => o.occurrence_id === oid);
      if (!stored) { out.occurrenceMismatches.push({rid, oid, issue: 'occurrence missing'}); continue; }
      const diff = fields.filter(f => JSON.stringify(stored[f] ?? null) !== JSON.stringify(snap[f] ?? null));
      if (JSON.stringify((stored.evidence || []).map(e => e.evidence_id)) !== JSON.stringify((snap.evidence || []).map(e => e.evidence_id))) diff.push('evidence');
      if (diff.length) out.occurrenceMismatches.push({rid, oid, diff});
    }
  }
  for (const [aid, history] of ledger.assessments) {
    const a = db.framework_assessments.find(x => x.framework_assessment_id === aid);
    out.assessmentChecked += history.length;
    if (JSON.stringify(a.assessment_history.slice(0, history.length)) !== JSON.stringify(history)) out.assessmentMismatches.push(aid);
  }
  for (const [fid, history] of ledger.findingDecisions) { const f = db.findings.find(x => x.finding_id === fid); if (JSON.stringify((f.decision_history || []).slice(0, history.length)) !== JSON.stringify(history)) out.decisionMismatches.push({fid}); }
  for (const [pid, history] of ledger.policyApprovals) { const p = db.policies.find(x => x.policy_id === pid); if (JSON.stringify((p.approval_history || []).slice(0, history.length)) !== JSON.stringify(history)) out.decisionMismatches.push({pid}); }
  for (const [rid, history] of ledger.riskDecisions) { const r = db.risks.find(x => x.risk_id === rid); if (JSON.stringify((r.decision_history || []).slice(0, history.length)) !== JSON.stringify(history)) out.decisionMismatches.push({rid}); }
  return out;
}
function yearOneCheck() {
  if (!ledger.year1) return {skipped: true};
  const db = raw(), y1 = ledger.year1, out = {occurrences: y1.occurrences.length, missing: [], changed: [], evidenceMissing: 0, closedFindingsChanged: [], doneTasksChanged: [], assessmentPrefixBroken: [], riskHistoryBroken: [], policyHistoryBroken: [], fritoAttribution: 0};
  for (const {parent, snapshot} of y1.occurrences) {
    const stored = db.reviews.find(r => r.review_id === parent)?.occurrences?.find(x => x.occurrence_id === snapshot.occurrence_id);
    if (!stored) out.missing.push(snapshot.occurrence_id);
    else { const keys = [...new Set([...Object.keys(stored), ...Object.keys(snapshot)])].filter(k => JSON.stringify(stored[k]) !== JSON.stringify(snapshot[k])); if (keys.length) out.changed.push({occurrence: snapshot.occurrence_id, keys}); }
  }
  for (const e of y1.evidence) { const stored = db.evidence.find(x => x.evidence_id === e.evidence_id); if (!stored || stored.archived_at) out.evidenceMissing++; }
  for (const f of y1.closedFindings) { const s = db.findings.find(x => x.finding_id === f.finding_id); const keep = ['title', 'severity', 'review_id', 'occurrence_id', 'created_at', 'framework_assessment_id']; if (keep.some(k => JSON.stringify(s[k]) !== JSON.stringify(f[k])) || JSON.stringify((s.decision_history || []).slice(0, (f.decision_history || []).length)) !== JSON.stringify(f.decision_history || [])) out.closedFindingsChanged.push(f.finding_id); }
  for (const t of y1.doneTasks) { const s = db.tasks.find(x => x.task_id === t.task_id); if (['status', 'completed_at', 'completed_by', 'finding_id', 'title'].some(k => JSON.stringify(s[k]) !== JSON.stringify(t[k]))) out.doneTasksChanged.push(t.task_id); }
  for (const [aid, history] of Object.entries(y1.assessmentHistory)) { const a = db.framework_assessments.find(x => x.framework_assessment_id === aid); if (JSON.stringify(a.assessment_history.slice(0, history.length)) !== JSON.stringify(history)) out.assessmentPrefixBroken.push(aid); }
  for (const r of y1.risks) { const s = db.risks.find(x => x.risk_id === r.risk_id); if (JSON.stringify((s.decision_history || []).slice(0, r.decision_history.length)) !== JSON.stringify(r.decision_history) || JSON.stringify((s.rating_history || []).slice(0, r.rating_history.length)) !== JSON.stringify(r.rating_history)) out.riskHistoryBroken.push(r.risk_id); }
  for (const p of y1.policies) { const s = db.policies.find(x => x.policy_id === p.policy_id); if (JSON.stringify((s.approval_history || []).slice(0, p.approval_history.length)) !== JSON.stringify(p.approval_history) || JSON.stringify((s.decision_history || []).slice(0, p.decision_history.length)) !== JSON.stringify(p.decision_history)) out.policyHistoryBroken.push(p.policy_id); }
  out.fritoAttribution = db.reviews.flatMap(r => r.occurrences || []).filter(o => y1.fritoCompleted.includes(o.occurrence_id) && o.completed_by === FRITO).length;
  out.fritoExpected = y1.fritoCompleted.length;
  return out;
}
function clientFingerprint(cid) {
  const db = raw(), out = {};
  for (const [k, v] of Object.entries(db)) if (Array.isArray(v) && k !== 'logs' && k !== 'notifications') out[k] = v.filter(r => r.client_id === cid).map(clone);
  return out;
}
const ID_FIELDS = {framework_assessments: 'framework_assessment_id', ai_systems: 'ai_system_id', clients: 'client_id', users: 'user_id', reviews: 'review_id', findings: 'finding_id', risks: 'risk_id', policies: 'policy_id', vendors: 'vendor_id', assets: 'asset_id', tasks: 'task_id', exceptions: 'exception_id', requirements: 'requirement_id', contacts: 'contact_id', evidence: 'evidence_id', assessments: 'assessment_id', comments: 'comment_id'};
let evictedFileBytes = 0;
function fingerprintDiff(before, after) {
  const changes = [];
  for (const kind of Object.keys(before)) {
    const b = before[kind], a = after[kind] || [];
    if (a.length !== b.length) changes.push({kind, issue: 'count', before: b.length, after: a.length});
    const key = ID_FIELDS[kind] || 'id';
    for (const row of b) {
      const match = a.find(x => x[key] === row[key]);
      if (!match) { changes.push({kind, id: row[key], issue: 'missing'}); continue; }
      const keys = [...new Set([...Object.keys(row), ...Object.keys(match)])].filter(k => JSON.stringify(row[k]) !== JSON.stringify(match[k]));
      // Web Storage has one origin-wide inline-bytes budget; eviction to the memory cache is not a record change.
      const bytesOnly = kind === 'evidence' && keys.every(k => ['content_base64', 'demo_file_storage'].includes(k));
      if (bytesOnly) evictedFileBytes++;
      else if (keys.length) changes.push({kind, id: row[key], keys});
    }
  }
  return changes;
}

// ------------------------------------------------------------------ run
let simulated = false;
async function runSimulation() {
  jest.useFakeTimers('modern');
  setClock(START);
  storage.clear(); localStorage.clear();
  await api.post('/demo/enter');
  const others = raw().clients.map(c => c.client_id).filter(c => c !== CID);
  const before = Object.fromEntries(others.map(c => [c, clientFingerprint(c)]));
  volumeSample('seed');
  await checkpoint('seed');
  const events = [...EVENTS].sort((a, b) => a.on.localeCompare(b.on));
  let nextCheckpoint = addDays(START, 91);
  for (let d = START; d <= END; d = addDays(d, 7)) {
    setClock(d);
    for (const e of events.filter(e => !e.done && e.on <= d)) { e.done = true; await e.run(); }
    await workReviews();
    await policyCycle();
    await governanceUpkeep();
    await workTasks();
    await validateFindings();
    if (d >= nextCheckpoint) { await checkpoint('quarterly'); nextCheckpoint = addDays(nextCheckpoint, 91); }
  }
  await checkpoint('year 10');
  report.integrity = integrityScan();
  report.history = historyCheck();
  report.yearOne = yearOneCheck();
  const after = Object.fromEntries(others.map(c => [c, clientFingerprint(c)]));
  report.isolation.changes = Object.fromEntries(others.map(c => [c, fingerprintDiff(before[c], after[c])]).filter(([, v]) => v.length));
  report.isolation.changedClients = Object.keys(report.isolation.changes);
  report.isolation.otherClientFileBytesEvicted = evictedFileBytes;
  const leak = [];
  const otherDash = await get('/dashboard', {client_id: OTHER_CLIENT, scope: 'org'});
  if (JSON.stringify(otherDash).includes(CID)) leak.push('other client dashboard mentions Brawndo');
  for (const kind of ['reviews', 'findings', 'tasks', 'risks', 'vendors', 'policies', 'evidence', 'assets']) {
    const rows = await get(`/${kind}`, {client_id: OTHER_CLIENT});
    if ((rows || []).some(r => r.client_id !== OTHER_CLIENT || JSON.stringify(r).includes(CID + '_') && !JSON.stringify(r).includes(OTHER_CLIENT))) leak.push(kind);
  }
  const crossRead = await call('get', `/findings/${createdIds.independentFinding}`, null, {client_id: OTHER_CLIENT}, {expectFailure: true, label: 'cross-client record read'});
  report.isolation.crossClientReadRejected = !!crossRead?.rejected;
  report.isolation.leaks = leak;
  report.timings = Object.fromEntries([...timings].map(([k, v]) => [k, {n: v.n, avgMs: +(v.ms / v.n).toFixed(1), maxMs: +v.max.toFixed(1)}]));
  report.rejections = rejections;
  report.expectedRejections = expectedRejections;
  if (createdIds.reopened) {
    const f = await get(`/findings/${createdIds.reopened.finding}`);
    report.findings.reopenedOutcome = {status: f.status, validations: (f.decision_history || []).filter(h => h.action === 'validated').length, firstValidation: createdIds.reopened.before.decision_history?.[0]?.at, currentClosedAt: f.closed_at};
  }
  report.final = {storeChars: storage.chars(), quotaChars: BROWSER_QUOTA_CHARS};
  if (process.env.SIM_REPORT) require('fs').writeFileSync(process.env.SIM_REPORT, JSON.stringify(report, null, 1));
  if (process.env.SIM_STORE) require('fs').writeFileSync(process.env.SIM_STORE, storage.getItem(STORE_KEY));
  simulated = true;
}

describe('Brawndo ten-year operation (Demo adapter)', () => {
  beforeAll(runSimulation, 30 * 60 * 1000);
  afterAll(() => jest.useRealTimers());
  test('the simulation ran to Year 10 without unexpected request failures', () => {
    expect(simulated).toBe(true);
    expect(report.rejections).toEqual([]);
  });
  test('recurring Reviews: calendar boundaries, no duplicates, late completion keeps its period', () => {
    expect(report.reviews.completions).toBeGreaterThan(900);
    for (const seq of Object.values(report.reviews.boundarySequences)) expect({title: seq.title, mismatches: seq.mismatches}).toEqual({title: seq.title, mismatches: []});
    expect(report.reviews.late).toBeGreaterThan(50);
    expect(report.history.occurrenceMismatches).toEqual([]);
  });
  test('Dashboard numbers equal drill-downs, registers and source records at every checkpoint', () => {
    expect(report.checkpoints.length).toBeGreaterThan(40);
    expect(report.discrepancies.filter(d => ['dashboard', 'reconciliation', 'signals', 'calendar', 'cis'].includes(d.area))).toEqual([]);
  });
  test('history is never rewritten; Year-1 records remain intact at Year 10', () => {
    expect(report.history.assessmentMismatches).toEqual([]);
    expect(report.history.decisionMismatches).toEqual([]);
    const y1 = report.yearOne;
    expect({missing: y1.missing, changed: y1.changed, evidenceMissing: y1.evidenceMissing, closedFindingsChanged: y1.closedFindingsChanged, doneTasksChanged: y1.doneTasksChanged, assessmentPrefixBroken: y1.assessmentPrefixBroken, riskHistoryBroken: y1.riskHistoryBroken, policyHistoryBroken: y1.policyHistoryBroken})
      .toEqual({missing: [], changed: [], evidenceMissing: 0, closedFindingsChanged: [], doneTasksChanged: [], assessmentPrefixBroken: [], riskHistoryBroken: [], policyHistoryBroken: []});
    expect(y1.fritoAttribution).toBe(y1.fritoExpected);
  });
  test('people changes: departed owners are never copied onto new work', () => {
    expect(report.people.departedOwnerFinding).toEqual({owner: null, safeguardOwner: FRITO});
    expect(report.reviews.reassigned).toBeGreaterThan(5);
  });
  test('a reopened Finding keeps its first validation and is validated again', () => {
    expect(report.findings.reopenedOutcome.validations).toBeGreaterThanOrEqual(2);
    expect(report.findings.reopenedOutcome.status).toBe('closed');
  });
  test('references stay intact and Brawndo stays Brawndo-only', () => {
    expect(report.integrity).toEqual([]);
    expect(report.isolation.changedClients).toEqual([]);
    expect(report.isolation.leaks).toEqual([]);
    expect(report.isolation.crossClientReadRejected).toBe(true);
  });
});

