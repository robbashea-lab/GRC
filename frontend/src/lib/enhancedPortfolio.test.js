import { enhancedPortfolioEligible, operationalItems, clientAttention, portfolioKpiValue, filterPortfolio } from './enhancedPortfolio';
const asOf = '2026-10-20T12:00:00Z';
const gate = () => ({
  preview: true,
  user: {
    user_id: 'lead1',
    role: 'platform_admin',
    workspace_mode: 'demo'
  },
  workspaceMode: 'demo',
  pathname: '/clients',
  currentClientId: 'demo_brawndo',
  selectedClientId: 'demo_brawndo',
  currentClient: {
    client_id: 'demo_brawndo',
    status: 'active'
  }
});
const item = (id, date, changes = {}) => ({
  entity_id: id,
  entity_type: 'task',
  key: `task:${id}`,
  client_id: 'a',
  due_date: date,
  ...changes
});
const state = changes => ({
  search: '',
  mine: false,
  framework: '',
  kpi: '',
  sort: 'name',
  ...changes
});
test('Portfolio uses the authorized internal identity and route, independent of operational selection or mode', () => {
  for (const mode of ['demo', 'standard']) {
    for (const role of ['super_admin', 'platform_admin']) {
      for (const selection of [null, 'new_client', 'other']) {
        expect(enhancedPortfolioEligible({...gate(), preview:false, workspaceMode:mode,
          user:{user_id:'lead1',role,workspace_mode:mode},currentClientId:selection,
          selectedClientId:selection,currentClient:null,routeClientId:'unrelated',orgLoading:true})).toBe(true);
      }
    }
  }
  for (const changes of [{pathname:'/dashboard'},{pathname:'/clients/'},{authLoading:true},{authError:'denied'},
    {user:null},{user:{role:'super_admin'}},{user:{user_id:'reader',role:'client_readonly'}},
    {user:{user_id:'manager',role:'client_grc_manager'}}]) {
    expect(enhancedPortfolioEligible({...gate(),...changes})).toBe(false);
  }
});

test('counts every native eligible item and rejects foreign, duplicate, invalid and wrong-window entries', () => {
  const overdue = Array.from({
    length: 31
  }, (_, index) => item(String(index), '2026-10-19'));
  const client = {
    client_id: 'a',
    metric_items: {
      past_due: [...overdue, overdue[0], item('foreign', '2026-10-19', {
        client_id: 'b'
      }), item('risk', '2026-10-19', {
        entity_type: 'risk'
      }), item('today', '2026-10-20'), item('bad', '2026-02-30')],
      due_30d: [item('now', '2026-10-20'), item('end', '2026-11-19'), item('late', '2026-11-20'), item('old', '2026-10-19'), item('foreign', '2026-10-21', {
        client_id: 'b'
      })]
    }
  };
  const work = operationalItems(client, asOf);
  expect(work.overdue).toHaveLength(31);
  expect(work.due30.map(row => row.entity_id)).toEqual(['now', 'end']);
  expect(portfolioKpiValue('overdue', [client], asOf)).toBe(31);
  expect(portfolioKpiValue('due30', [client], asOf)).toBe(2);
});
test('combines identity assignment, search, framework and KPI against one client population', () => {
  const a = {
    client_id: 'a',
    name: 'Alpha',
    grc_lead_id: 'lead1',
    assigned_owner_id: 'lead1',
    grc_lead: {
      name: 'Same Name'
    },
    metric_items: {
      past_due: [item('a', '2026-10-19')]
    }
  };
  const b = {
    client_id: 'b',
    name: 'Beta',
    grc_lead_id: 'lead2',
    assigned_owner_id: 'lead2',
    grc_lead: {
      name: 'Same Name'
    }
  };
  const c = {
    client_id: 'c',
    name: 'Gamma',
    assigned_owner_id: 'lead1'
  };
  const programs = [{
    client_id: 'a',
    program_key: 'cis-ig1',
    program_label: 'CIS Controls'
  }, {
    client_id: 'b',
    program_key: 'cis-ig1',
    program_label: 'CIS Controls'
  }];
  const rows = filterPortfolio([a, b, c], programs, state({
    mine: true,
    search: 'CIS',
    framework: 'cis-ig1',
    kpi: 'overdue'
  }), 'lead1', asOf);
  expect(rows.map(row => row.client_id)).toEqual(['a']);
  expect(portfolioKpiValue('overdue', rows, asOf)).toBe(1);
  expect(filterPortfolio([a, b, c], programs, state({
    search: 'Same Name'
  }), 'lead1', asOf)).toHaveLength(2);
  expect(filterPortfolio([a, b, c], programs, state({
    search: 'Gamma'
  }), 'lead1', asOf)).toEqual([c]);
});
test('missing lead preserves work while missing monitoring does not imply onboarding or quiet', () => {
  const client = {
    client_id: 'a',
    name: 'Unassigned',
    metric_items: {
      past_due: [item('work', '2026-10-19')]
    }
  };
  expect(clientAttention(client, asOf).label).toBe('Needs a lead');
  expect(filterPortfolio([client], [], state({
    kpi: 'overdue'
  }), 'lead1', asOf)).toEqual([client]);
  expect(operationalItems(client, asOf).overdue).toHaveLength(1);
  const unknown = {
    client_id: 'a',
    assigned_owner_id: 'lead1',
    name: 'Unknown'
  };
  expect(clientAttention(unknown, asOf).label).toBe('Status unavailable');
  expect(portfolioKpiValue('notstarted', [unknown], asOf)).toBeNull();
  expect(portfolioKpiValue('quiet', [unknown], asOf)).toBeNull();
  expect(filterPortfolio([unknown], [], state({
    kpi: 'notstarted'
  }), 'lead1', asOf)).toEqual([]);
});

