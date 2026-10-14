import {cis, FRAMEWORKS} from './frameworks';
import {cisSummary} from './cisVerification';
import pilot from '@catalogs/brawndoSecurityDomainsPilot.json';
import {securityDomainsEnabled, securityDomainModel, securityDomainMapping as mapping} from './brawndoSecurityDomains';

function fixture(clientId = pilot.clientId) {
  const definitions = cis.requirements.filter(definition => definition.implementation_group === 1);
  const assessments = definitions.map(definition => ({framework_assessment_id: `native-${definition.id}`,
    definition_id: definition.id, client_id: clientId, framework_key: 'cis-ig1', framework_version: '8.1', status: 'not_assessed'}));
  const rows = definitions.map((definition, index) => ({...definition, ...assessments[index]}));
  const data = {framework: FRAMEWORKS.find(framework => framework.key === 'cis-ig1'), configured: true, selected: true,
    configuration: {implementation_group: 1}, definitions, assessments, active_definition_ids: definitions.map(definition => definition.id),
    implementation_position: {program_id: `${clientId}:cis-ig1`, availability: 'available', total: 56, denominator: 56, implemented: 0, excluded: 0,
      counts: ['addressed','in_progress','needs_attention','not_assessed'].map(key => ({key, count: key === 'not_assessed' ? 56 : 0}))}};
  return {data, rows};
}
const user = {user_id: 'native-actor', role: 'super_admin'};
const fixtureClientId = 'synthetic-brawndo-equivalent-local-unit';
const fixtureConfig = {...pilot, enabled: true, fixtureClientIds: [fixtureClientId]};
// Exercise feature behavior independently of whether the rollout is currently disabled.
const enabled = (data, clientId = pilot.clientId, framework = 'cis-ig1', actor = user, config = {...pilot, enabled: true}) => securityDomainsEnabled(clientId, framework, data, actor, config);

test('the default gate honors the committed rollout flag', () => {
  const {data} = fixture();
  expect(securityDomainsEnabled(pilot.clientId, 'cis-ig1', data, user)).toBe(pilot.enabled === true);
});

test('approved mapping is a disjoint complete native IG1 partition and remains presentation taxonomy', () => {
  const ids = mapping.domains.flatMap(domain => domain.safeguardIds);
  expect(mapping.domains).toHaveLength(11);
  expect(ids).toHaveLength(56); expect(new Set(ids).size).toBe(56);
  expect([...ids].sort()).toEqual(cis.requirements.filter(definition => definition.implementation_group === 1).map(definition => definition.id).sort());
  expect([...new Set(mapping.domains.flatMap(domain => domain.controlIds))].sort((a,b) => a-b)).toEqual(mapping.metadata.controlIds);
  mapping.domains.forEach(domain => {
    expect(domain.safeguardIds).toHaveLength(domain.expectedSafeguardCount);
    expect(domain.safeguardIds.every(id => domain.controlIds.includes(Number(id.split('.')[0])))).toBe(true);
  });
  expect(mapping.metadata.taxonomyType).toBe('Custom presentation taxonomy');
});

test('only the verified selected canonical native Brawndo CIS v8.1 IG1 context enables the pilot', () => {
  const {data} = fixture();
  expect(enabled(data)).toBe(true);
  for (const clientId of ['Brawndo', 'demo_brawndo', 'other-client', '', null]) expect(enabled(data, clientId)).toBe(false);
  for (const framework of ['cis-ig2', 'cis-ig3', 'iso-27001', 'soc-2']) expect(enabled(data, pilot.clientId, framework)).toBe(false);
  expect(enabled(data, pilot.clientId, 'cis-ig1', {...user, workspace_mode: 'demo'})).toBe(false);
  expect(enabled(data, pilot.clientId, 'cis-ig1', null)).toBe(false);
  expect(securityDomainsEnabled(pilot.clientId, 'cis-ig1', data, user, {...pilot, enabled: false})).toBe(false);
});

