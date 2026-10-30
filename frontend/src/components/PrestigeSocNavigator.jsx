import {FrameworkRecordButton} from './FrameworkRecordAccess';
import {useEffect,useId,useMemo,useState} from 'react';
import {ChevronRight} from 'lucide-react';
import api from '@/lib/api';
import {SearchField} from './Register';
import {CIS_TONE,CisStatusBar,statusCounts} from './CisStatus';
import {CisBreadcrumb,VERIFICATION_LABELS,verificationOf} from './BrawndoCisControls';
import {groupRequirements,sectionSummary} from '@/lib/frameworkWorkspace';
import {socAssessmentDate} from '@/lib/socAssessmentDates';
import {operatorStatuses} from '@/lib/frameworkOperator';
import './SocCriteriaRegister.css';

export const SOC_STATUS_LABELS=operatorStatuses('soc-2');
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
const CATEGORY_LABELS={security:'Security — Common Criteria',availability:'Availability',confidentiality:'Confidentiality',processing_integrity:'Processing Integrity',privacy:'Privacy'};
const CATEGORY_CRUMBS={security:'Security',availability:'Availability',confidentiality:'Confidentiality',processing_integrity:'Processing Integrity',privacy:'Privacy'};
const activate=fn=>e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}};
export const socCategoryLabel=key=>CATEGORY_LABELS[key]||key?.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
export const socCategoryCrumb=key=>CATEGORY_CRUMBS[key]||socCategoryLabel(key);
export function SocStatusPill({status}){return <span className={`cis-pill cis-tone-${CIS_TONE[status]||'neutral'}`}><span className="cis-dot" aria-hidden="true"/>{SOC_STATUS_LABELS[status]||'Not Assessed'}</span>;}

export default function PrestigeSocNavigator({clientId,rows,visible,filtered,filterLabel,search,onSearch,onClear,path,onPath,onOpen,onManage,selected}){
  const [memberContext,setMemberContext]=useState({clientId:null,rows:[]});
  const [expandedCategories,setExpandedCategories]=useState([]),[expandedGroups,setExpandedGroups]=useState([]);
  const panelPrefix=useId();
  useEffect(()=>{
    const controller=new AbortController();
    setMemberContext({clientId,rows:[]});
    if(clientId)api.get(`/clients/${encodeURIComponent(clientId)}/members`,{signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted)setMemberContext({clientId,rows:Array.isArray(data)?data:[]});}).catch(()=>{});
    return()=>controller.abort();
  },[clientId]);
  useEffect(()=>{setExpandedCategories([]);setExpandedGroups([]);},[clientId]);
  const categories=useMemo(()=>groupRequirements('soc-2',rows||[]),[rows]);
  const categoryId=selected?.category||path?.[0],groupId=selected?.control||path?.[1];
  const category=categories.find(g=>g.id===categoryId),group=category?.children?.find(g=>g.id===groupId);
  // Breadcrumbs, Continue and direct assessment links reveal the existing native group.
  useEffect(()=>{
    if(!categoryId)return;
    setExpandedCategories(current=>current.includes(categoryId)?current:[...current,categoryId]);
    if(groupId){const key=`${categoryId}/${groupId}`;setExpandedGroups(current=>current.includes(key)?current:[...current,key]);}
  },[clientId,categoryId,groupId]);
  const members=memberContext.clientId===clientId?memberContext.rows:[];
  const owner=id=>{const m=members.find(u=>u.user_id===id);return m?(m.name||m.email):id?'Owner unavailable':'Unassigned';};
  const clear=()=>{setExpandedCategories([]);setExpandedGroups([]);onClear();};
  const crumbs=[{label:'SOC 2',onClick:clear}];
  if(filtered)crumbs.push({label:filterLabel});
  else if(category){crumbs.push({label:socCategoryCrumb(category.id),onClick:()=>onPath([category.id])});if(group)crumbs.push({label:group.id,onClick:()=>onPath([category.id,group.id])});}
  if(selected)crumbs.push({label:selected.definition_id});
  const hitIds=new Set((visible||[]).map(row=>row.framework_assessment_id));
  const shown=categories.map(item=>({...item,groups:item.children
    .map(child=>({...child,hits:child.rows.filter(row=>hitIds.has(row.framework_assessment_id))}))
    .filter(child=>!filtered||child.hits.length)})).filter(item=>!filtered||item.groups.length);
  const allExpanded=shown.length>0&&shown.every(item=>expandedCategories.includes(item.id)&&item.groups.every(child=>expandedGroups.includes(child.key)));
  const toggleCategory=item=>{
    const open=expandedCategories.includes(item.id);
    setExpandedCategories(current=>open?current.filter(id=>id!==item.id):[...current,item.id]);
    if(!open)onPath([item.id]);else if(categoryId===item.id)onPath([]);
  };
  const toggleGroup=(item,child)=>{
    const open=expandedGroups.includes(child.key);
    setExpandedGroups(current=>open?current.filter(key=>key!==child.key):[...current,child.key]);
    onPath(open?[item.id]:[item.id,child.id]);
  };
  return <section className="bcis-card bcis-controls soc-criteria-register" aria-label="Trust Services Categories">
    <div className="soc-register-toolbar">
      <div><h2>Criteria</h2><p>Browse Trust Services Categories and criteria groups.</p></div>
      <SearchField value={search} onChange={onSearch} label="Search criteria" placeholder="Search by number or title…"/>
    </div>
    <div className="soc-register-summary">
      <CisBreadcrumb items={crumbs} label="SOC 2 location"/>
      {filtered?<button type="button" className="bcis-chip-clear" onClick={clear}>Clear filter</button>:<button type="button" className="soc-register-expand" onClick={()=>{
        setExpandedCategories(allExpanded?[]:shown.map(item=>item.id));
        setExpandedGroups(allExpanded?[]:shown.flatMap(item=>item.groups.map(child=>child.key)));
        if(allExpanded)onPath([]);
      }}>{allExpanded?'Collapse all':'Expand all'}</button>}
    </div>
    <p className="soc-register-result-count" role="status">{filtered?`${visible.length} matching criteria in ${shown.length} Trust Services Categories`:`${rows.length} criteria across ${categories.length} Trust Services Categories`}</p>
    {!shown.length&&<p className="bcis-foot" role="status">No criteria match this view.</p>}
    {shown.map(item=>{
      const open=filtered||expandedCategories.includes(item.id),panelId=`${panelPrefix}-${item.id}`;
      return <div key={item.key} className="soc-register-category">
        <GroupToggle className="soc-register-category-toggle" testId={`soc-category-${item.id}`} label={socCategoryLabel(item.id)} rows={item.rows} open={open} panelId={panelId} disabled={filtered} onToggle={()=>toggleCategory(item)}/>
        {open&&<div id={panelId} className="soc-register-panel">{item.groups.map(child=>{
          const groupOpen=filtered||expandedGroups.includes(child.key),groupPanelId=`${panelPrefix}-${item.id}-${child.id}`;
          return <div key={child.key} className="soc-register-group">
            <GroupToggle className="soc-register-group-toggle" testId={`soc-group-${child.id}`} label={child.label} rows={child.rows} open={groupOpen} panelId={groupPanelId} disabled={filtered} onToggle={()=>toggleGroup(item,child)}/>
            {groupOpen&&<div id={groupPanelId} className="soc-register-table-wrap"><CriterionRows rows={child.hits} owner={owner} onOpen={onOpen} onManage={onManage} label={child.label}/></div>}
          </div>;
        })}</div>}
      </div>;
    })}
  </section>;
}

