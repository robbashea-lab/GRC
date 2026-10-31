const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createObserver} = require('./observer.cjs');
const {baseEnvironment} = require('./run.cjs');
const source = fs.readFileSync(path.join(__dirname, 'setup.cjs'), 'utf8');
const baseline = '2303f958dd0fd8e02881aab3bbd7ac82450be469', observed = '1'.repeat(40);
const frameworks = ['cis-ig1', 'soc-2', 'iso-27001'];
function harness(options = {}) {
  const frontend = path.resolve('/synthetic/frontend'), output = path.resolve('/synthetic/output');
  let elapsed = 0, count = 0, failed = 0, cpuCalls = 0;
  const now = () => (elapsed += options.clockStep ?? 0.001);
  const artifacts = new Map(), hooks = {}, intervals = new Set(), mocks = new Map(), state = {currentTestName: '', canFork: true};
  const writer = {writeDemoStoreAsync: (storage, key, text) => Promise.resolve(text)};
  const command = {previewAdapter: config => writer.writeDemoStoreAsync(null, 'not-logged', config.text || 'x')};
  const portfolio = {canForkPortfolioStore: () => state.canFork};
  const modules = {'demoStorageCodec.js': writer, 'commandTestAdapter.js': command, 'portfolioReporting.js': portfolio};
  class Storage { getItem() { return null; } }
  function createArtifactWriter(directory, onError, fileSystem, settings) {
    assert.equal(directory, output);
    assert.equal(settings.budgetRoot, path.dirname(output));
    const write = (name, value, settings) => {
      count++;
      if (options.failWrite?.(name)) { failed++; onError('diagnostic-write-failed'); return false; }
      const text = JSON.stringify(value);
      assert(Buffer.byteLength(text) <= settings.maxBytes);
      artifacts.set(name, {data: JSON.parse(text), settings: {...settings}, bytes: Buffer.byteLength(text)});
      return true;
    };
    write.stats = () => ({count, failed, wall_ms: count * 0.01, includes_current_write: false});
    return write;
  }
  // Exercise the actual driver-to-Jest environment contract, not a duplicated fixture.
  const environment = baseEnvironment({GITHUB_SHA: observed}, output, '/node/bin/node', 'linux');
  const context = vm.createContext({Storage, process: {env: {...environment,
    PRIVATE_VALUE: 'never-in-metadata', ...options.environment},
    cwd: () => frontend, version: 'v22.23.4', execPath: '/node/bin/node', pid: 123,
    versions: {node: '22.23.4', v8: 'synthetic'}, platform: 'linux', arch: 'x64',
    cpuUsage: previous => {cpuCalls++; return previous ? {user: 25, system: 5} : {user: 100, system: 20};},
    memoryUsage: () => ({rss: 1024, heapUsed: 512})},
    Intl: {DateTimeFormat: () => ({resolvedOptions: () => ({timeZone: 'UTC'})})},
    expect: {getState: () => state},
    beforeAll: fn => {hooks.beforeAll = fn;}, beforeEach: fn => {hooks.beforeEach = fn;},
    afterEach: fn => {hooks.afterEach = fn;}, afterAll: fn => {hooks.afterAll = fn;},
  });
  const native = {'node:fs': {}, 'node:path': path, 'node:os': {availableParallelism: () => 4, cpus: () => [{model: 'Synthetic CPU'}], totalmem: () => 16000},
    'node:perf_hooks': {performance: {now}},
    'node:timers': {setInterval(fn, delay) {assert.equal(delay, 5000);const item = {fn, unref() {this.unreferenced = true;}};intervals.add(item);return item;},
      clearInterval(item) {intervals.delete(item);}}};
  context.jest = {doMock(file, factory) {mocks.set(file, factory);}, requireActual(file) {
    if (native[file]) return native[file];
    if (file.endsWith('observer.cjs')) return {createObserver: () => createObserver({now, scenarioDate: () => '2031-01-01T00:00:00.000Z'})};
    if (file.endsWith('artifact-writer.cjs')) return {createArtifactWriter};
    const value = modules[path.basename(file)]; assert(value, 'Unexpected module: ' + file); return value;
  }};
  vm.runInContext(source, context, {filename: 'setup.cjs'});
  function loadCommand() {return mocks.get(path.join(frontend, 'src/preview/commandTestAdapter.js'))();}
  const artifact = name => artifacts.get(name)?.data;
  return {hooks, intervals, state, modules, loadCommand, artifact, artifacts, context, cpuCalls: () => cpuCalls,
    begin(key) {state.currentTestName = key + ' fresh client retains the configured program lifecycle and period evidence';hooks.beforeEach();},
    finish() {hooks.afterEach();}};
}
async function complete(h) {
  const command = h.loadCommand(); await h.hooks.beforeAll();
  for (const key of frameworks) {h.begin(key);await command.previewAdapter({method: 'patch', url: '/reviews/synthetic/iso-audit/9-2-1', text: 'secret body not recorded'});h.finish();}
  h.hooks.afterAll();return h.artifact('two-point-summary.json');
}
test('fully settled calibration stays outside cases and records exact proposed screens', async () => {
  const h = harness(); h.loadCommand(); await h.hooks.beforeAll();
  const c = h.artifact('overhead-calibration.json');
  assert.equal(c.valid, true);assert.equal(c.sync.iterations, 1000);assert.equal(c.sync.settled, 1000);
  assert.equal(c.promise.iterations, 1000);assert.equal(c.promise.settled, 1000);
  assert.equal(c.io.writes, 8);assert.equal(c.io.bytes, 32768);
  assert.deepEqual(c.thresholds_ms, {sync: 50, promise: 100, io: 50});
  assert.equal([...h.artifacts].filter(([name]) => name.startsWith('overhead-io-')).reduce((sum, [, file]) => sum + file.bytes, 0), 32768);
  h.begin('cis-ig1');h.finish();
  assert.equal(h.artifact('two-point-case-01-cis-ig1.json').totals.commands_started, 0);
  assert.equal(h.intervals.size, 0);
});
test('only the two boundaries collect data; actual results and primitive sizes survive complete ordered cases', async () => {
  const h = harness(), s = await complete(h);
  assert.equal(s.complete, true);assert.equal(s.diagnostic_valid, true);assert.equal(s.qualification, false);
  assert.deepEqual(s.cases.map(c => c.framework), frameworks);
  for (const brief of s.cases) {
    const record = h.artifact(brief.artifact);
    assert.equal(record.command_count, undefined);assert.equal(record.commands.length, 1);assert.equal(record.writes.length, 1);
    assert.equal(record.writes[0].command_id, record.commands[0].id);
    assert.equal(record.writes[0].input_utf16_units, 'secret body not recorded'.length);
    assert.equal(record.writes[0].output_utf16_units, record.writes[0].input_utf16_units);
    assert.equal(record.guards_preserved, true);assert(Object.values(record.native_guards_after).every(Boolean));
    assert.equal(record.application_baseline_sha, baseline);assert.equal(record.observed_source_sha, observed);
  }
  const text = JSON.stringify([...h.artifacts.values()]);
  for (const forbidden of ['secret body not recorded', 'never-in-metadata', '/reviews/synthetic', 'not-logged']) assert.equal(text.includes(forbidden), false);
  assert.deepEqual(h.artifact('two-point-host.json').two_points, ['commandTestAdapter.js:previewAdapter', 'demoStorageCodec.js:writeDemoStoreAsync']);
  assert.equal(h.intervals.size, 0);
});
test('native real interval is unreferenced, small and cleared with window resources kept separate', async () => {
  const h = harness();h.loadCommand();await h.hooks.beforeAll();h.begin('iso-27001');
  const timer = [...h.intervals][0];assert.equal(timer.unreferenced, true);timer.fn();
  const live = h.artifact('two-point-live.json');
  assert.equal(live.resource.kind, 'interval');assert.deepEqual(live.resource.cpu_usage_us, {user: 25, system: 5});
  assert.equal(h.artifacts.get('two-point-live.json').settings.maxBytes, 16384);
  h.finish();assert.equal(h.intervals.size, 0);
});
test('overhead or metadata failure refuses before native lifecycle bodies', async () => {
  for (const options of [{clockStep: 1}, {failWrite: name => name === 'overhead-io-0.json'}]) {
    const h = harness(options);h.loadCommand();
    await assert.rejects(h.hooks.beforeAll, /calibration refused/);
    assert.equal(h.artifact('overhead-calibration.json').valid, false);
    assert.throws(() => h.begin('cis-ig1'), /before calibration/);
    assert.equal(h.intervals.size, 0);
  }
});
test('native guard or binding drift refuses capture without changing source workflow', async () => {
  const h = harness();h.loadCommand();await h.hooks.beforeAll();h.state.canFork = false;
  assert.throws(() => h.begin('cis-ig1'), /Native guard changed/);
  const second = harness();second.loadCommand();await second.hooks.beforeAll();second.begin('cis-ig1');second.finish();
  second.modules['demoStorageCodec.js'].writeDemoStoreAsync = () => Promise.resolve('foreign');
  assert.throws(() => second.begin('soc-2'), /binding changed/);
});
test('source mismatch stops setup before it can register or invoke lifecycle work', () => {
  assert.throws(() => harness({environment: {ISO_TWO_POINT_APP_SHA: 'b'.repeat(40)}}), /source provenance/);
});
test('actual Jest executable mismatch refuses before calibration and native bodies', async () => {
  const h = harness({environment: {ISO_TWO_POINT_EXPECTED_EXEC_PATH: '/foreign/node'}});h.loadCommand();
  await assert.rejects(h.hooks.beforeAll, /Actual Jest runtime refused/);
  assert.equal(h.artifacts.size, 0);assert.equal(h.intervals.size, 0);
});

