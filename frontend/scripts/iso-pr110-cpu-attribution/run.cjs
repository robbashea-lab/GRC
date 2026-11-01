// One diagnostic-only CPU capture. No application transform, qualification or release receipt.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const {validateProfiles} = require('./profile-validation.cjs');

const BASELINE = '2303f958dd0fd8e02881aab3bbd7ac82450be469';
const DIRECTORY = 'frontend/scripts/iso-pr110-cpu-attribution';
const FILES = ['run.cjs', 'run.test.cjs', 'runtime-reporter.cjs', 'runtime-reporter.test.cjs', 'profile-validation.cjs', 'profile-validation.test.cjs'];
const ALLOWED = [...FILES.map(name => DIRECTORY + '/' + name), '.github/workflows/iso-pr110-cpu-attribution.yml'];
const PROTECTED = ['frontend/src', 'backend', 'shared', 'frontend/package.json', 'frontend/yarn.lock', 'frontend/craco.config.js',
  'frontend/scripts/frontend-campaign.cjs', '.github/workflows/release-verification.yml'];
const LIFECYCLE = 'frontend/src/preview/frameworkFiveYear.test.js';
const LIFECYCLE_BLOB = 'f044a5166f02d5c5a7884a753b04ee23e5a0ea8c';
const SOURCE_TREE = 'ba7daadf5dcf7378b308d4d354b4f4d1292a3f33';
const FRAMEWORKS = ['cis-ig1', 'soc-2', 'iso-27001'];
const CASES = FRAMEWORKS.map(key => key + ' fresh client retains the configured program lifecycle and period evidence');
const LIMITS = Object.freeze({workMs: 720000, childMs: 600000, configMs: 30000, graceMs: 2000,
  outputBytes: 256 * 1024, metadataBytes: 64 * 1024, profileBytes: 8 * 1024 * 1024, totalBytes: 12 * 1024 * 1024});
