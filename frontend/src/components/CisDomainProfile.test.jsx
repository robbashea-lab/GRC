import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CisDomainProfile from './CisDomainProfile';
import {cisWorkspace} from '@/testUtils/cisExperience';
import {cisSecurityDomainMapping} from '@/lib/brawndoSecurityDomains';

let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.useRealTimers();});

const pointer = async (node, type, relatedTarget = null) => act(async () => {
  node.dispatchEvent(new MouseEvent(type, {bubbles: true, relatedTarget}));
});
const renderProfile = async () => act(async () => root.render(<CisDomainProfile source={cisWorkspace('synthetic', 1)} clientId="synthetic" implementationGroup={1}/>));

test.each([1,2,3])('native IG%s domain table, radar alternatives and rates agree; unknown work is not a failure',async group=>{
  const source=cisWorkspace('synthetic',group);
  await act(async()=>root.render(<CisDomainProfile source={source} clientId="synthetic" implementationGroup={group}/>));
  const domains=cisSecurityDomainMapping(group),rows=host.querySelectorAll('tbody tr');
  expect(rows).toHaveLength(domains.length);
  expect(host.querySelectorAll('.cdp-radar-point')).toHaveLength(domains.length);
  for(const [index,domain] of domains.entries()){
    expect(rows[index].textContent).toContain(domain.label);
    expect(rows[index].querySelectorAll('td')[1].textContent).toBe(String(domain.safeguardIds.length));
    expect(rows[index].querySelectorAll('td')[2].textContent).toBe('0.0%');
  }
  const trigger=host.querySelector('.cdp-domain-name');
  await act(async()=>trigger.focus());
  expect(document.querySelector('.cdp-domain-tip').textContent).toContain('implementation is unknown');
  expect(document.querySelector('.cdp-domain-tip').textContent).not.toContain('known not-implemented');
  expect(document.querySelector('.cdp-domain-tip dl').textContent).toContain('Not assessed');
});

test('wrong client or changed program suppresses old rates and domain controls',async()=>{
  const source=cisWorkspace('synthetic',1);
  await act(async()=>root.render(<CisDomainProfile source={source} clientId="synthetic" implementationGroup={1}/>));
  expect(host.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  await act(async()=>root.render(<CisDomainProfile source={source} clientId="other" implementationGroup={2}/>));
  expect(host.querySelectorAll('tbody tr')).toHaveLength(0);
  expect(host.querySelector('[role=status]').textContent).toContain('unavailable');
});

test('pointer can enter the native named detail popup and leave it without stealing focus or reopening', async () => {
  jest.useFakeTimers();
  await renderProfile();
  const external = document.createElement('button');
  document.body.appendChild(external);
  try {
    await act(async () => external.focus());
    const trigger = host.querySelector('.cdp-domain-name');
    await pointer(trigger, 'pointerover');
    const popup = document.querySelector('.cdp-domain-tip');
    expect(popup.getAttribute('role')).toBe('dialog');
    expect(popup.getAttribute('aria-label')).toBe('Asset & Software Management implementation details');
    expect(document.activeElement).toBe(external);
    await pointer(trigger, 'pointerout', popup);
    await pointer(popup, 'pointerover', trigger);
    await act(async () => jest.advanceTimersByTime(200));
    expect(document.querySelector('.cdp-domain-tip')).not.toBeNull();
    await pointer(popup, 'pointerout', external);
    await act(async () => jest.advanceTimersByTime(200));
    await act(async () => jest.advanceTimersByTime(0));
    expect(document.querySelector('.cdp-domain-tip')).toBeNull();
    expect(document.activeElement).toBe(external);
  } finally {
    external.remove();
  }
});

test('keyboard focus and click expose the same actual counts; Escape dismisses without losing the invoker', async () => {
  await renderProfile();
  const trigger = host.querySelector('.cdp-domain-name');
  await act(async () => trigger.focus());
  const focused = document.querySelector('.cdp-domain-tip').textContent;
  expect(focused).toContain('0 of 5 implemented');
  expect(focused).toMatch(/Not assessed5/);
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  expect(document.querySelector('.cdp-domain-tip')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.dispatchEvent(new MouseEvent('click', {bubbles: true})));
  expect(document.querySelector('.cdp-domain-tip').textContent).toBe(focused);
});

test('unavailable client context removes an already open native popup and every stale domain trigger', async () => {
  await renderProfile();
  await act(async () => host.querySelector('.cdp-domain-name').focus());
  expect(document.querySelector('.cdp-domain-tip')).not.toBeNull();
  await act(async () => root.render(<CisDomainProfile source={cisWorkspace('synthetic', 1)} clientId="foreign" implementationGroup={1}/>));
  expect(document.querySelector('.cdp-domain-tip')).toBeNull();
  expect(host.querySelectorAll('.cdp-domain-name,.cdp-radar-point')).toHaveLength(0);
});

test('hovering a second domain replaces a detail opened by keyboard focus', async () => {
  jest.useFakeTimers();
  await renderProfile();
  const [first, second] = host.querySelectorAll('.cdp-domain-name');
  await act(async () => first.focus());
  expect(document.querySelectorAll('.cdp-domain-tip')).toHaveLength(1);
  await pointer(second, 'pointerover');
  await act(async () => jest.advanceTimersByTime(200));
  expect(document.querySelectorAll('.cdp-domain-tip')).toHaveLength(1);
  expect(document.querySelector('.cdp-domain-tip h3').textContent).toBe('Data Protection');
});

test('tap details stay readable after finger leaves until Escape or an outside interaction',async()=>{
  jest.useFakeTimers();await renderProfile();
  const trigger=host.querySelector('.cdp-domain-name');
  await act(async()=>trigger.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await pointer(trigger,'pointerout',document.body);
  await act(async()=>jest.advanceTimersByTime(500));
  expect(document.querySelectorAll('.cdp-domain-tip')).toHaveLength(1);
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(document.querySelector('.cdp-domain-tip')).toBeNull();
});
