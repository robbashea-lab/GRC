import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CisOverview from './BrawndoCisOverview';
test('CIS dashboard retains approved metrics and filters without next-work prose or export',async()=>{
  const container=document.createElement('div');document.body.appendChild(container);
  const root=createRoot(container);global.IS_REACT_ACT_ENVIRONMENT=true;
  await act(async()=>root.render(<CisOverview summary={{applicable:56,assessed:49,addressed:40,partial:6,gap:3,notAssessed:7,na:0}} filter="all" onFilter={()=>{}} resume={{definition_id:'3.2'}}/>));
  expect(container.textContent).not.toMatch(/still to assess|Continue with safeguard 3\.2|Export program CSV/);
  expect(container.textContent).toContain('Implemented');expect(container.textContent).toContain('Assessed');
  expect([...container.querySelectorAll('button')].map(b=>b.textContent)).toEqual(['Implemented40','Partial6','Not implemented3','Not assessed7']);
  const fs=require('node:fs'),path=require('node:path');
  expect(fs.readFileSync(path.join(__dirname,'../pages/FrameworkWorkspace.jsx'),'utf8')).not.toContain('Export program CSV');
  await act(async()=>root.unmount());container.remove();
});
