import {activeDefinitions} from '../lib/frameworks';
import {KRUSTY_SCENARIO_PROFILE, KRUSTY_SAFEGUARD_IDS, krustySafeguardContent} from './cisCanonicalKrustyContent';

const definitions = activeDefinitions('cis-ig1', {implementation_group: 3});
const contentFor = id => krustySafeguardContent(id, 'addressed');
const textFor = id => Object.values(contentFor(id)).join(' ');
const ig3Additions = [
  '1.5', '2.7', '3.13', '3.14', '4.12', '6.8', '8.12', '9.7', '12.8',
  '13.7', '13.8', '13.9', '13.10', '13.11', '15.5', '15.6', '15.7',
  '16.12', '16.13', '16.14', '17.9', '18.4', '18.5',
];

test('Krusty content covers exactly the native cumulative IG3 population without changing framework identity', () => {
  expect(definitions).toHaveLength(153);
  expect(KRUSTY_SAFEGUARD_IDS.slice().sort()).toEqual(definitions.map(row => row.id).sort());
  const ig1 = activeDefinitions('cis-ig1', {implementation_group: 1}).map(row => row.id);
  const ig2 = activeDefinitions('cis-ig1', {implementation_group: 2}).map(row => row.id);
  expect(ig1).toHaveLength(56);
  expect(ig2).toHaveLength(130);
  expect(ig1.every(id => KRUSTY_SAFEGUARD_IDS.includes(id))).toBe(true);
  expect(ig2.every(id => KRUSTY_SAFEGUARD_IDS.includes(id))).toBe(true);
  expect(KRUSTY_SAFEGUARD_IDS.filter(id => !ig2.includes(id)).sort()).toEqual(ig3Additions.slice().sort());
  expect(KRUSTY_SCENARIO_PROFILE.implementation_group).toBe(3);
  expect(KRUSTY_SCENARIO_PROFILE.partial).toEqual([]);
  expect(KRUSTY_SCENARIO_PROFILE.gaps).toEqual([]);
  expect(KRUSTY_SCENARIO_PROFILE.unknown).toEqual([]);
});

test('the fixed fictional business scope distinguishes people, enterprise assets and administrative subsets', () => {
  const scope = KRUSTY_SCENARIO_PROFILE.asset_scope;
  expect(KRUSTY_SCENARIO_PROFILE.name).toBe('The Krusty Krab');
  expect(scope.franchise_sites).toBe(12);
  expect(scope.workforce_members).toBe(216);
  expect(scope.managed_laptops + scope.managed_phones + scope.pos_terminals + scope.ordering_kiosks
    + scope.kitchen_controllers + scope.network_devices + scope.cloud_workloads).toBe(264);
  expect(textFor('1.1')).toMatch(/264 inventoried assets.*216 workforce members/i);
  expect(contentFor('12.8').scope).toMatch(/six dedicated.*within.*36-laptop inventory/i);
  expect(contentFor('12.8').assessment_notes).toMatch(/subset.*not extra assets/i);
  expect(KRUSTY_SCENARIO_PROFILE.business_context).toMatch(/internal ordering\/menu application team/i);
  expect(KRUSTY_SCENARIO_PROFILE.business_context).toMatch(/employee records.*franchise agreements.*customer contact.*sensitive/i);
  expect(KRUSTY_SCENARIO_PROFILE.business_context).toMatch(/references, not card numbers or security codes/i);
});

test('five years is organizational history rather than backdated v8.1 assessments or invented certification', () => {
  expect(KRUSTY_SCENARIO_PROFILE.history_months).toBe(60);
  expect(KRUSTY_SCENARIO_PROFILE.business_context).toMatch(/five years describes organizational\/security-program history/i);
  expect(KRUSTY_SCENARIO_PROFILE.business_context).toMatch(/v8\.1 judgments begin only after its June 2024 release/i);
  expect(KRUSTY_SCENARIO_PROFILE.business_context).toMatch(/no legacy-framework or certification claim/i);
  expect(KRUSTY_SCENARIO_PROFILE).not.toHaveProperty('assessment_recorded_at');
  expect(KRUSTY_SCENARIO_PROFILE).not.toHaveProperty('history');
  expect(Object.isFrozen(KRUSTY_SCENARIO_PROFILE)).toBe(true);
  expect(Object.isFrozen(KRUSTY_SCENARIO_PROFILE.asset_scope)).toBe(true);
});

