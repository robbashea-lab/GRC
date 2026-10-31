const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createObserver, routePattern} = require('./observer.cjs');
const nativeThen = Promise.prototype.then;
const config = (url = '/reviews/private-id/iso-audit/A-5-1?secret=hidden') => ({method: 'PATCH', url});
const deferred = () => {let resolve, reject;const promise = new Promise((yes, no) => {resolve = yes;reject = no;});return {promise, resolve, reject};};
function fixture(options = {}) {
  let clock = 0;
  const observer = createObserver({now: () => clock, scenarioDate: () => '2031-12-31T14:00:00.000Z', ...options});
  observer.beginCase('iso-27001 native lifecycle');
  return {observer, at: value => {clock = value;}};
}

test('two boundaries preserve this, exact args and return values while retaining only sanitized metadata and string lengths', () => {
  const {observer, at} = fixture(), receiver = {}, marker = {}, calls = [];
  const writer = observer.wrapWriter(function (...args) {calls.push({kind: 'write', receiver: this, args});at(5);return 'encoded';});
  const command = observer.wrapCommand(function (...args) {calls.push({kind: 'command', receiver: this, args});at(2);assert.equal(writer.call(this, marker, 'secret-key', 'private Unicode 😀'), 'encoded');at(7);return marker;});
  const request = config();assert.equal(command.call(receiver, request, marker), marker);
  const result = observer.endCase();
  assert.equal(calls.length, 2);assert.equal(calls[0].receiver, receiver);assert.equal(calls[0].args[0], request);assert.equal(calls[0].args[1], marker);
  assert.equal(calls[1].receiver, receiver);assert.equal(calls[1].args[0], marker);assert.equal(calls[1].args[2], 'private Unicode 😀');
  assert.deepEqual(result.totals, {commands_started: 1, commands_settled: 1, writes_started: 1, writes_settled: 1});
  assert.deepEqual(result.commands[0], {id: 1, start_ms: 0, outcome: 'returned', method: 'patch', route: '/reviews/:id/iso-audit/A-5-1',
    scenario_date: '2031-12-31T14:00:00.000Z', end_ms: 7, wall_ms: 7});
  assert.deepEqual(result.writes[0], {id: 1, start_ms: 2, outcome: 'returned', command_id: 1, input_utf16_units: 'private Unicode 😀'.length,
    end_ms: 5, wall_ms: 3, output_utf16_units: 7});
  assert.deepEqual(result.errors, []);assert.equal(result.stopped, false);
  const json = JSON.stringify(result);for (const forbidden of ['private-id', 'secret=hidden', 'secret-key', 'private Unicode', 'encoded']) assert.equal(json.includes(forbidden), false);
});

test('native promise identity, fulfillment and exact rejections pass through without async wrappers or then-getter access', async () => {
  const {observer, at} = fixture(), write = deferred();let thenReads = 0;
  Object.defineProperty(write.promise, 'then', {configurable: true, get() {thenReads++;throw new Error('Do not read then');}});
  const writer = observer.wrapWriter(() => write.promise), command = observer.wrapCommand(() => writer(null, 'key', 'input'));
  const returned = command(config());assert.equal(returned, write.promise);assert.equal(thenReads, 0);
  at(10);write.resolve('output');await Reflect.apply(nativeThen, write.promise, [value => value]);
  const result = observer.endCase();assert.equal(result.commands[0].outcome, 'fulfilled');assert.equal(result.writes[0].outcome, 'fulfilled');
  assert.equal(result.writes[0].output_utf16_units, 6);assert.deepEqual(result.errors, []);assert.equal(thenReads, 0);

  const other = fixture(), rejection = deferred(), failure = new Error('Native failure must retain identity');
  const rejectWriter = other.observer.wrapWriter(() => rejection.promise), rejectCommand = other.observer.wrapCommand(() => rejectWriter(null, 'key', 'input'));
  const original = rejectCommand(config());assert.equal(original, rejection.promise);rejection.reject(failure);
  await assert.rejects(original, error => error === failure);
  const rejected = other.observer.endCase();assert.equal(rejected.commands[0].outcome, 'rejected');assert.equal(rejected.writes[0].outcome, 'rejected');
  assert.equal(Object.hasOwn(rejected.writes[0], 'output_utf16_units'), false);assert.deepEqual(rejected.errors, []);
  assert.equal(JSON.stringify(rejected).includes(failure.message), false);
});

