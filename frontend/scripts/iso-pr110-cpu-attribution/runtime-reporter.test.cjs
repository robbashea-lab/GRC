const test = require('node:test'), assert = require('node:assert/strict');
const Reporter = require('./runtime-reporter.cjs');
const {createReporter, validateAdmission, readProcessIdentity, writeRuntimeReceipt, BASELINE, CASES, MAX_STAT_BYTES, MAX_RECEIPT_BYTES} = Reporter._test;
const output = '/tmp/owned-cpu/run-fixture';
function environment() {
  return {CPU_ATTRIBUTION_OUTPUT: output, CPU_ATTRIBUTION_PROFILE_DIR: output,
    CPU_ATTRIBUTION_EXPECTED_EXEC_PATH: '/opt/node/bin/node', CPU_ATTRIBUTION_APP_SHA: BASELINE,
    CPU_ATTRIBUTION_SOURCE_SHA: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40)};
}
function runtime() {
  return {diagnostic_only: true, qualification: false, node: 'v22.23.4', execPath: '/opt/node/bin/node',
    platform: 'linux', arch: 'x64', timezone: 'UTC', v8: '12.4-test', pid: 200, parent_pid: 100,
    process_group_id: 100, proc_pid: 200, proc_parent_pid: 100, source_sha: 'a'.repeat(40), application_baseline: BASELINE,
    lifecycle_years: '5', synthetic_exports: false, node_options_present: false, profiler_enabled: true,
    profiler_interval_us: 10000, profile_directory: output,
    execArgv: ['--cpu-prof', '--cpu-prof-dir=' + output, '--cpu-prof-interval=10000'],
    hostname: 'synthetic-runner', cpu_model: 'Synthetic CPU', available_parallelism: 4, total_memory: 1024 ** 3,
    observation_errors: []};
}
function sample(index = 0) {
  return {monotonic_ms: 10 + index * 30, hrtime_ns: String(100000 + index * 30000),
    cpu_usage_us: {user: 100 + index * 20, system: 10 + index * 5}, resource_usage: {maxRSS: 1000}, memory_usage: {rss: 2048}};
}
const file = {path: '/repo/frontend/src/preview/frameworkFiveYear.test.js'};
function results(status = 'passed') {return CASES.map((fullName, index) => ({fullName, status, duration: 100 + index}));}
function fixture(options = {}) {
  const writes = [];let samples = 0;
  const Class = createReporter({environment: environment(), observe: () => runtime(), sample: () => sample(samples++),
    write: (_output, value) => {writes.push(JSON.parse(JSON.stringify(value)));return true;}, ...options});
  return {reporter: new Class(), writes};
}

