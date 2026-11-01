const {test} = require('node:test'), assert = require('node:assert/strict');
const {calibrate} = require('./setup.cjs');
test('calibration preserves all five raw blocks, exact delegation and bounded synthetic writes', () => {
  const writes = [];let time = 0;
  const result = calibrate((name, value, options) => {writes.push({name, value, options});return true;}, undefined, () => ++time);
  assert.equal(result.valid, true);assert.equal(result.blocks.length, 5);
  assert.ok(result.blocks.every(block => block.observer_valid && block.observed_count === 1000 && block.unobserved_count === 1000));
  assert.equal(writes.length, 8);assert.equal(result.io.bytes, 32768);assert.ok(writes.every(row => row.options.maxBytes === 4096));
});
test('artifact failure and slow screen refuse calibration rather than drop their outcomes', () => {
  const failed = calibrate(() => false);assert.equal(failed.valid, false);assert.equal(failed.io.writes, 0);
  let time = 0;const slow = calibrate(() => true, undefined, () => time += 100);
  assert.equal(slow.valid, false);assert.ok(slow.blocks.every(row => row.observed_ms === 100));
});
