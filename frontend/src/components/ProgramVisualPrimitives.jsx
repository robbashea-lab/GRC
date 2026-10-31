import {ChevronRight,Search,ShieldCheck,ShieldAlert,Clock,Minus} from 'lucide-react';
import {freshness as assessmentFreshness} from '@/lib/cisVerification';
import {VERIFICATION_LABELS,verificationOf} from './BrawndoCisControls';

// Presentation keys follow the existing native conclusions; these views never change them.
export const PROGRAM_IMPLEMENTATION_LABELS={addressed:'Implemented',in_progress:'Partially implemented',needs_attention:'Not implemented',not_assessed:'Not assessed',not_applicable:'Not applicable'};
const SEGMENTS=[['addressed','impl','addressed'],['in_progress','part','partial'],['needs_attention','not','gap'],['not_assessed','none','notAssessed']];
const FILTER_LABELS={all:'All',attention:'Needs attention',not_assessed:'Not assessed',stale:'Needs reassessment',...PROGRAM_IMPLEMENTATION_LABELS};
const percent=(value,total)=>total>0?(value/total*100).toFixed(1):null;
const activate=callback=>event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();callback();}};

export function ProgramStatusBar({summary,filter,statusLabels=PROGRAM_IMPLEMENTATION_LABELS,onSegmentFilter}){
  const interactive=typeof onSegmentFilter==='function';
  const pick=key=>onSegmentFilter(filter===key?'all':key);
  return <span className={`sbar${SEGMENTS.some(([key])=>key===filter)?' hl':''}`} role={interactive?'group':'img'}
    aria-label={summary.available===false?'Status mix unavailable':SEGMENTS.map(([key,,count])=>`${statusLabels[key]??PROGRAM_IMPLEMENTATION_LABELS[key]}: ${summary[count]}`).join(', ')}>
    {summary.available!==false&&SEGMENTS.map(([key,tone,count])=>{
      const label=statusLabels[key]??PROGRAM_IMPLEMENTATION_LABELS[key];
      return summary[count]>0&&(interactive?<button type="button" key={key} className={`sbar-segment s-${tone}${key===filter?' on':''}`} style={{flex:summary[count]}}
        title={`${label}: ${summary[count]} of ${summary.applicable}`} aria-label={`${label}: ${summary[count]} of ${summary.applicable}`} aria-pressed={filter===key} onClick={()=>pick(key)}/>
        :<i key={key} className={`s-${tone}${key===filter?' on':''}`} style={{flex:summary[count]}} title={`${label}: ${summary[count]} of ${summary.applicable}`}/>);
    })}</span>;
}

export function ProgramVisualHeader({title,metadata,resume,onContinue,theme,onTheme,beforeTitle,className='',focusHeading=false}){
  return <header className={`page-head${className?` ${className}`:''}`}><div>{beforeTitle}<h1 tabIndex={focusHeading?-1:undefined}>{title}</h1><p>{metadata}</p></div>
    <div className="head-actions"><button type="button" className="ghost" aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} onClick={onTheme}><svg viewBox="0 0 16 16" aria-hidden="true"><circle className="ic" cx="8" cy="8" r="3"/><path className="ic" d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15"/></svg>{theme==='dark'?'Light':'Dark'}</button>
      {resume&&<button type="button" className="btn primary" onClick={onContinue}>Continue: {resume.definition_id} {resume.title}</button>}</div></header>;
}

