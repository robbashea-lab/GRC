import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import PortfolioHistoryDialog, {PortfolioHistoryChart, PortfolioSparkline, sparklineSpan, scopeNote} from './PortfolioReports';
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
function Harness({initial = true, choices = programs, refreshToken = 1, onStatusNavigate}) {
  const [open, setOpen] = useState(initial), [selected, setSelected] = useState(programIdentity(choices[0])), [view, setView] = useState('line');
  const trigger = useRef(null);
  return <><button type="button" ref={trigger} onClick={() => setOpen(true)}>Open exact program history</button>{open && <PortfolioHistoryDialog client={client} programs={choices} selected={selected} onSelect={setSelected} onClose={() => setOpen(false)} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} onNavigate={navigate} onStatusNavigate={onStatusNavigate} chartView={view} onChartViewChange={setView} refreshToken={refreshToken} asOf={AT} />}</>;
}
const dialog = () => document.querySelector('[data-testid="portfolio-history-dialog"]');
const click = label => act(async () => { const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label); expect(button).toBeTruthy(); button.click(); });
const tab = name => act(async () => { const node = [...document.querySelectorAll('[role="tab"]')].find(value => value.textContent.startsWith(name)); node.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0})); });

test('status interaction synchronizes segment and row, exposes zero-count statuses, and preserves canonical counts', async () => {
  await act(async () => root.render(<Harness />));
  const segments = dialog().querySelectorAll('.ph-interactive-bar button');
  expect(segments).toHaveLength(2);
  expect(segments[0].getAttribute('aria-label')).toBe('Implemented: 57.1%, 32 of 56');
  await act(async () => segments[0].focus());
  expect(dialog().querySelector('.ph-breakdown-row.is-active').textContent).toContain('32 / 56');
  expect(dialog().querySelectorAll('.ph-interactive-bar .is-dim')).toHaveLength(1);
  const rows = dialog().querySelectorAll('.ph-breakdown-row');
  expect(rows).toHaveLength(4);
  await act(async () => rows[1].click());
  expect(rows[1].classList.contains('is-active')).toBe(true);
  expect(rows[1].textContent).toContain('0 / 56');
  expect(dialog().querySelector('.ph-current-value').textContent).toContain('57.1%');
});

test('scope notes use membership evidence and retain simultaneous implementation changes', () => {
  expect(scopeNote({membership_known:true,added_ids:['a','b'],removed_ids:[],before:{denominator:54,implemented:23},after:{denominator:56,implemented:23}},'safeguards'))
    .toBe('2 safeguards added to scope. Applicable went from 54 to 56.');
  expect(scopeNote({before:{denominator:54,implemented:23},after:{denominator:56,implemented:22}}))
    .toBe('Scope changed. Applicable went from 54 to 56. Implemented went from 23 to 22.');
});

test('native dialog opens the exact program, offers the four approved ranges and keeps canonical current independent from old history', async () => {
  api.get.mockResolvedValue({data: history({snapshots: [snapshot(-60, 55)], forecast_snapshots: []})});
  await act(async () => root.render(<Harness />));
  expect(api.get).toHaveBeenCalledWith('/portfolio/reporting/history', expect.objectContaining({params: {client_id: 'isolated', program_key: 'cis-ig3', range: '6m', include_archived: false}}));
  expect([...dialog().querySelectorAll('[aria-label="History period"] button')].map(node => node.textContent)).toEqual(['1 month', '3 months', '6 months', '12 months']);
  expect(dialog().querySelector('.ph-current-value').textContent).toContain('57.1%'); expect(dialog().querySelector('.ph-current-value').textContent).toContain('32 of 56');
  expect(dialog().querySelector('.ph-readout').textContent).toContain('55'); expect(dialog().querySelector('.ph-readout').textContent).not.toContain('matches current committed state');
  expect(dialog().querySelector('.ph-metrics-sparse').textContent).toContain('Available after more saved history');
  expect(dialog().querySelector('.ph-metrics > div:first-child').textContent).not.toContain('No change');
  await click('Open CIS IG3 workspace →'); expect(navigate).toHaveBeenLastCalledWith('/compliance/cis-ig1');
  await click('Open client portal'); expect(navigate).toHaveBeenLastCalledWith('/dashboard');
});

