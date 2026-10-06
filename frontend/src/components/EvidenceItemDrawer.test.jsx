import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import EvidenceItemDrawer from './EvidenceItemDrawer';
import api from '@/lib/api';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{post:jest.fn(),delete:jest.fn()},formatError:e=>e.message}));
jest.mock('./EvidenceLibraryControls',()=>({
  useLibraryRequest:()=>({data:{evidence_id:'file',filename:'Synthetic.txt',client_id:'client',references:[{kind:'framework_assessments',id:'assessment',title:'ISO requirement',origin:'supporting',available:true}]}}),
  MetadataFields:()=>null,SourcePicker:()=>null,selectClass:''
}));
jest.mock('@/lib/evidenceContext',()=>({EvidenceSource:()=>null,downloadEvidence:jest.fn(),uploaderLabel:()=>''}));
jest.mock('./ui/sheet',()=>({Sheet:({children})=><div>{children}</div>,SheetContent:({children})=><div>{children}</div>,SheetHeader:({children})=><div>{children}</div>,SheetTitle:({children})=><h2>{children}</h2>,SheetDescription:({children})=><p>{children}</p>}));

test('Evidence Library unlink removes only the framework relationship using the supported command',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const node=document.createElement('div');document.body.appendChild(node);const root=createRoot(node),changed=jest.fn();
  const confirm=jest.spyOn(window,'confirm').mockReturnValue(true);
  try{
    await act(async()=>root.render(<EvidenceItemDrawer id="file" onChanged={changed}/>));
    await act(async()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Related').click());
    await act(async()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Unlink').click());
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('/framework_assessments/assessment/links',{data:{kind:'evidence',id:'file'}});
    expect(api.post).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>root.unmount());node.remove();confirm.mockRestore();jest.clearAllMocks();}
});
