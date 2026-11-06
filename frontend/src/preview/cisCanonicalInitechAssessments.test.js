import {activeDefinitions} from '../lib/frameworks';
import {catalogForVersion, generateResult, validateGuidedCompletion, visibleQuestions} from '../lib/guidedAssessment';
import {generatedItems} from './assessmentItems';
import {ids} from './store';
import {establishInitechBaseline} from './cisCanonicalInitechBaseline';
import {populateInitechAssessments} from './cisCanonicalInitechAssessments';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import * as contentModule from './cisCanonicalInitechContent';

const CID = 'demo_initech', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const dates = cisDemoFixtureDates(CLOCK), copy = value => JSON.parse(JSON.stringify(value));
const names = ['Peter Gibbons','Bill Lumbergh','Michael Bolton','Samir Nagheenanajar','Tom Smykowski','Milton Waddams','Nina'];
function fixture() {
  const actor = {user_id:'demo_admin', name:'Synthetic coordinator', workspace_mode:'demo',
    role:'super_admin', status:'active', client_ids:[CID,'other']};
  const owner = {user_id:'demo_provider_lead', name:'Morgan Ellis', workspace_mode:'demo',
    role:'platform_admin', status:'active', client_ids:[CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])), user:actor, users:[actor,owner],
    logs:[], baselines:{}, drafts:{}, clients:[{client_id:CID, name:'Initech', environment:'Demo', status:'active',
      logo:'retained-initech', primary_contact_id:CID+'_contact_0', assigned_owner_id:owner.user_id},
    {client_id:'other', name:'Retained client', environment:'Demo', status:'active'}],
    contacts:names.map((name, index) => ({contact_id:CID+'_contact_'+index, client_id:CID, name, status:'active'}))};
  establishInitechBaseline(db, {dates});
  return db;
}
const populate = db => populateInitechAssessments(db, {dates, owner:'demo_provider_lead'});
const criterionAnswer = (draft, id, criterionId) => {
  const question = catalogForVersion(draft.version).safeguards[id].find(row => row.criterion_ids?.includes(criterionId));
  return draft.answers[question.id][question.rows[question.criterion_ids.indexOf(criterionId)]];
};

beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => {jest.restoreAllMocks(); jest.useRealTimers();});

test('128 complete interviews derive the actual native profile while preserving all 130 identities and initial creation metadata', () => {
  const db = fixture(), before = copy(db), result = populate(db);
  expect(before.policies.filter(row => row.client_id === CID)).toHaveLength(9);
  expect(before.policies.some(row => row.client_id === CID
    && row.baseline_key === 'policy-data-retention-secure-disposal-policy')).toBe(false);
  expect(before.reviews.filter(row => row.client_id === CID)).toHaveLength(13);
  expect(result.counts).toEqual({addressed:120, in_progress:7, needs_attention:1, not_assessed:2});
  expect(result.assessments.map(row => row.definition_id))
    .toEqual(activeDefinitions('cis-ig1', {implementation_group:2}).map(row => row.id));
  expect(Object.keys(result.drafts)).toHaveLength(128);
  for (const row of result.assessments) {
    const original = before.framework_assessments.find(item => item.framework_assessment_id === row.framework_assessment_id);
    expect(original).toBeDefined();
    expect(row.created_at).toBe(original.created_at);
    expect(row.created_by).toBe(original.created_by);
    expect(row.related_links).toEqual(original.related_links);
    expect(row.assessment_history).toEqual([]);
    if (row.status === 'not_assessed') continue;
    const draft = db.guided_assessment_pilot[row.framework_assessment_id+':demo_provider_lead'];
    expect(draft).toMatchObject({completed:true, revision:1, client_id:CID,
      assessment_id:row.framework_assessment_id, user_id:'demo_provider_lead'});
    expect(() => validateGuidedCompletion(row.definition_id, draft.answers, draft.version)).not.toThrow();
    const [year, month, day] = row.last_assessed.slice(0,10).split('-').map(Number);
    expect(generateResult(row.definition_id, draft.answers, new Date(year, month-1, day, 12), draft.version).status).toBe(row.status);
    const visible = visibleQuestions(row.definition_id, draft.answers, draft.version);
    expect(visible.every(question => !question.critical || draft.answers[question.id] !== undefined)).toBe(true);
    expect(Object.keys(draft.answers).every(key => visible.some(question => key === question.id || key === question.id+'_detail'))).toBe(true);
    expect(row.guided_assessment_source.answers).toEqual(draft.answers);
    expect(row.guided_assessment_source.provenance).toMatch(/not a browser save/);
    expect(row.last_assessed > result.origin && row.last_assessed <= result.anchor).toBe(true);
    expect(row.verification).toBe(row.status === 'addressed' ? 'needs_validation' : 'gap_identified');
    expect(row.verification_checklist).toBeNull();
    const expectedItems = generatedItems(row, draft);
    expect(row.items_to_address.map(item => item.item_id)).toEqual(expectedItems.map(item => item.item_id));
    expect(row.items_to_address.every(item => item.state === 'open' && item.finding_id === null)).toBe(true);
  }
  for (const key of Object.keys(before).filter(key => !['framework_assessments','guided_assessment_pilot'].includes(key)))
    expect(db[key]).toEqual(before[key]);
});

