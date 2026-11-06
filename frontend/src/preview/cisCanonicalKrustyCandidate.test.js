import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {buildCanonicalBrawndoCandidate} from './cisCanonicalBrawndoCandidate';
import {buildCanonicalInitechCandidate} from './cisCanonicalInitechCandidate';
import {buildCanonicalKrustyCandidate} from './cisCanonicalKrustyCandidate';
import {populateKrustyModel} from './cisCanonicalKrustyModel';
import {krustySafeguardContent} from './cisCanonicalKrustyContent';
import * as books from './cisCanonicalKrustyBooks';
import * as artifacts from './cisDemoArtifactRecipes';
import {prepareCanonicalCisOnboarding} from './cisCanonicalScope';
import {cisDemoFixtureDates,CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {CIS_CANONICAL_SCENARIO_REVISION} from './cisCanonicalArtifactBooks';
import {CIS_DEMO_REVISION} from './cisDemoSelection';
import {lightweightStore,restoreFiles,clearFileCache} from './evidenceStorage';
import {writePortfolioStore,readPortfolioStore} from './portfolioReporting';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {frameworkRequest} from './frameworks';
import {MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';
import {cisSummary} from '../lib/cisVerification';

const {createHash} = require('crypto');
const CID = 'demo_krusty_krab', CLOCK = new Date('2026-11-04T12:00:00.000Z'), dates = cisDemoFixtureDates(CLOCK);
const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(Buffer.from(value,'base64')).digest('hex');
const IDS = {framework_assessments:'framework_assessment_id',reviews:'review_id',policies:'policy_id',
  risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',findings:'finding_id',tasks:'task_id'};
let fresh, db, result, originalForeign, originalFiles, originalModel, originalResult;

// Remove only Krusty's native owned scope, retaining every foreign map/receipt
// and the original users/Contacts for an exact whole-cohort comparison.
function foreignState(value) {
  const other = copy(value);
  prepareCanonicalCisOnboarding(other,CID,{purpose:'canonical_fixture_build'});
  other.clients = other.clients.filter(row => row.client_id !== CID);
  delete other.baselines[CID];
  // The store-wide aggregate follows only the snapshots left in this scope.
  if (other.portfolio_reporting) other.portfolio_reporting.last_captured_at =
    (other.portfolio_reporting.snapshots || []).at(-1)?.captured_at || null;
  return other;
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(CLOCK);
  fresh = preExpansionCisFixture(CLOCK);
  buildCanonicalBrawndoCandidate(fresh,{clock:CLOCK});
  buildCanonicalInitechCandidate(fresh,{clock:CLOCK});
  originalForeign = foreignState(fresh);
  originalFiles = new Map(fresh.evidence.filter(row => row.client_id !== CID && row.content_base64)
    .map(row => [row.evidence_id,hash(row.content_base64)]));
  originalModel = copy(fresh); originalResult = populateKrustyModel(originalModel,dates);
  db = copy(fresh); result = buildCanonicalKrustyCandidate(db,{clock:CLOCK});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {clearFileCache();jest.useRealTimers();});

test('the real complete candidate preserves all foreign records, accounts, Contacts, maps and original Brawndo/Initech bytes', () => {
  expect(db.portfolio_reporting.last_captured_at).toBe(db.portfolio_reporting.snapshots.at(-1)?.captured_at || null);
  expect(foreignState(db)).toEqual(originalForeign);
  expect(db.users).toEqual(fresh.users); expect(db.user).toEqual(fresh.user); expect(db.contacts).toEqual(fresh.contacts);
  for (const [id,digest] of originalFiles) expect(hash(db.evidence.find(row => row.evidence_id === id).content_base64)).toBe(digest);
  expect(result.program.assessments).toHaveLength(153);
  expect(result.program.assessments.every(row => row.status === 'addressed')).toBe(true);
  expect(result.program.policies).toHaveLength(9);
  expect(result.history.reviews).toHaveLength(70);
  expect(result.operations.risks).toHaveLength(29); expect(result.operations.vendors).toHaveLength(15);
  expect(result.operations.ai_systems).toHaveLength(3); expect(result.operations.tasks).toHaveLength(10);
  expect(result.history.occurrence_count).toBe(514);
  expect(result.history.occurrence_count).toBe(result.history.reviews.reduce((sum,row) => sum+row.occurrences.length,0));
  expect(result.history.reviews.every(row => !row.completed_at && !row.completion_date)).toBe(true);
});

test('native markers retain the exact anchor, revision and distinct organization/CIS origins', () => {
  expect(result).toMatchObject({anchor:dates.anchor,revision:CIS_CANONICAL_SCENARIO_REVISION});
  expect(db.cis_demo_refresh.clients[CID]).toMatchObject({version:CIS_SHOWCASE_VERSION,state:'fresh_fixture',
    canonical_revision:CIS_CANONICAL_SCENARIO_REVISION,assessment_origin:result.program.origin,
    history_months:60,organizational_history_start:result.history.organization_origin});
  expect(db.cis_demo_rollout.clients[CID]).toEqual({revision:CIS_DEMO_REVISION,ownership:'fresh_fixture',
    superseded_by:CIS_SHOWCASE_VERSION,canonical_revision:CIS_CANONICAL_SCENARIO_REVISION,applied_at:dates.anchor});
  expect(result.program.origin).toBe('2024-07-01T00:00:00.000Z');
  expect(result.history.organization_origin.slice(0,10)).toBe(dates.month(-60));
  expect(db.clients.find(row => row.client_id === CID).notes).toMatch(/Five years describes organizational/);
});

test('151 current fictional verifications and two precise pending observations preserve prior judgments, Guides, snapshots and approvals', () => {
  expect(result.program.assessments.filter(row => row.verification === 'verified')).toHaveLength(151);
  expect(result.program.assessments.filter(row => row.verification === 'needs_validation').map(row => row.definition_id).sort())
    .toEqual(['15.5','18.5']);
  const verifier = db.users.find(row => row.user_id === 'demo_admin');
  for (const row of result.program.assessments) {
    const prior = originalModel.framework_assessments.find(item => item.framework_assessment_id === row.framework_assessment_id);
    for (const key of ['status','implementation','technology','last_assessed','assessed_by','created_at','created_by',
      'guided_assessment_source','cis_assessment_criteria','owner_id','process_owner_id']) expect(row[key]).toEqual(prior[key]);
    expect(row.assessment_history.slice(0,-1)).toEqual(prior.assessment_history);
    expect(row.last_saved).toBe(dates.anchor); expect(row.verification_checklist).toBeNull();
    expect(row.notes.startsWith(prior.notes)).toBe(true);
    expect(row.notes).toContain(krustySafeguardContent(row.definition_id,'addressed').evidence_check);
    expect(row.notes).toContain(verifier.name+' ('+verifier.user_id+') at '+dates.anchor);
    expect(row.notes).toMatch(/Authored SYNTHETIC inspection result/);
    expect(row.notes).toMatch(/later, separate collection-day fixture observation/);
    expect(row.notes).toMatch(/not files existing at earlier assessment dates/);
    const observed = row.assessment_history.at(-1);
    expect(observed).toMatchObject({at:dates.anchor,by:verifier.user_id,verification:row.verification,verification_checklist:null,
      guided_assessment_source:prior.guided_assessment_source,notes:row.notes});
    for (const file of result.evidence.filter(item => item.relationships.some(link => link.kind === 'framework_assessments'
      && link.id === row.framework_assessment_id))) expect(observed.notes).toContain(file.filename+' ['+file.evidence_id+']');
  }
  const pending = result.program.assessments.filter(row => row.verification === 'needs_validation');
  expect(pending.find(row => row.definition_id === '15.5').notes).toMatch(/original assessments for all active providers remains outstanding/);
  expect(pending.find(row => row.definition_id === '18.5').notes).toMatch(/complete original internal-penetration-test report/);
  expect(pending.every(row => row.status === 'addressed' && row.notes.includes('does not assert'))).toBe(true);
  expect(db.guided_assessment_pilot).toEqual(originalModel.guided_assessment_pilot);
  expect(db.cis_demo_scenario_history).toEqual(originalModel.cis_demo_scenario_history);
  expect(db.portfolio_reporting.snapshots).toEqual(originalModel.portfolio_reporting.snapshots);
  expect(db.portfolio_reporting.scope_events).toEqual(originalModel.portfolio_reporting.scope_events);
  expect(db.portfolio_reporting.activity_proofs).toEqual(originalModel.portfolio_reporting.activity_proofs);
  expect(db.portfolio_reporting.identities.filter(row => row.program_id !== CID+':cis-ig1'))
    .toEqual(originalModel.portfolio_reporting.identities.filter(row => row.program_id !== CID+':cis-ig1'));
  expect(result.history.precollection_verification_basis).toEqual(originalResult.history.verification_basis);
  expect(result.history.precollection_verification_basis_scope).toMatch(/before later compiled-book collection/);
  expect(result.history.verification_basis.filter(row => row.verification === 'verified')).toHaveLength(151);
  expect(result.history.verification_basis.filter(row => row.verification === 'needs_validation')).toHaveLength(2);
  expect(result.history.verification_basis.every(row => row.at === dates.anchor && row.by === verifier.user_id
    && row.provenance.includes('current verification observation'))).toBe(true);
  for (const policy of result.program.policies) {
    const prior = originalModel.policies.find(row => row.policy_id === policy.policy_id);
    for (const [key,value] of Object.entries(prior)) if (key !== 'related_links') expect(policy[key]).toEqual(value);
  }
});

test('the native current read reconciles151 verified and two pending snapshots while implementation remains153 addressed', () => {
  const input = copy(db), before = copy(input);
  const view = frameworkRequest(input,'/frameworks/cis-ig1','get',{client_id:CID},{});
  expect(view).toMatchObject({selected:true,configured:true});
  expect(view.implementation_position).toMatchObject({availability:'available',implemented:153,denominator:153,percentage:100});
  expect(view.implementation_position.source_revision).toMatch(/^demo-source:demo_krusty_krab:cis-ig1:/);
  expect(view.implementation_position.provenance.source_references.every(row => row.version === dates.anchor)).toBe(true);
  expect(cisSummary(view.assessments,CLOCK)).toMatchObject({total:153,applicable:153,addressed:153,partial:0,gap:0,implemented:100});
  expect(view.assessments.filter(row => row.verification === 'verified' && row.assessment_history.at(-1).verification === 'verified')).toHaveLength(151);
  expect(view.assessments.filter(row => row.verification === 'needs_validation' && row.assessment_history.at(-1).verification === 'needs_validation')).toHaveLength(2);
  expect(input).toEqual(before);
});

test('every returned current/history pointer refers to the installed record after staged history replacement', () => {
  for (const group of [result.program,result.operations,result.history]) for (const [key,kind] of [
    ['assessments','framework_assessments'],['policies','policies'],['reviews','reviews'],['risks','risks'],
    ['vendors','vendors'],['ai_systems','ai_systems'],['findings','findings'],['tasks','tasks']
  ]) for (const row of group[key] || []) expect(db[kind].find(item => item[IDS[kind]] === row[IDS[kind]])).toBe(row);
  for (const row of result.evidence) expect(db.evidence.find(item => item.evidence_id === row.evidence_id)).toBe(row);
});

test('actual UTF8 books obey existing file/link bounds and attach only to real same-client records and occurrences', () => {
  expect(result.evidence.length).toBeGreaterThan(0); expect(result.evidence.length).toBeLessThanOrEqual(32);
  expect(new Set(result.evidence.map(row => row.evidence_id)).size).toBe(result.evidence.length);
  for (const row of result.evidence) {
    expect(Buffer.from(row.content_base64,'base64').length).toBe(row.size);
    expect(row.size).toBeGreaterThan(0); expect(row.size).toBeLessThanOrEqual(DEMO_INLINE_LIMIT);
    expect(row.relationships.length).toBeGreaterThan(0); expect(row.relationships.length).toBeLessThanOrEqual(100);
    expect(row).toMatchObject({client_id:CID,created_at:dates.anchor,uploaded_at:dates.anchor,uploaded_by:db.user.user_id,version:1});
    expect(Buffer.from(row.content_base64,'base64').toString('utf8')).toMatch(/Retrospective source books/);
    for (const link of row.relationships) {
      const target = db[link.kind].find(item => item[IDS[link.kind]] === link.id);
      expect(target.client_id).toBe(CID);
      if (link.occurrence_id) {
        expect(link.kind).toBe('reviews');
        const occurrence = target.occurrences.find(item => item.occurrence_id === link.occurrence_id);
        expect(occurrence).toBeDefined(); expect(occurrence.evidence.some(item => item.evidence_id === row.evidence_id)).toBe(true);
        expect(occurrence.no_evidence_reason).toBeUndefined();
      } else expect(target.related_links).toContainEqual({kind:'evidence',id:row.evidence_id});
    }
  }
  for (const review of result.history.reviews) for (const occurrence of review.occurrences) {
    expect(occurrence.evidence.length).toBeGreaterThan(0);
    expect(occurrence.evidence.every(link => result.evidence.some(row => row.evidence_id === link.evidence_id))).toBe(true);
  }
});

test('the real whole cohort survives native storage/cache loss with all canonical file identities, sizes and hashes intact', () => {
  const expected = new Map(db.evidence.filter(row => ['demo_brawndo','demo_initech',CID].includes(row.client_id))
    .map(row => [row.evidence_id,hash(row.content_base64)]));
  const physicalLimit = 5*1024*1024, lightweight = lightweightStore(db), attempts = [];
  let saved;
  const storage = {setItem(_key,value) {
    attempts.push(value.length*2);
    if (value.length*2 > physicalLimit) throw new DOMException('Controlled existing 5MiB capacity','QuotaExceededError');
    saved = value;
  }};
  writePortfolioStore(storage,'synthetic_krusty_candidate',lightweight);
  clearFileCache(); const restored = restoreFiles(readPortfolioStore(saved));
  for (const key of ['clients','framework_assessments','guided_assessment_pilot','reviews','risks','vendors','ai_systems',
    'tasks','findings','policies','baselines','cis_demo_refresh','cis_demo_rollout']) expect(restored[key]).toEqual(copy(db[key]));
  expect(restored.evidence).toEqual(copy(lightweight.evidence));
  const restoredHashes = {};
  for (const row of restored.evidence.filter(item => expected.has(item.evidence_id))) {
    const file = row.content_base64 ? row : restoredCisDemoEvidence(restored,row);
    expect(file).toBeTruthy(); expect(Buffer.from(file.content_base64,'base64').length).toBe(row.size);
    restoredHashes[row.evidence_id] = hash(file.content_base64);
    expect(restoredHashes[row.evidence_id]).toBe(expected.get(row.evidence_id));
  }
  expect(Object.keys(restoredHashes).sort()).toEqual([...expected.keys()].sort());
  expect(saved.length*2).toBeLessThanOrEqual(physicalLimit);
  const envelope = JSON.parse(saved), encodedBytes = envelope.demo_storage_codec ? envelope.utf8_bytes : Buffer.byteLength(saved,'utf8');
  expect(encodedBytes).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
  if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
    const fs = require('fs'), path = require('path'), out = process.env.CIS_REBUILD_AUDIT_OUTPUT;
    fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'KRUSTY-FULL-CAPACITY.json'),JSON.stringify({anchor:dates.anchor,
      scope:'Complete real Brawndo/Initech/Krusty source cohort; native in-memory storage/cache-loss test only',
      raw_full_utf8_bytes:Buffer.byteLength(JSON.stringify(db),'utf8'),lightweight_utf8_bytes:Buffer.byteLength(JSON.stringify(lightweight),'utf8'),
      encoded_utf8_bytes:encodedBytes,stored_utf16_bytes:saved.length*2,physical_limit_utf16_bytes:physicalLimit,write_attempts:attempts,
      krusty_files:result.evidence.length,krusty_occurrences:result.history.occurrence_count,
      original_file_sha256:Object.fromEntries(expected),restored_file_sha256:restoredHashes,all_file_hashes_match:true,
      native_browser_verified:false,qualification:'Not hosted or Browser proof; no final activation, CI or human acceptance claim'},null,2)+'\n');
  }
});

