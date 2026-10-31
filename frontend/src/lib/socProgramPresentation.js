import {freshness} from './cisVerification';
import {matchesAssessment} from './frameworkWorkspace';
import {calendarDay} from './managementDates';

// Program presentation only; native editors, Dashboard labels and stored conclusions are unchanged.
export const SOC_PROGRAM_STATUS_LABELS = Object.freeze({
  addressed: 'Implemented',
  in_progress: 'Partially implemented',
  needs_attention: 'Implementation not established',
  not_assessed: 'Not assessed',
  not_applicable: 'Not applicable',
});

// Native judgment clocks are server timestamps; local times and date-only values cannot establish their instant.
const RECORDED_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function judgmentTimestamp(row, today) {
  const value = row?.assessment_recorded_at;
  if (typeof value !== 'string' || !RECORDED_TIMESTAMP.test(value) || calendarDay(value) === null) return null;
  const timestamp = Date.parse(value), now = today instanceof Date ? today.getTime() : NaN;
  return Number.isFinite(timestamp) && Number.isFinite(now) && timestamp <= now ? timestamp : null;
}

export function socProgramFreshness(row, today = new Date()) {
  if (row?.status === 'not_assessed') return {state: 'never', days: null, label: 'Not assessed'};
  const timestamp = judgmentTimestamp(row, today);
  if (timestamp === null) {
    const legacy = !row?.assessment_recorded_at && typeof row?.last_assessed === 'string' && !!row.last_assessed.trim();
    return {state: 'unknown', days: null, label: legacy ? 'Legacy date unconfirmed' : 'Assessment date unavailable'};
  }
  // SOC last_assessed is also a write token. Project its judgment date only inside the shared age calculation.
  return freshness({...row, last_assessed: new Date(timestamp).toISOString()}, today);
}

export function socProgramAsOf(rows = [], today = new Date()) {
  let latest = null;
  for (const row of rows) {
    const timestamp = judgmentTimestamp(row, today);
    if (timestamp !== null && (latest === null || timestamp > latest)) latest = timestamp;
  }
  return latest === null ? null : new Date(latest).toISOString();
}

export function socProgramMatches(row, filter, search = '', today = new Date()) {
  if (filter === 'stale') return socProgramFreshness(row, today).state === 'stale' && matchesAssessment(row, 'all', search);
  return matchesAssessment(row, filter, search);
}
