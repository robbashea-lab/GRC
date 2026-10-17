import {createContext,useContext,useLayoutEffect} from 'react';
import './BrawndoCisVisual.css';
import './BrawndoCisVisualShell.css';

export const CisVisualPublisher = createContext(null);

// One originating workspace owns the shell/portal variant, removed before the next route paints.
export function useCisVisualAppearance(enabled, theme) {
  const publish = useContext(CisVisualPublisher);
  useLayoutEffect(() => {publish?.(enabled); return () => publish?.(false);}, [enabled,publish]);
  useLayoutEffect(() => {
    if (!enabled) return;
    const roots = [document.documentElement, document.body];
    roots.forEach(root => {root.dataset.brawndoCisVisual = 'true'; root.dataset.brawndoCisTheme = theme;});
    return () => roots.forEach(root => {delete root.dataset.brawndoCisVisual; delete root.dataset.brawndoCisTheme;});
  }, [enabled, theme]);
}
