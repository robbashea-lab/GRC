import {ids} from './store';
import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {establishBrawndoBaseline} from './cisCanonicalBrawndoBaseline';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';

const CID = 'demo_brawndo';
const CLOCK = new Date('2026-11-02T12:00:00.000Z');
const copy = value => JSON.parse(JSON.stringify(value));
const outside = db => Object.fromEntries(Object.entries(db).filter(([,value]) => Array.isArray(value))
  .map(([key,value]) => [key,value.filter(row => row.client_id !== CID)]));

beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => jest.useRealTimers());

test('source initialization uses native enrollment and stable initial identities without altering any other client or account', () => {
  const db = preExpansionCisFixture(CLOCK), others = copy(outside(db)), users = copy(db.users), actor = copy(db.user);
  const dates = cisDemoFixtureDates(CLOCK), result = establishBrawndoBaseline(db, {dates});
  expect(result.baseline).toMatchObject({completed:true, version:3, selected_policy_keys:result.policy_keys});
  expect(result.policy_keys).toHaveLength(9);
  expect(db.framework_assessments.filter(row => row.client_id === CID)).toHaveLength(56);
  expect(db.policies.filter(row => row.client_id === CID)).toHaveLength(9);
  expect(db.reviews.filter(row => row.client_id === CID)).toHaveLength(11);
  expect(db.framework_assessments.filter(row => row.client_id === CID).every(row => row.status === 'not_assessed')).toBe(true);
  for (const kind of ['policies','requirements','reviews','framework_assessments']) {
    const rows = db[kind].filter(row => row.client_id === CID);
    expect(rows.every(row => row.created_at === result.origin && row.updated_at === result.origin)).toBe(true);
  }
  expect(db.policies.filter(row => row.client_id === CID).map(row => row.policy_id).sort())
    .toEqual(result.policy_keys.map(key => CID+'_'+key).sort());
  expect(db.framework_assessments.filter(row => row.client_id === CID).every(row =>
    row.framework_assessment_id === 'fw_'+CID+'_assessment_'+row.definition_id)).toBe(true);
  expect(db.reviews.filter(row => row.client_id === CID).every(row =>
    row.review_id === CID+'_canonical_review_'+row.framework_plan_key)).toBe(true);
  const reviewIds = new Set(db.reviews.filter(row => row.client_id === CID).map(row => row.review_id));
  expect(db.framework_assessments.filter(row => row.client_id === CID).every(row =>
    row.related_links.every(link => link.kind !== 'reviews' || reviewIds.has(link.id)))).toBe(true);
  expect(outside(db)).toEqual(others);
  expect(db.users).toEqual(users);
  expect(db.user).toEqual(actor);
});

test.each(['read-only','foreign-policy-id','foreign-review-id','foreign-assessment-id'])('%s fails without resetting the existing target or touching another client', condition => {
  const actor = {user_id:'demo_admin', role:'super_admin', workspace_mode:'demo', status:'active', client_ids:[CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])), user:actor, users:[actor], logs:[], baselines:{},
    clients:[{client_id:CID, name:'Brawndo', environment:'Demo', status:'active'}],
    risks:[{risk_id:'retained_target', client_id:CID, title:'Keep until replacement succeeds'}]};
  if (condition === 'read-only') actor.role = 'client_readonly';
  if (condition === 'foreign-policy-id') db.policies.push({client_id:'other', policy_id:CID+'_policy-information-security-policy'});
  if (condition === 'foreign-review-id') db.reviews.push({client_id:'other', review_id:CID+'_canonical_review_asset-inventory'});
  if (condition === 'foreign-assessment-id') db.framework_assessments.push({client_id:'other',framework_assessment_id:'fw_'+CID+'_assessment_1.1'});
  const before = copy(db);
  expect(() => establishBrawndoBaseline(db, {dates:cisDemoFixtureDates(CLOCK)})).toThrow();
  expect(db).toEqual(before);
});
