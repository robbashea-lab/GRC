const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const vm = require('node:vm');
const {HOOK, LABELS, SOURCE_SHA256, instrumentReportingSource, createObserver} = require('./reporting-prep-observer.cjs');
const originalSource = fs.readFileSync(path.join(__dirname, '../src/preview/portfolioReporting.js'), 'utf8');
const statement = (source, name) => source.match(new RegExp('const ' + name + '=[\\s\\S]*?;'))[0];

test('only the three exact approved initializers are transformed; hashes and unique matches fail closed', () => {
  for (const source of [originalSource.replace(/\r\n/g, '\n'), originalSource.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')]) {
    const result = instrumentReportingSource(source);
    assert.equal(SOURCE_SHA256.includes(result.original_sha256), true);
    assert.notEqual(result.instrumented_sha256, result.original_sha256);
    assert.deepEqual(result.replacements, Object.fromEntries(LABELS.map(label => [label, 1])));
    let restored = result.source;
    for (const name of ['retained', 'retainedLogIds', 'refreshReceipts'])
      restored = restored.replace(statement(result.source, name), statement(source, name));
    assert.equal(restored, source);
    assert.equal((result.source.match(new RegExp('globalThis\\.' + HOOK, 'g')) || []).length, 3);
  }
  assert.throws(() => instrumentReportingSource(originalSource + '\n// unexpected change'), /SHA256/);
  assert.throws(() => instrumentReportingSource(originalSource + '\n' + statement(originalSource, 'retained')), /Expected one.*prior-ids-first/);
  assert.throws(() => instrumentReportingSource(originalSource.replace(statement(originalSource, 'refreshReceipts'), '')), /Expected one.*refresh-filter/);
});

test('transformed expressions preserve native getter order, returns, throws and the first initializer TDZ boundary', () => {
  const instrumented = instrumentReportingSource(originalSource).source;
  const statements = ['retained', 'retainedLogIds', 'refreshReceipts'].map(name => statement(instrumented, name));
  const events = [], labels = [], originalError = Error('Original synthetic error');
  const row = {get audit_id() { events.push('id'); return 'one'; }, get log_id() { throw Error('Wrong fallback'); }};
  const previous = {get logs() { events.push('previous'); return [row]; }};
  const db = {get logs() { events.push('current'); return [{audit_id: 'one'}, {audit_id: 'new', client_id: 'demo_brawndo',
    entity_type: 'framework_assessments', action: 'Framework assessment updated'}]; }};
  const scope = {[HOOK]: (label, callback, gate) => { labels.push([label, gate]); return callback(); }};
  const execute = new Function('previous', 'db', 'activity_proofs', 'globalThis',
    statements[0] + ' const scenario={}; ' + statements[1] + statements[2] + ' return {retained,retainedLogIds,refreshReceipts};');
  const result = execute(previous, db, {new: {eligible: true}}, scope);
  assert.deepEqual([...result.retained], ['one']); assert.deepEqual([...result.retainedLogIds], ['one']);
  assert.equal(result.refreshReceipts.length, 1);
  assert.deepEqual(events, ['previous', 'id', 'previous', 'id', 'current']);
  assert.deepEqual(labels, [['prior-ids-first', null], ['prior-ids-second', true], ['refresh-filter', true]]);
  assert.throws(() => execute({get logs() { throw originalError; }}, db, {}, scope), error => error === originalError);
});

test('measurement retains exact results/errors without walking getters or thenables', () => {
  let time = 0, reads = 0;
  const observer = createObserver({now: () => time}); observer.beginCase('iso-27001 original lifecycle');
  const result = {get then() { reads++; throw Error('Do not inspect'); }, toJSON() { reads++; throw Error('Do not serialize'); }};
  assert.equal(observer.measure('prior-ids-first', () => { time = 4; return result; }, null), result);
  const error = Error('Original failure');
  assert.throws(() => observer.measure('prior-ids-second', () => { time = 10; throw error; }, false), candidate => candidate === error);
  const record = observer.endCase({guards_preserved: true});
  assert.equal(reads, 0); assert.deepEqual(record.events.map(event => event.duration_ms), [4, 6]);
  assert.equal(Object.hasOwn(record.events[0], 'legacy_gate_truthy'), false);
  assert.equal(record.measurements['prior-ids-first'].calls, 1);
  assert.equal(record.measurements['prior-ids-second'].throws, 1);
  assert.equal(record.measurements['prior-ids-second'].legacyGateFalsy, 1);
  assert.equal(record.measurements['prior-ids-second'].legacy_gate_buckets.falsy.total_ms, 6);
  assert.equal(record.measurements['prior-ids-first'].legacy_gate_buckets.not_applicable.total_ms, 4);
});

test('fixed-clock counters, quantiles, admission caps, partial and closed case handling remain explicit', () => {
  let time = 0, calls = 0;
  const observer = createObserver({now: () => time, maxEvents: 2});
  assert.equal(observer.measure('prior-ids-first', () => ++calls, null), 1);
  observer.beginCase('cis-ig1 original lifecycle');
  for (const duration of [2, 6, 12]) observer.measure('refresh-filter', () => { calls++; time += duration; }, true);
  assert.equal(observer.snapshot().closed, false); assert.equal(observer.finish().complete, false);
  const record = observer.endCase({guards_preserved: true});
  assert.equal(record.event_count, 2); assert.equal(record.event_cap_reached, true);
  assert.equal(record.measurements['refresh-filter'].calls, 3);
  assert.equal(record.measurements['refresh-filter'].legacyGateTruthy, 3);
  assert.equal(record.measurements['refresh-filter'].p50_ms, 2); assert.equal(record.measurements['refresh-filter'].p95_ms, 6);
  assert.equal(observer.measure('refresh-filter', () => ++calls, false), 5);
  assert.equal(record.measurements['refresh-filter'].calls, 3);
  assert.equal(observer.finish().diagnostic_valid, false); assert.deepEqual(observer.finish().errors, ['event-cap-reached']);
});

test('active-path calibration is exactly 10000 wrappers outside cases; full receipts need three guarded cases', () => {
  let time = 0;
  const observer = createObserver({now: () => ++time});
  const calibration = observer.calibrate();
  assert.equal(calibration.iterations, 10000); assert.equal(calibration.active_observer_path, true);
  assert.equal(calibration.measurements.calls, 10000); assert.equal(calibration.measurements.sample_count, 10000);
  assert.equal(observer.finish().cases.length, 0); assert.equal(observer.finish().complete, false);
  for (const framework of ['cis-ig1', 'soc-2', 'iso-27001']) {
    observer.beginCase(framework + ' original lifecycle');
    observer.measure('prior-ids-first', () => {}, null);
    observer.measure('prior-ids-second', () => {}, false);
    observer.measure('refresh-filter', () => {}, false);
    const record = observer.endCase({guards_preserved: true}); assert.equal(record.measurements_coherent, true);
  }
  observer.noteFlush(2.5);
  const receipt = observer.finish(); assert.equal(receipt.complete, true); assert.equal(receipt.diagnostic_valid, true);
  assert.equal(receipt.overhead.flush_calls, 1); assert.equal(receipt.overhead.flush_ms, 2.5);
  assert.equal(receipt.overhead.bookkeeping_ms > 0, true); assert.deepEqual(receipt.errors, []);
});

test('missing instrumentation, missing target and mismatched gate buckets cannot become valid zero-cost captures', () => {
  for (const scenario of ['uninstrumented', 'missing-filter', 'mismatched-gate']) {
    const observer = createObserver({now: () => 0}); observer.calibrate();
    for (const framework of ['cis-ig1', 'soc-2', 'iso-27001']) {
      observer.beginCase(framework + ' original lifecycle');
      if (scenario !== 'uninstrumented') {
        observer.measure('prior-ids-first', () => {}, null);
        observer.measure('prior-ids-second', () => {}, true);
        if (scenario === 'mismatched-gate') observer.measure('refresh-filter', () => {}, false);
      }
      observer.endCase({guards_preserved: true});
    }
    const receipt = observer.finish();
    assert.equal(receipt.complete, true); assert.equal(receipt.diagnostic_valid, false);
    assert.equal(receipt.cases.every(record => record.measurements_coherent === false), true);
    assert.deepEqual(receipt.errors, []); // Missing attribution is retained as absent, not invented as an application error.
    if (scenario !== 'mismatched-gate') assert.equal(receipt.cases[0].measurements['refresh-filter'].calls, 0);
  }
});

test('diagnostic clock failures never replace the actual callback outcome', () => {
  let broken = false;
  const observer = createObserver({now: () => { if (broken) throw Error('Clock only'); return 0; }});
  observer.beginCase('cis-ig1 original lifecycle'); broken = true;
  const error = Error('Actual error');
  assert.throws(() => observer.measure('prior-ids-first', () => { throw error; }, null), candidate => candidate === error);
  assert.equal(observer.measure('prior-ids-first', () => 17, null), 17);
  assert.equal(observer.finish().diagnostic_valid, false);
  assert.equal(observer.finish().errors.includes('diagnostic-clock-unavailable'), true);
});

test('setup resolves its observer beside the harness when cwd is a disposable old checkout', () => {
  const setupPath = path.join(__dirname, 'reporting-prep-setup.cjs');
  const observerPath = path.join(__dirname, 'reporting-prep-observer.cjs');
  const disposableFrontend = path.resolve(__dirname, '../../disposable-392/frontend');
  assert.notEqual(disposableFrontend, path.dirname(__dirname));
  const required = [], registrations = [], reads = [];
  const fakeFS = {
    readFileSync: file => { reads.push(file); throw Error('Unavailable diagnostic metadata; no workload should start'); },
    mkdirSync: () => assert.fail('No artifact writes during registration'),
    writeFileSync: () => assert.fail('No artifact writes during registration'),
    renameSync: () => assert.fail('No artifact writes during registration'),
  };
  const context = vm.createContext({
    __dirname, __filename: setupPath,
    process: {cwd: () => disposableFrontend, env: {REPORTING_PREP_LOG_DIR: path.resolve(__dirname, 'synthetic-output'),
      REPORTING_PREP_INSTRUMENTATION_PATH: path.resolve(__dirname, 'synthetic-metadata.json')}},
    Storage: class Storage { getItem() {} },
    jest: {requireActual: name => {
      required.push(name);
      if (name === 'node:fs') return fakeFS;
      if (name === observerPath) return require(observerPath);
      if (name.startsWith('node:')) return require(name);
      assert.fail('Unexpected application import during setup registration');
    }},
    beforeAll: callback => registrations.push(['beforeAll', callback]),
    beforeEach: callback => registrations.push(['beforeEach', callback]),
    afterEach: callback => registrations.push(['afterEach', callback]),
    afterAll: callback => registrations.push(['afterAll', callback]),
  });
  vm.runInContext(fs.readFileSync(setupPath, 'utf8'), context, {filename: setupPath});
  assert.equal(required.includes(observerPath), true);
  assert.equal(required.includes(path.join(disposableFrontend, 'scripts/reporting-prep-observer.cjs')), false);
  assert.equal(reads.length, 1);
  assert.deepEqual(registrations.map(([name]) => name), ['beforeAll', 'beforeEach', 'afterEach', 'afterAll']);
  const hook = Object.getOwnPropertyDescriptor(context, HOOK);
  assert.equal(typeof hook.value, 'function'); assert.equal(hook.writable, false); assert.equal(hook.configurable, true);
});
