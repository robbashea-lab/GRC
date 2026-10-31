import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {CisBreadcrumb} from './BrawndoCisControls';
import {ProgramVisualToolbar,ProgramVisualColumns,ProgramVisualGroup} from './ProgramVisualPrimitives';
import IsoProgramRow from './IsoProgramRow';
import IsoProgramApplicabilityBar from './IsoProgramApplicabilityBar';
import {groupRequirements,hierarchyPath,matchesAssessment,sectionSummary} from '@/lib/frameworkWorkspace';
import {cisSummary} from '@/lib/cisVerification';
import {isoSoaCounts} from '@/lib/isoProgramPresentation';
import {operatorStatuses} from '@/lib/frameworkOperator';

const VIEW_LABELS={soa:'Statement of Applicability',isms_clause:'ISMS Requirements',annex_control:'Annex A Controls'};
const LABELS=operatorStatuses('iso-27001');
const FILTER_LABELS={all:'All',attention:'Needs attention',not_assessed:'Not assessed',stale:'Needs reassessment',...LABELS};
const APPLICABILITY_LABELS={all:'All controls',included:'Necessary',excluded:'Not Necessary',undetermined:'Decision needed'};
const ratio=(value,total)=>total>0?value/total:1;
const percentage=(value,total)=>total>0?`${(value/total*100).toFixed(1)}%`:'—';
const groupsFor=rows=>groupRequirements('iso-27001',rows).flatMap(node=>node.children.length?node.children:[node]);

