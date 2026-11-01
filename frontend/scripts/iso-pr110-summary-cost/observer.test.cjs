const test = require('node:test');
const assert = require('node:assert/strict');
const {createObserver} = require('./observer.cjs');

function fixture(options = {}) {
  let clock = 100;
  const observer = createObserver({now: () => clock, ...options});
  return {observer, advance: amount => { clock += amount; }, set: value => { clock = value; }};
}
const begin = observer => observer.beginCase('iso-27001 fresh client retains the configured program lifecycle and period evidence');

test('synchronous thunk executes once and returns the identical value without inspecting it', () => {
  const h = fixture(), value = new Proxy({}, {get() { throw Error('Result must not be read'); }});
  let calls = 0; begin(h.observer);
  assert.equal(h.observer.measure(() => { calls++; h.advance(3); return value; }), value);
  const detail = h.observer.endCase();
  assert.equal(calls, 1); assert.deepEqual(detail.calls, [{i: 1, s: 0, e: 3, o: 'returned', d: 1, p: null}]);
  assert.deepEqual(detail.totals, {started: 1, returned: 1, threw: 0, retained: 1, pending: 0});
  assert.equal(detail.observation_elapsed_ms, 3); assert.deepEqual(detail.errors, []);
});

test('thrown primitive and object identities survive collection and no error details are read', () => {
  for (const failure of [undefined, null, 7, 'original', new Proxy({}, {get() { throw Error('Error must not be read'); }})]) {
    const h = fixture(); begin(h.observer); let calls = 0, caught = Symbol('not caught');
    try { h.observer.measure(() => { calls++; h.advance(2); throw failure; }); }
    catch (error) { caught = error; }
    assert.equal(caught, failure); assert.equal(calls, 1);
    const detail = h.observer.endCase();
    assert.equal(detail.calls[0].o, 'threw'); assert.equal(detail.calls[0].e, 2);
    assert.deepEqual(detail.totals, {started: 1, returned: 0, threw: 1, retained: 1, pending: 0});
  }
});

test('promises and thenables are returned synchronously without then access or settlement observers', () => {
  const h = fixture(), promise = Promise.resolve('unobserved'); begin(h.observer);
  const thenable = Object.defineProperty({}, 'then', {get() { throw Error('Then must not be read'); }});
  assert.equal(h.observer.measure(() => thenable), thenable);
  assert.equal(h.observer.measure(() => promise), promise);
  const detail = h.observer.endCase();
  assert.equal(detail.totals.returned, 2); assert.equal(detail.totals.pending, 0);
});

test('only original thunk getter/callback behavior occurs, with exact original exception', () => {
  const h = fixture(), failure = {original: true}; let reads = 0, callbacks = 0;
  const source = Object.defineProperty({}, 'value', {get() { reads++; return 9; }});
  begin(h.observer);
  assert.equal(h.observer.measure(() => [source.value].map(value => { callbacks++; return value + 1; })[0]), 10);
  assert.throws(() => h.observer.measure(() => { callbacks++; throw failure; }), error => error === failure);
  assert.equal(reads, 1); assert.equal(callbacks, 2); assert.deepEqual(h.observer.getErrors(), []);
});

test('nested calls retain inclusive intervals, depth and parent rather than exclusive savings', () => {
  const h = fixture(); begin(h.observer);
  h.observer.measure(() => {
    h.advance(2);
    h.observer.measure(() => { h.advance(3); });
    h.advance(5);
  });
  const detail = h.observer.endCase();
  assert.deepEqual(detail.calls, [{i: 1, s: 0, e: 10, o: 'returned', d: 1, p: null},
    {i: 2, s: 2, e: 5, o: 'returned', d: 2, p: 1}]);
  assert.deepEqual(detail.totals, {started: 2, returned: 2, threw: 0, retained: 2, pending: 0});
});

test('call cap stops detailed observation but preserves every native invocation and full outcome counts', () => {
  const h = fixture({maxCalls: 2}); begin(h.observer); let calls = 0;
  for (let i = 0; i < 5; i++) assert.equal(h.observer.measure(() => ++calls), i + 1);
  const detail = h.observer.endCase();
  assert.equal(calls, 5); assert.equal(detail.calls.length, 2); assert.equal(detail.call_cap_reached, true);
  assert.equal(detail.stopped, true); assert.deepEqual(detail.errors, ['call-cap-reached']);
  assert.deepEqual(detail.totals, {started: 5, returned: 5, threw: 0, retained: 2, pending: 0});
});

