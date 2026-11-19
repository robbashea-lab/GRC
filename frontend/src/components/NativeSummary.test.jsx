import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {BrawndoTiles} from './BrawndoPage';

test('shared R4 summary preserves recorded zero, unavailable loading state and native drill-down actions', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host), open = jest.fn();
  const tiles = [{id:'zero',label:'Due soon',count:0,tone:'neutral',context:'Nothing due'},{id:'work',label:'Open work',count:3,tone:'attention',context:'Actual records',onClick:open,pressed:true}];
  try {
    await act(async () => root.render(<BrawndoTiles tiles={tiles}/>));
    expect(host.querySelector('[data-native-summary]')).not.toBeNull();
    expect(host.querySelector('[data-testid="tile-zero"] b').textContent).toBe('0');
    const action = host.querySelector('[data-testid="tile-work"]');
    expect(action.getAttribute('aria-pressed')).toBe('true');
    await act(async () => action.click());expect(open).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<BrawndoTiles tiles={tiles} loading/>));
    expect(host.querySelector('[data-testid="tile-zero"] b').textContent).toBe('—');
    expect(host.querySelector('[data-testid="tile-work"]').disabled).toBe(true);
    expect(tiles[0].count).toBe(0);
  } finally {await act(async () => root.unmount());}
});
