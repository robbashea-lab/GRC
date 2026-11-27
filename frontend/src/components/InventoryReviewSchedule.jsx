import {Button} from './ui/button';
import {useAssessmentClientContext} from './AssessmentClientContext';

const cadenceLabels = {monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Every six months', annual: 'Annually'};

export default function InventoryReviewSchedule({question, answer, onConfirm}) {
  const context = useAssessmentClientContext();
  const data = context?.services?.data;
  if (!data || context.record?.client_id !== data.client_id || context.record.framework_key !== 'cis-ig1'
    || context.record.definition_id !== '1.1') return null;
  const matches = data.candidates.filter(activity => activity.state === 'done' && activity.review_id && activity.first_next_due
    && !activity.exclusion && Array.isArray(activity.drivers) && activity.drivers.some(driver =>
      driver?.framework_key === 'cis-ig1' && driver.framework_plan_key === 'asset-inventory'
      && driver.framework_driver_active !== false && Array.isArray(driver.framework_safeguards) && driver.framework_safeguards.includes('1.1')));
  if (matches.length !== 1) return null;
  const activity = matches[0];
  const frequency = cadenceLabels[activity.cadence];
  const schedule = frequency || (activity.cadence === 'custom' && activity.custom_days ? `Every ${activity.custom_days} days` : '');
  return <div className="omni-help">
    <p>Scheduled review · {activity.first_next_due}{schedule && ' · ' + schedule}
      {activity.setup?.recurring_ticket_number && !activity.setup.no_ticket && ' · Ticket #' + activity.setup.recurring_ticket_number}</p>
    {question.id === 'frequency' && !answer && frequency && question.choices.includes(frequency) &&
      <Button type="button" variant="outline" onClick={() => onConfirm(question, frequency)}>Confirm {frequency.toLowerCase()} is in use</Button>}
  </div>;
}
