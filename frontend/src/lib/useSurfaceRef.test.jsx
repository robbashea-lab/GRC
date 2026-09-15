import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useSurfaceRef } from './useSurfaceRef';

test('a keyboard-opened surface retains its entry mode when the user switches to a pointer', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container), ref = React.createRef();
  const Surface = () => <div ref={useSurfaceRef(ref)} />;
  try {
    document.documentElement.dataset.inputModality = 'keyboard';
    await act(async () => root.render(<Surface />));
    expect(ref.current.dataset.entryMotion).toBe('keyboard');
    document.documentElement.dataset.inputModality = 'pointer';
    await act(async () => root.render(<Surface />));
    expect(ref.current.dataset.entryMotion).toBe('keyboard');
    await act(async () => root.render(null));
    expect(ref.current).toBeNull();
    await act(async () => root.render(<Surface />));
    expect(ref.current.dataset.entryMotion).toBe('pointer');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    delete document.documentElement.dataset.inputModality;
  }
});
