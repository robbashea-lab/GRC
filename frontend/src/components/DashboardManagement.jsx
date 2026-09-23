import {useEffect,useState} from 'react';
import DashboardPrograms from './DashboardPrograms';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';

function Panel({title,description,children}) {
  return <section className="bg-surface-card border border-line rounded-lg p-4 space-y-3"><div><h2 className="text-sm font-heading font-semibold text-ink-primary">{title}</h2>{description&&<p className="text-xs text-ink-muted mt-1">{description}</p>}</div>{children}</section>;
}
function Distribution({groups,onOpen}) {
  const count=g=>g.total??g.items.length;
  const total=groups.reduce((n,g)=>n+count(g),0);
  return <div className="space-y-1">
    <div className="flex h-2 rounded overflow-hidden bg-surface-subtle" aria-hidden="true">{groups.filter(g=>count(g)).map(g=><div key={g.key} className={g.tone} style={{width:`${count(g)/total*100}%`}} />)}</div>
    {groups.map(g=><button key={g.key} type="button" onClick={()=>onOpen(g.label,g.items,g.key)} className="w-full flex justify-between gap-3 text-sm text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary rounded focus-visible:ring-2 focus-visible:ring-ring px-1 py-1" aria-label={`${g.label}: ${count(g)} items`}><span>{g.label}</span><span className={`font-mono font-medium ${count(g)&&['pastDue','critical','risk-critical'].includes(g.key)?'text-semantic-critical':count(g)&&['otherDue30','high','risk-high'].includes(g.key)?'text-semantic-duesoon':'text-ink-primary'}`}>{count(g)}</span></button>)}
  </div>;
}

export default function DashboardManagement({clientId,posture,programs=[],framework,onOpen,loadDetail,Table}) {
  const [drill,setDrill]=useState(null);
  const show=(title,items,key)=>setDrill({title,items:loadDetail?[]:items,key,offset:0,total:posture.totals?.[key]??items.length,loading:!!loadDetail});
  const detailKey=drill?.key, detailOffset=drill?.offset;
  useEffect(()=>{
    if(!loadDetail||!detailKey)return;
    const controller=new AbortController();
    setDrill(previous=>({...previous,loading:true,error:null}));
    loadDetail(detailKey,detailOffset,controller.signal).then(result=>{
      if(!controller.signal.aborted)setDrill(previous=>({...previous,...result,loading:false}));
    }).catch(error=>{if(!controller.signal.aborted)setDrill(previous=>({...previous,loading:false,error:error.message||'Could not load contributing records.'}));});
    return()=>controller.abort();
  },[loadDetail,detailKey,detailOffset]);
  const selectedProgram=programs.find(p=>p.key===framework);
  return <div className="page-content space-y-6" data-testid="management-dashboard">
    {framework ? <Panel title={`${selectedProgram?.label||'Program'} Dashboard View`}><p className="text-sm text-ink-muted">{selectedProgram?.trackingAvailable?'The assessment progress and recurring obligations below come from this client’s framework records. Manage requirements, mapped Reviews and supporting Evidence in the framework workspace.':'Detailed assessment and mapping are not yet implemented for this program.'} Use Entire Organization for overall operational posture; organization-wide totals are not substituted for framework-specific work.</p></Panel>
      : <>
        <div><h2 className="text-base font-heading font-semibold text-ink-primary mb-3">Program Health</h2><div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel title="GRC Work Status" description="Distinct current obligations; overdue takes precedence, then in-progress."><Distribution groups={posture.buckets} onOpen={show} /></Panel>
          <Panel title="Risk Posture" description="Active risk levels. Acceptance is a separate decision, not a severity."><Distribution groups={posture.riskLevels} onOpen={show} /><button className="flex justify-between gap-3 w-full border-t border-line pt-3 text-sm text-link" onClick={()=>show('Accepted Risks',posture.acceptedRisks||[],'acceptedRisks')}><span>Accepted Risks</span><span>{posture.totals?.acceptedRisks??posture.acceptedRisks?.length??0}</span></button></Panel>
          <Panel title="Third-Party / Governance Health" description="Reviews: 30 days. Assurance and contracts use each vendor’s configured lead window (default 90 days); past-due items included."><div className="space-y-3">{posture.vendorHealth.map(g=><button key={g.key} type="button" onClick={()=>show(g.label,g.items,g.key)} className="w-full flex justify-between gap-3 rounded text-sm text-left text-ink-secondary hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-ring"><span>{g.label}</span><span className="font-mono text-ink-primary">{g.total??g.items.length}</span></button>)}</div></Panel>
        </div></div>
      </>}
    <DashboardPrograms clientId={clientId} programs={programs.filter(p=>!framework||p.key===framework)} onOpen={onOpen}/>
    {!framework&&<Panel title="Highest Priority Items" description="Top five current priorities. Manage the work in its source record.">
          {posture.priority.length?<Table items={posture.priority.slice(0,5)} onOpen={onOpen}/>:<p className="text-sm text-ink-muted">No items require immediate attention right now.</p>}
          <button type="button" onClick={()=>show('All Priority Items',posture.priority,'priority')} className="text-sm text-link hover:text-link-hover">View All ({posture.totals?.priority??posture.priority.length})</button>
        </Panel>}
    <Sheet open={!!drill} onOpenChange={open=>{if(!open)setDrill(null);}}><SheetContent className="w-full sm:max-w-4xl overflow-y-auto bg-surface-card" data-testid="dashboard-drilldown"><SheetHeader><SheetTitle>{drill?.title}</SheetTitle><SheetDescription>{drill?.total||0} contributing records. Open an item to view its authoritative record.</SheetDescription></SheetHeader><div className="mt-6">{drill?.loading?<p role="status">Loading contributing records…</p>:drill?.error?<p role="alert">{drill.error}</p>:drill?.items.length?<Table items={drill.items} onOpen={item=>{setDrill(null);onOpen(item);}}/>:<p className="text-sm text-ink-muted">No current items in this view.</p>}{loadDetail&&!!drill?.total&&<div className="flex items-center justify-between gap-3 mt-4 text-sm"><button type="button" disabled={drill.loading||!drill.offset} onClick={()=>setDrill(previous=>({...previous,offset:Math.max(0,previous.offset-25)}))}>Previous</button><span>Showing {drill.offset+1}–{Math.min(drill.offset+25,drill.total)} of {drill.total}</span><button type="button" disabled={drill.loading||drill.offset+25>=drill.total} onClick={()=>setDrill(previous=>({...previous,offset:previous.offset+25}))}>Next</button></div>}</div></SheetContent></Sheet>
  </div>;
}
