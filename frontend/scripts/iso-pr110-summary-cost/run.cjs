// One diagnostic-only execution; no normal release receipt; only the declared diagnostic in-memory call-site transformation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const {createArtifactWriter} = require('./artifact-writer.cjs');
const {preflightArguments, parseConfiguration, verifyConfigurations} = require('./config-preflight.cjs');

const BASELINE = '2303f958dd0fd8e02881aab3bbd7ac82450be469';
const LIFECYCLE = 'frontend/src/preview/frameworkFiveYear.test.js';
const LIFECYCLE_BLOB = 'f044a5166f02d5c5a7884a753b04ee23e5a0ea8c';
const DIRECTORY = 'frontend/scripts/iso-pr110-summary-cost';
const SCRIPTS = ['run.cjs', 'run.test.cjs', 'observer.cjs', 'observer.test.cjs', 'setup.cjs', 'setup.test.cjs', 'runtime-reporter.cjs',
  'artifact-writer.cjs', 'artifact-writer.test.cjs', 'transform.cjs', 'transform.test.cjs', 'diagnostic-craco.config.cjs', 'config-preflight.cjs', 'config-preflight.test.cjs'];
const ALLOWED = new Set([...SCRIPTS.map(name => DIRECTORY + '/' + name), '.github/workflows/iso-pr110-summary-cost.yml']);
const PROTECTED = ['frontend/src', 'backend', 'shared', 'frontend/package.json', 'frontend/yarn.lock', 'frontend/craco.config.js',
  'frontend/scripts/frontend-campaign.cjs', '.github/workflows/release-verification.yml'];
const PINNED = {'frontend/src': 'ba7daadf5dcf7378b308d4d354b4f4d1292a3f33', backend: 'a05953d94eafee906d2a4a2bc5c6216a5460947e',
  shared: '8aaa93325109a205dfb995575fb7b6304bfe12c2', 'frontend/package.json': '8721741ae68fc55c18769d6294ff546b8a0b2dca',
  'frontend/yarn.lock': 'e128418a0556bf7e325db7abe13a37f183112c1a', 'frontend/craco.config.js': '900a5569c0e5dcf5e657cebe9be44cd344d75810',
  'frontend/scripts/frontend-campaign.cjs': 'b1a29f57fa5f19ae1e8533a7fcb405de3f0991da',
  '.github/workflows/release-verification.yml': '9ad48f30bd20f230af7c892a5b057bf306e919dc'};
const INPUTS = [LIFECYCLE, 'frontend/src/setupTests.js', 'shared/contracts/program-lifecycle.json',
  ...['commandTestAdapter.js', 'adapter.js', 'store.js', 'demoStorageCodec.js', 'portfolioReporting.js', 'evidenceStorage.js'].map(name => 'frontend/src/preview/' + name)];
