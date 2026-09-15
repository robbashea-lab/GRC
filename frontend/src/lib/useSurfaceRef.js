import { useCallback } from 'react';

// Capture entry modality on the actual portalled node, not on its parent.
// Switching from keyboard to mouse inside an open drawer must never replay entry.
export function useSurfaceRef(forwardedRef) {
  return useCallback(node => {
    if (node && !node.dataset.entryMotion) {
      node.dataset.entryMotion = node.ownerDocument.documentElement.dataset.inputModality || 'keyboard';
    }
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
}
