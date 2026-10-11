import {calendarDay,managementDay,displayDay} from '@/lib/managementDates';
import {Button} from './ui/button';

export default function IsoAuditGuide({record,review=record,item,deadline=review?.due_date,today=new Date(),onOpen,disabled=false,historical=false}){
  const due=calendarDay(deadline),day=managementDay(today);
  const completed=historical||!!review?.completed_at||review?.status==='completed';
  const cancelled=review?.status==='cancelled';
  const programmeOnly=!review&&deadline===undefined;
  const schedule=programmeOnly?'Programme preparation — no activity selected':cancelled?'Cancelled':completed?'Recorded deadline':due===null?'Needs scheduling':day===null?'Scheduled':due<day?'Overdue':due===day?'Due today':'Upcoming';
  return <section aria-label="ISO internal-audit preparation guide" className="border border-line rounded p-3 space-y-2 text-sm" data-testid="iso-audit-guide">
    <h3 className="font-medium">{item?`${item.reference||item.definition_id} — ${item.title}`:'Prepare the internal-audit programme · 9.2.2'}</h3>
    <p>Omnisciente-authored preparation guidance. Audit workpapers, conclusions and completion remain in the existing audit and Review workflow.</p>
    <p role="status">{schedule}{due!==null?` · ${displayDay(deadline)}`:''}. {programmeOnly?'Select an existing audit activity to review its actual deadline. The programme activation state is shown in Internal Audit.':cancelled?'Retained audit history remains available; this cancelled activity is not active overdue work.':completed?'This retained audit record is not active overdue work.':due===null?'Record an agreed deadline in the normal Review.':'Schedule awareness follows the recorded deadline; incomplete work in a planned quarter is not overdue merely because it remains open.'}</p>
    {item?<>
      {item.intent&&<p className="whitespace-pre-wrap">{item.intent}</p>}
      <ul className="list-disc pl-5 space-y-1">{[['Verify',item.verify],['Inspect',item.inspect],['Ask',item.questions]].filter(([,value])=>value).map(([label,value])=><li className="whitespace-pre-wrap" key={label}><strong>{label}: </strong>{value}</li>)}</ul>
      <p>Confirm the actual audit scope and criteria, the people to consult, and the supporting records to examine. Record what was examined, the evidence and a reasoned conclusion in the native workpaper.</p>
    </>:<>
      <ul className="list-disc pl-5 space-y-1">
        <li>What scope and criteria will each audit cover, and which methods, responsibilities and reporting arrangements are planned?</li>
        <li>How do the programme and its frequency reflect process importance, relevant changes and earlier audit results?</li>
        <li>How will auditor selection and conduct support objectivity and impartiality?</li>
        <li>Who receives the results, and where will records of the programme and audit results be retained?</li>
      </ul>
      <p>A scheduled activity does not establish the audit-programme requirement. Review the actual arrangements and retained records for 9.2.2.</p>
    </>}
    <p>Record observations or nonconformities through the existing Findings and Action Items workflow. Preparing for an audit does not verify evidence, assert independence, pass the audit or close findings.</p>
    {onOpen&&<Button variant="outline" disabled={disabled} onClick={()=>onOpen(review)}>Open normal Review</Button>}
  </section>;
}
