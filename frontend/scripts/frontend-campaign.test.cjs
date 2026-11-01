const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {plan, audit, LIFECYCLE_SUITES, SHARDS, pinnedNodeEnvironment, executionOptions,
  verifyRuntime, clearExecutionArtifacts, environmentClass, launchProvenance, verifyLaunch,
  classifyReceipt, requireQualification, collectExecutionReceipt} = require('./frontend-campaign.cjs');
const sha = 'a'.repeat(40), root = path.resolve('frontend');
const lifecycleFiles = Object.values(LIFECYCLE_SUITES);
function receipts() {
  const manifest = plan([...lifecycleFiles, 'src/a.test.js', 'src/b.test.js', 'src/c.test.js', 'src/new.test.jsx'], sha);
  const rows = SHARDS.map(shard => ({manifest, shard, exitCode: 0, frontendRoot: root, result: {
    success: true, wasInterrupted: false, numTotalTestSuites: manifest.partitions[shard].length,
    numPassedTestSuites: manifest.partitions[shard].length, numFailedTestSuites: 0,
    numPendingTestSuites: 0, numRuntimeErrorTestSuites: 0,
    testResults: manifest.partitions[shard].map(file => ({name: path.join(root, file), status: 'passed'})),
  }}));
  const selected = rows.find(row => row.shard === 'framework-five-year');
  const cases = ['cis-ig1', 'soc-2', 'iso-27001'].map(name => ({fullName: name, status: 'passed', duration: 100}));
  // Match the installed Jest JSON formatter: raw reporter durations are not included here.
  selected.result.testResults[0].assertionResults = cases.map(({fullName, status}) => ({fullName, status}));
  selected.runtimeLaunch = launchProvenance('unique-launch', {GITHUB_SHA: sha}, {version: 'v22.23.4', execPath: '/runtime/bin/node', execArgv: []});
  selected.runtimeLaunch.metadata_preflight_ms = 1;
  selected.runtime = {version: 1, ...selected.runtimeLaunch, completed: true, platform: 'linux', arch: 'x64', timezone: 'UTC',
    lifecycle_years: '5', synthetic_exports: false, phase_logging: false, available_parallelism: 4,
    cpu_model: 'Synthetic test CPU', total_memory: 1000, startup_free_memory: 500, elapsed_ms: 400,
    cpu_usage_us: {user: 100, system: 50}, resource_usage: {maxRSS: 100}, memory_usage: {rss: 50},
    cases: cases.map(value => ({name: value.fullName, status: value.status, duration_ms: value.duration})),
    envelope: {version: 1, hook: 'onTestStart', capture_status: 'admitted', identity_evidence: 'configured-selected-resolved',
      actual_vm_module_execution: 'UNVERIFIED', early_environment: {...selected.runtimeLaunch.early_environment},
      startup: {...selected.runtimeLaunch.startup}, inner_environment: {node_env: 'test', babel_env: 'test', jest_jasmine: 'unset'},
      configured_fields_sha256: 'a'.repeat(64), selected_files: [{role: 'setup', path: '/checkout/setup.js', bytes: 20, sha256: 'b'.repeat(64)}],
      overhead: {snapshot_ms: 1}}, artifact_overhead: {completed_write_ms: 1, completed_write_calls: 3, current_write_excluded: true}};
  return rows;
}
test('deterministic discovery assigns every suite once, including newly discovered suites', () => {
  const rows = receipts();
  assert.equal(audit(rows, sha).suites, 7);
  assert.deepEqual(plan([...rows[0].manifest.discovered].reverse(), sha), rows[0].manifest);
  assert.deepEqual(LIFECYCLE_SUITES, {
    'ten-year': 'src/preview/brawndoTenYear.test.js',
    'multi-framework': 'src/preview/multiFrameworkLifecycle.test.js',
    'framework-five-year': 'src/preview/frameworkFiveYear.test.js',
  });
  for (const [shard, file] of Object.entries(LIFECYCLE_SUITES)) {
    assert.deepEqual(rows[0].manifest.partitions[shard], [file]);
    assert.equal(Object.values(rows[0].manifest.partitions).flat().filter(value => value === file).length, 1);
  }
});
test('missing any lifecycle suite, duplicate discovery and empty partitions fail closed', () => {
  assert.throws(() => plan(['src/a.test.js'], sha));
  assert.throws(() => plan([...lifecycleFiles, lifecycleFiles[0]], sha));
  assert.throws(() => plan([...lifecycleFiles, 'src/a.test.js'], sha));
});
test('missing/duplicate shards, changed discovery or foreign source cannot qualify', () => {
  assert.throws(() => audit(receipts().slice(1), sha));
  const duplicate = receipts(); duplicate[1] = duplicate[0]; assert.throws(() => audit(duplicate, sha));
  assert.throws(() => audit(receipts(), 'b'.repeat(40)));
  const changed = receipts(); changed[1].manifest = {...changed[1].manifest, sha: 'b'.repeat(40)};
  assert.throws(() => audit(changed, sha));
});
test('missing/duplicate/foreign suite results and interrupted/failed/pending execution fail closed', () => {
  for (const mutate of [
    receipt => receipt.result.testResults.pop(),
    receipt => receipt.result.testResults.push(receipt.result.testResults[0]),
    receipt => receipt.result.testResults[0].name = path.resolve('../foreign.test.js'),
    receipt => receipt.exitCode = 1,
    receipt => receipt.result.wasInterrupted = true,
    receipt => receipt.result.success = false,
    receipt => receipt.result.numPendingTestSuites = 1,
    receipt => receipt.result.testResults[0].status = 'pending',
    receipt => receipt.result.testResults[0].testExecError = {message: 'runtime failure'},
  ]) { const rows = receipts(); mutate(rows[0]); assert.throws(() => audit(rows, sha)); }
});


