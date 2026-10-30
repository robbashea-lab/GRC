// Attribution only: preserve every original initializer and application outcome.
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const HOOK = '__governaraReportingPrepMeasure';
const LABELS = ['prior-ids-first', 'prior-ids-second', 'refresh-filter'];
const SOURCE_SHA256 = [
  '85547886be517c229959d413cea383c8e57987db39d13787f973b522b351a730', // committed LF
  '49cfdf121c85690975f5f2a403e34c2e7798781d58bd27e4e77b2e385ac4d01e', // same Windows CRLF checkout
];
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');

function instrumentReportingSource(source) {
  if (typeof source !== 'string' || source.length > 1024 * 1024) throw new Error('Unexpected reporting source');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const sites = [
    ['prior-ids-first', 'retained', 'new Set((previous.logs||[]).map(log=>log.audit_id||log.log_id))', 'null'],
    ['prior-ids-second', 'retainedLogIds', 'new Set((previous?.logs||[]).map(log=>log.audit_id||log.log_id))', '!!(previous&&scenario)'],
    ['refresh-filter', 'refreshReceipts', [
      '(db.logs||[]).filter(log=>!retainedLogIds.has(log.audit_id||log.log_id)',
      "    &&log.client_id==='demo_brawndo'&&log.entity_type==='framework_assessments'",
      "    &&log.action==='Framework assessment updated'&&activity_proofs[log.audit_id||log.log_id]?.eligible===true)",
    ].join(newline), '!!(previous&&scenario)'],
  ];
  const replacements = {};
  for (const [label, variable, expression] of sites) {
    const original = 'const ' + variable + '=' + expression + ';';
    const count = source.split(original).length - 1;
    if (count !== 1) throw new Error('Expected one reporting initializer: ' + label);
    replacements[label] = count;
  }
  const original_sha256 = hash(source);
  if (!SOURCE_SHA256.includes(original_sha256)) throw new Error('Reporting source SHA256 differs from the approved baseline');
  let instrumented = source;
  for (const [label, variable, expression, gate] of sites) {
    const original = 'const ' + variable + '=' + expression + ';';
    instrumented = instrumented.replace(original,
      'const ' + variable + '=globalThis.' + HOOK + "('" + label + "',()=> (" + expression + '),' + gate + ');');
  }
  return {source: instrumented, replacements, original_sha256, instrumented_sha256: hash(instrumented)};
}

function statistics(values) {
  if (!values.length) return {sample_count: 0, total_ms: 0, min_ms: null, max_ms: null, p50_ms: null, p95_ms: null};
  const ordered = [...values].sort((a, b) => a - b);
  return {sample_count: ordered.length, total_ms: values.reduce((sum, value) => sum + value, 0),
    min_ms: ordered[0], max_ms: ordered[ordered.length - 1],
    p50_ms: ordered[Math.ceil(ordered.length * 0.5) - 1], p95_ms: ordered[Math.ceil(ordered.length * 0.95) - 1]};
}

function coherentMeasurements(record) {
  const measurements = record.measurements;
  if (!LABELS.every(label => {
    const value = measurements?.[label], buckets = value?.legacy_gate_buckets;
    return value && Number.isSafeInteger(value.calls) && value.calls > 0 && value.sample_count === value.calls
      && buckets && buckets.truthy.calls === value.legacyGateTruthy && buckets.falsy.calls === value.legacyGateFalsy
      && buckets.not_applicable.calls === value.legacyGateNotApplicable
      && ['truthy', 'falsy', 'not_applicable'].every(key => buckets[key].sample_count === buckets[key].calls)
      && value.legacyGateTruthy + value.legacyGateFalsy + value.legacyGateNotApplicable === value.calls;
  })) return false;
  const first = measurements['prior-ids-first'], second = measurements['prior-ids-second'], filter = measurements['refresh-filter'];
  return first.calls <= second.calls && second.calls === filter.calls
    && first.legacyGateTruthy === 0 && first.legacyGateFalsy === 0 && first.legacyGateNotApplicable === first.calls
    && second.legacyGateNotApplicable === 0 && filter.legacyGateNotApplicable === 0
    && second.legacyGateTruthy === filter.legacyGateTruthy && second.legacyGateFalsy === filter.legacyGateFalsy;
}

