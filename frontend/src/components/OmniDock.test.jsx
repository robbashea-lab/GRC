import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OmniDock,{snapPosition,fitOmniPopover} from './OmniDock';
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
test('pilot launcher repositions by keyboard without opening the interview or storing answers',async()=>{
  const launch=jest.fn();await act(async()=>root.render(<OmniDock preferenceKey="pilot" freePosition><button className="omni-launch-button" onClick={launch}>Open</button></OmniDock>));
  const dock=container.querySelector('.omni-free-dock'),left=parseFloat(dock.style.left);
  await act(async()=>container.querySelector('.omni-launch-button').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
  expect(parseFloat(dock.style.left)).toBe(left-10);expect(launch).not.toHaveBeenCalled();expect(Object.keys(localStorage)).toEqual(['pilot:free-position']);
  expect(container.querySelector('summary').textContent).toBe('•••');
});
test('focused invitations and menus stay inside the viewport at dragged edges',()=>{
  for(const [width,height] of [[1440,900],[320,768],[320,240]]){
    for(const anchor of [{left:8,right:176,top:82,bottom:236},{left:width-176,right:width-8,top:height-162,bottom:height-8}]){
      for(const size of [{width:245,height:156},{width:180,height:260}]){
        const position=fitOmniPopover(anchor,size,width,height);
        expect(position.left).toBeGreaterThanOrEqual(8);expect(position.top).toBeGreaterThanOrEqual(8);
        expect(position.left+Math.min(size.width,width-16)).toBeLessThanOrEqual(width-8);
        expect(position.top+Math.min(size.height,height-16)).toBeLessThanOrEqual(height-8);
      }
    }
  }
  expect(fitOmniPopover({right:176,top:82,bottom:236},{width:245,height:156},1440,900)).toEqual({left:8,top:244});
});
test('popover fitting is scoped to the focused pilot and responds to opened invitation settings',async()=>{
  const original=HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect=function(){return this.matches('.guided-context-prompt,.omni-position-controls>div')?{width:245,height:156}:this.matches('.omni-launch-button,summary')?{left:8,right:176,top:82,bottom:236,width:168,height:154}:{width:168,height:218};};
  const children=<><button className="omni-launch-button">Open</button><div className="guided-context-prompt">Invitation</div><details className="omni-position-controls"><summary>Invitation settings</summary><div><button>Hide invitations for this session</button></div></details></>;
  try{
    await act(async()=>root.render(<OmniDock preferenceKey="pilot" freePosition>{children}</OmniDock>));
    expect(container.querySelector('.guided-context-prompt').style.left).toBe('');expect(container.querySelector('[data-focused-omni]')).toBeNull();
    await act(async()=>root.render(<OmniDock preferenceKey="pilot" freePosition focused>{children}</OmniDock>));
    expect(container.querySelector('.guided-context-prompt').style.left).toBe('8px');expect(container.querySelector('.guided-context-prompt').style.top).toBe('244px');
    for(const settings of container.querySelectorAll('details')){
      await act(async()=>{settings.open=true;settings.dispatchEvent(new Event('toggle'));});
      expect(settings.querySelector('div').style.left).toBe('8px');expect(settings.querySelector('div').style.top).toBe('244px');
    }
  }finally{HTMLElement.prototype.getBoundingClientRect=original;}
});
test('focused launcher can use the top viewport margin when a short screen has no header clearance',async()=>{
  const height=window.innerHeight;window.innerHeight=240;
  try{
    await act(async()=>root.render(<OmniDock preferenceKey="short" freePosition focused><button className="omni-launch-button">Open</button></OmniDock>));
    const dock=container.querySelector('.omni-free-dock');expect(parseFloat(dock.style.top)).toBeGreaterThanOrEqual(8);
    await act(async()=>container.querySelector('.omni-launch-button').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true})));
    expect(parseFloat(dock.style.top)+190).toBeLessThanOrEqual(232);
  }finally{window.innerHeight=height;}
});
