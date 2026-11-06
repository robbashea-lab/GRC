import {activeDefinitions} from '../lib/frameworks';
import * as guided from '../lib/guidedAssessment';
import {generatedItems} from './assessmentItems';
import {ids} from './store';
import {establishKrustyBaseline} from './cisCanonicalKrustyBaseline';
import {populateKrustyAssessments} from './cisCanonicalKrustyAssessments';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import * as contentModule from './cisCanonicalKrustyContent';

const CID = 'demo_krusty_krab', CLOCK = new Date('2026-11-04T12:00:00.000Z');
const dates = cisDemoFixtureDates(CLOCK), copy = value => JSON.parse(JSON.stringify(value));
const names = ['Eugene Krabs','Squidward Tentacles','SpongeBob SquarePants'];
function fixture(clock = CLOCK) {
  const actor = {user_id:'demo_admin', name:'Synthetic coordinator', workspace_mode:'demo',
    role:'super_admin', status:'active', client_ids:[CID,'other']};
  const owner = {user_id:'demo_provider_lead', name:'Morgan Ellis', workspace_mode:'demo',
    role:'platform_admin', status:'active', client_ids:[CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])), user:actor, users:[actor,owner],
    logs:[], baselines:{}, drafts:{}, clients:[{client_id:CID, name:'The Krusty Krab', environment:'Demo', status:'active',
      logo_url:'/retained-krusty.svg', portfolio_order:3, primary_contact_id:CID+'_contact_0', assigned_owner_id:owner.user_id},
    {client_id:'other', name:'Retained client', environment:'Demo', status:'active'}],
    contacts:names.map((name, index) => ({contact_id:CID+'_contact_'+index, client_id:CID, name, status:'active'}))};
  establishKrustyBaseline(db, {dates:cisDemoFixtureDates(clock)});
  return db;
}
const populate = db => populateKrustyAssessments(db, {dates, owner:'demo_provider_lead'});
const draftFor = (db, id) => db.guided_assessment_pilot['fw_'+CID+'_assessment_'+id+':demo_provider_lead'];
const criterionAnswer = (draft, id, criterionId) => {
  const question = guided.catalogForVersion(draft.version).safeguards[id].find(row => row.criterion_ids?.includes(criterionId));
  return draft.answers[question.id][question.rows[question.criterion_ids.indexOf(criterionId)]];
};

beforeEach(() => jest.useFakeTimers().setSystemTime(CLOCK));
afterEach(() => {jest.restoreAllMocks(); jest.useRealTimers();});

