import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import EvidencePanel from './EvidencePanel';
import api from '@/lib/api';

let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
jest.mock('@/lib/evidenceContext',()=>({downloadEvidence:jest.fn(),EvidenceSource:()=>null,uploaderLabel:()=> 'Recorded uploader'}));

const catalog=total=>({items:[],counts:{direct:0},total,page:1,page_size:25});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
let root,container;
const render=async(props={})=>act(async()=>root.render(<EvidencePanel clientId="demo_brawndo" kind="tasks" id="owned-action" allowLink={false} {...props}/>));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockUser={user_id:'reader',role:'client_viewer'};
  api.get.mockResolvedValue({data:catalog(0)});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each([7,0])('optional summary publishes the existing catalog total %s without another request',async total=>{
  api.get.mockResolvedValue({data:catalog(total)});const onSummary=jest.fn();
  await render({onSummary});
  expect(onSummary).toHaveBeenLastCalledWith(total);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith('/evidence/catalog',{params:{client_id:'demo_brawndo',entity_type:'tasks',entity_id:'owned-action',page:1,page_size:25}});
  expect(api.post).not.toHaveBeenCalled();
});

test.each(['refresh','record scope'])('%s clears a prior total while awaiting its own catalog',async mode=>{
  api.get.mockResolvedValueOnce({data:catalog(7)});const next=deferred(),onSummary=jest.fn();
  await render({onSummary});expect(onSummary).toHaveBeenLastCalledWith(7);
  api.get.mockReturnValueOnce(next.promise);
  await render({onSummary,...(mode==='refresh'?{refreshKey:1}:{id:'other-owned-action'})});
  expect(onSummary).toHaveBeenLastCalledWith(null);
  expect(document.body.textContent).toContain('Loading Evidence');
  expect(api.get).toHaveBeenCalledTimes(2);
  await act(async()=>next.resolve({data:catalog(3)}));
  expect(onSummary).toHaveBeenLastCalledWith(3);
  expect(api.get).toHaveBeenCalledTimes(2);expect(api.post).not.toHaveBeenCalled();
});

test('omitting the callback preserves native catalog rendering and query behavior',async()=>{
  await render();
  expect(document.querySelector('[aria-label="Evidence context"]')).toBeTruthy();
  expect(document.body.textContent).toContain('No Evidence is directly attached to this Action Item.');
  expect(document.querySelector('[aria-label="Evidence pagination"]').textContent).toContain('0 of 0 files');
  expect(api.get).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();
});

const customHeader=linkButton=><header><label>Native upload<input type="file"/></label>{linkButton}</header>;

test('optional occurrence copy uses the direct count while preserving related category provenance',async()=>{
  api.get.mockResolvedValue({data:{...catalog(3),counts:{direct:0,findings:3}}});
  await render({kind:'reviews',directPresentation:{heading:'This occurrence',countUnit:'files',emptyMessage:'No evidence on Q4 2026 yet.'}});
  const direct=container.querySelector('[aria-label="This occurrence"]');
  expect(direct.querySelector('h3').textContent).toBe('This occurrence · 0 files');
  expect(direct.textContent).toContain('No evidence on Q4 2026 yet.');
  expect(container.querySelector('[aria-label="Evidence from Linked Findings"]').textContent).toContain('(3)');
  expect(api.get).toHaveBeenCalledTimes(1);
});
const click=async element=>act(async()=>element.click());
const button=label=>Array.from(container.querySelectorAll('button')).find(item=>item.textContent===label);

test('default internal header retains guidance and native link control',async()=>{
  mockUser={user_id:'analyst',role:'super_admin'};
  await render({allowLink:true});
  expect(container.textContent).toContain('Files remain attached to their stated source.');
  expect(button('Link existing Evidence')).toBeTruthy();
  expect(api.get).toHaveBeenCalledTimes(1);
});

test.each([['client_viewer',true],['super_admin',false]])('custom header preserves link permission for %s, allowLink %s',async(role,allowLink)=>{
  mockUser={user_id:'user',role};
  await render({allowLink,renderHeader:customHeader});
  expect(container.querySelector('input[type="file"]')).toBeTruthy();
  expect(button('Link existing Evidence')).toBeUndefined();
  expect(api.get).toHaveBeenCalledTimes(1);
});

test('custom upload header remains mounted through loading, failure and retry',async()=>{
  const pending=deferred(),onSummary=jest.fn();
  api.get.mockReturnValueOnce(pending.promise);
  await render({renderHeader:customHeader,onSummary});
  const input=container.querySelector('input[type="file"]');
  expect(input).toBeTruthy();
  expect(container.textContent).toContain('Loading Evidence');
  expect(onSummary).toHaveBeenLastCalledWith(null);
  await act(async()=>pending.resolve(Promise.reject(new Error('Synthetic catalog failure'))));
  expect(container.querySelector('input[type="file"]')).toBe(input);
  expect(container.querySelector('[role="alert"]').textContent).toContain('Synthetic catalog failure');
  expect(onSummary).toHaveBeenLastCalledWith(null);
  await click(button('Retry'));
  expect(container.querySelector('input[type="file"]')).toBe(input);
  expect(onSummary).toHaveBeenLastCalledWith(0);
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.post).not.toHaveBeenCalled();
});

test('custom header uses the native reuse form and relationship command',async()=>{
  mockUser={user_id:'analyst',role:'super_admin'};
  const row={evidence_id:'owned-evidence',filename:'synthetic.txt',updated_at:'2026-10-20T00:00:00Z'};
  api.get.mockImplementation((url,{params})=>Promise.resolve({data:params.entity_type?catalog(0):{...catalog(1),items:[row]}}));
  api.post.mockResolvedValue({data:{}});
  await render({allowLink:true,renderHeader:customHeader});
  const link=button('Link existing Evidence');
  expect(link.closest('header')).toBeTruthy();
  expect(link.closest('label')).toBeNull();
  expect(container.textContent).not.toContain('Files remain attached to their stated source.');
  await click(link);
  expect(container.querySelector('[aria-label="Find existing Evidence"]')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith('/evidence/catalog',{params:{client_id:'demo_brawndo',q:'',page:1,page_size:25}});
  await click(button('Link file'));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/evidence-library/items/owned-evidence/relationships',{linked_type:'tasks',linked_id:'owned-action',occurrence_id:null,expected_updated_at:row.updated_at});
  expect(container.querySelector('[aria-label="Find existing Evidence"]')).toBeNull();
  expect(button('Link existing Evidence')).toBeTruthy();
  expect(api.get).toHaveBeenCalledTimes(3);
});


test('refresh keeps the chooser while withholding Link until its catalog is ready',async()=>{
  mockUser={user_id:'analyst',role:'super_admin'};
  const props={allowLink:true,renderHeader:customHeader};
  await render(props);
  const input=container.querySelector('input[type="file"]');
  expect(button('Link existing Evidence')).toBeTruthy();
  const pending=deferred();api.get.mockReturnValueOnce(pending.promise);
  await render({...props,refreshKey:1});
  expect(container.querySelector('input[type="file"]')).toBe(input);
  expect(button('Link existing Evidence')).toBeUndefined();
  await act(async()=>pending.resolve({data:catalog(0)}));
  expect(container.querySelector('input[type="file"]')).toBe(input);
  expect(button('Link existing Evidence')).toBeTruthy();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.post).not.toHaveBeenCalled();
});
