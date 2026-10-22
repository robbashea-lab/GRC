const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {plan, audit, LIFECYCLE_SUITES, SHARDS} = require('./frontend-campaign.cjs');
const sha = 'a'.repeat(40), root = path.resolve('frontend');
const lifecycleFiles = Object.values(LIFECYCLE_SUITES);
function receipts() {
  const manifest = plan([...lifecycleFiles, 'src/a.test.js', 'src/b.test.js', 'src/c.test.js', 'src/new.test.jsx'], sha);
  return SHARDS.map(shard => ({manifest, shard, exitCode: 0, frontendRoot: root, result: {
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
