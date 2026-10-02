import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import api,{formatError} from '@/lib/api';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {CisStatusBar,CIS_ORDER,CIS_TONE} from './CisStatus';
import './BrawndoCisWorkspace.css';
import './AssessmentMetrics.css';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';

const HEALTH={past_due:'Past Due',due_soon:'Due in 30 Days',current:'Current · Due Later',unscheduled:'Needs Scheduling'};
const qualification=key=>key==='soc-2'?'Internal readiness, not an auditor opinion.':'Assessment progress, not a compliance determination.';
const control='text-left rounded focus-visible:ring-2 focus-visible:ring-ring hover:bg-surface-subtle';

function ProgramMetrics({program}) {
  const a=program.assessment,progress=a.assessment_progress,assessed=a.total-(a.status_counts.not_assessed||0);
  return <dl className="assessment-metrics" aria-label="Assessment metrics">
    <div className="assessment-metric"><dt>{program.key==='iso-27001'?'Assessment progress':'Reviewed & Addressed'}</dt><dd><strong>{progress.percent}%</strong><span>{progress.resolved} of {progress.total}</span></dd></div>
    <div className="assessment-metric"><dt>Assessed</dt><dd><strong>{Math.round(assessed/(a.total||1)*100)}%</strong><span>{assessed} of {a.total}</span></dd></div>
  </dl>;
}

