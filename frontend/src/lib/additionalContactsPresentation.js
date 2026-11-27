import {directoryAccess,directoryRows} from './contactDirectory';

// A disabled or unverified account does not imply current platform access.
export function additionalDirectoryRows(rows,options) {
  const filtered=directoryRows(rows,{...options,access:options.access==='platform'?'':options.access});
  return options.access==='platform'?filtered.filter(row=>['active','pending'].includes(directoryAccess(row,options.clientId,options.context).key)):filtered;
}
export function additionalContactRelationships(contact,clientId,client) {
  if(contact.client_id!==clientId||client?.client_id!==clientId)return [];
  return [client.primary_contact_id===contact.contact_id&&'Primary contact',contact.linked_user_id&&client.assigned_owner_id===contact.linked_user_id&&'GRC lead'].filter(Boolean);
}
