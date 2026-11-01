// Passive provenance for the normal five-year shard; no application or phase observers.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {createHash} = require('node:crypto');

const TARGET = 'src/preview/frameworkFiveYear.test.js';
const MAX_FILES = 16, MAX_FILE_BYTES = 4 * 1024 * 1024, MAX_SNAPSHOT_BYTES = 32768, MAX_RECEIPT_BYTES = 65536;
const ENV_CLASSES = ['unset', 'empty', 'test', 'production', 'other'];
const PROJECT_FIELDS = ['name', 'rootDir', 'roots', 'testEnvironment', 'testRunner', 'runner', 'setupFiles', 'setupFilesAfterEnv',
  'transform', 'moduleNameMapper', 'transformIgnorePatterns', 'resetMocks', 'clearMocks', 'restoreMocks', 'resetModules',
  'cache', 'cacheDirectory', 'testMatch'];
const GLOBAL_FIELDS = ['maxWorkers', 'collectCoverage', 'watch', 'watchAll', 'listTests', 'runTestsByPath',
  'testNamePattern', 'detectLeaks', 'detectOpenHandles', 'logHeapUsage', 'bail', 'reporters'];
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const classify = value => value === undefined ? 'unset' : value === '' ? 'empty' : ['test', 'production'].includes(value) ? value : 'other';
const selected = (value, fields) => Object.fromEntries(fields.map(key => [key, value[key] ?? null]));
function requireAdmission(condition, code) {
  if (!condition) throw Object.assign(new Error('Frontend runtime admission rejected'), {admissionCode: code});
}
function earlyEnvironment(env) {
  let value;
  try { value = JSON.parse(env.FRONTEND_RUNTIME_EARLY_ENV); } catch { requireAdmission(false, 'EARLY_ENVIRONMENT'); }
  requireAdmission(value && same(Object.keys(value).sort(), ['babel_env', 'node_env'])
    && ENV_CLASSES.includes(value.node_env) && ENV_CLASSES.includes(value.babel_env), 'EARLY_ENVIRONMENT');
  requireAdmission(['unset', 'empty', 'test'].includes(value.node_env)
    && ['unset', 'empty', 'test'].includes(value.babel_env), 'EARLY_ENVIRONMENT');
  return {node_env: value.node_env, babel_env: value.babel_env};
}
function startupFlags() {
  const jasmine = process.env.JEST_JASMINE;
  return {exec_argv_count: process.execArgv.length, exec_argv_empty: process.execArgv.length === 0,
    node_options_present: Object.hasOwn(process.env, 'NODE_OPTIONS'), node_options_nonempty: !!process.env.NODE_OPTIONS,
    v8_coverage_enabled: !!process.env.NODE_V8_COVERAGE,
    jest_jasmine: jasmine === undefined ? 'unset' : jasmine === '' ? 'empty' : jasmine === '1' ? 'one' : 'other'};
}
function nativeProject(root) {
  const inRoot = relative => path.join(root, relative);
  // Selected from the preserved approved native configuration, not stock CRA.
  return {
    rootDir: root, roots: [inRoot('src')],
    testEnvironment: inRoot('node_modules/jest-environment-jsdom/build/index.js'),
    testRunner: inRoot('node_modules/jest-circus/runner.js'), runner: inRoot('node_modules/jest-runner/build/index.js'),
    setupFiles: [inRoot('node_modules/react-app-polyfill/jsdom.js')], setupFilesAfterEnv: [inRoot('src/setupTests.js')],
    transform: [
      ['^.+\\.(js|jsx|mjs|cjs|ts|tsx)$', inRoot('node_modules/@craco/craco/dist/lib/features/jest/jest-babel-transform.js'), {}],
      ['^.+\\.css$', inRoot('node_modules/react-scripts/config/jest/cssTransform.js'), {}],
      ['^(?!.*\\.(js|jsx|mjs|cjs|ts|tsx|css|json)$)', inRoot('node_modules/react-scripts/config/jest/fileTransform.js'), {}],
    ],
    moduleNameMapper: [
      ['^react-native$', 'react-native-web'], ['^.+\\.module\\.(css|sass|scss)$', 'identity-obj-proxy'],
      ['^src/(.*)$', inRoot('src/$1')], ['^@/(.*)$', inRoot('src/$1')],
      ['^@catalogs/(.*)$', path.resolve(root, '../shared/catalogs/$1')], ['^@contracts/(.*)$', path.resolve(root, '../shared/contracts/$1')],
      ['^react-router/dom$', inRoot('node_modules/react-router/dist/development/dom-export.js')],
      ['^react-router-dom$', inRoot('node_modules/react-router-dom/dist/index.js')],
    ],
    transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\].+\\.(js|jsx|mjs|cjs|ts|tsx)$', '^.+\\.module\\.(css|sass|scss)$'],
    resetMocks: true, clearMocks: false, restoreMocks: false, resetModules: false, cache: true,
    testMatch: [inRoot('src/**/__tests__/**/*.{js,jsx,ts,tsx}'), inRoot('src/**/*.{spec,test}.{js,jsx,ts,tsx}')],
  };
}
function captureEnvelope(globalConfig, test) {
  const cwd = process.cwd(), config = test?.context?.config;
  requireAdmission(config && path.isAbsolute(cwd) && config.rootDir === cwd && test.path === path.join(cwd, TARGET), 'PROJECT_IDENTITY');
  requireAdmission(typeof config.name === 'string' && /^[a-f0-9]{32}$/.test(config.name)
    && typeof config.cacheDirectory === 'string' && path.isAbsolute(config.cacheDirectory) && config.cacheDirectory.length <= 4096
    && /^jest(?:_[a-z0-9]+)?$/.test(path.basename(config.cacheDirectory)), 'PROJECT_IDENTITY');
  const project = selected(config, PROJECT_FIELDS), global = selected(globalConfig, GLOBAL_FIELDS);
  for (const [field, value] of Object.entries(nativeProject(cwd))) requireAdmission(same(project[field], value), 'NATIVE_PROJECT_CONFIGURATION');
  requireAdmission(same(global, {maxWorkers: 1, collectCoverage: false, watch: false, watchAll: false, listTests: false,
    runTestsByPath: true, testNamePattern: null, detectLeaks: false, detectOpenHandles: false, logHeapUsage: false, bail: 0,
    reporters: [['default', {}], [path.join(cwd, 'scripts/frontend-runtime-reporter.cjs'), {}]]}), 'NATIVE_GLOBAL_CONFIGURATION');
  const craco = config.globals?._cracoConfig;
  const slotTypes = values => (values || []).map(value => value === null ? 'null' : typeof value);
  requireAdmission(craco && same(Object.keys(config.globals), ['_cracoConfig']) && Array.isArray(craco.babel?.plugins)
    && (!craco.babel.presets || Array.isArray(craco.babel.presets)), 'BABEL_CONFIGURATION');
  const babel_globals = {addPresets: craco.jest?.babel?.addPresets, addPlugins: craco.jest?.babel?.addPlugins,
    plugin_slots: slotTypes(craco.babel.plugins), preset_slots: slotTypes(craco.babel.presets)};
  // CLI JSON serializes the configured function slot as null; it does not prove execution.
  requireAdmission(same(babel_globals, {addPresets: true, addPlugins: true, plugin_slots: ['null'], preset_slots: []}), 'BABEL_CONFIGURATION');
  const early_environment = earlyEnvironment(process.env);
  const inner_environment = {node_env: classify(process.env.NODE_ENV), babel_env: classify(process.env.BABEL_ENV)};
  const startup = startupFlags();
  requireAdmission(inner_environment.node_env === 'test' && inner_environment.babel_env === 'test', 'INNER_ENVIRONMENT');
  requireAdmission(startup.exec_argv_empty && !startup.node_options_nonempty && !startup.v8_coverage_enabled
    && ['unset', 'empty'].includes(startup.jest_jasmine), 'STARTUP_OPTIONS');
  const text = JSON.stringify({project, global, babel_globals});
  requireAdmission(Buffer.byteLength(text) <= MAX_SNAPSHOT_BYTES, 'SNAPSHOT_LIMIT');
  const files = [
    ...project.setupFiles.map(file => ['setup', file]), ...project.setupFilesAfterEnv.map(file => ['setup_after_env', file]),
    ...project.transform.map((entry, index) => ['transform_' + index, entry[1]]),
    ['environment', project.testEnvironment], ['test_runner', project.testRunner], ['runner', project.runner], ['craco_config', path.join(cwd, 'craco.config.js')],
  ];
  requireAdmission(files.length <= MAX_FILES, 'SELECTED_FILE_LIMIT');
  let bytes = 0;
  const selected_files = files.map(([role, file]) => {
    try {
      const stat = fs.statSync(file);
      requireAdmission(stat.isFile() && Number.isSafeInteger(stat.size) && stat.size >= 0 && bytes + stat.size <= MAX_FILE_BYTES, 'SELECTED_FILE_LIMIT');
      const source = fs.readFileSync(file);
      requireAdmission(source.length === stat.size, 'SELECTED_FILE_CHANGED');
      bytes += source.length;
      return {role, path: file, bytes: source.length, sha256: createHash('sha256').update(source).digest('hex')};
    } catch (error) { requireAdmission(false, error.admissionCode || 'SELECTED_FILE_READ'); }
  });
  const snapshot = JSON.parse(text);
  return {version: 1, hook: 'onTestStart', capture_status: 'admitted', test_path: test.path, cwd,
    project: snapshot.project, global: snapshot.global, babel_globals: snapshot.babel_globals,
    configured_fields_sha256: createHash('sha256').update(text).digest('hex'), selected_files,
    identity_evidence: 'configured-selected-resolved', actual_vm_module_execution: 'UNVERIFIED', early_environment, inner_environment, startup};
}

