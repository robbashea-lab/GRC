import {validateVendor,ensureVendorReviews,syncVendorReview} from './vendors';
import { ensureRiskReview } from './risks';
import { syncPolicyReview } from './policyReviews';
import { initializeRiskIds, allocateRiskId } from './riskIds';
import { prepareTask } from './actionItems';
import { validateAssignment } from './assignmentEligibility';
import { validateClientRelationships } from './clientRelationships';
import { buildDemoStore } from './demoSeed';
import { reconcileFramework, frameworkRequest } from './frameworks';
import {finishDemoStore} from './demoHistory';
import {action} from './workflows';
import fixtures from './demoConfiguration.json';
import { reviewView, reviewSchedule } from '../lib/reviewOccurrences';
import { assessedRisk } from '../lib/grcWork';
import {validateGovernanceContext} from '../lib/requirementBasis';
import {actionTitle} from '../lib/actionItems';
import {demoStorageError} from '../lib/demoStorageErrors';
import {lightweightStore,rememberFiles,restoreFiles,clearFileCache,storageDiagnostics} from './evidenceStorage';
export const STORE_KEY = 'grc_interactive_demo_v3';
// v2 held the retired seven-client portfolio. Drop it so those clients never reappear
// and two full stores never compete for the session quota.
const LEGACY_STORE_KEYS = ['grc_interactive_demo_v2'];
function dropLegacyStores() {
  for (const key of LEGACY_STORE_KEYS) { try { sessionStorage.removeItem(key); } catch { /* unavailable storage is reported by the read below */ } }
}
export const clone = value => JSON.parse(JSON.stringify(value));
export const ids = {
  framework_assessments:'framework_assessment_id',
  ai_systems:'ai_system_id',
  clients: 'client_id',
  users: 'user_id',
  reviews: 'review_id',
  findings: 'finding_id',
  risks: 'risk_id',
  policies: 'policy_id',
  vendors: 'vendor_id',
  assets: 'asset_id',
  tasks: 'task_id',
  exceptions: 'exception_id',
  requirements: 'requirement_id',
  contacts: 'contact_id',
  evidence: 'evidence_id',
  assessments: 'assessment_id',
  comments: 'comment_id'
};
export const now = () => new Date().toISOString();
export const uid = kind => `${kind}_demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
function normalizePolicyDates(db) {
  for(const task of db.tasks||[])task.title=actionTitle(task);
  for (const policy of db.policies || []) {
    if (policy.last_reviewed_at === undefined && policy.last_reviewed) policy.last_reviewed_at = policy.last_reviewed;
  }
  return db;
}
export function seedStore(clock=new Date()) {
  const db = normalizePolicyDates(initializeRiskIds(buildDemoStore(Object.keys(ids),clock)));
  db.risks.forEach(risk => ensureRiskReview(db, risk));
  db.vendors.forEach(vendor => ensureVendorReviews(db, vendor));
  // Only explicit Demo creation/reset seeds framework work; standard startup never calls this.
  for(const client of db.clients)reconcileFramework(db,client.client_id,db.baselines[client.client_id]);
  return finishDemoStore(db,clock,{action,write,frameworkRequest});
}
export function readStore() {
  dropLegacyStores();
  let saved;
  try {saved=sessionStorage.getItem(STORE_KEY);}catch(error){throw demoStorageError(error,'read');}
  if (saved) {
    let db;try{db=JSON.parse(saved);}catch(error){throw demoStorageError(error,'parse');}
    if(!db||!Array.isArray(db.clients)||!Array.isArray(db.evidence))throw demoStorageError(null,'parse');
    const light=lightweightStore(db);
    if(light.evidence.some((e,i)=>e!==db.evidence[i]))saveStore(db);
    return restoreFiles(normalizePolicyDates(initializeRiskIds(db)));
  }
  clearFileCache();
  const db = seedStore();
  saveStore(db);
  return db;
}
export function saveStore(db) {
  // Persist before responding: quota failures must never masquerade as saved changes.
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(lightweightStore(db)));
    rememberFiles(db);
  } catch (error) {
    throw demoStorageError(error);
  }
}
export function resetStore() {
  saveStore(seedStore());
  clearFileCache();
}
export function clearEvidenceFiles(){
  let db;
  try{db=JSON.parse(sessionStorage.getItem(STORE_KEY));}catch(error){throw demoStorageError(error,'read');}
  if(!db)throw demoStorageError(null,'read');
  db.evidence=(db.evidence||[]).map(({content_base64,...metadata})=>({...metadata,demo_file_storage:'cleared'}));
  saveStore(db);clearFileCache();
}
export function demoDiagnostics(){
  try{const saved=sessionStorage.getItem(STORE_KEY)||'{}';return storageDiagnostics(saved,JSON.parse(saved));}
  catch(error){const failure=demoStorageError(error,'read');return {storage:'sessionStorage',last_error:failure.storage_code};}
}
export const list = (db, kind, cid) => (db[kind] || []).filter(r => !cid || r.client_id === cid);
export function record(db, kind, id) {
  const found = (db[kind] || []).find(r => r[ids[kind]] === id);
  if (!found) throw new Error('Record not found.');
  return found;
}
export function audit(db, action, kind, row, meta = {}) {
  db.logs.unshift({
    audit_id: uid('audit'),
    action,
    entity_type: kind,
    entity_id: row[ids[kind]],
    client_id: row.client_id,
    at: now(),
    user_id: db.user.user_id,
    user_name: db.user.name,
    user_email: db.user.email,
    meta: {
      simulated: true,
      title: row.title,
      name: row.name,
      ...meta
    }
  });
}
export function validate(db, kind, body, existing) {
  if(['reviews','policies','tasks'].includes(kind))validateGovernanceContext(body.governance_context);
  if (kind !== 'clients' && kind !== 'users' && !db.clients.some(c => c.client_id === body.client_id)) throw new Error('Select an existing demo client.');
  if (existing?.client_id && body.client_id !== existing.client_id) throw new Error('Records cannot be moved between clients.');
  const field = ['clients', 'vendors', 'assets', 'users'].includes(kind) ? 'name' : ['contacts', 'evidence'].includes(kind) ? null : 'title';
  if (field && !String(body[field] || '').trim()) throw new Error(`${field === 'name' ? 'Name' : 'Title'} is required.`);
  if (kind === 'reviews' && !body.review_type) throw new Error('Review type is required.');
  if (kind === 'contacts' && !body.not_applicable && !body.name && !body.email && !body.role) throw new Error('Enter a contact name, email, or role.');
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new Error('Enter a valid email address.');
  for (const [relation, collection] of Object.entries({
    finding_id: 'findings',
    review_id: 'reviews',
    risk_id: 'risks',
    policy_id: 'policies',
    vendor_id: 'vendors'
    ,ai_system_id:'ai_systems'
  })) {
    if (relation === ids[kind] || !body[relation]) continue;
    const target = record(db, collection, body[relation]);
    if (target.client_id !== body.client_id) throw new Error('Related records must belong to the same client.');
  }
  if (body.presence === 'not_applicable' && !body.applicability_rationale?.trim() || body.applicability === 'not_applicable' && body.baseline_response !== 'does_not_apply' && !body.rationale?.trim()) throw new Error('Rationale is required for Not Applicable.');
  if (kind === 'risks') for (const f of ['likelihood_score', 'impact_score']) if (body[f] != null && (!Number.isInteger(body[f]) || body[f] < 1 || body[f] > 5)) throw new Error('Risk ratings must be whole numbers from 1 to 5.');
}
export function write(db, kind, body, id) {
  const existing = id ? record(db, kind, id) : null;
  const profileChanges=kind==='clients'&&existing?Object.fromEntries(Object.entries(body).filter(([k,v])=>!['expected_updated_at','updated_at'].includes(k)&&JSON.stringify(existing[k])!==JSON.stringify(v)).map(([k,v])=>[k,{before:clone(existing[k]??null),after:clone(v)}])):null;
  const contextChange=existing&&'governance_context' in body?{governance_context_before:clone(existing.governance_context??null),governance_context_after:clone(body.governance_context)}:{};
  if (existing && Object.prototype.hasOwnProperty.call(body, 'expected_updated_at') && body.expected_updated_at !== (existing.updated_at ?? null)) {
    throw new Error('Record changed since it was opened; reload before saving');
  }
  body = { ...body };
  delete body.expected_updated_at;
  validateAssignment(db, kind, { ...existing, ...body }, existing);
  const defaults = {
    clients: {
      status: 'onboarding',
      environment: 'Production'
    },
    reviews: {
      status: 'upcoming',
      recurrence: 'none'
    },
    findings: {
      status: 'open',
      severity: 'medium'
    },
    tasks: {
      status: 'open',
      priority: 'medium'
    },
    risks: {
      status: 'open',
      category: 'operational',
      date_identified: now()
    },
    policies: {
      status: 'draft'
    },
    vendors: {
      status: 'onboarding',
      criticality: 'medium',
      review_frequency: 'annual'
    },
    requirements: {
      status: 'active'
    },
    contacts: {
      status: 'active'
    },
    exceptions: {
      status: 'requested'
    }
  };
  const row = {
    ...defaults[kind],
    ...existing,
    ...body,
    [ids[kind]]: id || uid(kind),
    created_at: existing?.created_at || now(),
    created_by: existing?.created_by || db.user.user_id,
    // Distinguish consecutive edits even within the same millisecond.
    updated_at: new Date(Math.max(Date.now(), (Date.parse(existing?.updated_at) || 0) + 1)).toISOString()
  };
  if (kind === 'tasks') {
    if(existing&&'title' in body&&body.title!==existing.title)row.title_generated=false;
    if(existing) {row.created_at=existing.created_at;row.created_by=existing.created_by;}
    prepareTask(db,row,existing);
    if ('assignee_id' in body && existing && 'owner_id' in existing) row.owner_id=null;
  }
  if(kind==='vendors') {validateVendor(db,row,existing);row.service=row.service||row.services;}
  validate(db, kind, row, existing);
  if (kind === 'clients') {
    validateClientRelationships(db, row, existing);
    if (!existing && body.primary_contact_details) {
      const details = body.primary_contact_details;
      if (!details.name?.trim() || details.name.length > 200 || (details.title || '').length > 200) throw new Error('Primary Contact name is required (maximum 200 characters)');
      const contact = { name: details.name.trim(), email: details.email || null, title: details.title || null,
        client_id: row.client_id, contact_id: uid('contacts'), status: 'active', created_at: now(), updated_at: now(), created_by: db.user.user_id };
      if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new Error('Enter a valid email address.');
      db.contacts.push(contact);
      row.primary_contact_id = contact.contact_id;
      audit(db, 'create', 'contacts', contact, {source: 'client_primary_contact'});
    }
    delete row.primary_contact_details;
    delete row.primary_contact_record;
    delete row.grc_lead;
    delete row.grc_lead_id;
  }
  if (kind === 'reviews') Object.assign(row, reviewView({...row, ...reviewSchedule(row, !!existing && !body.schedule_anchor && body.due_date !== undefined && body.due_date !== existing.due_date)}));
  if (kind === 'tasks' && existing && row.status !== existing.status) {
    if (row.status === 'in_progress' && !row.started_at) {row.started_at=now();row.started_by=db.user.user_id;}
    row.completed_by = row.status === 'done' ? db.user.user_id : null;
    row.completed_at = row.status === 'done' ? now() : null;
  }
  if (kind === 'tasks' && row.review_id && (!existing || row.status !== existing.status || row.assignee_id !== existing.assignee_id)) {
    const review = db.reviews.find(r => r.review_id === row.review_id && r.client_id === row.client_id);
    if (review) audit(db, row.status === 'done' ? 'Action Item completed' : existing ? 'Action Item updated' : 'Action Item created',
      'reviews', review, {occurrence_id:row.occurrence_id || 'occ_' + row.review_id, task_id:row.task_id, title:row.title, assignee_id:row.assignee_id,status:row.status});
  }
  if (kind === 'risks') {
    Object.assign(row, assessedRisk(row));
    row.display_id = existing?.display_id || allocateRiskId(db, row.client_id);
    if (!existing) row.status = row.risk_score ? "assessed" : "identified";
  }
  if (kind === 'risks' && row.likelihood_score && row.impact_score) {
    if (existing && (existing.likelihood_score !== row.likelihood_score || existing.impact_score !== row.impact_score)) {
      row.rating_history = [...(existing.rating_history || []), {
        at: now(),
        by: db.user.user_id,
        by_name: db.user.name,
        prev_likelihood: existing.likelihood_score,
        prev_impact: existing.impact_score,
        new_likelihood: row.likelihood_score,
        new_impact: row.impact_score,
        prev_score: existing.risk_score
      }];
    }
  }
  const riskEvent = !existing?"Risk created":row.status!==existing.status&&row.status==="closed"?"Risk closed":row.acceptance_date!==existing.acceptance_date?"Risk accepted":row.likelihood_score!==existing.likelihood_score||row.impact_score!==existing.impact_score?"Risk reassessed":row.owner_id!==existing.owner_id?"Risk owner assigned":row.treatment!==existing.treatment?"Treatment updated":row.next_review!==existing.next_review?"Next Risk Review scheduled":"Risk updated";
  const taskEvent = !existing ? 'Action Item created' : row.status!==existing.status ? row.status==='done'?'Action Item completed':row.status==='in_progress'?'Work started':'Status changed' : row.assignee_id!==existing.assignee_id?'Assignment changed':'Action Item updated';
  if (existing) Object.assign(existing, row);else db[kind].unshift(row);
  if (kind === "risks") ensureRiskReview(db, existing || row);
  if(kind==="vendors") ensureVendorReviews(db,existing||row);
  if(kind==="reviews"&&row.vendor_id) syncVendorReview(db,existing||row);
  if(kind==="reviews") syncPolicyReview(db,existing||row);
  if (kind === 'reviews' && row.risk_id) {
    const risk = db.risks.find(r => r.risk_id === row.risk_id && r.client_id === row.client_id);
    if (risk) Object.assign(risk, {next_review: ['completed','cancelled'].includes(row.status) ? null : row.due_date,
      review_cadence: row.recurrence, custom_recurrence_days: row.custom_recurrence_days});
  }
  if (kind === "tasks" && row.risk_id) {
    const risk=record(db,"risks",row.risk_id);
    if(!existing&&["assessed","open"].includes(risk.status)&&assessedRisk(risk).risk_score) risk.status="in_progress";
    audit(db,taskEvent,"risks",risk,{task_id:row.task_id});
  }
  if (kind === 'tasks' && row.finding_id) {
    const finding = db.findings.find(f => f.finding_id === row.finding_id && f.client_id === row.client_id);
    if (finding && ['open', 'in_remediation', 'remediated'].includes(finding.status)) {
      const work = db.tasks.filter(t => t.finding_id === row.finding_id && t.client_id === row.client_id);
      const next = work.every(t => ['done', 'cancelled'].includes(t.status)) ? 'remediated' : 'in_remediation';
      if(next!==finding.status) audit(db,next==='remediated'?'Related Finding moved to Pending Validation':'Related Finding moved to In Remediation','tasks',row,{finding_id:finding.finding_id});
      finding.status = next;
      finding.updated_at = now();
    }
  }
  if(kind==='risks'&&row.vendor_id&&!existing) audit(db,'Risk linked','vendors',record(db,'vendors',row.vendor_id),{risk_id:row.risk_id});
  if(kind==='tasks'&&row.vendor_id) audit(db,taskEvent,'vendors',record(db,'vendors',row.vendor_id),{task_id:row.task_id});
  const event = kind==='vendors' ? existing?'Vendor updated':'Vendor created' : kind==='tasks' ? taskEvent : kind==='risks'?riskEvent:existing?'update':'create';
  audit(db, event, kind, row,{...(profileChanges?{changes:profileChanges}:{}),...contextChange});
  return existing || row;
}
export function library(db, type, cid) {
  const source = fixtures.responses[`/onboarding/${type}-library`];
  const result = clone(source);
  for (const category of result.categories) for (const item of category.items) {
    for (const key of Object.keys(item)) if (/^(existing_|current_|last_onboarding)|^applicability_rationale$/.test(key)) delete item[key];
    const row = list(db, type === 'policy' ? 'policies' : 'requirements', cid).find(r => r.title?.toLowerCase() === item.name.toLowerCase());
    if (row) Object.assign(item, type === 'policy' ? {
      existing_policy_id: row.policy_id,
      current_presence: row.presence,
      current_status: row.status,
      last_onboarding_note: row.onboarding_note,
      applicability_rationale: row.applicability_rationale
    } : {
      existing_requirement_id: row.requirement_id,
      current_applicability: row.applicability,
      current_note: row.note,
      current_rationale: row.rationale
    });
  }
  return result;
}
