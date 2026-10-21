import ClientIdentityMark from './ClientIdentityMark';
import { clientAttention } from '@/lib/enhancedPortfolio';
import { calendarDay, managementDay } from '@/lib/managementDates';
import { dashboardRecordHref } from '@/lib/dashboardItemSummary';
import { formatPortfolioDate } from './PortfolioReports';
export const signedPoints = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`;
export function ClientMark({
  client
}) {
  return <span className="ep-avatar" aria-hidden="true"><ClientIdentityMark client={client}/></span>;
}
export function Attention({
  client,
  asOf
}) {
  const value = clientAttention(client, asOf);
  return <div className="ep-attention"><strong className={`ep-${value.tone}`}><i />{value.label}</strong><small>{value.reason}</small></div>;
}
export function WorkFacts({client}) {
  const facts = client.monitoring;
  if (!facts) return null;
  const completion = facts.latest_completion;
  const hasSchedule = Number.isInteger(facts.recurring_scheduled) && facts.recurring_scheduled >= 0;
  if (!completion && !hasSchedule) return null;
  return <div className="ep-notice" aria-label="Recorded work facts">
    {completion && <p>Latest retained completion · {formatPortfolioDate(completion.at)} · {completion.label || completion.title}</p>}
    {hasSchedule && <p>Scheduled recurring reviews · {facts.recurring_scheduled}</p>}
    {completion && facts.completion_history_coverage === 'partial' && <small>Retained completion history is partial.</small>}
  </div>;
}
export function WorkList({
  client,
  items,
  title,
  asOf,
  onNavigate
}) {
  return <section className="ep-work"><h3>{title} <span>{items.length}</span></h3>{items.length ? items.map(item => {
      const kind = {
        task: 'tasks',
        review: 'reviews',
        vendor: 'vendors',
        policy: 'policies',
        risk: 'risks',
        exception: 'exceptions',
        requirement: 'requirements',
        finding: 'findings'
      }[item.entity_type];
      const record = {
        client_id: client.client_id,
        [`${item.entity_type === 'task' ? 'task' : item.entity_type}_id`]: item.entity_id
      };
      const href = kind && dashboardRecordHref(kind, record, {
        occurrence: item.occurrence_id
      });
      const days = calendarDay(item.due_date) - managementDay(asOf);
      return <button key={item.key} type="button" className="ep-work-item" disabled={!href} onClick={() => onNavigate(href)}><span className="ep-chip">{item.type || (kind === 'tasks' ? 'Action item' : item.entity_type)}</span><span>{item.title}<small>{item.owner_name || 'Unassigned'}</small></span><time className={days < 0 ? 'ep-red' : ''}>{days < 0 ? `${-days} days overdue` : `${formatPortfolioDate(item.due_date, {
            year: undefined
          })} · ${days === 0 ? 'today' : `in ${days} days`}`}</time><span aria-hidden="true">↗</span></button>;
    }) : <p>Nothing {title === 'Overdue' ? 'overdue' : 'due'}.</p>}</section>;
}
