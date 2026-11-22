import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import R4AssessmentContext from './R4AssessmentContext';
import {AssessmentClientContextProvider} from './AssessmentClientContext';
import api from '@/lib/api';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
let root,host;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
test('context Apply preserves stable activity identity and explicit empty fields without a shared save',async()=>{
  const onApply=jest.fn(),onDraftChange=jest.fn(),record={client_id:'new-client',framework_assessment_id:'assessment-id'};
  api.get.mockResolvedValue({data:{client_id:record.client_id,expected_client_updated_at:'client-v1',selected_activity_id:'review:one',
    services:{areas:{endpoint:{responsibility:'iv',tool_ids:['existing-tool']}},custom_tools:[]},catalog:[{tool_id:'existing-tool',name:'Actual tool',area_ids:['endpoint']}],
    candidates:[{activity_id:'review:one',review_id:'one',title:'Native scoped inventory activity',area_id:'endpoint',expected_updated_at:'review-v1',cadence:'semiannual',first_next_due:'2027-01-15',setup:{notes:'Retain these notes',no_ticket:true}}]}});
  await act(async()=>root.render(<R4AssessmentContext {...{record,onApply,onDraftChange}}/>));
  expect(host.querySelector('input[type="checkbox"][checked]')).toBeTruthy();
  const notes=host.querySelector('[aria-label="Assessment setup notes"]');expect(notes.value).toBe('Retain these notes');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(notes,'');notes.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>[...host.querySelectorAll('button')].find(node=>node.textContent==='Apply context to draft').click());
  expect(onApply).toHaveBeenCalled();
  expect(onApply.mock.calls[0][0]).toMatchObject({activity_id:'review:one',review_id:'one',expected_updated_at:'review-v1',expected_client_updated_at:'client-v1',notes:''});
  expect(onApply.mock.calls[0][0]).not.toHaveProperty('no_ticket');expect(onApply.mock.calls[0][0]).not.toHaveProperty('tool_ids');
  expect(api.post).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

function contextFor(clientId='new-client',token='client-v1'){
  return {client_id:clientId,expected_client_updated_at:token,selected_activity_id:'review:one',
    services:{areas:{endpoint:{responsibility:'iv',tool_ids:[]}},custom_tools:[]},catalog:[],
    candidates:[{activity_id:'review:one',review_id:'one',title:'Current scoped activity',area_id:'endpoint',
      expected_updated_at:token,cadence:'annual',setup:{notes:'Current scoped notes'}}]};
}
test.each([
  ['missing candidates',data=>{delete data.candidates;}],
  ['missing catalog',data=>{delete data.catalog;}],
  ['invalid catalog tool',data=>{data.catalog=[{tool_id:'bad-tool',name:'Malformed tool'}];}],
  ['invalid services',data=>{data.services.areas=[];}],
  ['invalid custom tool',data=>{data.services.custom_tools=[null];}],
  ['invalid area tool IDs',data=>{data.services.areas.endpoint.tool_ids='not-an-array';}],
  ['missing client token',data=>{delete data.expected_client_updated_at;}],
  ['foreign client',data=>{data.client_id='foreign-client';}],
  ['invalid candidate',data=>{data.candidates=[null];}],
  ['invalid setup',data=>{data.candidates[0].setup.notes={unverified:'object'};}],
  ['invalid exclusion reason',data=>{data.candidates[0].exclusion={reason:{unverified:'object'}};}],
])('a malformed or wrong-scope successful response fails closed: %s',async(_label,damage)=>{
  const data=contextFor();damage(data);api.get.mockResolvedValue({data});
  const onApply=jest.fn(),record={client_id:'new-client',framework_assessment_id:'assessment-id'};
  await act(async()=>root.render(<R4AssessmentContext {...{record,onApply}}/>));
  expect(host.querySelector('[role="alert"]').textContent).toContain('current client context could not be verified');
  expect(host.querySelector('fieldset')).toBeNull();expect(host.querySelector('input,select,textarea,button')).toBeNull();
  expect(onApply).not.toHaveBeenCalled();
  for(const method of ['post','put','patch'])expect(api[method]).not.toHaveBeenCalled();
});

test('retained partial service facts remain readable as unknown without manufacturing a shared save',async()=>{
  const data=contextFor();data.services={areas:{endpoint:{}}};delete data.candidates[0].setup;
  api.get.mockResolvedValue({data});const onApply=jest.fn(),record={client_id:'new-client',framework_assessment_id:'assessment-id'};
  await act(async()=>root.render(<R4AssessmentContext {...{record,onApply}}/>));
  expect(host.querySelector('[role="alert"]')).toBeNull();expect(host.querySelector('fieldset')).toBeTruthy();
  expect(host.textContent).toContain('Responsibility: Not set');
  expect(host.querySelector('[aria-label="Assessment setup notes"]').value).toBe('');
  expect(onApply).not.toHaveBeenCalled();
  for(const method of ['post','put','patch'])expect(api[method]).not.toHaveBeenCalled();
  expect(data.services).toEqual({areas:{endpoint:{}}});expect(data.candidates[0]).not.toHaveProperty('setup');
});

test('a replacement client and a context reload expose no stale editable interval or late old receipt',async()=>{
  const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
  const old=deferred(),current=deferred(),refreshed=deferred();
  api.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise).mockReturnValueOnce(refreshed.promise);
  const onApply=jest.fn(),onDraftChange=jest.fn();
  const recordA={client_id:'new-client',framework_assessment_id:'assessment-id'},recordB={...recordA,client_id:'other-client'};
  await act(async()=>root.render(<R4AssessmentContext record={recordA} {...{onApply,onDraftChange}}/>));
  expect(host.querySelector('fieldset')).toBeNull();
  await act(async()=>root.render(<R4AssessmentContext record={recordB} {...{onApply,onDraftChange}}/>));
  await act(async()=>old.resolve({data:contextFor('new-client')}));
  expect(host.querySelector('fieldset')).toBeNull();expect(host.textContent).not.toContain('Current scoped notes');
  await act(async()=>current.resolve({data:contextFor('other-client')}));
  expect(host.querySelector('[aria-label="Assessment setup notes"]').value).toBe('Current scoped notes');
  const staged={activity_id:'review:one',notes:'Explicit staged assessment context'};
  await act(async()=>root.render(<R4AssessmentContext record={recordB} value={staged} {...{onApply,onDraftChange}}/>));
  expect(host.querySelector('fieldset')).toBeNull();expect(host.querySelector('input,select,textarea,button')).toBeNull();
  await act(async()=>refreshed.resolve({data:contextFor('other-client','confirmed-client-v2')}));
  expect(host.querySelector('[aria-label="Assessment setup notes"]').value).toBe('Explicit staged assessment context');
  await act(async()=>[...host.querySelectorAll('button')].find(node=>node.textContent==='Apply context to draft').click());
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({expected_client_updated_at:'confirmed-client-v2',expected_updated_at:'confirmed-client-v2'}));
  for(const method of ['post','put','patch'])expect(api[method]).not.toHaveBeenCalled();
});


