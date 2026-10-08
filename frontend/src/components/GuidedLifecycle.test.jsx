import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import * as guided from '@/lib/guidedAssessment';
import api from '@/lib/api';
import pilotConfiguration from '@catalogs/omniWorkspacePilot.json';

jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn(), put: jest.fn()}, formatError: error => error.message}));
let mockUser;
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: mockUser})}));

let container, root, stored, props;
const token = '2026-09-01T12:00:00Z';
const fingerprint = 'a'.repeat(64);
const base = '/framework_assessments/lifecycle-1.1/guided-assessment';
const work = extra => ({context_complete: true, finding_ids: [], review_ids: [], task_ids: [], open_findings: 0, open_actions: 0, overdue_reviews: 0, overdue_actions: 0, next_review_due: null, ...extra});
const record = extra => ({client_id: 'demo_brawndo', framework_key: 'cis-ig1', framework_assessment_id: 'lifecycle-1.1', definition_id: '1.1', title: 'Enterprise Asset Inventory', status: 'addressed', verification: 'verified', implementation: 'Previously saved native position.', last_assessed: token, assessment_history: [], work: work(), ...extra});
const interview = extra => ({client_id: 'demo_brawndo', assessment_id: 'lifecycle-1.1', user_id: 'actor-a', version: guided.versionForSafeguard('1.1', true), revision: 0, answers: {}, step: 0, completed: false, narrative: '', result: null, base_assessment_token: token, base_scope_fingerprint: fingerprint, current_assessment_token: token, current_scope_fingerprint: fingerprint, lineage_known: true, lineage_stale: false, ...extra});
const snapshot = extra => ({status: 'addressed', narrative: 'Original persisted recommendation.', basis: ['Original recorded basis.'], gaps: [], unknowns: [], nextSteps: [], evidence: ['Original suggested support.'], answers: [{prompt: 'Original prompt', answer: 'Original answer'}], signals: [], version: guided.versionForSafeguard('1.1', true), ...extra});
const completed = extra => interview({revision: 3, completed: true, answers: {inventory: 'No'}, generated_at: '2026-09-02T12:00:00Z', updated_at: '2026-09-02T12:00:00Z', narrative: 'Original persisted recommendation.', result: snapshot(), ...extra});
const button = name => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === name);
async function render(extra = {}) { props = {...props, ...extra}; await act(async () => root.render(<GuidedAssessor {...props}/>)); }
async function click(name) { const target = button(name); expect(target).toBeTruthy(); await act(async () => target.click()); }
async function open() { await act(async () => document.querySelector('[aria-label="Open Omni guided assessment"]').click()); }
async function select(value) {
  const target = document.querySelector('.guided-panel select'); expect(target).toBeTruthy();
  await act(async () => {Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(target, value); target.dispatchEvent(new Event('change', {bubbles: true}));});
}
async function editNarrative(value) {
  const target = document.querySelector('[aria-label="Guided Current Implementation draft"]'); expect(target).toBeTruthy();
  await act(async () => {Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(target, value); target.dispatchEvent(new Event('input', {bubbles: true}));});
}
async function remount() { await act(async () => root.unmount()); root = createRoot(container); await render(); }

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState({}, '', '/');
  mockUser = {user_id: 'actor-a', workspace_mode: 'demo'};
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  stored = interview();
  props = {clientId: 'demo_brawndo', framework: 'cis-ig1', configuration: {implementation_group: 1}, record: record(), contextComplete: true, related: {}, form: {implementation: ''}, onApply: jest.fn(), onOpenNative: jest.fn()};
  api.get.mockImplementation(async path => ({data: path.endsWith('/history') ? {items: [], has_more: false, next_before_revision: null} : stored}));
  api.put.mockImplementation(async (_path, body) => ({data: stored = {...stored, ...body, revision: body.expected_revision + 1, generated_at: body.completed ? '2026-10-07T12:00:00Z' : null, updated_at: '2026-10-07T12:00:00Z'}}));
});
afterEach(async () => {await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); jest.clearAllMocks();});

test('opening a saved manual assessment shows its position before any interview or write', async () => {
  const saved = record({assessment_origin: 'manual'});
  await render({record: saved}); await open();
  expect(document.body.textContent).toContain('Current saved position');
  expect(document.body.textContent).toContain('Previously saved native position.');
  expect(document.body.textContent).toContain('This saved assessment remains valid without an Omni interview');
  expect(document.querySelector('.guided-panel select')).toBeNull();
  expect(button('Start')).toBeUndefined();
  expect(api.put).not.toHaveBeenCalled(); expect(props.onApply).not.toHaveBeenCalled();
});

