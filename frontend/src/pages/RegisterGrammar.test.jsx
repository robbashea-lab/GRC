import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import RecordListPage from './RecordListPage';
import RiskRegister from './RiskRegister';
import VendorRegister from './VendorRegister';
import api from '@/lib/api';

// Approved Risks use their client-context header and seven presets; other registers retain their grammar.
// All retain primary/secondary actions, search, accurate counts, and labelled table controls.
let mockParams;
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { user_id: 'admin', name: 'Admin', role: 'super_admin' } }) }));
jest.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentClientId: 'c', currentClient: { name: 'Test client' } }) }));
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() }, formatError: e => e.message, API: '/api', PREVIEW_MODE: true }));
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/', search: '?' + mockParams }), useNavigate: () => jest.fn(),
  useSearchParams: () => { const [value, set] = require('react').useState(mockParams); return [value, next => set(new URLSearchParams(next))]; },
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}), { virtual: true });
jest.mock('@/components/RecordDrawer', () => () => null);

const finding = (id, status, severity) => ({ finding_id: id, client_id: 'c', title: id, status, severity, due_date: '2030-01-01' });
const risk = (id, likelihood, impact, extra = {}) => ({ risk_id: id, client_id: 'c', title: id, status: 'identified', likelihood_score: likelihood, impact_score: impact, ...extra });
const vendor = (id, criticality, extra = {}) => ({ vendor_id: id, client_id: 'c', name: id, status: 'active', criticality, ...extra });
const DATA = {
  '/findings': [finding('critical-open', 'open', 'critical'), finding('high-open', 'in_progress', 'high'), finding('low-open', 'open', 'low'), finding('old-closed', 'closed', 'critical')],
  '/risks': [risk('risk-critical', 5, 5), risk('risk-high', 3, 4), risk('risk-low', 1, 2), risk('risk-closed', 5, 5, { status: 'closed' })],
  '/vendors': [vendor('vendor-critical', 'critical'), vendor('vendor-high', 'high'), vendor('vendor-low', 'low'), vendor('vendor-inactive', 'critical', { status: 'inactive' })],
};
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; mockParams = new URLSearchParams();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  api.get.mockImplementation(async path => ({ data: DATA[path] || [] }));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.clearAllMocks(); });
const render = element => act(async () => root.render(element));
const click = element => act(async () => element.click());
const bodyRows = () => [...container.querySelectorAll('tbody tr')].filter(tr => !tr.querySelector('td[colspan]'));

test.each([
  ['Findings', () => <RecordListPage kind="findings" />, 'New Finding', 'Search findings'],
  ['Risks', () => <RiskRegister />, 'New Risk', 'Search risks'],
  ['Vendors', () => <VendorRegister />, 'New Vendor', 'Search vendors'],
])('%s header, primary action, toolbar and table follow the register grammar', async (title, page, primary, search) => {
  await render(page());
  const approvedRisk=title==='Risks',approvedVendor=title==='Vendors',approvedHeader=approvedRisk||approvedVendor;
  const header = container.querySelector(approvedHeader?'.bpage-head':'.page-header');
  expect(header.querySelector('h1').textContent).toBe(title);
  if(approvedRisk){
    expect(header.querySelector('.bpage-eyebrow').textContent).toBe('Test client · Risk register');
    expect(header.querySelector('.bpage-subtitle')).toBeNull();
    expect(container.querySelector('[aria-label="Risk summaries"]')).toBeNull();
  }else if(approvedVendor){
    expect(header.querySelector('.bpage-eyebrow').textContent).toBe('Test client · Third parties');
    expect(container.querySelector('[aria-label="Vendor summaries"]')).toBeTruthy();
  }else{
    expect(header.querySelector('.page-eyebrow')).toBeNull();
    expect(header.textContent).not.toContain('Test client');
    expect(header.querySelector('.page-subtitle').textContent.length).toBeGreaterThan(10);
  }
  const actions = [...header.querySelectorAll(approvedHeader?'.bpage-actions > button':'.header-actions > button')];
  expect(actions.at(-1).textContent).toBe(approvedVendor?'+ New vendor':primary);
  expect(actions.at(-1).className).toContain(approvedVendor?'bpage-btn-primary':'bg-primary');
  if(approvedRisk){
    expect(actions.some(button=>button.textContent==='Risk Scale & Matrix')).toBe(true);
    expect(actions.filter(button=>['Risk Scale & Matrix','Export CSV'].includes(button.textContent)).every(button=>button.classList.contains('bpage-btn'))).toBe(true);
  }else expect(actions.slice(0,-1).every(button=>button.className.includes(approvedVendor?'bpage-btn':'border'))).toBe(true);
  expect(actions.some(button => button.textContent === 'Export CSV')).toBe(true);
  // Search is the first control in the toolbar; the shown / total count closes it.
  const toolbar = container.querySelector('.register-toolbar');
  expect(toolbar.querySelector('input').getAttribute('aria-label').toLowerCase()).toBe(search.toLowerCase());
  expect(toolbar.firstElementChild.classList.contains('register-search')).toBe(true);
  if(approvedRisk) expect(container.querySelector('[data-testid="risk-count"]').textContent).toBe('Showing 3 of 4 risks');
  else if(approvedVendor)expect(container.querySelector('[data-testid="vendor-foot"]').textContent).toBe('Showing 3 of 3 active vendors');
  else expect(toolbar.querySelector('.register-count').textContent).toMatch(/^\d+ \/ \d+$/);
  // Column headers are real column headers with a named sort-and-filter control.
  const heads = [...container.querySelectorAll('thead th')];
  expect(heads.length).toBeGreaterThan(4);
  expect(heads.every(th => th.getAttribute('scope') === 'col' || th.querySelector('[role="checkbox"]'))).toBe(true);
  expect(container.querySelectorAll('thead button[aria-label$=": sort and filter"]').length).toBeGreaterThan(3);
});

