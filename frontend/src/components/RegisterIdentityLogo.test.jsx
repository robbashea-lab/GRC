import {act} from 'react';
import {createRoot} from 'react-dom/client';
import RegisterIdentityLogo from './RegisterIdentityLogo';

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = props => act(async () => root.render(<RegisterIdentityLogo {...props}/>));
const imageEvent = type => act(async () => container.querySelector('img').dispatchEvent(new Event(type)));

test.each([
  ['vendor', 'lucide-building-2'],
  ['ai', 'lucide-cpu'],
])('%s without a catalog source uses its distinct decorative fallback', async (kind, iconClass) => {
  await render({kind});
  expect(container.querySelector(`svg.${iconClass}`)).not.toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
  expect(container.querySelector('svg').getAttribute('focusable')).toBe('false');
  expect(container.querySelector('[tabindex], button, a')).toBeNull();
  expect(container.textContent).toBe('');
});

test('a logo remains decorative and contained while loading, then replaces the fallback', async () => {
  await render({kind: 'ai', src: '/native-tool-logo.svg', className: 'existing-frame'});
  const image = container.querySelector('img');
  expect(image.getAttribute('src')).toBe('/native-tool-logo.svg');
  expect(image.getAttribute('alt')).toBe('');
  expect(image.classList.contains('register-identity-logo__image--loading')).toBe(true);
  expect(container.querySelector('svg.lucide-cpu')).not.toBeNull();
  expect(container.firstChild.classList.contains('existing-frame')).toBe(true);
  expect(container.querySelector('[tabindex], button, a')).toBeNull();
  await imageEvent('load');
  expect(container.querySelector('svg')).toBeNull();
  expect(container.querySelector('img').classList.contains('register-identity-logo__image--loading')).toBe(false);
  expect(container.firstChild.classList.contains('register-identity-logo')).toBe(true);
});

test.each(['vendor', 'ai'])('a failed %s asset uses its fallback without retrying on rerender', async kind => {
  const props = {kind, src: '/missing-logo.svg'};
  await render(props);
  await imageEvent('error');
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector(kind === 'vendor' ? 'svg.lucide-building-2' : 'svg.lucide-cpu')).not.toBeNull();
  await render({...props, className: 'updated-frame'});
  expect(container.querySelector('img')).toBeNull();
});

test('changing the source after failure permits the new asset to load', async () => {
  await render({kind: 'ai', src: '/missing-logo.svg'});
  await imageEvent('error');
  await render({kind: 'ai', src: '/different-tool-logo.svg'});
  expect(container.querySelector('img').getAttribute('src')).toBe('/different-tool-logo.svg');
  await imageEvent('load');
  expect(container.querySelector('svg')).toBeNull();
});

test('changing or clearing a loaded source immediately restores the appropriate fallback', async () => {
  await render({kind: 'ai', src: '/first-tool-logo.svg'});
  await imageEvent('load');
  await render({kind: 'vendor', src: '/vendor-logo.svg'});
  expect(container.querySelector('svg.lucide-building-2')).not.toBeNull();
  expect(container.querySelector('img').classList.contains('register-identity-logo__image--loading')).toBe(true);
  await render({kind: 'vendor', src: null});
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('svg.lucide-building-2')).not.toBeNull();
});