test('depth cap bounds retained pending records while deeper native execution and exceptions continue', () => {
  const h = fixture({maxDepth: 2}), failure = {at: 'depth 4'}; begin(h.observer); let calls = 0;
  const descend = depth => h.observer.measure(() => { calls++; if (depth === 4) throw failure; return descend(depth + 1); });
  assert.throws(() => descend(1), error => error === failure);
  const detail = h.observer.endCase();
  assert.equal(calls, 4); assert.equal(detail.depth_cap_reached, true); assert.equal(detail.calls.length, 2);
  assert.deepEqual(detail.totals, {started: 4, returned: 0, threw: 4, retained: 2, pending: 0});
  assert.deepEqual(detail.errors, ['depth-cap-reached']);
});

test('live pending and recent previews are bounded, detached and exclude application contents', () => {
  const h = fixture(); begin(h.observer);
  for (let i = 0; i < 7; i++) h.observer.measure(() => i);
  const descend = depth => h.observer.measure(() => {
    if (depth < 6) return descend(depth + 1);
    const view = h.observer.live();
    assert.equal(view.active, true); assert.equal(view.totals.pending, 6);
    assert.equal(view.pending.length, 4); assert.equal(view.recent.length, 4);
    assert.equal(Object.hasOwn(view, 'calls'), false);
    view.pending[0].o = 'external mutation'; view.recent.length = 0; view.errors.push('external');
    assert.equal(h.observer.live().pending[0].o, 'pending'); assert.equal(h.observer.live().recent.length, 4);
  });
  descend(1);
  const detail = h.observer.endCase();
  assert.equal(detail.totals.started, 13); assert.equal(detail.totals.pending, 0); assert.equal(detail.recent.length, 4);
  assert.deepEqual(detail.errors, []);
});

test('collector clock exceptions never replace successful or thrown application outcomes', () => {
  for (const targetRead of [1, 2, 3]) {
    for (const throws of [false, true]) {
      let reads = 0;
      const h = fixture({now() { if (++reads === targetRead) throw Error('Clock callback failure'); return reads; }});
      const outcome = {original: true}; begin(h.observer); let calls = 0, caught;
      try { assert.equal(h.observer.measure(() => { calls++; if (throws) throw outcome; return outcome; }), outcome); }
      catch (error) { caught = error; }
      if (throws) assert.equal(caught, outcome); else assert.equal(caught, undefined);
      assert.equal(calls, 1); const detail = h.observer.endCase();
      assert.equal(detail.stopped, true); assert(detail.errors.includes('observer-clock-failed'));
    }
  }
});

test('invalid and reversed clocks invalidate capture while delegation remains exact', () => {
  for (const invalid of [NaN, Infinity, '101', {}, 99]) {
    const h = fixture(); begin(h.observer); h.set(invalid);
    assert.equal(h.observer.measure(() => 'original result'), 'original result');
    const detail = h.observer.endCase();
    assert.equal(detail.stopped, true);
    assert(detail.errors.includes(invalid === 99 ? 'observer-clock-reversed' : 'observer-clock-invalid'));
  }
});

test('the default elapsed clock is independent of a replaced or frozen global Date', () => {
  const observer = createObserver(), NativeDate = globalThis.Date;
  let detail;
  try {
    globalThis.Date = function() { throw Error('Fake application Date must not time the diagnostic'); };
    begin(observer);
    assert.equal(observer.measure(() => 'original'), 'original');
    detail = observer.endCase();
  } finally { globalThis.Date = NativeDate; }
  assert.equal(detail.stopped, false); assert(Number.isFinite(detail.observation_elapsed_ms));
  assert(detail.calls[0].e >= detail.calls[0].s); assert.deepEqual(detail.errors, []);
});

test('observer bookkeeping uses captured push/pop rather than invoking later array callbacks', () => {
  const h = fixture(); begin(h.observer); const push = Array.prototype.push, pop = Array.prototype.pop;
  let callbackCount = 0, result;
  try {
    Array.prototype.push = function() { callbackCount++; throw Error('Later callback must not be called'); };
    Array.prototype.pop = function() { callbackCount++; throw Error('Later callback must not be called'); };
    result = h.observer.measure(() => 'unchanged');
  } finally { Array.prototype.push = push; Array.prototype.pop = pop; }
  assert.equal(result, 'unchanged'); assert.equal(callbackCount, 0); assert.deepEqual(h.observer.endCase().errors, []);
});

