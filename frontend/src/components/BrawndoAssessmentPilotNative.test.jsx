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

async function render(visualReference = true, onManage) {
  const startupRoutes = new Set([base + '/related', '/clients/' + clientId + '/members',
    '/contacts', '/comments', base + '/activity', '/frameworks/' + record.framework_key,
    base + '/guided-assessment']);
  let nextRead = getSpy.mock.results.length;
  // Commit first: descendant effects can start required reads after root.render returns.
  await act(async () => root.render(<FrameworkDrawer open visualReference={visualReference}
    record={record} clientId={clientId} onOpenChange={onClose} onManage={onManage}/>));
  while (true) {
    const first = nextRead;
    nextRead = getSpy.mock.results.length;
    const reads = getSpy.mock.calls.slice(first, nextRead).flatMap(([url], offset) =>
      startupRoutes.has(url) ? [getSpy.mock.results[first + offset].value] : []);
    if (!reads.length) return;
    // Await only this render's known startup reads; preserve native failure handling.
    await act(async () => { await Promise.allSettled(reads); });
  }
}

async function chooseAssessmentDetails(label) {
  const trigger=button(surface(),'Assessment details');
  expect(trigger).toBeTruthy();
  await nativeAction(()=>trigger.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'ArrowDown'})));
  const menu=document.querySelector('[role="menu"]');
  expect(menu).toBeTruthy();
  const item=[...menu.querySelectorAll('[role="menuitem"]')].find(node=>node.textContent===label);
  expect(item).toBeTruthy();
  expect(item.hasAttribute('data-disabled')).toBe(false);
  await nativeAction(()=>item.click());
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
  expect(guide().querySelector('.brawndo-pilot-guidance').textContent).toContain('Framework requirement');
  expect(guide().querySelector('.brawndo-pilot-guidance').textContent).toContain('CIS v8.1 · 1.1');
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

test('the header notes editor keeps the same unsaved field, native Save and reload contract', async () => {
  await loadSafeguard();
  await render();
  const revised='Fictional QA note: retain the native assessment notes field.';
  await chooseAssessmentDetails('Recorded notes');
  let dialog=document.querySelector('[role="dialog"][aria-modal="true"]:not([data-assessment-shell])');
  expect(dialog.querySelector('[aria-label="Recorded notes"]').value).toBe(baseline.notes);
  await edit(dialog.querySelector('[aria-label="Recorded notes"]'),'');
  await click(dialog,'Back to assessment');
  await chooseAssessmentDetails('Recorded notes');
  expect(document.querySelector('[aria-label="Recorded notes"]').value).toBe('');
  dialog=document.querySelector('[aria-label="Recorded notes"]').closest('[role="dialog"]');
  await edit(dialog.querySelector('[aria-label="Recorded notes"]'),revised);
  await click(dialog,'Back to assessment');
  expect(document.activeElement).toBe(button(surface(),'Assessment details'));
  expect(surface().querySelector('[aria-label="Previously recorded notes"]')).toBeNull();
  expect(button(surface(),'Manage')).toBeUndefined();
  expect(button(surface(),'Review interview history')).toBeUndefined();
  await assertAssessmentUnchanged();
  await chooseAssessmentDetails('Recorded notes');
  expect(document.querySelector('[aria-label="Recorded notes"]').value).toBe(revised);
  await click(document.querySelector('[aria-label="Recorded notes"]').closest('[role="dialog"]'),'Back to assessment');
  await click(surface(),'Save assessment');
  expect(patchSpy).toHaveBeenCalledTimes(1);
  expect(patchSpy.mock.calls[0][0]).toBe(base);
  expect(patchSpy.mock.calls[0][1]).toMatchObject({notes:revised,expected_last_assessed:baseline.last_saved??baseline.last_assessed??null});
  const saved=(await api.get(base)).data;
  expect(saved.notes).toBe(revised);
  for(const key of ['status','implementation','verification','owner_id','technology'])expect(saved[key]).toEqual(baseline[key]);
  expect(saved.assessment_history.slice(0,baseline.assessment_history.length)).toEqual(baseline.assessment_history);
  expect(saved.assessment_history).toHaveLength(baseline.assessment_history.length+1);
  await remount();
  await chooseAssessmentDetails('Recorded notes');
  expect(document.querySelector('[aria-label="Recorded notes"]').value).toBe(revised);
});

