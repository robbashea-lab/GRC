import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {catalogForVersion, versionForSafeguard, visibleQuestions} from '@/lib/guidedAssessment';
import {omniGroups} from '@/lib/refinedOmni';
import {omniCisSummary} from '@/lib/omniCisSummary';
import {nativeCisQuestionTitle} from './RefinedOmniInterview';
import {buildLegacyDemoStore, saveStore} from '../preview/store';

let mockAuth, mockOrg;
beforeAll(() => Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto}));
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true, API: '/api',
  default: require('axios').default.create({adapter: require('../preview/adapter').previewAdapter}),
  formatError: error => error.response?.data?.detail || error.message}));
jest.mock('react-router-dom', () => ({Link: ({children, to}) => <a href={to}>{children}</a>,
  useNavigate: () => jest.fn()}), {virtual: true});
jest.mock('sonner', () => ({toast: {error: jest.fn(), success: jest.fn()}}));
// Deliberately no presentation-eligibility, questionnaire, result or adapter mock.
// Standard mode below exercises the actual native Preview transport, not backend authorization.

const copy = value => JSON.parse(JSON.stringify(value));
const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
};
const customTool = '  Existing maintained source\nplus a local reconciliation register  ';
const matrixContext = 'Retain this exact reported matrix context; no Finding is created.';
let root, host, record, baseline, relatedBefore, clientId, base, version, onClose;
let getSpy, putSpy, patchSpy, postSpy, deleteSpy;
const surface = () => document.querySelector('[data-testid="brawndo-cis-assessment"]');
const guide = () => surface().querySelector('[aria-label="CIS assessment interview"]');
const currentQuestionId = () => guide().querySelector('fieldset[data-question-id]')?.dataset.questionId;
const button = (scope, name) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === name);
const draftDialog = () => document.querySelector('.brawndo-pilot-draft[role="dialog"]');
const writes = () => [putSpy, patchSpy, postSpy, deleteSpy];
const nativeWrites = () => patchSpy.mock.calls.filter(([url]) => url === base);