test('range changes preserve expanded data and the 90-day estimate, while reopening resets range/data and retains chart view', async () => {
  await act(async () => root.render(<Harness />)); await click('View data'); await click('Status mix');
  const estimate = dialog().querySelector('.ph-metrics > div:last-child').textContent;
  for (const range of ['1 month', '3 months', '12 months']) {
    await click(range); expect(dialog().querySelector('#portfolio-history-data')).toBeTruthy();
    expect(dialog().querySelector('.ph-metrics > div:last-child').textContent).toBe(estimate);
  }
  expect(dialog().querySelectorAll('#portfolio-history-data tbody tr')).toHaveLength(3);
  await act(async () => dialog().querySelector('.ph-head-actions [aria-label="Close"]').click());
  expect(dialog()).toBeNull(); expect(document.activeElement.textContent).toBe('Open exact program history');
  await click('Open exact program history'); expect(dialog().querySelector('[aria-label="History period"] [aria-pressed="true"]').textContent).toBe('6 months');
  expect(dialog().querySelector('#portfolio-history-data')).toBeNull(); expect(dialog().querySelector('[aria-label="Chart view"] [aria-pressed="true"]').textContent).toBe('Status mix');
});

test('program tabs replace current/history/routes, retain data expansion and reject delayed old-program replies', async () => {
  let resolveOld;
  api.get.mockImplementation((path, {params}) => params.program_key === 'cis-ig3' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({data: history({program_key: 'soc-2', current: programs[1].current, snapshots: [programs[1].current], forecast_snapshots: []})}));
  await act(async () => root.render(<Harness />)); await click('View data'); await tab('SOC 2');
  expect(dialog().querySelector('.ph-current-value').textContent).toContain('17.9%'); expect(dialog().textContent).toContain('Security and Availability');
  await act(async () => resolveOld({data: history({current: snapshot(0, 55)})}));
  expect(dialog().querySelector('.ph-current-value').textContent).not.toContain('98.2%'); expect(dialog().querySelector('#portfolio-history-data')).toBeTruthy();
  await click('Open SOC 2 workspace →'); expect(navigate).toHaveBeenLastCalledWith('/compliance/soc-2');
});

test('same-sized scope changes are disclosed and reconstructed positions retain both effective and capture dates', async () => {
  const baseline = snapshot(-200, 20), reconstructed = snapshot(-30, 29, {captured_at: AT, observation_kind: 'reconstructed'});
  api.get.mockResolvedValue({data: history({snapshots: [reconstructed, snapshot(0, 32)], comparison: {baseline, baseline_effective_at_start: true, scope_changed: true},
    scope_changes: [{effective_at: '2026-09-01T12:00:00Z', before: {denominator: 56}, after: {denominator: 56}}]})});
  await act(async () => root.render(<Harness />)); await click('View data');
  expect(dialog().textContent).toContain('Scope changed'); expect(dialog().textContent).toContain('Scope changed (56 → 56 applicable)');
  const rows = dialog().querySelectorAll('#portfolio-history-data tbody tr'); expect(rows).toHaveLength(3); expect(rows[2].textContent).toContain("In effect at period start");
  expect(rows[1].textContent).toContain('Sep 13'); expect(rows[1].textContent).toContain('Captured'); expect(rows[1].textContent).toContain('Oct 13');
  expect(dialog().querySelectorAll('.ph-scope-marker')).toHaveLength(1);
});

