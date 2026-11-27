import crypto from 'crypto';
import {buildLegacyDemoStore} from '../store';
import {stable} from '../commandRequests';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {createPrestigeCurrentModel} from './prestigeCurrentModel';
import {createPrestigeOrganizationReviews} from './prestigeOrganizationReviews';
import {createPrestigeScenarioAssets} from './prestigeScenarioSource';
import {reviewDrivers} from '../../lib/frameworks';

// Preserve the original authored-V2 source-construction context without changing
// Review records, schedules, native command behavior or rollout default coverage.
jest.mock('../../lib/socGuidedAssessment',()=>({
  ...jest.requireActual('../../lib/socGuidedAssessment'),
  socGuidedCatalog:jest.requireActual('@catalogs/guidedSoc2.json'),
}));

const CID = 'demo_prestige', clock = new Date('2026-11-02T12:00:00.000Z');
const options = {purpose: 'organization_review_source_qa'};
let model, result;
beforeAll(async () => {
  const prepared = preparePrestigeNativeOnboarding(buildLegacyDemoStore(clock), {clock, purpose: 'native_onboarding_qa'});
  model = await createPrestigeCurrentModel(prepared, {clock, purpose: 'current_model_source_qa',
    expected_source_sha256: crypto.createHash('sha256').update(stable(prepared.backup)).digest('hex')});
  result = createPrestigeOrganizationReviews(model, options);
});

test('two distinct future organization Reviews add 46 native criterion links without duplicate schedules', () => {
  const ids = result.organizationReviewManifest.review_ids;
  const definitions = Object.keys(model.manifest.assessment_ids);
  expect(Object.keys(ids)).toEqual(['next-program-review', 'next-customer-commitment-review']);
  expect(result.db.reviews.filter(row => row.client_id === CID)).toHaveLength(103);
  for (const [key, due, count] of [['next-program-review', '2027-10-22', 38], ['next-customer-commitment-review', '2027-02-19', 8]]) {
    const review = result.db.reviews.find(row => row.review_id === ids[key]);
    expect(review).toMatchObject({client_id: CID, due_date: due, status: 'upcoming', recurrence: 'annual',
      governance_context: {cadence_source: 'organization_defined'}});
    expect(review.occurrences || []).toEqual([]);
    expect(reviewDrivers(review)).toEqual([]);
    expect(review).not.toHaveProperty('risk_id');
    const linked = result.db.framework_assessments.filter(row => row.client_id === CID
      && row.related_links.some(link => link.kind === 'reviews' && link.id === review.review_id));
    expect(linked).toHaveLength(count);
    expect(linked.every(row => definitions.includes(row.definition_id))).toBe(true);
  }
  for (const id of Object.values(model.manifest.review_ids))
    expect(result.db.reviews.find(row => row.review_id === id)).toEqual(model.db.reviews.find(row => row.review_id === id));
});

test('input, recovery copy, assessment judgments, customers and existing native records remain intact', () => {
  expect(result.backup).toEqual(model.backup);
  expect(result.manifest).toEqual(model.manifest);
  for (const [kind, rows] of Object.entries(model.db)) if (Array.isArray(rows)) {
    expect(result.db[kind].filter(row => row.client_id !== CID)).toEqual(rows.filter(row => row.client_id !== CID));
    if (!['reviews', 'logs', 'framework_assessments'].includes(kind)) expect(result.db[kind]).toEqual(rows);
  }
  for (const row of model.db.framework_assessments.filter(row => row.client_id === CID)) {
    const changed = result.db.framework_assessments.find(item => item.framework_assessment_id === row.framework_assessment_id);
    const {related_links, ...original} = row, {related_links: newLinks, ...saved} = changed;
    expect(saved).toEqual(original);
    expect(newLinks).toEqual(expect.arrayContaining(related_links));
  }
});

test.each(['duplicate', 'late missing criterion', 'second invocation'])('reject %s without mutating caller', mode => {
  const input = JSON.parse(JSON.stringify(mode === 'second invocation' ? result : model));
  if (mode === 'duplicate') input.db.reviews.push({client_id: CID, review_id: 'visitor', title: 'Annual internal program implementation review'});
  if (mode === 'late missing criterion') input.manifest.assessment_ids['C1.2'] = 'foreign';
  const before = stable(input);
  expect(() => createPrestigeOrganizationReviews(input, options)).toThrow();
  expect(stable(input)).toBe(before);
});

test('six native systems retain actual identities, eligible ownership and every existing foreign record', () => {
  const before = stable(model), assets = createPrestigeScenarioAssets(model, {purpose: 'eight_year_assets_source_qa'});
  const rows = assets.db.assets.filter(row => row.client_id === CID);
  expect(rows).toHaveLength(6);
  expect(rows.map(row => row.asset_id).sort()).toEqual(Object.values(assets.assetManifest.asset_ids).sort());
  expect(new Set(rows.map(row => row.asset_id)).size).toBe(6);
  expect(rows.every(row => row.owner_id === 'demo_prestige_user_2' && row.status === 'active')).toBe(true);
  expect(assets.db.assets.filter(row => row.client_id !== CID)).toEqual(model.db.assets.filter(row => row.client_id !== CID));
  expect(stable(model)).toBe(before);
  expect(() => createPrestigeScenarioAssets(assets, {purpose: 'eight_year_assets_source_qa'})).toThrow();
});
