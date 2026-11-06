import {seedStore,ids} from './store';
import {preExpansionCisFixture} from '../testUtils/preExpansionCisFixture';
import {krustyArtifactModel} from './cisCanonicalKrustyModel';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {cisSummary} from '../lib/cisVerification';
import {reviewSchedule} from '../lib/reviewOccurrences';
import rules from '../lib/grcRules.json';
import {lightweightStore,restoreFiles,clearFileCache} from './evidenceStorage';
import {writePortfolioStore,readPortfolioStore} from './portfolioReporting';
import {MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {canonicalReviewForecast} from './cisCanonicalReviewForecast';
import {CIS_CANONICAL_SCENARIO_REVISION,canonicalArtifactLimit} from './cisCanonicalArtifactBooks';
import {krustyHistoryVolumePlan} from './cisCanonicalKrustyVolume';

const {createHash} = require('crypto');
const CLOCK = new Date('2026-11-04T12:00:00.000Z'), K = 'demo_krusty_krab';
const CLIENTS = ['demo_brawndo','demo_initech',K], physicalLimit = 5*1024*1024;
const PRIVATE_FLAGS = ['REACT_APP_PREVIEW','REACT_APP_DEMO_ONBOARDING_CLIENT',
  'REACT_APP_CIS_BRAWNDO_CANDIDATE_QA','REACT_APP_CIS_INITECH_CANDIDATE_QA','REACT_APP_CIS_KRUSTY_CANDIDATE_QA'];
const originalFlags = Object.fromEntries(PRIVATE_FLAGS.map(key => [key,process.env[key]]));
const copy = value => JSON.parse(JSON.stringify(value));
const utf8 = value => Buffer.byteLength(JSON.stringify(value),'utf8');
const sha256 = content => createHash('sha256').update(Buffer.from(content,'base64')).digest('hex');
const owned = row => CLIENTS.includes(row?.client_id)
  || CLIENTS.some(cid => row?.program_id?.startsWith(cid+':'));
const clientMaps = ['baselines','drafts','ai_intake','ai_counters','riskSequences','cis_demo_scenario_history'];
const guidedMaps = ['guided_assessment_pilot','guided_assessment_history'];
const receiptMaps = ['create_requests','vendor_action_requests','command_requests'];
let db, krusty, originalForeign, originalClients, originalUsers, originalContacts, originalFiles, report;

function domainRecords(value) {
  const result = copy(value);
  // Native read retains opaque serialization pools; expanded domain records
  // remain compared in full, including all historical scopes and references.
  for (const key of ['storage_version','source_records','source_vectors']) delete result.portfolio_reporting?.[key];
  return result;
}

function foreignState(value) {
  const result = domainRecords(value);
  for (const [key,rows] of Object.entries(result)) if (Array.isArray(rows) && !['users','contacts'].includes(key))
    result[key] = rows.filter(row => !owned(row));
  for (const key of clientMaps) if (result[key])
    result[key] = Object.fromEntries(Object.entries(result[key]).filter(([cid]) => !CLIENTS.includes(cid)));
  const targetAssessments = (value.framework_assessments || []).filter(owned).map(row => row.framework_assessment_id);
  for (const key of guidedMaps) if (result[key]) result[key] = Object.fromEntries(Object.entries(result[key])
    .filter(([id,row]) => !owned(row) && !targetAssessments.some(assessment => id.startsWith(assessment+':'))));
  for (const key of receiptMaps) if (result[key]) result[key] = Object.fromEntries(Object.entries(result[key])
    .filter(([scope]) => !CLIENTS.includes(JSON.parse(scope)[1])));
  // Native staged construction may materialize these optional empty maps.
  // Normalize absence only; every nonempty foreign entry remains compared.
  for (const key of ['ai_intake','command_requests','guided_assessment_pilot']) if (result[key]
    && typeof result[key] === 'object' && !Array.isArray(result[key]) && !Object.keys(result[key]).length) delete result[key];
  for (const key of ['cis_demo_refresh','cis_demo_rollout']) if (result[key]) {
    result[key].clients = Object.fromEntries(Object.entries(result[key].clients || {}).filter(([cid]) => !CLIENTS.includes(cid)));
    result[key].reconciliation_required = (result[key].reconciliation_required || []).filter(row => !owned(row));
  }
  if (result.portfolio_reporting) {
    for (const key of ['snapshots','identities','scope_events','source_refresh_proofs'])
      if (result.portfolio_reporting[key]) result.portfolio_reporting[key] = result.portfolio_reporting[key].filter(row => !owned(row));
    // Recompute this scope-wide aggregate after projecting away owned programs,
    // exactly as native capture derives it; no retained snapshot date changes.
    result.portfolio_reporting.last_captured_at = (result.portfolio_reporting.snapshots || []).at(-1)?.captured_at || null;
    const audits = new Set((value.logs || []).filter(owned).flatMap(row => [row.audit_id,row.log_id]).filter(Boolean));
    if (result.portfolio_reporting.activity_proofs) result.portfolio_reporting.activity_proofs =
      Object.fromEntries(Object.entries(result.portfolio_reporting.activity_proofs).filter(([id]) => !audits.has(id)));
    if (result.portfolio_reporting.fixture_versions) delete result.portfolio_reporting.fixture_versions['brawndo-cis-ig1-history-v2'];
  }
  return result;
}

const identity = row => ({client_id:row.client_id,name:row.name,logo:row.logo,logo_url:row.logo_url,
  framework_settings:row.framework_settings});
const fileFacts = row => ({client_id:row.client_id,filename:row.filename,size:row.size,mime_type:row.mime_type,
  native_stored_sha256:row.sha256 ?? null,sha256_calculated:sha256(row.content_base64)});

function saveReport() {
  if (!process.env.CIS_REBUILD_AUDIT_OUTPUT) return;
  const fs = require('fs'), path = require('path'), directory = process.env.CIS_REBUILD_AUDIT_OUTPUT;
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'FULL-COHORT-CAPACITY.json'),JSON.stringify(report,null,2)+'\n');
}
function check(name, operation) {
  report.checks[name] = {state:'running'};
  try {operation();report.checks[name] = {state:'passed'};}
  catch (error) {report.checks[name] = {state:'failed',name:error.name,message:error.message};throw error;}
  finally {saveReport();}
}

