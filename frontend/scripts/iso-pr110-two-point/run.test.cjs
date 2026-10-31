const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {BASELINE, LIFECYCLE_BLOB, ALLOWED, PROTECTED, PINNED, FRAMEWORKS, CASES, GUARDS, LIMITS,
  verifyPreflight, childBudget, diagnosticDeadline, baseEnvironment, applicationProof, diagnosticArguments, verifySequence, verifyObserver, artifactLimits, runChild, run} = require('./run.cjs');
const SHA = 'a'.repeat(40), ENV = {GITHUB_SHA: SHA, GITHUB_RUN_ATTEMPT: '1'};
const RUNTIME = {node: 'v22.23.4', execPath: process.execPath, platform: 'linux', arch: 'x64', timezone: 'UTC'};
const timedEnvironment = () => ({...ENV, ISO_TWO_POINT_DEADLINE_MS: String(Date.now() + LIMITS.driverMs - 1000)});
const clone = value => JSON.parse(JSON.stringify(value));
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value));

function evidence({isoTimeout = false, priorFailed = false} = {}) {
  const statuses = [priorFailed ? 'failed' : 'passed', 'passed', isoTimeout ? 'failed' : 'passed'], passed = statuses.filter(value => value === 'passed').length;
  const cases = CASES.map((fullName, index) => ({fullName, status: statuses[index], failureMessages: index === 2 && isoTimeout ? ['Exceeded timeout of 180000 ms for a test.'] : []}));
  const runtime = {...RUNTIME, completed: true, diagnostic_only: true, qualification: false, pid: 424242, process_group_id: 424241, v8: 'test-v8', source_sha: SHA, application_baseline: BASELINE, lifecycle_years: '5',
    synthetic_exports: false, two_point_logging: true, elapsed_ms: 3, cpu_usage_us: {user: 2, system: 1}, resource_usage: {maxRSS: 1}, memory_usage: {rss: 1},
    cases: cases.map(row => ({name: row.fullName, status: row.status, duration_ms: 1}))};
  const result = {success: passed === 3, wasInterrupted: false, numTotalTestSuites: 1, numTotalTests: 3, numPendingTests: 0,
    numPendingTestSuites: 0, numRuntimeErrorTestSuites: 0, numPassedTests: passed, numFailedTests: 3 - passed,
    numPassedTestSuites: Number(passed === 3), numFailedTestSuites: Number(passed !== 3),
    testResults: [{name: path.resolve('/synthetic/frontend/src/preview/frameworkFiveYear.test.js'), assertionResults: cases}]};
  const provenance = {application_baseline_sha: BASELINE, observed_source_sha: SHA}, guards = Object.fromEntries(GUARDS.map(key => [key, true]));
  const rawCases = FRAMEWORKS.map((framework, index) => ({...provenance, ordinal: index + 1, framework,
    stopped: false, command_cap_reached: false, write_cap_reached: false, errors: [], guards_preserved: true,
    native_guards_before: guards, native_guards_after: guards, pending: {commands: [], writes: []}, pending_counts: {commands: 0, writes: 0},
    totals: {commands_started: 1, commands_settled: 1, writes_started: 1, writes_settled: 1},
    commands: [{id: 1, method: 'post', route: '/framework_assessments/:id', scenario_date: '2026-10-31T12:00:00.000Z', start_ms: 0, end_ms: 1, wall_ms: 1, outcome: 'fulfilled'}],
    writes: [{id: 1, command_id: 1, input_utf16_units: 20, output_utf16_units: 10, start_ms: 0.25, end_ms: 0.75, wall_ms: 0.5, outcome: 'fulfilled'}],
    observation_elapsed_ms: 1, cpu_usage_us: {user: 1, system: 0}, memory: {rss: 1}}));
  const calibration = {sync: {iterations: 1000, settled: 1000, elapsed_ms: 1}, promise: {iterations: 1000, settled: 1000, elapsed_ms: 2},
    io: {writes: 8, bytes: 32768, elapsed_ms: 3}, thresholds_ms: {sync: 50, promise: 100, io: 50}, valid: true};
  const summary = {version: 1, ...provenance, complete: true, diagnostic_only: true, qualification: false, diagnostic_valid: true, errors: [], calibration,
    artifact_writes: {count: 10, failed: 0, wall_ms: 1, includes_current_write: false},
    cases: rawCases.map((row, index) => ({...clone(row), command_count: row.commands.length, writer_count: row.writes.length,
      artifact: 'two-point-case-' + String(index + 1).padStart(2, '0') + '-' + row.framework + '.json'}))};
  const host = {...provenance, node: runtime.node, exec_path: runtime.execPath, actual_jest_pid: runtime.pid, platform: 'linux', arch: 'x64', timezone: 'UTC',
    versions: {node: runtime.node.slice(1), v8: runtime.v8}, profiler_enabled: false, gc_forced: false, max_commands: 4096, max_writes: 4096,
    two_points: ['commandTestAdapter.js:previewAdapter', 'demoStorageCodec.js:writeDemoStoreAsync'],
    environment: {CI: true, lifecycle_years: '5', export_enabled: false, two_point_logging: true}};
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
  assert.equal(diagnosticDeadline({ISO_TWO_POINT_DEADLINE_MS: '700000'}, 1000), 700000);
  for (const value of [undefined, '', 'not-a-date', '1.5', 'Infinity', '-1', String(Number.MAX_SAFE_INTEGER + 1), '1000', '721001'])
    assert.throws(() => diagnosticDeadline({ISO_TWO_POINT_DEADLINE_MS: value}, 1000), /deadline/);
  assert.equal(childBudget(diagnosticDeadline({ISO_TWO_POINT_DEADLINE_MS: '602999'}, 1000), 1000), 599999);
});

