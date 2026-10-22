const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const LONG_SUITE = 'src/preview/brawndoTenYear.test.js';
const SHARDS = ['ten-year', '1', '2', '3'];
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
  requireThat(discovered.includes(LONG_SUITE), 'Ten-year suite missing from discovery');
  const partitions = Object.fromEntries(SHARDS.map(id => [id, []]));
  partitions['ten-year'] = [LONG_SUITE];
  discovered.filter(file => file !== LONG_SUITE).forEach((file, index) => partitions[String(index % 3 + 1)].push(file));
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
  }
  requireThat(JSON.stringify(uniqueSorted(executed)) === JSON.stringify(first.discovered), 'Campaign is not exhaustive');
  return {sha, suites: executed.length, shards: SHARDS.length};
}
function jest(args, options = {}) {
  return spawnSync(process.execPath, [require.resolve('@craco/craco/dist/bin/craco.js'), 'test', '--watchAll=false', '--runInBand', ...args],
    {cwd: process.cwd(), env: {...process.env, CI: 'true'}, ...options});
}
function run(shard, output) {
  requireThat(SHARDS.includes(shard), 'Unknown shard');
  fs.mkdirSync(output, {recursive: true});
  const discovery = jest(['--listTests', '--json'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  requireThat(discovery.status === 0, 'Jest discovery failed: ' + discovery.stderr);
  const manifest = plan(JSON.parse(discovery.stdout).map(file => normalized(file, process.cwd())), process.env.GITHUB_SHA);
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const resultPath = path.resolve(output, 'jest.json');
  const execution = jest(['--runTestsByPath', ...manifest.partitions[shard], '--json', '--outputFile=' + resultPath], {stdio: 'inherit'});
  requireThat(fs.existsSync(resultPath), 'Jest result file missing');
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const receipt = {manifest, shard, exitCode: execution.status, frontendRoot: process.cwd(), result};
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt));
  verifyResult(manifest, shard, result, execution.status, process.cwd());
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
module.exports = {plan, verifyResult, audit, LONG_SUITE, SHARDS};
