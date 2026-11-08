import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import PortfolioHistoryDialog, {PortfolioHistoryChart, useHistory} from './PortfolioReports';
import EnhancedPortfolioHistory from './EnhancedPortfolioHistory';
import api from '@/lib/api';
import {DUNDER_ISO_HISTORY_VERSION, NAMED_DEMO_CLIENTS, namedDemoClient} from '@/lib/demoClients';
import {isDemoScenarioPosition} from '@/lib/portfolioProgress';

let mockPreviewMode = true, mockAuth;
jest.mock('@/lib/api', () => ({
  __esModule: true,
  get PREVIEW_MODE() { return mockPreviewMode; },
  default: {get: jest.fn()},
  formatError: error => error.message,
}));
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));

const CID = 'demo_dunder', PROGRAM = CID + ':iso-27001';
const ANCHOR = '2026-11-02T00:00:00.000Z', AS_OF = '2026-11-03T12:00:00.000Z';
const SAVED_AT = ['2024-03-18T00:00:00.000Z', '2024-09-20T00:00:00.000Z'];
const context = {version: DUNDER_ISO_HISTORY_VERSION, client_id: CID, program_id: PROGRAM,
  anchor: ANCHOR, fingerprint: 'explicit-ui-fixture-proof',
  point_ids: SAVED_AT.map((at, index) => `demo:${PROGRAM}:${at}:${index}`)};
const counts = (implemented, total = 121) => ['addressed', 'in_progress', 'needs_attention', 'not_assessed'].map((key, index) => ({
  key, label: ['Implemented', 'Partially implemented', 'Not implemented', 'Not assessed'][index],
  count: [implemented, total - implemented, 0, 0][index],
}));
const position = (at, implemented, extra = {}) => ({
  snapshot_id: 'native-' + at, client_id: CID, program_id: PROGRAM,
  captured_at: at, effective_at: at, source_revision: 'source-' + at,
  observation_kind: 'current_baseline', availability: 'available',
  denominator: 121, implemented, percentage: implemented / 121 * 100,
  total: 123, assessed: 121, excluded: 2, scope_undetermined: 0, not_started: false,
  counts: counts(implemented), included_counts: counts(implemented),
  scope_signature: `demo-scope:${PROGRAM}:0`, status_signature: 'saved-' + implemented,
  measure_version: 'native-implementation-v1',
  scope: {framework_key: 'iso-27001', catalog_version: '2022 + Amd 1:2024', configuration: {}},
  ...extra,
});
const authored = SAVED_AT.map((at, index) => position(at, index ? 121 : 118, {
  snapshot_id: context.point_ids[index], observation_kind: 'demo_fixture',
  source_revision: `demo-source:${PROGRAM}:${index + 1}`,
  provenance: {kind: 'demo_fixture'}, scenario_version: context.version,
  scenario_anchor: ANCHOR, scenario_fingerprint: context.fingerprint,
  modeled_until: index ? ANCHOR : SAVED_AT[1],
}));
const client = {client_id: CID, name: 'Dunder Mifflin', environment: 'Demo', status: 'active',
  assigned_owner_id: 'fictional-lead', grc_lead_id: 'fictional-lead', grc_lead: {name: 'Fictional Lead'},
  monitoring: {onboarding: 'complete'}};
const program = {client_id: CID, program_id: PROGRAM, framework_key: 'iso-27001', program_key: 'iso-27001',
  program_label: 'ISO 27001', to: '/compliance/iso-27001', current: position(AS_OF, 121)};
const cisProgram = clientId => ({...program, client_id: clientId, program_id: clientId + ':cis-ig1',
  framework_key: 'cis-ig1', program_key: 'cis-ig1', program_label: 'CIS IG1',
  current: {...position(AS_OF, 41), client_id: clientId, program_id: clientId + ':cis-ig1',
    denominator: 56, percentage: 41 / 56 * 100, total: 56, assessed: 56, excluded: 0,
    counts: counts(41, 56), included_counts: counts(41, 56),
    scope: {framework_key: 'cis-ig1', catalog_version: '8.1', configuration: {implementation_group: 1}}}});
