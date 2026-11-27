import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentRolloutFrame from './AssessmentRolloutFrame';

jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClient:{client_id:'qa-client',name:'Fictional QA'}})}));

let root,container;
const button=name=>[...document.querySelectorAll('button')].find(node=>node.textContent.replace(/\s+/g,' ').trim()===name);
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const render=async element=>{await act(async()=>root.render(element));};
const click=async name=>{await act(async()=>button(name).click());};

function fixture(writable=true) {
  const record={client_id:'qa-client',framework_assessment_id:'qa-record',definition_id:'CC1.1',
    status:'in_progress',notes:'Original native notes',last_saved:'2026-11-01T12:00:00Z'};
  const actions=Object.fromEntries(['close','save','saveAndNext','retry','put','previous','next'].map(key=>[key,jest.fn()]));
  const state={open:true,record,current:record,form:{...record},definition:{id:'CC1.1',title:'Ethical conduct'},
    ctx:{},busy:false,dirty:false,writable,position:'1 of 33',manageRecord:jest.fn()};
  return {state,actions};
}

test('native save/navigation callbacks remain separate from menu inspection',async()=>{
  const {state,actions}=fixture();
  await render(<AssessmentRolloutFrame state={state} actions={actions} frameworkLabel="SOC 2"
    status={<span>Native readiness</span>} requirement={<p>Native criterion</p>} interview={()=>null}/>);
  await click('Save assessment');
  expect(actions.save).toHaveBeenCalledTimes(1);
  expect(actions.put).not.toHaveBeenCalled();
  expect(actions.saveAndNext).not.toHaveBeenCalled();
  await click('Next');
  expect(actions.next).toHaveBeenCalledTimes(1);
  expect(state.current.status).toBe('in_progress');
  expect(state.current.notes).toBe('Original native notes');
});

test('a read-only actor cannot submit native assessment saves',async()=>{
  const {state,actions}=fixture(false);
  await render(<AssessmentRolloutFrame state={state} actions={actions} frameworkLabel="ISO 27001"/>);
  expect(button('Save assessment')).toBeUndefined();
  expect(button('Save & next')).toBeUndefined();
  expect(document.querySelector('footer [role=status]').textContent).toContain('Read-only assessment');
  expect(actions.save).not.toHaveBeenCalled();
});

test('native related draft keeps Save & next unavailable without disabling the explicit save',async()=>{
  const {state,actions}=fixture();state.otherDraft=true;
  await render(<AssessmentRolloutFrame state={state} actions={actions} frameworkLabel="SOC 2"/>);
  expect(button('Save & next').disabled).toBe(true);
  expect(button('Save assessment').disabled).toBe(false);
  expect(actions.save).not.toHaveBeenCalled();
});