test('partial DMARC keeps SPF/DKIM and partial provider contracts keep the completed annual gap review', () => {
  const db = fixture(), {assessments} = populate(db);
  for (const id of ['9.5','15.4']) {
    const row = assessments.find(item => item.definition_id === id);
    const draft = db.guided_assessment_pilot[row.framework_assessment_id+':demo_provider_lead'];
    expect(row.status).toBe('in_progress');
    expect(draft.answers.practice).toBe('Partially');
    expect(draft.result.gaps.length).toBeGreaterThan(0);
    expect(row.items_to_address.some(item => item.kind === 'gap')).toBe(true);
    if (id === '9.5') {
      expect(criterionAnswer(draft, id, '9.5-c7')).toBe('No');
      expect(criterionAnswer(draft, id, '9.5-c8')).toBe('No');
      expect(criterionAnswer(draft, id, '9.5-c5')).toBe('Yes');
      expect(criterionAnswer(draft, id, '9.5-c6')).toBe('Yes');
      expect(row.implementation).toMatch(/SPF and DKIM are configured/);
    } else {
      expect(criterionAnswer(draft, id, '15.4-c4')).toBe('No');
      expect(criterionAnswer(draft, id, '15.4-c5')).toBe('No');
      expect(criterionAnswer(draft, id, '15.4-c3')).toBe('Yes');
      expect(row.implementation).toMatch(/annual contract gap review has identified/);
    }
  }
  const absent = assessments.find(row => row.definition_id === '3.9');
  expect(absent.status).toBe('needs_attention');
  const draft = db.guided_assessment_pilot[absent.framework_assessment_id+':demo_provider_lead'];
  expect(criterionAnswer(draft, '3.9', '3.9-c3')).toBe('No');
});

test.each(['11.5','13.3'])('unassessed %s has an assessment plan without an interview, conclusion, judgment date or verification', id => {
  const db = fixture(), {assessments} = populate(db), row = assessments.find(item => item.definition_id === id);
  expect(row).toMatchObject({status:'not_assessed', last_assessed:null, last_saved:null, assessed_by:null,
    verification:null, verification_checklist:null, items_to_address:[], items_revision:0, assessment_history:[]});
  expect(row.guided_assessment_source).toBeUndefined();
  expect(db.guided_assessment_pilot[row.framework_assessment_id+':demo_provider_lead']).toBeUndefined();
  expect(row.implementation).toMatch(/not assessed/);
  expect(row.notes).toMatch(/Assessment plan:/);
  expect(row.owner_id).toBe('demo_provider_lead');
  expect(db.contacts.find(contact => contact.contact_id === row.process_owner_id).name)
    .toBe(id === '11.5' ? 'Peter Gibbons' : 'Michael Bolton');
});

test('existing other-client assessments and interviews survive; explicit source construction is deterministic', () => {
  const first = fixture(), second = copy(first);
  for (const db of [first,second]) {
    db.framework_assessments.push({framework_assessment_id:'retained-other', client_id:'other', notes:'Visitor work'});
    db.guided_assessment_pilot = {foreign:{client_id:'other', answers:{retained:'Untouched'}}};
  }
  const before = copy(first), a = populate(first), b = populate(second);
  expect(a).toEqual(b);
  expect(first).toEqual(second);
  expect(first.framework_assessments.find(row => row.client_id === 'other')).toEqual(before.framework_assessments.find(row => row.client_id === 'other'));
  expect(first.guided_assessment_pilot.foreign).toEqual(before.guided_assessment_pilot.foreign);
  const populated = copy(first);
  expect(() => populate(first)).toThrow('untouched');
  expect(first).toEqual(populated);
});

test.each([
  ['read-only actor', db => {db.user.role = 'client_readonly';}],
  ['foreign actor', db => {Object.assign(db.user, {role:'client_contributor', client_ids:['other']});}],
  ['standard actor', db => {db.user.workspace_mode = 'standard';}],
  ['unselected program', db => {db.baselines[CID].completed = false;}],
  ['wrong IG', db => {db.clients[0].framework_settings['cis-ig1'].implementation_group = 3;}],
  ['ineligible owner', db => {db.users[1].status = 'disabled';}],
  ['foreign process Contact', db => {db.contacts.find(row => row.name === 'Milton Waddams').client_id = 'other';}],
  ['retained narrative', db => {db.framework_assessments[0].notes = 'Visitor assessment';}],
  ['retained verification', db => {db.framework_assessments[0].verification = 'verified';}],
  ['retained item', db => {db.framework_assessments[0].items_to_address = [{item_id:'retained'}];}],
  ['retained history', db => {db.framework_assessments[0].assessment_history = [{at:dates.anchor}];}],
  ['retained draft', db => {db.guided_assessment_pilot = {[db.framework_assessments[0].framework_assessment_id+':other']:{answers:{}}};}],
  ['retained archived draft', db => {db.guided_assessment_history = {retained:{client_id:CID}};}],
  ['retained source draft', db => {db.drafts[CID] = {notes:'Visitor work'};}],
  ['retained Review schedule', db => {db.reviews[0].due_date = dates.day(1);}],
  ['retained document edit', db => {db.policies[0].summary = 'Visitor policy';}],
  ['unconsolidated source documents', db => {db.policies.push({...db.policies[0],
    policy_id:CID+'_policy-data-retention-secure-disposal-policy',
    baseline_key:'policy-data-retention-secure-disposal-policy'});}],
  ['foreign identity collision', db => {db.framework_assessments.push({...db.framework_assessments[0], client_id:'other'});}]
])('%s rejects without any partial source import', (_label, change) => {
  const db = fixture(); change(db); const before = copy(db);
  expect(() => populate(db)).toThrow('Initech assessments:');
  expect(db).toEqual(before);
});

test('invalid native interview text is rejected after staging without committing earlier assessments', () => {
  const db = fixture(), before = copy(db), original = contentModule.initechSafeguardContent;
  jest.spyOn(contentModule, 'initechSafeguardContent').mockImplementation((id, status) =>
    id === '18.3' ? {...original(id, status), technology_process:'x'.repeat(2001)} : original(id, status));
  expect(() => populate(db)).toThrow('Invalid answer text');
  expect(db).toEqual(before);
});
