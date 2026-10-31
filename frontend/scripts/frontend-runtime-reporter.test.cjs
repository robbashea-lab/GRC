const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'frontend-runtime-reporter.cjs'), 'utf8');
const SHA = 'a'.repeat(40), INVOCATION = 'd0c0d989-ecab-4de0-b23a-8a179a987606';
const TARGET = {path: '/checkout/frontend/src/preview/frameworkFiveYear.test.js'};

function fixture({environment = {}, failWrite = 0, failDirectory = false, failStderr = false} = {}) {
  const env = Object.freeze({FRONTEND_RUNTIME_RECEIPT: '/evidence/runtime.json', FRONTEND_RUNTIME_INVOCATION: INVOCATION, GITHUB_SHA: SHA, ...environment});
  const writes = [], directories = [], errors = [], cpuCalls = [], requires = [];
  let clock = 100, attempts = 0, directoryFails = failDirectory;
  const resources = {userCPUTime: 1000, systemCPUTime: 50, maxRSS: 1024};
  const memory = {rss: 1048576, heapUsed: 500};
  const process = {env, version: 'v22.23.4', execPath: '/selected/node', pid: 1234, versions: {v8: 'test-v8'}, platform: 'linux', arch: 'x64',
    cpuUsage: previous => {cpuCalls.push(previous);return previous ? {user: 900, system: 60} : {user: 100, system: 40};},
    resourceUsage: () => resources, memoryUsage: () => memory, stderr: {write: value => {if (failStderr) throw new Error('Closed stderr');errors.push(value);}}};
  const mocks = {
    'node:fs': {mkdirSync: (directory, options) => {directories.push({directory, options});if (directoryFails) throw new Error('Private path must not leak');},
      writeFileSync: (file, text) => {attempts++;if (attempts === failWrite) throw new Error('Private storage failure');writes.push({file, proof: JSON.parse(text)});}},
    'node:os': {availableParallelism: () => 4, cpus: () => [{model: 'Synthetic CPU model'}], totalmem: () => 16000, freemem: () => 12000},
    'node:path': path,
    'node:perf_hooks': {performance: {now: () => clock}},
  };
  const module = {exports: {}};
  vm.runInNewContext(source, {module, process, Intl: {DateTimeFormat: () => ({resolvedOptions: () => ({timeZone: 'UTC'})})},
    require: name => {requires.push(name);assert(Object.hasOwn(mocks, name), 'Unexpected dependency: ' + name);return mocks[name];}}, {filename: 'frontend-runtime-reporter.cjs'});
  return {Reporter: module.exports, env, writes, directories, errors, cpuCalls, requires, resources, memory,
    setClock: value => {clock = value;}, recoverDirectory: () => {directoryFails = false;}, writeAttempts: () => attempts};
}
const cases = () => ['cis-ig1', 'soc-2', 'iso-27001'].map((name, index) => ({fullName: name + ' native lifecycle', status: index === 2 ? 'failed' : 'passed', duration: index === 2 ? 181143 : index}));

test('passive metadata records actual process, source and invocation without hardcoded application baselines or environment mutation', () => {
  const f = fixture({environment: {PRIVATE_TOKEN: 'not-for-the-receipt'}}), reporter = new f.Reporter(), before = JSON.stringify(f.env);
  reporter.onRunStart();assert.equal(f.writes.length, 1);
  const proof = f.writes[0].proof;
  assert.deepEqual(proof, {version: 1, invocation_id: INVOCATION, source_sha: SHA, node: 'v22.23.4', execPath: '/selected/node', pid: 1234,
    v8: 'test-v8', platform: 'linux', arch: 'x64', timezone: 'UTC', lifecycle_years: '5', synthetic_exports: false, phase_logging: false,
    available_parallelism: 4, cpu_model: 'Synthetic CPU model', total_memory: 16000, startup_free_memory: 12000, completed: false, cases: []});
  assert.equal(JSON.stringify(f.env), before);assert.equal(JSON.stringify(proof).includes('not-for-the-receipt'), false);
  assert.equal(Object.hasOwn(proof, 'application_baseline'), false);assert.equal(Object.hasOwn(proof, 'application_baseline_sha'), false);
  assert.deepEqual(f.requires, ['node:fs', 'node:os', 'node:path', 'node:perf_hooks']);
  assert.equal(typeof reporter.onTestCaseResult, 'undefined');
});

test('only exact native lifecycle suite results are retained, including failures, zero durations and original ordering', () => {
  const f = fixture(), reporter = new f.Reporter(), results = cases().map(value => Object.freeze(value)), before = JSON.stringify(results);
  reporter.onRunStart();
  reporter.onTestResult({path: '/checkout/frontend/src/preview/other.test.js'}, {testResults: cases()});assert.equal(f.writes.length, 1);
  reporter.onTestResult(TARGET, {testResults: Object.freeze(results)});
  assert.deepEqual(f.writes[1].proof.cases, results.map(value => ({name: value.fullName, status: value.status, duration_ms: value.duration})));
  assert.equal(f.writes[1].proof.completed, false);assert.equal(f.writes[1].proof.cases[2].status, 'failed');assert.equal(f.writes[1].proof.cases[0].duration_ms, 0);
  reporter.onTestResult({path: 'C:\\checkout\\frontend\\src\\preview\\frameworkFiveYear.test.js.bak'}, {testResults: []});assert.equal(f.writes.length, 2);
  f.setClock(250);reporter.onRunComplete();
  const proof = f.writes[2].proof;
  assert.equal(proof.completed, true);assert.equal(proof.elapsed_ms, 150);assert.deepEqual(proof.cpu_usage_us, {user: 900, system: 60});
  assert.deepEqual(proof.resource_usage, f.resources);assert.deepEqual(proof.memory_usage, f.memory);assert.deepEqual(f.cpuCalls, [undefined, {user: 100, system: 40}]);
  assert.equal(proof.cases[2].duration_ms, 181143);assert.equal(reporter.getLastError(), undefined);assert.equal(JSON.stringify(results), before);
  assert.equal(f.writeAttempts(), 3);
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
  const f = fixture({failWrite: 3}), reporter = new f.Reporter();reporter.onRunStart();reporter.onTestResult(TARGET, {testResults: cases()});reporter.onRunComplete();
  assert.equal(f.writes.length, 2);assert.equal(f.writes.at(-1).proof.completed, false);assert.equal(f.writes.at(-1).proof.cases[2].status, 'failed');
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
  reporter.onRunStart();reporter.onTestResult(TARGET, {testResults: cases()});reporter.onRunComplete();
  assert.equal(f.directories.length, 0);assert.equal(f.writes.length, 0);assert.equal(reporter.getLastError(), undefined);
});
