import {activeDefinitions} from '../lib/frameworks';
import {initechArtifactModel, populateInitechModel} from './cisCanonicalInitechModel';

const CID = 'demo_initech', ANCHOR = '2026-11-02T00:00:00.000Z';
const copy = value => JSON.parse(JSON.stringify(value));

test('the source model uses native canonical identities and existing Demo ownership without adding accounts', () => {
  const {db, program, operations, history} = initechArtifactModel(ANCHOR);
  const definitions = activeDefinitions('cis-ig1', {implementation_group:2});
  expect(db.clients.map(row => row.client_id)).toEqual([CID]);
  expect(db.clients[0]).toMatchObject({name:'Initech', primary_contact_id:CID+'_contact_1',
    framework_settings:{'cis-ig1':{implementation_group:2}}});
  expect(db.contacts.map(row => [row.contact_id, row.name])).toEqual([
    ['Bill Lumbergh'], ['Peter Gibbons'], ['Michael Bolton'], ['Samir Nagheenanajar'],
    ['Tom Smykowski'], ['Milton Waddams'], ['Nina']
  ].map(([name], index) => [CID+'_contact_'+index, name]));
  expect(db.users).toEqual([db.user]);
  expect(db.user).toMatchObject({user_id:'demo_admin', workspace_mode:'demo', client_ids:[CID]});
  expect(program.assessments.map(row => row.definition_id).sort()).toEqual(definitions.map(row => row.id).sort());
  expect(Object.fromEntries(['addressed','in_progress','needs_attention','not_assessed']
    .map(status => [status, program.assessments.filter(row => row.status === status).length])))
    .toEqual({addressed:120, in_progress:7, needs_attention:1, not_assessed:2});
  expect(program.policies).toHaveLength(9); expect(program.reviews).toHaveLength(15);
  expect(operations.risks).toHaveLength(29); expect(operations.vendors).toHaveLength(15);
  expect(operations.ai_systems).toHaveLength(3); expect(operations.tasks).toHaveLength(10);
  expect(db.reviews).toHaveLength(66);
  for (const row of [...program.assessments, ...program.policies, ...program.reviews, ...operations.risks])
    expect(row.owner_id).toBe(db.user.user_id);
  expect(history.findings.length).toBeGreaterThanOrEqual(8);
  expect(history.tasks.length).toBeGreaterThanOrEqual(8);
});

test('later staged work returns installed records and preserves the full scope of existing linked work', () => {
  const {db, program, operations, history} = initechArtifactModel(ANCHOR);
  for (const [kind, field, rows] of [
    ['framework_assessments','framework_assessment_id',program.assessments],
    ['policies','policy_id',program.policies], ['reviews','review_id',program.reviews],
    ['risks','risk_id',operations.risks], ['vendors','vendor_id',operations.vendors],
    ['ai_systems','ai_system_id',operations.ai_systems], ['tasks','task_id',operations.tasks]
  ]) {
    for (const row of rows) expect(db[kind].find(saved => saved[field] === row[field])).toBe(row);
  }
  for (const link of operations.source_definition_risks) {
    const risk = db.risks.find(row => row.risk_id === link.risk_id);
    const finding = history.findings.find(row => row.definition_id === link.definition_id);
    expect(finding).toBeDefined();
    expect(risk.related_finding_ids).toContain(finding.finding_id);
    expect(risk.related_task_ids).toContain(finding.primary_task_id);
    expect(db.tasks.filter(row => row.finding_id === finding.finding_id)).toHaveLength(1);
  }
});

test('immutable artifact authoring is isolated and rejects a noncanonical date anchor', () => {
  const first = initechArtifactModel(ANCHOR), expected = copy(first.db);
  first.db.framework_assessments[0].implementation = 'A disposable visitor edit';
  first.db.contacts[0].name = 'A disposable Contact edit';
  expect(initechArtifactModel(ANCHOR).db).toEqual(expected);
  expect(() => initechArtifactModel('2026-11-02T12:00:00.000Z')).toThrow('exact frozen UTC anchor');
  expect(() => populateInitechModel({users:[], user:{user_id:'absent'}}, first.dates))
    .toThrow('existing application actor');
});