export function ProgramVisualSnapshot({summary:s,filter,onFilter,asOf,noun='safeguards',id='cis-visual-snapshot',statusLabels=PROGRAM_IMPLEMENTATION_LABELS,qualification='Assessment progress, not a compliance percentage or certification. Freshness is separate from saved verification.',onSegmentFilter,onNotApplicable}){
  const available=s.available!==false,pick=key=>onFilter(filter===key?'all':key);
  return <section className="pcard" aria-labelledby={id}><h2 id={id} className="sr-only">Program snapshot</h2>
    <div className="snap"><div className="now-head"><span className="now-label">Current implementation</span>
      <strong className="now-value">{available&&s.applicable>0?percent(s.addressed,s.applicable):'—'}{available&&s.applicable>0&&<span className="unit">%</span>}</strong>
      <p>{available?`${s.addressed} of ${s.applicable} ${noun} implemented`:'Implementation source unavailable'}</p><small>{asOf?`As of ${asOf}`:'Assessment date unavailable'}</small></div>
      <div className="now-detail"><div className="bd-head"><span className="bd-title">Status of {available?s.applicable:'—'} applicable {noun}</span><span>Assessed {available?s.assessed:'—'} of {available?s.applicable:'—'} · {available&&s.applicable>0?`${percent(s.assessed,s.applicable)}%`:'—'}</span></div>
        <ProgramStatusBar summary={s} filter={filter} statusLabels={statusLabels} onSegmentFilter={onSegmentFilter}/><div className="lg" role="group" aria-label="Filter by status">{SEGMENTS.map(([key,tone,count])=><button type="button" key={key} className="lg-cell" aria-pressed={filter===key} onClick={()=>pick(key)}>
          <span className="lg-label"><i className={`key s-${tone}${tone==='none'?' k-none':''}`}/>{statusLabels[key]??PROGRAM_IMPLEMENTATION_LABELS[key]}</span><span className="lg-val"><b>{available&&s.applicable>0?`${percent(s[count],s.applicable)}%`:'—'}</b><span>{available?`${s[count]} of ${s.applicable}`:'Unavailable'}</span></span></button>)}</div></div></div>
    <div className="card-foot">{qualification}{s.na>0&&(onNotApplicable?available&&<><span> </span><button type="button" className="link" aria-pressed={filter==='not_applicable'} onClick={()=>onNotApplicable(filter==='not_applicable'?'all':'not_applicable')}>{s.na} not applicable, excluded from implementation totals.</button></>:<> {s.na} not applicable, excluded from implementation totals.</>)}{!available&&<> {s.reason||'Refresh the program to retrieve implementation counts.'}</>}</div></section>;
}

export function ProgramVisualToolbar({id,title,description,grouping,search,onSearch,searchLabel='Search safeguards',filter,onFilter,counts,order,onOrder,expand,summary,breadcrumb,onClear,filterLabels=FILTER_LABELS}){
  const filtering=filter!=='all'||!!search.trim();
  return <><div className="card-head"><div><h2 id={id} tabIndex={-1}>{title}</h2><p>{description}</p></div>
    {grouping&&<div className="seg" role="group" aria-label="Group by">{grouping.options.map(([key,label])=><button type="button" key={key} aria-pressed={grouping.value===key} onClick={()=>grouping.onChange(key)}>{label}</button>)}</div>}</div>
    <div className="filters"><label className="f-search"><span className="sr-only">{searchLabel}</span><Search aria-hidden="true"/><input type="search" placeholder={`${searchLabel}…`} value={search} onChange={event=>onSearch(event.target.value)}/></label>
      <div className="seg" role="group" aria-label={`Show ${searchLabel.replace(/^Search /,'')}`}>{['all','attention','not_assessed','stale'].map(key=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>onFilter(key)}>{filterLabels[key]}<span className="n">{counts[key]}</span></button>)}</div>
      <div className="f-right"><label className="f-field">Order<select value={order} onChange={event=>onOrder(event.target.value)}><option value="program">Program order</option><option value="gaps">Least implemented first</option></select></label>
        {!filtering&&expand&&<button type="button" className="link" onClick={expand.onToggle}>{expand.allOpen?'Collapse all':'Expand all'}</button>}</div></div>
    <div className="summary"><span role="status">{summary}</span>{breadcrumb}{filtering&&<span className="chip-x">{filterLabels[filter]||'Search results'}{search.trim()&&` · ${search.trim()}`}<button type="button" aria-label="Clear search and filters" onClick={onClear}>×</button></span>}</div></>;
}

export function ProgramVisualColumns({groupingLabel}){
  return <div className="ghead" aria-hidden="true"><span/><span>{groupingLabel}</span><span>Status mix</span><span className="r">Implemented</span><span className="r">Assessed</span></div>;
}

