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

export function syncPendingCommandIdentity(userId, mode) {
  const identity = JSON.stringify([mode, userId]);
  const previous = sessionStorage.getItem(IDENTITY_KEY);
  if (previous === identity) return;
  if (previous && previous !== identity) clearPendingCommands();
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
  create.retry=()=>!current()?Promise.reject(ended()):snapshot?create(...JSON.parse(snapshot)):Promise.reject(new Error('No unconfirmed command'));
  return create;
}
