import catalog from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS, activePlans, activeDefinitions} from '../lib/frameworks';
import {baselineRecordVersions, saveBaseline} from './baseline';
import {prepareCisOnboardingFixture} from './cisCanonicalOnboarding';
import {cisDemoSelection} from './cisDemoSelection';

const CID = 'demo_brawndo';

export function brawndoOnboardingSelection() {
  // Retention/disposal are sections of the selected data-management document,
  // rather than a second, purportedly mandated standalone document title.
  const selected = cisDemoSelection(1).selected_policy_keys
    .filter(key => key !== 'policy-data-retention-secure-disposal-policy');
  return {policy_keys:selected, plans:activePlans('cis-ig1', {implementation_group:1})
    .filter(plan => !!plan.source_minimum)};
}

// Explicit initial fixture construction, never a retained-session migration.
// The same save controller exercised by native onboarding owns enrollment and
// record creation. Stable initial identities/dates make this source reproducible;
// ordinary user saves retain the normal clock and identity allocation.
function buildBaseline(db, {dates}) {
  if (!dates?.anchor || typeof dates.month !== 'function') throw new Error('Brawndo fixture dates are required.');
  const {policy_keys, plans} = brawndoOnboardingSelection();
  const initialIds = [
    ['policies','policy_id',policy_keys.map(key => CID+'_'+key)],
    ['requirements','requirement_id',catalog.requirements.map(row => CID+'_'+row.key)],
    ['reviews','review_id',plans.map(row => CID+'_canonical_review_'+row.key)],
    ['framework_assessments','framework_assessment_id',activeDefinitions('cis-ig1',{implementation_group:1})
      .map(row => 'fw_'+CID+'_assessment_'+row.id)]
  ];
  for (const [kind, field, values] of initialIds) {
    if ((db[kind] || []).some(row => row.client_id !== CID && values.includes(row[field])))
      throw new Error('Brawndo initial fixture identity collides with another client.');
  }
  prepareCisOnboardingFixture(db, CID);
  const origin = dates.month(-18)+'T00:00:00.000Z';
  for (const [kind, idField, selected] of [
    ['policies','policy_id',catalog.policies.filter(row => policy_keys.includes(row.key))],
    ['requirements','requirement_id',catalog.requirements]
  ]) {
    for (const item of selected) db[kind].push({
      [idField]:CID+'_'+item.key, client_id:CID, title:item.name, baseline_key:item.key,
      created_at:origin, created_by:db.user.user_id, updated_at:null
    });
  }
  const state = {...db.baselines[CID], step:3, selected_policy_keys:policy_keys,
    policies:Object.fromEntries(policy_keys.map(key => [key,'no'])),
    requirements:Object.fromEntries(FRAMEWORKS.map(item => [item.key,
      item.key === 'cis-ig1' ? 'applies' : 'does_not_apply'])),
    framework_reviews:Object.fromEntries(activePlans('cis-ig1', {implementation_group:1})
      .map(plan => [plan.key, {enabled:!!plan.source_minimum, recurrence:plan.default_cadence, due_date:null}]))};
  const saved = saveBaseline(db, CID, state, true,
    {expected_updated_at:null, expected_records:baselineRecordVersions(db, CID)});
  saved.updated_at = origin;
  const reviewIds = new Map();
  for (const review of db.reviews.filter(row => row.client_id === CID)) {
    const stableId = CID+'_canonical_review_'+review.framework_plan_key;
    reviewIds.set(review.review_id, stableId);
    review.review_id = stableId;
    review.current_occurrence_id = 'occ_'+stableId;
  }
  for (const assessment of db.framework_assessments.filter(row => row.client_id === CID)) {
    assessment.related_links = assessment.related_links.map(link => link.kind === 'reviews'
      ? {...link, id:reviewIds.get(link.id) || link.id} : link);
  }
  for (const kind of ['policies','requirements','reviews','framework_assessments']) {
    for (const row of db[kind].filter(row => row.client_id === CID)) {
      row.created_at = origin;
      row.updated_at = origin;
    }
  }
  // These are freshly authored synthetic initialization events, not genuine user
  // history. Never normalize the clock or identities of unrelated/retained rows.
  db.logs.filter(row => row.client_id === CID).forEach((row, index) => {
    row.audit_id = CID+'_canonical_onboarding_'+index;
    row.entity_id = reviewIds.get(row.entity_id) || row.entity_id;
    row.at = origin;
    row.meta = {...row.meta, source:'Fictional scenario initialization through native onboarding services'};
  });
  const client = db.clients.find(row => row.client_id === CID);
  client.initial_program_baseline.state.updated_at = origin;
  client.initial_program_baseline.completed_at = origin;
  return {baseline:saved, policy_keys, plans, origin};
}

export function establishBrawndoBaseline(db, options) {
  // Native authorization/validation may reject even fixture inputs. Prepare and
  // validate off to the side so a failure cannot leave the prior scenario reset.
  // This initial-source transaction does not participate in normal saves/reads.
  const staged = JSON.parse(JSON.stringify(db));
  const result = buildBaseline(staged, options);
  Object.assign(db, staged);
  return result;
}
