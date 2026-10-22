import {orderNamedDemoClients} from './demoClientOrder';

const context = {trustedDemo: true, workspaceMode: 'demo', user: {user_id: 'actor', workspace_mode: 'demo'}};
const client = client_id => ({client_id, environment: 'Demo'});
test('named authorized Demo population is stable, cumulative and never synthesized', () => {
  const ids = ['other-b','demo_prestige','demo_dunder','demo_krusty_krab','demo_initech','other-a','demo_brawndo'];
  const rows = ids.map(client), original = [...rows];
  expect(orderNamedDemoClients(rows,context).map(row=>row.client_id)).toEqual([
    'demo_brawndo','demo_initech','demo_krusty_krab','demo_dunder','demo_prestige','other-b','other-a']);
  expect(rows).toEqual(original);
  expect(orderNamedDemoClients(rows.filter(row=>row.client_id==='demo_initech'),context)).toEqual([client('demo_initech')]);
});
test('normal mode, inconsistent actor, missing trust and genuine customers retain native order', () => {
  const rows = ['demo_prestige','demo_brawndo'].map(client);
  for (const patch of [{trustedDemo:false},{workspaceMode:'standard'},{user:null},{user:{user_id:'actor',workspace_mode:'standard'}}]) {
    expect(orderNamedDemoClients(rows,{...context,...patch})).toBe(rows);
  }
  const real = rows.map(row=>({...row,environment:'Customer'}));
  expect(orderNamedDemoClients(real,context)).toEqual(real);
});
