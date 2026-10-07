import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OmniDock,{snapPosition} from './OmniDock';
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('pointer coordinates snap only to the three supported zones',()=>{
  expect(snapPosition(100,600,1440,900)).toBe('lower-left');
  expect(snapPosition(1200,300,1440,900)).toBe('middle-right');
  expect(snapPosition(1200,800,1440,900)).toBe('lower-right');
});
test('keyboard position controls persist and reset cosmetic preferences only',async()=>{
  await act(async()=>root.render(<OmniDock preferenceKey="qa" inAssessment><button className="omni-launch-button">Open</button></OmniDock>));
  const move=[...container.querySelectorAll('button')].find(b=>b.textContent==='Move Omni to lower left');
  await act(async()=>move.click());
  expect(localStorage.getItem('qa:position')).toBe('lower-left');
  expect(move.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('.omni-dock-flow')).toBeTruthy();
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Reset Omni position').click());
  expect(localStorage.getItem('qa:position')).toBe('lower-right');
  expect(Object.keys(localStorage)).toEqual(['qa:position']);
});
