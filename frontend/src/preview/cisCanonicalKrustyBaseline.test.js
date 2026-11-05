import catalog from '@catalogs/onboardingCatalog.json';
import {cis, activeDefinitions, activePlans, reviewDrivers} from '../lib/frameworks';
import {ids} from './store';
import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {establishKrustyBaseline, krustyOnboardingSelection} from './cisCanonicalKrustyBaseline';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';

const CID = 'demo_krusty_krab';
const CLOCK = new Date('2026-11-04T12:00:00.000Z');
const ORIGIN = '2024-07-01T00:00:00.000Z';
const ORGANIZATION_ORIGIN = '2021-11-04T00:00:00.000Z';
const copy = value => JSON.parse(JSON.stringify(value));
const target = (db, kind) => db[kind].filter(row => row.client_id === CID);
const outside = db => Object.fromEntries(Object.entries(db).filter(([,value]) => Array.isArray(value))
  .map(([key,value]) => [key,value.filter(row => row.client_id !== CID)]));
const identity = client => Object.fromEntries(Object.entries(client)
  .filter(([key]) => !['initial_program_baseline','onboarding_baseline','framework_settings'].includes(key)));
const EXPECTED_PLANS = {
  'asset-inventory':'semiannual', 'software-support':'monthly', 'data-governance':'annual',
  'secure-configuration':'annual', 'account-authorization':'quarterly', 'vulnerability-remediation':'monthly',
  'audit-logging':'annual', 'data-recovery':'annual', awareness:'annual', 'provider-inventory':'annual',
  'incident-governance':'annual', 'secure-development':'monthly', 'penetration-testing':'annual',
  'passive-discovery-reconciliation':'custom', 'script-allowlist-reassessment':'semiannual',
  'event-alert-tuning':'monthly', 'internal-penetration-test':'annual'
};

function fixture() {
  const actor = {user_id:'demo_admin', name:'Synthetic coordinator', role:'super_admin',
    workspace_mode:'demo', status:'active', client_ids:[CID]};
  return {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])), user:actor, users:[actor], logs:[],
    baselines:{}, clients:[{client_id:CID, name:'The Krusty Krab', environment:'Demo', status:'active',
      logo_url:'/retained-krusty.svg', portfolio_order:3, primary_contact_id:'retained_contact',
      assigned_owner_id:actor.user_id, notes:'Retained fictional business identity'}],
    contacts:[{contact_id:'retained_contact', client_id:CID, name:'Eugene Krabs'}],
    risks:[{risk_id:'retained_target', client_id:CID, title:'Keep until replacement succeeds'}]};
}

beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => jest.useRealTimers());

