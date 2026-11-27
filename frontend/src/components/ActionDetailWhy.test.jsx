import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {ActionDetailWhy} from './BrawndoActionDetail';
import {frameworkDefinition} from '@/lib/frameworks';
import {actionOrigin} from '@/lib/brawndoActions';

const finding={finding_id:'actual-finding',client_id:'demo_brawndo',title:'Native issue',description:'Actual saved issue',severity:'medium'};
const ticket={raw:finding,finding,title:'Native Action'};
const origin=version=>({kind:'framework_assessments',id:'actual-assessment',label:'Actual safeguard origin',target:{client_id:finding.client_id,framework_assessment_id:'actual-assessment',framework_key:'cis-ig1',framework_version:version,definition_id:'1.1'}});
const markup=props=>{
  const container=document.createElement('div');container.innerHTML=renderToStaticMarkup(<ActionDetailWhy ticket={ticket} {...props}/>);return container;
};

test('an actual CIS 8.1 origin shows its exact licensed catalog source and retains its native origin button',()=>{
  const container=markup({origin:origin('8.1'),onOpen:jest.fn()});
  expect(container.textContent).toContain('CIS Controls v8.1 assessment');
  expect(container.querySelector('blockquote').textContent).toBe(frameworkDefinition('cis-ig1','1.1').official_text);
  expect(container.querySelector('.bad-origin button').textContent).toContain('Safeguard 1.1');
  expect(container.querySelector('.bad-origin button').disabled).toBe(false);
  expect(container.querySelector('.bad-origin a').href).toBe(frameworkDefinition('cis-ig1','1.1').source);
});

test.each([undefined,'8.0'])('unknown/mismatched origin version %s cannot acquire current catalog provenance',version=>{
  const container=markup({origin:origin(version),onOpen:jest.fn()});
  expect(container.textContent).not.toContain('CIS Controls v8.1');expect(container.querySelector('blockquote')).toBeNull();
  expect(container.querySelector('.bad-origin button').textContent).toBe(`CIS assessment → Safeguard 1.1${version?' · '+version:''}`);
  expect(container.querySelector('.bad-origin button').disabled).toBe(false);
});

test.each([undefined,'8.0'])('native origin mapping cannot manufacture a current source-version label for %s',version=>{
  const source={...finding,framework_assessment_id:'actual-assessment'};
  const mapped=actionOrigin(source,{framework_assessments:[origin(version).target]},source);
  expect(mapped.label).toContain('CIS Controls v8.1');
  const container=markup({origin:mapped,onOpen:jest.fn()});
  expect(container.textContent).not.toContain('CIS Controls v8.1');
  expect(container.querySelector('.bad-origin button').textContent).toBe(`CIS assessment → Safeguard 1.1${version?' · '+version:''}`);
  expect(container.querySelector('blockquote')).toBeNull();
});

test.each([undefined,'8.0'])('native origin navigation remains operable when version %s is unqualified',async version=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container),onOpen=jest.fn();
  try{
    await act(async()=>root.render(<ActionDetailWhy ticket={ticket} origin={origin(version)} onOpen={onOpen}/>));
    await act(async()=>container.querySelector('.bad-origin button').click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>root.unmount());container.remove();}
});
