import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import FrameworkContext from './FrameworkContext';
import {CATALOGS} from '@/lib/frameworks';

const context=(framework,definition)=>renderToStaticMarkup(<FrameworkContext framework={framework} definition={definition} catalog={CATALOGS[framework]} related={{reviews:[]}} loading={false}/>);

test.each(Object.entries(CATALOGS))('%s renders every current item with source, explanation and progressive guidance', (framework,catalog)=>{
  const before=JSON.stringify(catalog);
  for(const definition of catalog.requirements){
    const html=context(framework,definition);
    expect(html).toContain(definition.id);
    expect(html).toContain('What this means');
    expect(html).toContain('Implementation guidance');
    expect(html).toContain('Evidence examples');
    expect(html).toContain('Omnisciente guidance');
    expect(html).toContain('Governance &amp; recurrence');
    expect(html).not.toMatch(/undefined|\[object Object\]/);
    expect(definition.source).toMatch(/^https:\/\//);
  }
  expect(JSON.stringify(catalog)).toBe(before);
});

test('NIST explains current achievement separately from Target Profile decisions',()=>{
  const html=context('nist-csf-2',CATALOGS['nist-csf-2'].requirements[0]);
  expect(html).toContain('A target is not evidence of current achievement');
  expect(html).toContain('not a prescribed technology or artifact');
  expect(html).not.toContain('Official requirement');
});

test('HIPAA keeps regulatory text and addressability visible without replacing them with guidance',()=>{
  const definition=CATALOGS.hipaa.requirements.find(d=>d.id==='164.308(a)(3)(ii)(A)');
  const html=context('hipaa',definition);
  expect(html).toContain('Official requirement · regulatory text');
  expect(html).toContain('Addressable does not mean optional');
  expect(html).toContain('Explanation, separate from the regulatory text');
  expect(html).toContain('Authorization or supervision arrangements');
});

test('ISO distinguishes ISMS requirements from risk-based Annex A selection',()=>{
  const definitions=CATALOGS['iso-27001'].requirements;
  expect(context('iso-27001',definitions.find(d=>d.id==='4.1'))).toContain('This is an ISMS requirement');
  expect(context('iso-27001',definitions.find(d=>d.id==='A.5.1'))).toContain('selection alone does not demonstrate implementation');
});
