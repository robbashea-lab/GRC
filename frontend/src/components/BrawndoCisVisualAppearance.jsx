import {createContext,useContext,useLayoutEffect} from 'react';
import './BrawndoCisVisual.css';
import './BrawndoCisVisualShell.css';

export const CisVisualPublisher = createContext(null);

// Loading may select record-free shell chrome; it never enables assessment or portal appearance.
export function useCisVisualChrome(enabled) {
  const publish = useContext(CisVisualPublisher);
  // An inactive loaded workspace must not withdraw its verified loading child's chrome.
  useLayoutEffect(() => {if (!enabled) return undefined; publish?.(true); return () => publish?.(false);}, [enabled,publish]);
}

// Only the complete loaded workspace owns assessment and portal appearance.
export function useCisVisualAppearance(enabled, theme) {
  useCisVisualChrome(enabled);
  useLayoutEffect(() => {
    if (!enabled) return;
    const roots = [document.documentElement, document.body];
    roots.forEach(root => {root.dataset.brawndoCisVisual = 'true'; root.dataset.brawndoCisTheme = theme;});
    return () => roots.forEach(root => {delete root.dataset.brawndoCisVisual; delete root.dataset.brawndoCisTheme;});
  }, [enabled, theme]);
}
