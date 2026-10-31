import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, useLocation, useNavigate} from 'react-router-dom';
import FrameworkWorkspace from './FrameworkWorkspace';
import {frameworkCatalog} from '@/lib/frameworks';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import {captureDemoReporting, demoCurrentPositions} from '@/preview/portfolioReporting';
import api from '@/lib/api';

let mockUser, mockOrg, mockDrawerProps;
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: mockUser,
  workspaceMode: mockUser.workspace_mode === 'demo' ? 'demo' : 'standard'})}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/api', () => ({__esModule: true,
  default: {get: jest.fn(), patch: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn()},
  formatError: error => error.message}));
jest.mock('@/components/GuidedAssessor', () => () => null);
jest.mock('@/components/SocGuidedAssessor', () => () => null);
jest.mock('@/components/FrameworkDrawer', () => function MockDrawer(props) {
  const React = require('react');
  const lastCloseRequest = React.useRef(props.closeRequest);
  mockDrawerProps = props;
  // This boundary represents a clean editor. Native dirty/save/CAS guards have their own suite.
  React.useEffect(() => {
    if (lastCloseRequest.current !== props.closeRequest) {
      lastCloseRequest.current = props.closeRequest;
      props.onOpenChange(false);
    }
  }, [props.closeRequest, props.onOpenChange]);
  return <section data-testid="soc-editor-boundary" data-assessment={props.record.framework_assessment_id}
    data-definition={props.record.definition_id} data-client={props.record.client_id} data-position={props.position}>
    <button disabled={!props.onPrevious} onClick={props.onPrevious}>Previous criterion</button>
    <button disabled={!props.onNext} onClick={props.onNext}>Next criterion</button>
    <button onClick={() => props.onOpenChange(false)}>Close criterion</button>
    <button onClick={props.onSaved}>Refresh native source</button>
    {props.breadcrumb?.filter(crumb => crumb.onClick).map((crumb, index) =>
      <button key={index} data-drawer-crumb onClick={crumb.onClick}>{crumb.label}</button>)}
  </section>;
});

const ROOT = '/compliance/soc-2';
const CORE_SCOPE = ['security', 'availability', 'confidentiality'];
const ALL_SCOPE = [...CORE_SCOPE, 'processing_integrity', 'privacy'];
const CATEGORY_LABELS = {security: 'Security — Common Criteria', availability: 'Availability',
  confidentiality: 'Confidentiality', processing_integrity: 'Processing Integrity', privacy: 'Privacy'};
let root, container, routerKey;

function RouteProbe() {
  const location = useLocation(), navigate = useNavigate();
  return <aside aria-label="Router test controls">
    <output aria-label="Current workspace URL">{location.pathname + location.search}</output>
    <button onClick={() => navigate(-1)}>History Back</button>
    <button onClick={() => navigate(1)}>History Forward</button>
  </aside>;
}

function fixture(clientId = 'qa-soc', categories = CORE_SCOPE) {
  const result = frameworkDashboardFixture('soc-2', categories, clientId);
  result.source.assessments.forEach(row => { row.status = 'not_assessed'; });
  result.source.work = {};
  result.refresh();
  return result;
}

function unequalFixture(clientId = 'qa-weighted-soc') {
  const result = fixture(clientId);
  for (const row of result.source.assessments) {
    if (row.definition_id === 'CC1.1' || !row.definition_id.startsWith('CC')) row.status = 'addressed';
    if (row.definition_id === 'CC1.2') {
      row.status = 'not_applicable';
      row.na_rationale = 'Synthetic documented scope decision for this criterion.';
    }
  }
  result.refresh();
  return result;
}

function addOtherPrograms(result) {
  const others = ['cis-ig1', 'iso-27001'].map(key => frameworkDashboardFixture(key, [], result.client.client_id));
  result.db.requirements.push(...others.flatMap(other => other.db.requirements));
  // Keep the SOC endpoint response separate from the client's other native program records.
  result.db.framework_assessments = [...result.source.assessments, ...others.flatMap(other => other.source.assessments)];
  captureDemoReporting(result.db, null, '2026-10-26T12:00:00Z');
  result.source.implementation_position = demoCurrentPositions(result.db, [result.client], '2026-10-26T12:00:00Z')
    .find(program => program.program_id === result.client.client_id + ':soc-2').current;
}

