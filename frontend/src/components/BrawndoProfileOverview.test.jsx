import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoProfileOverview,{listOf} from './BrawndoProfileOverview';
jest.mock('react-router-dom',()=>({Link:({children,to,...rest})=><a href={to} {...rest}>{children}</a>}),{virtual:true});
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('semicolon and array values both become tag lists; empties are dropped',()=>{
  expect(listOf('Operations; Technology;  Finance')).toEqual(['Operations','Technology','Finance']);
  expect(listOf(['MFA','EDR'])).toEqual(['MFA','EDR']);expect(listOf(null)).toEqual([]);expect(listOf('')).toEqual([]);
});
test('overview shows identity, figures, people and only recorded fields; section links switch tabs',async()=>{
  const onTab=jest.fn();
  const profile={organization:{legal_name:'Brawndo',domain:'brawndo.example.test',organization_type:'Private company',business_units:'Operations; Technology',employees:180,technology_users:160},technical:{identity:['Microsoft Entra ID'],endpoints:['Windows','macOS']},security:{data_types:['Employee information'],collects:'Yes',hosts:'No'}};
  const relationships={primary_contact_id:'c',primary_contact_record:{name:'Joe Bowers',title:'Security Program Lead',email:'j@example.test',status:'active'},assigned_owner_id:null};
  await act(async()=>root.render(<BrawndoProfileOverview client={{name:'Brawndo',industry:'Beverage'}} relationships={relationships} profile={profile} programs={[{key:'cis-ig1',name:'CIS Controls v8.1 IG1'}]} onTab={onTab}/>));
  const text=container.textContent;
  expect(container.querySelector('.bprof-facts').textContent).toBe('Employees180Technology users160Business units2Active program1');
  expect(text).toContain('Joe Bowers');expect(text).toContain('Security Program Lead · j@example.test');expect(text).toContain('Unassigned');
  expect([...container.querySelectorAll('.bprof-tag')].map(t=>t.textContent)).toEqual(expect.arrayContaining(['Operations','Technology','Windows','macOS','Employee information']));
  expect(container.querySelector('.bprof-yn').textContent).toBe('CollectsYesHosts customer workloadsNo');
  expect(text).not.toContain('Cloud platforms');
  expect(container.querySelector('a[href="/compliance/cis-ig1"]')).toBeTruthy();
  await act(async()=>[...container.querySelectorAll('.bprof-link')].find(b=>b.closest('[aria-label="Technical environment"]')).click());
  expect(onTab).toHaveBeenCalledWith('technical');
});
