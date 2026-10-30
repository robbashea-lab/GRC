// One bounded attribution campaign. This never creates release qualification.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const {pinnedNodeEnvironment, verifyRuntime, verifyResult, plan} = require('./frontend-campaign.cjs');
const BASELINE = '39285d8fb479ab510f901e0c148ac7a6d5a2600e';
const APPLICATION = '67103820225d121fd097c0914304d690f1cdda09';
const LIFECYCLE_BLOB = 'e9a26dc6cdc4ee665c864bba50c85d9605bbbc7a';
const TARGET = 'frontend/src/preview/portfolioReporting.js';
const PROTECTED = ['frontend/src', 'backend', 'shared', 'frontend/package.json', 'frontend/yarn.lock', 'frontend/craco.config.js'];
const FRAMEWORKS = ['cis-ig1', 'soc-2', 'iso-27001'];
const CASES = FRAMEWORKS.map(key => key + ' fresh client retains the configured program lifecycle and period evidence');
const PLAN = ['C1', 'D1', 'C2'];
const LABELS = ['prior-ids-first', 'prior-ids-second', 'refresh-filter'];
const NATIVE_GUARDS = ['parse', 'stringify', 'keys', 'entries', 'Set', 'map', 'setAdd', 'setHas', 'getItem', 'canFork'];
const LIMITS = Object.freeze({campaignMs: 32 * 60000, childMs: 10 * 60000, graceMs: 2000, outputBytes: 256 * 1024});
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function childBudget(deadline, now = Date.now()) {
  const available = deadline - now - LIMITS.graceMs;
  requireThat(available > 0, 'Campaign wall budget exhausted');
  return Math.min(LIMITS.childMs, available);
}
function git(root, args, env, deadline, execute = spawnSync) {
  const remaining = deadline - Date.now();
  requireThat(remaining > 0, 'Campaign wall budget exhausted during source verification');
  const result = execute('git', ['-C', root, ...args], {env, encoding: 'utf8', windowsHide: true,
    timeout: Math.min(60000, remaining), maxBuffer: 1024 * 1024});
  requireThat(result.status === 0 && !result.error, 'Git/source verification failed: ' + (result.error?.code || result.stderr || 'nonzero exit'));
  return result.stdout.trim();
}
function applicationProof(root, env, deadline, execute = spawnSync) {
  const query = args => git(root, args, env, deadline, execute);
  const head = query(['rev-parse', 'HEAD']);
  requireThat(head === env.GITHUB_SHA, 'Checkout does not match the delivered harness SHA');
  requireThat(query(['status', '--porcelain', '--untracked-files=all']) === '', 'Original checkout is not clean');
  requireThat(query(['diff', '--name-only', BASELINE, '--', ...PROTECTED]) === '', 'Application differs from staged baseline');
  requireThat(query(['ls-files', '--others', '--', ...PROTECTED]) === '', 'Untracked application files are outside the baseline');
  const lifecycle = query(['hash-object', 'frontend/src/preview/frameworkFiveYear.test.js']);
  requireThat(lifecycle === LIFECYCLE_BLOB, 'Original lifecycle test changed');
  const objects = Object.fromEntries(PROTECTED.map(file => {
    const baseline = query(['rev-parse', BASELINE + ':' + file]), current = query(['rev-parse', 'HEAD:' + file]);
    requireThat(current === baseline && baseline === query(['rev-parse', APPLICATION + ':' + file]), 'Protected Git object differs: ' + file);
    return [file, baseline];
  }));
  return {staged_baseline_sha: BASELINE, application_baseline_sha: APPLICATION, observed_source_sha: head,
    clean_original_checkout: true, protected_objects: objects, lifecycle_blob: lifecycle};
}
function baseEnvironment(environment, output) {
  const env = pinnedNodeEnvironment({...environment, TZ: 'UTC', FRAMEWORK_LIFECYCLE_YEARS: '5',
    FRONTEND_RUNTIME_RECEIPT: path.join(output, 'runtime.json')});
  for (const key of ['NODE_OPTIONS', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR', 'ISO_PHASE_LOG_DIR', 'REPORTING_PREP_LOG_DIR', 'REPORTING_PREP_INSTRUMENTATION_PATH']) delete env[key];
  return env;
}
function diagnosticArguments(originalFrontend, copyFrontend, output) {
  return [require.resolve('@craco/craco/dist/bin/craco.js'), 'test', '--watchAll=false', '--runInBand',
    '--runTestsByPath', 'src/preview/frameworkFiveYear.test.js', '--json', '--outputFile=' + path.join(output, 'jest.json'),
    '--reporters=default', '--reporters=' + path.join(originalFrontend, 'scripts/frontend-runtime-reporter.cjs'),
    '--setupFilesAfterEnv', path.join(copyFrontend, 'src/setupTests.js'), path.join(originalFrontend, 'scripts/reporting-prep-setup.cjs')];
}
function verifySequence(runtime, result, execution, env, diagnostic) {
  const normalized = value => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
  requireThat(runtime?.completed === true && runtime.node === process.version && typeof runtime.execPath === 'string'
    && path.isAbsolute(runtime.execPath) && normalized(runtime.execPath) === normalized(process.execPath), 'Actual Jest runtime is incomplete or mismatched');
  requireThat(runtime.source_sha === env.GITHUB_SHA && runtime.application_baseline === APPLICATION && runtime.timezone === 'UTC'
    && runtime.lifecycle_years === '5' && runtime.synthetic_exports === false && runtime.phase_logging === diagnostic,
  'Actual Jest source, timezone or scenario differs');
  if (!diagnostic) verifyRuntime(runtime, env.GITHUB_SHA);
  requireThat(result?.wasInterrupted === false && result.numTotalTestSuites === 1 && result.numTotalTests === 3
    && result.numPendingTests === 0 && result.numPendingTestSuites === 0 && result.numRuntimeErrorTestSuites === 0,
  'Original complete three-case sequence was not observed');
  const cases = result.testResults?.[0]?.assertionResults;
  requireThat(Array.isArray(cases) && JSON.stringify(cases.map(value => value.fullName)) === JSON.stringify(CASES), 'Framework cases were filtered, reordered or replaced');
  requireThat(Array.isArray(runtime.cases) && JSON.stringify(runtime.cases.map(value => [value.name, value.status]))
    === JSON.stringify(cases.map(value => [value.fullName, value.status])), 'Runtime and Jest case outcomes disagree');
  requireThat(runtime.cases.every(value => Number.isFinite(value.duration_ms) && value.duration_ms >= 0), 'Raw case durations are missing');
  requireThat(cases.every(value => ['passed', 'failed'].includes(value.status)), 'Case outcome is incomplete');
  requireThat(result.numPassedTests === cases.filter(value => value.status === 'passed').length
    && result.numFailedTests === cases.filter(value => value.status === 'failed').length, 'Jest test accounting differs from case outcomes');
  requireThat(!execution.hard_failure && !execution.signal && !execution.error, 'Child watchdog, output or process failure');
  const allPassed = cases.every(value => value.status === 'passed');
  requireThat(result.success === allPassed && (execution.status === 0) === allPassed, 'Process and Jest success disagree');
  const priorFailed = cases.slice(0, 2).some(value => value.status !== 'passed');
  const iso = cases[2], censored = iso.status === 'failed'
    && iso.failureMessages?.some(message => /Exceeded timeout of 180000 ms for a test/.test(message));
  return {passed: allPassed, censored_iso: Boolean(censored), hard_stop: priorFailed || iso.status === 'failed' && !censored,
    stop_reason: priorFailed ? 'Preceding CIS/SOC failure invalidates later attribution' : iso.status === 'failed' && !censored ? 'ISO failed outside its original deadline' : null,
    cases: runtime.cases};
}
function verifyObserver(summary, instrumentation, env) {
  requireThat(summary?.version === 1 && summary.complete === true && summary.diagnostic_valid === true
    && summary.event_cap_reached === false && Array.isArray(summary.errors) && summary.errors.length === 0,
  'Observer is incomplete, errored or capped');
  requireThat(summary.instrumentation?.application_baseline_sha === APPLICATION && summary.instrumentation?.staged_baseline_sha === BASELINE
    && summary.instrumentation?.observed_source_sha === env.GITHUB_SHA, 'Observer source provenance differs');
  requireThat(summary.instrumentation.original_sha256 === instrumentation.original_sha256
    && summary.instrumentation.instrumented_sha256 === instrumentation.instrumented_sha256, 'Observer instrumentation hashes differ');
  requireThat(Array.isArray(summary.cases) && summary.cases.length === 3
    && summary.cases.every((value, index) => value.framework === FRAMEWORKS[index] && value.ordinal === index + 1
      && value.closed === true && value.guards_preserved === true && value.event_cap_reached === false
      && ['native_guards_before', 'native_guards_after'].every(key => NATIVE_GUARDS.every(guard => value[key]?.[guard] === true))),
  'Observer case order, native guards or closure differs');
  requireThat(summary.cases.every(value => coherentMeasurements(value.measurements)), 'Observer target incidence or bucket accounting differs');
  requireThat(summary.calibration?.iterations === 10000 && summary.calibration.active_observer_path === true,
    'Active-observer calibration is missing');
}
function coherentMeasurements(measurements) {
  if (!LABELS.every(label => {
    const value = measurements?.[label], buckets = value?.legacy_gate_buckets;
    return value && Number.isSafeInteger(value.calls) && value.calls > 0 && value.sample_count === value.calls
      && Number.isSafeInteger(value.throws) && value.throws >= 0 && value.throws <= value.calls
      && Number.isFinite(value.total_ms) && value.total_ms >= 0 && buckets
      && ['truthy', 'falsy', 'not_applicable'].every(key => Number.isSafeInteger(buckets[key]?.calls) && buckets[key].calls >= 0
        && buckets[key].sample_count === buckets[key].calls)
      && buckets.truthy.calls === value.legacyGateTruthy && buckets.falsy.calls === value.legacyGateFalsy
      && buckets.not_applicable.calls === value.legacyGateNotApplicable
      && value.legacyGateTruthy + value.legacyGateFalsy + value.legacyGateNotApplicable === value.calls;
  })) return false;
  const first = measurements[LABELS[0]], second = measurements[LABELS[1]], filter = measurements[LABELS[2]];
  return first.calls <= second.calls && second.calls === filter.calls
    && first.legacyGateTruthy === 0 && first.legacyGateFalsy === 0 && first.legacyGateNotApplicable === first.calls
    && second.legacyGateNotApplicable === 0 && filter.legacyGateNotApplicable === 0
    && second.legacyGateTruthy === filter.legacyGateTruthy && second.legacyGateFalsy === filter.legacyGateFalsy;
}
function verifyControl(control, runtime, result, execution, env, frontend) {
  const manifest = control.manifest;
  requireThat(manifest?.discovered?.length === 513 && manifest.sha === env.GITHUB_SHA && control.shard === 'framework-five-year'
    && JSON.stringify(manifest) === JSON.stringify(plan(manifest.discovered, env.GITHUB_SHA)), 'Normal original513-suite inventory/source differs');
  requireThat(JSON.stringify(control.runtime) === JSON.stringify(runtime) && JSON.stringify(control.result) === JSON.stringify(result)
    && control.exitCode === execution.status && control.frontendRoot === frontend, 'Normal receipt differs from observed execution');
  if (result.success) verifyResult(manifest, control.shard, result, control.exitCode, control.frontendRoot);
}
function verifyCopy(original, actual, instrumentation, changed, untracked) {
  const {instrumentReportingSource} = require('./reporting-prep-observer.cjs');
  const expected = instrumentReportingSource(original);
  requireThat(JSON.stringify(expected.replacements) === JSON.stringify({'prior-ids-first': 1, 'prior-ids-second': 1, 'refresh-filter': 1}), 'Instrumentation replacement counts differ');
  requireThat(actual === expected.source && hash(original) === instrumentation.original_sha256
    && hash(actual) === instrumentation.instrumented_sha256, 'Disposable source is not the exact three-initializer transformation');
  requireThat(JSON.stringify(changed.filter(Boolean)) === JSON.stringify([TARGET]) && untracked.length === 0, 'Disposable application has other changes');
}

// Each child owns a Linux process group, including CRACO's literal-node descendant.
function runChild(args, cwd, env, deadline, options = {}) {
  const timeout = Math.min(childBudget(deadline), options.watchdogMs ?? LIMITS.childMs), grace = options.graceMs ?? LIMITS.graceMs;
  requireThat(Number.isInteger(timeout) && timeout > 0 && Number.isInteger(grace) && grace > 0 && grace <= LIMITS.graceMs,
    'Child watchdog/grace may only be reduced for a preflight');
  requireThat(options.onSpawn === undefined || typeof options.onSpawn === 'function', 'Invalid process observation hook');
  const started = Date.now();
  return new Promise(resolve => {
    const chunks = {stdout: [], stderr: []}, bytes = {stdout: 0, stderr: 0};
    let child, watchdog, killer, closed, hardFailure = null, killSent = false, error = null;
    const signalGroup = signal => { try { process.kill(-child.pid, signal); } catch (failure) { if (failure.code !== 'ESRCH') error = failure.code; } };
    const finish = () => {
      clearTimeout(watchdog); clearTimeout(killer);
      resolve({pid: child?.pid ?? null, status: closed?.status ?? null, signal: closed?.signal ?? null, error, hard_failure: hardFailure,
        elapsed_ms: Date.now() - started, child_timeout_ms: timeout,
        stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8'), output_bytes: bytes});
    };
    const stop = reason => {
      if (hardFailure) return;
      hardFailure = reason;
      if (!child.pid) return;
      signalGroup('SIGTERM');
      killer = setTimeout(() => { signalGroup('SIGKILL'); killSent = true; if (closed) finish(); }, grace);
    };
    try { child = spawn(process.execPath, args, {cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']}); }
    catch (failure) { error = failure.code || failure.message; finish(); return; }
    for (const name of ['stdout', 'stderr']) child[name].on('data', value => {
      const room = Math.max(0, LIMITS.outputBytes - bytes[name]);
      if (room) chunks[name].push(value.subarray(0, room));
      bytes[name] += value.length;
      if (bytes[name] > LIMITS.outputBytes) stop('Child output cap exceeded');
    });
    child.on('error', failure => { error = failure.code || failure.message; });
    child.on('close', (status, signal) => { closed = {status, signal}; if (!hardFailure || killSent || !child.pid) finish(); });
    watchdog = setTimeout(() => stop('Child wall watchdog exceeded'), timeout);
    try { options.onSpawn?.(child.pid); } catch (failure) { error = failure.message; stop('Process observation hook failed'); }
  });
}
async function executePlan(execute, deadline, now = Date.now, update = () => {}) {
  const stages = [];
  for (const label of PLAN) {
    let stage;
    try { childBudget(deadline, now()); stage = await execute(label); }
    catch (error) { stage = {label, passed: false, hard_stop: true, stop_reason: error.message}; }
    stages.push(stage); update(stages);
    if (stage.hard_stop) break;
  }
  return {stages, complete: stages.length === PLAN.length, passed: stages.length === PLAN.length && stages.every(value => value.passed && !value.hard_stop),
    censored_iso: stages.some(value => value.censored_iso), qualification: false};
}
function prepareCopy(root, frontend, output, env, deadline) {
  const {instrumentReportingSource} = require('./reporting-prep-observer.cjs');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'governara-reporting-attribution-'));
  const copy = path.join(temporary, 'checkout');
  requireThat(!copy.startsWith(root + path.sep) && !copy.startsWith(output + path.sep), 'Disposable source must be outside original and artifact roots');
  git(root, ['worktree', 'add', '--detach', copy, BASELINE], env, deadline);
  const copyFrontend = path.join(copy, 'frontend');
  fs.symlinkSync(path.join(frontend, 'node_modules'), path.join(copyFrontend, 'node_modules'), 'dir');
  const original = fs.readFileSync(path.join(root, TARGET), 'utf8'), actualOriginal = fs.readFileSync(path.join(copy, TARGET), 'utf8');
  requireThat(actualOriginal === original, 'Disposable original source bytes differ');
  requireThat(git(copy, ['diff', '--name-only', BASELINE, '--', ...PROTECTED], env, deadline) === '', 'Disposable application is dirty before instrumentation');
  const transformed = instrumentReportingSource(actualOriginal);
  const {source, ...transform} = transformed;
  const instrumentation = {...transform, application_baseline_sha: APPLICATION, staged_baseline_sha: BASELINE, observed_source_sha: env.GITHUB_SHA};
  fs.writeFileSync(path.join(copy, TARGET), source);
  const prove = () => verifyCopy(original, fs.readFileSync(path.join(copy, TARGET), 'utf8'), instrumentation,
    git(copy, ['diff', '--name-only', BASELINE, '--', ...PROTECTED], env, deadline).split('\n').filter(Boolean),
    git(copy, ['ls-files', '--others', '--', ...PROTECTED], env, deadline).split('\n').filter(Boolean));
  prove();
  writeJSON(path.join(output, 'instrumentation.json'), instrumentation);
  return {copy, frontend: copyFrontend, instrumentation, prove};
}
async function run(output, frontend = process.cwd()) {
  const deadline = Date.now() + LIMITS.campaignMs, root = path.resolve(frontend, '..');
  fs.mkdirSync(output, {recursive: true});
  const directory = fs.mkdtempSync(path.join(path.resolve(output), 'run-'));
  const receipt = {version: 1, qualification: false, plan: PLAN, limits: LIMITS, stages: [], observed_source_sha: process.env.GITHUB_SHA || null};
  const save = () => writeJSON(path.join(directory, 'campaign.json'), receipt);
  save();
  try {
    requireThat(process.platform === 'linux' && process.version === 'v22.23.4', 'This predeclared workload requires Linux Node22.23.4');
    requireThat(process.env.GITHUB_RUN_ATTEMPT === '1' && /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || ''), 'Only the first exact-source hosted attempt is authorized');
    const initialEnv = baseEnvironment(process.env, directory);
    receipt.original_before = applicationProof(root, initialEnv, deadline);
    const result = await executePlan(async label => {
      const stageDirectory = path.join(directory, label); fs.mkdirSync(stageDirectory);
      const env = baseEnvironment(process.env, stageDirectory), diagnostic = label === 'D1';
      const stage = {label, passed: false, qualification: false, diagnostic, source_before: applicationProof(root, env, deadline)};
      let copy;
      try {
        let args = [path.join(frontend, 'scripts/frontend-campaign.cjs'), 'run', 'framework-five-year', stageDirectory], cwd = frontend;
        if (diagnostic) {
          copy = prepareCopy(root, frontend, stageDirectory, env, deadline);
          env.REPORTING_PREP_LOG_DIR = stageDirectory; env.ISO_PHASE_LOG_DIR = stageDirectory;
          env.REPORTING_PREP_INSTRUMENTATION_PATH = path.join(stageDirectory, 'instrumentation.json');
          args = diagnosticArguments(frontend, copy.frontend, stageDirectory); cwd = copy.frontend;
          stage.disposable_worktree = copy.copy; stage.instrumentation = copy.instrumentation;
        }
        stage.arguments = args; stage.execution = await runChild(args, cwd, env, deadline);
        writeJSON(path.join(stageDirectory, 'process-output.json'), stage.execution);
        stage.source_after = applicationProof(root, env, deadline);
        if (copy) { copy.prove(); stage.disposable_exact_transform_after = true; }
        stage.runtime = readJSON(path.join(stageDirectory, 'runtime.json'));
        stage.result = readJSON(path.join(stageDirectory, 'jest.json'));
        Object.assign(stage, verifySequence(stage.runtime, stage.result, stage.execution, env, diagnostic));
        if (diagnostic) {
          stage.observer = readJSON(path.join(stageDirectory, 'reporting-prep-summary.json'));
          verifyObserver(stage.observer, copy.instrumentation, env);
          stage.attribution_valid = !stage.hard_stop;
        } else {
          const control = readJSON(path.join(stageDirectory, 'receipt.json'));
          verifyControl(control, stage.runtime, stage.result, stage.execution, env, frontend);
          stage.normal_campaign_receipt = true;
        }
      } catch (error) { stage.passed = false; stage.hard_stop = true; stage.stop_reason = error.message; }
      writeJSON(path.join(stageDirectory, 'stage.json'), stage);
      return stage;
    }, deadline, Date.now, stages => { receipt.stages = stages; save(); });
    Object.assign(receipt, result);
    receipt.original_after = applicationProof(root, initialEnv, deadline);
  } catch (error) { receipt.passed = false; receipt.hard_stop = true; receipt.stop_reason = error.message; }
  receipt.total_elapsed_ms = LIMITS.campaignMs - (deadline - Date.now());
  save();
  writeJSON(path.join(output, 'latest.json'), {directory, passed: Boolean(receipt.passed), qualification: false, complete: Boolean(receipt.complete)});
  console.log(JSON.stringify({directory, passed: Boolean(receipt.passed), qualification: false}));
  return receipt.passed ? 0 : 1;
}
if (require.main === module) {
  if (!process.argv[2]) { console.error('An explicit artifact output directory is required'); process.exitCode = 1; }
  else run(path.resolve(process.argv[2])).then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = {BASELINE, APPLICATION, LIFECYCLE_BLOB, TARGET, PROTECTED, FRAMEWORKS, CASES, PLAN, LIMITS,
  childBudget, applicationProof, baseEnvironment, diagnosticArguments, verifySequence, verifyObserver, verifyControl, verifyCopy, runChild, executePlan, run};
