import {useEffect,useState} from 'react';

// One light/dark preference for the Brawndo reference workspace (sidebar and
// converted pages). Per-browser convenience only; never state that must persist.
export const THEME_KEY='omnisciente:brawndo-dashboard-theme';
const EVENT='omnisciente:brawndo-theme';
export function readTheme(){try{return localStorage.getItem(THEME_KEY)==='dark'?'dark':'light';}catch{return 'light';}}
export function useBrawndoTheme(){
  const [theme,setThemeState]=useState(readTheme);
  useEffect(()=>{
    const sync=()=>setThemeState(readTheme());
    window.addEventListener(EVENT,sync);window.addEventListener('storage',sync);
    return()=>{window.removeEventListener(EVENT,sync);window.removeEventListener('storage',sync);};
  },[]);
  const setTheme=next=>{try{localStorage.setItem(THEME_KEY,next);}catch{/* preference only */}setThemeState(next);window.dispatchEvent(new Event(EVENT));};
  return [theme,setTheme];
}
