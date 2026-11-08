import { portfolioMonitoring } from './portfolioMonitoring';
const client = {
  client_id: 'demo_brawndo',
  status: 'active'
};
const today = new Date('2026-10-20T12:00:00Z');
const database = () => ({
  user: {
    user_id: 'demo_admin',
    workspace_mode: 'demo',
    role: 'super_admin'
  },
  baselines: {},
  logs: [],
  tasks: [],
  reviews: []
});
const review = changes => ({
  review_id: 'review1',
  client_id: client.client_id,
  title: 'Review',
  status: 'upcoming',
  recurrence: 'monthly',
  due_date: '2026-10-25',
  ...changes
});
test('projects genuine completions and valid active schedules without changing records', () => {
  const db = database();
  db.baselines[client.client_id] = {
    completed: true
  };
  db.tasks = [{
    task_id: 'task1',
    client_id: client.client_id,
    status: 'done',
    completed_at: '2026-10-19T10:00:00Z'
  }, {
    task_id: 'foreign',
    client_id: 'other',
    status: 'done',
    completed_at: '2026-10-20T10:00:00Z'
  }, {
    task_id: 'future',
    client_id: client.client_id,
    status: 'done',
    completed_at: '2026-10-21'
  }, {
    task_id: 'invalid',
    client_id: client.client_id,
    status: 'done',
    completed_at: '2026-02-30'
  }, {
    task_id: 'reopened',
    client_id: client.client_id,
    status: 'in_progress',
    completed_at: '2026-10-20'
  }];
  const occurrence = {
    occurrence_id: 'occ1',
    status: 'completed',
    completed_at: '2026-10-20T09:00:00Z'
  };
  db.reviews = [review({
    occurrences: [occurrence, occurrence]
  }), review({
    review_id: 'invalid',
    due_date: '2026-02-30'
  }), review({
    review_id: 'invalid-cadence',
    recurrence: 'custom',
    custom_recurrence_days: 0
  }), review({
    review_id: 'closed',
    status: 'completed'
  }), review({
    review_id: 'archived',
    archived: true
  }), review({
    review_id: 'foreign',
    client_id: 'other'
  })];
  const before = JSON.stringify(db);
  expect(portfolioMonitoring(db, client, today)).toEqual({
    onboarding: 'complete',
    latest_completion: {
      kind: 'reviews',
      id: 'review1',
      occurrence_id: 'occ1',
      title: 'Review',
      at: '2026-10-20T09:00:00.000Z',
      type: 'Review',
      label: 'Review completed'
    },
    recurring_scheduled: 1,
    completion_history_coverage: 'partial'
  });
  expect(JSON.stringify(db)).toBe(before);
});
test('distinguishes a saved onboarding draft from absent evidence and never invents a quiet rule', () => {
  const db = database();
  expect(portfolioMonitoring(db, client, today)).toMatchObject({
    onboarding: 'unknown',
    latest_completion: null
  });
  db.baselines[client.client_id] = {
    completed: false,
    updated_at: '2026-10-19T12:00:00Z'
  };
  const result = portfolioMonitoring(db, client, today);
  expect(result.onboarding).toBe('in_progress');
  expect(result).not.toHaveProperty('quiet');
  expect(result).not.toHaveProperty('expectedActivityDays');
});
test('fails closed outside authorized active canonical Explore client', () => {
  const db = database();
  expect(portfolioMonitoring(db, {
    ...client,
    client_id: 'other'
  }, today)).toBeUndefined();
  expect(portfolioMonitoring(db, {
    ...client,
    archived: true
  }, today)).toBeUndefined();
  expect(portfolioMonitoring(db, {
    ...client,
    status: 'onboarding'
  }, today)).toBeUndefined();
  expect(portfolioMonitoring(db, {
    ...client,
    status: undefined
  }, today)).toBeUndefined();
  db.user.workspace_mode = 'signed_in';
  expect(portfolioMonitoring(db, client, today)).toBeUndefined();
  db.user = {
    workspace_mode: 'demo',
    role: 'super_admin'
  };
  expect(portfolioMonitoring(db, client, today)).toBeUndefined();
  db.user = {
    user_id: 'demo_user',
    workspace_mode: 'demo',
    role: 'platform_admin',
    client_ids: ['other']
  };
  expect(portfolioMonitoring(db, client, today)).toBeUndefined();
});
