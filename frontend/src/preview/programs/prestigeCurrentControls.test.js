import crypto from 'crypto';
import facts from './prestigeCurrentControlFacts.json';
import {buildLegacyDemoStore} from '../store';
import {stable} from '../commandRequests';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {createPrestigeCurrentModel} from './prestigeCurrentModel';
import {createPrestigeCurrentControlDesigns} from './prestigeCurrentControls';

const CID = 'demo_prestige', clock = new Date('2026-11-02T12:00:00.000Z');
const options = {clock, purpose: 'current_control_designs_source_qa'};
const copy = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
let model, modelBefore, result;
beforeAll(async () => {
  const source = buildLegacyDemoStore(clock);
  const prepared = preparePrestigeNativeOnboarding(source, {clock, purpose: 'native_onboarding_qa'});
  model = await createPrestigeCurrentModel(prepared, {clock, purpose: 'current_model_source_qa',
    expected_source_sha256: digest(prepared.backup)});
  modelBefore = stable(model);
  result = await createPrestigeCurrentControlDesigns(model, options);
});

test('25 native shared designs cover exactly 38 scoped criteria without claiming operation', () => {
  const controls = result.db.organizational_controls.filter(row => row.client_id === CID);
  expect(controls).toHaveLength(25);
  expect(facts.controls.reduce((n, row) => n + row.populations.length, 0)).toBe(31);
  const assessmentIds = new Set(controls.flatMap(row => row.assessment_ids));
  expect([...assessmentIds].sort()).toEqual(Object.values(model.manifest.assessment_ids).sort());
  expect(Object.keys(result.controlsManifest.control_ids)).toEqual(facts.controls.map(row => row.key));
  for (const control of controls) {
    expect(control.observations).toEqual([]);
    expect(control.design).toBe('adequate');
    expect(control.created_by).toBe(model.db.user.user_id);
    expect(Number.isFinite(Date.parse(control.created_at))).toBe(true);
    for (const link of control.related_links) expect(result.db[link.kind].some(row => row.client_id === CID
      && row[{policies: 'policy_id', reviews: 'review_id', vendors: 'vendor_id'}[link.kind]] === link.id)).toBe(true);
  }
  expect(result.controlsManifest.observations_recorded).toBe(0);
});

test('copying the transaction preserves source, recovery copy, native saved judgments and foreign clients', () => {
  expect(stable(model)).toBe(modelBefore);
  expect(result.backup).toEqual(model.backup);
  expect(result.manifest).toEqual(model.manifest);
  for (const [kind, rows] of Object.entries(model.db)) if (Array.isArray(rows))
    expect(result.db[kind].filter(row => row.client_id !== CID)).toEqual(rows.filter(row => row.client_id !== CID));
  for (const row of model.db.framework_assessments.filter(row => row.client_id === CID)) {
    const saved = result.db.framework_assessments.find(item => item.framework_assessment_id === row.framework_assessment_id);
    expect(saved).toEqual({...row, controls_migrated: true});
  }
});

test('exact design-stage retry makes no native writes or new identities', async () => {
  const again = await createPrestigeCurrentControlDesigns(result, options);
  expect(again).toEqual(result);
});

test.each(['wrong purpose', 'foreign map', 'changed manifest', 'existing Control', 'changed retry'])
('reject %s atomically', async mode => {
  const input = copy(mode === 'changed retry' ? result : model);
  if (mode === 'foreign map') input.manifest.policy_ids['policy-information-security-policy'] = 'foreign';
  if (mode === 'changed manifest') input.manifest.assessment_ids['CC1.1'] = input.manifest.assessment_ids['CC1.2'];
  if (mode === 'existing Control') input.db.organizational_controls.push({client_id: CID, control_id: 'visitor', observations: [{notes: 'keep'}]});
  if (mode === 'changed retry') input.db.organizational_controls.find(row => row.client_id === CID).description = 'Visitor edited design';
  const before = stable(input);
  await expect(createPrestigeCurrentControlDesigns(input, mode === 'wrong purpose' ? {...options, purpose: 'startup'} : options)).rejects.toThrow();
  expect(stable(input)).toBe(before);
});
