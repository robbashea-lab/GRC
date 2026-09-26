// DEMO - SYNTHETIC DATA. Validates the Dunder Mifflin program module against the ISO 27001 catalog.
import iso from '../../lib/iso27001.json';
import dunder from './dunder';

const STATUSES = ['addressed', 'in_progress', 'needs_attention', 'not_assessed', 'not_applicable'];
const ids = iso.requirements.map(r => r.id);
const annex = new Set(iso.requirements.filter(r => r.specification === 'annex_control').map(r => r.id));
const entries = Object.entries(dunder.assessments);
const clauses = entries.filter(([id]) => !annex.has(id));
const annexEntries = entries.filter(([id]) => annex.has(id));
const count = (list, pred) => list.filter(([, a]) => pred(a)).length;
const near = (actual, target) => expect(Math.abs(actual - target)).toBeLessThanOrEqual(2);

test('covers every catalog id and nothing else', () => {
  expect(ids).toHaveLength(123);
  expect(Object.keys(dunder.assessments).sort()).toEqual([...ids].sort());
  expect(dunder.framework).toBe('iso-27001');
});

test('assessment entries are well formed', () => {
  for (const [id, a] of entries) {
    expect(STATUSES).toContain(a.status);
    expect([0, 1, 2]).toContain(a.owner);
    if (a.status === 'not_assessed') {
      expect(a.assessed_ago).toBeNull();
      expect(a.evidence_ago).toBeNull();
    } else {
      expect(a.assessed_ago).toBeGreaterThan(0);
      expect(a.narrative.length).toBeGreaterThan(20);
    }
    if (!annex.has(id)) expect(a).not.toHaveProperty('soa');
  }
});

test('Statement of Applicability is consistent', () => {
  const justifications = [];
  for (const [id, a] of annexEntries) {
    expect(['included', 'excluded', '']).toContain(a.soa);
    expect(a.soa === 'excluded').toBe(a.status === 'not_applicable');
    if (a.soa) {
      expect(typeof a.justification).toBe('string');
      expect(a.justification.trim().length).toBeGreaterThan(10);
      justifications.push(a.justification.trim().toLowerCase());
    }
  }
  expect(new Set(justifications).size).toBe(justifications.length);
  expect(count(annexEntries, a => a.soa === 'included')).toBe(90);
  expect(annexEntries.filter(([, a]) => a.soa === 'excluded').map(([id]) => id).sort()).toEqual(['A.8.28', 'A.8.4']);
  expect(dunder.assessments['A.8.11']).toMatchObject({ soa: '', status: 'not_assessed' });
});

test('status mix lands in realistic targets', () => {
  expect(count(clauses, a => a.status === 'not_assessed')).toBe(0);
  near(count(clauses, a => a.status === 'addressed'), 24);
  near(count(clauses, a => a.status === 'in_progress'), 6);
  expect(dunder.assessments['4.3'].status).toBe('addressed');
  const included = annexEntries.filter(([, a]) => a.soa === 'included');
  near(count(included, a => a.status === 'addressed'), 70);
  near(count(included, a => a.status === 'in_progress'), 13);
  near(count(included, a => a.status === 'needs_attention'), 4);
  near(count(included, a => a.status === 'not_assessed'), 3);
  const addressed = entries.filter(([, a]) => a.status === 'addressed');
  near(count(addressed, a => a.assessed_ago > 365), 6);
  near(count(addressed, a => a.evidence_ago > 365), 6);
  near(count(addressed, a => a.evidence_ago === null), 10);
});

test('findings, review findings, risks and vendors are valid', () => {
  expect(dunder.findings).toHaveLength(7);
  for (const f of dunder.findings) {
    expect(ids).toContain(f.definition);
    expect([0, 1, 2]).toContain(f.assignee);
    expect(['low', 'medium', 'high', 'critical']).toContain(f.severity);
    if (f.closed_ago != null) expect(f.age).toBeGreaterThan(f.closed_ago);
  }
  expect(dunder.findings.filter(f => f.closed_ago == null)).toHaveLength(3);
  expect(dunder.review_findings).toHaveLength(4);
  dunder.review_findings.forEach(r => { expect(r.title).toBeTruthy(); expect(r.action).toBeTruthy(); });
  for (const r of dunder.risks) {
    expect([0, 1, 2]).toContain(r.owner);
    expect(['in_progress', 'assessed', 'accepted', 'closed']).toContain(r.status);
    expect(['mitigate', 'accept', 'transfer', 'avoid', 'monitor']).toContain(r.treatment);
    expect(r.status === 'accepted').toBe(!!r.acceptance);
    expect(r.status === 'closed').toBe(!!r.closure && r.next_in === null);
  }
  for (const v of dunder.vendors) expect([0, 1, 2]).toContain(v.owner);
  expect(dunder.vendors.some(v => v.assurance.refresh_in < 0)).toBe(true);
});
