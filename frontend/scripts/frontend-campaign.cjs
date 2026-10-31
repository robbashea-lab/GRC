const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');

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
  requireThat(exitCode === 0 && result.success === true && result.wasInterrupted === false, 'Unsuccessful or interrupted Jest execution');
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
    executed.push(...verifyResult(receipt.manifest, receipt.shard, receipt.result, receipt.exitCode, receipt.frontendRoot));
    if (receipt.shard === RUNTIME_SHARD) verifyRuntime(receipt);
  }
  requireThat(JSON.stringify(uniqueSorted(executed)) === JSON.stringify(first.discovered), 'Campaign is not exhaustive');
  return {sha, suites: executed.length, shards: SHARDS.length};
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
      FRONTEND_RUNTIME_RECEIPT: runtimePath, FRONTEND_RUNTIME_INVOCATION: invocationId})}};
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
  requireThat(runtime.platform === 'linux' && runtime.arch === 'x64' && runtime.timezone === 'UTC'
    && runtime.lifecycle_years === '5' && runtime.synthetic_exports === false && runtime.phase_logging === false,
  'Unexpected lifecycle workload or diagnostic instrumentation');
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
function clearExecutionArtifacts(output, shard) {
  const names = ['jest.json', 'receipt.json'];
  if (shard === RUNTIME_SHARD) names.push('runtime.json');
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
  const discovery = jest(['--listTests', '--json'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  requireThat(discovery.status === 0, 'Jest discovery failed: ' + discovery.stderr);
  const manifest = plan(JSON.parse(discovery.stdout).map(file => normalized(file, process.cwd())), process.env.GITHUB_SHA);
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const resultPath = path.resolve(output, 'jest.json');
  const invocationId = randomUUID(), runtimePath = path.resolve(output, 'runtime.json');
  const launch = {invocation_id: invocationId, node: process.version, execPath: process.execPath, source_sha: manifest.sha};
  const selected = executionOptions(shard, manifest, resultPath, runtimePath, invocationId);
  const execution = jest(selected.args, selected.options);
  requireThat(fs.existsSync(resultPath), 'Jest result file missing');
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const receipt = {manifest, shard, exitCode: execution.status, frontendRoot: process.cwd(), result};
  if (shard === RUNTIME_SHARD) {
    receipt.runtimeLaunch = launch;
    // Preserve the original result and any partial provenance before rejecting a failed run.
    try { receipt.runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8')); }
    catch (error) { receipt.runtimeError = error.code || error.name; }
  }
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt));
  verifyResult(manifest, shard, result, execution.status, process.cwd());
  if (shard === RUNTIME_SHARD) verifyRuntime(receipt);
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
  pinnedNodeEnvironment, executionOptions, verifyRuntime, clearExecutionArtifacts};
