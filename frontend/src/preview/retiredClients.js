// Explicit synthetic identities only. Never runs against backend tenant data.
import {INITECH_VERSION} from './programs/initech';
const RETIRED = new Set();
export function removeRetiredDemoClients(db) {
  // Replace the former retired scenario, never a current greenfield program or its edits.
  const staleInitech=(db.clients||[]).some(c=>c.client_id==='demo_initech'&&c.demo_program_version!==INITECH_VERSION)||db.user?.user_id?.startsWith('demo_initech_');
  const retiredIds=new Set([...RETIRED,...(staleInitech?['demo_initech']:[])]);
  const staleDunder=(db.clients||[]).some(c=>c.client_id==='demo_dunder'&&c.demo_program_version!=='iso27001-year2-v1');
  const retiredClient=id=>retiredIds.has(id)||(staleDunder&&id==='demo_dunder');
  const retiredUser = id => [...retiredIds,...(staleDunder?['demo_dunder']:[])].some(cid => id?.startsWith(cid + '_'));
  let changed = false;
  for (const [key, value] of Object.entries(db)) {
    if (Array.isArray(value)) {
      const kept = value.filter(row => !retiredClient(row.client_id) && !(key === 'users' && retiredUser(row.user_id)) && !(['logs','notifications'].includes(key) && retiredUser(row.entity_id)));
      if (kept.length !== value.length) { db[key] = kept; changed = true; }
    }
  }
  for (const user of [...(db.users || []), db.user].filter(Boolean)) {
    for (const field of ['client_ids', 'favorite_client_ids']) if (Array.isArray(user[field])) {
      const kept = user[field].filter(id => !retiredClient(id));
      if (kept.length !== user[field].length) { user[field] = kept; changed = true; }
    }
  }
  for (const field of ['baselines', 'drafts', 'riskSequences', 'ai_intake', 'ai_counters']) for (const id of [...retiredIds,...(staleDunder?['demo_dunder']:[])]) {
    if (db[field] && Object.hasOwn(db[field], id)) { delete db[field][id]; changed = true; }
  }
  // A removed client persona cannot remain the active simulated identity.
  if (retiredUser(db.user?.user_id)) {
    const explorer=db.users.find(user => user.user_id === 'demo_admin');
    db.user = explorer ? {...explorer} : null;
    changed = true;
  }
  return changed;
}
