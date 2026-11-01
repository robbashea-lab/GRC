// Diagnostic-only synchronous call observer. Never inspects application arguments or results.
const {performance} = require('node:perf_hooks');
const monotonicNow = performance.now.bind(performance);
const push = Function.call.bind(Array.prototype.push);
const pop = Function.call.bind(Array.prototype.pop);
const FRAMEWORKS = ['cis-ig1', 'soc-2', 'iso-27001'];
const ERROR_LIMIT = 16, PREVIEW_LIMIT = 4;

function createObserver({now = monotonicNow, maxCalls = 16384, maxDepth = 16} = {}) {
  if (typeof now !== 'function') throw new TypeError('A monotonic clock is required');
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 16384)
    throw new RangeError('Call cap must be between 1 and 16384');
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 16)
    throw new RangeError('Depth cap must be between 1 and 16');
  let current = null, ordinal = 0, outOfCaseCalls = 0;
  const errors = [];

  function appendError(list, code) {
    for (let i = 0; i < list.length; i++) if (list[i] === code) return;
    if (list.length < ERROR_LIMIT) push(list, code);
  }
  function fail(code, owner = current) {
    // Collector failures must not replace the application's return or thrown object.
    try {
      const safe = typeof code === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(code) ? code : 'observer-error';
      appendError(errors, safe);
      if (owner) { appendError(owner.errors, safe); owner.stopped = true; }
    } catch {
      // Internal state consists only of owned plain records; keep delegation safe even if collection fails.
      try { if (owner) owner.stopped = true; } catch {}
    }
  }
  function time(owner) {
    let value;
    try { value = now(); }
    catch { fail('observer-clock-failed', owner); return owner.lastTime; }
    if (!Number.isFinite(value)) { fail('observer-clock-invalid', owner); return owner.lastTime; }
    if (value < owner.lastTime) { fail('observer-clock-reversed', owner); return owner.lastTime; }
    owner.lastTime = value;
    return value;
  }
  const copyRecord = entry => ({i: entry.i, s: entry.s, e: entry.e, o: entry.o, d: entry.d, p: entry.p});
  function copyErrors(values) {
    const result = [];
    for (let i = 0; i < values.length; i++) push(result, values[i]);
    return result;
  }
  function previews(owner) {
    const pending = [], recent = [];
    for (let i = 0; i < owner.stack.length && pending.length < PREVIEW_LIMIT; i++) push(pending, copyRecord(owner.stack[i]));
    for (let i = 0; i < owner.recent.length; i++) push(recent, copyRecord(owner.recent[i]));
    return {pending, recent};
  }
  function metadata(owner, elapsed) {
    return {framework: owner.framework, ordinal: owner.ordinal, observation_elapsed_ms: elapsed,
      totals: {started: owner.startedCount, returned: owner.returnedCount, threw: owner.threwCount,
        retained: owner.calls.length, pending: owner.pendingCount},
      ...previews(owner), stopped: owner.stopped, call_cap_reached: owner.callCap,
      depth_cap_reached: owner.depthCap, errors: copyErrors(owner.errors), out_of_case_calls: outOfCaseCalls};
  }
  function beginCase(name) {
    if (current) { fail('overlapping-case'); endCase(); }
    let framework = 'unknown';
    if (typeof name === 'string') for (let i = 0; i < FRAMEWORKS.length; i++) {
      if (name.startsWith(FRAMEWORKS[i] + ' ')) { framework = FRAMEWORKS[i]; break; }
    }
    const owner = {framework, ordinal: ++ordinal, started: 0, lastTime: -Infinity,
      calls: [], stack: [], recent: [], startedCount: 0, returnedCount: 0, threwCount: 0,
      pendingCount: 0, depth: 0, errors: [], stopped: errors.length > 0,
      callCap: false, depthCap: false, closed: false};
    current = owner;
    if (errors.length) appendError(owner.errors, 'prior-case-invalid');
    if (framework === 'unknown') fail('unexpected-case', owner);
    const started = time(owner);
    // An invalid first clock read has no finite fallback; the capture remains invalid.
    owner.started = Number.isFinite(started) ? started : 0;
    if (!Number.isFinite(owner.lastTime)) owner.lastTime = owner.started;
  }
  function start(owner) {
    owner.startedCount++;
    owner.pendingCount++;
    owner.depth++;
    if (owner.stopped) return null;
    if (owner.depth > maxDepth) {
      owner.depthCap = true; fail('depth-cap-reached', owner); return null;
    }
    if (owner.calls.length >= maxCalls) {
      owner.callCap = true; fail('call-cap-reached', owner); return null;
    }
    const parent = owner.stack.length ? owner.stack[owner.stack.length - 1].i : null;
    const entry = {i: owner.startedCount, s: null, e: null, o: 'pending', d: owner.depth, p: parent};
    push(owner.calls, entry); push(owner.stack, entry);
    // Allocate bookkeeping first; the interval begins immediately before invoking the original thunk.
    entry.s = time(owner) - owner.started;
    return entry;
  }
  function finish(owner, entry, returned) {
    // The first action after the thunk is the end-clock read, before counters/preview work.
    const ended = entry ? time(owner) - owner.started : null;
    if (owner.closed || owner !== current) { fail('cross-case-settlement', owner); return; }
    owner.pendingCount--; owner.depth--;
    if (returned) owner.returnedCount++; else owner.threwCount++;
    if (!entry) return;
    entry.e = ended; entry.o = returned ? 'returned' : 'threw';
    if (owner.stack[owner.stack.length - 1] !== entry) { fail('call-stack-mismatch', owner); return; }
    pop(owner.stack);
    if (owner.recent.length === PREVIEW_LIMIT) {
      for (let i = 1; i < PREVIEW_LIMIT; i++) owner.recent[i - 1] = owner.recent[i];
      owner.recent.length = PREVIEW_LIMIT - 1;
    }
    push(owner.recent, entry);
  }
  function measure(thunk) {
    const owner = current;
    let entry = null, returned = false;
    if (owner) {
      try { entry = start(owner); } catch { fail('observer-entry-failed', owner); }
    } else {
      try { outOfCaseCalls++; } catch { fail('out-of-case-count-failed'); }
    }
    try {
      const result = thunk();
      returned = true;
      return result;
    } finally {
      if (owner) try { finish(owner, entry, returned); } catch { fail('observer-settlement-failed', owner); }
    }
  }
  function live() {
    if (!current) return {active: false, out_of_case_calls: outOfCaseCalls, errors: copyErrors(errors)};
    try { return {active: true, ...metadata(current, time(current) - current.started)}; }
    catch { fail('live-observation-failed'); return {active: true, stopped: true, errors: copyErrors(errors), out_of_case_calls: outOfCaseCalls}; }
  }
  function endCase() {
    const owner = current;
    if (!owner) return null;
    try {
      if (owner.pendingCount) fail('case-ended-with-pending-calls', owner);
      const elapsed = time(owner) - owner.started, calls = [];
      for (let i = 0; i < owner.calls.length; i++) push(calls, copyRecord(owner.calls[i]));
      return {...metadata(owner, elapsed), calls};
    } catch {
      fail('case-observation-failed', owner);
      return {framework: owner.framework, ordinal: owner.ordinal, stopped: true,
        errors: copyErrors(owner.errors), out_of_case_calls: outOfCaseCalls};
    } finally { owner.closed = true; current = null; }
  }
  return {beginCase, measure, endCase, live, error: code => fail(code), getErrors: () => copyErrors(errors)};
}

module.exports = {createObserver};
