const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, 'frontend-runtime-reporter.cjs'), 'utf8');
const SHA = 'a'.repeat(40), INVOCATION = 'd0c0d989-ecab-4de0-b23a-8a179a987606';
const ROOT = '/checkout/frontend', TARGET = {path: ROOT + '/src/preview/frameworkFiveYear.test.js'};
const digest = value => createHash('sha256').update(value).digest('hex');
// Literal selected values from the sealed native --showConfig receipt. No config child is executed here.
function nativeConfig() {
  return {name: '081a135eae76da4ab59f8ab4ab81cb26', rootDir: ROOT, roots: [ROOT + '/src'],
    testEnvironment: ROOT + '/node_modules/jest-environment-jsdom/build/index.js', testRunner: ROOT + '/node_modules/jest-circus/runner.js',
    runner: ROOT + '/node_modules/jest-runner/build/index.js', setupFiles: [ROOT + '/node_modules/react-app-polyfill/jsdom.js'],
    setupFilesAfterEnv: [ROOT + '/src/setupTests.js'], transform: [
      ['^.+\\.(js|jsx|mjs|cjs|ts|tsx)$', ROOT + '/node_modules/@craco/craco/dist/lib/features/jest/jest-babel-transform.js', {}],
      ['^.+\\.css$', ROOT + '/node_modules/react-scripts/config/jest/cssTransform.js', {}],
      ['^(?!.*\\.(js|jsx|mjs|cjs|ts|tsx|css|json)$)', ROOT + '/node_modules/react-scripts/config/jest/fileTransform.js', {}]],
    moduleNameMapper: [['^react-native$', 'react-native-web'], ['^.+\\.module\\.(css|sass|scss)$', 'identity-obj-proxy'],
      ['^src/(.*)$', ROOT + '/src/$1'], ['^@/(.*)$', ROOT + '/src/$1'], ['^@catalogs/(.*)$', '/checkout/shared/catalogs/$1'],
      ['^@contracts/(.*)$', '/checkout/shared/contracts/$1'], ['^react-router/dom$', ROOT + '/node_modules/react-router/dist/development/dom-export.js'],
      ['^react-router-dom$', ROOT + '/node_modules/react-router-dom/dist/index.js']],
    transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\].+\\.(js|jsx|mjs|cjs|ts|tsx)$', '^.+\\.module\\.(css|sass|scss)$'],
    resetMocks: true, clearMocks: false, restoreMocks: false, resetModules: false, cache: true, cacheDirectory: '/tmp/jest_rt',
    testMatch: [ROOT + '/src/**/__tests__/**/*.{js,jsx,ts,tsx}', ROOT + '/src/**/*.{spec,test}.{js,jsx,ts,tsx}'],
    globals: {_cracoConfig: {babel: {plugins: [null]}, jest: {babel: {addPresets: true, addPlugins: true}}}}};
}
const nativeGlobal = () => ({maxWorkers: 1, collectCoverage: false, watch: false, watchAll: false, listTests: false,
  runTestsByPath: true, detectLeaks: false, detectOpenHandles: false, logHeapUsage: false, bail: 0,
  reporters: [['default', {}], [ROOT + '/scripts/frontend-runtime-reporter.cjs', {}]]});

