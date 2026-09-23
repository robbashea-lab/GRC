import axios from 'axios';
import { previewAdapter } from './adapter';
import { seedStore, ids, saveStore, readStore } from './store';
import { demoOrganizations, demoDates } from './demoPortfolio';
import { CATALOGS, frameworkDefinition } from '../lib/frameworks';
import { validateProfile } from '../lib/clientProfile';
import { evidenceReferences } from './evidence';
import { validateAssignment } from './assignmentEligibility';
import { validateClientRelationships } from './clientRelationships';
import { portfolio } from './summaries';
const api = axios.create({
  adapter: previewAdapter
});
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
test('same day produces byte-identical seed and dates advance with the clock', () => {
  const a = seedStore(new Date('2028-02-29T12:00:00Z')),
    b = seedStore(new Date('2028-02-29T18:00:00Z'));
  expect(b).toEqual(a);
  const c = seedStore(new Date('2030-01-01T12:00:00Z'));
  expect(c.clients.map(c => c.client_id)).toEqual(a.clients.map(c => c.client_id));
  expect(c.reviews[0].due_date).toBe(demoDates(new Date('2030-01-01'))(-8));
  expect(JSON.stringify(a).length).toBeLessThan(4000000);
});
test('canonical framework programs, real profiles, scoped people and valid assessments', () => {
  const db = seedStore();
  for (const org of demoOrganizations) {
    const cid = 'demo_' + org.key,
      c = db.clients.find(c => c.client_id === cid);
    expect(db.requirements.filter(r => r.client_id === cid && r.baseline_response === 'applies').map(r => r.baseline_key).sort()).toEqual([...org.frameworks].sort());
    for (const [section, values] of Object.entries(c.profile)) expect(() => validateProfile(section, values)).not.toThrow();
    expect(() => validateClientRelationships(db, c)).not.toThrow();
    expect(db.contacts.filter(p => p.client_id === cid).map(p => p.name)).toEqual(org.people);
    for (const [kind, field] of Object.entries(ids)) for (const r of db[kind].filter(r => r.client_id === cid)) {
      expect(() => validateAssignment(db, kind, r)).not.toThrow();
      expect(r[field]).toBeTruthy();
    }
    for (const a of db.framework_assessments.filter(a => a.client_id === cid)) {
      const d = frameworkDefinition(a.framework_key, a.definition_id);
      expect(d).toBeTruthy();
      for (const l of a.related_links) expect(db[l.kind].some(r => r[ids[l.kind]] === l.id && r.client_id === cid)).toBe(true);
      if (d.specification === 'addressable' && a.status === 'addressed') {
        expect(a.addressable_decision).toBe('as_written');
        expect(a.addressable_rationale).toBeTruthy();
      }
      if (d.specification === 'annex_control' && a.status === 'addressed') expect(a.soa_applicability).toBe('included');
    }
  }
  expect(db.framework_assessments.some(a => a.framework_key === 'cmmc')).toBe(false);
});
test('historical occurrences, remediation chronology and downloadable evidence reconcile', () => {
  const db = seedStore(),
    today = demoDates()(0);
  for (const r of db.reviews) {
    expect(r.occurrences.length).toBeGreaterThan(0);
    for (const o of r.occurrences) {
      expect(o.completed_at <= today).toBe(true);
      expect(o.completed_at <= o.due_date).toBe(true);
      expect(o.finding_count).toBe(db.findings.filter(f => f.review_id === r.review_id && f.occurrence_id === o.occurrence_id).length);
    }
  }
  for (const f of db.findings) {
    const tasks = db.tasks.filter(t => t.finding_id === f.finding_id);
    expect(tasks).toHaveLength(1);
    const t = tasks[0];
    expect(t.title.startsWith('Remediate:')).toBe(false);
    if (t.completed_at) expect(t.completed_at >= f.created_at).toBe(true);
    if (f.status === 'closed') {
      expect(t.status).toBe('done');
      expect(f.closed_at >= t.completed_at).toBe(true);
    }
  }
  for (const e of db.evidence) {
    expect(atob(e.content_base64)).toContain('DEMO - SYNTHETIC DATA');
    expect(atob(e.content_base64).length).toBe(e.size);
    expect(evidenceReferences(db, e).every(r => r.available)).toBe(true);
    expect(evidenceReferences(db, e).length).toBeGreaterThan(0);
    expect(atob(e.content_base64)).toContain('Collected: ' + e.evidence_date);
  }
  for (const risk of db.risks.filter(r => r.status === 'closed')) expect(risk.last_reviewed <= risk.closed_at).toBe(true);
  for (const c of db.clients) expect(db.evidence.filter(e => e.client_id === c.client_id).length).toBeGreaterThanOrEqual(8);
});
test('Globo shares operational records across all substantive frameworks without cloned base policies', () => {
  const db = seedStore(),
    cid = 'demo_globo',
    assessments = db.framework_assessments.filter(a => a.client_id === cid);
  expect(new Set(assessments.map(a => a.framework_key))).toEqual(new Set(Object.keys(CATALOGS)));
  const shared = kind => db[kind].filter(r => r.client_id === cid).some(r => new Set(assessments.filter(a => a.related_links.some(l => l.kind === kind && l.id === r[ids[kind]])).map(a => a.framework_key)).size >= 3);
  for (const kind of ['reviews', 'policies', 'evidence', 'risks']) expect(shared(kind)).toBe(true);
  const policies = db.policies.filter(p => p.client_id === cid);
  expect(new Set(policies.map(p => p.baseline_key)).size).toBe(policies.length);
});
test('reset recovers creations edits deletions completions and baseline without touching standard storage', async () => {
  await api.post('/demo/enter');
  const original = readStore(),
    cid = original.clients[0].client_id;
  localStorage.setItem('standard-sentinel', 'unchanged');
  const created = (await api.post('/tasks', {
    client_id: cid,
    title: 'Temporary demo action'
  })).data;
  await api.patch('/clients/' + cid, {
    name: 'Temporary name'
  });
  const r = original.reviews.find(r => r.client_id === cid);
  await api.post('/reviews/' + r.review_id + '/complete', {
    occurrence_id: r.current_occurrence_id
  });
  const modified = readStore();
  modified.assets = modified.assets.filter(a => a.client_id !== cid);
  saveStore(modified);
  await api.post('/demo/reset');
  const restored = readStore();
  expect(restored).toEqual(seedStore());
  expect(restored.tasks.some(t => t.task_id === created.task_id)).toBe(false);
  expect(localStorage.getItem('standard-sentinel')).toBe('unchanged');
  const metrics = portfolio(restored, false);
  expect(metrics.clients.every(c => c.last_activity)).toBe(true);
});
test('scoped demo actors cannot read or mutate another client or evidence', async () => {
  await api.post('/demo/enter');
  const db = readStore(),
    [a, b] = db.clients;
  db.user = db.users.find(u => u.client_ids?.length === 1 && u.client_ids[0] === a.client_id && u.role === 'client_contributor');
  saveStore(db);
  for (const path of ['/reviews', '/evidence/library', '/frameworks/nist-csf-2']) await expect(api.get(path, {
    params: {
      client_id: b.client_id
    }
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  const risk = db.risks.find(r => r.client_id === b.client_id);
  await expect(api.patch('/risks/' + risk.risk_id, {
    title: 'Unauthorized'
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  expect(readStore().risks.find(r => r.risk_id === risk.risk_id).title).toBe(risk.title);
  expect((await api.get('/risks')).data.every(r => r.client_id === a.client_id)).toBe(true);
  await expect(api.get('/related', {
    params: {
      entity_type: 'risks',
      entity_id: risk.risk_id
    }
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  await expect(api.post('/tasks', {
    client_id: b.client_id,
    title: 'Unauthorized'
  }, {
    params: {
      client_id: a.client_id
    }
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  await expect(api.post('/bulk', {
    kind: 'risks',
    ids: [risk.risk_id],
    action: 'update',
    payload: {
      title: 'Unauthorized'
    }
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
});
