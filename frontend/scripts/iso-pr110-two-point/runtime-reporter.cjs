// Actual-Jest provenance for this standalone measurement; never a release receipt.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {performance} = require('node:perf_hooks');
const {createArtifactWriter} = require('./artifact-writer.cjs');
class RuntimeReporter {
  constructor() {
    const output = process.env.FRONTEND_RUNTIME_RECEIPT;
    this.started = performance.now(); this.cpu = process.cpuUsage(); this.cases = [];
    this.invalid = false;
    this.writer = output ? createArtifactWriter(path.dirname(output), () => { this.invalid = true; }, fs,
      {budgetRoot: path.dirname(path.dirname(output))}) : null;
    this.name = output ? path.basename(output) : null;
    let group = null;
    try {
      const stat = fs.readFileSync('/proc/self/stat', 'utf8'), end = stat.lastIndexOf(')');
      if (end < 1) throw Error('Missing process status');
      group = Number(stat.slice(end + 2).trim().split(/\s+/)[2]);
      if (!Number.isSafeInteger(group) || group <= 1) throw Error('Invalid process group');
    } catch { this.invalid = true; }
    this.metadata = {diagnostic_only: true, qualification: false, node: process.version, execPath: process.execPath,
      pid: process.pid, parent_pid: process.ppid, process_group_id: group, v8: process.versions.v8,
      platform: process.platform, arch: process.arch, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      source_sha: process.env.GITHUB_SHA || null, application_baseline: '2303f958dd0fd8e02881aab3bbd7ac82450be469',
      two_point_logging: !!process.env.ISO_TWO_POINT_OUTPUT, phase_logging: !!process.env.ISO_PHASE_LOG_DIR,
      synthetic_exports: !!process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR,
      lifecycle_years: process.env.FRAMEWORK_LIFECYCLE_YEARS || '5',
      available_parallelism: os.availableParallelism(), cpu_model: os.cpus()[0]?.model || null,
      total_memory: os.totalmem(), startup_free_memory: os.freemem()};
  }
  write(extra) {
    if (!this.writer) { this.invalid = true; return; }
    if (!this.writer(this.name, {...this.metadata, ...extra, cases: this.cases}, {maxBytes: 64 * 1024, final: true})) this.invalid = true;
  }
  onRunStart() { this.write({completed: false}); }
  onTestCaseResult(test, result) {
    if (/[\\/]src[\\/]preview[\\/]frameworkFiveYear\.test\.js$/.test(test.path)) {
      this.cases.push({name: result.fullName, status: result.status, duration_ms: result.duration ?? null});
      this.write({completed: false});
    }
  }
  onTestResult(test, result) {
    if (/[\\/]src[\\/]preview[\\/]frameworkFiveYear\.test\.js$/.test(test.path)) {
      this.cases = result.testResults.map(value => ({name: value.fullName, status: value.status, duration_ms: value.duration ?? null}));
      this.write({completed: false});
    }
  }
  onRunComplete() {
    this.write({completed: !this.invalid, elapsed_ms: performance.now() - this.started,
      cpu_usage_us: process.cpuUsage(this.cpu), resource_usage: process.resourceUsage(), memory_usage: process.memoryUsage()});
  }
  getLastError() { return this.invalid ? Error('Two-point runtime provenance is incomplete') : undefined; }
}
module.exports = RuntimeReporter;
