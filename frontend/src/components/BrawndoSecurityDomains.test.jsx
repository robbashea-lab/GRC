import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoSecurityDomains from './BrawndoSecurityDomains';

const row=(definition_id,status='not_assessed')=>({definition_id,status,title:`Native safeguard ${definition_id}`,framework_assessment_id:`assessment-${definition_id}`,implementation:'Preserved native narrative'});
const domain=(overrides={})=>({id:'assets',label:'Asset & Software Management',controlIds:[1,2],safeguardIds:['1.1','1.2','2.1'],rows:[row('1.1','addressed'),row('1.2','in_progress'),row('2.1')],total:3,applicable:3,addressed:1,assessed:2,partial:1,gap:0,notAssessed:1,na:0,available:true,...overrides});
let container,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const render=async(props={})=>{const callbacks={onOpen:props.onOpen||jest.fn(),onSelectDomain:props.onSelectDomain||jest.fn(),onClearDomain:props.onClearDomain||jest.fn()};await act(async()=>root.render(<BrawndoSecurityDomains domains={[domain()]} {...props} {...callbacks}/>));return callbacks;};

test('compares implemented share without partial credit and keeps assessment coverage separate',async()=>{
  await render();
  const toggle=container.querySelector('.bcis-domain-toggle');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(toggle.textContent).toContain('1 of 3');expect(toggle.textContent).toContain('33.3% of applicable');expect(toggle.textContent).toContain('2 of 3');
  expect(container.querySelector('.bcis-domain-fill').style.width).toBe(`${1/3*100}%`);
  expect(container.querySelector('.bcis-domain-details').hidden).toBe(true);
  await act(async()=>toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('true');expect(container.querySelector('.bcis-domain-details').hidden).toBe(false);
  expect(container.querySelector('.bcis-domain-statuses').textContent).toBe('1 Implemented1 Partial1 Not assessed');
  expect(container.querySelector('.bcis-domain-safeguards').textContent).toContain('Native safeguard 1.1');
  await act(async()=>toggle.click());expect(container.querySelector('.bcis-domain-details').hidden).toBe(true);
});

test('both metric labels remain accessible when the desktop column headers are hidden',async()=>{
  await render();
  const labels=[...container.querySelectorAll('.bcis-domain-metric .bcis-domain-mobile-label')];
  expect(labels.map(label=>label.textContent)).toEqual(['Implemented','Assessed']);
  labels.forEach(label=>expect(label.closest('[hidden], [aria-hidden="true"]')).toBeNull());
  const fs=require('node:fs'),path=require('node:path'),css=fs.readFileSync(path.join(__dirname,'BrawndoSecurityDomains.css'),'utf8');
  expect(css).not.toMatch(/\.bcis-domain-mobile-label\s*\{[^}]*\b(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/);
});

test('native safeguard buttons pass the exact canonical object and controls selection clears locally',async()=>{
  const mapped=domain(),callbacks=await render({domains:[mapped],selectedDomainId:'assets'});
  await act(async()=>container.querySelector('.bcis-domain-toggle').click());
  const open=container.querySelector('.bcis-domain-safeguard');
  expect(open.tagName).toBe('BUTTON');expect(open.getAttribute('type')).toBe('button');expect(open.getAttribute('aria-label')).toBe('Open safeguard 1.1 Native safeguard 1.1');
  await act(async()=>open.click());expect(callbacks.onOpen).toHaveBeenCalledTimes(1);expect(callbacks.onOpen.mock.calls[0][0]).toBe(mapped.rows[0]);
  const select=container.querySelector('.bcis-domain-detail-heading button');expect(select.getAttribute('aria-pressed')).toBe('true');
  await act(async()=>select.click());expect(callbacks.onSelectDomain).toHaveBeenCalledWith('assets');
  await act(async()=>container.querySelector('.bcis-domain-selection button').click());expect(callbacks.onClearDomain).toHaveBeenCalledTimes(1);
  expect(callbacks.onOpen).toHaveBeenCalledTimes(1);expect(mapped.rows[0].implementation).toBe('Preserved native narrative');
  await act(async()=>container.querySelector('.bcis-domain-selection button').focus());
  await render({domains:[mapped],...callbacks});expect(document.activeElement).toBe(container.querySelector('h3'));
});

test('unassessed, unavailable and no-applicable domains never imply healthy implementation',async()=>{
  const callbacks=await render({domains:[domain({id:'unknown',label:'Unassessed domain',addressed:0,assessed:0,partial:0,notAssessed:3}),domain({id:'unavailable',label:'Unavailable domain',available:false,total:undefined,applicable:undefined,rows:[],reason:'Canonical assessment records are incomplete.'}),domain({id:'excluded',label:'Excluded domain',applicable:0,addressed:0,assessed:0,partial:0,notAssessed:0,na:3})]});
  const toggles=[...container.querySelectorAll('.bcis-domain-toggle')];
  expect(toggles[0].textContent).toContain('Not assessed');expect(toggles[0].textContent).not.toContain('0.0%');
  expect(toggles[1].textContent).toContain('Implementation source unavailable');expect(toggles[1].textContent).not.toContain('1 of 3');
  expect(toggles[1].textContent).toContain('Counts unavailable');expect(toggles[1].textContent).not.toContain('undefined');
  expect(toggles[2].textContent).toContain('No applicable safeguards');expect(toggles[2].textContent).not.toContain('%');
  expect(container.querySelectorAll('.bcis-domain-current')).toHaveLength(1);
  await act(async()=>toggles[1].click());expect(container.querySelector('[role="status"]').textContent).toBe('Canonical assessment records are incomplete.');
  const unavailableSelect=container.querySelector('[data-domain-id="unavailable"] .bcis-domain-detail-heading button');expect(unavailableSelect.disabled).toBe(true);
  await act(async()=>unavailableSelect.click());expect(callbacks.onSelectDomain).not.toHaveBeenCalled();
});

test('refresh rescues focus from a removed safeguard without moving focus from another control',async()=>{
  const mapped=domain(),callbacks=await render({domains:[mapped]});
  await act(async()=>container.querySelector('.bcis-domain-toggle').click());
  await act(async()=>container.querySelector('.bcis-domain-safeguard').focus());
  await render({domains:[{...mapped,available:false,rows:[],total:undefined,applicable:undefined}],...callbacks});
  expect(document.activeElement).toBe(container.querySelector('.bcis-domain-toggle'));
  await render({domains:[mapped],...callbacks});
  await act(async()=>container.querySelector('.bcis-domain-safeguard').focus());
  const outside=document.createElement('button');document.body.appendChild(outside);outside.focus();
  await render({domains:[{...mapped,available:false,rows:[]}],...callbacks});
  expect(document.activeElement).toBe(outside);outside.remove();
});

test('approved bounded domain notes are visible within their expanded context',async()=>{
  const note='Only IG1 safeguard 15.1: service provider inventory. Does not represent a complete vendor risk management program.';
  await render({domains:[domain({id:'providers',label:'Service Provider Inventory',notes:note})]});
  await act(async()=>container.querySelector('.bcis-domain-toggle').click());
  expect(container.querySelector('.bcis-domain-details').textContent).toContain(note);
});

test('every mapped safeguard uses a semantic native-opening button and expansion survives data refresh',async()=>{
  const mapping=require('../../../shared/catalogs/brawndoSecurityDomains.json');
  const domains=mapping.domains.map(d=>domain({...d,rows:d.safeguardIds.map(id=>row(id)),total:d.safeguardIds.length,applicable:d.safeguardIds.length,addressed:0,assessed:0,partial:0,notAssessed:d.safeguardIds.length}));
  const callbacks=await render({domains});
  for(const toggle of container.querySelectorAll('.bcis-domain-toggle'))await act(async()=>toggle.click());
  const buttons=[...container.querySelectorAll('.bcis-domain-safeguard')];expect(buttons).toHaveLength(56);
  for(const button of buttons)await act(async()=>button.click());
  expect(callbacks.onOpen.mock.calls.map(call=>call[0])).toEqual(domains.flatMap(d=>d.rows));
  callbacks.onOpen.mock.calls.forEach(([record],index)=>expect(record).toBe(domains.flatMap(d=>d.rows)[index]));
  await render({domains:domains.map(d=>({...d})),...callbacks});expect(container.querySelectorAll('.bcis-domain-toggle[aria-expanded="true"]')).toHaveLength(11);
  for(const toggle of container.querySelectorAll('.bcis-domain-toggle')){
    expect(toggle.tagName).toBe('BUTTON');const panel=document.getElementById(toggle.getAttribute('aria-controls'));expect(panel.getAttribute('role')).toBe('region');expect(document.getElementById(panel.getAttribute('aria-labelledby'))).not.toBeNull();
  }
});
