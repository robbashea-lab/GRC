import {FrameworkRecordButton} from './FrameworkRecordAccess';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {ChevronRight} from 'lucide-react';
import api from '@/lib/api';
import {SearchField} from './Register';
import {CIS_TONE,CisStatusBar} from './CisStatus';
import {CisBreadcrumb,VERIFICATION_LABELS,verificationOf} from './BrawndoCisControls';
import {groupRequirements,sectionSummary} from '@/lib/frameworkWorkspace';
import {cisSummary} from '@/lib/cisVerification';
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

export default function PrestigeSocNavigator({clientId,rows=[],visible=[],filtered,filterLabel,search,onSearch,onClear,path,onPath,onOpen,onManage,selected,categoryId='',onCategory,available=true,retainedRows=[]}){
  const [memberContext,setMemberContext]=useState({clientId:null,rows:[]});
  const [expandedGroups,setExpandedGroups]=useState([]);
  const panelPrefix=useId(),register=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();
    setMemberContext({clientId,rows:[]});
    if(clientId)api.get(`/clients/${encodeURIComponent(clientId)}/members`,{signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted)setMemberContext({clientId,rows:Array.isArray(data)?data:[]});}).catch(()=>{});
    return()=>controller.abort();
  },[clientId]);
  useEffect(()=>{setExpandedGroups([]);},[clientId,categoryId]);
  const categories=useMemo(()=>groupRequirements('soc-2',rows),[rows]);
  const groupId=selected?.category===categoryId?selected.control:path?.[0]===categoryId?path[1]:null;
  const category=categories.find(g=>g.id===categoryId),group=category?.children?.find(g=>g.id===groupId);
  // The parent owns category navigation; legacy paths only reveal a native group.
  useEffect(()=>{
    if(categoryId&&groupId){const key=`${categoryId}/${groupId}`;setExpandedGroups(current=>current.includes(key)?current:[...current,key]);}
  },[clientId,categoryId,groupId]);
  const members=memberContext.clientId===clientId?memberContext.rows:[];
  const owner=id=>{const m=members.find(u=>u.user_id===id);return m?(m.name||m.email):id?'Owner unavailable':'Unassigned';};
  const clear=()=>{setExpandedGroups([]);onClear();register.current?.querySelector('input[aria-label="Search criteria"]')?.focus();};
  const crumbs=[{label:'SOC 2',onClick:()=>onCategory('')}];
  if(category){crumbs.push({label:socCategoryCrumb(category.id),onClick:()=>onPath([category.id])});if(!filtered&&group)crumbs.push({label:group.id,onClick:()=>onPath([category.id,group.id])});}
  if(filtered)crumbs.push({label:filterLabel});
  if(selected)crumbs.push({label:selected.definition_id});
  const matchingRows=categoryId?visible.filter(row=>row.category===categoryId):visible;
  const hitIds=new Set(matchingRows.map(row=>row.framework_assessment_id));
  const groups=(category?.children||[]).map(child=>({...child,hits:child.rows.filter(row=>hitIds.has(row.framework_assessment_id))})).filter(child=>!filtered||child.hits.length);
  const allExpanded=groups.length>0&&groups.every(child=>expandedGroups.includes(child.key));
  const toggleGroup=child=>{
    const open=expandedGroups.includes(child.key);
    setExpandedGroups(current=>open?current.filter(key=>key!==child.key):[...current,child.key]);
    onPath(open?[categoryId]:[categoryId,child.id]);
  };
  const rootResults=!categoryId&&filtered;
  return <section ref={register} className="bcis-card bcis-controls soc-criteria-register" aria-label={categoryId?'Criteria groups':'Trust Services Categories'}>
    <div className="soc-register-toolbar">
      <h2>{rootResults?'Matching criteria':categoryId?'Criteria groups':'Trust Services Categories'}</h2>
      <SearchField value={search} onChange={onSearch} label="Search criteria" placeholder="Search by number or title…"/>
    </div>
    <div className="soc-register-summary">
      <CisBreadcrumb items={crumbs} label="SOC 2 location"/>
      {filtered?<button type="button" className="bcis-chip-clear" onClick={clear}>Clear filter</button>:category&&groups.length>0&&<button type="button" className="soc-register-expand" onClick={()=>{
        setExpandedGroups(allExpanded?[]:groups.map(child=>child.key));
        if(allExpanded)onPath([categoryId]);
      }}>{allExpanded?'Collapse all':'Expand all'}</button>}
    </div>
    <p className="soc-register-result-count" role="status">{filtered?`${matchingRows.length} matching criteria`:!available?'Criterion counts unavailable':category?`${category.rows.length} criteria in ${groups.length} groups`:`${rows.length} criteria across ${categories.length} Trust Services Categories`}</p>
    {rootResults?<CriterionRows rows={matchingRows} owner={owner} onOpen={onOpen} onManage={onManage} label={filterLabel}/>:
      <><div className="soc-register-columns" aria-hidden="true"><span/><span>{categoryId?'Criteria group':'Category'}</span><span>Status mix</span><span>Addressed (Readiness)</span><span>Assessed</span></div>
        {!categoryId?categories.map(item=><div key={item.key} className="soc-register-category">
          <SummaryRow testId={`soc-category-${item.id}`} label={socCategoryLabel(item.id)} rows={item.rows} available={available} onToggle={()=>onCategory(item.id)}/>
        </div>):groups.map(child=>{
          const open=filtered||expandedGroups.includes(child.key),panelId=`${panelPrefix}-${categoryId}-${child.id}`;
          return <div key={child.key} className="soc-register-group">
            <SummaryRow testId={`soc-group-${child.id}`} label={child.label} rows={child.rows} available={available} open={open} panelId={panelId} disabled={filtered} onToggle={()=>toggleGroup(child)}/>
            {open&&<div id={panelId} className="soc-register-table-wrap"><CriterionRows rows={child.hits} owner={owner} onOpen={onOpen} onManage={onManage} label={child.label}/></div>}
          </div>;
        })}
        {!(categoryId?groups:categories).length&&<p className="bcis-foot" role="status">No criteria match this view.</p>}
      </>}
    {retainedRows.length>0&&<section aria-label="Retained out-of-scope criteria">
      <h2 className="px-4 pt-4 text-sm font-semibold">Retained out-of-scope criteria</h2>
      <p className="bcis-foot">Outside the selected SOC 2 scope; excluded from readiness totals.</p>
      <div className="soc-register-table-wrap"><CriterionRows rows={retainedRows} owner={owner} onOpen={onOpen} onManage={onManage} label="Retained out-of-scope criteria"/></div>
    </section>}
  </section>;
}