test('native onboarding derives all 153 IG3 safeguards without conclusions and preserves existing clients, identities and bytes', () => {
  const db = preExpansionCisFixture(CLOCK), before = copy(db), others = copy(outside(db));
  const result = establishKrustyBaseline(db, {dates:cisDemoFixtureDates(CLOCK)});
  const client = db.clients.find(row => row.client_id === CID);
  expect(result.origin).toBe(ORIGIN); expect(result.organization_origin).toBe(ORGANIZATION_ORIGIN);
  expect(result.baseline).toMatchObject({version:3, completed:true, step:3, updated_at:ORIGIN,
    framework_settings:{'cis-ig1':{implementation_group:3}}, reviews:[]});
  expect(client.framework_settings['cis-ig1']).toEqual({implementation_group:3});
  const otherSettings = settings => Object.fromEntries(Object.entries(settings || {}).filter(([key]) => key !== 'cis-ig1'));
  expect(otherSettings(client.framework_settings))
    .toEqual(otherSettings(before.clients.find(row => row.client_id === CID).framework_settings));
  expect(identity(client)).toEqual(identity(before.clients.find(row => row.client_id === CID)));
  expect(db.clients.map(row => row.client_id)).toEqual(before.clients.map(row => row.client_id));
  expect(db.contacts).toEqual(before.contacts); expect(db.users).toEqual(before.users); expect(db.user).toEqual(before.user);
  expect(outside(db)).toEqual(others);
  for (const [key, value] of Object.entries(before.baselines).filter(([key]) => key !== CID))
    expect(db.baselines[key]).toEqual(value);
  expect(client.onboarding_baseline).toEqual({version:3, step:0, completed:false, updated_at:null,
    policies:{}, selected_policy_keys:[], requirements:{}, reviews:[], framework_reviews:{},
    framework_settings:{'cis-ig1':{implementation_group:3}}});
  expect(client.initial_program_baseline).toMatchObject({completed_at:ORIGIN, completed_by:db.user.user_id,
    primary_contact_id:client.primary_contact_id ?? null, assigned_owner_id:client.assigned_owner_id ?? null,
    policies:result.policy_keys.length, reviews:result.plans.length, state:result.baseline});

  const assessments = target(db, 'framework_assessments');
  const expectedIds = activeDefinitions('cis-ig1', {implementation_group:3}).map(row => row.id);
  expect(expectedIds).toHaveLength(153);
  expect(assessments.map(row => row.definition_id).sort()).toEqual([...expectedIds].sort());
  expect(new Set(assessments.map(row => row.framework_assessment_id)).size).toBe(expectedIds.length);
  for (const row of assessments) {
    expect(row).toMatchObject({framework_key:'cis-ig1', framework_version:'8.1', status:'not_assessed',
      framework_assessment_id:'fw_'+CID+'_assessment_'+row.definition_id,
      implementation:'', technology:'', notes:'', assessment_history:[], owner_id:null, process_owner_id:null});
    for (const field of ['last_assessed','assessed_by','verification','verification_checklist','guided_assessment_source'])
      expect(row[field]).toBeUndefined();
  }
  expect(db.guided_assessment_pilot && Object.values(db.guided_assessment_pilot).filter(row => row.client_id === CID) || []).toEqual([]);
  expect(db.guided_assessment_history && Object.values(db.guided_assessment_history).filter(row => row.client_id === CID) || []).toEqual([]);
});

test('selection derives only mapped IG3 documents and consolidates retention/disposal without changing the shared catalog', () => {
  const db = fixture(), catalogBefore = copy(cis), result = establishKrustyBaseline(db, {dates:cisDemoFixtureDates(CLOCK)});
  const scope = new Set(activeDefinitions('cis-ig1', {implementation_group:3}).map(row => row.id));
  const mapped = catalog.policies.filter(policy => cis.policy_mappings.some(mapping =>
    mapping.policy_key === policy.key && mapping.safeguards.some(id => scope.has(id)))).map(row => row.key);
  const retentionKey = 'policy-data-retention-secure-disposal-policy';
  const selected = mapped.filter(key => key !== retentionKey).sort();
  expect(mapped).toContain(retentionKey);
  expect(result.policy_keys).toHaveLength(9);
  expect([...result.policy_keys].sort()).toEqual(selected);
  expect(result.policy_keys).toContain('policy-data-classification-handling-policy');
  expect(result.policy_keys).not.toContain(retentionKey);
  expect(target(db, 'policies').map(row => row.baseline_key).sort()).toEqual(selected);
  expect(result.baseline.selected_policy_keys).toEqual(result.policy_keys);
  expect(cis).toEqual(catalogBefore);
  for (const policy of target(db, 'policies')) {
    expect(policy).toMatchObject({policy_id:CID+'_'+policy.baseline_key, presence:'reported_missing',
      status:'needs_creation', baseline_response:'no', is_client_reported:true});
    for (const field of ['approved_at','approval_subject','approval_history','decision_history','versions','approved_version_id'])
      expect(policy[field]).toBeUndefined();
  }
  for (const row of target(db, 'requirements')) {
    const response = row.baseline_key === 'cis-ig1' ? 'applies' : 'does_not_apply';
    expect(row.baseline_response).toBe(response);
    expect(row.applicability).toBe(response === 'applies' ? 'applicable' : 'not_applicable');
  }
  for (const kind of ['findings','tasks','evidence','risks','vendors','ai_systems','assets','organizational_controls','exceptions','assessments'])
    expect(target(db, kind)).toEqual([]);
});

