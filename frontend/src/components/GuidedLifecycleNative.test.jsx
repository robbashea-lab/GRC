import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';

jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: {user_id: 'actor-a', role: 'super_admin', workspace_mode: 'demo'}})}));
jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn()}, formatError: error => error.message}));
const mockNested = jest.fn();
jest.mock('./RecordDrawer', () => props => {mockNested(props); return <div data-testid="native-record-drawer">{props.kind}</div>;});
jest.mock('./GuidedAssessor', () => props => <div>
  <button onClick={() => props.onOpenNative('evidence', props.related.evidence[0])}>Open Omni native evidence</button>
  <button onClick={() => props.onOpenNative('findings', props.related.findings[0])}>Open Omni native Finding</button>
</div>);
jest.mock('./AssigneeSelect', () => () => null);
jest.mock('./ui/dialog', () => {
  const R = require('react');
  return {Dialog: ({children}) => <div>{children}</div>, DialogContent: ({children}) => <div>{children}</div>, DialogTitle: R.forwardRef(({children}, ref) => <h2 ref={ref}>{children}</h2>), DialogDescription: ({children}) => <p>{children}</p>};
});

let container, root, anchorClick;
const saved = {client_id: 'demo_brawndo', framework_key: 'cis-ig1', framework_assessment_id: 'native-1.1', definition_id: '1.1', status: 'addressed', verification: 'verified', implementation: 'Saved native implementation.', assessment_history: []};
const evidence = {evidence_id: 'e-a', client_id: 'demo_brawndo', filename: 'Original native evidence.txt', linked_type: 'framework_assessment', linked_id: saved.framework_assessment_id};
const finding = {finding_id: 'f-a', client_id: 'demo_brawndo', title: 'Original native Finding', status: 'open'};
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  api.get.mockImplementation(async path => ({data:
    path === '/evidence/e-a/download' ? {content_base64: 'U3ludGhldGljIGV2aWRlbmNlLg==', filename: evidence.filename, mime_type: 'text/plain'} :
      path.endsWith('/related') ? {reviews: [], evidence: [evidence], findings: [finding], tasks: [], risks: [], policies: []} :
        path.startsWith('/frameworks/') ? {configuration: {implementation_group: 1}, assessments: [saved], work: {[saved.framework_assessment_id]: {context_complete: true}}} : []}));
});
afterEach(async () => {await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); jest.clearAllMocks();});
async function render() {await act(async () => root.render(<FrameworkDrawer open record={saved} clientId="demo_brawndo" onOpenChange={() => {}}/>));}
async function click(name) {const target = [...container.querySelectorAll('button')].find(button => button.textContent === name); expect(target).toBeTruthy(); await act(async () => target.click());}

test('Omni evidence navigation reuses the real parent download handler exactly once', async () => {
  await render(); await click('Open Omni native evidence');
  expect(api.get.mock.calls.filter(([path]) => path === '/evidence/e-a/download')).toHaveLength(1);
  expect(anchorClick).toHaveBeenCalledTimes(1);
  expect(anchorClick.mock.instances[0].download).toBe(evidence.filename);
  expect(mockNested).not.toHaveBeenCalled();
  expect(container.querySelector('[data-testid="native-record-drawer"]')).toBeNull();
  expect(api.patch).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
});

test('Omni Finding navigation retains the existing native RecordDrawer callback', async () => {
  await render(); await click('Open Omni native Finding');
  expect(mockNested).toHaveBeenLastCalledWith(expect.objectContaining({kind: 'findings', record: finding}));
  expect(api.get.mock.calls.some(([path]) => path.endsWith('/download'))).toBe(false);
  expect(api.patch).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
});
