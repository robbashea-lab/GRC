import { useEffect, useRef } from 'react';
import { createLoginScenery } from './loginScenery';
import { createLoginOptics } from './loginOptics';

// One route-owned animation loop; no global shortcuts, shared character state or data access.
export function useLoginMotion(rootRef, options) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    const root = rootRef.current;
    const scenery = createLoginScenery(root);
    const optics = createLoginOptics(root);
    let frameId, last = performance.now(), time = 0, scanTime = 0, replay = -1, completed = false, previousTheme;
    const resize = () => { scenery.resize(); optics.resize(); };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root.querySelector('.hero'));
    observer.observe(root.querySelector('.login'));
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', resize, { passive: true });
    function frame(now) {
      const settings = current.current;
      // RAF timestamps can precede effect setup when React flushes during an existing frame.
      const dt = Math.max(0, Math.min((now - last) / 1000, .045));
      last = now;
      if (!settings.paused && !document.hidden) time += dt;
      if (replay !== settings.replay) { replay = settings.replay; scanTime = 0; completed = false; }
      const dark = root.classList.contains('dark');
      if (dark !== previousTheme) { previousTheme = dark; scenery.invalidate(); }
      const scanning = settings.scanning && !settings.paused;
      if (scanning && !document.hidden) scanTime += dt;
      const rootBounds = root.querySelector('.hero').getBoundingClientRect();
      const art = root.querySelector('#login-standing-art').getBoundingClientRect();
      const body = root.querySelector('#login-actor');
      const orb = root.querySelector('#login-orbActor');
      const panel = root.querySelector('.login').getBoundingClientRect();
      const placement = settings.placement;
      const bob = settings.paused || settings.dragging ? 0 : Math.sin(time * 1.8) * 3;
      orb.style.setProperty('--login-bob', `${bob}px`);
      body.style.setProperty('--login-breathe', settings.paused || settings.dragging ? 1 : 1 + Math.sin(time * 1.6) * .004);
      const view = {
        show: placement.visible, mobile: placement.mobile, U: placement.unit,
        hero: rootBounds, login: panel, top: root.querySelector('.top').getBoundingClientRect().bottom,
        baseX: placement.x, baseY: placement.y,
        eyes: [{ x: art.left + art.width * .55, y: art.top + art.height * .096 }, { x: art.left + art.width * .62, y: art.top + art.height * .104 }],
        core: { x: art.left + art.width * .54, y: art.top + art.height * .245 },
      };
      optics.draw(view, scanning ? Math.min(scanTime / 3.8, 1) : null, time);
      scenery.draw(time);
      if (scanning && scanTime >= 3.8 && !completed) { completed = true; settings.onScanComplete(); }
      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', resize);
      observer.disconnect();
      optics.clear();
      scenery.dispose();
    };
  }, [rootRef]);
}
