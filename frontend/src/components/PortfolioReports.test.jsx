import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import PortfolioHistoryDialog, {PortfolioHistoryChart, PortfolioSparkline} from './PortfolioReports';
import api from '@/lib/api';
import {programIdentity} from '@/lib/portfolioProgress';

jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn()}, formatError: error => error.message}));
const AT = '2026-10-13T12:00:00Z', DAY = 86400000;
const counts = implemented => [{key: 'addressed', label: 'Implemented', count: implemented}, {key: 'in_progress', label: 'Partially Implemented', count: 0}, {key: 'needs_attention', label: 'Needs Attention', count: 0}, {key: 'not_assessed', label: 'Not Assessed', count: 56 - implemented}];
const snapshot = (days, implemented, extra = {}) => {
  const at = new Date(Date.parse(AT) + days * DAY).toISOString();
  return {snapshot_id: 'position-' + days, effective_at: at, captured_at: at, source_revision: days === 0 ? 'current' : 'revision-' + days,
    observation_kind: 'committed_event', scope_signature: 'scope', measure_version: 'native-implementation-v1', availability: 'available', denominator: 56, implemented, counts: counts(implemented), ...extra};
};
const client = {client_id: 'isolated', name: 'Isolated Client', industry: 'Technology', assigned_owner_id: 'owner', grc_lead: {name: 'Recorded Lead'}};
const programs = [{client_id: client.client_id, program_id: 'isolated:cis', program_key: 'cis-ig3', framework_key: 'cis-ig1', program_label: 'CIS IG3', scope_label: 'Cumulative IG3 safeguards', to: '/compliance/cis-ig1', current: snapshot(0, 32)},
  {client_id: client.client_id, program_id: 'isolated:soc', program_key: 'soc-2', framework_key: 'soc-2', program_label: 'SOC 2', scope_label: 'Security and Availability', to: '/compliance/soc-2', current: snapshot(0, 10, {source_revision: 'soc-current'})}];
const history = (extra = {}) => ({client_id: client.client_id, program_key: 'cis-ig3', as_of: AT, current: snapshot(0, 32), snapshots: [snapshot(-60, 26), snapshot(-30, 29), snapshot(0, 32)],
  forecast_snapshots: [snapshot(-60, 26), snapshot(-30, 29), snapshot(0, 32)], scope_changes: [], forecast_scope_changes: [], comparison: {comparable: false, reason: 'No genuine period boundary'}, coverage: {notice: 'Event-based positions; older coverage is unavailable.'}, ...extra});
let root, container;
const navigate = jest.fn();
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; api.get.mockReset(); navigate.mockReset(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); api.get.mockResolvedValue({data: history()}); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function Harness({initial = true, choices = programs, refreshToken = 1}) {
  const [open, setOpen] = useState(initial), [selected, setSelected] = useState(programIdentity(choices[0])), [view, setView] = useState('line');
  const trigger = useRef(null);
  return <><button type="button" ref={trigger} onClick={() => setOpen(true)}>Open exact program history</button>{open && <PortfolioHistoryDialog client={client} programs={choices} selected={selected} onSelect={setSelected} onClose={() => setOpen(false)} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} onNavigate={navigate} chartView={view} onChartViewChange={setView} refreshToken={refreshToken} asOf={AT} />}</>;
}
const dialog = () => document.querySelector('[data-testid="portfolio-history-dialog"]');
const click = label => act(async () => { const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label); expect(button).toBeTruthy(); button.click(); });
const tab = name => act(async () => { const node = [...document.querySelectorAll('[role="tab"]')].find(value => value.textContent.startsWith(name)); node.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0})); });

