// Diagnostic-only observers. They never own application outcomes or persistence.
const {AsyncLocalStorage} = require('node:async_hooks');
const {performance} = require('node:perf_hooks');
const {isPromise} = require('node:util').types;
const path = require('node:path');

const nativeThen = Promise.prototype.then;
const roots = new Set(['auth', 'demo', 'clients', 'users', 'reviews', 'tasks', 'risks', 'vendors', 'policies', 'assets',
  'findings', 'framework_assessments', 'organizational-controls', 'evidence', 'evidence-library', 'onboarding',
  'frameworks', 'portfolio', 'calendar', 'dashboard']);
const operations = new Set(['me', 'enter', 'logout', 'baseline', 'finalize', 'activate', 'profile', 'assignees',
  'client-memberships', 'links', 'start', 'complete', 'create-finding', 'iso-audit', 'approval-subject', 'submit-review',
  'approve', 'accept', 'close', 'review-history', 'migrate', 'observations', 'items', 'catalog', 'configuration', 'reporting']);
const frameworks = new Set(['cis-ig1', 'soc-2', 'iso-27001']);

function ownData(object, key) {
  if (!object || (typeof object !== 'object' && typeof object !== 'function')) return undefined;
  const field = Object.getOwnPropertyDescriptor(object, key);
  return field && Object.hasOwn(field, 'value') ? field.value : undefined;
}

function routePattern(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return 'unavailable';
  const parts = value.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  if (!roots.has(parts[0])) return '/:unrecognized-route';
  return '/' + parts.map((part, index) => {
    if (index === 0) return part;
    if (parts[0] === 'frameworks' && index === 1) return frameworks.has(part) ? part : ':id';
    if (parts[0] === 'reviews' && index === 3 && parts[2] === 'iso-audit')
      return /^(?:A-)?\d+(?:-\d+)*$/.test(part) ? part : ':item';
    if (index === 1 && operations.has(part) || index > 1 && operations.has(part)) return part;
    return ':id';
  }).join('/');
}

function sourceCallsite(stack) {
  if (typeof stack !== 'string') return [];
  return [...stack.matchAll(/frameworkFiveYear\.test\.js:(\d+):(\d+)/g)]
    .slice(0, 3).map(match => 'frameworkFiveYear.test.js:' + match[1] + ':' + match[2]);
}

function unionDuration(intervals) {
  let end = -Infinity, total = 0;
  for (const [start, finish] of intervals.filter(([start, finish]) => finish > start).sort((a, b) => a[0] - b[0])) {
    if (finish > end) { total += finish - Math.max(start, end); end = finish; }
  }
  return total;
}

function createArtifactWriter(output, onError, fs = require('node:fs')) {
  return (name, data) => {
    try {
      fs.mkdirSync(output, {recursive: true});
      const destination = path.join(output, name), temporary = destination + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2)); fs.renameSync(temporary, destination);
      return true;
    } catch { onError('diagnostic-write-failed'); return false; }
  };
}

