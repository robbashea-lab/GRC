const test = require('node:test');
const assert = require('node:assert/strict');
const {createPhaseLogger, createArtifactWriter, routePattern, sourceCallsite, unionDuration} = require('./iso-phase-logger.cjs');

test('route and callsite output exclude bodies, queries, generated IDs and account paths', () => {
  assert.equal(routePattern('/reviews/private-person@example.com/iso-audit/A-8-3?token=secret'), '/reviews/:id/iso-audit/A-8-3');
  assert.equal(routePattern('/clients/client-private/profile'), '/clients/:id/profile');
  assert.equal(routePattern('/evidence-library/items/private-file-id'), '/evidence-library/items/:id');
  assert.equal(routePattern('/frameworks/iso-27001'), '/frameworks/iso-27001');
  assert.equal(routePattern('https://private.example.com/reviews'), 'unavailable');
  assert.equal(routePattern('/private@example.com'), '/:unrecognized-route');
  assert.deepEqual(sourceCallsite('at C:\\Users\\PrivatePerson\\frameworkFiveYear.test.js:186:21\nat /private/other.js:1:2'), ['frameworkFiveYear.test.js:186:21']);
});

test('observing returns the exact promise, result and error and never inspects custom getters/toJSON', async () => {
  let time = 0, calls = 0, getterCalls = 0, toJSONCalls = 0, resolve;
  const logger = createPhaseLogger({now: () => time}); logger.beginCase('iso-27001 original lifecycle');
  const config = {get url() { getterCalls++; return '/reviews/private-id'; }, method: 'post',
    toJSON() { toJSONCalls++; throw Error('Do not inspect application values'); }};
  const receiver = {}, promise = new Promise(done => { resolve = done; });
  const actual = function(argument) { calls++; assert.equal(this, receiver); assert.equal(argument, config); return promise; };
  const observed = logger.observe('command', actual, {async: true, command: true});
  assert.equal(observed.call(receiver, config), promise);
  const value = {secret: 'Never serialize this result', toJSON: config.toJSON};
  time = 5; resolve(value); assert.equal(await promise, value); await Promise.resolve();
  const error = Error('Original private error');
  const rejected = Promise.reject(error);
  assert.equal(logger.observe('failure', () => rejected, {async: true})(), rejected);
  await assert.rejects(rejected, candidate => candidate === error);
  const thenable = {get then() { getterCalls++; throw error; }};
  assert.equal(logger.observe('thenable', () => thenable, {async: true})(), thenable);
  assert.equal(calls, 1); assert.equal(getterCalls, 0); assert.equal(toJSONCalls, 0);
  const result = logger.endCase();
  assert.equal(result.spans[0].route, 'unavailable');
  assert.equal(result.groups.command.settled, 1); assert.equal(result.groups.failure.settled, 1);
  assert.equal(result.spans.find(span => span.phase === 'failure').failed, true);
  assert.equal(JSON.stringify(result).includes('Never serialize this result'), false);
  assert.deepEqual(logger.getErrors(), []);
  logger.beginCase('iso-27001 original lifecycle');
  assert.equal(logger.observe('actual-get', argument => argument.url, {command: true})(config), '/reviews/private-id');
  assert.equal(getterCalls, 1); // Actual application access is preserved, without an observer access.
  logger.endCase();
});

test('artifact writes are atomic and I/O failure invalidates diagnostics without throwing', () => {
  const calls = [], errors = [];
  const fs = {mkdirSync: (...args) => calls.push(['mkdir', ...args]),
    writeFileSync: (...args) => calls.push(['write', ...args]), renameSync: (...args) => calls.push(['rename', ...args])};
  const write = createArtifactWriter('/diagnostic-output', code => errors.push(code), fs);
  assert.equal(write('iso-phase-live.json', {diagnostic_only: true}), true);
  assert.equal(calls[1][1].endsWith('iso-phase-live.json.tmp'), true);
  assert.equal(calls[2][2].endsWith('iso-phase-live.json'), true);
  fs.renameSync = () => { throw Error('Private operating-system path must not be logged'); };
  assert.equal(write('iso-phase-summary.json', {}), false);
  assert.deepEqual(errors, ['diagnostic-write-failed']);
});

test('exclusive wall groups subtract the union of overlapping children and clip unsettled children at cutoff', async () => {
  let time = 0, releaseParent, releaseFirst, releaseSecond;
  const logger = createPhaseLogger({now: () => time}); logger.beginCase('iso-27001 original lifecycle');
  const first = logger.observe('child', () => new Promise(resolve => { releaseFirst = resolve; }), {async: true});
  const second = logger.observe('child', () => new Promise(resolve => { releaseSecond = resolve; }), {async: true});
  const parent = logger.observe('parent', () => {
    time = 2; first(); time = 4; second();
    return new Promise(resolve => { releaseParent = resolve; });
  }, {async: true});
  const pending = parent(); time = 8; releaseFirst(); await Promise.resolve();
  time = 10; const result = logger.endCase();
  assert.equal(result.groups.parent.inclusive_wall_ms, 10);
  assert.equal(result.groups.parent.exclusive_observed_wall_ms, 2);
  assert.equal(result.groups.child.inclusive_wall_ms, 12);
  assert.equal(result.pending.length, 2);
  assert.deepEqual(result.spans.map(span => span.parent), [null, 1, 1]);
  time = 20; releaseSecond(); releaseParent(); await pending; await Promise.resolve();
  assert.equal(result.spans[0].end_ms, undefined); // A late settlement cannot rewrite the saved cutoff.
  assert.equal(unionDuration([[0, 6], [3, 8], [8, 10], [5, 5]]), 10);
});

test('span admission is bounded without skipping application calls; diagnostic clock failures do not replace outcomes', () => {
  let calls = 0, time = 0;
  const logger = createPhaseLogger({now: () => time, maxSpans: 1}); logger.beginCase('soc-2 original lifecycle');
  const observed = logger.observe('work', () => ++calls);
  assert.equal(observed(), 1); time = 2; assert.equal(observed(), 2);
  const result = logger.endCase(); assert.equal(result.span_count, 1); assert.equal(result.span_cap_reached, true);
  assert.deepEqual(logger.getErrors(), ['span-cap-reached']);
  const broken = createPhaseLogger({now: () => { if (calls > 2) throw Error('Diagnostic only'); return 0; }});
  broken.beginCase('cis-ig1 original lifecycle'); calls++;
  assert.equal(broken.observe('work', () => 'original outcome')(), 'original outcome');
  assert.deepEqual(broken.getErrors(), ['span-start-failed']);
});
