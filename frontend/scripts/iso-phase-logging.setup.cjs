// Separate hosted diagnostic setup. Never register this in the normal release campaign.
const fs = jest.requireActual('node:fs'), path = jest.requireActual('node:path'), os = jest.requireActual('node:os');
const timers = jest.requireActual('node:timers');
const {createPhaseLogger, createArtifactWriter} = jest.requireActual(path.join(process.cwd(), 'scripts/iso-phase-logger.cjs'));
const output = process.env.ISO_PHASE_LOG_DIR;
if (!output || !path.isAbsolute(output)) throw new Error('ISO_PHASE_LOG_DIR must name an explicit absolute diagnostic output directory');

const logger = createPhaseLogger(), cases = [];
const captured = {parse: Object.getOwnPropertyDescriptor(JSON, 'parse')?.value,
  stringify: Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value,
  keys: Object.getOwnPropertyDescriptor(Object, 'keys')?.value,
  getItem: Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')?.value};
const frontend = process.cwd();
const phaseModules = [
  ['demoStorageCodec.js', [['decodeDemoStore', false], ['writeDemoStoreAsync', true]]],
  ['portfolioReporting.js', [['readPortfolioStore', false], ['readPortfolioStorePair', false], ['captureDemoReporting', false], ['writePortfolioStoreAsync', true]]],
  ['evidenceStorage.js', [['lightweightStore', false], ['restoreFiles', false], ['rememberFiles', false]]],
  ['store.js', [['readStore', false], ['saveStoreAsync', true]]],
  ['adapter.js', [['previewAdapter', true]]],
];
let interval = null, caseStart = null;
const sourceSHA = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) ? value : null;
const applicationSHA = sourceSHA(process.env.ISO_PHASE_APP_SHA), observedSHA = sourceSHA(process.env.GITHUB_SHA);
if (!applicationSHA || !observedSHA) logger.diagnosticError('missing-source-sha');
const write = createArtifactWriter(output, logger.diagnosticError, fs);
function guardSnapshot() {
  try {
    const portfolio = jest.requireActual(path.join(frontend, 'src/preview/portfolioReporting.js'));
    return {parse: Object.getOwnPropertyDescriptor(JSON, 'parse')?.value === captured.parse,
      stringify: Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value === captured.stringify,
      keys: Object.getOwnPropertyDescriptor(Object, 'keys')?.value === captured.keys,
      getItem: Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')?.value === captured.getItem,
      canFork: portfolio.canForkPortfolioStore()};
  } catch { logger.diagnosticError('guard-observation-failed'); return null; }
}
function wrapLoadedPhases() {
  // Wait for the test's imports: mocking this circular product graph at load time changes behavior.
  for (const [file, entries] of phaseModules) {
    const actual = jest.requireActual(path.join(frontend, 'src/preview', file));
    for (const [name, async] of entries) {
      const descriptor = Object.getOwnPropertyDescriptor(actual, name);
      if (!descriptor || typeof descriptor.value !== 'function' || !descriptor.writable) {
        logger.diagnosticError('phase-binding-unavailable'); continue;
      }
      Object.defineProperty(actual, name, {...descriptor, value: logger.observe(file + ':' + name, descriptor.value, {async})});
    }
  }
}
const commandFile = path.join(frontend, 'src/preview/commandTestAdapter.js');
jest.doMock(commandFile, () => {
  // Only tests import this adapter; requireActual does not reenter a product mock factory.
  const actual = jest.requireActual(commandFile), descriptor = Object.getOwnPropertyDescriptor(actual, 'previewAdapter');
  if (!descriptor || typeof descriptor.value !== 'function' || !descriptor.writable) {
    logger.diagnosticError('command-binding-unavailable'); return actual;
  }
  Object.defineProperty(actual, 'previewAdapter', {...descriptor,
    value: logger.observe('commandTestAdapter.js:previewAdapter', descriptor.value, {async: true, command: true})});
  return actual;
});