test('153 completed native interviews derive an implemented current state without inventing verified decisions or history', () => {
  const db = fixture(), before = copy(db), result = populate(db);
  expect(result.counts).toEqual({addressed:153, in_progress:0, needs_attention:0, not_assessed:0});
  expect(result.assessments.map(row => row.definition_id))
    .toEqual(activeDefinitions('cis-ig1', {implementation_group:3}).map(row => row.id));
  expect(Object.keys(result.drafts)).toHaveLength(153);
  expect(db.guided_assessment_pilot).toEqual(result.drafts);
  expect(result.origin).toBe('2024-07-01T00:00:00.000Z');
  expect(result.organization_origin).toBe('2021-11-04T00:00:00.000Z');
  expect(result.anchor).toBe(dates.anchor);
  for (const row of result.assessments) {
    const original = before.framework_assessments.find(item => item.framework_assessment_id === row.framework_assessment_id);
    const draft = draftFor(db, row.definition_id);
    expect(original).toBeDefined();
    expect(row.created_at).toBe(original.created_at);
    expect(row.created_by).toBe(original.created_by);
    expect(row.related_links).toEqual(original.related_links);
    expect(row.assessment_history).toEqual([]);
    expect(row.fixture_history_origin_at).toBe(result.origin);
    expect(row).toMatchObject({framework_key:'cis-ig1', framework_version:'8.1', owner_id:'demo_provider_lead',
      last_assessed:dates.instant(-2), last_saved:dates.instant(-2), updated_at:dates.instant(-2),
      assessed_by:'demo_provider_lead', verification:'needs_validation', verification_checklist:null,
      items_to_address:[], items_revision:0});
    expect(row.assessment_recorded_at).toBeUndefined();
    expect(row.verified_at).toBeUndefined();
    expect(draft).toMatchObject({completed:true, revision:1, client_id:CID,
      assessment_id:row.framework_assessment_id, user_id:'demo_provider_lead',
      updated_at:dates.instant(-2), generated_at:dates.instant(-2),
      result:{status:'addressed',gaps:[],unknowns:[],signals:[]}});
    expect(() => guided.validateGuidedCompletion(row.definition_id, draft.answers, draft.version)).not.toThrow();
    const [year, month, day] = row.last_assessed.slice(0,10).split('-').map(Number);
    const native = guided.generateResult(row.definition_id, draft.answers, new Date(year, month-1, day, 12), draft.version);
    expect(native).toMatchObject({status:'addressed',gaps:[],unknowns:[],signals:[]});
    const visible = guided.visibleQuestions(row.definition_id, draft.answers, draft.version);
    expect(draft.step).toBe(visible.length);
    expect(visible.every(question => !question.critical || draft.answers[question.id] !== undefined)).toBe(true);
    for (const question of visible.filter(question => question.critical && question.type === 'matrix'))
      expect(question.rows.every(key => draft.answers[question.id][key] === 'Yes')).toBe(true);
    expect(Object.keys(draft.answers).every(key => visible.some(question => key === question.id || key === question.id+'_detail'))).toBe(true);
    expect(draft.answers.additional_gap).toBe('No');
    expect(draft.answers.additional_confirmation).toBe('No');
    expect(draft.answers.gaps).toBeUndefined();
    expect(draft.answers.unknowns).toBeUndefined();
    expect(draft.answers.scope_reason).toBeUndefined();
    expect(draft.fixture_provenance).toMatch(/Explicit fictional Krusty Demo assessment import; not a browser save, evidence validation or certification/);
    expect(row.guided_assessment_source).toEqual({origin:'fictional-demo-fixture',version:draft.version,revision:1,
      generated_at:dates.instant(-2),by:'demo_provider_lead',answers:draft.answers,provenance:draft.fixture_provenance});
    expect(row.guided_assessment_source.answers).not.toBe(draft.answers);
    expect(generatedItems(row, draft)).toEqual([]);
    expect(row.last_assessed > result.origin && row.last_assessed <= result.anchor).toBe(true);
  }
  for (const key of Object.keys(before).filter(key => !['framework_assessments','guided_assessment_pilot'].includes(key)))
    expect(db[key]).toEqual(before[key]);
});

test('native owner users stay separate from the three existing business Contacts and no identities are created', () => {
  const db = fixture(), contacts = copy(db.contacts), users = copy(db.users), {assessments} = populate(db);
  expect(db.contacts).toEqual(contacts); expect(db.users).toEqual(users);
  const expectedContacts = new Set();
  for (const row of assessments) {
    const content = contentModule.krustySafeguardContent(row.definition_id, 'addressed');
    const processName = content.process_owner_role.split(' — ')[0];
    const contact = contacts.find(item => item.contact_id === row.process_owner_id);
    expect(contact).toMatchObject({client_id:CID,name:processName,status:'active'});
    expect(names).toContain(contact.name); expectedContacts.add(contact.name);
    expect(row.owner_id).toBe('demo_provider_lead');
    const draft = draftFor(db, row.definition_id);
    expect(draft.answers.owner).toBe(content.owner_role+' / '+content.process_owner_role);
    if (row.definition_id.startsWith('1.')) expect(draft.answers.system).toBe(content.technology_process);
    else expect(draft.answers.operation).toBe(content.current_implementation);
    expect(row.notes).toBe('Scope: '+content.scope+'\n'+content.assessment_notes);
    expect(draft.answers.evidence).toBe(content.evidence_check);
  }
  expect([...expectedContacts].sort()).toEqual(names.slice().sort());
});

