import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import api from '@/lib/api';
import {versionForSafeguard} from '@/lib/guidedAssessment';
import {cisContext} from '../testUtils/cisExperience';

let mockAuth, mockOrg;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true, API: '/api',
  default: {get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn()},
  formatError: error => error.message}));

const base = '/framework_assessments/history-request-1.1/guided-assessment';
const fingerprint = 'a'.repeat(64);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
};
let root, host, record, draft, requests, props;
const dialog = () => document.querySelector('.brawndo-pilot-history[role="dialog"]');
const loading = () => dialog().querySelector('[role="status"]');
const historyPage = (narrative, revision) => ({items: [{revision, version: draft.version,
  completed: true, user_id: mockAuth.user.user_id, updated_at: '2026-11-08T12:00:00Z',
  narrative, answers: {inventory: 'Not sure'}, result: null}], next_before_revision: null});

async function render(interviewHistoryOpen) {
  await act(async () => root.render(<GuidedAssessor {...props} interviewHistoryOpen={interviewHistoryOpen}/>));
}

async function openTwice() {
  await render(true);
  expect(requests).toHaveLength(1);
  expect(loading().textContent).toBe('Loading interview history…');
  await render(false);
  expect(dialog()).toBeNull();
  await render(true);
  expect(requests).toHaveLength(2);
  expect(loading().textContent).toBe('Loading interview history…');
  expect(api.get.mock.calls.filter(([path]) => path === base + '/history')).toEqual([
    [base + '/history', {params: {limit: 25}}],
    [base + '/history', {params: {limit: 25}}],
  ]);
}

async function settle(request, outcome, latest) {
  await act(async () => {
    if (outcome === 'success') request.resolve({data: historyPage(latest ? 'Latest archived snapshot.' : 'Obsolete archived snapshot.', latest ? 2 : 1)});
    else request.reject(new Error(latest ? 'Latest history read failed.' : 'Obsolete history read failed.'));
  });
}

function expectNoWrites() {
  for (const method of ['put', 'patch', 'post', 'delete']) expect(api[method]).not.toHaveBeenCalled();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(props.onSaveAssessment).not.toHaveBeenCalled();
  expect(props.onUpdateImplementation).not.toHaveBeenCalled();
}

function expectLatest(outcome) {
  expect(loading()).toBeNull();
  expect(dialog().textContent).not.toContain('Obsolete');
  if (outcome === 'success') {
    expect(dialog().textContent).toContain('Latest archived snapshot.');
    expect(dialog().querySelector('pre').textContent).toBe(JSON.stringify({inventory: 'Not sure'}, null, 2));
    expect(dialog().querySelector('[role="alert"]')).toBeNull();
  } else {
    expect(dialog().querySelector('[role="alert"]').textContent).toBe('Latest history read failed.');
    expect(dialog().querySelector('pre')).toBeNull();
    expect([...dialog().querySelectorAll('button')].find(button => button.textContent === 'Retry').disabled).toBe(false);
  }
  expectNoWrites();
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('grc_client_id', 'demo_brawndo');
  window.history.replaceState({}, '', '/compliance/cis-ig1?client_id=demo_brawndo');
  mockAuth = {user: {user_id: 'history-request-actor', role: 'super_admin', workspace_mode: 'demo'}, workspaceMode: 'demo'};
  mockOrg = cisContext();
  record = {framework_assessment_id: 'history-request-1.1', client_id: 'demo_brawndo',
    framework_key: 'cis-ig1', framework_version: '8.1', definition_id: '1.1', title: 'Synthetic inventory safeguard',
    status: 'not_assessed', implementation: '', verification: 'needs_validation', assessment_history: [],
    work: {context_complete: true, finding_ids: [], review_ids: [], task_ids: [], open_findings: 0,
      open_actions: 0, overdue_reviews: 0, overdue_actions: 0, priority_records: []}};
  draft = {client_id: record.client_id, assessment_id: record.framework_assessment_id, user_id: mockAuth.user.user_id,
    version: versionForSafeguard('1.1', true), answers: {}, step: 0, completed: false, revision: 0,
    narrative: '', result: null, base_assessment_token: null, current_assessment_token: null,
    base_scope_fingerprint: fingerprint, current_scope_fingerprint: fingerprint, lineage_known: true, lineage_stale: false};
  requests = [];
  for (const method of ['get', 'put', 'patch', 'post', 'delete']) api[method].mockReset();
  api.get.mockImplementation(path => {
    if (path === base) return Promise.resolve({data: draft});
    if (path === base + '/history') {
      const request = deferred();
      requests.push(request);
      return request.promise;
    }
    throw new Error('Unexpected read: ' + path);
  });
  props = {clientId: record.client_id, framework: record.framework_key, configuration: {implementation_group: 1},
    record, current: record, form: {...record}, contextComplete: true, inline: true, sequential: true,
    assessmentConcept: true, visualReference: true, safeguard11: true,
    onApply: jest.fn(), onSaveAssessment: jest.fn(), onUpdateImplementation: jest.fn(),
    onDraftChange: jest.fn(), onInterviewHistoryOpenChange: jest.fn()};
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  jest.clearAllMocks();
});

test.each([
  ['success', 'success'], ['success', 'error'], ['error', 'success'], ['error', 'error'],
])('reopening history retains the latest %s when the older read later returns %s', async (latest, older) => {
  await openTwice();
  await settle(requests[1], latest, true);
  expectLatest(latest);
  await settle(requests[0], older, false);
  expectLatest(latest);
});

test.each(['success', 'error'])('an older %s cannot end or replace the reopened history read while it is pending', async older => {
  await openTwice();
  await settle(requests[0], older, false);
  expect(loading()?.textContent).toBe('Loading interview history…');
  expect(dialog().querySelector('[role="alert"]')).toBeNull();
  expect(dialog().querySelector('pre')).toBeNull();
  expectNoWrites();
  await settle(requests[1], 'success', true);
  expectLatest('success');
});