test.each(['client-v1','client-v2'])('authority-only reread retains unapplied context and its original revision (%s)',async nextToken=>{
  let resolve;
  const refreshed=new Promise(done=>{resolve=done;});
  api.get.mockResolvedValueOnce({data:contextFor('new-client','client-v1')}).mockReturnValueOnce(refreshed);
  const onApply=jest.fn(),onDraftChange=jest.fn();
  const record={client_id:'new-client',framework_assessment_id:'assessment-id',framework_key:'hipaa',definition_id:'synthetic-native-item'};
  const render=async scopeKey=>{await act(async()=>root.render(<AssessmentClientContextProvider {...{record,scopeKey}}><R4AssessmentContext {...{record,onApply,onDraftChange}}/></AssessmentClientContextProvider>));};
  await render('original-authority');
  const notes=host.querySelector('[aria-label="Assessment setup notes"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(notes,'Unapplied native context draft');notes.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(onDraftChange.mock.calls.at(-1)[0]).toBe(true);
  await render('refreshed-authority');
  expect(host.querySelector('fieldset')).toBeNull();expect(onDraftChange.mock.calls.at(-1)[0]).toBe(true);
  await act(async()=>resolve({data:contextFor('new-client',nextToken)}));
  expect(host.querySelector('[aria-label="Assessment setup notes"]').value).toBe('Unapplied native context draft');
  const button=title=>[...host.querySelectorAll('button')].find(node=>node.textContent===title);
  expect(button('Apply context to draft').disabled).toBe(nextToken!=='client-v1');
  await act(async()=>button('Apply context to draft').click());
  if(nextToken==='client-v1')expect(onApply).toHaveBeenCalledWith(expect.objectContaining({notes:'Unapplied native context draft',expected_client_updated_at:'client-v1',expected_updated_at:'client-v1'}));
  else{
    expect(onApply).not.toHaveBeenCalled();expect(host.textContent).toContain('Your draft is retained');
    await act(async()=>button('Discard context edits').click());
    expect(host.querySelector('[aria-label="Assessment setup notes"]').value).toBe('Current scoped notes');
    expect(button('Apply context to draft').disabled).toBe(false);
    await act(async()=>button('Apply context to draft').click());
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({expected_client_updated_at:'client-v2',expected_updated_at:'client-v2'}));
  }
  for(const method of ['post','put','patch'])expect(api[method]).not.toHaveBeenCalled();
});


test('a refused parent handoff retains unapplied context and the original CAS through a later authority reread',async()=>{
  api.get.mockResolvedValueOnce({data:contextFor('new-client','client-v1')})
    .mockResolvedValueOnce({data:contextFor('new-client','client-v2')});
  const onApply=jest.fn(()=>false),onDraftChange=jest.fn();
  const record={client_id:'new-client',framework_assessment_id:'assessment-id',framework_key:'hipaa',definition_id:'synthetic-native-item'};
  const render=async scopeKey=>{await act(async()=>root.render(<AssessmentClientContextProvider {...{record,scopeKey}}><R4AssessmentContext {...{record,onApply,onDraftChange}}/></AssessmentClientContextProvider>));};
  await render('original-authority');
  const notes=host.querySelector('[aria-label="Assessment setup notes"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(notes,'Original unapplied context wording');notes.dispatchEvent(new Event('input',{bubbles:true}));});
  const apply=()=>[...host.querySelectorAll('button')].find(node=>node.textContent==='Apply context to draft');
  await act(async()=>apply().click());
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({notes:'Original unapplied context wording',expected_client_updated_at:'client-v1',expected_updated_at:'client-v1'}));
  expect(onDraftChange.mock.calls.at(-1)[0]).toBe(true);
  await render('fresh-authority');
  expect(host.querySelector('[aria-label="Assessment setup notes"]').value).toBe('Original unapplied context wording');
  expect(host.textContent).toContain('Your draft is retained');expect(apply().disabled).toBe(true);
  expect(onApply).toHaveBeenCalledTimes(1);
  for(const method of ['post','put','patch'])expect(api[method]).not.toHaveBeenCalled();
});