test('native dialog opens the exact program, offers all five ranges and keeps canonical current independent from old history', async () => {
  api.get.mockResolvedValue({data: history({snapshots: [snapshot(-60, 55)], forecast_snapshots: []})});
  await act(async () => root.render(<Harness />));
  expect(api.get).toHaveBeenCalledWith('/portfolio/reporting/history', expect.objectContaining({params: {client_id: 'isolated', program_key: 'cis-ig3', range: '3m', include_archived: false}}));
  expect([...dialog().querySelectorAll('[aria-label="History period"] button')].map(node => node.textContent)).toEqual(['1 month', '3 months', '6 months', '12 months', '3 years']);
  expect(dialog().querySelector('.ph-metrics > div').textContent).toContain('57.1%'); expect(dialog().querySelector('.ph-metrics > div').textContent).toContain('32 of 56');
  expect(dialog().querySelector('.ph-readout').textContent).toContain('55'); expect(dialog().querySelector('.ph-readout').textContent).not.toContain('matches current committed state');
  expect(dialog().querySelector('.ph-metrics > div:nth-child(2)').textContent).toContain('No genuine period boundary');
  expect(dialog().querySelector('.ph-metrics > div:nth-child(2)').textContent).not.toContain('No change');
  await click('Open CIS IG3 workspace →'); expect(navigate).toHaveBeenLastCalledWith('/compliance/cis-ig1');
  await click('Open client portal'); expect(navigate).toHaveBeenLastCalledWith('/dashboard');
});

test('range changes preserve expanded data and the 90-day estimate, while reopening resets range/data and retains chart view', async () => {
  await act(async () => root.render(<Harness />)); await click('View data'); await click('Status mix');
  const estimate = dialog().querySelector('.ph-metrics > div:last-child').textContent;
  for (const range of ['1 month', '6 months', '12 months', '3 years']) {
    await click(range); expect(dialog().querySelector('#portfolio-history-data')).toBeTruthy();
    expect(dialog().querySelector('.ph-metrics > div:last-child').textContent).toBe(estimate);
  }
  expect(dialog().querySelectorAll('#portfolio-history-data tbody tr')).toHaveLength(3);
  await click('Close'); expect(dialog()).toBeNull(); expect(document.activeElement.textContent).toBe('Open exact program history');
  await click('Open exact program history'); expect(dialog().querySelector('[aria-label="History period"] [aria-pressed="true"]').textContent).toBe('3 months');
  expect(dialog().querySelector('#portfolio-history-data')).toBeNull(); expect(dialog().querySelector('[aria-label="Chart view"] [aria-pressed="true"]').textContent).toBe('Status mix');
});

test('program tabs replace current/history/routes, retain data expansion and reject delayed old-program replies', async () => {
  let resolveOld;
  api.get.mockImplementation((path, {params}) => params.program_key === 'cis-ig3' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({data: history({program_key: 'soc-2', current: programs[1].current, snapshots: [programs[1].current], forecast_snapshots: []})}));
  await act(async () => root.render(<Harness />)); await click('View data'); await tab('SOC 2');
  expect(dialog().querySelector('.ph-metrics > div').textContent).toContain('17.9%'); expect(dialog().textContent).toContain('Security and Availability');
  await act(async () => resolveOld({data: history({current: snapshot(0, 55)})}));
  expect(dialog().querySelector('.ph-metrics > div').textContent).not.toContain('98.2%'); expect(dialog().querySelector('#portfolio-history-data')).toBeTruthy();
  await click('Open SOC 2 workspace →'); expect(navigate).toHaveBeenLastCalledWith('/compliance/soc-2');
});

test('same-sized scope changes are disclosed and reconstructed positions retain both effective and capture dates', async () => {
  const baseline = snapshot(-100, 20), reconstructed = snapshot(-30, 29, {captured_at: AT, observation_kind: 'reconstructed'});
  api.get.mockResolvedValue({data: history({snapshots: [reconstructed, snapshot(0, 32)], comparison: {baseline, baseline_effective_at_start: true, scope_changed: true},
    scope_changes: [{effective_at: '2026-09-01T12:00:00Z', before: {denominator: 56}, after: {denominator: 56}}]})});
  await act(async () => root.render(<Harness />)); await click('View data');
  expect(dialog().textContent).toContain('Scope changed'); expect(dialog().textContent).toContain('denominator reduction is not additional implemented work');
  const rows = dialog().querySelectorAll('#portfolio-history-data tbody tr'); expect(rows).toHaveLength(2);
  expect(rows[1].textContent).toContain('Sep 13'); expect(rows[1].textContent).toContain('Captured'); expect(rows[1].textContent).toContain('Oct 13');
  expect(dialog().querySelectorAll('.ph-scope-marker')).toHaveLength(1);
});