test('header management uses the existing leave guard and never saves a recorded-notes draft implicitly', async () => {
  await loadSafeguard();
  const manage=jest.fn();
  await render(true,manage);
  await chooseAssessmentDetails('Recorded notes');
  await edit(document.querySelector('[aria-label="Recorded notes"]'),'Unsaved fictional notes');
  await click(document.querySelector('[aria-label="Recorded notes"]').closest('[role="dialog"]'),'Back to assessment');
  await chooseAssessmentDetails('Ownership & assessment history');
  expect(manage).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Unsaved changes');
  await click(document.querySelector('[role="alertdialog"]'),'Keep editing');
  expect(document.activeElement).toBe(button(surface(),'Assessment details'));
  await chooseAssessmentDetails('Recorded notes');
  expect(document.querySelector('[aria-label="Recorded notes"]').value).toBe('Unsaved fictional notes');
  await click(document.querySelector('[aria-label="Recorded notes"]').closest('[role="dialog"]'),'Back to assessment');
  await chooseAssessmentDetails('Ownership & assessment history');
  await click(document.querySelector('[role="alertdialog"]'),'Discard & close');
  expect(manage).toHaveBeenCalledTimes(1);
  for(const write of writes())expect(write).not.toHaveBeenCalled();
  expect((await api.get(base)).data).toEqual(baseline);
});

test('the header interview archive uses the native personal history read and preserves its recorded content', async () => {
  const nativeRead=api.get.bind(api);
  await loadSafeguard();
  const archived={revision:3,version,completed:true,user_id:mockAuth.user.user_id,updated_at:'2026-11-08T12:00:00Z',
    narrative:'Original fictional personal interview snapshot.',answers:{inventory:'Not sure'},result:null};
  getSpy.mockImplementation((url,options)=>url===base+'/guided-assessment/history'
    ?Promise.resolve({data:{items:[archived],next_before_revision:null}}):nativeRead(url,options));
  await render();
  await chooseAssessmentDetails('Interview history');
  const dialog=document.querySelector('.brawndo-pilot-history[role="dialog"]');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(surface().contains(dialog)).toBe(true);
  expect(dialog.textContent).toContain(archived.narrative);
  expect(dialog.querySelector('pre').textContent).toBe(JSON.stringify(archived.answers,null,2));
  expect(dialog.textContent).toContain('Saved interview snapshots for your account.');
  expect(getSpy).toHaveBeenCalledWith(base+'/guided-assessment/history',{params:{limit:25}});
  await click(dialog,'Close');
  expect(document.activeElement).toBe(button(surface(),'Assessment details'));
  for(const write of writes())expect(write).not.toHaveBeenCalled();
  await assertAssessmentUnchanged();
});

test.each(['unanswered inventory', 'multiple sources without scope'])('the lower implementation entry preserves the native %s guard without writes', async scenario => {
  await loadSafeguard();
  if (scenario === 'multiple sources without scope') await checkpoint({inventory: 'Yes', sources: 'Multiple reconciled sources'}, 'sources');
  clearWrites();
  await render();
  await click(surface(), 'Review implementation');
  expect(guide().hidden).toBe(false);
  expect(questionId()).toBe(scenario === 'unanswered inventory' ? 'inventory' : 'sources');
  expect(guide().textContent).toContain(scenario === 'unanswered inventory'
    ? 'Choose an answer before continuing. Not sure is a valid response.'
    : 'List each source and what it covers, or record what still needs confirmation.');
  expect(document.querySelector('.brawndo-pilot-draft')).toBeNull();
  for (const spy of writes()) expect(spy).not.toHaveBeenCalled();
  await assertAssessmentUnchanged();
});