function fixture({environment = {}, execArgv = [], failWrite = 0, failDirectory = false, failStderr = false,
  changeProject, changeGlobal, failRead = false, statSize, changedBytes = false, tick = 0} = {}) {
  const env = Object.freeze({FRONTEND_RUNTIME_RECEIPT: '/evidence/runtime.json', FRONTEND_RUNTIME_INVOCATION: INVOCATION,
    FRONTEND_RUNTIME_EARLY_ENV: JSON.stringify({node_env: 'unset', babel_env: 'unset'}), NODE_ENV: 'test', BABEL_ENV: 'test', GITHUB_SHA: SHA, ...environment});
  const writes = [], directories = [], errors = [], cpuCalls = [], requires = [], reads = [];
  const config = nativeConfig(), globalConfig = nativeGlobal();
  changeProject?.(config);changeGlobal?.(globalConfig);
  const target = {path: TARGET.path, context: {config}}, fileBytes = Buffer.from('// selected synthetic source\n');
  let clock = 100, attempts = 0, directoryFails = failDirectory;
  const resources = {userCPUTime: 1000, systemCPUTime: 50, maxRSS: 1024};
  const memory = {rss: 1048576, heapUsed: 500};
  const process = {env, execArgv, cwd: () => ROOT, version: 'v22.23.4', execPath: '/selected/node', pid: 1234, versions: {v8: 'test-v8'}, platform: 'linux', arch: 'x64',
    cpuUsage: previous => {cpuCalls.push(previous);return previous ? {user: 900, system: 60} : {user: 100, system: 40};},
    resourceUsage: () => resources, memoryUsage: () => memory, stderr: {write: value => {if (failStderr) throw new Error('Closed stderr');errors.push(value);}}};
  const mocks = {
    'node:fs': {mkdirSync: (directory, options) => {directories.push({directory, options});if (directoryFails) throw new Error('Private path must not leak');},
      writeFileSync: (file, text) => {attempts++;if (attempts === failWrite) throw new Error('Private storage failure');writes.push({file, proof: JSON.parse(text)});},
      statSync: () => ({isFile: () => true, size: statSize ?? fileBytes.length}),
      readFileSync: file => {reads.push(file);if (failRead) throw new Error('Private read failure');return changedBytes ? Buffer.from('changed') : fileBytes;}},
    'node:os': {availableParallelism: () => 4, cpus: () => [{model: 'Synthetic CPU model'}], totalmem: () => 16000, freemem: () => 12000},
    'node:path': path.posix,
    'node:crypto': {createHash},
    'node:perf_hooks': {performance: {now: () => {const value = clock;clock += tick;return value;}}},
  };
  const module = {exports: {}};
  vm.runInNewContext(source, {module, process, Buffer, Intl: {DateTimeFormat: () => ({resolvedOptions: () => ({timeZone: 'UTC'})})},
    require: name => {requires.push(name);assert(Object.hasOwn(mocks, name), 'Unexpected dependency: ' + name);return mocks[name];}}, {filename: 'frontend-runtime-reporter.cjs'});
  const Reporter = class extends module.exports {constructor() {super(globalConfig);}};
  return {Reporter, env, writes, directories, errors, cpuCalls, requires, resources, memory, reads, fileBytes, target, config, globalConfig,
    begin: reporter => {reporter.onRunStart();reporter.onTestStart(target);},
    setClock: value => {clock = value;}, recoverDirectory: () => {directoryFails = false;}, writeAttempts: () => attempts};
}
const cases = () => ['cis-ig1', 'soc-2', 'iso-27001'].map((name, index) => ({fullName: name + ' native lifecycle', status: index === 2 ? 'failed' : 'passed', duration: index === 2 ? 181143 : index}));

test('passive metadata records actual process, source and invocation without hardcoded application baselines or environment mutation', () => {
  const f = fixture({environment: {PRIVATE_TOKEN: 'not-for-the-receipt'}}), reporter = new f.Reporter(), before = JSON.stringify(f.env);
  reporter.onRunStart();assert.equal(f.writes.length, 1);
  const proof = f.writes[0].proof;
  assert.deepEqual(proof, {version: 1, invocation_id: INVOCATION, source_sha: SHA, node: 'v22.23.4', execPath: '/selected/node', pid: 1234,
    v8: 'test-v8', platform: 'linux', arch: 'x64', timezone: 'UTC', lifecycle_years: '5', synthetic_exports: false, phase_logging: false,
    available_parallelism: 4, cpu_model: 'Synthetic CPU model', total_memory: 16000, startup_free_memory: 12000, completed: false, cases: [],
    artifact_overhead: {completed_write_ms: 0, completed_write_calls: 0, current_write_excluded: true}});
  assert.equal(JSON.stringify(f.env), before);assert.equal(JSON.stringify(proof).includes('not-for-the-receipt'), false);
  assert.equal(Object.hasOwn(proof, 'application_baseline'), false);assert.equal(Object.hasOwn(proof, 'application_baseline_sha'), false);
  assert.deepEqual(f.requires, ['node:fs', 'node:os', 'node:path', 'node:perf_hooks', 'node:crypto']);
  assert.equal(typeof reporter.onTestCaseResult, 'undefined');
});