test('an exact fresh-source replay is idempotent and returns the existing live records without replacing visitor objects', () => {
  const repeated = copy(db), before = copy(repeated), arrays = Object.fromEntries(Object.entries(repeated).filter(([,value]) => Array.isArray(value)));
  const again = buildCanonicalKrustyCandidate(repeated,{clock:CLOCK});
  expect(repeated).toEqual(before);
  for (const [kind,rows] of Object.entries(arrays)) expect(repeated[kind]).toBe(rows);
  expect(again.program.assessments[0]).toBe(repeated.framework_assessments.find(row => row.framework_assessment_id === again.program.assessments[0].framework_assessment_id));
  expect(again.history.reviews.reduce((sum,row) => sum+row.occurrences.length,0)).toBe(result.history.occurrence_count);
  expect(again.evidence).toHaveLength(result.evidence.length);
});

test.each(['authenticated','reader','foreign-owner','inactive-owner','client','archived','name','group','anchor','retained','reconciliation','different-revision','partial-stage'])(
  'invalid %s source context fails without changing any caller record', condition => {
    const input = copy(fresh);
    if (condition === 'authenticated') input.user.workspace_mode = 'authenticated';
    if (condition === 'reader') input.user.role = 'client_readonly';
    if (condition === 'foreign-owner') input.user.user_id = input.users.find(row => row.user_id !== 'demo_admin').user_id;
    if (condition === 'inactive-owner') input.users.find(row => row.user_id === input.user.user_id).status = 'inactive';
    if (condition === 'client') input.clients.find(row => row.client_id === CID).environment = 'Production';
    if (condition === 'archived') input.clients.find(row => row.client_id === CID).archived = true;
    if (condition === 'name') input.clients.find(row => row.client_id === CID).name = 'Retained visitor client name';
    if (condition === 'group') input.clients.find(row => row.client_id === CID).framework_settings['cis-ig1'].implementation_group = 2;
    if (condition === 'anchor') input.cis_demo_refresh.anchor = dates.instant(-1);
    if (condition === 'retained') input.cis_demo_refresh.clients[CID].state = 'retained_without_rewrite';
    if (condition === 'reconciliation') input.cis_demo_refresh.reconciliation_required.push({client_id:CID,reason:'Retain original'});
    if (condition === 'different-revision') input.cis_demo_refresh.clients[CID].canonical_revision = 'retained-other-revision';
    if (condition === 'partial-stage') input.reviews.push({review_id:CID+'_canonical_review_partial',client_id:CID});
    const before = copy(input);
    expect(() => buildCanonicalKrustyCandidate(input,{clock:CLOCK})).toThrow(/Krusty candidate/); expect(input).toEqual(before);
  },
);

