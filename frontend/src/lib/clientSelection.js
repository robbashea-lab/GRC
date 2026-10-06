import {PREVIEW_MODE} from './api';

// Demo selection is tab-local; it must never overwrite an authenticated tab.
const storage = () => PREVIEW_MODE ? sessionStorage : localStorage;
export function selectedClient(){try{return storage().getItem('grc_client_id')||'';}catch{return '';}}
export function rememberClient(id){try{storage().setItem('grc_client_id',id);}catch{/* Selection is a preference, never proof of authorization. */}}
export function clearClientSelection(){try{storage().removeItem('grc_client_id');}catch{/* A reset can still reload the canonical client list. */}}