const history = (selectedClient = client, selectedProgram = program, qualified = true) => {
  const current = {...selectedProgram.current, client_id: selectedClient.client_id, program_id: selectedProgram.program_id};
  const canonical = selectedClient.client_id === CID && selectedProgram.program_id === PROGRAM
    && selectedProgram.framework_key === 'iso-27001';
  const baseline = canonical ? authored[1] : {...current, captured_at: SAVED_AT[1], effective_at: SAVED_AT[1]};
  return {client_id: selectedClient.client_id, program_key: selectedProgram.program_key,
    as_of: AS_OF, current, snapshots: [current], forecast_snapshots: [current],
    scope_changes: [], forecast_scope_changes: [],
    comparison: qualified && canonical ? {comparable: true, baseline, baseline_effective_at_start: true,
      calculation_basis: 'demo_scenario', change_pp: 0, change_implemented: 0}
      : {comparable: false, baseline, reason: 'No qualified modeled interval at this boundary.'},
    ...(qualified && canonical ? {scenario_context: context} : {}),
  };
};

let container, root;
const noop = () => {};
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPreviewMode = true; mockAuth = {user: {workspace_mode: 'demo'}};
  api.get.mockReset();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const buttonLabels = node => [...node.querySelectorAll('button')].map(button => button.textContent.trim());
const historyRequests = () => api.get.mock.calls.filter(([path]) => path === '/portfolio/reporting/history');
const click = label => act(async () => {
  const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
  expect(button).toBeTruthy(); button.click();
});
async function renderDashboard({selectedClient = client, selectedProgram = program, qualified = true,
  requestScenario = true} = {}) {
  api.get.mockResolvedValue({data: history(selectedClient, selectedProgram, qualified)});
  await act(async () => root.render(<PortfolioHistoryDialog inline referenceHistory cisDashboardProfile
    demoScenario={requestScenario} client={selectedClient} programs={[selectedProgram]}
    selected={selectedProgram.program_id} onNavigate={noop} asOf={AS_OF}/>));
  return container.querySelector('.brawndo-demo-program');
}

test('registry adds only the canonical Dunder ISO history version and leaves all CIS versions unchanged', () => {
  expect(NAMED_DEMO_CLIENTS.map(row => row.clientId)).toEqual([
    'demo_brawndo', 'demo_initech', 'demo_krusty_krab', 'demo_dunder', 'demo_prestige',
  ]);
  expect(namedDemoClient(CID)).toMatchObject({name: 'Dunder Mifflin', logo: '/client-logos/dunder-mifflin.svg',
    historyFramework: 'iso-27001', historyVersion: DUNDER_ISO_HISTORY_VERSION,
    historyVersions: []});
  for (const [id, original] of [['demo_brawndo', 'brawndo-cis-ig1-history-v2'],
    ['demo_initech', 'cis81-standard-demo-v1'], ['demo_krusty_krab', 'cis81-standard-demo-v1']]) {
    expect(namedDemoClient(id).historyVersion).toBe(original);
    expect(namedDemoClient(id).historyVersions).toEqual([original, 'cis81-showcase-v2']);
    expect(namedDemoClient(id).historyFramework).toBeUndefined();
  }
  expect(namedDemoClient('demo_prestige').historyVersions).toEqual([]);
  expect(namedDemoClient('custom_dunder')).toBeUndefined();
  expect(Object.isFrozen(namedDemoClient(CID).historyVersions)).toBe(true);
  const forgedContext = {...context, program_id: CID + ':cis-ig1'};
  const forgedPosition = {...authored[0], program_id: forgedContext.program_id};
  expect(isDemoScenarioPosition(forgedPosition, forgedContext)).toBe(false);
});

