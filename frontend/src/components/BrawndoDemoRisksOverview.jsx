import {useEffect,useMemo,useState} from 'react';
import api from '@/lib/api';
import {riskLevel} from '@/lib/grcWork';
import {riskCoordinates} from './BrawndoRiskMatrix';
import {riskMatches} from '@/lib/brawndoRisks';
import {calendarDay,managementDay} from '@/lib/managementDates';
import {loadRiskRelations,upcomingRiskEvents} from '@/lib/brawndoDemoRisks';
import {shortDate} from './BrawndoPage';
import {Clock3,Check,TriangleAlert} from 'lucide-react';
import {personLabel} from '@/lib/people';

const bands=[['low','Low','1–4'],['moderate','Moderate','5–9'],['high','High','10–14'],['critical','Critical','15–25']];
export function RiskScoreBar({risk}) {
  if(!riskCoordinates(risk))return null;
  return <span className="bdr-scorebar" aria-hidden="true">
    {bands.map(([level],index)=><i key={level} className={`bdr-zone is-${level}`} style={{left:`${index*20}%`,width:index===3?'40%':'20%'}}/>)}
    <i className={`bdr-fill is-${riskLevel(risk.likelihood_score*risk.impact_score)}`} style={{width:`${risk.likelihood_score*risk.impact_score*4}%`}}/>
    {[5,10,15,20].map(score=><i key={score} className="bdr-tick" style={{left:`${score*4}%`}}/>)}
  </span>;
}

