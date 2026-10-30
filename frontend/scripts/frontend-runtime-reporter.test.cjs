const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Reporter = require('./frontend-runtime-reporter.cjs');

test('normal reporter stamps the actual process and records only the three lifecycle case results', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grc-runtime-report-'));
  const output = path.join(directory, 'runtime.json');
  const previous = Object.fromEntries(['FRONTEND_RUNTIME_RECEIPT', 'GITHUB_SHA', 'ISO_PHASE_LOG_DIR', 'FRAMEWORK_LIFECYCLE_EXPORT_DIR', 'FRAMEWORK_LIFECYCLE_YEARS'].map(key => [key, process.env[key]]));
  try {
    process.env.FRONTEND_RUNTIME_RECEIPT = output;
    process.env.GITHUB_SHA = 'c'.repeat(40);
    delete process.env.ISO_PHASE_LOG_DIR;
    delete process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR;
    delete process.env.FRAMEWORK_LIFECYCLE_YEARS;
    const reporter = new Reporter();
    reporter.onRunStart();
    assert.equal(JSON.parse(fs.readFileSync(output)).completed, false);
    reporter.onTestCaseResult({path: path.resolve('src', 'pages', 'other.test.js')}, {fullName: 'other', status: 'passed'});
    assert.equal(reporter.cases.length, 0);
    for (const name of ['cis-ig1', 'soc-2', 'iso-27001']) {
      reporter.onTestCaseResult({path: path.resolve('src', 'preview', 'frameworkFiveYear.test.js')},
        {fullName: name, status: name === 'iso-27001' ? 'failed' : 'passed', duration: 180001});
    }
    reporter.onRunComplete();
    const proof = JSON.parse(fs.readFileSync(output));
    assert.equal(proof.node, process.version);
    assert.equal(proof.execPath, process.execPath);
    assert.equal(proof.source_sha, process.env.GITHUB_SHA);
    assert.equal(proof.completed, true);
    assert.equal(proof.phase_logging, false);
    assert.equal(proof.synthetic_exports, false);
    assert.equal(proof.lifecycle_years, '5');
    assert.equal(proof.cases.length, 3);
    assert.equal(proof.cases[2].status, 'failed');
    assert.equal(reporter.getLastError(), undefined);
    process.env.ISO_PHASE_LOG_DIR = '/diagnostic';
    process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR = '/exports';
    const diagnostic = new Reporter();
    assert.equal(diagnostic.metadata.phase_logging, true);
    assert.equal(diagnostic.metadata.synthetic_exports, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (fs.existsSync(output)) fs.unlinkSync(output);
    fs.rmdirSync(directory);
  }
});