test('explicit Contact references resolve only the same accountable role rather than relabeling another person', () => {
  const db = fixture();
  const processOwners = Object.fromEntries(names.map((name, index) => {
    const role = name === 'Eugene Krabs' ? 'Executive sponsor'
      : name === 'Squidward Tentacles' ? 'Franchise operations coordinator' : 'Engineering and infrastructure lead';
    return [name+' — '+role, {contact_id:CID+'_contact_'+index}];
  }));
  const supplied = populateKrustyAssessments(db, {dates,owner:{user_id:'demo_provider_lead'},processOwners});
  const ordinary = populate(fixture());
  expect(supplied).toEqual(ordinary);
});

test('inventory history has a real recent source date and retains six-month, daily and weekly native distinctions', () => {
  const db = fixture(); populate(db);
  const inventory = draftFor(db, '1.1');
  expect(inventory.answers.frequency).toBe('Every six months');
  expect(inventory.answers.last_review).toBe(dates.month(-1));
  expect(inventory.result.evaluation_date).toBe(dates.day(-2));
  expect(draftFor(db, '1.2').answers.frequency).toBe('Weekly');
  expect(draftFor(db, '1.2').answers.actions).toEqual(['Remove from network','Deny remote connection','Quarantine or isolate']);
  expect(draftFor(db, '1.2').answers.unresolved).toBe('No');
  expect(draftFor(db, '1.3').answers.frequency).toBe('Daily');
  expect(draftFor(db, '1.4').answers.frequency).toBe('Weekly');
  expect(draftFor(db, '1.4').answers.approach).toBe('Both');
  expect(draftFor(db, '1.5').answers.frequency).toBe('Weekly');
  expect(draftFor(db, '1.5').answers.inventory_update).toBe('Yes');
  for (const id of ['1.2','1.3','1.4','1.5','11.5','18.5']) expect(draftFor(db, id).result.evaluation_date).toBeUndefined();
});

test('IG3 source-conditioned answers retain actual capability and performed-work scope without fabricated exclusions', () => {
  const db = fixture(); populate(db);
  const hostPrevention = draftFor(db, '13.7');
  expect(criterionAnswer(hostPrevention, '13.7', '13.7-c4')).toBe('Yes');
  expect(criterionAnswer(hostPrevention, '13.7', '13.7-c6')).toBe('Yes');
  expect(hostPrevention.answers.system).toMatch(/support limits.*without inventing agent support/);
  const dedicated = draftFor(db, '12.8');
  expect(dedicated.answers.operation).toMatch(/not allowed Internet access.*restricted private administrative paths/);
  expect(draftFor(db, '16.2').answers.system).toMatch(/external reporting instructions/);
  expect(draftFor(db, '16.13').answers.operation).toMatch(/authenticated and unauthenticated/);
  expect(draftFor(db, '18.4').answers.operation).toMatch(/after each test.*when necessary/i);
  expect(draftFor(db, '11.5').answers.operation).toMatch(/actual sampled recovery tests.*quarterly.*usable outputs/i);
  for (const draft of Object.values(db.guided_assessment_pilot))
    for (const value of Object.values(draft.answers)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) expect(Object.values(value)).not.toContain('Not applicable');
    }
});

test.each([
  ['2026-11-04T12:00:00.000Z','2024-07-01T00:00:00.000Z','2021-11-04T00:00:00.000Z'],
  ['2031-11-04T12:00:00.000Z','2026-11-04T00:00:00.000Z','2026-11-04T00:00:00.000Z'],
])('assessment creation dates retain the release/enrollment clamp and organization origin at %s', (clock, origin, organizationOrigin) => {
  const sourceDates = cisDemoFixtureDates(new Date(clock)), db = fixture(new Date(clock));
  const result = populateKrustyAssessments(db, {dates:sourceDates,owner:'demo_provider_lead'});
  expect(result.origin).toBe(origin); expect(result.organization_origin).toBe(organizationOrigin);
  expect(result.assessments.every(row => row.created_at === origin && row.last_assessed === sourceDates.instant(-2))).toBe(true);
  expect(result.assessments.every(row => row.created_at >= '2024-07-01T00:00:00.000Z')).toBe(true);
});

