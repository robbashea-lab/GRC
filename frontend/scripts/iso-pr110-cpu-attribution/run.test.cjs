const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {BASELINE, LIMITS, CASES, deadlineFor, verifyAdmission, environmentFor, argumentsFor, verifyConfiguration,
  runChild, verifySequence, ensureOutput, writeJSON, run} = require('./run.cjs');

const sha = 'a'.repeat(40);
const actual = {node: 'v22.23.4', platform: 'linux', arch: 'x64', timezone: 'UTC', execPath: '/pinned/node'};
const environment = {GITHUB_SHA: sha, GITHUB_RUN_ATTEMPT: '1'};
const temp = t => { const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cpu-attribution-test-')); t.after(() => fs.rmSync(folder, {recursive: true, force: true})); return folder; };

test('runtime/attempt admission rejects another Node, non-UTC, retries and missing exact source', () => {
  verifyAdmission(actual, environment);
  for (const difference of [{node: 'v22.23.3'}, {timezone: 'America/Los_Angeles'}, {platform: 'win32'}, {arch: 'arm64'}]) {
    assert.throws(() => verifyAdmission({...actual, ...difference}, environment));
  }
  assert.throws(() => verifyAdmission(actual, {...environment, GITHUB_RUN_ATTEMPT: '2'}));
  assert.throws(() => verifyAdmission(actual, {...environment, GITHUB_SHA: 'short'}));
});
test('the first-step deadline cannot be replaced with a new or extended work budget', () => {
  assert.equal(deadlineFor({CPU_ATTRIBUTION_DEADLINE_MS: '720001'}, 1), 720001);
  for (const raw of [undefined, '', '1', '720002', 'Infinity', '1.5']) {
    assert.throws(() => deadlineFor({CPU_ATTRIBUTION_DEADLINE_MS: raw}, 1));
  }
});
test('exports and earlier observers are refused instead of silently changing the workload', () => {
  const env = environmentFor({PATH: '/usr/bin', ...environment}, '/owned', actual);
  assert.equal(env.PATH, '/pinned:/usr/bin');
  assert.equal(env.CPU_ATTRIBUTION_APP_SHA, BASELINE);
  assert.equal(env.FRAMEWORK_LIFECYCLE_YEARS, '5');
  for (const field of ['NODE_OPTIONS', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR', 'ISO_SUMMARY_COST_OUTPUT', 'REPORTING_PREP_LOG_DIR', 'ISO_TWO_POINT_OUTPUT']) {
    assert.throws(() => environmentFor({...environment, [field]: 'present'}, '/owned', actual), /inherited/);
  }
});
test('profiling arguments target CRACO inner Node before test; admission child is unprofiled', () => {
  const frontend = path.resolve('fixture/frontend'), runner = path.resolve('fixture/craco.js'), output = path.resolve('fixture/output');
  const args = argumentsFor(frontend, output, {runner});
  assert.deepEqual(args.slice(0, 5), [runner, '--cpu-prof', '--cpu-prof-dir=' + output, '--cpu-prof-interval=10000', 'test']);
  assert.deepEqual(args.slice(5, 9), ['--watchAll=false', '--runInBand', '--runTestsByPath', 'src/preview/frameworkFiveYear.test.js']);
  assert.ok(!args.some(arg => /testTimeout|testNamePattern|setupFilesAfterEnv|--inspect/.test(arg)));
  const admission = argumentsFor(frontend, output, {runner, configuration: true});
  assert.ok(admission.includes('--showConfig'));
  assert.ok(!admission.some(arg => /cpu-prof|reporters|--config/.test(arg)));
});
test('native configuration admission rejects overlays, additional setup and a different environment', t => {
  const frontend = temp(t), native = path.join(frontend, 'native-transform.cjs');
  fs.writeFileSync(native, '// synthetic transform');
  const config = {configs: [{rootDir: frontend, roots: [path.join(frontend, 'src')], name: 'native-name',
    transform: [['^.+\\.(js|jsx|mjs|cjs|ts|tsx)$', native, {}]], setupFilesAfterEnv: [path.join(frontend, 'src/setupTests.js')],
    testEnvironment: path.join(frontend, 'jest-environment-jsdom/build/index.js'),
    moduleNameMapper: [['^@/(.*)$', path.join(frontend, 'src/$1')]],
    globals: {_cracoConfig: {jest: {configure: {moduleNameMapper: {'^@/(.*)$': '<rootDir>/src/$1'}}}}}}],
  globalConfig: {maxWorkers: 1, runTestsByPath: true, nonFlagArgs: ['src/preview/frameworkFiveYear.test.js'], collectCoverage: false,
    bail: 0, watchAll: false, passWithNoTests: false}};
  assert.equal(verifyConfiguration(config, frontend, native).valid, true);
  const copy = () => JSON.parse(JSON.stringify(config));
  for (const mutate of [value => value.configs[0].setupFilesAfterEnv.push('other-setup'),
    value => value.configs[0].transform.push(['exact-target', '/iso-pr110-overlay']),
    value => { value.globalConfig.maxWorkers = 2; }, value => { value.configs[0].testEnvironment = 'node'; },
    value => { value.configs[0].moduleNameMapper[0][1] = '/wrong-target'; }]) {
    const changed = copy(); mutate(changed); assert.throws(() => verifyConfiguration(changed, frontend, native));
  }
});
test('sequence validation preserves original failed outcome without accepting wrapper identity or reordered cases', () => {
  const cases = CASES.map((fullName, index) => ({fullName, status: index === 2 ? 'failed' : 'passed'}));
  const env = {...environment, CPU_ATTRIBUTION_PROFILE_DIR: '/owned'};
  const observed = {...actual, pid: 102, process_group_id: 101, completed: true, diagnostic_only: true, qualification: false,
    source_sha: sha, application_baseline: BASELINE, lifecycle_years: '5', synthetic_exports: false, profiler_enabled: true,
    profiler_interval_us: 10000, execArgv: ['--cpu-prof', '--cpu-prof-dir=/owned', '--cpu-prof-interval=10000'], errors: [],
    cases: cases.map((row, index) => ({name: row.fullName, status: row.status, duration_ms: 100 + index})),
    cpu_usage_us: {user: 3, system: 1}, memory_usage: {rss: 100}, resource_usage: {maxRSS: 100}};
  const jest = {wasInterrupted: false, numTotalTestSuites: 1, numTotalTests: 3, numPendingTests: 0, numPendingTestSuites: 0,
    numRuntimeErrorTestSuites: 0, numPassedTests: 2, numFailedTests: 1, success: false, numPassedTestSuites: 0, numFailedTestSuites: 1,
    testResults: [{name: '/src/preview/frameworkFiveYear.test.js', assertionResults: cases}]};
  assert.equal(verifySequence(observed, jest, {pid: 101, status: 1}, env, actual).original_cases_passed, false);
  assert.throws(() => verifySequence({...observed, pid: 101}, jest, {pid: 101, status: 1}, env, actual));
  assert.throws(() => verifySequence({...observed, profiler_enabled: false}, jest, {pid: 101, status: 1}, env, actual));
  assert.throws(() => verifySequence({...observed, execArgv: []}, jest, {pid: 101, status: 1}, env, actual));
  const reordered = {...jest, testResults: [{...jest.testResults[0], assertionResults: [...cases].reverse()}]};
  assert.throws(() => verifySequence(observed, reordered, {pid: 101, status: 1}, env, actual));
  assert.throws(() => verifySequence(observed, jest, {pid: 101, status: 0}, env, actual));
});
test('only the owned Linux group is signalled on the bounded watchdog', async () => {
  const timers = [], signals = [], child = new EventEmitter();
  Object.assign(child, {pid: 9123, stdout: new EventEmitter(), stderr: new EventEmitter()});
  let options;
  const resultPromise = runChild(['entry'], '/owned', {}, 1000000, {platform: 'linux', now: () => 10,
    spawnProcess: (executable, args, received) => { options = received; return child; },
    schedule: (callback, delay) => { timers.push({callback, delay}); return timers.length; }, cancel: () => {},
    signal: (pid, kind) => signals.push([pid, kind])});
  assert.equal(options.detached, true);
  assert.equal(timers[0].delay, LIMITS.childMs);
  timers[0].callback(); assert.deepEqual(signals, [[-9123, 'SIGTERM']]);
  assert.equal(timers[1].delay, 2000); timers[1].callback();
  const result = await resultPromise;
  assert.equal(result.hard_failure, 'Child wall watchdog exceeded');
  assert.deepEqual(signals[1], [-9123, 'SIGKILL']);
});
test('ordinary child exit is preserved without kill or a second process', async () => {
  const child = new EventEmitter(); Object.assign(child, {pid: 9124, stdout: new EventEmitter(), stderr: new EventEmitter()});
  const resultPromise = runChild(['entry'], '/owned', {}, Date.now() + 10000, {platform: 'linux',
    spawnProcess: () => child, signal: () => assert.fail('normal exit must not signal')});
  child.stdout.emit('data', Buffer.from('raw output')); child.emit('close', 1, null);
  const result = await resultPromise;
  assert.equal(result.status, 1); assert.equal(result.stdout.toString(), 'raw output'); assert.equal(result.hard_failure, null);
});
test('metadata cannot overwrite prior outcomes or enter the original checkout', t => {
  const directory = temp(t), checkout = path.join(directory, 'checkout'); fs.mkdirSync(checkout);
  assert.throws(() => ensureOutput(path.join(checkout, 'output'), checkout));
  const output = path.join(directory, 'output'); ensureOutput(output, checkout);
  writeJSON(output, 'receipt.json', {failed: true});
  assert.throws(() => writeJSON(output, 'receipt.json', {failed: false}));
  assert.throws(() => writeJSON(output, 'large.json', {data: 'x'.repeat(LIMITS.metadataBytes)}));
});
test('failed one-time configuration admission never launches a heavy sequence', async t => {
  const directory = temp(t), frontend = path.join(directory, 'checkout/frontend'), output = path.join(directory, 'output');
  fs.mkdirSync(frontend, {recursive: true}); let launches = 0;
  const env = {...environment, CPU_ATTRIBUTION_DEADLINE_MS: String(Date.now() + 720000)};
  const receipt = await run(output, frontend, {environment: env, actual, prove: () => ({unchanged: true}),
    argsFor: () => ['fake-config'], launch: async () => { launches++; return {status: 1, stdout: Buffer.from('failed admission'), stderr: Buffer.alloc(0)}; },
    checkProfiles: () => ({valid: false, errors: ['no profile'], files: []})});
  assert.equal(launches, 1); assert.equal(receipt.heavy_children, 0); assert.equal(receipt.capture_valid, false);
  assert.match(receipt.stop_reason, /configuration admission failed/);
  assert.ok(fs.existsSync(path.join(output, 'config-stdout.log')));
  assert.ok(fs.existsSync(path.join(output, 'receipt.json')));
  await assert.rejects(() => run(output, frontend, {environment: env, actual}), /EEXIST/);
});
test('a final file-limit failure is false in every persisted final receipt without another run', async t => {
  const directory = temp(t), frontend = path.join(directory, 'checkout/frontend'), output = path.join(directory, 'output');
  fs.mkdirSync(frontend, {recursive: true}); let launches = 0, scans = 0;
  const env = {...environment, CPU_ATTRIBUTION_DEADLINE_MS: String(Date.now() + 720000)};
  const cases = CASES.map(fullName => ({fullName, status: 'passed'}));
  const jest = {wasInterrupted: false, numTotalTestSuites: 1, numTotalTests: 3, numPendingTests: 0, numPendingTestSuites: 0,
    numRuntimeErrorTestSuites: 0, numPassedTests: 3, numFailedTests: 0, success: true, numPassedTestSuites: 1, numFailedTestSuites: 0,
    testResults: [{name: '/src/preview/frameworkFiveYear.test.js', assertionResults: cases}]};
  const observed = {...actual, pid: 102, process_group_id: 101, completed: true, diagnostic_only: true, qualification: false,
    source_sha: sha, application_baseline: BASELINE, lifecycle_years: '5', synthetic_exports: false, profiler_enabled: true,
    profiler_interval_us: 10000, execArgv: ['--cpu-prof', '--cpu-prof-dir=' + output, '--cpu-prof-interval=10000'], errors: [],
    cases: cases.map(row => ({name: row.fullName, status: row.status, duration_ms: 100})),
    cpu_usage_us: {user: 3, system: 1}, memory_usage: {rss: 100}, resource_usage: {maxRSS: 100}};
  const receipt = await run(output, frontend, {environment: env, actual, prove: () => ({unchanged: true}), argsFor: () => ['fake'],
    checkConfiguration: () => ({valid: true}), launch: async () => {
      launches++;
      if (launches === 2) {
        fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify(observed));
        fs.writeFileSync(path.join(output, 'jest.json'), JSON.stringify(jest));
      }
      return {pid: 101, status: 0, stdout: Buffer.from('{}'), stderr: Buffer.alloc(0)};
    }, checkProfiles: () => ({valid: ++scans === 1, errors: scans === 1 ? [] : ['combined file limit'], files: []})});
  assert.equal(launches, 2); assert.equal(scans, 2); assert.equal(receipt.capture_valid, false);
  const read = name => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'));
  assert.equal(read('receipt.json').capture_valid, false);
  assert.equal(read('final.json').capture_valid, false);
  assert.equal(read('file-validation.json').valid, false);
  assert.equal(receipt.outcome.original_cases_passed, true);
});
