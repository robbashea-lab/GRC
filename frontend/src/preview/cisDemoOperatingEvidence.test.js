import {activeDefinitions, activePlans} from '../lib/frameworks';
import {reviewView, occurrenceId} from '../lib/reviewOccurrences';
import {seedCisOperatingEvidence, renderCisOperatingArtifact} from './cisDemoOperatingEvidence';
import {cisDemoFixtureDates, CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {CIS_DEMO_SCENARIOS} from './cisDemoSelection';
import {evidencePage, evidenceReferences} from './evidence';
import {lightweightStore, fileBytes, payloadBytes} from './evidenceStorage';

const dates = cisDemoFixtureDates(new Date('2026-10-28T23:59:59.000Z'));
const text = row => Buffer.from(row.content_base64, 'base64').toString('utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(group) {
  const scenario = {...CIS_DEMO_SCENARIOS.find(row => row.implementation_group === group)}, cid = scenario.client_id;
  const user = {user_id: 'demo_admin', name: 'Demo Explorer', email: 'explorer@example.test',
    role: 'super_admin', status: 'active', workspace_mode: 'demo', client_ids: [cid]};
  const db = {user, users: [user], clients: [{client_id: cid, environment: 'Demo', status: 'active',
    framework_settings: {'cis-ig1': {implementation_group: group}}}],
    framework_assessments: activeDefinitions('cis-ig1', {implementation_group: group}).map(definition => ({
      client_id: cid, framework_key: 'cis-ig1', framework_version: '8.1', definition_id: definition.id,
      framework_assessment_id: `${cid}_assessment_${definition.id}`, status: 'addressed',
      implementation: 'Existing fictional implementation', assessment_history: [{at: '2026-10-20', status: 'addressed'}], related_links: []})),
    reviews: activePlans('cis-ig1', {implementation_group: group}).filter(plan => plan.default_enabled !== false).map(plan => reviewView({
      review_id: cid + '_review_' + plan.key, client_id: cid, title: plan.title, framework_key: 'cis-ig1',
      framework_plan_key: plan.key, framework_safeguards: plan.safeguards, review_type: plan.review_type,
      recurrence: plan.default_cadence, due_date: '2026-11-15', status: 'upcoming',
      occurrences: [{occurrence_id: 'retained_execution_' + plan.key, status: 'completed', evidence: []}]})),
    evidence: [], policies: [], vendors: [], findings: [], assets: [], risks: [], organizational_controls: [],
    drafts: {untouched: 'retained editor'}, logs: []};
  return {db, scenario, cid};
}

test.each([1, 2, 3])('IG%i bundles cover actual assessed duties without creating operating records or changing decisions', group => {
  const {db, scenario, cid} = fixture(group), before = clone(db);
  const rows = seedCisOperatingEvidence(db, scenario, dates);
  const expected = activeDefinitions('cis-ig1', {implementation_group: group})
    .filter(row => row.type !== 'recurring' || ['1.5', '2.7', '6.8', '13.11', '15.5', '17.9', '18.5'].includes(row.id)).map(row => row.id).sort();
  expect(db.framework_assessments.filter(row => row.related_links.length).map(row => row.definition_id).sort()).toEqual(expected);
  expect(rows.every(row => row.client_id === cid && row.mime_type === 'text/csv' && row.size > 0)).toBe(true);
  expect(rows.every(row => text(row).includes('DEMO - SYNTHETIC DATA')
    && (text(row).includes('samples only') || text(row).includes('sample only')))).toBe(true);
  expect(rows.map(row => row.evidence_id)).toHaveLength(group === 3 ? 5 : 3);
  expect(db.framework_assessments.map(({related_links, ...row}) => row))
    .toEqual(before.framework_assessments.map(({related_links, ...row}) => row));
  for (const key of ['reviews', 'policies', 'vendors', 'findings', 'assets', 'risks', 'drafts', 'logs', 'users', 'clients']) {
    expect(db[key]).toEqual(before[key]);
  }
});

test('cadence samples retain daily, weekly, quarterly and event timing rather than implying extra manual Reviews', () => {
  const {db, scenario} = fixture(3), rows = seedCisOperatingEvidence(db, scenario, dates);
  const periodic = text(rows.find(row => row.evidence_id.endsWith('operating_periodic')));
  const event = text(rows.find(row => row.evidence_id.endsWith('operating_event')));
  const configuration = text(rows.find(row => row.evidence_id.endsWith('operating_configuration')));
  expect(periodic).toContain('# d=daily:2026-10-25|2026-10-26|2026-10-27');
  expect(periodic).toContain('# w=weekly:2026-10-13|2026-10-20|2026-10-27');
  expect(periodic).toContain('# q=quarterly:2025-12-28|2026-03-28|2026-06-28|2026-09-28');
  expect(periodic).toContain('1.3,A,d\n');
  expect(periodic).toContain('1.5,A,w\n');
  expect(periodic).toContain('2.7,A,s\n');
  expect(periodic).toContain('13.11,A,m\n');
  expect(periodic).toContain('15.5,A,a*\n');
  expect(periodic).toContain('18.5,A,a\n');
  expect(periodic).toContain('11.5,A,q\n');
  expect(periodic).toContain('asset1:4 partial-scope restore samples.');
  expect(configuration).toContain('5.3,A,i\n');
  expect(configuration).toContain('account1:last-active=2026-08-29;disabled=2026-10-13;45d.');
  expect(event).toContain('6.1,A,e\n');
  expect(periodic).toContain('DEMO - SYNTHETIC DATA');
  expect(periodic).toContain('samples only');
});

test('negative cadence wording and source event triggers do not become annual application tests or lost hire/change duties', () => {
  const {db, scenario} = fixture(3), rows = seedCisOperatingEvidence(db, scenario, dates);
  const periodic = text(rows.find(row => row.evidence_id.endsWith('operating_periodic')));
  const event = text(rows.find(row => row.evidence_id.endsWith('operating_event')));
  const configuration = text(rows.find(row => row.evidence_id.endsWith('operating_configuration')));
  expect(configuration).toContain('16.13,A,o\n'); expect(periodic).not.toMatch(/^16\.13,/m);
  for (const id of ['3.7', '3.8', '15.2', '15.3', '15.5', '16.1', '16.2', '17.4', '17.5', '17.6']) {
    expect(periodic).toContain(`${id},A,a*\n`);
  }
  expect(periodic).toContain('14.1,A,t*\n');
  expect(periodic).toContain('*=source change/hire/intake/contract triggers.');
  for (const id of ['10.4', '16.5', '17.8', '18.3']) expect(event).toContain(`${id},A,e\n`);
  for (const id of ['4.3', '4.10', '8.10', '15.6']) expect(configuration).toContain(`${id},A,o\n`);
});

test('unassessed, unimplemented, foreign, wrong-framework and wrong-version assessments gain no sample or relationship', () => {
  const {db, scenario, cid} = fixture(3);
  const byId = id => db.framework_assessments.find(row => row.definition_id === id);
  byId('1.3').status = 'not_assessed'; byId('1.4').status = 'not_implemented';
  byId('1.5').framework_version = '8.0'; byId('6.8').status = 'not_assessed';
  db.framework_assessments.push({...clone(byId('1.3')), client_id: 'foreign', framework_assessment_id: 'foreign_assessment', related_links: []},
    {...clone(byId('1.3')), framework_key: 'iso-27001', framework_assessment_id: 'iso_assessment', related_links: []});
  const rows = seedCisOperatingEvidence(db, scenario, dates);
  for (const id of ['1.3', '1.4', '1.5', '6.8']) expect(byId(id).related_links).toEqual([]);
  expect(db.framework_assessments.filter(row => row.client_id !== cid || row.framework_key !== 'cis-ig1').every(row => !row.related_links.length)).toBe(true);
  expect(rows.some(row => row.evidence_id.endsWith('6_8_sample'))).toBe(false);
  expect(rows.flatMap(row => row.relationships).some(row => ['foreign_assessment', 'iso_assessment'].includes(row.id))).toBe(false);
});

test('partial and gap samples retain the actual assessment status; matrices are fictional business examples', () => {
  const {db, scenario} = fixture(3);
  db.framework_assessments.find(row => row.definition_id === '11.5').status = 'needs_attention';
  db.framework_assessments.find(row => row.definition_id === '6.8').status = 'in_progress';
  const rows = seedCisOperatingEvidence(db, scenario, dates);
  expect(text(rows.find(row => row.evidence_id.endsWith('operating_periodic')))).toContain('11.5,G,q\n');
  const matrix = text(rows.find(row => row.evidence_id.endsWith('6_8_sample')));
  expect(matrix).toContain('state=P'); expect(matrix).toContain('not product permissions');
  expect(matrix).toContain('Operator,inventory edit\nSecurity,evidence review\nViewer,read');
  const thresholds = text(rows.find(row => row.evidence_id.endsWith('17_9_sample')));
  expect(thresholds).toContain('event,one blocked login,log');
  expect(thresholds).toContain('incident,confirmed unauthorized access,escalate');
  expect(thresholds).toContain('no live detection');
  expect(rows.every(row => row.notes.includes('P/G mean incomplete coverage'))).toBe(true);
});

test('native Evidence references resolve matching assessments and exact current Review identities, never another client or frozen execution', () => {
  const {db, scenario, cid} = fixture(3);
  db.reviews.push({...clone(db.reviews[0]), review_id: 'foreign_review', client_id: 'foreign'});
  const rows = seedCisOperatingEvidence(db, scenario, dates);
  for (const row of rows) {
    const refs = evidenceReferences(db, row);
    expect(refs.every(ref => ref.available)).toBe(true);
    for (const link of row.relationships.filter(link => link.kind === 'reviews')) {
      const review = db.reviews.find(review => review.review_id === link.id);
      expect(review.client_id).toBe(cid); expect(link.occurrence_id).toBe(occurrenceId(review));
      expect(link.occurrence_id).not.toContain('retained_execution');
    }
    expect(row.relationships.length).toBeLessThanOrEqual(100);
  }
  const assessment = db.framework_assessments.find(row => row.definition_id === '11.5');
  const page = evidencePage(db, {client_id: cid, entity_type: 'framework_assessment', entity_id: assessment.framework_assessment_id});
  expect(page.items).toHaveLength(1);
  expect(page.items[0].references.some(ref => ref.id === assessment.framework_assessment_id)).toBe(true);
  expect(page.items[0].content_base64).toBeUndefined();
});

test.each([1, 2, 3])('IG%i worst-case assessed payload is compact, valid UTF-8 and persists through the original inline serializer', group => {
  const {db, scenario} = fixture(group), rows = seedCisOperatingEvidence(db, scenario, dates);
  const operating = rows.filter(row => row.evidence_id.includes('_operating_'));
  const special = rows.filter(row => !row.evidence_id.includes('_operating_'));
  expect(operating.reduce((total, row) => total + row.size, 0)).toBeLessThanOrEqual(2048);
  expect(special.reduce((total, row) => total + row.size, 0)).toBeLessThanOrEqual(500);
  for (const row of rows) {
    expect(Buffer.byteLength(text(row), 'utf8')).toBe(row.size);
    expect(fileBytes(row.content_base64)).toBe(row.size);
    expect(Buffer.from(text(row), 'utf8').toString('base64')).toBe(row.content_base64);
  }
  const saved = JSON.parse(JSON.stringify(lightweightStore(db)));
  expect(saved.evidence.map(row => row.content_base64)).toEqual(rows.map(row => row.content_base64));
  expect(rows.reduce((total, row) => total + payloadBytes(row.content_base64), 0)).toBeLessThan(64 * 1024);
});

test('rerun preserves retained bytes and links without duplicates; identity conflicts fail before partial writes', () => {
  const {db, scenario} = fixture(3), rows = seedCisOperatingEvidence(db, scenario, dates);
  rows[0].content_base64 = Buffer.from('Retained fictional sample — owner annotation', 'utf8').toString('base64');
  const before = clone(db);
  seedCisOperatingEvidence(db, scenario, dates); expect(db).toEqual(before);
  const other = fixture(3);
  other.db.evidence.push({...clone(rows[1]), client_id: 'foreign'});
  const conflict = clone(other.db);
  expect(() => seedCisOperatingEvidence(other.db, other.scenario, dates)).toThrow('identity collision');
  expect(other.db).toEqual(conflict);
});

test.each(['standard', 'wrong group', 'not canonical', 'archived', 'wrong configured group'])('%s cannot receive Demo operating samples', condition => {
  const {db, scenario} = fixture(3);
  if (condition === 'standard') db.user.workspace_mode = 'standard';
  if (condition === 'wrong group') scenario.implementation_group = 2;
  if (condition === 'not canonical') scenario.client_id = 'new_client';
  if (condition === 'archived') db.clients[0].archived_at = '2026-10-01';
  if (condition === 'wrong configured group') db.clients[0].framework_settings['cis-ig1'].implementation_group = 2;
  const before = clone(db);
  expect(seedCisOperatingEvidence(db, scenario, dates)).toEqual([]); expect(db).toEqual(before);
});

test('read-only or ineligible actor and ambiguous assessment identities fail without mutation', () => {
  for (const condition of ['readonly', 'inactive', 'duplicate']) {
    const {db, scenario} = fixture(3);
    if (condition === 'readonly') db.user.role = 'client_readonly';
    if (condition === 'inactive') db.user.status = 'disabled';
    if (condition === 'duplicate') db.framework_assessments.push(clone(db.framework_assessments[0]));
    const before = clone(db);
    expect(() => seedCisOperatingEvidence(db, scenario, dates)).toThrow(); expect(db).toEqual(before);
  }
});

const recipe = () => ({kind: 'operating', schema_version: 1, fixture_version: CIS_SHOWCASE_VERSION,
  client_id: 'demo_krusty_krab', anchor: dates.anchor, key: 'operating_periodic',
  rows: [{id: '1.3', state: 'A', frequency: 'd', trigger: false}]});

test('the byte factory retains the exact UTF-8 file contract from bounded initial facts', () => {
  const expected = '# DEMO - SYNTHETIC DATA\n#Collected: 2026-10-28\n'
    + '# A=addressed,P=in_progress,G=needs_attention; samples only.\n'
    + '# d=daily:2026-10-25|2026-10-26|2026-10-27\nid,state,freq\n1.3,A,d\n';
  const value = recipe(), before = clone(value);
  expect(renderCisOperatingArtifact(value)).toEqual({content_base64: Buffer.from(expected, 'utf8').toString('base64'),
    size: Buffer.byteLength(expected, 'utf8')});
  expect(value).toEqual(before);
});

test('every seed file uses its initial recipe; later assessment/catalog changes cannot regenerate different bytes', () => {
  const registrar = jest.spyOn(require('./cisDemoArtifactRecipes'), 'registerCisDemoArtifact');
  try {
    const {db, scenario} = fixture(3), rows = seedCisOperatingEvidence(db, scenario, dates);
    expect(registrar).toHaveBeenCalledTimes(rows.length);
    const captured = registrar.mock.calls.map(([store, row, initial]) => {
      expect(store).toBe(db); expect(db.evidence.filter(value => value === row)).toHaveLength(1);
      expect(renderCisOperatingArtifact(initial)).toEqual({content_base64: row.content_base64, size: row.size});
      expect(Object.keys(initial).sort()).toEqual(['anchor', 'client_id', 'fixture_version', 'key', 'kind', 'rows', 'schema_version']);
      expect(initial.rows.every(value => Object.keys(value).sort().join(',') === 'frequency,id,state,trigger')).toBe(true);
      return {initial: clone(initial), bytes: {content_base64: row.content_base64, size: row.size}};
    });
    for (const assessment of db.framework_assessments) Object.assign(assessment, {status: 'not_assessed', notes: 'Later visitor edit'});
    const catalog = jest.spyOn(require('../lib/frameworks'), 'activeDefinitions').mockImplementation(() => { throw new Error('Live catalog consulted'); });
    try {
      for (const {initial, bytes} of captured) expect(renderCisOperatingArtifact(initial)).toEqual(bytes);
      expect(catalog).not.toHaveBeenCalled();
    } finally {catalog.mockRestore();}
    registrar.mockClear();
    seedCisOperatingEvidence(db, scenario, dates);
    expect(registrar).not.toHaveBeenCalled();
  } finally {registrar.mockRestore();}
});

test.each([
  ['unknown factory', value => {value.kind = 'other';}],
  ['unknown schema', value => {value.schema_version = 2;}],
  ['unknown fixture', value => {value.fixture_version = 'old';}],
  ['foreign client', value => {value.client_id = 'demo_dunder';}],
  ['unknown key', value => {value.key = 'invented';}],
  ['non-midnight anchor', value => {value.anchor = '2026-10-28T12:00:00.000Z';}],
  ['rolled calendar', value => {value.anchor = '2026-02-30T00:00:00.000Z';}],
  ['year zero', value => {value.anchor = '0000-01-01T00:00:00.000Z';}],
  ['empty rows', value => {value.rows = [];}],
  ['unbounded rows', value => {value.rows = Array.from({length: 154}, () => ({...value.rows[0]}));}],
  ['duplicate identity', value => {value.rows.push({...value.rows[0]});}],
  ['unknown safeguard', value => {value.rows[0].id = '1.6';}],
  ['unknown control', value => {value.rows[0].id = '19.1';}],
  ['unknown state', value => {value.rows[0].state = 'addressed';}],
  ['unknown frequency', value => {value.rows[0].frequency = 'daily';}],
  ['non-boolean trigger', value => {value.rows[0].trigger = 'yes';}],
  ['wrong cadence bucket', value => {value.rows[0].frequency = 'o';}],
  ['wrong special identity', value => {value.key = '6_8_sample';}],
  ['extra payload', value => {value.content_base64 = 'YQ==';}],
  ['extra row property', value => {value.rows[0].text = 'Not a recipe';}]
])('%s recipe is rejected instead of inventing or reading replacement bytes', (_label, change) => {
  const value = recipe(); change(value);
  expect(renderCisOperatingArtifact(value)).toBeNull();
});
