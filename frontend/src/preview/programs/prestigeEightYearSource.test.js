import fs from 'fs';
import path from 'path';
import {seedStoreBeforePrestige, saveStore, readStore, write, STORE_KEY} from '../store';
import {clearFileCache, restoreFiles, storageDiagnostics} from '../evidenceStorage';
import {stable} from '../commandRequests';
import {createPrestigeEightYearSource} from './prestigeEightYearSource';
import {materializePrestigeEightYearFixture, installPrestigeEightYearFixture} from './prestigeEightYearFixture';
import {PRESTIGE_OPERATING_BUNDLE_KEYS} from './prestigeOperatingArtifacts';
import {demoCurrentPositions, portfolioReportingRequest, readPortfolioStore} from '../portfolioReporting';
import {getPrestigeDemoScenarioContext} from './prestigePreparedHistory';

// Replay the exact immutable V2-authored source-generation contract only in this
// suite. Actual materialized startup/current rollout coverage remains unpatched.
jest.mock('../../lib/socGuidedAssessment',()=>({
  ...jest.requireActual('../../lib/socGuidedAssessment'),
  socGuidedCatalog:jest.requireActual('@catalogs/guidedSoc2.json'),
}));

const CID = 'demo_prestige', CLOCK = new Date('2026-11-08T00:00:00.000Z');
const historicalDates = ['2018-11-02', '2019-10-18', '2020-10-23', '2022-04-01',
  '2022-10-21', '2023-11-17', '2024-10-18', '2025-10-17'];
function documents() {
  const issued = new Date().toISOString();
  return Object.fromEntries(PRESTIGE_OPERATING_BUNDLE_KEYS.map((key, index) => [key, {
    document_date: index < 8 ? historicalDates[index] : issued.slice(0, 10),
    available_at: index < 8 ? historicalDates[index] + 'T23:59:59.999Z' : issued,
    version: 'synthetic-reconstruction-1',
  }]));
}
let source, original, scenario, fixture, installed;
beforeAll(async () => {
  const prior = process.env.REACT_APP_PREVIEW;
  process.env.REACT_APP_PREVIEW = 'true';
  try { source = seedStoreBeforePrestige(CLOCK); }
  finally { if (prior === undefined) delete process.env.REACT_APP_PREVIEW; else process.env.REACT_APP_PREVIEW = prior; }
  original = stable(source);
  scenario = await createPrestigeEightYearSource(source,
    {purpose: 'eight_year_source_qa', document_facts: documents});
  fixture = await materializePrestigeEightYearFixture(scenario);
  installed = installPrestigeEightYearFixture(source, fixture, {fresh: true, clock: CLOCK}).db;
});
afterAll(() => { clearFileCache(); sessionStorage.removeItem(STORE_KEY); });
const owned = (db, kind) => db[kind].filter(row => row.client_id === CID);

test('complete generation keeps recovery/source/foreign data while retaining the exact native operating cohort', () => {
  expect(stable(source)).toBe(original);
  expect(scenario.backup).toEqual(source);
  expect(scenario.scenarioManifest.status).toBe('source_complete');
  expect(owned(installed, 'framework_assessments')).toHaveLength(38);
  expect(owned(installed, 'organizational_controls')).toHaveLength(25);
  expect(owned(installed, 'organizational_controls').reduce((n, row) => n + row.observations.length, 0)).toBe(31);
  expect(scenario.artifacts.workpapers.reduce((n, paper) => n + paper.members.length, 0)).toBe(256);
  expect(scenario.artifacts.workpapers.reduce((n, paper) => n + paper.members.filter(row => row.detailed).length, 0)).toBe(136);
  expect(owned(installed, 'evidence')).toHaveLength(14);
  for (const bound of scenario.artifactBinding.controls) {
    const control = owned(installed, 'organizational_controls').find(row => row.control_id === bound.control_id);
    const first = control.observations.find(row => row.request_id === bound.populations[0].request_id);
    expect(first.control_revision).toBe(bound.control_revision);
  }
  for (const kind of ['policies', 'reviews', 'risks', 'vendors', 'ai_systems', 'framework_assessments', 'logs', 'evidence'])
    expect(installed[kind].filter(row => row.client_id !== CID)).toEqual(source[kind].filter(row => row.client_id !== CID));
  expect(installed.users).toEqual(source.users); expect(installed.contacts).toEqual(source.contacts);
});