test('source construction is deterministic, foreign records survive and replay cannot overwrite completed assessment work', () => {
  const first = fixture(), second = copy(first);
  for (const db of [first,second]) {
    db.framework_assessments.push({framework_assessment_id:'retained-other',client_id:'other',notes:'Visitor work',status:'in_progress'});
    db.guided_assessment_pilot = {foreign:{client_id:'other',answers:{retained:'Untouched'}}};
    db.guided_assessment_history = {foreign:{client_id:'other',revision:9,answers:{retained:'Original'}}};
    db.evidence.push({client_id:'other',evidence_id:'retained-book',content_base64:'T3JpZ2luYWwgYnl0ZXM='});
  }
  const before = copy(first), a = populate(first), b = populate(second);
  expect(a).toEqual(b); expect(first).toEqual(second);
  expect(first.framework_assessments.find(row => row.client_id === 'other'))
    .toEqual(before.framework_assessments.find(row => row.client_id === 'other'));
  expect(first.guided_assessment_pilot.foreign).toEqual(before.guided_assessment_pilot.foreign);
  expect(first.guided_assessment_history).toEqual(before.guided_assessment_history);
  expect(first.evidence).toEqual(before.evidence);
  const populated = copy(first);
  expect(() => populate(first)).toThrow('untouched');
  expect(first).toEqual(populated);
});

test.each([
  ['read-only actor', db => {db.user.role = 'client_readonly';}],
  ['foreign actor', db => {Object.assign(db.user, {role:'client_contributor',client_ids:['other']});}],
  ['disabled actor', db => {db.user.status = 'disabled';}],
  ['standard actor', db => {db.user.workspace_mode = 'standard';}],
  ['authenticated client', db => {db.clients[0].environment = 'Production';}],
  ['duplicate client', db => {db.clients.push(copy(db.clients[0]));}],
  ['unselected program', db => {db.baselines[CID].completed = false;}],
  ['wrong IG', db => {db.clients[0].framework_settings['cis-ig1'].implementation_group = 2;}],
  ['disabled guided program', db => {db.clients[0].framework_settings['cis-ig1'].guided_assessment_enabled = false;}],
  ['ineligible owner', db => {db.users[1].status = 'disabled';}],
  ['foreign owner', db => {db.users[1].client_ids = ['other'];}],
  ['duplicate owner', db => {db.users.push(copy(db.users[1]));}],
  ['foreign process Contact', db => {db.contacts[0].client_id = 'other';}],
  ['disabled process Contact', db => {db.contacts[0].status = 'inactive';}],
  ['duplicate process Contact', db => {db.contacts.push({...db.contacts[0],contact_id:'duplicate-contact'});}],
  ['retained narrative', db => {db.framework_assessments[0].notes = 'Visitor assessment';}],
  ['retained verification', db => {db.framework_assessments[0].verification = 'verified';}],
  ['retained item', db => {db.framework_assessments[0].items_to_address = [{item_id:'retained'}];}],
  ['retained history', db => {db.framework_assessments[0].assessment_history = [{at:dates.anchor}];}],
  ['retained draft', db => {db.guided_assessment_pilot = {[db.framework_assessments[0].framework_assessment_id+':other']:{answers:{}}};}],
  ['retained archived draft', db => {db.guided_assessment_history = {retained:{client_id:CID}};}],
  ['retained source draft', db => {db.drafts[CID] = {notes:'Visitor work'};}],
  ['retained Review schedule', db => {db.reviews[0].due_date = dates.day(1);}],
  ['changed native seven-day cadence', db => {db.reviews.find(row => row.framework_plan_key === 'passive-discovery-reconciliation').custom_recurrence_days = 14;}],
  ['retained document edit', db => {db.policies[0].summary = 'Visitor policy';}],
  ['wrong creation date', db => {db.framework_assessments[0].created_at = '2021-11-04T00:00:00.000Z';}],
  ['missing native safeguard', db => {db.framework_assessments.pop();}],
  ['foreign identity collision', db => {db.framework_assessments.push({...db.framework_assessments[0],client_id:'other'});}]
])('%s rejects atomically without source replacement', (_label, change) => {
  const db = fixture(); change(db); const before = copy(db);
  expect(() => populate(db)).toThrow('Krusty assessments:');
  expect(db).toEqual(before);
});

