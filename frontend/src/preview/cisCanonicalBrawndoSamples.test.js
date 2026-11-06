import {activeDefinitions} from '../lib/frameworks';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {brawndoOnboardingSelection} from './cisCanonicalBrawndoBaseline';
import {brawndoOperatingSamples} from './cisCanonicalBrawndoSamples';

const dates = cisDemoFixtureDates(new Date('2026-11-02T12:00:00.000Z'));
const safeguardId = assessmentId => assessmentId.replace('fw_demo_brawndo_assessment_', '');
const csv = rows => {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  return keys.map(cell).join(',') + '\n' + rows.map(row => keys.map(key => cell(row[key])).join(',')).join('\n') + '\n';
};

test('seven bounded observation sources cover exactly all 54 assessed IG1 safeguards with actual sample fields', () => {
  const artifacts = brawndoOperatingSamples(dates);
  expect(artifacts).toHaveLength(7);
  expect(new Set(artifacts.map(row => row.key)).size).toBe(7);
  const expected = activeDefinitions('cis-ig1', {implementation_group: 1}).filter(row => !['11.4', '14.8'].includes(row.id)).map(row => row.id).sort();
  const linked = [...new Set(artifacts.flatMap(artifact => artifact.assessment_ids.map(safeguardId)))].sort();
  expect(linked).toEqual(expected);
  for (const artifact of artifacts) {
    expect(artifact.title).toMatch(/^DEMO - SYNTHETIC:/);
    expect(artifact.rows.length).toBeGreaterThan(0);
    expect(artifact.assessment_ids.length + artifact.policy_keys.length).toBeLessThanOrEqual(100);
    for (const row of artifact.rows) {
      for (const key of ['observed_at', 'safeguards', 'scope', 'entity', 'source_file', 'observed_value', 'result', 'exceptions', 'owner_role']) expect(typeof row[key]).toBe('string');
      expect(row.entity).not.toBe('');
      expect(row.source_file).toMatch(/\.csv$/);
      expect(row.observed_value.trim().length).toBeGreaterThan(15);
      expect(row.observed_value).not.toMatch(/^(implemented|addressed|not implemented|passed|complete|verified)$/i);
      expect(Object.values(row).every(value => typeof value === 'string')).toBe(true);
    }
  }
});

test('inventory contains exactly 79 unique assets and preserves the six actual kiosk metadata gaps within 16 KiB', () => {
  const inventory = brawndoOperatingSamples(dates).find(row => row.key === 'inventory');
  expect(inventory.rows).toHaveLength(79);
  expect(new Set(inventory.rows.map(row => row.entity)).size).toBe(79);
  expect(Object.fromEntries(['WIN', 'KIOSK', 'NET', 'VM'].map(type => [type, inventory.rows.filter(row => row.asset_type === type).length])))
    .toEqual({WIN: 55, KIOSK: 10, NET: 12, VM: 2});
  const missing = inventory.rows.filter(row => !row.hardware_address || !row.asset_owner);
  expect(missing).toHaveLength(6);
  expect(missing.every(row => row.asset_type === 'KIOSK' && row.hardware_address === '' && row.asset_owner === '' && row.result === 'partial')).toBe(true);
  expect(inventory.rows.filter(row => row.encryption === 'BitLocker:on')).toHaveLength(65);
  expect(inventory.rows.every(row => row.authorized === 'yes')).toBe(true);
  expect(new TextEncoder().encode(csv(inventory.rows)).byteLength).toBeLessThanOrEqual(16 * 1024);
});

test('only the two expressly later overdue observations occur after the common evidence cutoff', () => {
  const rows = brawndoOperatingSamples(dates).flatMap(artifact => artifact.rows);
  const late = rows.filter(row => row.observed_at > dates.day(-21));
  expect(late.map(row => [row.safeguards, row.observed_at])).toEqual([['7.2', dates.day(-6)], ['15.1', dates.day(-10)]]);
  for (const row of rows) expect(row.observed_at <= dates.day(0)).toBe(true);
  expect(late.find(row => row.safeguards === '7.2').observed_value).toContain(dates.day(-7));
  expect(late.find(row => row.safeguards === '15.1').observed_value).toContain(dates.day(-12));
});

