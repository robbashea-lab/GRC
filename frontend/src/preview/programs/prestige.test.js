// DEMO - SYNTHETIC DATA. Validates the Prestige Worldwide SOC 2 program module against the catalog.
import soc from '../../lib/soc2.json';
import prestige from './prestige';

const IN_SCOPE = soc.requirements.map(r => r.id).filter(id => /^(CC\d|A1\.|C1\.)/.test(id));
const STATUSES = ['addressed', 'in_progress', 'needs_attention', 'not_assessed', 'not_applicable'];
const entries = Object.entries(prestige.assessments);
const person = v => Number.isInteger(v) && v >= 0 && v <= 2;
const countOk = v => v === null || (Number.isInteger(v) && v >= 0);

test('covers exactly the 38 in-scope criteria with catalog ids', () => {
  expect(IN_SCOPE).toHaveLength(38);
  expect(Object.keys(prestige.assessments).sort()).toEqual([...IN_SCOPE].sort());
  expect(prestige.framework).toBe('soc-2');
  expect(prestige.soc).toMatchObject({categories: ['security', 'availability', 'confidentiality'], period_start_ago: 180, period_end_in: 185});
  prestige.soc.categories.forEach(c => expect(soc.categories[c]).toBeTruthy());
});

test('statuses valid and counts land in targets', () => {
  const n = s => entries.filter(([, a]) => a.status === s).length;
  entries.forEach(([, a]) => expect(STATUSES).toContain(a.status));
  expect(Math.abs(n('addressed') - 26)).toBeLessThanOrEqual(2);
  expect(Math.abs(n('in_progress') - 6)).toBeLessThanOrEqual(2);
  expect(Math.abs(n('needs_attention') - 2)).toBeLessThanOrEqual(2);
  expect(n('not_assessed')).toBe(2);
  expect(n('not_applicable')).toBe(0);
  expect(entries.filter(([, a]) => a.status === 'addressed' && a.evidence_ago === null).length).toBeLessThanOrEqual(3);
});

test('controls are consistent with criterion status', () => {
  for (const [id, a] of entries) {
    expect(person(a.owner)).toBe(true);
    const cs = a.controls || [];
    if (a.status !== 'not_assessed') {
      expect(cs.length).toBeGreaterThanOrEqual(1);
      expect(cs.length).toBeLessThanOrEqual(3);
      expect(a.assessed_ago).toBeGreaterThanOrEqual(5);
      expect(a.assessed_ago).toBeLessThanOrEqual(200);
      expect(a.narrative.length).toBeGreaterThan(20);
    }
    expect(new Set(cs.map(c => c.control_id)).size).toBe(cs.length);
    for (const c of cs) {
      expect(['adequate', 'gap', 'not_assessed']).toContain(c.design);
      expect(['effective', 'gap', 'not_assessed']).toContain(c.operating);
      expect(person(c.owner)).toBe(true);
      expect(countOk(c.expected) && countOk(c.collected)).toBe(true);
      expect(c.expected === null).toBe(c.collected === null);
      if (c.expected !== null) expect(c.collected).toBeLessThanOrEqual(c.expected);
      expect(c.population_notes && c.testing_notes && c.name && c.frequency).toBeTruthy();
    }
    const exception = c => c.design === 'gap' || c.operating === 'gap' || (c.expected !== null && c.collected < c.expected);
    if (a.status === 'addressed') cs.forEach(c => {
      expect([id, c.design, c.operating]).toEqual([id, 'adequate', 'effective']);
      expect(c.expected).not.toBeNull();
      expect(c.collected).toBe(c.expected);
    });
    if (a.status === 'addressed' && a.evidence_ago !== null) expect(a.evidence_ago).toBeLessThan(180);
    if (a.status === 'needs_attention') expect(cs.some(c => c.operating === 'gap')).toBe(true);
    if (a.status === 'in_progress') expect(cs.some(exception)).toBe(true);
    if (a.status === 'not_assessed') cs.forEach(c => {
      expect([c.design, c.operating, c.expected, c.collected]).toEqual(['not_assessed', 'not_assessed', null, null]);
    });
  }
});

test('shared control ids are identical wherever reused', () => {
  const seen = {};
  for (const [, a] of entries) for (const c of a.controls || []) {
    const {control_id, ...rest} = c;
    if (seen[control_id]) expect(rest).toEqual(seen[control_id]);
    else seen[control_id] = rest;
  }
  expect(Object.keys(seen).length).toBeGreaterThanOrEqual(30);
});

test('confidentiality criteria are not yet assessed', () => {
  ['C1.1', 'C1.2'].forEach(id => {
    expect(prestige.assessments[id].status).toBe('not_assessed');
    expect(prestige.assessments[id].assessed_ago).toBeNull();
  });
});

test('findings, review findings, risks and vendors are well formed', () => {
  expect(prestige.review_findings).toHaveLength(4);
  prestige.review_findings.forEach(f => expect(f.title && f.action).toBeTruthy());
  const open = prestige.findings.filter(f => f.closed_ago === undefined);
  const closed = prestige.findings.filter(f => f.closed_ago !== undefined);
  prestige.findings.forEach(f => {
    expect(IN_SCOPE).toContain(f.definition);
    expect(person(f.assignee)).toBe(true);
    expect(['low', 'medium', 'high', 'critical']).toContain(f.severity);
  });
  expect(open.map(f => f.definition).sort()).toEqual(['A1.3', 'CC6.3', 'CC7.2', 'CC8.1', 'CC9.2']);
  expect(open.some(f => f.due_in < 0)).toBe(true);
  expect(closed).toHaveLength(3);
  closed.forEach(f => {
    expect(f.closed_ago).toBeGreaterThanOrEqual(60);
    expect(f.closed_ago).toBeLessThanOrEqual(90);
    expect(f.age).toBeGreaterThan(f.closed_ago);
  });
  prestige.risks.forEach(r => expect(person(r.owner)).toBe(true));
  expect(prestige.risks.filter(r => r.status === 'accepted' && r.treatment === 'accept' && r.acceptance)).toHaveLength(1);
  expect(prestige.risks.filter(r => r.status === 'closed' && r.closure && r.next_in === null)).toHaveLength(1);
  prestige.vendors.forEach(v => expect(person(v.owner)).toBe(true));
  expect(prestige.vendors.some(v => v.assurance.refresh_in < 0)).toBe(true);
  expect(prestige.vendors.some(v => v.assurance.refresh_in >= 0 && v.assurance.refresh_in <= 30)).toBe(true);
});