test.each(['19.1', '1.6', 'unknown', '__proto__', 'constructor', '', null, 1.1])(
  'unsupported or non-string identity %s fails before content is returned', id => {
    expect(() => krustySafeguardContent(id, 'addressed')).toThrow('supported CIS IG3 safeguard');
  },
);

test.each(['in_progress', 'needs_attention', 'not_assessed', 'not_applicable', undefined, null])(
  'a requested %s conclusion cannot reuse the all-implemented scenario narrative', status => {
    expect(() => krustySafeguardContent('11.5', status)).toThrow('requires addressed content');
  },
);

test('all 153 rows have distinct scoped narratives and existing business Contact-role ownership', () => {
  const contactNames = ['Eugene Krabs', 'Squidward Tentacles', 'SpongeBob SquarePants'];
  const implementations = [];
  const scopes = [];
  for (const definition of definitions) {
    const row = contentFor(definition.id);
    expect(Object.keys(row).sort()).toEqual([
      'scope', 'current_implementation', 'technology_process', 'assessment_notes',
      'owner_role', 'process_owner_role', 'evidence_check', 'remediation', 'assessment_plan',
    ].sort());
    for (const key of ['scope', 'current_implementation', 'technology_process', 'assessment_notes', 'evidence_check']) {
      expect(typeof row[key]).toBe('string');
      expect(row[key].trim()).not.toBe('');
      expect(row[key]).not.toBe(definition.title);
    }
    expect(contactNames.some(name => row.owner_role.startsWith(`${name} — `))).toBe(true);
    expect(contactNames.some(name => row.process_owner_role.startsWith(`${name} — `))).toBe(true);
    expect(row.remediation).toBe('');
    expect(row.assessment_plan).toBe('');
    expect(row.evidence_check).toMatch(/^(Compare|Inspect|Trace|Match|Reconcile|Follow) /);
    implementations.push(row.current_implementation);
    scopes.push(row.scope);
  }
  expect(new Set(implementations).size).toBe(153);
  expect(new Set(scopes).size).toBe(153);
});

test('lookup returns fresh strings without writing native records, timestamps, answers, approvals or verification', () => {
  const first = contentFor('6.8');
  first.scope = 'Caller-local change';
  first.owner_role = 'Caller-local role';
  const second = contentFor('6.8');
  expect(second.scope).toMatch(/Cashier.*restaurant-manager.*service.*administrator roles/i);
  expect(second.owner_role).toMatch(/^Squidward Tentacles — /);
  for (const id of KRUSTY_SAFEGUARD_IDS) {
    const row = contentFor(id);
    expect(Object.values(row).every(value => typeof value === 'string')).toBe(true);
    for (const key of ['id', 'client_id', 'owner_id', 'created_at', 'updated_at', 'assessment_recorded_at',
      'answers', 'history', 'evidence_ids', 'policy_ids', 'review_ids', 'approval', 'verified', 'verified_at', 'verification_status']) {
      expect(row).not.toHaveProperty(key);
    }
    expect(JSON.stringify(row)).not.toMatch(/\b\d{4}-\d{2}-\d{2}(?:T|\b)/);
    expect(row.evidence_check).not.toMatch(/already uploaded|uploaded successfully|attached verified|certified compliant/i);
  }
});

test('inventory, discovery and allowlisting retain their distinct operating and reassessment intervals', () => {
  expect(contentFor('1.1').technology_process).toMatch(/at least every six months/);
  expect(contentFor('1.3').current_implementation).toMatch(/daily/);
  expect(contentFor('1.4').technology_process).toMatch(/at least weekly/);
  expect(contentFor('1.5').current_implementation).toMatch(/inventory at least weekly/);
  expect(contentFor('1.5').assessment_notes).toMatch(/not.*separate weekly platform Review ticket/i);
  expect(contentFor('2.1').technology_process).toMatch(/at least every six months/);
  expect(contentFor('2.2').current_implementation).toMatch(/monthly support check/);
  expect(contentFor('2.3').current_implementation).toMatch(/monthly or more often/);
  for (const id of ['2.5', '2.6', '2.7']) expect(contentFor(id).technology_process).toMatch(/at least every six months/);
  expect(contentFor('2.6').current_implementation).toMatch(/writable user directories cannot supply runtime libraries/i);
  expect(contentFor('2.7').current_implementation).toMatch(/only.*authorized scripts can execute/i);
});

