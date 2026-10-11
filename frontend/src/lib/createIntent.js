import {recordUuid} from './recordUuid';
import {useRef} from 'react';

const STORAGE_PREFIX = 'grc_pending_command_v1:';
const IDENTITY_KEY = 'grc_pending_command_identity_v1';
let generation = 0;
const ended = () => new Error('This command belongs to an ended workspace. Reopen the current form before saving.');

export function assertPendingCommandGeneration(commandGeneration) {
  if (commandGeneration !== undefined && commandGeneration !== generation) throw ended();
}

export function clearPendingCommands() {
  // Invalidate callbacks first, even when storage removal fails and handoff must stop.
  generation++;
  for (let index = sessionStorage.length - 1; index >= 0; index--) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key);
  }
  sessionStorage.removeItem(IDENTITY_KEY);
}

const recordKinds = ['framework_assessments','ai_systems','reviews','findings','risks','policies','vendors','assets','tasks','exceptions','contacts','requirements'];
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const bound = value => !!value && !['undefined','null'].includes(value);

function legacyCommandOwner(scope, raw) {
  let retained, request;
  try { retained = JSON.parse(raw); request = JSON.parse(retained?.snapshot); }
  catch { return null; }
  if (typeof retained?.key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(retained.key) || !Array.isArray(request) || request.length !== 2) return null;
  const [path, body] = request;
  if (typeof path !== 'string' || !object(body)) return null;
  const bulk = /^bulk:([^:]+):([^:]+):([^:]+)$/.exec(scope);
  if (bulk) return bound(bulk[1]) && bound(bulk[2]) && path === '/bulk' && recordKinds.includes(bulk[3]) && body.kind === bulk[3] &&
    Array.isArray(body.ids) && body.ids.length && body.ids.every(id => typeof id === 'string' && id) &&
    typeof body.action === 'string' && object(body.expected_versions) ? bulk[1] : null;
  const route = /^\/([^/]+)\/([^/?#]+)(?:\/([^/?#]+))?$/.exec(path);
  if (!route || !Object.prototype.hasOwnProperty.call(body, 'expected_updated_at') ||
    body.expected_updated_at !== null && typeof body.expected_updated_at !== 'string') return null;
  let id;
  try { id = decodeURIComponent(route[2]); } catch { return null; }
  const [, kind, , action] = route;
  const calendar = /^calendar:([^:]+):([^:]+)$/.exec(scope);
  if (calendar) return bound(calendar[1]) && bound(calendar[2]) && !action && ['reviews','findings','tasks'].includes(kind) && typeof body.due_date === 'string' ? calendar[1] : null;
  const record = /^([^:]+):([^:]+):(.+)$/.exec(scope);
  if (!record || !bound(record[1]) || !bound(record[2])) return null;
  const [, actor, , target] = record;
  if (!action && recordKinds.includes(kind) && target === `${kind}:${id}:update`) return actor;
  if (!action && (kind === 'reviews' && target === `${id}:update` || kind === 'tasks' && target === id)) return actor;
  // A ticket opened from a Task has a Task scope but acts on its parent Finding.
  if (kind === 'findings' && ((['validate','accept'].includes(action) && /^decision:.+$/.test(target) && typeof body.rationale === 'string') ||
    action === 'reopen' && /^reopen:.+$/.test(target))) return actor;
  return null;
}

function adoptLegacyCommands(userId, mode) {
  // Retained or blocked commands also retire callbacks created before attribution.
  generation++;
  const keys = [];
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  if (!keys.length) return;
  // Legacy scopes omit mode; only normal generated identities have proven provenance.
  const knownMode = mode === 'standard' ? /^user_[0-9a-f]{12}$/.test(userId) : mode === 'demo' && userId === 'demo_admin';
  let unresolved = false;
  for (const key of keys) {
    const owner = legacyCommandOwner(key.slice(STORAGE_PREFIX.length), sessionStorage.getItem(key));
    if (!owner || owner === userId && !knownMode) unresolved = true;
    else if (owner !== userId) sessionStorage.removeItem(key);
  }
  if (unresolved) throw Object.assign(new Error('Legacy command recovery ownership requires reconciliation. Workspace access is paused; retained commands have not been removed or retried.'),
    {code:'PENDING_COMMAND_OWNERSHIP_UNVERIFIED'});
}

export function syncPendingCommandIdentity(userId, mode) {
  const identity = JSON.stringify([mode, userId]);
  let previous;
  try { previous = sessionStorage.getItem(IDENTITY_KEY); }
  catch (error) { generation++; throw error; }
  if (previous === identity) return;
  if (previous && previous !== identity) clearPendingCommands();
  else if (!previous) adoptLegacyCommands(userId, mode);
  sessionStorage.setItem(IDENTITY_KEY, identity);
}

export function useCreateIntent(post, scope, persist=false) {
  const intent = useRef(null);
  if (!intent.current || intent.current.scope !== scope || intent.current.generation !== generation) intent.current = {scope, generation, create:createIntent(post,persist?scope:null)};
  return intent.current.create;
}

// One form's create intent, retained through uncertain failures. Do not share
// across users/tenants or deduplicate independent forms by their business data.
export function createIntent(post, storageScope=null) {
  const createdGeneration = generation;
  const current = () => createdGeneration === generation;
  const storageKey=storageScope?STORAGE_PREFIX+storageScope:null;
  const retained=storageKey?JSON.parse(sessionStorage.getItem(storageKey)||'null'):null;
  let key = retained?.key||null, snapshot = retained?.snapshot||null, pending = null;
  const clear=()=>{if(!current())return;if(storageKey)sessionStorage.removeItem(storageKey);key=null;snapshot=null;};
  const create=(path, body) => {
    if (!current()) return Promise.reject(ended());
    const serialized = JSON.stringify([path, body]);
    if (snapshot && snapshot !== serialized) return Promise.reject(new Error('A previous create has not been confirmed. Restore its original values and retry before starting another create.'));
    if (pending) return pending;
    key ||= recordUuid();
    snapshot = serialized;
    // Persist before dispatch: reloading a partially saved ticket must not lose its recovery intent.
    if(storageKey)sessionStorage.setItem(storageKey,JSON.stringify({key,snapshot}));
    pending = Promise.resolve().then(() => {
      if (!current()) throw ended();
      return post(path, body, {headers: {'Idempotency-Key': key}, pendingCommandGeneration: createdGeneration});
    })
      .then(result => {if(!current())throw ended();clear();return result;})
      .catch(error => {
        // Only the server can confirm that no primary write was attempted.
        if (error?.response?.headers?.['x-create-rejected'] === 'true') clear();
        throw error;
      }).finally(() => {pending = null;});
    return pending;
  };
  create.unconfirmed=()=>current()&&!!snapshot;
  create.pendingRequest=()=>current()&&snapshot?JSON.parse(snapshot):null;
  create.retry=()=>!current()?Promise.reject(ended()):snapshot?create(...JSON.parse(snapshot)):Promise.reject(new Error('No unconfirmed command'));
  return create;
}
