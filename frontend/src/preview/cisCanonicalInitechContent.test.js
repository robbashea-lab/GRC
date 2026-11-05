import {activeDefinitions} from '../lib/frameworks';
import {INITECH_SCENARIO_PROFILE, INITECH_SAFEGUARD_IDS, initechSafeguardContent} from './cisCanonicalInitechContent';

const definitions = activeDefinitions('cis-ig1', {implementation_group: 2});
const statusFor = id => INITECH_SCENARIO_PROFILE.partial.includes(id) ? 'in_progress'
  : INITECH_SCENARIO_PROFILE.gaps.includes(id) ? 'needs_attention'
    : INITECH_SCENARIO_PROFILE.unknown.includes(id) ? 'not_assessed' : 'addressed';
const contentFor = id => initechSafeguardContent(id, statusFor(id));

test('Initech content covers exactly the native cumulative IG2 population with ten explicit exceptions', () => {
  expect(definitions).toHaveLength(130);
  expect(INITECH_SAFEGUARD_IDS.slice().sort()).toEqual(definitions.map(row => row.id).sort());
  const counts = Object.fromEntries(['addressed', 'in_progress', 'needs_attention', 'not_assessed'].map(status =>
    [status, definitions.filter(row => statusFor(row.id) === status).length]));
  expect(counts).toEqual({addressed: 120, in_progress: 7, needs_attention: 1, not_assessed: 2});
  const exceptions = [...INITECH_SCENARIO_PROFILE.partial, ...INITECH_SCENARIO_PROFILE.gaps, ...INITECH_SCENARIO_PROFILE.unknown];
  expect(exceptions).toHaveLength(10);
  expect(new Set(exceptions).size).toBe(10);
  expect(exceptions.every(id => definitions.some(row => row.id === id))).toBe(true);
  expect(INITECH_SCENARIO_PROFILE.implementation_group).toBe(2);
  expect(INITECH_SCENARIO_PROFILE.history_months).toBe(24);
});

test('cumulative content includes IG2 duties without adding IG3-only safeguards', () => {
  const ig1Ids = activeDefinitions('cis-ig1', {implementation_group: 1}).map(row => row.id);
  expect(ig1Ids.every(id => INITECH_SAFEGUARD_IDS.includes(id))).toBe(true);
  expect(INITECH_SAFEGUARD_IDS).toEqual(expect.arrayContaining(['1.4', '3.8', '7.5', '11.5', '16.4', '17.7', '18.2']));
  expect(INITECH_SAFEGUARD_IDS).not.toContain('6.8');
  expect(INITECH_SAFEGUARD_IDS).not.toContain('15.5');
  expect(INITECH_SAFEGUARD_IDS).not.toContain('18.4');
});

test.each(['6.8', '15.5', '18.4', 'unknown', '__proto__', '', null, 1.1])(
  'the content lookup rejects unsupported or non-string identities: %s', id => {
    expect(() => initechSafeguardContent(id, 'addressed')).toThrow('supported CIS IG2 safeguard');
  },
);

test('all native rows have distinct scoped content and existing fictional contact-role ownership', () => {
  const contactNames = ['Bill Lumbergh', 'Peter Gibbons', 'Michael Bolton', 'Samir Nagheenanajar', 'Tom Smykowski', 'Milton Waddams', 'Nina'];
  const implementations = definitions.map(definition => {
    const row = contentFor(definition.id);
    for (const key of ['scope', 'current_implementation', 'technology_process', 'owner_role', 'process_owner_role', 'evidence_check']) {
      expect(typeof row[key]).toBe('string');
      expect(row[key].trim()).not.toBe('');
    }
    expect(contactNames.some(name => row.owner_role.startsWith(`${name} — `))).toBe(true);
    expect(contactNames.some(name => row.process_owner_role.startsWith(`${name} — `))).toBe(true);
    expect(row.current_implementation).not.toBe(definition.title);
    expect(row.scope).not.toBe(definition.title);
    expect(row.evidence_check).not.toBe(definition.title);
    return row.current_implementation;
  });
  expect(new Set(implementations).size).toBe(definitions.length);
});

test.each(['2.6', '3.8', '5.5', '9.5', '13.6', '15.4', '16.4'])(
  'partial %s has a bounded gap, an accountable remediation and no fabricated assessment plan', id => {
    const row = initechSafeguardContent(id, 'in_progress');
    expect(row.assessment_notes).not.toBe('');
    expect(row.remediation).toMatch(/Michael|Peter|Samir|Tom/);
    expect(row.remediation).toMatch(/will/);
    expect(row.assessment_plan).toBe('');
    expect(() => initechSafeguardContent(id, 'addressed')).toThrow('requires in_progress');
  },
);

