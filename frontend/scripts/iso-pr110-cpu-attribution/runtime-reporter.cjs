// Actual-Jest provenance only. CLI flags declare profiling; the driver validates native files after exit.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {performance} = require('node:perf_hooks');

const BASELINE = '2303f958dd0fd8e02881aab3bbd7ac82450be469';
const FRAMEWORKS = ['cis-ig1', 'soc-2', 'iso-27001'];
const CASES = FRAMEWORKS.map(key => key + ' fresh client retains the configured program lifecycle and period evidence');
const MAX_RECEIPT_BYTES = 64 * 1024, MAX_STAT_BYTES = 4096, MAX_ERRORS = 24;
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) ? value : null;
const nonnegative = value => Number.isFinite(value) && value >= 0;
const positiveInteger = value => Number.isSafeInteger(value) && value > 1;
const requireThat = (condition, code) => { if (!condition) throw Error(code); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function readProcessIdentity(files = fs) {
  let fd;
  try {
    fd = files.openSync('/proc/self/stat', 'r');
    const bytes = Buffer.alloc(MAX_STAT_BYTES + 1), count = files.readSync(fd, bytes, 0, bytes.length, 0);
    requireThat(Number.isSafeInteger(count) && count > 0 && count <= MAX_STAT_BYTES, 'proc-stat-size-invalid');
    const text = bytes.toString('utf8', 0, count), close = text.lastIndexOf(')'), open = text.indexOf(' (');
    requireThat(open > 0 && close > open, 'proc-stat-format-invalid');
    const pid = Number(text.slice(0, open)), fields = text.slice(close + 1).trim().split(/\s+/);
    const parent = Number(fields[1]), group = Number(fields[2]);
    requireThat(positiveInteger(pid) && positiveInteger(parent) && positiveInteger(group), 'proc-stat-identities-invalid');
    return {pid, parent, group};
  } finally { if (fd !== undefined) files.closeSync(fd); }
}

function observeRuntime(environment = process.env) {
  const errors = [];let identity = null, timezone = null, hostname = null, cpu = null, parallelism = null, memory = null;
  try { identity = readProcessIdentity(); } catch { errors.push('proc-stat-unavailable'); }
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { errors.push('timezone-unavailable'); }
  try { hostname = os.hostname();cpu = os.cpus()[0]?.model;parallelism = os.availableParallelism();memory = os.totalmem(); }
  catch { errors.push('host-unavailable'); }
  const flags = [...process.execArgv], intervals = flags.filter(value => value.startsWith('--cpu-prof-interval='));
  const directories = flags.filter(value => value.startsWith('--cpu-prof-dir='));
  const interval = intervals.length === 1 && /^--cpu-prof-interval=\d+$/.test(intervals[0]) ? Number(intervals[0].split('=')[1]) : null;
  return {diagnostic_only: true, qualification: false, node: process.version, execPath: process.execPath,
    platform: process.platform, arch: process.arch, timezone, v8: process.versions.v8,
    pid: process.pid, parent_pid: process.ppid, process_group_id: identity?.group ?? null,
    proc_pid: identity?.pid ?? null, proc_parent_pid: identity?.parent ?? null,
    source_sha: sha(environment.CPU_ATTRIBUTION_SOURCE_SHA), application_baseline: sha(environment.CPU_ATTRIBUTION_APP_SHA),
    lifecycle_years: environment.FRAMEWORK_LIFECYCLE_YEARS ?? null,
    synthetic_exports: !!environment.FRAMEWORK_LIFECYCLE_EXPORT_DIR, node_options_present: !!environment.NODE_OPTIONS,
    profiler_enabled: environment.NODE_OPTIONS ? null : flags.includes('--cpu-prof'), profiler_interval_us: interval,
    profile_directory: directories.length === 1 ? directories[0].slice('--cpu-prof-dir='.length) : null,
    execArgv: flags, hostname, cpu_model: cpu, available_parallelism: parallelism, total_memory: memory,
    observation_errors: errors};
}

function validateAdmission(runtime, environment) {
  const errors = [], check = (condition, code) => { if (!condition) errors.push(code); };
  const output = environment.CPU_ATTRIBUTION_OUTPUT, directory = environment.CPU_ATTRIBUTION_PROFILE_DIR;
  const absolute = value => typeof value === 'string' && value.length <= 4096 && path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value;
  check(runtime.node === 'v22.23.4' && runtime.platform === 'linux' && runtime.arch === 'x64' && runtime.timezone === 'UTC', 'runtime-mismatch');
  check(absolute(environment.CPU_ATTRIBUTION_EXPECTED_EXEC_PATH) && runtime.execPath === environment.CPU_ATTRIBUTION_EXPECTED_EXEC_PATH, 'executable-mismatch');
  check(sha(environment.CPU_ATTRIBUTION_SOURCE_SHA) && environment.CPU_ATTRIBUTION_SOURCE_SHA === environment.GITHUB_SHA
    && runtime.source_sha === environment.GITHUB_SHA && runtime.application_baseline === BASELINE
    && environment.CPU_ATTRIBUTION_APP_SHA === BASELINE, 'source-mismatch');
  check(absolute(output) && absolute(directory) && output === directory && runtime.profile_directory === directory, 'profile-directory-mismatch');
  const expected = ['--cpu-prof', '--cpu-prof-dir=' + directory, '--cpu-prof-interval=10000'];
  check(Array.isArray(runtime.execArgv) && runtime.execArgv.length === expected.length
    && expected.every(flag => runtime.execArgv.filter(value => value === flag).length === 1), 'profile-flags-mismatch');
  check(!environment.NODE_OPTIONS && runtime.node_options_present === false && runtime.profiler_enabled === true
    && runtime.profiler_interval_us === 10000, 'profile-declaration-mismatch');
  check(positiveInteger(runtime.pid) && positiveInteger(runtime.parent_pid) && runtime.pid !== runtime.parent_pid
    && runtime.proc_pid === runtime.pid && runtime.proc_parent_pid === runtime.parent_pid
    && runtime.process_group_id === runtime.parent_pid, 'process-ownership-mismatch');
  check(runtime.lifecycle_years === '5' && runtime.synthetic_exports === false, 'workload-mismatch');
  check(typeof runtime.v8 === 'string' && runtime.v8.length > 0 && runtime.v8.length <= 128
    && typeof runtime.hostname === 'string' && runtime.hostname.length > 0 && runtime.hostname.length <= 256
    && typeof runtime.cpu_model === 'string' && runtime.cpu_model.length > 0 && runtime.cpu_model.length <= 256
    && Number.isSafeInteger(runtime.available_parallelism) && runtime.available_parallelism > 0
    && Number.isSafeInteger(runtime.total_memory) && runtime.total_memory > 0, 'host-metadata-missing');
  check(Array.isArray(runtime.observation_errors) && runtime.observation_errors.length === 0, 'runtime-observation-failed');
  return errors;
}

function sampleResources() {
  return {monotonic_ms: performance.now(), hrtime_ns: process.hrtime.bigint().toString(), cpu_usage_us: process.cpuUsage(),
    resource_usage: process.resourceUsage(), memory_usage: process.memoryUsage()};
}
function validSample(value) {
  return nonnegative(value?.monotonic_ms) && typeof value.hrtime_ns === 'string' && /^\d{1,32}$/.test(value.hrtime_ns)
    && ['user', 'system'].every(key => nonnegative(value.cpu_usage_us?.[key]))
    && nonnegative(value.resource_usage?.maxRSS) && value.memory_usage?.rss > 0;
}
function writeRuntimeReceipt(output, record, files = fs) {
  requireThat(typeof output === 'string' && path.isAbsolute(output), 'receipt-output-invalid');
  const directory = files.lstatSync(output);
  requireThat(directory.isDirectory() && !directory.isSymbolicLink(), 'receipt-directory-invalid');
  const text = JSON.stringify(record);
  requireThat(Buffer.byteLength(text) <= MAX_RECEIPT_BYTES, 'receipt-cap-exceeded');
  const destination = path.join(output, 'runtime.json'), temporary = path.join(output, '.runtime-' + process.pid + '.tmp');
  if (files.existsSync(destination)) {
    const prior = files.lstatSync(destination);
    requireThat(prior.isFile() && !prior.isSymbolicLink(), 'receipt-existing-file-invalid');
  }
  let staged = false;
  try {
    files.writeFileSync(temporary, text, {flag: 'wx', mode: 0o600});staged = true;
    files.renameSync(temporary, destination);staged = false;
  } finally { if (staged) try { files.unlinkSync(temporary); } catch {} }
  return true;
}

function createReporter({environment = process.env, observe = () => observeRuntime(environment), sample = sampleResources, write = writeRuntimeReceipt} = {}) {
  return class RuntimeReporter {
    constructor() {
      this.runtime = null;this.endRuntime = null;this.start = null;this.end = null;
      this.errors = [];this.cases = [];this.caseEvents = [];this.admitted = false;this.completed = false;
    }
    error(code) { if (!this.errors.includes(code) && this.errors.length < MAX_ERRORS) this.errors.push(code); }
    captureSample() {
      try { const value = sample();if (!validSample(value)) throw Error('invalid');return value; }
      catch { this.error('resource-observation-failed');return null; }
    }
    publish() {
      const runtime = this.runtime || {diagnostic_only: true, qualification: false};
      const expectedFlags = ['--cpu-prof', '--cpu-prof-dir=' + environment.CPU_ATTRIBUTION_PROFILE_DIR, '--cpu-prof-interval=10000'];
      const publicRuntime = value => {
        const flags = Array.isArray(value.execArgv) ? value.execArgv : [];
        return {...value, execArgv: flags.map(flag => expectedFlags.includes(flag) ? flag : '<unapproved-node-flag>'),
          execArgv_redacted: flags.some(flag => !expectedFlags.includes(flag)),
          profile_directory: value.profile_directory === environment.CPU_ATTRIBUTION_PROFILE_DIR ? value.profile_directory : null};
      };
      const cpu = this.start && this.end ? Object.fromEntries(['user', 'system'].map(key =>
        [key, this.end.cpu_usage_us[key] - this.start.cpu_usage_us[key]])) : null;
      const payload = {...publicRuntime(runtime), admission_valid: this.admitted, completed: this.completed && this.errors.length === 0,
        errors: [...this.errors], cases: [...this.cases], case_events: [...this.caseEvents],
        resource_start: this.start, resource_end: this.end, runtime_end: this.endRuntime ? publicRuntime(this.endRuntime) : null,
        elapsed_ms: this.start && this.end ? this.end.monotonic_ms - this.start.monotonic_ms : null,
        cpu_usage_us: cpu, resource_usage: this.end?.resource_usage ?? null, memory_usage: this.end?.memory_usage ?? null,
        resource_window: 'Reporter onRunStart through onRunComplete; the native CPU profile covers process lifetime.',
        case_duration_window: 'Raw Jest durations include hooks/fixtures; no ISO-only CPU-profile alignment is established.'};
      try { if (write(environment.CPU_ATTRIBUTION_OUTPUT, payload) !== true) throw Error('write refused');return true; }
      catch { this.error('receipt-write-failed');return false; }
    }
    onRunStart() {
      try { this.runtime = observe();for (const code of validateAdmission(this.runtime, environment)) this.error(code); }
      catch { this.error('runtime-observation-failed'); }
      this.start = this.captureSample();this.admitted = this.errors.length === 0;
      const written = this.publish();
      if (!this.admitted || !written) throw Error('CPU attribution admission refused: ' + this.errors.join(','));
    }
    caseRecord(result) {
      const name = CASES.includes(result?.fullName) ? result.fullName : '<unexpected-case>';
      const status = ['passed','failed','pending','skipped','todo','disabled'].includes(result?.status) ? result.status : 'unrecognized';
      const duration_ms = nonnegative(result?.duration) ? result.duration : null;
      if (name === '<unexpected-case>') this.error('case-identity-mismatch');
      if (!['passed', 'failed'].includes(status)) this.error('case-not-executed');
      if (duration_ms === null) this.error('case-duration-missing');
      return {name, status, duration_ms};
    }
    validFile(test) {
      if (typeof test?.path === 'string' && /[\\/]src[\\/]preview[\\/]frameworkFiveYear\.test\.js$/.test(test.path)) return true;
      this.error('test-file-mismatch');return false;
    }
    onTestCaseResult(test, result) {
      if (!this.validFile(test)) {this.publish();return;}
      if (this.caseEvents.length < CASES.length) this.caseEvents.push(this.caseRecord(result));else this.error('case-event-cap-exceeded');
      this.cases = [...this.caseEvents];this.publish();
    }
    onTestResult(test, result) {
      if (!this.validFile(test)) {this.publish();return;}
      if (!Array.isArray(result?.testResults) || result.testResults.length !== CASES.length) this.error('case-count-mismatch');
      this.cases = (Array.isArray(result?.testResults) ? result.testResults.slice(0, CASES.length) : []).map(row => this.caseRecord(row));
      if (!same(this.cases.map(row => row.name), CASES)) this.error('case-order-mismatch');
      if (this.caseEvents.length && !same(this.caseEvents, this.cases)) this.error('case-result-disagreement');
      this.publish();
    }
    onRunComplete() {
      this.end = this.captureSample();
      try {
        this.endRuntime = observe();
        if (validateAdmission(this.endRuntime, environment).length) this.error('runtime-end-invalid');
        const fields = ['node','execPath','platform','arch','timezone','v8','pid','parent_pid','process_group_id','source_sha',
          'application_baseline','lifecycle_years','synthetic_exports','profiler_enabled','profiler_interval_us','profile_directory','execArgv'];
        if (!fields.every(key => same(this.runtime?.[key], this.endRuntime[key]))) this.error('runtime-identity-changed');
      } catch {this.error('runtime-end-unavailable');}
      if (!same(this.cases.map(row => row.name), CASES) || this.cases.some(row => !['passed','failed'].includes(row.status))) this.error('sequence-incomplete');
      if (this.start && this.end && (this.end.monotonic_ms < this.start.monotonic_ms
        || ['user','system'].some(key => this.end.cpu_usage_us[key] < this.start.cpu_usage_us[key]))) this.error('resource-clock-reversed');
      this.completed = this.admitted && this.errors.length === 0;this.publish();
    }
    getLastError() { return this.errors.length ? Error('CPU attribution receipt incomplete: ' + this.errors.join(',')) : undefined; }
  };
}

module.exports = createReporter();
Object.defineProperty(module.exports, '_test', {value: {createReporter, observeRuntime, validateAdmission, readProcessIdentity,
  sampleResources, writeRuntimeReceipt, BASELINE, CASES, MAX_RECEIPT_BYTES, MAX_STAT_BYTES}});
