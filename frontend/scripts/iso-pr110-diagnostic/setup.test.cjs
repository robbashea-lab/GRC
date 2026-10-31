const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createPhaseLogger, createArtifactWriter} = require('./phase-logger.cjs');

const setupSource = fs.readFileSync(path.join(__dirname, 'setup.cjs'), 'utf8');
const BASELINE = '9824384552c579099fad53528b738467a6d5f677';
const OBSERVED = '1111111111111111111111111111111111111111';
const FRAMEWORKS = ['cis-ig1', 'soc-2', 'iso-27001'];

// Execute only the diagnostic hook registration against disposable phase functions.
// No application modules, Jest lifecycle bodies, real timers or filesystem writes run.
function harness(options = {}) {
  const frontend = path.resolve('/synthetic-diagnostic/frontend');
  const output = path.resolve('/synthetic-diagnostic/output');
  const artifacts = new Map(), temporary = new Map(), hooks = {};
  const intervals = new Set(), clearedIntervals = [], loggers = [], mocks = new Map();
  const state = {currentTestName: '', canFork: true};
  let elapsed = 0;
  const now = () => (elapsed += 0.25);
  const modules = Object.fromEntries([
    ['demoStorageCodec.js', ['decodeDemoStore', 'writeDemoStoreAsync']],
    ['portfolioReporting.js', ['readPortfolioStore', 'readPortfolioStorePair', 'captureDemoReporting', 'writePortfolioStoreAsync']],
    ['evidenceStorage.js', ['lightweightStore', 'restoreFiles', 'rememberFiles']],
    ['store.js', ['readStore', 'saveStoreAsync']],
    ['adapter.js', ['previewAdapter']],
    ['commandTestAdapter.js', ['previewAdapter']],
  ].map(([file, names]) => [file, Object.fromEntries(names.map(name => [name, function(value) { return value; }]))]));
  modules['portfolioReporting.js'].canForkPortfolioStore = () => state.canFork;
  class SyntheticStorage { getItem() { return null; } }
  const fakeFs = {
    mkdirSync() {},
    writeFileSync(destination, content) {
      if (options.failWrite?.(destination)) throw Error('Synthetic I/O failure');
      temporary.set(destination, content);
    },
    renameSync(source, destination) {
      assert.equal(temporary.has(source), true);
      artifacts.set(path.basename(destination), temporary.get(source));
      temporary.delete(source);
    },
  };
  const phaseExports = {
    createPhaseLogger() {
      const logger = createPhaseLogger({now, maxSpans: loggers.length === 0 ? options.caseSpanCap ?? 50000 : 50000});
      loggers.push(logger);
      return logger;
    },
    createArtifactWriter,
  };
  const fakeTimers = {
    setInterval(callback, delay) {
      assert.equal(delay, 5000);
      const interval = {callback, unrefCalled: false, unref() { this.unrefCalled = true; }};
      intervals.add(interval);
      return interval;
    },
    clearInterval(interval) { if (interval) { clearedIntervals.push(interval); intervals.delete(interval); } },
  };
  const env = {
    ISO_PHASE_LOG_DIR: output, ISO_PHASE_APP_SHA: BASELINE, GITHUB_SHA: OBSERVED,
    CI: 'true', TZ: 'UTC', UNRELATED_PRIVATE_VALUE: 'must-not-appear-in-any-artifact',
    ...options.env,
  };
  const context = vm.createContext({
    Storage: SyntheticStorage,
    process: {env, cwd: () => frontend, pid: 123, version: 'v22.23.4', execPath: '/approved/bin/node',
      versions: {node: '22.23.4', v8: 'synthetic-runtime'}, platform: 'linux', arch: 'x64',
      cpuUsage: () => ({user: 100, system: 20}), memoryUsage: () => ({rss: 1024, heapUsed: 512})},
    Intl: {DateTimeFormat: () => ({resolvedOptions: () => ({timeZone: 'UTC'})})},
    expect: {getState: () => ({currentTestName: state.currentTestName})},
    jest: {
      requireActual(name) {
        if (name === 'node:fs') return fakeFs;
        if (name === 'node:path') return path;
        if (name === 'node:timers') return fakeTimers;
        if (name === 'node:perf_hooks') return {performance: {now}};
        if (name === 'node:os') return {availableParallelism: () => 2,
          cpus: () => [{model: 'Synthetic CPU'}, {model: 'Synthetic CPU'}], totalmem: () => 8192, freemem: () => 4096};
        if (name === path.join(frontend, 'scripts/iso-pr110-diagnostic/phase-logger.cjs')) return phaseExports;
        const file = path.basename(name);
        if (path.dirname(name) === path.join(frontend, 'src/preview') && modules[file]) return modules[file];
        throw Error('Unexpected module request: ' + name);
      },
      doMock(name, factory) { mocks.set(name, factory); },
    },
    ...Object.fromEntries(['beforeAll', 'beforeEach', 'afterEach', 'afterAll'].map(name => [name, callback => { hooks[name] = callback; }])),
  });
  vm.runInContext(setupSource, context, {filename: 'iso-pr110-diagnostic/setup.cjs'});
  return {context, hooks, modules, loggers, intervals, clearedIntervals, artifacts, state,
    artifact: name => JSON.parse(artifacts.get(name)),
    loadCommand: () => mocks.get(path.join(frontend, 'src/preview/commandTestAdapter.js'))(),
    begin(framework) { state.currentTestName = framework + ' fresh client retains the configured program lifecycle and period evidence'; hooks.beforeEach(); },
    finish() { hooks.afterEach(); },
  };
}

