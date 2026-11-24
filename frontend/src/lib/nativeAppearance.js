import {useSyncExternalStore} from 'react';

export const APPEARANCE_KEY = 'governara.appearance.v2';
export const MODE_KEY = 'omnisciente:brawndo-dashboard-theme';
export const APPEARANCE_EVENT = 'omnisciente:brawndo-theme';

// The order, names and available modes are shared with the approved gallery.
export const appearances = [
  {id:'midnight', name:'Midnight Blue', description:'Deep navy and cool blue', defaultMode:'dark'},
  {id:'iventure', name:'iVenture', description:'Metallic gray with iVenture lime'},
  {id:'graphite', name:'Graphite', description:'Black, white, and zinc'},
  {id:'teal', name:'Nordic Teal', description:'Deep petrol teal, GoverNara’s original'},
  {id:'aubergine', name:'Aubergine', description:'Eggplant, lilac, and serif titles'},
  {id:'sandstone', name:'Sandstone', description:'Ivory, espresso, and bronze'},
  {id:'classic92', name:'Classic ’92', description:'Navy title bars on white windows', fixed:true},
  {id:'desktop95', name:'Desktop ’95', description:'Beveled windows on a teal desktop', fixed:true},
  {id:'glossy01', name:'Glossy ’01', description:'Rounded blue title bars and beige windows', fixed:true},
  {id:'profile06', name:'Profile ’06', description:'Glossy blue, orange, and sparkles', fixed:true},
  {id:'glass07', name:'Glass ’07', description:'Frosted glass frames over deep blue', fixed:true},
  {id:'tiles12', name:'Tiles ’12', description:'Flat color blocks and light type', fixed:true},
];

const byId = new Map(appearances.map(option => [option.id, option]));
const initialChoice = byId.get('glass07');
const validMode = value => value === 'light' || value === 'dark';
let sessionPreference;

function normalize(theme, mode) {
  const choice = byId.get(theme);
  if (!choice) return null;
  return {theme, mode: choice.fixed ? 'light' : validMode(mode) ? mode : choice.defaultMode || 'light'};
}

function storedPreference(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

export function readAppearance() {
  if (sessionPreference) return sessionPreference;
  const saved = storedPreference(APPEARANCE_KEY);
  const current = normalize(saved?.theme, saved?.mode);
  if (current) return current;

  const legacy = storedPreference('governara.appearance.v1');
  // The first preview automatically saved Midnight Blue/Dark without a user choice.
  if (legacy && !(legacy.theme === 'midnight' && legacy.mode === 'dark')) {
    const previous = normalize(legacy.theme, legacy.mode);
    if (previous) return previous;
  }
  try {
    const mode = localStorage.getItem(MODE_KEY);
    if (validMode(mode)) return normalize('teal', mode);
  } catch { /* The page works with in-memory preferences when storage is blocked. */ }
  return normalize(initialChoice.id);
}

export function setAppearance(theme, mode) {
  const next = normalize(theme, mode);
  if (!next) return;
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
    localStorage.setItem(MODE_KEY, next.mode);
    sessionPreference = undefined;
  } catch { sessionPreference = next; }
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

function subscribe(notify) {
  window.addEventListener(APPEARANCE_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
}

function snapshot() {
  const {theme, mode} = readAppearance();
  return theme + '/' + mode;
}

export function useAppearance() {
  const selected = useSyncExternalStore(subscribe, snapshot, () => 'glass07/light');
  const [theme, mode] = selected.split('/');
  return {choice:byId.get(theme), mode};
}
