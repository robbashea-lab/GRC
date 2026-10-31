const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {BASELINE, LIFECYCLE_BLOB, ALLOWED, PROTECTED, PINNED, FRAMEWORKS, CASES, GUARDS, LIMITS,
  verifyPreflight, childBudget, diagnosticDeadline, baseEnvironment, applicationProof, diagnosticArguments, verifySequence, verifyObserver, runChild, run} = require('./run.cjs');
const SHA = 'a'.repeat(40), ENV = {GITHUB_SHA: SHA, GITHUB_RUN_ATTEMPT: '1'};
const RUNTIME = {node: 'v22.23.4', execPath: process.execPath, platform: 'linux', arch: 'x64', timezone: 'UTC'};
const timedEnvironment = () => ({...ENV, ISO_DIAGNOSTIC_DEADLINE_MS: String(Date.now() + LIMITS.driverMs - 1000)});
const clone = value => JSON.parse(JSON.stringify(value));
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value));

function evidence({isoTimeout = false, priorFailed = false} = {}) {
  const statuses = [priorFailed ? 'failed' : 'passed', 'passed', isoTimeout ? 'failed' : 'passed'], passed = statuses.filter(value => value === 'passed').length;
  const cases = CASES.map((fullName, index) => ({fullName, status: statuses[index], failureMessages: index === 2 && isoTimeout ? ['Exceeded timeout of 180000 ms for a test.'] : []}));
  const runtime = {...RUNTIME, completed: true, pid: 424242, process_group_id: 424241, v8: 'test-v8', source_sha: SHA, application_baseline: BASELINE, lifecycle_years: '5',
    synthetic_exports: false, phase_logging: true, elapsed_ms: 3, cpu_usage_us: {user: 2, system: 1}, resource_usage: {maxRSS: 1}, memory_usage: {rss: 1},
    cases: cases.map(row => ({name: row.fullName, status: row.status, duration_ms: 1}))};
  const result = {success: passed === 3, wasInterrupted: false, numTotalTestSuites: 1, numTotalTests: 3, numPendingTests: 0,
    numPendingTestSuites: 0, numRuntimeErrorTestSuites: 0, numPassedTests: passed, numFailedTests: 3 - passed,
    numPassedTestSuites: Number(passed === 3), numFailedTestSuites: Number(passed !== 3),
    testResults: [{name: path.resolve('/synthetic/frontend/src/preview/frameworkFiveYear.test.js'), assertionResults: cases}]};
  const provenance = {application_baseline_sha: BASELINE, observed_source_sha: SHA}, guards = Object.fromEntries(GUARDS.map(key => [key, true]));
  const rawCases = FRAMEWORKS.map((framework, index) => ({...provenance, ordinal: index + 1, framework, span_count: 1, span_cap_reached: false,
    guards_preserved: true, native_guards_before: guards, native_guards_after: guards, errors: [], pending: [], spans: [{id: 1}],
    requests: 1, observation_elapsed_ms: 1, cpu_usage_us: {user: 1, system: 0}, memory: {rss: 1}}));
  const calibration = {iterations: 1000, active_observer_path: true, span_count: 1000, total_elapsed_ms: 1, min_ms: 0, p50_ms: 0, p95_ms: 0, max_ms: 1};
  const summary = {version: 1, ...provenance, complete: true, diagnostic_valid: true, span_cap_reached: false, errors: [], calibration,
    artifact_writes: {count: 10, failed: 0, wall_ms: 1, includes_current_write: false},
    cases: rawCases.map((row, index) => ({...row, artifact: 'iso-phase-case-' + String(index + 1).padStart(2, '0') + '-' + row.framework + '.json'}))};
  const host = {...provenance, node: runtime.node, exec_path: runtime.execPath, actual_jest_pid: runtime.pid, platform: 'linux', arch: 'x64', timezone: 'UTC',
    versions: {node: runtime.node.slice(1), v8: runtime.v8}, profiler_enabled: false, max_spans_per_case: 50000,
    environment: {CI: true, lifecycle_years: '5', export_enabled: false}};
  return {runtime, result, rawCases, calibration, summary, host,
    execution: {pid: 424241, status: passed === 3 ? 0 : 1, signal: null, error: null, hard_failure: null, stdout: Buffer.from('synthetic stdout\n'), stderr: Buffer.from('synthetic stderr\n')}};
}
const sequence = value => verifySequence(value.runtime, value.result, value.execution, ENV, RUNTIME);
const observer = value => verifyObserver(value.summary, value.rawCases, value.host, value.calibration, value.runtime, ENV);

