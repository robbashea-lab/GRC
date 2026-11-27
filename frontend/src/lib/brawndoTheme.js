import {useEffect,useState} from 'react';
import {APPEARANCE_EVENT, MODE_KEY, readAppearance, setAppearance} from './nativeAppearance';

// One light/dark preference for the protected application and its portals.
// Retain the existing key; this is a browser preference, never business data.
export const THEME_KEY=MODE_KEY;
const EVENT=APPEARANCE_EVENT;
const nativeAppearanceActive=()=>typeof document !== 'undefined' && document.documentElement.hasAttribute('data-preview-theme');
export function readTheme(fallback='dark'){
  if(nativeAppearanceActive())return readAppearance().mode;
  try{const saved=localStorage.getItem(THEME_KEY);return ['dark','light'].includes(saved)?saved:fallback;}catch{return fallback;}}
export function useBrawndoTheme(fallback='dark'){
  const [theme,setThemeState]=useState(()=>readTheme(fallback));
  useEffect(()=>{
    const sync=()=>setThemeState(readTheme(fallback));
    sync();
    window.addEventListener(EVENT,sync);window.addEventListener('storage',sync);
    return()=>{window.removeEventListener(EVENT,sync);window.removeEventListener('storage',sync);};
  },[fallback]);
  const setTheme=next=>{
    if(nativeAppearanceActive()){setAppearance(readAppearance().theme,next);return;}
    try{localStorage.setItem(THEME_KEY,next);}catch{/* preference only */}setThemeState(next);window.dispatchEvent(new Event(EVENT));};
  return [theme,setTheme];
}
// Drawers, dialogs and menus render in portals outside the page, so a themed Brawndo page
// publishes its theme on <html> while mounted; BrawndoPortalTheme.css themes portal surfaces from it.
// Unconverted pages never call this, so their drawers stay on the light system.
export const PORTAL_ATTR='brawndoPortal';
export function useBrawndoPortalTheme(enabled,theme){
  useEffect(()=>{
    if(!enabled)return;
    const root=document.documentElement;root.dataset[PORTAL_ATTR]=theme;
    return()=>{if(root.dataset[PORTAL_ATTR]===theme)delete root.dataset[PORTAL_ATTR];};
  },[enabled,theme]);
}
