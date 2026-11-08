// Callback/ordering simulations only: no CRACO discovery, Jest runner or application/test modules.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const Sequencer = require('./original-order-sequencer.cjs');
const Reporter = require('./original-order-reporter.cjs');
const {identityCensus, MANIFEST_SHA256} = Sequencer.contract;
const manifestPath = path.join(__dirname, 'ORIGINAL-ORDER-MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha256(fs.readFileSync(manifestPath)), MANIFEST_SHA256);
assert.equal(process.version, 'v22.23.4');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'prestige-order-selfcheck-'));
const previousEnv = {manifest: process.env.PRESTIGE_ORIGINAL_ORDER_MANIFEST, output: process.env.PRESTIGE_ORIGINAL_ORDER_OUTPUT};
let scenario = 0;
function output() {
  const directory = path.join(scratch, String(++scenario));
  fs.mkdirSync(directory);
  process.env.PRESTIGE_ORIGINAL_ORDER_MANIFEST = manifestPath;
  process.env.PRESTIGE_ORIGINAL_ORDER_OUTPUT = directory;
  return directory;
}
const tests = manifest.paths.map(file => ({path: path.join(process.cwd(), file), context: {config: {rootDir: process.cwd()}}}));
const catalog = new Map();
const baselineFile = process.argv[2];
if (baselineFile) {
  const bytes = fs.readFileSync(baselineFile);
  assert.equal(sha256(bytes), manifest.baseline_jest_sha256);
  for (const suite of JSON.parse(bytes).testResults) {
    const relative = suite.name.slice(suite.name.lastIndexOf('/frontend/') + '/frontend/'.length);
    catalog.set(relative, suite.assertionResults.map(value => ({...value})));
  }
  for (const file of manifest.paths) assert.deepEqual(identityCensus(catalog.get(file)), manifest.cases[file]);
} else {
  // Published self-check needs no historical payload: use synthetic callback identities, never suite execution.
  for (const file of manifest.paths) catalog.set(file, Array.from({length: manifest.cases[file].count}, (_, index) => ({
    fullName: file + ' synthetic case ' + index, title: 'synthetic case ' + index, ancestorTitles: [file],
    status: file === manifest.capacity_path && index < 2 ? 'failed' : 'passed'})));
}
const aggregate = () => ({numTotalTestSuites: 189, numPendingTestSuites: 0, numRuntimeErrorTestSuites: 0,
  numTotalTests: 7307, numPassedTests: 7305, numFailedTests: 2, numPendingTests: 0, numTodoTests: 0,
  wasInterrupted: false, success: false}); // onRunComplete success is not final Jest success.
