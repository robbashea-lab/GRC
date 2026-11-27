import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import api from '@/lib/api';
import ReviewCompletionGuide, { ReviewCompletionRecord } from './ReviewCompletionGuide';

const mockCommand = jest.fn();
mockCommand.unconfirmed = () => false;
mockCommand.retry = jest.fn();
jest.mock('@/lib/createIntent', () => ({ useCreateIntent: () => mockCommand }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { user_id: 'fixture-owner' }, workspaceMode: 'demo' }) }));
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() }, formatError: error => error.message }));

const guide = () => ({
  template_id: 'asset', template_version: 'r4-2026-11-18', contract_token: 'a'.repeat(64),
  occurrence_id: 'fixture-cycle', expected_updated_at: 'fixture-revision', read_only: false,
  custom: false, native_gate: false, service_context: [], required_support: [], supporting_reference: '',
  steps: [{ step_id: 'asset:fixture', text: 'Synthetic operating result check' }], results: []
});
let host, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  mockCommand.mockReset();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test('an unreadable Guide response reports a safe error and never reaches the owning form', async () => {
  api.get.mockResolvedValue({ data: { steps: null } });
  const onChange = jest.fn();
  await act(async () => root.render(<ReviewCompletionGuide reviewId="fixture-review" onChange={onChange} />));
  expect(host.querySelector('[role="alert"]').textContent).toContain('could not be read');
  expect(host.querySelectorAll('input, textarea, button')).toHaveLength(0);
  expect(onChange.mock.calls.length).toBeGreaterThan(0);
  expect(onChange.mock.calls.every(([value]) => value === null)).toBe(true);
  expect(mockCommand).not.toHaveBeenCalled();
});

test('a replacement parent callback receives a pending load without reloading or clearing the selected draft', async () => {
  let finishLoad;
  api.get.mockImplementation(() => new Promise(resolve => {finishLoad = resolve;}));
  const first = jest.fn(), latest = jest.fn(), next = jest.fn(), original = guide();
  await act(async () => root.render(<ReviewCompletionGuide reviewId="fixture-review" onChange={first} />));
  await act(async () => root.render(<ReviewCompletionGuide reviewId="fixture-review" onChange={latest} />));
  expect(api.get).toHaveBeenCalledTimes(1);
  await act(async () => finishLoad({data: original}));
  expect(first).not.toHaveBeenCalledWith(original);
  expect(latest).toHaveBeenLastCalledWith(original);
  await act(async () => host.querySelector('input[type="radio"]').click());
  expect(latest.mock.calls.at(-1)[0].results).toEqual([
    {step_id: 'asset:fixture', result: 'Pass', reason: ''}
  ]);
  await act(async () => root.render(<ReviewCompletionGuide reviewId="fixture-review" onChange={next} />));
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(host.querySelector('input[type="radio"]').checked).toBe(true);
  expect(next).not.toHaveBeenCalled();
  expect(mockCommand).not.toHaveBeenCalled();
  expect(api.put).not.toHaveBeenCalled();
});

test('an unreadable checkpoint response clears the parent Guide instead of retaining a completion candidate', async () => {
  const original = guide(), onChange = jest.fn(), onSaved = jest.fn();
  api.get.mockResolvedValue({ data: original }); mockCommand.mockResolvedValue({ data: {} });
  await act(async () => root.render(<ReviewCompletionGuide reviewId="fixture-review" onChange={onChange} onSaved={onSaved} />));
  expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(4);
  await act(async () => host.querySelector('button').click());
  expect(mockCommand).toHaveBeenCalledWith('/reviews/fixture-review/completion-guide', {
    occurrence_id: 'fixture-cycle', expected_updated_at: 'fixture-revision',
    checklist: { contract_token: original.contract_token, results: [] }, supporting_reference: ''
  });
  expect(onChange.mock.calls.every(([value]) => value === null || value === original)).toBe(true);
  expect(onChange.mock.calls.at(-1)).toEqual([null]);
  expect(onSaved).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]').textContent).toContain('could not be read');
  expect(host.querySelectorAll('input, textarea, button')).toHaveLength(0);
});

