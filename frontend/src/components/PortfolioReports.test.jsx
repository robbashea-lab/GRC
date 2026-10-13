import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PortfolioReports from './PortfolioReports';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() }, formatError: error => error.message }));
const at = '2026-10-13T12:00:00Z';
const rows = [{ client_id: 'alpha', name: 'Alpha' }, { client_id: 'beta', name: 'Beta' }];
const snapshot = (captured_at = at, extra = {}) => ({ captured_at, snapshot_id: captured_at, counts: [{ key: 'addressed', label: 'Implemented', count: 5 }, { key: 'in_progress', label: 'Partially implemented', count: 2 }, { key: 'needs_attention', label: 'Needs attention', count: 1 }, { key: 'not_assessed', label: 'Not assessed', count: 2 }, { key: 'not_applicable', label: 'Not applicable', count: 2 }], implemented: 5, denominator: 10, total: 12, excluded: 2, percentage: 50, provenance: { kind: 'captured' }, ...extra });
const program = (client_id = 'alpha', program_key = 'cis-ig1', extra = {}) => ({ client_id, client_name: client_id === 'alpha' ? 'Alpha' : 'Beta', program_key, program_label: program_key === 'cis-ig1' ? 'CIS IG1' : 'SOC 2', current: snapshot(), comparison: { comparable: false, reason: 'Earlier history unavailable' }, ...extra });
const event = (event_id, extra = {}) => ({ event_id, client_id: 'alpha', client_name: 'Alpha', at, type: 'Policies', title: 'Policy status changed', description: 'Policy moved to published.', actor: { id: 'u', name: 'Recorded user' }, before: 'Draft', after: 'Published', source: { available: true, to: '/policies?record=p1' }, ...extra });
const overview = (extra = {}) => ({ as_of: at, total_clients: 2, frameworks: [{ key: 'cis-ig1', label: 'CIS IG1', client_count: 1, clients: [{ client_id: 'alpha', name: 'Alpha' }] }, { key: 'soc-2', label: 'SOC 2', client_count: 1, clients: [{ client_id: 'beta', name: 'Beta' }] }], programs: [program(), program('beta', 'soc-2')], recent_changes_count: 3, coverage: { started_at: at, last_captured_at: at, partial: true, notice: 'Capture started today; older activity coverage is partial.' }, ...extra });
let container, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; api.get.mockReset(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const click = async label => act(async () => { const button = [...document.querySelectorAll('button')].find(value => value.textContent.includes(label)); if (!button) throw new Error(`Missing button ${label}`); button.click(); });
const select = async (element, value) => act(async () => { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); });
function Harness({ initialPanel, cohort = rows, onFramework = jest.fn(), onSource = jest.fn() }) {
  const [panel, setPanel] = useState(initialPanel || null);
  return <PortfolioReports rows={cohort} includeArchived={false} panel={panel} setPanel={setPanel} onFramework={onFramework} onSource={onSource} />;
}

test('framework membership uses the complete filtered cohort and selecting an identity narrows the native register', async () => {
  const onFramework = jest.fn(); api.get.mockResolvedValue({ data: overview() });
  await act(async () => root.render(<Harness onFramework={onFramework} />));
  expect(api.get).toHaveBeenCalledWith('/portfolio/reporting/overview', expect.objectContaining({ params: { client_ids: 'alpha,beta', include_archived: false, range: '30d' } }));
  await click('Active frameworks');
  const panel = document.querySelector('[data-testid="portfolio-report-dialog"]');
  expect(panel.textContent).toContain('Alpha'); expect(panel.textContent).toContain('Beta');
  await click('CIS IG1'); expect(onFramework).toHaveBeenCalledWith('cis-ig1');
  expect(document.querySelector('[data-testid="portfolio-report-dialog"]')).toBeNull();
});

test('history preserves calendar range selection, actual baseline dates, and neutral equal-total scope changes', async () => {
  const baseline = snapshot('2026-04-12T08:00:00Z');
  api.get.mockImplementation(async path => ({ data: path.endsWith('/history') ? { current: snapshot(), snapshots: [baseline, snapshot()], comparison: { baseline, comparable: false, scope_changed: true, change_pp: 12, reason: 'A requirement was replaced with the same total.' }, scope_changes: [{ at: '2026-08-01T00:00:00Z', before: { total: 12, denominator: 10 }, after: { total: 12, denominator: 10 } }], coverage: { started_at: snapshot().captured_at }, as_of: at } : overview() }));
  await act(async () => root.render(<Harness />)); await click('Framework progress'); await click('6 months');
  await act(async () => document.querySelector('.pr-program-row').click());
  const panel = document.querySelector('[data-testid="portfolio-report-dialog"]');
  expect(api.get).toHaveBeenCalledWith('/portfolio/reporting/history', expect.objectContaining({ params: { client_id: 'alpha', program_key: 'cis-ig1', range: '6m', include_archived: false } }));
  expect(panel.querySelector('.pr-trend-metrics > div > span').textContent).toBe(new Date(baseline.captured_at).toLocaleString()); expect(panel.textContent).toContain('Scope changed'); expect(panel.textContent).toContain('not like-for-like');
  expect(panel.querySelector('.pr-delta.is-up')).toBeNull(); expect(panel.querySelector('.pr-delta.is-down')).toBeNull();
  expect(panel.querySelectorAll('.pr-chart-bar')).toHaveLength(2);
  await click('View data'); expect(panel.querySelector('table').textContent).toContain('Not applicable'); expect(panel.querySelector('table').textContent).toContain('Captured source position');
  await act(async () => { panel.querySelector('.pr-chart-bar').dispatchEvent(new Event('focusin', { bubbles: true })); });
  expect(panel.querySelector('.pr-snapshot-detail').textContent).toContain(new Date(baseline.captured_at).toLocaleString());
  await click('All client programs'); expect(panel.querySelector('button[aria-pressed="true"]').textContent).toBe('6 months');
});