test('out-of-case calls are counted without clock or application-field inspection', () => {
  let clockReads = 0; const observer = createObserver({now() { clockReads++; return 10; }});
  const original = Object.defineProperty({}, 'toJSON', {get() { throw Error('No serialization'); }});
  assert.equal(observer.measure(() => original), original);
  assert.throws(() => observer.measure(() => { throw original; }), error => error === original);
  assert.equal(clockReads, 0); assert.deepEqual(observer.live(), {active: false, out_of_case_calls: 2, errors: []});
  begin(observer); assert.equal(observer.endCase().out_of_case_calls, 2);
  observer.measure(() => undefined); assert.equal(observer.live().out_of_case_calls, 3);
});

test('framework extraction and ordinal preserve original names without forcing calibration order', () => {
  const h = fixture();
  for (const [index, framework] of ['cis-ig1', 'soc-2', 'iso-27001'].entries()) {
    h.observer.beginCase(framework + ' fresh client retains the configured program lifecycle and period evidence');
    const detail = h.observer.endCase(); assert.equal(detail.framework, framework); assert.equal(detail.ordinal, index + 1);
  }
  h.observer.beginCase('unexpected'); assert.equal(h.observer.endCase().stopped, true);
  assert(h.observer.getErrors().includes('unexpected-case'));
});

test('ended case records are detached and later cases cannot rewrite them', () => {
  const h = fixture(); begin(h.observer); h.observer.measure(() => 1); const first = h.observer.endCase();
  first.calls[0].o = 'external'; first.errors.push('external');
  h.observer.beginCase('soc-2 fresh client retains the configured program lifecycle and period evidence');
  h.advance(5); h.observer.measure(() => 2); const second = h.observer.endCase();
  assert.equal(second.ordinal, 2); assert.equal(second.calls[0].o, 'returned'); assert.deepEqual(second.errors, []);
  assert.equal(h.observer.endCase(), null); assert.equal(h.observer.live().active, false);
});

test('explicit collector errors are safe, bounded and prevent later detailed capture', () => {
  const h = fixture(); begin(h.observer);
  for (let i = 0; i < 30; i++) h.observer.error('synthetic-error-' + i);
  h.observer.error(Object.defineProperty({}, 'toString', {get() { throw Error('Do not coerce errors'); }}));
  assert.equal(h.observer.measure(() => 'delegate'), 'delegate');
  const detail = h.observer.endCase(); assert.equal(detail.errors.length, 16); assert.equal(detail.calls.length, 0);
  assert.equal(detail.totals.started, 1); assert.equal(detail.totals.returned, 1); assert.equal(detail.stopped, true);
  assert.equal(h.observer.getErrors().length, 16);
});

test('closing a case during a native callback preserves the frozen pending cutoff and original result', () => {
  const h = fixture(); begin(h.observer); let cutoff;
  assert.equal(h.observer.measure(() => { cutoff = h.observer.endCase(); return 'original'; }), 'original');
  assert.equal(cutoff.calls[0].o, 'pending'); assert.equal(cutoff.calls[0].e, null); assert.equal(cutoff.totals.pending, 1);
  assert(cutoff.errors.includes('case-ended-with-pending-calls'));
  assert(h.observer.getErrors().includes('cross-case-settlement'));
});

test('overlapping cases fail closed without suppressing native calls', () => {
  const h = fixture(); begin(h.observer); begin(h.observer);
  let calls = 0; assert.equal(h.observer.measure(() => ++calls), 1);
  const detail = h.observer.endCase(); assert.equal(detail.stopped, true); assert.equal(detail.totals.returned, 1);
  assert(h.observer.getErrors().includes('overlapping-case'));
});

test('unsafe observer limits fail before workload setup', () => {
  for (const maxCalls of [0, -1, 16385, 1.5, NaN]) assert.throws(() => createObserver({maxCalls}), RangeError);
  for (const maxDepth of [0, -1, 17, 1.5, NaN]) assert.throws(() => createObserver({maxDepth}), RangeError);
  assert.throws(() => createObserver({now: null}), TypeError);
});