export function ProgramVisualGroup({group,filter,open,panelId,onActivate,dataControl,testId,noun='safeguards',statusLabels,disabled=false,disabledReason,children}){
  const s=group.summary;
  return <div className={`grp${open?' open':''}`}>
    <button type="button" className="grow" data-control={dataControl} data-testid={testId} aria-expanded={open} aria-controls={panelId} aria-describedby={disabledReason?`${panelId}-reason`:undefined} disabled={disabled||undefined} onClick={onActivate}>
      <span className="g-car"><ChevronRight className="caret" aria-hidden="true"/></span><span className="gname"><b>{group.name}</b><small>{group.available?`${group.rows.length} ${noun}`:`${noun==='safeguards'?'Safeguard':'Criterion'} data unavailable`}{group.sub&&<> · {group.sub}</>}{s.na>0?` · ${s.na} not applicable`:''}</small></span>
      <span className="gbar"><ProgramStatusBar summary={s} filter={filter} statusLabels={statusLabels}/></span><span className="fig r g-impl"><b>{group.available?`${s.addressed} of ${s.applicable}`:'Unavailable'}</b><span>{group.available&&s.applicable>0?`${percent(s.addressed,s.applicable)}%`:'—'}</span></span><span className="fig r g-ass"><b>{group.available?`${s.assessed} of ${s.applicable}`:'—'}</b></span></button>
    {disabledReason&&<span className="sr-only" id={`${panelId}-reason`}>{disabledReason}</span>}
    {open&&<div className="sgs" id={panelId}>{children}</div>}</div>;
}

function linkedWorkSummary(work){
  const signals=[['open_findings','open Finding'],['overdue_actions','overdue Action Item'],['overdue_reviews','overdue Review']];
  if(work?.context_complete!==true||signals.some(([key])=>!Number.isInteger(work[key])||work[key]<0))return 'Linked work unavailable';
  const labels=signals.filter(([key])=>work[key]>0).map(([key,label])=>`${work[key]} ${label}${work[key]===1?'':'s'}`);
  return labels.length?`Linked work: ${labels.join(' · ')}`:null;
}

export function ProgramVisualRow({row,onOpen,statusLabels=PROGRAM_IMPLEMENTATION_LABELS,freshness,secondaryInfo,management,ariaLabel}){
  const segment=SEGMENTS.find(([key])=>key===row.status),verification=verificationOf(row);
  const fresh=freshness===undefined?assessmentFreshness(row):freshness;
  const workSummary=linkedWorkSummary(row.work);
  const Icon=verification==='verified'?ShieldCheck:verification==='gap_identified'?ShieldAlert:verification==='needs_validation'?Clock:Minus;
  const Row=management?'div':'button';
  return <Row type={management?undefined:'button'} role={management?'link':undefined} tabIndex={management?0:undefined} className="sg" aria-label={ariaLabel} data-testid={`requirement-${row.definition_id}`} onClick={()=>onOpen(row)}
    onKeyDown={management?event=>{if(event.target===event.currentTarget)activate(()=>onOpen(row))(event);}:undefined}>
    <span className="sg-id">{row.definition_id}</span><span className="sg-t">{row.title}{(workSummary||secondaryInfo||management)&&<small className={secondaryInfo||management?'sg-secondary-info':undefined}>{workSummary}{secondaryInfo&&<>{workSummary?' · ':''}{secondaryInfo}</>}{management&&<span className="sg-management" onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}> · {management}</span>}</small>}</span>
    <span className="st"><i className={`s-${segment?.[1]||'none'}`}/>{segment?(statusLabels[row.status]??PROGRAM_IMPLEMENTATION_LABELS[row.status]):row.status==='not_applicable'?(statusLabels.not_applicable??'Not applicable'):'Status unavailable'}</span>
    <span className={`ver v-${verification}`}><Icon size={14} aria-hidden="true"/><span>{VERIFICATION_LABELS[verification]}<small>{fresh?.label??'Assessment date unavailable'}</small></span></span><span className="chev" aria-hidden="true">›</span></Row>;
}
