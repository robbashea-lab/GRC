// One diagnostic-only execution; no normal release receipt or application transformation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');

const BASELINE = '9824384552c579099fad53528b738467a6d5f677';
const LIFECYCLE = 'frontend/src/preview/frameworkFiveYear.test.js';
const LIFECYCLE_BLOB = 'f044a5166f02d5c5a7884a753b04ee23e5a0ea8c';
const DIRECTORY = 'frontend/scripts/iso-pr110-diagnostic';
const SCRIPTS = ['run.cjs', 'run.test.cjs', 'phase-logger.cjs', 'phase-logger.test.cjs', 'setup.cjs', 'setup.test.cjs', 'runtime-reporter.cjs'];
const ALLOWED = new Set([...SCRIPTS.map(name => DIRECTORY + '/' + name), '.github/workflows/iso-pr110-focused-diagnostic.yml']);
const PROTECTED = ['frontend/src', 'backend', 'shared', 'frontend/package.json', 'frontend/yarn.lock', 'frontend/craco.config.js',
  'frontend/scripts/frontend-campaign.cjs', '.github/workflows/release-verification.yml'];
const PINNED = {'frontend/src': 'ba7daadf5dcf7378b308d4d354b4f4d1292a3f33', backend: 'a05953d94eafee906d2a4a2bc5c6216a5460947e',
  shared: '8aaa93325109a205dfb995575fb7b6304bfe12c2', 'frontend/package.json': '8721741ae68fc55c18769d6294ff546b8a0b2dca',
  'frontend/yarn.lock': 'e128418a0556bf7e325db7abe13a37f183112c1a', 'frontend/craco.config.js': '900a5569c0e5dcf5e657cebe9be44cd344d75810'};
const INPUTS = [LIFECYCLE, 'frontend/src/setupTests.js', 'shared/contracts/program-lifecycle.json',
  ...['commandTestAdapter.js', 'adapter.js', 'store.js', 'demoStorageCodec.js', 'portfolioReporting.js', 'evidenceStorage.js'].map(name => 'frontend/src/preview/' + name)];
const FRAMEWORKS = ['cis-ig1', 'soc-2', 'iso-27001'];
const CASES = FRAMEWORKS.map(key => key + ' fresh client retains the configured program lifecycle and period evidence');
const GUARDS = ['parse', 'stringify', 'keys', 'getItem', 'canFork'];
const LIMITS = Object.freeze({driverMs: 12 * 60000, childMs: 10 * 60000, graceMs: 2000, outputBytes: 256 * 1024, spans: 50000});
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const caseArtifact = index => 'iso-phase-case-' + String(index + 1).padStart(2, '0') + '-' + FRAMEWORKS[index] + '.json';

