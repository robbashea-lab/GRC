import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronRight,Search,ShieldCheck,ShieldAlert,Clock,Minus} from 'lucide-react';
import {groupRequirements,matchesAssessment} from '@/lib/frameworkWorkspace';
import {cisSummary,freshness} from '@/lib/cisVerification';
import {VERIFICATION_LABELS,verificationOf} from './BrawndoCisControls';

const SEGMENTS = [
  ['addressed','Implemented','impl','addressed'], ['in_progress','Partially implemented','part','partial'],
  ['needs_attention','Not implemented','not','gap'], ['not_assessed','Not assessed','none','notAssessed'],
];
const percent = (value,total) => total > 0 ? (value / total * 100).toFixed(1) : null;
const filterLabels = {all:'All',attention:'Needs attention',not_assessed:'Not assessed',stale:'Needs reassessment',
  addressed:'Implemented',in_progress:'Partially implemented',needs_attention:'Not implemented',not_applicable:'Not applicable'};

function StatusBar({summary,filter}) {
  return <span className={`sbar${SEGMENTS.some(([key])=>key===filter)?' hl':''}`} role="img"
    aria-label={summary.available===false?'Status mix unavailable':SEGMENTS.map(([,label,,key])=>`${label}: ${summary[key]}`).join(', ')}>
    {summary.available!==false&&SEGMENTS.map(([key,label,tone,count])=>summary[count]>0&&<i key={key}
      className={`s-${tone}${key===filter?' on':''}`} style={{flex:summary[count]}} title={`${label}: ${summary[count]} of ${summary.applicable}`}/>)}</span>;
}

export function CisVisualHeader({rows,summary,asOf,resume,onContinue,theme,onTheme,implementationGroup}) {
  return <header className="page-head"><div><h1>CIS IG{implementationGroup}</h1><p>CIS Controls v8.1 · Implementation Group {implementationGroup} · {groupRequirements('cis-ig1',rows).length} controls · {summary.total} safeguards{asOf?` · As of ${asOf}`:''}</p></div>
    <div className="head-actions"><button type="button" className="ghost" aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} onClick={onTheme}><svg viewBox="0 0 16 16" aria-hidden="true"><circle className="ic" cx="8" cy="8" r="3"/><path className="ic" d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15"/></svg>{theme==='dark'?'Light':'Dark'}</button>
      {resume&&<button type="button" className="btn primary" onClick={onContinue}>Continue: {resume.definition_id} {resume.title}</button>}</div></header>;
}

export function CisVisualSnapshot({summary:s,filter,onFilter,asOf}) {
  const available=s.available!==false, pick=key=>onFilter(filter===key?'all':key);
  return <section className="pcard" aria-labelledby="cis-visual-snapshot"><h2 id="cis-visual-snapshot" className="sr-only">Program snapshot</h2>
    <div className="snap"><div className="now-head"><span className="now-label">Current implementation</span>
      <strong className="now-value">{available&&s.applicable>0?percent(s.addressed,s.applicable):'—'}{available&&s.applicable>0&&<span className="unit">%</span>}</strong>
      <p>{available?`${s.addressed} of ${s.applicable} safeguards implemented`:'Implementation source unavailable'}</p><small>{asOf?`As of ${asOf}`:'Assessment date unavailable'}</small></div>
      <div className="now-detail"><div className="bd-head"><span className="bd-title">Status of {available?s.applicable:'—'} applicable safeguards</span><span>Assessed {available?s.assessed:'—'} of {available?s.applicable:'—'} · {available&&s.applicable>0?`${percent(s.assessed,s.applicable)}%`:'—'}</span></div>
        <StatusBar summary={s} filter={filter}/><div className="lg" role="group" aria-label="Filter by status">{SEGMENTS.map(([key,label,tone,count])=><button type="button" key={key} className="lg-cell" aria-pressed={filter===key} onClick={()=>pick(key)}>
          <span className="lg-label"><i className={`key s-${tone}${tone==='none'?' k-none':''}`}/>{label}</span><span className="lg-val"><b>{available&&s.applicable>0?`${percent(s[count],s.applicable)}%`:'—'}</b><span>{available?`${s[count]} of ${s.applicable}`:'Unavailable'}</span></span></button>)}</div></div></div>
    <div className="card-foot">Assessment progress, not a compliance percentage or certification. Freshness is separate from saved verification.{s.na>0&&<> {s.na} not applicable, excluded from implementation totals.</>}{!available&&<> {s.reason||'Refresh the program to retrieve implementation counts.'}</>}</div></section>;
}

