import {namedDemoClient} from '../lib/demoClients';
import {CIS_DEMO_REVISION} from './cisDemoSelection';

// Withdraw only explicitly retired fixture records from active Demo portals.
// The stored records, direct native reads, approvals and historical events remain intact.
export function visibleCisDemoRows(db, kind, rows) {
  if (db.user?.workspace_mode!=='demo' || !['policies','reviews'].includes(kind)) return rows;
  return rows.filter(row=>{
    const client=db.clients?.find(client=>client.client_id===row.client_id);
    const retired=row.demo_seed_retired;
    return !(namedDemoClient(row.client_id)?.group && client?.environment==='Demo'
      && db.cis_demo_rollout?.clients?.[row.client_id]?.revision===CIS_DEMO_REVISION
      && db.cis_demo_rollout.clients[row.client_id].ownership==='fresh_fixture'
      && retired?.revision===CIS_DEMO_REVISION
      && row.status===(kind==='policies'?'retired':'cancelled'));
  });
}

export function cisDemoOperationalView(db) {
  return {...db,policies:visibleCisDemoRows(db,'policies',db.policies||[]),
    reviews:visibleCisDemoRows(db,'reviews',db.reviews||[])};
}
