import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoCisFindings from './BrawndoCisFindings';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{role:'platform_admin',client_ids:['isolated']}})}));

test('an IG3 Finding draft identifies the configured scope and keeps the assessment as origin',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const record={client_id:'isolated',framework_assessment_id:'assessment-1.5',related_links:[]};
 try{
  await act(async()=>root.render(<BrawndoCisFindings record={record} current={record} definition={{id:'1.5',title:'Use a Passive Asset Discovery Tool'}} ctx={{configuration:{implementation_group:3},users:[]}} related={{findings:[],tasks:[]}} finding={{title:'',description:'',severity:'medium',owner_id:'',due_date:'',remediation_title:''}} writable setFinding={()=>{}}/>));
  expect(container.querySelector('[data-testid="finding-origin"]').textContent).toBe('Origin: CIS IG3 · Safeguard 1.5 — Use a Passive Asset Discovery Tool');
  expect(record.framework_assessment_id).toBe('assessment-1.5');
 }finally{await act(async()=>root.unmount());container.remove();}
});