class FrontendRuntimeReporter {
  constructor(globalConfig = {}) {
    this.globalConfig = globalConfig;
    this.output = process.env.FRONTEND_RUNTIME_RECEIPT;
    this.started = performance.now();
    this.cpu = process.cpuUsage();
    this.cases = [];
    this.writeFailed = false;
    this.admissionFailed = false;
    this.finalized = false;
    this.writeMs = 0;
    this.writeCalls = 0;
    this.metadata = {
      version: 1,
      invocation_id: process.env.FRONTEND_RUNTIME_INVOCATION || null,
      source_sha: process.env.GITHUB_SHA || null,
      node: process.version,
      execPath: process.execPath,
      pid: process.pid,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lifecycle_years: process.env.FRAMEWORK_LIFECYCLE_YEARS || '5',
      synthetic_exports: Boolean(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR),
      phase_logging: Boolean(process.env.ISO_PHASE_LOG_DIR || process.env.ISO_PR110_PHASE_DIR),
      available_parallelism: os.availableParallelism(),
      cpu_model: os.cpus()[0]?.model || null,
      total_memory: os.totalmem(),
      startup_free_memory: os.freemem(),
    };
  }
  write(extra) {
    if (!this.output) return;
    const started = performance.now();
    try {
      const text = JSON.stringify({...this.metadata, ...extra, cases: this.cases,
        artifact_overhead: {completed_write_ms: this.writeMs, completed_write_calls: this.writeCalls, current_write_excluded: true}}, null, 2);
      requireAdmission(Buffer.byteLength(text) <= MAX_RECEIPT_BYTES, 'RECEIPT_LIMIT');
      fs.mkdirSync(path.dirname(this.output), {recursive: true});
      fs.writeFileSync(this.output, text);
    } catch {
      this.writeFailed = true;
      // getLastError still fails provenance when even stderr is unavailable.
      try { process.stderr.write('Frontend runtime provenance write failed.\n'); } catch {}
    } finally {
      this.writeMs += performance.now() - started;
      this.writeCalls++;
    }
  }
  onRunStart() { this.write({completed: false}); }
  onTestStart(test) {
    if (!this.output) return;
    const started = performance.now();
    let snapshotMs;
    try {
      requireAdmission(!this.metadata.envelope && !this.writeFailed, 'ADMISSION_STATE');
      requireAdmission(this.metadata.lifecycle_years === '5' && (process.env.FRAMEWORK_LIFECYCLE_YEARS || '5') === '5'
        && !this.metadata.synthetic_exports && !process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR && !this.metadata.phase_logging
        && !process.env.ISO_PHASE_LOG_DIR && !process.env.ISO_PR110_PHASE_DIR, 'WORKLOAD_FLAGS');
      this.metadata.envelope = captureEnvelope(this.globalConfig, test);
      snapshotMs = performance.now() - started;
      this.metadata.envelope.overhead = {snapshot_ms: snapshotMs};
      this.write({completed: false});
      requireAdmission(!this.writeFailed, 'ARTIFACT_WRITE');
    } catch (error) {
      this.admissionFailed = true;
      const code = error.admissionCode || 'SNAPSHOT_CAPTURE';
      this.metadata.envelope = {version: 1, hook: 'onTestStart', capture_status: 'rejected', error_code: code,
        identity_evidence: 'configured-selected-resolved', actual_vm_module_execution: 'UNVERIFIED',
        overhead: {snapshot_ms: snapshotMs ?? performance.now() - started}};
      this.write({completed: false});
      throw new Error('Frontend runtime admission rejected (' + code + ')');
    }
  }
  onTestResult(test, result) {
    if (!/[\\/]src[\\/]preview[\\/]frameworkFiveYear\.test\.js$/.test(test.path)) return;
    // Retain the exact native case order and failed outcomes; the campaign validates them.
    this.cases = result.testResults.map(value => ({name: value.fullName, status: value.status, duration_ms: value.duration ?? null}));
    this.write({completed: false});
  }
  onRunComplete() {
    this.finalized = true;
    this.write({completed: !this.writeFailed && !this.admissionFailed && this.metadata.envelope?.capture_status === 'admitted'
      && this.cases.length === 3 && this.cases.every(value => Number.isFinite(value.duration_ms) && value.duration_ms >= 0), elapsed_ms: performance.now() - this.started,
      cpu_usage_us: process.cpuUsage(this.cpu), resource_usage: process.resourceUsage(), memory_usage: process.memoryUsage()});
  }
  getLastError() {
    return this.writeFailed || this.admissionFailed || this.output && this.finalized && (this.metadata.envelope?.capture_status !== 'admitted'
      || this.cases.length !== 3 || this.cases.some(value => !Number.isFinite(value.duration_ms) || value.duration_ms < 0))
      ? new Error('Frontend runtime provenance is incomplete') : undefined;
  }
}
module.exports = FrontendRuntimeReporter;
