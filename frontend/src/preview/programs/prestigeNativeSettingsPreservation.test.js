import * as store from '../store';
import * as nativeFramework from '../frameworks';
import {stable} from '../commandRequests';
import * as preparation from './prestigeNativeOnboarding';
import {createPrestigeCurrentModel} from './prestigeCurrentModel';

const CID = 'demo_prestige', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const MARKER = 'prestige_current_model_fixture';
const PRESERVATION_ERROR = /foreign data, identity, source maps or unrelated settings changed/;
const copy = value => JSON.parse(JSON.stringify(value));
const client = db => db.clients.find(row => row.client_id === CID);
let source, sourceBefore;

async function digest(value) {
  const bytes = new TextEncoder().encode(stable(value));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function preparedCase(changeOriginal) {
  const original = copy(source);
  if (changeOriginal) changeOriginal(original);
  const prepared = preparation.preparePrestigeNativeOnboarding(original, {clock: CLOCK, purpose: 'native_onboarding_qa'});
  return {original, originalBefore: JSON.stringify(original), prepared, before: JSON.stringify(prepared),
    options: {clock: CLOCK, purpose: 'current_model_source_qa', expected_source_sha256: await digest(prepared.backup)}};
}

// Reuse the original corpus's final native-save seam; no fake command results or private exports.
function afterLastAssessment(change) {
  const native = nativeFramework.frameworkRequest;
  const observed = {attempted: 0, working: null};
  jest.spyOn(nativeFramework, 'frameworkRequest').mockImplementation((...args) => {
    const saved = native(...args);
    if (args[2] === 'patch' && args[4]?.record_assessment && ++observed.attempted === 38) {
      observed.working = args[0];
      change(args[0]);
    }
    return saved;
  });
  return observed;
}

function expectCallersUnchanged(value) {
  expect(JSON.stringify(source)).toBe(sourceBefore);
  expect(JSON.stringify(value.original)).toBe(value.originalBefore);
  expect(JSON.stringify(value.prepared)).toBe(value.before);
}

beforeAll(() => {
  source = store.buildLegacyDemoStore(CLOCK);
  sourceBefore = JSON.stringify(source);
});

afterEach(() => { jest.restoreAllMocks(); });

test('only the exact native IG1 default is reconciled while the live result and original callers remain intact', async () => {
  const value = await preparedCase(), originalClient = client(value.original);
  expect(Object.hasOwn(originalClient.framework_settings || {}, 'cis-ig1')).toBe(false);
  const result = await createPrestigeCurrentModel(value.prepared, value.options);
  expect(client(result.db).framework_settings).toEqual({...originalClient.framework_settings, 'cis-ig1': {implementation_group: 1}});
  expect(result.backup).toEqual(value.original);
  expect(result.db).toHaveProperty(MARKER);
  expect(result.db).not.toBe(value.prepared.db);
  expectCallersUnchanged(value);
});

test('an originally present unchanged native IG1 setting is retained rather than treated as a generated addition', async () => {
  const value = await preparedCase(original => {
    const row = client(original);
    row.framework_settings = {...row.framework_settings, 'cis-ig1': {implementation_group: 1}};
  });
  const result = await createPrestigeCurrentModel(value.prepared, value.options);
  expect(client(result.db).framework_settings).toEqual(client(value.original).framework_settings);
  expect(result.backup).toEqual(value.original);
  expectCallersUnchanged(value);
});

test.each([
  ['wrong CIS value', undefined, db => {
    client(db).framework_settings['cis-ig1'] = {implementation_group: 2};
  }, PRESERVATION_ERROR],
  ['extra member on the CIS default', undefined, db => {
    client(db).framework_settings['cis-ig1'] = {implementation_group: 1, unrelated_member: true};
  }, PRESERVATION_ERROR],
  ['a changed SOC framework setting', undefined, db => {
    const settings = client(db).framework_settings;
    settings['soc-2'] = {...settings['soc-2'], unrelated_setting: 'changed'};
  }, PRESERVATION_ERROR],
  ['the exact default added to a foreign client', original => {
    // Controlled cloned-shape boundary, as in the approved map regressions; shared seeds stay unchanged.
    const foreign = original.clients.find(row => row.client_id === 'demo_dunder');
    expect(foreign).toBeDefined();
    foreign.framework_settings = {...foreign.framework_settings};
    delete foreign.framework_settings['cis-ig1'];
  }, db => {
    const foreign = db.clients.find(row => row.client_id === 'demo_dunder');
    foreign.framework_settings = {...foreign.framework_settings, 'cis-ig1': {implementation_group: 1}};
  }, PRESERVATION_ERROR],
  ['target metadata changed alongside the exact default', undefined, db => {
    client(db).name += ' changed';
  }, PRESERVATION_ERROR],
  ['a duplicate target identity', undefined, db => {
    db.clients.push(copy(client(db)));
  }, /one completed canonical SOC 2 Demo client is required/],
  ['an originally present CIS setting overwritten with the default', original => {
    const row = client(original);
    row.framework_settings = {...row.framework_settings, 'cis-ig1': {implementation_group: 2}};
  }, db => {
    client(db).framework_settings['cis-ig1'] = {implementation_group: 1};
  }, PRESERVATION_ERROR],
])('%s still rejects the complete native construction without changing the callers', async (_label, changeOriginal, change, expectedError) => {
  const value = await preparedCase(changeOriginal), observed = afterLastAssessment(change);
  await expect(createPrestigeCurrentModel(value.prepared, value.options)).rejects.toThrow(expectedError);
  expect(observed.attempted).toBe(38);
  expect(observed.working).not.toHaveProperty(MARKER);
  expect(value.prepared.db).not.toHaveProperty(MARKER);
  expectCallersUnchanged(value);
});

test('a later prepared settings map cannot replace the original comparison baseline', async () => {
  const value = await preparedCase(), observed = afterLastAssessment(() => {});
  const nativePreparation = preparation.preparePrestigeNativeOnboarding;
  let firstFresh, changed = 0;
  jest.spyOn(preparation, 'preparePrestigeNativeOnboarding').mockImplementation((...args) => {
    const result = nativePreparation(...args);
    if (!firstFresh) firstFresh = result;
    // Child stages may also prepare data; arm only after the real 38th final assessment save.
    if (observed.attempted === 38) {
      client(firstFresh.db).framework_settings = copy(client(result.db).framework_settings);
      changed += 1;
    }
    return result;
  });
  await expect(createPrestigeCurrentModel(value.prepared, value.options))
    .rejects.toThrow(/original framework settings changed during source preparation/);
  expect(observed.attempted).toBe(38);
  expect(changed).toBe(1);
  expect(client(firstFresh.db).framework_settings['cis-ig1']).toEqual({implementation_group: 1});
  expect(observed.working).not.toHaveProperty(MARKER);
  expectCallersUnchanged(value);
});