test.each(['visitor-edit','partial-file'])('a retained %s canonical candidate needs reconciliation and preserves original object arrays', condition => {
  const input = copy(db);
  if (condition === 'visitor-edit') input.framework_assessments.find(row => row.client_id === CID).notes += '\nVisitor assessment note';
  else input.evidence = input.evidence.filter(row => row.evidence_id !== result.evidence[0].evidence_id);
  const before = copy(input), arrays = Object.fromEntries(Object.entries(input).filter(([,value]) => Array.isArray(value)));
  expect(() => buildCanonicalKrustyCandidate(input,{clock:CLOCK})).toThrow(/reconciliation/); expect(input).toEqual(before);
  for (const [kind,rows] of Object.entries(arrays)) expect(input[kind]).toBe(rows);
});

test('a foreign Evidence identity collision cannot replace the foreign bytes or install partial source records', () => {
  const input = copy(fresh);
  input.evidence.push({...copy(result.evidence[0]),client_id:'demo_brawndo',content_base64:btoa('Foreign original bytes')});
  const before = copy(input);
  expect(() => buildCanonicalKrustyCandidate(input,{clock:CLOCK})).toThrow(/collision/); expect(input).toEqual(before);
});

test('41 fixture files reject before registration without publishing any staged mutation', () => {
  const input = copy(fresh), before = copy(input);
  const arrays = Object.fromEntries(Object.entries(input).filter(([,value]) => Array.isArray(value)));
  jest.spyOn(books,'krustyArtifactSpecs').mockReturnValue(Array.from({length:41},(_,index) => ({key:'record-books-'+(index+1)})));
  const register = jest.spyOn(artifacts,'registerCisDemoArtifacts');
  expect(() => buildCanonicalKrustyCandidate(input,{clock:CLOCK})).toThrow('book count or source identities exceed the native contract');
  expect(register).not.toHaveBeenCalled();expect(input).toEqual(before);
  for (const [kind,rows] of Object.entries(arrays)) expect(input[kind]).toBe(rows);
});

