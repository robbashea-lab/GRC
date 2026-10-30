const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const {plan, audit, verifyRuntime, pinnedNodeEnvironment, LIFECYCLE_SUITES, SHARDS} = require('./frontend-campaign.cjs');
const sha = 'a'.repeat(40), root = path.resolve('frontend');
const lifecycleFiles = Object.values(LIFECYCLE_SUITES);
function runtimeReceipt() {
  return {node: process.version, execPath: process.execPath, source_sha: sha,
    phase_logging: false, synthetic_exports: false, lifecycle_years: '5', completed: true};
}
function receipts() {
  const manifest = plan([...lifecycleFiles, 'src/a.test.js', 'src/b.test.js', 'src/c.test.js', 'src/new.test.jsx'], sha);
  return SHARDS.map(shard => ({manifest, shard, exitCode: 0, frontendRoot: root,
    runtime: runtimeReceipt(), result: {
    success: true, wasInterrupted: false, numTotalTestSuites: manifest.partitions[shard].length,
    numPassedTestSuites: manifest.partitions[shard].length, numFailedTestSuites: 0,
    numPendingTestSuites: 0, numRuntimeErrorTestSuites: 0,
    testResults: manifest.partitions[shard].map(file => ({name: path.join(root, file), status: 'passed'})),
  }}));
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

test('runtime pin keeps Unix PATH semantics, unrelated environment and the caller object', () => {
  const environment = {PATH: '/wrong/runtime:/usr/bin', Path: 'case-sensitive-value', CI: 'false', MARKER: 'retained'};
  const original = {...environment};
  assert.deepEqual(pinnedNodeEnvironment(environment, '/approved runtime/bin/node', 'linux'), {
    ...environment, PATH: '/approved runtime/bin:/wrong/runtime:/usr/bin', CI: 'true',
  });
  assert.deepEqual(environment, original);
  assert.equal(pinnedNodeEnvironment({}, '/approved/bin/node', 'linux').PATH, '/approved/bin');
  assert.equal(pinnedNodeEnvironment({PATH: ''}, '/approved/bin/node', 'linux').PATH, '/approved/bin');
});

test('Windows pin handles spaces and every native PATH casing without shell quoting', () => {
  for (const key of ['PATH', 'Path', 'path']) {
    const environment = {[key]: 'C:\\Other Node;C:\\Windows', SystemRoot: 'C:\\Windows'};
    assert.deepEqual(pinnedNodeEnvironment(environment, 'C:\\Approved Node\\node.exe', 'win32'), {
      ...environment, [key]: 'C:\\Approved Node;C:\\Other Node;C:\\Windows', CI: 'true',
    });
  }
});

test('Windows duplicate PATH keys preserve Node selection and leave one pinned variant', () => {
  const environment = {path: 'ignored-lowercase', Path: 'ignored-titlecase', PATH: 'first-path', OTHER: 'retained'};
  assert.deepEqual(pinnedNodeEnvironment(environment, 'C:\\Approved Node\\node.exe', 'win32'), {
    PATH: 'C:\\Approved Node;first-path', OTHER: 'retained', CI: 'true',
  });
  assert.deepEqual(environment, {path: 'ignored-lowercase', Path: 'ignored-titlecase', PATH: 'first-path', OTHER: 'retained'});
});

test('a literal-node grandchild uses the campaign executable despite an unusable caller PATH', () => {
  const environment = {...process.env, CI: 'false', FRONTEND_RUNTIME_TEST_MARKER: 'retained'};
  for (const key of Object.keys(environment)) if (process.platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH') delete environment[key];
  environment.PATH = path.join(os.tmpdir(), 'governara-unavailable-node-path-' + process.pid);
  const source = `const {spawnSync} = require('node:child_process');
    const child = spawnSync('node', ['-e', 'console.log(JSON.stringify({execPath: process.execPath, node: process.version, CI: process.env.CI, marker: process.env.FRONTEND_RUNTIME_TEST_MARKER}))'], {encoding: 'utf8'});
    console.log(JSON.stringify({status: child.status, error: child.error?.code, output: child.stdout}));`;
  const unpinned = childProcess.spawnSync(process.execPath, ['-e', source], {encoding: 'utf8', env: environment});
  assert.equal(unpinned.status, 0, unpinned.stderr);
  assert.equal(JSON.parse(unpinned.stdout).error, 'ENOENT');
  const pinned = childProcess.spawnSync(process.execPath, ['-e', source], {encoding: 'utf8', env: pinnedNodeEnvironment(environment)});
  assert.equal(pinned.status, 0, pinned.stderr);
  const nested = JSON.parse(pinned.stdout);
  assert.equal(nested.status, 0);
  assert.equal(nested.error, undefined);
  assert.deepEqual(JSON.parse(nested.output), {execPath: process.execPath, node: process.version, CI: 'true', marker: 'retained'});
});

test('every shard fails closed for missing, foreign-source or mismatched actual runtime evidence', () => {
  for (const shard of SHARDS) for (const mutate of [
    row => delete row.runtime,
    row => row.runtime = null,
    row => row.runtime.node = 'v0.0.0',
    row => row.runtime.execPath = path.resolve('unrelated-node'),
    row => row.runtime.execPath = path.basename(process.execPath),
    row => delete row.runtime.execPath,
    row => row.runtime.source_sha = 'b'.repeat(40),
    row => row.runtime.phase_logging = true,
    row => delete row.runtime.phase_logging,
    row => row.runtime.synthetic_exports = true,
    row => delete row.runtime.synthetic_exports,
    row => row.runtime.lifecycle_years = '3',
    row => delete row.runtime.lifecycle_years,
    row => row.runtime.completed = false,
    row => delete row.runtime.completed,
  ]) {
    const rows = receipts(); mutate(rows.find(row => row.shard === shard));
    assert.throws(() => audit(rows, sha));
  }
  assert.doesNotThrow(() => verifyRuntime(runtimeReceipt(), sha));
  if (process.platform === 'win32') assert.doesNotThrow(() => verifyRuntime({...runtimeReceipt(), execPath: process.execPath.toUpperCase()}, sha));
});

function mockedCampaign(t, {writeRuntime = true, writeResult = true, inheritedEnvironment = {}} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'governara-campaign-'));
  const modulePath = require.resolve('./frontend-campaign.cjs'), savedModule = require.cache[modulePath];
  const originalEnvironment = Object.fromEntries(['GITHUB_SHA', ...Object.keys(inheritedEnvironment)].map(key => [key, process.env[key]])), calls = [];
  Object.assign(process.env, inheritedEnvironment, {GITHUB_SHA: sha});
  t.mock.method(childProcess, 'spawnSync', (executable, args, options) => {
    calls.push({executable, args, options});
    if (args.includes('--listTests')) return {status: 0, stdout: JSON.stringify(receipts()[0].manifest.discovered), stderr: ''};
    const receipt = receipts().find(row => row.shard === 'framework-five-year');
    const result = {...receipt.result, testResults: receipt.manifest.partitions[receipt.shard].map(file => ({name: path.resolve(file), status: 'passed'}))};
    if (writeResult) fs.writeFileSync(path.join(directory, 'jest.json'), JSON.stringify(result));
    if (writeRuntime) fs.writeFileSync(options.env.FRONTEND_RUNTIME_RECEIPT, JSON.stringify(receipt.runtime));
    return {status: 0};
  });
  delete require.cache[modulePath];
  const campaign = require(modulePath);
  t.after(() => {
    require.cache[modulePath] = savedModule;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    // Remove only files created by this fixture; rmdir never recursively deletes other data.
    for (const name of ['manifest.json', 'jest.json', 'runtime.json', 'receipt.json']) fs.rmSync(path.join(directory, name), {force: true});
    fs.rmdirSync(directory);
  });
  return {campaign, directory, calls};
}

