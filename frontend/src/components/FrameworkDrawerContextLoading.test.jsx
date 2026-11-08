import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {cisContext} from '../testUtils/cisExperience';

let mockAuth, mockOrg, mockGuideProps;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true, API: '/api',
  default: {get: jest.fn(), patch: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn()},
  formatError: error => error.message}));
// This unit isolates the real drawer's context boundary. Native interview,
// persistence and leave behavior are exercised in the adapter integration suite.
jest.mock('./GuidedAssessor', () => props => { mockGuideProps = props; return null; });

const copy = value => JSON.parse(JSON.stringify(value));
const clientId = 'demo_brawndo';
const token = '2026-10-01T12:00:00Z';
const savedToken = '2026-10-02T12:00:00Z';
let root, host, record, native, users, contacts, comments, activity, related, work;
const base = () => '/framework_assessments/' + record.framework_assessment_id;
const memberPath = '/clients/' + clientId + '/members';
const frameworkPath = () => '/frameworks/' + record.framework_key;
const surface = () => document.querySelector('[data-testid="brawndo-cis-assessment"]');
const button = (scope, name) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === name);
const readPaths = () => api.get.mock.calls.map(([path]) => path);
const requiredPaths = () => [base() + '/related', memberPath, frameworkPath()];
const allPaths = () => [...requiredPaths(), '/contacts', '/comments', base() + '/activity'];

function workspace() {
  return {selected: true, configured: true,
    framework: {key: native.framework_key, version: native.framework_version},
    configuration: {implementation_group: 1},
    implementation_position: {program_id: clientId + ':' + native.framework_key},
    assessments: [native], work: {[native.framework_assessment_id]: work}};
}

function response(path) {
  if (path === base() + '/related') return related;
  if (path === memberPath) return users;
  if (path === frameworkPath()) return workspace();
  if (path === '/contacts') return contacts;
  if (path === '/comments') return comments;
  if (path === base() + '/activity') return activity;
  throw new Error('Unexpected context read: ' + path);
}

async function render(props = {}) {
  await act(async () => root.render(<FrameworkDrawer open visualReference record={record}
    clientId={clientId} onOpenChange={() => {}} {...props}/>));
}

async function edit(node, value) {
  expect(node).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', {bubbles: true}));
  });
}

async function saveAssessment() {
  const save = button(surface(), 'Save assessment');
  expect(save.disabled).toBe(false);
  await act(async () => { save.click(); await api.patch.mock.results.at(-1).value; });
}

