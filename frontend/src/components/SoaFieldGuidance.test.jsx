import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SoaFieldGuidance from './SoaFieldGuidance';

let root,container;
const fields=[
  ['necessary','Is this control necessary for the organization’s selected treatments or applicable obligations?'],
  ['rationale','What is the organization-specific reason for including this control or excluding it from the Annex A reference set?'],
  ['risk-links','Which assessed risks or other obligations support that decision?'],
  ['implementation','If necessary, is the control implemented?'],
  ['owner','Who is responsible for the decision and its maintenance?'],
  ['review-trigger','What organizational changes or planned review arrangements will prompt reconsideration?'],
];
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test.each(['A.5.1','A.8.34'])('%s renders all six exact native-field prompts and the correct SoA source without creating controls',async definitionId=>{
  for(const [field,prompt] of fields){
    await act(async()=>root.render(<SoaFieldGuidance definitionId={definitionId} field={field}/>));
    const guidance=container.querySelector(`[data-soa-guidance="${field}"]`);expect(guidance).not.toBeNull();
    expect(guidance.querySelector('p').textContent).toBe(prompt);
    expect(guidance.textContent).toContain('The SoA records necessary controls, inclusion reasons, implementation and justified Annex A exclusions. The decision must reflect this organization, rather than a default answer.');
    expect(guidance.textContent).toContain('ISO/IEC 27001:2022 · 6.1.3(d)');expect(guidance.textContent).not.toContain('ISO/IEC 27001:2022 · '+definitionId);
    expect(guidance.querySelectorAll('input,select,textarea,button')).toHaveLength(0);expect(guidance.querySelectorAll('fieldset,[role="dialog"],aside')).toHaveLength(0);
  }
});

test.each([['A.5.1','unrecognized-field'],['not-a-control','necessary'],['4.1','necessary']])('missing SoA metadata for %s/%s leaves the native field without invented guidance',async(definitionId,field)=>{
  await act(async()=>root.render(<SoaFieldGuidance definitionId={definitionId} field={field}/>));expect(container.childNodes).toHaveLength(0);
});
