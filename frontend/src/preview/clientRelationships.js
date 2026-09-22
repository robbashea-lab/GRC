import { clientAccess } from './assignmentEligibility';

const internal = user => ['super_admin', 'platform_admin'].includes(user?.role);
export const leadEligible = (user, cid) => internal(user) && user.status === 'active' && clientAccess(user, cid);
export function clientProjection(db, client) {
  const contact = client.primary_contact_id ? db.contacts.find(c => c.contact_id === client.primary_contact_id && c.client_id === client.client_id) : null;
  const lead = db.users.find(u => u.user_id === client.assigned_owner_id);
  const pick = (row, fields) => row ? Object.fromEntries(fields.map(key => [key, row[key]])) : null;
  return { ...client,
    primary_contact_record: pick(contact, ['contact_id', 'client_id', 'name', 'email', 'title', 'status']),
    grc_lead_id: client.assigned_owner_id,
    grc_lead: pick(lead, ['user_id', 'name', 'email', 'role', 'status']),
  };
}
export function leadCandidates(db, cid) {
  if (!internal(db.user) || cid && !clientAccess(db.user, cid)) throw new Error('Forbidden for this client');
  const rows = db.users.filter(u => leadEligible(u, cid));
  if (rows.length > 200) throw new Error('Too many eligible leads; contact your administrator');
  return rows.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(({user_id,name,email}) => ({user_id,name,email}));
}
export function validateClientRelationships(db, row, previous) {
  if (!internal(db.user) || previous && !clientAccess(db.user, row.client_id)) throw new Error('Forbidden for this client');
  if (row.assigned_owner_id && row.assigned_owner_id !== previous?.assigned_owner_id && !leadEligible(db.users.find(u => u.user_id === row.assigned_owner_id), row.client_id))
    throw new Error('Choose an active internal GRC user with access to this client');
  if (row.primary_contact_id && row.primary_contact_id !== previous?.primary_contact_id) {
    const contact = db.contacts.find(c => c.contact_id === row.primary_contact_id && c.client_id === row.client_id);
    if (!contact || contact.status !== 'active' || contact.not_applicable) throw new Error("Choose an active Contact from this client's directory");
  }
}