test('native ISO dashboard requests the bounded history without CIS-only presentation or new controls', async () => {
  const initial = await renderDashboard({requestScenario: false, qualified: false});
  const controls = buttonLabels(initial);
  const panel = await renderDashboard();
  expect(historyRequests().at(-1)[1].params).toMatchObject({client_id: CID, program_key: 'iso-27001',
    demo_scenario: DUNDER_ISO_HISTORY_VERSION});
  expect(buttonLabels(panel)).toEqual(controls);
  expect(panel.querySelector('[data-demo-scenario]')).toBeNull();
  expect(panel.querySelector('.ph-scenario-area,.ph-status-history-legend,.ph-history-basis')).toBeNull();
  expect(panel.textContent).toContain('ISO 27001 Status');
  expect(panel.textContent).toContain('121 of 121 requirements and controls implemented');
  expect(panel.querySelector('.ph-metrics').textContent).toContain('No change');
  await click('View data');
  expect(panel.querySelector('.ph-data').textContent).toContain('Illustrative demo scenario');
  expect(panel.querySelector('.ph-data').textContent).toContain('Initial native demo baseline');
});

test('canonical metadata does not replace absent source proof or invent a comparison', async () => {
  const panel = await renderDashboard({qualified: false});
  expect(historyRequests().at(-1)[1].params.demo_scenario).toBe(DUNDER_ISO_HISTORY_VERSION);
  expect(panel.querySelector('.ph-metrics').textContent).toContain('Change unavailable');
  expect(panel.querySelector('[data-demo-scenario]')).toBeNull();
  expect(panel.querySelector('.ph-scenario-area,.ph-history-basis')).toBeNull();
});

function RequestProbe({selectedClient, selectedProgram}) {
  useHistory(selectedClient, selectedProgram, '6m', 0, false, true);
  return null;
}
test.each([
  ['standard runtime', () => { mockPreviewMode = false; }, client, program],
  ['non-Demo client', noop, {...client, environment: 'Production'}, program],
  ['custom same-name client', noop, {...client, client_id: 'custom_dunder'}, {...program,
    client_id: 'custom_dunder', program_id: 'custom_dunder:iso-27001'}],
  ['Dunder SOC program', noop, client, {...program, framework_key: 'soc-2', program_key: 'soc-2', program_id: CID + ':soc-2'}],
  ['Dunder CIS program', noop, client, cisProgram(CID)],
  ['wrong native program identity', noop, client, {...program, program_id: 'another-client:iso-27001'}],
  ['foreign program client', noop, client, {...program, client_id: 'another-client'}],
])('%s cannot request Dunder modeled history even when the caller asks', async (_label, setup, selectedClient, selectedProgram) => {
  setup(); api.get.mockResolvedValue({data: history(selectedClient, selectedProgram, false)});
  await act(async () => root.render(<RequestProbe selectedClient={selectedClient} selectedProgram={selectedProgram}/>));
  expect(historyRequests()).toHaveLength(1);
  expect(historyRequests()[0][1].params).not.toHaveProperty('demo_scenario');
});

test('Dunder other-framework dashboard never acquires CIS scenario presentation', async () => {
  const cis = cisProgram(CID);
  const panel = await renderDashboard({selectedProgram: cis, qualified: false});
  expect(historyRequests()[0][1].params).not.toHaveProperty('demo_scenario');
  expect(panel.querySelector('[data-demo-scenario]')).toBeNull();
  expect(panel.querySelector('.ph-history-basis')).toBeNull();
});

test('existing canonical CIS dashboard keeps its exact request version and scenario presentation', async () => {
  const cisClient = {...client, client_id: 'demo_brawndo', name: 'Brawndo'};
  const panel = await renderDashboard({selectedClient: cisClient, selectedProgram: cisProgram(cisClient.client_id), qualified: false});
  expect(historyRequests()[0][1].params.demo_scenario).toBe('brawndo-cis-ig1-history-v2');
  expect(panel.querySelector('[data-demo-scenario="true"]')).toBeTruthy();
});