test('only exact native lifecycle suite results are retained, including failures, zero durations and original ordering', () => {
  const f = fixture(), reporter = new f.Reporter(), results = cases().map(value => Object.freeze(value)), before = JSON.stringify(results);
  f.begin(reporter);
  reporter.onTestResult({path: '/checkout/frontend/src/preview/other.test.js'}, {testResults: cases()});assert.equal(f.writes.length, 2);
  reporter.onTestResult(TARGET, {testResults: Object.freeze(results)});
  assert.deepEqual(f.writes[2].proof.cases, results.map(value => ({name: value.fullName, status: value.status, duration_ms: value.duration})));
  assert.equal(f.writes[2].proof.completed, false);assert.equal(f.writes[2].proof.cases[2].status, 'failed');assert.equal(f.writes[2].proof.cases[0].duration_ms, 0);
  reporter.onTestResult({path: 'C:\\checkout\\frontend\\src\\preview\\frameworkFiveYear.test.js.bak'}, {testResults: []});assert.equal(f.writes.length, 3);
  f.setClock(250);reporter.onRunComplete();
  const proof = f.writes[3].proof;
  assert.equal(proof.completed, true);assert.equal(proof.elapsed_ms, 150);assert.deepEqual(proof.cpu_usage_us, {user: 900, system: 60});
  assert.deepEqual(proof.resource_usage, f.resources);assert.deepEqual(proof.memory_usage, f.memory);assert.deepEqual(f.cpuCalls, [undefined, {user: 100, system: 40}]);
  assert.equal(proof.cases[2].duration_ms, 181143);assert.equal(reporter.getLastError(), undefined);assert.equal(JSON.stringify(results), before);
  assert.equal(f.writeAttempts(), 4);
});

test('Windows target paths use exact whole-suite results without appending duplicate callback outcomes', () => {
  const f = fixture(), reporter = new f.Reporter();
  reporter.onTestResult({path: 'C:\\checkout\\frontend\\src\\preview\\frameworkFiveYear.test.js'}, {testResults: cases()});
  const replacement = [{fullName: 'original failed native case', status: 'failed'}, {fullName: 'original pending native case', status: 'pending', duration: 0}];
  reporter.onTestResult(TARGET, {testResults: replacement});reporter.onRunComplete();
  assert.deepEqual(f.writes.at(-1).proof.cases, [{name: 'original failed native case', status: 'failed', duration_ms: null}, {name: 'original pending native case', status: 'pending', duration_ms: 0}]);
});

test('unexpected workload flags are reported faithfully for the caller to reject rather than normalized into success', () => {
  for (const environment of [{ISO_PHASE_LOG_DIR: '/phase'}, {ISO_PR110_PHASE_DIR: '/phase'}, {ISO_PHASE_LOG_DIR: '', ISO_PR110_PHASE_DIR: '/phase'}]) {
    const f = fixture({environment}), reporter = new f.Reporter();reporter.onRunStart();assert.equal(f.writes[0].proof.phase_logging, true);
  }
  const f = fixture({environment: {FRAMEWORK_LIFECYCLE_YEARS: '3', FRAMEWORK_LIFECYCLE_EXPORT_DIR: '/exports',
    FRONTEND_RUNTIME_INVOCATION: 'another-invocation', GITHUB_SHA: 'b'.repeat(40)}}), reporter = new f.Reporter();reporter.onRunStart();
  assert.equal(f.writes[0].proof.lifecycle_years, '3');assert.equal(f.writes[0].proof.synthetic_exports, true);
  assert.equal(f.writes[0].proof.invocation_id, 'another-invocation');assert.equal(f.writes[0].proof.source_sha, 'b'.repeat(40));
});