test.each(['3.9'])(
  'not-implemented %s has an observed absence and actionable correction instead of a completed claim', id => {
    const row = initechSafeguardContent(id, 'needs_attention');
    expect(row.assessment_notes).toMatch(/not implemented/);
    expect(row.remediation).toMatch(/Samir|Tom/);
    expect(row.remediation).toMatch(/will/);
    expect(row.assessment_plan).toBe('');
    expect(() => initechSafeguardContent(id, 'addressed')).toThrow('requires needs_attention');
  },
);

test.each(['11.5', '13.3'])(
  'genuinely unassessed %s has context and planned evidence, not an assessment conclusion', id => {
    const row = initechSafeguardContent(id, 'not_assessed');
    expect(row.current_implementation).toMatch(/not assessed/);
    expect(row.assessment_notes).toBe('');
    expect(row.remediation).toBe('');
    expect(row.evidence_check).toMatch(/^Assessment preparation only:/);
    expect(row.assessment_plan).toMatch(/Samir.*will/);
    expect(row.assessment_plan).toMatch(/unassessed/);
    expect(() => initechSafeguardContent(id, 'addressed')).toThrow('requires not_assessed');
    expect(() => initechSafeguardContent(id, 'needs_attention')).toThrow('requires not_assessed');
  },
);

test('library loading and dependency governance remain distinct from authorized supported application use', () => {
  expect(contentFor('2.5').current_implementation).toMatch(/execution policies.*approved applications/i);
  expect(contentFor('2.6').current_implementation).toMatch(/legacy reporting worker.*writable extension directory/i);
  expect(contentFor('2.6').remediation).toMatch(/authorized set.*denied loading/i);
  expect(contentFor('2.2').assessment_notes).toMatch(/supported dependencies.*separate allowlisting/i);
  expect(contentFor('16.4').current_implementation).toMatch(/monthly evaluation.*planned component list is incomplete/i);
  expect(contentFor('16.4').remediation).toMatch(/current and planned components.*risks.*monthly/i);
  expect(contentFor('16.5').technology_process).toMatch(/legacy worker.*checks.*incomplete recurring inventory/i);
  expect(contentFor('2.1').scope).toMatch(/licensed.*applications.*server packages/i);
});

test('the settlement-boundary gaps do not erase data inventory, encrypted transport, topology or traffic filtering', () => {
  expect(contentFor('3.2').assessment_notes).toMatch(/inventory identifies the new settlement export store/i);
  expect(contentFor('3.8').current_implementation).toMatch(/boundary lacks documented recipients.*purpose.*return path/i);
  expect(contentFor('3.8').remediation).toMatch(/recipient.*sensitivity.*purpose.*transport.*return path/i);
  expect(contentFor('3.10').assessment_notes).toMatch(/export transfer uses encrypted transport/i);
  expect(contentFor('12.4').current_implementation).toMatch(/diagrams.*including the new settlement bridge/i);
  expect(contentFor('13.6').current_implementation).toMatch(/bridge has not been connected.*flow collector/i);
  expect(contentFor('13.6').remediation).toMatch(/flow export.*collector.*review and alerting/i);
  expect(contentFor('12.1').assessment_notes).toMatch(/supported infrastructure.*distinct collection/i);
  expect(contentFor('13.4').assessment_notes).toMatch(/explicit permitted paths.*filtering and observation/i);
});

test('service-account metadata gaps do not contradict all-account authorization', () => {
  expect(contentFor('5.1').current_implementation).toMatch(/quarterly authorization of every active account/i);
  expect(contentFor('5.5').current_implementation).toMatch(/two batch entries lack purpose and register review-date metadata.*current authorization/i);
  expect(contentFor('5.5').remediation).toMatch(/without fabricating earlier review metadata/i);
  expect(contentFor('5.5').assessment_notes).toMatch(/does not contradict.*authorization/i);
});

test('secure network protocols do not inherit the separate enterprise-management exception', () => {
  const networkProtocols = contentFor('12.6');
  expect(networkProtocols.current_implementation).toMatch(/network management and communication paths use secure protocols/i);
  expect(networkProtocols.current_implementation).toMatch(/insecure alternatives disabled/i);
  expect(JSON.stringify(networkProtocols)).not.toMatch(/unless|operationally essential|operational exceptions/i);
  expect(contentFor('4.6').technology_process).toMatch(/documented operational exceptions require a bounded need and compensating protection/i);
});

