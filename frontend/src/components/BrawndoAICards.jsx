import {aiApproval,aiApproved,aiUseLabel,aiThirdParty,aiCustomerFacing,aiInactive} from '@/lib/brawndoAI';
import {DueDate,OwnerCell} from './RegisterCells';
import './BrawndoAI.css';

export default function BrawndoAICards({rows,users,onOpen,approvalPilot}){
  return <div className="brawndo-ai-grid">{rows.map(row=><button type="button" key={row.ai_system_id} className="brawndo-ai-card" onClick={()=>onOpen(row)} aria-label={`Open ${row.name}`}>
    <div className="flex gap-3 items-start"><span className="brawndo-ai-initials" aria-hidden="true">{row.name?.slice(0,2).toUpperCase()}</span><div className="min-w-0"><h2>{row.name}</h2><p className="text-sm text-ink-muted">{row.provider||'Provider not recorded'}</p>{approvalPilot&&row.environment&&<p className="text-xs text-ink-muted mt-1">{row.environment}</p>}</div></div>
    {(approvalPilot||aiInactive(row))&&<div className="flex flex-wrap gap-2">{approvalPilot&&<span className={`brawndo-ai-badge ${aiApproved(row)?'is-approved':''}`}>{aiApproval(row)}</span>}{aiInactive(row)&&<span className="brawndo-ai-badge">{row.status==='retired'?'Archived':'Inactive'}</span>}</div>}
    <div><h3>{approvalPilot?aiUseLabel(row):'Intended Use'}</h3><p className="brawndo-ai-use">{row.description||row.purposes?.join(', ')||'Use not documented'}</p></div>
    {approvalPilot&&<div><h3>Permitted Data</h3><p>{aiApproved(row)&&row.permitted_data_types?.length?row.permitted_data_types.join(', '):'Data permissions not established'}</p></div>}
    <div className="flex flex-wrap gap-2 text-xs text-ink-muted">{aiThirdParty(row)&&<span>Third Party</span>}{aiCustomerFacing(row)&&<span>Customer Facing</span>}{row.risk_tier&&<span>Internal risk: {row.risk_tier}</span>}</div>
    <div className="brawndo-ai-card-footer"><div><h3>Business Owner</h3><OwnerCell people={users} id={row.owner_id}/></div><div><h3>Next Review</h3>{row.next_review?<DueDate iso={row.next_review} closed={aiInactive(row)}/>:<span>Not Scheduled</span>}</div></div>
  </button>)}</div>;
}