test('Start is an intentional action and minimizing preserves unsaved interview values', async () => {
  const initial = record({status: 'not_assessed', verification: 'not_verified', implementation: '', last_assessed: null});
  stored = interview({base_assessment_token: null, current_assessment_token: null});
  await render({record: initial}); await open();
  expect(document.querySelector('.guided-panel select')).toBeNull();
  await click('Start'); await select('Not sure');
  await act(async () => document.querySelector('[aria-label="Minimize Omni Guide"]').click()); await open();
  expect(document.querySelector('.guided-panel select').value).toBe('Not sure');
  expect(api.put).not.toHaveBeenCalled();
});

test('Resume uses the exact original version and existing checkpoint rather than restarting', async () => {
  const oldVersion = guided.versionForSafeguard('1.1');
  stored = interview({version: oldVersion, revision: 4, answers: {inventory: 'Not sure'}});
  await render(); await open();
  expect(document.querySelector('.guided-panel select')).toBeNull();
  await click('Resume your review');
  expect(document.querySelector('.guided-panel select').value).toBe('Not sure');
  await click('Save and exit');
  expect(api.put).toHaveBeenCalledWith(base, expect.objectContaining({version: oldVersion, expected_revision: 4, answers: {inventory: 'Not sure'}, completed: false}));
  expect(api.put.mock.calls[0][1].restart).toBeUndefined();
});

test.each([true, false])('completed historical output is never regenerated on open (structured result recorded: %s)', async recorded => {
  const generate = jest.spyOn(guided, 'generateResult');
  stored = completed({result: recorded ? snapshot() : null});
  await render(); await open(); await click('Review recommendation');
  expect(document.querySelector('[aria-label="Guided Current Implementation draft"]').value).toBe('Original persisted recommendation.');
  expect(generate).not.toHaveBeenCalled();
  expect(api.put).not.toHaveBeenCalled();
  if (recorded) expect(document.body.textContent).toContain('Original recorded basis.');
  else {
    expect(document.body.textContent.toLowerCase()).toContain('original structured recommendation');
    expect(document.body.textContent).not.toContain('None reported.');
    expect(button('Apply to Assessment').disabled).toBe(true);
    await click('Save and exit');
    expect(generate).not.toHaveBeenCalled();
    expect(api.put).toHaveBeenCalledWith(base, expect.objectContaining({result: null, completed: true, narrative: 'Original persisted recommendation.', expected_revision: 3, version: stored.version}));
  }
});

test('No changes reported writes no native or interview state, dates, Findings, or approvals', async () => {
  const before = JSON.stringify(props.record);
  await render(); await open(); await click('Review changes');
  const choice = [...document.querySelectorAll('label')].find(label => label.textContent.includes('No changes reported')).querySelector('input');
  await act(async () => choice.click());
  expect(document.body.textContent).toContain('review schedule and approvals remain unchanged');
  expect(api.put).not.toHaveBeenCalled(); expect(props.onApply).not.toHaveBeenCalled(); expect(props.onOpenNative).not.toHaveBeenCalled();
  expect(JSON.stringify(props.record)).toBe(before);
});

test('finding navigation opens the actual linked native record without creating an interview', async () => {
  const finding = {finding_id: 'f-a', client_id: 'demo_brawndo', title: 'Original native Finding', status: 'open', severity: 'high', due_date: '2026-10-08'};
  await render({record: record({work: work({finding_ids: ['f-a'], open_findings: 1})}), related: {findings: [finding]}}); await open();
  await click('Review findings'); await click('Original native Finding');
  expect(props.onOpenNative).toHaveBeenCalledWith('findings', finding);
  expect(api.put).not.toHaveBeenCalled(); expect(props.onApply).not.toHaveBeenCalled();
});

test('read-only saved interview permits viewing and never enables apply or restart', async () => {
  stored = completed(); await render({disabled: true}); await open(); await click('Review recommendation');
  expect(button('Apply to Assessment').disabled).toBe(true);
  expect(button('Save and exit').disabled).toBe(true);
  expect(button('Start a new review').disabled).toBe(true);
  expect(button('Full reassessment')).toBeUndefined();
  expect(document.querySelector('[aria-label="Guided Current Implementation draft"]').disabled).toBe(true);
  expect(api.put).not.toHaveBeenCalled();
});