test('software versions are dated observations with entitlements, separate client/server jobs and no unsupported latest-version claim', () => {
  const software = brawndoOperatingSamples(dates).find(row => row.key === 'software');
  const versions = software.rows.filter(row => row.observed_at === '2026-10-12');
  expect(versions.some(row => row.observed_value.includes('26200.9457'))).toBe(true);
  expect(versions.some(row => row.observed_value.includes('155.0.4283.45'))).toBe(true);
  expect(versions.some(row => row.observed_value.includes('20430.20146'))).toBe(true);
  expect(versions.some(row => row.observed_value.includes('65 OEM Pro licenses'))).toBe(true);
  expect(versions.some(row => row.observed_value.includes('65 Business Premium user entitlements'))).toBe(true);
  expect(software.rows.some(row => row.source_file === 'server-patch-jobs.csv' && row.observed_value.includes('succeeded=2'))).toBe(true);
  expect(software.rows.find(row => row.observed_value.includes('155.0.4283.45')).exceptions).toMatch(/does not prove/);
});

test('known process and maintenance failures remain failures; unknown safeguards have no observations or links', () => {
  const artifacts = brawndoOperatingSamples(dates);
  const rows = artifacts.flatMap(artifact => artifact.rows);
  const failure = id => rows.find(row => row.safeguards === id);
  expect(failure('7.1').observed_value).toMatch(/procedure found=0/);
  expect(failure('7.1').result).toMatch(/missing documented/);
  expect(failure('7.2').observed_value).toMatch(/completion record=absent/);
  expect(failure('7.2').result).toMatch(/Partial.*missed/);
  expect(failure('15.1').observed_value).toMatch(/signed current reconciliation=absent/);
  expect(failure('15.1').result).toMatch(/overdue/);
  expect(failure('4.1').observed_value).toMatch(/process documents=0/);
  for (const id of ['11.4', '14.8', '7.5', '7.6', '17.7']) {
    expect(rows.some(row => row.safeguards.split('|').includes(id))).toBe(false);
    expect(artifacts.some(artifact => artifact.assessment_ids.includes('fw_demo_brawndo_assessment_' + id))).toBe(false);
  }
});

test('observations include concrete access, recovery custody, DNS, event trace, backup and training results', () => {
  const rows = brawndoOperatingSamples(dates).flatMap(artifact => artifact.rows);
  const values = id => rows.filter(row => row.safeguards.split('|').includes(id)).map(row => row.observed_value).join('\n');
  expect(values('3.3')).toMatch(/finance-01 -> payroll=ALLOW; sales-01 -> payroll=DENY/);
  expect(values('3.6')).toMatch(/Recovery-key custody: restricted support vault/);
  expect(values('9.2')).toMatch(/malware\.testcategory\.com -> REFUSED/);
  expect(values('8.2')).toMatch(/seq441 -> collector seq927/);
  expect(values('11.2')).toMatch(/rerun04:10=success/);
  expect(values('14.2')).toMatch(/Recorded answer:.*call established supplier number/);
  expect(values('17.2')).toMatch(/correct fictional role=4\/4/);
});

test('pure generation is repeatable, uses only selected document keys and rejects an impossible pre-release sample date', () => {
  const first = brawndoOperatingSamples(dates);
  expect(brawndoOperatingSamples(dates)).toEqual(first);
  first[0].rows[0].entity = 'Changed externally';
  expect(brawndoOperatingSamples(dates)[0].rows[0].entity).toBe('BW-WIN-01');
  const selected = new Set(brawndoOnboardingSelection().policy_keys);
  expect(brawndoOperatingSamples(dates).flatMap(row => row.policy_keys).every(key => selected.has(key))).toBe(true);
  expect(() => brawndoOperatingSamples(cisDemoFixtureDates(new Date('2026-10-22T12:00:00Z')))).toThrow('on or after 2026-11-02');
  expect(() => brawndoOperatingSamples({anchor: 'invalid', day: () => 'invalid'})).toThrow('frozen scenario date model');
});
