import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import ClientDirectory from './ClientDirectory';
import api from '@/lib/api';
jest.mock('react-router-dom', () => ({useNavigate: () => jest.fn()}), {virtual: true});
jest.mock('@/context/OrgContext', () => ({useOrg: () => ({switchClient: jest.fn()})}));
const mockUser = {user_id: 'u', role: 'super_admin'};
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: mockUser})}));
jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn()}, formatError: error => error.message}));

test('native counts distinguish an assessed zero, not-started lifecycle, no applicable scope, invalid source and independent verification', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true; sessionStorage.clear(); window.scrollTo = jest.fn();
  const counts = values => ['addressed', 'in_progress', 'needs_attention', 'not_assessed'].map((key, index) => ({key, label: key, count: values[index]}));
  const current = (values, extra = {}) => ({availability: 'available', implemented: values[0], denominator: values.reduce((sum, value) => sum + value, 0), counts: counts(values), ...extra});
  const programs = [
    ['assessed-zero', current([0, 2, 3, 5])], ['new', current([0, 0, 0, 10], {not_started: true})],
    ['reset', current([0, 0, 0, 10])], ['empty-scope', current([0, 0, 0, 0])],
    ['invalid', current([0, 0, 0, 10], {denominator: 12, reason: 'Native counts do not reconcile'})],
    ['missing-native-source', current([0, 0, 0, 0], {availability: 'partial', assessed: 0, reason: 'Expected native records are missing'})],
    ['unverified-implemented', current([10, 0, 0, 0], {verification: 'not_verified'})],
  ].map(([program_key, value]) => ({client_id: 'isolated', program_key, program_label: program_key, framework_key: 'cis-ig1', current: value, snapshots_90d: [], comparison_90d: {}}));
  api.get.mockResolvedValue({data: {as_of: '2026-10-13T12:00:00Z', clients: [{client_id: 'isolated', name: 'Isolated', status: 'active'}], programs}});
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<ClientDirectory />));
    const row = key => container.querySelector(`[data-program-id='${JSON.stringify(['isolated', key])}']`);
    expect(row('assessed-zero').textContent).toContain('0.0%'); expect(row('assessed-zero').textContent).toContain('Assessed 5 of 10');
    expect(row('new').textContent).toContain('Not started'); expect(row('reset').textContent).not.toContain('Not started');
    expect(row('reset').textContent).toContain('0.0%'); expect(row('empty-scope').textContent).toContain('No applicable scope');
    expect(row('invalid').textContent).toContain('Unavailable'); expect(row('invalid').textContent).not.toContain('0.0%');
    expect(row('missing-native-source').textContent).toContain('Scope unavailable');
    expect(row('missing-native-source').textContent).toContain('Assessed count unavailable');
    expect(row('missing-native-source').textContent).not.toContain('0 safeguards');
    expect(row('missing-native-source').textContent).not.toContain('Assessed 0 of 0');
    expect(row('missing-native-source').querySelector('.gp-progress').getAttribute('aria-label')).not.toContain('0 of 0 assessed');
    expect(row('unverified-implemented').textContent).toContain('100.0%');
    expect(container.querySelectorAll('.gp-progress')).toHaveLength(7); expect(container.querySelector('[data-testid="drill-dialog"]')).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
