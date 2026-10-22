import {useId,useLayoutEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronRight} from 'lucide-react';
import {CisStatusPill} from './CisStatus';
import {focusFallback,focusLost} from '@/lib/focusRescue';
import './BrawndoSecurityDomains.css';

const STATUS_COUNTS=[['addressed','Implemented'],['partial','Partial'],['gap','Not implemented'],['notAssessed','Not assessed'],['na','Not applicable']];

export default function BrawndoSecurityDomains({domains,selectedDomainId,onSelectDomain,onClearDomain,onOpen,implementationGroup}){
  const id=useId(),[expanded,setExpanded]=useState(new Set()),section=useRef(null),lastFocus=useRef(null);
  const group=implementationGroup??domains[0]?.implementationGroup;
  const selected=domains.find(domain=>domain.id===selectedDomainId);
  const toggle=domainId=>setExpanded(previous=>{const next=new Set(previous);next.has(domainId)?next.delete(domainId):next.add(domainId);return next;});
  useLayoutEffect(()=>{
    const previous=lastFocus.current;
    if(previous&&(!previous.element.isConnected||previous.element.closest('[hidden]'))){
      if(focusLost()||section.current?.contains(document.activeElement)){
        const fallback=[...section.current.querySelectorAll('.bcis-domain-toggle')].find(button=>button.closest('[data-domain-id]').dataset.domainId===previous.domainId);
        focusFallback(fallback||section.current.querySelector('h3'));
      }
      lastFocus.current=null;
    }
  },[domains,expanded,selectedDomainId]);
  return <section ref={section} className="bcis-domains" aria-labelledby={`${id}-heading`} onFocusCapture={event=>{lastFocus.current={element:event.target,domainId:event.target.closest('[data-domain-id]')?.dataset.domainId};}}>
    <div className="bcis-domains-heading"><div><h3 id={`${id}-heading`}>Security domains</h3><p className="bcis-note">Custom grouping of mapped CIS Controls v8.1 IG{group} safeguards.</p></div>
      <div className="bcis-domains-legend"><span><i className="bcis-domain-current-key" aria-hidden="true"/>Fully implemented</span><span><i className="bcis-domain-goal-key" aria-hidden="true"/>IG{group} goal (all applicable)</span></div>
    </div>
    {selected&&<div className="bcis-domain-selection"><span>Mapped controls: <strong>{selected.label}</strong></span><button type="button" className="bcis-chip-clear" onClick={onClearDomain}>Clear domain filter</button></div>}
    <div className="bcis-domain-columns" aria-hidden="true"><span>Security domain</span><span className="bcis-domain-axis"><span>0%</span><span>50%</span><span>100%</span></span><span>Implemented</span><span>Assessed</span></div>
    <div className="bcis-domain-list">{domains.map(domain=>{
      const open=expanded.has(domain.id),available=domain.available!==false,hasApplicable=available&&domain.applicable>0;
      const share=hasApplicable?domain.addressed/domain.applicable*100:0;
      const state=!available?'Implementation source unavailable':!hasApplicable?'No applicable safeguards':domain.assessed===0?'Not assessed':null;
      const panelId=`${id}-${domain.id}`,labelId=`${panelId}-label`;
      return <div key={domain.id} data-domain-id={domain.id} className={`bcis-domain${selectedDomainId===domain.id?' is-selected':''}`}>
        <button type="button" className="bcis-domain-toggle" data-testid={`security-domain-${domain.id}`} aria-expanded={open} aria-controls={panelId} onClick={()=>toggle(domain.id)}>
          <span className="bcis-domain-name"><ChevronDown size={16} aria-hidden="true" className={open?'is-open':''}/><span><span id={labelId}>{domain.label}</span><span className="bcis-domain-size">{available?`${domain.total} IG${group} ${domain.total===1?'safeguard':'safeguards'}`:'Counts unavailable'}</span></span></span>
          <span className={`bcis-domain-chart${hasApplicable?'':' is-unavailable'}`} aria-hidden="true"><span className="bcis-domain-track"/><span className="bcis-domain-midpoint"/>{hasApplicable&&<><span className="bcis-domain-fill" style={{width:`${share}%`}}/><span className="bcis-domain-current" style={{left:`${share}%`}}/></>}<span className="bcis-domain-goal"/></span>
          <span className="bcis-domain-metric"><span className="bcis-domain-mobile-label">Implemented</span><strong>{available?`${domain.addressed} of ${domain.applicable}`:'Unavailable'}</strong><span>{state||`${share.toFixed(1)}% of applicable`}</span></span>
          <span className="bcis-domain-metric"><span className="bcis-domain-mobile-label">Assessed</span><strong>{available?`${domain.assessed} of ${domain.applicable}`:'Unavailable'}</strong><span>{available&&domain.na>0?`${domain.na} not applicable`:hasApplicable?'applicable safeguards':''}</span></span>
        </button>
        <div id={panelId} className="bcis-domain-details" role="region" aria-labelledby={labelId} hidden={!open}>
          <div className="bcis-domain-detail-heading"><span>CIS {domain.controlIds.length===1?'Control':'Controls'} {domain.controlIds.join(', ')}</span><button type="button" className="bcis-btn" aria-pressed={selectedDomainId===domain.id} aria-label={`View mapped controls for ${domain.label}`} disabled={!available} onClick={()=>onSelectDomain(domain.id)}>View mapped controls</button></div>
          {!available?<p className="bcis-note" role="status">{domain.reason||'Implementation counts are unavailable.'}</p>:<div className="bcis-domain-statuses">{STATUS_COUNTS.filter(([key])=>domain[key]>0).map(([key,label])=><span key={key}>{domain[key]} {label}</span>)}</div>}
          {domain.notes&&<p className="bcis-note">{domain.notes}</p>}
          <ul className="bcis-domain-safeguards">{domain.rows.map(row=><li key={row.framework_assessment_id}><button type="button" className="bcis-domain-safeguard" data-testid={`domain-safeguard-${row.definition_id}`} aria-label={`Open safeguard ${row.definition_id} ${row.title}`} onClick={()=>onOpen(row)}><span className="bcis-domain-safeguard-name"><span className="bcis-sg-id">{row.definition_id}</span><span>{row.title}</span></span><CisStatusPill status={row.status} framework="cis-ig1"/><ChevronRight size={16} aria-hidden="true"/></button></li>)}</ul>
        </div>
      </div>;
    })}</div>
  </section>;
}
