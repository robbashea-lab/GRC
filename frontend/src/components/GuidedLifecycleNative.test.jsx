import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';

jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: {user_id: 'actor-a', role: 'super_admin', workspace_mode: 'demo'}})}));
jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn()}, formatError: error => error.message}));
const mockNested = jest.fn();
jest.mock('./RecordDrawer', () => props => {mockNested(props); return <div data-testid="native-record-drawer">{props.kind}</div>;});
jest.mock('./GuidedAssessor', () => props => <div>
  <button onClick={() => props.onSaveAssessment?.({implementation:'Reviewed synthetic inventory',status:'in_progress',guided_assessment_source:{version:require('@/lib/guidedAssessment').versionForSafeguard(props.record.definition_id),revision:9,generated_at:'2026-10-09T12:00:00Z'}},JSON.stringify(props.form))}>Save Omni native assessment</button>
  <button onClick={() => props.onSaveAssessment?.({implementation:'Must not apply',status:'addressed'},'stale native snapshot')}>Save stale Omni native assessment</button>
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

test('scoped Omni save reuses native PATCH, CAS and fields without changing verification',async()=>{
  api.patch.mockImplementation(async (_path,body)=>({data:{...saved,...body,last_saved:'2026-10-09T12:01:00Z',assessment_history:[saved]}}));
  await render();await click('Save Omni native assessment');
  expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch).toHaveBeenCalledWith('/framework_assessments/native-1.1',expect.objectContaining({implementation:'Reviewed synthetic inventory',status:'in_progress',verification:'verified',expected_last_assessed:null,guided_assessment_source:{version:'cis-v8.1-control1-3',revision:9,generated_at:'2026-10-09T12:00:00Z'}}));
  expect(container.textContent).toContain('Assessment saved.');
});

test('stale native snapshot refuses PATCH and retains the native record',async()=>{
  await render();await click('Save stale Omni native assessment');expect(api.patch).not.toHaveBeenCalled();expect(container.textContent).toContain('unsaved or changed content');
});

test('native rejection does not claim successful assessment saving',async()=>{
  api.patch.mockRejectedValueOnce(new Error('Synthetic native CAS conflict'));
  await render();await click('Save Omni native assessment');expect(api.patch).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('Synthetic native CAS conflict');expect(container.textContent).not.toContain('Assessment saved.');
});

test.each(['1.2','2.1'])('native save adapter uses the same authoritative path for newly authorized CIS safeguard %s',async id=>{
  const other={...saved,definition_id:id,framework_assessment_id:'native-'+id};api.patch.mockImplementation(async(_path,body)=>({data:{...other,...body}}));await act(async()=>root.render(<FrameworkDrawer open record={other} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  await click('Save Omni native assessment');expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch).toHaveBeenCalledWith('/framework_assessments/native-'+id,expect.objectContaining({verification:'verified',guided_assessment_source:expect.objectContaining({version:require('@/lib/guidedAssessment').versionForSafeguard(id)})}));
});

test.each([{definition_id:'1.3'},{framework_key:'soc-2',definition_id:'CC1.1'},{framework_key:'iso-27001',definition_id:'A.5.1'},{client_id:'foreign-client'}])('native save adapter refuses excluded configuration or identity %j',async changes=>{
  const other={...saved,...changes};await act(async()=>root.render(<FrameworkDrawer open record={other} clientId="demo_brawndo" onOpenChange={()=>{}}/>));if(changes.definition_id==='1.3')await click('Save Omni native assessment');else expect([...container.querySelectorAll('button')].find(button=>button.textContent==='Save Omni native assessment')).toBeUndefined();expect(api.patch).not.toHaveBeenCalled();
});

test('native adapter guards duplicate pending submissions',async()=>{
  let finish;api.patch.mockImplementation(()=>new Promise(resolve=>{finish=()=>resolve({data:saved});}));await render();
  const target=[...container.querySelectorAll('button')].find(button=>button.textContent==='Save Omni native assessment');await act(async()=>{target.click();target.click();});
  expect(api.patch).toHaveBeenCalledTimes(1);await act(async()=>finish());
});
