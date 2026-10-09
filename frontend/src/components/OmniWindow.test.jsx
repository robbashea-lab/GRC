import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OmniWindow,{fitOmniRect,besideOmniRect} from './OmniWindow';

test('focused guide follows the current launcher rectangle on either side and clamps narrow edges',()=>{
  const left=besideOmniRect({left:20,right:140,top:100},1440,900),right=besideOmniRect({left:1280,right:1400,top:120},1440,900);
  expect(left.x).toBe(152);expect(right.x+right.w).toBe(1268);
  expect(left.y).not.toBe(right.y);
  const narrow=besideOmniRect({left:270,right:310,top:700},320,768);
  expect(narrow.x+narrow.w).toBeLessThanOrEqual(312);expect(narrow.y+narrow.h).toBeLessThanOrEqual(760);
});

test('window bounds remain reachable at desktop, tablet and tiny viewport sizes',()=>{
  for(const [width,height] of [[1440,900],[1024,768],[768,900],[320,240]]){
    const r=fitOmniRect({x:1900,y:1400,w:700,h:744},width,height);
    expect(r.x).toBeGreaterThanOrEqual(8);expect(r.y).toBeGreaterThanOrEqual(8);
    expect(r.x+r.w).toBeLessThanOrEqual(width-8);expect(r.y+r.h).toBeLessThanOrEqual(height-8);
  }
});
test('reopening measures the expanded launcher after mount rather than its minimized bounds',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  const anchor=jest.fn().mockReturnValueOnce({left:900,right:980,top:200}).mockReturnValue({left:850,right:1018,top:200});
  try{
    await act(async()=>root.render(<OmniWindow id="anchored" anchor={anchor}/>));
    expect(host.querySelector('[role=dialog]').style.left).toBe(besideOmniRect({left:850,right:1018,top:200}).x+'px');
    expect(anchor).toHaveBeenCalledTimes(2);
  }finally{await act(async()=>root.unmount());host.remove();}
});
test('nonblocking guide has meaningful labels, preserves mounted answers and exposes native window controls',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host),minimize=jest.fn(),close=jest.fn(),focus=jest.fn(),restore=jest.fn();
  try{
    await act(async()=>root.render(<OmniWindow id="guide" onMinimize={minimize} onClose={close} onOpenAutoFocus={focus} onCloseAutoFocus={restore}><header className="omni-panel-header"><h2 id="guide-title">Omni Guide · Safeguard 1.1</h2></header><p id="guide-description">Asset inventory guided review</p><textarea defaultValue="Retained answer"/></OmniWindow>));
    expect(host.querySelector('[role=dialog]').getAttribute('aria-modal')).toBe('false');expect(host.querySelectorAll('.omni-resize')).toHaveLength(8);expect(focus).toHaveBeenCalledTimes(1);
    await act(async()=>host.querySelector('[aria-label="Expand Omni Guide"]').click());expect(host.querySelector('[aria-label="Restore Omni Guide size"]')).not.toBeNull();expect(host.querySelector('textarea').value).toBe('Retained answer');
    await act(async()=>host.querySelector('[aria-label="Restore Omni Guide size"]').click());expect(host.querySelectorAll('.omni-resize')).toHaveLength(8);
    await act(async()=>host.querySelector('[aria-label="Minimize Omni Guide"]').click());expect(minimize).toHaveBeenCalledTimes(1);
    await act(async()=>host.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(close).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>root.unmount());host.remove();}expect(restore).toHaveBeenCalledTimes(1);
});