export default function BrawndoDemoRisksOverview({rows,matrixRows,selected,onSelect,view,onView,matches,onOpen,scope,users=[]}) {
  const [related,setRelated]=useState({rows:null,relations:{},unavailable:[]});
  useEffect(()=>{
    const controller=new AbortController();
    loadRiskRelations(rows.filter(r=>riskMatches(r,'all_active')),
      (row,signal)=>api.get('/related',{params:{entity_type:'risks',entity_id:row.risk_id},signal}).then(r=>r.data),controller.signal)
      .then(result=>{if(!controller.signal.aborted)setRelated({rows,...result});})
      .catch(()=>{/* Scope cancellation discards its projection. */});
    return()=>controller.abort();
  },[rows,scope]);
  const now=new Date(),today=managementDay(now),ready=related.rows===rows;
  const events=useMemo(()=>upcomingRiskEvents(rows,ready?related.relations:{},new Date(today*86400000)),[rows,ready,related.relations,today]);
  const eventGroups=useMemo(()=>{
    const groups=new Map();
    for(const event of events){
      const key=`${event.date.slice(0,10)}:${event.kind}`;
      if(!groups.has(key))groups.set(key,{key,date:event.date,kind:event.kind,events:[]});
      groups.get(key).events.push(event);
    }
    return [...groups.values()];
  },[events]);
  const counts={};for(const row of matrixRows){const key=riskCoordinates(row)||'unrated';counts[key]=(counts[key]||0)+1;}
  const active=rows.filter(r=>matches(r,'all_active',now));
  const accepted=rows.filter(r=>matches(r,'accepted',now));
  const expiry=accepted.map(r=>r.acceptance_expires_at).sort()[0];
  const high=active.filter(r=>matches(r,'significant',now)).sort((a,b)=>b.risk_score-a.risk_score)[0];
  const nextReview=active.filter(r=>calendarDay(r.next_review)!==null).sort((a,b)=>calendarDay(a.next_review)-calendarDay(b.next_review))[0];
  const figures=[['all_active','Active risks',active.length,`${active.filter(r=>['in_progress','treated'].includes(r.status)).length} in treatment · ${active.filter(r=>['identified','assessed','open'].includes(r.status)).length} open · ${accepted.length} accepted`],
    ['significant','High or critical',active.filter(r=>matches(r,'significant',now)).length,high?`${high.display_id||'Risk'} · score ${high.risk_score}`:'None'],
    ['accepted','Accepted',accepted.length,expiry?`Expires ${shortDate(expiry)}`:'No current acceptance'],
    ['upcoming','Review due in 30 days',rows.filter(r=>matches(r,'upcoming',now)).length,nextReview?`Next ${shortDate(nextReview.next_review)} · ${nextReview.display_id||'ID pending'}`:'None scheduled']];
  return <section className="bdr-overview" aria-label="Risk overview" data-testid="demo-risks-overview">
    <div className="bdr-matrix-region"><h2>Risk matrix</h2><p>{view==='all_active'?'Active risks':'Current register view'} by current assessed likelihood and impact.</p>
      <div className="bdr-matrix-wrap">
      <div className="bdr-matrix-y" aria-hidden="true">{[5,4,3,2,1].map(n=><span key={n}>{n}</span>)}</div>
      <div className="bdr-matrix" role="group" aria-label="Risk matrix: likelihood 5 to 1; impact 1 to 5">
        {[5,4,3,2,1].flatMap(l=>[1,2,3,4,5].map(i=>{const key=`${l}:${i}`,count=counts[key]||0;return <button type="button" key={key} className={`bdr-cell is-${riskLevel(l*i)}${count?' has-risks':''}`} aria-pressed={selected===key} aria-label={`Likelihood ${l}, impact ${i}, ${riskLevel(l*i)}: ${count} risks`} onClick={()=>onSelect(selected===key?null:key)}>{count?<><strong>{count}</strong><small>{count===1?'risk':'risks'}</small></>:<span>{l*i}</span>}</button>;}))}
      </div><div className="bdr-matrix-x" aria-hidden="true">{[1,2,3,4,5].map(n=><span key={n}>{n}</span>)}</div>
      <div className="bdr-axis" aria-hidden="true"><span>↑ Likelihood</span><span>Impact →</span></div></div>
      <div className={`bdr-matrix-controls${!counts.unrated&&!selected?' sr-only':''}`}><span>{matrixRows.length} risks · {counts.unrated||0} unrated</span>
        {!!counts.unrated&&<button type="button" aria-pressed={selected==='unrated'} onClick={()=>onSelect(selected==='unrated'?null:'unrated')}>View unrated risks</button>}
        {selected&&<button type="button" onClick={()=>onSelect(null)}>Clear matrix selection</button>}
      </div>
    </div>
    <div className="bdr-overview-right">
      <div className="bdr-figures" aria-label="Risk summaries">{figures.map(([id,label,count,detail])=><button type="button" key={id} aria-pressed={view===id&&!selected} onClick={()=>onView(id)}><span>{label}</span><strong>{count}</strong><small>{detail}</small></button>)}</div>
      <section className="bdr-coming" aria-labelledby="bdr-coming-heading"><h3 id="bdr-coming-heading">Coming up <span>Next 6 months · reviews, treatment deadlines, acceptance expiries</span></h3>
        <div className="bdr-event-list">{eventGroups.map(group=>{
          const date=new Date(calendarDay(group.date)*86400000),days=calendarDay(group.date)-today;
          const Icon=group.kind==='review'?Clock3:group.kind==='action'?Check:TriangleAlert;
          return <div className={`bdr-event${group.events.length>1?' bdr-event-grouped':''}${group.kind==='action'&&group.events.length>1?' bdr-multiple-actions':''}`} key={group.key}>
            <time dateTime={group.date.slice(0,10)}><small>{date.toLocaleDateString(undefined,{month:'short',timeZone:'UTC'})}</small><b>{date.getUTCDate()}</b></time>
            <div className="bdr-event-main"><strong><Icon aria-hidden="true"/>{group.kind==='review'?(group.events.length>1?`${group.events.length} risk reviews`:'Risk review'):group.kind==='action'?'Treatment action due':'Acceptance expires'}</strong>
              <span>{group.events.map((event,index)=><span className="bdr-event-source" key={event.key}>
                {index>0&&group.kind!=='action'&&', '}<button type="button" aria-label={`${event.risk.display_id||'ID pending'} · ${event.kind==='action'?event.record.title:event.risk.title}`} onClick={()=>onOpen(event.kind==='action'?'tasks':'risks',event.record)}><b>{event.risk.display_id||'ID pending'}</b>{(group.events.length===1||group.kind==='action')&&<span> · {event.kind==='action'?event.record.title:event.risk.title}{event.kind==='action'?` · ${personLabel(users,event.record.assignee_id)}`:''}</span>}</button>
                {event.kind==='expiry'&&!riskMatches(event.risk,'accepted',now)&&' · Acceptance needs review'}
              </span>)}</span>
            </div><span className={days<=30?'bdr-event-near':''}>{days===0?'Today':`In ${days} ${days===1?'day':'days'}`}</span>
          </div>;
        })}</div>
        {!events.length&&<p>No saved reviews or acceptance expiries in this window.{ready&&!related.unavailable.length?' No linked Action deadlines.':''}</p>}
        {!ready&&<p role="status">Loading linked Action deadlines…</p>}
        {ready&&!!related.unavailable.length&&<p role="status">Linked Action deadlines unavailable for {related.unavailable.length} {related.unavailable.length===1?'risk':'risks'}.</p>}
      </section>
      <div className="bdr-legend" aria-label="Risk score bands">{bands.map(([level,label,range])=><span key={level}><i className={`is-${level}`}/>{label} {range}</span>)}<span className="bdr-legend-note">Current assessed scores.</span></div>
    </div>
  </section>;
}
