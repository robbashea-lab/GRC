import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CisProgramSettings,{CisGroupSelect} from './CisProgramSettings';
import cis from '@catalogs/cisIG1.json';

let root,container;
const originalGroups=[...cis.available_implementation_groups];
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();cis.available_implementation_groups=originalGroups;});

test('production selector exposes only released IG1 and IG2',async()=>{
  await act(async()=>root.render(<CisGroupSelect value={1} onChange={()=>{}}/>));
  expect([...container.querySelectorAll('option')].map(o=>o.value)).toEqual(['1','2']);
  expect([...container.querySelectorAll('option')].every(o=>o.textContent.includes('safeguards')&&!o.querySelector('span'))).toBe(true);
  expect(container.textContent).not.toContain('IG3');
});

test.each([[2,130,23],[1,56,97]])('IG3 reduction to IG%i shows accurate retained impact',async(group,count,removed)=>{
  cis.available_implementation_groups=[1,2,3];
  await act(async()=>root.render(<CisProgramSettings clientId="synthetic" configuration={{implementation_group:3}}/>));
  const selector=container.querySelector('select');
  await act(async()=>{selector.value=String(group);selector.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Review scope change').click());
  expect(document.body.textContent).toContain(`from 153 to ${count} safeguards`);
  expect(document.body.textContent).toContain(`${removed} removed safeguards remain available as retained history`);
  const confirm=[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm scope change');
  expect(confirm.disabled).toBe(true);
});