const namedDemoClients = () => [
  ['demo_prestige', 'Prestige Worldwide', '2026-10-21'],
  ['demo_krusty_krab', 'The Krusty Krab', '2026-10-25'],
  ['demo_initech', 'Initech', '2026-10-24'],
  ['demo_dunder', 'Dunder Mifflin', '2026-10-22'],
  ['demo_brawndo', 'Brawndo', null]
].map(([client_id, name, next]) => ({
  client_id, name, environment: 'Demo', assigned_owner_id: 'lead1',
  monitoring: {onboarding: 'complete'},
  metric_items: {past_due: [], due_30d: next ? [item(client_id + '-next', next, {client_id})] : []}
}));
const namedDemoContext = {trustedDemo: true, workspaceMode: 'demo', user: {user_id: 'lead1', workspace_mode: 'demo'}};
const canonicalDemoIds = ['demo_brawndo', 'demo_initech', 'demo_krusty_krab', 'demo_dunder', 'demo_prestige'];
const explicitDemoOrder = {
  name: ['demo_brawndo', 'demo_dunder', 'demo_initech', 'demo_prestige', 'demo_krusty_krab'],
  next: ['demo_prestige', 'demo_dunder', 'demo_initech', 'demo_krusty_krab', 'demo_brawndo']
};

test.each(['attention', undefined])('named Demo Portfolio preserves canonical default ordering for %s', sort => {
  expect(filterPortfolio(namedDemoClients(), [], state({sort}), 'lead1', asOf, true, namedDemoContext)
    .map(row => row.client_id)).toEqual(canonicalDemoIds);
});

test.each(['name', 'next'])('named Demo Portfolio honors explicit %s order for both filtered and base cohorts', sort => {
  const clients = namedDemoClients(), original = [...clients];
  for (const includeKpi of [false, true]) {
    expect(filterPortfolio(clients, [], state({sort}), 'lead1', asOf, includeKpi, namedDemoContext)
      .map(row => row.client_id)).toEqual(explicitDemoOrder[sort]);
  }
  expect(clients).toEqual(original);
  expect(filterPortfolio(clients, [], state({sort, search: 'Initech'}), 'lead1', asOf, true, namedDemoContext))
    .toEqual([clients.find(row => row.client_id === 'demo_initech')]);
});

test.each(['name', 'next'])('named Demo Portfolio keeps the existing normal-mode %s order', sort => {
  const standard = {trustedDemo: false, workspaceMode: 'standard', user: {user_id: 'lead1', workspace_mode: 'standard'}};
  expect(filterPortfolio(namedDemoClients(), [], state({sort}), 'lead1', asOf, true, standard)
    .map(row => row.client_id)).toEqual(explicitDemoOrder[sort]);
});