function expectNoWrites() {
  for (const method of ['patch', 'put', 'post', 'delete']) expect(api[method]).not.toHaveBeenCalled();
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  localStorage.clear();
  mockOrg = {...cisContext(), loading: false, error: null};
  mockAuth = {user: {user_id: 'context-actor', role: 'super_admin', workspace_mode: 'demo'},
    workspaceMode: 'demo', loading: false, error: null};
  mockGuideProps = null;
  sessionStorage.setItem('grc_client_id', clientId);
  window.history.replaceState({}, '', '/compliance/cis-ig1?client_id=' + clientId);
  native = {framework_assessment_id: 'context-native-1.1', client_id: clientId,
    framework_key: 'cis-ig1', framework_version: '8.1', definition_id: '1.1',
    status: 'in_progress', verification: 'needs_validation', implementation: 'Saved implementation.',
    owner_id: 'context-owner', process_owner_id: 'context-contact', technology: 'Retained technology',
    notes: 'Retained notes', na_rationale: '', last_saved: token, cis_assessment_criteria: [],
    items_to_address: [], items_revision: 0, related_links: [],
    assessment_history: [{status: 'in_progress', implementation: 'Original history narrative.',
      at: token, by: 'context-owner'}]};
  record = copy(native);
  users = [{user_id: 'context-owner', name: 'Original resolved owner', status: 'active'}];
  contacts = [{contact_id: 'context-contact', name: 'Native process contact'}];
  comments = [{comment_id: 'context-comment', body: 'Native retained comment.', author_name: 'Context author', created_at: token}];
  activity = [{audit_id: 'context-activity', action: 'Native retained activity.', user_name: 'Context actor', at: token}];
  related = {reviews: [], evidence: [], findings: [], tasks: [], risks: [], policies: []};
  work = {context_complete: true, evidence_count: 0, finding_ids: [], review_ids: [], task_ids: [],
    open_findings: 0, open_actions: 0, overdue_reviews: 0, overdue_actions: 0, priority_records: []};
  for (const method of ['get', 'patch', 'put', 'post', 'delete']) api[method].mockReset();
  api.get.mockImplementation(path => Promise.resolve({data: copy(response(path))}));
  api.patch.mockImplementation(async (_path, body) => {
    const {expected_last_assessed, ...fields} = body;
    native = {...native, ...fields, last_saved: savedToken};
    return {data: copy(native)};
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  jest.clearAllMocks();
});

test('ordinary CIS reads only required context and refreshes related records, members and workspace after Save', async () => {
  await render();
  expect(readPaths().sort()).toEqual(requiredPaths().sort());
  expect(mockGuideProps.people).toEqual(users);
  expect(mockGuideProps.related).toEqual(related);
  expect(mockGuideProps.current.work).toEqual(work);
  expect(mockGuideProps.disabled).toBe(false);
  expect(surface().querySelector('[aria-label="Current implementation"]').disabled).toBe(false);
  api.get.mockClear();
  users = [{user_id: 'context-owner', name: 'Fresh resolved owner', status: 'active'}];
  related = {...related, evidence: [{evidence_id: 'fresh-evidence', filename: 'Fresh linked record', client_id: clientId}]};
  work = {...work, evidence_count: 1};
  await edit(surface().querySelector('[aria-label="Current implementation"]'), 'Explicit native Save refresh.');
  await saveAssessment();
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(readPaths().sort()).toEqual(requiredPaths().sort());
  expect(mockGuideProps.people).toEqual(users);
  expect(mockGuideProps.related).toEqual(related);
  expect(mockGuideProps.current).toMatchObject({implementation: 'Explicit native Save refresh.', work});
  expect(mockGuideProps.disabled).toBe(false);
  expect(api.put).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  expect(api.delete).not.toHaveBeenCalled();
});

test('all required ordinary context reads share the native abort boundary and editing waits for completion', async () => {
  const pending = [];
  api.get.mockImplementation((path, config) => new Promise(resolve => pending.push({path, config, resolve})));
  await render();
  expect(pending.map(item => item.path).sort()).toEqual(requiredPaths().sort());
  const signal = pending[0].config.signal;
  expect(signal.aborted).toBe(false);
  expect(pending.every(item => item.config.signal === signal)).toBe(true);
  expect(surface().querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  await act(async () => pending.forEach(item => item.resolve({data: copy(response(item.path))})));
  expect(surface().querySelector('[aria-label="Current implementation"]').disabled).toBe(false);
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  expectNoWrites();
});

test.each(['related', 'members', 'workspace'])('ordinary CIS fails closed when required %s context rejects', async kind => {
  const failed = kind === 'related' ? base() + '/related' : kind === 'members' ? memberPath : frameworkPath();
  api.get.mockImplementation(path => path === failed ? Promise.reject(new Error('Required ' + kind + ' unavailable.'))
    : Promise.resolve({data: copy(response(path))}));
  await render();
  expect(readPaths().sort()).toEqual(requiredPaths().sort());
  expect(surface().querySelector('[role="alert"]').textContent).toContain('Required ' + kind + ' unavailable.');
  expect(surface().querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  expect(button(surface(), 'Save assessment').disabled).toBe(true);
  expect(mockGuideProps?.disabled ?? true).toBe(true);
  expectNoWrites();
});

test('same-assessment transition into Manage fetches full fresh owner, history and activity context', async () => {
  await render();
  expect(readPaths().sort()).toEqual(requiredPaths().sort());
  api.get.mockClear();
  users = [{user_id: 'context-owner', name: 'Fresh Manage owner', status: 'active'}];
  activity = [{audit_id: 'manage-activity', action: 'Fresh Manage activity.', user_name: 'Manage actor', at: savedToken}];
  native = {...native, assessment_history: [...native.assessment_history,
    {status: 'in_progress', implementation: 'Fresh Manage history snapshot.', at: savedToken, by: 'context-owner'}]};
  await render({recordManagement: true});
  expect(readPaths().sort()).toEqual(allPaths().sort());
  const management = document.querySelector('[data-testid="framework-record-management"]');
  expect(management).toBeTruthy();
  expect(management.querySelector('[aria-label="Assessment Owner"]').textContent).toContain('Fresh Manage owner');
  expect(management.textContent).toContain('Original history narrative.');
  expect(management.textContent).toContain('Fresh Manage history snapshot.');
  expect(management.textContent).toContain('Fresh Manage activity.');
  expectNoWrites();
});

test('same-assessment review management retains all six original context reads', async () => {
  await render();
  api.get.mockClear();
  await render({reviewManagement: true});
  expect(readPaths().sort()).toEqual(allPaths().sort());
  const management = document.querySelector('[data-testid="framework-review-management"]');
  expect(management).toBeTruthy();
  expect(management.querySelector('[aria-label="Linked governance Reviews"]')).toBeTruthy();
  expectNoWrites();
});

test('the generic framework fallback retains native owner, contacts, comments, history and activity details', async () => {
  native = {...native, framework_key: 'nist-csf-2', framework_version: '2.0', definition_id: 'GV.OC-01'};
  record = copy(native);
  await render({visualReference: false});
  expect(readPaths().sort()).toEqual(allPaths().sort());
  const generic = document.querySelector('[data-testid="framework-drawer"]');
  expect(generic).toBeTruthy();
  expect(generic.querySelector('[aria-label="Assessment Owner"]').textContent).toContain('Original resolved owner');
  expect(generic.querySelector('[aria-label="Process Owner (Contact)"]').value).toBe('context-contact');
  expect(generic.querySelector('[aria-label="Process Owner (Contact)"]').textContent).toContain('Native process contact');
  expect(generic.textContent).toContain('Native retained comment.');
  await act(async () => button(generic, 'Activity / History').click());
  expect(generic.textContent).toContain('Original history narrative.');
  expect(generic.textContent).toContain('Native retained activity.');
  expectNoWrites();
});
