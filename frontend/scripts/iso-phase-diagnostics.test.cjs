const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {BASELINE, applicationProof, diagnosticArguments, verifyDiagnostic} = require('./iso-phase-diagnostics.cjs');
const SHA = 'a'.repeat(40);
test('diagnostic arguments retain the entire native lifecycle and its normal setup without filters or timeout overrides', () => {
  const args = diagnosticArguments('/fixture/frontend', '/fixture/output');
  assert(args.includes('src/preview/frameworkFiveYear.test.js'));
  assert(args.includes(path.join('/fixture/frontend', 'src/setupTests.js')));
  assert(args.includes(path.join('/fixture/frontend', 'scripts/iso-phase-logging.setup.cjs')));
  assert(!args.some(arg => /testNamePattern|testTimeout|forceExit/.test(arg)));
});
test('application proof accepts only the exact application baseline with a test-only logging successor', () => {
  const replies = [SHA, 'frontend/scripts/iso-phase-logger.cjs\n.github/workflows/release-verification.yml', 'frontend/campaign/framework-five-year/runtime.json'];
  const execute = (_command, _args, options) => {
    assert.equal(options.cwd, path.resolve('/fixture/frontend', '..'));
    return {status: 0, stdout: replies.shift()};
  };
  const proof = applicationProof('/fixture/frontend', {GITHUB_SHA: SHA}, execute);
  assert.equal(proof.application_baseline_sha, BASELINE);
  assert.equal(proof.observed_source_sha, SHA);
  for (const changed of ['frontend/src/preview/store.js', 'shared/catalogs/isoAuditProgram.json', 'frontend/package.json']) {
    const values = [SHA, changed, ''];
    assert.throws(() => applicationProof('/fixture/frontend', {GITHUB_SHA: SHA}, () => ({status: 0, stdout: values.shift()})), /outside/);
  }
  assert.throws(() => applicationProof('/fixture/frontend', {GITHUB_SHA: 'b'.repeat(40)}, () => ({status: 0, stdout: SHA})), /GITHUB_SHA/);
  for (const untracked of ['frontend/src/new-behavior.js', 'shared/new-catalog.json', 'frontend/phase/unexpected.js']) {
    const values = [SHA, '', untracked];
    assert.throws(() => applicationProof('/fixture/frontend', {GITHUB_SHA: SHA}, () => ({status: 0, stdout: values.shift()})), /outside/);
  }
});
test('complete diagnostics may record an original failing result but cannot masquerade as normal qualification', () => {
  const runtime = {completed: true, node: process.version, execPath: process.execPath, source_sha: SHA,
    application_baseline: BASELINE, phase_logging: true, synthetic_exports: false, lifecycle_years: '5'};
  const summary = {complete: true, diagnostic_valid: true, application_baseline_sha: BASELINE, observed_source_sha: SHA};
  const result = {success: false, wasInterrupted: false, numTotalTestSuites: 1, numTotalTests: 3, numPendingTests: 0};
  assert.doesNotThrow(() => verifyDiagnostic(runtime, summary, result, {GITHUB_SHA: SHA}));
  for (const patch of [{completed: false}, {phase_logging: false}, {synthetic_exports: true}, {lifecycle_years: '3'}, {node: 'v0.0.0'}]) {
    assert.throws(() => verifyDiagnostic({...runtime, ...patch}, summary, result, {GITHUB_SHA: SHA}));
  }
  for (const patch of [{complete: false}, {diagnostic_valid: false}, {observed_source_sha: 'b'.repeat(40)}]) {
    assert.throws(() => verifyDiagnostic(runtime, {...summary, ...patch}, result, {GITHUB_SHA: SHA}));
  }
  for (const patch of [{wasInterrupted: true}, {numTotalTests: 1}, {numPendingTests: 1}]) {
    assert.throws(() => verifyDiagnostic(runtime, summary, {...result, ...patch}, {GITHUB_SHA: SHA}));
  }
});