export default function IsoProgramNavigator({clientId,view,rows,visible,filtered,filter='all',onFilter,filterLabel,search,onSearch,onClear,path,onPath,onOpen,onManage,selected,available=true,countsAvailable=true,applicability:controlledApplicability,onApplicability}){
  const [expanded,setExpanded]=useState([]),[localApplicability,setLocalApplicability]=useState('all'),[order,setOrder]=useState('program');
  const panelPrefix=useId(),register=useRef(null),pathKey=JSON.stringify(path||[]);
  const groups=useMemo(()=>groupsFor(rows),[rows]);
  const activePath=useMemo(()=>selected?hierarchyPath('iso-27001',selected)
    .map((_,index,parts)=>parts.slice(0,index+1).map(part=>part.id).join('/')):JSON.parse(pathKey),[selected,pathKey]);
  useEffect(()=>{setExpanded([]);setLocalApplicability('all');setOrder('program');},[clientId,view]);
  useEffect(()=>{
    if(activePath.length)setExpanded(current=>activePath.every(key=>current.includes(key))?current:[...new Set([...current,...activePath])]);
  },[clientId,view,activePath]);
  const applicability=controlledApplicability===undefined?localApplicability:controlledApplicability;
  const chooseApplicability=value=>{if(controlledApplicability===undefined)setLocalApplicability(value);onApplicability?.(value);};
  const soa=view==='soa',title=VIEW_LABELS[view]||'ISO 27001 requirements';
  const applicabilityFiltered=soa&&applicability!=='all',filtering=!!filtered||filter!=='all'||!!search.trim()||applicabilityFiltered;
  const matching=visible.filter(row=>!applicabilityFiltered||(row.soa_applicability||'undetermined')===applicability);
  const hitIds=new Set(matching.map(row=>row.framework_assessment_id));
  const shown=groups.map(node=>({...node,name:node.label,sub:'',available:soa?countsAvailable:available,
    summary:{...cisSummary(node.rows),available},soa:isoSoaCounts(node.rows),hits:node.rows.filter(row=>hitIds.has(row.framework_assessment_id))}))
    .filter(node=>!filtering||node.hits.length);
  if(order==='gaps'&&(soa?countsAvailable:available))shown.sort((a,b)=>soa?ratio(a.soa.documented,a.soa.total)-ratio(b.soa.documented,b.soa.total):ratio(a.summary.addressed,a.summary.applicable)-ratio(b.summary.addressed,b.summary.applicable));
  const allExpanded=shown.length>0&&shown.every(node=>expanded.includes(node.key));
  const clear=()=>{setExpanded([]);chooseApplicability('all');onClear();onPath([]);register.current?.querySelector('input[type="search"]')?.focus();};
  const trail=activePath.map(key=>groups.find(node=>node.key===key)).filter(Boolean);
  const contextualLabel=[filter!=='all'?filterLabel||FILTER_LABELS[filter]:null,applicabilityFiltered?APPLICABILITY_LABELS[applicability]:null].filter(Boolean).join(' · ')||filterLabel||'Search results';
  const crumbs=[{label:title,onClick:clear},...(filtering?[{label:contextualLabel}]:trail.map((node,index)=>({label:node.label,onClick:()=>onPath(trail.slice(0,index+1).map(part=>part.key))})))];
  const toggle=node=>{const open=expanded.includes(node.key);setExpanded(current=>open?current.filter(key=>key!==node.key):[...current,node.key]);onPath(open?[]:[node.key]);};
  const counts=Object.fromEntries(['all','attention','not_assessed','stale'].map(key=>[key,countsAvailable?rows.filter(row=>(view!=='annex_control'||key!=='not_assessed'||row.soa_applicability==='included')&&matchesAssessment(row,key)).length:'—']));
  const result=countsAvailable?`${matching.length} of ${rows.length} ${view==='isms_clause'?'requirements':'records'} in this view.`:'Record counts unavailable';
  const metadata=node=>{
    if(!countsAvailable)return 'Native record counts unavailable';
    const work=sectionSummary(node.rows),control=node.rows.every(row=>row.specification==='annex_control');
    return <>{node.rows.length} {control?'controls':'requirements'}{control&&<> · {node.soa.excluded} excluded · {node.soa.undetermined} applicability not determined</>}
      {soa&&<> · {node.soa.missingJustification} justification needed</>}
      {node.rows.every(row=>row.work?.context_complete===true)&&<> · {work.findings} open Findings · {work.reviews} linked Reviews</>}</>;
  };
  return <section ref={register} className="pcard iso-program-register" aria-labelledby={`${panelPrefix}-register`}>
    <ProgramVisualToolbar id={`${panelPrefix}-register`} title={title}
      description={soa?'Annex A applicability decisions and supporting documentation, grouped by native theme.':view==='isms_clause'?'ISMS requirements grouped by native clause.':view==='annex_control'?'Annex A reference controls grouped by native theme.':'Native ISMS requirements and Annex A controls grouped by clause and theme.'}
      search={search} onSearch={onSearch} searchLabel="Search requirements" filter={filter} onFilter={onFilter} counts={counts} filterLabels={FILTER_LABELS}
      order={order} onOrder={setOrder} orderOptions={soa?[['program','Program order'],['gaps','Least documented first']]:undefined}
      filterControls={soa?<label className="f-field">Applicability filter<select aria-label="Applicability filter" value={applicability} onChange={event=>chooseApplicability(event.target.value)}>{Object.entries(APPLICABILITY_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>:undefined}
      expand={{allOpen:allExpanded,onToggle:()=>{setExpanded(allExpanded?[]:shown.map(node=>node.key));if(allExpanded)onPath([]);}}}
      isFiltering={filtering} activeFilterLabel={contextualLabel} summary={<span className="iso-register-result-count">{result}</span>}
      breadcrumb={<CisBreadcrumb items={crumbs} label="ISO category location"/>} onClear={clear}/>
    <div className="reg"><ProgramVisualColumns groupingLabel={view==='isms_clause'?'Clause':view==='overview'?'Clause / theme':'Theme'}
      mixLabel={soa?'Applicability':'Status mix'} primaryLabel={soa?'Documented':'Implemented'} secondaryLabel={soa?'Decisions':'Assessed'}/>
      {shown.map(node=><ProgramVisualGroup key={node.key} group={node} filter={filter} noun={node.rows.every(row=>row.specification==='annex_control')?'controls':'requirements'} statusLabels={LABELS}
        dataControl={node.key} open={filtering||expanded.includes(node.key)} panelId={`${panelPrefix}-${node.key.replaceAll('/','-')}`} disabled={filtering}
        disabledReason={filtering?'Matching results stay expanded; clear filters to collapse.':undefined} onActivate={()=>toggle(node)} metadata={metadata(node)}
        statusBar={soa?<IsoProgramApplicabilityBar counts={node.soa} available={countsAvailable} filter={applicability}/>:undefined}
        primaryMeasure={soa?<><b>{countsAvailable?`${node.soa.documented} of ${node.soa.total}`:'Unavailable'}</b><span>{countsAvailable?percentage(node.soa.documented,node.soa.total):'—'}</span></>:undefined}
        secondaryMeasure={soa?<b>{countsAvailable?`${node.soa.decided} of ${node.soa.total}`:'—'}</b>:undefined}>
        {node.hits.map(row=><IsoProgramRow key={row.framework_assessment_id} {...{row,onOpen,onManage,soa}}/>)}</ProgramVisualGroup>)}
      {!shown.length&&<div className="empty" role="status"><h3>No {soa?'controls':'requirements'} match this view.</h3><p>Try a different search or filter.</p><button type="button" className="btn" onClick={clear}>Clear filters</button></div>}
    </div>
  </section>;
}
