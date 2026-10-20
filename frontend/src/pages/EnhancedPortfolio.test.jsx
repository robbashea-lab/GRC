import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EnhancedPortfolio } from './EnhancedPortfolio';
import api from '@/lib/api';
import { PORTFOLIO_CHANGED } from '@/lib/usePortfolioRefresh';
import { usePortfolioView } from '@/lib/usePortfolioView';
const mockNavigate = jest.fn(),
  mockSwitch = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({
    pathname: '/clients',
    search: ''
  })
}));
jest.mock('@/context/OrgContext', () => ({
  useOrg: () => ({
    switchClient: mockSwitch
  })
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      user_id: 'u',
      workspace_mode: 'demo'
    }
  })
}));
jest.mock('@/lib/api', () => ({
  __esModule: true,
  PREVIEW_MODE: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
  },
  formatError: error => error.message
}));
const AT = '2026-10-20T12:00:00Z',
  CID = 'demo_brawndo';
const position = (implemented = 2) => ({
  availability: 'available',
  implemented,
  denominator: 10,
  source_revision: 'rev',
  measure_version: 'v1',
  scope_signature: 'scope',
  captured_at: AT,
  effective_at: AT,
  scope: {
    framework_key: 'cis-ig1',
    catalog_version: '8.1',
    configuration: {
      implementation_group: 1
    }
  },
  included_counts: ['addressed', 'in_progress', 'needs_attention', 'not_assessed'].map((key, index) => ({
    key,
    label: ['Implemented', 'Partially implemented', 'Not implemented', 'Not assessed'][index],
    count: [implemented, 1, 1, 8 - implemented][index]
  }))
});
const client = {
  client_id: CID,
  name: 'Brawndo',
  industry: 'Beverage',
  status: 'active',
  grc_lead_id: 'u',
  assigned_owner_id: 'u',
  grc_lead: {
    name: 'Morgan Ellis'
  },
  monitoring: {
    onboarding: 'complete',
    latest_completion: {at:'2026-10-19T12:00:00Z',label:'Native completed review'},
    recurring_scheduled: 2,
    completion_history_coverage: 'partial'
  }
};
const program = {
  client_id: CID,
  program_id: CID + ':cis-ig1',
  program_key: 'cis-ig1',
  framework_key: 'cis-ig1',
  program_label: 'CIS IG1',
  to: '/compliance/cis-ig1',
  current: position(),
  snapshots_90d: [],
  comparison_90d: {
    comparable: false
  }
};
const item = {
  key: 'task1',
  entity_type: 'task',
  entity_id: 'task1',
  client_id: CID,
  title: 'Real native action',
  due_date: '2026-10-17',
  owner_name: 'Frito',
  overdue: true,
  type: 'Action item'
};
let root,
  host,
  current = program;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = jest.fn();
  jest.clearAllMocks();
  current = program;
  sessionStorage.clear();
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  api.get.mockImplementation(async (path, {
    params
  } = {}) => ({
    data: path.endsWith('/overview') ? {
      as_of: AT,
      clients: [client],
      programs: [current]
    } : path === '/clients/directory' ? {
      clients: [{
        ...client,
        metric_items: {
          past_due: [item],
          due_30d: [], due_31_90d: []
        }
      }]
    } : {
      client_id: CID,
      program_key: 'cis-ig1',
      as_of: AT,
      current: current.current,
      snapshots: [{
        ...current.current,
        snapshot_id: 'saved1',
        observation_kind: 'committed_event'
      }],
      forecast_snapshots: [],
      scope_changes: [],
      comparison: {
        comparable: false
      },
      range: params.range
    }
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const click = async label => act(async () => {
  const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label);
  expect(button).toBeTruthy();
  button.click();
});
test('native work, consistent lead/KPI filters and exact navigation survive missing lead and programs', async () => {
  await act(async () => root.render(<EnhancedPortfolio user={{
    user_id: 'u'
  }} />));
  expect(host.querySelector('[data-client-id="demo_brawndo"]')).toBeTruthy();
  await click('By lead');
  expect(host.textContent).toContain('Morgan Ellis');
  expect(host.textContent).toContain('Brawndo');
  await click('Clients');
  await click('Brawndo');
  expect(mockSwitch).toHaveBeenCalledWith(CID);
  expect(mockNavigate).toHaveBeenCalledWith('/dashboard?client_id=demo_brawndo');
  await click('CIS IG1');
  expect(mockNavigate).toHaveBeenLastCalledWith('/compliance/cis-ig1?client_id=demo_brawndo');
  const preview = host.querySelector('[aria-label="Preview Brawndo implementation"]');
  await act(async () => preview.click());
  const dialog = document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog).toBeTruthy();
  expect(dialog.textContent).toContain('Real native action');
  expect(dialog.textContent).toContain('Latest retained completion');
  expect(dialog.textContent).toContain('Native completed review');
  expect(dialog.textContent).toContain('Scheduled recurring reviews · 2');
  expect(dialog.textContent).toContain('Retained completion history is partial.');
  expect(document.body.textContent).not.toMatch(/gone quiet|scheduling gap|monitoring policy/i);
  await act(async () => dialog.querySelector('.ep-work-item').click());
  expect(mockNavigate).toHaveBeenLastCalledWith('/action-items?id=task1&client_id=demo_brawndo');
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});
test('all four native history ranges, status view, genuine table and live current refresh agree', async () => {
  await act(async () => root.render(<EnhancedPortfolio user={{
    user_id: 'u'
  }} />));
  await act(async () => host.querySelector('.ep-progress').click());
  expect(api.get.mock.calls.filter(([path]) => path.endsWith('/history')).map(([, options]) => options.params.range).sort()).toEqual(['12m', '1m', '3m', '6m']);
  await click('View data');
  await click('All statuses');
  const dialog = document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog.querySelector('.ep-history-data').textContent).toContain('20.0%');
  expect(dialog.textContent).not.toContain('NaN');
  expect(dialog.querySelector('.ep-history-actions [aria-pressed]').getAttribute('aria-pressed')).toBe('true');
  current = {
    ...program,
    current: position(3)
  };
  await act(async () => {
    window.dispatchEvent(new Event(PORTFOLIO_CHANGED));
    await new Promise(resolve => setTimeout(resolve, 5));
  });
  expect(dialog.querySelector('.ep-current strong').textContent).toBe('30.0%');
  expect(dialog.querySelector('.ep-periods [aria-pressed="true"]').textContent).toContain('3 months');
  expect(dialog.querySelector('.ep-history-data').textContent).toContain('30.0%');
});
test('incomplete or foreign operational payload fails visibly without retaining old records', async () => {
  api.get.mockRejectedValueOnce(new Error('Reporting unavailable'));
  await act(async () => root.render(<EnhancedPortfolio user={{
    user_id: 'u'
  }} />));
  expect(host.querySelector('[role="alert"]').textContent).toContain('Reporting unavailable');
  await click('Retry');
  expect(host.textContent).toContain('Brawndo');
  api.get.mockImplementation(async () => ({
    data: {
      as_of: AT,
      clients: [],
      programs: []
    }
  }));
  await act(async () => {
    window.dispatchEvent(new Event(PORTFOLIO_CHANGED));
    await new Promise(resolve => setTimeout(resolve, 5));
  });
  expect(host.querySelector('[data-client-id]')).toBeNull();
  expect(host.querySelector('[role="alert"]').textContent).toContain('unavailable');
});
test.each([[],[{...client,metric_items:{past_due:[],due_30d:[]}}],[{...client,metric_items:{past_due:[],due_30d:[],due_31_90d:{}}}]].map(clients=>({clients})))('incomplete native work coverage fails without false zero counts',async ({clients:operations})=>{
  api.get.mockImplementation(async path=>({data:path.endsWith('/overview')?{as_of:AT,clients:[client],programs:[program]}:{clients:operations}}));
  await act(async()=>root.render(<EnhancedPortfolio user={{user_id:'u'}}/>));
  expect(host.querySelector('[role="alert"]').textContent).toContain('operational portfolio response is incomplete');
  expect(host.querySelector('[data-client-id]')).toBeNull();
  expect(host.textContent).not.toContain('Nothing overdue');
});

