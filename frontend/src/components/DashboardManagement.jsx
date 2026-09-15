import {useState} from 'react';
import {Link} from 'react-router-dom';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';

function Panel({title,description,children}) {
  return <section className="bg-surface-card border border-line rounded-lg p-5 space-y-4"><div><h2 className="text-sm font-heading font-semibold text-ink-primary">{title}</h2>{description&&<p className="text-xs text-ink-muted mt-1">{description}</p>}</div>{children}</section>;
}
function Distribution({groups,onOpen}) {
  const total=groups.reduce((n,g)=>n+g.items.length,0);
  return <div className="space-y-3">
    <div className="flex h-2 rounded overflow-hidden bg-surface-subtle" aria-hidden="true">{groups.filter(g=>g.items.length).map(g=><div key={g.key} className={g.tone} style={{width:`${g.items.length/total*100}%`}} />)}</div>
    {groups.map(g=><button key={g.key} type="button" onClick={()=>onOpen(g.label,g.items)} className="w-full flex justify-between gap-3 text-sm text-ink-secondary hover:text-ink-primary rounded focus-visible:ring-2 focus-visible:ring-ring px-1 py-1" aria-label={`${g.label}: ${g.items.length} items`}><span>{g.label}</span><span className="font-mono text-ink-primary">{g.items.length}</span></button>)}
  </div>;
}

export default function DashboardManagement({posture,programs=[],framework,onOpen,Table}) {
  const [drill,setDrill]=useState(null);
  const show=(title,items)=>setDrill({title,items});
  const selectedProgram=programs.find(p=>p.key===framework);
  const cards=[['kpi-overdue','Past Due Items',posture.pastDue,'Current obligations before today'],['kpi-due-30','Due in Next 30 Days',posture.due30,'Today through the next 30 days'],['kpi-critical','Critical / High Findings',posture.materialFindings,'Open material findings, including pending validation'],['kpi-risks','Significant Risks',posture.significantRisks,'Active High / Critical risks, including accepted risks']];
  return <div className="page-content space-y-6" data-testid="management-dashboard">
    {!framework&&<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{cards.map(([id,label,items,hint])=><button key={id} type="button" data-testid={id} onClick={()=>show(label,items)} aria-label={`${label}: ${items.length}. View contributing records`} className="metric-card bg-surface-card border border-line rounded-md text-left hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring"><span className="metric-label">{label}</span><span className="metric-value block">{items.length}</span><span className="text-xs text-ink-muted">{hint}</span></button>)}</div>}
    {!!programs.length&&<Panel title="Compliance & Readiness" description="Configured client programs. Progress is not a compliance or certification claim.">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{programs.filter(p=>!framework||p.key===framework).map(p=><article key={p.key} className="border border-line rounded-md p-4 space-y-2" data-testid={`program-${p.key}`}><h3 className="font-semibold text-sm text-ink-primary">{p.label}</h3><p className="text-sm text-ink-secondary">{p.status}</p><p className="text-xs text-ink-muted leading-relaxed">{p.explanation}</p><Link className="inline-block text-sm text-link hover:text-link-hover pt-2" to={p.to}>View {p.label}</Link></article>)}</div>
    </Panel>}
    {framework ? <Panel title={`${selectedProgram?.label||'Program'} Dashboard View`} description="Structured operational mappings are not yet available."><p className="text-sm text-ink-muted">Framework-specific work counts and requirement progress cannot be calculated yet. Organization-wide totals are not substituted for mapped work. Use Entire Organization for current operational posture.</p></Panel>
      : <>
        <div><h2 className="text-base font-heading font-semibold text-ink-primary mb-3">Program Health</h2><div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel title="GRC Work Status" description="Distinct current obligations; overdue takes precedence, then in-progress."><Distribution groups={posture.buckets} onOpen={show} /></Panel>
          <Panel title="Risk Posture" description="Active risk levels; accepted risks remain visible."><Distribution groups={posture.riskLevels} onOpen={show} /></Panel>
          <Panel title="Third-Party / Governance Health" description="Source-module review and assurance windows; missing assurance is included."><div className="space-y-3">{posture.vendorHealth.map(g=><button key={g.key} type="button" onClick={()=>show(g.label,g.items)} className="w-full flex justify-between gap-3 rounded text-sm text-left text-ink-secondary hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-ring"><span>{g.label}</span><span className="font-mono text-ink-primary">{g.items.length}</span></button>)}</div></Panel>
        </div></div>
        <Panel title="Highest Priority Items" description="Top five current priorities. Manage the work in its source record.">
          {posture.priority.length?<Table items={posture.priority.slice(0,5)} onOpen={onOpen}/>:<p className="text-sm text-ink-muted">No items require immediate attention right now.</p>}
          <button type="button" onClick={()=>show('All Priority Items',posture.priority)} className="text-sm text-link hover:text-link-hover">View All ({posture.priority.length})</button>
        </Panel>
      </>}
    <Sheet open={!!drill} onOpenChange={open=>{if(!open)setDrill(null);}}><SheetContent className="w-full sm:max-w-4xl overflow-y-auto bg-surface-card" data-testid="dashboard-drilldown"><SheetHeader><SheetTitle>{drill?.title}</SheetTitle><SheetDescription>{drill?.items.length||0} contributing records. Open an item to view its authoritative record.</SheetDescription></SheetHeader><div className="mt-6">{drill?.items.length?<Table items={drill.items} onOpen={item=>{setDrill(null);onOpen(item);}}/>:<p className="text-sm text-ink-muted">No current items in this view.</p>}</div></SheetContent></Sheet>
  </div>;
}