test('a supplied existing Contact cannot silently take another business role', () => {
  const db = fixture(), before = copy(db);
  const role = contentModule.krustySafeguardContent('1.1','addressed').process_owner_role;
  expect(() => populateKrustyAssessments(db, {dates,owner:'demo_provider_lead',processOwners:{[role]:CID+'_contact_0'}}))
    .toThrow('existing active Krusty Contact');
  expect(db).toEqual(before);
});

test.each(['future judgment','pre-enrollment judgment','invalid anchor','future inventory date'])('%s rejects before importing any conclusions', condition => {
  const db = fixture(), before = copy(db);
  const altered = {...dates};
  if (condition === 'future judgment') altered.instant = offset => offset === -2 ? dates.instant(1) : dates.instant(offset);
  if (condition === 'pre-enrollment judgment') altered.instant = offset => offset === -2 ? '2024-06-24T00:00:00.000Z' : dates.instant(offset);
  if (condition === 'invalid anchor') altered.anchor = '2026-02-30T00:00:00.000Z';
  if (condition === 'future inventory date') altered.month = offset => offset === -1 ? dates.day(1) : dates.month(offset);
  expect(() => populateKrustyAssessments(db, {dates:altered,owner:'demo_provider_lead'})).toThrow('Krusty assessments:');
  expect(db).toEqual(before);
});

test.each(['new text question','added criterion','renamed matrix','unknown type','changed inventory coverage'])(
  '%s fails closed rather than automatically accepting changed interview requirements', condition => {
    const db = fixture(), before = copy(db), original = guided.catalogForVersion;
    jest.spyOn(guided,'catalogForVersion').mockImplementation(version => {
      const catalog = copy(original(version));
      if (version === 'cis-v8.1-program-5') {
        const questions = catalog.safeguards['18.5'];
        if (condition === 'new text question') questions.push({id:'new_required_text',type:'text',critical:true,choices:[]});
        if (condition === 'added criterion') {
          const matrix = questions.find(row => row.type === 'matrix');
          matrix.rows.push('An unmapped additional duty'); matrix.criterion_ids.push('18.5-unmapped');
        }
        if (condition === 'renamed matrix') questions.find(row => row.type === 'matrix').id = 'requirements_999';
        if (condition === 'unknown type') questions.find(row => row.id === 'practice').type = 'range';
      }
      if (version === 'cis-v8.1-control1-5' && condition === 'changed inventory coverage')
        catalog.safeguards['1.1'].find(row => row.id === 'coverage').rows.push('Unmapped asset category');
      return catalog;
    });
    expect(() => populate(db)).toThrow('Krusty assessments:');
    expect(db).toEqual(before);
  },
);

test('a new question version is not silently mapped to the earlier authored answers', () => {
  const db = fixture(), before = copy(db), original = guided.versionForSafeguard;
  jest.spyOn(guided,'versionForSafeguard').mockImplementation(id => id === '18.5' ? 'cis-v8.1-program-3' : original(id));
  expect(() => populate(db)).toThrow('authored native question version changed');
  expect(db).toEqual(before);
});

test.each(['different native status','additional native gap','additional native uncertainty'])(
  '%s cannot be hidden by the desired all-implemented profile', condition => {
    const db = fixture(), before = copy(db), original = guided.generateResult;
    jest.spyOn(guided,'generateResult').mockImplementation((id, ...args) => {
      const result = original(id,...args);
      if (id !== '18.5') return result;
      return condition === 'different native status' ? {...result,status:'in_progress'}
        : condition === 'additional native gap' ? {...result,gaps:['Native gap']}
          : {...result,unknowns:['Native uncertainty']};
    });
    expect(() => populate(db)).toThrow('do not establish the clean implemented scenario');
    expect(db).toEqual(before);
  },
);

test('late invalid native answer text rolls back the entire staged assessment import', () => {
  const db = fixture(), before = copy(db), original = contentModule.krustySafeguardContent;
  jest.spyOn(contentModule,'krustySafeguardContent').mockImplementation((id,status) =>
    id === '18.5' ? {...original(id,status),technology_process:'x'.repeat(2001)} : original(id,status));
  expect(() => populate(db)).toThrow('Invalid answer text');
  expect(db).toEqual(before);
});