function linkedWorkSummary(work) {
  const signals=[['open_findings','open Finding'],['overdue_actions','overdue Action Item'],['overdue_reviews','overdue Review']];
  if(work?.context_complete!==true||signals.some(([key])=>!Number.isInteger(work[key])||work[key]<0))return 'Linked work unavailable';
  const labels=signals.filter(([key])=>work[key]>0).map(([key,label])=>`${work[key]} ${label}${work[key]===1?'':'s'}`);
  return labels.length?`Linked work: ${labels.join(' · ')}`:null;
}

function SafeguardRow({row,onOpen}) {
  const segment=SEGMENTS.find(([key])=>key===row.status), verification=verificationOf(row), fresh=freshness(row);
  const workSummary=linkedWorkSummary(row.work);
  const Icon=verification==='verified'?ShieldCheck:verification==='gap_identified'?ShieldAlert:verification==='needs_validation'?Clock:Minus;
  return <button type="button" className="sg" data-testid={`requirement-${row.definition_id}`} onClick={()=>onOpen(row)}>
    <span className="sg-id">{row.definition_id}</span><span className="sg-t">{row.title}{workSummary&&<small>{workSummary}</small>}</span>
    <span className="st"><i className={`s-${segment?.[2]||'none'}`}/>{segment?.[1]||(row.status==='not_applicable'?'Not applicable':'Status unavailable')}</span>
    <span className={`ver v-${verification}`}><Icon size={14} aria-hidden="true"/><span>{VERIFICATION_LABELS[verification]}<small>{fresh.label}</small></span></span><span className="chev" aria-hidden="true">›</span></button>;
}