test('synchronous throws retain exact error identity and never become observer errors or saved error messages', () => {
  const {observer} = fixture(), failure = {private: 'original error object'};
  const writer = observer.wrapWriter(() => {throw failure;}), command = observer.wrapCommand(() => writer(null, 'key', 'input'));
  assert.throws(() => command(config()), error => error === failure);
  const result = observer.endCase();assert.equal(result.commands[0].outcome, 'threw');assert.equal(result.writes[0].outcome, 'threw');
  assert.deepEqual(result.errors, []);assert.equal(JSON.stringify(result).includes('original error'), false);
});

test('unsafe config accessors and proxy traps never run through metadata reads or change the original function outcome', () => {
  let getterReads = 0, calls = 0;
  const request = {};Object.defineProperty(request, 'method', {get() {getterReads++;throw new Error('Getter');}});Object.defineProperty(request, 'url', {get() {getterReads++;throw new Error('Getter');}});
  const {observer} = fixture(), wrapped = observer.wrapCommand(value => {calls++;assert.equal(value, request);return 42;});
  assert.equal(wrapped(request), 42);assert.equal(getterReads, 0);assert.equal(calls, 1);
  const result = observer.endCase();assert.equal(result.stopped, true);assert(result.errors.includes('command-metadata-unavailable'));assert.equal(result.commands[0].outcome, 'returned');
  const second = fixture(), proxy = new Proxy({}, {getOwnPropertyDescriptor() {throw new Error('Trap');}});
  assert.equal(second.observer.wrapCommand(() => 'original')(proxy), 'original');assert(second.observer.endCase().errors.includes('command-metadata-failed'));
});

test('unknown writer input/output types never retain objects, inspect getters or fabricate lengths', () => {
  let reads = 0;const original = {get length() {reads++;throw new Error('length');}}, {observer} = fixture();
  const writer = observer.wrapWriter((_storage, _key, value) => {assert.equal(value, original);return original;});
  assert.equal(observer.wrapCommand(() => writer(null, 'key', original))(config()), original);
  const result = observer.endCase();assert.equal(reads, 0);assert.equal(Object.hasOwn(result.writes[0], 'input_utf16_units'), false);
  assert.equal(Object.hasOwn(result.writes[0], 'output_utf16_units'), false);assert(result.errors.includes('write-input-unavailable'));assert(result.errors.includes('write-output-unavailable'));
});

test('overlapping command invocations invalidate new collection but every original invocation still runs exactly once', async () => {
  const {observer} = fixture(), pending = deferred();let calls = 0;
  const command = observer.wrapCommand(() => {calls++;return calls === 1 ? pending.promise : 'original';});
  const first = command(config('/reviews/first'));assert.equal(command(config('/reviews/second')), 'original');assert.equal(command(config('/reviews/third')), 'original');
  pending.resolve('one');assert.equal(await first, 'one');const result = observer.endCase();
  assert.equal(calls, 3);assert.equal(result.commands.length, 2);assert(result.errors.includes('overlapping-command'));assert.equal(result.stopped, true);
  assert.equal(result.pending_counts.commands, 0);assert.equal(result.commands[0].outcome, 'fulfilled');
});

test('overlapping writes freeze both entry associations and stop additional records without altering original promises', async () => {
  const {observer} = fixture(), first = deferred(), second = deferred();let calls = 0;
  const writer = observer.wrapWriter(() => (++calls === 1 ? first.promise : second.promise));
  const command = observer.wrapCommand(() => {const a = writer(null, 'key', 'a'), b = writer(null, 'key', 'b');assert.equal(a, first.promise);assert.equal(b, second.promise);return Promise.all([a, b]);});
  const pending = command(config());first.resolve('A');second.resolve('B');assert.deepEqual(await pending, ['A', 'B']);
  const result = observer.endCase();assert.equal(calls, 2);assert.deepEqual(result.writes.map(row => row.command_id), [1, 1]);
  assert(result.errors.includes('overlapping-write'));assert.equal(result.writes.length, 2);assert.equal(result.pending_counts.writes, 0);
});