test('native current and authored historical positions reconcile without independent display scores', () => {
  const client = installed.clients.find(row => row.client_id === CID);
  const position = demoCurrentPositions(installed, [client], new Date().toISOString())[0];
  expect(position.current).toMatchObject({implemented: 38, denominator: 38, percentage: 100, assessed: 38, total: 38});
  const points = installed.portfolio_reporting.snapshots.filter(row => row.program_id === CID + ':soc-2');
  expect(points).toHaveLength(8);
  expect(points[0].current.implemented).toBeLessThan(points.at(-1).current.implemented);
  expect(points.find(row => row.effective_at.startsWith('2023')).current.implemented)
    .toBeLessThan(points.find(row => row.effective_at.startsWith('2022')).current.implemented);
  expect(points.find(row => row.effective_at.startsWith('2024')).current.implemented).toBe(38);
  for (const point of points) {
    const refs = point.current.provenance.source_references;
    expect(refs).toHaveLength(38);
    expect(point.current.implemented).toBe(refs.filter(row => row.status === 'addressed').length);
    expect(point.current.percentage).toBe(point.current.implemented / point.current.denominator * 100);
    expect(point.current.provenance.assessment_boundary).toContain('not executed or backdated');
    expect(point.current).not.toHaveProperty('continuity_proven');
    expect(point.current).not.toHaveProperty('effective_until');
  }
});

test('a current native Risk edit remains possible without duplicating its Review or reopening historical Findings', () => {
  const db = JSON.parse(JSON.stringify(installed));
  const risk = owned(db, 'risks').find(row => row.status !== 'closed');
  const parents = owned(db, 'reviews').filter(row => row.risk_id === risk.risk_id).map(row => row.review_id);
  expect(parents).toHaveLength(1);
  const beforeFindings = stable(owned(db, 'findings')), beforeTasks = stable(owned(db, 'tasks'));
  const description = risk.description + ' Disposable native metadata save regression.';
  write(db, 'risks', {description}, risk.risk_id);
  expect(db.risks.find(row => row.risk_id === risk.risk_id).description).toBe(description);
  expect(owned(db, 'reviews').filter(row => row.risk_id === risk.risk_id).map(row => row.review_id)).toEqual(parents);
  expect(stable(owned(db, 'findings'))).toBe(beforeFindings);
  expect(stable(owned(db, 'tasks'))).toBe(beforeTasks);
});

test('exact fictional boundary is labelled fictional; intervening dates and missing proof never claim committed continuity', () => {
  const projected = JSON.parse(JSON.stringify(installed));
  // Fixed query clock exercises a historical boundary after fixture availability; no saved date is rewritten.
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-10-20T00:00:00.000Z'));
  const query = as_of => portfolioReportingRequest(projected, '/portfolio/reporting/history',
    {client_id: CID, program_key: 'soc-2', range: '36m', as_of});
  try {
    expect(query('2027-10-18T12:00:00.000Z').comparison).toMatchObject({comparable: true, calculation_basis: 'demo_scenario'});
    expect(query('2027-10-18T12:00:00.000Z').comparison.reason).toContain('fictional');
    expect(query('2027-10-19T12:00:00.000Z').comparison.comparable).toBe(false);
    delete projected.prestige_eight_year_fixture.history;
    expect(query('2027-10-18T12:00:00.000Z').comparison.comparable).toBe(false);
  } finally { clock.mockRestore(); }
});