test('no history and failed history reads preserve real current counts without false changes or invented points', async () => {
  api.get.mockResolvedValue({data: history({snapshots: [], forecast_snapshots: []})});
  await act(async () => root.render(<Harness choices={[programs[0]]} />));
  expect(dialog().querySelector('[role="tablist"]')).toBeNull(); expect(dialog().querySelector('.ph-current-value').textContent).toContain('57.1%');
  expect(dialog().textContent).toContain('No saved positions'); expect(dialog().querySelectorAll('.ph-marker')).toHaveLength(0);
  expect(dialog().querySelector('.ph-metrics-sparse').textContent).toContain('Available after more saved history'); expect(dialog().querySelector('.ph-history-meter').textContent).toContain('0 retained');
  api.get.mockRejectedValue(new Error('History service unavailable')); await click('1 month');
  expect(dialog().querySelector('[role="alert"]').textContent).toContain('History service unavailable'); expect(dialog().querySelector('.ph-current-value').textContent).toContain('57.1%');
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
  expect(container.querySelector('.ph-readout').textContent).toContain('26'); expect(container.textContent).not.toContain('Vertical axis zoomed'); expect(container.textContent).toContain('100%');
  await act(async () => root.render(<PortfolioHistoryChart points={points} start="2026-07-13T12:00:00Z" asOf={AT} view="mix" current={snapshot(0, 32)} scopeChanges={[]} />));
  expect(container.textContent).toContain('0%'); expect(container.textContent).toContain('100%'); expect(container.textContent).not.toContain('Vertical axis zoomed');
  expect([...container.querySelectorAll('.ph-grid,.ph-axis,.ph-target')].map(line => line.nextSibling.textContent)).toEqual(['0%', '25%', '50%', '75%', '100%']);
});

test('modal history tooltips flip at the right edge and remain inside a resized chart while keyboard selection retains real counts', async () => {
  let paneWidth = 600, paneHeight = 296;
  const originalBounds = Element.prototype.getBoundingClientRect;
  const bounds = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.matches('.ph-chart,.ph-chart > svg')) return {left:100, top:50, width:paneWidth, height:paneHeight};
    if (this.matches('.ph-history-tip')) return {left:0, top:0, width:220, height:100};
    return originalBounds.call(this);
  });
  try {
    const points = [snapshot(-60, 26), snapshot(-30, 29), snapshot(0, 32)];
    await act(async () => root.render(<PortfolioHistoryChart points={points} start="2026-07-13T12:00:00Z" asOf={AT} view="line" current={points[2]} scopeChanges={[]} />));
    const svg = container.querySelector('svg');
    const key = value => act(async () => svg.dispatchEvent(new KeyboardEvent('keydown', {key:value, bubbles:true})));
    const expectContained = () => {
      const tip = container.querySelector('.ph-history-tip'), left = parseFloat(tip.style.left), top = parseFloat(tip.style.top);
      expect(left).toBeGreaterThanOrEqual(0); expect(left + 220).toBeLessThanOrEqual(paneWidth);
      expect(top).toBeGreaterThanOrEqual(0); expect(top + 100).toBeLessThanOrEqual(paneHeight);
      return left;
    };
    await key('Home');
    expect(container.querySelector('.ph-readout').textContent).toContain('Implemented 26 ·');
    expect(expectContained()).toBeGreaterThan(Number(container.querySelector('.ph-active').getAttribute('cx')));
    await key('End');
    expect(container.querySelector('.ph-history-tip').textContent).toContain('32 of 56');
    expect(expectContained() + 220).toBeLessThan(Number(container.querySelector('.ph-active').getAttribute('cx')));
    paneWidth = 240; paneHeight = 180;
    await act(async () => window.dispatchEvent(new Event('resize')));
    expectContained();
    await key('ArrowLeft'); expectContained();
    expect(container.querySelector('.ph-readout').textContent).toContain('Implemented 29 ·');
  } finally { bounds.mockRestore(); }
});

