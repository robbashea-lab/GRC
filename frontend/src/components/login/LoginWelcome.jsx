import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileCheck2, Landmark, Radar } from 'lucide-react';
import OmniCharacter from '@/components/OmniCharacter';
import { loginGreeting, loginLessons, loginMenu, loginTopics } from './loginEducation';

// Public education only. The supplied children own the existing authentication flows.
export default function LoginWelcome({ theme, setTheme, children }) {
  const root = useRef(null), hero = useRef(null), bot = useRef(null), guide = useRef(null);
  const timers = useRef([]), drag = useRef(null), suppressClick = useRef(false);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState(null);
  const [greeting, setGreeting] = useState(loginGreeting);
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [paused, setPaused] = useState(false);
  const motionOff = reduced || paused;
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const dock = useCallback(() => {
    if (!bot.current || !hero.current) return;
    // Leave room for the character label and the replay/motion controls below it.
    Object.assign(bot.current.style, { left:'27px', top:`${hero.current.offsetTop + hero.current.offsetHeight - 225}px`, bottom:'auto', width:'125px', transform:'none' });
  }, []);
  const dismiss = useCallback(() => { clearTimers(); setOpen(false); dock(); }, [clearTimers, dock]);
  const welcome = useCallback(() => { setSelection(null); setGreeting(loginGreeting()); }, []);
  const replay = useCallback(() => {
    clearTimers(); welcome(); setOpen(false);
    if (motionOff) { dock(); setOpen(true); return; }
    Object.assign(bot.current.style, { transition:'none', left:'-150px', top:'-160px', bottom:'auto', width:'160px', transform:'rotate(-22deg)' });
    timers.current.push(setTimeout(() => {
      if (!bot.current) return;
      Object.assign(bot.current.style, { transition:'', left:`${Math.max(24, hero.current.clientWidth / 2 - 80)}px`, top:`${hero.current.offsetTop + 230}px`, transform:'none' });
    }, 70));
    timers.current.push(setTimeout(() => setOpen(true), 1000));
    timers.current.push(setTimeout(dock, 2700));
  }, [clearTimers, dock, motionOff, welcome]);

  const initialReplay = useRef(replay);
  useEffect(() => { initialReplay.current(); return clearTimers; }, [clearTimers]);
  useEffect(() => {
    if (motionOff) {
      clearTimers(); dock();
      bot.current.style.setProperty('--eye-x', '0px');
      bot.current.style.setProperty('--eye-y', '0px');
    }
  }, [motionOff, clearTimers, dock]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    const fit = () => {
      const minimum = window.innerWidth <= 760 ? 700 : 774;
      hero.current.style.minHeight = `${open ? Math.max(minimum, guide.current.offsetTop + guide.current.offsetHeight - hero.current.offsetTop + 250) : minimum}px`;
      if (!drag.current) dock();
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(guide.current);
    window.addEventListener('resize', fit);
    return () => { observer?.disconnect(); window.removeEventListener('resize', fit); };
  }, [open, selection, dock]);

  function choose(key) { clearTimers(); setSelection(key); setOpen(true); dock(); }
  function move(event) {
    if (drag.current && event.pointerId === drag.current.id) {
      const start = drag.current, dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) { start.moved = true; setOpen(false); }
      bot.current.style.left = `${Math.max(0, Math.min(root.current.clientWidth - bot.current.offsetWidth, start.left + dx))}px`;
      bot.current.style.top = `${Math.max(78, Math.min(root.current.clientHeight - bot.current.offsetHeight - 22, start.top + dy))}px`;
    }
    if (!motionOff && event.pointerType !== 'touch') {
      const box = bot.current.getBoundingClientRect();
      bot.current.style.setProperty('--eye-x', `${Math.max(-5, Math.min(5, (event.clientX - box.left - box.width / 2) / 45))}px`);
      bot.current.style.setProperty('--eye-y', `${Math.max(-4, Math.min(4, (event.clientY - box.top - box.height / 2) / 60))}px`);
    }
  }
  function drop(event) {
    if (!drag.current || event.pointerId !== drag.current.id) return;
    suppressClick.current = event.type === 'pointerup' && drag.current.moved;
    drag.current = null;
    bot.current.classList.remove('dragging');
    if (bot.current.hasPointerCapture?.(event.pointerId)) bot.current.releasePointerCapture(event.pointerId);
    const access = root.current.querySelector('.access').getBoundingClientRect(), box = bot.current.getBoundingClientRect();
    if (box.right > access.left && box.left < access.right && box.bottom > access.top && box.top < access.bottom) dock();
  }
  const [topic, question = '0'] = selection?.split(':') ?? [];
  const lesson = loginLessons[topic];
  const current = lesson ? lesson.questions[Number(question)] : loginTopics[topic];
  const heading = lesson ? current[1] : current?.[0] ?? greeting;
  const answer = lesson ? current[2] : current?.[1] ?? 'Welcome to Omnisciente. I’m here to help make security and compliance easier to understand. Explore a quick introduction below, or head straight to your workspace.';
  const items = lesson ? lesson.questions.map((item, index) => [`${topic}:${index}`, item[0]]) : loginMenu;
  return <div id="omni-login" ref={root} className={`login-shell ${theme === 'dark' ? 'dark' : ''} ${motionOff ? 'motion-off' : ''}`} data-theme={theme}
    onPointerMove={move} onFocusCapture={event => { if (event.target.closest('.access')) dismiss(); }}
    onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); dismiss(); bot.current.focus(); } }}>
    <header className="top"><div className="brand"><span className="ring" aria-hidden="true"/><div><strong>Omnisciente</strong><small>SEE FURTHER. BE STRONGER.</small></div></div>
      <div className="theme" role="group" aria-label="Appearance">{['light','dark'].map(value => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}</div>
    </header>
    <div className="layout"><section ref={hero} className="hero" aria-label="Explore governance, risk and compliance">
      <div className="eyebrow">GOVERNANCE, RISK &amp; COMPLIANCE</div><h1>Clarity across your security program.</h1><p className="intro">A shared workspace for governance, risk, and compliance.</p>
      <div className="network"><div className="orbital" aria-hidden="true"/><div className="orbital two" aria-hidden="true"/>{['one','two','three'].map(value => <div key={value} className={`beam ${value}`} aria-hidden="true"/>)}
        {[['governance','Governance','Direction & accountability',Landmark],['risk','Risk','Visibility & response',Radar],['compliance','Compliance','Evidence & assurance',FileCheck2]].map(([key,label,detail,Icon]) => <button type="button" className={`node ${key}`} key={key} aria-controls="login-omni-guide" aria-expanded={open && topic === key} onClick={() => choose(key)}><Icon aria-hidden="true"/><span><strong>{label}</strong><small>{detail}</small></span></button>)}
        <div className="shield-aura" aria-hidden="true"/><div className="shield" role="img" aria-label="Illuminated titanium security shield and locked padlock"><span className="shield-depth"/><span className="shield-metal"/><span className="shield-rim"/><span className="shield-glass"/><span className="lock-sculpture"><span className="lock-shackle"/><span className="lock-body"><span className="keyhole"/></span></span></div><div className="shield-base" aria-hidden="true"/>
      </div>
      <div className="hero-footer"><button className="text-button" type="button" onClick={replay}>↻ Replay welcome</button><button className="text-button" type="button" aria-pressed={motionOff} disabled={reduced} onClick={() => setPaused(value => !value)}>{reduced ? 'Reduced motion enabled' : paused ? 'Resume motion' : 'Pause motion'}</button></div>
    </section><section className="access" aria-label="Sign in">{children}</section></div>
    <button className="bot" ref={bot} type="button" aria-label="Meet Omni. Drag to move, or activate to open the guide." aria-controls="login-omni-guide" aria-expanded={open}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        clearTimers();
        drag.current = { id:event.pointerId, x:event.clientX, y:event.clientY, left:bot.current.offsetLeft, top:bot.current.offsetTop, moved:false };
        bot.current.classList.add('dragging'); bot.current.setPointerCapture(event.pointerId);
      }} onPointerUp={drop} onPointerCancel={drop} onLostPointerCapture={drop}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } clearTimers(); dock(); if (open) dismiss(); else { welcome(); setOpen(true); } }}>
      <span className="robot"><OmniCharacter approved trackPointer={false}/></span><span className="bot-label">Meet Omni · drag to move</span>
    </button>
    <section id="login-omni-guide" className={`guide ${open ? 'open' : ''}`} hidden={!open} ref={guide} aria-label="Omni welcome guide">
      <div className="guide-head"><strong>{lesson ? `OMNI EXPLAINS · ${lesson.name.toUpperCase()}` : 'OMNI · YOUR PROGRAM GUIDE'}</strong><button className="close" type="button" aria-label="Close Omni guide" onClick={() => { dismiss(); bot.current.focus(); }}>×</button></div>
      <div className="guide-content" aria-live="polite"><h3>{heading}</h3><p className="answer">{answer}</p>{lesson && <p className="lesson-example">For example: {current[3]}</p>}</div>
      <div className="topics">{items.map(([key,label]) => <button className="topic" type="button" key={key} aria-pressed={selection === key || (lesson && key === `${topic}:${question}`)} onClick={() => choose(key)}>{label}</button>)}</div>
      <div className="guide-bottom"><button type="button" onClick={() => { welcome(); setOpen(true); }}>← Omni menu</button>{!lesson && current?.[2] && <a className="source" target="_blank" rel="noopener noreferrer" href={current[2]}>Official overview ↗</a>}<button type="button" onClick={() => { dismiss(); root.current.querySelector('#email')?.focus(); }}>Ready to sign in →</button></div>
    </section>
  </div>;
}
