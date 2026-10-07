import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CisOverview from './BrawndoCisOverview';
import CisControls from './BrawndoCisControls';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn().mockResolvedValue({data:[]})}}));
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

test('Brawndo pilot snapshot and controls use real counts, native filters and keyboard navigation',async()=>{
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);global.IS_REACT_ACT_ENVIRONMENT=true;
  const onFilter=jest.fn(),onControl=jest.fn();
  const rows=[{control:1,control_name:'Enterprise assets',status:'addressed'},{control:1,control_name:'Enterprise assets',status:'needs_attention'},{control:2,control_name:'Software assets',status:'not_assessed'}];
  await act(async()=>root.render(<><CisOverview workspacePilot controlCount={2} summary={{total:3,applicable:3,assessed:2,addressed:1,partial:0,gap:1,notAssessed:1,na:0,implemented:33}} filter="all" onFilter={onFilter}/><CisControls workspacePilot rows={rows} onControl={onControl}/></>));
  expect(container.querySelector('.bwp-cis-snapshot').textContent).toContain('2 controls · 3 IG1 safeguards');expect(container.querySelector('.bd-donut-value').textContent).toBe('33.3%');
  expect([...container.querySelectorAll('th')].map(n=>n.textContent)).toEqual(['Control','IG1 safeguards','Implementation','Assessment','Open control']);
  await act(async()=>container.querySelector('.bcis-legend button').click());expect(onFilter).toHaveBeenCalledWith('addressed');
  const buttons=[...container.querySelectorAll('.bwp-control-filters button')];await act(async()=>buttons[2].click());expect(container.querySelectorAll('tbody tr')).toHaveLength(1);expect(container.querySelector('tbody').textContent).toContain('Software assets');expect(buttons[0].textContent).toBe('All controls 2');
  await act(async()=>container.querySelector('tbody tr').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(onControl).toHaveBeenCalledWith('2');
  expect(rows[2].status).toBe('not_assessed');await act(async()=>root.unmount());container.remove();
});