test('an accepted completion remains read-only and exposes its exact retained retry without performing it', async () => {
  const original = guide(), request = {occurrence_id: original.occurrence_id,
    completion_notes: 'Actual saved legacy result', conclusion: 'Explicit synthetic accepted decision', spawn_next: null};
  original.accepted_completion_retry = {request, completed_at: '2026-10-21T12:00:00+00:00', completed_by: 'fixture-original-actor'};
  api.get.mockResolvedValue({data: original});
  const onChange = jest.fn(), before = JSON.stringify(request);
  await act(async () => root.render(<ReviewCompletionGuide reviewId="fixture-review" onChange={onChange} />));
  expect(host.querySelector('[aria-label="Accepted completion awaiting recovery"]')).not.toBeNull();
  expect(host.textContent).toContain('fixture-original-actor');
  expect(host.textContent).toContain('Actual saved legacy result');
  expect(host.querySelectorAll('input, textarea, button')).toHaveLength(0);
  expect(onChange.mock.calls.at(-1)[0].accepted_completion_retry.request).toBe(request);
  expect(JSON.stringify(request)).toBe(before);
  expect(mockCommand).not.toHaveBeenCalled();
  expect(api.put).not.toHaveBeenCalled();
});


test.each(['replacement','cycle','unmount'])('a late checklist receipt cannot update a %s Guide owner',async mode=>{
 const original=guide(),replacement={...guide(),occurrence_id:'replacement-cycle',supporting_reference:'Replacement draft must remain'};
 let finishSave;
 api.get.mockResolvedValueOnce({data:original}).mockResolvedValueOnce({data:replacement});
 mockCommand.mockImplementation(()=>new Promise(resolve=>{finishSave=resolve;}));
 const onChange=jest.fn(),onSaved=jest.fn();
 await act(async()=>root.render(<ReviewCompletionGuide reviewId="fixture-review" onChange={onChange} onSaved={onSaved}/>));
 await act(async()=>host.querySelector('button').click());
 if(mode==='replacement')await act(async()=>root.render(<ReviewCompletionGuide reviewId="replacement-review" onChange={onChange} onSaved={onSaved}/>));
 else if(mode==='cycle')await act(async()=>root.render(<ReviewCompletionGuide reviewId="fixture-review" guide={replacement} onChange={onChange} onSaved={onSaved}/>));
 else await act(async()=>root.render(<div>Closed fixture</div>));
 const callsBefore=onChange.mock.calls.length;
 await act(async()=>finishSave({data:{...original,expected_updated_at:'confirmed-old-revision'}}));
 expect(onSaved).not.toHaveBeenCalled();expect(onChange).toHaveBeenCalledTimes(callsBefore);
 if(mode!=='unmount'){
   expect(host.querySelector('textarea').value).toBe('Replacement draft must remain');
   expect(host.querySelector('textarea').disabled).toBe(false);expect(host.querySelector('button').disabled).toBe(false);
 }
 else expect(host.textContent).toBe('Closed fixture');
});

test('covered policy history displays the actual source results and approved versions without reading today’s Guide', async () => {
  const occurrence = {
    policy_coverage: [{ policy_id: 'fixture-policy', version: '7', subject_id: 'fixture-approved-version' }],
    coverage_evaluation: {
      source_review_id: 'fixture-annual', source_occurrence_id: 'fixture-annual-cycle',
      checklist_outcome: 'No exceptions noted',
      checklist: { service_context: [], required_support: ['Actual retained support'] },
      checklist_results: [{ step_id: 'policy:fixture', text: 'Actual retained source check', result: 'NMI', reason: 'Client operator retained the results' }],
      supporting_reference: 'Completed result record FIXTURE-7'
    }
  };
  const before = JSON.stringify(occurrence);
  await act(async () => root.render(<ReviewCompletionRecord occurrence={occurrence} />));
  for (const text of ['fixture-annual-cycle', 'version 7', 'fixture-approved-version', 'Actual retained source check', 'Review outcome: No exceptions noted',
    'Not managed by iVenture', 'Client operator retained the results', 'Completed result record FIXTURE-7']) expect(host.textContent).toContain(text);
  expect(JSON.stringify(occurrence)).toBe(before);
  expect(api.get).not.toHaveBeenCalled();
  expect(mockCommand).not.toHaveBeenCalled();
});