test('media encryption, email authentication and contract clauses remain incomplete despite adjacent controls', () => {
  expect(contentFor('3.9').current_implementation).toMatch(/has not established encryption.*removable media/i);
  expect(contentFor('3.6').scope).toMatch(/laptops and phones/i);
  expect(contentFor('10.4').assessment_notes).toMatch(/does not make unencrypted.*encryption requirement/i);
  expect(contentFor('9.5').current_implementation).toMatch(/SPF and DKIM.*no implemented DMARC policy or DMARC verification/i);
  expect(contentFor('9.5').assessment_notes).toMatch(/partial: SPF and DKIM operate/i);
  expect(contentFor('15.4').current_implementation).toMatch(/agreements lack.*security requirements.*amendments are not in place/i);
  expect(contentFor('15.4').assessment_notes).toMatch(/partial: the annual gap review is performed.*missing executed security clauses/i);
  expect(contentFor('15.2').assessment_notes).toMatch(/does not imply.*legacy contract/i);
  expect(() => initechSafeguardContent('9.5', 'needs_attention')).toThrow('requires in_progress');
  expect(() => initechSafeguardContent('15.4', 'needs_attention')).toThrow('requires in_progress');
});

test('operating, document and event-triggered duties retain their different native frequencies', () => {
  expect(contentFor('1.3').current_implementation).toMatch(/daily/);
  expect(contentFor('1.4').technology_process).toMatch(/at least weekly/);
  expect(contentFor('7.5').current_implementation).toMatch(/quarterly.*authenticated.*unauthenticated/);
  expect(contentFor('7.6').current_implementation).toMatch(/at least monthly/);
  expect(contentFor('8.11').current_implementation).toMatch(/analysis at least weekly/);
  expect(contentFor('11.5').assessment_plan).toMatch(/actual recovery tests.*quarterly/);
  expect(contentFor('11.2').assessment_notes).toMatch(/not recorded as a completed recovery test/);
  expect(contentFor('16.9').current_implementation).toMatch(/at least annually/);
  expect(contentFor('17.7').current_implementation).toMatch(/conducted at least annually/);
  expect(contentFor('17.8').current_implementation).toMatch(/reviews follow incidents/);
  expect(contentFor('18.1').current_implementation).toMatch(/defines scope, frequency, limitations, contacts, remediation routing and retrospective/);
  expect(contentFor('18.2').current_implementation).toMatch(/qualified.*at least annually.*reconnaissance/);
  expect(contentFor('18.3').current_implementation).toMatch(/timing based on impact and priority.*retest/);
});

test('the content-only boundary requires the intended status and returns independent strings without native records or dates', () => {
  expect(() => initechSafeguardContent('1.1')).toThrow('requires addressed');
  expect(() => initechSafeguardContent('1.1', 'not_assessed')).toThrow('requires addressed');
  expect(() => initechSafeguardContent('1.1', 'unexpected')).toThrow('requires addressed');
  const original = contentFor('1.1');
  const edited = contentFor('1.1');
  edited.current_implementation = 'A visitor changed this returned object';
  expect(contentFor('1.1')).toEqual(original);
  expect(Object.isFrozen(INITECH_SCENARIO_PROFILE)).toBe(true);
  expect(Object.isFrozen(INITECH_SCENARIO_PROFILE.asset_scope)).toBe(true);
  expect(Object.isFrozen(INITECH_SCENARIO_PROFILE.partial)).toBe(true);
  expect(Object.isFrozen(INITECH_SCENARIO_PROFILE.gaps)).toBe(true);
  expect(Object.isFrozen(INITECH_SCENARIO_PROFILE.unknown)).toBe(true);
  expect(Object.isFrozen(INITECH_SAFEGUARD_IDS)).toBe(true);
  for (const id of INITECH_SAFEGUARD_IDS) {
    const row = contentFor(id);
    expect(Object.keys(row).sort()).toEqual(['scope', 'current_implementation', 'technology_process', 'assessment_notes',
      'owner_role', 'process_owner_role', 'evidence_check', 'remediation', 'assessment_plan'].sort());
    expect(Object.values(row).every(value => typeof value === 'string')).toBe(true);
    expect(JSON.stringify(row)).not.toMatch(/demo_initech|\d{4}-\d{2}-\d{2}|(?:risk|finding|task|evidence|user|client|account)_id/);
  }
});
