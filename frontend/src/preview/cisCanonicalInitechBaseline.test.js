import catalog from '@catalogs/onboardingCatalog.json';
import {cis, activeDefinitions} from '../lib/frameworks';
import {ids} from './store';
import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {establishInitechBaseline} from './cisCanonicalInitechBaseline';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';

const CID = 'demo_initech';
const CLOCK = new Date('2026-11-02T12:00:00.000Z');
const ORIGIN = '2024-11-02T00:00:00.000Z';
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
  'incident-governance':'annual', 'secure-development':'monthly', 'penetration-testing':'annual'
};

function fixture() {
  const actor = {user_id:'demo_admin', name:'Synthetic coordinator', role:'super_admin',
    workspace_mode:'demo', status:'active', client_ids:[CID]};
  return {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])), user:actor, users:[actor], logs:[],
    baselines:{}, clients:[{client_id:CID, name:'Initech', environment:'Demo', status:'active',
      logo_url:'/retained-initech.svg', primary_contact_id:'retained_contact', assigned_owner_id:actor.user_id}],
    contacts:[{contact_id:'retained_contact', client_id:CID, name:'Peter Gibbons'}],
    risks:[{risk_id:'retained_target', client_id:CID, title:'Keep until replacement succeeds'}]};
}

beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => jest.useRealTimers());

test('native onboarding creates the cumulative 130-safeguard IG2 baseline while preserving client identity and unrelated data', () => {
  const db = preExpansionCisFixture(CLOCK), before = copy(db), others = copy(outside(db));
  const result = establishInitechBaseline(db, {dates:cisDemoFixtureDates(CLOCK)});
  const client = db.clients.find(row => row.client_id === CID);
  expect(result.origin).toBe(ORIGIN);
  expect(result.baseline).toMatchObject({version:3, completed:true, step:3, updated_at:ORIGIN,
    framework_settings:{'cis-ig1':{implementation_group:2}}, reviews:[]});
  expect(client.framework_settings['cis-ig1']).toEqual({implementation_group:2});
  const otherSettings = settings => Object.fromEntries(Object.entries(settings || {}).filter(([key]) => key !== 'cis-ig1'));
  expect(otherSettings(client.framework_settings))
    .toEqual(otherSettings(before.clients.find(row => row.client_id === CID).framework_settings));
  expect(identity(client)).toEqual(identity(before.clients.find(row => row.client_id === CID)));
  expect(db.clients.map(row => row.client_id)).toEqual(before.clients.map(row => row.client_id));
  expect(db.contacts).toEqual(before.contacts);
  expect(db.users).toEqual(before.users);
  expect(db.user).toEqual(before.user);
  expect(outside(db)).toEqual(others);
  for (const [key, value] of Object.entries(before.baselines).filter(([key]) => key !== CID))
    expect(db.baselines[key]).toEqual(value);
  expect(client.onboarding_baseline).toEqual({version:3, step:0, completed:false, updated_at:null,
    policies:{}, selected_policy_keys:[], requirements:{}, reviews:[], framework_reviews:{},
    framework_settings:{'cis-ig1':{implementation_group:2}}});
  expect(client.initial_program_baseline).toMatchObject({completed_at:ORIGIN, completed_by:db.user.user_id,
    primary_contact_id:client.primary_contact_id ?? null, assigned_owner_id:client.assigned_owner_id ?? null,
    policies:9, reviews:13, state:result.baseline});

  const assessments = target(db, 'framework_assessments');
  const expectedIds = activeDefinitions('cis-ig1', {implementation_group:2}).map(row => row.id);
  expect(assessments).toHaveLength(130);
  expect(assessments.map(row => row.definition_id).sort()).toEqual(expectedIds.sort());
  expect(new Set(assessments.map(row => row.framework_assessment_id)).size).toBe(130);
  expect(assessments.some(row => ['6.8','15.5'].includes(row.definition_id))).toBe(false);
  for (const row of assessments) {
    expect(row).toMatchObject({framework_key:'cis-ig1', framework_version:'8.1', status:'not_assessed',
      framework_assessment_id:'fw_'+CID+'_assessment_'+row.definition_id,
      implementation:'', technology:'', notes:'', assessment_history:[], owner_id:null, process_owner_id:null});
    expect(row.last_assessed).toBeUndefined();
    expect(row.verification).toBeUndefined();
  }
  for (const row of target(db, 'requirements')) {
    const response = row.baseline_key === 'cis-ig1' ? 'applies' : 'does_not_apply';
    expect(row.baseline_response).toBe(response);
    expect(row.applicability).toBe(response === 'applies' ? 'applicable' : 'not_applicable');
  }
  for (const kind of ['policies','requirements','reviews','framework_assessments'])
    expect(target(db, kind).every(row => row.created_at === ORIGIN && row.updated_at === ORIGIN)).toBe(true);
});

