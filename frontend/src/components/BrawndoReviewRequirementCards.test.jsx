import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoReviewRequirementCards from './BrawndoReviewRequirementCards';
import {cis,activePlans,reviewDriver} from '@/lib/frameworks';

let root,container;
const client={client_id:'demo_brawndo'};
const access=()=>activePlans('cis-ig1').find(plan=>plan.key==='account-authorization');
const required=()=>({client_id:client.client_id,review_type:'access',recurrence:'quarterly',framework_key:'cis-ig1',framework_version:'8.1',framework_plan_key:'account-authorization',framework_drivers:[reviewDriver('cis-ig1',access())],governance_context:{category:'organizational'}});
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const render=async(record,props={})=>act(async()=>root.render(<BrawndoReviewRequirementCards record={record} client={client} {...props}/>));

test('qualified source uses exact quote, highlighted cadence and frequency-specific positive/warning treatments',async()=>{
  const record=required(),before=JSON.stringify(record);
  await render(record);
  expect(container.querySelector('.review-source-card').classList.contains('is-required')).toBe(true);
  expect(container.textContent).toContain('CIS IG1 · Safeguard 5.1');
  expect(container.textContent).toContain('Required by framework');
  expect(container.querySelector('blockquote').textContent).toBe(cis.requirements.find(item=>item.id==='5.1').official_text);
  expect(container.querySelector('mark').textContent).toBe('on a recurring schedule at a minimum quarterly, or more frequently');
  expect(container.querySelector('.review-source-frequency').children).toHaveLength(3);
  expect(container.textContent).toContain('Meets requirement');
  expect(container.textContent).not.toContain('Cadence aligned');
  expect(container.textContent).not.toContain('does not establish timely completion');
  expect(JSON.stringify(record)).toBe(before);
  await render({...record,recurrence:'annual'});expect(container.textContent).toContain('Below requirement');
  await render({...record,recurrence:'custom',custom_recurrence_days:45});expect(container.textContent).toContain('Meets requirement');
});

test.each([{recurrence:'none'},{recurrence:'weekly'},{recurrence:'custom',custom_recurrence_days:0}])('unknown frequency never gets a positive badge: %j',async schedule=>{
  await render({...required(),...schedule});
  expect(container.textContent).toContain('Not directly comparable');expect(container.textContent).not.toContain('Meets requirement');
});

test('required primary is excluded from compact supports and native assessment link retains identity',async()=>{
  const onOpen=jest.fn(),assessment={client_id:client.client_id,framework_key:'cis-ig1',definition_id:'5.2',framework_assessment_id:'actual-5.2'};
  await render(required(),{onOpen,related:{framework_assessments:[assessment]}});
  const rows=[...container.querySelectorAll('.review-source-support')];
  expect(rows).toHaveLength(8);expect(rows[0].querySelector('.review-source-id').textContent).toBe('5.2');
  expect(rows[0].textContent).toContain('Use distinct passwords; source guidance distinguishes MFA and non-MFA accounts.');
  await act(async()=>rows[0].querySelector('button').click());
  expect(onOpen).toHaveBeenCalledWith({kind:'framework_assessments',record:assessment});
});

test('organization-defined and unresolved are distinct; unsafe references cannot become links',async()=>{
  await render({client_id:client.client_id,recurrence:'semiannual',governance_context:{category:'organizational',rationale:'Recorded management decision',reference_url:'javascript:alert(1)'}});
  expect(container.textContent).toContain('Organization-defined review');expect(container.textContent).toContain('Recorded management decision');
  expect(container.textContent).not.toContain('Not required by CIS');
  expect(container.querySelector('.review-source-frequency').textContent).toContain('Not recorded');
  expect(container.querySelector('.review-source-frequency').textContent).not.toContain('None');
  expect(container.querySelector('a')).toBeNull();
  await render({client_id:client.client_id,title:'User Access Review',recurrence:'quarterly'});
  expect(container.textContent).toContain('Source unresolved');expect(container.textContent).not.toContain('Organization-defined review');
  expect(container.textContent).not.toContain('Meets requirement');
});

test('a supporting CIS relationship cannot prove absence of a framework frequency',async()=>{
  await render({client_id:client.client_id,recurrence:'semiannual',governance_context:{category:'organizational',rationale:'Recorded management decision'}},{related:{framework_assessments:[{client_id:client.client_id,framework_key:'cis-ig1',definition_id:'5.1'}]}});
  expect(container.textContent).toContain('Organization-defined review');
  expect(container.textContent).not.toContain('Not required by CIS');
  expect(container.querySelector('.review-source-frequency').textContent).toContain('Not recorded');
  expect(container.textContent).not.toContain('CIS IG1 safeguards');
  expect(container.textContent).toContain('CIS safeguards');
});


test.each(['Brawndo','Initech','Krusty Krab'])('organizational cadence identifies the loaded %s client without borrowing another company',async name=>{
  const record={client_id:client.client_id,recurrence:'annual',governance_context:{category:'organizational',rationale:'Recorded management decision'}};
  const before=JSON.stringify(record);
  await render(record,{client:{...client,name}});
  expect(container.querySelector('.review-source-frequency').textContent).toContain(`${name}'s recurrence`);
  expect(container.querySelector('.review-source-frequency').textContent).toContain(`${name} management`);
  if(name!=='Brawndo')expect(container.textContent).not.toContain('Brawndo');
  expect(JSON.stringify(record)).toBe(before);
});