test('missing program retains operational preview and native record navigation', async () => {
  api.get.mockImplementation(async path => ({
    data: path.endsWith('/overview') ? {
      as_of: AT,
      clients: [{
        ...client,
        grc_lead_id: null,
        assigned_owner_id: null
      }],
      programs: []
    } : {
      clients: [{
        ...client,
        grc_lead_id: null,
        assigned_owner_id: null,
        metric_items: {
          past_due: [item],
          due_30d: [], due_31_90d: []
        }
      }]
    }
  }));
  await act(async () => root.render(<EnhancedPortfolio user={{
    user_id: 'u'
  }} />));
  expect(host.textContent).toContain('No enabled programs');
  await click('View existing work');
  const dialog = document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog.textContent).toContain('Real native action');
  expect(dialog.textContent).toContain('No enabled program is recorded');
  await act(async () => dialog.querySelector('.ep-work-item').click());
  expect(mockNavigate).toHaveBeenLastCalledWith('/action-items?id=task1&client_id=demo_brawndo');
  expect(api.get.mock.calls.some(([path]) => path.endsWith('/history'))).toBe(false);
});

test('no assignments has a working recovery distinct from no matching filters',async()=>{
  await act(async()=>root.render(<EnhancedPortfolio user={{user_id:'different-owner'}}/>));
  await click('Assigned to me');
  expect(host.textContent).toContain('No clients are currently assigned to you.');
  await click('Show all clients');
  expect(host.querySelector('[data-client-id="demo_brawndo"]')).toBeTruthy();
});

test('native portfolio preferences retain search and view after record navigation remount',async()=>{
  const actor={user_id:'u',role:'super_admin',workspace_mode:'demo'};
  await act(async()=>root.render(<EnhancedPortfolio user={actor}/>));
  await act(async()=>{
    const input=host.querySelector('input[aria-label="Search clients"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Brawndo');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await click('By lead');
  await act(async()=>root.render(<div/>));
  await act(async()=>root.render(<EnhancedPortfolio user={actor}/>));
  expect(host.querySelector('input[aria-label="Search clients"]').value).toBe('Brawndo');
  expect([...host.querySelectorAll('button')].find(button=>button.textContent==='By lead').getAttribute('aria-pressed')).toBe('true');
});

test('a removed attention filter cannot hide clients through retained preferences',async()=>{
  const actor={user_id:'removed-filter-owner',role:'super_admin',workspace_mode:'demo'};
  function SavedFilter() {
    const [,update]=usePortfolioView(actor);
    React.useEffect(()=>update({enhancedKpi:'quiet'}),[update]);
    return null;
  }
  await act(async()=>root.render(<SavedFilter/>));
  await act(async()=>root.render(<EnhancedPortfolio user={actor}/>));
  expect(host.querySelector('[data-client-id="demo_brawndo"]')).toBeTruthy();
  expect(host.querySelectorAll('.ep-kpi')).toHaveLength(4);
  expect(host.textContent).not.toMatch(/gone quiet|scheduling gap|monitoring policy/i);
});
