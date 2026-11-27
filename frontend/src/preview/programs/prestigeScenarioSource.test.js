import {buildLegacyDemoStore} from '../store';
import {stable} from '../commandRequests';
import {preparePrestigeScenarioSource} from './prestigeScenarioSource';

const CID = 'demo_prestige', options = {purpose: 'eight_year_source_qa'};
let source;
beforeAll(() => { source = buildLegacyDemoStore(new Date('2026-11-02T12:00:00.000Z')); });

test('native context updates match the new fictional stack and keep an exact original recovery copy', () => {
  const before = stable(source), result = preparePrestigeScenarioSource(source, options);
  const original = source.clients.find(row => row.client_id === CID), changed = result.source.clients.find(row => row.client_id === CID);
  expect(stable(source)).toBe(before);
  expect(result.backup).toEqual(source);
  expect(changed.profile.technical).toEqual({...original.profile.technical,
    identity: ['Okta'], productivity: ['Google Workspace'], cloud: ['AWS']});
  expect(changed.profile.organization).toEqual({...original.profile.organization, notes: changed.notes});
  expect(changed.profile.security).toEqual({...original.profile.security,
    disaster_recovery: 'Implemented', restoration: 'Implemented', ai_governance: 'Partial'});
  expect(changed.notes).toContain('2018-11-02 through 2026-11-02');
  expect(changed.framework_settings).toEqual(original.framework_settings);
  for (const field of ['client_id', 'name', 'logo_url', 'logo', 'environment', 'assigned_owner_id', 'primary_contact_id'])
    expect(changed[field]).toEqual(original[field]);
  expect(result.source.users).toEqual(source.users);
  expect(result.source.contacts).toEqual(source.contacts);
  for (const [kind, rows] of Object.entries(source)) if (Array.isArray(rows))
    expect(result.source[kind].filter(row => row.client_id !== CID)).toEqual(rows.filter(row => row.client_id !== CID));
  expect(result.source.logs.filter(row => row.client_id === CID && row.action === 'client-profile-updated')).toHaveLength(3);
});

test.each(['standard', 'reader', 'wrong purpose'])('reject %s without changing the caller', mode => {
  const input = JSON.parse(JSON.stringify(source));
  if (mode === 'standard') input.user.workspace_mode = 'standard';
  if (mode === 'reader') input.user.role = 'client_readonly';
  const before = stable(input);
  expect(() => preparePrestigeScenarioSource(input, mode === 'wrong purpose' ? {purpose: 'startup'} : options)).toThrow();
  expect(stable(input)).toBe(before);
});
