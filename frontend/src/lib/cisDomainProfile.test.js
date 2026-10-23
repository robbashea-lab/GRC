import {buildCisDomainProfile, formatCisDomainRate} from './cisDomainProfile';
import {cisWorkspace} from '../testUtils/cisExperience';
import * as domainMapping from './brawndoSecurityDomains';

const clientId = 'isolated-dashboard-domain-client';
const statuses = ['addressed', 'in_progress', 'needs_attention', 'not_assessed'];

function fixture(group = 1, statusFor = () => 'not_assessed') {
  const source = cisWorkspace(clientId, group);
  source.assessments.forEach((row, index) => {
    row.status = statusFor(row, index);
    if (row.status === 'not_applicable') row.na_rationale = 'Synthetic approved exclusion';
  });
  const rows = source.assessments.filter(row => row.status !== 'not_applicable');
  source.implementation_position = {...source.implementation_position,
    scope: {framework_key: 'cis-ig1', catalog_version: '8.1', configuration: {implementation_group: group}, definition_ids: source.active_definition_ids.slice()},
    implemented: rows.filter(row => row.status === 'addressed').length, denominator: rows.length,
    excluded: source.assessments.length - rows.length,
    counts: statuses.map(key => ({key, count: rows.filter(row => row.status === key).length}))};
  return source;
}

const build = source => buildCisDomainProfile(source, {clientId, implementationGroup: source.configuration.implementation_group});
afterEach(() => jest.restoreAllMocks());

test.each([[1, 56, 11], [2, 130, 14], [3, 153, 14]])('IG%i reconciles %i native safeguards through %i existing security domains', (group, count, domainCount) => {
  const source = fixture(group, (_row, index) => statuses[index % statuses.length]), before = JSON.stringify(source);
  const profile = build(source);
  expect(profile.available).toBe(true);
  expect(profile.domains).toHaveLength(domainCount);
  expect(profile.totals.applicable).toBe(count);
  expect(profile.totals.safeguardIds).toEqual(source.active_definition_ids);
  expect(new Set(profile.domains.flatMap(domain => domain.applicableIds)).size).toBe(count);
  profile.domains.forEach(domain => {
    expect(domain.applicable).toBe(Object.values(domain.counts).reduce((sum, value) => sum + value, 0));
    expect(domain.rate).toBe(domain.implemented / domain.applicable * 100);
    expect(domain.assessmentIds).toEqual(domain.safeguardIds.map(id => source.assessments.find(row => row.definition_id === id).framework_assessment_id));
  });
  expect(JSON.stringify(source)).toBe(before);
});

test('N/A is excluded with rationale, partial receives no implementation credit, and percentages use one formatter', () => {
  const source = fixture(1, (_row, index) => ['addressed', 'in_progress', 'needs_attention', 'not_applicable'][index] || 'not_assessed');
  const profile = build(source), assets = profile.domains.find(domain => domain.id === 'assets');
  expect(profile.totals).toMatchObject({implemented: 1, applicable: 55});
  expect(assets).toMatchObject({implemented: 1, applicable: 4, rate: 25, counts: {addressed: 1, in_progress: 1, needs_attention: 1, not_assessed: 1}});
  expect(assets.focus).toMatch(/known not-implemented safeguard/);
  expect(assets.focus).toMatch(/partially implemented safeguard/);
  expect(assets.focus).toMatch(/implementation is unknown/);
  expect(formatCisDomainRate(100 / 6)).toBe('16.7%');
  expect(formatCisDomainRate(0)).toBe('0.0%');
  expect(formatCisDomainRate(null)).toBe('N/A');
});

test.each([
  ['not_assessed', /implementation is unknown/, /known not-implemented/],
  ['in_progress', /Complete 5 partially implemented safeguards/, /known not-implemented/],
  ['addressed', /All applicable safeguards are implemented/, /known not-implemented/],
  ['not_applicable', /No applicable safeguards/, /known not-implemented/],
])('focus copy distinguishes %s without inventing a risk or failure', (status, expected, absent) => {
  const profile = build(fixture(1, () => status)), assets = profile.domains.find(domain => domain.id === 'assets');
  expect(profile.available).toBe(true);
  expect(assets.focus).toMatch(expected);
  expect(assets.focus).not.toMatch(absent);
  if (status === 'not_applicable') {
    expect(profile.totals).toMatchObject({implemented: 0, applicable: 0, rate: null});
    expect(assets.rate).toBeNull();
  }
});

