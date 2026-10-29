// Fictional fixtures share one UTC calendar-day anchor, persisted at initialization.
export {CIS_SHOWCASE_VERSION} from '../lib/demoClients';

export function cisDemoFixtureDates(clock = new Date()) {
  const anchor = new Date(clock);
  if (!Number.isFinite(+anchor)) throw new Error('Invalid CIS Demo initialization date.');
  anchor.setUTCHours(0, 0, 0, 0);
  const instant = days => {
    const date = new Date(anchor);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  };
  const month = months => {
    const date = new Date(anchor), day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
    return date.toISOString().slice(0, 10);
  };
  return {anchor: anchor.toISOString(), day: days => instant(days).slice(0, 10), instant, month};
}
