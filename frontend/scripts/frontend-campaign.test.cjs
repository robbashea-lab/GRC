const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {plan, audit, LONG_SUITE, SHARDS} = require('./frontend-campaign.cjs');
const sha = 'a'.repeat(40), root = path.resolve('frontend');
function receipts() {
  const manifest = plan([LONG_SUITE, 'src/a.test.js', 'src/b.test.js', 'src/c.test.js', 'src/new.test.jsx'], sha);
  return SHARDS.map(shard => ({manifest, shard, exitCode: 0, frontendRoot: root, result: {
    success: true, wasInterrupted: false, numTotalTestSuites: manifest.partitions[shard].length,
    numPassedTestSuites: manifest.partitions[shard].length, numFailedTestSuites: 0,
    numPendingTestSuites: 0, numRuntimeErrorTestSuites: 0,
    testResults: manifest.partitions[shard].map(file => ({name: path.join(root, file), status: 'passed'})),
  }}));
}
test('deterministic discovery assigns every suite once, including newly discovered suites', () => {
  const rows = receipts();
  assert.equal(audit(rows, sha).suites, 5);
  assert.deepEqual(plan([...rows[0].manifest.discovered].reverse(), sha), rows[0].manifest);
  assert.deepEqual(rows[0].manifest.partitions['ten-year'], [LONG_SUITE]);
});
test('missing long suite, duplicate discovery and empty partitions fail closed', () => {
  assert.throws(() => plan(['src/a.test.js'], sha));
  assert.throws(() => plan([LONG_SUITE, LONG_SUITE], sha));
  assert.throws(() => plan([LONG_SUITE, 'src/a.test.js'], sha));
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
