// Decorative CSS/SVG/canvas layers from the approved Login reference.
export default function LoginEnvironment() {
  return <>
 <div className="env" aria-hidden="true">
  <div className="env-sky"></div>
  <div className="env-rays"><i></i><i></i><i></i><i></i></div>
  <div className="env-city"><svg id="login-city" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax meet"><defs><linearGradient id="login-haze-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{stopColor:"var(--haze)",stopOpacity:"0"}}/><stop offset="1" style={{stopColor:"var(--haze)",stopOpacity:"1"}}/></linearGradient></defs></svg></div>
  <div className="env-haze"></div>
  <div className="env-floor"><svg className="floor-grid" viewBox="0 0 1000 100" preserveAspectRatio="none"><path id="login-floor-grid-path"/></svg></div>
  <div className="env-reflect"><svg id="login-city-reflect" viewBox="0 0 1600 600"><defs>
   <linearGradient id="login-rg-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{stopColor:"var(--neon)",stopOpacity:".55"}}/><stop offset="1" style={{stopColor:"var(--neon)",stopOpacity:"0"}}/></linearGradient>
   <linearGradient id="login-rg-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{stopColor:"var(--neon-v)",stopOpacity:".5"}}/><stop offset="1" style={{stopColor:"var(--neon-v)",stopOpacity:"0"}}/></linearGradient>
   <linearGradient id="login-rg-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{stopColor:"var(--win)",stopOpacity:".16"}}/><stop offset="1" style={{stopColor:"var(--win)",stopOpacity:"0"}}/></linearGradient></defs></svg></div>
  <div className="env-floor-glow"></div>
  <div className="env-horizon"></div>
  <div className="env-mist"><i></i><i></i></div>
  <div className="env-scrim"></div>
  <div className="env-vignette"></div>
 </div>

  </>;
}

export function LoginHologram() {
  return <div className="holo" id="login-holo" aria-hidden="true">
   <canvas id="login-globe"></canvas>
   <svg className="holo-shield" viewBox="0 0 300 340"><defs>
    <linearGradient id="login-sh-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d2f8ff"/><stop offset=".35" stopColor="#43b8ff"/><stop offset=".7" stopColor="#2c6dff"/><stop offset="1" stopColor="#8a6bff"/></linearGradient>
    <linearGradient id="login-sh-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5cc8ff" stopOpacity=".36"/><stop offset=".55" stopColor="#1d63d8" stopOpacity=".2"/><stop offset="1" stopColor="#3a2a9c" stopOpacity=".3"/></linearGradient>
    <linearGradient id="login-sh-left" x1="0" x2="1"><stop offset="0" stopColor="#c8f2ff" stopOpacity=".24"/><stop offset="1" stopColor="#c8f2ff" stopOpacity="0"/></linearGradient>
    <linearGradient id="login-sh-sheen-g" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset=".5" stopColor="#e6fbff" stopOpacity=".34"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
    <pattern id="login-sh-hex" width="18" height="31.2" patternUnits="userSpaceOnUse"><path d="M9 0 18 5.2v10.4L9 20.8 0 15.6V5.2ZM9 20.8v10.4" fill="none" stroke="#86dbff" strokeOpacity=".24" strokeWidth=".7"/></pattern>
    <linearGradient id="login-lock-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2fcff"/><stop offset=".35" stopColor="#74d9ff"/><stop offset="1" stopColor="#1f6fe0"/></linearGradient>
    <linearGradient id="login-lock-shackle" x1="0" x2="1"><stop offset="0" stopColor="#9eeaff"/><stop offset=".5" stopColor="#effdff"/><stop offset="1" stopColor="#4fb4ff"/></linearGradient>
    <filter id="login-sh-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="login-sh-clip"><path d="M150 14C186 32 230 42 268 44C268 150 246 244 150 324C54 244 32 150 32 44C70 42 114 32 150 14Z"/></clipPath></defs>
    <path d="M150 14C186 32 230 42 268 44C268 150 246 244 150 324C54 244 32 150 32 44C70 42 114 32 150 14Z" fill="none" stroke="#2f9bff" strokeWidth="16" strokeOpacity=".32" filter="url(#login-sh-glow)"/>
    <path d="M150 14C186 32 230 42 268 44C268 150 246 244 150 324C54 244 32 150 32 44C70 42 114 32 150 14Z" fill="url(#login-sh-fill)"/>
    <g clipPath="url(#login-sh-clip)"><rect width="300" height="340" fill="url(#login-sh-hex)"/><path d="M0 0H150V340H0Z" fill="url(#login-sh-left)"/><rect className="sheen" x="0" y="-40" width="90" height="420" fill="url(#login-sh-sheen-g)" transform="rotate(18 150 170)"/></g>
    <path d="M150 14C186 32 230 42 268 44C268 150 246 244 150 324C54 244 32 150 32 44C70 42 114 32 150 14Z" fill="none" stroke="url(#login-sh-rim)" strokeWidth="4.5"/>
    <path d="M150 14C186 32 230 42 268 44C268 150 246 244 150 324C54 244 32 150 32 44C70 42 114 32 150 14Z" fill="none" stroke="#a4e8ff" strokeOpacity=".5" strokeWidth="1.3" transform="translate(150 172) scale(.84) translate(-150 -172)" vectorEffect="non-scaling-stroke"/>
    <path d="M150 30V306" stroke="#c4f4ff" strokeOpacity=".22" strokeWidth="1"/>
    <g filter="url(#login-sh-glow)"><path d="M123 150v-22a27 27 0 0 1 54 0v22" fill="none" stroke="url(#login-lock-shackle)" strokeWidth="11" strokeLinecap="round"/><rect x="107" y="146" width="86" height="72" rx="12" fill="url(#login-lock-body)" stroke="#e8fdff" strokeOpacity=".7"/><circle cx="150" cy="175" r="8.5" fill="#06204a"/><path d="M145.5 180h9l2.4 21h-13.8Z" fill="#06204a"/></g>
   </svg>
  </div>


  ;
}
