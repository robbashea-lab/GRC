// Diagnostic only. Never a release substitute; run the original full shard exactly once.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {spawnSync, execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {plan, verifyResult} = require('../frontend-campaign.cjs');

const BASELINE = 'f6a15b8d84726a49d7cd62d7f77063f8d6ac3e70';
const BRANCH = 'codex/prestige-original-order-f6a15b8d-20261108';
const TEST = 'frontend/src/preview/programs/prestigeCapacityPreflight.test.js';
const INSTRUMENTED_SHA256 = '3a224b5bda06c915d9ff7a7601a675e5ee22362ce91486e95c6f1d94755cf6f9';
const ALLOWED = [TEST, '.github/workflows/prestige-original-order-diagnostic.yml',
  ...['ORIGINAL-ORDER-MANIFEST.json', 'original-order-sequencer.cjs', 'original-order-reporter.cjs', 'run.cjs',
    'static-self-check.cjs', 'MEASUREMENT-METHOD.txt'].map(name => 'frontend/scripts/prestige-original-order/' + name)];
const root = process.cwd(), output = path.resolve('original-order-output');
let ownsOutput = false;
const method = path.join(__dirname, 'MEASUREMENT-METHOD.txt');
const manifestPath = path.join(__dirname, 'ORIGINAL-ORDER-MANIFEST.json');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'}).trim();
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
function jest(args, options = {}) {
  return spawnSync(process.execPath, [require.resolve('@craco/craco/dist/bin/craco.js'), 'test',
    '--watchAll=false', '--runInBand', ...args], {cwd: root, env: {...process.env, CI: 'true'}, ...options});
}

function run() {
  fs.mkdirSync(output); // A prior output directory must not be overwritten by a retry.
  ownsOutput = true;
  const started = performance.now();
  const launch = {kind: 'one original-order diagnostic; not qualification', baseline: BASELINE,
    source_sha: process.env.GITHUB_SHA, event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
    attempt: process.env.GITHUB_RUN_ATTEMPT, node: process.version, platform: process.platform, arch: process.arch,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, cpu_model: os.cpus()[0]?.model,
    available_parallelism: os.availableParallelism(), total_memory: os.totalmem(), free_memory: os.freemem(),
    started_utc: new Date().toISOString()};
  write('launch.json', launch);
  assert.equal(process.version, 'v22.23.4');
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  assert.equal(launch.timezone, 'UTC');
  assert.equal(launch.event, 'create');
  assert.equal(launch.ref, 'refs/heads/' + BRANCH);
  assert.equal(launch.attempt, '1');
  assert.equal(process.env.CI, 'true');
  assert.equal(process.execArgv.length, 0);
  assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_V8_COVERAGE && !process.env.JEST_JASMINE);
  assert.ok(!process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR && !process.env.ISO_PHASE_LOG_DIR && !process.env.ISO_PR110_PHASE_DIR);
  assert.equal(git('rev-parse', 'HEAD'), launch.source_sha);
  assert.equal(git('rev-parse', 'HEAD^'), BASELINE);
  const changed = git('diff', '--name-only', BASELINE, 'HEAD').split('\n').filter(Boolean).sort();
  assert.deepEqual(changed, [...ALLOWED].sort());
  const original = execFileSync('git', ['show', BASELINE + ':' + TEST]);
  const current = fs.readFileSync(path.resolve(root, '..', TEST));
  assert.equal(sha256(current), INSTRUMENTED_SHA256);
  const firstBody = Buffer.from("test('measure the complete deployed cohort and current-model lower bound without changing storage limits'");
  const oldStart = original.indexOf(firstBody), newStart = current.indexOf(firstBody);
  assert.ok(oldStart > 0 && newStart > 0);
  assert.ok(original.subarray(oldStart).equals(current.subarray(newStart)), 'Original assertions/deadlines/body suffix changed');
  fs.copyFileSync(method, path.join(output, 'MEASUREMENT-METHOD.txt'));
  fs.copyFileSync(manifestPath, path.join(output, 'ORIGINAL-ORDER-MANIFEST.json'));
  launch.changed_paths = changed;
  launch.test_sha256 = sha256(current);
  launch.method_sha256 = sha256(fs.readFileSync(method));
  launch.order_sha256 = sha256(fs.readFileSync(manifestPath));
  const discovery = jest(['--listTests', '--json'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  fs.writeFileSync(path.join(output, 'discovery.stdout'), discovery.stdout || '');
  fs.writeFileSync(path.join(output, 'discovery.stderr'), discovery.stderr || '');
  assert.equal(discovery.status, 0, 'Original Jest discovery failed');
  const manifest = plan(JSON.parse(discovery.stdout).map(file => path.relative(root, file).split(path.sep).join('/')), launch.source_sha);
  write('manifest.json', manifest);
  const order = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual([...order.paths].sort(), manifest.partitions['3']);
  launch.preflight_ms = performance.now() - started;
  write('launch.json', launch);
  const resultPath = path.join(output, 'jest.json');
  const args = ['--runTestsByPath', ...manifest.partitions['3'], '--json', '--outputFile=' + resultPath,
    '--testSequencer=' + path.join(__dirname, 'original-order-sequencer.cjs'), '--reporters=default',
    '--reporters=' + path.join(__dirname, 'original-order-reporter.cjs')];
  const execution = jest(args, {stdio: 'inherit', env: {...process.env, CI: 'true',
    PRESTIGE_ORIGINAL_ORDER_MANIFEST: manifestPath, PRESTIGE_ORIGINAL_ORDER_OUTPUT: output}});
  const receipt = {launch, manifest, child_exit_code: execution.status, child_signal: execution.signal || null,
    spawn_error_code: execution.error?.code || null, completed_utc: new Date().toISOString(),
    total_launcher_elapsed_ms: performance.now() - started, result: null};
  try { receipt.result = JSON.parse(fs.readFileSync(resultPath, 'utf8')); }
  catch (error) { receipt.result_error = error.code || error.name; }
  try { verifyResult(manifest, '3', receipt.result, execution.status, root); receipt.original_campaign_passed = true; }
  catch (error) { receipt.original_campaign_passed = false; receipt.original_campaign_error = error.message; }
  write('receipt.json', receipt);
  assert.equal(execution.signal, null, 'Diagnostic terminated by signal');
  assert.equal(execution.error, undefined, 'Diagnostic failed to spawn');
  assert.equal(execution.status, 0, 'Original diagnostic workload failed; all results retained');
  assert.equal(receipt.original_campaign_passed, true);
}
try { run(); }
catch (error) {
  if (ownsOutput) write('launcher-error.json', {name: error.name, message: error.message, utc: new Date().toISOString()});
  console.error(error.message);
  process.exitCode = 1;
}