async function nativeAction(action) {
  const spies = [getSpy, ...writes()];
  const starts = spies.map(spy => spy.mock.results.length);
  await act(async () => {
    action();
    // Await the actual requests started by this native action, including chained reads.
    while (true) {
      const pending = spies.flatMap((spy, index) => {
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
async function loadSafeguard(id, selectedClient = 'demo_brawndo', mode = 'demo') {
  clientId = selectedClient;
  if (mode === 'standard') mockAuth = {...mockAuth, workspaceMode: 'standard',
    user: {...mockAuth.user, workspace_mode: 'standard'}};
  const clients = (await api.get('/clients')).data;
  const currentClient = clients.find(client => client.client_id === clientId);
  expect(currentClient).toBeTruthy();
  mockOrg = {currentClientId: clientId, currentClient, clients, loading: false, error: null};
  sessionStorage.setItem('grc_client_id', clientId);
  window.history.replaceState({}, '', '/compliance/cis-ig1?client_id=' + clientId);
  const workspace = (await api.get('/frameworks/cis-ig1', {params: {client_id: clientId}})).data;
  expect(workspace).toMatchObject({selected: true, configured: true,
    framework: {key: 'cis-ig1', version: '8.1'}});
  record = workspace.assessments.find(row => row.definition_id === id);
  expect(record).toMatchObject({client_id: clientId, framework_key: 'cis-ig1',
    framework_version: '8.1', definition_id: id});
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
}
async function render() {
  const routes = new Set([base + '/related', '/clients/' + clientId + '/members',
    '/contacts', '/comments', base + '/activity', '/frameworks/cis-ig1', base + '/guided-assessment']);
  let nextRead = getSpy.mock.results.length;
  await act(async () => root.render(<FrameworkDrawer open visualReference record={record}
    clientId={clientId} onOpenChange={onClose}/>));
  while (true) {
    const first = nextRead;
    nextRead = getSpy.mock.results.length;
    const reads = getSpy.mock.calls.slice(first, nextRead).flatMap(([url], offset) =>
      routes.has(url) ? [getSpy.mock.results[first + offset].value] : []);
    if (!reads.length) return;
    await act(async () => { await Promise.allSettled(reads); });
  }
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
async function assertNativeUnchanged() {
  expect((await api.get(base)).data).toEqual(baseline);
  expect((await api.get(base + '/related')).data).toEqual(relatedBefore);
  expect(nativeWrites()).toHaveLength(0);
  expect(postSpy).not.toHaveBeenCalled();
  expect(deleteSpy).not.toHaveBeenCalled();
}
function clearWrites() {
  for (const spy of writes()) spy.mockClear();
}
function rootId() {
  return catalogForVersion(version).definitions[record.definition_id].root;
}
function nativeAnswers({uncertain = true} = {}) {
  const id = record.definition_id;
  const questions = catalogForVersion(version).safeguards[id];
  const firstMatrix = questions.find(question => question.type === 'matrix');
  const complete = Object.fromEntries(questions.map(question => {
    if (question.type === 'matrix') return [question.id, Object.fromEntries(question.rows.map((row, index) =>
      [row, uncertain && question.id === firstMatrix.id && index === 0 ? 'Not sure' : 'Yes']))];
    if (question.type === 'multi') return [question.id, [question.choices[0]]];
    if (question.type === 'date') return [question.id, today()];
    if (question.type === 'text') {
      const context = {system: customTool,
        unknowns: 'The owner must confirm the first reported requirement.',
        gaps: 'A reported implementation gap remains under review.'};
      return [question.id, context[question.id] || 'Synthetic reported context for ' + question.id + '.'];
    }
    if (question.id === 'additional_gap') return [question.id, 'No'];
    if (question.id === 'additional_confirmation') return [question.id, uncertain ? 'Yes' : 'No'];
    if (question.id === 'sources') return [question.id, 'One source'];
    if (id === '1.1' && question.id === 'frequency') return [question.id, 'Every six months'];
    return [question.id, 'Yes'];
  }));
  // Resolve native conditions against the full proposed facts, then answer only
  // fields the actual questionnaire exposes; retained hidden branches are not filled.
  return Object.fromEntries(visibleQuestions(id, complete, version)
    .map(question => [question.id, complete[question.id]]));
}
async function fillCurrent(answers) {
  const field = guide().querySelector('fieldset[data-question-id]');
  expect(field).toBeTruthy();
  const question = catalogForVersion(version).safeguards[record.definition_id]
    .find(item => item.id === field.dataset.questionId);
  const answer = answers[question.id];
  expect(answer).toBeDefined();
  if (question.type === 'matrix') {
    const control = field.querySelector('select');
    const row = control.getAttribute('aria-label');
    expect(question.rows).toContain(row);
    await edit(control, answer[row]);
  } else if (question.type === 'multi') {
    for (const input of field.querySelectorAll('input[type="checkbox"]')) {
      const wanted = answer.includes(input.parentElement.textContent.trim());
      if (input.checked !== wanted) await nativeAction(() => input.click());
    }
  } else if (question.type === 'text') {
    const tool = field.querySelector('.brawndo-pilot-tool-field select');
    if (tool) await edit(tool, '__other__');
    await edit(field.querySelector('textarea'), answer);
  } else await edit(field.querySelector(question.type === 'date' ? 'input[type="date"]' : 'select'), answer);
}
async function advanceTo(questionId, answers) {
  const ordered = () => omniGroups(record.definition_id, answers, version).flatMap(group => group.questions);
  for (let count = 0; count < 120; count++) {
    if (currentQuestionId() === questionId) return;
    const current = ordered().findIndex(question => question.id === currentQuestionId());
    const target = ordered().findIndex(question => question.id === questionId);
    expect(current).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThanOrEqual(0);
    if (target < current) await click(guide(), 'Back');
    else { await fillCurrent(answers); await click(guide(), 'Continue'); }
  }
  throw new Error('Native question not reached: ' + questionId);
}
async function reviewAllResponses(answers) {
  for (let count = 0; count < 160; count++) {
    await fillCurrent(answers);
    if (button(guide(), 'Review responses')) {
      await click(guide(), 'Review responses');
      return;
    }
    await click(guide(), 'Continue');
  }
  throw new Error('The complete native response review was not reached.');
}
async function checkpoint(answers, {completed = false, narrative = '', result = null} = {}) {
  const initial = (await api.get(base + '/guided-assessment')).data;
  return (await api.put(base + '/guided-assessment', {version, answers, step: 0, completed,
    narrative, result, expected_revision: initial.revision,
    base_assessment_token: initial.current_assessment_token,
    base_scope_fingerprint: initial.current_scope_fingerprint})).data;
}

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  // Established isolated native fixture, also used by the remediation-source suite.
  // Keep its full Demo/CIS cohort and real storage/adapter/routes; omit unrelated
  // eight-year source population. This is not bundled-fresh seed qualification.
  const initialFixture = buildLegacyDemoStore();
  // These disposable cases begin from a deliberately partial manual judgment.
  // Only these four setup fields change; retain native IDs, links and all history.
  for (const definitionId of ['1.1', '2.1']) {
    const matches = initialFixture.framework_assessments.filter(assessment => assessment.client_id === 'demo_brawndo'
      && assessment.framework_key === 'cis-ig1' && assessment.definition_id === definitionId);
    if (matches.length !== 1) throw new Error('Expected one native synthetic fixture assessment: ' + definitionId);
    matches[0].status = 'in_progress';
    matches[0].verification = 'needs_validation';
  }
  saveStore(initialFixture, {resetFiles: true});
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

test.each([
  ['Brawndo 1.2', 'demo_brawndo', '1.2', 'demo'],
  ['Initech 1.1', 'demo_initech', '1.1', 'demo'],
  ['standard-mode 1.1', 'demo_brawndo', '1.1', 'standard'],
])('%s uses real default-on presentation without changing native saved data', async (_name, client, id, mode) => {
  await loadSafeguard(id, client, mode);
  await render();
  expect(surface().classList.contains('brawndo-assessment-pilot')).toBe(true);
  const requirement = surface().querySelector('.cis-collapsible-requirement');
  expect(requirement.open).toBe(false);
  expect(requirement.querySelector('.cis-native-requirement-meta')).toBeTruthy();
  expect(surface().querySelector('.cis-native-requirement > .cis-native-requirement-meta')).toBeNull();
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(baseline.implementation);
  await openInterview();
  const first = visibleQuestions(id, {}, version)[0];
  expect(currentQuestionId()).toBe(first.id);
  expect(guide().querySelector('fieldset select').value).toBe('');
  expect(guide().querySelector('.brawndo-pilot-guidance')).toBeTruthy();
  expect(button(guide(), 'Save progress')).toBeTruthy();
  expect(button(guide(), 'Save & close')).toBeUndefined();
  expect((await api.get(base + '/guided-assessment')).data).toMatchObject({revision: 0, answers: {}, completed: false});
  expect(putSpy).not.toHaveBeenCalled();
  await assertNativeUnchanged();
});

test.each(['1.1', '2.1'])('%s native rollout checkpoints, reviews and stages text before a separate exact native Save', async id => {
  await loadSafeguard(id, 'demo_brawndo', 'standard');
  expect(baseline).toMatchObject({status: 'in_progress', verification: 'needs_validation'});
  const answers = nativeAnswers();
  const catalogQuestions = catalogForVersion(version).safeguards[id];
  if (id === '1.1') {
    expect(catalogQuestions).toHaveLength(18);
    expect(catalogQuestions.find(question => question.id === 'coverage').rows).toHaveLength(9);
    expect(catalogQuestions.find(question => question.id === 'attributes').rows).toHaveLength(6);
  }
  const matrix = visibleQuestions(id, answers, version).find(question => question.type === 'matrix');
  const row = matrix.rows[0];
  await render();
  expect(guide().hidden).toBe(true);
  await openInterview();
  expect(currentQuestionId()).toBe(rootId());
  expect(guide().querySelector('fieldset select').value).toBe('');
  expect(putSpy).not.toHaveBeenCalled();
  await assertNativeUnchanged();
  await click(guide(), 'Continue');
  expect(currentQuestionId()).toBe(rootId());
  expect(guide().textContent).toContain('Choose an answer before continuing.');
  expect(putSpy).not.toHaveBeenCalled();
  expect(nativeWrites()).toHaveLength(0);
  await advanceTo(matrix.id, answers);
  const matrixControl = guide().querySelector('fieldset select');
  expect(matrixControl.getAttribute('aria-label')).toBe(row);
  await edit(matrixControl, id === '2.1' ? '' : 'Not sure');
  await edit(guide().querySelector('[aria-label="Known gaps or uncertainties"]'), matrixContext);
  await click(guide(), 'Save progress');
  const partial = (await api.get(base + '/guided-assessment')).data;
  expect(partial).toMatchObject({completed: false, answers: {[rootId()]: 'Yes', [matrix.id + '_detail']: matrixContext}});
  if (id === '2.1') expect(partial.answers[matrix.id]).not.toHaveProperty(row);
  else expect(partial.answers[matrix.id][row]).toBe('Not sure');
  await assertNativeUnchanged();
  await click(surface(), 'Pause & return');
  expect(guide().hidden).toBe(true);
  await remount();
  expect(guide().hidden).toBe(true);
  await openInterview();
  await advanceTo(matrix.id, answers);
  expect(guide().querySelector('fieldset select').value).toBe(id === '2.1' ? '' : 'Not sure');
  expect(guide().querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(matrixContext);
  await reviewAllResponses(answers);
  const ordered = omniGroups(id, answers, version).flatMap(group => group.questions);
  expect([...guide().querySelectorAll('.cis-answer-review > li > strong')].map(node => node.textContent))
    .toEqual(ordered.map(question => nativeCisQuestionTitle(id, question)));
  for (const question of ordered.filter(question => question.type === 'matrix')) {
    for (const exactRow of question.rows)
      expect(guide().querySelector('.cis-answer-review').textContent).toContain(exactRow + ': ' + answers[question.id][exactRow]);
  }
  const putsBeforeReview = putSpy.mock.calls.length;
  await click(guide(), 'Review implementation');
  expect(putSpy).toHaveBeenCalledTimes(putsBeforeReview + 1);
  const completed = (await api.get(base + '/guided-assessment')).data;
  expect(completed.completed).toBe(true);
  for (const [key, answer] of Object.entries(answers)) expect(completed.answers[key]).toEqual(answer);
  expect(completed.answers[matrix.id + '_detail']).toBe(matrixContext);
  expect(completed.result.status).toBe('not_assessed');
  await assertNativeUnchanged();

  let dialog = draftDialog();
  expect(dialog).toBeTruthy();
  const generated = dialog.querySelector('[aria-label="Implementation draft"]').value;
  const reviewed = 'Reviewed native rollout wording.\n\n' + baseline.implementation + '\n\n' + generated;
  await edit(dialog.querySelector('[aria-label="Implementation draft"]'), reviewed);
  expect(dialog.querySelector('.guided-replacement input').checked).toBe(false);
  expect(button(dialog, 'Apply draft').disabled).toBe(true);
  await click(dialog, 'Edit responses');
  await advanceTo('unknowns', answers);
  const updatedConfirmation = answers.unknowns + ' Confirm the updated report before applying.';
  await edit(guide().querySelector('fieldset textarea'), updatedConfirmation);
  const updatedAnswers = {...answers, unknowns: updatedConfirmation};
  await reviewAllResponses(updatedAnswers);
  await click(guide(), 'Review implementation');
  dialog = draftDialog();
  expect(dialog.querySelector('[aria-label="Implementation draft"]').value).toBe(reviewed);
  expect(dialog.textContent).toContain('Your answers changed after you edited this draft.');
  await nativeAction(() => dialog.querySelector('.guided-replacement input').click());
  expect(button(dialog, 'Apply draft').disabled).toBe(true);
  const putsBeforeConfirmation = putSpy.mock.calls.length;
  await click(dialog, 'Keep my wording after review');
  expect(putSpy).toHaveBeenCalledTimes(putsBeforeConfirmation);
  expect(button(dialog, 'Apply draft').disabled).toBe(false);
  await assertNativeUnchanged();
  await click(dialog, 'Apply draft');
  expect(guide().hidden).toBe(true);
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(reviewed);
  expect(surface().querySelector('input[name="bcsg-status"]:checked').value).toBe(baseline.status);
  expect(putSpy).toHaveBeenCalledTimes(putsBeforeConfirmation);
  await assertNativeUnchanged();
  const interviewBeforeSave = copy((await api.get(base + '/guided-assessment')).data);
  const personalHistoryBeforeSave = copy((await api.get(base + '/guided-assessment/history')).data);
  await nativeAction(() => surface().querySelector('.brawndo-assessment-navigation-close').click());
  expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Leave unsaved changes?');
  await click(document.body, 'Keep editing');
  expect(onClose).not.toHaveBeenCalled();
  await assertNativeUnchanged();
  await click(surface(), 'Save assessment');
  expect(nativeWrites()).toHaveLength(1);
  const payload = nativeWrites()[0][1];
  expect(payload).toMatchObject({implementation: reviewed, status: baseline.status,
    verification: baseline.verification, expected_last_assessed: baseline.last_saved ?? baseline.last_assessed ?? null});
  expect(payload).not.toHaveProperty('guided_assessment_source');
  const saved = (await api.get(base)).data;
  expect(saved.implementation).toBe(reviewed);
  for (const key of ['status', 'verification', 'owner_id', 'process_owner_id', 'technology', 'notes', 'na_rationale'])
    expect(saved[key]).toEqual(baseline[key]);
  expect(saved.cis_assessment_criteria).toEqual(baseline.cis_assessment_criteria ?? []);
  expect(saved.guided_assessment_source).toEqual(baseline.guided_assessment_source);
  expect(saved.items_to_address).toEqual(baseline.items_to_address);
  expect(saved.assessment_history.slice(0, baseline.assessment_history.length)).toEqual(baseline.assessment_history);
  expect(saved.assessment_history).toHaveLength(baseline.assessment_history.length + 1);
  expect(saved.assessment_history.at(-1)).toMatchObject({implementation: reviewed,
    status: baseline.status, verification: baseline.verification});
  expect(saved.last_saved).not.toBe(baseline.last_saved);
  expect((await api.get(base + '/related')).data).toEqual(relatedBefore);
  // GET truthfully enriches the immutable interview with the current native
  // token and stale-lineage flag after the separate assessment Save.
  const interviewAfterSave = (await api.get(base + '/guided-assessment')).data;
  expect(interviewAfterSave).toEqual({...interviewBeforeSave,
    current_assessment_token: saved.last_saved ?? saved.last_assessed ?? null, lineage_stale: true});
  expect((await api.get(base + '/guided-assessment/history')).data).toEqual(personalHistoryBeforeSave);
  expect(postSpy).not.toHaveBeenCalled();
  expect(deleteSpy).not.toHaveBeenCalled();
  const putsBeforeReload = putSpy.mock.calls.length;
  await remount();
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(reviewed);
  expect(surface().querySelector('input[name="bcsg-status"]:checked').value).toBe(baseline.status);
  const restored = (await api.get(base + '/guided-assessment')).data;
  expect(restored).toEqual(interviewAfterSave);
  expect(restored.answers).toEqual(interviewBeforeSave.answers);
  expect(restored.narrative).toBe(reviewed);
  expect(putSpy).toHaveBeenCalledTimes(putsBeforeReload);
  expect(nativeWrites()).toHaveLength(1);
});

test.each(['1.1', '2.1'])('%s completed personal interview restores exact text and answers without recording an assessment', async id => {
  await loadSafeguard(id, 'demo_brawndo', 'standard');
  const answers = nativeAnswers({uncertain: false});
  const result = omniCisSummary(id, answers, version, 'Brawndo', new Date()).result;
  expect(result.status).toBe('addressed');
  const narrative = 'Existing completed native interview wording remains exact.\nNo assessment is saved on entry.';
  const completed = await checkpoint(answers, {completed: true, result, narrative});
  clearWrites();
  await render();
  expect(guide().hidden).toBe(true);
  await openInterview();
  const dialog = draftDialog();
  expect(dialog).toBeTruthy();
  expect(dialog.querySelector('[aria-label="Implementation draft"]').value).toBe(narrative);
  expect((await api.get(base + '/guided-assessment')).data).toEqual(completed);
  expect(button(dialog, 'Apply draft').disabled).toBe(true);
  for (const spy of writes()) expect(spy).not.toHaveBeenCalled();
  await assertNativeUnchanged();
});

test('2.1 default-on native Save rejects a stale token and retains the local wording and newer record', async () => {
  await loadSafeguard('2.1', 'demo_brawndo', 'standard');
  await render();
  const oldToken = baseline.last_saved ?? baseline.last_assessed ?? null;
  const localText = 'Unsaved local rollout implementation; retain this after the native conflict.';
  await edit(surface().querySelector('[aria-label="Current implementation"]'), localText);
  const newer = (await api.patch(base, {implementation: baseline.implementation + '\nA newer native update.',
    expected_last_assessed: oldToken})).data;
  patchSpy.mockClear();
  await click(surface(), 'Save assessment');
  expect(nativeWrites()).toHaveLength(1);
  expect(nativeWrites()[0][1]).toMatchObject({implementation: localText, expected_last_assessed: oldToken});
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

test('2.1 real default-on read-only presentation cannot change answers or save the assessment', async () => {
  await loadSafeguard('2.1', 'demo_brawndo', 'standard');
  mockAuth = {...mockAuth, user: {...mockAuth.user, role: 'client_viewer'}};
  await render();
  expect(surface().classList.contains('brawndo-assessment-pilot')).toBe(true);
  await openInterview();
  expect(guide().querySelector('fieldset').disabled).toBe(true);
  expect(button(guide(), 'Save progress').disabled).toBe(true);
  expect(button(surface(), 'Save assessment')).toBeUndefined();
  expect(button(surface(), 'Review implementation').disabled).toBe(true);
  for (const spy of writes()) expect(spy).not.toHaveBeenCalled();
  await assertNativeUnchanged();
});