function completeThreeCases(h, action = () => {}) {
  h.hooks.beforeAll();
  for (const [index, framework] of FRAMEWORKS.entries()) { h.begin(framework); action(h, index); h.finish(); }
  h.hooks.afterAll();
  return h.artifact('iso-phase-summary.json');
}

test('active calibration has exactly 1000 spans on a separate logger and cannot consume case ordinal one', () => {
  const h = harness(); h.loadCommand(); h.hooks.beforeAll();
  assert.equal(h.loggers.length, 2);
  const calibration = h.artifact('observer-calibration.json');
  assert.equal(calibration.iterations, 1000); assert.equal(calibration.span_count, 1000);
  assert.equal(calibration.active_observer_path, true);
  for (const key of ['total_elapsed_ms', 'min_ms', 'p50_ms', 'p95_ms', 'max_ms']) {
    assert.equal(typeof calibration[key], 'number'); assert.equal(Number.isFinite(calibration[key]), true);
    assert.equal(calibration[key] >= 0, true);
  }
  assert.equal(calibration.min_ms <= calibration.p50_ms && calibration.p50_ms <= calibration.p95_ms && calibration.p95_ms <= calibration.max_ms, true);
  assert.match(calibration.limitations, /not production overhead or a subtraction/);
  h.begin('cis-ig1');
  const value = {synthetic: true};
  assert.equal(h.modules['demoStorageCodec.js'].decodeDemoStore(value), value);
  h.finish();
  const record = h.artifact('iso-phase-case-01-cis-ig1.json');
  assert.equal(record.ordinal, 1); assert.equal(record.framework, 'cis-ig1'); assert.equal(record.span_count, 1);
  assert.equal(record.groups['demoStorageCodec.js:decodeDemoStore'].calls, 1);
  assert.equal(record.guards_preserved, true);
  assert.equal(typeof record.artifact_writes_cumulative.wall_ms, 'number');
  assert.equal(record.artifact_writes_cumulative.count, 4); assert.equal(record.artifact_writes_cumulative.failed, 0);
  assert.equal(record.artifact_writes_cumulative.includes_current_write, false);
  const partial = h.artifact('iso-phase-summary.json');
  assert.equal(partial.complete, false); assert.equal(partial.diagnostic_valid, false);
  assert.equal(partial.artifact_writes.count, 5);
  assert.equal(partial.artifact_writes.wall_ms > record.artifact_writes_cumulative.wall_ms, true);
  assert.equal(h.intervals.size, 0); assert.equal(h.clearedIntervals[0].unrefCalled, true);
});

test('complete observation records explicit source/runtime guards and a bounded environment whitelist', () => {
  const h = harness(), command = h.loadCommand(), config = {method: 'get', url: '/clients/synthetic-client/profile?token=not-for-logs'};
  const summary = completeThreeCases(h, () => assert.equal(command.previewAdapter(config), config));
  const host = h.artifact('iso-phase-host.json');
  assert.equal(host.application_baseline_sha, BASELINE); assert.equal(host.observed_source_sha, OBSERVED);
  assert.equal(host.node, 'v22.23.4'); assert.equal(host.exec_path, '/approved/bin/node');
  assert.equal(host.timezone, 'UTC'); assert.equal(host.platform, 'linux'); assert.equal(host.arch, 'x64');
  assert.deepEqual(host.environment, {CI: true, TZ: 'UTC', lifecycle_years: 'default', export_enabled: false});
  assert.equal(summary.diagnostic_valid, true); assert.deepEqual(summary.errors, []);
  assert.deepEqual(summary.cases.map(record => record.ordinal), [1, 2, 3]);
  assert.deepEqual(summary.cases.map(record => record.framework), FRAMEWORKS);
  for (const record of summary.cases) {
    const detail = h.artifact(record.artifact);
    assert.deepEqual(detail.native_guards_before, {parse: true, stringify: true, keys: true, getItem: true, canFork: true});
    assert.deepEqual(detail.native_guards_after, detail.native_guards_before);
    assert.equal(detail.spans[0].route, '/clients/:id/profile'); assert.equal(detail.requests, 1);
  }
  const serialized = [...h.artifacts.values()].join('\n');
  for (const excluded of ['must-not-appear-in-any-artifact', 'UNRELATED_PRIVATE_VALUE', 'not-for-logs', 'synthetic-client']) assert.equal(serialized.includes(excluded), false);
  assert.equal(h.intervals.size, 0);
});

