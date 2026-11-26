/* Session integration around the unmodified, approved sample workspace. */
(() => {
  'use strict';

  window.addEventListener('error', event => {
    if (!(event.target instanceof HTMLScriptElement) ||
        !event.target.src.endsWith('/approved-v3-native.js')) return;
    const message = 'The saved workspace could not load. Open Existing records or return to sign in and retry.';
    if (window.GoverNaraNativePage?.fail) window.GoverNaraNativePage.fail(message);
    else {
      document.getElementById('native-workspace-loading')?.remove();
      document.body.style.visibility = 'visible';
      document.body.textContent = message;
      const link = document.createElement('a');
      link.href = '/existing';link.textContent = ' Open Existing records';
      document.body.appendChild(link);
    }
  }, true);

  if (document.body.dataset.stagingEntry === 'existing') {
    try {
      sessionStorage.setItem('grc_workspace_mode', 'standard');
      sessionStorage.removeItem('grc_client_id');
    } catch {
      document.body.textContent = 'Allow browser session storage to open your existing workspace.';
      return;
    }
    window.location.replace('/clients');
    return;
  }

  const appearanceRelease = 'governara.staging.exact-appearance.5bb03e12';
  try {
    if (!localStorage.getItem(appearanceRelease)) {
      document.querySelector('[data-gallery-theme="glass07"]')?.click();
      localStorage.setItem(appearanceRelease, '1');
    }
  } catch {
    // The document's theme picker continues to work when storage is unavailable.
  }

  const account = document.getElementById('pop-user');
  if (account) {
    const link = document.createElement('a');
    link.className = 'pop-item';
    link.setAttribute('role', 'menuitem');
    link.href = '/existing';
    link.textContent = 'Existing records';
    account.insertBefore(link, account.querySelector('[data-action="sign-out"]'));
  }

  let signingOut = false;
  window.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-action="sign-out"],[data-action="signout"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (signingOut) return;
    signingOut = true;
    button.disabled = true;
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: '{}',
      });
      if (!response.ok && response.status !== 401) throw new Error('Sign-out failed');
      window.location.replace('/login');
    } catch {
      signingOut = false;
      button.disabled = false;
      window.alert('Sign-out could not be completed. Please try again.');
    }
  }, true);
})();
