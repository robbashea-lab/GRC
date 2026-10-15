import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {PREVIEW_MODE} from './api';

// Preferences survive refresh; actor, workspace mode and authorized scope isolate them.
const views = new WeakMap();
const empty = () => ({search: '', mine: false, framework: 'all', sort: 'name', chartView: 'line',
  includeArchived: false, table: {filters: {}}, scroll: 0});

function readPreferences(key) {
  if (!key) return empty();
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!saved || typeof saved !== 'object') return empty();
    return {...empty(),search: typeof saved.search === 'string' ? saved.search.slice(0, 1000) : '',mine: saved.mine === true,
      framework: typeof saved.framework === 'string' ? saved.framework : 'all',
      sort: ['name','name-desc','change-desc','progress','progress-desc','activity-desc'].includes(saved.sort) ? saved.sort
        : ({change:'change-desc',activity:'activity-desc'})[saved.sort] || 'name',
      chartView: ['line','mix'].includes(saved.chartView) ? saved.chartView : 'line'};
  } catch { return empty(); }
}

function rememberPreferences(entry) {
  if (!entry.key) return;
  const {search,mine,framework,sort,chartView} = entry.view;
  try { sessionStorage.setItem(entry.key,JSON.stringify({search,mine,framework,sort,chartView})); }
  catch { /* Preferences are optional; assessment persistence uses its own error handling. */ }
}

export function usePortfolioView(user) {
  const scope = JSON.stringify([!!PREVIEW_MODE,user.role, !!user.all_clients, [...(user.client_ids || [])].sort()]);
  let entry = views.get(user);
  if (!entry || entry.scope !== scope) {
    const key = user.user_id ? 'grc:portfolio-view:' + JSON.stringify([user.user_id,scope]) : null;
    entry = {scope, key, view: readPreferences(key), listeners: new Set()};
    views.set(user, entry);
  }
  const subscribe = useCallback(listener => {
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }, [entry]);
  const getSnapshot = useCallback(() => entry.view, [entry]);
  const view = useSyncExternalStore(subscribe, getSnapshot);
  const update = useCallback(patch => {
    entry.view = {...entry.view, ...patch};
    rememberPreferences(entry);
    for (const listener of entry.listeners) listener();
  }, [entry]);
  const restoring = useRef(true);
  useEffect(() => {
    const save = () => { if (!restoring.current) entry.scroll = window.scrollY; };
    window.addEventListener('scroll', save, {passive: true});
    return () => window.removeEventListener('scroll', save);
  }, [entry]);
  const restore = () => {
    if (restoring.current) {
      window.scrollTo(0, entry.scroll ?? entry.view.scroll);
      restoring.current = false;
    }
  };
  return [view, update, restore];
}
