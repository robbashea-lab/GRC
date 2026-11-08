import { recordedBaseline } from '../lib/clientProfile';
import { reviewView, scheduledDate } from '../lib/reviewOccurrences';
import rules from '../lib/managementRules.json';
import { history } from './reviews';
import { evidenceAccess } from './evidence';
const terminal = new Set(rules.terminal);

// Retained completions prove individual events, not a complete monitoring window.
export function portfolioMonitoring(db, client, today = new Date()) {
  if (db.user?.workspace_mode !== 'demo' || !db.user?.user_id || client.client_id !== 'demo_brawndo' || !evidenceAccess(db.user, client.client_id) || client.status !== 'active' || client.archived || client.archived_at) return undefined;
  const at = today.getTime();
  const completedDate = value => {
    const date = scheduledDate(value);
    return date && date.getTime() <= at ? date.toISOString() : null;
  };
  const saved = db.baselines?.[client.client_id];
  const baseline = recordedBaseline(client, saved, db.logs || []);
  const onboarding = baseline ? 'complete' : saved?.completed === false && completedDate(saved.updated_at) ? 'in_progress' : 'unknown';
  const completions = [];
  for (const task of db.tasks || []) {
    if (task.client_id !== client.client_id || task.status !== 'done' || !task.task_id) continue;
    const date = completedDate(task.completed_at);
    if (date) completions.push({
      kind: 'tasks',
      id: task.task_id,
      title: task.title || 'Action Item',
      at: date
    });
  }
  const reviews = (db.reviews || []).filter(review => review.client_id === client.client_id);
  const seen = new Set();
  for (const review of reviews) {
    for (const occurrence of history(db, review)) {
      const date = completedDate(occurrence.completed_at);
      const id = occurrence.occurrence_id;
      if (!date || !id || seen.has(id) || occurrence.client_id && occurrence.client_id !== client.client_id || occurrence.status && occurrence.status !== 'completed') continue;
      seen.add(id);
      completions.push({
        kind: 'reviews',
        id: occurrence.review_id || review.review_id,
        occurrence_id: id,
        title: occurrence.title || review.title || 'Review',
        at: date
      });
    }
  }
  completions.sort((a, b) => b.at.localeCompare(a.at) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const recurring = reviews.filter(review => !review.archived && !review.archived_at && !terminal.has(review.status) && review.recurrence && review.recurrence !== 'none' && scheduledDate(review.due_date) && reviewView(review).status !== 'needs_scheduling').length;
  const latest = completions[0];
  return {
    onboarding,
    latest_completion: latest ? {
      ...latest,
      type: latest.kind === 'tasks' ? 'Action item' : 'Review',
      label: latest.kind === 'tasks' ? 'Action item completed' : 'Review completed'
    } : null,
    recurring_scheduled: recurring,
    completion_history_coverage: 'partial'
  };
}