test('an unassociated write is explicit and a command finishing before its write cannot transfer that write to a later command', async () => {
  const unassociated = fixture();assert.equal(unassociated.observer.wrapWriter(() => 'saved')(null, 'key', 'input'), 'saved');
  const orphan = unassociated.observer.endCase();assert.equal(orphan.writes[0].command_id, null);assert(orphan.errors.includes('unassociated-write'));
  const {observer} = fixture(), write = deferred(), commandDone = deferred();
  const writer = observer.wrapWriter(() => write.promise), command = observer.wrapCommand(() => {writer(null, 'key', 'input');return commandDone.promise;});
  const first = command(config());commandDone.resolve('done');await first;
  assert.equal(observer.wrapCommand(() => 99)(config('/reviews/other')), 99);write.resolve('saved');await write.promise;
  const result = observer.endCase();assert(result.errors.includes('command-ended-before-write'));assert.equal(result.commands.length, 1);
  assert.equal(result.writes[0].command_id, 1);assert.equal(result.writes[0].outcome, 'fulfilled');
});

test('command and writer caps bound arrays while stopped observers keep delegating without retries', () => {
  const {observer} = fixture({maxCommands: 2}), commandCalls = [];
  const command = observer.wrapCommand(value => {commandCalls.push(value);return value;});
  for (let index = 0; index < 4; index++) {const value = config();assert.equal(command(value), value);}
  const result = observer.endCase();assert.equal(commandCalls.length, 4);assert.equal(result.commands.length, 2);assert.equal(result.command_cap_reached, true);
  const other = fixture({maxWrites: 2});let writes = 0;
  const writer = other.observer.wrapWriter(() => {writes++;return 'saved';});other.observer.wrapCommand(() => {for (let index = 0; index < 4; index++) writer(null, 'key', 'input');})(config());
  const written = other.observer.endCase();assert.equal(writes, 4);assert.equal(written.writes.length, 2);assert.equal(written.write_cap_reached, true);
  assert.throws(() => createObserver({maxCommands: 4097}), /caps/);assert.throws(() => createObserver({maxWrites: 0}), /caps/);
});

test('live records are copied, window counters are delta counts and total recent/pending entries never exceed16', () => {
  const {observer, at} = fixture(), writer = observer.wrapWriter(() => 'encoded'), command = observer.wrapCommand(() => writer(null, 'key', 'private-payload'));
  for (let index = 0; index < 30; index++) {at(index);command(config());}
  at(40);const first = observer.live();assert.equal(Object.hasOwn(first, 'commands'), false);assert.equal(Object.hasOwn(first, 'writes'), false);
  const entries = Object.values(first.recent).flat().length + Object.values(first.pending).flat().length;assert(entries <= 16);
  assert.equal(first.recent.commands.length, 4);assert.equal(first.recent.writes.length, 4);assert.equal(first.totals.commands_started, 30);
  assert.deepEqual(first.window_counts, first.totals);first.recent.commands[0].route = 'modified snapshot';first.totals.commands_started = 999;
  at(45);const second = observer.live();assert.equal(second.window_elapsed_ms, 5);
  assert.deepEqual(second.window_counts, {commands_started: 0, commands_settled: 0, writes_started: 0, writes_settled: 0});
  assert.equal(JSON.stringify(second).includes('modified snapshot'), false);assert.equal(JSON.stringify(second).includes('private-payload'), false);
  const result = observer.endCase();assert.equal(result.commands.length, 30);assert.equal(result.writes.length, 30);assert.deepEqual(result.errors, []);
});