test('nine source-mapped document containers consolidate retention/disposal without optional GRC templates or fabricated approvals', () => {
  const db = fixture(), result = establishInitechBaseline(db, {dates:cisDemoFixtureDates(CLOCK)});
  const scope = new Set(activeDefinitions('cis-ig1', {implementation_group:2}).map(row => row.id));
  const mappedPolicies = catalog.policies.filter(policy => cis.policy_mappings.some(mapping =>
    mapping.policy_key === policy.key && mapping.safeguards.some(id => scope.has(id)))).map(row => row.key);
  const retentionKey = 'policy-data-retention-secure-disposal-policy';
  const selected = mappedPolicies.filter(key => key !== retentionKey).sort();
  expect(mappedPolicies).toHaveLength(10);
  expect(mappedPolicies).toContain(retentionKey);
  expect(cis.policy_mappings.filter(mapping => mapping.policy_key === retentionKey)
    .flatMap(mapping => mapping.safeguards).filter(id => scope.has(id))).toEqual(expect.arrayContaining(['3.4','3.5']));
  expect(result.policy_keys).toHaveLength(9);
  expect([...result.policy_keys].sort()).toEqual(selected);
  expect(result.policy_keys).toContain('policy-data-classification-handling-policy');
  expect(result.policy_keys).not.toContain(retentionKey);
  expect(target(db, 'policies').map(row => row.baseline_key).sort()).toEqual(selected);
  expect(result.baseline.selected_policy_keys).toEqual(result.policy_keys);
  for (const policy of target(db, 'policies')) {
    expect(policy).toMatchObject({policy_id:CID+'_'+policy.baseline_key, presence:'reported_missing',
      status:'needs_creation', baseline_response:'no', is_client_reported:true});
    expect(policy.approved_at).toBeUndefined();
    expect(policy.approved_version_id).toBeUndefined();
    expect(policy.versions).toBeUndefined();
  }
  const reviews = target(db, 'reviews');
  expect(reviews).toHaveLength(13);
  expect(Object.fromEntries(reviews.map(row => [row.framework_plan_key,row.recurrence]))).toEqual(EXPECTED_PLANS);
  const reviewIds = new Set(reviews.map(row => row.review_id));
  for (const review of reviews) {
    expect(review).toMatchObject({review_id:CID+'_canonical_review_'+review.framework_plan_key,
      current_occurrence_id:'occ_'+review.review_id, framework_key:'cis-ig1', status:'needs_scheduling',
      due_date:null, next_review_date:null, schedule_anchor:null, owner_id:null});
    expect(review.occurrences || []).toEqual([]);
    expect(review.completed_at).toBeUndefined();
    expect(review.framework_safeguards.every(id => scope.has(id))).toBe(true);
  }
  expect(target(db, 'framework_assessments').every(row => row.related_links.every(link =>
    link.kind !== 'reviews' || reviewIds.has(link.id)))).toBe(true);
  expect(target(db, 'findings')).toEqual([]);
  expect(target(db, 'tasks')).toEqual([]);
  expect(target(db, 'evidence')).toEqual([]);
});

test('explicit reconstruction is deterministic and does not carry retained conclusions into the blank baseline', () => {
  const db = fixture(), dates = cisDemoFixtureDates(CLOCK);
  establishInitechBaseline(db, {dates});
  const first = copy(db);
  establishInitechBaseline(db, {dates});
  expect(db).toEqual(first);
  expect(new Set(db.logs.map(row => row.audit_id)).size).toBe(db.logs.length);
  expect(db.logs.every(row => row.at === ORIGIN && row.client_id === CID && row.meta.simulated)).toBe(true);
  const knownEntities = new Set([CID,...['policies','requirements','reviews'].flatMap(kind =>
    target(db, kind).map(row => row[ids[kind]]))]);
  expect(db.logs.every(row => knownEntities.has(row.entity_id))).toBe(true);
});

test.each(['read-only','foreign-actor','standard-actor','foreign-policy-id','foreign-requirement-id',
  'foreign-review-id','foreign-assessment-id','foreign-audit-id','foreign-legacy-log-id'])
('%s rejects atomically without replacing any target or unrelated records', condition => {
  const db = fixture();
  if (condition === 'read-only') db.user.role = 'client_readonly';
  if (condition === 'foreign-actor') Object.assign(db.user, {role:'client_contributor', client_ids:['other']});
  if (condition === 'standard-actor') db.user.workspace_mode = 'standard';
  if (condition === 'foreign-policy-id') db.policies.push({client_id:'other', policy_id:CID+'_policy-information-security-policy'});
  if (condition === 'foreign-requirement-id') db.requirements.push({client_id:'other', requirement_id:CID+'_soc-2'});
  if (condition === 'foreign-review-id') db.reviews.push({client_id:'other', review_id:CID+'_canonical_review_secure-development'});
  if (condition === 'foreign-assessment-id') db.framework_assessments.push({client_id:'other', framework_assessment_id:'fw_'+CID+'_assessment_16.4'});
  if (condition === 'foreign-audit-id') db.logs.push({client_id:'other', audit_id:CID+'_canonical_onboarding_0'});
  if (condition === 'foreign-legacy-log-id') db.logs.push({client_id:'other', log_id:CID+'_canonical_onboarding_0'});
  const before = copy(db);
  expect(() => establishInitechBaseline(db, {dates:cisDemoFixtureDates(CLOCK)})).toThrow();
  expect(db).toEqual(before);
});
