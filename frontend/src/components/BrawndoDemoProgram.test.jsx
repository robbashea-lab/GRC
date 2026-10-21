import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoDemoProgram from './BrawndoDemoProgram';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({useNavigate: () => mockNavigate}));
jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn()}, formatError: error => error.message}));

test('status cells and composition segments open exact native client workspace filters', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const current = {availability:'available', captured_at:'2026-10-15T12:00:00Z', denominator:4, implemented:1,
    scope:{framework_key:'cis-ig1',catalog_version:'8.1',configuration:{implementation_group:1}},
    counts:['addressed','in_progress','needs_attention','not_assessed'].map(key => ({key,label:key,count:1}))};
  const client = {client_id:'demo_brawndo', name:'Brawndo'};
  const program = {program_id:'demo_brawndo:cis-ig1', program_key:'cis-ig1', framework_key:'cis-ig1', program_label:'CIS IG1', to:'/compliance/cis-ig1?client_id=demo_brawndo', current};
  api.get.mockResolvedValue({data:{client_id:client.client_id, program_key:program.program_key, current, as_of:current.captured_at, snapshots:[]}});
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BrawndoDemoProgram client={client} program={program} />));
    for (const selector of ['.ph-breakdown-row','.ph-interactive-bar button']) {
      for (const [index,key] of ['addressed','in_progress','needs_attention','not_assessed'].entries()) {
        await act(async () => container.querySelectorAll(selector)[index].click());
        expect(mockNavigate).toHaveBeenLastCalledWith(`/compliance/cis-ig1?client_id=demo_brawndo&view=${key}`);
      }
    }
  } finally { await act(async () => root.unmount()); container.remove(); }
});

test('inline history rejects a mismatched canonical CIS scope',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;
 const client={...cisClient('demo_brawndo',1),name:'Brawndo'};
 const current={captured_at:'2026-10-15T12:00:00Z',scope:{framework_key:'cis-ig1',catalog_version:'8.1',configuration:{implementation_group:2}}};
 const program={program_id:'demo_brawndo:cis-ig1',program_key:'cis-ig1',framework_key:'cis-ig1',program_label:'CIS IG1',to:'/compliance/cis-ig1?client_id=demo_brawndo',current:null};
 api.get.mockResolvedValue({data:{client_id:client.client_id,program_key:'cis-ig1',current,as_of:current.captured_at,snapshots:[]}});
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 try{await act(async()=>root.render(<BrawndoDemoProgram client={client} program={program}/>));expect(container.querySelector('[role=alert]').textContent).toContain('scope does not match');}
 finally{await act(async()=>root.unmount());container.remove();}
});