function runtimeHarness({badGroup = false, writeFails = false} = {}) {
  const outputs = [], errors = [];let elapsed = 10;
  const proc = {env: {FRONTEND_RUNTIME_RECEIPT: '/evidence/runtime.json', ISO_TWO_POINT_OUTPUT: '/evidence', GITHUB_SHA: observed},
    version: 'v22.23.4', execPath: '/node/bin/node', pid: 123, ppid: 122, versions: {v8: 'test'}, platform: 'linux', arch: 'x64',
    cpuUsage: previous => previous ? {user: 50, system: 5} : {user: 10, system: 1},
    resourceUsage: () => ({maxRSS: 100}), memoryUsage: () => ({rss: 1000})};
  const mocks = {'node:fs': {readFileSync: () => badGroup ? 'invalid' : '123 (Jest process) S 122 77 0'},
    'node:os': {availableParallelism: () => 4, cpus: () => [{model: 'Synthetic CPU'}], totalmem: () => 16000, freemem: () => 12000},
    'node:path': path, 'node:perf_hooks': {performance: {now: () => elapsed++}},
    './artifact-writer.cjs': {createArtifactWriter(directory, onError, fileSystem, settings) {
      assert.equal(directory, '/evidence');assert.equal(settings.budgetRoot, path.dirname('/evidence'));
      return (name, value, options) => {
      assert.equal(options.final, true);assert.equal(options.maxBytes, 65536);
      if (writeFails) {errors.push('write');onError('failed');return false;}
      outputs.push(JSON.parse(JSON.stringify(value)));return true;
    };}}};
  const module = {exports: {}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'runtime-reporter.cjs'), 'utf8'), {module, process: proc,
    Intl: {DateTimeFormat: () => ({resolvedOptions: () => ({timeZone: 'UTC'})})}, require(name) {assert(mocks[name]);return mocks[name];}});
  return {Reporter: module.exports, outputs, errors};
}
test('actual runtime reporter preserves failed original outcomes and its owned group metadata', () => {
  const h = runtimeHarness(), reporter = new h.Reporter();reporter.onRunStart();
  const cases = frameworks.map((key, i) => ({fullName: key + ' lifecycle', status: i === 2 ? 'failed' : 'passed', duration: i === 2 ? 181158 : 10}));
  reporter.onTestResult({path: '/repo/frontend/src/preview/frameworkFiveYear.test.js'}, {testResults: cases});reporter.onRunComplete();
  const result = h.outputs.at(-1);
  assert.equal(result.completed, true);assert.equal(result.process_group_id, 77);assert.equal(result.application_baseline, baseline);
  assert.equal(result.qualification, false);assert.equal(result.two_point_logging, true);assert.equal(result.phase_logging, false);
  assert.equal(result.cases[2].status, 'failed');assert.equal(result.cases[2].duration_ms, 181158);assert.equal(reporter.getLastError(), undefined);
});
test('unavailable process group and failed runtime writes remain capture failures', () => {
  for (const options of [{badGroup: true}, {writeFails: true}]) {
    const h = runtimeHarness(options), reporter = new h.Reporter();reporter.onRunStart();reporter.onRunComplete();
    assert.match(reporter.getLastError().message, /incomplete/);
    if (h.outputs.length) assert.equal(h.outputs.at(-1).completed, false);
  }
});