function serve(...fixtures) {
  const sources = new Map(fixtures.map(result => [result.client.client_id, result.source]));
  api.get.mockImplementation(async (path, options) => {
    if (path === '/frameworks/soc-2') return {data: sources.get(options.params.client_id)};
    return {data: []};
  });
}

async function mount(clientId, url = ROOT, reload = false) {
  if (reload) routerKey += 1;
  await act(async () => root.render(<MemoryRouter key={routerKey} initialEntries={[url]}>
    <RouteProbe/><FrameworkWorkspace frameworkKey="soc-2" clientId={clientId}/>
  </MemoryRouter>));
}

const workspace = () => container.querySelector('[data-testid="prestige-soc-workspace"]');
const heading = () => container.querySelector('.soc-program-heading h1').textContent;
const editor = () => container.querySelector('[data-testid="soc-editor-boundary"]');
const summary = () => container.querySelector('[aria-labelledby="bcis-summary-heading"]');
const currentUrl = () => container.querySelector('[aria-label="Current workspace URL"]').textContent;
const params = () => new URL(currentUrl(), 'https://local.invalid').searchParams;
const rows = () => [...container.querySelectorAll('.soc-criteria-register [data-testid^="requirement-"]')]
  .filter(row => !row.closest('section[aria-label="Retained out-of-scope criteria"]'));