test('no history and failed history reads preserve real current counts without false changes or invented points', async () => {
  api.get.mockResolvedValue({data: history({snapshots: [], forecast_snapshots: []})});
  await act(async () => root.render(<Harness choices={[programs[0]]} />));
  expect(dialog().querySelector('[role="tablist"]')).toBeNull(); expect(dialog().querySelector('.ph-metrics > div').textContent).toContain('57.1%');
  expect(dialog().textContent).toContain('No saved positions'); expect(dialog().querySelectorAll('.ph-marker')).toHaveLength(0);
  expect(dialog().querySelector('.ph-metrics > div:nth-child(2)').textContent).toContain('Unavailable'); expect(dialog().querySelector('.ph-metrics > div:last-child').textContent).toContain('Not estimated');
  api.get.mockRejectedValue(new Error('History service unavailable')); await click('1 month');
  expect(dialog().querySelector('[role="alert"]').textContent).toContain('History service unavailable'); expect(dialog().querySelector('.ph-metrics > div').textContent).toContain('57.1%');
  expect(dialog().querySelectorAll('.ph-marker')).toHaveLength(0);
});

test('chart keyboard and pointer choose genuine nearest observations, keep dates/counts and use a 100-percent status axis', async () => {
  const points = [snapshot(-60, 26), snapshot(-30, 29), snapshot(0, 32)];
  await act(async () => root.render(<PortfolioHistoryChart points={points} start="2026-07-13T12:00:00Z" asOf={AT} view="line" current={snapshot(0, 32)} scopeChanges={[]} />));
  const svg = container.querySelector('svg');
  const key = value => act(async () => svg.dispatchEvent(new KeyboardEvent('keydown', {key: value, bubbles: true})));
  await key('Home'); expect(container.querySelector('.ph-readout').textContent).toContain('26'); expect(container.querySelector('.ph-readout').textContent).toContain('Aug 14');
  await key('ArrowRight'); expect(container.querySelector('.ph-readout').textContent).toContain('29'); await key('End'); expect(container.querySelector('.ph-readout').textContent).toContain('32');
  svg.getBoundingClientRect = () => ({left: 0, width: 900});
  await act(async () => svg.querySelector('rect[fill="transparent"]').dispatchEvent(new MouseEvent('pointermove', {bubbles: true, clientX: 350})));
  expect(container.querySelector('.ph-readout').textContent).toContain('26'); expect(container.textContent).toContain('Vertical axis zoomed');
  await act(async () => root.render(<PortfolioHistoryChart points={points} start="2026-07-13T12:00:00Z" asOf={AT} view="mix" current={snapshot(0, 32)} scopeChanges={[]} />));
  expect(container.textContent).toContain('0%'); expect(container.textContent).toContain('100%'); expect(container.textContent).not.toContain('Vertical axis zoomed');
  expect([...container.querySelectorAll('.ph-grid')].map(line => line.nextSibling.textContent)).toEqual(['0%', '25%', '50%', '75%', '100%']);
});