test('a synthetic fixture requires an explicit exact client allowlist and its own native program', () => {
  const {data} = fixture(fixtureClientId);
  expect(enabled(data, fixtureClientId, 'cis-ig1', user, fixtureConfig)).toBe(true);
  expect(enabled(fixture().data, pilot.clientId, 'cis-ig1', user, fixtureConfig)).toBe(true);
  for (const fixtureClientIds of [undefined, [], [fixtureClientId.toUpperCase()], 'synthetic-brawndo-equivalent-local-unit']) {
    expect(enabled(data, fixtureClientId, 'cis-ig1', user, {...fixtureConfig, fixtureClientIds})).toBe(false);
  }
  expect(enabled(fixture('unlisted-synthetic-client').data, 'unlisted-synthetic-client', 'cis-ig1', user, fixtureConfig)).toBe(false);
  expect(enabled(data, fixtureClientId, 'cis-ig1', user, {...fixtureConfig, enabled: false})).toBe(false);
  expect(enabled(data, fixtureClientId, 'cis-ig1', null, fixtureConfig)).toBe(false);
  expect(enabled(data, fixtureClientId, 'cis-ig1', {...user, workspace_mode: 'demo'}, fixtureConfig)).toBe(false);
  expect(enabled(data, pilot.clientId, 'cis-ig1', user, fixtureConfig)).toBe(false);
  data.implementation_position.program_id = `${pilot.clientId}:cis-ig1`;
  expect(enabled(data, fixtureClientId, 'cis-ig1', user, fixtureConfig)).toBe(false);
});

test.each([
  data => { data.selected = false; }, data => { data.configured = false; },
  data => { data.configuration = {}; }, data => { data.configuration.implementation_group = 2; },
  data => { data.configuration.implementation_group = 3; }, data => { data.configuration.implementation_group = '1'; },
  data => { data.framework.version = '8.0'; }, data => { data.framework.key = 'soc-2'; },
  data => { data.implementation_position.program_id = 'other:cis-ig1'; }, data => { delete data.implementation_position; },
])('uncertain or different native program identity fails closed (%#)', mutate => {
  const {data} = fixture(); data.framework = {...data.framework}; mutate(data); expect(enabled(data)).toBe(false);
  const synthetic = fixture(fixtureClientId).data; synthetic.framework = {...synthetic.framework}; mutate(synthetic);
  expect(enabled(synthetic, fixtureClientId, 'cis-ig1', user, fixtureConfig)).toBe(false);
});

test('models preserve every native row reference and all-unassessed remains unknown', () => {
  const {data, rows} = fixture(), domains = securityDomainModel(data, rows, pilot.clientId);
  expect(domains.every(domain => domain.available)).toBe(true);
  domains.forEach(domain => {
    expect(domain.total).toBe(domain.rows.length); expect(domain.assessed).toBe(0); expect(domain.addressed).toBe(0);
    domain.rows.forEach(row => expect(row).toBe(rows.find(native => native.definition_id === row.definition_id)));
  });
});

test('an explicitly listed fixture models all 56 native rows without copying records', () => {
  const {data, rows} = fixture(fixtureClientId), domains = securityDomainModel(data, rows, fixtureClientId, fixtureConfig);
  expect(domains.every(domain => domain.available)).toBe(true);
  expect(domains.flatMap(domain => domain.rows)).toHaveLength(56);
  domains.flatMap(domain => domain.rows).forEach(row => expect(row).toBe(rows.find(native => native.definition_id === row.definition_id)));
  expect(securityDomainModel(data, rows, fixtureClientId, {...fixtureConfig, enabled: false}).every(domain => domain.available)).toBe(true);
});

test('the model rejects missing, unlisted or mismatched current client and program identities', () => {
  const {data, rows} = fixture(fixtureClientId);
  for (const clientId of [undefined, null, '', 'unlisted-synthetic-client', pilot.clientId]) {
    expect(securityDomainModel(data, rows, clientId, fixtureConfig).every(domain => !domain.available && !domain.rows.length)).toBe(true);
  }
  expect(securityDomainModel(data, rows, fixtureClientId, {...fixtureConfig, fixtureClientIds: []}).every(domain => !domain.available)).toBe(true);
  data.implementation_position.program_id = `${pilot.clientId}:cis-ig1`;
  expect(securityDomainModel(data, rows, fixtureClientId, fixtureConfig).every(domain => !domain.available)).toBe(true);
});

