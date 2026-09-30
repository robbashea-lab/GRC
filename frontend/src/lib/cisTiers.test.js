import data from './operatorGuidance/cisTiers.json';
import ig1 from './cisIG1.json';
import { TIERS, tiersFor, tierProgress, tierSignal, validChecklistIds, normalizeChecklist } from './cisTiers';

const ids = ig1.requirements.map((r) => r.id);
const keys = TIERS.map(([k]) => k);

test('covers exactly the 56 IG1 safeguards', () => {
  expect(ids).toHaveLength(56);
  expect(Object.keys(data).filter((k) => k !== '_note').sort()).toEqual([...ids].sort());
});

test('note disclaims CIS text', () => {
  expect(data._note).toMatch(/Not CIS text/);
});

test('each tier has 3-5 items with valid unique ids', () => {
  const seen = new Set();
  const letter = { foundation: 'f', operational: 'o', mature: 'm' };
  ids.forEach((id) => {
    keys.forEach((k) => {
      const items = data[id][k];
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items.length).toBeLessThanOrEqual(5);
      items.forEach((c) => {
        expect(c.id).toMatch(new RegExp(`^${id.replace('.', '\\.')}-${letter[k]}\\d+$`));
        expect(seen.has(c.id)).toBe(false);
        seen.add(c.id);
        expect(c.text.trim().length).toBeGreaterThan(0);
        expect(c.text).not.toMatch(/\.$/);
      });
    });
  });
});

test('no item text appears in more than 2 safeguards', () => {
  const where = {};
  ids.forEach((id) => keys.forEach((k) => data[id][k].forEach((c) => {
    const t = c.text.toLowerCase();
    (where[t] = where[t] || new Set()).add(id);
  })));
  const bad = Object.entries(where).filter(([, s]) => s.size > 2).map(([t]) => t);
  expect(bad).toEqual([]);
});

test('tiersFor unknown returns null', () => {
  expect(tiersFor('99.9')).toBeNull();
  expect(tiersFor('_note')).toBeNull();
  expect(tiersFor('1.1').foundation[0].id).toBe('1.1-f1');
});

test('normalizeChecklist filters, dedupes, fills keys', () => {
  expect(normalizeChecklist(null, '1.1')).toEqual({ foundation: [], operational: [], mature: [] });
  expect(normalizeChecklist({ foundation: ['1.1-f1', '1.1-f1', '1.1-o1', 'x', '5.2-f1'], mature: 'bad' }, '1.1'))
    .toEqual({ foundation: ['1.1-f1'], operational: [], mature: [] });
  expect(validChecklistIds('1.1').has('1.1-m1')).toBe(true);
  expect(validChecklistIds('nope').size).toBe(0);
});

test('tierProgress counts only valid ids', () => {
  const p = tierProgress({ foundation: ['1.1-f1', 'junk', '1.1-f1'] }, '1.1');
  expect(p.foundation).toEqual({ done: 1, total: data['1.1'].foundation.length });
  expect(p.operational.done).toBe(0);
  expect(tierProgress(undefined, 'zz')).toEqual({
    foundation: { done: 0, total: 0 }, operational: { done: 0, total: 0 }, mature: { done: 0, total: 0 } });
});

test('tierSignal messages', () => {
  const all = (k) => data['1.1'][k].map((c) => c.id);
  const sig = (c) => tierSignal(tierProgress(c, '1.1'));
  expect(sig(null)).toBeNull();
  expect(tierSignal(null)).toBeNull();
  expect(sig({ operational: ['1.1-o1'] })).toBe('Foundation checks incomplete');
  expect(sig({ foundation: all('foundation') })).toBe('Foundation checks complete · Operational verification incomplete');
  expect(sig({ foundation: all('foundation'), operational: all('operational') })).toBe('Foundation and operational checks complete');
  const s = sig({ foundation: all('foundation'), operational: all('operational'), mature: all('mature') });
  expect(s).toBe('All verification checks complete');
  expect(s).not.toMatch(/%/);
});
