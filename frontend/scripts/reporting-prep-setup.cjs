// Only the separately authorized disposable attribution run loads this setup.
const fs = jest.requireActual('node:fs'), path = jest.requireActual('node:path'), os = jest.requireActual('node:os');
const timers = jest.requireActual('node:timers'), perf = jest.requireActual('node:perf_hooks').performance;
const {createHash} = jest.requireActual('node:crypto');
const {HOOK, LABELS, SOURCE_SHA256, createObserver} = jest.requireActual(path.join(__dirname, 'reporting-prep-observer.cjs'));
const output = process.env.REPORTING_PREP_LOG_DIR, metadataPath = process.env.REPORTING_PREP_INSTRUMENTATION_PATH;
if (!output || !path.isAbsolute(output) || !metadataPath || !path.isAbsolute(metadataPath))
  throw new Error('Explicit absolute reporting attribution output and instrumentation paths are required');
if (Object.getOwnPropertyDescriptor(globalThis, HOOK)) throw new Error('Reporting attribution hook collision');

const observer = createObserver(), captured = {
  parse: Object.getOwnPropertyDescriptor(JSON, 'parse')?.value, stringify: Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value,
  keys: Object.getOwnPropertyDescriptor(Object, 'keys')?.value, entries: Object.getOwnPropertyDescriptor(Object, 'entries')?.value,
  Set: globalThis.Set, map: Object.getOwnPropertyDescriptor(Array.prototype, 'map')?.value,
  setAdd: Object.getOwnPropertyDescriptor(Set.prototype, 'add')?.value, setHas: Object.getOwnPropertyDescriptor(Set.prototype, 'has')?.value,
  getItem: Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')?.value};
Object.defineProperty(globalThis, HOOK, {value: observer.measure, writable: false, configurable: true, enumerable: false});
let interval = null, beforeGuards = null, finalized = false;
let instrumentation = null;
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
try {
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const source = fs.readFileSync(path.join(process.cwd(), 'src/preview/portfolioReporting.js'), 'utf8');
  const currentHash = createHash('sha256').update(source, 'utf8').digest('hex');
  if (!SOURCE_SHA256.includes(metadata.original_sha256) || !sha256(metadata.instrumented_sha256) || currentHash !== metadata.instrumented_sha256
    || !sha(metadata.application_baseline_sha) || !sha(metadata.staged_baseline_sha) || !sha(metadata.observed_source_sha)
    || metadata.observed_source_sha !== process.env.GITHUB_SHA || !metadata.replacements || Object.keys(metadata.replacements).sort().join(',') !== [...LABELS].sort().join(',')
    || !LABELS.every(label => metadata.replacements[label] === 1)) observer.diagnosticError('instrumentation-metadata-mismatch');
  instrumentation = {application_baseline_sha: sha(metadata.application_baseline_sha) ? metadata.application_baseline_sha : null,
    staged_baseline_sha: sha(metadata.staged_baseline_sha) ? metadata.staged_baseline_sha : null,
    observed_source_sha: sha(metadata.observed_source_sha) ? metadata.observed_source_sha : null,
    original_sha256: sha256(metadata.original_sha256) ? metadata.original_sha256 : null,
    instrumented_sha256: sha256(metadata.instrumented_sha256) ? metadata.instrumented_sha256 : null,
    replacements: Object.fromEntries(LABELS.map(label => [label, metadata.replacements?.[label] === 1 ? 1 : null]))};
  observer.setInstrumentation(instrumentation);
} catch { observer.diagnosticError('instrumentation-metadata-unavailable'); }

function write(name, data) {
  const started = perf.now();
  try {
    fs.mkdirSync(output, {recursive: true});
    const destination = path.join(output, name), temporary = destination + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2)); fs.renameSync(temporary, destination);
    return true;
  } catch { observer.diagnosticError('diagnostic-write-failed'); return false; }
  finally { observer.noteFlush(perf.now() - started); }
}
function guards() {
  try {
    const portfolio = jest.requireActual(path.join(process.cwd(), 'src/preview/portfolioReporting.js'));
    return {parse: Object.getOwnPropertyDescriptor(JSON, 'parse')?.value === captured.parse,
      stringify: Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value === captured.stringify,
      keys: Object.getOwnPropertyDescriptor(Object, 'keys')?.value === captured.keys,
      entries: Object.getOwnPropertyDescriptor(Object, 'entries')?.value === captured.entries,
      Set: globalThis.Set === captured.Set, map: Object.getOwnPropertyDescriptor(Array.prototype, 'map')?.value === captured.map,
      setAdd: Object.getOwnPropertyDescriptor(Set.prototype, 'add')?.value === captured.setAdd,
      setHas: Object.getOwnPropertyDescriptor(Set.prototype, 'has')?.value === captured.setHas,
      getItem: Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')?.value === captured.getItem,
      canFork: portfolio.canForkPortfolioStore()};
  } catch { observer.diagnosticError('guard-observation-failed'); return null; }
}
function live() {
  try {
    const record = observer.snapshot();
    if (record) write('reporting-prep-live.json', {version: 1, diagnostic_only: true, instrumentation, ...record,
      memory: process.memoryUsage(), errors: observer.finish().errors});
  } catch { observer.diagnosticError('live-observation-failed'); }
}
function summary() {
  const result = observer.finish();
  return finalized ? result : {...result, complete: false, diagnostic_valid: false};
}

beforeAll(() => {
  observer.calibrate();
  write('reporting-prep-host.json', {version: 1, diagnostic_only: true, actual_jest_pid: process.pid,
    node: process.version, exec_path: process.execPath, versions: process.versions, platform: process.platform, arch: process.arch,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, instrumentation, profiler_enabled: false,
    host: {available_parallelism: os.availableParallelism?.() ?? os.cpus().length, logical_cpus: os.cpus().length,
      cpu_model: os.cpus()[0]?.model, total_memory: os.totalmem(), free_memory: os.freemem()},
    environment: {CI: process.env.CI === 'true', TZ: process.env.TZ === 'UTC' ? 'UTC' : 'other-or-unset',
      lifecycle_years: process.env.FRAMEWORK_LIFECYCLE_YEARS === '5' ? '5' : 'other-or-unset',
      export_enabled: !!process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR}, event_budget_per_case: 20000,
    calibration: observer.finish().calibration});
});
beforeEach(() => {
  observer.beginCase(expect.getState().currentTestName); beforeGuards = guards();
  interval = timers.setInterval(live, 10000); interval.unref(); live();
});
afterEach(() => {
  timers.clearInterval(interval); live();
  try {
    const afterGuards = guards();
    const preserved = [beforeGuards, afterGuards].every(value => value && Object.values(value).every(flag => flag === true));
    if (!preserved) observer.diagnosticError('native-guard-changed');
    const record = observer.endCase({native_guards_before: beforeGuards, native_guards_after: afterGuards, guards_preserved: preserved});
    if (record) write('reporting-prep-case-' + String(record.ordinal).padStart(2, '0') + '-' + record.framework + '.json',
      {version: 1, diagnostic_only: true, instrumentation, ...record, errors: observer.finish().errors});
    write('reporting-prep-summary.json', summary());
  } catch { observer.diagnosticError('case-observation-failed'); }
});
afterAll(() => {
  timers.clearInterval(interval); finalized = true; write('reporting-prep-summary.json', summary());
  // Leave the safe delegate installed: a timed-out application's pending work may continue.
});