const FRAMEWORKS = ['cis-ig1', 'soc-2', 'iso-27001'];
const CASES = FRAMEWORKS.map(key => key + ' fresh client retains the configured program lifecycle and period evidence');
const GUARDS = ['parse', 'stringify', 'keys', 'getItem', 'canFork', 'observerBinding', 'moduleLoaded'];
const LIMITS = Object.freeze({driverMs: 12 * 60000, childMs: 10 * 60000, graceMs: 2000, outputBytes: 256 * 1024,
  callsPerCase: 16384, maxDepth: 16, caseBytes: 3 * 1024 * 1024, liveBytes: 16 * 1024,
  artifactBytes: 12 * 1024 * 1024, footerBytes: 64 * 1024});
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const caseArtifact = index => 'summary-cost-case-' + String(index + 1).padStart(2, '0') + '-' + FRAMEWORKS[index] + '.json';

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
  const raw = environment.ISO_SUMMARY_COST_DEADLINE_MS, deadline = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  requireThat(Number.isSafeInteger(deadline) && deadline > now && deadline - now <= LIMITS.driverMs,
    'Missing, unsafe or expired first-step diagnostic deadline');
  return deadline;
}
function baseEnvironment(environment, output, executable = process.execPath, platform = process.platform) {
  for (const key of ['NODE_OPTIONS', 'ISO_PHASE_LOG_DIR', 'ISO_PHASE_APP_SHA', 'ISO_DIAGNOSTIC_DEADLINE_MS',
    'REPORTING_PREP_LOG_DIR', 'REPORTING_PREP_INSTRUMENTATION_PATH', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR', 'ISO_TWO_POINT_OUTPUT', 'ISO_TWO_POINT_APP_SHA']) {
    requireThat(!environment[key], 'Unexpected inherited test configuration: ' + key);
  }
  requireThat(environment.FRAMEWORK_LIFECYCLE_YEARS === undefined || environment.FRAMEWORK_LIFECYCLE_YEARS === '5',
    'Unexpected inherited lifecycle duration');
  requireThat(environment.ISO_SUMMARY_COST_APP_SHA === undefined || environment.ISO_SUMMARY_COST_APP_SHA === BASELINE,
    'Unexpected inherited application baseline');
  requireThat(environment.ISO_SUMMARY_COST_EXPECTED_EXEC_PATH === undefined || environment.ISO_SUMMARY_COST_EXPECTED_EXEC_PATH === ''
    || environment.ISO_SUMMARY_COST_EXPECTED_EXEC_PATH === executable, 'Unexpected inherited expected executable path');
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const keys = Object.keys(environment).filter(key => platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH').sort();
  const inherited = environment[keys[0]], env = {...environment, CI: 'true', FRAMEWORK_LIFECYCLE_YEARS: '5',
    ISO_SUMMARY_COST_OUTPUT: output, ISO_SUMMARY_COST_APP_SHA: BASELINE, ISO_SUMMARY_COST_EXPECTED_EXEC_PATH: executable,
    FRONTEND_RUNTIME_RECEIPT: path.join(output, 'runtime.json')};
  for (const key of keys) delete env[key];
  env[keys[0] || 'PATH'] = paths.dirname(executable) + (inherited ? paths.delimiter + inherited : '');
  // Observe the managed runner's actual UTC timezone; do not replace an already-UTC clock.
  for (const key of ['NODE_OPTIONS', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR', 'ISO_PHASE_LOG_DIR', 'ISO_PHASE_APP_SHA', 'ISO_DIAGNOSTIC_DEADLINE_MS',
    'REPORTING_PREP_LOG_DIR', 'REPORTING_PREP_INSTRUMENTATION_PATH']) delete env[key];
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
  return [runner, 'test', '--config', path.join(frontend, 'scripts/iso-pr110-summary-cost/diagnostic-craco.config.cjs'), '--watchAll=false', '--runInBand', '--runTestsByPath', 'src/preview/frameworkFiveYear.test.js',
    '--json', '--outputFile=' + path.join(output, 'jest.json'), '--reporters=default',
    '--reporters=' + path.join(frontend, 'scripts/iso-pr110-summary-cost/runtime-reporter.cjs'),
    '--setupFilesAfterEnv', path.join(frontend, 'src/setupTests.js'), path.join(frontend, 'scripts/iso-pr110-summary-cost/setup.cjs')];
}
function verifySequence(runtime, result, execution, environment, expected = observedRuntime()) {
  requireThat(runtime?.completed === true && runtime.diagnostic_only === true && runtime.qualification === false
    && runtime.node === 'v22.23.4' && runtime.node === expected.node
    && runtime.execPath === expected.execPath && runtime.platform === 'linux' && runtime.arch === 'x64' && runtime.timezone === 'UTC'
    && Number.isSafeInteger(runtime.pid) && runtime.pid > 1 && typeof runtime.v8 === 'string'
    && Number.isSafeInteger(execution.pid) && execution.pid > 1 && Number.isSafeInteger(runtime.process_group_id)
    && runtime.process_group_id === execution.pid, 'Actual Jest runtime is incomplete, mismatched or outside the owned process group');
  requireThat(runtime.source_sha === environment.GITHUB_SHA && runtime.application_baseline === BASELINE
    && runtime.lifecycle_years === '5' && runtime.synthetic_exports === false && runtime.summary_cost_logging === true
    && runtime.phase_logging !== true, 'Actual Jest source or workload flags differ');
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
    && execution.status === (allPassed ? 0 : 1) && !execution.hard_failure && !execution.error && !execution.signal, 'Child/Jest outcome or accounting differs');
  requireThat(['user', 'system'].every(key => Number.isFinite(runtime.cpu_usage_us?.[key]) && runtime.cpu_usage_us[key] >= 0)
    && Number.isFinite(runtime.elapsed_ms) && runtime.elapsed_ms >= 0 && runtime.resource_usage?.maxRSS > 0 && runtime.memory_usage?.rss > 0,
  'Actual Jest resource observations are incomplete');
  const predecessorsPassed = cases.slice(0, 2).every(row => row.status === 'passed');
  const censored = cases[2].status === 'failed' && cases[2].failureMessages?.some(message => /Exceeded timeout of 180000 ms for a test/.test(message));
  return {original_tests_passed: allPassed, predecessors_passed: predecessorsPassed, censored_iso: !!censored,
    iso_failure_outside_deadline: cases[2].status === 'failed' && !censored, cases: runtime.cases, qualification: false};
}
function verifyObserver(summary, rawCases, host, calibration, runtime, environment, transform, expectedTransformHash, configurationProof) {
  const good = value => value?.application_baseline_sha === BASELINE && value.observed_source_sha === environment.GITHUB_SHA;
  const nonnegative = value => Number.isFinite(value) && value >= 0;
  requireThat(summary?.complete === true && summary.diagnostic_valid === true && good(summary)
    && summary.diagnostic_only === true && summary.qualification === false && summary.errors?.length === 0
    && summary.loaded_count === 1 && summary.out_of_case_calls === 0
    && same(summary.cases?.map(row => row.framework), FRAMEWORKS) && rawCases.length === 3,
  'Summary-cost capture is incomplete, errored or capped');
  requireThat(host?.node === runtime.node && host.exec_path === runtime.execPath && host.actual_jest_pid === runtime.pid
    && host.platform === 'linux' && host.arch === 'x64' && host.timezone === 'UTC' && good(host)
    && host.profiler_enabled === false && host.gc_forced === false && host.max_calls === LIMITS.callsPerCase
    && host.max_depth === LIMITS.maxDepth && host.environment?.export_enabled === false
    && host.environment?.lifecycle_years === '5' && host.environment?.CI === true,
  'Summary-cost actual host/runtime provenance differs');
  requireThat(calibration?.valid === true && same(summary.calibration, calibration)
    && calibration.blocks?.length === 5 && calibration.blocks.every(block => block.iterations === 1000
      && block.unobserved_count === 1000 && block.observed_count === 1000 && nonnegative(block.unobserved_ms)
      && nonnegative(block.observed_ms) && block.unobserved_ms <= 50 && block.observed_ms <= 50 && block.observer_valid === true)
    && calibration.io?.writes === 8 && calibration.io.bytes === 32768 && nonnegative(calibration.io.elapsed_ms)
    && calibration.io.elapsed_ms <= 50, 'Summary-cost overhead calibration differs');
  requireThat(transform?.source_sha256 === '85547886be517c229959d413cea383c8e57987db39d13787f973b522b351a730'
    && transform.observed_source_sha === environment.GITHUB_SHA && transform.matches === 1
    && transform.diagnostic_only === true && transform.qualification === false && good(transform)
    && transform.actual_transform_pid === runtime.pid && transform.source_map_preserved === true && transform.original_sources_content_preserved === true
    && transform.target === 'frontend/src/preview/portfolioReporting.js'
    && ['generated_code_sha256','source_map_sha256','harness_sha256','stock_transform_sha256'].every(key => /^[a-f0-9]{64}$/.test(transform[key] || ''))
    && transform.harness_sha256 === expectedTransformHash
    && transform.native_route_sha256 === configurationProof?.source_files?.approved_transform?.sha256
    && transform.native_factory_sha256 === configurationProof?.source_files?.babel_transform_factory?.sha256
    && transform.native_route === '@craco/craco/dist/lib/features/jest/jest-babel-transform'
    && transform.native_factory === '@craco/craco/dist/lib/features/jest/create-jest-babel-transform'
    && transform.config_control?.consumed_pairs === 1 && transform.config_control.removed_argument_count === 2
    && ['parsed_config_matches','other_arguments_unchanged','general_route_matches'].every(key => transform.config_control[key] === true)
    && summary.loaded_source_sha256 === transform.source_sha256,
  'Diagnostic transform and actual module-loaded handshake differ');
  requireThat(summary.artifact_writes?.failed === 0 && summary.artifact_writes?.count > 0
    && summary.artifact_writes?.includes_current_write === false && nonnegative(summary.artifact_writes.wall_ms),
  'Artifact-write overhead boundary is missing');
  for (let index = 0; index < 3; index++) {
    const row = rawCases[index], brief = summary.cases[index];
    requireThat(row?.framework === FRAMEWORKS[index] && row.ordinal === index + 1 && good(row)
      && row.guards_preserved === true && brief.guards_preserved === true
      && row.stopped === false && row.call_cap_reached === false && row.depth_cap_reached === false
      && row.errors?.length === 0 && Array.isArray(row.calls) && row.calls.length > 0
      && row.calls.length <= LIMITS.callsPerCase && row.calls.length === row.totals?.started
      && row.totals.retained === row.calls.length && row.totals.pending === 0
      && row.totals.returned + row.totals.threw === row.totals.started
      && nonnegative(row.observation_elapsed_ms) && brief.call_count === row.calls.length
      && ['native_guards_before','native_guards_after'].every(key => GUARDS.every(guard => row[key]?.[guard] === true)),
    'Summary-cost case counts, source or guard accounting differs');
    requireThat(row.calls.every((call, i) => call.i === i + 1 && nonnegative(call.s) && nonnegative(call.e)
      && call.e >= call.s && call.e <= row.observation_elapsed_ms && ['returned','threw'].includes(call.o)
      && Number.isSafeInteger(call.d) && call.d > 0 && call.d <= LIMITS.maxDepth
      && (call.d === 1 ? call.p === null : Number.isSafeInteger(call.p) && call.p > 0 && call.p < call.i)),
    'Summary-cost call timing/outcome/nesting accounting differs');
    requireThat(row.calls.filter(call => call.o === 'returned').length === row.totals.returned
      && row.calls.filter(call => call.o === 'threw').length === row.totals.threw
      && row.samples?.length >= 2 && row.samples.length <= 128
      && row.samples.every(sample => nonnegative(sample.elapsed_ms) && sample.memory?.rss > 0)
      && row.memory?.rss > 0 && ['user','system'].every(key => nonnegative(row.cpu_usage_us?.[key])),
    'Summary-cost resource or outcome totals differ');
  }
  return {predecessors_settled: rawCases.slice(0,2).every(row => row.totals.pending === 0),
    observed_cutoff: 'BeforeEach through afterEach including fixtures, not exact body deadline; spans include nested work and observer boundary overhead'};
}

function artifactLimits(directory, reserve = LIMITS.footerBytes, budgetRoot = directory) {
  const root = path.resolve(budgetRoot), target = path.resolve(directory);
  requireThat((target === root || path.dirname(target) === root)
    && Number.isSafeInteger(reserve) && reserve >= 0 && reserve <= LIMITS.footerBytes, 'Invalid artifact budget boundary');
  const rootStat = fs.lstatSync(root);
  requireThat(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'Artifact budget root must be an ordinary directory');
  let total = 0, children = 0;
  const scan = (folder, depth) => {
    for (const name of fs.readdirSync(folder)) {
      const file = path.join(folder, name), stat = fs.lstatSync(file);
      requireThat(!stat.isSymbolicLink(), 'Artifacts must not be symbolic links: ' + name);
      if (stat.isDirectory()) {
        requireThat(depth === 0, 'Artifacts must not contain deeper directories: ' + name);
        requireThat(++children === 1 && (target === root || file === target), 'Artifacts must contain only the owned run directory');
        scan(file, 1);continue;
      }
      requireThat(stat.isFile() && Number.isSafeInteger(stat.size) && stat.size >= 0, 'Artifacts must be ordinary files: ' + name);
      if (/^summary-cost-case-\d+-/.test(name)) requireThat(stat.size <= LIMITS.caseBytes, 'Case artifact cap exceeded: ' + name);
      if (name === 'summary-cost-live.json') requireThat(stat.size <= LIMITS.liveBytes, 'Live artifact cap exceeded');
      total += stat.size;requireThat(Number.isSafeInteger(total), 'Total artifact cap exceeded');
    }
  };
  scan(root, 0);
  requireThat(total <= LIMITS.artifactBytes - reserve, 'Total artifact cap exceeded');
  return total;
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
function artifactIndex(directory, budgetRoot = directory) {
  artifactLimits(directory, 0, budgetRoot);
  return Object.fromEntries(fs.readdirSync(directory).filter(name => name !== 'artifact-index.json' && fs.lstatSync(path.join(directory, name)).isFile())
    .sort().map(name => { const bytes = fs.readFileSync(path.join(directory, name)); return [name, {bytes: bytes.length, sha256: hash(bytes)}]; }));
}
async function run(output, frontend = process.cwd(), {environment = process.env, runtime = observedRuntime(), prove = applicationProof,
  launch = runChild, argumentsFor = diagnosticArguments,
  construct = (args, cwd, env, deadline) => runChild(args, cwd, env, deadline, {watchdogMs: 30000}),
  validateConfiguration = verifyConfigurations, configurationArguments = preflightArguments} = {}) {
  requireThat(typeof output === 'string' && path.isAbsolute(output), 'An explicit absolute artifact directory is required');
  const root = path.resolve(frontend, '..'), relative = path.relative(root, output);
  requireThat(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Artifacts must be outside the original checkout');
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'workload-claim.json'), JSON.stringify({attempt: environment.GITHUB_RUN_ATTEMPT, qualification: false}), {flag: 'wx'});
  const directory = fs.mkdtempSync(path.join(output, 'run-'));
  let deadline = null, env = environment;
  const writerErrors = [], writerError = code => {if (!writerErrors.includes(code)) writerErrors.push(code);};
  const write = createArtifactWriter(directory, writerError, fs, {budgetRoot: output});
  const outerWrite = createArtifactWriter(output, writerError, fs, {budgetRoot: output});
  let receiptWritten = false, indexWritten = false, latestWritten = false;
  const receipt = {version: 1, diagnostic_only: true, qualification: false, application_baseline_sha: BASELINE,
    observed_source_sha: environment.GITHUB_SHA || null, limits: LIMITS, capture_valid: false, workload_started: false};
  try {
    receipt.artifact_bytes_before_preflight = artifactLimits(directory, LIMITS.footerBytes, output);
    env = baseEnvironment(environment, directory, runtime.execPath, runtime.platform);
    receipt.environment = {CI: env.CI === 'true', timezone: runtime.timezone,
      TZ: env.TZ === undefined ? 'unset' : env.TZ === 'UTC' ? 'UTC' : 'other', lifecycle_years: env.FRAMEWORK_LIFECYCLE_YEARS,
      synthetic_exports: !!env.FRAMEWORK_LIFECYCLE_EXPORT_DIR, summary_cost_logging: !!env.ISO_SUMMARY_COST_OUTPUT, node_options: !!env.NODE_OPTIONS};
    verifyPreflight(runtime, env);
    deadline = diagnosticDeadline(env);
    receipt.deadline_ms = deadline;receipt.remaining_when_driver_started_ms = deadline - Date.now();
    receipt.source_before = prove(root, env, deadline);
    receipt.configuration_preflight = [];
    const configurations = [];
    for (const diagnostic of [false, true]) {
      const name = diagnostic ? 'diagnostic' : 'baseline', configArgs = configurationArguments(frontend, diagnostic);
      const execution = await construct(configArgs, frontend, env, deadline);
      const {stdout, stderr, ...metadata} = execution;
      requireThat(Buffer.isBuffer(stdout) && Buffer.isBuffer(stderr) && stdout.length <= LIMITS.outputBytes
        && stderr.length <= LIMITS.outputBytes, 'Configuration output is missing or oversized');
      requireThat(write.checkBudget(stdout.length + stderr.length), 'Configuration output exceeds artifact budget');
      fs.writeFileSync(path.join(directory, 'config-' + name + '-stdout.log'), stdout, {flag: 'wx'});
      fs.writeFileSync(path.join(directory, 'config-' + name + '-stderr.log'), stderr, {flag: 'wx'});
      receipt.configuration_preflight.push({configuration_only: true, name, arguments: configArgs, ...metadata});
      requireThat(execution.status === 0 && !execution.signal && !execution.error && !execution.hard_failure,
        'Actual CRACO configuration construction failed: ' + name);
      configurations.push(parseConfiguration(stdout.toString('utf8')));
    }
    const configurationProof = validateConfiguration(configurations[0], configurations[1], frontend);
    requireThat(configurationProof?.valid === true, 'Actual configuration comparison did not pass');
    requireThat(write('configuration-proof.json', {diagnostic_only: true, qualification: false,
      application_baseline_sha: BASELINE, observed_source_sha: environment.GITHUB_SHA, ...configurationProof},
      {maxBytes: LIMITS.footerBytes}), 'Configuration proof could not be preserved');
    receipt.configuration_valid = true;
    const args = argumentsFor(frontend, directory); receipt.arguments = args;
    receipt.remaining_before_launch_ms = deadline - Date.now();
    requireThat(childBudget(deadline) === LIMITS.childMs, 'Insufficient remaining budget for the one bounded child');
    receipt.workload_started = true;
    const execution = await launch(args, frontend, env, deadline);
    requireThat(Buffer.isBuffer(execution.stdout) && Buffer.isBuffer(execution.stderr)
      && execution.stdout.length <= LIMITS.outputBytes && execution.stderr.length <= LIMITS.outputBytes, 'Bounded child output is missing or oversized');
    requireThat(write.checkBudget(execution.stdout.length + execution.stderr.length), 'Artifact budget cannot retain child output');
    fs.writeFileSync(path.join(directory, 'stdout.log'), execution.stdout, {flag: 'wx'});
    fs.writeFileSync(path.join(directory, 'stderr.log'), execution.stderr, {flag: 'wx'});
    const {stdout, stderr, ...metadata} = execution; receipt.execution = metadata;
    requireThat(write('process-output.json', metadata), 'Process-output artifact could not be retained');
    receipt.artifact_bytes_before_validation = artifactLimits(directory, LIMITS.footerBytes, output);
    const actualRuntime = readJSON(path.join(directory, 'runtime.json')), result = readJSON(path.join(directory, 'jest.json'));
    receipt.outcome = verifySequence(actualRuntime, result, execution, env, runtime);
    const observer = verifyObserver(readJSON(path.join(directory, 'summary-cost-summary.json')), FRAMEWORKS.map((_, index) => readJSON(path.join(directory, caseArtifact(index)))),
      readJSON(path.join(directory, 'summary-cost-host.json')), readJSON(path.join(directory, 'overhead-calibration.json')), actualRuntime, env,
      readJSON(path.join(directory, 'transform-proof.json')), receipt.source_before.harness_sha256[DIRECTORY + '/transform.cjs'], configurationProof);
    receipt.capture_valid = true; receipt.observation = observer;
    receipt.iso_attribution_valid = receipt.outcome.predecessors_passed && observer.predecessors_settled && !receipt.outcome.iso_failure_outside_deadline;
  } catch (error) { receipt.stop_reason = error.message; receipt.capture_valid = false; receipt.iso_attribution_valid = false; }
  finally {
    if (receipt.source_before) {
      try { receipt.source_after = prove(root, env, deadline); requireThat(same(receipt.source_before, receipt.source_after), 'Source or harness changed during observation'); }
      catch (error) { receipt.source_error = error.message; receipt.capture_valid = false; receipt.iso_attribution_valid = false; }
    }
    try { artifactLimits(directory, LIMITS.footerBytes, output);requireThat(write.stats().failed === 0, 'Driver artifact capture failed'); }
    catch (error) { receipt.artifact_error = error.message;receipt.capture_valid = false;receipt.iso_attribution_valid = false; }
    receipt.passed = receipt.capture_valid && receipt.iso_attribution_valid === true && receipt.outcome?.original_tests_passed === true;
    receipt.driver_artifact_writes = write.stats();receipt.driver_artifact_errors = [...writerErrors];
    receiptWritten = write('diagnostic-receipt.json', receipt, {maxBytes: LIMITS.footerBytes, final: true});
    try {
      if (receiptWritten) indexWritten = write('artifact-index.json', {includes_current_index: false, files: artifactIndex(directory, output)}, {maxBytes: LIMITS.footerBytes, final: true});
    } catch { if (!writerErrors.includes('artifact-index-failed')) writerErrors.push('artifact-index-failed'); }
    if (!receiptWritten || !indexWritten) {receipt.passed = false;receipt.capture_valid = false;}
    // A native/Jest file cap violation is detected, never "repaired" by trimming its raw evidence.
    latestWritten = outerWrite('latest.json', {directory, passed: receipt.passed, capture_valid: receipt.capture_valid,
      qualification: false, receipt_written: receiptWritten, index_written: indexWritten, artifact_errors: [...writerErrors]},
    {maxBytes: LIMITS.footerBytes, final: true});
    if (!latestWritten) {receipt.passed = false;receipt.capture_valid = false;}
  }
  console.log(JSON.stringify({directory, passed: receipt.passed, capture_valid: receipt.capture_valid, qualification: false,
    receipt_written: receiptWritten, index_written: indexWritten, latest_written: latestWritten,
    stop_reason: receipt.stop_reason || receipt.artifact_error || writerErrors[0] || null, artifact_errors: [...writerErrors]}));
  return receipt.passed ? 0 : 1;
}
if (require.main === module) run(process.argv[2] || process.env.ISO_SUMMARY_COST_OUTPUT).then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
module.exports = {BASELINE, LIFECYCLE, LIFECYCLE_BLOB, ALLOWED, PROTECTED, PINNED, INPUTS, FRAMEWORKS, CASES, GUARDS, LIMITS,
  verifyPreflight, childBudget, diagnosticDeadline, baseEnvironment, applicationProof, diagnosticArguments, verifySequence, verifyObserver, runChild, artifactLimits, artifactIndex, run};