test('dedicated lifecycle receipts cannot be omitted, duplicated, reassigned or unsuccessful', () => {
  for (const [shard, file] of Object.entries(LIFECYCLE_SUITES)) {
    const rows = receipts(), dedicatedIndex = SHARDS.indexOf(shard);
    assert.throws(() => audit(rows.filter(row => row.shard !== shard), sha));
    const duplicate = receipts(); duplicate[SHARDS.indexOf('1')] = duplicate[dedicatedIndex];
    assert.throws(() => audit(duplicate, sha));
    const moved = receipts();
    const manifest = JSON.parse(JSON.stringify(moved[0].manifest));
    manifest.partitions[shard] = [];
    manifest.partitions['1'].push(file);
    moved.forEach(row => { row.manifest = manifest; });
    assert.throws(() => audit(moved, sha));
    for (const mutate of [
      row => row.result.testResults.pop(),
      row => { row.exitCode = 1; row.result.success = false; },
      row => { row.result.wasInterrupted = true; },
      row => { row.result.numPendingTestSuites = 1; },
      row => { row.result.testResults[0].testExecError = {message: 'runtime failure'}; },
    ]) {
      const altered = receipts(); mutate(altered[dedicatedIndex]);
      assert.throws(() => audit(altered, sha));
    }
  }
});

test('runtime pinning handles Unix and Windows PATH without mutating the caller', () => {
  const unix = {PATH: '/usr/bin', OTHER: 'keep'};
  assert.deepEqual(pinnedNodeEnvironment(unix, '/managed/bin/node', 'linux'), {PATH: '/managed/bin:/usr/bin', OTHER: 'keep'});
  assert.equal(unix.PATH, '/usr/bin');
  const windows = {Path: 'C:\\Windows', PATH: 'duplicate', OTHER: 'keep'};
  assert.deepEqual(pinnedNodeEnvironment(windows, 'C:\\managed\\node.exe', 'win32'), {PATH: 'C:\\managed;duplicate', OTHER: 'keep'});
  assert.equal(windows.PATH, 'duplicate');
});

test('only the selected execution adds passive provenance and pins inherited runtime', () => {
  const manifest = receipts()[0].manifest, environment = {PATH: '/usr/bin', GITHUB_SHA: sha};
  for (const shard of SHARDS) {
    const selected = executionOptions(shard, manifest, '/result.json', '/runtime.json', 'one-launch', environment);
    const original = ['--runTestsByPath', ...manifest.partitions[shard], '--json', '--outputFile=/result.json'];
    if (shard !== 'framework-five-year') {
      assert.deepEqual(selected, {args: original, options: {stdio: 'inherit'}});
    } else {
      assert.deepEqual(selected.args.slice(0, original.length), original);
      assert.equal(selected.args[original.length], '--reporters=default');
      assert.match(selected.args[original.length + 1], /frontend-runtime-reporter\.cjs$/);
      assert.equal(selected.options.env.FRONTEND_RUNTIME_RECEIPT, '/runtime.json');
      assert.equal(selected.options.env.FRONTEND_RUNTIME_INVOCATION, 'one-launch');
      assert.equal(selected.options.env.GITHUB_SHA, sha);
      assert.equal(selected.options.env.CI, 'true');
      assert.deepEqual(JSON.parse(selected.options.env.FRONTEND_RUNTIME_EARLY_ENV), {node_env: 'unset', babel_env: 'unset'});
    }
  }
  assert.deepEqual(environment, {PATH: '/usr/bin', GITHUB_SHA: sha});
});

