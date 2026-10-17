import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import ClientDirectory from './ClientDirectory';
import api from '@/lib/api';
import {PORTFOLIO_CHANGED} from '@/lib/usePortfolioRefresh';

const mockNavigate = jest.fn(), mockSwitch = jest.fn();
let mockUser, mockPreviewMode;
jest.mock('react-router-dom', () => ({useNavigate: () => mockNavigate}), {virtual: true});
jest.mock('@/context/OrgContext', () => ({useOrg: () => ({switchClient: mockSwitch})}));
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: mockUser})}));
jest.mock('@/lib/api', () => ({__esModule: true, get PREVIEW_MODE(){return mockPreviewMode;}, default: {get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn()}, formatError: error => error.message}));
const AT = '2026-10-13T12:00:00Z';
const position = (implemented = 2, extra = {}) => ({availability: 'available', denominator: 10, implemented, assessed: implemented,
  counts: [{key: 'addressed', label: 'Implemented', count: implemented}, {key: 'in_progress', label: 'Partially Implemented', count: 0}, {key: 'needs_attention', label: 'Needs Attention', count: 0}, {key: 'not_assessed', label: 'Not Assessed', count: 10 - implemented}], captured_at: AT, retrieved_at: AT, scope_signature: 'scope', source_revision: 'current', ...extra});
const program = (client_id, program_key, implemented = 2, extra = {}) => ({client_id, program_id: client_id + ':' + program_key, program_key, framework_key: program_key.startsWith('cis') ? 'cis-ig1' : program_key,
  program_label: program_key === 'soc-2' ? 'SOC 2' : 'CIS IG3', to: program_key === 'soc-2' ? '/compliance/soc-2' : '/compliance/cis-ig1', current: position(implemented), snapshots_90d: [], comparison_90d: {comparable: false}, ...extra});
