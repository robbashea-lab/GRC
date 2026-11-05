import catalog from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS, activePlans, activeDefinitions} from '../lib/frameworks';
import {baselineRecordVersions, saveBaseline} from './baseline';
import {prepareCisOnboardingFixture} from './cisCanonicalOnboarding';
import {cisDemoSelection} from './cisDemoSelection';

const CID = 'demo_initech';
const CONFIGURATION = {implementation_group:2};
const SELECTED_OPERATIONAL_PLANS = ['secure-development','penetration-testing'];

export function initechOnboardingSelection() {
  // Retention/disposal contents belong in the selected data-management document.
  // A mapped template title is not a separately mandated CIS document.
  const policy_keys = cisDemoSelection(2).selected_policy_keys
    .filter(key => key !== 'policy-data-retention-secure-disposal-policy');
  return {policy_keys,
    // These two existing plans are chosen tracking containers for IG2 duties,
    // not a claim that CIS mandates the platform's Review tickets themselves.
    plans:activePlans('cis-ig1', CONFIGURATION)
      .filter(plan => !!plan.source_minimum || SELECTED_OPERATIONAL_PLANS.includes(plan.key))};
}

// Initial fictional source construction only; not wired to retained-session reads.
function buildBaseline(db, {dates}) {
  if (!dates?.anchor || typeof dates.month !== 'function') throw new Error('Initech fixture dates are required.');
  const {policy_keys, plans} = initechOnboardingSelection();
  const initialIds = [
    ['policies','policy_id',policy_keys.map(key => CID+'_'+key)],
    ['requirements','requirement_id',catalog.requirements.map(row => CID+'_'+row.key)],
    ['reviews','review_id',plans.map(row => CID+'_canonical_review_'+row.key)],
    ['framework_assessments','framework_assessment_id',activeDefinitions('cis-ig1', CONFIGURATION)
      .map(row => 'fw_'+CID+'_assessment_'+row.id)]
  ];
  for (const [kind, field, values] of initialIds) {
    if ((db[kind] || []).some(row => row.client_id !== CID && values.includes(row[field])))
      throw new Error('Initech initial fixture identity collides with another client.');
  }
  prepareCisOnboardingFixture(db, CID);
  const origin = dates.month(-24)+'T00:00:00.000Z';
  for (const [kind, idField, selected] of [
    ['policies','policy_id',catalog.policies.filter(row => policy_keys.includes(row.key))],
    ['requirements','requirement_id',catalog.requirements]
  ]) {
    for (const item of selected) db[kind].push({
      [idField]:CID+'_'+item.key, client_id:CID, title:item.name, baseline_key:item.key,
      created_at:origin, created_by:db.user.user_id, updated_at:null
    });
  }
  const selectedPlans = new Set(plans.map(plan => plan.key));
  const state = {...db.baselines[CID], step:3, selected_policy_keys:policy_keys,
    policies:Object.fromEntries(policy_keys.map(key => [key,'no'])),
    requirements:Object.fromEntries(FRAMEWORKS.map(item => [item.key,
      item.key === 'cis-ig1' ? 'applies' : 'does_not_apply'])),
    framework_reviews:Object.fromEntries(activePlans('cis-ig1', CONFIGURATION)
      .map(plan => [plan.key, {enabled:selectedPlans.has(plan.key), recurrence:plan.default_cadence, due_date:null}]))};
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
  // Normalize only the newly authored initialization events, preserving unrelated
  // audit identities including legacy log_id aliases and their original clocks.
  const logs = db.logs.filter(row => row.client_id === CID);
  const auditIds = new Set(logs.map((_, index) => CID+'_canonical_onboarding_'+index));
  if (db.logs.some(row => row.client_id !== CID && (auditIds.has(row.audit_id) || auditIds.has(row.log_id))))
    throw new Error('Initech initial fixture audit identity collides with another client.');
  logs.forEach((row, index) => {
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

export function establishInitechBaseline(db, options) {
  // Native authorization/validation can reject fixture inputs. Commit the scoped
  // replacement only after the same onboarding controller accepts the full state.
  const staged = JSON.parse(JSON.stringify(db));
  const result = buildBaseline(staged, options);
  Object.assign(db, staged);
  return result;
}
