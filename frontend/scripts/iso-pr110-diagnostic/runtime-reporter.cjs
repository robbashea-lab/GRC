// Runtime provenance only. The normal gate does not install phase observers.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {performance} = require('node:perf_hooks');

class FrontendRuntimeReporter {
  constructor() {
    this.output = process.env.FRONTEND_RUNTIME_RECEIPT;
    this.started = performance.now();
    this.cpu = process.cpuUsage();
    this.cases = [];
    // CRACO launches another Node process; its Jest process must stay in our owned group.
    let processGroup = null;
    try {
      const stat = fs.readFileSync('/proc/self/stat', 'utf8');
      const end = stat.lastIndexOf(')');
      if (end < 1) throw Error('Invalid process status');
      processGroup = Number(stat.slice(end + 2).trim().split(/\s+/)[2]);
      if (!Number.isSafeInteger(processGroup) || processGroup <= 1) throw Error('Invalid group');
    } catch { this.groupUnavailable = true; }
    this.metadata = {
      node: process.version,
      execPath: process.execPath,
      pid: process.pid,
      parent_pid: process.ppid,
      process_group_id: processGroup,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      source_sha: process.env.GITHUB_SHA || null,
      application_baseline: '9824384552c579099fad53528b738467a6d5f677',
      phase_logging: Boolean(process.env.ISO_PHASE_LOG_DIR),
      synthetic_exports: Boolean(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR),
      lifecycle_years: process.env.FRAMEWORK_LIFECYCLE_YEARS || '5',
      available_parallelism: os.availableParallelism(),
      cpu_model: os.cpus()[0]?.model || null,
      total_memory: os.totalmem(),
      startup_free_memory: os.freemem(),
    };
  }
  write(extra = {}) {
    if (!this.output) return;
    // A failed provenance write must fail the runner's subsequent receipt check.
    try {
      fs.mkdirSync(path.dirname(this.output), {recursive: true});
      fs.writeFileSync(this.output, JSON.stringify({...this.metadata, ...extra, cases: this.cases}, null, 2));
    } catch {
      this.writeFailed = true;
      process.stderr.write('Frontend runtime provenance write failed.\n');
    }
  }
  onRunStart() { this.write({completed: false}); }
  onTestCaseResult(test, result) {
    if (!/[\\/]src[\\/]preview[\\/]frameworkFiveYear\.test\.js$/.test(test.path)) return;
    this.cases.push({name: result.fullName, status: result.status, duration_ms: result.duration ?? null});
    this.write({completed: false});
  }
  onTestResult(test, result) {
    if (!this.cases.length && /[\\/]src[\\/]preview[\\/]frameworkFiveYear\.test\.js$/.test(test.path)) {
      this.cases = result.testResults.map(value => ({name: value.fullName, status: value.status, duration_ms: value.duration ?? null}));
      this.write({completed: false});
    }
  }
  onRunComplete() {
    this.write({completed: !this.writeFailed && !this.groupUnavailable, elapsed_ms: performance.now() - this.started,
      cpu_usage_us: process.cpuUsage(this.cpu), resource_usage: process.resourceUsage(), memory_usage: process.memoryUsage()});
  }
  getLastError() { return this.writeFailed || this.groupUnavailable ? new Error('Frontend runtime provenance is incomplete') : undefined; }
}
module.exports = FrontendRuntimeReporter;