function createPhaseLogger({now = () => performance.now(), maxSpans = 50000} = {}) {
  const context = new AsyncLocalStorage(), wrapped = new WeakSet(), errors = [], bindings = new Set();
  let current = null, ordinal = 0;
  const diagnosticError = code => { if (errors.length < 16 && !errors.includes(code)) errors.push(code); };
  const safely = (code, action) => { try { return action(); } catch { diagnosticError(code); return undefined; } };
  const scenarioDate = () => safely('scenario-date-unavailable', () => new Date().toISOString()) ?? null;

  function beginCase(name) {
    const framework = typeof name === 'string' ? [...frameworks].find(key => name.startsWith(key + ' ')) : null;
    if (!framework) diagnosticError('unexpected-test-case');
    current = {ordinal: ++ordinal, framework: framework || 'unknown', started: now(), spans: [], byId: new Map(),
      requests: 0, span_cap_reached: false, closed: false};
  }

  function observe(name, actual, {async = false, command = false} = {}) {
    if (wrapped.has(actual)) return actual;
    function invoke(...args) {
      const owner = context.getStore(), record = owner?.record || current;
      if (!record || record.closed) return Reflect.apply(actual, this, args);
      if (record.spans.length >= maxSpans) {
        record.span_cap_reached = true; diagnosticError('span-cap-reached');
        return Reflect.apply(actual, this, args);
      }
      const span = safely('span-start-failed', () => {
        const value = {id: record.spans.length + 1, parent: owner?.span?.id ?? null, phase: name,
          start_ms: now() - record.started, children: []};
        if (command) {
          const method = ownData(args[0], 'method');
          value.request_number = ++record.requests;
          value.method = typeof method === 'string' && /^(get|post|put|patch|delete|head|options)$/i.test(method) ? method.toLowerCase() : 'unavailable';
          value.route = routePattern(ownData(args[0], 'url'));
          value.scenario_date = scenarioDate();
          value.source_callsite = sourceCallsite(new Error('Phase observer').stack);
        }
        record.spans.push(value); record.byId.set(value.id, value);
        if (owner?.span) owner.span.children.push(value.id);
        return value;
      });
      if (!span) return Reflect.apply(actual, this, args);
      const finish = failed => safely('span-settlement-failed', () => {
        if (record.closed) return; // Keep the original observation cutoff authoritative.
        span.end_ms = now() - record.started; span.wall_ms = span.end_ms - span.start_ms; span.failed = failed;
      });
      let result;
      try { result = context.run({record, span}, () => Reflect.apply(actual, this, args)); }
      catch (error) { finish(true); throw error; }
      if (async && isPromise(result)) {
        // No then getter, Promise.resolve or changed return value. Adds an observer microtask.
        safely('promise-observer-failed', () => Reflect.apply(nativeThen, result, [() => finish(false), () => finish(true)]));
      } else finish(false);
      return result;
    }
    wrapped.add(invoke); bindings.add(name); return invoke;
  }

  function live() {
    if (!current) return null;
    const cutoff = now() - current.started;
    return {ordinal: current.ordinal, framework: current.framework, observation_elapsed_ms: cutoff,
      observation_window: 'Diagnostic beforeEach through observation; includes fixture hooks, not the exact Jest body deadline',
      scenario_date: scenarioDate(), span_count: current.spans.length, requests: current.requests,
      span_cap_reached: current.span_cap_reached,
      pending: current.spans.filter(span => span.end_ms === undefined).map(span => ({id: span.id, phase: span.phase,
        request_number: span.request_number, method: span.method, route: span.route, age_ms: cutoff - span.start_ms})),
      recent_commands: current.spans.filter(span => span.request_number).slice(-8).map(span => ({...span, children: [...span.children]}))};
  }

  function endCase() {
    if (!current) { diagnosticError('missing-case'); return null; }
    const record = current, cutoff = now() - record.started, groups = Object.create(null);
    record.closed = true;
    for (const span of record.spans) {
      const finish = Math.min(span.end_ms ?? cutoff, cutoff), wall = Math.max(0, finish - span.start_ms);
      const children = unionDuration(span.children.map(id => record.byId.get(id)).filter(Boolean).map(child => [
        Math.max(span.start_ms, child.start_ms), Math.min(child.end_ms ?? cutoff, finish)]));
      const group = groups[span.phase] ||= {calls: 0, settled: 0, inclusive_wall_ms: 0, exclusive_observed_wall_ms: 0, max_wall_ms: 0};
      group.calls++; if (span.end_ms !== undefined) group.settled++;
      group.inclusive_wall_ms += wall; group.exclusive_observed_wall_ms += Math.max(0, wall - children);
      group.max_wall_ms = Math.max(group.max_wall_ms, wall);
    }
    const snapshot = {...live(), observation_elapsed_ms: cutoff, cutoff: 'afterEach observation; not a cancellation or an exact deadline snapshot',
      groups, spans: record.spans.map(span => ({...span, children: [...span.children]}))};
    current = null;
    return snapshot;
  }

  return {beginCase, observe, live, endCase, diagnosticError, getErrors: () => [...errors], getBindings: () => [...bindings]};
}

module.exports = {createPhaseLogger, createArtifactWriter, routePattern, sourceCallsite, unionDuration};
