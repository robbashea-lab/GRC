import {reviewDrivers} from '@/lib/frameworks';
import guide from '@catalogs/operatorGuidance/isoRequirementGuide.json';

export function isIsoManagementReview(record,related={}){
  if(!record)return false;
  return reviewDrivers(record).some(d=>d.framework_key==='iso-27001'&&d.framework_plan_key==='iso-management-review'&&d.framework_driver_active!==false)||
    record.review_type==='management'&&(related.framework_assessments||[]).some(a=>a.client_id===record.client_id&&a.framework_key==='iso-27001'&&['9.3.1','9.3.2','9.3.3'].includes(a.definition_id));
}

export default function IsoManagementReviewGuide({record,related,historical=false}){
  if(!isIsoManagementReview(record,related))return null;
  return <section aria-label="ISO management-review agenda" className="border border-line rounded p-3 space-y-2 text-sm" data-testid="iso-management-review-guide">
    <h3 className="font-medium">ISO management-review agenda and outputs</h3>
    <p className="text-xs text-ink-secondary">Current Omnisciente-authored guidance for 9.3.1–9.3.3, not official ISO text or fully validated normative wording. {historical?'This guide does not replace the retained historical conclusions.':'Completion records an activity, not conformity or effectiveness.'}</p>
    <ul className="list-disc pl-5 space-y-1">{['9.3.1','9.3.2','9.3.3'].map(ref=><li key={ref}><strong>{ref}: </strong>{guide.entries[ref].plain}</li>)}</ul>
    <p>Evaluate prior actions, context and interested-party changes, performance and objective results, audit/Findings, risk/treatment results and improvement opportunities. Identify leadership participants and the records considered.</p>
    <p>Use <strong>Notes</strong> for the agenda, participants and controlled minutes reference. Use <strong>Review evaluation</strong> for scope/period examined and a substantive conclusion, including improvement, ISMS-change and resource decisions. Link resulting <strong>Action Items</strong> through Related; retain supporting records in Evidence or their controlled external source. No separate file or new mandatory field is required.</p>
    <p className="text-xs text-ink-secondary">Keep the existing owner, due date and cadence source. No exact annual interval is asserted here; completed occurrence results and recurrence remain authoritative.</p>
  </section>;
}