test('native unscheduled parents retain the selected IG3 duty cadences without duplicate annual supplier work', () => {
  const db = fixture(), result = establishKrustyBaseline(db, {dates:cisDemoFixtureDates(CLOCK)});
  const reviews = target(db, 'reviews'), selection = krustyOnboardingSelection();
  expect(Object.fromEntries(reviews.map(row => [row.framework_plan_key,row.recurrence]))).toEqual(EXPECTED_PLANS);
  expect(new Set(reviews.map(row => row.framework_plan_key)).size).toBe(reviews.length);
  expect(result.plans).toEqual(selection.plans);
  expect(reviews.find(row => row.framework_plan_key === 'passive-discovery-reconciliation').custom_recurrence_days).toBe(7);
  expect(reviews.find(row => row.framework_plan_key === 'penetration-testing').title).toBe('Penetration Testing Program Review');
  for (const [key, safeguard] of [['script-allowlist-reassessment','2.7'],['event-alert-tuning','13.11'],['internal-penetration-test','18.5']]) {
    const driver = reviewDrivers(reviews.find(row => row.framework_plan_key === key)).find(row => row.framework_plan_key === key);
    expect(driver.framework_cadence_references).toEqual(expect.arrayContaining([
      expect.objectContaining({definition_id:safeguard,interval:EXPECTED_PLANS[key]})
    ]));
  }
  expect(reviews.some(row => row.framework_plan_key === 'provider-assessment')).toBe(false);
  expect(result.baseline.framework_reviews['provider-assessment'].enabled).toBe(false);
  const selectedKeys = new Set(result.plans.map(plan => plan.key));
  for (const plan of activePlans('cis-ig1', {implementation_group:3}))
    expect(result.baseline.framework_reviews[plan.key].enabled).toBe(selectedKeys.has(plan.key));
  const reviewIds = new Set(reviews.map(row => row.review_id));
  const scope = new Set(activeDefinitions('cis-ig1', {implementation_group:3}).map(row => row.id));
  for (const review of reviews) {
    expect(review).toMatchObject({review_id:CID+'_canonical_review_'+review.framework_plan_key,
      current_occurrence_id:'occ_'+review.review_id, framework_key:'cis-ig1', status:'needs_scheduling',
      due_date:null, next_review_date:null, schedule_anchor:null, owner_id:null});
    expect(review.occurrences || []).toEqual([]); expect(review.completed_at).toBeUndefined();
    expect(review.framework_safeguards.every(id => scope.has(id))).toBe(true);
  }
  expect(target(db, 'framework_assessments').every(row => row.related_links.every(link =>
    link.kind !== 'reviews' || reviewIds.has(link.id)))).toBe(true);
});

test.each([
  ['2026-11-04T12:00:00.000Z',ORIGIN,ORGANIZATION_ORIGIN],
  ['2024-07-01T12:00:00.000Z',ORIGIN,'2019-07-01T00:00:00.000Z'],
  ['2031-11-04T12:00:00.000Z','2026-11-04T00:00:00.000Z','2026-11-04T00:00:00.000Z']
])('v8.1 records and initialization events respect the declared enrollment floor at %s', (clock, origin, organizationOrigin) => {
  const db = fixture(), result = establishKrustyBaseline(db, {dates:cisDemoFixtureDates(new Date(clock))});
  expect(result.origin).toBe(origin); expect(result.organization_origin).toBe(organizationOrigin);
  for (const kind of ['policies','requirements','reviews','framework_assessments'])
    expect(target(db, kind).every(row => row.created_at === origin && row.updated_at === origin)).toBe(true);
  expect(target(db, 'logs').every(row => row.at === origin && row.meta.simulated)).toBe(true);
  expect(db.clients[0].initial_program_baseline.completed_at).toBe(origin);
  expect(db.clients[0].initial_program_baseline.state.updated_at).toBe(origin);
});