test('a failed provenance write stays failed after recovery and returns a safe Jest reporter error', () => {
  const f = fixture({failDirectory: true}), reporter = new f.Reporter();reporter.onRunStart();assert.equal(f.writes.length, 0);
  f.recoverDirectory();reporter.onTestResult(TARGET, {testResults: cases()});reporter.onRunComplete();
  assert.equal(f.writes.at(-1).proof.completed, false);assert.equal(reporter.getLastError().message, 'Frontend runtime provenance is incomplete');
  assert.deepEqual(f.errors, ['Frontend runtime provenance write failed.\n']);
  assert.equal(f.errors.join('').includes('Private path'), false);
});

test('final-write failure retains the earlier incomplete failed-case receipt and cannot report complete provenance', () => {
  const f = fixture({failWrite: 4}), reporter = new f.Reporter();f.begin(reporter);reporter.onTestResult(TARGET, {testResults: cases()});reporter.onRunComplete();
  assert.equal(f.writes.length, 3);assert.equal(f.writes.at(-1).proof.completed, false);assert.equal(f.writes.at(-1).proof.cases[2].status, 'failed');
  assert.equal(reporter.getLastError().message, 'Frontend runtime provenance is incomplete');assert.equal(f.errors.length, 1);
});

test('an unavailable stderr cannot conceal the sticky provenance failure or replace native test outcomes', () => {
  const f = fixture({failDirectory: true, failStderr: true}), reporter = new f.Reporter();
  assert.doesNotThrow(() => reporter.onRunStart());reporter.onTestResult(TARGET, {testResults: cases()});
  f.recoverDirectory();assert.doesNotThrow(() => reporter.onRunComplete());
  assert.equal(f.writes.at(-1).proof.completed, false);assert.equal(f.writes.at(-1).proof.cases[2].status, 'failed');
  assert.equal(reporter.getLastError().message, 'Frontend runtime provenance is incomplete');
});

test('an unused reporter without an output path creates no artifact or phase work', () => {
  const f = fixture({environment: {FRONTEND_RUNTIME_RECEIPT: undefined}}), reporter = new f.Reporter();
  f.begin(reporter);reporter.onTestResult(TARGET, {testResults: cases()});reporter.onRunComplete();
  assert.equal(f.directories.length, 0);assert.equal(f.writes.length, 0);assert.equal(f.reads.length, 0);assert.equal(reporter.getLastError(), undefined);
});

