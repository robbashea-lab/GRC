import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OmniDock,{fitOmniControl} from './OmniDock';

const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const clearOf=(area,obstacle,gap=8)=>area.right+gap<=obstacle.left||area.left-gap>=obstacle.right||area.bottom+gap<=obstacle.top||area.top-gap>=obstacle.bottom;
const positionKey='collision:free-position';
let root,container,rectangles,rectSpy,originalViewport,originalObserver,observer;

// Native coordinates were captured at 1280x720; JSDOM supplies no layout or physical hit testing.
const nativeRectangles=()=>({
  scroll:rect(86.666672,173.364594,1096.666747,447.968750),
  implementation:rect(308.666687,455.5625,874.666687,158),
  source:rect(86.666672,376.90625,1096.666747,19.791668),
  requirement:rect(99.3333,247.197922,1071.3334,19.5),
  next:rect(1110.0625,52.6667,49.2708,32),
  save:rect(986.583374,635,111.343750,35.333336),
  saveNext:rect(1105.927124,635,87.406250,35.333336),
});
const visiblePosition=dock=>({x:parseFloat(dock.style.left),y:parseFloat(dock.style.top)});
const launcherSize=dock=>({width:window.innerWidth<=800?116:168,height:dock.querySelector('.is-minimized')?80:window.innerWidth<=800?108:154});

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.clear();
  originalViewport=[window.innerWidth,window.innerHeight];
  window.innerWidth=1280;window.innerHeight=720;
  originalObserver=global.ResizeObserver;
  global.ResizeObserver=class{constructor(callback){observer=this;this.callback=callback;this.observe=jest.fn();this.disconnect=jest.fn();}};
  rectangles=nativeRectangles();
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
  rectSpy=jest.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){
    if(this.dataset.rect)return rectangles[this.dataset.rect]||rect(0,0,0,0);
    if(this.matches('.omni-free-dock')){
      const point=visiblePosition(this),size=launcherSize(this),settings=this.querySelector('.omni-position-controls');
      return rect(point.x,point.y,size.width,size.height+(settings&&settings.style.position!=='fixed'?43:0));
    }
    if(this.matches('.omni-launch-button')){
      const dock=this.closest('.omni-free-dock'),point=visiblePosition(dock),size=launcherSize(dock);
      return rect(point.x,point.y,size.width,size.height);
    }
    if(this.matches('.omni-position-controls, .omni-position-controls > summary')){
      const settings=this.matches('summary')?this.parentElement:this,dock=settings.closest('.omni-free-dock'),point=visiblePosition(dock),size=launcherSize(dock);
      return rect(parseFloat(settings.style.left)||point.x,parseFloat(settings.style.top)||point.y+size.height,size.width,43);
    }
    if(this.matches('.omni-position-controls > div,.guided-context-prompt')){
      const invitation=this.matches('.guided-context-prompt');
      return rect(parseFloat(this.style.left)||0,parseFloat(this.style.top)||0,Number(this.dataset.popupWidth)||(invitation?245:180),Number(this.dataset.popupHeight)||(invitation?156:148));
    }
    return rect(0,0,0,0);
  });
});
afterEach(async()=>{
  await act(async()=>root.unmount());container.remove();rectSpy.mockRestore();
  [window.innerWidth,window.innerHeight]=originalViewport;global.ResizeObserver=originalObserver;
});