test('live snapshots use fake unreferenced intervals and preserve numeric resource and write-cost metadata', () => {
  const h = harness(); h.hooks.beforeAll(); h.begin('cis-ig1');
  assert.equal(h.intervals.size, 1);
  const interval = [...h.intervals][0]; assert.equal(interval.unrefCalled, true); interval.callback();
  const live = h.artifact('iso-phase-live.json');
  assert.equal(live.ordinal, 1); assert.deepEqual(live.memory, {rss: 1024, heapUsed: 512});
  assert.deepEqual(live.cpu_usage_us, {user: 100, system: 20});
  h.finish(); h.hooks.afterAll();
  assert.equal(h.artifact('iso-phase-summary.json').artifact_writes.wall_ms > 0, true);
  assert.equal(h.intervals.size, 0);
});

test('a case span cap invalidates the final summary without suppressing the original phase call', () => {
  const h = harness({caseSpanCap: 1}); let calls = 0;
  h.modules['demoStorageCodec.js'].decodeDemoStore = value => { calls++; return value; };
  const summary = completeThreeCases(h, () => {
    assert.equal(h.modules['demoStorageCodec.js'].decodeDemoStore(1), 1);
    assert.equal(h.modules['demoStorageCodec.js'].decodeDemoStore(2), 2);
  });
  assert.equal(calls, 6); assert.equal(summary.complete, true); assert.equal(summary.diagnostic_valid, false);
  assert.equal(summary.span_cap_reached, true); assert.equal(summary.errors.includes('span-cap-reached'), true);
});

test('observer errors and invalid source identities cannot produce a valid complete summary', () => {
  for (const options of [{env: {ISO_PHASE_APP_SHA: 'untrusted-source'}}, {}]) {
    const h = harness(options);
    if (!options.env) h.loggers[0].diagnosticError('synthetic-observer-error');
    const summary = completeThreeCases(h);
    assert.equal(summary.complete, true); assert.equal(summary.diagnostic_valid, false);
    assert.equal(summary.errors.includes(options.env ? 'missing-source-sha' : 'synthetic-observer-error'), true);
    if (options.env) assert.equal(summary.application_baseline_sha, null);
  }
});

test('native function identity drift and a false canFork result invalidate guard proof', () => {
  for (const change of [h => vm.runInContext('JSON.parse = function() {};', h.context), h => { h.state.canFork = false; }]) {
    const h = harness();
    const summary = completeThreeCases(h, (current, index) => { if (index === 0) change(current); });
    assert.equal(summary.diagnostic_valid, false); assert.equal(summary.errors.includes('native-guard-changed'), true);
    assert.equal(h.artifact('iso-phase-case-01-cis-ig1.json').guards_preserved, false);
  }
});

test('artifact failure preserves numeric failure accounting and invalidates observation without throwing', () => {
  const h = harness({failWrite: destination => destination.endsWith('observer-calibration.json.tmp')});
  const summary = completeThreeCases(h);
  assert.equal(summary.diagnostic_valid, false); assert.equal(summary.errors.includes('diagnostic-write-failed'), true);
  assert.equal(summary.artifact_writes.failed, 1); assert.equal(typeof summary.artifact_writes.wall_ms, 'number');
});

test('missing case results cannot qualify a complete observation and unsafe output paths fail before hook registration', () => {
  const h = harness(); h.hooks.beforeAll(); h.begin('cis-ig1'); h.finish(); h.hooks.afterAll();
  assert.equal(h.artifact('iso-phase-summary.json').complete, true);
  assert.equal(h.artifact('iso-phase-summary.json').diagnostic_valid, false);
  assert.throws(() => harness({env: {ISO_PHASE_LOG_DIR: 'relative-output'}}), /explicit absolute diagnostic output directory/);
});

