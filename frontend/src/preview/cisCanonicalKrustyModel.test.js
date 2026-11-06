import {activeDefinitions} from '../lib/frameworks';
import {namedDemoClient} from '../lib/demoClients';
import {krustyArtifactModel, populateKrustyModel} from './cisCanonicalKrustyModel';

const CID = 'demo_krusty_krab', ANCHOR = '2026-11-04T00:00:00.000Z';
const copy = value => JSON.parse(JSON.stringify(value));
let model;
beforeAll(() => {model = krustyArtifactModel(ANCHOR);});

test('the isolated source model reuses canonical IG3 identity,Contacts and its existing Demo actor', () => {
  const {db, program, operations, history} = model, identity = namedDemoClient(CID);
  expect(db.clients).toHaveLength(1);
  expect(db.clients[0]).toMatchObject({client_id:CID,name:identity.name,logo_url:identity.logo,
    primary_contact_id:CID+'_contact_0',framework_settings:{'cis-ig1':{implementation_group:3}}});
  expect(db.contacts.map(row => [row.contact_id,row.name])).toEqual(
    ['Eugene Krabs','Squidward Tentacles','SpongeBob SquarePants'].map((name,index) => [CID+'_contact_'+index,name]));
  expect(db.users).toEqual([db.user]);
  expect(db.user).toMatchObject({user_id:'demo_admin',workspace_mode:'demo',client_ids:[CID]});
  expect(program.assessments.map(row => row.definition_id).sort())
    .toEqual(activeDefinitions('cis-ig1',{implementation_group:3}).map(row => row.id).sort());
  expect(program.assessments).toHaveLength(153);
  expect(program.assessments.every(row => row.status === 'addressed' && row.verification === 'needs_validation')).toBe(true);
  expect(program.policies).toHaveLength(9); expect(program.reviews).toHaveLength(19);
  expect(operations.risks).toHaveLength(29); expect(operations.vendors).toHaveLength(15);
  expect(operations.ai_systems).toHaveLength(3); expect(operations.tasks).toHaveLength(10);
  expect(db.reviews).toHaveLength(70);
  expect(history.volume_plan.complete).toBe(true);
  expect(history.occurrence_count).toBe(history.volume_plan.counts.planned_past_periods);
  expect(history.occurrence_count).toBe(514);
});

test('the installed object graph contains History replacements and all original operational work', () => {
  const {db, program, operations, history} = model;
  for (const [kind,field,rows] of [
    ['framework_assessments','framework_assessment_id',program.assessments],['policies','policy_id',program.policies],
    ['reviews','review_id',program.reviews],['risks','risk_id',operations.risks],['vendors','vendor_id',operations.vendors],
    ['ai_systems','ai_system_id',operations.ai_systems],['reviews','review_id',operations.reviews],
    ['tasks','task_id',operations.tasks],['reviews','review_id',history.reviews],
    ['findings','finding_id',history.findings],['tasks','task_id',history.tasks]
  ]) for (const row of rows) expect(db[kind].find(saved => saved[field] === row[field])).toBe(row);
  expect(program.reviews.reduce((sum,row) => sum+row.occurrences.length,0)).toBeGreaterThan(0);
  expect(history.reviews.reduce((sum,row) => sum+row.occurrences.length,0)).toBe(history.occurrence_count);
  expect(new Set([...program.reviews,...operations.reviews].map(row => row.review_id)).size).toBe(70);
  for (const task of operations.tasks) expect(db.tasks).toContain(task);
  for (const finding of history.findings)
    expect(db.tasks.some(row => row.task_id === finding.primary_task_id && row.finding_id === finding.finding_id)).toBe(true);
});

test('five-year organization history stays separate from actual post-release CIS assessment history', () => {
  const {program,operations,history} = model;
  expect(history.organization_origin).toBe('2021-11-04T00:00:00.000Z');
  expect(history.origin).toBe('2024-07-01');
  expect(program.assessments.every(row => row.created_at === history.origin+'T00:00:00.000Z')).toBe(true);
  for (const assessment of program.assessments) for (const event of assessment.assessment_history) {
    expect(event.at >= history.origin+'T00:00:00.000Z' && event.at <= ANCHOR).toBe(true);
    expect(event.source).toMatch(/fictional|synthetic/i);
  }
  for (const review of program.reviews) for (const occurrence of review.occurrences)
    expect(occurrence.due_date.slice(0,10) >= history.origin).toBe(true);
  expect(operations.reviews.some(review => review.occurrences.some(row => row.due_date < history.origin))).toBe(true);
  expect(operations.ai_systems.every(row => row.approval_status === 'pending_assessment'
    && row.status === 'draft' && (row.approval_history == null
      || Array.isArray(row.approval_history) && row.approval_history.length === 0))).toBe(true);
  expect(history.reviews.every(review => review.occurrences.every(row => row.completed_at < ANCHOR))).toBe(true);
});

test('explicit source reconstruction preserves unrelated identities,records and visitor content', () => {
  const {db,dates} = krustyArtifactModel(ANCHOR);
  const foreignClient = {client_id:'visitor_client',name:'Visitor-owned client',environment:'Demo',status:'active',notes:'Retain this edit'};
  const foreignPolicy = {policy_id:'visitor_policy',client_id:'visitor_client',status:'draft',summary:'Visitor policy text'};
  const foreignContact = {contact_id:'visitor_contact',client_id:'visitor_client',name:'Fictional visitor Contact',status:'active'};
  const foreignBaseline = {completed:false,notes:'Visitor onboarding draft'};
  const foreignLog = {log_id:'visitor_audit',client_id:'visitor_client',at:'2023-01-01T00:00:00.000Z',action:'Retained visitor event'};
  db.clients.push(foreignClient); db.policies.push(foreignPolicy); db.contacts.push(foreignContact); db.logs.push(foreignLog);
  db.baselines.visitor_client = foreignBaseline;
  const before = copy([foreignClient,foreignPolicy,foreignContact,foreignBaseline,foreignLog]), users = copy(db.users);
  populateKrustyModel(db,dates);
  // Native staged reconstruction preserves saved identities and values, not
  // JavaScript object references across the clone/publish boundary.
  expect([db.clients.find(row => row.client_id === foreignClient.client_id),
    db.policies.find(row => row.policy_id === foreignPolicy.policy_id),
    db.contacts.find(row => row.contact_id === foreignContact.contact_id),
    db.baselines.visitor_client,db.logs.find(row => row.log_id === foreignLog.log_id)]).toEqual(before);
  expect(db.users).toEqual(users);
  expect([foreignClient,foreignPolicy,foreignContact,foreignBaseline,foreignLog]).toEqual(before);
});

test('virtual authoring returns fresh deterministic records without using the caller execution clock', () => {
  const expected = copy(model.db);
  jest.useFakeTimers().setSystemTime(new Date('2027-02-15T13:00:00.000Z'));
  try {
    const other = krustyArtifactModel(ANCHOR);
    expect(other.db).toEqual(expected);
    other.db.contacts[0].name = 'Caller-local Contact edit';
    other.db.framework_assessments[0].implementation = 'Caller-local narrative';
    expect(krustyArtifactModel(ANCHOR).db).toEqual(expected);
  } finally {jest.useRealTimers();}
  expect(() => krustyArtifactModel('2026-11-04T12:00:00.000Z')).toThrow('exact frozen UTC anchor');
  expect(() => krustyArtifactModel('2026-02-30T00:00:00.000Z')).toThrow('exact frozen UTC anchor');
  expect(() => populateKrustyModel({users:[],user:{user_id:'absent'}},model.dates)).toThrow('existing application actor');
});
