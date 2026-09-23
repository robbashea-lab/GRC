import axios from 'axios';
import {previewAdapter} from './adapter';
import {seedStore,saveStore} from './store';
import {portfolio} from './summaries';
import {aggregateClientDashboard,DASHBOARD_KINDS} from '../lib/clientDashboard';
import {managementMetrics} from '../lib/managementMetrics';
const api=axios.create({adapter:previewAdapter});
beforeEach(()=>{sessionStorage.clear();localStorage.clear();});

test('all seven Demo portfolios reconcile to source records and remain read-only',()=>{
  const db=seedStore(),before=JSON.stringify(db),today=new Date(),result=portfolio(db,false,today);
  for(const row of result.clients){
    const records=Object.fromEntries(DASHBOARD_KINDS.map(kind=>[kind,db[kind].filter(r=>r.client_id===row.client_id)]));
    const m=managementMetrics(aggregateClientDashboard(records,{clientId:row.client_id,today}),{today});
    for(const key of ['past_due','due_30d','unassigned']){
      expect(row[key]).toBe(m.metrics[key].length);
      expect(row.metric_items[key].map(r=>r.key).sort()).toEqual(m.metrics[key].map(r=>r.key).sort());
    }
    expect(row.significant_risks).toBe(m.significantRisks.length);
    expect(row.critical_high_issues).toBe(m.metrics.critical_high_open.filter(r=>r.kind!=='risks').length);
    expect(row.frameworks.map(f=>f.key).sort()).toEqual(db.requirements.filter(r=>r.client_id===row.client_id&&r.baseline_response==='applies').map(r=>r.baseline_key).filter(k=>row.frameworks.some(f=>f.key===k)).sort());
  }
  expect(JSON.stringify(db)).toBe(before);
});
test('scoped Demo client lists and drill-ins exclude unrelated clients even if their GRC Lead matches',async()=>{
  const db=seedStore(),[a,b]=db.clients;
  db.user={...db.user,role:'platform_admin',client_ids:[a.client_id]};
  b.assigned_owner_id=db.user.user_id;saveStore(db);
  await api.post('/demo/enter');
  const p=(await api.get('/clients/directory',{params:{include_archived:true}})).data;
  expect(p.clients.map(c=>c.client_id)).toEqual([a.client_id]);
  expect((await api.get('/clients')).data.map(c=>c.client_id)).toEqual([a.client_id]);
  for(const path of ['/dashboard','/risks','/frameworks/cmmc'])await expect(api.get(path,{params:{client_id:b.client_id}})).rejects.toMatchObject({response:{status:403}});
  const risk=db.risks.find(r=>r.client_id===b.client_id);
  await expect(api.get('/risks/'+risk.risk_id)).rejects.toMatchObject({response:{status:403}});
});
test('archived clients are opt-in; empty scoped assignment does not fall back to all',()=>{
  const db=seedStore();db.clients[0].status='archived';
  expect(portfolio(db,false).clients).toHaveLength(6);
  expect(portfolio(db,true).clients).toHaveLength(7);
  db.user={...db.user,role:'platform_admin',client_ids:['nonexistent-assignment']};
  expect(portfolio(db,true).clients).toEqual([]);
  db.user.role='client_readonly';expect(()=>portfolio(db,false)).toThrow('restricted');
});