test('sensitive-data scope remains complete despite outsourced payments and constrained removable-media use', () => {
  expect(contentFor('3.1').assessment_notes).toMatch(/does not remove employee.*franchise.*customer-contact confidentiality/i);
  expect(contentFor('3.2').scope).toMatch(/backup copies/i);
  expect(contentFor('3.2').current_implementation).toMatch(/provider-held order contact records/i);
  expect(contentFor('3.4').current_implementation).toMatch(/minimum and maximum periods/);
  expect(contentFor('3.4').technology_process).toMatch(/existing data-management document/);
  expect(contentFor('3.5').assessment_notes).toMatch(/triggered.*not.*universal annual manual Review/i);
  expect(contentFor('3.8').current_implementation).toMatch(/sender.*recipient.*purpose.*sensitivity.*trust boundary/);
  expect(contentFor('3.8').technology_process).toMatch(/annually.*significant/);
  expect(contentFor('3.9').current_implementation).toMatch(/enterprise data on removable media is encrypted/i);
  expect(contentFor('3.13').scope).toMatch(/stored, processed or transmitted.*remote provider-held/i);
  expect(contentFor('3.13').current_implementation).toMatch(/automated.*data inventory/i);
  expect(contentFor('3.14').current_implementation).toMatch(/access, modification and disposal/);
});

test('device settings preserve separate inactivity, failed-login, remote-erase and work-profile requirements', () => {
  expect(contentFor('4.3').current_implementation).toMatch(/five minutes.*two minutes/i);
  expect(contentFor('4.5').current_implementation).toMatch(/default-deny.*explicitly allowed.*ports/i);
  expect(contentFor('4.10').current_implementation).toMatch(/twenty.*laptop.*ten.*phone/i);
  expect(contentFor('4.10').assessment_notes).toMatch(/separate from inactivity/);
  expect(contentFor('4.11').technology_process).toMatch(/offline pending.*not.*completed erasure/i);
  expect(contentFor('4.12').scope).toMatch(/24 company phones.*personal use.*outside.*work profile/i);
  expect(contentFor('4.12').current_implementation).toMatch(/separate.*cross-profile sharing.*personal-app access/i);
  expect(contentFor('4.12').evidence_check).toMatch(/denied personal-to-work access/);
});

test('authorization reviews, dormant accounts and immediate revocation remain different activities', () => {
  expect(contentFor('5.1').current_implementation).toMatch(/holder name, username, department, start\/end dates.*every active account.*quarterly/);
  expect(contentFor('5.5').current_implementation).toMatch(/departmental owner, purpose and review date.*quarterly/);
  expect(contentFor('5.3').current_implementation).toMatch(/forty-five days.*disabled or removed/);
  expect(contentFor('5.3').assessment_notes).toMatch(/active automated service use.*not mistaken/i);
  expect(contentFor('6.2').current_implementation).toMatch(/immediately on termination.*role change/);
  expect(contentFor('6.2').assessment_notes).toMatch(/forty-five-day.*not.*acceptable termination/i);
  expect(contentFor('5.2').current_implementation).toMatch(/eight characters with MFA and fourteen without MFA/);
  expect(contentFor('5.4').current_implementation).toMatch(/separate from normal email and daily-work/);
});

test('role-rights documentation and incident thresholds reuse real content containers instead of inventing mandated policy titles', () => {
  expect(contentFor('6.8').current_implementation).toMatch(/role-rights matrices.*Access Control & Identity Management/);
  expect(contentFor('6.8').technology_process).toMatch(/at least annually/);
  expect(contentFor('6.8').assessment_notes).toMatch(/documented role rights and actual privilege authorization.*existing document.*without implying a new CIS-mandated policy title/i);
  expect(contentFor('17.9').current_implementation).toMatch(/existing incident-response document.*events from incidents/);
  expect(contentFor('17.9').technology_process).toMatch(/annually.*significant changes/);
  expect(contentFor('17.9').assessment_notes).toMatch(/existing incident-response document, not a new mandated policy title.*not automatically a Critical incident/);
  expect(contentFor('15.2').current_implementation).toMatch(/policy.*inventory, classification, assessment, monitoring and secure-decommissioning/);
});