function Fixture({minimized=false,invitation=false,wrappedLabel=false,expandedGuide=false,fieldKey='original',inAssessment=true,onLaunch=()=>{},onSave=()=>{}}){
  return <div data-assessment-shell>
    <button data-rect="next">Next requirement</button>
    <div className="brawndo-assessment-scroll" data-rect="scroll"><div className="brawndo-assessment-columns">
      <details><summary data-rect="requirement">Requirement</summary></details>
      <a href="#official" data-rect="source">Official source</a>
      <textarea key={fieldKey} aria-label="Current Implementation" data-rect="implementation" defaultValue="Preserved manual wording"/>
      {wrappedLabel&&<label data-rect="wrapped"><input type="checkbox" data-rect="smallInput"/>Preserve the native label hit target</label>}
    </div></div>
    <div className="brawndo-assessment-footer">
      <button data-rect="save" onClick={onSave}>Save assessment</button><button data-rect="saveNext">Save &amp; next</button>
    </div>
    <OmniDock preferenceKey="collision" freePosition focused inAssessment={inAssessment}>
      <button className={'omni-launch-button'+(minimized?' is-minimized':'')} onClick={onLaunch}>Open OmniBot</button>
      {invitation&&<div className="guided-context-prompt">Resume your assessment</div>}
      <details className="omni-position-controls"><summary>OmniBot preferences</summary><div><button>Hide OmniBot</button><button>Turn off invitations</button></div></details>
    </OmniDock>
    {expandedGuide&&<section className="omni-workspace-window" data-rect="guide" role="dialog" aria-label="SOC OmniBot guide" style={{left:rectangles.guide.left,top:rectangles.guide.top,width:rectangles.guide.width,height:rectangles.guide.height}}>Expanded SOC guide</section>}
  </div>;
}
const renderFixture=async props=>act(async()=>root.render(<Fixture {...props}/>));
const measuredControls=()=>[rectangles.save,rectangles.saveNext,rectangles.implementation,rectangles.source,rectangles.requirement,rectangles.next].filter(r=>r.width&&r.height);
function expectSafe(area,obstacles){
  expect(area.left).toBeGreaterThanOrEqual(8);expect(area.top).toBeGreaterThanOrEqual(8);
  expect(area.right).toBeLessThanOrEqual(window.innerWidth-8);expect(area.bottom).toBeLessThanOrEqual(window.innerHeight-8);
  for(const obstacle of obstacles)expect(clearOf(area,obstacle)).toBe(true);
}
function pointer(element,type,{x,y,id=1}){
  const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:id});element.dispatchEvent(event);
}

