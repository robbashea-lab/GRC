import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OmniWindow,{fitOmniRect,besideOmniRect,cisOmniProgramRect} from './OmniWindow';

test('native assessment guide opens centered and restores its position and answers after expansion',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div'),root=createRoot(host);
  document.body.appendChild(host);
  const previousStandard=document.documentElement.dataset.nativeStandard;
  document.documentElement.dataset.nativeStandard='light';
  try{
    await act(async()=>root.render(<OmniWindow id="native-guide"><textarea defaultValue="Working answer"/></OmniWindow>));
    const dialog=host.querySelector('[role="dialog"]');
    const {innerWidth:width,innerHeight:height}=window;
    const w=Math.min(900,width*.88),h=Math.min(700,height*.8,width*.72);
    expect(parseFloat(dialog.style.width)).toBeCloseTo(w);
    expect(parseFloat(dialog.style.left)).toBeCloseTo((width-w)/2);
    expect(parseFloat(dialog.style.top)).toBeCloseTo((height-h)/2);
    await act(async()=>host.querySelector('[aria-label="Expand Omni Guide"]').click());
    await act(async()=>host.querySelector('[aria-label="Restore Omni Guide size"]').click());
    expect(parseFloat(dialog.style.left)).toBeCloseTo((width-w)/2);
    expect(parseFloat(dialog.style.top)).toBeCloseTo((height-h)/2);
    expect(host.querySelector('textarea').value).toBe('Working answer');
  }finally{
    await act(async()=>root.unmount());
    host.remove();
    if(previousStandard===undefined)delete document.documentElement.dataset.nativeStandard;
    else document.documentElement.dataset.nativeStandard=previousStandard;
  }
});

test('R4 program popup retains its approved width and fits above or below edge launchers',()=>{
  for(const [width,height] of [[1440,1000],[1024,900],[390,844],[320,240]]){
    for(const anchor of [{left:width-88,right:width-24,top:height-96,bottom:height-32},{left:12,right:76,top:90,bottom:154}]){
      const rect=cisOmniProgramRect(anchor,width,height);
      expect(rect.w).toBe(Math.min(380,width-32));expect(rect.x).toBeGreaterThanOrEqual(8);expect(rect.y).toBeGreaterThanOrEqual(8);
      expect(rect.x+rect.w).toBeLessThanOrEqual(width-8);expect(rect.y+rect.h).toBeLessThanOrEqual(height-8);
    }
  }
});

test('CIS program popup leaves a saved middle-screen launcher reachable',()=>{
  for(const [width,height] of [[1440,900],[1024,900],[390,844]]){
    const anchor={left:width/2-32,right:width/2+32,top:height/2-32,bottom:height/2+32};
    const rect=cisOmniProgramRect(anchor,width,height);
    expect(rect.y+rect.h<=anchor.top-10||rect.y>=anchor.bottom+10).toBe(true);
    expect(rect.x).toBeGreaterThanOrEqual(8);expect(rect.y+rect.h).toBeLessThanOrEqual(height-8);
  }
});

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

test('refined header provides keyboard movement and resizing without a position menu',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(<OmniWindow id="refined" refined anchor={()=>({left:20,right:80,top:20})}><header className="omni-panel-header" tabIndex={0}><h2 id="refined-title">Omnibot guide</h2></header><p id="refined-description">Keyboard movement and resize</p></OmniWindow>));
    expect(host.querySelector('.omni-window-controls details')).toBeNull();const dialog=host.querySelector('[role=dialog]'),header=host.querySelector('header'),initialLeft=parseInt(dialog.style.left,10),initialWidth=parseInt(dialog.style.width,10);
    await act(async()=>header.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(parseInt(dialog.style.left,10)).toBe(initialLeft+10);
    await act(async()=>header.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})));expect(parseInt(dialog.style.width,10)).toBe(initialWidth+10);
  }finally{await act(async()=>root.unmount());host.remove();}
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

test('a higher native Search modal hides the assistant without discarding its interview',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  const palette=document.createElement('section');palette.className='native-palette';palette.setAttribute('role','dialog');palette.setAttribute('aria-modal','true');
  try{
    await act(async()=>root.render(<OmniWindow id="preserved" onClose={jest.fn()}><textarea defaultValue="Retained interview answer"/></OmniWindow>));
    const window=host.querySelector('[role=dialog]');
    await act(async()=>{document.body.appendChild(palette);await Promise.resolve();});
    expect(window.style.visibility).toBe('hidden');expect(window.inert).toBe(true);
    expect(host.querySelector('textarea').value).toBe('Retained interview answer');
    await act(async()=>{palette.remove();await Promise.resolve();});
    expect(window.style.visibility).toBe('');expect(window.inert).toBe(false);
    expect(host.querySelector('textarea').value).toBe('Retained interview answer');
  }finally{palette.remove();await act(async()=>root.unmount());host.remove();}
});