test('the pre-file snapshot captures actual selected native configuration and hashes without claiming VM execution', () => {
  const f = fixture({environment: {PRIVATE_TOKEN: 'not-for-the-receipt'}, tick: 1}), reporter = new f.Reporter();
  const projectBefore = JSON.stringify(f.config), globalBefore = JSON.stringify(f.globalConfig);
  f.begin(reporter);
  const envelope = f.writes.at(-1).proof.envelope;
  assert.equal(envelope.hook, 'onTestStart');assert.equal(envelope.capture_status, 'admitted');
  assert.equal(envelope.identity_evidence, 'configured-selected-resolved');assert.equal(envelope.actual_vm_module_execution, 'UNVERIFIED');
  assert.equal(envelope.test_path, TARGET.path);assert.equal(envelope.cwd, ROOT);assert.equal(envelope.project.name, f.config.name);
  assert.deepEqual(envelope.project.transform, f.config.transform);assert.deepEqual(envelope.project.moduleNameMapper, f.config.moduleNameMapper);
  assert.equal(envelope.global.maxWorkers, 1);assert.equal(envelope.global.testNamePattern, null);
  assert.deepEqual(envelope.babel_globals, {addPresets: true, addPlugins: true, plugin_slots: ['null'], preset_slots: []});
  assert.deepEqual(envelope.early_environment, {node_env: 'unset', babel_env: 'unset'});
  assert.deepEqual(envelope.inner_environment, {node_env: 'test', babel_env: 'test'});
  assert.deepEqual(envelope.startup, {exec_argv_count: 0, exec_argv_empty: true, node_options_present: false, node_options_nonempty: false,
    v8_coverage_enabled: false, jest_jasmine: 'unset'});
  assert.equal(envelope.selected_files.length, 9);assert.equal(f.reads.length, 9);
  assert.equal(new Set(envelope.selected_files.map(row => row.path)).size, 9);
  for (const row of envelope.selected_files) {assert.equal(row.sha256, digest(f.fileBytes));assert.equal(row.bytes, f.fileBytes.length);}
  assert.equal(envelope.configured_fields_sha256, digest(JSON.stringify({project: envelope.project, global: envelope.global, babel_globals: envelope.babel_globals})));
  assert(envelope.overhead.snapshot_ms > 0);assert(f.writes.at(-1).proof.artifact_overhead.completed_write_ms > 0);
  assert.equal(f.writes.at(-1).proof.artifact_overhead.current_write_excluded, true);
  assert.equal(JSON.stringify(f.config), projectBefore);assert.equal(JSON.stringify(f.globalConfig), globalBefore);
  f.config.moduleNameMapper.push(['private', 'not-for-the-receipt']);f.globalConfig.maxWorkers = 99;
  reporter.onTestResult(TARGET, {testResults: cases()});reporter.onRunComplete();
  const final = f.writes.at(-1).proof;
  assert.equal(final.completed, true);assert.equal(final.cases[2].status, 'failed');
  assert.equal(final.envelope.global.maxWorkers, 1);assert.equal(final.envelope.configured_fields_sha256, envelope.configured_fields_sha256);
  assert.equal(JSON.stringify(final).includes('not-for-the-receipt'), false);
});

test('alternate routes, setup, aliases, global filters and Babel slots reject before selected-file reads', () => {
  const options = [
    {changeProject: value => {value.transform[0][1] = '/private/alternate-transform.js';}},
    {changeProject: value => {value.setupFilesAfterEnv.push('/private/observer.js');}},
    {changeProject: value => {value.moduleNameMapper[0][1] = '/private/alternate.js';}},
    {changeProject: value => {value.globals._cracoConfig.babel.plugins.push('private-plugin');}},
    {changeProject: value => {value.name = 'private-name';}},
    {changeProject: value => {value.cacheDirectory = '/private/token';}},
    {changeGlobal: value => {value.testNamePattern = 'private-filter';}},
    {changeGlobal: value => {value.collectCoverage = true;}},
    {changeGlobal: value => {value.maxWorkers = 2;}},
    {changeGlobal: value => {value.reporters.push(['/private/observer.js', {}]);}},
  ];
  for (const option of options) {
    const f = fixture(option), reporter = new f.Reporter();reporter.onRunStart();
    assert.throws(() => reporter.onTestStart(f.target), /Frontend runtime admission rejected/);
    reporter.onRunComplete();
    assert.equal(f.reads.length, 0);assert.equal(f.writes.at(-1).proof.completed, false);
    assert.equal(f.writes.at(-1).proof.envelope.capture_status, 'rejected');
    assert.equal(JSON.stringify(f.writes).includes('private'), false);assert(reporter.getLastError());
  }
});

test('unexpected startup and early/inner environment values reject safely without copying their contents', () => {
  const options = [
    {execArgv: ['--require=private-secret']}, {environment: {NODE_OPTIONS: '--require=private-secret'}},
    {environment: {NODE_V8_COVERAGE: '/private-secret'}},
    {environment: {JEST_JASMINE: '1'}}, {environment: {JEST_JASMINE: 'private-secret'}},
    {environment: {NODE_ENV: 'production'}}, {environment: {BABEL_ENV: 'private-secret'}},
    {environment: {FRONTEND_RUNTIME_EARLY_ENV: 'private-secret'}},
    {environment: {FRONTEND_RUNTIME_EARLY_ENV: JSON.stringify({node_env: 'production', babel_env: 'unset'})}},
  ];
  for (const option of options) {
    const f = fixture(option), reporter = new f.Reporter();reporter.onRunStart();
    assert.throws(() => reporter.onTestStart(f.target), /Frontend runtime admission rejected/);
    assert.equal(f.reads.length, 0);assert.equal(f.writes.at(-1).proof.envelope.capture_status, 'rejected');
    assert.equal(JSON.stringify(f.writes).includes('private-secret'), false);
  }
  const f = fixture({environment: {NODE_OPTIONS: '', JEST_JASMINE: '', FRONTEND_RUNTIME_EARLY_ENV: JSON.stringify({node_env: 'empty', babel_env: 'test'})}});
  assert.doesNotThrow(() => f.begin(new f.Reporter()));
  assert.equal(f.writes.at(-1).proof.envelope.startup.node_options_present, true);
});

