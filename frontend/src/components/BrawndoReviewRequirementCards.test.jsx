import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoReviewRequirementCards from './BrawndoReviewRequirementCards';
import {cis,reviewDriver} from '@/lib/frameworks';

let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const access=()=>cis.review_plans.find(plan=>plan.source_minimum==='quarterly');
const render=async(record,props={})=>act(async()=>root.render(<BrawndoReviewRequirementCards record={record} {...props}/>));

test('explicit active source intervals compare schedules without claiming implementation or mutating records',async()=>{
  const record={client_id:'a',recurrence:'annual',framework_drivers:[reviewDriver('cis-ig1',access())]},before=JSON.stringify(record);
  await render(record);
  expect(container.textContent).toContain('Less frequent than source interval');
  expect(container.querySelector('.review-source-card > header h3')).not.toBeNull();
  expect(container.querySelector('.review-source-card > .review-source-purpose')).not.toBeNull();
  for(const row of container.querySelectorAll('dl.review-source-cadence')){
    expect(row.children).toHaveLength(3);
    for(const column of row.children){expect(column.querySelector('dt')).not.toBeNull();expect(column.querySelector('dd')).not.toBeNull();}
  }
  expect(container.textContent).toContain('does not establish timely completion');
  expect(container.textContent).not.toContain('Organization-defined');
  expect(JSON.stringify(record)).toBe(before);
  await render({...record,recurrence:'quarterly'});
  expect(container.textContent).toContain('Cadence aligned');
  await render({...record,recurrence:'custom',custom_recurrence_days:45});
  expect(container.textContent).toContain('Cadence aligned');
});

test.each([
  {recurrence:'once'},
  {recurrence:'weekly'},
  {recurrence:'custom',custom_recurrence_days:0},
  {recurrence:'custom',custom_recurrence_days:'not a number'},
  {recurrence:'custom',custom_recurrence_days:true},
  {recurrence:'custom',custom_recurrence_days:Infinity}
])('unsupported or invalid comparison is not an alignment badge: %j',async schedule=>{
  await render({...schedule,framework_drivers:[reviewDriver('cis-ig1',access())]});
  expect(container.textContent).toContain('Not directly comparable');
  expect(container.textContent).not.toContain('Cadence aligned');
});

test('inactive driver remains visible without asserting alignment or source obligations',async()=>{
  await render({recurrence:'monthly',framework_drivers:[reviewDriver('cis-ig1',access(),false)]},{historical:true});
  expect(container.textContent).toContain('Historical driver (inactive)');
  expect(container.textContent).toContain('Not directly comparable');
  expect(container.textContent).toContain('catalog references show their current state');
});

test('unknown sources remain unknown and only same-client assessments can become native links',async()=>{
  const onOpen=jest.fn(),record={client_id:'a',scope:'Original scope',governance_context:{category:'contractual',citation:'Retained contract',reference_url:'javascript:alert(1)'}};
  await render(record,{onOpen,related:{framework_assessments:[{client_id:'b',framework_key:'cis-ig1',definition_id:'5.1'}]}});
  expect(container.textContent).toContain('Contractual requirement');
  expect(container.textContent).toContain('Original scope');
  expect(container.textContent).toContain('Source interval not recorded');
  expect(container.textContent).toContain('No framework support references recorded');
  expect(container.querySelector('a')).toBeNull();
  const assessment={client_id:'a',framework_key:'cis-ig1',definition_id:'5.1',framework_assessment_id:'actual-a'};
  await render(record,{onOpen,related:{framework_assessments:[assessment]}});
  const support=container.querySelector('details.review-source-support');
  expect(support.querySelector('summary').textContent).toContain('5.1');
  expect(support.textContent).toContain(cis.requirements.find(definition=>definition.id==='5.1').official_text);
  await act(async()=>container.querySelector('button').click());
  expect(onOpen).toHaveBeenCalledWith({kind:'framework_assessments',record:assessment});
});