function GroupToggle({className,testId,label,rows,open,panelId,disabled,onToggle}){
  const summary=sectionSummary(rows),applicable=summary.total-summary.excluded,counts=statusCounts(rows);
  const attention=summary.attention;
  return <button type="button" className={`soc-register-toggle ${className}`} data-testid={testId} disabled={disabled}
    aria-label={disabled?`${label}. Matching results stay expanded; clear filters to collapse.`:`Open ${label}`}
    aria-expanded={open} aria-controls={panelId} onClick={disabled?undefined:onToggle} onKeyDown={disabled?undefined:activate(onToggle)}>
    <ChevronRight aria-hidden="true" className="soc-register-chevron"/>
    <span className="soc-register-name"><strong>{label}</strong><small>{rows.length} criteria{summary.excluded?` · ${summary.excluded} not applicable`:''}</small></span>
    <span className="soc-register-status-mix" role="img" aria-label={Object.entries(counts).map(([status,count])=>`${SOC_STATUS_LABELS[status]}: ${count}`).join(', ')}><CisStatusBar counts={counts} framework="soc-2"/></span>
    <span className="soc-register-metrics"><span>{summary.assessed} of {applicable} assessed</span><span>{attention?`${attention} need${attention===1?'s':''} attention`:'None need attention'}</span></span>
  </button>;
}

function CriterionRows({rows,owner,onOpen,onManage,label}){
  if(!rows.length)return <p className="bcis-foot" role="status">No criteria match this view.</p>;
  return <table className="bcis-table soc-register-criteria" aria-label={`${label}: ${rows.length} criteria`}><thead><tr><th scope="col">Criterion</th><th scope="col">Implementation status</th><th scope="col">Verification</th><th scope="col">Owner</th><th scope="col">Last assessed</th></tr></thead><tbody>{rows.map(r=>{const v=verificationOf(r);
    return <tr key={r.framework_assessment_id} className="bcis-row" tabIndex={0} role="link" aria-label={`Open criterion ${r.definition_id} ${r.title}`} data-testid={`requirement-${r.definition_id}`} onClick={()=>onOpen(r)} onKeyDown={activate(()=>onOpen(r))}>
      <td><span className="bcis-sg"><span className="bcis-sg-id">{r.definition_id}</span><span className="bcis-name">{r.title}</span></span></td><td data-label="Implementation status"><SocStatusPill status={r.status}/></td><td data-label="Verification"><span className={`cis-flag cis-tone-${VERIFICATION_TONE[v]}`}>{VERIFICATION_LABELS[v]}</span></td><td data-label="Owner"><span className="soc-register-owner">{owner(r.owner_id)}</span><FrameworkRecordButton record={r} onManage={onManage}/></td><td data-label="Last assessed" className="bcis-muted">{socAssessmentDate(r)}</td></tr>;})}</tbody></table>;
}