test('failed GET reports unavailable interview context and does not present a new assessment', async () => {
  api.get.mockRejectedValueOnce(new Error('Synthetic interview unavailable'));
  await render(); await open();
  expect(document.querySelector('[role="alert"]').textContent).toContain('Synthetic interview unavailable');
  expect(document.body.textContent).toContain('Some context is unavailable');
  expect(button('Start')).toBeUndefined(); expect(button('Full reassessment')).toBeUndefined();
  expect(document.querySelector('.guided-panel select')).toBeNull(); expect(api.put).not.toHaveBeenCalled();
});

test('dirty interview, unsaved native draft, and stale native position each block Apply', async () => {
  stored = completed(); await render(); await open(); await click('Review recommendation');
  expect(button('Apply to Assessment').disabled).toBe(false);
  await editNarrative('An unsaved interview edit.'); expect(button('Apply to Assessment').disabled).toBe(true);
  await editNarrative('Original persisted recommendation.'); expect(button('Apply to Assessment').disabled).toBe(false);
  await render({assessmentDirty: true}); expect(button('Apply to Assessment').disabled).toBe(true);
  await render({assessmentDirty: false, current: record({last_saved: '2026-10-05T12:00:00Z'})});
  expect(button('Apply to Assessment').disabled).toBe(true);
  expect(document.body.textContent).toContain('Assessment or scope changed'); expect(props.onApply).not.toHaveBeenCalled();
});

test('a failed restart retains original completed result, question version, and expected revision', async () => {
  stored = completed({version: guided.versionForSafeguard('1.1')});
  await render(); await open(); await click('Review recommendation');
  api.put.mockRejectedValueOnce(new Error('Synthetic restart conflict'));
  await click('Full reassessment'); await click('Confirm restart');
  expect(document.querySelector('[role="alert"]').textContent).toContain('Synthetic restart conflict');
  expect(document.querySelector('[aria-label="Guided Current Implementation draft"]').value).toBe('Original persisted recommendation.');
  expect(document.body.textContent).toContain(`Question set: ${guided.versionForSafeguard('1.1')}`);
  expect(stored.revision).toBe(3);
  expect(api.put).toHaveBeenCalledWith(base, expect.objectContaining({version: guided.versionForSafeguard('1.1', true), restart: true, expected_revision: 3, answers: {}, completed: false, result: null}));
});

test('an explicit restart after native Save uses the visible current base and preserves interview CAS', async () => {
  stored = completed();
  await render(); await open();
  const nativeToken = '2026-10-07T13:00:00Z';
  await render({current: record({last_saved: nativeToken})});
  api.get.mockResolvedValueOnce({data: {...stored, current_assessment_token: nativeToken}});
  await click('Full reassessment'); await click('Confirm restart');
  expect(api.put).toHaveBeenCalledWith(base, expect.objectContaining({restart: true, expected_revision: 3, answers: {}, completed: false, result: null, base_assessment_token: nativeToken, base_scope_fingerprint: fingerprint}));
  expect(stored.revision).toBe(4);
  expect(document.querySelector('.guided-panel select').value).toBe('');
  expect(props.current.implementation).toBe('Previously saved native position.');
});

test('a first empty interview after manual native Save reads its current base without creating history', async () => {
  stored = interview();
  await render(); await open();
  const nativeToken = '2026-10-07T13:00:00Z';
  await render({current: record({last_saved: nativeToken})});
  api.get.mockResolvedValueOnce({data: {...stored, current_assessment_token: nativeToken}});
  await click('Full reassessment');
  expect(api.put).not.toHaveBeenCalled();
  await select('No'); await click('Save and exit');
  expect(api.put).toHaveBeenCalledWith(base, expect.objectContaining({expected_revision: 0, base_assessment_token: nativeToken, base_scope_fingerprint: fingerprint}));
  expect(api.put.mock.calls[0][1].restart).toBeUndefined();
});

test.each([{revision: 4}, {current_assessment_token: '2026-10-07T13:00:00Z'}, {current_scope_fingerprint: 'b'.repeat(64)}])('a changed restart context keeps the original interview and does not adopt a new token: %j', async change => {
  stored = completed();
  await render(); await open(); await click('Review recommendation');
  api.get.mockResolvedValueOnce({data: {...stored, ...change}});
  await click('Full reassessment'); await click('Confirm restart');
  expect(api.put).not.toHaveBeenCalled();
  expect(stored.revision).toBe(3);
  expect(document.querySelector('[role="alert"]').textContent).toContain('Reopen the assessment');
  expect(document.querySelector('[aria-label="Guided Current Implementation draft"]').value).toBe('Original persisted recommendation.');
});

