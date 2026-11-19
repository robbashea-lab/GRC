import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import ServicesTools from './ServicesTools';
import api from '@/lib/api';
import {applyServicePreset, copy, defaultServices, serviceCatalog} from '@/lib/r4ServicesTools';

jest.mock('@/context/AuthContext', () => ({useAuth: () => ({
  user: {user_id: 'services-fixture-owner', role: 'platform_admin'}, workspaceMode: 'demo'
})}));
jest.mock('@/lib/api', () => ({__esModule: true,
  default: {get: jest.fn(), post: jest.fn()}, formatError: error => error.message
}));

const CLIENT = 'services-owned-fixture', PATH = '/clients/' + CLIENT + '/services';
let host, root, current;
const button = label => [...host.querySelectorAll('button')].find(node => node.textContent === label);
const preset = () => host.querySelector('.toolbar select');
const click = async node => {expect(node).toBeTruthy(); await act(async () => node.click());};
const select = async (node, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event('change', {bubbles: true}));
});
const render = async onSaved => act(async () => root.render(<ServicesTools clientId={CLIENT} canEdit onSaved={onSaved}/>));
function expectBusinessInputsLocked(locked) {
  expect(preset().disabled).toBe(locked);
  const responsibility = [...host.querySelectorAll('select[aria-label^="Who runs "]')];
  const pickers = [...host.querySelectorAll('button')].filter(node => node.textContent === 'Choose tools');
  expect(responsibility).toHaveLength(serviceCatalog.areas.length);
  expect(pickers).toHaveLength(serviceCatalog.areas.length);
  for (const node of [...responsibility, ...pickers]) expect(node.disabled).toBe(locked);
}
beforeAll(() => Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto}));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();api.get.mockReset();api.post.mockReset();
  current = {client_id: CLIENT, updated_at: 'original-client-version', services: defaultServices(), catalog: serviceCatalog.tools};
  api.get.mockImplementation(async path => {
    expect(path).toBe(PATH);return {data: copy(current)};
  });
  host = document.createElement('div');document.body.appendChild(host);root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount());host.remove();sessionStorage.clear();});

test('real retained Services save locks all business edit paths while busy or uncertain and recovers exact A', async () => {
  let failA;
  api.post.mockImplementationOnce(() => new Promise((resolve, reject) => {failA = reject;}));
  const onSaved = jest.fn(), draftA = applyServicePreset(defaultServices(), 'full');
  await render(onSaved);await click(button('Edit services & tools'));
  expectBusinessInputsLocked(false);
  await select(preset(), 'full');await click(button('Save services & tools'));
  expect(api.post).toHaveBeenCalledTimes(1);
  const requestA = copy(api.post.mock.calls[0]);
  expect(requestA[0]).toBe(PATH);
  expect(requestA[1]).toEqual({expected_updated_at: 'original-client-version', areas: draftA.areas, custom_tools: [], preset: 'full'});
  expectBusinessInputsLocked(true);
  expect(button('Saving…').disabled).toBe(true);expect(button('Cancel').disabled).toBe(true);
  expect(preset().value).toBe('full');

  await act(async () => failA(new Error('Synthetic unconfirmed response A')));
  expect(host.querySelector('[role="alert"]').textContent).toContain('Synthetic unconfirmed response A');
  expectBusinessInputsLocked(true);
  expect(button('Retry unconfirmed save').disabled).toBe(false);expect(button('Cancel').disabled).toBe(true);
  expect(preset().value).toBe('full');expect(onSaved).not.toHaveBeenCalled();

  current = {...current, updated_at: 'confirmed-version-A', services: draftA};
  api.post.mockResolvedValueOnce({data: copy(current)});
  await click(button('Retry unconfirmed save'));
  expect(api.post).toHaveBeenCalledTimes(2);expect(api.post.mock.calls[1]).toEqual(requestA);
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(button('Edit services & tools').disabled).toBe(false);
  await click(button('Edit services & tools'));expectBusinessInputsLocked(false);
  expect(preset().value).toBe('full');
  await select(preset(), 'comanaged');expect(preset().value).toBe('comanaged');
  await click(button('Cancel'));
  expect(button('Edit services & tools')).toBeTruthy();expect(api.post).toHaveBeenCalledTimes(2);
  expect(current.services).toEqual(draftA);
});

test('a remounted editor explicitly retries original A even when the loaded saved revision has advanced', async () => {
  const draftA = applyServicePreset(defaultServices(), 'security'), onSaved = jest.fn();
  api.post.mockRejectedValueOnce(new Error('Synthetic response A lost'));
  await render(onSaved);await click(button('Edit services & tools'));
  await select(preset(), 'security');await click(button('Save services & tools'));
  const requestA = copy(api.post.mock.calls[0]);
  await act(async () => root.render(null));
  // The first save may have committed despite the lost response. The retained
  // command must use its original revision, rather than reconstructing a new save.
  current = {...current, updated_at: 'confirmed-version-A', services: draftA};
  await render(onSaved);await click(button('Edit services & tools'));
  expectBusinessInputsLocked(true);expect(preset().value).toBe('security');
  api.post.mockResolvedValueOnce({data: copy(current)});
  await click(button('Retry unconfirmed save'));
  expect(api.post).toHaveBeenCalledTimes(2);expect(api.post.mock.calls[1]).toEqual(requestA);
  expect(api.post.mock.calls[1][1].expected_updated_at).toBe('original-client-version');
  expect(onSaved).toHaveBeenCalledTimes(1);
  await click(button('Edit services & tools'));expectBusinessInputsLocked(false);
  await click(button('Cancel'));expect(api.post).toHaveBeenCalledTimes(2);
});
