import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from './button';

test('static feedback opt-out preserves handlers, refs, and disabled semantics', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container), ref = React.createRef(), onClick = jest.fn();
  try {
    await act(async () => root.render(<Button ref={ref} static onClick={onClick}>Save</Button>));
    expect(ref.current.dataset.static).toBe('true');
    expect(ref.current.hasAttribute('static')).toBe(false);
    await act(async () => ref.current.click());
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Button ref={ref} disabled onClick={onClick}>Save</Button>));
    expect(ref.current.dataset.static).toBeUndefined();
    await act(async () => ref.current.click());
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Button asChild static><a href="#details">Details</a></Button>));
    expect(container.querySelector('a').dataset.static).toBe('true');
    expect(container.querySelector('a').getAttribute('href')).toBe('#details');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
