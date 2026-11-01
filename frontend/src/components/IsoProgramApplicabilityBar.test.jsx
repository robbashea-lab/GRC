import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import IsoProgramApplicabilityBar from './IsoProgramApplicabilityBar';

let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const render=props=>act(async()=>root.render(<IsoProgramApplicabilityBar {...props}/>));
const click=element=>act(async()=>element.click());
const counts=Object.freeze({total:7,applicable:4,excluded:2,undetermined:1});

test('static applicability bars expose reconciled native decision counts and proportional segments without implementation labels',async()=>{
  const before=JSON.stringify(counts);await render({counts});const bar=container.querySelector('.sbar');
  expect(bar.getAttribute('role')).toBe('img');expect(bar.getAttribute('aria-label')).toBe('Necessary: 4, Not Necessary: 2, Decision needed: 1');
  expect(bar.querySelector('button')).toBeNull();expect([...bar.querySelectorAll('i')].map(element=>[element.className,element.style.flexGrow,element.title])).toEqual([
    ['s-impl','4','Necessary: 4 of 7'],['s-part','2','Not Necessary: 2 of 7'],['s-none','1','Decision needed: 1 of 7'],
  ]);expect(bar.textContent).not.toMatch(/implemented|assessed|100%/i);expect(JSON.stringify(counts)).toBe(before);
});

test('summary segments drive only the existing applicability filter and toggle the selected segment back to All',async()=>{
  const onFilter=jest.fn();function Controller(){const [filter,setFilter]=useState('all');return <IsoProgramApplicabilityBar {...{counts,filter}} onFilter={value=>{setFilter(value);onFilter(value);}}/>;}
  await act(async()=>root.render(<Controller/>));const bar=container.querySelector('.sbar');expect(bar.getAttribute('role')).toBe('group');
  const necessary=bar.querySelector('[aria-label="Necessary: 4 of 7"]');expect(necessary.type).toBe('button');expect(necessary.getAttribute('aria-pressed')).toBe('false');
  await click(necessary);expect(onFilter).toHaveBeenLastCalledWith('included');expect(necessary.getAttribute('aria-pressed')).toBe('true');expect(bar.classList.contains('hl')).toBe(true);
  await click(necessary);expect(onFilter).toHaveBeenLastCalledWith('all');expect(necessary.getAttribute('aria-pressed')).toBe('false');
  await click(bar.querySelector('[aria-label="Not Necessary: 2 of 7"]'));expect(onFilter).toHaveBeenLastCalledWith('excluded');
  await click(bar.querySelector('[aria-label="Decision needed: 1 of 7"]'));expect(onFilter).toHaveBeenLastCalledWith('undetermined');
});

test('zero populations and zero buckets never create fake percentages or empty interactive targets',async()=>{
  await render({counts:{total:3,applicable:3,excluded:0,undetermined:0},onFilter:jest.fn()});expect(container.querySelectorAll('button')).toHaveLength(1);
  await render({counts:{total:0,applicable:0,excluded:0,undetermined:0},onFilter:jest.fn()});
  expect(container.querySelector('.sbar').getAttribute('aria-label')).toBe('Necessary: 0, Not Necessary: 0, Decision needed: 0');
  expect(container.querySelectorAll('button,i')).toHaveLength(0);expect(container.textContent).not.toContain('100');
});

test.each([
  {counts:null},{counts:undefined},{counts,available:false},
  {counts:{total:7,applicable:4,excluded:2}},
  {counts:{total:7,applicable:4,excluded:2,undetermined:2}},
  {counts:{total:7,applicable:-1,excluded:7,undetermined:1}},
  {counts:{total:7,applicable:4.5,excluded:1.5,undetermined:1}},
  {counts:{total:7,applicable:'4',excluded:2,undetermined:1}},
])('unavailable or non-reconciling source counts cannot certify a bar (%j)',async props=>{
  await render({...props,onFilter:jest.fn()});expect(container.querySelector('.sbar').getAttribute('aria-label')).toBe('Applicability counts unavailable');
  expect(container.querySelectorAll('button,i')).toHaveLength(0);
});

test('group bars can live inside a native disclosure button without nested buttons or a second filter control',async()=>{
  await act(async()=>root.render(<button type="button"><IsoProgramApplicabilityBar counts={counts} filter="excluded"/></button>));
  expect(container.querySelectorAll('button')).toHaveLength(1);expect(container.querySelector('.s-part').classList.contains('on')).toBe(true);
});