test('the lower implementation entry accepts native Not sure without inventing an answer or saving the assessment', async () => {
  await loadSafeguard();
  const answers = {inventory: 'Not sure'};
  await checkpoint(answers, 'inventory');
  clearWrites();
  await render();
  await click(surface(), 'Review implementation');
  expect(putSpy).toHaveBeenCalledTimes(1);
  expect(putSpy.mock.calls[0]).toEqual([base + '/guided-assessment', expect.objectContaining({version, answers, completed: true})]);
  const draftDialog = document.querySelector('.brawndo-pilot-draft[role="dialog"]');
  expect(draftDialog).toBeTruthy();
  expect(draftDialog.querySelector('[aria-label="Implementation draft"]').value).toContain('not confirmed');
  expect(patchSpy).not.toHaveBeenCalled();
  expect(postSpy).not.toHaveBeenCalled();
  expect(deleteSpy).not.toHaveBeenCalled();
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
  await click(surface(), 'Pause & return');
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
  await click(guide(), 'Review responses');
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
  const draftDialog = document.querySelector('.brawndo-pilot-draft[role="dialog"]');
  expect(draftDialog).toBeTruthy();
  expect(draftDialog.getAttribute('aria-modal')).toBe('true');
  expect(surface().contains(draftDialog)).toBe(true);
  const draft = draftDialog.querySelector('[aria-label="Implementation draft"]');
  expect(document.activeElement).toBe(draft);
  expect(draft.value).toContain('Identified gaps');
  expect(draft.value).toContain('Items requiring confirmation');
  expect(draft.value).toContain('reviewed and updated annually');
  const reviewed = 'Reviewed synthetic native draft.\n\n' + draft.value + '\n\nRetain this exact edited wording.';
  await edit(draft, reviewed);
  expect(button(draftDialog, 'Apply draft').disabled).toBe(true);
  const replacement = draftDialog.querySelector('.guided-replacement input');
  expect(replacement).toBeTruthy();
  await act(async () => replacement.click());
  await click(draftDialog, 'Apply draft');
  expect(guide().hidden).toBe(true);
  expect(surface().querySelector('[aria-label="Current implementation"]').value).toBe(reviewed);
  expect(surface().querySelector('input[name="bcsg-status"]:checked').value).toBe(baseline.status);
  expect(putSpy).toHaveBeenCalledTimes(1);
  await assertAssessmentUnchanged();
  await nativeAction(() => surface().querySelector('.brawndo-assessment-navigation-close').click());
  expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Unsaved changes');
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
  await click(document.body, 'Discard & close');
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
  expect(button(surface(), 'Review implementation').disabled).toBe(true);
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

test('the real pilot launcher hands focus to the retained question on first opening and reopening without requests or writes', async () => {
  await loadSafeguard();
  await render();
  expect(guide().hidden).toBe(true);
  expect(questionId()).toBe('inventory');
  const readsBefore=getSpy.mock.calls.length;
  for(let count=0;count<2;count++){
    const launcher=button(surface(),'Resume guided assessment')||button(surface(),'Begin guided assessment');
    expect(launcher).toBeTruthy();
    launcher.focus();
    expect(document.activeElement).toBe(launcher);
    await openInterview();
    expect(questionId()).toBe('inventory');
    expect(guide().querySelector('fieldset select').value).toBe('');
    expect(document.activeElement).toBe(guide().querySelector('fieldset legend'));
    await click(surface(),'Pause & return');
    expect(guide().hidden).toBe(true);
  }
  expect(getSpy).toHaveBeenCalledTimes(readsBefore);
  for(const spy of writes())expect(spy).not.toHaveBeenCalled();
  await assertAssessmentUnchanged();
});



test('the pilot render waits for its required interview read without enabling the entry early', async () => {
  const nativeRead = api.get.bind(api);
  await loadSafeguard();
  const savedResponse = await api.get(base + '/guided-assessment');
  let releaseRead, readStarted, heldRequests = 0, renderFinished = false;
  const pendingRead = new Promise(resolve => { releaseRead = resolve; });
  const requested = new Promise(resolve => { readStarted = resolve; });
  getSpy.mockImplementation((url, options) => {
    if (url === base + '/guided-assessment' && heldRequests === 0) {
      heldRequests++;
      readStarted();
      return pendingRead;
    }
    return nativeRead(url, options);
  });
  const mounting = render();
  mounting.then(() => { renderFinished = true; }, () => { renderFinished = true; });
  try {
    const requestedBeforeCompletion = await Promise.race([
      requested.then(() => true),
      mounting.then(() => false),
    ]);
    expect(requestedBeforeCompletion).toBe(true);
    const entry = button(surface(), 'Review implementation');
    expect(entry).toBeTruthy();
    expect(entry.disabled).toBe(true);
    expect(renderFinished).toBe(false);
    for (const spy of writes()) expect(spy).not.toHaveBeenCalled();
    releaseRead(savedResponse);
    await mounting;
    expect(renderFinished).toBe(true);
    expect(button(surface(), 'Review implementation').disabled).toBe(false);
    expect(questionId()).toBe('inventory');
    expect(heldRequests).toBe(1);
    for (const spy of writes()) expect(spy).not.toHaveBeenCalled();
    await assertAssessmentUnchanged();
  } finally {
    releaseRead(savedResponse);
    await Promise.allSettled([mounting]);
  }
});

test('the real pilot Pause returns focus only after its launcher is visible without requests or writes', async () => {
  await loadSafeguard();
  await render();
  const launcher=button(surface(),'Begin guided assessment');
  expect(launcher).toBeTruthy();
  expect(launcher.closest('[hidden]')).toBeNull();
  expect(document.activeElement).not.toBe(launcher);
  const focusStates=[];
  // Observe the real focus event; JSDOM itself permits focus on hidden elements.
  const recordFocus=()=>focusStates.push({launcherHidden:!!launcher.closest('[hidden]'),interviewHidden:guide().hidden});
  launcher.addEventListener('focus',recordFocus);
  const readsBefore=getSpy.mock.calls.length;
  try{
    for(let cycle=0;cycle<2;cycle++){
      await openInterview();
      expect(document.activeElement).toBe(guide().querySelector('fieldset legend'));
      expect(launcher.closest('[hidden]')).not.toBeNull();
      await click(surface(),'Pause & return');
      expect(guide().hidden).toBe(true);
      expect(document.activeElement).toBe(launcher);
      expect(focusStates).toHaveLength(cycle+1);
      expect(focusStates.at(-1)).toEqual({launcherHidden:false,interviewHidden:true});
      expect(questionId()).toBe('inventory');
      expect(guide().querySelector('fieldset select').value).toBe('');
    }
    expect(getSpy).toHaveBeenCalledTimes(readsBefore);
    for(const spy of writes())expect(spy).not.toHaveBeenCalled();
    await assertAssessmentUnchanged();
  }finally{
    launcher.removeEventListener('focus',recordFocus);
  }
});
