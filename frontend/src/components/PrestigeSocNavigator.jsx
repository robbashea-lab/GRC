import {FrameworkRecordButton} from './FrameworkRecordAccess';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import api from '@/lib/api';
import {CIS_TONE} from './CisStatus';
import {CisBreadcrumb} from './BrawndoCisControls';
import {groupRequirements} from '@/lib/frameworkWorkspace';
import {cisSummary} from '@/lib/cisVerification';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {SOC_PROGRAM_STATUS_LABELS,socProgramFreshness,socProgramMatches} from '@/lib/socProgramPresentation';
import {ProgramVisualToolbar,ProgramVisualColumns,ProgramVisualGroup,ProgramVisualRow} from './ProgramVisualPrimitives';

// Native editor/Dashboard callers keep their established vocabulary.
export const SOC_STATUS_LABELS=operatorStatuses('soc-2');
const CATEGORY_LABELS={security:'Security — Common Criteria',availability:'Availability',confidentiality:'Confidentiality',processing_integrity:'Processing Integrity',privacy:'Privacy'};
const CATEGORY_CRUMBS={security:'Security',availability:'Availability',confidentiality:'Confidentiality',processing_integrity:'Processing Integrity',privacy:'Privacy'};
export const socCategoryLabel=key=>CATEGORY_LABELS[key]||key?.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
export const socCategoryCrumb=key=>CATEGORY_CRUMBS[key]||socCategoryLabel(key);
export function SocStatusPill({status}){return <span className={`cis-pill cis-tone-${CIS_TONE[status]||'neutral'}`}><span className="cis-dot" aria-hidden="true"/>{SOC_STATUS_LABELS[status]||'Not Assessed'}</span>;}
const implementationShare=summary=>summary.applicable?summary.addressed/summary.applicable:1;

