import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StatusBadge, { SeverityBadge, toneFor } from './StatusBadge';

let root, host;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = element => act(async () => root.render(element));

test('color is scarce: red for overdue and critical, amber for attention, green for done, gray for normal states', () => {
  expect(['overdue', 'critical', 'immediate'].map(toneFor)).toEqual(['critical', 'critical', 'critical']);
  expect(toneFor('high')).toBe('high');
  expect(['remediated', 'blocked', 'expired', 'reported_missing'].map(toneFor)).toEqual(['moderate', 'moderate', 'moderate', 'moderate']);
  expect(toneFor('needs_scheduling')).toBe('duesoon');
  expect(['in_progress', 'under_review', 'requested'].map(toneFor)).toEqual(['info', 'info', 'info']);
  expect(['completed', 'approved', 'verified'].map(toneFor)).toEqual(['success', 'success', 'success']);
  // Normal and inactive states stay quiet: an open item or an active vendor is not an alarm or a success.
  expect(['open', 'active', 'upcoming', 'medium', 'low', 'not_applicable', 'inactive', 'draft'].map(toneFor)).toEqual(Array(8).fill('neutral'));
  expect(toneFor('something_new')).toBe('neutral');
});

test('status badge: text always carries the meaning; the tone is a class', async () => {
  await render(<div><StatusBadge value="in_progress" /><StatusBadge value="remediated" /><StatusBadge value="overdue" label="3 days overdue" /><StatusBadge value="" /></div>);
  const pills = [...host.querySelectorAll('.pill')];
  expect(pills.map(p => p.textContent)).toEqual(['in progress', 'Pending validation', '3 days overdue']);
  expect(pills.map(p => p.dataset.status)).toEqual(['in_progress', 'remediated', 'overdue']);
  expect(pills[0].className).toContain('pill-info');
  expect(pills[2].className).toContain('pill-critical');
});

test('severity badge: one scale for severity, priority and criticality; missing reads Not assessed', async () => {
  await render(<div>
    <SeverityBadge value="Immediate" />
    <SeverityBadge value="critical" />
    <SeverityBadge value="high" />
    <SeverityBadge value="medium" label="Moderate" />
    <SeverityBadge value="low" />
    <SeverityBadge value={null} />
  </div>);
  const pills = [...host.querySelectorAll('.pill')];
  expect(pills.map(p => p.textContent)).toEqual(['Immediate', 'Critical', 'High', 'Moderate', 'Low']);
  expect(pills.map(p => p.dataset.testid)).toEqual(['severity-immediate', 'severity-critical', 'severity-high', 'severity-medium', 'severity-low']);
  expect(pills[0].className).toContain('pill-critical');
  expect(pills[1].className).toContain('pill-critical');
  expect(pills[2].className).toContain('pill-high');
  expect(pills[3].className).toContain('pill-neutral');
  expect(host.querySelector('.register-empty').textContent).toBe('Not assessed');
});
