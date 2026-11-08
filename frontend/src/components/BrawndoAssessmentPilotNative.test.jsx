import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {catalogForVersion, versionForSafeguard, visibleQuestions} from '@/lib/guidedAssessment';
import {omniGroups} from '@/lib/refinedOmni';
import criteriaCatalog from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';

let mockAuth, mockOrg;
beforeAll(() => Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto}));
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true, API: '/api',
  default: require('axios').default.create({adapter: require('../preview/adapter').previewAdapter}),
  formatError: error => error.response?.data?.detail || error.message}));
jest.mock('react-router-dom', () => ({Link: ({children, to}) => <a href={to}>{children}</a>, useNavigate: () => jest.fn()}), {virtual: true});
jest.mock('sonner', () => ({toast: {error: jest.fn(), success: jest.fn()}}));

const copy = value => JSON.parse(JSON.stringify(value));
const customTool = '  Legacy asset register\nplus a local reconciliation list  ';
let root, host, record, baseline, relatedBefore, clientId, base, version, onClose;
let getSpy, putSpy, patchSpy, postSpy, deleteSpy;
const surface = () => document.querySelector('[data-testid="brawndo-cis-assessment"]');
const guide = () => surface().querySelector('[aria-label="CIS assessment interview"]');
const questionId = () => guide().querySelector('fieldset[data-question-id]')?.dataset.questionId;
const button = (scope, name) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === name);
const writes = () => [putSpy, patchSpy, postSpy, deleteSpy];

// Click handlers are async, but DOM click does not expose their promise. Await
// only the real native requests started by each action, including chained reads.
async function nativeAction(action) {
  const requests = [getSpy, ...writes()].filter(Boolean);
  const starts = requests.map(spy => spy.mock.results.length);
  await act(async () => {
    action();
    while (true) {
      const pending = requests.flatMap((spy, index) => {
        const results = spy.mock.results.slice(starts[index]);
        starts[index] = spy.mock.results.length;
        return results.map(result => result.value);
      });
      if (!pending.length) break;
      await Promise.allSettled(pending);
    }
  });
}

async function click(scope, name) {
  const target = button(scope, name);
  expect(target).toBeTruthy();
  expect(target.disabled).toBe(false);
  await nativeAction(() => target.click());
}

async function edit(node, value) {
  expect(node).toBeTruthy();
  const prototype = node.tagName === 'SELECT' ? HTMLSelectElement.prototype
    : node.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
  });
}

function clearWrites() {
  expect(patchSpy).not.toHaveBeenCalled();
  expect(postSpy).not.toHaveBeenCalled();
  expect(deleteSpy).not.toHaveBeenCalled();
  putSpy.mockClear();
}

async function loadSafeguard(id = '1.1', selectedClient = 'demo_brawndo') {
  clientId = selectedClient;
  const clients = (await api.get('/clients')).data;
  const currentClient = clients.find(client => client.client_id === clientId);
  expect(currentClient).toBeTruthy();
  mockOrg = {currentClientId: clientId, currentClient, clients, loading: false, error: null};
  sessionStorage.setItem('grc_client_id', clientId);
  window.history.replaceState({}, '', '/compliance/cis-ig1?client_id=' + clientId);
  const workspace = (await api.get('/frameworks/cis-ig1', {params: {client_id: clientId}})).data;
  expect(workspace).toMatchObject({selected: true, configured: true, framework: {key: 'cis-ig1', version: '8.1'}});
  record = workspace.assessments.find(row => row.definition_id === id);
  expect(record).toMatchObject({client_id: clientId, framework_key: 'cis-ig1', framework_version: '8.1', definition_id: id});
  base = '/framework_assessments/' + record.framework_assessment_id;
  baseline = copy((await api.get(base)).data);
  relatedBefore = copy((await api.get(base + '/related')).data);
  const initial = (await api.get(base + '/guided-assessment')).data;
  version = initial.version;
  expect(version).toBe(versionForSafeguard(id, true));
  expect(initial).toMatchObject({revision: 0, answers: {}, completed: false});
  getSpy = jest.spyOn(api, 'get');
  putSpy = jest.spyOn(api, 'put');
  patchSpy = jest.spyOn(api, 'patch');
  postSpy = jest.spyOn(api, 'post');
  deleteSpy = jest.spyOn(api, 'delete');
  return initial;
}

