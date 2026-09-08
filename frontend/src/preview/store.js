import fixtures from './fixtures.json';
export const STORE_KEY = 'grc_interactive_demo_v1';
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
  const db = Object.fromEntries(Object.keys(ids).map(k => [k, []]));
  for (const [key, value] of Object.entries(fixtures.responses)) {
    const path = key.split('?')[0].slice(1);
    if (!ids[path] || !Array.isArray(value)) continue;
    for (const row of value) if (!db[path].some(r => r[ids[path]] === row[ids[path]])) db[path].push(clone(row));
  }
  db.user = clone(fixtures.responses['/auth/me']);
  db.logs = clone(fixtures.responses['/audit-logs']?.items || []);
  db.notifications = clone(fixtures.responses['/notifications']?.items || []);
  db.drafts = {};
  for (const [key, value] of Object.entries(fixtures.responses)) if (key.startsWith('/onboarding/state?')) db.assessments.push(...clone(value.assessments || []));
  return db;
}
export function readStore() {
  const saved = sessionStorage.getItem(STORE_KEY);
  if (saved) return JSON.parse(saved);
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
export function audit(db, action, kind, row) {
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
      name: row.name
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
      status: 'active',
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
  validate(db, kind, row, existing);
  if (kind === 'risks' && row.likelihood_score && row.impact_score) {
    row.risk_score = row.likelihood_score * row.impact_score;
    row.risk_level = row.risk_score >= 15 ? 'critical' : row.risk_score >= 10 ? 'high' : row.risk_score >= 5 ? 'moderate' : 'low';
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
      row.last_reviewed = now();
    }
  }
  if (existing) Object.assign(existing, row);else db[kind].unshift(row);
  audit(db, existing ? 'update' : 'create', kind, row);
  return existing || row;
}
export function library(db, type, cid) {
  const source = Object.entries(fixtures.responses).find(([k]) => k.startsWith(`/onboarding/${type}-library?`))[1];
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