test('touch pointerdown reads genuine nearest positions after range, program and chart-view changes', async () => {
  const socPoints = [snapshot(-14, 40, {source_revision: 'soc-earlier'}), snapshot(0, 50, {source_revision: 'soc-current'})];
  api.get.mockImplementation((path, {params}) => Promise.resolve({data: params.program_key === 'soc-2'
    ? history({program_key: 'soc-2', current: socPoints[1], snapshots: socPoints, forecast_snapshots: []}) : history()}));
  const touchAt = async clientX => {
    const svg = dialog().querySelector('.ph-chart svg');
    svg.getBoundingClientRect = () => ({left: 120, width: 450});
    const event = typeof PointerEvent === 'function' ? new PointerEvent('pointerdown', {bubbles: true, clientX, pointerType: 'touch'}) : new MouseEvent('pointerdown', {bubbles: true, clientX});
    if (!event.pointerType) Object.defineProperty(event, 'pointerType', {value: 'touch'});
    expect(event.pointerType).toBe('touch');
    await act(async () => svg.querySelector('rect[fill="transparent"]').dispatchEvent(event));
  };
  const expectPosition = (date, implemented) => {
    const readout = dialog().querySelector('.ph-readout').textContent;
    expect(readout).toContain(date);
    expect(readout).toContain(`Implemented ${implemented} ·`);
  };
  await act(async () => root.render(<Harness />));
  await touchAt(295); expectPosition('Aug 14', 26);
  await click('1 month'); await touchAt(145); expectPosition('Sep 13', 29);
  await tab('SOC 2'); await touchAt(145); expectPosition('Sep 29', 40);
  await click('Status mix'); await touchAt(550); expectPosition('Oct 13', 50);
  expect(dialog().querySelector('.ph-readout').textContent).not.toContain('Implemented 26 ·');
  expect(dialog().querySelector('[aria-label="Chart view"] [aria-pressed="true"]').textContent).toBe('Status mix');
});

test('a new two-week sparkline retains the common ninety-day axis rather than stretching first capture to the left edge', async () => {
  await act(async () => root.render(<PortfolioSparkline program={{snapshots_90d: [snapshot(-14, 29), snapshot(0, 32)]}} asOf={AT} span={8} />));
  const svg = container.querySelector('svg'), points = svg.querySelector('polyline').getAttribute('points').split(' ');
  expect(svg.dataset.start).toBe('2026-07-15T12:00:00.000Z'); expect(Number(points[0].split(',')[0])).toBeGreaterThan(100); expect(Number(points[1].split(',')[0])).toBe(131);
});

test('unproved sampled gaps use discrete status columns and line paths break when scope identity changes', async () => {
  const points = [snapshot(-60, 26, {observation_kind: 'sampled_observation'}), snapshot(0, 32, {observation_kind: 'sampled_observation', scope_signature: 'new-scope'})];
  await act(async () => root.render(<PortfolioHistoryChart points={points} start="2026-07-13T12:00:00Z" asOf={AT} view="mix" current={points[1]} scopeChanges={[]} />));
  expect(container.querySelectorAll('.ph-marker')).toHaveLength(2);
  expect(container.querySelectorAll('.ph-band')).toHaveLength(8);
  expect([...container.querySelectorAll('.ph-band')].every(rect => Number(rect.getAttribute('width')) === 12)).toBe(true);
  expect(container.querySelector('.ph-line').getAttribute('d').match(/M/g)).toHaveLength(2);
  expect(container.querySelector('.ph-line').getAttribute('d')).not.toContain('L');
});

test.each([{client_id: 'another-client'}, {program_key: 'another-program'}])('a mismatched selected-program response is rejected without borrowing its posture: %j', async wrongIdentity => {
  api.get.mockResolvedValue({data: history({...wrongIdentity, current: snapshot(0, 55)})});
  await act(async () => root.render(<Harness choices={[programs[0]]} />));
    expect(dialog().querySelector('[role="alert"]').textContent).toContain('does not belong to the selected client program');
    expect(dialog().querySelector('.ph-metrics > div').textContent).toContain('57.1%');
    expect(dialog().querySelector('.ph-metrics > div').textContent).not.toContain('98.2%');
});

