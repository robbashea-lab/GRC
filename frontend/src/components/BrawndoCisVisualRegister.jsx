import {useEffect,useMemo,useRef,useState} from 'react';
import {groupRequirements,matchesAssessment} from '@/lib/frameworkWorkspace';
import {cisSummary} from '@/lib/cisVerification';
import {ProgramVisualHeader,ProgramVisualSnapshot,ProgramVisualToolbar,ProgramVisualColumns,ProgramVisualGroup,ProgramVisualRow} from './ProgramVisualPrimitives';

export function CisVisualHeader({rows,summary,asOf,resume,onContinue,theme,onTheme,implementationGroup}){
  const metadata=<>CIS Controls v8.1 · Implementation Group {implementationGroup} · {groupRequirements('cis-ig1',rows).length} controls · {summary.total} safeguards{asOf?` · As of ${asOf}`:''}</>;
  return <ProgramVisualHeader title={<>CIS IG{implementationGroup}</>} metadata={metadata} {...{resume,onContinue,theme,onTheme}}/>;
}

export function CisVisualSnapshot(props){return <ProgramVisualSnapshot {...props}/>;}

export default function CisVisualRegister({rows,visible,domains,filter,search,onFilter,onSearch,onClear,onOpen,controlKey='',onResetControl,implementationGroup}){
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
  return <section ref={register} className="pcard" aria-labelledby="cis-visual-register">
    <ProgramVisualToolbar id="cis-visual-register" title="Safeguards" description={`All ${rows.length} IG${implementationGroup} safeguards in one register. Group them by security domain or by CIS control.`}
      grouping={{value:grouping,options:[['domain','Security domain'],['control','CIS control']],onChange:selectGrouping}}
      {...{search,onSearch,filter,onFilter,counts,order,onClear}} onOrder={setOrder}
      expand={{allOpen,onToggle:()=>setExpanded(allOpen?[]:shown.map(group=>group.key))}}
      summary={groups.some(group=>!group.available)?'Safeguard counts unavailable':`${shown.reduce((n,group)=>n+group.hits.length,0)} safeguards in ${shown.length} ${grouping==='domain'?'domains':'controls'}`}/>
    <div className="reg"><ProgramVisualColumns groupingLabel={grouping==='domain'?'Security domain':'CIS control'}/>
      {!shown.length&&<div className="empty"><h3>No safeguards match</h3><p>Try a different search or filter.</p><button type="button" className="btn" onClick={onClear}>Clear filters</button></div>}
      {shown.map(group=><ProgramVisualGroup key={group.key} group={group} filter={filter} open={filtering||expanded.includes(group.key)} panelId={`cis-visual-group-${group.key}`} dataControl={grouping==='control'?group.key:undefined}
        onActivate={()=>setExpanded(old=>old.includes(group.key)?old.filter(key=>key!==group.key):[...old,group.key])}>
        {group.hits.map(row=><ProgramVisualRow key={row.framework_assessment_id} row={row} onOpen={onOpen}/>)}</ProgramVisualGroup>)}
    </div></section>;
}