test('native mapping overlap and repeated membership deduplicate per domain and global totals', () => {
  const source = fixture(1, () => 'addressed'), original = domainMapping.cisSecurityDomainMapping(1);
  jest.spyOn(domainMapping, 'cisSecurityDomainMapping').mockReturnValue([
    {...original[0], safeguardIds: [...original[0].safeguardIds, original[0].safeguardIds[0]]},
    ...original.slice(1), {id: 'native-overlap', label: 'Synthetic overlapping native mapping', safeguardIds: original[0].safeguardIds}
  ]);
  const profile = build(source);
  expect(profile.available).toBe(true);
  expect(profile.domains[0].applicable).toBe(5);
  expect(profile.domains.at(-1).applicable).toBe(5);
  expect(profile.totals.applicable).toBe(56);
  expect(profile.domains.reduce((sum, domain) => sum + domain.applicable, 0)).toBe(61);
});

test.each([
  source => { source.selected = false; },
  source => { source.configured = false; },
  source => { source.assessments.pop(); },
  source => { source.assessments.push({...source.assessments[0]}); },
  source => { source.assessments[0].client_id = 'foreign-client'; },
  source => { source.assessments[0].framework_assessment_id = source.assessments[1].framework_assessment_id; },
  source => { source.assessments[0].status = 'unknown'; },
  source => { source.assessments[0].status = 'not_applicable'; },
  source => { Object.assign(source.assessments[0], {status: 'not_applicable', na_rationale: {text: 'invalid'}}); },
  source => { source.assessments[0] = null; },
  source => { source.assessments[0].archived = true; },
  source => { source.definitions.shift(); },
  source => { delete source.definitions[0].control; },
  source => { delete source.definitions[0].control_name; },
  source => { source.active_definition_ids.push(source.active_definition_ids[0]); },
  source => { source.implementation_position.denominator--; },
  source => { source.implementation_position.availability = 'partial'; },
  source => { source.implementation_position.invalid_applicability_count = 1; },
  source => { source.implementation_position.scope.configuration.implementation_group = 2; },
  source => { source.implementation_position.scope.definition_ids.pop(); },
])('missing, foreign, invalid or unreconciled data is unavailable rather than invented zero (%#)', mutate => {
  const source = fixture(); mutate(source);
  expect(build(source)).toMatchObject({available: false, domains: [], totals: null});
});

test('later scope enrollment retains original assessment IDs and ignores retained higher-group records', () => {
  const expanded = fixture(3), reduced = fixture(1);
  reduced.definitions = expanded.definitions;
  reduced.assessments = expanded.assessments;
  const profile = build(reduced);
  expect(profile.available).toBe(true);
  expect(profile.totals.assessmentIds).toEqual(fixture(1).assessments.map(row => row.framework_assessment_id));
  expect(profile.totals.applicable).toBe(56);
});

test('mapping coverage gaps identify actual unmapped IDs without silently hiding safeguards', () => {
  const source = fixture(), original = domainMapping.cisSecurityDomainMapping(1);
  jest.spyOn(domainMapping, 'cisSecurityDomainMapping').mockReturnValue(original.slice(1));
  const profile = build(source);
  expect(profile.available).toBe(false);
  expect(profile.unmappedIds).toEqual(original[0].safeguardIds);
});

test('missing/new source and requested scope mismatch do not yield a previous program profile', () => {
  expect(buildCisDomainProfile(null, {clientId})).toMatchObject({available: false, totals: null});
  expect(buildCisDomainProfile(fixture(), {clientId, implementationGroup: 2}).available).toBe(false);
  expect(buildCisDomainProfile(fixture(), {clientId: 'other-client'}).available).toBe(false);
});
