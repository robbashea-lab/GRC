import {recordUuid} from './recordUuid';
import {useRef} from 'react';

export function useCreateIntent(post, scope) {
  const intent = useRef(null);
  if (!intent.current || intent.current.scope !== scope) intent.current = {scope, create:createIntent(post)};
  return intent.current.create;
}

// One form's create intent, retained through uncertain failures. Do not share
// across users/tenants or deduplicate independent forms by their business data.
export function createIntent(post) {
  let key = null, snapshot = null, pending = null;
  return (path, body) => {
    const serialized = JSON.stringify([path, body]);
    if (snapshot && snapshot !== serialized) return Promise.reject(new Error('A previous create has not been confirmed. Restore its original values and retry before starting another create.'));
    if (pending) return pending;
    key ||= recordUuid();
    snapshot = serialized;
    pending = Promise.resolve().then(() => post(path, body, {headers: {'Idempotency-Key': key}}))
      .then(result => {key = null; snapshot = null; return result;})
      .catch(error => {
        // Only the server can confirm that no primary write was attempted.
        if (error?.response?.headers?.['x-create-rejected'] === 'true') {key = null; snapshot = null;}
        throw error;
      }).finally(() => {pending = null;});
    return pending;
  };
}