test('status keyboard focus centers measured tooltips over the segment and clamps both horizontal edges without changing counts', async () => {
  const originalBounds = Element.prototype.getBoundingClientRect;
  const bounds = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.matches('.portfolio-history-dialog')) return {left:80, top:100, width:350, height:600};
    if (this.matches('.ph-status-scale')) return {left:100, top:200, width:300, height:62};
    if (this.matches('.ph-interactive-bar')) return {left:104, top:224, width:292, height:14};
    if (this.matches('.ph-segment-detail')) return {left:0, top:0, width:170, height:90};
    return originalBounds.call(this);
  });
  try {
    await act(async () => root.render(<Harness />));
    const segments = dialog().querySelectorAll('.ph-interactive-bar button');
    for (const segment of segments) {
      await act(async () => segment.focus());
      const tip = dialog().querySelector('.ph-segment-detail'), left = parseFloat(tip.style.left), top = parseFloat(tip.style.top);
      expect(left + 80).toBeGreaterThanOrEqual(100); expect(left + 80 + 170).toBeLessThanOrEqual(400);
      expect(top + 100 + 90).toBeLessThan(224);
      expect(dialog().querySelectorAll('.ph-breakdown-row.is-active')).toHaveLength(1);
      expect(dialog().querySelector('.ph-current-value').textContent).toContain('32 of 56');
    }
    expect(dialog().querySelector('.ph-segment-detail').textContent).toContain('24 / 56');
    await act(async () => dialog().querySelector('.ph-head-actions .ph-button').focus());
    expect(dialog().querySelector('.ph-segment-detail')).toBeNull();
    expect(dialog().querySelectorAll('.ph-breakdown-row')).toHaveLength(4);
  } finally { bounds.mockRestore(); }
});

test('modal status details escape the scroll clip, follow body scrolling, fit a narrow scale and clean up while keyboard focus preserves genuine counts', async () => {
  let scrollOffset = 0, scaleWidth = 760, addedScroll, removedScroll;
  const originalBounds = Element.prototype.getBoundingClientRect;
  const bounds = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.matches('.portfolio-history-dialog')) return {left:160, top:16, width:1120, height:843};
    if (this.matches('.ph-body')) return {left:160, top:94, width:1120, height:766};
    if (this.matches('.ph-status-scale')) return {left:468, top:164 - scrollOffset, width:scaleWidth, height:62};
    if (this.matches('.ph-interactive-bar')) return {left:472, top:188 - scrollOffset, width:scaleWidth - 8, height:14};
    if (this.matches('.ph-segment-detail')) return {left:0, top:0, width:Math.min(180, parseFloat(this.style.maxWidth) || 180), height:92};
    return originalBounds.call(this);
  });
  try {
    await act(async () => root.render(<Harness />));
    const body = dialog().querySelector('.ph-body'), segments = dialog().querySelectorAll('.ph-interactive-bar button');
    addedScroll = jest.spyOn(body, 'addEventListener'); removedScroll = jest.spyOn(body, 'removeEventListener');
    await act(async () => segments[0].focus());
    const tip = dialog().querySelector('.ph-segment-detail'), top = parseFloat(tip.style.top);
    expect(tip.parentElement).toBe(dialog()); expect(body.contains(tip)).toBe(false);
    expect(top + 16).toBeLessThan(body.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(tip.textContent).toContain('Implemented'); expect(tip.textContent).toContain('32 / 56');
    scrollOffset = 40;
    await act(async () => body.dispatchEvent(new Event('scroll')));
    expect(parseFloat(tip.style.top)).toBe(top - 40);
    expect(document.activeElement).toBe(segments[0]); expect(tip.textContent).toContain('32 / 56');
    scaleWidth = 160;
    await act(async () => window.dispatchEvent(new Event('resize')));
    const left = parseFloat(tip.style.left) + 160, width = tip.getBoundingClientRect().width;
    expect(width).toBeLessThanOrEqual(scaleWidth);
    expect(left).toBeGreaterThanOrEqual(468); expect(left + width).toBeLessThanOrEqual(468 + scaleWidth);
    expect(tip.textContent).toContain('32 / 56');
    await act(async () => segments[1].focus());
    expect(dialog().querySelector('.ph-segment-detail').textContent).toContain('24 / 56');
    expect(dialog().querySelector('.ph-current-value').textContent).toContain('32 of 56');
    const scrollHandler = addedScroll.mock.calls.filter(([type]) => type === 'scroll').at(-1)[1];
    await act(async () => dialog().querySelector('.ph-head-actions .ph-button').focus());
    expect(dialog().querySelector('.ph-segment-detail')).toBeNull();
    expect(removedScroll).toHaveBeenCalledWith('scroll', scrollHandler);
  } finally { bounds.mockRestore(); addedScroll?.mockRestore(); removedScroll?.mockRestore(); }
});

