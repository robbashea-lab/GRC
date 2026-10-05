import {Link} from 'react-router-dom';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {displayDay} from '@/lib/managementDates';
import {dashboardStatus} from '@/lib/dashboardItemSummary';

const destinations={tasks:'Action Item',findings:'Action Item',reviews:'Review',policies:'Policy',vendors:'Vendor',risks:'Risk',exceptions:'Acceptance',requirements:'Requirement'};
const sources={framework_assessments:'safeguard/control',reviews:'review',policies:'policy',vendors:'vendor',risks:'risk',findings:'finding',assessments:'assessment'};
export default function DashboardItemSummary({selection,onClose,opener}) {
  const item=selection.item;
  return <Dialog open={!!selection} onOpenChange={open=>{if(!open)onClose();}}>
    <DialogContent className="dashboard-item-summary" onCloseAutoFocus={event=>{event.preventDefault();opener?.focus();}} aria-describedby={undefined}>
      <div className="dashboard-summary-badges"><span>{item.type}</span><span>{dashboardStatus(item.status)}</span></div>
      <DialogTitle>{item.title}</DialogTitle>
      {selection.loading?<DialogDescription role="status">Loading item…</DialogDescription>:selection.error?<DialogDescription role="alert">{selection.error}</DialogDescription>:<>
        {item.purpose&&<div className="dashboard-summary-purpose"><h3>{item.kind==='findings'||item.record.finding_id?'Finding':'Purpose'}</h3><p>{item.purpose}</p></div>}
        <dl className="dashboard-summary-meta">
          {item.origin&&<div><dt>Origin</dt><dd>{item.origin}</dd></div>}
          {item.record.created_at&&<div><dt>Created</dt><dd>{displayDay(item.record.created_at)}</dd></div>}
          {item.due_date&&<div><dt>Due / Target</dt><dd>{displayDay(item.due_date)}</dd></div>}
        </dl>
        <div className="dashboard-summary-footer">
          {item.sourceHref&&<Link to={item.sourceHref} onClick={onClose}>View originating {item.sourceKind==='framework_assessments'?(item.sourceHref.includes('cis-ig1')?'safeguard':'control'):sources[item.sourceKind]||'record'} ↗</Link>}
          {item.recordHref&&<Link className="dashboard-summary-primary" to={item.recordHref} onClick={onClose}>Open {destinations[item.kind]||'Record'} ↗</Link>}
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