test('vulnerability, audit-log and recovery activities keep their actual shorter operating intervals', () => {
  expect(contentFor('7.2').technology_process).toMatch(/monthly or more frequently/);
  expect(contentFor('7.3').current_implementation).toMatch(/monthly or more frequently/);
  expect(contentFor('7.4').current_implementation).toMatch(/monthly or more frequently/);
  expect(contentFor('7.5').current_implementation).toMatch(/at least quarterly.*authenticated and unauthenticated/);
  expect(contentFor('7.6').current_implementation).toMatch(/at least monthly/);
  expect(contentFor('7.7').current_implementation).toMatch(/at least monthly.*risk-based/);
  expect(contentFor('8.11').current_implementation).toMatch(/analysis at least weekly/);
  expect(contentFor('8.11').technology_process).toMatch(/manual platform Review.*not.*source-mandated ticket format/);
  expect(contentFor('11.2').current_implementation).toMatch(/at least weekly.*hourly.*nightly/);
  expect(contentFor('11.5').current_implementation).toMatch(/actual sampled recovery tests.*at least quarterly.*usable outputs/i);
  expect(contentFor('11.5').assessment_notes).toMatch(/performed test coverage.*future appointments.*do not count/i);
  expect(contentFor('12.1').current_implementation).toMatch(/monthly or more frequently/);
});

test('log-source detail and chosen retention do not fabricate five years of raw logs or universal provider support', () => {
  expect(contentFor('8.4').current_implementation).toMatch(/at least two configured time sources/);
  expect(contentFor('8.5').technology_process).toMatch(/suppressing passwords.*unnecessary sensitive payloads/);
  expect(contentFor('8.10').current_implementation).toMatch(/at least 90 days.*selects 180 days/);
  expect(contentFor('8.10').assessment_notes).toMatch(/does not imply five years of raw log retention/);
  expect(contentFor('8.12').current_implementation).toMatch(/collected where supported/);
  expect(contentFor('8.12').assessment_notes).toMatch(/does not assert.*every supplier exports every event/);
  expect(contentFor('13.1').current_implementation).toMatch(/log-analytics.*correlates security-relevant/);
  expect(contentFor('13.6').current_implementation).toMatch(/supporting review and security alerting/);
  expect(contentFor('13.11').current_implementation).toMatch(/monthly or more frequent tuning/);
});

test('protection narratives separate supported capability, central health and actual prevention from blanket guarantees', () => {
  expect(contentFor('9.5').current_implementation).toMatch(/SPF and DKIM.*implemented DMARC policy and verification/);
  expect(contentFor('9.7').assessment_notes).toMatch(/separate from attachment-type restrictions.*does not guarantee detection of every malicious message/);
  expect(contentFor('10.1').technology_process).toMatch(/asset capability register.*disabled, disconnected or newly enrolled/);
  expect(contentFor('10.1').assessment_notes).toMatch(/not.*fabricated N\/A.*imaginary mobile scanning/);
  expect(contentFor('10.4').current_implementation).toMatch(/automatically scans removable media/);
  expect(contentFor('10.4').assessment_notes).toMatch(/does not replace removable-media encryption/);
  expect(contentFor('10.7').current_implementation).toMatch(/beyond known-file signatures/);
  expect(contentFor('13.7').technology_process).toMatch(/support limits.*network prevention.*without inventing agent support/);
  expect(contentFor('13.7').assessment_notes).toMatch(/not presented as an installed host agent.*fabricated N\/A/);
  expect(contentFor('13.8').assessment_notes).toMatch(/distinguished from alert-only monitoring/);
  expect(contentFor('13.9').current_implementation).toMatch(/802\.1X or certificate-based device authentication/);
});

test('remote access and dedicated administration retain configuration conditions and native access boundaries', () => {
  expect(contentFor('13.5').current_implementation).toMatch(/current anti-malware.*secure-configuration compliance.*operating-system\/application updates/);
  expect(contentFor('12.7').current_implementation).toMatch(/enterprise VPN.*enterprise AAA before accessing internal/);
  expect(contentFor('12.6').current_implementation).toMatch(/secure supported protocols.*insecure alternatives disabled/);
  expect(textFor('12.6')).not.toMatch(/unless operationally essential|operational exceptions/);
  expect(contentFor('12.8').current_implementation).toMatch(/not allowed Internet access.*restricted private administrative paths/);
  expect(contentFor('12.8').technology_process).toMatch(/separation from the primary business network/);
});

