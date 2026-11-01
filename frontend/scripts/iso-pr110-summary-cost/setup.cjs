// Diagnostic only: the original setup, lifecycle and application files remain unchanged.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const timers = require('node:timers');
const {performance} = require('node:perf_hooks');
const {createObserver} = require('./observer.cjs');
const {createArtifactWriter} = require('./artifact-writer.cjs');
const BASELINE = '2303f958dd0fd8e02881aab3bbd7ac82450be469';
const SOURCE = '85547886be517c229959d413cea383c8e57987db39d13787f973b522b351a730';

function calibrate(write, factory = createObserver, now = () => performance.now()) {
  const blocks = [], sentinel = {}, empty = () => sentinel;
  for (let block = 0; block < 5; block++) {
    let unobserved = 0, observed = 0;
    const start = now();
    for (let i = 0; i < 1000; i++) { if (empty() !== sentinel) throw Error('Empty delegate changed'); unobserved++; }
    const unobserved_ms = now() - start, probe = factory(); probe.beginCase('iso-27001 calibration');
    const active = now();
    for (let i = 0; i < 1000; i++) { if (probe.measure(empty) !== sentinel) throw Error('Observed delegate changed'); observed++; }
    const observed_ms = now() - active, result = probe.endCase();
    blocks.push({iterations: 1000, unobserved_count: unobserved, observed_count: observed,
      unobserved_ms, observed_ms, observer_valid: !result.stopped && !result.errors.length
        && result.totals.started === 1000 && result.totals.returned === 1000 && result.totals.pending === 0});
  }
  const start = now(), text = 'x'.repeat(4094); let written = 0;
  for (let i = 0; i < 8; i++) if (write('overhead-io-' + i + '.json', text, {maxBytes: 4096})) written++;
  const io = {writes: written, bytes: written * 4096, elapsed_ms: now() - start};
  return {blocks, io, thresholds_ms: {per_block: 50, io: 50},
    valid: blocks.every(block => block.observer_valid && block.unobserved_ms >= 0 && block.unobserved_ms <= 50
      && block.observed_ms >= 0 && block.observed_ms <= 50) && written === 8 && io.elapsed_ms >= 0 && io.elapsed_ms <= 50,
    limits: 'Empty-thunk/active bracket and artifact-write screens, not complete production overhead or a subtraction.'};
}

