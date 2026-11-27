import V3WorkspaceHeading from './V3WorkspaceHeading';
import {Moon,Sun} from 'lucide-react';
import {useBrawndoTheme,useBrawndoPortalTheme} from '@/lib/brawndoTheme';
import './BrawndoPage.css';

// Shared shell for Brawndo reference pages: themed surface, header, summary tiles and view chips.
export function BrawndoSurface({className='',children,...rest}){
  const [theme]=useBrawndoTheme();useBrawndoPortalTheme(true,theme);
  return <div className={`bpage ${className}`} data-theme={theme} {...rest}>{children}</div>;
}
export function BrawndoPageHeader({eyebrow,title,subtitle,children,renderThemeAction,clientName}){
  const [theme,setTheme]=useBrawndoTheme();
  const onTheme=()=>setTheme(theme==='dark'?'light':'dark');
  const modeControl = renderThemeAction?renderThemeAction({theme,onTheme}):<button type="button" className="bpage-btn" onClick={onTheme} aria-pressed={theme==='dark'} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>{theme==='dark'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}<span>{theme==='dark'?'Light':'Dark'}</span></button>;
  if (clientName) return <V3WorkspaceHeading clientName={clientName} title={title} subtitle={subtitle} actionsClass="bpage-actions">{children}{modeControl}</V3WorkspaceHeading>;
  return <header className="bpage-head">
    <div><p className="bpage-eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle&&<p className="bpage-subtitle">{subtitle}</p>}</div>
    <div className="bpage-actions">
      {modeControl}
      {children}
    </div>
  </header>;
}
// tiles: [{id,label,count,tone:'critical'|'attention'|'good'|'neutral',context,onClick?,pressed?}]
export function BrawndoTiles({tiles,label='Summary',loading}){
  return <div className="reg-kstrip native-summary" data-native-summary><div className="kstrip" role="group" aria-label={label}>{tiles.map(t=>{
    const cls=`kchip is-${t.count||t.tone==='neutral'?t.tone:'clear'}`,body=<><b className="num" style={{color:t.count?({critical:'var(--alert)',attention:'var(--warn)',good:'var(--ok)'})[t.tone]:undefined}}>{loading?'—':t.count}</b><span className="kl">{t.label}</span><span className="kc">{loading?'Loading…':t.context}</span></>;
    return t.onClick?<button key={t.id} type="button" className={cls} aria-pressed={!!t.pressed} disabled={loading} onClick={t.onClick} data-testid={`tile-${t.id}`}>{body}</button>:<div key={t.id} className={cls} data-testid={`tile-${t.id}`}>{body}</div>;
  })}</div></div>;
}
// chips: [{id,label,count?,pressed,onClick}]
export function BrawndoChips({chips,label}){
  return <div className="bpage-chips" role="group" aria-label={label}>{chips.map(c=><button key={c.id} type="button" className="bpage-chip" aria-pressed={!!c.pressed} onClick={c.onClick} data-testid={c.testid}>{c.label}{c.count!=null?` · ${c.count}`:''}</button>)}</div>;
}
export const plural=(n,one,many=one+'s')=>`${n} ${n===1?one:many}`;
export const shortDate=iso=>iso?new Date(String(iso).slice(0,10)+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
export function daysUntil(iso,now=new Date()){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||''));if(!m)return null;
  return Math.round((Date.UTC(+m[1],m[2]-1,+m[3])-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
}
