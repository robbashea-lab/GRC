import {PREVIEW_MODE} from './api';

// Demo selection is tab-local; it must never overwrite an authenticated tab.
const storage = () => PREVIEW_MODE ? sessionStorage : localStorage;
export function selectedClient(){try{return storage().getItem('grc_client_id')||'';}catch{return '';}}
export function rememberClient(id){try{storage().setItem('grc_client_id',id);}catch{/* Selection is a preference, never proof of authorization. */}}
export function clearClientSelection(){try{storage().removeItem('grc_client_id');}catch{/* A reset can still reload the canonical client list. */}}

export function clientDestination(clientId, path = '/dashboard') {
  const hashIndex = path.indexOf('#');
  const hash = hashIndex === -1 ? '' : path.slice(hashIndex);
  const destination = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const queryIndex = destination.indexOf('?');
  const route = queryIndex === -1 ? destination : destination.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex === -1 ? '' : destination.slice(queryIndex + 1));
  params.set('client_id', clientId);
  return `${route}?${params.toString()}${hash}`;
}
