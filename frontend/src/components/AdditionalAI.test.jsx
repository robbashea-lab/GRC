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

test('AI register logos retain native names, state and keyboard opening for catalog and custom records',async()=>{
  const known=Object.freeze({ai_system_id:'known',display_id:'AI-1',catalog_key:'chatgpt',client_id:'demo_brawndo',name:'Renamed assistant',provider:'OpenAI',status:'active',approval_status:'approved'});
  const custom=Object.freeze({ai_system_id:'custom',display_id:'AI-2',client_id:'demo_brawndo',name:'ChatGPT custom',status:'active',approval_status:'pending_assessment'});
  const open=jest.fn();
  await act(async()=>root.render(<ControlledAI {...props} rows={[known,custom]} onOpen={open}/>));
  const rows=node.querySelectorAll('.baai-row');
  expect(rows[0].querySelector('.register-identity-logo img').alt).toBe('');
  expect(rows[1].querySelector('.register-identity-logo img')).toBeNull();
  expect(rows[0].querySelector('.baai-name').textContent).toBe('Renamed assistant');
  expect(rows[0].querySelector('.baai-approval').textContent).toContain('Approved');
  expect(rows[0].querySelector('.register-identity-logo').querySelector('button,a,[tabindex]')).toBeNull();
  await act(async()=>rows[0].querySelector('.baai-name').click());
  expect(open).toHaveBeenLastCalledWith(known);
  expect(api.post).not.toHaveBeenCalled();
});
function ControlledAI(properties){
  const [query,onSearch]=useState(''),[view,onView]=useState('active'),[showInactive,onShowInactive]=useState(false);
  const intakeEditor=useAIIntake(properties);
  return <AdditionalAI {...properties} {...{query,onSearch,view,onView,showInactive,onShowInactive,intakeEditor}}/>;
}
test('genuine empty AI state has onboarding and native create actions without invented systems or figures',async()=>{
  const create=jest.fn();await act(async()=>root.render(<ControlledAI {...props} onCreate={create}/>));
  expect(node.querySelectorAll('.baai-metrics')).toHaveLength(0);expect(node.querySelector('.baai-thead')).toBeNull();expect(node.textContent).toContain('No AI systems recorded yet');expect(node.querySelectorAll('.baai-onboarding-step')).toHaveLength(3);expect(node.querySelectorAll('.baai-tool')).toHaveLength(11);
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
  expect(node.querySelector('.baai-intake-fields').disabled).toBe(true);expect(node.querySelectorAll('.baai-tool:disabled')).toHaveLength(11);expect(node.querySelector('[data-testid="new-ai-system"]')).toBeNull();await act(async()=>node.querySelector('.baai-name').click());expect(open).toHaveBeenCalledWith(system);expect(api.post).not.toHaveBeenCalled();
});

test('tool selection opens an editable draft suggestion without a write or persisted Added claim',async()=>{
 const create=jest.fn();await act(async()=>root.render(<ControlledAI {...props} onCreate={create}/>));
 await act(async()=>node.querySelector('.baai-tool').click());
 expect(create).toHaveBeenLastCalledWith(expect.objectContaining({k:'chatgpt',name:'ChatGPT',provider:'OpenAI'}));
 expect(api.post).not.toHaveBeenCalled();expect(node.textContent).not.toContain('✓ Added');
});

test('No-intake pill and dimmed steps reflect the native draft without extra copy or changing versioned Save',async()=>{
  await act(async()=>root.render(<ControlledAI {...props}/>));
  const choice=label=>[...node.querySelectorAll('.baai-intake-fields button')].find(button=>button.tagName==='BUTTON'&&button.textContent===label);
  await act(async()=>choice('No').click());
  expect(node.querySelector('.baai-pill').textContent).toBe('No AI use recorded');
  expect(node.querySelectorAll('.baai-disabled')).toHaveLength(2);expect(node.querySelectorAll('.baai-tool:disabled')).toHaveLength(11);
  expect(node.querySelector('.baai-notice')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
  await act(async()=>choice('Yes').click());
  expect(node.querySelectorAll('.baai-disabled')).toHaveLength(0);expect(node.querySelectorAll('.baai-tool:disabled')).toHaveLength(0);
  expect(node.querySelector('.baai-pill').textContent).toContain('Uses AI');
  await act(async()=>[...node.querySelectorAll('button')].find(button=>button.textContent==='Save AI intake').click());
  expect(api.post).toHaveBeenLastCalledWith('/ai-intake',expect.objectContaining({usage:'yes',expected_updated_at:'v1'}));
});

test('multiple saved rationale entries for one Risk show one relationship without changing history',async()=>{
 const row={ai_system_id:'ai-1',client_id:'demo_brawndo',name:'AI with Risk context',status:'active',related_links:[{kind:'risks',id:'risk-1',rationale:'Original note'},{kind:'risks',id:'risk-1',rationale:'Additional note'}]},before=JSON.stringify(row);
 await act(async()=>root.render(<ControlledAI {...props} rows={[row]}/>));
 expect(node.querySelectorAll('.baai-risks>span')).toHaveLength(1);expect(JSON.stringify(row)).toBe(before);
});

test('a populated register keeps its column headings when a search matches no systems',async()=>{
  const row={ai_system_id:'ai-one',client_id:'demo_brawndo',name:'Recorded AI',status:'active'};
  await act(async()=>root.render(<ControlledAI {...props} rows={[row]}/>));
  const search=node.querySelector('[data-testid="ai-system-search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'unmatched query');search.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(node.querySelectorAll('.baai-row')).toHaveLength(0);expect(node.querySelector('.baai-thead')).not.toBeNull();expect(node.textContent).toContain('No AI systems match');
  await act(async()=>[...node.querySelectorAll('button')].find(button=>button.textContent==='Clear filters').click());expect(node.querySelectorAll('.baai-row')).toHaveLength(1);expect(api.post).not.toHaveBeenCalled();
});
test.each([['High risk','high'],['Pending approval','pending'],['Needing attention','attention']])('clicking the selected %s figure restores All active without writing',async(label,view)=>{
  const rows=[{ai_system_id:'attention-ai',client_id:'demo_brawndo',name:'Needs attention',status:'active',risk_tier:'high',approval_status:'pending_assessment',alerts:[{key:'schedule'}]},{ai_system_id:'other-ai',client_id:'demo_brawndo',name:'Other AI',status:'active',risk_tier:'low',approval_status:'approved',alerts:[]}];
  await act(async()=>root.render(<ControlledAI {...props} rows={rows}/>));
  const figure=[...node.querySelectorAll('.baai-metrics button')].find(button=>button.textContent.startsWith(label));
  await act(async()=>figure.click());expect(figure.getAttribute('aria-pressed')).toBe('true');expect(node.querySelectorAll('.baai-row')).toHaveLength(1);
  if(view!=='attention')expect(node.querySelector('[data-testid="ai-system-view-'+view+'"]').getAttribute('aria-pressed')).toBe('true');
  await act(async()=>figure.click());expect(figure.getAttribute('aria-pressed')).toBe('false');expect(node.querySelectorAll('.baai-row')).toHaveLength(2);
  expect(node.querySelector('[data-testid="ai-system-view-active"]').getAttribute('aria-pressed')).toBe('true');expect(api.post).not.toHaveBeenCalled();
});
