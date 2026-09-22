import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkMappings from './FrameworkMappings';
test('support mappings identify every framework even when legacy catalogs lack a label',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const element=document.createElement('div'),root=createRoot(element);
  try{
    await act(async()=>root.render(<FrameworkMappings framework="nist-csf-2" definition="PR.AA-05"/>));
    for(const label of ['CIS IG1 6.1','HIPAA 164.308','ISO 27001 A.5.18','SOC 2 CC6.2'])expect(element.textContent).toContain(label);
    expect(element.querySelectorAll('a')).toHaveLength(4);
    expect(element.textContent).toContain('not equivalence');
  }finally{await act(async()=>root.unmount());}
});
