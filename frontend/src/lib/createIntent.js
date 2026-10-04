import {recordUuid} from './recordUuid';
import {useRef} from 'react';

export function useCreateIntent(post, scope, persist=false) {
  const intent = useRef(null);
  if (!intent.current || intent.current.scope !== scope) intent.current = {scope, create:createIntent(post,persist?scope:null)};
  return intent.current.create;
}

// One form's create intent, retained through uncertain failures. Do not share
// across users/tenants or deduplicate independent forms by their business data.
export function createIntent(post, storageScope=null) {
  const storageKey=storageScope?'grc_pending_command_v1:'+storageScope:null;
  const retained=storageKey?JSON.parse(sessionStorage.getItem(storageKey)||'null'):null;
  let key = retained?.key||null, snapshot = retained?.snapshot||null, pending = null;
  const clear=()=>{if(storageKey)sessionStorage.removeItem(storageKey);key=null;snapshot=null;};
  const create=(path, body) => {
    const serialized = JSON.stringify([path, body]);
    if (snapshot && snapshot !== serialized) return Promise.reject(new Error('A previous create has not been confirmed. Restore its original values and retry before starting another create.'));
    if (pending) return pending;
    key ||= recordUuid();
    snapshot = serialized;
    // Persist before dispatch: reloading a partially saved ticket must not lose its recovery intent.
    if(storageKey)sessionStorage.setItem(storageKey,JSON.stringify({key,snapshot}));
    pending = Promise.resolve().then(() => post(path, body, {headers: {'Idempotency-Key': key}}))
      .then(result => {clear();return result;})
      .catch(error => {
        // Only the server can confirm that no primary write was attempted.
        if (error?.response?.headers?.['x-create-rejected'] === 'true') clear();
        throw error;
      }).finally(() => {pending = null;});
    return pending;
  };
  create.unconfirmed=()=>!!snapshot;
  create.retry=()=>snapshot?create(...JSON.parse(snapshot)):Promise.reject(new Error('No unconfirmed command'));
  return create;
}
