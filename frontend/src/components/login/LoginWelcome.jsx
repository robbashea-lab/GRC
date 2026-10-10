import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Building2, FileCheck2, TriangleAlert, X, Hexagon, Bot } from 'lucide-react';
import LoginEnvironment, { LoginHologram } from './LoginEnvironment';
import { characterPlacement, clamp, educationPlacement } from './loginPlacement';
import { loginGreeting, loginMenu, loginTopics, loginWelcomeMessage } from './loginEducation';
import { useLoginMotion } from './useLoginMotion';

const cards = [
  ['governance', 'Governance', 'Direction & accountability', Building2],
  ['risk', 'Risk', 'Visibility & response', TriangleAlert],
  ['compliance', 'Compliance', 'Evidence & assurance', FileCheck2],
];
const initialPlacement = { x: 130, y: 500, width: 180, height: 270, visible: true, mobile: false, unit: 1, bounds: {} };
const asset = name => `${process.env.PUBLIC_URL || ''}/login/${name}`;

export default function LoginWelcome({ theme, setTheme, children }) {
  const rootRef = useRef(null), guideRef = useRef(null), triggerRef = useRef(null), dragRef = useRef(null);
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
  const [userPaused, setUserPaused] = useState(false);
  const paused = reduced || userPaused;
  const [placement, setPlacement] = useState(initialPlacement);
  const [custom, setCustom] = useState(null);
  const [mode, setMode] = useState('robot');
  const [ready, setReady] = useState({ robot: false, orb: false });
  const [artError, setArtError] = useState(false);
  const [scanning, setScanning] = useState(false), [replay, setReplay] = useState(0);
  const scanStarted = useRef(false);
  const [greeting, setGreeting] = useState(false), [topic, setTopic] = useState(null);
  const [dragging, setDragging] = useState(false);
  const visiblePlacement = custom ? { ...placement, ...custom } : placement;
  const finishScan = useCallback(() => { setScanning(false); setGreeting(true); }, []);
  useLoginMotion(rootRef, { paused, scanning, replay, dragging, placement: visiblePlacement, onScanComplete: finishScan });

  const measure = useCallback(() => {
    const root = rootRef.current;
    const rect = selector => root.querySelector(selector).getBoundingClientRect();
    setPlacement(characterPlacement({
      zone: rect('#login-landing-zone'), copy: rect('.hero-copy'), footer: rect('.hero-footer'),
      login: rect('.login'), cards: rect('#login-grc-cards'), header: rect('.top'),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }));
  }, []);
  useLayoutEffect(() => {
    measure();
    const resize = () => { setCustom(null); measure(); };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(rootRef.current.querySelector('.hero'));
    observer?.observe(rootRef.current.querySelector('.login'));
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', resize, { passive: true });
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('scroll', resize); };
  }, [measure]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!ready.robot || !ready.orb) return;
    if (!scanStarted.current) {
      scanStarted.current = true;
      setScanning(!paused); setGreeting(paused);
    } else if (paused) {
      setScanning(false); setGreeting(true);
    }
    // Resuming ambient motion must not restart a completed scan. Replay is explicit.
  }, [ready.robot, ready.orb, paused]);
  useLayoutEffect(() => {
    if (!topic) return;
    const guide = guideRef.current;
    // Use the destination geometry, not an intermediate morph-frame bounding box.
    const size = Math.min(visiblePlacement.height * .55, placement.mobile ? 132 : 170 * placement.unit);
    const width = mode === 'orb' ? size : visiblePlacement.width;
    const top = mode === 'orb' ? visiblePlacement.y - size * .68 - size * 572 / 600 / 2 : visiblePlacement.y - visiblePlacement.height;
    const character = { left: visiblePlacement.x - width / 2, right: visiblePlacement.x + width / 2, top };
    const position = educationPlacement(character, guide.scrollHeight, { width: window.innerWidth, height: window.innerHeight });
    Object.assign(guide.style, Object.fromEntries(Object.entries(position).map(([key, value]) => [key, `${value}px`])));
  }, [topic, mode, visiblePlacement.height, visiblePlacement.width, visiblePlacement.x, visiblePlacement.y, placement.mobile, placement.unit]);
  useLayoutEffect(() => {
    if (topic) { guideRef.current.scrollTop = 0; guideRef.current.querySelector('h3').focus({ preventScroll: true }); }
  }, [topic]);

  function closeGuide(restoreFocus = true) {
    setTopic(null);
    if (restoreFocus) {
      const trigger = triggerRef.current;
      const available = trigger?.isConnected && !trigger.disabled && !trigger.closest('[hidden],[aria-hidden="true"]');
      const target = available ? trigger : rootRef.current.querySelector(mode === 'orb' ? '#login-orbHit' : '#login-robotHit');
      target?.focus();
    }
  }
  function openTopic(key) {
    if (!topic) triggerRef.current = document.activeElement;
    if (!visiblePlacement.visible || visiblePlacement.y - visiblePlacement.height < 160) {
      setCustom(null);
      rootRef.current.querySelector('#login-landing-zone').scrollIntoView({ block: 'center' });
      measure();
    }
    setScanning(false); setGreeting(false); setTopic(key);
  }
  function replayScan() {
    setCustom(null); setMode('robot'); setTopic(null); setReplay(value => value + 1);
    setScanning(!paused); setGreeting(paused);
    rootRef.current.querySelector('#login-landing-zone').scrollIntoView({ block: 'center' });
  }
  function toggleMode() {
    setScanning(false); setGreeting(false); setMode(value => value === 'robot' ? 'orb' : 'robot');
  }
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (active?.id === 'login-robotHit' && mode === 'orb') rootRef.current.querySelector('#login-orbHit').focus({ preventScroll: true });
    if (active?.id === 'login-orbHit' && mode === 'robot') rootRef.current.querySelector('#login-robotHit').focus({ preventScroll: true });
  }, [mode]);
  function signInShortcut() {
    closeGuide(false);
    const form = rootRef.current.querySelector('.login');
    const control = form.querySelector('#email:not(:disabled)') || form.querySelector('[data-testid="explore-demo"]') || form.querySelector('h2');
    control?.focus();
  }
  function pointerDown(event) {
    if (event.button !== 0 || dragRef.current) return;
    dragRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: visiblePlacement.x, y: visiblePlacement.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) <= 6 && !drag.moved) return;
    drag.moved = true; setDragging(true); setScanning(false); setGreeting(false);
    setCustom({ x: clamp(drag.x + dx, placement.bounds.minX, placement.bounds.maxX), y: clamp(drag.y + dy, placement.bounds.minY, placement.bounds.maxY) });
  }
  function pointerEnd(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.currentTarget.dataset.dragged = String(drag.moved);
    dragRef.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function characterClick(event) {
    if (event.currentTarget.dataset.dragged === 'true') { event.currentTarget.dataset.dragged = 'false'; return; }
    openTopic('welcome');
  }
  function characterKey(event) {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault(); setScanning(false); setGreeting(false);
    const step = event.shiftKey ? 25 : 8;
    setCustom({
      x: clamp(visiblePlacement.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), placement.bounds.minX, placement.bounds.maxX),
      y: clamp(visiblePlacement.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0), placement.bounds.minY, placement.bounds.maxY),
    });
  }
  function pageKey(event) {
    if (event.key === 'Escape') { if (topic) closeGuide(); else setGreeting(false); return; }
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.target.closest('input,textarea,select')) return;
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); replayScan(); }
    if (event.key.toLowerCase() === 't') { event.preventDefault(); toggleMode(); }
  }
  const characterEvents = { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerEnd, onPointerCancel: pointerEnd, onLostPointerCapture: pointerEnd, onClick: characterClick, onKeyDown: characterKey };
  const activeLesson = loginTopics[topic] || [loginGreeting(), loginWelcomeMessage];
  const orbSize = Math.min(visiblePlacement.height * .55, placement.mobile ? 132 : 170 * placement.unit);
  const characterStyle = { left: visiblePlacement.x, top: visiblePlacement.y, width: visiblePlacement.width, height: visiblePlacement.height };

  return <div ref={rootRef} id="omni-login" className={`login-shell${theme === 'dark' ? ' dark' : ''}${paused ? ' motion-paused' : ''}${dragging ? ' dragging' : ''}`} data-login-scan={scanning ? 'scanning' : 'idle'} onKeyDown={pageKey}>
    <LoginEnvironment/>
    <header className="top">
      <div className="brand"><span className="ring" aria-hidden="true"/><div><strong className="wordmark">Omni<span>sciente</span></strong><small>SEE FURTHER. BE STRONGER.</small></div></div>
      <div className="theme" role="group" aria-label="Appearance">{['light', 'dark'].map(value => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}</div>
    </header>
    <div className="stage">
      <LoginHologram/>
      <section className="hero" id="login-hero" aria-label="Explore governance, risk and compliance">
        <div className="hero-copy"><div className="eyebrow">GOVERNANCE, RISK &amp; COMPLIANCE</div><h1>Clarity across your security program.</h1><span className="accent-bar" aria-hidden="true"/><p className="intro">A shared workspace for governance, risk, and compliance.</p></div>
        <div className="landing-zone" id="login-landing-zone" aria-hidden="true"/>
        <div className="hero-footer"><button type="button" className="text-button" onClick={replayScan} disabled={!ready.robot || !ready.orb}>↻ Replay scan</button><button type="button" className="text-button" aria-pressed={paused} disabled={reduced} onClick={() => setUserPaused(value => !value)}>{reduced ? 'Reduced motion enabled' : paused ? 'Resume motion' : 'Pause motion'}</button></div>
      </section>
      <div className="cards" id="login-grc-cards" role="group" aria-label="Learn the basics of governance, risk and compliance">
        {cards.map(([key, label, caption, Icon]) => <button key={key} className={`grc-card ${key}`} type="button" aria-controls="login-education" aria-expanded={topic === key} onClick={() => openTopic(key)}><Icon className="ico card-icon" aria-hidden="true"/><strong>{label}</strong><small>{caption}</small><svg className="card-chart" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">{key === 'risk' ? <path d="M0 24 10 21 18 24 26 16 34 19 42 11 50 17 58 6 66 14 74 9 82 18 90 12 98 20 106 15 120 21" fill="none" stroke="currentColor" strokeWidth="1.4"/> : Array.from({ length: 13 }, (_, i) => <rect key={i} x={2+i*9} y={key === 'compliance' ? 22-i*1.6 : 4+Math.abs(i-5)*3} width="5" height={key === 'compliance' ? 6+i*1.6 : 24-Math.abs(i-5)*3} fill="currentColor" opacity=".75"/>)}</svg><span className="card-cta">Explore</span></button>)}
      </div>
      <section className="access" aria-label="Workspace access" onFocusCapture={() => { setGreeting(false); if (topic) closeGuide(false); }}>{children}</section>
    </div>
    <canvas id="login-fx" aria-hidden="true"/>
    <div id="login-character-layer" hidden={!visiblePlacement.visible}>
      <div id="login-ground" aria-hidden="true" style={{ left: visiblePlacement.x, top: visiblePlacement.y, width: visiblePlacement.width * 1.16, height: visiblePlacement.width * .2 }}><div className="pool"/><div className="contact"/></div>
      <div id="login-floor" aria-hidden="true" style={{ left: visiblePlacement.x, top: visiblePlacement.y, width: visiblePlacement.width * 1.02, height: visiblePlacement.width * .17 }}/>
      <div id="login-actor" data-form={mode} aria-hidden={mode !== 'robot'} data-optic={scanning ? 'armed' : 'rest'} style={characterStyle}>
        <img id="login-standing-art" src={asset('omni-standing.png')} alt="" draggable="false" onLoad={() => setReady(value => ({ ...value, robot: true }))} onError={() => setArtError(true)}/>
        <button id="login-robotHit" type="button" aria-label="OmniBot. Open quick introductions; drag or use arrow keys to move." aria-controls="login-education" aria-expanded={!!topic} tabIndex={mode === 'robot' ? 0 : -1} disabled={mode !== 'robot'} {...characterEvents}/>
      </div>
      <div id="login-orbActor" data-form={mode} aria-hidden={mode !== 'orb'} style={{ left: visiblePlacement.x, top: visiblePlacement.y - orbSize * .68, width: orbSize, height: orbSize * 572 / 600 }}>
        <div className="orb-halo" aria-hidden="true"/><img id="login-nova-art" src={asset('omni-orb.png')} alt="" draggable="false" onLoad={() => setReady(value => ({ ...value, orb: true }))} onError={() => setArtError(true)}/>
        <button id="login-orbHit" type="button" aria-label="Omni Orb. Open quick introductions; drag or use arrow keys to move." aria-controls="login-education" aria-expanded={!!topic} tabIndex={mode === 'orb' ? 0 : -1} disabled={mode !== 'orb'} {...characterEvents}/>
      </div>
      <canvas id="login-fx-front" aria-hidden="true"/>
      <button type="button" className="on-character" data-form={mode} aria-label={mode === 'robot' ? 'Switch to Omni Orb' : 'Switch to OmniBot robot'} aria-pressed={mode === 'orb'} disabled={!ready.robot || !ready.orb} onClick={toggleMode} style={{ left: clamp(visiblePlacement.x - 54, 8, window.innerWidth - 116), top: visiblePlacement.y + 7 }}><span>{mode === 'robot' ? 'Orb mode' : 'Robot mode'}</span><span className="transform-icon">{mode === 'robot' ? <Hexagon aria-hidden="true"/> : <Bot aria-hidden="true"/>}</span></button>
      <aside id="login-speech" hidden={!greeting || !!topic} aria-label="Omni greeting" className="above" style={{ left: clamp(visiblePlacement.x - 90, 12, window.innerWidth - 280), top: Math.max(12, visiblePlacement.y - visiblePlacement.height - 100) }}><button id="login-speech-close" type="button" aria-label="Dismiss greeting" onClick={() => setGreeting(false)}><X aria-hidden="true"/></button><small>OMNI</small><p>{loginGreeting()}</p></aside>
    </div>
    <div id="login-scan-status" hidden={!scanning || !visiblePlacement.visible} role="status" style={{ left: Math.max(12, Math.min(window.innerWidth - 220, placement.x + placement.width)), top: 90 }}><span className="scan-light" aria-hidden="true"/><div><strong>OPTIC ARRAY</strong><span>Visual effect only</span></div><span id="login-scan-number" aria-hidden="true">00%</span></div>
    <section ref={guideRef} id="login-education" className="guide" hidden={!topic} role="dialog" aria-modal="false" aria-labelledby="login-edu-title" aria-describedby="login-edu-answer">
      <div className="guide-head"><strong>OMNI · YOUR PROGRAM GUIDE</strong><button type="button" className="guide-close" aria-label="Close education" onClick={() => closeGuide()}><X aria-hidden="true"/></button></div>
      <h3 id="login-edu-title" tabIndex="-1">{activeLesson[0]}</h3><p className="answer" id="login-edu-answer">{activeLesson[1]}</p>
      <div className="topics" hidden={['governance', 'risk', 'compliance'].includes(topic)} aria-label="Quick introductions">{loginMenu.map(([key, label]) => <button className="topic" key={key} type="button" aria-pressed={topic === key} onClick={() => openTopic(key)}>{label}</button>)}</div>
      <div className="guide-bottom"><button type="button" hidden={topic === 'welcome'} onClick={() => openTopic('welcome')}>← Omni menu</button><button type="button" onClick={signInShortcut}>Ready to sign in →</button></div>
    </section>
    {artError && <div className="login-art-error"><p role="status">Omni’s artwork could not load. Sign-in remains available.</p><button type="button" onClick={() => openTopic('welcome')}>Open Omni’s introductions</button></div>}
  </div>;
}
