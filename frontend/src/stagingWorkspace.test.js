const loadBridge = () => jest.isolateModules(() => require('../public/staging-workspace.js'));

const originalFetch = global.fetch;
const nextEventLoopTurn = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => { jest.spyOn(window, 'addEventListener'); });

afterEach(() => {
  window.addEventListener.mock.calls.forEach(args => window.removeEventListener(...args));
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  document.body.replaceChildren();
  delete document.body.dataset.stagingEntry;
  sessionStorage.clear();
  localStorage.clear();
});

test('opens native records in standard mode while preserving other preferences', () => {
  const replace = jest.fn();
  jest.spyOn(window, 'location', 'get').mockReturnValue({...window.location, replace});
  document.body.dataset.stagingEntry = 'existing';
  sessionStorage.setItem('grc_workspace_mode', 'demo');
  sessionStorage.setItem('grc_client_id', 'sample-client');
  sessionStorage.setItem('appearance', 'glass07');

  loadBridge();

  expect(sessionStorage.getItem('grc_workspace_mode')).toBe('standard');
  expect(sessionStorage.getItem('grc_client_id')).toBeNull();
  expect(sessionStorage.getItem('appearance')).toBe('glass07');
  expect(replace).toHaveBeenCalledWith('/clients');
});

test('sign-out waits for the server and allows retry after a failed request', async () => {
  document.body.innerHTML = '<div id="pop-user"><button data-action="sign-out"><span>Sign out</span></button></div>';
  const button = document.querySelector('button');
  const mockSignOut = jest.fn();
  button.addEventListener('click', mockSignOut);
  const replace = jest.fn();
  jest.spyOn(window, 'location', 'get').mockReturnValue({...window.location, replace});
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  let finishRequest;
  global.fetch = jest.fn()
    .mockImplementationOnce(() => new Promise(resolve => { finishRequest = resolve; }))
    .mockResolvedValueOnce({ok: true, status: 200});

  loadBridge();
  expect(document.querySelector('#pop-user [role="menuitem"]').getAttribute('href')).toBe('/existing');
  button.firstElementChild.click();
  button.firstElementChild.click();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
    method: 'POST', credentials: 'same-origin',
  }));
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(button.disabled).toBe(true);
  expect(replace).not.toHaveBeenCalled();

  finishRequest({ok: false, status: 503});
  await nextEventLoopTurn();
  expect(button.disabled).toBe(false);
  expect(window.alert).toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();

  button.click();
  await nextEventLoopTurn();
  expect(replace).toHaveBeenCalledWith('/login');
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('activates Glass once and keeps a later theme choice on the next visit', () => {
  document.body.innerHTML = '<button data-gallery-theme="glass07">Glass ’07</button><button data-gallery-theme="teal">Nordic Teal</button>';
  const [glass, teal] = document.querySelectorAll('button');
  let selectedTheme = 'teal';
  for (const button of [glass, teal]) {
    button.addEventListener('click', () => { selectedTheme = button.dataset.galleryTheme; });
  }

  loadBridge();
  expect(selectedTheme).toBe('glass07');
  teal.click();
  loadBridge();
  expect(selectedTheme).toBe('teal');
});
