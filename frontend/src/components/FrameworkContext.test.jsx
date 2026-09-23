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
    expect(html).toContain('Framework Reference');
    expect(html).toContain('Implementation Guidance');
    expect(html).toContain('What to Review / Validate');
    expect(html).toContain('Omnisciente guidance');
    expect(html).toContain('Governance &amp; Recurrence');
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
  expect(html).toContain('Official Requirement');
  expect(html).toContain('Addressable does not mean optional');
  expect(html).toContain('Explanation, separate from the regulatory text');
  expect(html).toContain('Authorization or supervision arrangements');
});

test('ISO distinguishes ISMS requirements from risk-based Annex A selection',()=>{
  const definitions=CATALOGS['iso-27001'].requirements;
  expect(context('iso-27001',definitions.find(d=>d.id==='4.1'))).toContain('This is an ISMS requirement');
  expect(context('iso-27001',definitions.find(d=>d.id==='A.5.1'))).toContain('selection alone does not demonstrate implementation');
});

test('HIPAA group-plan governance exposes the limited agent relationship',()=>{
  const c=CATALOGS.hipaa,definition=c.requirements.find(d=>d.id==='164.314(b)(1)');
  const html=context('hipaa',definition);
  expect(html).toContain('RELATED to 164.314(b)(1) only through plan-sponsor agent safeguards');
  expect(html).toContain('does not assess all group-health-plan duties');
  const mapping=c.policy_mappings.find(p=>p.policy_key==='policy-vendor-third-party-risk-management-policy');
  expect(mapping.reason).toContain('164.314(b)(2)(iii)');
  expect(mapping.reason).toContain('not all group-health-plan duties');
  expect(mapping.classification).toBe('recommended');
});

test('SOC explains design versus operation without prescribing an audit period or sample',()=>{
  const html=context('soc-2',CATALOGS['soc-2'].requirements[0]);
  expect(html).toContain('Management Controls describes how this organization addresses it');
  expect(html).toContain('without demonstrating operation across the recorded observation period');
  expect(html).toContain('neither creates an audit opinion');
  expect(html).not.toContain('Official requirement');
});