beforeAll(() => {
  for (const key of PRIVATE_FLAGS) delete process.env[key];
  jest.useFakeTimers().setSystemTime(CLOCK);
  report = {anchor:cisDemoFixtureDates(CLOCK).anchor,timezone:'UTC',phase:'source initialization',checks:{},
    scope:'Actual whole source cohort: complete Brawndo,Initech,Krusty; unmodified source Dunder/Prestige.',
    limitation:'Source/storage qualification only. Controlled value budget is not actual Browser quota, native downloads, authenticated use or hosted acceptance. Separately proposed Dunder/Prestige work is not integrated. Synchronous construction timing is not Browser responsiveness or lifecycle qualification.',
    native_browser_verified:false,native_decode_limit_bytes:MAX_DEMO_DECODE_BYTES,
    controlled_physical_limit_utf16_bytes:physicalLimit,native_roundtrip:false};
  saveReport();
  try {
    // The old source is only an independent preservation reference. Capacity,
    // links, histories, bytes and forecasting below use actual default entry once.
    const source = preExpansionCisFixture(CLOCK);
    originalForeign = foreignState(source);
    originalClients = copy(source.clients.map(identity)); originalUsers = copy(source.users); originalContacts = copy(source.contacts);
    report.phase = 'normal fresh default cohort'; saveReport(); db = seedStore(CLOCK);
    report.source_client_order = db.clients.map(row => row.client_id);
    // The isolated source model supplies the expected native volume/origin plan;
    // every tested record is resolved from the normal delivered cohort.
    const expected = krustyArtifactModel(report.anchor);
    const mine = kind => db[kind].filter(row => row.client_id === K);
    const programReviewIds = new Set(expected.program.reviews.map(row => row.review_id));
    const assessments = mine('framework_assessments'), marker = db.cis_demo_refresh.clients[K];
    expect(marker.assessment_origin).toBe(expected.program.origin);
    expect(marker.organizational_history_start).toBe(expected.history.organization_origin);
    const times = [...new Set(assessments.flatMap(row => row.assessment_history.map(event => event.at)))].sort();
    const firstFull = times.find(at => assessments.every(row => row.assessment_history
      .filter(event => event.at<=at).at(-1)?.status === 'addressed')) || null;
    expect(firstFull).toBe(expected.history.first_fully_implemented_at);
    krusty = {program:{...expected.program,assessments,policies:mine('policies'),
      reviews:mine('reviews').filter(row => programReviewIds.has(row.review_id))},
      history:{...expected.history,reviews:mine('reviews'),origin:marker.assessment_origin.slice(0,10),
        organization_origin:marker.organizational_history_start,first_fully_implemented_at:firstFull},evidence:mine('evidence')};
    originalFiles = new Map(db.evidence.filter(owned).map(row => [row.evidence_id,fileFacts(row)]));
    report.raw_full_utf8_bytes = utf8(db);
    report.counts = Object.fromEntries(CLIENTS.map(cid => [cid,Object.fromEntries(Object.entries(db)
      .filter(([,value]) => Array.isArray(value)).map(([key,rows]) => [key,rows.filter(row => row.client_id === cid).length]))]));
    report.distribution = Object.fromEntries(CLIENTS.map(cid => [cid,cisSummary(db.framework_assessments
      .filter(row => row.client_id === cid && row.framework_key === 'cis-ig1'),CLOCK)]));
    report.historical_occurrences = Object.fromEntries(CLIENTS.map(cid => [cid,db.reviews.filter(row => row.client_id === cid)
      .reduce((sum,row) => sum+(row.occurrences || []).length,0)]));
    report.original_canonical_files = Object.fromEntries(originalFiles);
    report.phase = 'constructed; checks pending';
  } catch (error) {
    report.construction_failure = {phase:report.phase,name:error.name,message:error.message}; throw error;
  } finally {saveReport();}
});
afterAll(() => {
  clearFileCache();jest.useRealTimers();saveReport();
  for (const [key,value] of Object.entries(originalFlags)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('the real complete cohort reconciles native status totals while preserving every unrelated source scope', () => check('cohort_and_preservation', () => {
  expect(db.portfolio_reporting.last_captured_at).toBe(db.portfolio_reporting.snapshots.at(-1)?.captured_at || null);
  expect(foreignState(db)).toEqual(originalForeign);
  expect(db.clients.map(identity)).toEqual(originalClients);
  expect(db.users).toEqual(originalUsers); expect(db.contacts).toEqual(originalContacts);
  for (const [cid,total,addressed,partial,gap,notAssessed] of [
    ['demo_brawndo',56,48,4,2,2],['demo_initech',130,120,7,1,2],[K,153,153,0,0,0]
  ]) expect(report.distribution[cid]).toMatchObject({total,applicable:total,addressed,partial,gap,notAssessed});
  expect(krusty.program.assessments.filter(row => row.verification === 'verified')).toHaveLength(151);
  expect(krusty.program.assessments.filter(row => row.verification === 'needs_validation').map(row => row.definition_id).sort())
    .toEqual(['15.5','18.5']);
  expect(report.counts[K]).toMatchObject({policies:9,reviews:70,risks:29,vendors:15,ai_systems:3});
  expect([...originalFiles.values()].filter(row => row.client_id === 'demo_brawndo')).toHaveLength(31);
  expect([...originalFiles.values()].filter(row => row.client_id === 'demo_initech')).toHaveLength(30);
  expect([...originalFiles.keys()].filter(id => id.startsWith(K+'_'))).toEqual(krusty.evidence.map(row => row.evidence_id));
}));

test('canonical links resolve to the same client and real occurrences and current IG3 obligations do not contradict implementation', () => check('relationships_and_current_obligations', () => {
  const records = Object.fromEntries(Object.entries(ids).filter(([kind]) => Array.isArray(db[kind]))
    .map(([kind,field]) => [kind,new Map(db[kind].map(row => [row[field],row]))]));
  const verifyLink = (cid,link) => {
    const target = records[link.kind]?.get(link.id);
    expect(target?.client_id).toBe(cid);
    if (link.occurrence_id) {
      expect(link.kind).toBe('reviews');
      expect(target.occurrences.filter(row => row.occurrence_id === link.occurrence_id)).toHaveLength(1);
    }
    return target;
  };
  let checked = 0;
  for (const [kind] of Object.entries(ids)) for (const row of (db[kind] || []).filter(owned))
    for (const link of row.related_links || []) {verifyLink(row.client_id,link);checked++;}
  for (const file of db.evidence.filter(owned)) {
    expect(file.size).toBeGreaterThan(0);expect(file.size).toBeLessThanOrEqual(DEMO_INLINE_LIMIT);
    expect(file.relationships.length).toBeGreaterThan(0);expect(file.relationships.length).toBeLessThanOrEqual(100);
    for (const link of file.relationships) {
      const target = verifyLink(file.client_id,link);checked++;
      if (link.occurrence_id) expect(target.occurrences.find(row => row.occurrence_id === link.occurrence_id).evidence)
        .toContainEqual(expect.objectContaining({evidence_id:file.evidence_id}));
      else expect(target.related_links).toContainEqual({kind:'evidence',id:file.evidence_id});
    }
  }
  expect(checked).toBeGreaterThan(originalFiles.size);
  expect(krusty.program.reviews).toHaveLength(19);
  expect(krusty.program.reviews.every(row => row.due_date.slice(0,10) > report.anchor.slice(0,10)
    && !rules.closed.reviews.includes(row.status))).toBe(true);
  expect(krusty.program.policies.every(row => row.status === 'approved' && row.approval_subject?.subject_id)).toBe(true);
  expect(db.findings.filter(row => row.client_id === K && row.framework_assessment_id
    && !rules.closed.findings.includes(row.status))).toEqual([]);
  const weekly = krusty.program.reviews.find(row => row.framework_setup_key === 'fw_'+K+'_review_requirement:8.11');
  expect(weekly).toBeDefined();
  expect(weekly).toMatchObject({recurrence:'custom',custom_recurrence_days:7});
  const recovery = krusty.program.reviews.find(row => row.framework_setup_key === 'fw_'+K+'_review_requirement:11.5');
  expect(recovery).toBeDefined();expect(recovery.recurrence).toBe('quarterly');
  expect(krusty.program.reviews.find(row => row.framework_plan_key === 'script-allowlist-reassessment').recurrence).toBe('semiannual');
  expect(krusty.program.reviews.find(row => row.framework_plan_key === 'event-alert-tuning').recurrence).toBe('monthly');
  report.relationships_checked = checked;
}));

test('the full native store survives existing decode and physical budgets and cache loss with every canonical file intact', () => check('native_roundtrip_and_files', () => {
  let saved;
  const attempts = [], lightweight = lightweightStore(db);
  const storage = {setItem(_key,value) {
    attempts.push({utf16_bytes:value.length*2,accepted:value.length*2<=physicalLimit});
    if (value.length*2>physicalLimit) throw new DOMException('Controlled existing 5MiB capacity','QuotaExceededError');
    saved = value;
  }};
  report.lightweight_utf8_bytes = utf8(lightweight);
  try {
    writePortfolioStore(storage,'synthetic_full_canonical_cohort',lightweight);
    const encoded = JSON.parse(saved);
    report.encoded_utf8_bytes = encoded.demo_storage_codec ? encoded.utf8_bytes : Buffer.byteLength(saved,'utf8');
    report.stored_utf16_bytes = saved.length*2;report.codec = encoded.demo_storage_codec || 'plain JSON';
    expect(report.encoded_utf8_bytes).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
    expect(report.stored_utf16_bytes).toBeLessThanOrEqual(physicalLimit);
    clearFileCache();
    const restored = restoreFiles(readPortfolioStore(saved));
    // Native read expands compact Review/reporting snapshots. Only intentionally
    // omitted file payloads differ from the complete in-memory source object.
    expect(domainRecords({...restored,evidence:db.evidence})).toEqual(domainRecords(db));
    expect(restored.evidence).toEqual(copy(lightweight.evidence));
    const expectedForeign = foreignState(db);expectedForeign.evidence = foreignState(lightweight).evidence;
    expect(foreignState(restored)).toEqual(expectedForeign);
    const recovered = {};
    let fallbackCount = 0;
    for (const row of restored.evidence.filter(owned)) {
      const file = row.content_base64 ? row : restoredCisDemoEvidence(restored,row);
      if (!row.content_base64) fallbackCount++;
      expect(file).toBeTruthy();
      expect(Buffer.from(file.content_base64,'base64').length).toBe(row.size);
      recovered[row.evidence_id] = fileFacts(file);
      expect(recovered[row.evidence_id]).toEqual(originalFiles.get(row.evidence_id));
    }
    expect(Object.keys(recovered).sort()).toEqual([...originalFiles.keys()].sort());
    expect(fallbackCount).toBeGreaterThan(0);
    report.restored_canonical_files = recovered;report.all_canonical_file_id_size_mime_sha256_match = true;
    report.files_restored_through_existing_fixture_provider = fallbackCount;
    report.native_roundtrip = true;
  } finally {report.write_attempts = attempts;saveReport();}
}));

test('the full Krusty history retains every planned native period and future schedules without future completions', () => check('complete_history_and_cycles', () => {
  const periods = krusty.history.reviews.flatMap(row => row.occurrences);
  expect(krusty.history.volume_plan.complete).toBe(true);
  expect(periods).toHaveLength(krusty.history.volume_plan.counts.planned_past_periods);
  expect(periods).toHaveLength(514);
  expect(new Set(periods.map(row => row.occurrence_id)).size).toBe(periods.length);
  for (const review of krusty.history.reviews) {
    const plan = krusty.history.volume_plan.reviews.find(row => row.review_id === review.review_id);
    expect(review.occurrences.map(row => row.due_date)).toEqual(plan.due_dates);
    for (const occurrence of review.occurrences) {
      expect(occurrence.status).toBe('completed');
      expect(occurrence.completed_at < report.anchor).toBe(true);
      expect(occurrence.created_at <= occurrence.completed_at).toBe(true);
      expect(occurrence.due_date).not.toBe(review.due_date);
      expect(occurrence.next_review_date).toBe(reviewSchedule({...review,due_date:occurrence.due_date,recurrence_due_date:null}).next_review_date);
      expect(occurrence.evidence.length).toBeGreaterThan(0);
    }
  }
  for (const assessment of krusty.program.assessments) {
    expect(assessment.assessment_history.length).toBeGreaterThan(1);
    expect(assessment.assessment_history.every(row => row.at >= '2024-07-01T00:00:00.000Z' && row.at <= report.anchor)).toBe(true);
    expect(assessment.assessment_history.at(-1)).toMatchObject({at:report.anchor,verification:assessment.verification,status:assessment.status});
  }
  report.krusty_history = {parents:krusty.history.reviews.length,periods:periods.length,
    organization_origin:krusty.history.organization_origin,framework_origin:krusty.history.origin,
    first_fully_implemented_at:krusty.history.first_fully_implemented_at};
}));

test('native twelve-month forecasting excludes all eleven terminal parents and does not persist projected work', () => check('twelve_month_forecast', () => {
  const before = copy(db.reviews), dates = cisDemoFixtureDates(CLOCK);
  const forecast = canonicalReviewForecast(db.reviews,{client_id:K,anchor:dates.anchor});
  const terminal = db.reviews.filter(row => row.client_id === K &&
    (row.risk_id && db.risks.some(risk => risk.risk_id === row.risk_id && risk.status === 'closed')
      || row.vendor_id && db.vendors.some(vendor => vendor.vendor_id === row.vendor_id && vendor.status === 'inactive')));
  expect(terminal).toHaveLength(11);
  expect(forecast.summary).toMatchObject({active_parents:59,excluded_terminal_parents:11,projection_unavailable:0});
  expect(forecast.excluded_terminal_parents.map(row => row.review_id).sort()).toEqual(terminal.map(row => row.review_id).sort());
  expect(forecast.from_date).toBe(dates.day(0));expect(forecast.through_date).toBe(dates.month(12));
  expect(forecast.items.some(row => row.date>dates.month(11))).toBe(true);
  expect(forecast.items.every(row => row.date>=dates.day(0) && row.date<=dates.month(12)
    && !terminal.some(parent => parent.review_id === row.review_id))).toBe(true);
  expect(db.reviews).toEqual(before);
  report.future_forecast = {through_date:forecast.through_date,...forecast.summary,saved_occurrences_created:0};
}));

test('the explicit pre-expansion 2028 leap-day cohort retains the original 4M full raw JSON ceiling', () => check('historical_4M_baseline', () => {
  const clock = new Date('2028-02-29T12:00:00Z');
  // Preserve both the original explicit seed clock and demoPortfolio's ambient fake clock.
  const ambient = new Date('2026-10-13T17:00:00.000Z');jest.setSystemTime(ambient);
  try {
    const legacy = preExpansionCisFixture(clock);
    for (const cid of CLIENTS) expect(legacy.cis_demo_refresh.clients[cid].canonical_revision).toBeUndefined();
    report.historical_4M_baseline = {clock:clock.toISOString(),ambient_clock:ambient.toISOString(),construction:'preExpansionCisFixture; legacy v2 full whole cohort',
      representation:'JSON.stringify(full legacy store), including file payloads',raw_characters:JSON.stringify(legacy).length,
      original_raw_character_limit:4000000};
    expect(JSON.stringify(legacy).length).toBeLessThan(4000000);
  } finally {jest.setSystemTime(CLOCK);clearFileCache();}
}));

test.each([
  ['the real normal 2030 cohort preserves all native records and ninety-eight files through unchanged codec and physical budgets',
    '2030-01-01T12:00:00.000Z','FULL-COHORT-2030-CAPACITY.json'],
  ['the real normal 2030-05-15 Dunder anchor cohort preserves all native records and original files through unchanged codec and physical budgets',
    '2030-05-15T12:00:00.000Z','FULL-COHORT-2030-05-15-CAPACITY.json'],
])('%s', (_name,clock,reportFile) => {
  const futureClock = new Date(clock), anchor = cisDemoFixtureDates(futureClock).anchor;
  const pinnedJan1 = clock === '2030-01-01T12:00:00.000Z';
  const futureReport = {anchor,timezone:'UTC',phase:'before normal construction',checks:{},
    scope:'Real normal seedStore 2030 cohort, including complete Brawndo,Initech,Krusty and source Dunder/Prestige.',
    limitation:'Source/storage regression only; controlled value budget is not actual Browser quota, downloads, authenticated use, hosted acceptance or responsiveness.',
    canonical_file_basis:'Exact original bytes captured from this real 2030 normal cohort before persistence; not a historical download manifest.',
    native_browser_verified:false,native_decode_limit_bytes:MAX_DEMO_DECODE_BYTES,
    controlled_physical_limit_utf16_bytes:physicalLimit,native_roundtrip:false};
  const attempts = [];
  const save = () => {
    if (!process.env.CIS_REBUILD_AUDIT_OUTPUT) return;
    const fs = require('fs'), path = require('path'), directory = process.env.CIS_REBUILD_AUDIT_OUTPUT;
    fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,reportFile),JSON.stringify(futureReport,null,2)+'\n');
  };
  try {
    save();
    jest.setSystemTime(futureClock);
    for (const flag of PRIVATE_FLAGS) expect(process.env[flag]).toBeUndefined();
    futureReport.phase = 'real normal 2030 construction';save();
    const future = seedStore(futureClock);
    for (const cid of CLIENTS) {
      expect(future.cis_demo_refresh.clients[cid].canonical_revision).toBe(CIS_CANONICAL_SCENARIO_REVISION);
      expect(future.cis_demo_rollout.clients[cid].canonical_revision).toBe(CIS_CANONICAL_SCENARIO_REVISION);
    }
    const source = domainRecords(future), files = new Map(future.evidence.filter(owned)
      .map(row => [row.evidence_id,fileFacts(row)]));
    const reviews = future.reviews.filter(row => row.client_id === K);
    const marker = future.cis_demo_refresh.clients[K];
    const volume = krustyHistoryVolumePlan(reviews,{anchor,organization_origin:marker.organizational_history_start,
      framework_origin:marker.assessment_origin});
    expect(volume.complete).toBe(true);expect(volume.unresolved).toEqual([]);
    expect(volume.counts).toMatchObject({review_parents:70,framework_review_parents:19,supplemental_review_parents:51});
    for (const review of reviews) expect(review.occurrences.map(row => row.due_date))
      .toEqual(volume.reviews.find(row => row.review_id === review.review_id).due_dates);
    futureReport.raw_full_utf8_bytes = utf8(future);
    futureReport.source_client_order = future.clients.map(row => row.client_id);
    futureReport.canonical_file_counts = Object.fromEntries(CLIENTS.map(cid =>
      [cid,future.evidence.filter(row => row.client_id === cid).length]));
    futureReport.original_canonical_files = Object.fromEntries(files);
    futureReport.krusty_history = {parents:reviews.length,
      periods:reviews.reduce((sum,row) => sum+(row.occurrences || []).length,0)};
    futureReport.phase = 'constructed; native cohort checks';save();

    expect(futureReport.source_client_order).toEqual(db.clients.map(row => row.client_id));
    expect(futureReport.source_client_order).toEqual(expect.arrayContaining([...CLIENTS,'demo_dunder','demo_prestige']));
    expect(new Set(futureReport.source_client_order).size).toBe(futureReport.source_client_order.length);
    expect(futureReport.canonical_file_counts.demo_brawndo).toBe(31);
    expect(futureReport.canonical_file_counts.demo_initech).toBe(30);
    expect(futureReport.canonical_file_counts[K]).toBeGreaterThan(0);
    expect(futureReport.canonical_file_counts[K]).toBeLessThanOrEqual(canonicalArtifactLimit(K,CIS_CANONICAL_SCENARIO_REVISION));
    expect(files.size).toBe(Object.values(futureReport.canonical_file_counts).reduce((sum,count) => sum+count,0));
    expect(futureReport.krusty_history).toEqual({parents:70,periods:volume.counts.planned_past_periods});
    if (pinnedJan1) {
      expect(futureReport.canonical_file_counts).toEqual({demo_brawndo:31,demo_initech:30,[K]:37});
      expect(files.size).toBe(98);
      expect(futureReport.krusty_history).toEqual({parents:70,periods:979});
    }
    futureReport.volume_plan = volume;
    for (const review of reviews) for (const occurrence of review.occurrences || []) {
      expect(occurrence.status).toBe('completed');
      expect(occurrence.completed_at < anchor).toBe(true);
    }
    expect(future.framework_assessments.filter(row => row.client_id === K && row.status === 'addressed')).toHaveLength(153);
    expect(future.framework_assessments.filter(row => row.client_id === K && row.verification === 'verified')).toHaveLength(151);
    expect(future.framework_assessments.filter(row => row.client_id === K && row.verification === 'needs_validation')
      .map(row => row.definition_id).sort()).toEqual(['15.5','18.5']);
    futureReport.checks.normal_cohort_and_history = {state:'passed'};

    let saved;
    const lightweight = lightweightStore(future), storage = {setItem(_key,value) {
      attempts.push({utf16_bytes:value.length*2,accepted:value.length*2<=physicalLimit});
      if (value.length*2>physicalLimit) throw new DOMException('Controlled existing 5MiB capacity','QuotaExceededError');
      saved = value;
    }};
    futureReport.lightweight_utf8_bytes = utf8(lightweight);
    futureReport.phase = 'native codec write under existing budgets';save();
    writePortfolioStore(storage,'synthetic_full_canonical_cohort_2030',lightweight);
    const encoded = JSON.parse(saved);
    futureReport.encoded_utf8_bytes = encoded.demo_storage_codec ? encoded.utf8_bytes : Buffer.byteLength(saved,'utf8');
    futureReport.stored_utf16_bytes = saved.length*2;futureReport.codec = encoded.demo_storage_codec || 'plain JSON';
    expect(futureReport.encoded_utf8_bytes).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
    expect(futureReport.stored_utf16_bytes).toBeLessThanOrEqual(physicalLimit);
    futureReport.checks.native_codec_and_budgets = {state:'passed'};

    futureReport.phase = 'cache loss and native record restoration';save();
    clearFileCache();
    const restored = restoreFiles(readPortfolioStore(saved));
    expect(domainRecords({...restored,evidence:future.evidence})).toEqual(source);
    expect(restored.evidence).toEqual(copy(lightweight.evidence));
    const records = Object.fromEntries(Object.entries(ids).filter(([kind]) => Array.isArray(restored[kind]))
      .map(([kind,field]) => [kind,new Map(restored[kind].map(row => [row[field],row]))]));
    const verifyLink = (cid,link) => {
      const target = records[link.kind]?.get(link.id);
      expect(target?.client_id).toBe(cid);
      if (link.occurrence_id) {
        expect(link.kind).toBe('reviews');
        expect(target.occurrences.filter(row => row.occurrence_id === link.occurrence_id)).toHaveLength(1);
      }
    };
    let checked = 0;
    for (const [kind] of Object.entries(ids)) for (const row of (restored[kind] || []).filter(owned))
      for (const link of row.related_links || []) {verifyLink(row.client_id,link);checked++;}
    const primaryKinds = {framework_assessment:'framework_assessments',review:'reviews',risk:'risks',
      policy:'policies',vendor:'vendors',ai_system:'ai_systems',task:'tasks',finding:'findings'};
    for (const row of restored.evidence.filter(owned)) {
      expect(row.size).toBeGreaterThan(0);expect(row.size).toBeLessThanOrEqual(DEMO_INLINE_LIMIT);
      expect(row.relationships.length).toBeGreaterThan(0);expect(row.relationships.length).toBeLessThanOrEqual(100);
      verifyLink(row.client_id,{kind:primaryKinds[row.linked_type],id:row.linked_id,occurrence_id:row.occurrence_id});
      for (const link of row.relationships) {verifyLink(row.client_id,link);checked++;}
    }
    expect(checked).toBeGreaterThan(files.size);
    expect(restored.reviews.filter(row => row.client_id === K)).toHaveLength(70);
    expect(restored.reviews.filter(row => row.client_id === K)
      .reduce((sum,row) => sum+(row.occurrences || []).length,0)).toBe(volume.counts.planned_past_periods);
    if (pinnedJan1) expect(restored.reviews.filter(row => row.client_id === K)
      .reduce((sum,row) => sum+(row.occurrences || []).length,0)).toBe(979);
    futureReport.relationships_checked = checked;futureReport.checks.native_records_and_relationships = {state:'passed'};

    futureReport.phase = 'all original file payloads ('+files.size+')';save();
    const recovered = {};
    let fallbackCount = 0;
    for (const row of restored.evidence.filter(owned)) {
      const file = row.content_base64 ? row : restoredCisDemoEvidence(restored,row);
      if (!row.content_base64) fallbackCount++;
      expect(file).toBeTruthy();
      expect(Buffer.from(file.content_base64,'base64').length).toBe(row.size);
      expect(file).toEqual({...row,content_base64:file.content_base64});
      recovered[row.evidence_id] = fileFacts(file);
      expect(recovered[row.evidence_id]).toEqual(files.get(row.evidence_id));
    }
    expect(Object.keys(recovered).sort()).toEqual([...files.keys()].sort());
    expect(Object.keys(recovered)).toHaveLength(files.size);
    if (pinnedJan1) expect(Object.keys(recovered)).toHaveLength(98);
    expect(fallbackCount).toBeGreaterThan(0);
    expect(domainRecords(future)).toEqual(source);
    futureReport.restored_canonical_files = recovered;
    futureReport.files_restored_through_existing_fixture_provider = fallbackCount;
    futureReport.all_canonical_file_id_size_mime_sha256_match = true;
    futureReport.checks.all_original_files_and_unchanged_source = {state:'passed'};
    futureReport.native_roundtrip = true;futureReport.phase = 'all checks passed';
  } catch (error) {
    futureReport.failure = {phase:futureReport.phase,name:error.name,message:error.message};
    throw error;
  } finally {
    futureReport.write_attempts = attempts;
    try {save();} finally {jest.setSystemTime(CLOCK);clearFileCache();}
  }
});