test('complete five-client native save/read retains all source records, history and exact fixture payload generation', () => {
  const storage = new Map(), limit = 5 * 1024 * 1024;
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(key => storage.get(key) ?? null);
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
    const next = String(value);
    if (key === STORE_KEY && next.length * 2 > limit) throw new DOMException('Controlled quota exceeded', 'QuotaExceededError');
    storage.set(key, next);
  });
  const remove = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(key => storage.delete(key));
  try {
    clearFileCache();
    const saved = saveStore(installed), raw = storage.get(STORE_KEY), expected = restoreFiles(readPortfolioStore(raw));
    expect(raw.length * 2).toBeLessThanOrEqual(limit);
    const restored = readStore();
    for (const kind of ['policies', 'reviews', 'risks', 'vendors', 'ai_systems', 'framework_assessments', 'organizational_controls'])
      expect({kind, exact_native_hydrated_records: stable(restored[kind]) === stable(expected[kind])})
        .toEqual({kind, exact_native_hydrated_records: true});
    for (const id of scenario.reportingManifest.point_ids)
      expect(restored.portfolio_reporting.snapshots.filter(row => row.snapshot_id === id)).toHaveLength(1);
    clearFileCache();
    const cold = readStore();
    const missing = owned(cold, 'evidence').filter(row => !row.content_base64).map(row => row.evidence_id);
    const directory = process.env.PRESTIGE_CAPACITY_OUTPUT;
    if (directory) {
      fs.writeFileSync(path.join(directory, 'MATERIALIZED-FIXTURE.json'), JSON.stringify(fixture));
      fs.writeFileSync(path.join(directory, 'SCENARIO-RECEIPT.json'), JSON.stringify(scenario.scenarioManifest, null, 2));
      fs.writeFileSync(path.join(directory, 'ARTIFACT-LEDGER.json'), JSON.stringify(scenario.artifacts.ledger, null, 2));
      fs.writeFileSync(path.join(directory, 'COMPLETE-CAPACITY.json'), JSON.stringify({
        scope: 'Controlled Storage5MiB native save/read, not physical Browser qualification',
        raw_characters: JSON.stringify(installed).length, stored_utf16_bytes: raw.length * 2,
        diagnostics: storageDiagnostics(raw, saved), prestige_files: 14,
        metadata_only_prestige_ids_after_cold_read: missing,
        download_qualification: 'Generated identities are not the bundled fixture. All14 bundled native cold downloads have separate provider tests.',
        files: scenario.artifacts.ledger.files,
      }, null, 2));
    }
    expect(scenario.scenarioManifest.counts.evidence).toBe(14);
    expect(owned(saved, 'evidence')).toHaveLength(14);
    // Generation uses new native IDs. Exact bundled identity/byte availability is asserted per file in prestigeDemoEvidence.test.js.
    expect(owned(cold, 'evidence')).toHaveLength(14);
  } finally { get.mockRestore(); set.mockRestore(); remove.mockRestore(); }
});

test('native cold codec roundtrip preserves history proof despite property ordering and rejects a genuine source change', () => {
  const previous = sessionStorage.getItem(STORE_KEY);
  try {
    saveStore(installed, {resetFiles: true}); clearFileCache();
    const restored = readStore(), at = new Date().toISOString();
    expect(getPrestigeDemoScenarioContext(restored, CID, at)?.point_ids).toEqual(scenario.reportingManifest.point_ids);
    const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
    const reordered = reverse(restored);
    expect(getPrestigeDemoScenarioContext(reordered, CID, at)?.point_ids).toEqual(scenario.reportingManifest.point_ids);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-10-20T00:00:00.000Z'));
    try {
      const report = portfolioReportingRequest(restored, '/portfolio/reporting/history',
        {client_id: CID, program_key: 'soc-2', range: '36m', as_of: '2027-10-18T12:00:00.000Z'});
      expect(report.comparison).toMatchObject({comparable: true, calculation_basis: 'demo_scenario'});
      expect(report.comparison.reason).toContain('fictional');
    } finally { clock.mockRestore(); }
    const row = reordered.framework_assessments.find(item => item.client_id === CID);
    row.assessment_history.find(event => event.provenance === 'newly_authored_synthetic_history').implementation += ' changed';
    expect(getPrestigeDemoScenarioContext(reordered, CID, at)).toBeNull();
  } finally {
    if (previous === null) sessionStorage.removeItem(STORE_KEY); else sessionStorage.setItem(STORE_KEY, previous);
    clearFileCache();
  }
});