test('arguments retain the one original full suite, setup order and untouched 180000 body deadline', () => {
  const frontend = path.resolve('/synthetic/frontend'), output = path.resolve('/evidence/run');
  assert.deepEqual(diagnosticArguments(frontend, output, '/craco.js'), ['/craco.js', 'test', '--watchAll=false', '--runInBand', '--runTestsByPath',
    'src/preview/frameworkFiveYear.test.js', '--json', '--outputFile=' + path.join(output, 'jest.json'), '--reporters=default',
    '--reporters=' + path.join(frontend, 'scripts/iso-pr110-two-point/runtime-reporter.cjs'), '--setupFilesAfterEnv',
    path.join(frontend, 'src/setupTests.js'), path.join(frontend, 'scripts/iso-pr110-two-point/setup.cjs')]);
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/preview/frameworkFiveYear.test.js'), 'utf8');
  assert.match(source, /test\.each\(timeline\.frameworks\)/);assert.match(source, /\},\s*180000\);\s*$/);
  const timeline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../shared/contracts/program-lifecycle.json'), 'utf8'));
  assert.deepEqual(timeline.frameworks, FRAMEWORKS);
});

test('child environment pins literal-node descendants and rejects unwanted configuration without silently masking it', () => {
  const original = {...ENV, PATH: '/old/bin', FRAMEWORK_LIFECYCLE_YEARS: '5', KEEP: 'retained'};
  const actual = baseEnvironment(original, '/evidence/run', '/pinned/bin/node', 'linux');
  assert.equal(actual.PATH, '/pinned/bin:/old/bin');assert.equal(actual.CI, 'true');assert.equal(actual.FRAMEWORK_LIFECYCLE_YEARS, '5');
  assert.equal(actual.ISO_TWO_POINT_APP_SHA, BASELINE);assert.equal(actual.ISO_TWO_POINT_OUTPUT, '/evidence/run');
  assert.equal(actual.ISO_TWO_POINT_EXPECTED_EXEC_PATH, '/pinned/bin/node');
  assert.equal(actual.FRONTEND_RUNTIME_RECEIPT, path.join('/evidence/run', 'runtime.json'));assert.equal(actual.KEEP, 'retained');
  for (const key of ['NODE_OPTIONS', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR', 'ISO_PHASE_LOG_DIR', 'ISO_PHASE_APP_SHA', 'ISO_DIAGNOSTIC_DEADLINE_MS',
    'REPORTING_PREP_LOG_DIR', 'REPORTING_PREP_INSTRUMENTATION_PATH', 'TZ']) assert.equal(Object.hasOwn(actual, key), false);
  assert.equal(original.FRAMEWORK_LIFECYCLE_YEARS, '5');assert.equal(Object.hasOwn(original, 'ISO_TWO_POINT_OUTPUT'), false);
  assert.equal(Object.hasOwn(original, 'ISO_TWO_POINT_EXPECTED_EXEC_PATH'), false);
  assert.equal(baseEnvironment({...original, ISO_TWO_POINT_EXPECTED_EXEC_PATH: '/pinned/bin/node'}, '/out', '/pinned/bin/node', 'linux').ISO_TWO_POINT_EXPECTED_EXEC_PATH, '/pinned/bin/node');
  assert.equal(baseEnvironment({...original, ISO_TWO_POINT_EXPECTED_EXEC_PATH: ''}, '/out', '/pinned/bin/node', 'linux').ISO_TWO_POINT_EXPECTED_EXEC_PATH, '/pinned/bin/node');
  assert.throws(() => baseEnvironment({...original, ISO_TWO_POINT_EXPECTED_EXEC_PATH: '/different/bin/node'}, '/out', '/pinned/bin/node', 'linux'), /inherited expected executable path/);
  for (const delta of [{NODE_OPTIONS: '--require unwanted'}, {FRAMEWORK_LIFECYCLE_EXPORT_DIR: '/old'}, {FRAMEWORK_LIFECYCLE_YEARS: '3'},
    {ISO_PHASE_LOG_DIR: '/old'}, {ISO_PHASE_APP_SHA: BASELINE}, {ISO_DIAGNOSTIC_DEADLINE_MS: '1'}, {REPORTING_PREP_LOG_DIR: '/old'},
    {REPORTING_PREP_INSTRUMENTATION_PATH: '/old'}, {ISO_TWO_POINT_APP_SHA: 'b'.repeat(40)}]) assert.throws(() => baseEnvironment({...original, ...delta}, '/out'), /inherited/);
  assert.equal(baseEnvironment({NODE_OPTIONS: '', FRAMEWORK_LIFECYCLE_EXPORT_DIR: ''}, '/out').CI, 'true');
  assert.equal(baseEnvironment({TZ: 'UTC'}, '/out', '/bin/node', 'linux').TZ, 'UTC');
  const windows = baseEnvironment({PATH: 'first', Path: 'second'}, 'C:\\out', 'C:\\pinned\\node.exe', 'win32');
  assert.equal(windows.PATH, 'C:\\pinned;first');assert.equal(Object.hasOwn(windows, 'Path'), false);
  assert.equal(windows.ISO_TWO_POINT_EXPECTED_EXEC_PATH, 'C:\\pinned\\node.exe');
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

test('source proof allows only nine harness files plus the diagnostic workflow and pins all protected application objects', () => {
  const actual = proof(proofFixture());assert.equal(actual.application_baseline_sha, BASELINE);assert.equal(actual.observed_source_sha, SHA);
  assert.equal(actual.clean_checkout, true);assert.deepEqual(Object.keys(actual.protected_objects), PROTECTED);assert.equal(actual.input_blobs['frontend/src/preview/frameworkFiveYear.test.js'], LIFECYCLE_BLOB);
  assert.equal(ALLOWED.size, 10);assert.equal(Object.keys(actual.harness_sha256).length, 10);
  for (const mutate of [
    (args, row) => {if (args[0] === 'status') row.stdout = ' M frontend/src/preview/store.js';},
    (args, row) => {if (args[0] === 'status') row.stdout = '?? unexpected.txt';},
    (args, row) => {if (args[0] === 'diff') row.stdout = 'frontend/src/preview/portfolioReporting.js\0';},
    (args, row) => {if (args[0] === 'diff') row.stdout = 'frontend/scripts/iso-pr110-two-point/extra.cjs\0';},
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
    value => value.runtime.source_sha = BASELINE, value => value.runtime.synthetic_exports = true, value => value.runtime.two_point_logging = false,
    value => value.runtime.phase_logging = true, value => value.execution.status = 2,
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

function makePending(value, index) {
  const record = value.rawCases[index];
  for (const kind of ['commands', 'writes']) {
    for (const operation of record[kind]) {operation.outcome = 'pending';delete operation.end_ms;delete operation.wall_ms;if (kind === 'writes') delete operation.output_utf16_units;}
    record.pending[kind] = clone(record[kind]);record.pending_counts[kind] = record[kind].length;record.totals[kind + '_settled'] = 0;
  }
  value.summary.cases[index].pending = clone(record.pending);value.summary.cases[index].pending_counts = clone(record.pending_counts);
}

test('two-point acceptance reconciles raw outcomes, linkage, guards, bounded counts, host and overhead calibration', () => {
  assert.equal(observer(evidence()).predecessors_settled, true);
  const cutoff = evidence({isoTimeout: true});makePending(cutoff, 2);
  assert.equal(observer(cutoff).predecessors_settled, true);assert.equal(sequence(cutoff).censored_iso, true);
  const pending = evidence();makePending(pending, 0);
  assert.equal(observer(pending).predecessors_settled, false);
  for (const mutate of [
    value => value.summary.complete = false, value => value.summary.errors.push('flush failed'), value => value.summary.qualification = true,
    value => value.summary.diagnostic_only = false, value => value.summary.diagnostic_valid = false,
    value => value.rawCases[0].native_guards_before.canFork = false, value => value.rawCases[1].commands = [],
    value => value.rawCases[2].framework = 'cis-ig1', value => value.host.actual_jest_pid++, value => value.host.versions.v8 = 'other',
    value => value.host.environment.export_enabled = true, value => value.host.environment.two_point_logging = false,
    value => value.host.profiler_enabled = true, value => value.host.gc_forced = true, value => value.host.max_commands = 4097,
    value => value.host.two_points.push('unapproved phase'), value => value.calibration.valid = false,
    value => value.calibration.sync.settled = 999, value => value.calibration.promise.iterations = 999,
    value => value.calibration.io.bytes = 32767, value => value.calibration.io.elapsed_ms = -1, value => value.calibration.sync.elapsed_ms = 51,
    value => value.calibration.thresholds_ms.promise = 101,
    value => value.rawCases[0].stopped = true, value => value.rawCases[0].command_cap_reached = true, value => value.summary.cases[0].write_cap_reached = true,
    value => value.rawCases[0].totals.commands_settled = 0, value => value.rawCases[0].pending_counts.commands = 1,
    value => value.rawCases[0].commands[0].id = 2, value => value.rawCases[0].commands[0].outcome = 'unknown',
    value => value.rawCases[0].commands[0].start_ms = -1, value => value.rawCases[0].commands[0].wall_ms = 0.5,
    value => value.rawCases[0].commands[0].scenario_date = null, value => value.rawCases[0].writes[0].command_id = null,
    value => value.rawCases[0].writes[0].command_id = 2, value => value.rawCases[0].writes[0].output_utf16_units = -1,
    value => delete value.rawCases[0].writes[0].input_utf16_units, value => delete value.rawCases[0].writes[0].output_utf16_units,
    value => value.summary.cases[0].command_count = 0, value => value.summary.artifact_writes.includes_current_write = true,
    value => value.summary.artifact_writes.failed = 1, value => value.summary.cases[0].artifact = '../../outside.json',
  ]) {const value = evidence();mutate(value);assert.throws(() => observer(value));}
});

test('command and writer caps fail capture even if an artifact claims otherwise coherent counts', () => {
  for (const kind of ['commands', 'writes']) {
    const value = evidence(), record = value.rawCases[0], field = kind === 'commands' ? 'command_count' : 'writer_count';
    record[kind] = Array.from({length: 4097}, (_, index) => ({...record[kind][0], id: index + 1}));
    record.totals[kind + '_started'] = 4097;record.totals[kind + '_settled'] = 4097;value.summary.cases[0][field] = 4097;
    assert.throws(() => observer(value), /accounting/);
  }
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
  json(path.join(directory, 'two-point-summary.json'), value.summary);json(path.join(directory, 'two-point-host.json'), value.host);
  json(path.join(directory, 'overhead-calibration.json'), value.calibration);
  for (let index = 0; index < 3; index++) json(path.join(directory, value.summary.cases[index].artifact), value.rawCases[index]);
}
function finalReceipt(output) {const latest = JSON.parse(fs.readFileSync(path.join(output, 'latest.json')));return {latest, receipt: JSON.parse(fs.readFileSync(path.join(latest.directory, 'diagnostic-receipt.json')))};}

test('one complete diagnostic timeout remains failed qualification while its valid cutoff capture is retained without retry', async () => {
  const fixture = temporary();let launches = 0, proofs = 0;
  try {
    const environment = timedEnvironment();
    const exit = await run(fixture.output, fixture.frontend, {environment, runtime: RUNTIME, prove: (_root, _env, deadline) => {
      proofs++;assert.equal(deadline, Number(environment.ISO_TWO_POINT_DEADLINE_MS));return {source: SHA};
    }, argumentsFor: () => ['one-original-suite'],
      launch: async (_args, _cwd, env) => {launches++;const value = evidence({isoTimeout: true});makePending(value, 2);saveEvidence(env.ISO_TWO_POINT_OUTPUT, value);return value.execution;}});
    const {latest, receipt} = finalReceipt(fixture.output);assert.equal(exit, 1);assert.equal(launches, 1);assert.equal(proofs, 2);
    assert.equal(receipt.capture_valid, true);assert.equal(receipt.iso_attribution_valid, true);assert.equal(receipt.outcome.censored_iso, true);
    assert.equal(receipt.passed, false);assert.equal(receipt.qualification, false);assert.equal(latest.qualification, false);
    assert.equal(receipt.deadline_ms, Number(environment.ISO_TWO_POINT_DEADLINE_MS));
    assert(receipt.remaining_when_driver_started_ms <= LIMITS.driverMs);assert(receipt.remaining_before_launch_ms >= LIMITS.childMs + LIMITS.graceMs);
    assert.equal(fs.readFileSync(path.join(latest.directory, 'stdout.log'), 'utf8'), 'synthetic stdout\n');
    assert.equal(JSON.parse(fs.readFileSync(path.join(latest.directory, 'artifact-index.json'))).files['diagnostic-receipt.json'].sha256.length, 64);
    await assert.rejects(run(fixture.output, fixture.frontend, {environment, runtime: RUNTIME}), /EEXIST/);assert.equal(launches, 1);
  } finally {fixture.cleanup();}
});

test('an independently valid complete native pass is recorded without creating release qualification or another launch', async () => {
  const fixture = temporary();let launches = 0;
  try {
    const exit = await run(fixture.output, fixture.frontend, {environment: timedEnvironment(), runtime: RUNTIME, prove: () => ({source: SHA}),
      argumentsFor: () => ['one-original-suite'], launch: async (_args, _cwd, env) => {
        launches++;const value = evidence();saveEvidence(env.ISO_TWO_POINT_OUTPUT, value);return value.execution;
      }});
    const {latest, receipt} = finalReceipt(fixture.output);
    assert.equal(exit, 0);assert.equal(launches, 1);assert.equal(receipt.passed, true);assert.equal(receipt.capture_valid, true);
    assert.equal(receipt.iso_attribution_valid, true);assert.equal(receipt.outcome.original_tests_passed, true);
    assert.equal(receipt.qualification, false);assert.equal(receipt.diagnostic_only, true);assert.equal(latest.qualification, false);
    assert.equal(latest.receipt_written, true);assert.equal(latest.index_written, true);
  } finally {fixture.cleanup();}
});

test('pending predecessors retain raw observations but cannot produce a successful attribution receipt', async () => {
  const fixture = temporary();
  try {
    const exit = await run(fixture.output, fixture.frontend, {environment: timedEnvironment(), runtime: RUNTIME, prove: () => ({source: SHA}),
      argumentsFor: () => ['one-original-suite'], launch: async (_args, _cwd, env) => {
        const value = evidence();makePending(value, 0);saveEvidence(env.ISO_TWO_POINT_OUTPUT, value);return value.execution;
      }});
    const {receipt} = finalReceipt(fixture.output);
    assert.equal(exit, 1);assert.equal(receipt.capture_valid, true);assert.equal(receipt.outcome.original_tests_passed, true);
    assert.equal(receipt.iso_attribution_valid, false);assert.equal(receipt.passed, false);assert.equal(receipt.qualification, false);
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
        if (condition !== 'partial') saveEvidence(env.ISO_TWO_POINT_OUTPUT, value);else json(path.join(env.ISO_TWO_POINT_OUTPUT, 'partial-live.json'), {pending: true});
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
      const exit = await run(fixture.output, fixture.frontend, {environment: {...ENV, ISO_TWO_POINT_DEADLINE_MS: deadline}, runtime: RUNTIME,
        prove: () => ({source: SHA}), argumentsFor: () => ['one-original-suite'], launch: async () => {launches++;throw new Error('Must not launch');}});
      const {receipt} = finalReceipt(fixture.output);assert.equal(exit, 1);assert.equal(launches, 0);assert.equal(receipt.workload_started, false);
      assert.equal(receipt.capture_valid, false);assert.match(receipt.stop_reason, /deadline|remaining budget/);
    } finally {fixture.cleanup();}
  }
});

test('unwanted inherited instrumentation stops before source verification or launch and retains the refusal', async () => {
  const fixture = temporary();let launches = 0, proofs = 0;
  try {
    const exit = await run(fixture.output, fixture.frontend, {environment: {...timedEnvironment(), NODE_OPTIONS: '--require rejected-hook'}, runtime: RUNTIME,
      prove: () => {proofs++;}, launch: async () => {launches++;}});
    const {receipt} = finalReceipt(fixture.output);assert.equal(exit, 1);assert.equal(launches, 0);assert.equal(proofs, 0);
    assert.match(receipt.stop_reason, /Unexpected inherited test configuration: NODE_OPTIONS/);
    assert.equal(receipt.workload_started, false);assert.equal(receipt.qualification, false);
  } finally {fixture.cleanup();}
});

test('ordinary case/live/total artifact caps are detected without changing or trimming native files', () => {
  for (const [name, size, message] of [
    ['two-point-case-01-cis-ig1.json', LIMITS.caseBytes + 1, /Case artifact cap/],
    ['two-point-live.json', LIMITS.liveBytes + 1, /Live artifact cap/],
    ['jest.json', LIMITS.artifactBytes - LIMITS.footerBytes + 1, /Total artifact cap/],
  ]) {
    const fixture = temporary();
    try {
      fs.mkdirSync(fixture.output);const file = path.join(fixture.output, name);fs.writeFileSync(file, 'raw');fs.truncateSync(file, size);
      assert.throws(() => artifactLimits(fixture.output), message);assert.equal(fs.statSync(file).size, size);
      assert.equal(fs.readFileSync(file).subarray(0, 3).toString(), 'raw');
    } finally {fixture.cleanup();}
  }
});

test('an oversized raw case remains exact failed capture with no retry and an explicit unsealed index', async () => {
  const fixture = temporary();let launches = 0;
  try {
    const exit = await run(fixture.output, fixture.frontend, {environment: timedEnvironment(), runtime: RUNTIME, prove: () => ({source: SHA}),
      argumentsFor: () => ['one-original-suite'], launch: async (_args, _cwd, env) => {
        launches++;const value = evidence();saveEvidence(env.ISO_TWO_POINT_OUTPUT, value);
        fs.truncateSync(path.join(env.ISO_TWO_POINT_OUTPUT, value.summary.cases[0].artifact), LIMITS.caseBytes + 1);return value.execution;
      }});
    const {latest, receipt} = finalReceipt(fixture.output);assert.equal(exit, 1);assert.equal(launches, 1);
    assert.equal(receipt.capture_valid, false);assert.match(receipt.stop_reason, /Case artifact cap/);assert.equal(receipt.qualification, false);
    assert.equal(latest.index_written, false);assert(latest.artifact_errors.includes('artifact-index-failed'));
    assert.equal(fs.statSync(path.join(latest.directory, 'two-point-case-01-cis-ig1.json')).size, LIMITS.caseBytes + 1);
  } finally {fixture.cleanup();}
});

test('external native output exceeding the full budget is preserved and reported even when no footer fits', async () => {
  const fixture = temporary();let launches = 0;const reports = [], originalLog = console.log;
  console.log = text => reports.push(JSON.parse(text));
  try {
    const exit = await run(fixture.output, fixture.frontend, {environment: timedEnvironment(), runtime: RUNTIME, prove: () => ({source: SHA}),
      argumentsFor: () => ['one-original-suite'], launch: async (_args, _cwd, env) => {
        launches++;const file = path.join(env.ISO_TWO_POINT_OUTPUT, 'jest.json');fs.writeFileSync(file, 'native raw');
        fs.truncateSync(file, LIMITS.artifactBytes + 1);return evidence().execution;
      }});
    const report = reports.at(-1);
    assert.equal(exit, 1);assert.equal(launches, 1);assert.equal(report.capture_valid, false);assert.equal(report.qualification, false);
    assert.equal(report.receipt_written, false);assert.equal(report.index_written, false);assert.equal(report.latest_written, false);
    assert(report.artifact_errors.includes('artifact-total-cap'));assert.equal(fs.existsSync(path.join(fixture.output, 'latest.json')), false);
    assert.equal(fs.statSync(path.join(report.directory, 'jest.json')).size, LIMITS.artifactBytes + 1);
  } finally {console.log = originalLog;fixture.cleanup();}
});

test('outer preflight and exclusive-claim bytes count before launch even when the run directory is empty', async () => {
  const fixture = temporary();let launches = 0, proofs = 0;
  try {
    fs.mkdirSync(fixture.output);const preflight = path.join(fixture.output, 'preflight.json');fs.writeFileSync(preflight, 'original preflight');
    const bytes = LIMITS.artifactBytes - LIMITS.footerBytes;fs.truncateSync(preflight, bytes);
    const exit = await run(fixture.output, fixture.frontend, {environment: timedEnvironment(), runtime: RUNTIME,
      prove: () => {proofs++;}, launch: async () => {launches++;}});
    const {latest, receipt} = finalReceipt(fixture.output);
    assert.equal(exit, 1);assert.equal(launches, 0);assert.equal(proofs, 0);assert.equal(receipt.workload_started, false);
    assert.match(receipt.stop_reason, /Total artifact cap exceeded/);assert.equal(receipt.capture_valid, false);assert.equal(latest.qualification, false);
    assert.equal(fs.statSync(preflight).size, bytes);assert(fs.statSync(path.join(fixture.output, 'workload-claim.json')).size > 0);
    assert(artifactLimits(latest.directory) < bytes);assert(artifactLimits(latest.directory, 0, fixture.output) > bytes);
    assert(artifactLimits(latest.directory, 0, fixture.output) <= LIMITS.artifactBytes);
  } finally {fixture.cleanup();}
});

test('a full outer preflight budget cannot be escaped by writing the latest pointer outside the run directory', async () => {
  const fixture = temporary(), reports = [], originalLog = console.log;let launches = 0;
  console.log = text => reports.push(JSON.parse(text));
  try {
    fs.mkdirSync(fixture.output);const preflight = path.join(fixture.output, 'preflight.json');fs.writeFileSync(preflight, 'original preflight');
    fs.truncateSync(preflight, LIMITS.artifactBytes);
    const exit = await run(fixture.output, fixture.frontend, {environment: timedEnvironment(), runtime: RUNTIME,
      prove: () => {throw new Error('Source verification must not start');}, launch: async () => {launches++;}});
    const report = reports.at(-1);
    assert.equal(exit, 1);assert.equal(launches, 0);assert.equal(report.capture_valid, false);assert.equal(report.qualification, false);
    assert.equal(report.receipt_written, false);assert.equal(report.index_written, false);assert.equal(report.latest_written, false);
    assert(report.artifact_errors.includes('artifact-total-cap'));assert.equal(fs.existsSync(path.join(fixture.output, 'latest.json')), false);
    assert.equal(fs.statSync(preflight).size, LIMITS.artifactBytes);assert.equal(fs.readdirSync(report.directory).length, 0);
    assert.throws(() => artifactLimits(report.directory, 0, fixture.output), /Total artifact cap/);
  } finally {console.log = originalLog;fixture.cleanup();}
});

test('root-wide accounting includes the owned run and rejects siblings/deeper directories instead of skipping their bytes', () => {
  const fixture = temporary();
  try {
    fs.mkdirSync(fixture.output);const runDirectory = path.join(fixture.output, 'run-one'), sibling = path.join(fixture.output, 'run-two');
    fs.mkdirSync(runDirectory);fs.writeFileSync(path.join(fixture.output, 'preflight.json'), 'abc');fs.writeFileSync(path.join(runDirectory, 'runtime.json'), 'defg');
    assert.equal(artifactLimits(runDirectory, 0, fixture.output), 7);assert.equal(artifactLimits(runDirectory, 0), 4);
    fs.mkdirSync(sibling);fs.writeFileSync(path.join(sibling, 'retained.json'), 'hijkl');
    assert.throws(() => artifactLimits(runDirectory, 0, fixture.output), /owned run directory/);
    fs.unlinkSync(path.join(sibling, 'retained.json'));fs.rmdirSync(sibling);
    fs.mkdirSync(path.join(runDirectory, 'nested'));assert.throws(() => artifactLimits(runDirectory, 0, fixture.output), /deeper directories/);
    assert.throws(() => artifactLimits(fixture.directory, 0, fixture.output), /budget boundary/);
  } finally {fixture.cleanup();}
});