function observedRuntime() {
  return {node: process.version, execPath: process.execPath, platform: process.platform, arch: process.arch,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone};
}
function verifyPreflight(runtime, environment) {
  requireThat(runtime.node === 'v22.23.4' && runtime.platform === 'linux' && runtime.arch === 'x64' && runtime.timezone === 'UTC'
    && typeof runtime.execPath === 'string' && path.isAbsolute(runtime.execPath), 'Workload requires actual Linux/x64 Node22.23.4 in UTC');
  requireThat(environment.GITHUB_RUN_ATTEMPT === '1' && /^[a-f0-9]{40}$/.test(environment.GITHUB_SHA || ''), 'Only attempt1 at an exact diagnostic commit is authorized');
}
function childBudget(deadline, now = Date.now()) {
  const remaining = deadline - now - LIMITS.graceMs;
  requireThat(remaining > 0, 'Diagnostic wall budget exhausted');
  return Math.min(LIMITS.childMs, remaining);
}
function diagnosticDeadline(environment, now = Date.now()) {
  const raw = environment.ISO_DIAGNOSTIC_DEADLINE_MS, deadline = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  requireThat(Number.isSafeInteger(deadline) && deadline > now && deadline - now <= LIMITS.driverMs,
    'Missing, unsafe or expired first-step diagnostic deadline');
  return deadline;
}
function baseEnvironment(environment, output, executable = process.execPath, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const keys = Object.keys(environment).filter(key => platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH').sort();
  const inherited = environment[keys[0]], env = {...environment, CI: 'true', FRAMEWORK_LIFECYCLE_YEARS: '5',
    ISO_PHASE_LOG_DIR: output, ISO_PHASE_APP_SHA: BASELINE, FRONTEND_RUNTIME_RECEIPT: path.join(output, 'runtime.json')};
  for (const key of keys) delete env[key];
  env[keys[0] || 'PATH'] = paths.dirname(executable) + (inherited ? paths.delimiter + inherited : '');
  // Observe the managed runner's actual UTC timezone; do not replace an already-UTC clock.
  for (const key of ['NODE_OPTIONS', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR', 'REPORTING_PREP_LOG_DIR', 'REPORTING_PREP_INSTRUMENTATION_PATH']) delete env[key];
  return env;
}
function applicationProof(root, environment, deadline, {execute = spawnSync, now = Date.now, fingerprint = file => {
  requireThat(fs.lstatSync(file).isFile(), 'Diagnostic harness must use ordinary files');
  return hash(fs.readFileSync(file));
}} = {}) {
  const query = args => {
    const remaining = deadline - now(); requireThat(remaining > 0, 'Source-verification budget exhausted');
    const result = execute('git', ['-C', root, ...args], {env: environment, encoding: 'utf8', windowsHide: true,
      timeout: Math.min(60000, remaining), maxBuffer: 1024 * 1024});
    requireThat(result.status === 0 && !result.error, 'Git/source verification failed');
    return result.stdout.trim();
  };
  const head = query(['rev-parse', 'HEAD']);
  requireThat(head === environment.GITHUB_SHA, 'Checkout differs from the exact diagnostic commit');
  requireThat(query(['status', '--porcelain', '--untracked-files=all']) === '', 'Diagnostic checkout is not clean');
  query(['merge-base', '--is-ancestor', BASELINE, 'HEAD']);
  const changed = query(['diff', '--name-only', '-z', BASELINE, 'HEAD']).split('\0').filter(Boolean);
  requireThat(changed.every(file => ALLOWED.has(file)), 'Changes exceed the explicit diagnostic-only allowlist');
  const objects = Object.fromEntries(PROTECTED.map(file => {
    const baseline = query(['rev-parse', BASELINE + ':' + file]), current = query(['rev-parse', 'HEAD:' + file]);
    requireThat(baseline === current && (!PINNED[file] || baseline === PINNED[file]), 'Protected source object differs: ' + file);
    return [file, current];
  }));
  const inputs = Object.fromEntries(INPUTS.map(file => {
    const baseline = query(['rev-parse', BASELINE + ':' + file]), current = query(['hash-object', file]);
    requireThat(current === baseline && (file !== LIFECYCLE || current === LIFECYCLE_BLOB), 'Original workload/module bytes differ: ' + file);
    return [file, current];
  }));
  return {application_baseline_sha: BASELINE, observed_source_sha: head, clean_checkout: true, changed_files: changed,
    protected_objects: objects, input_blobs: inputs,
    harness_sha256: Object.fromEntries([...ALLOWED].map(file => [file, fingerprint(path.join(root, file))]))};
}
function diagnosticArguments(frontend, output, runner = require.resolve('@craco/craco/dist/bin/craco.js', {paths: [frontend]})) {
  return [runner, 'test', '--watchAll=false', '--runInBand', '--runTestsByPath', 'src/preview/frameworkFiveYear.test.js',
    '--json', '--outputFile=' + path.join(output, 'jest.json'), '--reporters=default',
    '--reporters=' + path.join(frontend, 'scripts/iso-pr110-diagnostic/runtime-reporter.cjs'),
    '--setupFilesAfterEnv', path.join(frontend, 'src/setupTests.js'), path.join(frontend, 'scripts/iso-pr110-diagnostic/setup.cjs')];
}
function verifySequence(runtime, result, execution, environment, expected = observedRuntime()) {
  requireThat(runtime?.completed === true && runtime.node === 'v22.23.4' && runtime.node === expected.node
    && runtime.execPath === expected.execPath && runtime.platform === 'linux' && runtime.arch === 'x64' && runtime.timezone === 'UTC'
    && Number.isSafeInteger(runtime.pid) && runtime.pid > 1 && typeof runtime.v8 === 'string'
    && Number.isSafeInteger(execution.pid) && execution.pid > 1 && Number.isSafeInteger(runtime.process_group_id)
    && runtime.process_group_id === execution.pid, 'Actual Jest runtime is incomplete, mismatched or outside the owned process group');
  requireThat(runtime.source_sha === environment.GITHUB_SHA && runtime.application_baseline === BASELINE
    && runtime.lifecycle_years === '5' && runtime.synthetic_exports === false && runtime.phase_logging === true, 'Actual Jest source or workload flags differ');
  requireThat(result?.wasInterrupted === false && result.numTotalTestSuites === 1 && result.numTotalTests === 3
    && result.numPendingTests === 0 && result.numPendingTestSuites === 0 && result.numRuntimeErrorTestSuites === 0
    && result.testResults?.length === 1, 'Original three-case sequence is missing or incomplete');
  const suite = result.testResults[0], cases = suite.assertionResults;
  requireThat(typeof suite.name === 'string' && /[\\/]src[\\/]preview[\\/]frameworkFiveYear\.test\.js$/.test(suite.name)
    && !suite.testExecError && Array.isArray(cases) && same(cases.map(row => row.fullName), CASES), 'Original suite/case identities were filtered, reordered or replaced');
  requireThat(cases.every(row => ['passed', 'failed'].includes(row.status)) && same(runtime.cases?.map(row => [row.name, row.status]), cases.map(row => [row.fullName, row.status]))
    && runtime.cases.every(row => Number.isFinite(row.duration_ms) && row.duration_ms >= 0), 'Runtime/Jest outcomes or raw durations disagree');
  const passed = cases.filter(row => row.status === 'passed').length, allPassed = passed === 3;
  requireThat(result.numPassedTests === passed && result.numFailedTests === 3 - passed && result.success === allPassed
    && result.numPassedTestSuites === Number(allPassed) && result.numFailedTestSuites === Number(!allPassed)
    && (execution.status === 0) === allPassed && !execution.hard_failure && !execution.error && !execution.signal, 'Child/Jest outcome or accounting differs');
  requireThat(['user', 'system'].every(key => Number.isFinite(runtime.cpu_usage_us?.[key]) && runtime.cpu_usage_us[key] >= 0)
    && Number.isFinite(runtime.elapsed_ms) && runtime.elapsed_ms >= 0 && runtime.resource_usage?.maxRSS > 0 && runtime.memory_usage?.rss > 0,
  'Actual Jest resource observations are incomplete');
  const predecessorsPassed = cases.slice(0, 2).every(row => row.status === 'passed');
  const censored = cases[2].status === 'failed' && cases[2].failureMessages?.some(message => /Exceeded timeout of 180000 ms for a test/.test(message));
  return {original_tests_passed: allPassed, predecessors_passed: predecessorsPassed, censored_iso: !!censored,
    iso_failure_outside_deadline: cases[2].status === 'failed' && !censored, cases: runtime.cases, qualification: false};
}
function verifyObserver(summary, rawCases, host, calibration, runtime, environment) {
  const provenance = value => value?.application_baseline_sha === BASELINE && value.observed_source_sha === environment.GITHUB_SHA;
  requireThat(summary?.version === 1 && summary.complete === true && summary.diagnostic_valid === true && provenance(summary)
    && summary.span_cap_reached === false && Array.isArray(summary.errors) && summary.errors.length === 0
    && summary.cases?.length === 3 && rawCases.length === 3, 'Phase capture is incomplete, errored or capped');
  requireThat(host?.node === runtime.node && host.exec_path === runtime.execPath && host.actual_jest_pid === runtime.pid
    && host.platform === 'linux' && host.arch === 'x64' && host.timezone === 'UTC' && provenance(host)
    && host.versions?.node === runtime.node.slice(1) && host.versions?.v8 === runtime.v8
    && host.profiler_enabled === false && host.max_spans_per_case === LIMITS.spans
    && host.environment?.lifecycle_years === '5' && host.environment.export_enabled === false && host.environment.CI === true, 'Phase host/runtime provenance differs');
  requireThat(calibration?.iterations === 1000 && calibration.active_observer_path === true && calibration.span_count === 1000
    && same(summary.calibration, calibration) && ['total_elapsed_ms', 'min_ms', 'p50_ms', 'p95_ms', 'max_ms'].every(key => Number.isFinite(calibration[key]) && calibration[key] >= 0), 'Active observer calibration is missing or incoherent');
  requireThat(summary.artifact_writes?.includes_current_write === false && Number.isSafeInteger(summary.artifact_writes.count)
    && summary.artifact_writes.count > 0 && summary.artifact_writes.failed === 0 && Number.isFinite(summary.artifact_writes.wall_ms)
    && summary.artifact_writes.wall_ms >= 0, 'Artifact-write overhead boundary is missing');
  for (let index = 0; index < 3; index++) {
    const record = rawCases[index], brief = summary.cases[index];
    requireThat(record?.framework === FRAMEWORKS[index] && record.ordinal === index + 1 && provenance(record)
      && brief.framework === record.framework && brief.ordinal === record.ordinal && brief.artifact === caseArtifact(index)
      && record.span_cap_reached === false && brief.span_cap_reached === false && record.guards_preserved === true && brief.guards_preserved === true
      && record.errors?.length === 0 && Array.isArray(record.pending) && Array.isArray(record.spans)
      && record.spans.length === record.span_count && record.span_count <= LIMITS.spans
      && record.span_count === brief.span_count && same(record.pending, brief.pending)
      && Number.isFinite(record.observation_elapsed_ms) && record.observation_elapsed_ms >= 0
      && record.observation_elapsed_ms === brief.observation_elapsed_ms && record.requests === brief.requests
      && ['user', 'system'].every(key => Number.isFinite(record.cpu_usage_us?.[key]) && record.cpu_usage_us[key] >= 0) && record.memory?.rss > 0
      && ['native_guards_before', 'native_guards_after'].every(key => GUARDS.every(guard => record[key]?.[guard] === true)), 'Phase case/source/guard accounting differs');
  }
  return {predecessors_settled: rawCases.slice(0, 2).every(record => record.pending.length === 0),
    observed_cutoff: 'Diagnostic afterEach observation, including fixture hooks; not the exact Jest body deadline'};
}

// Spawn only this owned Linux group; the injected primitives support unit tests without a real child.
function runChild(args, cwd, env, deadline, {spawnProcess = spawn, signal = (pid, kind) => process.kill(pid, kind),
  schedule = setTimeout, cancel = clearTimeout, now = Date.now, platform = process.platform,
  watchdogMs = LIMITS.childMs, graceMs = LIMITS.graceMs} = {}) {
  requireThat(platform === 'linux', 'Owned process-group execution requires Linux');
  const timeout = Math.min(childBudget(deadline, now()), watchdogMs);
  requireThat(Number.isInteger(timeout) && timeout > 0 && watchdogMs <= LIMITS.childMs
    && Number.isInteger(graceMs) && graceMs > 0 && graceMs <= LIMITS.graceMs, 'Child watchdog/grace may only be reduced');
  return new Promise(resolve => {
    const started = now(), chunks = {stdout: [], stderr: []}, bytes = {stdout: 0, stderr: 0};
    let child, watchdog, killer, closed, error = null, hardFailure = null, owned = false, killSent = false, finished = false;
    const finish = () => {
      if (finished) return; finished = true; cancel(watchdog); cancel(killer);
      resolve({pid: owned ? child.pid : null, status: closed?.status ?? null, signal: closed?.signal ?? null, error,
        hard_failure: hardFailure, kill_sent: killSent, elapsed_ms: now() - started, child_timeout_ms: timeout,
        stdout: Buffer.concat(chunks.stdout), stderr: Buffer.concat(chunks.stderr), output_bytes: bytes});
    };
    const signalOwned = kind => { try { signal(-child.pid, kind); return true; } catch (failure) { if (failure.code !== 'ESRCH') error = failure.code || failure.message; return false; } };
    const stop = reason => {
      if (hardFailure || finished) return; hardFailure = reason;
      if (!owned) { finish(); return; }
      signalOwned('SIGTERM');
      killer = schedule(() => { killSent = signalOwned('SIGKILL'); finish(); }, graceMs);
    };
    try { child = spawnProcess(process.execPath, args, {cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']}); }
    catch (failure) { error = failure.code || failure.message; finish(); return; }
    owned = Number.isSafeInteger(child.pid) && child.pid > 1 && child.pid !== process.pid;
    child.on('error', failure => { error = failure.code || failure.message; if (owned) stop('Owned child process failed'); else finish(); });
    child.on('close', (status, childSignal) => { closed = {status, signal: childSignal}; if (!hardFailure) finish(); });
    if (!owned) { error = 'Invalid owned child PID'; finish(); return; }
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', value => {
        if (finished) return; const data = Buffer.from(value), room = Math.max(0, LIMITS.outputBytes - bytes[name]);
        if (room) chunks[name].push(data.subarray(0, room)); bytes[name] += data.length;
        if (bytes[name] > LIMITS.outputBytes) stop('Child output cap exceeded');
      });
      child[name].on('error', () => stop('Child ' + name + ' capture failed'));
    }
    watchdog = schedule(() => stop('Child wall watchdog exceeded'), timeout);
  });
}
function artifactIndex(directory) {
  return Object.fromEntries(fs.readdirSync(directory).filter(name => name !== 'artifact-index.json' && fs.lstatSync(path.join(directory, name)).isFile())
    .sort().map(name => { const bytes = fs.readFileSync(path.join(directory, name)); return [name, {bytes: bytes.length, sha256: hash(bytes)}]; }));
}
async function run(output, frontend = process.cwd(), {environment = process.env, runtime = observedRuntime(), prove = applicationProof,
  launch = runChild, argumentsFor = diagnosticArguments} = {}) {
  requireThat(typeof output === 'string' && path.isAbsolute(output), 'An explicit absolute artifact directory is required');
  const root = path.resolve(frontend, '..'), relative = path.relative(root, output);
  requireThat(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Artifacts must be outside the original checkout');
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'workload-claim.json'), JSON.stringify({attempt: environment.GITHUB_RUN_ATTEMPT, qualification: false}), {flag: 'wx'});
  const directory = fs.mkdtempSync(path.join(output, 'run-'));
  let deadline = null;
  const env = baseEnvironment(environment, directory, runtime.execPath, runtime.platform);
  const receipt = {version: 1, diagnostic_only: true, qualification: false, application_baseline_sha: BASELINE,
    observed_source_sha: env.GITHUB_SHA || null, limits: LIMITS, capture_valid: false, workload_started: false,
    environment: {CI: env.CI === 'true', timezone: runtime.timezone, TZ: env.TZ === undefined ? 'unset' : env.TZ === 'UTC' ? 'UTC' : 'other',
      lifecycle_years: env.FRAMEWORK_LIFECYCLE_YEARS, synthetic_exports: !!env.FRAMEWORK_LIFECYCLE_EXPORT_DIR, phase_logging: !!env.ISO_PHASE_LOG_DIR, node_options: !!env.NODE_OPTIONS}};
  try {
    verifyPreflight(runtime, env);
    deadline = diagnosticDeadline(env);
    receipt.deadline_ms = deadline;receipt.remaining_when_driver_started_ms = deadline - Date.now();
    receipt.source_before = prove(root, env, deadline);
    const args = argumentsFor(frontend, directory); receipt.arguments = args;
    receipt.remaining_before_launch_ms = deadline - Date.now();
    requireThat(childBudget(deadline) === LIMITS.childMs, 'Insufficient remaining budget for the one bounded child');
    receipt.workload_started = true;
    const execution = await launch(args, frontend, env, deadline);
    fs.writeFileSync(path.join(directory, 'stdout.log'), execution.stdout); fs.writeFileSync(path.join(directory, 'stderr.log'), execution.stderr);
    const {stdout, stderr, ...metadata} = execution; receipt.execution = metadata;
    writeJSON(path.join(directory, 'process-output.json'), metadata);
    const actualRuntime = readJSON(path.join(directory, 'runtime.json')), result = readJSON(path.join(directory, 'jest.json'));
    receipt.outcome = verifySequence(actualRuntime, result, execution, env, runtime);
    const observer = verifyObserver(readJSON(path.join(directory, 'iso-phase-summary.json')), FRAMEWORKS.map((_, index) => readJSON(path.join(directory, caseArtifact(index)))),
      readJSON(path.join(directory, 'iso-phase-host.json')), readJSON(path.join(directory, 'observer-calibration.json')), actualRuntime, env);
    receipt.capture_valid = true; receipt.observation = observer;
    receipt.iso_attribution_valid = receipt.outcome.predecessors_passed && observer.predecessors_settled && !receipt.outcome.iso_failure_outside_deadline;
  } catch (error) { receipt.stop_reason = error.message; receipt.capture_valid = false; receipt.iso_attribution_valid = false; }
  finally {
    if (receipt.source_before) {
      try { receipt.source_after = prove(root, env, deadline); requireThat(same(receipt.source_before, receipt.source_after), 'Source or harness changed during observation'); }
      catch (error) { receipt.source_error = error.message; receipt.capture_valid = false; receipt.iso_attribution_valid = false; }
    }
    receipt.passed = receipt.capture_valid && receipt.outcome?.original_tests_passed === true;
    writeJSON(path.join(directory, 'diagnostic-receipt.json'), receipt);
    writeJSON(path.join(directory, 'artifact-index.json'), {includes_current_index: false, files: artifactIndex(directory)});
    writeJSON(path.join(output, 'latest.json'), {directory, passed: receipt.passed, capture_valid: receipt.capture_valid, qualification: false});
  }
  console.log(JSON.stringify({directory, passed: receipt.passed, capture_valid: receipt.capture_valid, qualification: false}));
  return receipt.passed ? 0 : 1;
}
if (require.main === module) run(process.argv[2]).then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
module.exports = {BASELINE, LIFECYCLE, LIFECYCLE_BLOB, ALLOWED, PROTECTED, PINNED, INPUTS, FRAMEWORKS, CASES, GUARDS, LIMITS,
  verifyPreflight, childBudget, diagnosticDeadline, baseEnvironment, applicationProof, diagnosticArguments, verifySequence, verifyObserver, runChild, artifactIndex, run};