test.each(['assessment', 'native'])('a fixture cannot mix canonical Brawndo %s records even when both clients are allowed', source => {
  const {data, rows} = fixture(fixtureClientId);
  (source === 'assessment' ? data.assessments : rows)[0].client_id = pilot.clientId;
  securityDomainModel(data, rows, fixtureClientId, fixtureConfig).forEach(domain => {
    expect(domain.available).toBe(false); expect(domain.rows).toEqual([]); expect(domain.applicable).toBeUndefined();
  });
});

test('saved native statuses and N/A reconcile; partial earns no implementation credit', () => {
  const {data, rows} = fixture();
  ['addressed','in_progress','needs_attention','not_applicable'].forEach((status, index) => {
    Object.assign(data.assessments[index], {status, na_rationale: status === 'not_applicable' ? 'Approved exclusion' : ''});
    Object.assign(rows[index], data.assessments[index]);
  });
  Object.assign(data.implementation_position, {denominator: 55, implemented: 1, excluded: 1,
    counts: [{key:'addressed',count:1},{key:'in_progress',count:1},{key:'needs_attention',count:1},{key:'not_assessed',count:52}]});
  const domains = securityDomainModel(data, rows, pilot.clientId), summary = cisSummary(rows);
  for (const field of ['total','applicable','addressed','partial','gap','notAssessed','na','assessed'])
    expect(domains.reduce((sum, domain) => sum + domain[field], 0)).toBe(summary[field]);
  const assets = domains[0]; expect(assets.applicable).toBe(4); expect(assets.addressed).toBe(1); expect(assets.implemented).toBe(25);
});

test.each([
  ({data}) => data.assessments.pop(),
  ({data}) => data.assessments.push({...data.assessments[0]}),
  ({data}) => { data.assessments[0].client_id = 'other'; },
  ({data}) => { data.assessments[0].framework_key = 'soc-2'; },
  ({data}) => { data.assessments[0].framework_version = '8.0'; },
  ({data}) => { data.assessments[0].framework_assessment_id = data.assessments[1].framework_assessment_id; },
  ({data}) => { data.assessments[0].status = 'unknown'; },
  ({data, rows}) => { data.assessments[0].status = rows[0].status = 'not_applicable'; },
  ({data}) => { data.definitions = data.definitions.slice(1); },
  ({data}) => { data.definitions = [{...data.definitions[0], version:'8.0'}, ...data.definitions.slice(1)]; },
  ({data}) => { data.active_definition_ids = [...data.active_definition_ids, '13.1']; },
  ({data}) => { data.implementation_position.availability = 'partial'; },
  ({data}) => { data.implementation_position.counts[0].count = 1; },
  ({data}) => { data.implementation_position.excluded = 1; },
  ({rows}) => { rows[0] = {...rows[0], status:'addressed'}; },
  ({rows}) => { rows[0] = {...rows[0], client_id:'other'}; },
])('incomplete, foreign, duplicate or unreconciled source provides no counts or shortcuts (%#)', mutate => {
  const source = fixture(); mutate(source);
  securityDomainModel(source.data, source.rows, pilot.clientId).forEach(domain => {
    expect(domain.available).toBe(false); expect(domain.rows).toEqual([]); expect(domain.applicable).toBeUndefined();
    expect(domain.reason).toContain('unavailable');
  });
  const synthetic = fixture(fixtureClientId); mutate(synthetic);
  securityDomainModel(synthetic.data, synthetic.rows, fixtureClientId, fixtureConfig).forEach(domain => {
    expect(domain.available).toBe(false); expect(domain.rows).toEqual([]); expect(domain.applicable).toBeUndefined();
    expect(domain.reason).toContain('unavailable');
  });
});