test('campaign pins discovery and execution but reports the actual runtime only for execution', t => {
  const {campaign, directory, calls} = mockedCampaign(t, {inheritedEnvironment: {
    ISO_PHASE_LOG_DIR: 'inherited-phase-log', FRAMEWORK_LIFECYCLE_EXPORT_DIR: 'inherited-export', FRAMEWORK_LIFECYCLE_YEARS: '3',
  }});
  campaign.run('framework-five-year', directory);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.executable, process.execPath);
    assert.equal(call.options.cwd, process.cwd());
    const expectedEnvironment = {...process.env};
    if (call === calls[1]) {
      delete expectedEnvironment.ISO_PHASE_LOG_DIR;
      delete expectedEnvironment.FRAMEWORK_LIFECYCLE_EXPORT_DIR;
      Object.assign(expectedEnvironment, {FRONTEND_RUNTIME_RECEIPT: path.resolve(directory, 'runtime.json'), FRAMEWORK_LIFECYCLE_YEARS: '5'});
    }
    assert.deepEqual(call.options.env, pinnedNodeEnvironment(expectedEnvironment));
    assert.deepEqual(call.args.slice(0, 4), [require.resolve('@craco/craco/dist/bin/craco.js'), 'test', '--watchAll=false', '--runInBand']);
  }
  assert.deepEqual(calls[0].args.slice(4), ['--listTests', '--json']);
  assert.deepEqual(calls[1].args.slice(4), ['--runTestsByPath', LIFECYCLE_SUITES['framework-five-year'], '--json',
    '--outputFile=' + path.resolve(directory, 'jest.json'), '--reporters=default',
    '--reporters=' + path.join(__dirname, 'frontend-runtime-reporter.cjs')]);
  assert.equal(calls[1].options.stdio, 'inherit');
  const saved = JSON.parse(fs.readFileSync(path.join(directory, 'receipt.json'), 'utf8'));
  assert.deepEqual(saved.runtime, runtimeReceipt());
});

test('an old runtime file cannot certify a new execution whose reporter wrote nothing', t => {
  const {campaign, directory} = mockedCampaign(t, {writeRuntime: false});
  fs.writeFileSync(path.join(directory, 'runtime.json'), JSON.stringify(runtimeReceipt()));
  assert.throws(() => campaign.run('framework-five-year', directory), /Fresh Jest runtime receipt missing/);
  assert.equal(fs.existsSync(path.join(directory, 'runtime.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'receipt.json')), false);
});

test('fresh runtime evidence cannot certify stale results from an earlier execution', t => {
  const {campaign, directory} = mockedCampaign(t, {writeResult: false});
  fs.writeFileSync(path.join(directory, 'jest.json'), JSON.stringify(receipts()[0].result));
  fs.writeFileSync(path.join(directory, 'receipt.json'), JSON.stringify(receipts()[0]));
  assert.throws(() => campaign.run('framework-five-year', directory), /Jest result file missing/);
  assert.equal(fs.existsSync(path.join(directory, 'jest.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'receipt.json')), false);
});
