const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BASELINE, APPLICATION, LIFECYCLE_BLOB, TARGET, PROTECTED, FRAMEWORKS, CASES, LIMITS,
  childBudget, applicationProof, baseEnvironment, diagnosticArguments, verifySequence,
  verifyObserver, verifyControl, verifyCopy, executePlan, runChild,
} = require('./reporting-prep-diagnostic.cjs');
const SHA = 'a'.repeat(40), env = {GITHUB_SHA: SHA};
const clone = value => JSON.parse(JSON.stringify(value));
function sequence({isoTimeout = false, priorFailed = false, diagnostic = false} = {}) {
  const statuses = [priorFailed ? 'failed' : 'passed', 'passed', isoTimeout ? 'failed' : 'passed'];
  const cases = CASES.map((fullName, index) => ({fullName, status: statuses[index], failureMessages: index === 2 && isoTimeout ? ['Exceeded timeout of 180000 ms for a test.'] : []}));
  const success = statuses.every(value => value === 'passed');
  return {
    runtime: {completed: true, node: process.version, execPath: process.execPath, source_sha: SHA,
      application_baseline: APPLICATION, timezone: 'UTC', lifecycle_years: '5', synthetic_exports: false,
      phase_logging: diagnostic, cases: cases.map(value => ({name: value.fullName, status: value.status, duration_ms: 1}))},
    result: {success, wasInterrupted: false, numTotalTestSuites: 1, numTotalTests: 3, numPendingTests: 0,
      numPendingTestSuites: 0, numRuntimeErrorTestSuites: 0, numPassedTests: statuses.filter(value => value === 'passed').length,
      numFailedTests: statuses.filter(value => value === 'failed').length, testResults: [{assertionResults: cases}]},
    execution: {status: success ? 0 : 1, signal: null, error: null, hard_failure: null},
  };
}
function classify(value, diagnostic = false) { return verifySequence(value.runtime, value.result, value.execution, env, diagnostic); }

test('the fixed budgets reject exhaustion and never increase an individual watchdog', () => {
  assert.equal(childBudget(LIMITS.campaignMs, 0), 10 * 60000);
  assert.equal(childBudget(5000, 1000), 2000);
  assert.throws(() => childBudget(2000, 0), /budget exhausted/);
  assert.throws(() => childBudget(1000, 2000), /budget exhausted/);
});