async function render(visualReference = true) {
  await nativeAction(() => root.render(<FrameworkDrawer open visualReference={visualReference}
    record={record} clientId={clientId} onOpenChange={onClose}/>));
}

async function remount() {
  await act(async () => root.unmount());
  root = createRoot(host);
  record = (await api.get(base)).data;
  await render();
}

async function openInterview() {
  if (guide().hidden) await click(surface(), button(surface(), 'Resume guided assessment')
    ? 'Resume guided assessment' : 'Begin guided assessment');
  expect(guide().hidden).toBe(false);
}

async function navigateTo(id) {
  // Native resume prioritizes unresolved requirements, rather than blindly
  // reopening the saved step. Move through the real question and row controls.
  const answers = (await api.get(base + '/guided-assessment')).data.answers;
  const questions = omniGroups(record.definition_id, answers, version).flatMap(group => group.questions);
  const target = questions.findIndex(question => question.id === id);
  expect(target).toBeGreaterThanOrEqual(0);
  for (let count = 0; count < 40; count++) {
    const current = questionId();
    if (current === id) return;
    const position = questions.findIndex(question => question.id === current);
    expect(position).toBeGreaterThanOrEqual(0);
    await click(guide(), target < position ? 'Back' : 'Continue');
  }
  throw new Error(`Native interview question ${id} was not reached`);
}

async function checkpoint(answers, question = 'inventory') {
  const initial = (await api.get(base + '/guided-assessment')).data;
  const step = visibleQuestions(record.definition_id, answers, version).findIndex(item => item.id === question);
  expect(step).toBeGreaterThanOrEqual(0);
  return (await api.put(base + '/guided-assessment', {version, answers, step, completed: false,
    narrative: '', result: null, expected_revision: initial.revision,
    base_assessment_token: initial.current_assessment_token,
    base_scope_fingerprint: initial.current_scope_fingerprint})).data;
}

async function assertAssessmentUnchanged() {
  expect((await api.get(base)).data).toEqual(baseline);
  expect((await api.get(base + '/related')).data).toEqual(relatedBefore);
  expect(patchSpy).not.toHaveBeenCalled();
  expect(postSpy).not.toHaveBeenCalled();
  expect(deleteSpy).not.toHaveBeenCalled();
}

function completeNativeAnswers() {
  const questions = catalogForVersion(version).safeguards['1.1'];
  expect(questions).toHaveLength(18);
  expect(questions.find(question => question.id === 'coverage').rows).toHaveLength(9);
  expect(questions.find(question => question.id === 'attributes').rows).toHaveLength(6);
  const text = {
    existing: 'Retained earlier partial records; this branch is not active for the current Yes answer.',
    system: customTool,
    owner: 'Client IT Operations maintains the register; the provider supplies device exports.',
    scope_reason: 'The synthetic fixture has no static-address assets; the other required details are recorded.',
    maintenance_detail: 'IT Operations reconciles additions and retirements against the register.',
    evidence: 'The reported register and reconciliation records can be reviewed; no upload is implied.',
    gaps: 'The synthetic server cohort has not yet been reconciled.',
    unknowns: 'Confirm remote asset ownership with Client IT Operations.',
  };
  return Object.fromEntries(questions.map(question => [question.id,
    question.type === 'matrix' ? Object.fromEntries(question.rows.map((row, index) => [row,
      question.id === 'coverage' && row === 'Servers' ? 'No'
        : question.id === 'attributes' && index === 0 ? 'Not applicable' : 'Yes']))
      : question.type === 'text' ? text[question.id]
        : question.type === 'date' ? '2026-10-01'
          : question.id === 'sources' ? 'One source'
            : question.id === 'frequency' ? 'Annually' : 'Yes',
  ]));
}

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  const user = (await api.post('/demo/enter')).data.user;
  mockAuth = {user, workspaceMode: 'demo', loading: false, error: null};
  onClose = jest.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('the exact joined Demo Brawndo 1.1 pilot starts blank with requirement metadata inside its collapsed disclosure', async () => {
  await loadSafeguard();
  await render();
  expect(surface().classList.contains('brawndo-assessment-pilot')).toBe(true);
  const requirement = surface().querySelector('.cis-collapsible-requirement');
  expect(requirement.open).toBe(false);
  expect(requirement.querySelector('.cis-native-requirement-meta')).toBeTruthy();
  expect(surface().querySelectorAll('.cis-native-requirement-meta')).toHaveLength(1);
  expect(requirement.querySelector('mark').textContent).toBe('at least every six months');
  expect(requirement.querySelector('a').textContent).toBe('Official CIS source');
  expect(guide().hidden).toBe(true);
  await openInterview();
  expect(questionId()).toBe('inventory');
  expect(guide().querySelector('fieldset select').value).toBe('');
  expect(guide().querySelector('fieldset textarea').value).toBe('');
  expect(guide().querySelector('.brawndo-pilot-guidance').textContent).toContain('CIS requirement');
  expect((await api.get(base + '/guided-assessment')).data).toMatchObject({revision: 0, answers: {}, completed: false});
  expect(putSpy).not.toHaveBeenCalled();
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(baseline.implementation);
  expect(surface().querySelector('input[name="bcsg-status"]:checked').value).toBe(baseline.status);
  await assertAssessmentUnchanged();
  await edit(guide().querySelector('fieldset select'), 'Yes');
  await click(guide(), 'Continue');
  expect(questionId()).toBe('system');
  expect(guide().querySelector('.brawndo-pilot-tool-field select').value).toBe('');
  expect(guide().querySelector('.brawndo-pilot-tool-field textarea')).toBeNull();
  expect(putSpy).not.toHaveBeenCalled();
  await assertAssessmentUnchanged();
});