test('backdrop dismisses the native modal and restores its initiating control', async () => {
  jest.useFakeTimers();
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => jest.runOnlyPendingTimers());
    const overlay = document.querySelector('.ui-overlay');
    expect(overlay).toBeTruthy();
    await act(async () => overlay.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, button: 0})));
    await act(async () => jest.runOnlyPendingTimers());
    expect(dialog()).toBeNull(); expect(document.activeElement.textContent).toBe('Open exact program history');
  } finally { jest.useRealTimers(); }
});

test('partial missing native source cannot be presented as zero scope, assessed counts or a zero current legend', async () => {
  const current = snapshot(0, 0, {availability: 'partial', denominator: 0, assessed: 0, counts: counts(56).map(value => ({...value, count: 0})), reason: 'Expected native records are missing'});
  api.get.mockResolvedValue({data: history({current, snapshots: [], forecast_snapshots: []})});
  await act(async () => root.render(<Harness choices={[{...programs[0], current}]} />));
  expect(dialog().querySelector('.ph-metrics > div').textContent).toContain('Unavailable');
  expect(dialog().querySelector('.ph-current-status').textContent).toContain('Applicable scope unavailable');
  expect(dialog().querySelector('.ph-current-status').textContent).toContain('Expected native records are missing');
  expect(dialog().querySelector('.ph-legend')).toBeNull();
  expect(dialog().querySelector('.ph-current-status').textContent).not.toContain('0 applicable');
  expect(dialog().querySelector('.ph-metrics > div').textContent).not.toContain('0 of 0');
});

test('an unavailable retained position keeps its real date and diagnostic without zero counts or a current-state match', async () => {
  const point = snapshot(-30, 0, {availability: 'partial', denominator: 0, counts: counts(56).map(value => ({...value, count: 0})), reason: 'Expected native records are missing'});
  const current = {...point, snapshot_id: 'current-read', effective_at: AT, captured_at: AT};
  await act(async () => root.render(<PortfolioHistoryChart points={[point]} start="2026-07-13T12:00:00Z" asOf={AT} view="line" current={current} scopeChanges={[]} />));
  const readout = container.querySelector('.ph-readout');
  expect(readout.textContent).toContain('Sep 13');
  expect(readout.textContent).toContain('Implementation/counts unavailable');
  expect(readout.textContent).toContain('Expected native records are missing');
  expect(readout.textContent).not.toContain('matches current committed state');
  expect(readout.textContent).not.toContain('of 0 applicable');
  expect(readout.textContent).not.toContain('Implemented 0');
  expect(readout.querySelector('.ph-dot')).toBeNull();
});

test('program tabs and genuine zero-scope history distinguish no applicable scope from unavailable source data', async () => {
  const zero = snapshot(0, 0, {denominator: 0, counts: counts(56).map(value => ({...value, count: 0})), not_started: true});
  const choices = [{...programs[0], current: zero}, {...programs[1], current: {...zero, availability: 'partial', source_revision: 'missing'}}];
  api.get.mockResolvedValue({data: history({current: zero, snapshots: [zero], forecast_snapshots: []})});
  await act(async () => root.render(<Harness choices={choices} />));
  const tabs = [...dialog().querySelectorAll('[role="tab"]')];
  expect(tabs[0].querySelector('small').textContent).toBe('No applicable scope');
  expect(tabs[1].querySelector('small').textContent).toBe('Unavailable');
  expect(dialog().querySelector('.ph-metrics > div').textContent).toContain('No applicable scope');
  expect(dialog().querySelector('.ph-metrics > div:last-child').textContent).toContain('Not estimated');
  await click('View data');
  expect(dialog().querySelector('#portfolio-history-data tbody tr td:last-child').textContent).toBe('N/A');
});

test('Escape closes the native modal and restores focus to its initiating control', async () => {
  await act(async () => root.render(<Harness initial={false} />)); await click('Open exact program history');
  await act(async () => dialog().dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  expect(dialog()).toBeNull(); expect(document.activeElement.textContent).toBe('Open exact program history');
});
