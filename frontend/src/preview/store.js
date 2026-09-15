import {validateVendor,ensureVendorReviews,syncVendorReview} from './vendors';
import { ensureRiskReview } from './risks';
import { initializeRiskIds, allocateRiskId } from './riskIds';
import { prepareTask } from './actionItems';
import { buildDemoStore } from './demoSeed';
import fixtures from './demoConfiguration.json';
import { reviewView, reviewSchedule } from '../lib/reviewOccurrences';
import { assessedRisk } from '../lib/grcWork';
export const STORE_KEY = 'grc_interactive_demo_v2';
export const clone = value => JSON.parse(JSON.stringify(value));
export const ids = {
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
export function seedStore() {
  const db = initializeRiskIds(buildDemoStore(Object.keys(ids)));
  db.risks.forEach(risk => ensureRiskReview(db, risk));
  db.vendors.forEach(vendor => ensureVendorReviews(db, vendor));
  return db;
}
export function readStore() {
  const saved = sessionStorage.getItem(STORE_KEY);
  if (saved) return initializeRiskIds(JSON.parse(saved));
  const db = seedStore();
  saveStore(db);
  return db;
}
export function saveStore(db) {
  // Persist before responding: quota failures must never masquerade as saved changes.
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    throw new Error('Demo storage is full or unavailable. Remove large evidence files or reset the demo, then try again. Changes were not saved.');
  }
}
export function resetStore() {
  saveStore(seedStore());
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
    updated_at: now()
  };
  if (kind === 'tasks') {
    if(existing) {row.created_at=existing.created_at;row.created_by=existing.created_by;}
    prepareTask(db,row,existing);
    if ('assignee_id' in body && existing && 'owner_id' in existing) row.owner_id=null;
  }
  if(kind==='vendors') {validateVendor(db,row,existing);row.service=row.service||row.services;}
  validate(db, kind, row, existing);
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
  audit(db, event, kind, row);
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