async function renderPortfolio(selectedClient = client, selectedProgram = program, qualified = true) {
  api.get.mockResolvedValue({data: history(selectedClient, selectedProgram, qualified)});
  await act(async () => root.render(<EnhancedPortfolioHistory client={selectedClient} programs={[selectedProgram]}
    selected={selectedProgram.program_id} asOf={AS_OF} onSelect={noop} onClose={noop} onNavigate={noop}/>));
  return document.querySelector('[data-testid="enhanced-portfolio-history"]');
}
test('Demo Portfolio requests the exact Dunder context for all four native periods', async () => {
  const dialog = await renderPortfolio();
  expect(historyRequests()).toHaveLength(4);
  expect(historyRequests().map(([, options]) => options.params.range)).toEqual(['1m', '3m', '6m', '12m']);
  expect(historyRequests().every(([, options]) => options.params.demo_scenario === DUNDER_ISO_HISTORY_VERSION)).toBe(true);
  expect(dialog.querySelectorAll('.ep-periods strong')).toHaveLength(4);
  expect([...dialog.querySelectorAll('.ep-periods strong')].every(node => node.textContent.includes('0.0'))).toBe(true);
  expect(dialog.querySelector('[data-demo-scenario],.ph-scenario-area,.ph-status-history-legend')).toBeNull();
  await click('View data');
  expect(dialog.querySelector('.ep-history-data').textContent).toContain('Illustrative demo scenario');
  expect(dialog.querySelector('.ep-history-data').textContent).toContain('Initial native baseline');
});

test('Portfolio keeps every period unavailable when the source omits qualified context', async () => {
  const dialog = await renderPortfolio(client, program, false);
  expect(historyRequests().every(([, options]) => options.params.demo_scenario === DUNDER_ISO_HISTORY_VERSION)).toBe(true);
  expect([...dialog.querySelectorAll('.ep-periods strong')].every(node => node.textContent === '—')).toBe(true);
  expect(dialog.textContent).toContain('Not enough history');
  expect(dialog.querySelector('[data-demo-scenario],.ph-scenario-area')).toBeNull();
});

test.each([
  ['authenticated actor', () => { mockAuth.user.workspace_mode = 'standard'; }, client, program],
  ['standard runtime', () => { mockPreviewMode = false; }, client, program],
  ['Dunder SOC program', noop, client, {...program, framework_key: 'soc-2', program_key: 'soc-2', program_id: CID + ':soc-2'}],
  ['custom client', noop, {...client, client_id: 'new_iso'}, {...program, client_id: 'new_iso', program_id: 'new_iso:iso-27001'}],
  ['foreign program client', noop, client, {...program, client_id: 'another-client'}],
])('Portfolio %s does not opt into the Dunder model', async (_label, setup, selectedClient, selectedProgram) => {
  setup(); await renderPortfolio(selectedClient, selectedProgram, false);
  expect(historyRequests()).toHaveLength(4);
  expect(historyRequests().every(([, options]) => !Object.hasOwn(options.params, 'demo_scenario'))).toBe(true);
});

test('the real chart connects the two authorized source positions but never crosses the post-anchor gap', async () => {
  const points = [...authored, program.current];
  const before = JSON.stringify(points);
  await act(async () => root.render(<PortfolioHistoryChart points={points} start={SAVED_AT[0]} asOf={AS_OF}
    view="line" current={program.current} scopeChanges={[]} demoScenario={context} showProvenance/>));
  const line = container.querySelector('.ph-line').getAttribute('d');
  expect(line.match(/H/g)).toHaveLength(1);
  expect(line.match(/M/g)).toHaveLength(2);
  expect(container.querySelector('[data-demo-scenario],.ph-scenario-area,.ph-status-history-legend')).toBeNull();
  const graph = container.querySelector('svg');
  await act(async () => graph.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true})));
  expect(container.querySelector('.ph-tip-basis').textContent).toBe('Illustrative demo scenario');
  expect(container.querySelector('.ph-readout').textContent).toContain('Illustrative demo scenario');
  expect(JSON.stringify(points)).toBe(before);
});
