// Diagnostic observers do not change test bodies, deadlines, outcome status or native reporters.
const fs = require('node:fs');
const path = require('node:path');
const {loadContract, normalized, identityCensus, same, requireThat} = require('./original-order-sequencer.cjs').contract;

class OriginalOrderReporter {
  constructor(globalConfig) {
    const started = process.hrtime.bigint();
    this.contract = loadContract();
    this.config = globalConfig;
    this.starts = [];
    this.results = [];
    this.errors = [];
    this.active = null;
    this.completed = false;
    this.observerNs = 0n;
    this.initializedNs = process.hrtime.bigint() - started;
  }
  fail(message) {
    this.errors.push(message);
    throw new Error(message);
  }
  onRunStart() {
    const config = this.config;
    requireThat(process.version === this.contract.manifest.expected_node, 'Actual Jest child is not Node22.23.4');
    requireThat(require(require.resolve('@jest/test-sequencer/package.json', {paths: [process.cwd()]})).version === '27.5.1', 'Actual Jest version differs');
    requireThat(config.maxWorkers === 1 && config.runTestsByPath === true && config.listTests === false
      && config.watch === false && config.watchAll === false && config.collectCoverage === false
      && !config.testNamePattern && !config.onlyFailures && !config.filter && !config.detectLeaks
      && !config.detectOpenHandles && !config.logHeapUsage && config.bail === 0
      && (config.testTimeout === undefined || config.testTimeout === 5000), 'Jest execution flags/default timeout differ');
    requireThat(same(config.reporters, [['default', {}], [__filename, {}]]), 'Retain exactly the default and diagnostic reporters');
    requireThat(config.testSequencer === path.join(__dirname, 'original-order-sequencer.cjs'), 'Explicit sequencer not selected');
    this.startedNs = process.hrtime.bigint();
    this.startedUtc = new Date().toISOString();
    this.startResources = {cpu_us: process.cpuUsage(), memory_bytes: process.memoryUsage(), resource_usage: process.resourceUsage()};
    this.journal = fs.openSync(path.join(this.contract.output, 'suite-starts.jsonl'), 'wx');
    this.writeReceipt(null);
  }
  onTestFileStart(test) {
    const started = process.hrtime.bigint();
    try {
      const file = normalized(test.path), index = this.starts.length;
      const entry = {index_one_based: index + 1, path: file, elapsed_ms: Number(started - this.startedNs) / 1e6,
        utc: new Date().toISOString(), expected_path: this.contract.manifest.paths[index] || null};
      this.starts.push(entry);
      fs.writeSync(this.journal, JSON.stringify(entry) + '\n');
      if (test.context.config.rootDir !== process.cwd()) this.fail('Suite project root changed');
      if (this.active !== null) this.fail('Overlapping suite starts violate serial execution');
      if (file !== entry.expected_path) this.fail('Actual suite-start order differs at position ' + entry.index_one_based);
      this.active = file;
    } finally { this.observerNs += process.hrtime.bigint() - started; }
  }
  onTestFileResult(test, result) {
    const started = process.hrtime.bigint();
    try {
      const file = normalized(test.path), index = this.results.length;
      if (this.active !== file || normalized(result.testFilePath) !== file
        || file !== this.contract.manifest.paths[index]) this.fail('Suite-result boundary/order differs');
      const census = identityCensus(result.testResults), expected = this.contract.manifest.cases[file];
      const statuses = Object.fromEntries(['passed', 'failed', 'pending', 'todo'].map(status => [status, result.testResults.filter(value => value.status === status).length]));
      this.results.push({path: file, ...census, statuses, test_exec_error: !!result.testExecError});
      if (!same(census, expected)) this.fail('Original per-suite case identities/count changed: ' + file);
      if (statuses.pending || statuses.todo || statuses.passed + statuses.failed !== census.count) this.fail('Skipped/todo/unknown case result: ' + file);
      if (result.numPassingTests !== statuses.passed || result.numFailingTests !== statuses.failed
        || result.numPendingTests !== 0 || result.numTodoTests !== 0) this.fail('Native case status accounting differs: ' + file);
      this.active = null;
    } finally { this.observerNs += process.hrtime.bigint() - started; }
  }
  onRunComplete(_contexts, result) {
    const checks = [
      [this.starts.length === 189 && same(this.starts.map(value => value.path), this.contract.manifest.paths), 'Incomplete actual suite-start inventory/order'],
      [this.results.length === 189 && same(this.results.map(value => value.path), this.contract.manifest.paths), 'Incomplete suite-result inventory/order'],
      [this.active === null, 'Unfinished suite execution boundary'],
      [this.results.reduce((sum, value) => sum + value.count, 0) === 7307, 'Original7307-case census incomplete'],
      [result.numTotalTestSuites === 189 && result.numPendingTestSuites === 0 && result.numRuntimeErrorTestSuites === 0, 'Native suite census incomplete'],
      [result.numTotalTests === 7307 && result.numPendingTests === 0 && result.numTodoTests === 0
        && result.numPassedTests + result.numFailedTests === 7307, 'Native7307-case accounting incomplete'],
      [result.wasInterrupted === false, 'Jest run interrupted'],
    ];
    for (const [valid, message] of checks) if (!valid) this.errors.push(message);
    this.completed = true;
    if (this.journal !== undefined) { fs.closeSync(this.journal); this.journal = undefined; }
    this.writeReceipt(result);
  }
  writeReceipt(result) {
    fs.writeFileSync(path.join(this.contract.output, 'original-order-receipt.json'), JSON.stringify({schema_version: 1,
      kind: 'diagnostic-only suite dispatch/case census; not qualification', completed: this.completed,
      source_sha: process.env.GITHUB_SHA || null, manifest_sha256: this.contract.manifest_sha256,
      runtime: {node: process.version, exec_path: process.execPath, platform: process.platform, arch: process.arch,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone},
      whole_child_process_resources: {start: this.startResources,
        at_receipt: {cpu_us: process.cpuUsage(), memory_bytes: process.memoryUsage(), resource_usage: process.resourceUsage()},
        attribution: 'whole child process including GC/native threads; not exclusive suite/function allocation'},
      started_utc: this.startedUtc, recorded_utc: new Date().toISOString(),
      configured_test_timeout_ms: this.config.testTimeout ?? null,
      effective_unconfigured_circus_default_ms: 5000,
      start_boundary: 'awaited Jest27 onTestFileStart dispatch immediately before runTest; not VM/module/hook/body entry',
      starts: this.starts, results: this.results, invariant_errors: this.errors,
      order_and_case_invariants_valid: this.completed && this.errors.length === 0,
      native_counts_at_onRunComplete: result ? {suites: result.numTotalTestSuites, cases: result.numTotalTests,
        passed: result.numPassedTests, failed: result.numFailedTests, pending: result.numPendingTests, todo: result.numTodoTests,
        interrupted: result.wasInterrupted} : null,
      final_jest_success: 'not inferred from onRunComplete; use final jest.json and child exit code',
      observer: {initialization_ms: Number(this.initializedNs) / 1e6, completed_start_result_callbacks_ms: Number(this.observerNs) / 1e6,
        final_receipt_serialization_write_excluded: true,
        limitations: ['Callback entry/final counter bookkeeping, run-start/finalization writes and module loading are not fully measured.',
          'One synchronous small journal append per suite start and per-suite identity hashing may affect scheduling, caches and GC.',
          'Hard termination can prevent the final receipt; the retained journal alone does not prove completion.',
          'Matching the saved result-order sequence does not reconstruct historical VM starts, host load or original timeout cause.']}
    }, null, 2));
  }
  getLastError() {
    if (!this.completed || this.errors.length) return new Error(this.errors.join(' | ') || 'Original-order diagnostic did not complete');
  }
}
module.exports = OriginalOrderReporter;
