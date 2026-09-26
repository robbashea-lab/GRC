import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ContactCoverage from './ContactCoverage';

let root, host;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = rows => act(async () => root.render(<ContactCoverage rows={rows} />));

test('compact coverage strip keeps who owns what and calls out the gaps', async () => {
  await render([
    { name: 'Ana Ruiz', role: 'Executive Sponsor' },
    { name: 'Ben Ode', grc_roles: ['IT Lead', 'HR Contact'] },
    { name: 'Cy Former', role: 'Information Security Lead', status: 'inactive' },
  ]);
  const strip = host.querySelector('[data-testid="contact-coverage"]');
  expect(strip.querySelector('h2').textContent).toBe('Responsibility coverage · 5 of 8 key roles not designated');
  const items = [...strip.querySelectorAll('li')];
  expect(items).toHaveLength(8);
  const who = role => items.find(li => li.querySelector('.sr-only').textContent === role).querySelector('.contact-coverage-who').textContent;
  expect(who('Executive Sponsor')).toBe('Ana Ruiz');
  expect(who('IT Lead')).toBe('Ben Ode');
  expect(who('HR Contact')).toBe('Ben Ode');
  // An inactive contact does not cover a role.
  expect(who('Information Security Lead')).toBe('Not designated');
  expect(strip.querySelectorAll('li.is-missing')).toHaveLength(5);
  // Short visible labels, full role names for screen readers.
  expect(items.map(li => li.querySelector('.sr-only').textContent)).toContain('Business Continuity / Disaster Recovery Lead');
  expect(strip.textContent).toContain('Designation does not grant platform access');
});

test('full coverage reads as a plain fact, not a reassurance', async () => {
  const roles = ['Executive Sponsor', 'Information Security Lead', 'IT Lead', 'Incident Response Lead', 'Business Continuity / Disaster Recovery Lead', 'Vendor / Third-Party Contact', 'HR Contact', 'Legal / Privacy Contact'];
  await render([{ name: 'One Person', grc_roles: roles }]);
  expect(host.querySelector('h2').textContent).toBe('Responsibility coverage · all key roles designated');
  expect(host.querySelectorAll('li.is-missing')).toHaveLength(0);
  expect(host.textContent).not.toMatch(/healthy|all good/i);
});
