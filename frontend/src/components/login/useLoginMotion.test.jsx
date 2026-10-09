import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useLoginMotion } from './useLoginMotion';
import { createLoginScenery } from './loginScenery';
import { createLoginOptics } from './loginOptics';
jest.mock('./loginScenery', () => ({ createLoginScenery: jest.fn() }));
jest.mock('./loginOptics', () => ({ createLoginOptics: jest.fn() }));
test('an earlier RAF timestamp cannot produce negative globe time; route cleanup releases effects', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const scenery = { draw: jest.fn(), resize: jest.fn(), invalidate: jest.fn(), dispose: jest.fn() };
  const optics = { draw: jest.fn(), resize: jest.fn(), clear: jest.fn() };
  createLoginScenery.mockReturnValue(scenery); createLoginOptics.mockReturnValue(optics);
  let frame;
  const originalObserver = global.ResizeObserver;
  const disconnect = jest.fn();
  global.ResizeObserver = class { observe() {} disconnect() { disconnect(); } };
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 17; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const now = jest.spyOn(performance, 'now').mockReturnValue(1000);
  const removed = jest.spyOn(window, 'removeEventListener');
  function Harness() {
    const rootRef = useRef(null);
    useLoginMotion(rootRef, { paused:false, scanning:false, replay:0, placement:{ visible:true, mobile:false, unit:1, x:100,y:400 }, onScanComplete:jest.fn() });
    return <div ref={rootRef}><div className="hero"/><div className="login"/><header className="top"/><img id="login-standing-art" alt=""/><div id="login-actor"/><div id="login-orbActor"/></div>;
  }
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness/>));
    await act(async () => frame(700));
    expect(scenery.draw).toHaveBeenLastCalledWith(0);
    await act(async () => frame(1700));
    expect(scenery.draw).toHaveBeenLastCalledWith(.045);
    await act(async () => root.unmount());
    expect(cancel).toHaveBeenCalledWith(17);
    expect(disconnect).toHaveBeenCalled(); expect(optics.clear).toHaveBeenCalled(); expect(scenery.dispose).toHaveBeenCalled();
    expect(removed).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function));
  } finally {
    container.remove(); global.ResizeObserver = originalObserver; raf.mockRestore(); cancel.mockRestore(); now.mockRestore(); removed.mockRestore();
  }
});