test('modal canvases retain native focused controls, genuine counts and status destinations across fractional-gutter and narrow resizes', async () => {
  let bodyWidth = 1120, gutter = 15 + 1 / 3, scaleWidth = 744 + 2 / 3, chartWidth = 1003 + 2 / 3;
  const originalBounds = Element.prototype.getBoundingClientRect, originalObserver = global.ResizeObserver;
  const observers = new Set(), openStatus = jest.fn();
  global.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.add(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { observers.delete(this); }
  };
  const resize = () => act(async () => { [...observers].filter(observer => [...observer.targets].some(target => target.matches('.ph-status-scale,.ph-chart'))).forEach(observer => observer.callback()); });
  const bounds = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.matches('.ph-body')) return {left:0, top:0, width:bodyWidth, height:700};
    if (this.parentElement?.matches('.ph-body')) return {left:0, top:0, width:bodyWidth - gutter, height:900};
    if (this.matches('.ph-status-scale')) return {left:0, top:0, width:scaleWidth, height:62};
    if (this.matches('.ph-chart,.ph-chart > svg')) return {left:0, top:0, width:chartWidth, height:296};
    return originalBounds.call(this);
  });
  try {
    await act(async () => root.render(<Harness onStatusNavigate={openStatus} />));
    const group = dialog().querySelector('[aria-label="Current status composition"]'), segments = group.querySelectorAll('button');
    expect(group.getAttribute('role')).toBe('group'); expect(segments).toHaveLength(2);
    expect(segments[0].namespaceURI).toBe('http://www.w3.org/1999/xhtml');
    expect(dialog().querySelector('.ph-composition-canvas').getAttribute('viewBox')).toBe('0 0 760 62');
    expect(dialog().querySelector('.ph-chart svg').getAttribute('viewBox')).toBe('0 0 1019 296');
    await act(async () => segments[0].focus());
    expect(dialog().querySelector('.ph-segment-detail').textContent).toContain('32 / 56');
    bodyWidth = 340; gutter = 0; scaleWidth = 240; chartWidth = 240;
    await resize();
    expect(group.querySelector('button')).toBe(segments[0]); expect(document.activeElement).toBe(segments[0]);
    expect(segments[0].getAttribute('aria-pressed')).toBe('true');
    expect(dialog().querySelector('.ph-segment-detail').textContent).toContain('32 / 56');
    expect(dialog().querySelector('.ph-composition-canvas').getAttribute('viewBox')).toBe('0 0 280 62');
    expect(dialog().querySelector('.ph-chart svg').getAttribute('viewBox')).toBe('0 0 300 296');
    await act(async () => segments[0].click()); expect(openStatus).toHaveBeenLastCalledWith('addressed');
    const zeroCount = dialog().querySelectorAll('.ph-breakdown-row')[1];
    await act(async () => zeroCount.focus());
    expect(dialog().querySelector('.ph-segment-detail').textContent).toContain('0 / 56');
    await act(async () => zeroCount.click()); expect(openStatus).toHaveBeenLastCalledWith('in_progress');
    expect(dialog().querySelectorAll('.ph-breakdown-row')).toHaveLength(4);
    expect(dialog().querySelector('.ph-current-value').textContent).toContain('32 of 56');
    const graph = dialog().querySelector('.ph-chart svg');
    await act(async () => { graph.focus(); graph.dispatchEvent(new KeyboardEvent('keydown', {key:'Home', bubbles:true})); });
    expect(dialog().querySelector('.ph-readout').textContent).toContain('Implemented 26 ·');
    bodyWidth = 800; gutter = 15 + 1 / 3; scaleWidth = 500; chartWidth = 660;
    await resize();
    expect(document.activeElement).toBe(graph);
    expect(dialog().querySelector('.ph-readout').textContent).toContain('Implemented 26 ·');
    await act(async () => graph.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true})));
    expect(dialog().querySelector('.ph-readout').textContent).toContain('Implemented 29 ·');
  } finally { bounds.mockRestore(); global.ResizeObserver = originalObserver; }
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
  const svg = container.querySelector('svg'), points = svg.querySelector('.gp-spark-line').getAttribute('d').split(' ').map(value => value.slice(1));
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
    expect(dialog().querySelector('.ph-current-value').textContent).toContain('57.1%');
    expect(dialog().querySelector('.ph-current-value').textContent).not.toContain('98.2%');
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
  expect(dialog().querySelector('.ph-current-value').textContent).toContain('Unavailable');
  expect(dialog().querySelector('.ph-breakdown').textContent).toContain('Applicable scope unavailable');
  expect(dialog().querySelector('.ph-breakdown').textContent).toContain('Expected native records are missing');
  expect(dialog().querySelector('.ph-legend')).toBeNull();
  expect(dialog().querySelector('.ph-breakdown').textContent).not.toContain('0 applicable');
  expect(dialog().querySelector('.ph-current-value').textContent).not.toContain('0 of 0');
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
  expect(dialog().querySelector('.ph-current-value').textContent).toContain('No applicable scope');
  expect(dialog().querySelector('.ph-metrics > div:last-child').textContent).toContain('Not estimated');
  await click('View data');
  expect(dialog().querySelector('#portfolio-history-data tbody tr td:last-child').textContent).toBe('N/A');
});

