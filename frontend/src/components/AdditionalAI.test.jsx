import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AdditionalAI from './AdditionalAI';
import {useAIIntake} from './AIIntake';
import api from '@/lib/api';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
const intake={client_id:'demo_brawndo',usage:'unsure',indicators:[],updated_at:'v1'};
let node,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);api.get.mockImplementation(async path=>({data:path==='/ai-intake'?intake:[]}));api.post.mockImplementation(async(path,body)=>({data:{...body,updated_at:'v2'}}));});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});
const props={clientId:'demo_brawndo',clientName:'Brawndo',rows:[],users:[],intake,canWrite:true,canCreate:true,onOpen:()=>{},onCreate:()=>{}};
function ControlledAI(properties){
  const [query,onSearch]=useState(''),[view,onView]=useState('active'),[showInactive,onShowInactive]=useState(false);
  const intakeEditor=useAIIntake(properties);
  return <AdditionalAI {...properties} {...{query,onSearch,view,onView,showInactive,onShowInactive,intakeEditor}}/>;
}
test('genuine empty AI state has onboarding and native create actions without invented systems or figures',async()=>{
  const create=jest.fn();await act(async()=>root.render(<ControlledAI {...props} onCreate={create}/>));
  expect(node.querySelectorAll('.baai-metrics')).toHaveLength(0);expect(node.querySelector('.baai-thead')).toBeNull();expect(node.textContent).toContain('No AI systems recorded yet');expect(node.querySelectorAll('.baai-onboarding-step')).toHaveLength(3);expect(node.querySelectorAll('.baai-tool')).toHaveLength(6);
  await act(async()=>node.querySelector('.baai-tool-other').click());expect(create).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();
});
test('intake remains an explicit native save with expected version, actor-independent inputs and safe failure',async()=>{
  const saved=jest.fn();await act(async()=>root.render(<ControlledAI {...props} onSaved={saved}/>));
  const yes=[...node.querySelectorAll('button')].find(button=>button.textContent==='Yes');await act(async()=>yes.click());expect(api.post).not.toHaveBeenCalled();
  api.post.mockRejectedValueOnce(new Error('Save unavailable'));await act(async()=>[...node.querySelectorAll('button')].find(button=>button.textContent==='Save AI intake').click());expect(saved).not.toHaveBeenCalled();expect(node.textContent).toContain('Save unavailable');
  await act(async()=>[...node.querySelectorAll('button')].find(button=>button.textContent==='Save AI intake').click());expect(saved).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenLastCalledWith('/ai-intake',expect.objectContaining({client_id:'demo_brawndo',usage:'yes',expected_updated_at:'v1'}));
});
test('attention figure filters actual native alerts; full native opener receives the original record',async()=>{
  const rows=[{ai_system_id:'a',display_id:'AI-1',client_id:'demo_brawndo',name:'Needs review',status:'active',approval_status:'pending_assessment',alerts:[{key:'overdue'}]},{ai_system_id:'b',display_id:'AI-2',client_id:'demo_brawndo',name:'No alerts',status:'active',approval_status:'approved',alerts:[]}],open=jest.fn();
  await act(async()=>root.render(<ControlledAI {...props} rows={rows} onOpen={open}/>));expect(node.querySelector('.baai-thead')).not.toBeNull();
  await act(async()=>[...node.querySelectorAll('.baai-metrics button')].find(button=>button.textContent.startsWith('Needing attention')).click());expect(node.querySelectorAll('.baai-row')).toHaveLength(1);expect(node.querySelector('.baai-name').textContent).toBe('Needs review');
  await act(async()=>node.querySelector('.baai-name').click());expect(open).toHaveBeenLastCalledWith(rows[0]);
});
test('read-only intake has no writes and recorded tool access stays available',async()=>{
  const system={ai_system_id:'a',client_id:'demo_brawndo',name:'Recorded tool',status:'active'},open=jest.fn();await act(async()=>root.render(<ControlledAI {...props} canWrite={false} canCreate={false} rows={[system]} onOpen={open}/>));
  expect(node.querySelector('.baai-intake-fields').disabled).toBe(true);expect(node.querySelectorAll('.baai-tool:disabled')).toHaveLength(6);expect(node.querySelector('[data-testid="new-ai-system"]')).toBeNull();await act(async()=>node.querySelector('.baai-name').click());expect(open).toHaveBeenCalledWith(system);expect(api.post).not.toHaveBeenCalled();
});