const button = label => [...container.querySelectorAll('button')].find(element => element.textContent === label);
const click = element => act(async () => { expect(element).toBeTruthy(); element.click(); });
const openCategory = id => click(container.querySelector(`[data-testid="soc-category-${id}"]`));
const backToOverview = () => click(container.querySelector('.soc-program-back'));
async function search(value) {
  await act(async () => {
    const input = container.querySelector('[aria-label="Search criteria"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockUser = {user_id: 'qa-operator', role: 'super_admin', workspace_mode: 'demo'};
  mockOrg = {clients: [], loading: false, error: ''};
  mockDrawerProps = null; routerKey = 0;
  sessionStorage.clear(); localStorage.clear();
  Object.values(api).forEach(method => method.mockReset());
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  for (const method of ['patch', 'put', 'post', 'delete']) expect(api[method]).not.toHaveBeenCalled();
});

test.each([
  ['demo_prestige', 'demo', CORE_SCOPE, 38, false],
  ['new-demo-soc', 'demo', ['security'], 33, false],
  ['later-enrolled-demo-soc', 'demo', ['security', 'processing_integrity'], 38, false],
  ['mixed-demo-soc', 'demo', ALL_SCOPE, 61, true],
  ['existing-auth-soc', 'standard', CORE_SCOPE, 38, false],
  ['new-auth-soc', 'standard', ['security'], 33, false],
  ['later-enrolled-auth-soc', 'standard', ['security', 'privacy'], 51, false],
  ['mixed-auth-soc', 'standard', ALL_SCOPE, 61, true],
])('%s in %s derives category navigation from its native enrollment', async (clientId, mode, categories, count, mixed) => {
  const result = fixture(clientId, categories);
  if (mixed) addOtherPrograms(result);
  const before = JSON.stringify(result.db);
  mockUser.workspace_mode = mode; mockOrg.clients = [result.client]; serve(result);
  await mount(clientId);
  expect(heading()).toBe('SOC 2');
  expect(workspace().querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(categories.length);
  expect(container.querySelector('.soc-register-result-count').textContent)
    .toBe(`${count} criteria across ${categories.length} Trust Services Categories`);
  expect(summary().textContent).toContain(`0 of ${count} applicable criteria addressed`);
  expect(container.querySelector('[data-testid="soc-readiness-percentage"]').textContent).toBe('0.0%');
  for (const category of Object.keys(CATEGORY_LABELS)) {
    expect(!!container.querySelector(`[data-testid="soc-category-${category}"]`)).toBe(categories.includes(category));
  }
  const category = categories[categories.length - 1];
  await openCategory(category);
  expect(params().get('soc_category')).toBe(category); expect(heading()).toBe(CATEGORY_LABELS[category]);
  const categoryDefinitions = result.source.definitions.filter(definition => definition.category === category);
  expect(container.querySelectorAll('[data-testid^="soc-group-"]'))
    .toHaveLength(new Set(categoryDefinitions.map(definition => definition.control)).size);
  expect(summary().textContent).toContain(`0 of ${categoryDefinitions.length} applicable criteria addressed`);
  expect(api.get.mock.calls.filter(([path]) => path.startsWith('/frameworks/')).every(([path]) => path === '/frameworks/soc-2')).toBe(true);
  expect(JSON.stringify(result.db)).toBe(before);
});

test('category URLs, native group expansion and criterion history round-trip through the real router and reload', async () => {
  const result = fixture(), before = JSON.stringify(result.source); serve(result); await mount(result.client.client_id);
  await openCategory('security'); expect(params().get('soc_category')).toBe('security');
  const group = container.querySelector('[data-testid="soc-group-CC1"]');
  expect(group.getAttribute('aria-expanded')).toBe('false'); expect(rows()).toHaveLength(0);
  await click(group);
  expect(group.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(group.getAttribute('aria-controls')).querySelectorAll('tbody tr')).toHaveLength(5);
  expect(params().has('assessment')).toBe(false);
  await click(container.querySelector('[data-testid="requirement-CC1.1"]'));
  expect(editor().dataset.definition).toBe('CC1.1');
  await click(button('Next criterion')); expect(editor().dataset.definition).toBe('CC1.2');
  expect(params().get('assessment')).toBe(result.client.client_id + ':CC1.2');
  await click(button('Close criterion'));
  expect(editor()).toBeNull(); expect(params().get('soc_category')).toBe('security'); expect(params().has('assessment')).toBe(false);
  await click(button('History Back')); expect(heading()).toBe('SOC 2'); expect(params().has('soc_category')).toBe(false);
  await click(button('History Forward')); expect(heading()).toBe(CATEGORY_LABELS.security);
  await click(button('History Forward')); expect(editor().dataset.definition).toBe('CC1.2');
  await click(button('History Back')); expect(editor()).toBeNull(); expect(heading()).toBe(CATEGORY_LABELS.security);
  const savedUrl = currentUrl(); await mount(result.client.client_id, savedUrl, true);
  expect(currentUrl()).toBe(savedUrl); expect(heading()).toBe(CATEGORY_LABELS.security);
  expect(container.querySelectorAll('[data-testid^="soc-group-"]')).toHaveLength(9);
  await backToOverview(); expect(heading()).toBe('SOC 2'); expect(params().has('soc_category')).toBe(false);
  expect(JSON.stringify(result.source)).toBe(before);
});

test.each([
  ['CC1.1', 'security', 'privacy'], ['A1.1', 'availability', 'security'],
  ['C1.1', 'confidentiality', 'availability'], ['PI1.1', 'processing_integrity', 'security'],
  ['P1.1', 'privacy', 'security'],
])('direct criterion %s uses its native %s category over a stale %s URL hint', async (id, category, staleCategory) => {
  const result = fixture('qa-direct-soc', ALL_SCOPE), native = result.source.assessments.find(row => row.definition_id === id);
  Object.assign(native, {implementation: 'Retained manual wording\nSecond paragraph.', technology: 'Existing process',
    owner_id: 'native-owner', verification: 'needs_validation', updated_at: '2026-10-20T12:00:00Z'});
  result.refresh(); const before = JSON.stringify(result.source); serve(result);
  const query = new URLSearchParams({soc_category: staleCategory, assessment: native.framework_assessment_id});
  await mount(result.client.client_id, ROOT + '?' + query);
  expect(heading()).toBe(CATEGORY_LABELS[category]); expect(editor().dataset.assessment).toBe(native.framework_assessment_id);
  expect(mockDrawerProps.record).toMatchObject(native); expect(mockDrawerProps.clientId).toBe(result.client.client_id);
  expect(rows().every(row => result.source.definitions.find(definition => definition.id === row.dataset.testid.slice('requirement-'.length)).category === category)).toBe(true);
  const savedUrl = currentUrl(); await mount(result.client.client_id, savedUrl, true);
  expect(heading()).toBe(CATEGORY_LABELS[category]); expect(editor().dataset.assessment).toBe(native.framework_assessment_id);
  await click(button('Close criterion'));
  expect(editor()).toBeNull(); expect(params().has('assessment')).toBe(false); expect(params().get('soc_category')).toBe(staleCategory);
  await backToOverview(); expect(heading()).toBe('SOC 2');
  expect(JSON.stringify(result.source)).toBe(before);
});

test('overview and category counts exclude justified N/A and use criterion totals rather than average group percentages', async () => {
  const result = unequalFixture(); serve(result); await mount(result.client.client_id);
  expect(summary().textContent).toContain('6 of 37 applicable criteria addressed');
  expect(summary().textContent).toContain('Assessed 6 of 37');
  expect(container.querySelector('[data-testid="soc-readiness-percentage"]').textContent).toBe('16.2%');
  expect(container.querySelector('[data-testid="soc-category-security"]').getAttribute('aria-label'))
    .toContain('Addressed (Readiness): 1 of 32, 3.1%. Assessed: 1 of 32.');
  expect(container.querySelector('[data-testid="soc-category-availability"]').getAttribute('aria-label'))
    .toContain('Addressed (Readiness): 3 of 3, 100.0%.');
  await openCategory('security');
  expect(container.querySelector('.soc-program-heading p').textContent).toContain('33 criteria in this category');
  expect(summary().textContent).toContain('1 of 32 applicable criteria addressed');
  expect(summary().textContent).toContain('31 still to assess');
  expect(container.querySelector('[data-testid="soc-readiness-percentage"]').textContent).toBe('3.1%');
  expect(container.querySelector('[data-testid="soc-group-CC1"]').getAttribute('aria-label'))
    .toContain('Addressed (Readiness): 1 of 4, 25.0%. Assessed: 1 of 4.');
  await click(container.querySelector('.bcis-legend-na'));
  expect(rows().map(row => row.dataset.testid)).toEqual(['requirement-CC1.2']);
  expect(summary().textContent).toContain('1 of 32 applicable criteria addressed');
  expect(container.querySelector('.bcis-legend-na').textContent).toContain('1');
});

test('category filters confine hits while keeping the full category summary and native group totals', async () => {
  const result = unequalFixture(); serve(result);
  await mount(result.client.client_id, ROOT + '?soc_category=security&view=not_assessed');
  expect(heading()).toBe(CATEGORY_LABELS.security); expect(rows()).toHaveLength(31);
  expect(rows().every(row => row.dataset.testid.startsWith('requirement-CC'))).toBe(true);
  expect(container.querySelector('.soc-register-result-count').textContent).toBe('31 matching criteria');
  const group = container.querySelector('[data-testid="soc-group-CC1"]');
  expect(group.disabled).toBe(true); expect(group.textContent).toContain('5 criteria');
  expect(container.querySelector('[data-testid="requirement-CC1.1"]')).toBeNull();
  expect(summary().textContent).toContain('1 of 32 applicable criteria addressed');
  await search('A1.');
  expect(rows()).toHaveLength(0); expect(container.querySelector('.soc-register-result-count').textContent).toBe('0 matching criteria');
  expect(summary().textContent).toContain('1 of 32 applicable criteria addressed');
  await click(button('Clear filter'));
  expect(params().has('view')).toBe(false); expect(params().get('soc_category')).toBe('security');
  expect(container.querySelectorAll('[data-testid^="soc-group-"]')).toHaveLength(9);
  expect(container.querySelector('[aria-label="Search criteria"]').value).toBe('');
});

test('a root dashboard filter remains a flat result view and returns there after closing a criterion', async () => {
  const result = unequalFixture(); serve(result); await mount(result.client.client_id, ROOT + '?view=not_assessed');
  expect(heading()).toBe('SOC 2'); expect(rows()).toHaveLength(31);
  expect(container.querySelectorAll('[data-testid^="soc-group-"]')).toHaveLength(0);
  expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(0);
  expect(summary().textContent).toContain('6 of 37 applicable criteria addressed');
  await click(rows()[0]); expect(heading()).toBe(CATEGORY_LABELS.security);
  await click(button('Close criterion'));
  expect(heading()).toBe('SOC 2'); expect(params().get('view')).toBe('not_assessed'); expect(rows()).toHaveLength(31);
  await click(button('Clear filter'));
  expect(params().has('view')).toBe(false); expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(3);
});

test('Continue stays in its category while Previous and Next retain full native program order', async () => {
  const result = fixture('qa-order-soc'); serve(result);
  sessionStorage.setItem('framework-workspace:qa-operator:qa-order-soc:soc-2', JSON.stringify({lastId: 'qa-order-soc:C1.2'}));
  await mount(result.client.client_id, ROOT + '?soc_category=availability');
  await click(button('Continue with A1.1'));
  const index = result.source.definitions.findIndex(definition => definition.id === 'A1.1');
  expect(editor().dataset.definition).toBe('A1.1'); expect(editor().dataset.position).toBe(`${index + 1} of 38 in framework order`);
  await click(button('Previous criterion'));
  expect(editor().dataset.definition).toBe(result.source.definitions[index - 1].id); expect(heading()).toBe(CATEGORY_LABELS.security);
  await click(button('Next criterion')); expect(editor().dataset.definition).toBe('A1.1');
  await click(button('Next criterion')); expect(editor().dataset.definition).toBe('A1.2');
  await click(button('Close criterion'));
  expect(heading()).toBe(CATEGORY_LABELS.availability); expect(button('Continue with A1.2')).toBeTruthy();
  expect(params().has('assessment')).toBe(false);
});

test('same-origin refresh preserves the mounted criterion identity and native manual fields', async () => {
  const result = fixture('qa-refresh-soc'), native = result.source.assessments.find(row => row.definition_id === 'A1.1');
  Object.assign(native, {implementation: 'Retained manual wording.', technology: 'Native availability process',
    owner_id: 'native-owner', verification: 'needs_validation'});
  const before = JSON.stringify(result.source); serve(result);
  await mount(result.client.client_id, ROOT + '?soc_category=availability&assessment=' + encodeURIComponent(native.framework_assessment_id));
  const mountedEditor = editor(); let finish;
  api.get.mockImplementation(path => path === '/frameworks/soc-2' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({data: []}));
  await click(button('Refresh native source'));
  expect(editor()).toBe(mountedEditor); expect(mockDrawerProps.record).toMatchObject(native);
  await act(async () => finish({data: {...result.source, work: {refreshed: true}}}));
  expect(editor()).toBe(mountedEditor); expect(mockDrawerProps.record).toMatchObject(native);
  expect(heading()).toBe(CATEGORY_LABELS.availability); expect(params().get('assessment')).toBe(native.framework_assessment_id);
  expect(JSON.stringify(result.source)).toBe(before);
});

test('retained out-of-scope criteria stay separate and never alter active categories or readiness totals', async () => {
  const result = unequalFixture('qa-retained-soc');
  const retained = frameworkCatalog('soc-2').requirements.filter(definition => !CORE_SCOPE.includes(definition.category));
  result.source.definitions = frameworkCatalog('soc-2').requirements;
  result.source.assessments.push(...retained.map(definition => ({client_id: result.client.client_id, framework_key: 'soc-2',
    framework_assessment_id: result.client.client_id + ':' + definition.id, definition_id: definition.id,
    framework_version: frameworkCatalog('soc-2').version, status: 'not_assessed', implementation: 'Retained native wording.'})));
  result.refresh(); const before = JSON.stringify(result.source); serve(result); await mount(result.client.client_id);
  await click(container.querySelector('input[type="checkbox"]'));
  const retainedSection = () => container.querySelector('section[aria-label="Retained out-of-scope criteria"]');
  expect(retainedSection().querySelectorAll('tbody tr')).toHaveLength(23);
  expect(workspace().querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(3);
  expect(summary().textContent).toContain('6 of 37 applicable criteria addressed');
  await search('PI1.1'); expect(rows()).toHaveLength(0); expect(retainedSection().querySelectorAll('tbody tr')).toHaveLength(1);
  await click(retainedSection().querySelector('[data-testid="requirement-PI1.1"]'));
  expect(editor().dataset.definition).toBe('PI1.1'); expect(mockDrawerProps.record.implementation).toBe('Retained native wording.');
  expect(heading()).toBe('SOC 2'); expect(workspace().textContent).toContain('Retained out-of-scope criterion');
  expect(summary().textContent).toContain('6 of 37 applicable criteria addressed');
  await mount(result.client.client_id, ROOT + '?soc_category=security&assessment=' + encodeURIComponent(result.client.client_id + ':PI1.1'), true);
  expect(heading()).toBe('SOC 2'); expect(editor().dataset.definition).toBe('PI1.1');
  expect(workspace().textContent).toContain('Retained out-of-scope criterion');
  expect(summary().textContent).toContain('6 of 37 applicable criteria addressed');
  expect(JSON.stringify(result.source)).toBe(before);
});

test('failed source reads expose retry without stale category figures or assessment writes', async () => {
  const result = fixture('qa-unavailable-soc');
  api.get.mockRejectedValue(new Error('Authorized SOC source unavailable.'));
  await mount(result.client.client_id, ROOT + '?soc_category=availability');
  expect(container.querySelector('[role="alert"]').textContent).toContain('Authorized SOC source unavailable.');
  expect(workspace()).toBeNull(); expect(editor()).toBeNull(); expect(summary()).toBeNull();
  serve(result); await click(button('Retry workspace'));
  expect(heading()).toBe(CATEGORY_LABELS.availability); expect(summary().textContent).toContain('0 of 3 applicable criteria addressed');
});

test.each(['foreign-records', 'foreign-framework', 'foreign-position'])('%s cannot open a client category or editor', async fault => {
  const result = fixture('qa-guard-soc');
  if (fault === 'foreign-records') result.source.assessments = result.source.assessments.map(row => ({...row, client_id: 'other-client'}));
  if (fault === 'foreign-framework') result.source.framework = {...result.source.framework, key: 'iso-27001'};
  if (fault === 'foreign-position') result.source.implementation_position = {...result.source.implementation_position, program_id: 'other-client:soc-2'};
  serve(result); await mount(result.client.client_id, ROOT + '?soc_category=security&assessment=' + encodeURIComponent(result.client.client_id + ':CC1.1'));
  expect(container.querySelector('[role="alert"]').textContent).toContain('SOC 2 workspace records could not be verified for this client.');
  expect(workspace()).toBeNull(); expect(editor()).toBeNull(); expect(summary()).toBeNull();
});

test('unavailable canonical counts remain unavailable in both overview and category views', async () => {
  const result = fixture('qa-partial-soc');
  result.source.implementation_position = {...result.source.implementation_position, availability: 'partial', reason: 'Native records are incomplete.'};
  serve(result); await mount(result.client.client_id);
  expect(summary().textContent).toContain('Implementation source unavailable');
  expect(container.querySelector('[data-testid="soc-readiness-percentage"]').textContent).toBe('—');
  expect(container.querySelector('[data-testid="soc-category-security"]').textContent).toContain('Counts unavailable');
  await openCategory('security');
  expect(heading()).toBe(CATEGORY_LABELS.security); expect(summary().textContent).toContain('Implementation source unavailable');
  expect(container.querySelector('[data-testid="soc-readiness-percentage"]').textContent).toBe('—');
  expect(container.querySelector('[data-testid="soc-group-CC1"]').textContent).toContain('Counts unavailable');
});

test('switching clients withdraws the old editor and rejects its stale category against the new native scope', async () => {
  const first = fixture('qa-first-soc', ALL_SCOPE), second = fixture('qa-second-soc', ['security']); serve(first);
  await mount(first.client.client_id, ROOT + '?soc_category=privacy&assessment=' + encodeURIComponent(first.client.client_id + ':P1.1'));
  expect(heading()).toBe(CATEGORY_LABELS.privacy); expect(editor().dataset.client).toBe(first.client.client_id);
  let finish;
  api.get.mockImplementation(path => path === '/frameworks/soc-2' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({data: []}));
  await mount(second.client.client_id);
  expect(workspace()).toBeNull(); expect(editor()).toBeNull(); expect(container.textContent).toContain('Loading program workspace');
  serve(second); await act(async () => finish({data: second.source}));
  expect(heading()).toBe('SOC 2'); expect(editor()).toBeNull();
  expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(1);
  expect(container.querySelector('[data-testid="soc-category-privacy"]')).toBeNull();
  expect(summary().textContent).toContain('0 of 33 applicable criteria addressed');
  expect(container.textContent).toContain('This assessment is not available in the current client workspace.');
  await openCategory('security'); expect(params().get('soc_category')).toBe('security'); expect(params().has('assessment')).toBe(false);
  expect(api.get.mock.calls.filter(([path]) => path === '/frameworks/soc-2').map(([, options]) => options.params.client_id))
    .toEqual([first.client.client_id, second.client.client_id]);
});

test('invalid category hints and unconfigured enrollment keep native overview and setup states', async () => {
  const result = fixture('qa-scope-soc', ['security']); serve(result);
  await mount(result.client.client_id, ROOT + '?soc_category=privacy');
  expect(heading()).toBe('SOC 2'); expect(container.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(1);
  expect(container.querySelector('.soc-program-back')).toBeNull();
  result.source.configured = false; result.source.definitions = []; result.source.assessments = [];
  await mount(result.client.client_id, currentUrl(), true);
  expect(workspace()).toBeNull(); expect(editor()).toBeNull(); expect(summary()).toBeNull();
  expect(container.textContent).toContain('Program selected for this client.');
  expect(container.querySelector('a[href="/client-profile?tab=program"]').textContent).toBe('Configure in Client Profile');
});
