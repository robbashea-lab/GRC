import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import pilot from '@catalogs/omniWorkspacePilot.json';

let mockUser, mockGuideProps;
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: mockUser})}));
jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn()}, formatError: error => error.message}));
jest.mock('./GuidedAssessor', () => props => {mockGuideProps = props; return <div data-testid="omni-guide"/>;});
jest.mock('./RecordDrawer', () => () => null);
jest.mock('./AssigneeSelect', () => () => null);
jest.mock('./ui/dialog', () => {
  const R = require('react');
  return {Dialog: ({children}) => <div>{children}</div>, DialogContent: ({children}) => <div>{children}</div>, DialogTitle: R.forwardRef(({children}, ref) => <h2 ref={ref}>{children}</h2>), DialogDescription: ({children}) => <p>{children}</p>};
});

let container, root, record, inventory, assessments, configuration;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockUser = {user_id: 'actor', role: 'super_admin', workspace_mode: 'demo'};
  mockGuideProps = null;
  record = {framework_assessment_id: 'handling', framework_key: 'cis-ig1', definition_id: '1.2', client_id: 'demo_brawndo', status: 'not_assessed', verification: 'not_verified', implementation: 'Existing handling record.', assessment_history: []};
  inventory = {...record, framework_assessment_id: 'inventory', definition_id: '1.1', status: 'in_progress', implementation: 'Inventory coverage has an unresolved gap.', last_saved: '2026-10-09T12:00:00Z'};
  assessments = [inventory, record];
  configuration = {implementation_group: 1};
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  api.get.mockImplementation(async path => ({data:
    path.endsWith('/related') ? {reviews: [], evidence: [], findings: [], tasks: [], risks: [], policies: []} :
      path.startsWith('/frameworks/') ? {configuration, assessments, work: {[record.framework_assessment_id]: {context_complete: true}}} : []}));
});
afterEach(async () => {await act(async () => root.unmount()); container.remove(); jest.clearAllMocks();});
async function render(clientId = record.client_id) {await act(async () => root.render(<FrameworkDrawer open record={record} clientId={clientId} onOpenChange={() => {}}/>));}
function expectNoWrites() {expect(api.patch).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();}

test('1.2 receives only its client’s saved 1.1 record from the existing workspace read', async () => {
  assessments = [{...inventory, client_id: 'other-client', implementation: 'Other client.'}, {...inventory, framework_key: 'other-framework', implementation: 'Other framework.'}, inventory, record];
  await render();
  expect(mockGuideProps.inventoryContext).toEqual(inventory);
  expect(mockGuideProps.current.definition_id).toBe('1.2');
  expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(record.implementation);
  expect(container.querySelector('input[value="not_assessed"]').checked).toBe(true);
  expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Not verified');
  expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/framework_assessments/handling/related', '/clients/demo_brawndo/members', '/contacts', '/comments', '/framework_assessments/handling/activity', '/frameworks/cis-ig1']);
  expectNoWrites();
});

test('missing same-client inventory remains unavailable rather than using another client or framework', async () => {
  assessments = [{...inventory, client_id: 'other-client'}, {...inventory, framework_key: 'other-framework'}, record];
  await render();
  expect(mockGuideProps.inventoryContext).toBeUndefined();
  expectNoWrites();
});

test.each([
  ['1.1', 'demo_brawndo', {implementation_group: 1}],
  ['3.3', 'demo_brawndo', {implementation_group: 1}],
  ['1.2', 'demo_brawndo', {implementation_group: 1, guided_assessment_enabled: false}],
])('does not pass inventory context outside eligible CIS 1.2: %s, %s, %j', async (definitionId, clientId, settings) => {
  record = {...record, definition_id: definitionId, client_id: clientId};
  inventory = {...inventory, client_id: clientId}; assessments = [inventory, record]; configuration = settings;
  await render();
  expect(mockGuideProps.inventoryContext).toBeUndefined();
  expectNoWrites();
});

test.each([
  ['demo_dunder', {implementation_group: 1}],
  ['demo_brawndo', {implementation_group: 2}],
  ['future-client', {implementation_group: 3}],
  ['demo_brawndo', {implementation_group: 1, focused_omni_enabled: false}],
])('configured CIS 1.2 receives only its own read-only inventory across clients and groups: %s, %j', async (clientId, settings) => {
  record = {...record, client_id: clientId};
  inventory = {...inventory, client_id: clientId};
  assessments = [{...inventory, client_id: 'other-client'}, {...inventory, framework_key: 'other-framework'}, inventory, record];
  configuration = settings;
  await render();
  expect(mockGuideProps.inventoryContext).toEqual(inventory);
  expect(mockGuideProps.clientId).toBe(clientId);
  expectNoWrites();
});

test('the configured authenticated staging client receives its own inventory context', async () => {
  mockUser = {...mockUser, workspace_mode: undefined};
  record = {...record, client_id: pilot.stagingClientIds[0]};
  inventory = {...inventory, client_id: record.client_id}; assessments = [inventory, record];
  await render();
  expect(mockGuideProps.inventoryContext).toEqual(inventory);
  expectNoWrites();
});

test('an identity change does not retain the prior client inventory context', async () => {
  await render(); expect(mockGuideProps.inventoryContext).toEqual(inventory);
  record = {...record, framework_assessment_id: 'other-handling', client_id: 'demo_dunder'};
  assessments = [inventory, record];
  await render();
  expect(mockGuideProps.clientId).toBe('demo_dunder');
  expect(mockGuideProps.inventoryContext).toBeUndefined();
  expectNoWrites();
});
