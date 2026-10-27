import { clientAccess } from './assignmentEligibility';
import {cisProgramProjection} from './cisCapability';
import {frameworkCatalog} from '../lib/frameworks';

const internal = user => ['super_admin', 'platform_admin'].includes(user?.role);
export const leadEligible = (user, cid) => internal(user) && user.status === 'active' && clientAccess(user, cid);
// Finalized native enrollment only; no contact/user lookups or mutation are needed.
export const sharedProgramProjection = (db,client) => ['cis-ig1','iso-27001','soc-2'].filter(key=>db.requirements?.some(row=>
  row.client_id===client.client_id&&row.baseline_key===key&&row.baseline_response==='applies'))
  .map(key=>key==='cis-ig1'?cisProgramProjection(db,client):{
    client_id:client.client_id,program_id:`${client.client_id}:${key}`,framework_key:key,
    version:frameworkCatalog(key).version,selected:true,
  });
export function clientProjection(db, client) {
  const contact = client.primary_contact_id ? db.contacts.find(c => c.contact_id === client.primary_contact_id && c.client_id === client.client_id) : null;
  const lead = db.users.find(u => u.user_id === client.assigned_owner_id);
  const pick = (row, fields) => row ? Object.fromEntries(fields.map(key => [key, row[key]])) : null;
  return { ...client,
    cis_program:cisProgramProjection(db,client),
    // Match the authorized server DTO: drafts do not select a shared experience.
    shared_programs:sharedProgramProjection(db,client),
    ...(db.baselines?.[client.client_id] ? {onboarding_baseline:JSON.parse(JSON.stringify(db.baselines[client.client_id]))} : {}),
    primary_contact_record: pick(contact, ['contact_id', 'client_id', 'name', 'email', 'title', 'status']),
    grc_lead_id: client.assigned_owner_id,
    grc_lead: pick(lead, ['user_id', 'name', 'email', 'role', 'status']),
  };
}
export function leadCandidates(db, cid) {
  if (!internal(db.user) || cid && !clientAccess(db.user, cid)) throw new Error('Forbidden for this client');
  if (!cid && !clientAccess(db.user, cid)) return [];
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
