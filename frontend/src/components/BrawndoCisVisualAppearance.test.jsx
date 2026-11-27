import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {CisVisualPublisher, useCisVisualAppearance, useCisVisualChrome} from './BrawndoCisVisualAppearance';

function Origin({enabled, theme = 'light'}) {
  useCisVisualAppearance(enabled, theme);
  return <div>Native workspace</div>;
}

let container, root, publish;
const roots = () => [document.documentElement, document.body];
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container); publish = jest.fn();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container.remove();
  roots().forEach(element => {delete element.dataset.brawndoCisVisual; delete element.dataset.brawndoCisTheme;});
});
const render = props => act(async () => root.render(<CisVisualPublisher.Provider value={publish}><Origin {...props}/></CisVisualPublisher.Provider>));
const expectCleared = () => roots().forEach(element => {
  expect(element.hasAttribute('data-brawndo-cis-visual')).toBe(false);
  expect(element.hasAttribute('data-brawndo-cis-theme')).toBe(false);
});

test('disabled origin applies no shell or portal markers', async () => {
  await render({enabled: false});
  expectCleared(); expect(publish).not.toHaveBeenCalled();
});

test('loading chrome publishes the shell without enabling loaded assessment or portal markers', async () => {
  function LoadingOrigin() {useCisVisualChrome(true); return <div>Loading verified program</div>;}
  await act(async () => root.render(<CisVisualPublisher.Provider value={publish}><LoadingOrigin/></CisVisualPublisher.Provider>));
  expect(publish).toHaveBeenLastCalledWith(true);expectCleared();
});

test('a disabled parent cannot withdraw the appearance owned by its enabled loading child', async () => {
  function LoadingOrigin() {
    useCisVisualAppearance(false, 'light');
    return <Origin enabled theme="light"/>;
  }
  await act(async () => root.render(<CisVisualPublisher.Provider value={publish}><LoadingOrigin/></CisVisualPublisher.Provider>));
  roots().forEach(element => expect(element.dataset.brawndoCisVisual).toBe('true'));
  expect(publish.mock.calls).toEqual([[true]]);
  await act(async () => root.render(<CisVisualPublisher.Provider value={publish}><Origin enabled theme="light"/></CisVisualPublisher.Provider>));
  roots().forEach(element => expect(element.dataset.brawndoCisVisual).toBe('true'));
  expect(publish).toHaveBeenLastCalledWith(true);
});

test('enabled origin publishes exact theme on html and body then updates it', async () => {
  await render({enabled: true, theme: 'light'});
  roots().forEach(element => {
    expect(element.dataset.brawndoCisVisual).toBe('true');
    expect(element.dataset.brawndoCisTheme).toBe('light');
  });
  expect(publish).toHaveBeenLastCalledWith(true);
  await render({enabled: true, theme: 'dark'});
  roots().forEach(element => expect(element.dataset.brawndoCisTheme).toBe('dark'));
});

test('client or mode disabling clears both origin markers before the next paint', async () => {
  await render({enabled: true, theme: 'dark'});
  await render({enabled: false, theme: 'dark'});
  expectCleared(); expect(publish).toHaveBeenLastCalledWith(false);
});

test('route unmount clears shell and portaled appearance without changing unrelated page attributes', async () => {
  document.documentElement.dataset.theme = 'native-theme';
  document.body.dataset.unrelatedScope = 'existing-module';
  await render({enabled: true, theme: 'dark'});
  await act(async () => root.unmount()); root = null;
  expectCleared(); expect(publish).toHaveBeenLastCalledWith(false);
  expect(document.documentElement.dataset.theme).toBe('native-theme');
  expect(document.body.dataset.unrelatedScope).toBe('existing-module');
  delete document.documentElement.dataset.theme; delete document.body.dataset.unrelatedScope;
});

test('portal cleanup also works without a shell publisher', async () => {
  await act(async () => root.render(<Origin enabled theme="light"/>));
  expect(document.body.dataset.brawndoCisVisual).toBe('true');
  await act(async () => root.render(<Origin enabled={false}/>));
  expectCleared();
});
