const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {performance} = require('node:perf_hooks');

const RUNTIME_SHARD = 'framework-five-year';
const PINNED_NODE = 'v22.23.4';

const LIFECYCLE_SUITES = Object.freeze({
  'ten-year': 'src/preview/brawndoTenYear.test.js',
  'multi-framework': 'src/preview/multiFrameworkLifecycle.test.js',
  'framework-five-year': 'src/preview/frameworkFiveYear.test.js',
});
const SHARDS = [...Object.keys(LIFECYCLE_SUITES), '1', '2', '3'];
function requireThat(condition, message) { if (!condition) throw new Error(message); }
function normalized(file, root) {
  const relative = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
  requireThat(relative && !relative.startsWith('../') && !path.isAbsolute(relative), 'Test outside frontend: ' + file);
  return relative;
}
function uniqueSorted(files) {
  requireThat(Array.isArray(files) && files.every(file => typeof file === 'string'), 'Invalid suite inventory');
  requireThat(new Set(files).size === files.length, 'Duplicate suite inventory');
  return [...files].sort();
}
function plan(files, sha) {
  const discovered = uniqueSorted(files);
  requireThat(typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha), 'Full source SHA required');
  const dedicated = new Set(Object.values(LIFECYCLE_SUITES));
  requireThat(dedicated.size === Object.keys(LIFECYCLE_SUITES).length, 'Duplicate dedicated suite');
  const partitions = Object.fromEntries(SHARDS.map(id => [id, []]));
  // Long lifecycle suites use fresh processes without changing their fixtures or deadlines.
  for (const [shard, file] of Object.entries(LIFECYCLE_SUITES)) {
    requireThat(discovered.includes(file), 'Lifecycle suite missing from discovery: ' + file);
    partitions[shard] = [file];
  }
  discovered.filter(file => !dedicated.has(file)).forEach((file, index) => partitions[String(index % 3 + 1)].push(file));
  requireThat(SHARDS.every(id => partitions[id].length), 'Empty campaign partition');
  requireThat(JSON.stringify(uniqueSorted(Object.values(partitions).flat())) === JSON.stringify(discovered), 'Partition coverage differs from discovery');
  return {version: 1, sha, discovered, partitions};
}
function verifyResult(manifest, shard, result, exitCode, root) {
  const expectedPlan = plan(manifest.discovered, manifest.sha);
  requireThat(JSON.stringify(manifest) === JSON.stringify(expectedPlan), 'Noncanonical campaign manifest');
  requireThat(SHARDS.includes(shard), 'Unknown shard');
  requireThat(exitCode === 0 && result && result.success === true && result.wasInterrupted === false, 'Unsuccessful or interrupted Jest execution');
  requireThat(Array.isArray(result.testResults), 'Missing Jest suite results');
  const executed = uniqueSorted(result.testResults.map(suite => normalized(suite.name, root)));
  requireThat(JSON.stringify(executed) === JSON.stringify(manifest.partitions[shard]), 'Executed suites differ from assigned partition');
  requireThat(result.numTotalTestSuites === executed.length && result.numPassedTestSuites === executed.length
    && result.numFailedTestSuites === 0 && result.numPendingTestSuites === 0 && result.numRuntimeErrorTestSuites === 0,
  'Suite accounting is incomplete');
  requireThat(result.testResults.every(suite => suite.status === 'passed' && !suite.testExecError), 'Nonpassing suite result');
  return executed;
}
function audit(receipts, sha) {
  requireThat(receipts.length === SHARDS.length, 'Missing campaign receipts');
  const first = receipts[0].manifest;
  requireThat(first.sha === sha, 'Campaign source SHA mismatch');
  requireThat(uniqueSorted(receipts.map(receipt => receipt.shard)).join(',') === [...SHARDS].sort().join(','), 'Missing or duplicate shards');
  const executed = [];
  for (const receipt of receipts) {
    requireThat(JSON.stringify(receipt.manifest) === JSON.stringify(first), 'Shard discovery/source inventories differ');
    const verification = classifyReceipt(receipt);
    requireQualification(verification);
    executed.push(...verification.workload.executed);
  }
  requireThat(JSON.stringify(uniqueSorted(executed)) === JSON.stringify(first.discovered), 'Campaign is not exhaustive');
  return {sha, suites: executed.length, shards: SHARDS.length};
}
function environmentClass(value) {
  if (value === undefined) return 'unset';
  if (value === '') return 'empty';
  return value === 'test' || value === 'production' ? value : 'other';
}
function launchProvenance(invocationId, environment = process.env, runtime = process) {
  const selector = environment.JEST_JASMINE;
  return {invocation_id: invocationId, node: runtime.version, execPath: runtime.execPath, source_sha: environment.GITHUB_SHA,
    early_environment: {node_env: environmentClass(environment.NODE_ENV), babel_env: environmentClass(environment.BABEL_ENV)},
    startup: {exec_argv_count: runtime.execArgv.length, exec_argv_empty: runtime.execArgv.length === 0,
      node_options_present: environment.NODE_OPTIONS !== undefined, node_options_nonempty: Boolean(environment.NODE_OPTIONS),
      v8_coverage_enabled: Boolean(environment.NODE_V8_COVERAGE),
      jest_jasmine: selector === undefined ? 'unset' : selector === '' ? 'empty' : selector === '1' ? 'one' : 'other'}};
}
function verifyLaunch(launch) {
  requireThat(launch.node === PINNED_NODE && launch.startup.exec_argv_empty === true && launch.startup.exec_argv_count === 0
    && launch.startup.node_options_nonempty === false && launch.startup.v8_coverage_enabled === false
    && ['unset', 'empty'].includes(launch.startup.jest_jasmine),
  'Unexpected lifecycle launcher runtime/startup options');
  requireThat(['unset', 'empty', 'test'].includes(launch.early_environment.node_env)
    && ['unset', 'empty', 'test'].includes(launch.early_environment.babel_env), 'Unexpected pre-CRACO environment classification');
}
function pinnedNodeEnvironment(environment, executable = process.execPath, platform = process.platform) {
  const copy = {...environment};
  const keys = Object.keys(copy).sort().filter(key => platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH');
  const key = keys[0] || 'PATH', existing = copy[key] || '';
  keys.forEach(name => { delete copy[name]; });
  const paths = platform === 'win32' ? path.win32 : path.posix;
  copy[key] = paths.dirname(executable) + paths.delimiter + existing;
  return copy;
}
function executionOptions(shard, manifest, resultPath, runtimePath, invocationId, environment = process.env) {
  const args = ['--runTestsByPath', ...manifest.partitions[shard], '--json', '--outputFile=' + resultPath];
  if (shard !== RUNTIME_SHARD) return {args, options: {stdio: 'inherit'}};
  return {args: [...args, '--reporters=default', '--reporters=' + path.resolve(__dirname, 'frontend-runtime-reporter.cjs')],
    options: {stdio: 'inherit', env: pinnedNodeEnvironment({...environment, CI: 'true',
      FRONTEND_RUNTIME_RECEIPT: runtimePath, FRONTEND_RUNTIME_INVOCATION: invocationId,
      FRONTEND_RUNTIME_EARLY_ENV: JSON.stringify({node_env: environmentClass(environment.NODE_ENV), babel_env: environmentClass(environment.BABEL_ENV)})})}};
}
function verifyRuntime(receipt) {
  const {runtime, runtimeLaunch: launch, result, manifest} = receipt;
  requireThat(runtime && launch && runtime.version === 1 && runtime.completed === true, 'Missing or incomplete lifecycle runtime provenance');
  requireThat(typeof launch.invocation_id === 'string' && launch.invocation_id.length > 0
    && runtime.invocation_id === launch.invocation_id, 'Stale lifecycle runtime provenance');
  requireThat(runtime.source_sha === manifest.sha && launch.source_sha === manifest.sha, 'Lifecycle runtime source mismatch');
  // The coverage job runs on a separate host. Compare the child with its own launcher.
  requireThat(launch.node === PINNED_NODE && runtime.node === launch.node && runtime.execPath === launch.execPath,
    'Lifecycle child did not use the pinned launcher runtime');
  verifyLaunch(launch);
  const envelope = runtime.envelope;
  requireThat(envelope && envelope.version === 1 && envelope.hook === 'onTestStart' && envelope.capture_status === 'admitted'
    && envelope.identity_evidence === 'configured-selected-resolved' && envelope.actual_vm_module_execution === 'UNVERIFIED'
    && envelope.early_environment?.node_env === launch.early_environment.node_env
    && envelope.early_environment.babel_env === launch.early_environment.babel_env, 'Missing or invalid lifecycle configuration provenance');
  requireThat(envelope.startup?.exec_argv_count === 0 && envelope.startup.exec_argv_empty === true
    && envelope.startup.node_options_nonempty === false && envelope.startup.v8_coverage_enabled === false
    && envelope.inner_environment?.node_env === 'test' && envelope.inner_environment.babel_env === 'test'
    && ['unset', 'empty'].includes(envelope.startup.jest_jasmine), 'Unexpected actual lifecycle startup/environment');
  requireThat(/^[a-f0-9]{64}$/.test(envelope.configured_fields_sha256)
    && Array.isArray(envelope.selected_files) && envelope.selected_files.length > 0
    && envelope.selected_files.every(file => typeof file.role === 'string' && typeof file.path === 'string'
      && /^[a-f0-9]{64}$/.test(file.sha256) && Number.isInteger(file.bytes) && file.bytes > 0)
    && Number.isFinite(envelope.overhead?.snapshot_ms) && envelope.overhead.snapshot_ms >= 0
    && Number.isFinite(runtime.artifact_overhead?.completed_write_ms) && runtime.artifact_overhead.completed_write_ms >= 0
    && Number.isInteger(runtime.artifact_overhead.completed_write_calls) && runtime.artifact_overhead.completed_write_calls > 0
    && runtime.artifact_overhead.current_write_excluded === true
    && Number.isFinite(launch.metadata_preflight_ms) && launch.metadata_preflight_ms >= 0,
  'Incomplete lifecycle configured-file/metadata evidence');
  requireThat(runtime.platform === 'linux' && runtime.arch === 'x64' && runtime.timezone === 'UTC'
    && runtime.lifecycle_years === '5' && runtime.synthetic_exports === false && runtime.phase_logging === false,
  'Unexpected lifecycle workload or diagnostic instrumentation');
  requireThat(Array.isArray(result?.testResults), 'Missing lifecycle original-case result evidence');
  const cases = result.testResults.flatMap(suite => suite.assertionResults || [])
    .map(value => ({name: value.fullName, status: value.status}));
  // Jest's JSON formatter omits per-case duration; retain those native reporter measurements separately.
  requireThat(cases.length === 3 && Array.isArray(runtime.cases) && runtime.cases.length === cases.length
    && runtime.cases.every(value => typeof value.name === 'string' && Number.isFinite(value.duration_ms) && value.duration_ms >= 0)
    && JSON.stringify(runtime.cases.map(value => ({name: value.name, status: value.status}))) === JSON.stringify(cases),
  'Lifecycle runtime case evidence differs from original Jest results');
  requireThat(Number.isInteger(runtime.available_parallelism) && runtime.available_parallelism > 0
    && typeof runtime.cpu_model === 'string' && runtime.cpu_model.length > 0
    && Number.isFinite(runtime.total_memory) && runtime.total_memory > 0
    && Number.isFinite(runtime.startup_free_memory) && runtime.startup_free_memory > 0
    && Number.isFinite(runtime.elapsed_ms) && runtime.elapsed_ms > 0
    && Number.isFinite(runtime.cpu_usage_us?.user) && runtime.cpu_usage_us.user >= 0
    && Number.isFinite(runtime.cpu_usage_us?.system) && runtime.cpu_usage_us.system >= 0
    && Number.isFinite(runtime.resource_usage?.maxRSS) && runtime.resource_usage.maxRSS > 0
    && Number.isFinite(runtime.memory_usage?.rss) && runtime.memory_usage.rss > 0,
  'Incomplete lifecycle host/resource evidence');
}
function classifyReceipt(receipt) {
  const verification = {workload: {valid: false}, runtime: {required: receipt.shard === RUNTIME_SHARD, valid: null}};
  try {
    requireThat(!receipt.signal && !receipt.spawn_error_code, 'Jest execution terminated before normal completion');
    verification.workload.executed = verifyResult(receipt.manifest, receipt.shard, receipt.result, receipt.exitCode, receipt.frontendRoot);
    verification.workload.valid = true;
  } catch (error) { verification.workload.error = error.message; }
  if (verification.runtime.required) {
    try { verifyRuntime(receipt); verification.runtime.valid = true; }
    catch (error) { verification.runtime.valid = false; verification.runtime.error = error.message; }
  }
  return verification;
}
function readJsonEvidence(file) {
  try { return {value: JSON.parse(fs.readFileSync(file, 'utf8'))}; }
  catch (error) { return {error: error.code === 'ENOENT' ? 'missing' : error instanceof SyntaxError ? 'invalid-json' : 'unreadable'}; }
}
function collectExecutionReceipt({manifest, shard, execution, frontendRoot, resultPath, runtimePath, launch}) {
  const result = readJsonEvidence(resultPath);
  const receipt = {manifest, shard, exitCode: execution.status, signal: execution.signal || null,
    spawn_error_code: execution.error ? (/^[A-Z0-9_]{1,80}$/.test(execution.error.code) ? execution.error.code : 'unknown') : null,
    frontendRoot, result: result.value ?? null};
  if (result.error) receipt.resultError = result.error;
  if (shard === RUNTIME_SHARD) {
    receipt.runtimeLaunch = launch;
    const runtime = readJsonEvidence(runtimePath);
    if (runtime.error) receipt.runtimeError = runtime.error;
    else receipt.runtime = runtime.value;
  }
  return receipt;
}
function requireQualification(verification) {
  const errors = [];
  if (!verification.workload.valid) errors.push('Workload verification failed: ' + verification.workload.error);
  if (verification.runtime.required && !verification.runtime.valid) errors.push('Runtime verification failed: ' + verification.runtime.error);
  requireThat(errors.length === 0, errors.join(' | '));
}
function clearExecutionArtifacts(output, shard) {
  const names = ['jest.json', 'receipt.json'];
  if (shard === RUNTIME_SHARD) names.push('runtime.json', 'launch.json');
  for (const name of names) fs.rmSync(path.join(output, name), {force: true});
}
function jest(args, options = {}) {
  return spawnSync(process.execPath, [require.resolve('@craco/craco/dist/bin/craco.js'), 'test', '--watchAll=false', '--runInBand', ...args],
    {cwd: process.cwd(), env: {...process.env, CI: 'true'}, ...options});
}
function run(shard, output) {
  requireThat(SHARDS.includes(shard), 'Unknown shard');
  fs.mkdirSync(output, {recursive: true});
  clearExecutionArtifacts(output, shard);
  const launchStarted = performance.now();
  const invocationId = randomUUID();
  const launch = launchProvenance(invocationId);
  if (shard === RUNTIME_SHARD) {
    // Preserve safe admission facts even when unexpected inherited options stop discovery.
    fs.writeFileSync(path.join(output, 'launch.json'), JSON.stringify(launch, null, 2));
    verifyLaunch(launch);
    launch.metadata_preflight_ms = performance.now() - launchStarted;
  }
  const discovery = jest(['--listTests', '--json'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  requireThat(discovery.status === 0, 'Jest discovery failed: ' + discovery.stderr);
  const manifest = plan(JSON.parse(discovery.stdout).map(file => normalized(file, process.cwd())), process.env.GITHUB_SHA);
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const resultPath = path.resolve(output, 'jest.json');
  const runtimePath = path.resolve(output, 'runtime.json');
  const selected = executionOptions(shard, manifest, resultPath, runtimePath, invocationId);
  const execution = jest(selected.args, selected.options);
  const receipt = collectExecutionReceipt({manifest, shard, execution, frontendRoot: process.cwd(), resultPath, runtimePath, launch});
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt));
  // A failed original workload must not prevent independent metadata validation.
  receipt.verification = classifyReceipt(receipt);
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt));
  requireQualification(receipt.verification);
}
if (require.main === module) {
  try {
    if (process.argv[2] === 'run') run(process.argv[3], process.argv[4]);
    else if (process.argv[2] === 'audit') {
      const directory = process.argv[3];
      const receipts = fs.readdirSync(directory).map(entry => JSON.parse(fs.readFileSync(path.join(directory, entry, 'receipt.json'), 'utf8')));
      console.log(JSON.stringify(audit(receipts, process.env.GITHUB_SHA)));
    } else throw new Error('Usage: frontend-campaign.cjs run <shard> <output> | audit <artifacts>');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {plan, verifyResult, audit, LIFECYCLE_SUITES, SHARDS,
  pinnedNodeEnvironment, executionOptions, verifyRuntime, clearExecutionArtifacts,
  environmentClass, launchProvenance, verifyLaunch, classifyReceipt, requireQualification, collectExecutionReceipt};
