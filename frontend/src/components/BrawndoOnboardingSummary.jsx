import {cisProgramName} from '@/lib/cisScope';
import {selectedPrograms} from '@/lib/frameworks';
import {scheduledDate} from '@/lib/reviewOccurrences';

const CADENCE_LABELS={monthly:'Monthly',quarterly:'Quarterly',semiannual:'Every 6 months',annual:'Annual'};

export function BrawndoOnboardingFrame({enabled,theme,children}) {
  // Appearance can withdraw during refresh without discarding native child drafts.
  return <div className={enabled?'brawndo-onboarding onboarding-completed':'space-y-4'} data-theme={enabled?theme:undefined}>{children}</div>;
}

export function OnboardingRail({state,preview,forecast}) {
  const programs=selectedPrograms(state);
  return <aside className="rail" aria-label="This will create">
    <h3>This will create</h3>
    <div className="rl"><span>Programs</span><strong>{programs.length}</strong>{programs.length?<div className="chips">{programs.map(p=><span className="fwt" key={p.key}>{cisProgramName(p,state.framework_settings?.[p.key])}</span>)}</div>:<small>General GRC program, no framework</small>}</div>
    <div className="rl"><span>Policy records</span><strong>{preview.policies.total}</strong><small>{preview.policies.create} to create · {preview.policies.retain} retained</small><small>{preview.policies.yes} reported existing · {preview.policies.no} reported missing · {preview.policies.unsure} need confirmation</small></div>
    <div className="rl"><span>Recurring Reviews</span><strong>{preview.reviews.total}</strong><small>{preview.reviews.create} to create · {preview.reviews.retain} retained</small><small>{preview.reviews.scheduling} need scheduling · {preview.reviews.owners} have an owner</small></div>
    <div className="rl"><span>Reviews due in the next 12 months</span><strong>{forecast.unavailable?'Unavailable':forecast.total}</strong><small>{forecast.unscheduled} unscheduled{forecast.unavailable?` · ${forecast.unavailable} schedules unavailable`:''}</small></div>
  </aside>;
}

export function OnboardingSchedulePreview({state,preview,rows,forecast}) {
  const programs=selectedPrograms(state), peak=Math.max(4,...forecast.months.map(m=>m.program+m.general));
  const metrics=[['Programs',programs.length||'General',programs.map(p=>cisProgramName(p,state.framework_settings?.[p.key])).join(' · ')||'No framework'],
    ['Policy records',preview.policies.total,`${preview.policies.create} to create · ${preview.policies.retain} retained`],
    ['Recurring Reviews',preview.reviews.total,`${preview.reviews.create} to create · ${preview.reviews.retain} retained`],
    ['Due in the next 12 months',forecast.unavailable?'Unavailable':forecast.total,`${forecast.unscheduled} unscheduled${forecast.unavailable?` · ${forecast.unavailable} unavailable`:''}`]];
  return <section className="sec schedule-preview" aria-label="Program preview">
    <div className="kstrip">{metrics.map(([label,value,detail])=><div className="kcell" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div>
    <div className="legend"><span><i className="sw f"/>From programs</span><span><i className="sw g"/>General GRC</span></div>
    <div className="plot" role="img" aria-label={`12-month Review projection: ${forecast.total} known due dates, ${forecast.unscheduled} unscheduled, ${forecast.unavailable} unavailable. ${forecast.months.map(month=>`${month.label}: ${month.program} from programs, ${month.general} general GRC`).join('; ')}`}>
      {forecast.months.map((month,index)=><div className="mcol" style={{gridColumn:index+1}} key={month.at} title={`${new Date(month.at).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}: ${month.program+month.general}`}>{!!month.total&&<span className="mval">{month.total}</span>}<div className="mstack">{!!month.program&&<i className={`mseg f${month.general?'':' top'}`} style={{height:Math.max(4,Math.round(88*month.program/peak))}}/>}{!!month.general&&<i className="mseg g top" style={{height:Math.max(4,Math.round(88*month.general/peak))}}/>}</div></div>)}
      {forecast.months.map((month,index)=><div className="mlab" style={{gridColumn:index+1}} key={month.at}>{new Date(month.at).toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})}{(index===0||new Date(month.at).getUTCMonth()===0)&&<small>{new Date(month.at).getUTCFullYear()}</small>}</div>)}
    </div>
    {(forecast.unscheduled>0||forecast.unavailable>0)&&<p className="empty-s">{forecast.unscheduled} Reviews need scheduling. {forecast.unavailable>0&&`${forecast.unavailable} retained schedules are unavailable for projection.`}</p>}
    <div className="rt" role="table" aria-label="Reviews to create or retain"><div className="thead" role="row">{['Review','Comes from','Cadence','First due'].map(label=><span role="columnheader" key={label}>{label}</span>)}</div>
      {rows.map(item=><div className="trow" role="row" key={item.key}><span role="cell">{item.title}<small className="review-retention">{item.existing?'Existing Review retained':'Create only if missing'}</small></span><span role="cell">{item.source}</span><span role="cell">{item.review.recurrence==='custom'?`${item.review.custom_recurrence_days} days`:CADENCE_LABELS[item.review.recurrence]||item.review.recurrence||'Needs Scheduling'}</span><span role="cell">{scheduledDate(item.review.due_date)?.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})||'Not scheduled'}</span></div>)}
      {!rows.length&&<p className="empty-s">No Reviews selected.</p>}
    </div>
  </section>;
}