test('aggregate audit rejects absent, stale, foreign, incomplete or instrumented lifecycle provenance', () => {
  for (const mutate of [
    row => { delete row.runtime; }, row => { delete row.runtimeLaunch; },
    row => { row.runtime.completed = false; }, row => { row.runtime.invocation_id = 'previous'; },
    row => { row.runtime.source_sha = 'b'.repeat(40); }, row => { row.runtimeLaunch.source_sha = 'b'.repeat(40); },
    row => { row.runtime.node = 'v22.23.3'; }, row => { row.runtimeLaunch.node = 'v22.23.3'; },
    row => { row.runtime.execPath = '/wrong/node'; }, row => { row.runtime.timezone = 'America/Los_Angeles'; },
    row => { row.runtime.lifecycle_years = '3'; }, row => { row.runtime.synthetic_exports = true; },
    row => { row.runtime.phase_logging = true; }, row => { row.runtime.available_parallelism = 0; },
    row => { delete row.runtime.memory_usage; }, row => { row.runtime.resource_usage = {}; },
    row => { row.runtime.cpu_usage_us = {}; }, row => { row.runtime.cases.pop(); },
    row => { row.runtime.cases[0].duration_ms = null; }, row => { row.runtime.cases.reverse(); },
    row => { delete row.runtime.envelope; }, row => { row.runtime.envelope.capture_status = 'rejected'; },
    row => { row.runtime.envelope.actual_vm_module_execution = 'verified'; },
    row => { row.runtime.envelope.early_environment.node_env = 'production'; },
    row => { row.runtime.envelope.startup.exec_argv_count = 1; },
    row => { row.runtime.envelope.startup.node_options_nonempty = true; },
    row => { row.runtime.envelope.startup.v8_coverage_enabled = true; },
    row => { row.runtime.envelope.startup.jest_jasmine = 'one'; },
    row => { row.runtime.envelope.configured_fields_sha256 = 'invalid'; },
    row => { row.runtime.envelope.selected_files[0].sha256 = 'invalid'; },
    row => { row.runtime.envelope.overhead.snapshot_ms = -1; },
  ]) {
    const rows = receipts(); mutate(rows.find(row => row.shard === 'framework-five-year'));
    assert.throws(() => audit(rows, sha));
  }
});

test('runtime collection completion retains failed case evidence and cannot override Jest failure', () => {
  const rows = receipts(), row = rows.find(value => value.shard === 'framework-five-year');
  row.result.testResults[0].assertionResults[2].status = 'failed';
  row.runtime.cases[2].status = 'failed';
  // Matching raw evidence is valid provenance; the original qualification gate still rejects the failure.
  verifyRuntime(row);
  row.exitCode = 1; row.result.success = false; row.result.testResults[0].status = 'failed';
  assert.throws(() => audit(rows, sha), /Unsuccessful/);
});

test('each execution removes stale generated results; selected runtime and launch are removed without deleting unrelated files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-test-'));
  try {
    for (const name of ['jest.json', 'receipt.json', 'runtime.json', 'launch.json', 'keep.txt']) fs.writeFileSync(path.join(directory, name), 'old');
    clearExecutionArtifacts(directory, '1');
    assert.equal(fs.existsSync(path.join(directory, 'jest.json')), false);
    assert.equal(fs.existsSync(path.join(directory, 'receipt.json')), false);
    assert.equal(fs.existsSync(path.join(directory, 'runtime.json')), true);
    assert.equal(fs.existsSync(path.join(directory, 'launch.json')), true);
    clearExecutionArtifacts(directory, 'framework-five-year');
    assert.deepEqual(fs.readdirSync(directory), ['keep.txt']);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, {recursive: true});
  }
});

