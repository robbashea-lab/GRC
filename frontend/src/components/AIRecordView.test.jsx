import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AIRecordView from './AIRecordView';
import api from '@/lib/api';
import {readEvidenceFile} from '@/lib/evidenceFile';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
jest.mock('@/lib/evidenceFile',()=>({readEvidenceFile:jest.fn()}));
jest.mock('./EvidencePanel',()=>()=>null);
let node,root;
const record={ai_system_id:'ai-one',client_id:'a',name:'Synthetic AI',status:'draft'};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.append(node);root=createRoot(node);api.get.mockImplementation(async path=>({data:path==='/related'?{}:[]}));});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});
test('an in-flight file read cannot upload after write context is withdrawn',async()=>{
  let finish;readEvidenceFile.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const render=canWrite=>root.render(<AIRecordView record={record} clientId="a" users={[]} canWrite={canWrite} onClose={()=>{}} onEdit={()=>{}} onRelated={()=>{}}/>);
  await act(async()=>render(true));
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Evidence').click());
  const input=document.querySelector('input[type="file"]');
  Object.defineProperty(input,'files',{value:[new File(['synthetic'],'test.txt',{type:'text/plain'})]});
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
  await act(async()=>render(false));
  await act(async()=>finish('c3ludGhldGlj'));
  expect(api.post).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Client context changed');
});