function installDiagnostic() {
  const output = process.env.ISO_SUMMARY_COST_OUTPUT;
  if (!output || !path.isAbsolute(output) || process.env.ISO_SUMMARY_COST_APP_SHA !== BASELINE
    || !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')) throw Error('Summary-cost provenance/output missing');
  if (Object.hasOwn(globalThis, '__ISO_SUMMARY_COST__')) throw Error('Diagnostic global already exists');
  const observer = createObserver(), cases = [];
  const write = createArtifactWriter(output, code => observer.error(code), fs, {budgetRoot: path.dirname(output)});
  const provenance = {diagnostic_only: true, qualification: false, application_baseline_sha: BASELINE, observed_source_sha: process.env.GITHUB_SHA};
  let loaded = 0, loadedSource = null, calibration = null, interval = null, caseStart = null, samples = [], previousSample = 0;
  const bridge = Object.freeze({measure: thunk => observer.measure(thunk), loaded(source) {
    if (source !== SOURCE) {observer.error('loaded-source-mismatch'); throw Error('Diagnostic module source mismatch');}
    loaded++; loadedSource = source;
  }});
  Object.defineProperty(globalThis, '__ISO_SUMMARY_COST__', {value: bridge, writable: false, configurable: false});
  const captured = {parse: Object.getOwnPropertyDescriptor(JSON, 'parse')?.value,
    stringify: Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value, keys: Object.getOwnPropertyDescriptor(Object, 'keys')?.value,
    getItem: Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')?.value};
  function guards() {
    const portfolio = jest.requireActual(path.join(process.cwd(), 'src/preview/portfolioReporting.js'));
    return {parse: Object.getOwnPropertyDescriptor(JSON, 'parse')?.value === captured.parse,
      stringify: Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value === captured.stringify,
      keys: Object.getOwnPropertyDescriptor(Object, 'keys')?.value === captured.keys,
      getItem: Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')?.value === captured.getItem,
      canFork: portfolio.canForkPortfolioStore(), observerBinding: globalThis.__ISO_SUMMARY_COST__ === bridge,
      moduleLoaded: loaded === 1 && loadedSource === SOURCE};
  }
  function summary(complete = false) {
    const errors = observer.getErrors();
    return {version: 1, ...provenance, complete, loaded_source_sha256: loadedSource, loaded_count: loaded,
      diagnostic_valid: complete && calibration?.valid === true && !errors.length && loaded === 1
        && cases.map(value => value.framework).join(',') === 'cis-ig1,soc-2,iso-27001'
        && cases.every(value => value.guards_preserved && !value.stopped && !value.errors.length && value.pending === 0),
      errors, cases, calibration, artifact_writes: write.stats(), out_of_case_calls: observer.live().out_of_case_calls};
  }
  function resourceSample(kind) {
    const elapsed = performance.now() - caseStart.started;
    const value = {kind, elapsed_ms: elapsed, cpu_usage_us: process.cpuUsage(caseStart.cpu), memory: process.memoryUsage(),
      sample_interval_overdue_ms: kind === 'interval' ? Math.max(0, elapsed - previousSample - 5000) : 0};
    previousSample = elapsed;
    if (samples.length >= 128) {observer.error('resource-sample-cap'); return value;}
    samples.push(value);return value;
  }
  beforeAll(() => {
    if (process.version !== 'v22.23.4' || process.execPath !== process.env.ISO_SUMMARY_COST_EXPECTED_EXEC_PATH
      || process.platform !== 'linux' || process.arch !== 'x64' || Intl.DateTimeFormat().resolvedOptions().timeZone !== 'UTC'
      || process.env.CI !== 'true' || process.env.FRAMEWORK_LIFECYCLE_YEARS !== '5' || process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR)
      throw Error('Actual Jest runtime refused before native bodies');
    if (!Object.values(guards()).every(value => value === true)) throw Error('Diagnostic transform/native guard unavailable');
    const transform = JSON.parse(fs.readFileSync(path.join(output, 'transform-proof.json'), 'utf8'));
    if (transform.config_control?.consumed_pairs !== 1 || transform.config_control.removed_argument_count !== 2
      || !['parsed_config_matches','other_arguments_unchanged','general_route_matches'].every(key => transform.config_control[key] === true))
      throw Error('Actual transform configuration handoff refused before native bodies');
    write('summary-cost-host.json', {version: 1, ...provenance, actual_jest_pid: process.pid, node: process.version, exec_path: process.execPath,
      versions: process.versions, platform: process.platform, arch: process.arch, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      profiler_enabled: false, gc_forced: false, target: 'portfolioReporting.js:552 cisSummary(included) only for ISO', max_calls: 16384, max_depth: 16,
      host: {available_parallelism: os.availableParallelism(), cpu_model: os.cpus()[0]?.model, total_memory: os.totalmem()},
      environment: {CI: process.env.CI === 'true', lifecycle_years: process.env.FRAMEWORK_LIFECYCLE_YEARS, export_enabled: !!process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR}}, {maxBytes: 16384});
    calibration = calibrate(write);write('overhead-calibration.json', calibration, {maxBytes: 16384});
    if (!calibration.valid || observer.getErrors().length) throw Error('Summary-cost calibration refused native bodies');
  });
  beforeEach(() => {
    if (!calibration?.valid) throw Error('Summary-cost workload refused before calibration');
    const before = guards();if (!Object.values(before).every(value => value === true)) throw Error('Native guard changed');
    observer.beginCase(expect.getState().currentTestName);
    caseStart = {started: performance.now(), cpu: process.cpuUsage(), guards: before};samples = [];previousSample = 0;resourceSample('start');
    interval = timers.setInterval(() => {
      try {write('summary-cost-live.json', {...provenance, ...observer.live(), resource: resourceSample('interval')}, {maxBytes: 16384});}
      catch {observer.error('live-observation-failed');}
    }, 5000);interval.unref();
  });
  afterEach(() => {
    timers.clearInterval(interval);interval = null;if (!caseStart) return;
    try {
      resourceSample('end');const after = guards(), detail = observer.endCase();
      const preserved = [caseStart.guards, after].every(value => Object.values(value).every(flag => flag === true));
      if (!preserved) observer.error('native-guard-changed');
      const artifact = 'summary-cost-case-' + String(detail.ordinal).padStart(2, '0') + '-' + detail.framework + '.json';
      write(artifact, {...detail, ...provenance, native_guards_before: caseStart.guards, native_guards_after: after,
        guards_preserved: preserved, samples, cpu_usage_us: process.cpuUsage(caseStart.cpu), memory: process.memoryUsage(),
        observation_window: 'Diagnostic beforeEach through afterEach, including fixtures; not exact body deadline.', artifact_writes_cumulative: write.stats()}, {maxBytes: 3 * 1024 * 1024});
      cases.push({framework: detail.framework, ordinal: detail.ordinal, artifact, call_count: detail.calls.length,
        observation_elapsed_ms: detail.observation_elapsed_ms, pending: detail.totals.pending, stopped: detail.stopped,
        call_cap_reached: detail.call_cap_reached, depth_cap_reached: detail.depth_cap_reached, guards_preserved: preserved, errors: detail.errors});
      write('summary-cost-summary.json', summary(), {maxBytes: 65536});
    } catch {observer.error('case-observation-failed');}
    finally {caseStart = null;samples = [];}
  });
  afterAll(() => {timers.clearInterval(interval);write('summary-cost-summary.json', summary(true), {maxBytes: 65536, final: true});});
}
if (typeof jest !== 'undefined') installDiagnostic();
module.exports = {calibrate, installDiagnostic};