test('safe launch admission preserves classifications and rejects unexpected options without leaking or sanitizing them', () => {
  for (const [value, expected] of [[undefined, 'unset'], ['', 'empty'], ['test', 'test'], ['production', 'production'], ['private-value', 'other']]) {
    assert.equal(environmentClass(value), expected);
  }
  const runtime = {version: 'v22.23.4', execPath: '/runtime/bin/node', execArgv: []};
  const environment = Object.freeze({GITHUB_SHA: sha, PRIVATE_TOKEN: 'secret', NODE_ENV: 'test', NODE_OPTIONS: ''});
  const admitted = launchProvenance('one', environment, runtime);
  assert.doesNotThrow(() => verifyLaunch(admitted));
  assert.equal(admitted.startup.node_options_present, true);
  assert.equal(admitted.startup.node_options_nonempty, false);
  assert.equal(JSON.stringify(admitted).includes('secret'), false);
  for (const changed of [{NODE_OPTIONS: '--require=private-token'}, {NODE_ENV: 'private-token'}, {BABEL_ENV: 'production'}, {JEST_JASMINE: '1'}, {NODE_V8_COVERAGE: 'private-token'}]) {
    const rejected = launchProvenance('one', {...environment, ...changed}, runtime);
    assert.throws(() => verifyLaunch(rejected), /Unexpected/);
    assert.equal(JSON.stringify(rejected).includes('private-token'), false);
  }
  const rejectedArgs = launchProvenance('one', environment, {...runtime, execArgv: ['--eval=private-token']});
  assert.equal(rejectedArgs.startup.exec_argv_count, 1);
  assert.throws(() => verifyLaunch(rejectedArgs), /Unexpected/);
  assert.equal(JSON.stringify(rejectedArgs).includes('private-token'), false);
  assert.equal(environment.NODE_ENV, 'test');
});

test('metadata and original workload failures are classified independently and neither can qualify the other', () => {
  const row = receipts().find(value => value.shard === 'framework-five-year');
  row.exitCode = 1;
  row.result.success = false;
  row.result.testResults[0].status = 'failed';
  row.result.testResults[0].assertionResults[2].status = 'failed';
  row.runtime.cases[2].status = 'failed';
  const original = JSON.stringify(row.result);
  const validCapture = classifyReceipt(row);
  assert.equal(validCapture.workload.valid, false);
  assert.equal(validCapture.runtime.valid, true);
  assert.throws(() => requireQualification(validCapture), /Workload verification failed/);
  row.runtime.envelope.capture_status = 'rejected';
  const bothFailed = classifyReceipt(row);
  assert.equal(bothFailed.workload.valid, false);
  assert.equal(bothFailed.runtime.valid, false);
  assert.match(bothFailed.workload.error, /Unsuccessful/);
  assert.match(bothFailed.runtime.error, /configuration provenance/);
  assert.throws(() => requireQualification(bothFailed), /Workload verification failed:.*Runtime verification failed:/);
  assert.equal(JSON.stringify(row.result), original);
  const passingRow = receipts().find(value => value.shard === 'framework-five-year');
  passingRow.runtime.envelope.capture_status = 'rejected';
  const captureFailed = classifyReceipt(passingRow);
  assert.equal(captureFailed.workload.valid, true);
  assert.equal(captureFailed.runtime.valid, false);
  assert.throws(() => requireQualification(captureFailed), /Runtime verification failed/);
});

test('missing or malformed original results retain partial runtime and termination facts without inventing cases', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-receipt-test-'));
  try {
    const original = receipts().find(value => value.shard === 'framework-five-year');
    const resultPath = path.join(directory, 'jest.json'), runtimePath = path.join(directory, 'runtime.json');
    const partialRuntime = {version: 1, completed: false, cases: []};
    fs.writeFileSync(runtimePath, JSON.stringify(partialRuntime));
    for (const scenario of ['missing', 'invalid-json']) {
      if (scenario === 'invalid-json') fs.writeFileSync(resultPath, '{not-json');
      const row = collectExecutionReceipt({manifest: original.manifest, shard: original.shard,
        execution: {status: null, signal: 'SIGTERM'}, frontendRoot: root, resultPath, runtimePath, launch: original.runtimeLaunch});
      assert.equal(row.result, null);
      assert.equal(row.resultError, scenario);
      assert.equal(row.exitCode, null);
      assert.equal(row.signal, 'SIGTERM');
      assert.deepEqual(row.runtime, partialRuntime);
      const checks = classifyReceipt(row);
      assert.equal(checks.workload.valid, false);
      assert.equal(checks.runtime.valid, false);
      assert.throws(() => requireQualification(checks), /Workload verification failed:.*Runtime verification failed:/);
    }
    fs.writeFileSync(resultPath, JSON.stringify(original.result));
    fs.writeFileSync(runtimePath, JSON.stringify(original.runtime));
    const row = collectExecutionReceipt({manifest: original.manifest, shard: original.shard,
      execution: {status: 0, signal: null}, frontendRoot: root, resultPath, runtimePath, launch: original.runtimeLaunch});
    assert.doesNotThrow(() => requireQualification(classifyReceipt(row)));
    assert.deepEqual(row.result, original.result);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, {recursive: true});
  }
});
