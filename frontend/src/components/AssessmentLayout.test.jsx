import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentLayout,{AssessmentChecklist,AssessmentRequirement} from './AssessmentLayout';

let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const items=[{id:'1.1-c1',text:'Inventory covers the relevant assets.'}];
function Example(){
  const [draft,setDraft]=useState('saved narrative'),[checks,setChecks]=useState(['historical-id']);
  return <AssessmentLayout summary="Maintain the relevant asset inventory." requirement={<AssessmentRequirement heading="What CIS requires" text="Official text" official source="https://www.cisecurity.org/controls" label="Official CIS source"/>}
    checklist={<AssessmentChecklist title="Safeguard 1.1 checklist" items={items} value={checks} onChange={setChecks}/>}
    review={['Compare the inventory with actual operation.']} outcome={['Assets are accounted for.']}>
    <input aria-label="Current implementation" value={draft} onChange={e=>setDraft(e.target.value)}/>
    <output data-testid="saved-status">not_assessed</output><output data-testid="checks">{JSON.stringify(checks)}</output>
  </AssessmentLayout>;
}
async function tab(value){const el=container.querySelector(`[role=tab][data-state=${value==='criteria'?'inactive':'active'}]`);await act(async()=>el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,ctrlKey:false})));}
test('exactly two tabs start with requirement and retain narrative and checklist draft across switches',async()=>{
  await act(async()=>root.render(<Example/>));
  expect([...container.querySelectorAll('[role=tab]')].map(e=>e.textContent)).toEqual(['Requirement & implementation','Assessment criteria']);
  expect(container.querySelector('[role=tabpanel][data-state=active]').textContent).toContain('What CIS requires');
  const input=container.querySelector('input[aria-label="Current implementation"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'unsaved narrative');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await tab('criteria');
  await act(async()=>container.querySelector('input[type=checkbox]').click());
  expect(container.querySelector('[data-testid=checks]').textContent).toBe('["historical-id","1.1-c1"]');
  expect(container.querySelector('[data-testid=saved-status]').textContent).toBe('not_assessed');
  await act(async()=>container.querySelector('[role=tab][data-state=inactive]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
  expect(container.querySelector('input[aria-label="Current implementation"]').value).toBe('unsaved narrative');
  expect(container.querySelector('input[type=checkbox]').checked).toBe(true);
});
test('absent explicit timing produces no trigger line and source link has no appended explanation',async()=>{
  await act(async()=>root.render(<AssessmentRequirement heading="What CIS requires" text="Requirement" source="https://www.cisecurity.org/controls" label="Official CIS source"/>));
  expect(container.textContent).not.toContain('Required operation');
  expect(container.querySelector('a').nextSibling).toBeNull();
  await act(async()=>root.render(<AssessmentRequirement heading="What CIS requires" text="Requirement" trigger="Review and update at least every six months."/>));
  expect(container.textContent).toContain('Required operation / trigger: Review and update at least every six months.');
});