test('normal/diagnostic child arguments preserve the exact original full sequence and setup order', () => {
  const args = diagnosticArguments('/original/frontend', '/disposable/frontend', '/evidence/D1');
  assert.deepEqual(args.slice(1, 6), ['test', '--watchAll=false', '--runInBand', '--runTestsByPath', 'src/preview/frameworkFiveYear.test.js']);
  assert.deepEqual(args.slice(-3), ['--setupFilesAfterEnv', path.join('/disposable/frontend', 'src/setupTests.js'), path.join('/original/frontend', 'scripts/reporting-prep-setup.cjs')]);
  assert(args.includes('--reporters=' + path.join('/original/frontend', 'scripts/frontend-runtime-reporter.cjs')));
  assert(!args.some(value => /testNamePattern|testTimeout|forceExit|iso-phase-logging/.test(value)));
  const original = {GITHUB_SHA: SHA, NODE_OPTIONS: '--require unwanted', ISO_PHASE_LOG_DIR: '/old', REPORTING_PREP_LOG_DIR: '/old',
    REPORTING_PREP_INSTRUMENTATION_PATH: '/old', FRAMEWORK_LIFECYCLE_EXPORT_DIR: '/old', FRAMEWORK_LIFECYCLE_YEARS: '3', KEEP: 'retained'};
  const actual = baseEnvironment(original, '/evidence/C1');
  assert.equal(actual.FRAMEWORK_LIFECYCLE_YEARS, '5'); assert.equal(actual.TZ, 'UTC'); assert.equal(actual.CI, 'true');
  assert.equal(actual.KEEP, 'retained'); assert.equal(actual.FRONTEND_RUNTIME_RECEIPT, path.join('/evidence/C1', 'runtime.json'));
  for (const key of ['NODE_OPTIONS', 'ISO_PHASE_LOG_DIR', 'REPORTING_PREP_LOG_DIR', 'REPORTING_PREP_INSTRUMENTATION_PATH', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR']) assert.equal(Object.hasOwn(actual, key), false);
  assert.equal(original.FRAMEWORK_LIFECYCLE_YEARS, '3');
});

test('source proof rejects dirty/indexed/untracked applications even when HEAD and GITHUB_SHA agree', () => {
  const execute = alterations => (_command, args, options) => {
    assert.equal(args[0], '-C'); assert.equal(options.env, env); assert(options.timeout > 0);
    const request = args.slice(2);
    let stdout = '';
    if (request[0] === 'rev-parse' && request[1] === 'HEAD') stdout = SHA;
    else if (request[0] === 'rev-parse') stdout = 'object:' + request[1].split(':').slice(1).join(':');
    else if (request[0] === 'hash-object') stdout = LIFECYCLE_BLOB;
    if (alterations[request[0]] !== undefined) stdout = alterations[request[0]];
    return {status: 0, stdout};
  };
  const proof = applicationProof('/original', env, Date.now() + 60000, execute({}));
  assert.equal(proof.staged_baseline_sha, BASELINE); assert.equal(proof.application_baseline_sha, APPLICATION);
  assert.equal(proof.observed_source_sha, SHA); assert.deepEqual(Object.keys(proof.protected_objects), PROTECTED);
  for (const change of [{status: ' M frontend/src/preview/store.js'}, {diff: 'backend/server.py'}, {'ls-files': 'shared/unknown.json'}, {'hash-object': 'wrong'}]) {
    assert.throws(() => applicationProof('/original', env, Date.now() + 60000, execute(change)));
  }
  assert.throws(() => applicationProof('/original', {GITHUB_SHA: 'b'.repeat(40)}, Date.now() + 60000, (_command, args) => ({status: 0, stdout: args.includes('HEAD') ? SHA : ''})), /delivered harness/);
});

test('all three actual case identities, outcomes, runtime and scenario must reconcile', () => {
  assert.equal(classify(sequence()).passed, true);
  const timeout = classify(sequence({isoTimeout: true}));
  assert.equal(timeout.passed, false); assert.equal(timeout.censored_iso, true); assert.equal(timeout.hard_stop, false);
  assert.equal(classify(sequence({priorFailed: true, isoTimeout: true})).hard_stop, true);
  for (const mutate of [
    value => value.runtime.completed = false, value => value.runtime.node = 'v0.0.0',
    value => value.runtime.execPath = 'node', value => value.runtime.source_sha = 'b'.repeat(40),
    value => value.runtime.timezone = 'America/Los_Angeles', value => value.runtime.phase_logging = true,
    value => value.runtime.synthetic_exports = true, value => value.runtime.lifecycle_years = '3',
    value => value.runtime.cases.reverse(), value => value.runtime.cases[0].duration_ms = null,
    value => value.result.testResults[0].assertionResults.reverse(), value => value.result.numTotalTests = 1,
    value => value.result.numPendingTests = 1, value => value.result.numPassedTests = 1,
    value => value.result.wasInterrupted = true, value => value.execution.hard_failure = 'watchdog',
    value => value.execution.status = 1,
  ]) { const value = sequence(); mutate(value); assert.throws(() => classify(value)); }
  const functionalFailure = sequence({isoTimeout: true});
  functionalFailure.result.testResults[0].assertionResults[2].failureMessages = ['expected actual record to persist'];
  assert.equal(classify(functionalFailure).hard_stop, true);
});

test('only complete three-case attribution with calibration, preserved guards and exact hashes is valid', () => {
  const instrumentation = {original_sha256: 'original', instrumented_sha256: 'instrumented', application_baseline_sha: APPLICATION,
    staged_baseline_sha: BASELINE, observed_source_sha: SHA};
  const measurements = Object.fromEntries(['prior-ids-first', 'prior-ids-second', 'refresh-filter'].map(label => {
    const absent = label === 'prior-ids-first';
    return [label, {calls: 1, throws: 0, sample_count: 1, total_ms: 1,
      legacyGateTruthy: 0, legacyGateFalsy: absent ? 0 : 1, legacyGateNotApplicable: absent ? 1 : 0,
      legacy_gate_buckets: {truthy: {calls: 0, sample_count: 0}, falsy: {calls: absent ? 0 : 1, sample_count: absent ? 0 : 1},
        not_applicable: {calls: absent ? 1 : 0, sample_count: absent ? 1 : 0}}}];
  }));
  const guards = Object.fromEntries(['parse', 'stringify', 'keys', 'entries', 'Set', 'map', 'setAdd', 'setHas', 'getItem', 'canFork'].map(key => [key, true]));
  const summary = {version: 1, complete: true, diagnostic_valid: true, event_cap_reached: false, errors: [], instrumentation,
    calibration: {iterations: 10000, active_observer_path: true},
    cases: FRAMEWORKS.map((framework, index) => ({framework, ordinal: index + 1, closed: true, guards_preserved: true, event_cap_reached: false,
      native_guards_before: guards, native_guards_after: guards, measurements: clone(measurements)}))};
  assert.doesNotThrow(() => verifyObserver(summary, instrumentation, env));
  for (const mutate of [
    value => value.complete = false, value => value.diagnostic_valid = false, value => value.errors.push('flush failed'),
    value => value.event_cap_reached = true, value => value.cases[1].event_cap_reached = true,
    value => value.cases[0].guards_preserved = false, value => value.cases[2].closed = false,
    value => value.cases.reverse(), value => value.cases.pop(), value => value.calibration.active_observer_path = false,
    value => value.instrumentation.instrumented_sha256 = 'different',
    value => delete value.cases[0].native_guards_before.canFork,
    value => value.cases[0].measurements['prior-ids-first'].calls = 0,
    value => value.cases[0].measurements['prior-ids-second'].sample_count = 0,
    value => value.cases[0].measurements['refresh-filter'].legacyGateTruthy = 1,
    value => value.cases[0].measurements['prior-ids-first'].legacy_gate_buckets.not_applicable.sample_count = 0,
  ]) { const value = clone(summary); mutate(value); assert.throws(() => verifyObserver(value, instrumentation, env)); }
});

test('normal controls keep canonical513-suite discovery and exact runtime/result receipts', () => {
  const {plan, LIFECYCLE_SUITES} = require('./frontend-campaign.cjs');
  const frontend = path.resolve('/original/frontend'), value = sequence();
  const manifest = plan([...Object.values(LIFECYCLE_SUITES), ...Array.from({length: 510}, (_, index) => 'src/synthetic-' + index + '.test.js')], SHA);
  Object.assign(value.result, {numPassedTestSuites: 1, numFailedTestSuites: 0});
  Object.assign(value.result.testResults[0], {name: path.join(frontend, LIFECYCLE_SUITES['framework-five-year']), status: 'passed'});
  const control = {manifest, runtime: value.runtime, result: value.result, shard: 'framework-five-year', exitCode: 0, frontendRoot: frontend};
  assert.doesNotThrow(() => verifyControl(control, value.runtime, value.result, value.execution, env, frontend));
  for (const mutate of [
    row => row.manifest.discovered.pop(), row => row.manifest.sha = 'b'.repeat(40),
    row => row.runtime.pid = -1, row => row.result.success = false, row => row.exitCode = 1,
    row => row.manifest.partitions['framework-five-year'] = [],
  ]) { const changed = clone(control); mutate(changed); assert.throws(() => verifyControl(changed, value.runtime, value.result, value.execution, env, frontend)); }
});

test('the disposable copy permits exactly three initializer wrappers and no other application change', () => {
  const {instrumentReportingSource} = require('./reporting-prep-observer.cjs');
  const original = fs.readFileSync(path.join(__dirname, '../src/preview/portfolioReporting.js'), 'utf8');
  const transformed = instrumentReportingSource(original);
  assert.doesNotThrow(() => verifyCopy(original, transformed.source, transformed, [TARGET], []));
  assert.throws(() => verifyCopy(original, transformed.source + '\n// extra behavior', transformed, [TARGET], []));
  assert.throws(() => verifyCopy(original, transformed.source, transformed, [TARGET, 'shared/new.json'], []));
  assert.throws(() => verifyCopy(original, transformed.source, transformed, [TARGET], ['frontend/src/untracked.js']));
  assert.throws(() => verifyCopy(original, transformed.source, {...transformed, original_sha256: 'different'}, [TARGET], []));
});

test('predeclared C1 D1 C2 preserves censored ISO failures without retrying or selecting later passes', async () => {
  const calls = [], updates = [];
  const result = await executePlan(async label => {
    calls.push(label); return {label, passed: label !== 'C1', censored_iso: label === 'C1', hard_stop: false};
  }, 100000, () => 0, stages => updates.push(stages.map(value => value.label)));
  assert.deepEqual(calls, ['C1', 'D1', 'C2']); assert.equal(result.complete, true);
  assert.equal(result.passed, false); assert.equal(result.censored_iso, true); assert.equal(result.qualification, false);
  assert.deepEqual(updates, [['C1'], ['C1', 'D1'], ['C1', 'D1', 'C2']]);
});

test('source, observer, resource or prior-framework failures stop all later planned processes', async () => {
  for (const stopAt of ['C1', 'D1', 'C2']) {
    const calls = [];
    const result = await executePlan(async label => {
      calls.push(label); return {label, passed: true, hard_stop: label === stopAt, stop_reason: 'hard guard'};
    }, 100000, () => 0);
    assert.deepEqual(calls, ['C1', 'D1', 'C2'].slice(0, calls.indexOf(stopAt) + 1));
    assert.equal(result.passed, false);
  }
  let called = false;
  const exhausted = await executePlan(async () => { called = true; }, 1000, () => 1000);
  assert.equal(called, false); assert.equal(exhausted.passed, false); assert.equal(exhausted.stages.length, 1);
});

test('Linux watchdog closes the owned parent/grandchild pipe group within its preflight bound',
  {skip: process.platform !== 'linux' ? 'Linux-only owned process-group behavior; no Windows workload' : false, timeout: 2000}, async t => {
    let pid;
    t.after(() => { if (pid) try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } });
    const grandchild = "console.log('grandchild-ready'); setInterval(() => {}, 1000);";
    const source = `const {spawn} = require('node:child_process'); spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], {stdio: 'inherit'}); setInterval(() => {}, 1000);`;
    const result = await runChild(['-e', source], process.cwd(), baseEnvironment(process.env, '/unused'), Date.now() + 10000,
      {watchdogMs: 200, graceMs: 100, onSpawn: value => { pid = value; }});
    assert.match(result.stdout, /grandchild-ready/);
    assert.equal(result.hard_failure, 'Child wall watchdog exceeded');
    assert.equal(result.status, null); assert(result.signal); assert(result.elapsed_ms < 1800);
  });