test('ISO pending at the frozen cutoff is valid and late fulfillment neither rewrites it nor creates a generic error', async () => {
  const {observer, at} = fixture(), write = deferred(), writer = observer.wrapWriter(() => write.promise), command = observer.wrapCommand(() => writer(null, 'key', 'input'));
  const pending = command(config());at(180000);const result = observer.endCase(), before = JSON.stringify(result);
  assert.deepEqual(result.pending_counts, {commands: 1, writes: 1});assert.equal(result.commands[0].outcome, 'pending');assert.equal(result.writes[0].command_id, 1);
  assert.deepEqual(result.errors, []);assert.equal(result.stopped, false);assert.equal(result.observation_elapsed_ms, 180000);
  write.resolve('saved');await pending;assert.equal(JSON.stringify(result), before);assert.deepEqual(observer.getErrors(), []);assert.equal(observer.live(), null);
  assert.equal(observer.wrapCommand(() => 'late native continuation')(config()), 'late native continuation');assert.deepEqual(observer.getErrors(), []);
});

test('pending predecessor work carried into a new case invalidates collection without reassigning old outcomes', async () => {
  const {observer} = fixture(), pending = deferred();const returned = observer.wrapCommand(() => pending.promise)(config());
  const first = observer.endCase(), before = JSON.stringify(first);observer.beginCase('soc-2 next native lifecycle');
  assert.equal(observer.wrapCommand(() => 'native second result')(config()), 'native second result');pending.resolve('old native result');await returned;
  const second = observer.endCase();assert.equal(second.framework, 'soc-2');assert.equal(second.ordinal, 2);assert(second.errors.includes('cross-case-pending'));
  assert.equal(second.commands.length, 0);assert.equal(second.stopped, true);assert.equal(JSON.stringify(first), before);
});

test('clock, date and promise-observer failures never change original outcomes and invalid metadata stops further collection', async () => {
  const broken = fixture({now: () => {throw new Error('Clock');}});assert.equal(broken.observer.wrapCommand(() => 3)(config()), 3);assert(broken.observer.getErrors().includes('observer-clock-failed'));
  const badDate = fixture({scenarioDate: () => {throw new Error('Date');}});assert.equal(badDate.observer.wrapCommand(() => 7)(config()), 7);assert(badDate.observer.endCase().errors.includes('command-metadata-failed'));
  const other = fixture(), pending = deferred();Object.defineProperty(pending.promise, 'constructor', {configurable: true, get() {throw new Error('Species getter');}});
  assert.equal(other.observer.wrapCommand(() => pending.promise)(config()), pending.promise);assert(other.observer.getErrors().includes('promise-observer-failed'));
  delete pending.promise.constructor;pending.resolve('native outcome');assert.equal(await pending.promise, 'native outcome');other.observer.endCase();
});

test('sanitization removes identifiers/query material and observation installs no global hooks or replacement intrinsics', () => {
  const before = [JSON.parse, JSON.stringify, Object.keys, Object.getOwnPropertyDescriptor, Promise.prototype.then, Array.prototype.map, Set.prototype.add];
  assert.equal(routePattern('/frameworks/iso-27001?client_id=secret'), '/frameworks/iso-27001');assert.equal(routePattern('/clients/secret/profile#token'), '/clients/:id/profile');
  assert.equal(routePattern('/reviews/secret/iso-audit/private-item'), '/reviews/:id/iso-audit/:item');assert.equal(routePattern('https://secret.test/path'), 'unavailable');
  assert.equal(routePattern('/iso-audit/activate?client_id=secret'), '/iso-audit/activate');
  const {observer} = fixture(), command = observer.wrapCommand(() => 1);assert.equal(observer.wrapCommand(command), command);
  command({method: 'POST', url: '/iso-audit/activate?client_id=secret'});const result = observer.endCase();
  assert.equal(result.commands[0].method, 'post');assert.equal(result.commands[0].route, '/iso-audit/activate');assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.deepEqual([JSON.parse, JSON.stringify, Object.keys, Object.getOwnPropertyDescriptor, Promise.prototype.then, Array.prototype.map, Set.prototype.add], before);
});