function summary(complete = false) {
  const errors = logger.getErrors();
  const expectedCases = cases.map(record => record.framework).join(',') === 'cis-ig1,soc-2,iso-27001';
  return {version: 1, diagnostic_only: true, application_baseline_sha: applicationSHA, observed_source_sha: observedSHA,
    complete, diagnostic_valid: complete && expectedCases && errors.length === 0 && cases.every(record => record.guards_preserved && !record.span_cap_reached),
    errors, span_cap_reached: cases.some(record => record.span_cap_reached), bindings: logger.getBindings(), cases,
    limits: 'Module-boundary observed wall time, including async waits and observer overhead. Inclusive groups overlap. No CPU profile or browser acceptance.'};
}
function snapshot() {
  try {
    const live = logger.live();
    if (live) write('iso-phase-live.json', {...live, diagnostic_only: true, application_baseline_sha: applicationSHA,
      observed_source_sha: observedSHA, memory: process.memoryUsage(), cpu_usage_us: process.cpuUsage(caseStart.cpu), errors: logger.getErrors()});
  } catch { logger.diagnosticError('live-observation-failed'); }
}

beforeAll(() => {
  write('iso-phase-host.json', {version: 1, diagnostic_only: true, actual_jest_pid: process.pid,
    node: process.version, exec_path: process.execPath, versions: process.versions, platform: process.platform, arch: process.arch,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, application_baseline_sha: applicationSHA, observed_source_sha: observedSHA,
    environment: {CI: process.env.CI === 'true', TZ: process.env.TZ === 'UTC' ? 'UTC' : 'other-or-unset',
      lifecycle_years: !process.env.FRAMEWORK_LIFECYCLE_YEARS ? 'default' : ['3', '5'].includes(process.env.FRAMEWORK_LIFECYCLE_YEARS) ? process.env.FRAMEWORK_LIFECYCLE_YEARS : 'other',
      export_enabled: !!process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR},
    host: {available_parallelism: os.availableParallelism?.() ?? os.cpus().length, cpu_model: os.cpus()[0]?.model,
      logical_cpus: os.cpus().length, total_memory: os.totalmem(), free_memory: os.freemem()},
    profiler_enabled: false, max_spans_per_case: 50000});
});
beforeEach(() => {
  try { wrapLoadedPhases(); } catch { logger.diagnosticError('phase-registration-failed'); }
  logger.beginCase(expect.getState().currentTestName);
  caseStart = {cpu: process.cpuUsage(), guards: guardSnapshot()};
  interval = timers.setInterval(snapshot, 5000); interval.unref(); snapshot();
});
afterEach(() => {
  timers.clearInterval(interval); snapshot();
  try {
    const guards = guardSnapshot(), result = logger.endCase();
    if (!result) return;
    const preserved = [caseStart.guards, guards].every(value => value && Object.values(value).every(flag => flag === true));
    const name = 'iso-phase-case-' + String(result.ordinal).padStart(2, '0') + '-' + result.framework + '.json';
    if (!preserved) logger.diagnosticError('native-guard-changed');
    const record = {...result, diagnostic_only: true, application_baseline_sha: applicationSHA, observed_source_sha: observedSHA,
      native_guards_before: caseStart.guards, native_guards_after: guards, guards_preserved: preserved,
      cpu_usage_us: process.cpuUsage(caseStart.cpu), memory: process.memoryUsage(), errors: logger.getErrors()};
    write(name, record);
    cases.push({ordinal: result.ordinal, framework: result.framework, artifact: name, observation_elapsed_ms: result.observation_elapsed_ms,
      requests: result.requests, span_count: result.span_count, span_cap_reached: result.span_cap_reached,
      guards_preserved: preserved, pending: result.pending, groups: result.groups});
    write('iso-phase-summary.json', summary());
  } catch { logger.diagnosticError('case-observation-failed'); }
});
afterAll(() => { timers.clearInterval(interval); write('iso-phase-summary.json', summary(true)); });
