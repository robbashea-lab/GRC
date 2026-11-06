import catalog from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS, activePlans, activeDefinitions} from '../lib/frameworks';
import {scheduledDate} from '../lib/reviewOccurrences';
import {baselineRecordVersions, saveBaseline} from './baseline';
import {prepareCisOnboardingFixture} from './cisCanonicalOnboarding';
import {cisDemoSelection} from './cisDemoSelection';

const CID = 'demo_krusty_krab';
const CONFIGURATION = {implementation_group:3};
// Match the existing CIS Demo release floor; earlier years are organization history.
const RELEASE_DAY = '2024-06-24';
const FIRST_ENROLLMENT_DAY = '2024-07-01'; // Fictional first enrollment, not the official release date.
const SELECTED_OPERATIONAL_PLANS = [
  'secure-development','penetration-testing','passive-discovery-reconciliation',
  'script-allowlist-reassessment','event-alert-tuning','internal-penetration-test'
];

export function krustyOnboardingSelection() {
  // Retention/disposal contents reuse Data Handling; a template title is not a mandate.
  const policy_keys = cisDemoSelection(3).selected_policy_keys
    .filter(key => key !== 'policy-data-retention-secure-disposal-policy');
  return {policy_keys,
    // Focused trackers retain weekly discovery, six-month script reassessment and
    // monthly tuning. Ticket optionality never makes those operating duties optional.
    // Internal test execution has its own scope; the inherited testing plan reviews
    // the program. Provider assessments reuse later per-Vendor work, which must also
    // retain new/renewed-contract assessments and policy-defined monitoring.
    plans:activePlans('cis-ig1', CONFIGURATION)
      .filter(plan => !!plan.source_minimum || SELECTED_OPERATIONAL_PLANS.includes(plan.key))};
}

function baselineOrigins(dates) {
  if (!dates?.anchor || typeof dates.month !== 'function') throw new Error('Krusty fixture dates are required.');
  const anchor = scheduledDate(dates.anchor), organizationDay = dates.month(-60);
  const organization = scheduledDate(organizationDay);
  if (!anchor || !organization || organizationDay.length !== 10 || organization > anchor)
    throw new Error('Krusty fixture dates must retain a valid past organization origin.');
  const origin = [organizationDay, RELEASE_DAY, FIRST_ENROLLMENT_DAY].sort().at(-1)+'T00:00:00.000Z';
  if (scheduledDate(origin) > anchor) throw new Error('Krusty CIS v8.1 baseline requires its post-release enrollment date.');
  return {origin, organization_origin:organization.toISOString()};
}

// Explicit fresh-source construction only; never called by retained-session reads.
function buildBaseline(db, {dates} = {}) {
  const {origin, organization_origin} = baselineOrigins(dates);
  const {policy_keys, plans} = krustyOnboardingSelection();
  const initialIds = [
    ['policies','policy_id',policy_keys.map(key => CID+'_'+key)],
    ['requirements','requirement_id',catalog.requirements.map(row => CID+'_'+row.key)],
    ['reviews','review_id',plans.map(row => CID+'_canonical_review_'+row.key)],
    ['framework_assessments','framework_assessment_id',activeDefinitions('cis-ig1', CONFIGURATION)
      .map(row => 'fw_'+CID+'_assessment_'+row.id)]
  ];
  for (const [kind, field, values] of initialIds) {
    if ((db[kind] || []).some(row => row.client_id !== CID && values.includes(row[field])))
      throw new Error('Krusty initial fixture identity collides with another client.');
  }
  prepareCisOnboardingFixture(db, CID);
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
      .map(plan => [plan.key, {enabled:selectedPlans.has(plan.key), recurrence:plan.default_cadence,
        ...(plan.default_cadence === 'custom' ? {custom_recurrence_days:plan.default_custom_recurrence_days} : {}),
        due_date:null}]))};
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
  // Normalize only new initialization events; unrelated audit/log_id aliases stay intact.
  const logs = db.logs.filter(row => row.client_id === CID);
  const auditIds = new Set(logs.map((_, index) => CID+'_canonical_onboarding_'+index));
  if (db.logs.some(row => row.client_id !== CID && (auditIds.has(row.audit_id) || auditIds.has(row.log_id))))
    throw new Error('Krusty initial fixture audit identity collides with another client.');
  logs.forEach((row, index) => {
    row.audit_id = CID+'_canonical_onboarding_'+index;
    row.entity_id = reviewIds.get(row.entity_id) || row.entity_id;
    row.at = origin;
    row.meta = {...row.meta, source:'Fictional scenario initialization through native onboarding services'};
  });
  const client = db.clients.find(row => row.client_id === CID);
  client.initial_program_baseline.state.updated_at = origin;
  client.initial_program_baseline.completed_at = origin;
  return {baseline:saved, policy_keys, plans, origin, organization_origin};
}

export function establishKrustyBaseline(db, options) {
  // Commit only after native onboarding validation accepts the entire scoped replacement.
  const staged = JSON.parse(JSON.stringify(db));
  const result = buildBaseline(staged, options);
  Object.assign(db, staged);
  return result;
}
