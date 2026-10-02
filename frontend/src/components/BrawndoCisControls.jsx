import {useRef,useEffect,useMemo,useState} from 'react';
import {useRescueFocus} from '@/lib/focusRescue';
import api from '@/lib/api';
import {SearchField} from './Register';
import {CisStatusPill} from './CisStatus';
import {groupRequirements,sectionSummary} from '@/lib/frameworkWorkspace';
import {freshness} from '@/lib/cisVerification';

// Brawndo CIS IG1 controls: one breadcrumb (CIS IG1 › Control N › Safeguard N.M), whole-row navigation,
// and a high-level safeguard list. Filters and search narrow the list; they are not navigation.
export const VERIFICATION_LABELS={not_verified:'Not verified',needs_validation:'Needs validation',gap_identified:'Gap identified',verified:'Verified'};
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const verificationOf=row=>VERIFICATION_LABELS[row?.verification]?row.verification:'not_verified';
export function controlParts(label){const m=/^Control\s+(\d+)\s*[—-]\s*(.+)$/.exec(label||'');return m?{num:Number(m[1]),name:m[2]}:{num:null,name:label};}
const activate=fn=>e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}};

export function CisBreadcrumb({items,label='CIS IG1 location'}){
  // Drilling in or out replaces the activated row/crumb; lost focus moves to the current location.
  const current=useRef(null);useRescueFocus(current,items.map(c=>c.label).join('/'));
  return <nav aria-label={label} className="bcis-crumbs"><ol>{items.map((c,i)=>{const last=i===items.length-1;
    return <li key={c.label}>{last||!c.onClick?<span ref={last?current:undefined} aria-current={last?'page':undefined}>{c.label}</span>:<button type="button" onClick={c.onClick}>{c.label}</button>}</li>;})}</ol></nav>;
}

export default function BrawndoCisControls({clientId,rows,visible,filtered,filterLabel,search,onSearch,onClear,controlKey,onControl,onOpen,selected}){
  const [members,setMembers]=useState([]);
  useEffect(()=>{const c=new AbortController();if(clientId)api.get(`/clients/${encodeURIComponent(clientId)}/members`,{signal:c.signal}).then(r=>{if(!c.signal.aborted)setMembers(Array.isArray(r.data)?r.data:[]);}).catch(()=>{});return()=>c.abort();},[clientId]);
  const groups=useMemo(()=>groupRequirements('cis-ig1',rows),[rows]);
  const control=!filtered&&groups.find(g=>g.key===controlKey);
  const owner=id=>{const m=members.find(u=>u.user_id===id);return m?(m.name||m.email):id?'Owner unavailable':'Unassigned';};
  const crumbs=[{label:'CIS IG1',onClick:()=>{onClear();onControl('');}}];
  if(filtered)crumbs.push({label:filterLabel});
  else if(control)crumbs.push({label:`Control ${controlParts(control.label).num??''}`.trim(),onClick:()=>onControl(control.key)});
  if(selected)crumbs.push({label:`Safeguard ${selected.definition_id}`});
  const list=filtered?visible:control?control.rows:null;
  return <section className="bcis-card bcis-controls" aria-label="Controls">
    <div className="bcis-controls-bar">
      <CisBreadcrumb items={crumbs}/>
      <div className="bcis-controls-tools">{filtered&&<button type="button" className="bcis-chip-clear" onClick={onClear}>Clear filter</button>}<SearchField value={search} onChange={onSearch} label="Search safeguards" placeholder="Search by number or title…"/></div>
    </div>
    {control&&<p className="bcis-control-name">{controlParts(control.label).name}</p>}
    {list?<SafeguardList rows={list} owner={owner} onOpen={onOpen} label={filtered?filterLabel:control.label}/>:<ControlRows groups={groups} onControl={onControl} total={rows.length}/>}
  </section>;
}

function ControlRows({groups,onControl,total}){
  const present=new Set(groups.map(g=>controlParts(g.label).num)),absent=[...Array(18)].map((_,i)=>i+1).filter(i=>!present.has(i));
  return <><table className="bcis-table"><thead><tr><th scope="col">#</th><th scope="col">Control</th><th scope="col">Assessed</th><th scope="col">Needs attention</th></tr></thead>
    <tbody>{groups.map(g=>{const {num,name}=controlParts(g.label),s=sectionSummary(g.rows),applicable=s.total-(s.excluded||0),tone=!s.attention?'good':s.attention>=applicable?'critical':'attention';
      return <tr key={g.key} className="bcis-row" tabIndex={0} role="link" aria-label={`Open ${g.label}`} data-testid={'control-row-'+(num??g.key)} onClick={()=>onControl(g.key)} onKeyDown={activate(()=>onControl(g.key))}>
        <td className="bcis-num">{num??'—'}</td><td className="bcis-name">{name}</td><td>{s.assessed} of {applicable}</td>
        <td><span className={`bcis-att is-${tone}`}>{s.attention?`${s.attention} of ${applicable}`:'None'}</span></td></tr>;})}</tbody></table>
    <p className="bcis-foot">All {groups.length} IG1 controls · {total} safeguards.{absent.length&&!present.has(null)?` Control${absent.length===1?'':'s'} ${absent.join(', ').replace(/, (\d+)$/,' and $1')} ${absent.length===1?'has':'have'} no IG1 safeguards.`:''}</p></>;
}

function SafeguardList({rows,owner,onOpen,label}){
  if(!rows.length)return <p className="bcis-foot" role="status">No safeguards match this view.</p>;
  return <table className="bcis-table bcis-safeguards" aria-label={`${label}: ${rows.length} safeguards`}><thead><tr><th scope="col">Safeguard</th><th scope="col">Implementation status</th><th scope="col">Verification</th><th scope="col">Owner</th><th scope="col">Last assessed</th></tr></thead>
    <tbody>{rows.map(r=>{const v=verificationOf(r),fresh=freshness(r);
      return <tr key={r.framework_assessment_id} className="bcis-row" tabIndex={0} role="link" aria-label={`Open safeguard ${r.definition_id} ${r.title}`} data-testid={'requirement-'+r.definition_id} onClick={()=>onOpen(r)} onKeyDown={activate(()=>onOpen(r))}>
        <td><span className="bcis-sg"><span className="bcis-sg-id">{r.definition_id}</span><span className="bcis-name">{r.title}</span></span></td>
        <td><CisStatusPill status={r.status} framework="cis-ig1"/></td>
        <td><span className={`cis-flag cis-tone-${VERIFICATION_TONE[v]}`}>{VERIFICATION_LABELS[v]}</span></td>
        <td>{owner(r.owner_id)}</td>
        <td className="bcis-muted">{fresh.state==='never'?'Never':new Date(String(r.last_assessed).slice(0,10)+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</td></tr>;})}</tbody></table>;
}