const requireThat = (condition, message) => { if (!condition) throw Error(message); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function runtime() {
  return {node: process.version, execPath: process.execPath, platform: process.platform, arch: process.arch,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone};
}
function deadlineFor(environment, now = Date.now()) {
  const value = environment.CPU_ATTRIBUTION_DEADLINE_MS;
  const deadline = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  requireThat(Number.isSafeInteger(deadline) && deadline > now && deadline - now <= LIMITS.workMs, 'Missing or expired first-step work deadline');
  return deadline;
}
function verifyAdmission(actual, environment) {
  requireThat(actual.node === 'v22.23.4' && actual.platform === 'linux' && actual.arch === 'x64'
    && actual.timezone === 'UTC' && path.isAbsolute(actual.execPath), 'Actual Linux/x64 Node22.23.4 UTC is required');
  requireThat(environment.GITHUB_RUN_ATTEMPT === '1' && /^[a-f0-9]{40}$/.test(environment.GITHUB_SHA || ''), 'Only attempt1 at an exact diagnostic revision is admitted');
}
function environmentFor(environment, output, actual) {
  const forbidden = ['NODE_OPTIONS', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR', 'ISO_PHASE_LOG_DIR', 'ISO_PHASE_APP_SHA',
    'ISO_DIAGNOSTIC_DEADLINE_MS', 'REPORTING_PREP_LOG_DIR', 'REPORTING_PREP_INSTRUMENTATION_PATH',
    'ISO_TWO_POINT_OUTPUT', 'ISO_TWO_POINT_APP_SHA', 'ISO_SUMMARY_COST_OUTPUT', 'ISO_SUMMARY_COST_APP_SHA'];
  for (const key of forbidden) requireThat(!environment[key], 'Unexpected inherited configuration: ' + key);
  requireThat(environment.FRAMEWORK_LIFECYCLE_YEARS === undefined || environment.FRAMEWORK_LIFECYCLE_YEARS === '5', 'Unexpected lifecycle length');
  const env = {...environment, CI: 'true', FRAMEWORK_LIFECYCLE_YEARS: '5', CPU_ATTRIBUTION_APP_SHA: BASELINE,
    CPU_ATTRIBUTION_SOURCE_SHA: environment.GITHUB_SHA, CPU_ATTRIBUTION_OUTPUT: output,
    CPU_ATTRIBUTION_PROFILE_DIR: output, CPU_ATTRIBUTION_EXPECTED_EXEC_PATH: actual.execPath};
  for (const key of forbidden) delete env[key];
  // The managed runner must already be UTC. Do not replace its clock or runtime.
  const paths = actual.platform === 'win32' ? path.win32 : path.posix;
  env.PATH = paths.dirname(actual.execPath) + paths.delimiter + (environment.PATH || '');
  return env;
}
function applicationProof(root, env, deadline, execute = spawnSync) {
  const query = args => {
    const remaining = deadline - Date.now(); requireThat(remaining > 0, 'Source-proof deadline exhausted');
    const result = execute('git', ['-C', root, ...args], {env, encoding: 'utf8', timeout: Math.min(60000, remaining), maxBuffer: 1024 * 1024, windowsHide: true});
    requireThat(result.status === 0 && !result.error, 'Git source proof failed');
    return result.stdout.trim();
  };
  const head = query(['rev-parse', 'HEAD']);
  requireThat(head === env.GITHUB_SHA, 'Checkout is not the exact diagnostic revision');
  requireThat(query(['status', '--porcelain', '--untracked-files=all']) === '', 'Diagnostic source checkout is not clean');
  query(['merge-base', '--is-ancestor', BASELINE, 'HEAD']);
  const changed = query(['diff', '--name-only', '-z', BASELINE, 'HEAD']).split('\0').filter(Boolean);
  requireThat(changed.length > 0 && changed.every(file => ALLOWED.includes(file)), 'Source changes exceed diagnostic allowlist');
  const objects = Object.fromEntries(PROTECTED.map(file => {
    const before = query(['rev-parse', BASELINE + ':' + file]), after = query(['rev-parse', 'HEAD:' + file]);
    requireThat(before === after, 'Protected source differs: ' + file);
    if (!['frontend/src', 'backend', 'shared'].includes(file)) {
      requireThat(query(['hash-object', file]) === before, 'Protected working-file bytes differ: ' + file);
    }
    return [file, after];
  }));
  requireThat(objects['frontend/src'] === SOURCE_TREE && query(['hash-object', LIFECYCLE]) === LIFECYCLE_BLOB, 'Original application/test bytes differ');
  const files = Object.fromEntries(ALLOWED.map(file => {
    const absolute = path.join(root, file), stat = fs.lstatSync(absolute);
    requireThat(stat.isFile() && !stat.isSymbolicLink(), 'Diagnostic files must be ordinary files');
    return [file, hash(fs.readFileSync(absolute))];
  }));
  return {head, application_baseline: BASELINE, changed_files: changed, protected_objects: objects, lifecycle_blob: LIFECYCLE_BLOB, harness_sha256: files};
}
function argumentsFor(frontend, output, {configuration = false, runner = require.resolve('@craco/craco/dist/bin/craco.js', {paths: [frontend]})} = {}) {
  const original = ['--watchAll=false', '--runInBand', '--runTestsByPath', 'src/preview/frameworkFiveYear.test.js'];
  if (configuration) return [runner, 'test', ...original, '--showConfig'];
  // CRACO forwards flags before `test` to its real inner Node/Jest process.
  return [runner, '--cpu-prof', '--cpu-prof-dir=' + output, '--cpu-prof-interval=10000', 'test', ...original,
    '--json', '--outputFile=' + path.join(output, 'jest.json'), '--reporters=default',
    '--reporters=' + path.join(frontend, 'scripts/iso-pr110-cpu-attribution/runtime-reporter.cjs')];
}
function verifyConfiguration(parsed, frontend, nativeTransform = require.resolve('@craco/craco/dist/lib/features/jest/jest-babel-transform', {paths: [frontend]})) {
  // Jest27 showConfig normalizes --runInBand to maxWorkers=1 and omits runInBand.
  requireThat(parsed?.configs?.length === 1 && parsed.globalConfig?.maxWorkers === 1 && parsed.globalConfig.runTestsByPath === true,
    'Admission requires one native in-band configuration');
  requireThat(same(parsed.globalConfig.nonFlagArgs, ['src/preview/frameworkFiveYear.test.js'])
    && parsed.globalConfig.collectCoverage === false && parsed.globalConfig.bail === 0
    && parsed.globalConfig.watchAll === false && parsed.globalConfig.passWithNoTests === false,
  'Original suite selection/normal execution configuration differs');
  const config = parsed.configs[0];
  requireThat(config.rootDir === frontend && config.roots?.length === 1 && config.roots[0] === path.join(frontend, 'src'), 'Native configuration roots differ');
  const route = config.transform?.filter(value => value[0] === '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$');
  requireThat(route?.length === 1 && route[0][1] === nativeTransform
    && config.transform.every(value => !value[1].includes('iso-pr110-')), 'Approved native transform route differs');
  requireThat(config.setupFilesAfterEnv?.length === 1 && config.setupFilesAfterEnv[0] === path.join(frontend, 'src/setupTests.js'), 'Original setup was changed');
  requireThat(config.testEnvironment?.endsWith(path.join('jest-environment-jsdom', 'build', 'index.js'))
    && config.globals?._cracoConfig?.jest?.configure && typeof config.name === 'string', 'Approved native CRACO/jsdom configuration is missing');
  const aliases = config.globals._cracoConfig.jest.configure.moduleNameMapper;
  requireThat(aliases && Object.keys(aliases).length > 0, 'Native aliases are missing');
  for (const [pattern, target] of Object.entries(aliases)) {
    const matches = config.moduleNameMapper?.filter(row => row[0] === pattern);
    requireThat(typeof target === 'string' && matches?.length === 1 && typeof matches[0][1] === 'string'
      && path.normalize(matches[0][1]) === path.normalize(target.replaceAll('<rootDir>', frontend)), 'Native alias differs: ' + pattern);
  }
  return {valid: true, native_transform: nativeTransform, configuration_sha256: hash(JSON.stringify(parsed)), original_setup: config.setupFilesAfterEnv,
    native_transform_sha256: hash(fs.readFileSync(nativeTransform))};
}
function runChild(args, cwd, env, deadline, {spawnProcess = spawn, signal = (pid, kind) => process.kill(pid, kind),
  schedule = setTimeout, cancel = clearTimeout, now = Date.now, platform = process.platform, watchdogMs = LIMITS.childMs} = {}) {
  requireThat(platform === 'linux' && Number.isSafeInteger(watchdogMs) && watchdogMs > 0 && watchdogMs <= LIMITS.childMs, 'Owned Linux group and bounded watchdog required');
  const timeout = Math.min(watchdogMs, deadline - now() - LIMITS.graceMs);
  requireThat(timeout > 0, 'Child budget exhausted');
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
      killer = schedule(() => { killSent = signalOwned('SIGKILL'); finish(); }, LIMITS.graceMs);
    };
    try { child = spawnProcess(process.execPath, args, {cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']}); }
    catch (failure) { error = failure.code || failure.message; finish(); return; }
    owned = Number.isSafeInteger(child.pid) && child.pid > 1 && child.pid !== process.pid;
    child.on('error', failure => { error = failure.code || failure.message; if (owned) stop('Owned process failed'); else finish(); });
    child.on('close', (status, childSignal) => { closed = {status, signal: childSignal}; if (!hardFailure) finish(); });
    if (!owned) { error = 'Invalid owned child PID'; finish(); return; }
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', value => {
        if (finished) return; const data = Buffer.from(value), room = Math.max(0, LIMITS.outputBytes - bytes[name]);
        if (room) chunks[name].push(data.subarray(0, room)); bytes[name] += data.length;
        if (bytes[name] > LIMITS.outputBytes) stop('Child output cap exceeded; preserved prefix is incomplete');
      });
      child[name].on('error', () => stop('Child ' + name + ' capture failed'));
    }
    watchdog = schedule(() => stop('Child wall watchdog exceeded'), timeout);
  });
}
function verifySequence(actual, jest, execution, env, expected) {
  requireThat(actual?.completed === true && actual.diagnostic_only === true && actual.qualification === false
    && actual.node === expected.node && actual.execPath === expected.execPath && actual.platform === 'linux' && actual.arch === 'x64' && actual.timezone === 'UTC'
    && actual.pid > 1 && actual.process_group_id === execution.pid && actual.pid !== execution.pid, 'Actual Jest/runtime/group receipt is incomplete or mismatched');
  requireThat(actual.source_sha === env.GITHUB_SHA && actual.application_baseline === BASELINE
    && actual.lifecycle_years === '5' && actual.synthetic_exports === false && actual.profiler_enabled === true
    && actual.profiler_interval_us === 10000 && actual.errors?.length === 0
    && same(actual.execArgv, ['--cpu-prof', '--cpu-prof-dir=' + env.CPU_ATTRIBUTION_PROFILE_DIR, '--cpu-prof-interval=10000']),
  'Actual profiler/source/workload declaration differs');
  requireThat(jest?.wasInterrupted === false && jest.numTotalTestSuites === 1 && jest.numTotalTests === 3
    && jest.numPendingTests === 0 && jest.numPendingTestSuites === 0 && jest.numRuntimeErrorTestSuites === 0 && jest.testResults?.length === 1, 'Original sequence is incomplete');
  const suite = jest.testResults[0], cases = suite.assertionResults;
  requireThat(!suite.testExecError && /[\\/]src[\\/]preview[\\/]frameworkFiveYear\.test\.js$/.test(suite.name || '')
    && same(cases?.map(row => row.fullName), CASES) && cases.every(row => ['passed', 'failed'].includes(row.status)), 'Original cases were filtered, reordered or replaced');
  requireThat(same(actual.cases?.map(row => [row.name, row.status]), cases.map(row => [row.fullName, row.status])), 'Actual runtime and Jest outcomes disagree');
  // Standard Jest27 JSON omits assertion duration; retain the actual reporter value without inventing equality.
  requireThat(actual.cases.every(row => Number.isFinite(row.duration_ms) && row.duration_ms >= 0)
    && ['user', 'system'].every(key => Number.isFinite(actual.cpu_usage_us?.[key]) && actual.cpu_usage_us[key] >= 0)
    && actual.memory_usage?.rss > 0 && actual.resource_usage?.maxRSS > 0, 'Actual case/resource observations are incomplete');
  const passed = cases.filter(row => row.status === 'passed').length;
  requireThat(jest.numPassedTests === passed && jest.numFailedTests === 3 - passed && jest.success === (passed === 3)
    && jest.numPassedTestSuites === Number(passed === 3) && jest.numFailedTestSuites === Number(passed !== 3)
    && execution.status === (passed === 3 ? 0 : 1) && !execution.hard_failure && !execution.error && !execution.signal, 'Child/Jest outcome accounting differs');
  return {cases: actual.cases, original_cases_passed: passed === 3, qualification: false, profile_scope: 'aggregate original sequence; no ISO-only clock attribution'};
}
function ensureOutput(output, root) {
  requireThat(typeof output === 'string' && path.isAbsolute(output), 'Explicit absolute output is required');
  const relative = path.relative(root, output);
  requireThat(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Artifacts must be outside the source checkout');
  let current = path.parse(output).root;
  for (const part of path.resolve(output).slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) fs.mkdirSync(current);
    const stat = fs.lstatSync(current);
    requireThat(stat.isDirectory() && !stat.isSymbolicLink(), 'Output ancestors must be ordinary directories');
  }
}
function writeJSON(output, name, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  requireThat(bytes.length <= LIMITS.metadataBytes, 'Diagnostic metadata cap exceeded: ' + name);
  fs.writeFileSync(path.join(output, name), bytes, {flag: 'wx'});
}
async function run(output, frontend = process.cwd(), {environment = process.env, actual = runtime(), prove = applicationProof,
  launch = runChild, argsFor = argumentsFor, checkConfiguration = verifyConfiguration, checkProfiles = validateProfiles} = {}) {
  const root = path.resolve(frontend, '..');
  ensureOutput(output, root);
  writeJSON(output, 'workload-claim.json', {attempt: environment.GITHUB_RUN_ATTEMPT, diagnostic_only: true, qualification: false});
  const receipt = {version: 1, diagnostic_only: true, qualification: false, application_baseline: BASELINE,
    diagnostic_sha: environment.GITHUB_SHA || null, limits: LIMITS, limits_enforced: false, heavy_children: 0, configuration_children: 0,
    capture_valid: false, overhead: 'unknown; not subtracted', profile_scope: 'aggregate sequence only'};
  let env, deadline;
  const preserveExecution = (name, execution) => {
    const {stdout, stderr, ...metadata} = execution;
    requireThat(Buffer.isBuffer(stdout) && Buffer.isBuffer(stderr), 'Child output capture missing');
    fs.writeFileSync(path.join(output, name + '-stdout.log'), stdout, {flag: 'wx'});
    fs.writeFileSync(path.join(output, name + '-stderr.log'), stderr, {flag: 'wx'});
    writeJSON(output, name + '-process.json', metadata);
    return metadata;
  };
  try {
    verifyAdmission(actual, environment); deadline = deadlineFor(environment); env = environmentFor(environment, output, actual);
    receipt.deadline_ms = deadline; receipt.source_before = prove(root, env, deadline);
    const configArgs = argsFor(frontend, output, {configuration: true});
    receipt.configuration_children = 1;
    const config = await launch(configArgs, frontend, env, deadline, {watchdogMs: LIMITS.configMs});
    receipt.configuration = preserveExecution('config', config);
    requireThat(config.status === 0 && !config.hard_failure && !config.error && !config.signal, 'One native configuration admission failed');
    receipt.configuration_proof = checkConfiguration(JSON.parse(config.stdout.toString('utf8')), frontend);
    requireThat(deadline - Date.now() >= LIMITS.childMs + LIMITS.graceMs, 'Insufficient budget for the one complete heavy child');
    receipt.arguments = argsFor(frontend, output); receipt.heavy_children = 1;
    const execution = await launch(receipt.arguments, frontend, env, deadline);
    receipt.execution = preserveExecution('sequence', execution);
    // Preserve/validate any native profile even when test, runtime or watchdog fails.
    let actualJest = null;
    try { actualJest = readJSON(path.join(output, 'runtime.json')); receipt.actual_jest = actualJest; }
    catch (error) { receipt.runtime_error = error.message; }
    receipt.profile_validation = checkProfiles(output, {pid: actualJest?.pid, maxProfileBytes: LIMITS.profileBytes, maxTotalBytes: LIMITS.totalBytes});
    receipt.outcome = verifySequence(actualJest, readJSON(path.join(output, 'jest.json')), execution, env, actual);
    requireThat(receipt.profile_validation.valid, 'CPU profile is invalid, missing, mismatched or oversized');
    receipt.capture_valid = true;
  } catch (error) { receipt.stop_reason = error.message; receipt.capture_valid = false; }
  finally {
    if (receipt.source_before) {
      try { receipt.source_after = prove(root, env, deadline); requireThat(same(receipt.source_before, receipt.source_after), 'Source proof changed during observation'); }
      catch (error) { receipt.source_error = error.message; receipt.capture_valid = false; }
    }
    // Validate raw evidence before three bounded footer writes. Native profiles are never trimmed.
    const finalFiles = checkProfiles(output, {pid: receipt.actual_jest?.pid, maxProfileBytes: LIMITS.profileBytes, maxTotalBytes: LIMITS.totalBytes - 3 * LIMITS.metadataBytes});
    finalFiles.validation_scope = 'raw files before receipt/file-validation/final metadata';
    finalFiles.reserved_footer_bytes = 3 * LIMITS.metadataBytes;
    if (!finalFiles.valid) receipt.capture_valid = false;
    receipt.final_file_validation_passed = finalFiles.valid;
    writeJSON(output, 'receipt.json', receipt);
    writeJSON(output, 'file-validation.json', finalFiles);
    writeJSON(output, 'final.json', {capture_valid: receipt.capture_valid, qualification: false, original_cases_passed: receipt.outcome?.original_cases_passed ?? false,
      stop_reason: receipt.stop_reason || receipt.source_error || (!finalFiles.valid ? 'Final file/profile validation failed' : null), heavy_children: receipt.heavy_children,
      configuration_children: receipt.configuration_children, full_acceptance: false, pilot: 'stopped', release_holds: 'unchanged'});
  }
  return receipt;
}
if (require.main === module) run(process.argv[2]).then(receipt => { process.exitCode = receipt.capture_valid && receipt.outcome?.original_cases_passed ? 0 : 1; })
  .catch(error => { console.error('Diagnostic stopped:', error.message); process.exitCode = 1; });
module.exports = {BASELINE, LIMITS, CASES, runtime, deadlineFor, verifyAdmission, environmentFor, applicationProof, argumentsFor,
  verifyConfiguration, runChild, verifySequence, ensureOutput, writeJSON, run};