test('Escape closes the native modal and restores focus to its initiating control', async () => {
  await act(async () => root.render(<Harness initial={false} />)); await click('Open exact program history');
  await act(async () => dialog().dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  expect(dialog()).toBeNull(); expect(document.activeElement.textContent).toBe('Open exact program history');
});

test('carried sparkline baseline participates in shared scaling without connecting an unproved gap', async () => {
  const baseline = snapshot(-100, 2), endpoint = snapshot(0, 54);
  const program = {snapshots_90d:[endpoint],comparison_90d:{baseline,baseline_effective_at_start:true}};
  const span = sparklineSpan([program],AT);
  expect(span).toBeGreaterThan(90);
  await act(async () => root.render(<PortfolioSparkline program={program} asOf={AT} span={span}/>));
  const path = container.querySelector('.gp-spark-line').getAttribute('d');
  expect(path.match(/M/g)).toHaveLength(2);
  expect(container.querySelectorAll('.gp-spark-position')).toHaveLength(1);
  for (const command of path.split(' ')) expect(Number(command.split(',')[1])).toBeGreaterThanOrEqual(0);
  expect(Number(container.querySelector('.gp-spark-end').getAttribute('cy'))).toBeLessThan(30);
});

test('inline program reuses canonical reporting and navigates all native statuses', async () => {
  const onStatusNavigate = jest.fn();
  const render = refreshToken => root.render(<PortfolioHistoryDialog inline client={client} programs={[programs[0]]}
    selected={programIdentity(programs[0])} onNavigate={navigate} onStatusNavigate={onStatusNavigate}
    chartView="line" onChartViewChange={() => {}} refreshToken={refreshToken} asOf={AT} />);
  await act(async () => render(1));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  const inline = document.querySelector('.brawndo-demo-program');
  expect(inline.querySelector('h3').textContent).toBe('CIS IG1 Status');
  expect(inline.querySelector('.ph-current-value').textContent).toContain('32 of 56');
  for (const [index, key] of ['addressed', 'in_progress', 'needs_attention', 'not_assessed'].entries()) {
    await act(async () => inline.querySelectorAll('.ph-breakdown-row')[index].click());
    expect(onStatusNavigate).toHaveBeenLastCalledWith(key);
  }
  await act(async () => inline.querySelector('.ph-interactive-bar button').click());
  expect(onStatusNavigate).toHaveBeenLastCalledWith('addressed');
  await click('1 month'); await click('View data');
  await act(async () => render(2));
  expect(inline.querySelector('[aria-label="History period"] [aria-pressed=true]').textContent).toBe('1 month');
  expect(inline.querySelector('#portfolio-history-data')).toBeTruthy();
  expect(api.get).toHaveBeenLastCalledWith('/portfolio/reporting/history', expect.objectContaining({params: expect.objectContaining({range:'1m'})}));
});

test('inline program reports missing current and history honestly', async () => {
  api.get.mockRejectedValue(new Error('History unavailable'));
  const program = {...programs[0], current: null};
  await act(async () => root.render(<PortfolioHistoryDialog inline client={client} programs={[program]}
    selected={programIdentity(program)} onNavigate={navigate} chartView="line" onChartViewChange={() => {}} asOf={AT} />));
  expect(document.querySelector('.ph-current-value strong').textContent).toBe('Unavailable');
  expect(document.querySelector('[role=alert]').textContent).toContain('History unavailable');
  expect(document.body.textContent).not.toContain('NaN');
});


test('reference presentation keeps the full graph and truthful empty history without technical disclosure', async () => {
  api.get.mockResolvedValue({data:history({snapshots:[],forecast_snapshots:[],capture_method:'Browser-local atomic committed posture/scope changes; no historical interpolation',coverage:{notice:'hosted-history disclaimer'}})});
  await act(async () => root.render(<Harness choices={[programs[0]]} />));
  expect(dialog().querySelector('.ph-chart svg').getAttribute('viewBox')).toBe('0 0 900 296');
  expect(dialog().querySelector('.ph-current-value .ph-unit').textContent).toBe('%');
  expect(dialog().textContent).toContain('No saved positions in this period');
  expect(dialog().textContent).not.toContain('Browser-local atomic');
  expect(dialog().textContent).not.toContain('hosted-history disclaimer');
  expect(dialog().querySelector('.ph-foot')).toBeNull();
  expect(dialog().querySelector('.ph-inline-foot')).toBeNull();
  expect(dialog().querySelector('.ph-breakdown-track')).toBeTruthy();
});

test('inline reference has four native status destinations, paired panel and a 284px graph', async () => {
  const openStatus=jest.fn();
  await act(async () => root.render(<PortfolioHistoryDialog inline client={client} programs={[programs[0]]} selected={programIdentity(programs[0])} onNavigate={navigate} onStatusNavigate={openStatus} chartView="line" onChartViewChange={()=>{}} asOf={AT} />));
  const panel=container.querySelector('.brawndo-demo-program');
  expect(panel.querySelector('.ph-chart svg').getAttribute('viewBox')).toBe('0 0 900 284');
  expect(panel.querySelectorAll('.ph-breakdown-cells button')).toHaveLength(4);
  expect(panel.querySelector('.ph-status-axis,.ph-composition-canvas')).toBeNull();
  expect(panel.querySelector('.ph-history-panel > .ph-metrics')).toBeTruthy();
  await act(async () => panel.querySelectorAll('.ph-breakdown-cells button')[1].click());
  expect(openStatus).toHaveBeenCalledWith('in_progress');
  expect(panel.querySelector('.ph-inline-foot')).toBeNull();
});

test('keyboard history tooltip uses the same exact scope evidence as View data', async () => {
  const change={at:AT,after_snapshot_id:'position-0',membership_known:true,added_ids:['a','b'],removed_ids:[],before:{denominator:54,implemented:32},after:{denominator:56,implemented:32}};
  api.get.mockResolvedValue({data:history({scope_changes:[change]})});
  await act(async () => root.render(<Harness choices={[programs[0]]} />));
  expect(dialog().querySelector('.ph-history-tip')).toBeNull();
  const graph=dialog().querySelector('.ph-chart svg');
  await act(async () => graph.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));
  expect(dialog().querySelector('.ph-history-tip').textContent).toContain('2 safeguards added to scope. Applicable went from 54 to 56.');
  expect(dialog().querySelector('.ph-readout').classList.contains('sr-only')).toBe(true);
  expect(dialog().querySelector('.ph-history-tip').textContent).not.toContain('matches current committed state');
  await click('View data');
  expect(dialog().querySelector('#portfolio-history-data tbody tr').textContent).toContain('2 safeguards added to scope. Applicable went from 54 to 56.');
});