test('a summary count filters the register and a second press clears it', async () => {
  await render(<RecordListPage kind="findings" />);
  expect(bodyRows()).toHaveLength(3);
  const material = [...container.querySelectorAll('.register-signal')].find(button => button.textContent.includes('High / critical open'));
  expect(material.textContent).toBe('2High / critical open');
  await click(material);
  expect(material.getAttribute('aria-pressed')).toBe('true');
  expect(bodyRows().map(tr => tr.textContent).join(' ')).not.toContain('low-open');
  expect(bodyRows()).toHaveLength(2);
  await click(material);
  expect(material.getAttribute('aria-pressed')).toBe('false');
  expect(bodyRows()).toHaveLength(3);
});

test('zero counts stay quiet and cannot be pressed', async () => {
  await render(<RecordListPage kind="findings" />);
  const validate = [...container.querySelectorAll('.register-signal')].find(button => button.textContent.includes('Awaiting validation'));
  expect(validate.textContent).toBe('0Awaiting validation');
  expect(validate.className).toContain('is-clear');
  expect(validate.disabled).toBe(true);
});

test.each([
  ['risks critical', () => <RiskRegister />, 'risk-view-', 'critical', ['risk-critical']],
  ['risks high', () => <RiskRegister />, 'risk-view-', 'high', ['risk-high']],
  ['vendors', () => <VendorRegister />, 'vendor-view-', 'critical_high', ['vendor-critical', 'vendor-high']],
])('%s view tabs carry the counts and each count equals the rows its view shows', async (_, page, prefix, view, expected) => {
  await render(page());
  const tab = id => container.querySelector(`[data-testid="${prefix}${id}"]`);
  expect(tab('all_active').getAttribute('aria-pressed')).toBe('true');
  expect(tab('all_active').textContent).toMatch(/3$/);
  expect(bodyRows()).toHaveLength(3);
  expect(tab(view).textContent.endsWith(String(expected.length))).toBe(true);
  await click(tab(view));
  expect(tab(view).getAttribute('aria-pressed')).toBe('true');
  expect(bodyRows().map(tr => tr.textContent).filter(text => expected.some(name => text.includes(name)))).toHaveLength(expected.length);
  expect(bodyRows()).toHaveLength(expected.length);
});

test('a filter that excludes every row offers a reset instead of an empty table', async () => {
  await render(<RecordListPage kind="findings" />);
  const input = container.querySelector('.register-toolbar input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'no such finding');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(bodyRows()).toHaveLength(0);
  const empty = container.querySelector('td.empty-state');
  expect(empty).not.toBeNull();
  const reset = [...empty.querySelectorAll('button')].find(button => /clear/i.test(button.textContent));
  expect(reset).toBeTruthy();
  await click(reset);
  expect(bodyRows()).toHaveLength(3);
});