function configuration(changes = {}) {
  return {maxWorkers: 1, runTestsByPath: true, listTests: false, watch: false, watchAll: false,
    collectCoverage: false, bail: 0, testTimeout: undefined, reporters: [['default', {}], [require.resolve('./original-order-reporter.cjs'), {}]],
    testSequencer: require.resolve('./original-order-sequencer.cjs'), ...changes};
}
function reporter(changes) {
  output();
  const value = new Reporter(configuration(changes));
  if (!baselineFile) value.contract.manifest.cases = Object.fromEntries(manifest.paths.map(file => [file, identityCensus(catalog.get(file))]));
  value.onRunStart();
  return value;
}
function nativeResult(test, cases = catalog.get(Sequencer.contract.normalized(test.path))) {
  return {testFilePath: test.path, testResults: cases, numPassingTests: cases.filter(value => value.status === 'passed').length,
    numFailingTests: cases.filter(value => value.status === 'failed').length,
    numPendingTests: cases.filter(value => value.status === 'pending').length,
    numTodoTests: cases.filter(value => value.status === 'todo').length};
}
try {
  output();
  const sorted = new Sequencer().sort([...tests].reverse());
  assert.deepEqual(sorted.map(test => Sequencer.contract.normalized(test.path)), manifest.paths);
  assert.ok(sorted.every(test => tests.includes(test)), 'Native Test object identities retained');
  for (const selected of [tests.slice(1), [...tests, tests[0]], [...tests.slice(1), {...tests[0], path: path.join(process.cwd(), 'src/extra.test.js')}]]) {
    output();
    assert.throws(() => new Sequencer().sort(selected), /Duplicate selected suite|exact original shard3 set/);
  }
  const duplicate = {fullName: 'group same', title: 'same', ancestorTitles: ['group']};
  const independentDuplicateHash = sha256(JSON.stringify([JSON.stringify(['group same', 'same', ['group']]), JSON.stringify(['group same', 'same', ['group']])]));
  assert.deepEqual(identityCensus([duplicate, duplicate]), {count: 2, identity_sha256: independentDuplicateHash});
  assert.notEqual(identityCensus([duplicate]).identity_sha256, independentDuplicateHash);
  const complete = reporter();
  for (const test of tests) { complete.onTestFileStart(test); complete.onTestFileResult(test, nativeResult(test)); }
  complete.onRunComplete(new Set(), aggregate());
  assert.equal(complete.getLastError(), undefined);
  const receipt = JSON.parse(fs.readFileSync(path.join(complete.contract.output, 'original-order-receipt.json')));
  assert.equal(receipt.order_and_case_invariants_valid, true);
  assert.equal(receipt.native_counts_at_onRunComplete.failed, 2);
  assert.equal(receipt.final_jest_success, 'not inferred from onRunComplete; use final jest.json and child exit code');
  assert.equal(fs.readFileSync(path.join(complete.contract.output, 'suite-starts.jsonl'), 'utf8').trim().split('\n').length, 189);
  for (const changes of [{maxWorkers: 2}, {testTimeout: 5001}, {testNamePattern: 'subset'}, {onlyFailures: true}]) {
    output();
    assert.throws(() => new Reporter(configuration(changes)).onRunStart(), /execution flags/);
  }
  const wrongOrder = reporter();
  assert.throws(() => wrongOrder.onTestFileStart(tests[1]), /suite-start order/);
  wrongOrder.onRunComplete(new Set(), aggregate());
  assert.ok(wrongOrder.getLastError());
  for (const mutation of ['identity', 'skip']) {
    const changed = reporter();
    changed.onTestFileStart(tests[0]);
    const cases = catalog.get(manifest.paths[0]).map(value => ({...value}));
    cases[0] = {...cases[0], ...(mutation === 'identity' ? {fullName: cases[0].fullName + ' altered'} : {status: 'pending'})};
    assert.throws(() => changed.onTestFileResult(tests[0], nativeResult(tests[0], cases)), mutation === 'identity' ? /case identities/ : /Skipped/);
    changed.onRunComplete(new Set(), aggregate());
    assert.ok(changed.getLastError());
  }
  const incomplete = reporter();
  incomplete.onRunComplete(new Set(), {...aggregate(), wasInterrupted: true});
  assert.ok(incomplete.getLastError());
  assert.equal(JSON.parse(fs.readFileSync(path.join(incomplete.contract.output, 'original-order-receipt.json'))).order_and_case_invariants_valid, false);
  console.log(JSON.stringify({kind: 'static callback/sequencer self-check; no application/Jest suites', node: process.version,
    inventory: 189, case_rows_simulated: 7307, identity_source: baselineFile ? 'verified CI338 original case identities' : 'synthetic callback identities',
    checks: ['exact/reversed order', 'missing/duplicate/extra suites', 'duplicate case identities retained', 'all callback census',
      'native failed outcomes retained', 'changed flags/deadline', 'actual start mismatch', 'changed case identity', 'skipped case', 'incomplete/interrupted run'], passed: true}));
} finally {
  for (const [key, value] of [['PRESTIGE_ORIGINAL_ORDER_MANIFEST', previousEnv.manifest], ['PRESTIGE_ORIGINAL_ORDER_OUTPUT', previousEnv.output]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const resolved = fs.realpathSync(scratch);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('prestige-order-selfcheck-'));
  fs.rmSync(resolved, {recursive: true});
}