function SummaryRow({testId,label,rows,available,open,panelId,disabled,onToggle}){
  const summary=cisSummary(rows),attention=sectionSummary(rows).attention;
  const counts={addressed:summary.addressed,in_progress:summary.partial,needs_attention:summary.gap,not_assessed:summary.notAssessed};
  const percentage=available&&summary.applicable>0?`${(summary.addressed/summary.applicable*100).toFixed(1)}%`:'—';
  const figures=available?`Addressed (Readiness): ${summary.addressed} of ${summary.applicable}, ${percentage}. Assessed: ${summary.assessed} of ${summary.applicable}.`:'Counts unavailable.';
  return <button type="button" className="soc-register-toggle" data-testid={testId} disabled={disabled}
    aria-label={`${disabled?`${label}. Matching results stay expanded; clear filters to collapse.`:`Open ${label}.`} ${figures}`}
    aria-expanded={open} aria-controls={panelId} onClick={disabled?undefined:onToggle} onKeyDown={disabled?undefined:activate(onToggle)}>
    <ChevronRight aria-hidden="true" className="soc-register-chevron"/>
    <span className="soc-register-name"><strong>{label}</strong><small>{available?<>{rows.length} criteria{summary.na?` · ${summary.na} not applicable`:''} · {attention?`${attention} need${attention===1?'s':''} attention`:'None need attention'}</>:'Counts unavailable'}</small></span>
    <span className="soc-register-status-mix" role="img" aria-label={available?Object.entries(counts).map(([status,count])=>`${SOC_STATUS_LABELS[status]}: ${count}`).join(', '):'Status mix unavailable'}>{available&&<CisStatusBar counts={counts} framework="soc-2"/>}</span>
    <span className="soc-register-metric soc-register-readiness"><span className="soc-register-mobile-label">Addressed (Readiness)</span><strong>{available?`${summary.addressed} of ${summary.applicable}`:'Unavailable'}</strong><span>{percentage}</span></span>
    <span className="soc-register-metric soc-register-assessed"><span className="soc-register-mobile-label">Assessed</span><strong>{available?`${summary.assessed} of ${summary.applicable}`:'Unavailable'}</strong></span>
  </button>;
}

function CriterionRows({rows,owner,onOpen,onManage,label}){
  if(!rows.length)return <p className="bcis-foot" role="status">No criteria match this view.</p>;
  return <table className="bcis-table soc-register-criteria" aria-label={`${label}: ${rows.length} criteria`}><thead><tr><th scope="col">Criterion</th><th scope="col">Implementation status</th><th scope="col">Verification</th><th scope="col">Owner</th><th scope="col">Last assessed</th></tr></thead><tbody>{rows.map(r=>{const v=verificationOf(r);
    return <tr key={r.framework_assessment_id} className="bcis-row" tabIndex={0} role="link" aria-label={`Open criterion ${r.definition_id} ${r.title}`} data-testid={`requirement-${r.definition_id}`} onClick={()=>onOpen(r)} onKeyDown={activate(()=>onOpen(r))}>
      <td><span className="bcis-sg"><span className="bcis-sg-id">{r.definition_id}</span><span className="bcis-name">{r.title}</span></span></td><td data-label="Implementation status"><SocStatusPill status={r.status}/></td><td data-label="Verification"><span className={`cis-flag cis-tone-${VERIFICATION_TONE[v]}`}>{VERIFICATION_LABELS[v]}</span></td><td data-label="Owner"><span className="soc-register-owner">{owner(r.owner_id)}</span><FrameworkRecordButton record={r} onManage={onManage}/></td><td data-label="Last assessed" className="bcis-muted">{socAssessmentDate(r)}</td></tr>;})}</tbody></table>;
}
