import {cisClient, cisContext} from '../testUtils/cisExperience';
import {brawndoOnboardingGate, onboardingReviewRows, onboardingReviewForecast} from './brawndoOnboarding';
import catalog from '@catalogs/onboardingCatalog.json';

const context = {...cisContext(),workspaceMode: 'demo', user: {user_id: 'actor', role: 'super_admin', workspace_mode: 'demo'},
  currentClientId: 'demo_brawndo', currentClient:cisClient(),
  clients: [{client_id: 'demo_brawndo'}], selectedClientId: 'demo_brawndo', loadedClientId: 'demo_brawndo',
  profileClientId: 'demo_brawndo', handoffClientId: 'demo_brawndo', pathname: '/client-profile'};
const now = new Date(2028, 0, 1, 12);
const proposal = (review, extra = {}) => ({key: 'proposal', title: 'Native proposal', kind: 'program', source: 'Program', existing: false, review, ...extra});

test('presentation requires exact authorized active Explore demo and matching native loaded identities', () => {
  expect(brawndoOnboardingGate(context)).toBe(true);
  for (const patch of [{workspaceMode: 'standard'}, {user: null}, {user: {...context.user, workspace_mode: 'standard'}},
    {user: {...context.user, user_id: ''}}, {user: {...context.user, role: 'unknown'}}, {authLoading: true}, {authError: 'denied'},
    {orgLoading: true}, {orgError: 'denied'}, {hasError: true}, {currentClientId: 'other'}, {currentClient: null}, {clients: []},
    {currentClient: {...context.currentClient, status: 'archived'}}, {currentClient: {...context.currentClient, archived: true}},
    {currentClient: {...context.currentClient, archived_at: '2026-10-01'}},
    {currentClient: {...context.currentClient, client_id: 'lookalike', name: 'Brawndo'}},
    {selectedClientId: null}, {loadedClientId: null}, {profileClientId: 'other'}, {handoffClientId: 'other'},
    {routeClientId: 'other'}, {pathname: '/onboarding'}, {pathname: '/client-profile/'}]) {
    expect(brawndoOnboardingGate({...context, ...patch})).toBe(false);
  }
});

test('enabled shared programs reuse one activity and suppress the equivalent general Review', () => {
  const state = {requirements: {'cis-ig1': 'applies', 'iso-27001': 'applies', 'soc-2': 'applies'},
    reviews: ['user-access'], framework_reviews: {}};
  const rows = onboardingReviewRows(catalog, state, {reviews: []});
  expect(rows.filter(row => row.plan?.baseline_key === 'user-access')).toHaveLength(1);
  expect(rows.some(row => row.kind === 'general')).toBe(false);
  const access = rows.find(row => row.plan?.baseline_key === 'user-access');
  expect(access.plan.drivers).toHaveLength(3);
  for (const driver of access.plan.drivers) state.framework_reviews[driver.key] = {enabled: false};
  const disabled = onboardingReviewRows(catalog, state, {reviews: []});
  expect(disabled.some(row => row.plan?.baseline_key === 'user-access')).toBe(false);
  expect(disabled.find(row => row.kind === 'general')).toMatchObject({existing: false, review: {due_date: null, recurrence: null}});
});

test('retained minimal records never infer native anchors, while unconfigured general Reviews remain undated', () => {
  const rows = onboardingReviewRows(catalog, {requirements: {}, reviews: ['user-access', 'risk-assessment']}, {reviews: [
    {review_id: 'retained', baseline_key: 'user-access', title: 'Operator title', due_date: '2028-01-30', recurrence: 'monthly', status: 'upcoming'},
  ]});
  expect(rows.find(row => row.key === 'retained')).toMatchObject({existing: true, title: 'Operator title'});
  expect(onboardingReviewForecast(rows, now)).toMatchObject({unavailable: 1, unscheduled: 1, total: 0});
});

test('new dated proposals preserve month end through leap February using the native scheduler', () => {
  const row = proposal({due_date: '2028-01-31', recurrence: 'monthly'}), before = JSON.stringify(row);
  const forecast = onboardingReviewForecast([row], now);
  expect(forecast).toMatchObject({unavailable: 0, unscheduled: 0, total: 12});
  expect(forecast.months.map(month => month.program)).toEqual(Array(12).fill(1));
  expect(JSON.stringify(row)).toBe(before);
});

test('custom cadence uses whole days, including daily and 3650-day bounds', () => {
  const daily = onboardingReviewForecast([proposal({due_date: '2028-01-01', recurrence: 'custom', custom_recurrence_days: 1})], now);
  expect(daily.total).toBe(366);
  expect(daily.months[1].total).toBe(29);
  expect(onboardingReviewForecast([proposal({due_date: '2028-01-01', recurrence: 'custom', custom_recurrence_days: 3650})], now).total).toBe(1);
  for (const days of [0, 1.5, 3651, '30']) {
    expect(onboardingReviewForecast([proposal({due_date: '2028-01-01', recurrence: 'custom', custom_recurrence_days: days})], now)).toMatchObject({total: 0, unavailable: 1});
  }
});

test('past dates in the current month are not counted as upcoming work', () => {
  const forecast=onboardingReviewForecast([proposal({due_date:'2028-01-01',recurrence:'custom',custom_recurrence_days:1})],new Date(2028,0,15,12));
  expect(forecast.months[0].total).toBe(17);
  expect(forecast.total).toBe(352);
});

test('terminal records are ignored; unknown dates, conflicts and exhausted work never produce partial projections', () => {
  const rows = [proposal({status: 'completed', due_date: '2028-01-01', recurrence: 'annual'}),
    proposal({status: 'cancelled'}, {existing: true}),
    proposal({due_date: '', recurrence: 'annual'}), proposal({due_date: '2028-02-30', recurrence: 'monthly'}),
    proposal({due_date: '2028-01-01', recurrence: 'annual'}, {conflict: true}),
    proposal({due_date: '1900-01-01', recurrence: 'monthly'})];
  const before = JSON.stringify(rows), forecast = onboardingReviewForecast(rows, now);
  expect(forecast).toMatchObject({ignored: 2, unscheduled: 1, unavailable: 3, total: 0});
  expect(JSON.stringify(rows)).toBe(before);
});