export default function CisVisualRegister({rows,visible,domains,filter,search,onFilter,onSearch,onClear,onOpen,controlKey='',onResetControl,implementationGroup}) {
  const [grouping,setGrouping]=useState('domain'),[order,setOrder]=useState('program'),[expanded,setExpanded]=useState([]);
  const register=useRef(null);
  useEffect(()=>{if(controlKey){setGrouping('control');setExpanded([controlKey]);}},[controlKey]);
  useEffect(()=>{if(controlKey&&grouping==='control'){const button=register.current?.querySelector(`[data-control="${CSS.escape(controlKey)}"]`);button?.focus();button?.scrollIntoView?.({block:'nearest'});}},[controlKey,grouping]);
  const filtering=filter!=='all'||!!search.trim(),hitIds=new Set(visible.map(row=>row.framework_assessment_id));
  const groups=useMemo(()=>grouping==='domain'?domains.map(domain=>({key:domain.id,name:domain.label,sub:`CIS Controls ${domain.controlIds.join(', ')}`,rows:domain.rows,available:domain.available}))
    :groupRequirements('cis-ig1',rows).map(group=>({key:group.key,name:group.label.replace(/^Control (\d+) [—-] /,'$1. '),sub:`CIS Control ${group.id}`,rows:group.rows,available:domains.length>0&&domains.every(domain=>domain.available)})),[grouping,domains,rows]);
  const shown=groups.map(group=>({...group,hits:group.rows.filter(row=>hitIds.has(row.framework_assessment_id)),summary:{...cisSummary(group.rows),available:group.available}})).filter(group=>!filtering||group.hits.length);
  if(order==='gaps')shown.sort((a,b)=>(a.summary.applicable?a.summary.addressed/a.summary.applicable:1)-(b.summary.applicable?b.summary.addressed/b.summary.applicable:1));
  const allOpen=shown.length>0&&shown.every(group=>expanded.includes(group.key));
  const selectGrouping=value=>{setGrouping(value);setExpanded([]);onResetControl?.();};
  const counts=Object.fromEntries(['all','attention','not_assessed','stale'].map(key=>[key,rows.filter(row=>matchesAssessment(row,key)).length]));
  return <section ref={register} className="pcard" aria-labelledby="cis-visual-register"><div className="card-head"><div><h2 id="cis-visual-register" tabIndex={-1}>Safeguards</h2><p>All {rows.length} IG{implementationGroup} safeguards in one register. Group them by security domain or by CIS control.</p></div>
    <div className="seg" role="group" aria-label="Group by">{[['domain','Security domain'],['control','CIS control']].map(([key,label])=><button type="button" key={key} aria-pressed={grouping===key} onClick={()=>selectGrouping(key)}>{label}</button>)}</div></div>
    <div className="filters"><label className="f-search"><span className="sr-only">Search safeguards</span><Search aria-hidden="true"/><input type="search" placeholder="Search safeguards…" value={search} onChange={event=>onSearch(event.target.value)}/></label>
      <div className="seg" role="group" aria-label="Show safeguards">{['all','attention','not_assessed','stale'].map(key=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>onFilter(key)}>{filterLabels[key]}<span className="n">{counts[key]}</span></button>)}</div>
      <div className="f-right"><label className="f-field">Order<select value={order} onChange={event=>setOrder(event.target.value)}><option value="program">Program order</option><option value="gaps">Least implemented first</option></select></label>
        {!filtering&&<button type="button" className="link" onClick={()=>setExpanded(allOpen?[]:shown.map(group=>group.key))}>{allOpen?'Collapse all':'Expand all'}</button>}</div></div>
    <div className="summary"><span role="status">{groups.some(group=>!group.available)?'Safeguard counts unavailable':`${shown.reduce((n,group)=>n+group.hits.length,0)} safeguards in ${shown.length} ${grouping==='domain'?'domains':'controls'}`}</span>{filtering&&<span className="chip-x">{filterLabels[filter]||'Search results'}{search.trim()&&` · ${search.trim()}`}<button type="button" aria-label="Clear search and filters" onClick={onClear}>×</button></span>}</div>
    <div className="reg"><div className="ghead" aria-hidden="true"><span/><span>{grouping==='domain'?'Security domain':'CIS control'}</span><span>Status mix</span><span className="r">Implemented</span><span className="r">Assessed</span></div>
      {!shown.length&&<div className="empty"><h3>No safeguards match</h3><p>Try a different search or filter.</p><button type="button" className="btn" onClick={onClear}>Clear filters</button></div>}
      {shown.map(group=>{const open=filtering||expanded.includes(group.key),s=group.summary;return <div key={group.key} className={`grp${open?' open':''}`}>
        <button type="button" className="grow" data-control={grouping==='control'?group.key:undefined} aria-expanded={open} aria-controls={`cis-visual-group-${group.key}`} onClick={()=>setExpanded(old=>old.includes(group.key)?old.filter(key=>key!==group.key):[...old,group.key])}>
          <span className="g-car"><ChevronRight className="caret" aria-hidden="true"/></span><span className="gname"><b>{group.name}</b><small>{group.available?`${group.rows.length} safeguards`:'Safeguard data unavailable'} · {group.sub}{s.na>0?` · ${s.na} not applicable`:''}</small></span>
          <span className="gbar"><StatusBar summary={s} filter={filter}/></span><span className="fig r g-impl"><b>{group.available?`${s.addressed} of ${s.applicable}`:'Unavailable'}</b><span>{group.available&&s.applicable>0?`${percent(s.addressed,s.applicable)}%`:'—'}</span></span><span className="fig r g-ass"><b>{group.available?`${s.assessed} of ${s.applicable}`:'—'}</b></span></button>
        {open&&<div className="sgs" id={`cis-visual-group-${group.key}`}>{group.hits.map(row=><SafeguardRow key={row.framework_assessment_id} row={row} onOpen={onOpen}/>)}</div>}</div>;})}</div></section>;
}