const client = (id, extra = {}) => ({client_id: id, name: id, industry: 'Technology', status: 'active', assigned_owner_id: 'u', grc_lead: {name: 'Recorded Lead'}, ...extra});
const overview = (extra = {}) => ({as_of: AT, clients: [client('Alpha'), client('Beta', {assigned_owner_id: 'other', grc_lead: {name: 'Recorded Lead'}})], programs: [program('Alpha', 'cis-ig3', 9), program('Alpha', 'soc-2', 1), program('Beta', 'cis-ig3', 2)], ...extra});
let root, container;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; sessionStorage.clear(); window.scrollTo = jest.fn(); mockPreviewMode=false; mockUser = {user_id: 'u', role: 'super_admin'}; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); jest.clearAllMocks(); api.get.mockResolvedValue({data: overview()}); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const click = label => act(async () => { const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label); expect(button).toBeTruthy(); button.click(); });
const select = (label, value) => act(async () => { const node = container.querySelector(`select[aria-label="${label}"]`); node.value = value; node.dispatchEvent(new Event('change', {bubbles: true})); });
const search = value => act(async () => { const node = container.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', {bubbles: true})); });

test.each([[true,'demo',false],[false,'demo',true],[true,'standard',true],[false,'standard',true]])('approved history controls require native Demo agreement: preview=%s actor=%s', async (preview,mode,hasNativeOptions) => {
  mockPreviewMode=preview;mockUser={...mockUser,workspace_mode:mode};
  const selectedProgram=program('Alpha','cis-ig3');
  api.get.mockImplementation(async path=>({data:path.endsWith('/overview')?overview({clients:[client('Alpha')],programs:[selectedProgram]}):{client_id:'Alpha',program_key:'cis-ig3',as_of:AT,current:selectedProgram.current,snapshots:[selectedProgram.current],forecast_snapshots:[],scope_changes:[],forecast_scope_changes:[]}}));
  await act(async()=>root.render(<ClientDirectory/>));
  await act(async()=>container.querySelector('.gp-progress').click());
  const modal=document.querySelector('[data-testid="portfolio-history-dialog"]');
  expect(modal).toBeTruthy();
  expect(!!modal.querySelector('.ph-chart-options')).toBe(hasNativeOptions);
  expect(modal.querySelectorAll('.ph-marker')).toHaveLength(1);
  expect(modal.querySelector('.ph-current-value').textContent).toContain('2 of 10');
  for(const method of ['post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('approved five-column grouped register uses batched current data and exact native client routes', async () => {
  await act(async () => root.render(<ClientDirectory />));
  expect([...container.querySelectorAll('thead th')].map(node => node.firstChild.textContent.trim())).toEqual(['Client', 'GRC Lead', 'Framework', 'Implementation progress', 'Last activity']);
  expect(container.querySelector('.gp-countbar').textContent).toContain('2 clients · 3 programs');
  const alpha = container.querySelector('[data-client-id="Alpha"]');
  expect(alpha.querySelector('td').rowSpan).toBe(2);
  expect(container.querySelectorAll('[data-client-id="Alpha"]')).toHaveLength(2);
  expect(container.querySelector('.gp-metric')).toBeNull();
  expect(alpha.querySelector('.gp-percent').textContent).toBe('90.0%');
  expect(alpha.querySelector('.gp-unit').textContent).toBe('%');
  expect(container.querySelector('.gp-framework-scope')).toBeNull();
  expect(container.querySelector('.gp-footnote')).toBeNull();
  expect(container.textContent).not.toContain('Open Work'); expect(container.textContent).not.toContain('Recent changes');
  expect(api.get).toHaveBeenCalledTimes(1);
  await click('Alpha'); expect(mockSwitch).toHaveBeenCalledWith('Alpha'); expect(mockNavigate).toHaveBeenCalledWith('/dashboard?client_id=Alpha');
  await act(async () => container.querySelector('[aria-label="Open SOC 2 for Alpha"]').click());
  expect(mockNavigate).toHaveBeenLastCalledWith('/compliance/soc-2?client_id=Alpha');
  for (const method of ['post', 'put', 'patch', 'delete']) expect(api[method]).not.toHaveBeenCalled();
});

test('trimmed framework search matches clients but selected framework controls rows; clear retains Mine and sort', async () => {
  await act(async () => root.render(<ClientDirectory />));
  await select('Sort clients', 'progress'); await click('Assigned to Me'); await select('Framework', 'cis-ig3'); await search('  sOc 2  ');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1); expect(container.querySelector('[data-client-id="Alpha"]')).toBeTruthy();
  expect(container.querySelector('[aria-label="Open SOC 2 for Alpha"]')).toBeNull();
  expect(container.querySelector('.gp-countbar').textContent).toContain('1 client · 1 program');
  await search('Nothing matches'); await click('Clear search and filter');
  expect(container.querySelector('input').value).toBe(''); expect(container.querySelector('select[aria-label="Framework"]').value).toBe('all');
  expect(container.querySelector('select[aria-label="Sort clients"]').value).toBe('progress');
  expect([...container.querySelectorAll('button')].find(node => node.textContent === 'Assigned to Me').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('[data-client-id="Beta"]')).toBeNull();
  await click('All Clients'); await search('  RECORDED lead  '); expect(container.querySelector('.gp-countbar').textContent).toContain('2 clients · 3 programs');
});

test('minimum visible program sorts preserve grouping, missing data last, and most recent activity first', async () => {
  api.get.mockResolvedValue({data: overview({clients: [client('Alpha', {last_activity: {at: '2026-10-12T12:00:00Z', label: 'Review completed'}}), client('Beta'), client('Zeta')], programs: [program('Alpha', 'cis-ig3', 9), program('Alpha', 'soc-2', 1), program('Beta', 'cis-ig3', 2), program('Zeta', 'cis-ig3', 0, {current: position(0, {availability: 'unavailable'})})]})});
  await act(async () => root.render(<ClientDirectory />)); await select('Sort clients', 'progress');
  expect([...container.querySelectorAll('.gp-first-row')].map(node => node.dataset.clientId)).toEqual(['Alpha', 'Beta', 'Zeta']);
  await select('Framework', 'cis-ig3'); expect([...container.querySelectorAll('.gp-first-row')].map(node => node.dataset.clientId)).toEqual(['Beta', 'Alpha', 'Zeta']);
  await select('Sort clients', 'activity-desc'); expect([...container.querySelectorAll('.gp-first-row')].map(node => node.dataset.clientId)).toEqual(['Alpha', 'Beta', 'Zeta']);
  expect(container.textContent).toContain('Never active');
});

test('errors remain retryable and distinct from inaccessible clients or a client with no programs', async () => {
  api.get.mockRejectedValue(new Error('Reporting unavailable'));
  await act(async () => root.render(<ClientDirectory />)); expect(container.querySelector('[role="alert"]').textContent).toContain('Reporting unavailable');
  expect(container.querySelector('.gp-countbar').textContent).toContain('Portfolio unavailable'); expect(container.textContent).not.toContain('0 clients');
  api.get.mockResolvedValue({data: overview({clients: [], programs: []})}); await click('Retry'); expect(container.textContent).toContain('No clients are currently available to you.');
  api.get.mockResolvedValue({data: overview({clients: [client('Empty')], programs: []})});
  await act(async () => { window.dispatchEvent(new Event('focus')); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(container.textContent).toContain('1 client · 0 programs'); expect(container.textContent).toContain('No enabled programs'); expect(container.querySelector('.gp-progress')).toBeNull();
});

test('role/grant changes discard old client and history replies before rendering the new authorized scope', async () => {
  mockUser = {user_id: 'admin', role: 'platform_admin', all_clients: true, client_ids: ['Alpha']};
  let resolveOld;
  api.get.mockImplementation(() => mockUser.all_clients ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({data: overview({clients: [client('Alpha')], programs: [program('Alpha', 'cis-ig3')]})}));
  await act(async () => root.render(<ClientDirectory />)); mockUser.all_clients = false;
  await act(async () => root.render(<ClientDirectory />));
  await act(async () => resolveOld({data: overview()}));
  expect(container.querySelector('[data-client-id="Beta"]')).toBeNull(); expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(container.textContent).not.toContain('Beta');
});

test('successful-write notification discovers a newly enabled program without changing another client', async () => {
  await act(async () => root.render(<ClientDirectory />));
  api.get.mockResolvedValue({data: overview({programs: [...overview().programs, program('Beta', 'iso-27001', 0, {program_label: 'ISO 27001', to: '/compliance/iso-27001', current: position(0, {not_started: true})})]})});
  await act(async () => { window.dispatchEvent(new Event(PORTFOLIO_CHANGED)); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(container.querySelector('.gp-countbar').textContent).toContain('2 clients · 4 programs');
  expect(container.querySelector('option[value="iso-27001"]')).toBeTruthy();
  expect(container.querySelector('[aria-label="Open ISO 27001 for Beta"]')).toBeTruthy();
  expect(container.querySelectorAll('[data-client-id="Alpha"]')).toHaveLength(2);
});

test('a removed selected framework resets to All after a valid refresh, preserving search, Mine and sort', async () => {
  await act(async () => root.render(<ClientDirectory />));
  await click('Assigned to Me'); await select('Sort clients', 'progress'); await search('Alpha'); await select('Framework', 'soc-2');
  expect(container.querySelector('.gp-countbar').textContent).toContain('1 client · 1 program');
  api.get.mockRejectedValueOnce(new Error('Enrollment refresh unavailable'));
  await act(async () => { window.dispatchEvent(new Event(PORTFOLIO_CHANGED)); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(container.querySelector('select[aria-label="Framework"]').value).toBe('soc-2');
  api.get.mockResolvedValue({data: overview({programs: overview().programs.filter(value => value.program_key !== 'soc-2')})});
  await act(async () => { window.dispatchEvent(new Event(PORTFOLIO_CHANGED)); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(container.querySelector('option[value="soc-2"]')).toBeNull();
  expect(container.querySelector('select[aria-label="Framework"]').value).toBe('all');
  expect(container.querySelector('.gp-countbar').textContent).toContain('1 client · 1 program');
  expect(container.querySelector('[aria-label="Open CIS IG3 for Alpha"]')).toBeTruthy();
  expect(container.querySelector('[data-client-id="Beta"]')).toBeNull();
  expect(container.querySelector('input').value).toBe('Alpha');
  expect(container.querySelector('select[aria-label="Sort clients"]').value).toBe('progress');
  expect([...container.querySelectorAll('button')].find(node => node.textContent === 'Assigned to Me').getAttribute('aria-pressed')).toBe('true');
});

test('disabling the selected program closes history and re-enabling cannot reopen stale selection', async () => {
  let current = overview();
  api.get.mockImplementation(async path => ({data: path.endsWith('/history') ? {client_id: 'Alpha', program_key: 'cis-ig3', as_of: AT, current: program('Alpha', 'cis-ig3', 9).current, snapshots: [], forecast_snapshots: []} : current}));
  await act(async () => root.render(<ClientDirectory />));
  await act(async () => container.querySelector('.gp-progress').click());
  expect(document.querySelector('[data-testid="portfolio-history-dialog"]')).toBeTruthy();
  current = overview({programs: overview().programs.filter(value => !(value.client_id === 'Alpha' && value.program_key === 'cis-ig3'))});
  await act(async () => { window.dispatchEvent(new Event(PORTFOLIO_CHANGED)); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(document.querySelector('[data-testid="portfolio-history-dialog"]')).toBeNull();
  current = overview();
  await act(async () => { window.dispatchEvent(new Event(PORTFOLIO_CHANGED)); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(container.querySelector('[aria-label="Open CIS IG3 for Alpha"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="portfolio-history-dialog"]')).toBeNull();
});