test('preflight enforces actual exact hosted runtime and first exact-source attempt, never a local timing comparison', () => {
  assert.doesNotThrow(() => verifyPreflight(RUNTIME, ENV));
  for (const delta of [{node: 'v22.23.3'}, {platform: 'win32'}, {arch: 'arm64'}, {timezone: 'America/Los_Angeles'}, {execPath: 'node'}])
    assert.throws(() => verifyPreflight({...RUNTIME, ...delta}, ENV));
  for (const delta of [{GITHUB_RUN_ATTEMPT: '2'}, {GITHUB_RUN_ATTEMPT: undefined}, {GITHUB_SHA: '9824384'}])
    assert.throws(() => verifyPreflight(RUNTIME, {...ENV, ...delta}));
  assert.equal(childBudget(1000000, 0), 600000);assert.equal(childBudget(5000, 1000), 2000);
  assert.throws(() => childBudget(2000, 0), /budget exhausted/);
});

test('the first-step absolute deadline retains setup time and cannot be replaced by a fresh driver budget', () => {
  assert.equal(LIMITS.driverMs, 12 * 60000);
  assert.equal(diagnosticDeadline({ISO_DIAGNOSTIC_DEADLINE_MS: '700000'}, 1000), 700000);
  for (const value of [undefined, '', 'not-a-date', '1.5', 'Infinity', '-1', String(Number.MAX_SAFE_INTEGER + 1), '1000', '721001'])
    assert.throws(() => diagnosticDeadline({ISO_DIAGNOSTIC_DEADLINE_MS: value}, 1000), /deadline/);
  assert.equal(childBudget(diagnosticDeadline({ISO_DIAGNOSTIC_DEADLINE_MS: '602999'}, 1000), 1000), 599999);
});

test('arguments retain the one original full suite, setup order and untouched 180000 body deadline', () => {
  const frontend = path.resolve('/synthetic/frontend'), output = path.resolve('/evidence/run');
  assert.deepEqual(diagnosticArguments(frontend, output, '/craco.js'), ['/craco.js', 'test', '--watchAll=false', '--runInBand', '--runTestsByPath',
    'src/preview/frameworkFiveYear.test.js', '--json', '--outputFile=' + path.join(output, 'jest.json'), '--reporters=default',
    '--reporters=' + path.join(frontend, 'scripts/iso-pr110-diagnostic/runtime-reporter.cjs'), '--setupFilesAfterEnv',
    path.join(frontend, 'src/setupTests.js'), path.join(frontend, 'scripts/iso-pr110-diagnostic/setup.cjs')]);
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/preview/frameworkFiveYear.test.js'), 'utf8');
  assert.match(source, /test\.each\(timeline\.frameworks\)/);assert.match(source, /\},\s*180000\);\s*$/);
  const timeline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../shared/contracts/program-lifecycle.json'), 'utf8'));
  assert.deepEqual(timeline.frameworks, FRAMEWORKS);
});

