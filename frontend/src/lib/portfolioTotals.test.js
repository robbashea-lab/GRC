import { portfolioTotals } from '@/lib/portfolioOverview';
import { isReferencePortfolio } from '@/lib/reference';

test('portfolio totals sum each metric and name the client holding the most', () => {
  const t = portfolioTotals([{ name: 'A', past_due: 4, unassigned: 0 }, { name: 'B', past_due: 7, unassigned: null }, { name: 'C' }]);
  expect(t.past_due).toEqual({ total: 11, clients: 2, top: 'B' });
  expect(t.unassigned).toEqual({ total: 0, clients: 0, top: null });
  expect(portfolioTotals([]).due_30d).toEqual({ total: 0, clients: 0, top: null });
});

test('shared portfolio styling covers Demo and authenticated workspaces', () => {
  expect(isReferencePortfolio({ workspace_mode: 'demo' })).toBe(true);
  expect(isReferencePortfolio({ workspace_mode: 'standard' })).toBe(true);
  expect(isReferencePortfolio(null)).toBe(false);
});