test('explicit reconstruction is deterministic and removes retained target conclusions without altering a foreign audit alias or bytes', () => {
  const db = fixture(), dates = cisDemoFixtureDates(CLOCK);
  db.logs.push({client_id:'visitor_demo',log_id:'retained-log',at:'2020-01-01T00:00:00.000Z',meta:{original:true}});
  db.evidence.push({client_id:'visitor_demo',evidence_id:'retained-book',content_base64:'b3JpZ2luYWwgYnl0ZXM='});
  const foreign = copy(outside(db));
  establishKrustyBaseline(db, {dates}); const first = copy(db);
  establishKrustyBaseline(db, {dates});
  expect(db).toEqual(first); expect(outside(db)).toEqual(foreign);
  expect(new Set(db.logs.map(row => row.audit_id || row.log_id)).size).toBe(db.logs.length);
  const knownEntities = new Set([CID,...['policies','requirements','reviews'].flatMap(kind =>
    target(db, kind).map(row => row[ids[kind]]))]);
  expect(target(db, 'logs').every(row => knownEntities.has(row.entity_id))).toBe(true);
});

test.each(['read-only','foreign-actor','standard-actor','missing-client','duplicate-client','non-demo-client',
  'foreign-policy-id','foreign-requirement-id','foreign-review-id','foreign-assessment-id','foreign-audit-id','foreign-legacy-log-id'])
('%s rejects atomically without replacing any target or unrelated records', condition => {
  const db = fixture();
  if (condition === 'read-only') db.user.role = 'client_readonly';
  if (condition === 'foreign-actor') Object.assign(db.user, {role:'client_contributor', client_ids:['other']});
  if (condition === 'standard-actor') db.user.workspace_mode = 'standard';
  if (condition === 'missing-client') db.clients = [];
  if (condition === 'duplicate-client') db.clients.push(copy(db.clients[0]));
  if (condition === 'non-demo-client') db.clients[0].environment = 'Production';
  if (condition === 'foreign-policy-id') db.policies.push({client_id:'other', policy_id:CID+'_policy-information-security-policy'});
  if (condition === 'foreign-requirement-id') db.requirements.push({client_id:'other', requirement_id:CID+'_soc-2'});
  if (condition === 'foreign-review-id') db.reviews.push({client_id:'other', review_id:CID+'_canonical_review_internal-penetration-test'});
  if (condition === 'foreign-assessment-id') db.framework_assessments.push({client_id:'other', framework_assessment_id:'fw_'+CID+'_assessment_18.5'});
  if (condition === 'foreign-audit-id') db.logs.push({client_id:'other', audit_id:CID+'_canonical_onboarding_0'});
  if (condition === 'foreign-legacy-log-id') db.logs.push({client_id:'other', log_id:CID+'_canonical_onboarding_0'});
  const before = copy(db);
  expect(() => establishKrustyBaseline(db, {dates:cisDemoFixtureDates(CLOCK)})).toThrow();
  expect(db).toEqual(before);
});

test.each(['missing','invalid-anchor','invalid-origin','future-origin','before-release','before-enrollment'])
('%s dates reject atomically instead of backdating or placing the baseline in the future', condition => {
  const db = fixture(); let dates = cisDemoFixtureDates(CLOCK);
  if (condition === 'missing') dates = undefined;
  if (condition === 'invalid-anchor') dates = {...dates,anchor:'not-a-date'};
  if (condition === 'invalid-origin') dates = {...dates,month:() => '2021-02-30'};
  if (condition === 'future-origin') dates = {...dates,month:() => '2027-01-01'};
  if (condition === 'before-release') dates = cisDemoFixtureDates(new Date('2024-06-23T12:00:00.000Z'));
  if (condition === 'before-enrollment') dates = cisDemoFixtureDates(new Date('2024-06-30T12:00:00.000Z'));
  const before = copy(db);
  expect(() => establishKrustyBaseline(db, {dates})).toThrow(/Krusty.*date|Krusty.*origin/);
  expect(db).toEqual(before);
});