export default function DashboardPrograms({programs,clientId,onOpen,reference=false}) {
  const [selection,setSelection]=useState(null),[page,setPage]=useState(null);
  const program=programs.find(p=>p.key===selection?.key);
  useEffect(()=>{
    if(!selection)return;
    const c=new AbortController();setPage(null);
    api.get('/frameworks/summary',{params:{client_id:clientId,program:selection.key,detail:selection.status,offset:selection.offset,limit:25},signal:c.signal})
      .then(({data})=>{if(data.client_id!==clientId)throw new Error('Program detail belongs to another client.');if(!c.signal.aborted)setPage(data);})
      .catch(e=>{if(!c.signal.aborted)setPage({error:formatError(e)});});
    return()=>c.abort();
  },[clientId,selection]);
  const show=(p,status='all')=>setSelection({key:p.key,status,offset:0});
  // Collections open in the full-width program workspace, filtered; one record opens in its drawer.
  const href=(p,view)=>`${p.to}?view=${encodeURIComponent(view)}`;
  const openReview=r=>{setSelection(null);onOpen({...r,key:`reviews:${r.id}:due`});};
  if(!programs.length)return null;
  const sheet=<Sheet open={!!program} onOpenChange={open=>{if(!open)setSelection(null);}}><SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-surface-card"><SheetHeader><SheetTitle>{program?.label} — Supporting records</SheetTitle><SheetDescription>{qualification(program?.key)}</SheetDescription></SheetHeader>{program&&<div className="mt-5 space-y-4">
      <div className="flex flex-wrap gap-2">{[['all','All Requirements'],...Object.entries(operatorStatuses(program.key)),...Object.entries(HEALTH)].map(([status,label])=><button key={status} aria-pressed={selection.status===status} className={`${control} text-xs border px-2 py-1 ${selection.status===status?'border-ink-primary font-semibold':'border-line'}`} onClick={()=>show(program,status)}>{label}{program.assessment.status_counts[status]!=null?` (${program.assessment.status_counts[status]})`:program.assessment.ongoing?.counts[status]!=null?` (${program.assessment.ongoing.counts[status]})`:''}</button>)}</div>
      {!page?<p role="status">Loading supporting records…</p>:page.error?<p role="alert">{page.error}</p>:<><p className="text-xs text-ink-secondary">{page.total} contributing records · {HEALTH[selection.status]||operatorStatuses(program.key)[selection.status]||'All Requirements'}</p><ul className="divide-y divide-line">{page.items.map(r=><li key={r.id} className="py-3 text-sm">{r.kind==='reviews'?<button className="text-link text-left" onClick={()=>openReview(r)}>{r.title} · {r.due_date?.slice(0,10)||'No date'}</button>:<Link className="text-link" to={`${program.to}?assessment=${encodeURIComponent(r.id)}`}>{r.definition_id} · {r.title}</Link>}<span className="block text-xs text-ink-secondary mt-1">{r.kind==='framework_assessments'?operatorStatuses(program.key)[r.status]:r.status?.replaceAll('_',' ')}</span></li>)}</ul>{!page.total&&<p className="text-sm text-ink-muted">No records in this category.</p>}<div className="flex justify-between text-sm"><button disabled={!selection.offset} onClick={()=>setSelection({...selection,offset:Math.max(0,selection.offset-25)})}>Previous</button><span>{page.total?selection.offset+1:0}–{Math.min(selection.offset+25,page.total)} of {page.total}</span><button disabled={selection.offset+25>=page.total} onClick={()=>setSelection({...selection,offset:selection.offset+25})}>Next</button></div></>}
      <Link to={program.to} className="text-sm text-link">View {program.label}</Link>
    </div>}</SheetContent></Sheet>;
  if(reference)return <section aria-labelledby="programs-heading" className="space-y-3 min-w-0">
    {programs.map(p=>{const a=p.assessment,progress=a?.assessment_progress,health=a?.ongoing,statuses=operatorStatuses(p.key);
      if(!progress||progress.percent==null)return <article key={p.key} className="bg-surface-card border border-line rounded-lg p-4"><h2 id="programs-heading" className="font-heading font-semibold text-sm">{p.label}</h2><p className="text-sm text-ink-secondary mt-2">{!p.trackingAvailable?'Detailed assessments not available':'Setup required'}</p></article>;
      return <article key={p.key} data-testid={`program-${p.key}`} className="bg-surface-card border border-line rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-baseline gap-2"><h2 id="programs-heading" className="font-heading font-semibold text-sm">{p.label} program</h2><Link to={p.to} className="text-xs text-link hover:underline">Open workspace</Link></div>
        <ProgramMetrics program={p}/>
        <CisStatusBar counts={Object.fromEntries(CIS_ORDER.map(k=>[k,a.status_counts[k]||0]))} className="h-2"/>
        <ul className="space-y-0.5">{CIS_ORDER.filter(k=>a.status_counts[k]).map(k=><li key={k}><Link to={href(p,k)} className={`${control} flex items-center gap-2 w-full px-1 py-1 text-xs`}><span className={`cis-dot cis-tone-${CIS_TONE[k]}`} aria-hidden="true"/><span className="flex-1 text-ink-secondary">{statuses[k]}</span><strong className="tabular-nums">{a.status_counts[k]}</strong></Link></li>)}</ul>
        {health&&<div className="border-t border-line pt-3 space-y-1"><h3 className="text-xs font-semibold">Recurring activities</h3>{health.total?<div className="flex flex-wrap gap-x-3 gap-y-1">{Object.entries(HEALTH).filter(([status])=>health.counts[status]||status==='past_due').map(([status,label])=><button key={status} onClick={()=>show(p,status)} className={`${control} text-xs py-0.5 ${status==='past_due'&&health.counts[status]?'text-semantic-critical font-medium':'text-ink-secondary'}`}>{health.counts[status]} {label}</button>)}</div>:<p className="text-xs text-ink-muted">No recurring obligations configured</p>}
          {health.next&&<button onClick={()=>openReview(health.next)} className={`${control} block text-xs text-link py-1 w-full`}>Next: {health.next.title} · {health.next.due_date?.slice(0,10)}</button>}</div>}
        <p className="text-xs text-ink-muted">{qualification(p.key)}</p>
      </article>;})}
    {sheet}
  </section>;
  return <section aria-labelledby="programs-heading" className="space-y-3">
    <div><h2 id="programs-heading" className="font-heading font-semibold">Compliance Programs</h2><p className="text-xs text-ink-muted mt-1">Requirement progress and ongoing obligations are separate measures. Programs remain organization-wide.</p></div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{programs.map(p=>{
      const a=p.assessment,progress=a?.assessment_progress,health=a?.ongoing;
      const attention=!!(health?.counts.past_due||health?.counts.unscheduled||a?.status_counts.needs_attention||progress?.invalid_na);
      return <article key={p.key} data-testid={`program-${p.key}`} className="bg-surface-card border border-line rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-start gap-2"><h3 className="font-semibold text-sm">{p.label}</h3>{attention&&<span className="text-xs font-medium text-semantic-duesoon">Needs Attention</span>}</div>
        {progress?.percent!=null?<><ProgramMetrics program={p}/>
          <div role="progressbar" aria-label={`${p.label} assessment resolution`} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${progress.resolved} of ${progress.total} resolved`} className="h-1.5 rounded bg-surface-subtle overflow-hidden"><div className="h-full bg-ink-secondary" style={{width:`${progress.percent}%`}}/></div>
          <div className="space-y-1">{Object.entries(operatorStatuses(p.key)).map(([status,label])=><button key={status} onClick={()=>show(p,status)} className={`${control} flex justify-between gap-2 w-full px-1 py-0.5 text-xs`}><span className="text-ink-secondary">{label}</span><strong className="tabular-nums">{a.status_counts[status]}</strong></button>)}</div>
        </>:<p className="text-sm text-ink-secondary">{!p.trackingAvailable?'Detailed assessments not available':!a?'Program data unavailable':'Setup Required'}</p>}
        {health&&<div className="border-t border-line pt-3 space-y-1"><h4 className="text-xs font-semibold">Ongoing Program Health</h4>{health.total?<><p className="text-xs text-ink-secondary">{health.counts.current+health.counts.due_soon} / {health.total} recurring activities not past due or unscheduled</p><div className="flex flex-wrap gap-x-3 gap-y-1">{Object.entries(HEALTH).map(([status,label])=><button key={status} onClick={()=>show(p,status)} className={`${control} text-xs py-1 ${status==='past_due'&&health.counts[status]?'text-semantic-critical':'text-ink-secondary'}`}>{health.counts[status]} {label}</button>)}</div></>:<p className="text-xs text-ink-muted">No recurring obligations configured</p>}
          {health.next&&<button onClick={()=>openReview(health.next)} className={`${control} block text-xs text-link py-1 w-full`}>Next: {health.next.title} · {health.next.due_date?.slice(0,10)}</button>}</div>}
        <p className="text-xs text-ink-muted">{qualification(p.key)}</p>
        <div className="border-t border-line pt-2 text-xs"><Link to={p.to} className="text-link hover:underline">View Program</Link></div>
      </article>;
    })}</div>
    {sheet}
  </section>;
}