test('Portfolio sparse presentation counts retained saves once and keeps the complete chart and table', async () => {
  const point=snapshot(0,32);
  api.get.mockResolvedValue({data:history({snapshots:[point],forecast_snapshots:[point]})});
  await act(async () => root.render(<Harness choices={[programs[0]]} />));
  expect(dialog().querySelector('.ph-metrics-sparse').textContent).toContain('Available after more saved history');
  expect([...dialog().querySelectorAll('.ph-history-meter')].map(node=>node.textContent)).toEqual(['Saved positions · 1 retained','History span · 0 days']);
  expect([...dialog().querySelectorAll('.ph-composition-canvas text')].map(node=>node.textContent)).toEqual(['0%','100%']);
  expect(dialog().querySelector('.ph-chart svg')).toBeTruthy();
  await click('View data');expect(dialog().querySelectorAll('#portfolio-history-data tbody tr')).toHaveLength(1);
});

test('Portfolio not-started sparse state keeps actual retained observations and errors remain visible', async () => {
  const point=snapshot(0,0,{not_started:true});
  api.get.mockResolvedValue({data:history({current:point,snapshots:[point],forecast_snapshots:[]})});
  await act(async () => root.render(<Harness choices={[{...programs[0],current:point}]} />));
  expect(dialog().querySelector('.ph-metrics-sparse').textContent).toContain('Available after the assessment starts');
  expect(dialog().querySelector('.ph-history-meter').textContent).toContain('1 retained');
  api.get.mockRejectedValue(new Error('History unavailable'));await click('1 month');
  expect(dialog().querySelector('.ph-metrics-sparse')).toBeNull();
  expect(dialog().querySelector('[role="alert"]').textContent).toContain('History unavailable');
});


test('scope change without a period baseline never prints an unknown before-count', async () => {
  const change={at:AT,after_snapshot_id:'position-0',membership_known:true,added_ids:['a','b'],removed_ids:[],before:{denominator:54,implemented:32},after:{denominator:56,implemented:32}};
  api.get.mockResolvedValue({data:history({comparison:{baseline:null,scope_changed:true,comparable:false},scope_changes:[change]})});
  await act(async () => root.render(<Harness choices={[programs[0]]} />));
  const changeCard=dialog().querySelector('.ph-metrics > div:first-child');
  expect(changeCard.textContent).toContain('Scope changed.');
  expect(changeCard.textContent).not.toContain('→');
  expect(dialog().querySelector('.ph-scope-notes').textContent).toContain('2 safeguards added to scope. Applicable went from 54 to 56.');
});
