import {useLocation} from 'react-router-dom';
import {Moon,Sun} from 'lucide-react';
import {useBrawndoTheme,useBrawndoPortalTheme} from '@/lib/brawndoTheme';
import './BrawndoPage.css';
import './PrestigeSurface.css';

// Presentation only: all routes and records remain owned by their existing modules.
export default function PrestigeSurface({children}) {
  const [theme,setTheme]=useBrawndoTheme();
  useBrawndoPortalTheme(true,theme);
  const {pathname}=useLocation();
  const legacy=['/findings','/action-items','/systems'].includes(pathname)||pathname.startsWith('/compliance/');
  return <div className="bpage prestige-surface" data-theme={theme}>
    {legacy&&<div className="prestige-theme"><button className="bpage-btn" type="button" aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} aria-pressed={theme==='dark'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}<span>{theme==='dark'?'Light':'Dark'}</span></button></div>}
    {children}
  </div>;
}