function runtimeReporterHarness({stat, readError = false}) {
  const source = fs.readFileSync(path.join(__dirname, 'runtime-reporter.cjs'), 'utf8');
  const module = {exports: {}}, writes = [], messages = [];
  let elapsed = 0;
  const context = vm.createContext({module,
    process: {env: {FRONTEND_RUNTIME_RECEIPT: '/synthetic-output/runtime.json', GITHUB_SHA: OBSERVED,
      ISO_PHASE_LOG_DIR: '/synthetic-output', FRAMEWORK_LIFECYCLE_YEARS: '5',
      PRIVATE_ENV: 'private-env-value-not-for-the-receipt'}, pid: 8888, ppid: 5555,
      version: 'v22.23.4', execPath: '/approved/bin/node', versions: {v8: 'synthetic-v8'}, platform: 'linux', arch: 'x64',
      cpuUsage: () => ({user: 10, system: 2}), resourceUsage: () => ({maxRSS: 512}), memoryUsage: () => ({rss: 1024}),
      stderr: {write: value => messages.push(value)}},
    Intl: {DateTimeFormat: () => ({resolvedOptions: () => ({timeZone: 'UTC'})})},
    require(name) {
      if (name === 'node:path') return path;
      if (name === 'node:perf_hooks') return {performance: {now: () => ++elapsed}};
      if (name === 'node:os') return {availableParallelism: () => 2, cpus: () => [{model: 'Synthetic CPU'}], totalmem: () => 8192, freemem: () => 4096};
      if (name === 'node:fs') return {
        readFileSync(file, encoding) {
          assert.equal(file, '/proc/self/stat'); assert.equal(encoding, 'utf8');
          if (readError) throw Error('private-read-error-not-for-the-receipt');
          return stat;
        },
        mkdirSync() {}, writeFileSync(file, data) { writes.push({file, data}); },
      };
      throw Error('Unexpected reporter dependency: ' + name);
    },
  });
  vm.runInContext(source, context, {filename: 'iso-pr110-diagnostic/runtime-reporter.cjs'});
  return {reporter: new module.exports(), writes, messages, receipt: () => JSON.parse(writes.at(-1).data)};
}

test('runtime reporter binds a different Jest PID to its actual owned group without logging process names or private environment values', () => {
  const h = runtimeReporterHarness({stat: '8888 (private process (name) not-for-the-receipt)) S 5555 4242 4242 0 0 0 0'});
  h.reporter.onRunStart();
  h.reporter.onTestCaseResult({path: '/synthetic/frontend/src/preview/frameworkFiveYear.test.js'},
    {fullName: 'iso-27001 fresh client retains the configured program lifecycle and period evidence', status: 'failed', duration: 180000});
  h.reporter.onRunComplete();
  const receipt = h.receipt();
  assert.equal(receipt.pid, 8888); assert.equal(receipt.parent_pid, 5555); assert.equal(receipt.process_group_id, 4242);
  assert.notEqual(receipt.pid, receipt.process_group_id); assert.equal(receipt.completed, true);
  assert.equal(receipt.source_sha, OBSERVED); assert.equal(receipt.application_baseline, BASELINE);
  assert.equal(receipt.node, 'v22.23.4'); assert.equal(receipt.synthetic_exports, false); assert.equal(receipt.lifecycle_years, '5');
  assert.equal(receipt.cases[0].status, 'failed'); assert.equal(receipt.cases[0].duration_ms, 180000);
  assert.equal(h.reporter.getLastError(), undefined); assert.deepEqual(h.messages, []);
  const serialized = h.writes.map(write => write.data).join('\n');
  for (const excluded of ['private process', 'PRIVATE_ENV', 'private-env-value-not-for-the-receipt', 'not-for-the-receipt']) assert.equal(serialized.includes(excluded), false);
});

test('runtime reporter leaves provenance incomplete for missing, malformed or unsafe own process groups', () => {
  const invalid = [
    {readError: true}, {stat: 'not a proc status'}, {stat: '8888 (worker) S 5555'},
    ...['NaN', '0', '-1', '1', '1.5', '9007199254740992'].map(group => ({stat: `8888 (worker) S 5555 ${group} 4242`})),
  ];
  for (const value of invalid) {
    const h = runtimeReporterHarness(value); h.reporter.onRunStart(); h.reporter.onRunComplete();
    assert.equal(h.receipt().completed, false);
    assert.match(h.reporter.getLastError()?.message ?? '', /runtime provenance is incomplete/);
    assert.equal(h.writes.map(write => write.data).join('\n').includes('private-read-error-not-for-the-receipt'), false);
  }
});