test.each(['Not now', 'Quiet for this session', 'Turn off invitations'])('%s suppresses invitations while the intentional launcher remains available', async choice => {
  await render(); expect(document.querySelector('.guided-context-prompt')).toBeTruthy(); await click(choice); await remount();
  expect(document.querySelector('.guided-context-prompt')).toBeNull();
  expect(document.querySelector('[aria-label="Open Omni guided assessment"]')).toBeTruthy();
  await open(); expect(document.body.textContent).toContain('Current saved position'); expect(api.put).not.toHaveBeenCalled();
});

test('personal invitation preferences and saved interviews are isolated when the user switches', async () => {
  stored = completed(); await render(); await open(); await click('Review recommendation');
  await act(async () => document.querySelector('[aria-label="Close Omni Guide"]').click());
  localStorage.setItem('guided-pilot-ui:actor-b:demo_brawndo', JSON.stringify({invitationsDisabled: true}));
  stored = interview({user_id: 'actor-b'}); mockUser = {user_id: 'actor-b', workspace_mode: 'demo'};
  await render();
  expect(document.querySelector('.guided-context-prompt')).toBeNull();
  await open(); expect(document.body.textContent).not.toContain('Original persisted recommendation.');
  expect(button('Review recommendation')).toBeUndefined(); expect(api.put).not.toHaveBeenCalled();
});

test('switching users resets a visible invitation to the new user preference', async () => {
  await render(); expect(document.querySelector('.guided-context-prompt')).toBeTruthy();
  localStorage.setItem('guided-pilot-ui:actor-b:demo_brawndo', JSON.stringify({invitationsDisabled: true}));
  mockUser = {user_id: 'actor-b', workspace_mode: 'demo'}; stored = interview({user_id: 'actor-b'});
  await render();
  expect(document.querySelector('.guided-context-prompt')).toBeNull();
  expect(document.querySelector('[aria-label="Open Omni guided assessment"]')).toBeTruthy();
});

test('turning off invitations persists into a fresh browser session without hiding intentional Omni access', async () => {
  await render(); await click('Turn off invitations'); sessionStorage.clear(); await remount();
  expect(document.querySelector('.guided-context-prompt')).toBeNull();
  await open(); expect(document.body.textContent).toContain('Current saved position');
  expect(api.put).not.toHaveBeenCalled();
});

test('an aborted earlier user GET cannot overwrite the new user interview context', async () => {
  let resolveOld;
  api.get.mockImplementationOnce(() => new Promise(resolve => {resolveOld = resolve;}));
  await render();
  mockUser = {user_id: 'actor-b', workspace_mode: 'demo'}; stored = interview({user_id: 'actor-b'});
  await render(); await open();
  await act(async () => resolveOld({data: completed()}));
  expect(document.body.textContent).not.toContain('2026-09-02');
  expect(document.body.textContent).not.toContain('does not match this assessment context');
  expect(button('Review recommendation')).toBeUndefined(); expect(api.put).not.toHaveBeenCalled();
});

test('late prior-user interview history cannot be displayed for the new actor', async () => {
  let resolveHistory;
  await render(); await open();
  api.get.mockImplementationOnce(() => new Promise(resolve => {resolveHistory = resolve;}));
  await click('Review interview history');
  mockUser = {user_id: 'actor-b', workspace_mode: 'demo'}; stored = interview({user_id: 'actor-b'});
  await render();
  await act(async () => resolveHistory({data: {items: [completed({narrative: 'Private prior-actor interview history.'})], has_more: false, next_before_revision: null}}));
  expect(document.body.textContent).not.toContain('Private prior-actor interview history.');
  expect(api.put).not.toHaveBeenCalled();
});

test('switching to the other approved client keeps its independent saved position and personal context', async () => {
  stored = completed(); await render(); await open(); await click('Review recommendation');
  const clientId = pilotConfiguration.stagingClientIds[0];
  mockUser = {user_id: 'actor-a', workspace_mode: 'standard'};
  stored = interview({client_id: clientId, assessment_id: 'staging-1.1'});
  await render({clientId, record: record({client_id: clientId, framework_assessment_id: 'staging-1.1', implementation: 'Independent staging native position.'})});
  await open();
  expect(document.body.textContent).toContain('Independent staging native position.');
  expect(document.body.textContent).not.toContain('Original persisted recommendation.');
  expect(api.get).toHaveBeenLastCalledWith('/framework_assessments/staging-1.1/guided-assessment', expect.objectContaining({signal: expect.any(AbortSignal)}));
  expect(api.put).not.toHaveBeenCalled();
});