test('valid actual-Jest identity and only the three declared flags admit', () => {
  assert.deepEqual(validateAdmission(runtime(), environment()), []);
  const reordered = runtime();reordered.execArgv.reverse();assert.deepEqual(validateAdmission(reordered, environment()), []);
});
test('wrong runtime, source, group, flags, directory, environment or workload refuses admission', () => {
  const cases = [
    value => {value.node = 'v22.23.3';}, value => {value.execPath = '/other/node';},
    value => {value.timezone = 'America/Los_Angeles';}, value => {value.platform = 'win32';},
    value => {value.source_sha = 'b'.repeat(40);}, value => {value.application_baseline = 'b'.repeat(40);},
    value => {value.process_group_id = 99;}, value => {value.pid = value.parent_pid;},
    value => {value.proc_parent_pid = 99;}, value => {value.proc_pid = 99;},
    value => {value.execArgv.push('--inspect=127.0.0.1:9229');}, value => {value.execArgv.pop();},
    value => {value.execArgv[2] = '--cpu-prof-interval=1000';}, value => {value.profiler_enabled = false;},
    value => {value.profiler_interval_us = 1000;}, value => {value.profile_directory = '/other/profile';},
    value => {value.synthetic_exports = true;}, value => {value.lifecycle_years = '3';},
    value => {value.observation_errors.push('missing');}, value => {value.cpu_model = null;},
  ];
  for (const change of cases) {const value = runtime();change(value);assert.ok(validateAdmission(value, environment()).length > 0);}
  const env = environment();env.NODE_OPTIONS = '--unapproved-option';
  assert.ok(validateAdmission(runtime(), env).includes('profile-declaration-mismatch'));
  env.NODE_OPTIONS = undefined;env.GITHUB_SHA = 'b'.repeat(40);
  assert.ok(validateAdmission(runtime(), env).includes('source-mismatch'));
});
test('onRunStart writes an incomplete receipt and throws before bodies on a missing group', () => {
  const value = runtime();value.process_group_id = null;
  const {reporter, writes} = fixture({observe: () => value});
  assert.throws(() => reporter.onRunStart(), /admission refused/);
  assert.equal(writes.length, 1);assert.equal(writes[0].completed, false);
  assert.ok(writes[0].errors.includes('process-ownership-mismatch'));assert.ok(reporter.getLastError());
});
test('native case failures retain complete ordered outcomes without pretending qualification', () => {
  const {reporter, writes} = fixture();reporter.onRunStart();
  const rows = results();rows[2].status = 'failed';rows[2].duration = 180500;
  rows.forEach(row => reporter.onTestCaseResult(file, row));reporter.onTestResult(file, {testResults: rows});reporter.onRunComplete();
  const last = writes.at(-1);
  assert.equal(last.completed, true);assert.equal(last.qualification, false);assert.equal(last.profiler_enabled, true);
  assert.deepEqual(last.errors, []);assert.deepEqual(last.cases.map(row => row.status), ['passed','passed','failed']);
  assert.equal(last.cases[2].duration_ms, 180500);assert.deepEqual(last.cpu_usage_us, {user: 20, system: 5});
  assert.equal(last.elapsed_ms, 30);assert.equal(last.resource_start.monotonic_ms, 10);assert.equal(last.resource_end.monotonic_ms, 40);
  assert.equal(reporter.getLastError(), undefined);
});
test('end runtime drift and reversed resource counters invalidate rather than rewrite outcomes', () => {
  let observations = 0, samples = 0;
  const {reporter, writes} = fixture({observe: () => {const value = runtime();if(observations++)value.pid = 999;return value;},
    sample: () => {const value = sample();if(samples++){value.monotonic_ms = 5;value.cpu_usage_us = {user: 90, system: 5};}return value;}});
  reporter.onRunStart();reporter.onTestResult(file, {testResults: results()});reporter.onRunComplete();
  assert.equal(writes.at(-1).completed, false);
  assert.ok(writes.at(-1).errors.includes('runtime-identity-changed'));assert.ok(writes.at(-1).errors.includes('resource-clock-reversed'));
});
test('missing, skipped, reordered and disagreeing case outcomes remain invalid', () => {
  for (const change of [rows => rows.pop(), rows => rows.reverse(), rows => {rows[0].status = 'pending';}, rows => {rows[0].duration = undefined;}]) {
    const {reporter, writes} = fixture();reporter.onRunStart();const rows = results();change(rows);
    reporter.onTestResult(file, {testResults: rows});reporter.onRunComplete();assert.equal(writes.at(-1).completed, false);
  }
  const {reporter, writes} = fixture();reporter.onRunStart();results().forEach(row => reporter.onTestCaseResult(file, row));
  const final = results();final[0].status = 'failed';reporter.onTestResult(file, {testResults: final});reporter.onRunComplete();
  assert.ok(writes.at(-1).errors.includes('case-result-disagreement'));assert.equal(writes.at(-1).case_events[0].status, 'passed');
});
test('capture failures are visible and a failed initial receipt refuses native bodies', () => {
  const {reporter} = fixture({write: () => {throw Error('private filesystem details');}});
  assert.throws(() => reporter.onRunStart(), /receipt-write-failed/);assert.match(reporter.getLastError().message, /receipt-write-failed/);
  const broken = fixture({sample: () => {throw Error('private resource details');}});
  assert.throws(() => broken.reporter.onRunStart(), /resource-observation-failed/);
  assert.ok(!JSON.stringify(broken.writes).includes('private resource details'));
});
test('unexpected Node arguments and case data are not copied into error receipts', () => {
  const value = runtime();value.execArgv.push('--eval=PRIVATE_CREDENTIAL_VALUE');
  const {reporter, writes} = fixture({observe: () => value});assert.throws(() => reporter.onRunStart(), /admission refused/);
  assert.equal(writes[0].execArgv_redacted, true);assert.ok(!JSON.stringify(writes).includes('PRIVATE_CREDENTIAL_VALUE'));
  const valid = fixture();valid.reporter.onRunStart();valid.reporter.onTestCaseResult(file, {fullName: 'PRIVATE_RECORD_VALUE', status: 'failed', duration: 1});
  assert.ok(!JSON.stringify(valid.writes).includes('PRIVATE_RECORD_VALUE'));
});
function procFiles(text, count = Buffer.byteLength(text)) {
  const state = {closed: 0, requested: 0};
  return {state, openSync: name => {assert.equal(name, '/proc/self/stat');return 7;},
    readSync: (_fd, buffer, offset, length, position) => {state.requested = length;assert.equal(position, 0);buffer.write(text, offset);return count;},
    closeSync: fd => {assert.equal(fd, 7);state.closed++;}};
}
test('bounded Linux identity read handles parentheses and rejects oversize or malformed input', () => {
  const files = procFiles('200 (node (worker)) S 100 100 100 0 0 0\n');
  assert.deepEqual(readProcessIdentity(files), {pid: 200, parent: 100, group: 100});
  assert.equal(files.state.requested, MAX_STAT_BYTES + 1);assert.equal(files.state.closed, 1);
  for (const input of [procFiles('bad'), procFiles('200 (node) S 0 100'), procFiles('x', MAX_STAT_BYTES + 1)]) {
    assert.throws(() => readProcessIdentity(input), /proc-stat/);assert.equal(input.state.closed, 1);
  }
});
function writerFiles({renameFails = false, directoryLink = false} = {}) {
  const values = new Map(), events = [];
  return {values, events, existsSync: name => values.has(name),
    lstatSync: name => ({isDirectory: () => name === output, isFile: () => values.has(name), isSymbolicLink: () => directoryLink}),
    writeFileSync: (name, text, options) => {assert.equal(options.flag, 'wx');assert.equal(options.mode, 0o600);values.set(name, text);events.push('staged');},
    renameSync: (from, to) => {if(renameFails)throw Error('synthetic rename failure');values.set(to, values.get(from));values.delete(from);events.push('renamed');},
    unlinkSync: name => {values.delete(name);events.push('unlinked');}};
}
test('runtime receipt is bounded and atomically replaced; failed rename preserves prior bytes', () => {
  const files = writerFiles();assert.equal(writeRuntimeReceipt(output, {completed: false}, files), true);
  const destination = require('node:path').join(output, 'runtime.json');
  assert.deepEqual(files.events, ['staged','renamed']);assert.equal(JSON.parse(files.values.get(destination)).completed, false);
  assert.throws(() => writeRuntimeReceipt(output, {tooLarge: 'x'.repeat(MAX_RECEIPT_BYTES)}, files), /cap-exceeded/);
  const failed = writerFiles({renameFails: true});failed.values.set(destination, 'prior valid receipt');
  assert.throws(() => writeRuntimeReceipt(output, {completed: true}, failed), /rename failure/);
  assert.equal(failed.values.get(destination), 'prior valid receipt');assert.deepEqual(failed.events, ['staged','unlinked']);
  assert.throws(() => writeRuntimeReceipt(output, {}, writerFiles({directoryLink: true})), /directory-invalid/);
});
