import {activeDefinitions} from '../lib/frameworks';
import {BRAWNDO_SCENARIO_PROFILE, BRAWNDO_SAFEGUARD_IDS, brawndoSafeguardContent} from './cisCanonicalBrawndoContent';

const statusFor = id => BRAWNDO_SCENARIO_PROFILE.partial.includes(id) ? 'in_progress'
  : BRAWNDO_SCENARIO_PROFILE.gaps.includes(id) ? 'needs_attention'
    : BRAWNDO_SCENARIO_PROFILE.unknown.includes(id) ? 'not_assessed' : 'addressed';
const definitions = activeDefinitions('cis-ig1', {implementation_group: 1});

test('Brawndo content covers exactly the native IG1 population and retains four truthful implementation states', () => {
  expect(BRAWNDO_SAFEGUARD_IDS.slice().sort()).toEqual(definitions.map(row => row.id).sort());
  const counts = Object.fromEntries(['addressed', 'in_progress', 'needs_attention', 'not_assessed'].map(status =>
    [status, definitions.filter(row => statusFor(row.id) === status).length]));
  expect(counts).toEqual({addressed: 48, in_progress: 4, needs_attention: 2, not_assessed: 2});
  expect(new Set([...BRAWNDO_SCENARIO_PROFILE.partial, ...BRAWNDO_SCENARIO_PROFILE.gaps, ...BRAWNDO_SCENARIO_PROFILE.unknown]).size).toBe(8);
  const implementations = definitions.map(definition => {
    const row = brawndoSafeguardContent(definition.id, statusFor(definition.id));
    for (const key of ['scope', 'current_implementation', 'technology_process', 'owner_role', 'process_owner_role', 'evidence_check']) {
      expect(typeof row[key]).toBe('string');
      expect(row[key].trim()).not.toBe('');
    }
    expect(Object.values(row).every(value => typeof value === 'string')).toBe(true);
    expect(row.current_implementation).not.toBe(definition.title);
    return row.current_implementation;
  });
  expect(new Set(implementations).size).toBe(definitions.length);
});

test.each(['7.5', '7.6', '17.7', '18.2', 'unknown', '__proto__'])('Brawndo cannot acquire out-of-scope safeguard content for %s', id => {
  expect(() => brawndoSafeguardContent(id, 'addressed')).toThrow('supported CIS IG1 safeguard');
});

test('7.1 missing lifecycle and 7.2 partial remediation maintenance remain separate gaps', () => {
  const lifecycle = brawndoSafeguardContent('7.1', 'needs_attention');
  const remediation = brawndoSafeguardContent('7.2', 'in_progress');
  expect(lifecycle.current_implementation).toMatch(/no maintained documented vulnerability-management process/i);
  expect(lifecycle.current_implementation).toMatch(/asset scope.*information sources.*triage responsibilities/i);
  expect(lifecycle.assessment_notes).toMatch(/absent/i);
  expect(remediation.current_implementation).toMatch(/documented remediation worksheet/i);
  expect(remediation.current_implementation).toMatch(/current cycle is overdue/i);
  expect(remediation.assessment_notes).toMatch(/process exists/i);
  expect(lifecycle.remediation).toMatch(/annual\/significant-change/i);
  expect(remediation.remediation).toMatch(/monthly review/i);
  expect(lifecycle.remediation).not.toMatch(/authenticated scan/i);
  expect(lifecycle.assessment_plan).toBe('');
});

test.each(['1.1', '3.1', '4.1', '7.1', '7.2', '15.1'])('every known gap has a concrete remediation path: %s', id => {
  const row = brawndoSafeguardContent(id, statusFor(id));
  expect(row.remediation).not.toBe('');
  expect(row.assessment_notes).not.toBe('');
  expect(row.assessment_plan).toBe('');
});

test.each(['11.4', '14.8'])('genuinely unassessed %s has context and a plan without completed assessment claims', id => {
  const row = brawndoSafeguardContent(id, 'not_assessed');
  expect(row.assessment_notes).toBe('');
  expect(row.remediation).toBe('');
  expect(row.evidence_check).toMatch(/^Assessment preparation only:/);
  expect(row.assessment_plan).not.toBe('');
  expect(row.current_implementation).toMatch(/not assessed/i);
  expect(() => brawndoSafeguardContent(id, 'addressed')).toThrow('requires not_assessed');
});

test('native context preserves the distinct inventory, process, backup and incident obligations', () => {
  expect(brawndoSafeguardContent('1.1', 'in_progress').current_implementation).toMatch(/six packaging kiosks.*hardware address.*owner/i);
  expect(brawndoSafeguardContent('4.1', 'needs_attention').current_implementation).toMatch(/no maintained documented secure-configuration process/i);
  expect(brawndoSafeguardContent('4.2', 'addressed').current_implementation).toMatch(/separate maintained network-device runbook/i);
  expect(brawndoSafeguardContent('7.3', 'addressed').technology_process).toMatch(/not claimed to patch Windows Server/i);
  expect(brawndoSafeguardContent('11.2', 'addressed').assessment_notes).toMatch(/do not establish.*isolation/i);
  expect(brawndoSafeguardContent('15.1', 'in_progress').current_implementation).toMatch(/annual reconciliation.*overdue/i);
  expect(brawndoSafeguardContent('17.1', 'addressed').assessment_notes).toMatch(/internal primary.*backup.*provider oversight/i);
  expect(BRAWNDO_SAFEGUARD_IDS).not.toContain('17.7');
});

test('content rejects contradictory statuses and returns independent plain content without record identities or dates', () => {
  expect(() => brawndoSafeguardContent('7.1', 'addressed')).toThrow('requires needs_attention');
  expect(() => brawndoSafeguardContent('9.1', 'not_assessed')).toThrow('requires addressed');
  expect(() => brawndoSafeguardContent('9.1', 'unexpected')).toThrow('requires addressed');
  const original = brawndoSafeguardContent('9.1', 'addressed');
  const edited = brawndoSafeguardContent('9.1', 'addressed');
  edited.current_implementation = 'Visitor edit';
  expect(brawndoSafeguardContent('9.1', 'addressed')).toEqual(original);
  for (const id of BRAWNDO_SAFEGUARD_IDS) {
    const content = brawndoSafeguardContent(id, statusFor(id));
    expect(Object.keys(content).sort()).toEqual(['scope', 'current_implementation', 'technology_process', 'assessment_notes',
      'owner_role', 'process_owner_role', 'evidence_check', 'remediation', 'assessment_plan'].sort());
    expect(JSON.stringify(content)).not.toMatch(/demo_brawndo|\d{4}-\d{2}-\d{2}|(?:risk|finding|task|evidence|user|client)_id/);
  }
});
