// A separate diagnostic repeat. It never creates a normal campaign receipt.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {pinnedNodeEnvironment} = require('./frontend-campaign.cjs');
const BASELINE = '67103820225d121fd097c0914304d690f1cdda09';
const ALLOWED = new Set([
  '.github/workflows/release-verification.yml',
  ...['frontend-campaign.cjs', 'frontend-campaign.test.cjs', 'frontend-runtime-reporter.cjs',
    'frontend-runtime-reporter.test.cjs', 'iso-phase-diagnostics.cjs', 'iso-phase-diagnostics.test.cjs',
    'iso-phase-logging.setup.cjs', 'iso-phase-logger.cjs', 'iso-phase-logger.coretest.cjs'].map(name => 'frontend/scripts/' + name),
]);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
function applicationProof(frontend, env, execute = spawnSync) {
  const git = args => {
    const result = execute('git', args, {cwd: path.resolve(frontend, '..'), env, encoding: 'utf8', windowsHide: true});
    requireThat(result.status === 0, 'Application baseline verification failed');
    return result.stdout.trim();
  };
  const head = git(['rev-parse', 'HEAD']);
  requireThat(head === env.GITHUB_SHA, 'Observed source differs from GITHUB_SHA');
  const changed = [...new Set([
    ...git(['diff', '--name-only', BASELINE]).split('\n'),
    ...git(['ls-files', '--full-name', '--others', '--exclude-standard']).split('\n'),
  ].filter(Boolean))];
  const generatedJSON = file => /^frontend\/(?:campaign|phase)\/.+\.json(?:\.tmp)?$/.test(file);
  requireThat(changed.every(file => ALLOWED.has(file) || generatedJSON(file)), 'Application changes are outside the diagnostic successor');
  return {application_baseline_sha: BASELINE, observed_source_sha: head, changed_files: changed,
    current_worktree_checked: true};
}
function diagnosticArguments(frontend, output) {
  return [require.resolve('@craco/craco/dist/bin/craco.js'), 'test', '--watchAll=false', '--runInBand',
    '--runTestsByPath', 'src/preview/frameworkFiveYear.test.js', '--json', '--outputFile=' + path.join(output, 'jest.json'),
    '--reporters=default', '--reporters=' + path.join(frontend, 'scripts/frontend-runtime-reporter.cjs'),
    '--setupFilesAfterEnv', path.join(frontend, 'src/setupTests.js'), path.join(frontend, 'scripts/iso-phase-logging.setup.cjs')];
}
function verifyDiagnostic(runtime, summary, result, env, execPath = process.execPath, version = process.version) {
  const normalized = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  requireThat(runtime?.completed === true && runtime.node === version && typeof runtime.execPath === 'string'
    && normalized(runtime.execPath) === normalized(execPath), 'Diagnostic child runtime is incomplete or mismatched');
  requireThat(runtime.source_sha === env.GITHUB_SHA && runtime.application_baseline === BASELINE
    && runtime.phase_logging === true && runtime.synthetic_exports === false && runtime.lifecycle_years === '5',
  'Diagnostic runtime/source/scenario provenance mismatch');
  requireThat(summary?.complete === true && summary.diagnostic_valid === true
    && summary.application_baseline_sha === BASELINE && summary.observed_source_sha === env.GITHUB_SHA,
  'Diagnostic phase/cutoff capture is incomplete');
  requireThat(result?.wasInterrupted === false && result.numTotalTestSuites === 1
    && result.numTotalTests === 3 && result.numPendingTests === 0, 'Diagnostic sequence was incomplete or filtered');
}
function run(output, frontend = process.cwd()) {
  fs.mkdirSync(output, {recursive: true});
  const directory = fs.mkdtempSync(path.join(path.resolve(output), 'run-'));
  const env = pinnedNodeEnvironment(process.env);
  delete env.FRAMEWORK_LIFECYCLE_EXPORT_DIR;
  delete env.NODE_OPTIONS;
  env.FRAMEWORK_LIFECYCLE_YEARS = '5';
  env.ISO_PHASE_LOG_DIR = directory;
  env.ISO_PHASE_APP_SHA = BASELINE;
  env.FRONTEND_RUNTIME_RECEIPT = path.join(directory, 'runtime.json');
  const receipt = {version: 1, diagnostic_only: true, qualification: false,
    application_baseline_sha: BASELINE, observed_source_sha: env.GITHUB_SHA || null};
  let exitCode = 1;
  try {
    Object.assign(receipt, applicationProof(frontend, env));
    const args = diagnosticArguments(frontend, directory);
    receipt.arguments = args;
    const execution = spawnSync(process.execPath, args, {cwd: frontend, env, stdio: 'inherit', windowsHide: true});
    receipt.child_exit_code = execution.status;
    receipt.child_signal = execution.signal || null;
    receipt.runtime = JSON.parse(fs.readFileSync(env.FRONTEND_RUNTIME_RECEIPT, 'utf8'));
    receipt.result = JSON.parse(fs.readFileSync(path.join(directory, 'jest.json'), 'utf8'));
    receipt.summary = JSON.parse(fs.readFileSync(path.join(directory, 'iso-phase-summary.json'), 'utf8'));
    verifyDiagnostic(receipt.runtime, receipt.summary, receipt.result, env);
    receipt.capture_valid = true;
    // Preserve the original child failure, even when logging completed correctly.
    exitCode = execution.status === 0 ? 0 : 1;
  } catch (error) {
    receipt.capture_valid = false;
    receipt.capture_error = error.message;
  }
  fs.writeFileSync(path.join(directory, 'diagnostic-receipt.json'), JSON.stringify(receipt, null, 2));
  fs.writeFileSync(path.join(output, 'latest.json'), JSON.stringify({directory, capture_valid: receipt.capture_valid, child_exit_code: receipt.child_exit_code ?? null}, null, 2));
  console.log('ISO diagnostics:', JSON.stringify({directory, capture_valid: receipt.capture_valid, child_exit_code: receipt.child_exit_code ?? null, qualification: false}));
  return exitCode;
}
if (require.main === module) {
  if (!process.argv[2]) { console.error('An explicit diagnostic output directory is required'); process.exitCode = 1; }
  else process.exitCode = run(process.argv[2]);
}
module.exports = {BASELINE, ALLOWED, applicationProof, diagnosticArguments, verifyDiagnostic, run};
