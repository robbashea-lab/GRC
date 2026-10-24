import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import api from '@/lib/api';
import {riskMatches} from '@/lib/brawndoRisks';
import CisRisksConcept from './CisRisksConcept';

jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn()}, formatError: error => error.message}));

const now = new Date('2026-10-24T18:00:00Z');
const base = {client_id: 'fixture-client', status: 'assessed', likelihood_score: 3, impact_score: 4};
let root, container, props;
const click = element => act(async () => element.click());
const findButton = (text, scope = document) => [...scope.querySelectorAll('button')].find(button => button.textContent === text);
const render = async (changes = {}) => {
  props = {...props, ...changes};
  await act(async () => root.render(<CisRisksConcept {...props}/>));
};

beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  api.get.mockResolvedValue({data: []});
  const rows = [{...base, risk_id: 'r1', display_id: 'RISK-001', title: 'Recovery risk', next_review: '2026-12-28', last_reviewed: '2026-09-27'},
    {...base, risk_id: 'r2', display_id: 'RISK-002', title: 'Unrated risk', likelihood_score: null, impact_score: null}];
  props = {rows, filtered: rows, users: [], matches: riskMatches, view: 'all_active', onView: jest.fn(), search: '', onSearch: jest.fn(),
    table: {state: {filters: {}}, setSort: jest.fn()}, filters: <span>Native controls</span>, onOpenRisk: jest.fn(), onOpenEvent: jest.fn(),
    onNewRisk: jest.fn(), onRiskScale: jest.fn(), onExport: jest.fn(), canWrite: true, clientId: 'fixture-client', clientName: 'Fixture', scope: 'actor:fixture-client:demo:ig1', now};
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test('all 25 matrix scores and exact members lead to the native Risk while unrated records remain in the register', async () => {
  await render();
  const cells = [...container.querySelectorAll('.matrix-cell')];
  expect(cells).toHaveLength(25);
  expect(cells.map(cell => cell.querySelector('.matrix-score').textContent)).toEqual([5, 4, 3, 2, 1].flatMap(l => [1, 2, 3, 4, 5].map(i => String(l * i))));
  expect(container.querySelector('.matrix-panel').textContent).not.toMatch(/active risks|unrated/);
  expect(container.querySelector('#actionRows').textContent).toContain('Unrated risk');
  expect(container.querySelector('#actionRows').textContent).toContain('Needs assessment');
  await click(cells.find(cell => cell.getAttribute('aria-label').startsWith('Likelihood 3, impact 4,')));
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain('1 risk at score 12');
  expect(dialog.querySelectorAll('.date-review')).toHaveLength(1);
  await click(dialog.querySelector('.date-review'));
  expect(props.onOpenRisk).toHaveBeenCalledWith(props.rows[0]);
  expect(props.onOpenEvent).not.toHaveBeenCalled();
  for (const method of ['post', 'put', 'patch', 'delete']) expect(api[method]).not.toHaveBeenCalled();
});

test('same-date circles retain separate review, expiry and linked Action identities, with exact native destinations', async () => {
  const risk = {...base, risk_id: 'accepted', display_id: 'RISK-003', title: 'Accepted risk', status: 'accepted',
    next_review: '2026-11-17', acceptance_expires_at: '2026-11-17', accepted_by: 'actor', acceptance_date: '2026-10-01', acceptance_rationale: 'Recorded decision'};
  const action = {client_id: risk.client_id, task_id: 'action-1', risk_id: risk.risk_id, title: 'Exact treatment', status: 'open', due_date: '2026-11-17', assignee_id: 'analyst'};
  api.get.mockResolvedValue({data: [action]});
  await render({rows: [risk], filtered: [risk], users: [{user_id: 'analyst', name: 'Assigned analyst'}]});
  expect(api.get).toHaveBeenCalledWith('/tasks', expect.objectContaining({params: {client_id: risk.client_id}}));
  const circles = container.querySelectorAll('.review-dot');
  expect(circles).toHaveLength(3);
  expect([...circles].map(circle => circle.querySelector('.dot').textContent)).toEqual(['', '', '']);
  expect([...circles].map(circle => circle.style.getPropertyValue('--cadence')).sort()).toEqual(['#199681', '#2f66c6', '#b38131'].sort());
  const treatmentCircle = [...circles].find(circle => circle.getAttribute('aria-label').startsWith('Treatment action,'));
  await act(async () => treatmentCircle.focus());
  expect(document.querySelector('[role="tooltip"]').textContent).toContain('Assigned analyst');
  await click(treatmentCircle);
  const selected = document.querySelector('.date-review.highlight');
  expect(selected.textContent).toContain('Exact treatment');
  expect(selected.textContent).toContain('Assigned analyst');
  expect(document.querySelectorAll('.date-review')).toHaveLength(3);
  expect(props.onOpenEvent).not.toHaveBeenCalled();
  await click(selected);
  expect(props.onOpenEvent).toHaveBeenCalledWith('tasks', action);
  await click([...container.querySelectorAll('.review-dot')].find(circle => circle.getAttribute('aria-label').startsWith('Risk review,')));
  await click(document.querySelector('.date-review.highlight'));
  expect(props.onOpenEvent).toHaveBeenLastCalledWith('risks', risk);
  for (const method of ['post', 'put', 'patch', 'delete']) expect(api[method]).not.toHaveBeenCalled();
});

