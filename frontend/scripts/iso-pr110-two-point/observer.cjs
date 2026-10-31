// Diagnostic-only command/write observations; application results remain authoritative.
const {performance} = require('node:perf_hooks');
const {isPromise} = require('node:util').types;
const nativeThen = Promise.prototype.then;
const FRAMEWORKS = ['cis-ig1', 'soc-2', 'iso-27001'];
const ROOTS = new Set(['auth', 'demo', 'clients', 'users', 'reviews', 'tasks', 'risks', 'vendors', 'policies', 'assets',
  'findings', 'framework_assessments', 'organizational-controls', 'evidence', 'evidence-library', 'onboarding',
  'frameworks', 'portfolio', 'calendar', 'dashboard', 'iso-audit']);
const OPERATIONS = new Set(['me', 'enter', 'logout', 'baseline', 'finalize', 'activate', 'profile', 'assignees',
  'client-memberships', 'links', 'start', 'complete', 'create-finding', 'iso-audit', 'approval-subject', 'submit-review',
  'approve', 'accept', 'close', 'review-history', 'migrate', 'observations', 'items', 'catalog', 'configuration', 'reporting']);
const copy = entry => ({...entry});

function routePattern(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return 'unavailable';
  const parts = value.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  if (!ROOTS.has(parts[0])) return '/:unrecognized-route';
  return '/' + parts.map((part, index) => {
    if (index === 0) return part;
    if (parts[0] === 'frameworks' && index === 1) return FRAMEWORKS.includes(part) ? part : ':id';
    if (parts[0] === 'reviews' && index === 3 && parts[2] === 'iso-audit') return /^(?:A-)?\d+(?:-\d+)*$/.test(part) ? part : ':item';
    return OPERATIONS.has(part) ? part : ':id';
  }).join('/');
}
function ownData(object, key) {
  if (!object || typeof object !== 'object' && typeof object !== 'function') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function createObserver({now = () => performance.now(), scenarioDate = () => new Date().toISOString(), maxCommands = 4096, maxWrites = 4096} = {}) {
  if (![maxCommands, maxWrites].every(value => Number.isSafeInteger(value) && value > 0 && value <= 4096)) throw new RangeError('Observation caps must be positive and at most 4096');
  const errors = [], wrappers = {command: new WeakSet(), write: new WeakSet()};
  let current = null, previous = null, ordinal = 0;
  const append = (list, code) => {if (list.length < 16 && !list.includes(code)) list.push(code);};
  function error(code) {
    const safe = typeof code === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(code) ? code : 'observer-error';
    append(errors, safe);
    if (current) {append(current.errors, safe);current.stopped = true;}
  }
  function time(owner) {
    let at;
    try {at = now();} catch {error('observer-clock-failed');}
    if (!Number.isFinite(at)) {error('observer-clock-invalid');return owner?.lastTime ?? 0;}
    if (owner && at < owner.lastTime) {error('observer-clock-reversed');return owner.lastTime;}
    if (owner) owner.lastTime = at;
    return at;
  }
  const totals = owner => ({commands_started: owner.commands.length, commands_settled: owner.commandsSettled,
    writes_started: owner.writes.length, writes_settled: owner.writesSettled});
  const pending = owner => ({commands: [...owner.pendingCommands].slice(0, 4).map(id => copy(owner.commands[id - 1])),
    writes: [...owner.pendingWrites].slice(0, 4).map(id => copy(owner.writes[id - 1]))});
  function snapshot(owner, at) {
    const counts = totals(owner);
    return {ordinal: owner.ordinal, framework: owner.framework, observation_elapsed_ms: at - owner.started,
      totals: counts, window_counts: Object.fromEntries(Object.keys(counts).map(key => [key, counts[key] - owner.windowCounts[key]])),
      window_elapsed_ms: at - owner.windowAt, pending: pending(owner),
      pending_counts: {commands: owner.pendingCommands.size, writes: owner.pendingWrites.size},
      recent: {commands: owner.commands.slice(-4).map(copy), writes: owner.writes.slice(-4).map(copy)},
      errors: [...owner.errors], stopped: owner.stopped, command_cap_reached: owner.commandCap, write_cap_reached: owner.writeCap};
  }
  function live() {
    if (!current) return null;
    const at = time(current), result = snapshot(current, at);
    current.windowCounts = {...result.totals};current.windowAt = at;
    return result;
  }
  function endCase() {
    if (!current) {error('missing-case');return null;}
    const owner = current;
    const result = {...snapshot(owner, time(owner)), commands: owner.commands.map(copy), writes: owner.writes.map(copy), closed: true};
    owner.closed = true;previous = owner;current = null;
    return result;
  }
  function beginCase(name) {
    if (current) {error('overlapping-case');endCase();}
    const at = time(null), framework = typeof name === 'string' ? FRAMEWORKS.find(key => name.startsWith(key + ' ')) : null;
    current = {ordinal: ++ordinal, framework: framework || 'unknown', started: at, lastTime: at, commands: [], writes: [],
      pendingCommands: new Set(), pendingWrites: new Set(), commandsSettled: 0, writesSettled: 0,
      windowCounts: {commands_started: 0, commands_settled: 0, writes_started: 0, writes_settled: 0}, windowAt: at,
      errors: [], stopped: errors.length > 0, commandCap: false, writeCap: false, closed: false};
    if (!framework) error('unexpected-case');
    if (previous && (previous.pendingCommands.size || previous.pendingWrites.size)) error('cross-case-pending');
    previous = null;
    if (errors.length && !current.errors.length) append(current.errors, 'prior-case-invalid');
  }
  function start(kind, args) {
    const owner = current;
    if (!owner) return null;
    if (owner.stopped) return null;
    const entries = kind === 'command' ? owner.commands : owner.writes, cap = kind === 'command' ? maxCommands : maxWrites;
    if (entries.length >= cap) {
      if (kind === 'command') owner.commandCap = true;else owner.writeCap = true;
      error(kind + '-cap-reached');return null;
    }
    const entry = {id: entries.length + 1, start_ms: time(owner) - owner.started, outcome: 'pending'};
    entries.push(entry);
    if (kind === 'command') {
      owner.pendingCommands.add(entry.id);
      try {
        const method = ownData(args[0], 'method');
        entry.method = typeof method === 'string' && /^(get|post|put|patch|delete|head|options)$/i.test(method) ? method.toLowerCase() : 'unavailable';
        entry.route = routePattern(ownData(args[0], 'url'));
        const date = scenarioDate();
        entry.scenario_date = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(date) ? date : null;
        if (entry.method === 'unavailable' || entry.route === 'unavailable' || entry.scenario_date === null) error('command-metadata-unavailable');
      } catch {entry.method ||= 'unavailable';entry.route ||= 'unavailable';entry.scenario_date = null;error('command-metadata-failed');}
      if (owner.pendingCommands.size > 1) error('overlapping-command');
    } else {
      const commandId = owner.pendingCommands.size === 1 ? owner.pendingCommands.values().next().value : null;
      Object.defineProperty(entry, 'command_id', {value: commandId, enumerable: true});
      owner.pendingWrites.add(entry.id);
      if (typeof args[2] === 'string') entry.input_utf16_units = args[2].length;else error('write-input-unavailable');
      if (commandId === null) error('unassociated-write');
      if (owner.pendingWrites.size > 1) error('overlapping-write');
    }
    return {owner, entry, kind};
  }
  function settle(observation, outcome, result) {
    if (!observation) return;
    try {
      const {owner, entry, kind} = observation;
      // Late outcomes may drain native work, but never rewrite the frozen cutoff.
      if (owner.closed) {
        if (kind === 'command') owner.pendingCommands.delete(entry.id);else owner.pendingWrites.delete(entry.id);
        return;
      }
      if (owner !== current) {error('cross-case-settlement');return;}
      if (entry.outcome !== 'pending') {error('duplicate-settlement');return;}
      entry.end_ms = time(owner) - owner.started;entry.wall_ms = entry.end_ms - entry.start_ms;entry.outcome = outcome;
      if (kind === 'command') {
        owner.pendingCommands.delete(entry.id);owner.commandsSettled++;
        if ([...owner.pendingWrites].some(id => owner.writes[id - 1].command_id === entry.id)) error('command-ended-before-write');
      } else {
        owner.pendingWrites.delete(entry.id);owner.writesSettled++;
        if (outcome === 'returned' || outcome === 'fulfilled') {
          if (typeof result === 'string') entry.output_utf16_units = result.length;else error('write-output-unavailable');
        }
      }
    } catch {error('observer-settlement-failed');}
  }
  function observePromise(observation, promise) {
    try {
      Reflect.apply(nativeThen, promise, [value => {settle(observation, 'fulfilled', value);}, () => {settle(observation, 'rejected');}]);
    } catch {error('promise-observer-failed');}
  }
  function wrap(actual, kind) {
    if (typeof actual !== 'function') throw new TypeError('An observed function is required');
    if (wrappers[kind].has(actual)) return actual;
    function observed(...args) {
      let observation;
      try {observation = start(kind, args);} catch {error('observer-entry-failed');}
      let result;
      try {result = Reflect.apply(actual, this, args);}
      catch (failure) {settle(observation, 'threw');throw failure;}
      if (observation) {
        if (isPromise(result)) observePromise(observation, result);else settle(observation, 'returned', result);
      }
      return result;
    }
    wrappers[kind].add(observed);return observed;
  }
  return {beginCase, wrapCommand: actual => wrap(actual, 'command'), wrapWriter: actual => wrap(actual, 'write'),
    live, endCase, error, getErrors: () => [...errors]};
}
module.exports = {createObserver, routePattern};