test('child environment pins literal-node descendants, retains UTC as observed and disables export/options without mutating the caller', () => {
  const original = {...ENV, PATH: '/old/bin', NODE_OPTIONS: '--require unwanted', FRAMEWORK_LIFECYCLE_EXPORT_DIR: '/old',
    FRAMEWORK_LIFECYCLE_YEARS: '3', ISO_PHASE_LOG_DIR: '/old', REPORTING_PREP_LOG_DIR: '/old', REPORTING_PREP_INSTRUMENTATION_PATH: '/old', KEEP: 'retained'};
  const actual = baseEnvironment(original, '/evidence/run', '/pinned/bin/node', 'linux');
  assert.equal(actual.PATH, '/pinned/bin:/old/bin');assert.equal(actual.CI, 'true');assert.equal(actual.FRAMEWORK_LIFECYCLE_YEARS, '5');
  assert.equal(actual.ISO_PHASE_APP_SHA, BASELINE);assert.equal(actual.ISO_PHASE_LOG_DIR, '/evidence/run');
  assert.equal(actual.FRONTEND_RUNTIME_RECEIPT, path.join('/evidence/run', 'runtime.json'));assert.equal(actual.KEEP, 'retained');
  for (const key of ['NODE_OPTIONS', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR', 'REPORTING_PREP_LOG_DIR', 'REPORTING_PREP_INSTRUMENTATION_PATH', 'TZ']) assert.equal(Object.hasOwn(actual, key), false);
  assert.equal(original.FRAMEWORK_LIFECYCLE_YEARS, '3');assert.equal(original.NODE_OPTIONS, '--require unwanted');
  assert.equal(baseEnvironment({TZ: 'UTC'}, '/out', '/bin/node', 'linux').TZ, 'UTC');
  const windows = baseEnvironment({PATH: 'first', Path: 'second'}, 'C:\\out', 'C:\\pinned\\node.exe', 'win32');
  assert.equal(windows.PATH, 'C:\\pinned;first');assert.equal(Object.hasOwn(windows, 'Path'), false);
});

function proofFixture(change = () => {}) {
  const object = file => PINNED[file] || (file.endsWith('frameworkFiveYear.test.js') ? LIFECYCLE_BLOB : 'b'.repeat(40));
  return (_command, args, options) => {
    assert.equal(args[0], '-C');assert.equal(options.env, ENV);assert(options.timeout > 0);
    const request = args.slice(2);let stdout = '';
    if (request[0] === 'rev-parse') stdout = request[1] === 'HEAD' ? SHA : object(request[1].slice(request[1].indexOf(':') + 1));
    if (request[0] === 'hash-object') stdout = object(request[1]);
    if (request[0] === 'diff') stdout = [...ALLOWED].join('\0') + '\0';
    const result = {status: 0, stdout};change(request, result);return result;
  };
}
function proof(execute) { return applicationProof('/synthetic', ENV, Date.now() + 60000, {execute, fingerprint: () => 'c'.repeat(64)}); }

test('source proof allows only the eight explicit diagnostic files and pins current application/workload objects', () => {
  const actual = proof(proofFixture());assert.equal(actual.application_baseline_sha, BASELINE);assert.equal(actual.observed_source_sha, SHA);
  assert.equal(actual.clean_checkout, true);assert.deepEqual(Object.keys(actual.protected_objects), PROTECTED);assert.equal(actual.input_blobs['frontend/src/preview/frameworkFiveYear.test.js'], LIFECYCLE_BLOB);
  assert.equal(ALLOWED.size, 8);assert.equal(Object.keys(actual.harness_sha256).length, 8);
  for (const mutate of [
    (args, row) => {if (args[0] === 'status') row.stdout = ' M frontend/src/preview/store.js';},
    (args, row) => {if (args[0] === 'status') row.stdout = '?? unexpected.txt';},
    (args, row) => {if (args[0] === 'diff') row.stdout = 'frontend/src/preview/portfolioReporting.js\0';},
    (args, row) => {if (args[0] === 'diff') row.stdout = 'frontend/scripts/iso-pr110-diagnostic/extra.cjs\0';},
    (args, row) => {if (args[0] === 'hash-object') row.stdout = 'd'.repeat(40);},
    (args, row) => {if (args[0] === 'rev-parse' && args[1] === 'HEAD') row.stdout = BASELINE;},
    (args, row) => {if (args[0] === 'rev-parse' && args[1] === 'HEAD:frontend/src') row.stdout = 'e'.repeat(40);},
    (args, row) => {if (args[0] === 'merge-base') row.status = 1;},
    (_args, row) => {row.error = new Error('Git failed');},
  ]) assert.throws(() => proof(proofFixture(mutate)));
});

test('capture validity and failed original ISO qualification are separate, with no timing-based waiver', () => {
  assert.equal(sequence(evidence()).original_tests_passed, true);
  const failure = sequence(evidence({isoTimeout: true}));assert.equal(failure.original_tests_passed, false);assert.equal(failure.censored_iso, true);assert.equal(failure.qualification, false);
  assert.equal(sequence(evidence({priorFailed: true, isoTimeout: true})).predecessors_passed, false);
  const functional = evidence({isoTimeout: true});functional.result.testResults[0].assertionResults[2].failureMessages = ['Record did not persist'];
  assert.equal(sequence(functional).iso_failure_outside_deadline, true);
  for (const mutate of [
    value => value.runtime.node = 'v22.23.3', value => value.runtime.pid = undefined, value => value.runtime.platform = 'win32',
    value => value.runtime.process_group_id = 999999, value => value.runtime.process_group_id = undefined, value => value.execution.pid = 1,
    value => value.runtime.source_sha = BASELINE, value => value.runtime.synthetic_exports = true, value => value.runtime.phase_logging = false,
    value => value.runtime.lifecycle_years = '3', value => value.runtime.cases.reverse(), value => value.runtime.cases[0].duration_ms = null,
    value => value.result.testResults[0].name = '/synthetic/other.test.js', value => value.result.testResults[0].assertionResults.reverse(),
    value => value.result.numPendingTests = 1, value => value.result.numFailedTests = 1, value => value.result.numPassedTestSuites = 0,
    value => value.result.wasInterrupted = true, value => value.execution.hard_failure = 'watchdog', value => value.execution.status = 1,
    value => value.runtime.cpu_usage_us = {}, value => value.runtime.resource_usage = {},
  ]) {const value = evidence();mutate(value);assert.throws(() => sequence(value));}
});

test('CRACO literal-node descendants are accepted only inside the owned launcher process group', () => {
  const descendant = evidence();assert.notEqual(descendant.runtime.pid, descendant.execution.pid);
  assert.equal(descendant.runtime.process_group_id, descendant.execution.pid);assert.equal(sequence(descendant).original_tests_passed, true);
  const launcher = evidence();launcher.runtime.pid = launcher.execution.pid;assert.equal(sequence(launcher).original_tests_passed, true);
  descendant.runtime.process_group_id = descendant.runtime.pid;assert.throws(() => sequence(descendant), /owned process group/);
});

test('observer acceptance requires actual guarded raw cases, host identity, calibration and explicit overhead boundary', () => {
  assert.equal(observer(evidence()).predecessors_settled, true);
  const pending = evidence();pending.rawCases[0].pending = [{id: 1}];pending.summary.cases[0].pending = [{id: 1}];
  assert.equal(observer(pending).predecessors_settled, false);
  for (const mutate of [
    value => value.summary.complete = false, value => value.summary.errors.push('flush failed'), value => value.summary.span_cap_reached = true,
    value => value.rawCases[0].native_guards_before.canFork = false, value => value.rawCases[1].spans = [],
    value => value.rawCases[2].framework = 'cis-ig1', value => value.host.actual_jest_pid++, value => value.host.versions.v8 = 'other',
    value => value.host.environment.export_enabled = true, value => value.calibration.active_observer_path = false,
    value => value.calibration.span_count = 0, value => value.summary.artifact_writes.includes_current_write = true,
    value => value.summary.artifact_writes.failed = 1, value => value.summary.cases[0].artifact = '../../outside.json',
  ]) {const value = evidence();mutate(value);assert.throws(() => observer(value));}
});

function processFixture(pid) {
  if (arguments.length === 0) pid = 424242;
  const child = new EventEmitter();child.pid = pid;child.stdout = new EventEmitter();child.stderr = new EventEmitter();
  const timers = new Map(), calls = [], signals = [];let id = 0;
  const options = {platform: 'linux', now: () => 0, spawnProcess: (...args) => {calls.push(args);return child;},
    signal: (...args) => signals.push(args), schedule: (callback, delay) => {timers.set(++id, {callback, delay});return id;}, cancel: key => timers.delete(key)};
  const fire = delay => {const found = [...timers].find(([, value]) => value.delay === delay);assert(found, 'Expected bounded timer');timers.delete(found[0]);found[1].callback();};
  return {child, timers, calls, signals, options, fire};
}

test('a normally closing mocked child launches exactly once with owned detached group and exact byte prefixes', async () => {
  const test = processFixture(), result = runChild(['/craco', 'original-suite'], '/frontend', ENV, 1000000, test.options);
  test.child.stdout.emit('data', Buffer.from('native stdout'));test.child.stderr.emit('data', Buffer.from('native stderr'));test.child.emit('close', 0, null);
  const actual = await result;assert.equal(test.calls.length, 1);assert.equal(test.calls[0][0], process.execPath);
  assert.deepEqual(test.calls[0][2], {cwd: '/frontend', env: ENV, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  assert.equal(actual.stdout.toString(), 'native stdout');assert.equal(actual.stderr.toString(), 'native stderr');assert.equal(actual.status, 0);
  assert.equal(actual.hard_failure, null);assert.deepEqual(test.signals, []);assert.equal(test.timers.size, 0);
});

test('output cap preserves the exact bounded prefix and cleans only the owned group even if its parent closes early', async () => {
  const test = processFixture(), result = runChild([], '/frontend', ENV, 1000000, test.options);
  test.child.stdout.emit('data', Buffer.alloc(LIMITS.outputBytes + 3, 97));test.child.emit('close', 1, null);
  assert.deepEqual(test.signals, [[-424242, 'SIGTERM']]);test.fire(2000);
  const actual = await result;assert.equal(actual.stdout.length, LIMITS.outputBytes);assert.equal(actual.stdout.at(-1), 97);
  assert.equal(actual.output_bytes.stdout, LIMITS.outputBytes + 3);assert.equal(actual.hard_failure, 'Child output cap exceeded');assert.equal(actual.kill_sent, true);
  assert.deepEqual(test.signals, [[-424242, 'SIGTERM'], [-424242, 'SIGKILL']]);assert.equal(test.calls.length, 1);
});

test('watchdog has bounded TERM/KILL cleanup without waiting forever or turning incomplete results into success', async () => {
  const test = processFixture(), result = runChild([], '/frontend', ENV, 1000000, test.options);
  test.child.stderr.emit('data', Buffer.from('partial trace'));test.fire(600000);test.fire(2000);
  const actual = await result;assert.equal(actual.status, null);assert.equal(actual.hard_failure, 'Child wall watchdog exceeded');assert.equal(actual.stderr.toString(), 'partial trace');
  assert.deepEqual(test.signals, [[-424242, 'SIGTERM'], [-424242, 'SIGKILL']]);assert.equal(test.timers.size, 0);
  assert.throws(() => runChild([], '', ENV, 1000000, {...test.options, watchdogMs: 600001}), /only be reduced/);
  assert.throws(() => runChild([], '', ENV, 1000000, {...test.options, graceMs: 2001}), /only be reduced/);
  assert.throws(() => runChild([], '', ENV, 1000000, {...test.options, platform: 'win32'}), /requires Linux/);
});

test('spawn/ownership failures never signal an unowned PID or start another process', async () => {
  for (const pid of [undefined, 0, 1, process.pid]) {
    const test = processFixture(pid), actual = await runChild([], '/frontend', ENV, 1000000, test.options);
    assert.equal(actual.error, 'Invalid owned child PID');assert.deepEqual(test.signals, []);assert.equal(test.calls.length, 1);
  }
  const test = processFixture(), actual = await runChild([], '/frontend', ENV, 1000000, {...test.options, spawnProcess: () => {throw Object.assign(new Error('not found'), {code: 'ENOENT'});}});
  assert.equal(actual.error, 'ENOENT');assert.deepEqual(test.signals, []);
});

function temporary() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-driver-unit-'));
  return {directory, frontend: path.join(directory, 'checkout/frontend'), output: path.join(directory, 'evidence'), cleanup() {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('iso-driver-unit-'));fs.rmSync(directory, {recursive: true, force: true});
  }};
}
function saveEvidence(directory, value) {
  json(path.join(directory, 'runtime.json'), value.runtime);json(path.join(directory, 'jest.json'), value.result);
  json(path.join(directory, 'iso-phase-summary.json'), value.summary);json(path.join(directory, 'iso-phase-host.json'), value.host);
  json(path.join(directory, 'observer-calibration.json'), value.calibration);
  for (let index = 0; index < 3; index++) json(path.join(directory, value.summary.cases[index].artifact), value.rawCases[index]);
}
function finalReceipt(output) {const latest = JSON.parse(fs.readFileSync(path.join(output, 'latest.json')));return {latest, receipt: JSON.parse(fs.readFileSync(path.join(latest.directory, 'diagnostic-receipt.json')))};}

test('one complete diagnostic timeout remains failed qualification while its valid cutoff capture is retained without retry', async () => {
  const fixture = temporary();let launches = 0, proofs = 0;
  try {
    const environment = timedEnvironment();
    const exit = await run(fixture.output, fixture.frontend, {environment, runtime: RUNTIME, prove: (_root, _env, deadline) => {
      proofs++;assert.equal(deadline, Number(environment.ISO_DIAGNOSTIC_DEADLINE_MS));return {source: SHA};
    }, argumentsFor: () => ['one-original-suite'],
      launch: async (_args, _cwd, env) => {launches++;const value = evidence({isoTimeout: true});saveEvidence(env.ISO_PHASE_LOG_DIR, value);return value.execution;}});
    const {latest, receipt} = finalReceipt(fixture.output);assert.equal(exit, 1);assert.equal(launches, 1);assert.equal(proofs, 2);
    assert.equal(receipt.capture_valid, true);assert.equal(receipt.iso_attribution_valid, true);assert.equal(receipt.outcome.censored_iso, true);
    assert.equal(receipt.passed, false);assert.equal(receipt.qualification, false);assert.equal(latest.qualification, false);
    assert.equal(receipt.deadline_ms, Number(environment.ISO_DIAGNOSTIC_DEADLINE_MS));
    assert(receipt.remaining_when_driver_started_ms <= LIMITS.driverMs);assert(receipt.remaining_before_launch_ms >= LIMITS.childMs + LIMITS.graceMs);
    assert.equal(fs.readFileSync(path.join(latest.directory, 'stdout.log'), 'utf8'), 'synthetic stdout\n');
    assert.equal(JSON.parse(fs.readFileSync(path.join(latest.directory, 'artifact-index.json'))).files['diagnostic-receipt.json'].sha256.length, 64);
    await assert.rejects(run(fixture.output, fixture.frontend, {environment, runtime: RUNTIME}), /EEXIST/);assert.equal(launches, 1);
  } finally {fixture.cleanup();}
});

test('preflight or missing-result failures preserve their receipts and never retry or qualify the source', async () => {
  for (const condition of ['source', 'partial', 'predecessor', 'source-after']) {
    const fixture = temporary();let launches = 0, proofs = 0;
    try {
      const exit = await run(fixture.output, fixture.frontend, {environment: timedEnvironment(), runtime: RUNTIME, prove: () => {
        proofs++;if (condition === 'source' || condition === 'source-after' && proofs > 1) throw new Error('Source mismatch');return {source: SHA};
      }, argumentsFor: () => ['one-original-suite'], launch: async (_args, _cwd, env) => {
        launches++;const value = evidence({priorFailed: condition === 'predecessor', isoTimeout: true});
        if (condition !== 'partial') saveEvidence(env.ISO_PHASE_LOG_DIR, value);else json(path.join(env.ISO_PHASE_LOG_DIR, 'partial-live.json'), {pending: true});
        return value.execution;
      }});
      const {latest, receipt} = finalReceipt(fixture.output);assert.equal(exit, 1);assert.equal(launches, condition === 'source' ? 0 : 1);
      assert.equal(receipt.qualification, false);assert.equal(receipt.passed, false);assert.equal(receipt.iso_attribution_valid, false);
      if (condition === 'predecessor') assert.equal(receipt.capture_valid, true);else assert.equal(receipt.capture_valid, false);
      if (condition === 'partial') assert(fs.existsSync(path.join(latest.directory, 'partial-live.json')));
    } finally {fixture.cleanup();}
  }
});

test('missing, expired or insufficient first-step budget stops before the one workload launch', async () => {
  for (const deadline of [undefined, String(Date.now() - 1), String(Date.now() + LIMITS.childMs)]) {
    const fixture = temporary();let launches = 0;
    try {
      const exit = await run(fixture.output, fixture.frontend, {environment: {...ENV, ISO_DIAGNOSTIC_DEADLINE_MS: deadline}, runtime: RUNTIME,
        prove: () => ({source: SHA}), argumentsFor: () => ['one-original-suite'], launch: async () => {launches++;throw new Error('Must not launch');}});
      const {receipt} = finalReceipt(fixture.output);assert.equal(exit, 1);assert.equal(launches, 0);assert.equal(receipt.workload_started, false);
      assert.equal(receipt.capture_valid, false);assert.match(receipt.stop_reason, /deadline|remaining budget/);
    } finally {fixture.cleanup();}
  }
});
