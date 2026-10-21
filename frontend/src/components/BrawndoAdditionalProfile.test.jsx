import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {AdditionalProfileIdentity,AdditionalProfileReadSection,AdditionalProfileOverview,AdditionalProfilePeople} from './BrawndoAdditionalProfile';
import ProfileSection from './ProfileSection';
jest.mock('react-router-dom',()=>({Link:({children,to,...props})=><a href={to} {...props}>{children}</a>}),{virtual:true});
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('identity uses eight-field optional completeness, native counts including zero and actual relationships',async()=>{
  await act(async()=>root.render(<AdditionalProfileIdentity client={{name:'Brawndo'}} relationships={{}} profile={{organization:{employees:0,technology_users:0,locations:0}}} programs={[]} onTab={()=>{}}/>));
  expect([...container.querySelectorAll('.baprof-facts dd')].map(node=>node.textContent)).toEqual(['0','0','—','0','0']);
  expect(container.querySelector('[role=img]').getAttribute('aria-label')).toBe('13% of eight recommended context fields provided');
  expect(container.textContent).toContain('Not designated');expect(container.textContent).toContain('Unassigned');
});
test('read view presents all native fields and distinguishes data answers from self reported maturity',async()=>{
  await act(async()=>root.render(<AdditionalProfileReadSection section="security" values={{collects:'No',stores:'Unknown',information_security:'Not Applicable',risk_management:'Partial'}}/>));
  expect(container.querySelector('[data-answer=No]').textContent).toBe('No');expect(container.querySelector('[data-answer=Unknown]').textContent).toBe('Unknown');expect(container.querySelectorAll('.baprof-maturity>span')).toHaveLength(14);
  expect(container.textContent).toContain('Not a control assessment'.toLowerCase());
});
test('renewal read view formats a literal date and preserves native unknown, zero and false values',async()=>{
  const renewalValue=()=>[...container.querySelectorAll('dt')].find(node=>node.textContent.startsWith('Insurance renewal / expiration')).nextElementSibling;
  await act(async()=>root.render(<AdditionalProfileReadSection section="organization" values={{insurance_renewal:'2027-01-23'}}/>));
  expect(renewalValue().textContent).toMatch(/^Jan 23, 2027 · (in \d+ days?|today|\d+ days? overdue)$/);
  expect(renewalValue().querySelector('small')).toBeTruthy();
  for(const value of ['Unknown',0,false,'2026-02-30',null]){
    await act(async()=>root.render(<AdditionalProfileReadSection section="organization" values={{insurance_renewal:value}}/>));
    expect(renewalValue().textContent).toBe(value===null?'Not provided':String(value));
    expect(renewalValue().querySelector('small')).toBeNull();
  }
});
test('overview links use native destinations and section navigation; people retain unavailable relationships',async()=>{
  const onTab=jest.fn();await act(async()=>root.render(<><AdditionalProfileOverview profile={{}} requirements={[]} programs={[{key:'cis-ig1',name:'CIS IG1'}]} onTab={onTab}/><AdditionalProfilePeople client={{primary_contact_id:'retained',assigned_owner_id:'missing'}}/></>));
  expect(container.querySelector('a[href="/compliance/cis-ig1"]')).toBeTruthy();expect(container.querySelector('a[href="/contacts?open=retained"]')).toBeTruthy();expect(container.textContent).toContain('relationship retained');
  await act(async()=>container.querySelector('.baprof-link').click());expect(onTab).toHaveBeenCalledWith('organization');
});
test('optional read presentation retains the native edit validation, Save profile and Cancel boundaries',async()=>{
  const onSave=jest.fn().mockResolvedValue(undefined),values={employees:0,workforce:'Hybrid'};
  await act(async()=>root.render(<ProfileSection section="organization" values={values} canEdit onSave={onSave} readView={<AdditionalProfileReadSection section="organization" values={values}/>}/>));
  const button=text=>[...container.querySelectorAll('button')].find(node=>node.textContent===text);
  await act(async()=>button('Edit profile section').click());expect(container.querySelector('#profile-employees').value).toBe('0');expect(container.querySelector('#profile-insurance_renewal')).toBeTruthy();
  const change=async value=>act(async()=>{const input=container.querySelector('#profile-employees');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
  await change('-1');await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(onSave).not.toHaveBeenCalled();expect(container.textContent).toContain('Invalid value for Employee count');
  await change('2');await act(async()=>button('Cancel').click());expect(onSave).not.toHaveBeenCalled();expect(container.querySelector('#profile-employees')).toBeNull();
  await act(async()=>button('Edit profile section').click());expect(container.querySelector('#profile-employees').value).toBe('0');await change('3');await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(onSave).toHaveBeenCalledWith({employees:3,workforce:'Hybrid'});
});