test('awareness includes sensitive-data handling, automation failures, remote home networks and specialist roles', () => {
  expect(contentFor('14.1').current_implementation).toMatch(/at hiring and at least annually/);
  expect(contentFor('14.1').assessment_notes).toMatch(/does not remove employee.*customer-contact confidentiality/);
  expect(contentFor('14.4').current_implementation).toMatch(/store, transfer, archive and destroy.*clear-screen\/desk.*locked devices/);
  expect(contentFor('14.7').current_implementation).toMatch(/failures in automated backups, updates or other required tools/);
  expect(contentFor('14.8').current_implementation).toMatch(/secure configuration of home network infrastructure/);
  expect(contentFor('14.9').current_implementation).toMatch(/secure administration, application coding.*social engineering/);
  expect(contentFor('14.9').assessment_notes).toMatch(/universal annual interval is not attributed/);
});

test('provider policy, actual security terms, assessment, monitoring and exit remain separately meaningful', () => {
  expect(contentFor('15.4').current_implementation).toMatch(/agreements contain security responsibilities.*encryption.*notification.*disposal/);
  expect(contentFor('15.4').technology_process).toMatch(/executed security terms.*at least annually/);
  expect(contentFor('15.4').assessment_notes).toMatch(/not proof.*in-app forged signature/);
  expect(contentFor('15.5').technology_process).toMatch(/at least annually and on new or renewed contracts/);
  expect(contentFor('15.5').assessment_notes).toMatch(/not a real independent attestation/);
  expect(contentFor('15.6').technology_process).toMatch(/policy defines monitoring arrangements by classification/);
  expect(contentFor('15.6').assessment_notes).toMatch(/no universal numeric CIS interval/i);
  expect(contentFor('15.7').current_implementation).toMatch(/access removal.*terminated data flows.*secure disposal/);
  expect(contentFor('15.7').assessment_notes).toMatch(/exit-triggered.*not a recurring annual exit obligation/);
});

test('internal software duties include complete component scope, release acceptability and native lifecycle distinctions', () => {
  expect(contentFor('16.2').current_implementation).toMatch(/internal and external reports.*remediation-testing.*tracker/);
  expect(contentFor('16.2').technology_process).toMatch(/metrics for identification, analysis and remediation timing.*annually.*significant/);
  expect(contentFor('16.4').current_implementation).toMatch(/risks for current and planned components.*transitive dependencies/);
  expect(contentFor('16.4').technology_process).toMatch(/at least monthly.*continuing support/);
  expect(contentFor('16.6').current_implementation).toMatch(/minimum security-acceptability threshold for releases/);
  expect(contentFor('16.7').current_implementation).toMatch(/industry-recommended hardening.*without allowing internal application code to weaken/i);
  expect(contentFor('16.9').technology_process).toMatch(/at least annual training/);
  expect(contentFor('16.10').current_implementation).toMatch(/authorization of every operation.*input size\/type\/range.*safe error handling/);
  expect(contentFor('16.11').current_implementation).toMatch(/vetted.*standardized currently accepted encryption algorithms/);
  expect(contentFor('16.12').current_implementation).toMatch(/static and dynamic analysis tools/);
  expect(contentFor('16.12').assessment_notes).toMatch(/do not imply.*every-commit.*fixed calendar interval/);
  expect(contentFor('16.13').current_implementation).toMatch(/authenticated and unauthenticated/);
  expect(contentFor('16.13').assessment_notes).toMatch(/no numeric interval is attributed/i);
  expect(contentFor('16.14').current_implementation).toMatch(/trained design reviewers.*before coding/i);
});

test('incident and penetration activities preserve actual triggers and separate validation from work completion', () => {
  expect(contentFor('17.1').current_implementation).toMatch(/Squidward.*primary.*SpongeBob as backup.*overseen internally/);
  expect(contentFor('17.2').technology_process).toMatch(/verifies contact information at least annually/);
  expect(contentFor('17.3').current_implementation).toMatch(/available to all workforce.*reporting timeframes.*minimum initial facts/);
  expect(contentFor('17.7').current_implementation).toMatch(/at least annual.*communication channels, decision making and response workflows/i);
  expect(contentFor('17.8').assessment_notes).toMatch(/incident-triggered.*not an invented recurring annual Review/);
  expect(contentFor('18.1').current_implementation).toMatch(/frequency.*excluded activity.*permitted hours.*contacts.*remediation.*retrospective/);
  expect(contentFor('18.2').current_implementation).toMatch(/reconnaissance.*at least annually/);
  expect(contentFor('18.5').current_implementation).toMatch(/internal penetration testing.*at least annually/);
  expect(contentFor('18.4').current_implementation).toMatch(/after each test.*modify relevant rulesets or capabilities/i);
  expect(contentFor('18.3').assessment_notes).toMatch(/Task completion, Finding validation and Risk acceptance or closure remain distinct/);
});
