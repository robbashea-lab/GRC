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
  expect(host.querySelectorAll('.cdp-axis-label')).toHaveLength(domains.length);
  for(const [index,domain] of domains.entries()){
    expect(rows[index].textContent).toContain(domain.label);
    const axis=host.querySelectorAll('.cdp-axis-label')[index];
    expect(axis.getAttribute('aria-label')).toBe(`${domain.label}: 0.0%`);
    expect(axis.querySelector('.cdp-axis-rate').textContent).toBe('0.0%');
    expect([...axis.querySelectorAll('tspan:not(.cdp-axis-rate)')].map(line=>line.textContent).join(' ')).toBe(domain.label);
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


test('named axis and adjacent table use the same native rounded implemented rate',async()=>{
  const source=cisWorkspace('synthetic',3);
  source.assessments[0].status='addressed';
  source.implementation_position.implemented=1;
  source.implementation_position.counts.find(row=>row.key==='addressed').count=1;
  source.implementation_position.counts.find(row=>row.key==='not_assessed').count--;
  await act(async()=>root.render(<CisDomainProfile source={source} clientId="synthetic" implementationGroup={3}/>));
  const domain=cisSecurityDomainMapping(3)[0],rate=`${(100/domain.safeguardIds.length).toFixed(1)}%`;
  expect(host.querySelector('.cdp-axis-label').getAttribute('aria-label')).toBe(`${domain.label}: ${rate}`);
  expect(host.querySelector('.cdp-axis-rate').textContent).toBe(rate);
  expect(host.querySelector('tbody tr td:last-child').textContent).toBe(rate);
});

test('a native domain with no applicable safeguards keeps its name and N/A instead of an invented percentage',async()=>{
  const source=cisWorkspace('synthetic',3),domain=cisSecurityDomainMapping(3)[0];
  for(const row of source.assessments.filter(row=>domain.safeguardIds.includes(row.definition_id))){
    row.status='not_applicable';row.na_rationale='Synthetic applicability decision';
  }
  source.implementation_position.excluded=domain.safeguardIds.length;
  source.implementation_position.denominator-=domain.safeguardIds.length;
  source.implementation_position.counts.find(row=>row.key==='not_assessed').count-=domain.safeguardIds.length;
  await act(async()=>root.render(<CisDomainProfile source={source} clientId="synthetic" implementationGroup={3}/>));
  expect(host.querySelectorAll('.cdp-axis-label')).toHaveLength(14);
  expect(host.querySelector('.cdp-axis-label').getAttribute('aria-label')).toBe(`${domain.label}: N/A`);
  expect(host.querySelector('.cdp-axis-rate').textContent).toBe('N/A');
  expect(host.querySelector('tbody tr td:last-child').textContent).toBe('N/A');
  expect(host.querySelectorAll('.cdp-radar-point')).toHaveLength(13);
  expect(host.querySelector('.cdp-value')).toBeNull();
});

function conceptSource(group=1,assetStatuses=[]){
  const source=cisWorkspace('synthetic',group),assets=cisSecurityDomainMapping(group)[0];
  for(const row of source.assessments){
    const index=assets.safeguardIds.indexOf(row.definition_id);
    if(index>=0&&assetStatuses[index])row.status=assetStatuses[index];
    if(row.status==='not_applicable')row.na_rationale='Synthetic native applicability decision';
  }
  const applicable=source.assessments.filter(row=>row.status!=='not_applicable');
  source.implementation_position.denominator=applicable.length;
  source.implementation_position.excluded=source.assessments.length-applicable.length;
  source.implementation_position.implemented=applicable.filter(row=>row.status==='addressed').length;
  source.implementation_position.counts.forEach(row=>{row.count=applicable.filter(record=>record.status===row.key).length;});
  return source;
}

const renderConcept=async(source=conceptSource(),theme='light')=>act(async()=>root.render(
  <CisDomainProfile source={source} clientId="synthetic" implementationGroup={source.configuration.implementation_group} concept theme={theme}/>
));

test.each([1,2,3])('concept IG%s keeps every true domain name/rate in a compact angular radar and adjacent table',async group=>{
  await renderConcept(conceptSource(group));
  const domains=cisSecurityDomainMapping(group),axes=[...host.querySelectorAll('.cdp-concept-axis-label')];
  expect(host.querySelector('.cdp-radar').getAttribute('viewBox')).toBe('0 0 430 332');
  expect(host.querySelectorAll('tbody tr')).toHaveLength(domains.length);
  expect(axes).toHaveLength(domains.length);
  expect(host.querySelectorAll('.cdp-concept-point')).toHaveLength(domains.length);
  expect(new Set(axes.map(axis=>axis.querySelector('text').getAttribute('x'))).size).toBeGreaterThan(3);
  for(const [index,domain]of domains.entries()){
    const axis=axes[index],text=axis.querySelector('text'),lines=axis.querySelectorAll('tspan:not(.cdp-axis-rate)');
    expect([...lines].map(line=>line.textContent).join(' ')).toBe(domain.label);
    expect(axis.getAttribute('aria-label')).toContain(domain.label);
    expect(axis.querySelector('.cdp-axis-rate').textContent).toBe('0.0%');
    expect(Number(text.getAttribute('y'))).toBeGreaterThanOrEqual(8);
    expect(Number(text.getAttribute('y'))+(lines.length-1)*12+16).toBeLessThanOrEqual(332);
    expect(host.querySelectorAll('tbody tr')[index].textContent).toContain(domain.label);
  }
  expect(host.querySelector('.cdp-label-leader')).toBeNull();
});

test('concept point, named axis and table share native details and coordinated highlighting',async()=>{
  await renderConcept();
  const targets=[host.querySelector('.cdp-concept-point'),host.querySelector('.cdp-concept-axis-label'),host.querySelector('.cdp-domain-name')];
  let expected;
  for(const target of targets){
    await act(async()=>target.focus());
    const popup=document.querySelector('.cdp-concept-tip');
    expect(popup).not.toBeNull();
    expect(popup.classList.contains('cis-dashboard-concept-portal')).toBe(true);
    expect(popup.dataset.theme).toBe('light');
    expect(popup.querySelector('.cdp-focus').classList.contains('is-warning')).toBe(true);
    expect(popup.textContent).toContain('Assess 5 untouched safeguards');
    expect(popup.textContent).toContain('this is not an assessed failure');
    expected??=popup.textContent;
    expect(popup.textContent).toBe(expected);
    expect(host.querySelectorAll('tbody tr.is-selected')).toHaveLength(1);
    expect(host.querySelectorAll('.cdp-concept-point.is-selected')).toHaveLength(1);
    expect(host.querySelectorAll('.cdp-concept-axis-label.is-selected')).toHaveLength(1);
    await act(async()=>target.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(document.querySelector('.cdp-concept-tip')).toBeNull();
    expect(document.activeElement).toBe(target);
  }
});

test.each([
  [['needs_attention','in_progress'], 'danger', 'Address 1 not-implemented safeguard', '1 safeguard is partially implemented; 3 safeguards need assessment.'],
  [Array(5).fill('in_progress'), 'warning', 'Complete 5 partial implementations', 'The remaining safeguards are assessed, but implementation is not complete.'],
  [Array(5).fill('addressed'), 'success', 'All applicable safeguards implemented', 'not a certification or assurance conclusion'],
  [Array(5).fill('not_applicable'), 'neutral', 'No applicable safeguards', 'There is no applicable scope to assess in this domain.'],
])('concept focus preserves the reference hierarchy for actual native counts (%#)',async(statuses,tone,title,detail)=>{
  await renderConcept(conceptSource(1,statuses),'dark');
  await act(async()=>host.querySelector('.cdp-domain-name').focus());
  const popup=document.querySelector('.cdp-concept-tip'),focus=popup.querySelector('.cdp-focus');
  expect(popup.dataset.theme).toBe('dark');
  expect(focus.classList.contains(`is-${tone}`)).toBe(true);
  expect(focus.querySelector('b').textContent).toBe(title);
  expect(focus.querySelector('p').textContent).toContain(detail);
  expect(popup.querySelectorAll('dl div')).toHaveLength(4);
  if(tone==='neutral'){
    expect(popup.textContent).toContain('N/A');
    expect(host.querySelectorAll('.cdp-concept-point')).toHaveLength(10);
    expect(host.querySelector('.cdp-value')).toBeNull();
  }
});

test('concept click pins/toggles, keyboard activates named SVG axes, and outside dismissal clears highlights',async()=>{
  jest.useFakeTimers();await renderConcept();
  const first=host.querySelector('.cdp-domain-name'),second=host.querySelectorAll('.cdp-domain-name')[1];
  await act(async()=>first.click());
  await pointer(first,'pointerout',document.body);
  await pointer(second,'pointerover');
  await act(async()=>jest.advanceTimersByTime(200));
  expect(document.querySelector('.cdp-concept-tip h3').textContent).toBe('Asset & Software Management');
  await act(async()=>first.click());
  expect(document.querySelector('.cdp-concept-tip')).toBeNull();
  const axis=host.querySelector('.cdp-concept-axis-label');
  await act(async()=>axis.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true})));
  expect(document.querySelector('.cdp-concept-tip')).not.toBeNull();
  await act(async()=>jest.advanceTimersByTime(0));
  await pointer(document.body,'pointerdown');
  expect(document.querySelector('.cdp-concept-tip')).toBeNull();
  expect(host.querySelector('tr.is-selected')).toBeNull();
});

test('concept unavailable context removes stale popup without changing the default presentation',async()=>{
  await renderConcept();
  await act(async()=>host.querySelector('.cdp-domain-name').click());
  await act(async()=>root.render(<CisDomainProfile source={cisWorkspace('synthetic',1)} clientId="foreign" implementationGroup={1} concept/>));
  expect(document.querySelector('.cdp-concept-tip')).toBeNull();
  expect(host.querySelector('[role=status]').textContent).toContain('unavailable');
  await renderProfile();
  expect(host.querySelector('.cdp-concept')).toBeNull();
  expect(host.querySelector('.cdp-radar').getAttribute('viewBox')).toBe('0 0 360 550');
});