test('a single captured position shows real availability without a fabricated baseline or trend', async () => {
  api.get.mockImplementation(async path => ({ data: path.endsWith('/history') ? { current: snapshot(), snapshots: [snapshot()], comparison: { comparable: false, baseline: null, reason: 'No captured baseline' }, coverage: { started_at: at, last_captured_at: at }, as_of: at } : overview() }));
  await act(async () => root.render(<Harness initialPanel={{ type: 'progress', client_id: 'alpha' }} />));
  const panel = document.querySelector('[data-testid="portfolio-report-dialog"]');
  expect(panel.textContent).toContain('Not enough history for a trend'); expect(panel.textContent).toContain('Earlier history unavailable'); expect(panel.textContent).toContain('No comparable baseline');
  expect(panel.querySelectorAll('.pr-chart-bar')).toHaveLength(1);
  await click('View data'); expect(panel.querySelectorAll('tbody tr')).toHaveLength(1);
});

test('activity keeps the count cutoff, deduplicates pages, filters client-level events and opens the authorized source route', async () => {
  const onSource = jest.fn();
  api.get.mockImplementation(async (path, { params }) => ({ data: path.endsWith('/activity') ? { as_of: at, events: params.cursor ? [event('e1'), event('e2', { type: 'Evidence', title: 'Evidence linked' })] : [event('e1')], total: 2, next_cursor: params.cursor ? null : 'second-page', coverage: { partial: true, notice: 'Only retained activity is available.' } } : overview() }));
  await act(async () => root.render(<Harness onSource={onSource} />)); await click('Recent changes');
  expect(api.get).toHaveBeenCalledWith('/portfolio/reporting/activity', expect.objectContaining({ params: expect.objectContaining({ client_ids: 'alpha,beta', days: 7, as_of: at }) }));
  await click('Load more changes'); expect(document.querySelectorAll('.pr-event-card')).toHaveLength(2);
  await click('Policy status changed'); expect(document.querySelector('.pr-record-grid').textContent).toContain('Client-level change'); expect(document.querySelector('.pr-record-change').textContent).toContain('Draft');
  await click('Back to recent changes'); expect(document.querySelectorAll('.pr-event-card')).toHaveLength(2);
  const controls = document.querySelectorAll('.pr-activity-tools select'); await select(controls[0], '30'); await select(controls[1], 'alpha'); await select(controls[2], 'Policies');
  expect(api.get).toHaveBeenLastCalledWith('/portfolio/reporting/activity', expect.objectContaining({ params: expect.objectContaining({ days: 30, client_id: 'alpha', type: 'Policies' }) }));
  expect(api.get.mock.calls.at(-1)[1].params).not.toHaveProperty('cursor');
  await click('Policy status changed'); await click('Open source record'); expect(onSource).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'e1', source: { available: true, to: '/policies?record=p1' } }));
});

test('empty cohort stays explicitly empty and reporting errors never render a zero event count', async () => {
  api.get.mockRejectedValue(new Error('Reporting offline'));
  await act(async () => root.render(<Harness cohort={[]} />));
  expect(api.get).toHaveBeenCalledWith('/portfolio/reporting/overview', expect.objectContaining({ params: expect.objectContaining({ client_ids: '' }) }));
  expect(container.querySelectorAll('.gp-metric-value')[0].textContent).toBe('0'); expect(container.querySelectorAll('.gp-metric-value')[2].textContent).toContain('unavailable');
  await click('Recent changes'); expect(document.querySelector('[data-testid="portfolio-activity-panel"]').textContent).toContain('Report unavailable');
});

test('changing the portfolio cohort clears old client details immediately and ignores delayed replies', async () => {
  let resolveOld; api.get.mockImplementation(async (path, { params }) => path.endsWith('/overview') && params.client_ids === 'alpha,beta' ? new Promise(resolve => { resolveOld = resolve; }) : { data: overview({ total_clients: 1, programs: [program('beta', 'soc-2')], frameworks: [{ key: 'soc-2', label: 'SOC 2', clients: [{ name: 'Beta' }], client_count: 1 }] }) });
  await act(async () => root.render(<Harness />));
  await act(async () => root.render(<Harness cohort={[rows[1]]} />));
  await act(async () => resolveOld({ data: overview() }));
  await click('Framework progress');
  const panel = document.querySelector('[data-testid="portfolio-report-dialog"]'); expect(panel.textContent).toContain('Beta'); expect(panel.textContent).not.toContain('Alpha');
});
