import './RegisterSignalBar.css';

// Compact attention layer above a register. Each signal filters the register below.
export default function RegisterSignalBar({signals,rows,active,onPick,label='Requires attention',testIdPrefix,describe}){
  return <div className="register-signals" role="group" aria-label={label}>
    {signals.map(s=>{const n=rows.filter(s.test).length;return <button key={s.id} type="button" aria-pressed={active===s.id} disabled={!n&&active!==s.id}
      onClick={()=>onPick(s.id)} className={`register-signal ${n?`is-${s.tone}`:'is-clear'}`}
      data-testid={testIdPrefix?testIdPrefix+s.id:undefined} aria-label={describe?describe(s,n):undefined}>
      <span className="register-signal-value">{n}</span><span className="register-signal-label">{s.label}</span></button>;})}
    {active&&<button type="button" className="register-signal-clear" onClick={()=>onPick(active)}>Clear view</button>}
  </div>;
}