test('changed workload flags stop admission before native bodies rather than only failing later accounting', () => {
  for (const environment of [{FRAMEWORK_LIFECYCLE_YEARS: '3'}, {FRAMEWORK_LIFECYCLE_EXPORT_DIR: '/exports'}, {ISO_PHASE_LOG_DIR: '/phase'}, {ISO_PR110_PHASE_DIR: '/phase'}]) {
    const f = fixture({environment}), reporter = new f.Reporter();reporter.onRunStart();
    assert.throws(() => reporter.onTestStart(f.target), /WORKLOAD_FLAGS/);
    assert.equal(f.reads.length, 0);assert.equal(f.writes.at(-1).proof.envelope.error_code, 'WORKLOAD_FLAGS');
  }
});

test('selected-file failures, size limits and a changed read retain safe rejection instead of a hash claim', () => {
  for (const [options, code] of [[{failRead: true}, 'SELECTED_FILE_READ'], [{statSize: 4 * 1024 * 1024 + 1}, 'SELECTED_FILE_LIMIT'], [{changedBytes: true}, 'SELECTED_FILE_CHANGED']]) {
    const f = fixture(options), reporter = new f.Reporter();reporter.onRunStart();
    assert.throws(() => reporter.onTestStart(f.target), new RegExp(code));reporter.onRunComplete();
    assert.equal(f.writes.at(-1).proof.completed, false);assert.equal(f.writes.at(-1).proof.envelope.error_code, code);
    assert.equal(Object.hasOwn(f.writes.at(-1).proof.envelope, 'selected_files'), false);
    assert.equal(JSON.stringify(f.writes).includes('Private read failure'), false);
  }
});

test('missing start, missing cases, invalid duration and duplicate start never complete provenance', () => {
  const noStart = fixture(), a = new noStart.Reporter();a.onRunStart();a.onTestResult(TARGET, {testResults: cases()});a.onRunComplete();
  assert.equal(noStart.writes.at(-1).proof.completed, false);assert(a.getLastError());
  const noCases = fixture(), b = new noCases.Reporter();noCases.begin(b);b.onRunComplete();
  assert.equal(noCases.writes.at(-1).proof.completed, false);assert(b.getLastError());
  const invalid = fixture(), c = new invalid.Reporter();invalid.begin(c);const results = cases();results[0].duration = undefined;
  c.onTestResult(TARGET, {testResults: results});c.onRunComplete();assert.equal(invalid.writes.at(-1).proof.completed, false);assert(c.getLastError());
  const duplicate = fixture(), d = new duplicate.Reporter();duplicate.begin(d);
  assert.throws(() => d.onTestStart(duplicate.target), /ADMISSION_STATE/);assert.equal(duplicate.reads.length, 9);
});

test('snapshot artifact failure rejects admission and remains sticky after later successful writes', () => {
  const f = fixture({failWrite: 2}), reporter = new f.Reporter();reporter.onRunStart();
  assert.throws(() => reporter.onTestStart(f.target), /ARTIFACT_WRITE/);
  reporter.onTestResult(TARGET, {testResults: cases()});reporter.onRunComplete();
  assert.equal(f.writes.at(-1).proof.completed, false);assert.equal(f.writes.at(-1).proof.cases[2].status, 'failed');
  assert.equal(reporter.getLastError().message, 'Frontend runtime provenance is incomplete');
});
