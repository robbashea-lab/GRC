// Diagnostic-only hooks; the original setup and lifecycle source remain unchanged.
const fs = jest.requireActual('node:fs'), path = jest.requireActual('node:path'), os = jest.requireActual('node:os');
const timers = jest.requireActual('node:timers');
const {performance} = jest.requireActual('node:perf_hooks');
const frontend = process.cwd(), directory = path.join(frontend, 'scripts/iso-pr110-two-point');
const {createObserver} = jest.requireActual(path.join(directory, 'observer.cjs'));
const {createArtifactWriter} = jest.requireActual(path.join(directory, 'artifact-writer.cjs'));
const output = process.env.ISO_TWO_POINT_OUTPUT;
if (!output || !path.isAbsolute(output)) throw Error('An absolute two-point diagnostic output directory is required');
const observer = createObserver(), cases = [];
const write = createArtifactWriter(output, code => observer.error(code), fs, {budgetRoot: path.dirname(output)});
const BASELINE = '2303f958dd0fd8e02881aab3bbd7ac82450be469';
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) ? value : null;
const applicationSHA = sha(process.env.ISO_TWO_POINT_APP_SHA), observedSHA = sha(process.env.GITHUB_SHA);
if (applicationSHA !== BASELINE || !observedSHA) throw Error('Two-point source provenance is missing or mismatched');
const points = ['commandTestAdapter.js:previewAdapter', 'demoStorageCodec.js:writeDemoStoreAsync'];
const captured = {parse: Object.getOwnPropertyDescriptor(JSON, 'parse')?.value,
  stringify: Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value,
  keys: Object.getOwnPropertyDescriptor(Object, 'keys')?.value,
  getItem: Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')?.value};
let calibration = null, interval = null, caseStart = null, commandModule = null, commandWrapper = null, writerModule = null, writerWrapper = null;
let samples = [], previousSample = 0;
const provenance = {diagnostic_only: true, qualification: false, application_baseline_sha: applicationSHA, observed_source_sha: observedSHA};

const commandFile = path.join(frontend, 'src/preview/commandTestAdapter.js');
jest.doMock(commandFile, () => {
  const actual = jest.requireActual(commandFile), descriptor = Object.getOwnPropertyDescriptor(actual, 'previewAdapter');
  if (!descriptor || typeof descriptor.value !== 'function' || !descriptor.writable) throw Error('Diagnostic command binding unavailable');
  commandWrapper = observer.wrapCommand(descriptor.value); commandModule = actual;
  Object.defineProperty(actual, 'previewAdapter', {...descriptor, value: commandWrapper});
  return actual;
});
function observeWriter() {
  // Original imports must finish first; preloading this circular graph changes behavior.
  const actual = jest.requireActual(path.join(frontend, 'src/preview/demoStorageCodec.js'));
  const descriptor = Object.getOwnPropertyDescriptor(actual, 'writeDemoStoreAsync');
  if (!descriptor || typeof descriptor.value !== 'function' || !descriptor.writable) throw Error('Diagnostic writer binding unavailable');
  if (writerWrapper) {
    if (actual !== writerModule || descriptor.value !== writerWrapper) throw Error('Diagnostic writer binding changed');
    return;
  }
  writerWrapper = observer.wrapWriter(descriptor.value); writerModule = actual;
  Object.defineProperty(actual, 'writeDemoStoreAsync', {...descriptor, value: writerWrapper});
}
function guards() {
  const portfolio = jest.requireActual(path.join(frontend, 'src/preview/portfolioReporting.js'));
  return {parse: Object.getOwnPropertyDescriptor(JSON, 'parse')?.value === captured.parse,
    stringify: Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value === captured.stringify,
    keys: Object.getOwnPropertyDescriptor(Object, 'keys')?.value === captured.keys,
    getItem: Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')?.value === captured.getItem,
    canFork: portfolio.canForkPortfolioStore(),
    commandBinding: !!commandModule && Object.getOwnPropertyDescriptor(commandModule, 'previewAdapter')?.value === commandWrapper,
    writerBinding: !!writerModule && Object.getOwnPropertyDescriptor(writerModule, 'writeDemoStoreAsync')?.value === writerWrapper};
}
async function calibrate() {
  async function screen(asynchronous) {
    const probe = createObserver(); probe.beginCase('iso-27001 calibration');
    let settled = 0;
    const writer = probe.wrapWriter((storage, key, text) => asynchronous ? Promise.resolve(text) : text);
    const command = probe.wrapCommand(() => writer(null, 'calibration', 'x'));
    const started = performance.now();
    for (let i = 0; i < 1000; i++) {
      const result = command({method: 'get', url: '/clients/calibration'});
      if ((asynchronous ? await result : result) !== 'x') throw Error('Calibration delegation failed');
      settled++;
    }
    const elapsed = performance.now() - started, detail = probe.endCase();
    if (detail.errors.length || detail.pending_counts.commands || detail.pending_counts.writes
      || detail.totals.commands_settled !== 1000 || detail.totals.writes_settled !== 1000) throw Error('Calibration did not fully settle');
    return {iterations: 1000, settled, elapsed_ms: elapsed};
  }
  const sync = await screen(false), promise = await screen(true);
  const text = 'x'.repeat(4094), started = performance.now();
  let written = 0;
  for (let i = 0; i < 8; i++) if (write('overhead-io-' + i + '.json', text, {maxBytes: 4096})) written++;
  const io = {writes: written, bytes: written * 4096, elapsed_ms: performance.now() - started};
  return {sync, promise, io, thresholds_ms: {sync: 50, promise: 100, io: 50},
    valid: sync.elapsed_ms <= 50 && promise.elapsed_ms <= 100 && io.elapsed_ms <= 50 && written === 8 && write.stats().failed === 0,
    limits: 'Empty active observer and artifact-write screens only; not production overhead, WebStorage cost or a timing subtraction.'};
}
function summary(complete = false) {
  const errors = observer.getErrors(), expected = cases.map(value => value.framework).join(',') === 'cis-ig1,soc-2,iso-27001';
  return {version: 1, ...provenance, complete,
    diagnostic_valid: complete && expected && calibration?.valid === true && !errors.length
      && cases.every(value => value.guards_preserved && !value.stopped && !value.command_cap_reached && !value.write_cap_reached && !value.errors.length),
    errors, cases, calibration, artifact_writes: write.stats()};
}
function resourceSample(kind) {
  const at = performance.now() - caseStart.started;
  const value = {kind, elapsed_ms: at, cpu_usage_us: process.cpuUsage(caseStart.cpu), memory: process.memoryUsage(),
    sample_interval_overdue_ms: kind === 'interval' ? Math.max(0, at - previousSample - 5000) : 0};
  previousSample = at;
  if (samples.length >= 128) { observer.error('resource-sample-cap'); return value; }
  samples.push(value); return value;
}
function snapshot() {
  try {
    const resource = resourceSample('interval'), live = observer.live();
    if (live) write('two-point-live.json', {...provenance, ...live, resource}, {maxBytes: 16 * 1024});
  } catch { observer.error('live-observation-failed'); }
}
beforeAll(async () => {
  if (process.version !== 'v22.23.4' || process.execPath !== process.env.ISO_TWO_POINT_EXPECTED_EXEC_PATH
    || process.platform !== 'linux' || process.arch !== 'x64' || Intl.DateTimeFormat().resolvedOptions().timeZone !== 'UTC'
    || process.env.CI !== 'true' || process.env.FRAMEWORK_LIFECYCLE_YEARS !== '5' || process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR) {
    throw Error('Actual Jest runtime refused before calibration or lifecycle bodies');
  }
  write('two-point-host.json', {version: 1, ...provenance, actual_jest_pid: process.pid,
    node: process.version, exec_path: process.execPath, versions: process.versions, platform: process.platform, arch: process.arch,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, profiler_enabled: false, gc_forced: false,
    two_points: points, max_commands: 4096, max_writes: 4096,
    host: {available_parallelism: os.availableParallelism(), cpu_model: os.cpus()[0]?.model, total_memory: os.totalmem()},
    environment: {CI: process.env.CI === 'true', lifecycle_years: process.env.FRAMEWORK_LIFECYCLE_YEARS || '5',
      export_enabled: !!process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR, two_point_logging: !!process.env.ISO_TWO_POINT_OUTPUT}}, {maxBytes: 16 * 1024});
  calibration = await calibrate();
  write('overhead-calibration.json', calibration, {maxBytes: 16 * 1024});
  if (!calibration.valid || observer.getErrors().length) throw Error('Two-point calibration refused the workload');
});
beforeEach(() => {
  if (!calibration?.valid) throw Error('Two-point workload refused before calibration');
  observeWriter(); observer.beginCase(expect.getState().currentTestName);
  const before = guards();
  if (!Object.values(before).every(value => value === true)) { observer.error('native-guard-changed'); throw Error('Native guard changed before workload'); }
  caseStart = {started: performance.now(), cpu: process.cpuUsage(), guards: before};
  samples = []; previousSample = 0; resourceSample('start');
  interval = timers.setInterval(snapshot, 5000); interval.unref();
});
afterEach(() => {
  timers.clearInterval(interval); interval = null;
  if (!caseStart) return;
  try {
    resourceSample('end'); const after = guards(), detail = observer.endCase();
    const preserved = [caseStart.guards, after].every(value => Object.values(value).every(flag => flag === true));
    if (!preserved) observer.error('native-guard-changed');
    const artifact = 'two-point-case-' + String(detail.ordinal).padStart(2, '0') + '-' + detail.framework + '.json';
    const record = {...detail, ...provenance, native_guards_before: caseStart.guards, native_guards_after: after,
      guards_preserved: preserved, samples, cpu_usage_us: process.cpuUsage(caseStart.cpu), memory: process.memoryUsage(),
      observation_window: 'Diagnostic beforeEach through afterEach, including fixtures; not exact body deadline or cancellation.',
      artifact_writes_cumulative: write.stats()};
    write(artifact, record, {maxBytes: 2 * 1024 * 1024});
    cases.push({framework: detail.framework, ordinal: detail.ordinal, artifact, observation_elapsed_ms: detail.observation_elapsed_ms,
      command_count: detail.totals.commands_started, writer_count: detail.totals.writes_started, pending: detail.pending,
      pending_counts: detail.pending_counts, errors: detail.errors, stopped: detail.stopped,
      command_cap_reached: detail.command_cap_reached, write_cap_reached: detail.write_cap_reached, guards_preserved: preserved});
    write('two-point-summary.json', summary(), {maxBytes: 64 * 1024});
  } catch { observer.error('case-observation-failed'); }
  finally { caseStart = null; samples = []; }
});
afterAll(() => {
  timers.clearInterval(interval);
  write('two-point-summary.json', summary(true), {maxBytes: 64 * 1024, final: true});
});