export default function PrestigeSocNavigator({clientId,rows=[],visible=[],filtered,filter='all',onFilter,filterLabel,search,onSearch,onClear,path,onPath,onOpen,onManage,selected,categoryId='',onCategory,available=true,retainedRows=[]}){
  const [memberContext,setMemberContext]=useState({clientId:null,rows:[]});
  const [expandedGroups,setExpandedGroups]=useState([]),[order,setOrder]=useState('program');
  const panelPrefix=useId(),register=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();
    setMemberContext({clientId,rows:[]});
    if(clientId)api.get(`/clients/${encodeURIComponent(clientId)}/members`,{signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted)setMemberContext({clientId,rows:Array.isArray(data)?data:[]});}).catch(()=>{});
    return()=>controller.abort();
  },[clientId]);
  useEffect(()=>{setExpandedGroups([]);setOrder('program');},[clientId]);
  useEffect(()=>{setExpandedGroups([]);},[categoryId]);
  const categories=useMemo(()=>groupRequirements('soc-2',rows),[rows]);
  const groupId=selected?.category===categoryId?selected.control:path?.[0]===categoryId?path[1]:null;
  const category=categories.find(item=>item.id===categoryId),group=category?.children?.find(item=>item.id===groupId);
  useEffect(()=>{
    if(categoryId&&groupId){const key=`${categoryId}/${groupId}`;setExpandedGroups(current=>current.includes(key)?current:[...current,key]);}
  },[clientId,categoryId,groupId]);
  const members=memberContext.clientId===clientId?memberContext.rows:[];
  const owner=id=>{const member=members.find(user=>user.user_id===id);return member?(member.name||member.email):id?'Owner unavailable':'Unassigned';};
  const clear=()=>{setExpandedGroups([]);onClear();register.current?.querySelector('input[type="search"]')?.focus();};
  const crumbs=[{label:'SOC 2',onClick:()=>onCategory('')}];
  if(category){crumbs.push({label:socCategoryCrumb(category.id),onClick:()=>onPath([category.id])});if(!filtered&&group)crumbs.push({label:group.id,onClick:()=>onPath([category.id,group.id])});}
  if(filtered)crumbs.push({label:filterLabel});
  if(selected)crumbs.push({label:selected.definition_id});
  const scopeRows=category?category.rows:rows;
  const matchingRows=category?visible.filter(row=>row.category===category.id):visible;
  const hitIds=new Set(matchingRows.map(row=>row.framework_assessment_id));
  const shown=(category?category.children:categories).map(item=>{
    const summary=cisSummary(item.rows);
    return {...item,name:category?item.label:socCategoryLabel(item.id),sub:'',available,
      summary:{...summary,available,na:available?summary.na:0},hits:item.rows.filter(row=>hitIds.has(row.framework_assessment_id))};
  }).filter(item=>!filtered||item.hits.length);
  if(order==='gaps'&&available)shown.sort((a,b)=>implementationShare(a.summary)-implementationShare(b.summary));
  const allExpanded=shown.length>0&&shown.every(item=>expandedGroups.includes(item.key));
  const toggleGroup=item=>{
    const open=expandedGroups.includes(item.key);
    setExpandedGroups(current=>open?current.filter(key=>key!==item.key):[...current,item.key]);
    onPath(open?[categoryId]:[categoryId,item.id]);
  };
  const rootResults=!category&&filtered;
  const orderedResults=order==='gaps'&&available?matchingRows.map(row=>({row,summary:cisSummary([row])}))
    .sort((a,b)=>implementationShare(a.summary)-implementationShare(b.summary)).map(item=>item.row):matchingRows;
  const counts=Object.fromEntries(['all','attention','not_assessed','stale'].map(key=>[key,available?scopeRows.filter(row=>socProgramMatches(row,key)).length:'—']));
  const description=!available?'Selected SOC 2 criteria.':category?`All ${scopeRows.length} criteria in this category, grouped by criteria group.`:
    `All ${rows.length} criteria in ${categories.length} selected Trust Services ${categories.length===1?'Category':'Categories'}.`;
  const result=!available?'Criterion counts unavailable':filtered?`${matchingRows.length} matching criteria`:
    category?`${scopeRows.length} criteria in ${category.children.length} groups`:`${rows.length} criteria across ${categories.length} Trust Services ${categories.length===1?'Category':'Categories'}`;
  const renderRow=row=><ProgramVisualRow key={row.framework_assessment_id} row={row} onOpen={onOpen} statusLabels={SOC_PROGRAM_STATUS_LABELS}
    ariaLabel={`Open criterion ${row.definition_id} ${row.title}`} freshness={socProgramFreshness(row)} secondaryInfo={`Owner: ${owner(row.owner_id)}`}
    management={onManage?<FrameworkRecordButton record={row} onManage={onManage}/>:undefined}/>;
  return <section ref={register} className="pcard soc-criteria-register" aria-labelledby={`${panelPrefix}-register`}>
    <ProgramVisualToolbar id={`${panelPrefix}-register`} title="SOC 2 criteria" description={description}
      search={search} onSearch={onSearch} searchLabel="Search criteria" filter={filter} onFilter={onFilter} counts={counts} order={order} onOrder={setOrder}
      expand={category?{allOpen:allExpanded,onToggle:()=>{setExpandedGroups(allExpanded?[]:shown.map(item=>item.key));if(allExpanded)onPath([categoryId]);}}:undefined}
      summary={<span className="soc-register-result-count">{result}</span>} breadcrumb={<CisBreadcrumb items={crumbs} label="SOC 2 location"/>}
      onClear={clear} filterLabels={{all:'All',attention:'Needs attention',stale:'Needs reassessment',...SOC_PROGRAM_STATUS_LABELS}}/>
    {rootResults?<div className="reg"><div className="sgs" aria-label={filterLabel}>{orderedResults.map(renderRow)}{!orderedResults.length&&<div className="empty" role="status"><h3>No criteria match</h3><p>Try a different search or filter.</p><button type="button" className="btn" onClick={clear}>Clear filters</button></div>}</div></div>:
      <div className="reg"><ProgramVisualColumns groupingLabel={category?'Criteria group':'Trust Services Category'}/>
        {shown.map(item=><ProgramVisualGroup key={item.key} group={item} filter={filter} noun="criteria" statusLabels={SOC_PROGRAM_STATUS_LABELS}
          testId={category?`soc-group-${item.id}`:`soc-category-${item.id}`} open={category?(filtered||expandedGroups.includes(item.key)):undefined}
          panelId={category?`${panelPrefix}-${categoryId}-${item.id}`:undefined} disabled={!!category&&filtered}
          disabledReason={category&&filtered?'Matching results stay expanded; clear filters to collapse.':undefined}
          onActivate={()=>category?toggleGroup(item):onCategory(item.id)}>
          {category&&item.hits.map(renderRow)}</ProgramVisualGroup>)}
        {!shown.length&&<div className="empty" role="status"><h3>No criteria match</h3><p>Try a different search or filter.</p><button type="button" className="btn" onClick={clear}>Clear filters</button></div>}
      </div>}
    {retainedRows.length>0&&<section aria-label="Retained out-of-scope criteria"><div className="card-head"><div><h2>Retained out-of-scope criteria</h2><p>Outside the selected SOC 2 scope; excluded from implementation totals.</p></div></div><div className="reg"><div className="sgs">{retainedRows.map(renderRow)}</div></div></section>}
  </section>;
}