test('safe control points stay exact and the nearest available gap is chosen',()=>{
  expect(fitOmniControl({x:20,y:20},{width:80,height:60},[rect(120,0,30,160)],300,240)).toEqual({x:20,y:20});
  expect(fitOmniControl({x:30,y:40},{width:20,height:10},[rect(50,38,10,14)],300,240)).toEqual({x:22,y:40});
});
test('short and narrow screens clamp safely or explicitly report no fit',()=>{
  const point=fitOmniControl({x:300,y:-5},{width:116,height:108},[rect(220,180,90,50)],320,240,8);
  expect(point).toEqual({x:196,y:8});
  expect(fitOmniControl({x:30,y:20},{width:116,height:108},[rect(8,8,304,224)],320,240,8)).toBeUndefined();
  expect(fitOmniControl({x:30,y:20},{width:168,height:154},[],320,100,8)).toBeUndefined();
});
test('fresh preferences avoid both footer actions without moving the already safe owl',async()=>{
  const launch=jest.fn(),save=jest.fn();await renderFixture({onLaunch:launch,onSave:save});
  const dock=container.querySelector('.omni-free-dock'),settings=container.querySelector('.omni-position-controls');
  expect(visiblePosition(dock)).toEqual({x:1090,y:460});expect(dock.getBoundingClientRect().height).toBe(154);
  expect(settings.style.position).toBe('fixed');expect(settings.style.width).toBe('168px');
  expectSafe(settings.querySelector('summary').getBoundingClientRect(),[...measuredControls(),dock.getBoundingClientRect()]);
  expect(localStorage.length).toBe(0);expect(save).not.toHaveBeenCalled();expect(launch).not.toHaveBeenCalled();
  await act(async()=>container.querySelector('[data-rect="saveNext"]').click());
  await act(async()=>container.querySelector('[data-rect="save"]').click());
  expect(save).toHaveBeenCalledTimes(1);expect(launch).not.toHaveBeenCalled();
  expect(container.querySelector('textarea').value).toBe('Preserved manual wording');
});
test('a safe saved point and unrelated guide preferences remain unchanged',async()=>{
  const point={x:900,y:140},preferences=JSON.stringify({mode:'minimized',invitations:true});
  localStorage.setItem(positionKey,JSON.stringify(point));localStorage.setItem('collision',preferences);
  const write=jest.spyOn(Storage.prototype,'setItem');
  try{
    await renderFixture();expect(visiblePosition(container.querySelector('.omni-free-dock'))).toEqual(point);
    expect(write).not.toHaveBeenCalled();expect(localStorage.getItem('collision')).toBe(preferences);
    expect(JSON.parse(localStorage.getItem(positionKey))).toEqual(point);
  }finally{write.mockRestore();}
});
test('a colliding saved point is corrected transiently and restored when footer overlap clears',async()=>{
  const saved={x:1090,y:550};localStorage.setItem(positionKey,JSON.stringify(saved));
  const write=jest.spyOn(Storage.prototype,'setItem');
  try{
    await renderFixture();const dock=container.querySelector('.omni-free-dock');
    expect(visiblePosition(dock)).not.toEqual(saved);expectSafe(dock.getBoundingClientRect(),measuredControls());
    expect(write).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem(positionKey))).toEqual(saved);
    rectangles.save=rectangles.saveNext=rect(0,0,0,0);
    await act(async()=>container.querySelector('.brawndo-assessment-scroll').dispatchEvent(new Event('scroll')));
    expect(visiblePosition(dock)).toEqual(saved);expect(write).not.toHaveBeenCalled();
    expect(container.querySelector('textarea').value).toBe('Preserved manual wording');
  }finally{write.mockRestore();}
});
test('arrow-key moves start at the visible correction and persist only the explicit cosmetic move',async()=>{
  localStorage.setItem(positionKey,JSON.stringify({x:1090,y:550}));const launch=jest.fn();await renderFixture({onLaunch:launch});
  const dock=container.querySelector('.omni-free-dock'),before=visiblePosition(dock),button=container.querySelector('.omni-launch-button');
  await act(async()=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',shiftKey:true,bubbles:true})));
  expect(JSON.parse(localStorage.getItem(positionKey))).toEqual({x:before.x-30,y:before.y});
  expect(Object.keys(localStorage)).toEqual([positionKey]);expect(launch).not.toHaveBeenCalled();
  await act(async()=>button.click());expect(launch).toHaveBeenCalledTimes(1);
});
test('minimizing, expanding, and native resize re-fit transiently without rewriting the saved point',async()=>{
  const saved={x:1090,y:600};localStorage.setItem(positionKey,JSON.stringify(saved));
  const write=jest.spyOn(Storage.prototype,'setItem');
  try{
    await renderFixture({minimized:true});const dock=container.querySelector('.omni-free-dock');
    expect(dock.getBoundingClientRect().height).toBe(80);expectSafe(dock.getBoundingClientRect(),measuredControls());
    await renderFixture();expect(dock.getBoundingClientRect().height).toBe(154);expectSafe(dock.getBoundingClientRect(),measuredControls());
    const summary=container.querySelector('.omni-position-controls > summary'),before=summary.getBoundingClientRect().top;
    rectangles.requirement=rect(99.3333,247.197922,1071.3334,80);
    await act(async()=>observer.callback());expectSafe(dock.getBoundingClientRect(),measuredControls());
    expect(summary.getBoundingClientRect().top).not.toBe(before);
    expect(observer.observe).toHaveBeenCalledWith(dock);expect(observer.observe).toHaveBeenCalledWith(container.querySelector('[data-assessment-shell]'));
    expect(observer.observe).toHaveBeenCalledWith(container.querySelector('textarea'));
    expect(observer.observe).toHaveBeenCalledWith(container.querySelector('.brawndo-assessment-columns'));
    expect(observer.observe).toHaveBeenCalledWith(container.querySelector('.brawndo-assessment-footer'));
    expect(observer.observe).toHaveBeenCalledWith(container.querySelector('[data-rect="requirement"]'));
    expect(observer.observe).not.toHaveBeenCalledWith(summary);
    expect(write).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem(positionKey))).toEqual(saved);
  }finally{write.mockRestore();}
});
test('opened preferences and invitations avoid native controls while preserving the launcher point',async()=>{
  await renderFixture({invitation:true});const dock=container.querySelector('.omni-free-dock'),before=visiblePosition(dock),settings=container.querySelector('.omni-position-controls');
  await act(async()=>{settings.open=true;settings.dispatchEvent(new Event('toggle'));});
  const summary=settings.querySelector('summary').getBoundingClientRect();
  for(const popover of container.querySelectorAll('.guided-context-prompt,.omni-position-controls[open]>div'))expectSafe(popover.getBoundingClientRect(),[...measuredControls(),dock.getBoundingClientRect(),summary]);
  expect(visiblePosition(dock)).toEqual(before);expect(localStorage.length).toBe(0);
});
test('fields clipped by the native scroll region constrain only their visible portion',async()=>{
  rectangles.implementation=rect(308.666687,455.5625,874.666687,600);
  await renderFixture();
  const summary=container.querySelector('.omni-position-controls > summary'),clipped={...rectangles.implementation,bottom:rectangles.scroll.bottom};
  expectSafe(summary.getBoundingClientRect(),[clipped,rectangles.save,rectangles.saveNext]);
  expect(summary.getBoundingClientRect().top).toBeCloseTo(rectangles.scroll.bottom+8);
  rectangles.implementation=rect(308.666687,622,874.666687,50);
  await act(async()=>container.querySelector('.brawndo-assessment-scroll').dispatchEvent(new Event('scroll')));
  // This field is wholly outside the native scroll clip, so it cannot reserve visible hit space.
  expectSafe(summary.getBoundingClientRect(),[rectangles.save,rectangles.saveNext,container.querySelector('.omni-free-dock').getBoundingClientRect()]);
  expect(summary.getBoundingClientRect().top).toBe(584);
  expect(summary.getBoundingClientRect().bottom).toBeGreaterThan(rectangles.implementation.top);
  expect(localStorage.length).toBe(0);
});
test('wrapped native labels protect their larger hit target rather than only the input square',async()=>{
  rectangles.wrapped=rect(780,610,200,32);rectangles.smallInput=rect(786,614,16,16);
  await renderFixture({wrappedLabel:true});
  const label={...rectangles.wrapped,bottom:rectangles.scroll.bottom},summary=container.querySelector('.omni-position-controls > summary');
  expectSafe(summary.getBoundingClientRect(),[...measuredControls(),label]);
  expect(summary.getBoundingClientRect().top).toBeCloseTo(rectangles.scroll.bottom+8);
  expect(observer.observe).toHaveBeenCalledWith(container.querySelector('[data-rect="wrapped"]'));
  expect(localStorage.length).toBe(0);
});
test('a previously fitted preference moves inside a narrow viewport even when no collision-free fit exists',async()=>{
  await renderFixture();const summary=container.querySelector('.omni-position-controls > summary');
  expect(summary.getBoundingClientRect().left).toBeGreaterThan(320);
  window.innerWidth=320;window.innerHeight=240;
  rectangles.scroll=rect(8,8,304,224);rectangles.implementation=rect(8,8,304,224);rectangles.save=rect(8,8,304,224);
  rectangles.saveNext=rectangles.next=rectangles.source=rectangles.requirement=rect(0,0,0,0);
  await act(async()=>window.dispatchEvent(new Event('resize')));
  const area=summary.getBoundingClientRect();
  expect(area.left).toBe(196);expect(area.top).toBe(189);
  expect(area.right).toBeLessThanOrEqual(312);expect(area.bottom).toBeLessThanOrEqual(232);
  expect(fitOmniControl({x:196,y:232},{width:116,height:43},[rectangles.save],320,240,82)).toBeUndefined();
  // The bounded fallback is deliberately not mislabeled collision-safe when the whole viewport is obstructed.
  expect(clearOf(area,rectangles.save)).toBe(false);expect(localStorage.length).toBe(0);
});
test('replaced native fields get a fresh resize subscription and affect placement without another render',async()=>{
  await renderFixture();const previousObserver=observer,previousField=container.querySelector('textarea');
  await renderFixture({fieldKey:'replacement'});
  const replacement=container.querySelector('textarea'),summary=container.querySelector('.omni-position-controls > summary'),before=summary.getBoundingClientRect().top;
  expect(replacement).not.toBe(previousField);expect(previousObserver.disconnect).toHaveBeenCalledTimes(1);
  expect(observer).not.toBe(previousObserver);
  expect(observer.observe.mock.calls.some(([target])=>target===replacement)).toBe(true);
  expect(observer.observe.mock.calls.some(([target])=>target===previousField)).toBe(false);
  rectangles.implementation=rect(308.666687,455.5625,874.666687,600);
  await act(async()=>observer.callback());
  expect(summary.getBoundingClientRect().top).not.toBe(before);expect(summary.getBoundingClientRect().top).toBeCloseTo(rectangles.scroll.bottom+8);
  expect(replacement.value).toBe('Preserved manual wording');expect(localStorage.length).toBe(0);
});
test('dragging starts at the visible correction, retains its threshold, and suppresses only the drag click',async()=>{
  localStorage.setItem(positionKey,JSON.stringify({x:1090,y:550}));const launch=jest.fn();await renderFixture({onLaunch:launch});
  const dock=container.querySelector('.omni-free-dock'),button=container.querySelector('.omni-launch-button'),before=visiblePosition(dock);dock.setPointerCapture=jest.fn();
  const write=jest.spyOn(Storage.prototype,'setItem');
  try{
    await act(async()=>{pointer(button,'pointerdown',{x:before.x+20,y:before.y+20});pointer(dock,'pointermove',{x:before.x+25,y:before.y+20});pointer(dock,'pointerup',{x:before.x+25,y:before.y+20});button.click();});
    expect(write).not.toHaveBeenCalled();expect(launch).toHaveBeenCalledTimes(1);
    await act(async()=>{pointer(button,'pointerdown',{x:before.x+20,y:before.y+20});pointer(dock,'pointermove',{x:before.x+10,y:before.y+20});pointer(dock,'pointerup',{x:before.x+10,y:before.y+20});});
    expect(JSON.parse(localStorage.getItem(positionKey))).toEqual({x:before.x-10,y:before.y});expect(dock.setPointerCapture).toHaveBeenCalledWith(1);
    await act(async()=>button.click());expect(launch).toHaveBeenCalledTimes(1);
    await act(async()=>button.click());expect(launch).toHaveBeenCalledTimes(2);
  }finally{write.mockRestore();}
});
test('program launchers retain normal preferences flow and cleanup placement observers on unmount',async()=>{
  await renderFixture({inAssessment:false});
  expect(container.querySelector('.omni-position-controls').style.position).toBe('');
  expect(container.querySelector('.omni-free-dock').getBoundingClientRect().height).toBe(197);
  await act(async()=>root.render(null));expect(observer.disconnect).toHaveBeenCalledTimes(1);
});
test('SOC narrow open preferences leave the invitation and its Close control unobstructed',async()=>{
  // GN-QA-06: independently captured 390x844 SOC controls, exact popup sizes and button offsets.
  window.innerWidth=390;window.innerHeight=844;
  localStorage.setItem(positionKey,JSON.stringify({x:200,y:584}));
  rectangles={
    requirement:rect(48.83333587646485,300.3958435058594,282.3333435058594,19.5),
    save:rect(147.08334350585938,729.4583740234375,111.34375,35.333335876464844),
    saveNext:rect(266.4270935058594,729.4583740234375,87.40625,35.333335876464844),
    ...Object.fromEntries([530.2083740234375,568.5416870117188,606.875,645.2083740234375,683.5416870117188].map((top,index)=>['label'+index,rect(36.16666793823242,top,307.66668701171875,33.333335876464844)])),
    closeOffset:rect(208.3333435058594,8.66665649414068,28,28),
    hideOffset:rect(6.6666717529297,6.66668701171875,166.6666717529297,44),
    invitationsOffset:rect(6.6666717529297,50.66668701171875,166.6666717529297,44),
  };
  const measure=rectSpy.getMockImplementation();
  rectSpy.mockImplementation(function(){
    if(this.dataset.popupOffset){const offset=rectangles[this.dataset.popupOffset],popup=this.closest('[data-popup-width]').getBoundingClientRect();return rect(popup.left+offset.left,popup.top+offset.top,offset.width,offset.height);}
    return measure.call(this);
  });
  const close=jest.fn(),hide=jest.fn(),save=jest.fn();
  await act(async()=>root.render(<div data-assessment-shell>
    <details><summary data-rect="requirement">Requirement summary</summary></details>
    {Array.from({length:5},(_,index)=><label key={index} data-rect={'label'+index}><input type="checkbox"/>Native status option {index+1}</label>)}
    <div className="brawndo-assessment-footer"><button data-rect="save" onClick={save}>Save assessment</button><button data-rect="saveNext">Save &amp; next</button></div>
    <OmniDock preferenceKey="collision" freePosition focused inAssessment>
      <button className="omni-launch-button">Open OmniBot</button>
      <div className="guided-context-prompt" data-popup-width="245" data-popup-height="77.91667175292969">Review this SOC 2 criterion with Omnibot.<button aria-label="Close invitation" data-popup-offset="closeOffset" onClick={close}>×</button></div>
      <details className="omni-position-controls"><summary>Omnibot preferences</summary><div data-popup-width="180" data-popup-height="101.33333587646484"><button data-popup-offset="hideOffset" onClick={hide}>Hide Omnibot</button><button data-popup-offset="invitationsOffset">Turn off invitations</button></div></details>
    </OmniDock>
  </div>));
  const settings=container.querySelector('.omni-position-controls');
  await act(async()=>{settings.open=true;settings.dispatchEvent(new Event('toggle'));});
  const invitation=container.querySelector('.guided-context-prompt'),menu=settings.querySelector('div'),closeButton=invitation.querySelector('button'),closeRect=closeButton.getBoundingClientRect(),center={x:closeRect.left+closeRect.width/2,y:closeRect.top+closeRect.height/2};
  expect(clearOf(invitation.getBoundingClientRect(),menu.getBoundingClientRect())).toBe(true);
  for(const button of menu.querySelectorAll('button')){
    const area=button.getBoundingClientRect();
    expect(center.x>=area.left&&center.x<=area.right&&center.y>=area.top&&center.y<=area.bottom).toBe(false);
  }
  await act(async()=>closeButton.click());
  expect(close).toHaveBeenCalledTimes(1);expect(hide).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(positionKey))).toEqual({x:200,y:584});
});
test('expanded SOC guide leaves preferences and their menu reachable through minimize, resize and movement',async()=>{
  // GN-QA-07: observed 1280x720 guide at 458,82,620x630; owl remains at its existing 1090,460 point.
  rectangles.guide=rect(458,82,620,630);const saved={x:1090,y:460};localStorage.setItem(positionKey,JSON.stringify(saved));
  const write=jest.spyOn(Storage.prototype,'setItem'),originalMutation=global.MutationObserver;let styleObserver;
  global.MutationObserver=class{constructor(callback){styleObserver=this;this.callback=callback;this.observe=jest.fn();this.disconnect=jest.fn();}};
  try{
    expect(fitOmniControl({x:8,y:8},{width:168,height:43},[rect(8,8,304,224)],320,240,8)).toBeUndefined();
    await renderFixture({expandedGuide:true});
    const dock=container.querySelector('.omni-free-dock'),settings=container.querySelector('.omni-position-controls'),summary=settings.querySelector('summary');
    expect(visiblePosition(dock)).toEqual(saved);expect(write).not.toHaveBeenCalled();
    expectSafe(summary.getBoundingClientRect(),[...measuredControls(),rectangles.guide,dock.getBoundingClientRect()]);
    await act(async()=>{settings.open=true;settings.dispatchEvent(new Event('toggle'));});
    const menu=settings.querySelector('div');
    expectSafe(menu.getBoundingClientRect(),[...measuredControls(),rectangles.guide,dock.getBoundingClientRect(),summary.getBoundingClientRect()]);
    await renderFixture({minimized:true});
    expect(container.querySelector('.omni-workspace-window')).toBeNull();expect(visiblePosition(dock)).toEqual(saved);
    expectSafe(summary.getBoundingClientRect(),[...measuredControls(),dock.getBoundingClientRect()]);expect(write).not.toHaveBeenCalled();
    await renderFixture({expandedGuide:true});const guide=container.querySelector('.omni-workspace-window');
    expect(observer.observe.mock.calls.some(([target])=>target===guide)).toBe(true);
    rectangles.guide=rect(458,82,500,630);
    await act(async()=>observer.callback());
    expectSafe(summary.getBoundingClientRect(),[...measuredControls(),rectangles.guide,dock.getBoundingClientRect()]);
    expectSafe(menu.getBoundingClientRect(),[...measuredControls(),rectangles.guide,dock.getBoundingClientRect(),summary.getBoundingClientRect()]);
    const before=summary.getBoundingClientRect();
    expect(styleObserver.observe.mock.calls.some(([target,options])=>target===guide&&options.attributes&&options.attributeFilter.includes('style'))).toBe(true);
    rectangles.guide=rect(650,82,500,630);
    await act(async()=>{guide.style.left='650px';styleObserver.callback([{type:'attributes',attributeName:'style',target:guide}]);});
    expect(summary.getBoundingClientRect()).not.toEqual(before);
    expectSafe(summary.getBoundingClientRect(),[...measuredControls(),rectangles.guide,dock.getBoundingClientRect()]);
    expectSafe(menu.getBoundingClientRect(),[...measuredControls(),rectangles.guide,dock.getBoundingClientRect(),summary.getBoundingClientRect()]);
    expect(visiblePosition(dock)).toEqual(saved);expect(write).not.toHaveBeenCalled();
    await act(async()=>container.querySelector('.omni-launch-button').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
    expect(JSON.parse(localStorage.getItem(positionKey))).toEqual({x:1080,y:460});expect(write).toHaveBeenCalledTimes(1);
    expectSafe(summary.getBoundingClientRect(),[...measuredControls(),rectangles.guide,dock.getBoundingClientRect()]);
    expectSafe(menu.getBoundingClientRect(),[...measuredControls(),rectangles.guide,dock.getBoundingClientRect(),summary.getBoundingClientRect()]);
    expect(container.querySelector('textarea').value).toBe('Preserved manual wording');expect(Object.keys(localStorage)).toEqual([positionKey]);
  }finally{write.mockRestore();global.MutationObserver=originalMutation;}
});
test('program launcher preserves Return to portfolio at a colliding saved point without overwriting preferences',async()=>{
  // GN-QA-08: independent hosted Hooli Return rect and the retained programme point that intercepted it.
  const saved={x:8,y:82},preferences=JSON.stringify({mode:'collapsed',invitations:true}),launch=jest.fn(),navigate=jest.fn();
  rectangles.programReturn=rect(13,92,74.64583587646484,22);
  localStorage.setItem(positionKey,JSON.stringify(saved));localStorage.setItem('collision',preferences);
  const write=jest.spyOn(Storage.prototype,'setItem');
  const program=({minimized=false,withPreferences=false}={})=><div className="app-shell">
    <aside className="app-sidebar"><button data-testid="return-to-portfolio" data-rect="programReturn" aria-label="Return to portfolio" onClick={navigate}>Portfolio</button></aside>
    <main><OmniDock preferenceKey="collision" freePosition focused>
      <button className={'omni-launch-button'+(minimized?' is-minimized':'')} onClick={launch}>Open Omnibot guide</button>
      <div className="guided-context-prompt">Review the programme with Omnibot.</div>
      {withPreferences&&<details className="omni-position-controls"><summary>Omnibot preferences</summary><div><button>Hide Omnibot</button><button>Turn off invitations</button></div></details>}
    </OmniDock></main>
  </div>;
  try{
    await act(async()=>root.render(program()));
    const dock=container.querySelector('.omni-free-dock'),launcher=container.querySelector('.omni-launch-button'),back=container.querySelector('[data-testid="return-to-portfolio"]');
    expectSafe(launcher.getBoundingClientRect(),[rectangles.programReturn]);
    const fitted=visiblePosition(dock);expect(fitted).not.toEqual(saved);expect(launcher.getBoundingClientRect().height).toBe(154);
    const center={x:13+74.64583587646484/2,y:103},area=launcher.getBoundingClientRect();
    expect(center.x>=area.left&&center.x<=area.right&&center.y>=area.top&&center.y<=area.bottom).toBe(false);
    expect(write).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem(positionKey))).toEqual(saved);
    await act(async()=>back.click());expect(navigate).toHaveBeenCalledTimes(1);expect(launch).not.toHaveBeenCalled();
    await act(async()=>launcher.click());expect(launch).toHaveBeenCalledTimes(1);
    expect(observer.observe.mock.calls.some(([target])=>target===back)).toBe(true);
    rectangles.programReturn=rect(0,0,0,0);
    await act(async()=>observer.callback());expect(visiblePosition(dock)).toEqual(saved);expect(write).not.toHaveBeenCalled();
    rectangles.programReturn=rect(13,92,74.64583587646484,22);
    await act(async()=>window.dispatchEvent(new Event('resize')));
    expectSafe(launcher.getBoundingClientRect(),[rectangles.programReturn]);expect(visiblePosition(dock)).toEqual(fitted);
    await act(async()=>root.render(program({minimized:true,withPreferences:true})));
    expect(container.querySelector('.omni-launch-button').getBoundingClientRect().height).toBe(80);
    expectSafe(dock.getBoundingClientRect(),[rectangles.programReturn]);expect(write).not.toHaveBeenCalled();
    const settings=container.querySelector('.omni-position-controls');
    await act(async()=>{settings.open=true;settings.dispatchEvent(new Event('toggle'));});
    for(const popup of container.querySelectorAll('.guided-context-prompt,.omni-position-controls[open]>div'))expectSafe(popup.getBoundingClientRect(),[rectangles.programReturn]);
    const beforeKey=visiblePosition(dock),explicitMove={x:beforeKey.x,y:beforeKey.y+10};
    await act(async()=>container.querySelector('.omni-launch-button').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
    expect(JSON.parse(localStorage.getItem(positionKey))).toEqual(explicitMove);expect(write).toHaveBeenCalledTimes(1);
    await act(async()=>window.dispatchEvent(new Event('resize')));expect(visiblePosition(dock)).toEqual(explicitMove);expect(write).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('collision')).toBe(preferences);expect(Object.keys(localStorage).sort()).toEqual(['collision',positionKey]);
  }finally{write.mockRestore();}
});
test('Return correction leaves connected programme navigation and native controls unobstructed',async()=>{
  // Actual old-69 Hooli navigation capture: Calendar was clear at 8,82 before the unsafe Return-only refit.
  const rows=[['Dashboard',219.33334350585935],['Calendar',256.3333435058594],['Reviews',293.3333435058594],['Action Items',330.3333435058594],['CIS IG3',402.3333435058594],['Risks',439.3333435058594],['Policies',476.3333435058594],['Vendors',513.3333740234375],['Evidence Library',550.3333740234375],['Contacts',622.3333740234375],['Systems & Scope',659.3333740234375],['AI Governance',696.3333740234375],['Client Profile',733.3333740234375]];
  const saved={x:8,y:82};rectangles.programReturn=rect(13,92,74.64583587646484,22);
  rows.forEach(([,top],index)=>{rectangles['nav'+index]=rect(13,top,191.33334350585935,36);});
  expect(clearOf(rect(saved.x,saved.y,168,154),rectangles.nav1)).toBe(true);
  localStorage.setItem(positionKey,JSON.stringify(saved));const write=jest.spyOn(Storage.prototype,'setItem');
  const program=withPreferences=><div className="app-shell">
    <aside className="app-sidebar bsb"><button data-testid="return-to-portfolio" data-rect="programReturn">Portfolio</button><nav className="bsb-nav">{rows.map(([name],index)=><a key={name} href={'#'+index} data-rect={'nav'+index}>{name}</a>)}</nav></aside>
    <main><OmniDock preferenceKey="collision" freePosition focused>
      <button className="omni-launch-button">Open Omnibot guide</button><div className="guided-context-prompt">Review the programme with Omnibot.</div>
      {withPreferences&&<details className="omni-position-controls"><summary>Omnibot preferences</summary><div><button>Hide Omnibot</button><button>Turn off invitations</button></div></details>}
    </OmniDock></main>
  </div>;
  const obstacles=()=>[rectangles.programReturn,...rows.map((_,index)=>rectangles['nav'+index])];
  try{
    await act(async()=>root.render(program(false)));
    const dock=container.querySelector('.omni-free-dock');
    expectSafe(dock.querySelector('.omni-launch-button').getBoundingClientRect(),[rectangles.nav1]);
    expectSafe(dock.getBoundingClientRect(),obstacles());expect(write).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(positionKey))).toEqual(saved);
    const safe=visiblePosition(dock);
    await act(async()=>root.render(program(true)));const settings=container.querySelector('.omni-position-controls');
    await act(async()=>{settings.open=true;settings.dispatchEvent(new Event('toggle'));});
    expectSafe(dock.getBoundingClientRect(),obstacles());
    for(const popup of container.querySelectorAll('.guided-context-prompt,.omni-position-controls[open]>div'))expectSafe(popup.getBoundingClientRect(),obstacles());
    expect(observer.observe.mock.calls.some(([target])=>target===container.querySelector('[data-rect="nav1"]'))).toBe(true);expect(write).not.toHaveBeenCalled();
    await act(async()=>root.render(null));localStorage.setItem(positionKey,JSON.stringify(safe));write.mockClear();
    await act(async()=>root.render(program(false)));
    expect(visiblePosition(container.querySelector('.omni-free-dock'))).toEqual(safe);expect(write).not.toHaveBeenCalled();
  }finally{write.mockRestore();}
});