test('a sparse native checkpoint leaves actual cadence blank instead of copying the six-month requirement', async () => {
  await loadSafeguard();
  await checkpoint({inventory: 'Yes'}, 'frequency');
  clearWrites();
  await render();
  await openInterview();
  await navigateTo('frequency');
  clearWrites();
  expect(questionId()).toBe('frequency');
  expect(guide().querySelector('fieldset select').value).toBe('');
  expect(guide().querySelector('.brawndo-pilot-guidance mark').textContent).toBe('at least every six months');
  expect((await api.get(base + '/guided-assessment')).data.answers).toEqual({inventory: 'Yes'});
  expect(putSpy).not.toHaveBeenCalled();
  await assertAssessmentUnchanged();
});

test('native group checkpoints preserve custom tools and context through pause, resume and reload', async () => {
  await loadSafeguard();
  await render();
  await openInterview();
  await edit(guide().querySelector('fieldset select'), 'Yes');
  await click(guide(), 'Continue');
  await edit(guide().querySelector('.brawndo-pilot-tool-field select'), '__other__');
  await edit(guide().querySelector('.brawndo-pilot-tool-field textarea'), customTool);
  await click(guide(), 'Continue');
  expect(questionId()).toBe('sources');
  await edit(guide().querySelector('fieldset select'), 'One source');
  await click(guide(), 'Continue');
  expect(questionId()).toBe('owner');
  const owner = '  Client IT Operations / provider support  ';
  await edit(guide().querySelector('fieldset textarea'), owner);
  await click(guide(), 'Continue');
  expect(questionId()).toBe('coverage');
  expect(putSpy).toHaveBeenCalledTimes(1);
  const grouped = (await api.get(base + '/guided-assessment')).data;
  expect(grouped).toMatchObject({completed: false, revision: 1, answers: {inventory: 'Yes', system: customTool, sources: 'One source', owner}});
  expect(grouped.answers).not.toHaveProperty('frequency');
  await edit(guide().querySelector('fieldset select'), 'Not sure');
  await edit(guide().querySelector('[aria-label="Known gaps or uncertainties"]'), 'Unconfirmed scope remains a local draft.');
  await click(guide(), 'Pause & return');
  expect(guide().hidden).toBe(true);
  expect((await api.get(base + '/guided-assessment')).data).toEqual(grouped);
  await openInterview();
  expect(guide().querySelector('fieldset select').value).toBe('Not sure');
  expect(guide().querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe('Unconfirmed scope remains a local draft.');
  await click(guide(), 'Save progress');
  const saved = (await api.get(base + '/guided-assessment')).data;
  expect(saved.answers.coverage['End-user devices']).toBe('Not sure');
  expect(saved.answers.coverage_detail).toBe('Unconfirmed scope remains a local draft.');
  await assertAssessmentUnchanged();
  await remount();
  await openInterview();
  expect(questionId()).toBe('coverage');
  expect(guide().querySelector('fieldset select').value).toBe('Not sure');
  expect(guide().querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe('Unconfirmed scope remains a local draft.');
  expect((await api.get(base + '/guided-assessment')).data.answers).toEqual(saved.answers);
  await assertAssessmentUnchanged();
});

test('saved custom tools and actual annual cadence restore exactly through the native checkpoint contract', async () => {
  await loadSafeguard();
  const answers = {inventory: 'Yes', system: customTool, frequency: 'Annually'};
  await checkpoint(answers, 'system');
  clearWrites();
  await render();
  await openInterview();
  await navigateTo('system');
  clearWrites();
  expect(guide().querySelector('.brawndo-pilot-tool-field select').value).toBe('__other__');
  expect(guide().querySelector('.brawndo-pilot-tool-field textarea').value).toBe(customTool);
  await checkpoint(answers, 'frequency');
  clearWrites();
  await remount();
  await openInterview();
  await navigateTo('frequency');
  clearWrites();
  expect(guide().querySelector('fieldset select').value).toBe('Annually');
  expect((await api.get(base + '/guided-assessment')).data.answers.system).toBe(customTool);
  expect(putSpy).not.toHaveBeenCalled();
  await assertAssessmentUnchanged();
});

test('full native response review saves only the interview, edited Apply draft stages only text, and separate Save persists one history entry', async () => {
  await loadSafeguard();
  expect(baseline.cis_assessment_criteria).toBeUndefined();
  const expectedCriteria = baseline.cis_assessment_criteria ?? [];
  const answers = completeNativeAnswers();
  await checkpoint(answers, 'unknowns');
  clearWrites();
  await render();
  await openInterview();
  await navigateTo('unknowns');
  clearWrites();
  expect(questionId()).toBe('unknowns');
  await click(guide(), 'Review answers');
  const active = visibleQuestions('1.1', answers, version);
  expect(guide().querySelectorAll('.cis-answer-review > li')).toHaveLength(active.length);
  for (const question of catalogForVersion(version).safeguards['1.1'].filter(item => item.type === 'matrix')) {
    for (const row of question.rows) expect(guide().querySelector('.cis-answer-review').textContent).toContain(row + ': ' + answers[question.id][row]);
  }
  expect(button(guide(), 'Edit responses')).toBeTruthy();
  expect(button(guide(), 'Save progress')).toBeTruthy();
  expect(putSpy).not.toHaveBeenCalled();
  await click(guide(), 'Review implementation');
  expect(putSpy).toHaveBeenCalledTimes(1);
  expect(putSpy.mock.calls[0]).toEqual([base + '/guided-assessment', expect.objectContaining({version, answers, completed: true})]);
  const completed = (await api.get(base + '/guided-assessment')).data;
  expect(completed).toMatchObject({version, answers, completed: true});
  expect(completed.result).toBeTruthy();
  await assertAssessmentUnchanged();
  const draft = guide().querySelector('[aria-label="Current implementation draft"]');
  expect(draft.value).toContain('Identified gaps');
  expect(draft.value).toContain('Items requiring confirmation');
  expect(draft.value).toContain('reviewed and updated annually');
  const reviewed = 'Reviewed synthetic native draft.\n\n' + draft.value + '\n\nRetain this exact edited wording.';
  await edit(draft, reviewed);
  expect(button(guide(), 'Apply draft').disabled).toBe(true);
  const replacement = guide().querySelector('.guided-replacement input');
  expect(replacement).toBeTruthy();
  await act(async () => replacement.click());
  await click(guide(), 'Apply draft');
  expect(guide().hidden).toBe(true);
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(reviewed);
  expect(surface().querySelector('input[name="bcsg-status"]:checked').value).toBe(baseline.status);
  expect(putSpy).toHaveBeenCalledTimes(1);
  await assertAssessmentUnchanged();
  await nativeAction(() => surface().querySelector('.brawndo-assessment-navigation-close').click());
  expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Leave unsaved changes?');
  await click(document.body, 'Keep editing');
  expect(onClose).not.toHaveBeenCalled();
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(reviewed);
  await assertAssessmentUnchanged();
  await click(surface(), 'Save assessment');
  expect(patchSpy).toHaveBeenCalledTimes(1);
  expect(patchSpy.mock.calls[0]).toEqual([base, expect.objectContaining({implementation: reviewed,
    status: baseline.status, verification: baseline.verification,
    cis_assessment_criteria: expectedCriteria,
    expected_last_assessed: baseline.last_saved ?? baseline.last_assessed ?? null})]);
  const saved = (await api.get(base)).data;
  expect(saved.implementation).toBe(reviewed);
  expect(saved.cis_assessment_criteria).toEqual(expectedCriteria);
  for (const key of ['status', 'verification', 'technology', 'owner_id', 'process_owner_id', 'notes', 'na_rationale']) {
    expect(saved[key]).toEqual(baseline[key]);
  }
  expect(saved.assessment_history.slice(0, baseline.assessment_history.length)).toEqual(baseline.assessment_history);
  expect(saved.assessment_history).toHaveLength(baseline.assessment_history.length + 1);
  expect(saved.assessment_history.at(-1)).toMatchObject({implementation: reviewed, status: baseline.status, verification: baseline.verification});
  expect(saved.last_saved).not.toBe(baseline.last_saved);
  expect((await api.get(base + '/related')).data).toEqual(relatedBefore);
  expect(postSpy).not.toHaveBeenCalled();
  expect(deleteSpy).not.toHaveBeenCalled();
  await remount();
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(reviewed);
  expect((await api.get(base)).data.cis_assessment_criteria).toEqual(expectedCriteria);
  expect(patchSpy).toHaveBeenCalledTimes(1);
});

test('native Save preserves populated valid assessment criteria IDs in their recorded order', async () => {
  await loadSafeguard();
  const criteria = ['1.1-c22', '1.1-c10', '1.1-c4'];
  const valid = criteriaCatalog.requirements['1.1'].criteria.map(item => item.id);
  expect(criteria.every(id => valid.includes(id))).toBe(true);
  // This separate case explicitly starts with recorded criteria; the full
  // response-review case above retains its genuinely absent native field.
  const populated = (await api.patch(base, {cis_assessment_criteria: criteria,
    expected_last_assessed: baseline.last_saved ?? baseline.last_assessed ?? null})).data;
  expect(populated.cis_assessment_criteria).toEqual(criteria);
  baseline = copy(populated);
  record = copy(populated);
  patchSpy.mockClear();
  await render();
  expect(surface().classList.contains('brawndo-assessment-pilot')).toBe(true);
  const reviewed = baseline.implementation + '\nPreserve the recorded assessment criteria.';
  await edit(surface().querySelector('[aria-label="Current implementation"]'), reviewed);
  await assertAssessmentUnchanged();
  await click(surface(), 'Save assessment');
  expect(patchSpy).toHaveBeenCalledTimes(1);
  expect(patchSpy.mock.calls[0]).toEqual([base, expect.objectContaining({implementation: reviewed,
    cis_assessment_criteria: criteria, expected_last_assessed: baseline.last_saved ?? baseline.last_assessed ?? null})]);
  const saved = (await api.get(base)).data;
  expect(saved.cis_assessment_criteria).toEqual(criteria);
  for (const key of ['status', 'verification', 'technology', 'owner_id', 'process_owner_id', 'notes', 'na_rationale']) {
    expect(saved[key]).toEqual(baseline[key]);
  }
  expect(saved.assessment_history.slice(0, baseline.assessment_history.length)).toEqual(baseline.assessment_history);
  expect(saved.assessment_history).toHaveLength(baseline.assessment_history.length + 1);
  expect((await api.get(base + '/related')).data).toEqual(relatedBefore);
  await remount();
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(reviewed);
  expect((await api.get(base)).data.cis_assessment_criteria).toEqual(criteria);
  expect(patchSpy).toHaveBeenCalledTimes(1);
  expect(putSpy).not.toHaveBeenCalled();
  expect(postSpy).not.toHaveBeenCalled();
  expect(deleteSpy).not.toHaveBeenCalled();
});

test('discarding a native implementation draft leaves the original saved assessment and related records exact', async () => {
  await loadSafeguard();
  await render();
  await edit(surface().querySelector('[aria-label="Current implementation"]'), 'Unsaved synthetic wording to discard.');
  await nativeAction(() => surface().querySelector('.brawndo-assessment-navigation-close').click());
  expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Your saved assessment is unchanged.');
  await click(document.body, 'Discard changes');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledWith(false);
  expect(putSpy).not.toHaveBeenCalled();
  await assertAssessmentUnchanged();
});

test('a real native interview revision conflict retains local answers and the newer saved checkpoint', async () => {
  await loadSafeguard();
  await checkpoint({inventory: 'No', existing: 'Original personal checkpoint.'});
  clearWrites();
  await render();
  await openInterview();
  expect(questionId()).toBe('inventory');
  const newer = await checkpoint({inventory: 'No', existing: 'A newer checkpoint saved by a second editor.'});
  clearWrites();
  await edit(guide().querySelector('fieldset select'), 'Yes');
  await click(guide(), 'Save progress');
  expect(putSpy).toHaveBeenCalledTimes(1);
  expect(putSpy.mock.calls[0][1]).toMatchObject({expected_revision: newer.revision - 1, answers: {inventory: 'Yes'}});
  expect(guide().textContent).toContain('Interview changed; reload before saving');
  expect(guide().hidden).toBe(false);
  expect(guide().querySelector('fieldset select').value).toBe('Yes');
  expect((await api.get(base + '/guided-assessment')).data).toEqual(newer);
  await assertAssessmentUnchanged();
});

test('a real stale native assessment token rejects Save without overwriting the newer record or losing the local draft', async () => {
  await loadSafeguard();
  await render();
  const oldToken = baseline.last_saved ?? baseline.last_assessed ?? null;
  const localText = 'Unsaved local implementation; keep this draft after the conflict.';
  await edit(surface().querySelector('[aria-label="Current implementation"]'), localText);
  const newer = (await api.patch(base, {implementation: baseline.implementation + '\nA newer native update.',
    expected_last_assessed: oldToken})).data;
  patchSpy.mockClear();
  await click(surface(), 'Save assessment');
  expect(patchSpy).toHaveBeenCalledTimes(1);
  expect(patchSpy.mock.calls[0][1]).toMatchObject({implementation: localText, expected_last_assessed: oldToken});
  expect(surface().querySelector('[role="alert"]').textContent).toContain('Assessment changed since it was opened; reload before saving');
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(localText);
  expect((await api.get(base)).data).toEqual(newer);
  expect(newer.assessment_history).toHaveLength(baseline.assessment_history.length + 1);
  expect((await api.get(base + '/related')).data).toEqual(relatedBefore);
  expect(putSpy).not.toHaveBeenCalled();
  expect(postSpy).not.toHaveBeenCalled();
  expect(deleteSpy).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('read-only pilot presentation retains disabled native answers and exposes no assessment save', async () => {
  await loadSafeguard();
  mockAuth = {...mockAuth, user: {...mockAuth.user, role: 'client_viewer'}};
  await render();
  expect(surface().classList.contains('brawndo-assessment-pilot')).toBe(true);
  await openInterview();
  expect(guide().querySelector('fieldset').disabled).toBe(true);
  expect(button(guide(), 'Continue').disabled).toBe(true);
  expect(button(guide(), 'Save progress').disabled).toBe(true);
  expect(surface().querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  expect(button(surface(), 'Save assessment')).toBeUndefined();
  expect(putSpy).not.toHaveBeenCalled();
  await assertAssessmentUnchanged();
});

test.each([
  ['Brawndo safeguard 1.2', 'demo_brawndo', '1.2', 'demo'],
  ['Initech safeguard 1.1', 'demo_initech', '1.1', 'demo'],
  ['standard-mode safeguard 1.1', 'demo_brawndo', '1.1', 'standard'],
])('%s retains its existing presentation and native record outside the exact pilot', async (_name, selectedClient, id, mode) => {
  await loadSafeguard(id, selectedClient);
  if (mode === 'standard') mockAuth = {...mockAuth, workspaceMode: 'standard', user: {...mockAuth.user, workspace_mode: 'standard'}};
  await render();
  expect(surface().classList.contains('brawndo-assessment-pilot')).toBe(false);
  const requirement = surface().querySelector('.cis-collapsible-requirement');
  expect(requirement.open).toBe(false);
  expect(requirement.querySelector('.cis-native-requirement-meta')).toBeNull();
  expect(surface().querySelector('.cis-native-requirement > .cis-native-requirement-meta')).toBeTruthy();
  expect(surface().querySelector('.brawndo-pilot-tool-field')).toBeNull();
  expect(surface().querySelector('.brawndo-pilot-guidance')).toBeNull();
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(baseline.implementation);
  await openInterview();
  expect(guide().querySelector('.brawndo-pilot-guidance')).toBeNull();
  expect(button(guide(), 'Save & close')).toBeTruthy();
  expect(button(guide(), 'Save progress')).toBeUndefined();
  expect(putSpy).not.toHaveBeenCalled();
  await assertAssessmentUnchanged();
});
