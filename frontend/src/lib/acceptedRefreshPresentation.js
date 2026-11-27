// Display-only acknowledgement of accepted data; never a business date or server snapshot.
export function formatAcceptedRefresh(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return '';
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return '';
  return `${new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(instant)} ET`;
}