test('a foreign source relationship fails before registration and publishes no staged history or files', () => {
  const input = copy(fresh), before = copy(input), native = books.krustyArtifactSpecs;
  jest.spyOn(books,'krustyArtifactSpecs').mockImplementation(anchor => {
    const values = native(anchor);
    values[0].relationships.push({kind:'framework_assessments',id:input.framework_assessments.find(row => row.client_id === 'demo_brawndo').framework_assessment_id});
    return values;
  });
  const register = jest.spyOn(artifacts,'registerCisDemoArtifacts');
  expect(() => buildCanonicalKrustyCandidate(input,{clock:CLOCK})).toThrow(/same-client record/);
  expect(register).not.toHaveBeenCalled(); expect(input).toEqual(before);
});

test('failure after actual native registration leaves every original record, map, receipt and array unpublished', () => {
  const input = copy(fresh), before = copy(input), native = artifacts.registerCisDemoArtifacts;
  const arrays = Object.fromEntries(Object.entries(input).filter(([,value]) => Array.isArray(value)));
  const register = jest.spyOn(artifacts,'registerCisDemoArtifacts').mockImplementation((...args) => {
    expect(native(...args)).toBe(true);
    throw new Error('Injected failure after native registration');
  });
  expect(() => buildCanonicalKrustyCandidate(input,{clock:CLOCK})).toThrow('Injected failure after native registration');
  expect(register).toHaveBeenCalledTimes(1); expect(input).toEqual(before);
  for (const [kind,rows] of Object.entries(arrays)) expect(input[kind]).toBe(rows);
});

test('a registered link without its actual compiled bytes cannot create a verification observation or publish partial changes', () => {
  const input = copy(fresh), before = copy(input), native = artifacts.registerCisDemoArtifacts;
  const register = jest.spyOn(artifacts,'registerCisDemoArtifacts').mockImplementation((staged,evidence,recipes) => {
    expect(native(staged,evidence,recipes)).toBe(true);
    delete evidence[0].content_base64;
    return true;
  });
  expect(() => buildCanonicalKrustyCandidate(input,{clock:CLOCK})).toThrow(/actual same-client registered book bytes/);
  expect(register).toHaveBeenCalledTimes(1); expect(input).toEqual(before);
});
