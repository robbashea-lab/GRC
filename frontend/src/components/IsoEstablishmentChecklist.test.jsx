import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Checklist,{establishmentRows} from './IsoEstablishmentChecklist';
jest.mock('react-router-dom',()=>({Link:({to,children,...props})=><a href={to} {...props}>{children}</a>}),{virtual:true});
const row=(ref,extra={})=>({client_id:'a',framework_key:'iso-27001',definition_id:ref,framework_assessment_id:'iso-'+ref,status:'not_assessed',...extra});
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('six areas distinguish unresolved information from conclusions; no confirmation writes or required onboarding fields',async()=>{
 const rows=[row('4.1',{implementation:'Controlled context reference https://records.example/context-v2',owner_id:'owner',last_assessed:'2026-10-01'}),row('4.2',{related_links:[{kind:'evidence',id:'external-ref'}]}),row('4.3',{status:'addressed'}),row('5.3',{notes:'   '}),row('6.2',{status:'addressed'})];
 const before=JSON.stringify(rows);await act(async()=>root.render(<Checklist rows={rows} clientId="a"/>));
 expect(container.querySelectorAll('li')).toHaveLength(6);
 expect(container.textContent).toContain('2 of 3 clause records have supporting information; establishment still to assess');
 expect(container.textContent).toContain('4.3: addressed');
 expect(container.querySelector('[aria-label="Open ISO 4.3 unresolved work"]')).toBeTruthy();
 expect(container.textContent).toContain('Unresolved — no supporting information recorded');
 expect(container.textContent).toContain('not establishment confirmed, Implemented, Verified or compliant');
 expect(container.textContent).toContain('business owner who approved');
 expect(container.querySelector('input,textarea,button')).toBeNull();expect(JSON.stringify(rows)).toBe(before);
});

test('links use actual authorized assessment identities; other tenants/frameworks cannot supply checklist records',async()=>{
 await act(async()=>root.render(<Checklist clientId="a" rows={[row('4.3',{framework_assessment_id:'a special/id'}),row('5.3',{client_id:'b',notes:'foreign'}),row('6.2',{framework_key:'soc-2'})]}/>));
 expect(container.querySelector('[aria-label="Open ISO 4.3 unresolved work"]').getAttribute('href')).toBe('/compliance/iso-27001?iso_view=isms_clause&assessment=a%20special%2Fid');
 expect(container.textContent).toContain('5.3 · Record unavailable');
 expect(container.textContent).toContain('6.2 · Record unavailable');
 expect(container.innerHTML).not.toContain('foreign');
 expect(establishmentRows([row('4.1',{notes:'retained'})],'b')[0].requirements.every(r=>!r.recorded)).toBe(true);
});

test('reloading reads the authoritative narrative and clearing it exposes unresolved work again without changing assessment status',async()=>{
 let rows=[row('6.2',{notes:'Objective: RTO <=4h; owner CTO; quarterly measurement; external register v1'})];
 await act(async()=>root.render(<Checklist clientId="a" rows={rows}/>));
 expect(container.querySelector('[aria-label="Open ISO 6.2 supporting information"]')).toBeTruthy();
 rows=[row('6.2')];await act(async()=>root.render(<Checklist clientId="a" rows={rows}/>));
 expect(container.querySelector('[aria-label="Open ISO 6.2 unresolved work"]')).toBeTruthy();
 expect(rows[0].status).toBe('not_assessed');
});

test('generated Review relationships alone remain unresolved in the full-record workspace',async()=>{
 await act(async()=>root.render(<Checklist clientId="a" rows={[row('6.2',{related_links:[{kind:'reviews',id:'generated'}]})]}/>));
 expect(container.querySelector('[aria-label="Open ISO 6.2 unresolved work"]')).toBeTruthy();
 expect(container.textContent).toContain('Review links alone do not count');
});