function createObserver({now = () => performance.now(), maxEvents = 20000} = {}) {
  const errors = [], cases = [];
  let active = null, calibration = null, instrumentation = null;
  const overhead = {bookkeeping_ms: 0, summary_ms: 0, flush_ms: 0, flush_calls: 0};
  function diagnosticError(code) {
    try { if (errors.length < 16 && !errors.includes(code)) errors.push(code); } catch { /* Never replace a product result. */ }
  }
  function clock() {
    try { const value = now(); if (Number.isFinite(value)) return value; } catch { /* Mark below without throwing into product code. */ }
    diagnosticError('diagnostic-clock-unavailable'); return null;
  }
  function safely(code, callback) { try { return callback(); } catch { diagnosticError(code); return undefined; } }
  const makeRecord = (framework, ordinal) => ({framework, ordinal, started: clock(), closed: false,
    event_cap_reached: false, events: [], counters: Object.fromEntries(LABELS.map(label => [label,
      {calls: 0, throws: 0, legacyGateTruthy: 0, legacyGateFalsy: 0, legacyGateNotApplicable: 0}])),
    overhead: {bookkeeping_ms: 0}});

  function measure(label, callback, legacyGate) {
    const record = active;
    if (!record || record.closed) return callback();
    const timing = safely('measurement-start-failed', () => {
      const outerStart = clock();
      if (!LABELS.includes(label)) { diagnosticError('unknown-measurement-label'); return null; }
      if (legacyGate !== null && typeof legacyGate !== 'boolean') diagnosticError('invalid-legacy-gate');
      return {outerStart, started: clock()};
    });
    if (!timing) return callback();
    const {outerStart, started} = timing;
    let threw = false;
    try { return callback(); }
    catch (error) { threw = true; throw error; }
    finally { safely('measurement-finalization-failed', () => {
      const ended = clock();
      safely('measurement-recording-failed', () => {
        const counter = record.counters[label]; counter.calls++; if (threw) counter.throws++;
        if (legacyGate === true) counter.legacyGateTruthy++;
        else if (legacyGate === false) counter.legacyGateFalsy++;
        else counter.legacyGateNotApplicable++;
        if (started === null || ended === null || ended < started) { diagnosticError('invalid-measurement-duration'); return; }
        if (record.events.length >= maxEvents) { record.event_cap_reached = true; diagnosticError('event-cap-reached'); return; }
        record.events.push({sequence: counter.calls, label, at_ms: started - record.started,
          duration_ms: ended - started, threw, ...(typeof legacyGate === 'boolean' ? {legacy_gate_truthy: legacyGate} : {})});
      });
      const outerEnd = clock();
      if ([outerStart, started, ended, outerEnd].every(value => value !== null)) {
        const cost = Math.max(0, started - outerStart) + Math.max(0, outerEnd - ended);
        safely('bookkeeping-recording-failed', () => { record.overhead.bookkeeping_ms += cost; overhead.bookkeeping_ms += cost; });
      }
    }); }
  }

  function summarize(record, ended, includeEvents) {
    const summaryStart = clock();
    const measurements = Object.fromEntries(LABELS.map(label => {
      const events = record.events.filter(event => event.label === label), counter = record.counters[label];
      const buckets = Object.fromEntries([['truthy', true, counter.legacyGateTruthy], ['falsy', false, counter.legacyGateFalsy],
        ['not_applicable', undefined, counter.legacyGateNotApplicable]].map(([key, gate, calls]) => {
        const selected = events.filter(event => event.legacy_gate_truthy === gate);
        return [key, {calls, throws: selected.filter(event => event.threw).length, ...statistics(selected.map(event => event.duration_ms))}];
      }));
      return [label, {...counter, ...statistics(events.map(event => event.duration_ms)), legacy_gate_buckets: buckets}];
    }));
    const result = {framework: record.framework, ordinal: record.ordinal, closed: record.closed,
      observation_elapsed_ms: ended === null || record.started === null ? null : ended - record.started,
      observation_window: 'Diagnostic beforeEach through observation, including fixture hooks; not the exact Jest body deadline',
      event_cap_reached: record.event_cap_reached, event_count: record.events.length, measurements, overhead: {...record.overhead}};
    if (includeEvents) result.events = record.events.map(event => ({...event}));
    const summaryEnd = clock();
    if (summaryStart !== null && summaryEnd !== null) overhead.summary_ms += Math.max(0, summaryEnd - summaryStart);
    return result;
  }

  function beginCase(name) {
    if (active) { diagnosticError('case-already-active'); return; }
    const framework = ['cis-ig1', 'soc-2', 'iso-27001'].find(key => typeof name === 'string' && name.startsWith(key + ' '));
    if (!framework) diagnosticError('unexpected-test-case');
    active = makeRecord(framework || 'unknown', cases.length + 1);
  }
  function snapshot() { return active ? summarize(active, clock(), false) : null; }
  function endCase(metadata = {}) {
    if (!active) { diagnosticError('missing-case'); return null; }
    const record = active, ended = clock(); record.closed = true; active = null;
    const result = {...summarize(record, ended, true), ...metadata};
    result.measurements_coherent = coherentMeasurements(result);
    cases.push(result); return result;
  }
  function calibrate() {
    if (active || cases.length || calibration) { diagnosticError('invalid-calibration-order'); return null; }
    const empty = () => undefined, iterations = 10000, baselineStart = clock();
    for (let index = 0; index < iterations; index++) empty();
    const baselineEnd = clock(), record = makeRecord('calibration', 0), observedStart = clock(); active = record;
    try { for (let index = 0; index < iterations; index++) measure('prior-ids-first', empty, null); }
    finally { record.closed = true; active = null; }
    const observedEnd = clock();
    calibration = {iterations, active_observer_path: true,
      empty_loop_ms: baselineStart === null || baselineEnd === null ? null : baselineEnd - baselineStart,
      empty_wrapper_loop_ms: observedStart === null || observedEnd === null ? null : observedEnd - observedStart,
      measurements: summarize(record, observedEnd, false).measurements['prior-ids-first'],
      bookkeeping_ms: record.overhead.bookkeeping_ms,
      limits: 'Active empty-callback calibration outside lifecycle cases. Timer floor, wrapper/callback calls, GC and JIT effects are not isolated; never subtract this automatically.'};
    const calibrationEnd = clock();
    calibration.total_elapsed_ms = baselineStart === null || calibrationEnd === null ? null : calibrationEnd - baselineStart;
    return calibration;
  }
  function noteFlush(duration) {
    if (!Number.isFinite(duration) || duration < 0) { diagnosticError('invalid-flush-duration'); return; }
    overhead.flush_calls++; overhead.flush_ms += duration;
  }
  function finish() {
    const complete = !active && cases.map(record => record.framework).join(',') === 'cis-ig1,soc-2,iso-27001';
    return {version: 1, diagnostic_only: true, complete,
      diagnostic_valid: complete && !!calibration && errors.length === 0
        && cases.every(record => !record.event_cap_reached && record.guards_preserved === true && record.measurements_coherent),
      errors: [...errors], event_cap_reached: cases.some(record => record.event_cap_reached) || !!active?.event_cap_reached,
      calibration, instrumentation, overhead: {...overhead}, cases: cases.map(({events, ...record}) => record),
      overhead_limits: 'Global bookkeeping includes calibration and lifecycle observations; case overhead is separate. Measured bookkeeping and JSON flush time are partial: the current/final receipt flush, timing calls, final counter updates and unisolated GC/callback costs are not fully included. No automatic subtraction.',
      outcome_qualification: 'The driver must correlate original Jest outcomes; ISO attribution is invalid if an earlier CIS or SOC case failed.',
      limits: 'Initializer wall attribution with measurement/flush overhead. Native CPU, GC and callback costs are not fully isolated. Not a timeout waiver, speed fix or browser acceptance.'};
  }
  function setInstrumentation(metadata) { instrumentation = metadata; }
  return {measure, beginCase, snapshot, endCase, calibrate, noteFlush, finish, diagnosticError, setInstrumentation};
}

module.exports = {HOOK, LABELS, SOURCE_SHA256, instrumentReportingSource, createObserver};