test('quarter and legend selection are presentation only, keep summaries/register unchanged, and do not clamp Today into future quarters', async () => {
  const rows = [{...base, risk_id: 'r1', title: 'January review', next_review: '2027-01-17'},
    {...base, risk_id: 'r2', title: 'Second January review', next_review: '2027-01-17'}];
  await render({rows, filtered: rows});
  const summaries = container.querySelector('.kpis').textContent, register = container.querySelector('.register').textContent;
  const readCount = api.get.mock.calls.length;
  await click(container.querySelector('[aria-label="Next quarter"]'));
  expect(container.querySelector('.quarter-controls strong').textContent).toBe('Q1 2027');
  expect(container.querySelector('.today-line')).toBeNull();
  expect(container.querySelectorAll('.review-dot')).toHaveLength(2);
  await click(container.querySelector('[aria-label="Show treatment action events"]'));
  expect(container.querySelectorAll('.review-dot')).toHaveLength(0);
  expect(container.querySelector('.kpis').textContent).toBe(summaries);
  expect(container.querySelector('.register').textContent).toBe(register);
  expect(api.get.mock.calls).toHaveLength(readCount);
  for (const method of ['post', 'put', 'patch', 'delete']) expect(api[method]).not.toHaveBeenCalled();
});

test('complete Action collection retains treatment events beyond the old related display cap and deduplicates shared links', async () => {
  const tasks = Array.from({length: 205}, (_, index) => ({client_id: base.client_id, task_id: `task-${index}`, title: `Treatment ${index}`, risk_id: 'r1', status: 'open', due_date: '2026-11-20'}));
  const rows = [{...base, risk_id: 'r1', title: 'First Risk'}, {...base, risk_id: 'r2', title: 'Second Risk', related_task_ids: tasks.map(task => task.task_id)}];
  api.get.mockResolvedValue({data: tasks});
  await render({rows, filtered: rows});
  expect(container.querySelectorAll('.review-dot')).toHaveLength(205);
  await click(findButton('View data', container));
  expect(document.querySelectorAll('.date-review')).toHaveLength(205);
  const last = [...document.querySelectorAll('.date-review')].find(button => button.textContent.includes('Treatment 204'));
  await click(last);
  expect(props.onOpenEvent).toHaveBeenCalledWith('tasks', tasks[204]);
});

test('empty collections use the explicit current client and failures remain visible without fabricating Action dates', async () => {
  api.get.mockRejectedValue(new Error('Collection unavailable'));
  await render({rows: [], filtered: [], canWrite: false});
  expect(api.get).toHaveBeenCalledWith('/tasks', expect.objectContaining({params: {client_id: 'fixture-client'}}));
  expect(container.querySelector('[role="alert"]').textContent).toContain('Collection unavailable');
  expect(container.querySelector('[data-testid="new-risk"]')).toBeNull();
  expect(container.querySelectorAll('.review-dot')).toHaveLength(0);
});

test('actor/client scope changes abort old Action reads and withhold stale event links', async () => {
  let resolveOld;
  api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await render();
  const signal = api.get.mock.calls[0][1].signal;
  await render({clientId: 'new-client', rows: [], filtered: [], scope: 'new-actor:new-client:standard:ig3'});
  expect(signal.aborted).toBe(true);
  await act(async () => resolveOld({data: [{client_id: base.client_id, task_id: 'stale', risk_id: 'r1', title: 'Old Action', status: 'open', due_date: '2026-11-01'}]}));
  expect(container.textContent).not.toContain('Old Action');
  expect(props.onOpenEvent).not.toHaveBeenCalled();
});

test('an open data list follows the pending authorized Action collection instead of freezing an empty snapshot', async () => {
  let resolveTasks;
  api.get.mockImplementationOnce(() => new Promise(resolve => { resolveTasks = resolve; }));
  const rows = [{...base, risk_id: 'r1', title: 'Undated Risk'}];
  await render({rows, filtered: rows});
  await click(findButton('View data', container));
  expect(document.querySelector('[role="dialog"]').textContent).toContain('Loading linked Action deadlines');
  expect(document.querySelector('[role="dialog"]').textContent).not.toContain('No saved events in this selection');
  const task = {client_id: base.client_id, task_id: 'loaded-later', risk_id: 'r1', title: 'Authorized late response', status: 'open', due_date: '2026-11-01'};
  await act(async () => resolveTasks({data: [task]}));
  expect(document.querySelectorAll('.date-review')).toHaveLength(1);
  expect(document.querySelector('[role="dialog"]').textContent).toContain('1 events');
  await click(document.querySelector('.date-review'));
  expect(props.onOpenEvent).toHaveBeenCalledWith('tasks', task);
});

test('Filters focuses an existing control and Escape restores the connected opener without native editor focus theft', async () => {
  await render({filters: <button type="button">Existing filter</button>});
  const trigger = container.querySelector('.filter-button');
  await click(trigger);
  expect(document.activeElement.textContent).toBe('Existing filter');
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  expect(container.querySelector('.filter-panel')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await render({recordOpen: true});
  const nativeInput = document.createElement('input'); document.body.appendChild(nativeInput); nativeInput.focus();
  await act(async () => nativeInput.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  expect(document.activeElement).toBe(nativeInput);
  nativeInput.remove();
});

test('clearing a search preserves the selected Accepted collection', async () => {
  await render({view: 'accepted', search: 'saved'});
  await click(findButton('Clear filters', container));
  expect(props.onView).toHaveBeenCalledWith('accepted');
});
