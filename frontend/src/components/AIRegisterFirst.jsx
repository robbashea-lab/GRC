import {Fragment,useRef,useState} from 'react';
import {Cpu,FileText,ChevronDown,Plus,Grid2X2,Shield,Clock,TriangleAlert,Search,X} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {attentionFor,catalogKeys,tools} from '@/lib/aiOnboarding';
import {aiApproval} from '@/lib/brawndoAI';
import logos from '@/lib/aiOnboardingLogos.json';
import {useBrawndoTheme,useBrawndoPortalTheme} from '@/lib/brawndoTheme';
import './AIRegisterFirst.css';

export const label = value => value ? value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()) : 'Not recorded';
export function ownerLabel(id,users) {
  if(!id)return 'Unassigned';
  const person=users.find(user=>user.user_id===id);
  return person?.name||person?.email||`Owner unavailable (${id})`;
}
export function dateLabel(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))return 'Not recorded';
  const day=value.slice(0,10),date=new Date(day+'T12:00:00Z');
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==day)return 'Not recorded';
  return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(date);
}
export function ToolLogo({catalogKey}) {
  const name=tools[catalogKeys.indexOf(catalogKey)]?.name,src=logos[name];
  return <span className="tool-logo">{src?<img src={src} alt=""/>:<Cpu aria-hidden="true"/>}</span>;
}
export function Badge({children,tone}) {
  const color=tone||({'High':'red','Low':'green','Moderate':'amber','Approved':'green','Pending assessment':'amber','Needs assessment':'neutral'}[children])||'neutral';
  return <span className={`badge ${color}`}>{children}</span>;
}
export function Field({label:caption,hint,wide,children}) {
  return <label className={`field ${wide?'span2':''}`}><span className="field-label">{caption}</span>{children}{hint&&<small className="hint">{hint}</small>}</label>;
}
export function RiskScore({risk,label:caption='Assessment score'}) {
  const score=risk.likelihood&&risk.impact?risk.likelihood*risk.impact:null;
  return <div className="risk-score"><span>{caption}</span><strong>{score??'Unrated'}{score&&<small> / 25</small>}</strong><p>{score?`${risk.likelihood} likelihood × ${risk.impact} impact`:'More context or an explicit human assessment is needed.'}</p></div>;
}
export function AIModal({title,subtitle,eyebrow='AI GOVERNANCE',onClose,children,footer}) {
  const opener=useRef(document.activeElement);
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent showCloseButton={false} className="airf airf-dialog" onCloseAutoFocus={event=>{event.preventDefault();(opener.current?.isConnected?opener.current:document.querySelector('.airf-page input[type="search"]'))?.focus();}}><div className="dialog-shell"><header className="dialog-heading"><div><div className="eyebrow">{eyebrow}</div><DialogTitle>{title}</DialogTitle><DialogDescription>{subtitle}</DialogDescription></div><button type="button" className="dialog-close" aria-label="Close" onClick={onClose}><X/></button></header><div className="dialog-body">{children}</div><footer className="dialog-footer">{footer}</footer></div></DialogContent></Dialog>;
}
const inactive=row=>['suspended','retired'].includes(row.status);
const pending=row=>row.approval_status==='pending_assessment';
const riskLinks=row=>(row.related_links||[]).filter(link=>link.kind==='risks');
const filters=[['active','All active'],['due','Due for review'],['high','High risk'],['third','Third party'],['customer','Customer facing'],['pending','Pending approval']];
export default function AIRegisterFirst({clientName,rows,users,intake,canCreate,onOpen,onCreate,onProfile,onRelated,query,onSearch,view,onView,showInactive,onShowInactive}) {
  const [theme]=useBrawndoTheme();useBrawndoPortalTheme(true,theme);
  const [expanded,setExpanded]=useState(null);
  const owner=row=>ownerLabel(row.owner_id,users);
  const today=new Date().toISOString().slice(0,10),until=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const matches=(row,filter)=>{
    const tier=attentionFor(row).tier;
    if(filter==='high')return tier==='High';
    if(filter==='pending')return pending(row);
    if(filter==='due')return dateLabel(row.next_review)!=='Not recorded'&&row.next_review.slice(0,10)>=today&&row.next_review.slice(0,10)<=until;
    if(filter==='third')return !!(row.vendor_id||row.provider||row.screening?.third_party);
    if(filter==='customer')return row.purposes?.includes('Customer-Facing')||row.screening?.customer_facing===true;
    if(filter==='attention')return tier==='High'||tier==='Needs assessment'||pending(row)||dateLabel(row.next_review)!=='Not recorded'&&row.next_review.slice(0,10)<today;
    return true;
  };
  const active=rows.filter(row=>!inactive(row));
  const visible=rows.filter(row=>(showInactive||!inactive(row))&&matches(row,view)&&[row.name,row.provider,row.description,owner(row),...riskLinks(row).map(link=>link.id)].join(' ').toLowerCase().includes(query.toLowerCase()));
  const shownFilters=view==='attention'?[...filters,['attention','Needing attention']]:filters;
  return <main className="airf airf-page" data-testid="ai-register-first"><section className="page-heading"><div><div className="eyebrow">01 · REGISTER FIRST</div><h1>{clientName} AI Governance</h1><p>AI system register · {active.length} active {active.length===1?'system':'systems'}</p></div><div className="page-actions">{onProfile&&<button className="profile-button" onClick={onProfile}><FileText/><span><b>{intake.usage!=='unsure'?'AI profile completed':'AI profile needs confirmation'}</b><small>View AI profile</small></span><ChevronDown/></button>}{canCreate&&<button className="button primary" data-testid="new-ai-system" onClick={onCreate}><Plus/>New AI system</button>}</div></section>
    <section className="summary" aria-label="AI summary">{[['AI systems','active',Grid2X2],['High risk','high',Shield],['Pending approval','pending',Clock],['Needing attention','attention',TriangleAlert]].map(([name,filter,Icon])=><button key={filter} className={`summary-card ${filter==='active'?'all':filter}`} aria-label={`${name} ${active.filter(row=>matches(row,filter)).length}`} onClick={()=>{onView(filter);onSearch('');}}><span className="metric-icon"><Icon/></span><span><span className="metric-label">{name}</span><strong>{active.filter(row=>matches(row,filter)).length}</strong></span></button>)}</section>
    <section className="register"><div className="register-toolbar"><label className="search-box"><Search/><input type="search" data-testid="ai-system-search" aria-label="Search AI systems" placeholder="Search AI systems…" value={query} onChange={event=>onSearch(event.target.value)}/></label><div className="filters">{shownFilters.map(([filter,name])=><button key={filter} data-testid={`ai-system-view-${filter}`} className={`filter-chip ${view===filter?'selected':''}`} aria-pressed={view===filter} onClick={()=>onView(filter)}>{name} <span>{active.filter(row=>matches(row,filter)).length}</span></button>)}</div><label className="archive-toggle"><input type="checkbox" checked={showInactive} onChange={event=>onShowInactive(event.target.checked)}/>Show archived / inactive</label></div>
      <div className="table-scroll"><table><thead><tr>{['AI system','Screening','Approval','Owner','Risk register',''].map((heading,index)=><th key={index} scope="col">{heading||<span className="sr-only">Expand</span>}</th>)}</tr></thead><tbody>{visible.map(row=>{const links=riskLinks(row),name=owner(row),open=expanded===row.ai_system_id;return <Fragment key={row.ai_system_id}><tr className={`system-row ${matches(row,'attention')?'attention-row':''} ${open?'expanded':''}`}><td><button className="system-name system-cell" data-expand={row.ai_system_id} aria-expanded={open} onClick={()=>setExpanded(open?null:row.ai_system_id)}><ToolLogo catalogKey={row.catalog_key}/><span><strong>{row.name}</strong><span className="system-secondary">{row.provider} · {row.description||'Use not yet documented'}{row.status!=='active'?` · ${label(row.status)}`:''}</span></span></button></td><td><Badge>{attentionFor(row).tier}</Badge></td><td><Badge>{aiApproval(row)}</Badge></td><td><span className="owner"><span className="avatar">{name.split(/\s+/).slice(0,2).map(part=>part[0]).join('')}</span>{name}</span></td><td>{links.length?links.map(link=><button key={link.id} className="risk-link" onClick={()=>onRelated('risks',link.id)}>{link.id}</button>):<span className="system-secondary">Not linked</span>}{links.length>0&&<span className="system-secondary">Linked</span>}</td><td><button className="row-chevron" aria-label={`${open?'Collapse':'Expand'} ${row.name}`} onClick={()=>setExpanded(open?null:row.ai_system_id)}>{open?'⌃':'⌄'}</button></td></tr>{open&&<tr className="expanded-row"><td colSpan={6}><div className="inline-system-detail"><div className="record-grid">{[['Documented use',row.description],['Plan / account',row.environment],['Next review',dateLabel(row.next_review)]].map(([heading,value])=><div className="record-field" key={heading}><small>{heading}</small><strong>{value||'Not recorded'}</strong></div>)}</div><div className="inline-actions"><button className="button primary" onClick={()=>onOpen(row)}>Open system record</button>{links.map(link=><button key={link.id} className="button secondary" onClick={()=>onRelated('risks',link.id)}>View linked risk{links.length>1?` ${link.id}`:''}</button>)}{row.vendor_id&&<button className="button secondary" onClick={()=>onRelated('vendors',row.vendor_id)}>View linked vendor</button>}<span className="hint">{row.display_id||row.ai_system_id} · Full details stay one click away</span></div></div></td></tr>}</Fragment>;})}{!visible.length&&<tr><td colSpan={6}><div className="empty-state"><strong>No AI systems match</strong><p>Try another filter or search. Your inventory has not been changed.</p></div></td></tr>}</tbody></table></div>
      <footer className="register-footer"><span>Showing {visible.length} of {rows.length} AI {rows.length===1?'system':'systems'}</span><span>Screening prioritizes governance attention; it is not a legal classification.</span></footer></section><footer className="concept-footer">AI system register</footer></main>;
}
